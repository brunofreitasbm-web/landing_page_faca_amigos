// Eventos — e-mails e rotinas (Brevo). Única função que monta e envia os e-mails dos eventos, para os
// 8 templates e a sincronização com as listas do Brevo existirem numa cópia só (o deploy via MCP não
// resolve import relativo de ../_shared, por isso as outras funções chamam esta por HTTP).
//
// Quem chama:
//  - pg_cron (job fa-eventos-dispatch, a cada 30 min):  POST {action:"run"}  com x-ops-key
//  - eventos-public / eventos-admin / hotmart-webhook:  POST {action:"enviar", inscricao_id, tipo} com x-ops-key
//  - descadastrar.html (navegador):                     POST {action:"descadastrar", e:<token acesso>} sem chave
//
// Toda mensagem é "reservada" em fa_eventos_envios (chave única inscricao_id+tipo) ANTES de chamar o Brevo:
// se duas execuções concorrerem, só uma envia. Se o Brevo falhar, a reserva fica com status 'erro' e o
// admin pode reenviar. voucher_reenvio é a exceção: pode repetir.
//
// Secrets: OPS_KEY (chave do cabeçalho x-ops-key; criar, ver PUBLICAR.md Lote 7), EVENTOS_SECRET (HMAC dos links do ingresso), BREVO_API_KEY, BREVO_FROM,
// BREVO_REPLY_TO, BREVO_LIST_EVENTOS_FAMILIAS, BREVO_LIST_EVENTOS_PROFISSIONAIS (ids das listas),
// COMUNIDADE_WHATSAPP_FAMILIAS / COMUNIDADE_WHATSAPP_PROFISSIONAIS (link padrão da Comunidade por trilha,
// usado quando o evento não tem o próprio), SITE_URL (padrão https://institutofacaamigos.com.br).

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

// Segredos: variavel de ambiente (supabase secrets) ou, se ausente, o Vault via fa_eventos_segredo (so service role).
const SEG: Record<string, string> = {};
try {
  const u = Deno.env.get("SUPABASE_URL"), k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const faltam = ["OPS_KEY", "EVENTOS_SECRET", "EVENTOS_AVISO_EMAIL"].filter((n) => !Deno.env.get(n));
  if (u && k && faltam.length) {
    const c = createClient(u, k);
    for (const n of faltam) {
      const { data } = await c.rpc("fa_eventos_segredo", { p_nome: n });
      if (typeof data === "string" && data) SEG[n] = data;
    }
  }
} catch (err) {
  console.error("segredos do Vault indisponiveis", err instanceof Error ? err.message : err);
}
function segredo(nome: string): string {
  return Deno.env.get(nome) || SEG[nome] || "";
}

// deno-lint-ignore no-explicit-any
type Admin = SupabaseClient<any, any, any, any, any>;

const SITE = (Deno.env.get("SITE_URL") ?? "https://institutofacaamigos.com.br").replace(/\/$/, "");
const LOGO_URL = `${SITE}/img/logo-simbolo.png`;
const TZ = "America/Belem";
const MAX_PER_RUN = 60;

const ALLOWED_ORIGINS = [
  "https://institutofacaamigos.com.br",
  "https://www.institutofacaamigos.com.br",
  "https://playground.institutofacaamigos.com.br",
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
];

const TIPOS_ENVIO = [
  "voucher", "voucher_reenvio", "lista_espera", "promocao",
  "lembrete_24h", "lembrete_hoje", "pos_evento", "evento_cancelado", "comunicado",
] as const;
type TipoEnvio = (typeof TIPOS_ENVIO)[number];

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "content-type, x-ops-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors(req) } });
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

// ---------------------------------------------------------------------------------------------
// Token HMAC dos links (mesmo formato em eventos-public):  base64url(id|escopo|exp) "." base64url(hmac)
// ---------------------------------------------------------------------------------------------

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array | null {
  try {
    const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmac(payload: string): Promise<Uint8Array> {
  const secret = segredo("EVENTOS_SECRET") ?? "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}

async function signToken(inscricaoId: string, escopo: "acesso" | "confirmar", expMs: number): Promise<string> {
  const payload = `${inscricaoId}|${escopo}|${Math.floor(expMs / 1000)}`;
  const sig = await hmac(payload);
  return `${b64url(new TextEncoder().encode(payload))}.${b64url(sig)}`;
}

async function verifyToken(token: string): Promise<{ inscricaoId: string; escopo: string } | null> {
  if (!segredo("EVENTOS_SECRET")) return null;
  const [p, s] = token.split(".");
  if (!p || !s) return null;
  const payloadBytes = b64urlDecode(p);
  if (!payloadBytes) return null;
  const payload = new TextDecoder().decode(payloadBytes);
  const expected = b64url(await hmac(payload));
  if (!safeEqual(expected, s)) return null;
  const [inscricaoId, escopo, exp] = payload.split("|");
  if (!/^[0-9a-f-]{36}$/i.test(inscricaoId ?? "") || !escopo || !exp) return null;
  if (Number(exp) * 1000 < Date.now()) return null;
  return { inscricaoId, escopo };
}

// ---------------------------------------------------------------------------------------------
// Datas em Belém
// ---------------------------------------------------------------------------------------------

function fmtData(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(new Date(iso));
}
function fmtHora(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}
function fmtDataHora(iso: string): string {
  return `${fmtData(iso)}, às ${fmtHora(iso)}`;
}
function belemDate(iso: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}
function belemHour(now = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hour12: false }).format(now)) % 24;
}
// Janela de envio de lembretes/pós-evento: 08h–20h59 em Belém. O "hoje é o dia" ignora a janela.
function inSendWindow(now = new Date()): boolean {
  const h = belemHour(now);
  return h >= 8 && h <= 20;
}

function googleCalendarUrl(ev: Evento): string {
  const f = (iso: string) => new Date(iso).toISOString().replace(/[-:]|\.\d{3}/g, "");
  const local = ev.formato === "online" ? "Online" : [ev.local_nome, ev.local_endereco].filter(Boolean).join(" · ");
  const u = new URL("https://calendar.google.com/calendar/render");
  u.searchParams.set("action", "TEMPLATE");
  u.searchParams.set("text", ev.titulo);
  u.searchParams.set("dates", `${f(ev.inicio)}/${f(ev.fim)}`);
  u.searchParams.set("details", `${ev.descricao_curta ?? ""}\n\n${SITE}/eventos/${ev.slug}`.trim());
  if (local) u.searchParams.set("location", local);
  return u.toString();
}

// ---------------------------------------------------------------------------------------------
// Dados
// ---------------------------------------------------------------------------------------------

interface Evento {
  id: string;
  slug: string;
  titulo: string;
  categoria: string;
  publico: "familias" | "profissionais";
  formato: "presencial" | "online" | "hibrido";
  descricao_curta: string | null;
  local_nome: string | null;
  local_endereco: string | null;
  online_url: string | null;
  inicio: string;
  fim: string;
  status: string;
  comunidade_whatsapp_url: string | null;
  cancel_mensagem: string | null;
}

interface Comunicado {
  id: string;
  assunto: string;
  mensagem: string;
}

interface Tipo {
  id: string;
  nome: string;
  tipo: "gratuito" | "pago";
}

interface Inscricao {
  id: string;
  evento_id: string;
  tipo_id: string;
  nome: string;
  email: string;
  whatsapp: string | null;
  status: string;
  origem: string;
  codigo: string;
  marketing_opt_in_email: boolean;
  promocao_prazo: string | null;
  checkin_at: string | null;
  brevo_sync_at: string | null;
  evento: Evento;
  tipo: Tipo;
}

const INSCRICAO_SELECT =
  "id, evento_id, tipo_id, nome, email, whatsapp, status, origem, codigo, marketing_opt_in_email, promocao_prazo, checkin_at, brevo_sync_at, " +
  "evento:fa_eventos!inner(id, slug, titulo, categoria, publico, formato, descricao_curta, local_nome, local_endereco, online_url, inicio, fim, status, comunidade_whatsapp_url, cancel_mensagem), " +
  "tipo:fa_eventos_ingresso_tipos!inner(id, nome, tipo)";

async function loadInscricao(admin: Admin, id: string): Promise<Inscricao | null> {
  const { data, error } = await admin.from("fa_eventos_inscricoes").select(INSCRICAO_SELECT).eq("id", id).maybeSingle();
  if (error || !data) return null;
  return data as unknown as Inscricao;
}

function comunidadeUrl(ev: Evento): string {
  if (ev.comunidade_whatsapp_url) return ev.comunidade_whatsapp_url;
  return Deno.env.get(ev.publico === "profissionais" ? "COMUNIDADE_WHATSAPP_PROFISSIONAIS" : "COMUNIDADE_WHATSAPP_FAMILIAS") ?? "";
}

function listIdFor(publico: string): number {
  const raw = Deno.env.get(publico === "profissionais" ? "BREVO_LIST_EVENTOS_PROFISSIONAIS" : "BREVO_LIST_EVENTOS_FAMILIAS") ?? "";
  const n = Number(raw.trim());
  return Number.isInteger(n) && n > 0 ? n : 0;
}

// ---------------------------------------------------------------------------------------------
// Brevo
// ---------------------------------------------------------------------------------------------

function brevoHeaders(): Record<string, string> {
  return { "api-key": Deno.env.get("BREVO_API_KEY") ?? "", "Content-Type": "application/json", Accept: "application/json" };
}

function parseSender(raw: string): { name?: string; email: string } {
  const m = raw.match(/^(.*)<(.+)>$/);
  if (m) return { name: m[1].trim().replace(/^"|"$/g, "") || undefined, email: m[2].trim() };
  return { email: raw.trim() };
}

async function brevoSend(params: {
  to: { email: string; name?: string };
  subject: string;
  html: string;
  tag: string;
  unsubscribeUrl?: string;
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  if (!apiKey) return { ok: false, error: "BREVO_API_KEY não configurada" };
  const from = Deno.env.get("BREVO_FROM") ?? "Instituto Faça Amigos <nao-responder@institutofacaamigos.com.br>";
  const replyTo = Deno.env.get("BREVO_REPLY_TO");
  const body: Record<string, unknown> = {
    sender: parseSender(from),
    to: [params.to],
    subject: params.subject,
    htmlContent: params.html,
    tags: [params.tag],
    ...(replyTo ? { replyTo: parseSender(replyTo) } : {}),
  };
  if (params.unsubscribeUrl) {
    body.headers = { "List-Unsubscribe": `<${params.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
  }
  try {
    const resp = await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: brevoHeaders(), body: JSON.stringify(body) });
    if (!resp.ok) {
      const d = await resp.json().catch(() => null);
      return { ok: false, error: d?.message || `Brevo HTTP ${resp.status}` };
    }
    const d = await resp.json().catch(() => ({}));
    return { ok: true, messageId: d?.messageId ? String(d.messageId) : undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "erro de rede" };
  }
}

// Coloca o contato na lista da trilha (só com opt-in de e-mail). Best-effort: nunca falha o envio.
async function syncBrevoList(admin: Admin, ins: Inscricao): Promise<void> {
  if (!ins.marketing_opt_in_email) return;
  const lid = listIdFor(ins.evento.publico);
  if (!lid || !Deno.env.get("BREVO_API_KEY")) return;
  const first = ins.nome.split(/\s+/)[0] ?? "";
  const attempt = (attributes: Record<string, string>) =>
    fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: brevoHeaders(),
      body: JSON.stringify({ email: ins.email, attributes, listIds: [lid], updateEnabled: true }),
    });
  try {
    let r = await attempt({ NOME: first, WHATSAPP: ins.whatsapp ?? "", TRILHA: ins.evento.publico, ULTIMO_EVENTO: ins.evento.slug });
    if (r.status === 400) r = await attempt({ NOME: first }); // conta sem os atributos personalizados
    await admin.from("fa_eventos_inscricoes").update(
      r.ok || r.status === 204
        ? { brevo_sync_at: new Date().toISOString(), brevo_sync_error: null }
        : { brevo_sync_error: `Brevo HTTP ${r.status}` },
    ).eq("id", ins.id);
  } catch (err) {
    await admin.from("fa_eventos_inscricoes").update({ brevo_sync_error: err instanceof Error ? err.message : "erro" }).eq("id", ins.id);
  }
}

async function removeFromLists(email: string): Promise<void> {
  const ids = [listIdFor("familias"), listIdFor("profissionais")].filter((n) => n > 0);
  await Promise.all(ids.map((lid) =>
    fetch(`https://api.brevo.com/v3/contacts/lists/${lid}/contacts/remove`, {
      method: "POST",
      headers: brevoHeaders(),
      body: JSON.stringify({ emails: [email] }),
    }).catch(() => null)
  ));
}

// ---------------------------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------------------------

function layout(titulo: string, corpo: string, rodape: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR"><body style="margin:0;padding:0;background:#F4FAFB;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#F4FAFB;padding:24px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;width:100%;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #DCE9EC;">
  <tr><td style="padding:18px 32px 10px;text-align:center;">
    <img src="${LOGO_URL}" alt="Instituto Faça Amigos" width="36" height="36" style="display:inline-block;vertical-align:middle;margin-right:8px;">
    <span style="font-family:Arial,sans-serif;font-size:15px;font-weight:800;color:#065264;vertical-align:middle;">Faça<span style="color:#FB3D6A;">Amigos</span></span>
  </td></tr>
  <tr><td style="background:#065264;padding:24px 32px;text-align:center;">
    <h1 style="margin:0;font-family:Arial,sans-serif;font-size:20px;line-height:1.3;color:#fff;">${titulo}</h1>
  </td></tr>
  <tr><td style="padding:28px 32px 8px;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#0B1416;">${corpo}</td></tr>
  <tr><td style="padding:8px 32px 28px;text-align:center;font-family:Arial,sans-serif;font-size:11px;line-height:1.5;color:#7A8A90;">
    ${rodape}<br>Instituto Faça Amigos Ltda · CNPJ 22.161.197/0001-83 · Rua Boaventura da Silva, 1573, Umarizal, Belém/PA
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function botao(href: string, texto: string, cor = "#FB3D6A"): string {
  return `<div style="text-align:center;margin:22px 0 10px;"><a href="${esc(href)}" style="display:inline-block;background:${cor};color:#fff;font-weight:800;text-decoration:none;padding:14px 26px;border-radius:9999px;font-size:15px;">${esc(texto)}</a></div>`;
}

function caixaCodigo(codigo: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#F4FAFB;border:2px dashed #07C5C8;border-radius:14px;margin:18px 0;">
    <tr><td style="padding:18px;text-align:center;">
      <div style="font-size:12px;color:#065264;font-weight:700;text-transform:uppercase;letter-spacing:.05em;">Seu código de acesso</div>
      <div style="font-family:'Courier New',monospace;font-size:26px;font-weight:900;color:#065264;letter-spacing:.05em;margin:6px 0;">${esc(codigo)}</div>
      <div style="font-size:12px;color:#4C6B62;">Apresente o QR do seu ingresso (ou este código) na entrada</div>
    </td></tr></table>`;
}

function quandoOnde(ev: Evento, mostrarOnline: boolean): string {
  const linhas = [`<b>Quando:</b> ${esc(fmtDataHora(ev.inicio))} (horário de Belém)`];
  if (ev.formato !== "online") {
    linhas.push(`<b>Onde:</b> ${esc([ev.local_nome, ev.local_endereco].filter(Boolean).join(" · ") || "a confirmar")}`);
  }
  if (ev.formato !== "presencial") {
    linhas.push(mostrarOnline && ev.online_url
      ? `<b>Link de acesso:</b> <a href="${esc(ev.online_url)}" style="color:#065264;">${esc(ev.online_url)}</a>`
      : `<b>Online:</b> o link de acesso fica no seu ingresso e chega no lembrete do dia`);
  }
  return `<p style="margin:0 0 14px;">${linhas.join("<br>")}</p>`;
}

function primeiroNome(nome: string): string {
  return (nome ?? "").trim().split(/\s+/)[0] ?? "";
}

function comunidadeBloco(url: string): string {
  if (!url) return "";
  return `<div style="background:#E2F8F8;border-radius:14px;padding:16px 18px;margin:18px 0;">
    <p style="margin:0 0 6px;font-weight:800;color:#065264;">Entre na Comunidade FaçaAmigos</p>
    <p style="margin:0 0 10px;font-size:14px;">Canal só de avisos no WhatsApp: próximos encontros, materiais e bastidores. Sem grupo barulhento.</p>
    ${botao(url, "Entrar na Comunidade", "#25D366")}
  </div>`;
}

interface Mensagem {
  subject: string;
  html: string;
  marketing: boolean; // marketing = leva List-Unsubscribe
}

async function montar(admin: Admin, tipo: TipoEnvio, ins: Inscricao, extra: { proximos?: Evento[]; comunicado?: Comunicado }): Promise<Mensagem> {
  const ev = ins.evento;
  const nome = primeiroNome(ins.nome);
  const expAcesso = new Date(ev.fim).getTime() + 30 * 86400_000;
  const tAcesso = await signToken(ins.id, "acesso", expAcesso);
  const ingressoUrl = `${SITE}/ingresso?t=${tAcesso}`;
  const rodapeTransacional = "Você recebe este e-mail porque se inscreveu neste evento.";

  switch (tipo) {
    case "voucher":
    case "voucher_reenvio": {
      const corpo = `
        <p style="margin:0 0 14px;">Olá, ${esc(nome)}! Sua vaga em <b>${esc(ev.titulo)}</b> está confirmada.</p>
        ${quandoOnde(ev, false)}
        ${caixaCodigo(ins.codigo)}
        ${botao(ingressoUrl, "Ver meu ingresso (QR)")}
        <p style="margin:0 0 14px;text-align:center;font-size:13px;"><a href="${esc(googleCalendarUrl(ev))}" style="color:#065264;">Adicionar ao Google Agenda</a></p>
        ${comunidadeBloco(comunidadeUrl(ev))}
        <p style="margin:18px 0 0;font-size:13px;color:#4C6B62;">Não vai conseguir ir? <a href="${esc(ingressoUrl)}" style="color:#065264;">Libere sua vaga</a> para quem está na lista de espera. Leva um clique.</p>`;
      return { subject: `Sua vaga: ${ev.titulo}`, html: layout("Sua vaga está confirmada", corpo, rodapeTransacional), marketing: false };
    }
    case "lista_espera": {
      const { count } = await admin.from("fa_eventos_inscricoes").select("id", { count: "exact", head: true })
        .eq("tipo_id", ins.tipo_id).eq("status", "lista_espera").lte("created_at", new Date().toISOString());
      const corpo = `
        <p style="margin:0 0 14px;">Olá, ${esc(nome)}! As vagas de <b>${esc(ev.titulo)}</b> acabaram, e você entrou na lista de espera${count ? ` (hoje ela tem ${count} pessoa${count > 1 ? "s" : ""})` : ""}.</p>
        ${quandoOnde(ev, false)}
        <p style="margin:0 0 14px;">Quando alguém liberar a vaga, avisamos por e-mail, na ordem da fila. Você terá <b>24 horas</b> para confirmar, senão a vaga passa para a próxima pessoa.</p>
        ${botao(ingressoUrl, "Acompanhar minha posição", "#065264")}
        <p style="margin:18px 0 0;font-size:13px;color:#4C6B62;">Mudou de ideia? <a href="${esc(ingressoUrl)}" style="color:#065264;">Saia da lista</a> pelo mesmo link.</p>`;
      return { subject: `Você está na lista de espera: ${ev.titulo}`, html: layout("Você está na lista de espera", corpo, rodapeTransacional), marketing: false };
    }
    case "promocao": {
      const prazo = ins.promocao_prazo ?? new Date(Date.now() + 24 * 3600_000).toISOString();
      const tConfirmar = await signToken(ins.id, "confirmar", new Date(prazo).getTime());
      const confirmarUrl = `${SITE}/ingresso?confirmar=${tConfirmar}`;
      const corpo = `
        <p style="margin:0 0 14px;">${esc(nome)}, abriu uma vaga para você em <b>${esc(ev.titulo)}</b>!</p>
        ${quandoOnde(ev, false)}
        <p style="margin:0 0 14px;">Confirme até <b>${esc(fmtDataHora(prazo))}</b>. Depois disso a vaga passa para a próxima pessoa da fila.</p>
        ${botao(confirmarUrl, "Confirmar minha vaga")}
        <p style="margin:18px 0 0;font-size:13px;color:#4C6B62;">Se não puder ir, não precisa fazer nada: a vaga segue para o próximo automaticamente.</p>`;
      return { subject: `Abriu uma vaga: ${ev.titulo} (confirme em 24h)`, html: layout("Abriu uma vaga para você", corpo, rodapeTransacional), marketing: false };
    }
    case "lembrete_24h": {
      const corpo = `
        <p style="margin:0 0 14px;">${esc(nome)}, é amanhã: <b>${esc(ev.titulo)}</b>.</p>
        ${quandoOnde(ev, true)}
        ${caixaCodigo(ins.codigo)}
        ${botao(ingressoUrl, "Abrir meu ingresso")}
        <p style="margin:18px 0 0;font-size:13px;color:#4C6B62;">Não vai conseguir ir? <a href="${esc(ingressoUrl)}" style="color:#065264;">Libere sua vaga</a> para quem está na lista de espera.</p>`;
      return { subject: `É amanhã: ${ev.titulo}`, html: layout("É amanhã!", corpo, rodapeTransacional), marketing: false };
    }
    case "lembrete_hoje": {
      const corpo = `
        <p style="margin:0 0 14px;">${esc(nome)}, hoje às <b>${esc(fmtHora(ev.inicio))}</b>: <b>${esc(ev.titulo)}</b>.</p>
        ${quandoOnde(ev, true)}
        ${caixaCodigo(ins.codigo)}
        ${botao(ingressoUrl, "Abrir meu ingresso")}`;
      return { subject: `Hoje, às ${fmtHora(ev.inicio)}: ${ev.titulo}`, html: layout("É hoje!", corpo, rodapeTransacional), marketing: false };
    }
    case "pos_evento": {
      const proximos = (extra.proximos ?? []).slice(0, 3).map((p) =>
        `<li style="margin:0 0 8px;"><a href="${esc(`${SITE}/eventos/${p.slug}?utm_source=email&utm_medium=pos_evento&utm_campaign=${ev.slug}`)}" style="color:#065264;font-weight:700;">${esc(p.titulo)}</a><br><span style="font-size:13px;color:#4C6B62;">${esc(fmtDataHora(p.inicio))}</span></li>`
      ).join("");
      const corpo = `
        <p style="margin:0 0 14px;">${esc(nome)}, obrigada por participar de <b>${esc(ev.titulo)}</b>.</p>
        <p style="margin:0 0 14px;">Se ficou alguma dúvida ou você quer contar como foi, responda este e-mail. A gente lê tudo.</p>
        ${comunidadeBloco(comunidadeUrl(ev))}
        ${proximos ? `<p style="margin:18px 0 6px;font-weight:800;color:#065264;">Próximos encontros</p><ul style="margin:0;padding-left:20px;">${proximos}</ul>` : `<p style="margin:0;"><a href="${esc(`${SITE}/eventos`)}" style="color:#065264;">Ver os próximos encontros</a></p>`}`;
      return { subject: `Obrigada por participar: ${ev.titulo}`, html: layout("Obrigada por vir", corpo, "Você recebe este e-mail porque participou de um evento do Instituto e aceitou receber novidades."), marketing: true };
    }
    case "comunicado": {
      const c = extra.comunicado;
      if (!c) throw new Error("comunicado não encontrado");
      const corpo = `
        <p style="margin:0 0 14px;">Olá, ${esc(nome)}! Um recado sobre <b>${esc(ev.titulo)}</b>:</p>
        <div style="background:#F4FAFB;border-radius:14px;padding:14px 18px;margin:0 0 14px;white-space:pre-line;">${esc(c.mensagem)}</div>
        ${quandoOnde(ev, ins.status === "confirmada")}
        ${ins.status === "confirmada" ? botao(ingressoUrl, "Abrir meu ingresso") : ""}
        <p style="margin:18px 0 0;font-size:13px;color:#4C6B62;">Dúvidas? Responda este e-mail.</p>`;
      return { subject: c.assunto, html: layout(esc(c.assunto), corpo, rodapeTransacional), marketing: false };
    }
    case "evento_cancelado": {
      const corpo = `
        <p style="margin:0 0 14px;">${esc(nome)}, precisamos cancelar <b>${esc(ev.titulo)}</b>, que aconteceria em ${esc(fmtDataHora(ev.inicio))}.</p>
        ${ev.cancel_mensagem ? `<div style="background:#FFF3D2;border-radius:14px;padding:14px 18px;margin:0 0 14px;white-space:pre-line;">${esc(ev.cancel_mensagem)}</div>` : ""}
        ${ins.origem === "hotmart" ? `<p style="margin:0 0 14px;">Seu ingresso foi pago pela Hotmart: o reembolso integral é feito por lá, no mesmo meio de pagamento. Se não aparecer em até 10 dias, responda este e-mail.</p>` : ""}
        <p style="margin:0;"><a href="${esc(`${SITE}/eventos`)}" style="color:#065264;">Ver os próximos encontros</a></p>`;
      return { subject: `Cancelado: ${ev.titulo}`, html: layout("Evento cancelado", corpo, rodapeTransacional), marketing: false };
    }
  }
  throw new Error(`tipo de envio desconhecido: ${tipo}`);
}

// ---------------------------------------------------------------------------------------------
// Envio com reserva (claim) em fa_eventos_envios
// ---------------------------------------------------------------------------------------------

async function enviar(admin: Admin, inscricaoId: string, tipo: TipoEnvio, opts: { dry?: boolean; envioId?: number; comunicadoId?: string } = {}) {
  const ins = await loadInscricao(admin, inscricaoId);
  if (!ins) return { ok: false, error: "inscrição não encontrada" };

  // Reserva. Se já existe (mesmo tipo), é duplicata: não envia de novo.
  let envioId = opts.envioId ?? null;
  if (envioId === null) {
    if (opts.dry) return { ok: true, dry: true };
    const { data, error } = await admin.from("fa_eventos_envios").insert({ inscricao_id: ins.id, tipo, status: "pendente", comunicado_id: opts.comunicadoId ?? null }).select("id").single();
    if (error) {
      if (error.code === "23505") return { ok: true, duplicate: true };
      return { ok: false, error: `reserva: ${error.message}` };
    }
    envioId = data.id as number;
  }

  let msg: Mensagem;
  try {
    let proximos: Evento[] = [];
    if (tipo === "pos_evento") {
      const { data } = await admin.from("fa_eventos").select("id, slug, titulo, inicio, fim, publico, formato, local_nome, local_endereco, categoria, descricao_curta, online_url, status, comunidade_whatsapp_url, cancel_mensagem")
        .eq("status", "published").eq("publico", ins.evento.publico).gt("inicio", new Date().toISOString()).order("inicio").limit(3);
      proximos = (data ?? []) as unknown as Evento[];
    }
    let comunicado: Comunicado | undefined;
    if (tipo === "comunicado") {
      const { data: envio } = await admin.from("fa_eventos_envios").select("comunicado_id").eq("id", envioId).maybeSingle();
      const { data: c } = envio?.comunicado_id
        ? await admin.from("fa_eventos_comunicados").select("id, assunto, mensagem").eq("id", envio.comunicado_id).maybeSingle()
        : { data: null };
      if (!c) throw new Error("comunicado não encontrado");
      comunicado = c as Comunicado;
    }
    msg = await montar(admin, tipo, ins, { proximos, comunicado });
  } catch (err) {
    const e = err instanceof Error ? err.message : "erro ao montar";
    await admin.from("fa_eventos_envios").update({ status: "erro", error: e }).eq("id", envioId);
    return { ok: false, error: e };
  }

  const unsubscribeUrl = msg.marketing
    ? `${SITE}/descadastrar?e=${await signToken(ins.id, "acesso", new Date(ins.evento.fim).getTime() + 30 * 86400_000)}`
    : undefined;
  const r = await brevoSend({ to: { email: ins.email, name: ins.nome }, subject: msg.subject, html: msg.html, tag: `eventos_${tipo}`, unsubscribeUrl });
  await admin.from("fa_eventos_envios").update(
    r.ok
      ? { status: "enviado", sent_at: new Date().toISOString(), brevo_message_id: r.messageId ?? null, error: null }
      : { status: "erro", error: r.error ?? "falha" },
  ).eq("id", envioId);

  if (r.ok && (tipo === "voucher" || tipo === "lista_espera") && !ins.brevo_sync_at) {
    await syncBrevoList(admin, ins);
  }
  if (r.ok && (tipo === "voucher" || tipo === "lista_espera") && ins.origem === "site") {
    await avisarOrganizador(admin, ins);
  }
  return r.ok ? { ok: true, message_id: r.messageId } : { ok: false, error: r.error };
}

// Aviso ao organizador a cada inscrição feita pelo site (best-effort: nunca falha o envio ao participante).
// Destino: EVENTOS_AVISO_EMAIL (ou Vault eventos_aviso_email), senão ALERT_EMAIL, senão LEAD_NOTIFY_EMAIL (varios, separados por virgula).
// O valor "off" desliga. Sem destino configurado, nao faz nada.
async function avisarOrganizador(admin: Admin, ins: Inscricao): Promise<void> {
  try {
    const raw = segredo("EVENTOS_AVISO_EMAIL") || Deno.env.get("ALERT_EMAIL") || Deno.env.get("LEAD_NOTIFY_EMAIL") || "";
    if (raw.trim().toLowerCase() === "off") return;
    const destinos = raw.split(/[,;]/).map((e) => e.trim()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (!destinos.length) return;
    const { data: tipo } = await admin.from("fa_eventos_ingresso_tipos").select("vagas").eq("id", ins.tipo_id).maybeSingle();
    const { count: ocupadas } = await admin.from("fa_eventos_inscricoes").select("id", { count: "exact", head: true })
      .eq("tipo_id", ins.tipo_id).in("status", ["confirmada", "promovida"]);
    const { count: fila } = await admin.from("fa_eventos_inscricoes").select("id", { count: "exact", head: true })
      .eq("tipo_id", ins.tipo_id).eq("status", "lista_espera");
    const placar = `${ocupadas ?? 0}/${tipo?.vagas ?? "?"} vagas ocupadas${fila ? `, ${fila} na lista de espera` : ""}`;
    const situacao = ins.status === "lista_espera" ? "entrou na lista de espera" : "garantiu a vaga";
    const corpo = `<p style="margin:0 0 14px;"><b>${esc(ins.nome)}</b> ${situacao} em <b>${esc(ins.evento.titulo)}</b>.</p>
      <p style="margin:0 0 14px;">${esc(placar)}</p>
      <p style="margin:0;font-size:13px;color:#4C6B62;">Para desligar este aviso, defina EVENTOS_AVISO_EMAIL como off.</p>`;
    for (const to of destinos) {
      await brevoSend({ to: { email: to }, subject: `Nova inscrição: ${ins.evento.titulo} (${placar})`, html: layout("Nova inscrição", corpo, "Aviso interno do módulo de eventos."), tag: "eventos_aviso" });
    }
  } catch (err) {
    console.error("eventos-dispatch: aviso ao organizador", err instanceof Error ? err.message : err);
  }
}

// ---------------------------------------------------------------------------------------------
// Rotina (cron): expira promoções, drena a fila, lembretes e pós-evento
// ---------------------------------------------------------------------------------------------

interface LembreteRow {
  id: string;
  evento: { inicio: string; fim: string; status: string };
}

async function run(admin: Admin, dry: boolean) {
  const summary = {
    window: inSendWindow(),
    expiradas: 0, promovidas: 0, promocao_enviadas: 0,
    pendentes: 0, pendentes_enviados: 0,
    lembrete_24h: 0, lembrete_hoje: 0, pos_evento: 0,
    falhas: 0,
  };
  let enviados = 0;

  // 1) Promoções vencidas → próximo da fila
  if (!dry) {
    const { data: r, error } = await admin.rpc("fa_eventos_expirar_promocoes");
    if (error) {
      console.error("eventos-dispatch: expirar_promocoes", error);
      summary.falhas++;
    } else {
      const exp = (r?.expiradas ?? []) as string[];
      const prom = (r?.promovidas ?? []) as string[];
      summary.expiradas = exp.length;
      summary.promovidas = prom.length;
      for (const id of prom) {
        const e = await enviar(admin, id, "promocao");
        if (e.ok && !e.duplicate) summary.promocao_enviadas++;
        else if (!e.ok) summary.falhas++;
      }
    }
  } else {
    const { count } = await admin.from("fa_eventos_inscricoes").select("id", { count: "exact", head: true })
      .eq("status", "promovida").lt("promocao_prazo", new Date().toISOString());
    summary.expiradas = count ?? 0;
  }

  // 2) Fila (envios em massa deixados como 'pendente', ex.: evento cancelado)
  const { data: pend } = await admin.from("fa_eventos_envios").select("id, inscricao_id, tipo, comunicado_id").eq("status", "pendente").order("created_at").limit(200);
  summary.pendentes = pend?.length ?? 0;
  if (!dry) {
    for (const p of pend ?? []) {
      if (enviados >= MAX_PER_RUN) break;
      const e = await enviar(admin, p.inscricao_id as string, p.tipo as TipoEnvio, { envioId: p.id as number, comunicadoId: (p.comunicado_id as string | null) ?? undefined });
      if (e.ok) { summary.pendentes_enviados++; enviados++; } else summary.falhas++;
    }
  }

  // 3) Lembretes e pós-evento (só confirmados, evento publicado)
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const lembretes: Array<{ tipo: TipoEnvio; janela: boolean; filtro: (q: any) => any; check?: (row: LembreteRow) => boolean }> = [
    {
      tipo: "lembrete_24h", janela: true,
      filtro: (q) => q.gte("evento.inicio", iso(now + 20 * 3600_000)).lte("evento.inicio", iso(now + 25 * 3600_000)),
    },
    {
      tipo: "lembrete_hoje", janela: false,
      filtro: (q) => q.gte("evento.inicio", iso(now + 1 * 3600_000)).lte("evento.inicio", iso(now + 5 * 3600_000)),
      check: (row) => belemDate(row.evento.inicio) === belemDate(new Date()),
    },
    {
      tipo: "pos_evento", janela: true,
      filtro: (q) => q.gte("evento.fim", iso(now - 26 * 3600_000)).lte("evento.fim", iso(now - 2 * 3600_000)),
    },
  ];

  for (const l of lembretes) {
    if (l.janela && !summary.window) continue;
    let q = admin.from("fa_eventos_inscricoes")
      .select("id, evento:fa_eventos!inner(inicio, fim, status)")
      .eq("status", "confirmada")
      .eq("evento.status", "published")
      .limit(500);
    q = l.filtro(q);
    if (l.tipo === "pos_evento") q = q.eq("marketing_opt_in_email", true);
    const { data, error } = await q;
    if (error) {
      console.error(`eventos-dispatch: ${l.tipo}`, error);
      summary.falhas++;
      continue;
    }
    for (const row of (data ?? []) as unknown as LembreteRow[]) {
      if (l.check && !l.check(row)) continue;
      if (enviados >= MAX_PER_RUN) break;
      if (dry) { (summary as any)[l.tipo]++; continue; }
      const e = await enviar(admin, row.id, l.tipo);
      if (e.ok && !e.duplicate) { (summary as any)[l.tipo]++; enviados++; }
      else if (!e.ok) summary.falhas++;
    }
  }

  return summary;
}

// ---------------------------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "corpo inválido" }, 400);
  }
  const action = str(body.action);
  const url = new URL(req.url);
  const dry = url.searchParams.get("dry") === "1";

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json(req, { error: "serviço indisponível" }, 500);
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Descadastro (marketing): vem do navegador com o token do ingresso, sem chave de operação.
  if (action === "descadastrar") {
    const v = await verifyToken(str(body.e));
    if (!v || v.escopo !== "acesso") return json(req, { error: "link inválido" }, 400);
    const { data: ins } = await admin.from("fa_eventos_inscricoes").select("email").eq("id", v.inscricaoId).maybeSingle();
    if (!ins?.email) return json(req, { error: "link inválido" }, 400);
    await admin.from("fa_eventos_inscricoes").update({ marketing_opt_in_email: false }).eq("email", ins.email);
    await removeFromLists(ins.email);
    return json(req, { ok: true });
  }

  // Tudo abaixo exige a chave de operação (cron e as outras funções).
  const expected = segredo("OPS_KEY") ?? "";
  const given = req.headers.get("x-ops-key") ?? "";
  if (!expected || !safeEqual(given, expected)) return json(req, { error: "não autorizado" }, 401);

  if (action === "run") {
    return json(req, await run(admin, dry));
  }

  // Teste de comunicado: manda a mensagem so para o endereco informado (o do proprio organizador), sem reserva nem fila.
  if (action === "comunicado_teste") {
    const to = str(body.to).toLowerCase();
    const assunto = str(body.assunto);
    const mensagem = str(body.mensagem);
    const eventoId = str(body.evento_id);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || assunto.length < 3 || mensagem.length < 10 || !/^[0-9a-f-]{36}$/i.test(eventoId)) {
      return json(req, { error: "dados inválidos" }, 400);
    }
    const { data: ev } = await admin.from("fa_eventos").select("id, slug, titulo, categoria, publico, formato, descricao_curta, local_nome, local_endereco, online_url, inicio, fim, status, comunidade_whatsapp_url, cancel_mensagem").eq("id", eventoId).maybeSingle();
    if (!ev) return json(req, { error: "evento não encontrado" }, 404);
    const falsa = { id: "00000000-0000-0000-0000-000000000000", evento_id: ev.id, tipo_id: "", nome: "Participante", email: to, whatsapp: null, status: "lista_espera", origem: "admin", codigo: "", marketing_opt_in_email: false, promocao_prazo: null, checkin_at: null, brevo_sync_at: null, evento: ev as unknown as Evento, tipo: { id: "", nome: "", tipo: "gratuito" } } as Inscricao;
    const msg = await montar(admin, "comunicado", falsa, { comunicado: { id: "teste", assunto: `[TESTE] ${assunto}`, mensagem } });
    const r = await brevoSend({ to: { email: to }, subject: msg.subject, html: msg.html, tag: "eventos_comunicado_teste" });
    return json(req, r, r.ok ? 200 : 502);
  }

  if (action === "enviar") {
    const inscricaoId = str(body.inscricao_id);
    const tipo = str(body.tipo) as TipoEnvio;
    if (!/^[0-9a-f-]{36}$/i.test(inscricaoId) || !TIPOS_ENVIO.includes(tipo) || tipo === "comunicado") {
      return json(req, { error: "inscricao_id/tipo inválidos" }, 400);
    }
    const r = await enviar(admin, inscricaoId, tipo, { dry });
    return json(req, r, r.ok ? 200 : 502);
  }

  return json(req, { error: "ação inválida" }, 400);
});
