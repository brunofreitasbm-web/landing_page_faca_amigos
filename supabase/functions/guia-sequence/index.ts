// Sequência de e-mails do mapa: dias 1, 3 e 6 vendem o e-book (guia ou Código); o dia 9 é conteúdo gratuito (/aprender); o dia 12 convida para o próximo passo com a clínica.
//
// Como funciona:
//  - pg_cron chama POST ?run=1 de hora em hora, com o cabeçalho x-run-key. A função procura leads que marcaram o opt-in
//    (com o texto novo do checkbox), concluíram o mapa e já passaram do prazo de cada passo, e
//    envia o template do Brevo correspondente pela API transacional (POST /v3/smtp/email).
//  - O Brevo não permite criar workflows por API, por isso o agendamento é feito aqui.
//  - Cada envio é "reservado" em fa_teste_ebook_seq (chave única lead+passo) ANTES de chamar o
//    Brevo; se o Brevo falhar, a reserva é desfeita e a próxima hora tenta de novo. Nunca duplica.
//  - Só envia entre 08h e 20h59 de Belém (UTC-3). Fora disso, espera a próxima janela.
//  - Descadastro: POST com ?u=<lead_id>&s=<assinatura> (link da página /descadastrar e cabeçalho
//    List-Unsubscribe one-click). Interrompe a sequência, desmarca o opt-in de todos os leads do
//    mesmo e-mail e tira o contato da lista do Brevo.
//  - Também interrompe se o contato estiver bloqueado ou tiver saído da lista no Brevo.
//  - Quem já comprou sai da sequência: hotmart-sync grava as vendas em fa_ebook_compras e marca os leads.
//
// Secrets: BREVO_API_KEY, BREVO_LIST_ID (já existentes), SEQ_SECRET (assinatura do link de descadastro)
// e SEQ_RUN_KEY (senha do ?run=1; sem ela a função recusa o disparo).

import { createClient } from "jsr:@supabase/supabase-js@2";

// Só entra na sequência quem deu consentimento depois de o texto novo do checkbox ir ao ar
// (commit 1c0d669, 20/09/2026 13:41 em Belém). Antes, o texto só falava em "conteúdos gratuitos".
const OPTIN_SINCE = "2026-09-20T16:50:00Z";

// Ids dos templates no Brevo e prazo, em horas, contado a partir do resultado do mapa.
const STEPS = [
  { step: 1, templateId: 1, delayHours: 24 },
  { step: 2, templateId: 2, delayHours: 72 },
  { step: 3, templateId: 3, delayHours: 144 },
  // Passo 4: conteúdo gratuito (página /aprender), 3 dias depois do último e-mail de venda. Template 4 no Brevo
  // (supabase/email-templates/ebook-d9-aprender.html). Sem esse template criado, o Brevo recusa e o passo é refeito a cada hora.
  { step: 4, templateId: 4, delayHours: 216 },
  // Passo 5: próximo passo com a clínica (convênio / particular / conversar), 3 dias depois do passo 4. Template 5 no Brevo
  // (supabase/email-templates/ebook-d12-proximo-passo.html). Sem preço, desconto ou urgência de propósito (publicidade em saúde).
  { step: 5, templateId: 5, delayHours: 288 },
];

const SITE = "https://institutofacaamigos.com.br";
const FUNCTION_URL = "https://ivjvpdzsfjdpyabbzzuj.supabase.co/functions/v1/guia-sequence";
const MAX_PER_RUN = 40;
const LOOKBACK_DAYS = 30;

const ALLOWED_ORIGINS = [SITE, "https://www.institutofacaamigos.com.br", "http://localhost:3000", "http://localhost:5500"];

// Produto oferecido em cada e-mail da sequência. O behavior-test-webhook grava em fa_leads_teste_comportamento
// .ebook_offer qual e-book o lead viu na tela de resultado; aqui a sequência manda o mesmo produto, em vez de
// falar do guia para quem viu o Código. Os 3 templates do Brevo devem usar as variáveis PRODUTO_* abaixo no
// lugar do texto fixo do guia — enquanto não usarem, o e-mail sai igual ao de hoje e nada quebra.
// O Código é pagamento único na Hotmart (sem parcelamento).
const OFFERS = {
  guia: {
    title: "O Brincar com Propósito",
    path: "/guia",
    cta: "Quero o guia",
    price: "R$ 29,90",
    installments: "ou 9x de R$ 3,33 no cartão",
  },
  codigo: {
    title: "O Código do Desenvolvimento Infantil",
    path: "/codigo",
    cta: "Conhecer o e-book",
    price: "R$ 9,90",
    installments: "pagamento único",
  },
} as const;

type OfferKey = keyof typeof OFFERS;

function offerKeyOf(lead: Lead): OfferKey {
  return lead.ebook_offer === "codigo" ? "codigo" : "guia";
}

// Link da página de vendas com rastreio: src/sck chegam aos relatórios de venda da Hotmart (a página de vendas
// repassa ao checkout); os utm_* alimentam o GA4. Mesmo padrão do buildEbookLink do behavior-test-webhook.
function offerUrl(key: OfferKey, lead: Lead, step: number): string {
  const u = new URL(SITE + OFFERS[key].path);
  u.searchParams.set("src", `seq_d${step}`);
  u.searchParams.set("sck", lead.result_band ?? "");
  u.searchParams.set("utm_source", "email");
  u.searchParams.set("utm_medium", "sequencia");
  u.searchParams.set("utm_campaign", `seq_${key}_d${step}`);
  return u.toString();
}

// Página gratuita com os guias e artigos do site. Vai em todos os e-mails (params.APRENDER_URL), com rastreio no GA4.
function aprenderUrl(step: number): string {
  const u = new URL(SITE + "/aprender");
  u.searchParams.set("utm_source", "email");
  u.searchParams.set("utm_medium", "sequencia");
  u.searchParams.set("utm_campaign", `seq_aprender_d${step}`);
  return u.toString();
}

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors(req) } });
}

async function sign(leadId: string): Promise<string> {
  const secret = Deno.env.get("SEQ_SECRET") ?? "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(leadId));
  return Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Janela de envio: 08h–20h59 em Belém (UTC-3, sem horário de verão).
function inSendWindow(now = new Date()): boolean {
  const belemHour = (now.getUTCHours() + 24 - 3) % 24;
  return belemHour >= 8 && belemHour <= 20;
}

function brevoHeaders(): Record<string, string> {
  return { "api-key": Deno.env.get("BREVO_API_KEY") ?? "", "Content-Type": "application/json", Accept: "application/json" };
}

function listId(): number {
  const n = Number((Deno.env.get("BREVO_LIST_ID") ?? "").trim());
  return Number.isInteger(n) && n > 0 ? n : 0;
}

interface Lead {
  id: string;
  guardian_name: string | null;
  guardian_email: string | null;
  child_first_name: string;
  result_band: string | null;
  completed_at: string;
  ebook_offer: string | null;
}

// Confere o contato no Brevo. Devolve "ok", ou o motivo para parar a sequência.
async function checkContact(email: string, lead: Lead): Promise<"ok" | "blocklisted" | "removed_from_list" | "unavailable"> {
  const lid = listId();
  if (!lid) return "unavailable";
  try {
    const resp = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, { headers: brevoHeaders() });
    if (resp.status === 404) {
      // Contato ainda não existe (ex.: a sincronização do resultado falhou): cria já na lista.
      const first = (lead.guardian_name ?? "").split(/\s+/)[0] ?? "";
      const attempt = (attributes: Record<string, string>) =>
        fetch("https://api.brevo.com/v3/contacts", {
          method: "POST",
          headers: brevoHeaders(),
          body: JSON.stringify({ email, attributes, listIds: [lid], updateEnabled: true }),
        });
      let r = await attempt({ NOME: first, NOME_CRIANCA: lead.child_first_name, FAIXA_RESULTADO: lead.result_band ?? "" });
      if (r.status === 400) r = await attempt({ NOME: first });
      return r.ok ? "ok" : "unavailable";
    }
    if (!resp.ok) return "unavailable";
    const c = await resp.json();
    if (c.emailBlacklisted === true) return "blocklisted";
    if (!Array.isArray(c.listIds) || !c.listIds.includes(lid)) return "removed_from_list";
    return "ok";
  } catch {
    return "unavailable";
  }
}

async function runBatch(admin: ReturnType<typeof createClient>, dry: boolean) {
  const summary = { window: inSendWindow(), candidates: 0, sent: 0, stopped: 0, failed: 0, skipped: 0 };
  if (!summary.window) return summary;

  const now = Date.now();
  const since = new Date(now - LOOKBACK_DAYS * 86400000).toISOString();
  const { data: leads, error } = await admin
    .from("fa_leads_teste_comportamento")
    .select("id, guardian_name, guardian_email, child_first_name, result_band, completed_at, ebook_offer")
    .eq("marketing_opt_in", true)
    .is("ebook_seq_stopped_at", null)
    .in("status", ["completed", "contacted"])
    .not("completed_at", "is", null)
    .not("guardian_email", "is", null)
    .gte("consent_at", OPTIN_SINCE)
    .gte("completed_at", since)
    .order("completed_at", { ascending: true })
    .limit(200);
  if (error || !leads) {
    console.error("guia-sequence: erro ao listar leads", error);
    return { ...summary, failed: 1 };
  }

  const ids = leads.map((l) => l.id);
  const sentByLead = new Map<string, number>();
  if (ids.length) {
    const { data: sent } = await admin.from("fa_teste_ebook_seq").select("lead_id, step").in("lead_id", ids);
    for (const s of sent ?? []) sentByLead.set(s.lead_id, Math.max(sentByLead.get(s.lead_id) ?? 0, s.step));
  }

  // Quem já comprou (fa_ebook_compras, alimentada por hotmart-sync) sai da sequência, inclusive se a
  // compra veio antes de o lead existir.
  const buyers = new Set<string>();
  const leadEmails = [...new Set((leads as Lead[]).map((l) => (l.guardian_email ?? "").trim().toLowerCase()).filter(Boolean))];
  if (leadEmails.length) {
    const { data: compras } = await admin.from("fa_ebook_compras").select("email").in("email", leadEmails);
    for (const c of compras ?? []) buyers.add(String(c.email).toLowerCase());
  }

  const emailsDone = new Set<string>();
  for (const lead of leads as Lead[]) {
    if (summary.sent + summary.failed >= MAX_PER_RUN) break;
    if (buyers.has((lead.guardian_email ?? "").trim().toLowerCase())) {
      if (!dry) {
        await admin.from("fa_leads_teste_comportamento")
          .update({ ebook_seq_stopped_at: new Date().toISOString(), ebook_seq_stop_reason: "purchased" })
          .eq("id", lead.id);
      }
      summary.stopped++;
      continue;
    }
    const next = STEPS.find((s) => s.step === (sentByLead.get(lead.id) ?? 0) + 1);
    if (!next) continue;
    if (new Date(lead.completed_at).getTime() + next.delayHours * 3600000 > now) continue;
    const email = (lead.guardian_email ?? "").trim().toLowerCase();
    if (!email || emailsDone.has(email)) { summary.skipped++; continue; }
    summary.candidates++;
    if (dry) continue;
    emailsDone.add(email);

    const contact = await checkContact(email, lead);
    if (contact === "unavailable") { summary.failed++; continue; }
    if (contact !== "ok") {
      await admin.from("fa_leads_teste_comportamento")
        .update({ ebook_seq_stopped_at: new Date().toISOString(), ebook_seq_stop_reason: contact })
        .eq("id", lead.id);
      summary.stopped++;
      continue;
    }

    // Reserva o envio (chave única lead+passo). Se outra execução já reservou, pula.
    const { error: claimErr } = await admin.from("fa_teste_ebook_seq").insert({ lead_id: lead.id, step: next.step });
    if (claimErr) { summary.skipped++; continue; }

    const offerKey = offerKeyOf(lead);
    const offer = OFFERS[offerKey];
    const sig = await sign(lead.id);
    const unsubPage = `${SITE}/descadastrar?u=${lead.id}&s=${sig}`;
    const unsubOneClick = `${FUNCTION_URL}?u=${lead.id}&s=${sig}`;
    try {
      const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: brevoHeaders(),
        body: JSON.stringify({
          templateId: next.templateId,
          to: [{ email, name: lead.guardian_name ?? undefined }],
          params: {
            NOME: (lead.guardian_name ?? "").split(/\s+/)[0] ?? "",
            NOME_CRIANCA: lead.child_first_name,
            FAIXA_RESULTADO: lead.result_band ?? "",
            PRODUTO: offerKey,
            PRODUTO_TITULO: offer.title,
            PRODUTO_URL: offerUrl(offerKey, lead, next.step),
            PRODUTO_CTA: offer.cta,
            PRODUTO_PRECO: offer.price,
            PRODUTO_PARCELAS: offer.installments,
            APRENDER_URL: aprenderUrl(next.step),
            UNSUB_URL: unsubPage,
          },
          headers: { "List-Unsubscribe": `<${unsubOneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
          tags: ["guia_sequencia", `d${next.step}`, next.step === 4 ? "conteudo_aprender" : next.step === 5 ? "proximo_passo_clinica" : `produto_${offerKey}`],
        }),
      });
      if (!resp.ok) {
        console.error("guia-sequence: Brevo recusou", resp.status, await resp.text().catch(() => ""));
        await admin.from("fa_teste_ebook_seq").delete().eq("lead_id", lead.id).eq("step", next.step);
        summary.failed++;
        continue;
      }
      const data = await resp.json().catch(() => ({}));
      if (data?.messageId) {
        await admin.from("fa_teste_ebook_seq").update({ brevo_message_id: String(data.messageId) }).eq("lead_id", lead.id).eq("step", next.step);
      }
      summary.sent++;
    } catch (err) {
      console.error("guia-sequence: falha de rede", err instanceof Error ? err.message : err);
      await admin.from("fa_teste_ebook_seq").delete().eq("lead_id", lead.id).eq("step", next.step);
      summary.failed++;
    }
  }
  return summary;
}

async function unsubscribe(admin: ReturnType<typeof createClient>, leadId: string, sig: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(leadId) || !Deno.env.get("SEQ_SECRET")) return false;
  if (!safeEqual(await sign(leadId), sig)) return false;
  const { data: lead } = await admin.from("fa_leads_teste_comportamento").select("guardian_email").eq("id", leadId).maybeSingle();
  const email = (lead?.guardian_email ?? "").trim().toLowerCase();
  if (!email) return false;
  await admin.from("fa_leads_teste_comportamento")
    .update({ marketing_opt_in: false, ebook_seq_stopped_at: new Date().toISOString(), ebook_seq_stop_reason: "unsubscribed" })
    .ilike("guardian_email", email);
  const lid = listId();
  if (lid) {
    await fetch(`https://api.brevo.com/v3/contacts/lists/${lid}/contacts/remove`, {
      method: "POST",
      headers: brevoHeaders(),
      body: JSON.stringify({ emails: [email] }),
    }).catch(() => null);
  }
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  const url = new URL(req.url);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json(req, { error: "serviço indisponível" }, 500);
  const admin = createClient(supabaseUrl, serviceRoleKey);

  if (req.method !== "POST") {
    return new Response(`Para se descadastrar, use ${SITE}/descadastrar`, { status: 405, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  // Execução agendada (pg_cron). Idempotente: só envia o que já venceu e nunca duplica.
  // Exige o cabeçalho x-run-key (secret SEQ_RUN_KEY, o mesmo guardado no Vault para o cron); sem o secret, recusa.
  if (url.searchParams.get("run") === "1") {
    const runKey = Deno.env.get("SEQ_RUN_KEY") ?? "";
    if (!runKey || !safeEqual(req.headers.get("x-run-key") ?? "", runKey)) return json(req, { error: "não autorizado" }, 401);
    return json(req, await runBatch(admin, url.searchParams.get("dry") === "1"));
  }

  // Descadastro: parâmetros na URL (one-click do provedor de e-mail) ou no corpo JSON (página /descadastrar).
  let u = url.searchParams.get("u") ?? "";
  let s = url.searchParams.get("s") ?? "";
  if (!u || !s) {
    try {
      const body = await req.json();
      u = typeof body.u === "string" ? body.u : "";
      s = typeof body.s === "string" ? body.s : "";
    } catch { /* corpo vazio */ }
  }
  const ok = await unsubscribe(admin, u, s);
  return json(req, ok ? { ok: true } : { error: "link inválido" }, ok ? 200 : 400);
});
