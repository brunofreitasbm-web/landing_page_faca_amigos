// Resumo semanal do FaçaAmigos por e-mail. Chamada por pg_cron toda segunda-feira às 11:00 UTC (08h em Belém) com o
// cabeçalho x-ops-key (ver supabase/ops/agendar-rotinas.sql).
//
// Compara os últimos 7 dias com os 7 anteriores:
//  - leads do teste: iniciados, concluídos, taxa de conclusão e opt-ins, no total e por origem
//    (utm_source / utm_medium / utm_campaign, top 10; sem origem = "direto"), com um recorte à parte
//    para visitas vindas de resposta de IA generativa (utm_medium=ai, ver assets/fa-track.js);
//  - leads com área em atenção especial (tier3) e quantos seguem sem contato há mais de 48h;
//  - compras de e-book (fa_ebook_compras por produto: compras, receita, reembolsos/chargebacks/cancelamentos) e
//    carrinhos abandonados (fa_ebook_carrinhos) com quantos foram recuperados;
//  - Wi-Fi da clínica (fa_wifi_leads): cadastros do portal (não emitem cupom; o cupom nasce no Mural), opt-ins e cupons resgatados por
//    operação (playground / circuito);
//  - e-mails da sequência do guia enviados (fa_teste_ebook_seq).
//
// ?dry=1 devolve o JSON (incluindo o HTML) sem enviar e-mail.
//
// Secrets: OPS_KEY (cabeçalho x-ops-key; sem ela a função responde 401), ALERT_EMAIL (destino; aceita vários
// separados por vírgula; se ausente usa LEAD_NOTIFY_EMAIL), BREVO_API_KEY, BREVO_FROM, BREVO_REPLY_TO (já existentes),
// HOTMART_PRODUCT_ID / HOTMART_CODIGO_PRODUCT_ID (só para dar nome aos produtos; opcionais).

import { createClient } from "jsr:@supabase/supabase-js@2";

const SITE = "https://institutofacaamigos.com.br";
const DAY = 86400_000;
const PETROLEO = "#065264";
const AMARELO = "#FDC51D";
const TOP_ORIGINS = 10;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

function splitEmails(raw: string | undefined): string[] {
  return (raw ?? "").split(",").map((e) => e.trim()).filter(Boolean);
}

function parseSender(raw: string): { name?: string; email: string } {
  const m = raw.match(/^(.*)<(.+)>$/);
  if (m) return { name: m[1].trim().replace(/^"|"$/g, "") || undefined, email: m[2].trim() };
  return { email: raw.trim() };
}

async function sendBrevo(to: string[], subject: string, html: string): Promise<{ sent: boolean; error?: string }> {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  if (!apiKey) return { sent: false, error: "BREVO_API_KEY não configurada" };
  if (to.length === 0) return { sent: false, error: "sem destinatário (ALERT_EMAIL/LEAD_NOTIFY_EMAIL)" };
  const fromRaw = Deno.env.get("BREVO_FROM") ?? "Instituto Faça Amigos <nao-responder@institutofacaamigos.com.br>";
  const replyTo = Deno.env.get("BREVO_REPLY_TO");
  try {
    const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        sender: parseSender(fromRaw),
        to: to.map((email) => ({ email })),
        ...(replyTo ? { replyTo: parseSender(replyTo) } : {}),
        subject,
        htmlContent: html,
        tags: ["fa_weekly_report"],
      }),
    });
    if (!resp.ok) {
      const d = await resp.json().catch(() => null);
      return { sent: false, error: d?.message || `Brevo HTTP ${resp.status}` };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : "erro desconhecido" };
  }
}

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
// deno-lint-ignore no-explicit-any
type Page = PromiseLike<{ data: any[] | null; error: { message: string } | null }>;

// Lê todas as linhas de uma consulta paginando de 1000 em 1000 (limite do PostgREST). Falha vira aviso no e-mail.
async function fetchAll(errors: string[], label: string, page: (from: number, to: number) => Page, maxRows = 20000): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; from < maxRows; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) {
      errors.push(`${label}: ${error.message}`);
      return out;
    }
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

function inWin(iso: unknown, start: number, end: number): boolean {
  if (typeof iso !== "string" || !iso) return false;
  const t = new Date(iso).getTime();
  return t >= start && t < end;
}

function pct(n: number, d: number): string {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : "—";
}

function brl(n: number): string {
  return `R$ ${n.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

// Data em Belém (UTC-3): dd/mm.
function dm(ms: number): string {
  const b = new Date(ms - 3 * 3600_000).toISOString();
  return `${b.slice(8, 10)}/${b.slice(5, 7)}`;
}

function delta(cur: number, prev: number, money = false): string {
  const diff = cur - prev;
  if (diff === 0) return `<span style="color:#6b7280;">= ${money ? brl(prev) : prev}</span>`;
  const up = diff > 0;
  const shown = money ? brl(Math.abs(diff)) : String(Math.abs(diff));
  return `<span style="color:${up ? "#1f7a4d" : "#b42318"};">${up ? "▲" : "▼"} ${shown}</span>`;
}

// ---- HTML ----
const TH = `padding:8px 10px;text-align:left;background:${PETROLEO};color:#fff;font-size:12px;`;
const TD = "padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;";

function table(headers: string[], rows: string[][], boldFirst = false): string {
  if (rows.length === 0) return `<p style="font-size:13px;color:#6b7280;margin:6px 0;">Nenhum registro no período.</p>`;
  const head = headers.map((h, i) => `<th style="${TH}${i > 0 ? "text-align:right;" : ""}">${esc(h)}</th>`).join("");
  const body = rows.map((r) => `<tr>${r.map((c, i) => `<td style="${TD}${i > 0 ? "text-align:right;" : ""}${i === 0 && boldFirst ? "font-weight:bold;" : ""}">${c}</td>`).join("")}</tr>`).join("");
  return `<table style="border-collapse:collapse;width:100%;margin:6px 0 4px;"><tr>${head}</tr>${body}</table>`;
}

function h2(t: string): string {
  return `<h2 style="margin:28px 0 4px;font-size:16px;color:${PETROLEO};border-left:5px solid ${AMARELO};padding-left:10px;">${esc(t)}</h2>`;
}

function kpi(label: string, value: string, sub: string): string {
  return `<td style="width:25%;padding:0 4px;vertical-align:top;"><div style="background:#fff8e1;border-top:4px solid ${AMARELO};border-radius:8px;padding:10px 8px;text-align:center;">
    <div style="font-size:22px;font-weight:bold;color:${PETROLEO};">${value}</div>
    <div style="font-size:11px;color:#374151;">${esc(label)}</div>
    <div style="font-size:11px;margin-top:2px;">${sub}</div></div></td>`;
}

Deno.serve(async (req) => {
  const expected = Deno.env.get("OPS_KEY") ?? "";
  const given = req.headers.get("x-ops-key") ?? "";
  if (!expected || !safeEqual(given, expected)) return json({ error: "não autorizado" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "serviço indisponível" }, 500);
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const errors: string[] = []; // falhas de leitura viram aviso no e-mail (por requisição)
  const now = Date.now();
  const w1 = { start: now - 7 * DAY, end: now }; // últimos 7 dias
  const w0 = { start: now - 14 * DAY, end: now - 7 * DAY }; // 7 dias anteriores
  const since14 = new Date(w0.start).toISOString();

  // ---------- Leads do teste ----------
  const leads = await fetchAll(errors, "leads do teste", (from, to) =>
    admin.from("fa_leads_teste_comportamento")
      .select("id, status, created_at, utm_source, utm_medium, utm_campaign, marketing_opt_in, result_band")
      .gte("created_at", since14)
      .order("created_at", { ascending: false })
      .range(from, to));
  // "abandoned" é o registro que a mesma família substituiu ao refazer o teste: não conta como início.
  const real = leads.filter((l) => l.status !== "abandoned");
  const isDone = (l: Row) => l.status === "completed" || l.status === "contacted";

  function leadStats(win: { start: number; end: number }) {
    const inW = real.filter((l) => inWin(l.created_at, win.start, win.end));
    const completed = inW.filter(isDone).length;
    return {
      started: inW.length,
      completed,
      rate: pct(completed, inW.length),
      optins: inW.filter((l) => l.marketing_opt_in === true).length,
      tier3: inW.filter((l) => isDone(l) && l.result_band === "tier3").length,
      rows: inW,
    };
  }
  const L1 = leadStats(w1);
  const L0 = leadStats(w0);

  const originKey = (l: Row) => {
    const parts = [l.utm_source, l.utm_medium, l.utm_campaign].map((p) => (typeof p === "string" ? p.trim() : ""));
    if (parts.every((p) => !p)) return "direto";
    return parts.map((p) => p || "—").join(" / ");
  };
  const origins = new Map<string, { started: number; completed: number; optins: number; prev: number }>();
  for (const l of L1.rows) {
    const k = originKey(l);
    const o = origins.get(k) ?? { started: 0, completed: 0, optins: 0, prev: 0 };
    o.started++;
    if (isDone(l)) o.completed++;
    if (l.marketing_opt_in === true) o.optins++;
    origins.set(k, o);
  }
  for (const l of L0.rows) {
    const k = originKey(l);
    const o = origins.get(k);
    if (o) o.prev++;
  }
  const topOrigins = [...origins.entries()].sort((a, b) => b[1].started - a[1].started).slice(0, TOP_ORIGINS);

  // Visitas vindas de resposta de IA generativa (utm_medium=ai, ver assets/fa-track.js AI_REFERRERS).
  const aiEngines = new Map<string, { started: number; completed: number; prev: number }>();
  for (const l of L1.rows) {
    if (l.utm_medium !== "ai") continue;
    const k = (typeof l.utm_source === "string" && l.utm_source.trim()) || "ia (origem desconhecida)";
    const o = aiEngines.get(k) ?? { started: 0, completed: 0, prev: 0 };
    o.started++;
    if (isDone(l)) o.completed++;
    aiEngines.set(k, o);
  }
  for (const l of L0.rows) {
    if (l.utm_medium !== "ai") continue;
    const k = (typeof l.utm_source === "string" && l.utm_source.trim()) || "ia (origem desconhecida)";
    const o = aiEngines.get(k);
    if (o) o.prev++;
  }
  const topAiEngines = [...aiEngines.entries()].sort((a, b) => b[1].started - a[1].started);

  // Backlog quente: tier3 concluído, sem contato, há mais de 48h (todo o histórico).
  let tier3Pending = 0;
  {
    const { count, error } = await admin
      .from("fa_leads_teste_comportamento")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed")
      .eq("result_band", "tier3")
      .is("contacted_at", null)
      .lt("completed_at", new Date(now - 2 * DAY).toISOString());
    if (error) errors.push(`leads tier3 sem contato: ${error.message}`);
    else tier3Pending = count ?? 0;
  }

  // ---------- Compras e carrinhos ----------
  const compras = await fetchAll(errors, "compras de e-book", (from, to) =>
    admin.from("fa_ebook_compras")
      .select("transaction, product_id, status, valor, approved_at")
      .gte("approved_at", since14)
      .order("approved_at", { ascending: false })
      .range(from, to));
  const carrinhos = await fetchAll(errors, "carrinhos abandonados", (from, to) =>
    admin.from("fa_ebook_carrinhos")
      .select("id, created_at, recuperado_at")
      .gte("created_at", since14)
      .order("created_at", { ascending: false })
      .range(from, to));

  const codigoId = Number(Deno.env.get("HOTMART_CODIGO_PRODUCT_ID") ?? "");
  const guiaIds = (Deno.env.get("HOTMART_PRODUCT_ID") ?? "8560642").split(",").map((s) => Number(s.trim())).filter((n) => n && n !== codigoId);
  const productName = (id: unknown): string => {
    const n = Number(id);
    if (codigoId && n === codigoId) return "O Código do Desenvolvimento Infantil";
    if (guiaIds.includes(n)) return "O Brincar com Propósito";
    return id ? `Produto ${id}` : "Produto não identificado";
  };
  const LOST = ["REFUNDED", "CHARGEBACK", "CANCELED"];
  function salesBy(win: { start: number; end: number }) {
    const m = new Map<string, { name: string; count: number; sum: number; lost: number }>();
    for (const c of compras) {
      if (!inWin(c.approved_at, win.start, win.end)) continue;
      const key = String(c.product_id ?? "?");
      const s = m.get(key) ?? { name: productName(c.product_id), count: 0, sum: 0, lost: 0 };
      if (LOST.includes(String(c.status).toUpperCase())) s.lost++;
      else {
        s.count++;
        s.sum += Number(c.valor) || 0;
      }
      m.set(key, s);
    }
    return m;
  }
  const S1 = salesBy(w1);
  const S0 = salesBy(w0);
  const salesKeys = [...new Set([...S1.keys(), ...S0.keys()])];
  const totalCount = (m: Map<string, { count: number }>) => [...m.values()].reduce((a, s) => a + s.count, 0);
  const totalSum = (m: Map<string, { sum: number }>) => [...m.values()].reduce((a, s) => a + s.sum, 0);

  const cartsIn = (win: { start: number; end: number }) => carrinhos.filter((c) => inWin(c.created_at, win.start, win.end));
  const C1 = cartsIn(w1);
  const C0 = cartsIn(w0);
  const rec1 = C1.filter((c) => c.recuperado_at).length;
  const rec0 = C0.filter((c) => c.recuperado_at).length;

  // ---------- Wi-Fi ----------
  const wifi = await fetchAll(errors, "leads do Wi-Fi", (from, to) =>
    admin.from("fa_wifi_leads")
      .select("id, created_at, coupon_operation, last_redeemed_at, marketing_opt_in_email, marketing_opt_in_whatsapp")
      .or(`created_at.gte.${since14},last_redeemed_at.gte.${since14}`)
      .order("created_at", { ascending: false })
      .range(from, to));
  function wifiStats(win: { start: number; end: number }) {
    const signups = wifi.filter((w) => inWin(w.created_at, win.start, win.end));
    const redeemed = wifi.filter((w) => inWin(w.last_redeemed_at, win.start, win.end));
    return {
      signups: signups.length,
      optins: signups.filter((w) => w.marketing_opt_in_email === true || w.marketing_opt_in_whatsapp === true).length,
      playground: redeemed.filter((w) => w.coupon_operation === "playground").length,
      circuito: redeemed.filter((w) => w.coupon_operation === "circuito").length,
    };
  }
  const W1 = wifiStats(w1);
  const W0 = wifiStats(w0);

  // ---------- Sequência de e-mails ----------
  const seq = await fetchAll(errors, "sequência de e-mails", (from, to) =>
    admin.from("fa_teste_ebook_seq")
      .select("id, step, sent_at")
      .gte("sent_at", since14)
      .order("sent_at", { ascending: false })
      .range(from, to));
  const seqIn = (win: { start: number; end: number }, step?: number) =>
    seq.filter((s) => inWin(s.sent_at, win.start, win.end) && (step === undefined || s.step === step)).length;

  // ---------- Monta o relatório ----------
  const period = `${dm(w1.start)} a ${dm(w1.end)} (comparado a ${dm(w0.start)} a ${dm(w0.end)})`;

  const originRows = topOrigins.map(([k, o]) => [
    esc(k),
    `${o.started} <span style="font-size:11px;">(${delta(o.started, o.prev)})</span>`,
    String(o.completed),
    pct(o.completed, o.started),
    String(o.optins),
  ]);

  const aiRows = topAiEngines.map(([k, o]) => [
    esc(k),
    `${o.started} <span style="font-size:11px;">(${delta(o.started, o.prev)})</span>`,
    String(o.completed),
    pct(o.completed, o.started),
  ]);
  const aiTotal = topAiEngines.reduce((sum, [, o]) => sum + o.started, 0);
  const aiTotalPrev = topAiEngines.reduce((sum, [, o]) => sum + o.prev, 0);

  const salesRows = salesKeys.map((k) => {
    const a = S1.get(k) ?? { name: productName(k), count: 0, sum: 0, lost: 0 };
    const b = S0.get(k) ?? { name: a.name, count: 0, sum: 0, lost: 0 };
    return [esc(a.name), `${a.count} (${delta(a.count, b.count)})`, `${brl(a.sum)} (${delta(a.sum, b.sum, true)})`, String(a.lost)];
  });

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f4;">
  <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:20px;color:#111827;">
    <div style="background:${PETROLEO};color:#fff;padding:20px 24px;border-radius:14px 14px 0 0;">
      <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:${AMARELO};font-weight:bold;">FaçaAmigos</div>
      <div style="font-size:22px;font-weight:bold;margin-top:2px;">Resumo da semana</div>
      <div style="font-size:13px;opacity:.9;margin-top:2px;">${esc(period)} · horário de Belém</div>
    </div>
    <div style="background:#fff;padding:8px 24px 24px;border-radius:0 0 14px 14px;">
      ${errors.length ? `<p style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:10px 12px;border-radius:8px;font-size:12px;margin:14px 0 0;"><b>Atenção:</b> parte dos dados não carregou (${esc(errors.join("; "))}). Os números abaixo podem estar incompletos.</p>` : ""}

      <table style="width:100%;border-collapse:separate;margin:18px -4px 0;"><tr>
        ${kpi("Testes iniciados", String(L1.started), delta(L1.started, L0.started))}
        ${kpi("Testes concluídos", String(L1.completed), delta(L1.completed, L0.completed))}
        ${kpi("Taxa de conclusão", L1.rate, `<span style="color:#6b7280;">antes: ${L0.rate}</span>`)}
        ${kpi("Opt-ins", String(L1.optins), delta(L1.optins, L0.optins))}
      </tr></table>

      ${h2("Teste de comportamento: origem dos leads")}
      ${table(["Origem (fonte / mídia / campanha)", "Iniciaram", "Concluíram", "Taxa", "Opt-ins"], originRows, true)}
      <p style="font-size:11px;color:#6b7280;margin:2px 0 0;">Top ${TOP_ORIGINS} da semana por iniciados; entre parênteses, a variação frente à semana anterior. "direto" = sem UTM.</p>

      ${h2("Visitas vindas de IA")}
      ${aiRows.length
        ? `${table(["Motor de IA", "Iniciaram", "Concluíram", "Taxa"], aiRows, true)}<p style="font-size:13px;margin:6px 0;">Total: <b>${aiTotal}</b> (${delta(aiTotal, aiTotalPrev)}).</p>`
        : `<p style="font-size:13px;margin:6px 0;color:#6b7280;">Nenhuma visita chegou via ChatGPT, Perplexity, Gemini, Copilot ou Claude nesta semana.</p>`}
      <p style="font-size:11px;color:#6b7280;margin:2px 0 0;">Detectado pelo referrer quando não há UTM na URL (ver assets/fa-track.js).</p>

      ${h2("Leads com área em atenção especial")}
      <p style="font-size:13px;margin:6px 0;">Concluídos na semana: <b>${L1.tier3}</b> (${delta(L1.tier3, L0.tier3)}). Ainda <b>sem contato há mais de 48h</b>: <b style="color:${tier3Pending > 0 ? "#b42318" : "#1f7a4d"};">${tier3Pending}</b>${tier3Pending > 0 ? ` · <a href="${SITE}/admin" style="color:${PETROLEO};font-weight:bold;">abrir o painel</a>` : ""}.</p>

      ${h2("E-books")}
      ${table(["Produto", "Compras", "Receita", "Reembolsos/cancel."], salesRows, true)}
      <p style="font-size:13px;margin:6px 0;">Total: <b>${totalCount(S1)}</b> compra(s) (${delta(totalCount(S1), totalCount(S0))}), <b>${brl(totalSum(S1))}</b> (${delta(totalSum(S1), totalSum(S0), true)}).</p>
      <p style="font-size:13px;margin:6px 0;">Carrinhos abandonados: <b>${C1.length}</b> (${delta(C1.length, C0.length)}); recuperados: <b>${rec1}</b> (${pct(rec1, C1.length)}; semana anterior ${rec0} de ${C0.length}).</p>

      ${h2("Wi-Fi da clínica")}
      ${table(["", "Últimos 7 dias", "7 dias anteriores"], [
        ["Cadastros (= cupons emitidos)", String(W1.signups), String(W0.signups)],
        ["Aceitaram receber novidades", String(W1.optins), String(W0.optins)],
        ["Cupons resgatados no Playground", String(W1.playground), String(W0.playground)],
        ["Cupons resgatados no Circuito", String(W1.circuito), String(W0.circuito)],
      ], true)}
      <p style="font-size:11px;color:#6b7280;margin:2px 0 0;">Resgates contados pelo último resgate de cada cupom (um cupom que voltou na semana entra uma vez).</p>

      ${h2("Sequência de e-mails do guia")}
      <p style="font-size:13px;margin:6px 0;">Enviados na semana: <b>${seqIn(w1)}</b> (${delta(seqIn(w1), seqIn(w0))}) · dia 1: ${seqIn(w1, 1)}, dia 3: ${seqIn(w1, 2)}, dia 6: ${seqIn(w1, 3)}.</p>

      <p style="font-size:11px;color:#9ca3af;margin-top:28px;border-top:1px solid #e5e7eb;padding-top:12px;">E-mail automático da rotina fa-weekly-report, toda segunda às 08h (Belém). Números vêm direto do banco.</p>
    </div>
  </div></body></html>`;

  const to = splitEmails(Deno.env.get("ALERT_EMAIL")).length ? splitEmails(Deno.env.get("ALERT_EMAIL")) : splitEmails(Deno.env.get("LEAD_NOTIFY_EMAIL"));
  const summary = {
    period: { last7: { from: new Date(w1.start).toISOString(), to: new Date(w1.end).toISOString() }, previous7: { from: new Date(w0.start).toISOString(), to: new Date(w0.end).toISOString() } },
    leads: {
      last7: { started: L1.started, completed: L1.completed, completion_rate: L1.rate, optins: L1.optins, tier3: L1.tier3 },
      previous7: { started: L0.started, completed: L0.completed, completion_rate: L0.rate, optins: L0.optins, tier3: L0.tier3 },
      by_origin: topOrigins.map(([origin, o]) => ({ origin, started: o.started, completed: o.completed, optins: o.optins, previous_started: o.prev })),
      by_ai_engine: topAiEngines.map(([engine, o]) => ({ engine, started: o.started, completed: o.completed, previous_started: o.prev })),
      tier3_without_contact_over_48h: tier3Pending,
    },
    ebooks: {
      last7: salesKeys.map((k) => ({ product: S1.get(k)?.name ?? productName(k), purchases: S1.get(k)?.count ?? 0, revenue: S1.get(k)?.sum ?? 0, lost: S1.get(k)?.lost ?? 0 })),
      previous7: salesKeys.map((k) => ({ product: S0.get(k)?.name ?? productName(k), purchases: S0.get(k)?.count ?? 0, revenue: S0.get(k)?.sum ?? 0, lost: S0.get(k)?.lost ?? 0 })),
      carts: { last7: C1.length, recovered_last7: rec1, previous7: C0.length, recovered_previous7: rec0 },
    },
    wifi: { last7: W1, previous7: W0 },
    sequence: { last7: seqIn(w1), previous7: seqIn(w0) },
    errors,
  };

  if (dry) return json({ ok: true, dry: true, to, subject: `Resumo da semana FaçaAmigos (${dm(w1.start)} a ${dm(w1.end)})`, summary, html });

  const r = await sendBrevo(to, `Resumo da semana FaçaAmigos (${dm(w1.start)} a ${dm(w1.end)})`, html);
  if (!r.sent) console.error("fa-weekly-report: falha ao enviar:", r.error);
  return json({ ok: r.sent, dry: false, to, ...(r.error ? { error: r.error } : {}), summary }, r.sent ? 200 : 502);
});
