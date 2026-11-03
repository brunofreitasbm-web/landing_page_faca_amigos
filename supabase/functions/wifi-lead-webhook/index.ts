// Recebe o cadastro do portal Wi-Fi do hotspot MikroTik hEX S instalado na
// clínica (Rua Boaventura da Silva, 1573 · Umarizal). Chamado por
// hotspot/login.html no instante em que a família libera a internet.
// Segue o mesmo padrão de behavior-test-webhook: Deno.serve simples,
// verify_jwt desligado (chamada vem do roteador, sem chave pública),
// CORS/JSON inline (deploy via MCP não resolve import relativo).
//
// NÃO emite cupom nem envia e-mail. Desde 02/11/2026 o cupom ESPERA-XXXX nasce só no Mural da Família
// (função wifi-mural-coupon), para quem já é cliente da clínica. Aqui fica apenas o registro do cadastro
// (consentimento, opt-ins, UTM e contagem de visitas), com coupon_* nulos.
//
// Falha de rede/gravação aqui NUNCA deve travar o acesso à internet do
// visitante: hotspot/login.html já ignora erros deste endpoint em silêncio
// e libera o Wi-Fi de qualquer forma. Esta função só perde o registro do
// lead nesse caso — não há tentativa de retry no cliente.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

// deno-lint-ignore no-explicit-any
type Admin = SupabaseClient<any, any, any, any, any>;

// O portal roda dentro do navegador do celular do visitante, servido pelo
// próprio roteador (sem HTTPS, sem domínio fixo) — por isso a allowlist de
// CORS aqui é mais permissiva que a de behavior-test-webhook. A superfície
// de risco é baixa: o endpoint só aceita os campos validados abaixo.
function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  return `55${digits}`;
}

function isValidPhone(digits: string): boolean {
  return /^55\d{10,11}$/.test(digits);
}

// Um cadastro por cliente a cada 30 dias, contados do cadastro anterior. Nesse intervalo o Wi-Fi libera
// normalmente e o cadastro existente só soma uma visita.
const REGISTRATION_INTERVAL_DAYS = 30;

// Celular brasileiro com e sem o 9º dígito é a mesma linha. Compara DDD + os 8 últimos dígitos
// ("55" + DDD + % + 8 dígitos casa com 12 e com 13 dígitos). Só tem dígitos, então o % é o único curinga.
function phonePattern(digits: string): string {
  const national = digits.slice(2);
  return `55${national.slice(0, 2)}%${national.slice(-8)}`;
}

// O roteador manda o MAC em "AA:BB:CC:DD:EE:FF". Se o marcador não foi trocado (aparece "$(mac)") ou vier vazio,
// todos os visitantes teriam o mesmo "MAC": nunca usar isso para reconhecer ninguém.
function isValidMac(mac: string): boolean {
  return /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(mac);
}

// Cadastro mais recente, dentro do intervalo, do mesmo cliente: mesmo telefone, mesmo e-mail ou mesmo aparelho.
// Três consultas com eq/like em vez de um .or(): o e-mail aceita vírgula e parêntese, que quebrariam o filtro.
async function findRecentLead(
  admin: Admin,
  params: { phoneDigits: string; emailKey: string; mac: string; sinceIso: string },
): Promise<{ id: string; visit_count: number | null } | null> {
  const base = () =>
    admin
      .from("fa_wifi_leads")
      .select("id, visit_count, created_at")
      .eq("source", "portal") // linhas do Mural (source = 'mural') não contam como cadastro do portal
      .gte("created_at", params.sinceIso)
      .order("created_at", { ascending: false })
      .limit(1);
  const results = await Promise.all([
    base().like("guardian_phone", phonePattern(params.phoneDigits)),
    base().eq("guardian_email", params.emailKey),
    ...(isValidMac(params.mac) ? [base().eq("mac", params.mac)] : []),
  ]);
  const rows: { id: string; visit_count: number | null; created_at: string }[] = [];
  for (const r of results) {
    if (r.error) console.error("Erro ao procurar cadastro recente do Wi-Fi:", r.error.message);
    else rows.push(...((r.data ?? []) as typeof rows));
  }
  rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return rows[0] ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "corpo inválido" }, 400);
  }

  // Honeypot: campo invisível no formulário. Humano nunca preenche.
  if (str(body["website-hp"])) {
    return jsonResponse({ ok: true });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes");
    return jsonResponse({ error: "serviço indisponível" }, 500);
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const guardianName = str(body.guardian_name);
  const guardianEmail = str(body.guardian_email);
  const guardianPhoneRaw = str(body.guardian_phone);
  const mac = str(body.mac).toLowerCase();
  const optInWhatsapp = body.marketing_opt_in_whatsapp === true;
  const optInEmail = body.marketing_opt_in_email === true;
  const utmSource = str(body.utm_source) || "wifi";
  const utmMedium = str(body.utm_medium) || "captive_portal";
  const utmCampaign = str(body.utm_campaign) || "clinica_fatima";
  const landingPage = str(body.landing_page) || "hotspot/login.html";

  if (guardianName.length < 2) {
    return jsonResponse({ error: "nome é obrigatório" }, 400);
  }
  if (!EMAIL_RE.test(guardianEmail)) {
    return jsonResponse({ error: "e-mail inválido" }, 400);
  }
  const guardianPhone = normalizePhone(guardianPhoneRaw);
  if (!isValidPhone(guardianPhone)) {
    return jsonResponse({ error: "WhatsApp inválido" }, 400);
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  const userAgent = req.headers.get("user-agent") || "";

  // Rate limit simples: máx. 20 cadastros por IP na última hora (sala de
  // espera é tráfego concentrado num único IP público — limite mais alto
  // que o de /teste, que é tráfego residencial disperso).
  if (ip) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("fa_wifi_leads")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("created_at", oneHourAgo);
    if ((count ?? 0) >= 20) {
      return jsonResponse({ error: "muitas tentativas, tente novamente mais tarde" }, 429);
    }
  }

  // Um cadastro por cliente a cada 30 dias. Quem já se cadastrou (mesmo telefone, e-mail ou aparelho) só soma uma
  // visita. A resposta é igual à de um cadastro novo, para ninguém descobrir, digitando um telefone ou e-mail,
  // se aquela pessoa já usou o Wi-Fi da clínica.
  const emailKey = guardianEmail.toLowerCase();
  const recent = await findRecentLead(admin, {
    phoneDigits: guardianPhone,
    emailKey,
    mac,
    sinceIso: new Date(Date.now() - REGISTRATION_INTERVAL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  });
  if (recent) {
    await admin
      .from("fa_wifi_leads")
      .update({ visit_count: (recent.visit_count ?? 1) + 1 })
      .eq("id", recent.id);
    return jsonResponse({ ok: true });
  }

  const { error } = await admin.from("fa_wifi_leads").insert({
    guardian_name: guardianName,
    guardian_phone: guardianPhone,
    guardian_email: emailKey,
    mac: isValidMac(mac) ? mac : null,
    // Sem cupom: coupon_code, coupon_status e coupon_expires_at ficam nulos. Quem emite é o Mural.
    coupon_status: null,
    consent_at: str(body.consent_at) || new Date().toISOString(),
    marketing_opt_in_whatsapp: optInWhatsapp,
    marketing_opt_in_email: optInEmail,
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: utmCampaign,
    landing_page: landingPage,
    ip: ip || null,
    user_agent: userAgent || null,
  });
  if (error) {
    console.error("Erro ao gravar lead do Wi-Fi:", error);
    return jsonResponse({ error: "falha ao registrar cadastro" }, 500);
  }

  return jsonResponse({ ok: true });
});
