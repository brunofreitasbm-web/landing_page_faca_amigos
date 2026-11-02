// Recebe o cadastro do portal Wi-Fi do hotspot MikroTik hEX S instalado na
// clínica (Rua Boaventura da Silva, 1573 · Umarizal). Chamado por
// hotspot/login.html no instante em que a família libera a internet.
// Segue o mesmo padrão de behavior-test-webhook: Deno.serve simples,
// verify_jwt desligado (chamada vem do roteador, sem chave pública),
// CORS/JSON inline (deploy via MCP não resolve import relativo).
//
// Gera um cupom nominal "ESPERA-XXXX" (um por cliente a cada 30 dias), grava o lead e dispara o e-mail via
// Brevo com o cupom — porque a janela do portal cativo fecha sozinha assim
// que o celular detecta internet, e o cupom não pode existir só na tela.
//
// Falha de rede/gravação aqui NUNCA deve travar o acesso à internet do
// visitante: hotspot/login.html já ignora erros deste endpoint em silêncio
// e libera o Wi-Fi de qualquer forma. Esta função só perde o registro do
// lead nesse caso — não há tentativa de retry no cliente.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

// deno-lint-ignore no-explicit-any
type Admin = SupabaseClient<any, any, any, any, any>;

const LOGO_URL = "https://institutofacaamigos.com.br/img/logo-simbolo.png";

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseSenderAddress(raw: string): { name?: string; email: string } {
  const match = raw.match(/^(.*)<(.+)>$/);
  if (match) {
    const name = match[1].trim().replace(/^"|"$/g, "");
    return { name: name || undefined, email: match[2].trim() };
  }
  return { email: raw.trim() };
}

function generateCouponCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem O/0/I/1 — evita confusão na leitura
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `ESPERA-${code}`;
}

const COUPON_VALIDITY_DAYS = 15;
// Cada cliente recebe um cupom a cada 30 dias, contados da emissão do cupom anterior (não do vencimento nem do uso).
// Nesse intervalo o Wi-Fi libera normalmente, mas não nasce cupom novo nem sai outro e-mail.
const COUPON_INTERVAL_DAYS = 30;

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
// Cadastro cujo e-mail falhou ao enviar não conta: a pessoa nunca recebeu o cupom e pode tentar de novo.
async function findRecentLead(
  admin: Admin,
  params: { phoneDigits: string; emailKey: string; mac: string; sinceIso: string },
): Promise<{ id: string; visit_count: number | null } | null> {
  const base = () =>
    admin
      .from("fa_wifi_leads")
      .select("id, visit_count, created_at")
      .gte("created_at", params.sinceIso)
      .is("email_error", null)
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

// Unidade "FaçaAmigos Circuito (Parque Shopping)" no banco do kiosk (mesmo
// projeto Supabase). Usada para criar o cupom nativo de +5 min — ver
// syncKioskCoupon() abaixo. Se a unidade for recriada algum dia, atualizar
// este id (confirmar com: select id from fa_kiosk_units where name ilike
// '%circuito%').
const CIRCUITO_UNIT_ID = "e43ba7a8-bd5f-47ad-b81d-dae7ea19d504";
const CIRCUITO_BONUS_MINUTES = 5;
// Unidade "FaçaAmigos Playground (Parque Shopping)": o cupom equivalente é a meia inclusiva
// (DESCONTO_PCT 50, o mesmo tipo do cupom "50% MEIA" que o caixa já usa). Confirmar com:
// select id from fa_kiosk_units where name ilike '%playground (parque%'.
const PLAYGROUND_UNIT_ID = "11111111-1111-1111-1111-111111111111";
const PLAYGROUND_DISCOUNT_PCT = 50;
// Unidade "Playground (Bosque Grão-Pará)": mesma meia inclusiva (DESCONTO_PCT 50) do Parque Shopping, no mesmo código.
// Confirmar com: select id from fa_kiosk_units where name ilike '%grão-pará%'.
const GRAOPARA_UNIT_ID = "5fc99a57-81ee-4232-a105-1fcb4634cef4";

// Cria, no MESMO código do cupom "ESPERA-XXXX", um cupom nativo do kiosk
// (fa_kiosk_coupons) com max_uses=1: +5 min no Circuito (MINUTOS_EXTRA) e meia
// inclusiva nos dois Playgrounds, Parque Shopping e Bosque Grão-Pará (DESCONTO_PCT 50).
// (Texto abaixo descreve o Circuito; os Playgrounds funcionam igual.) O check-in do
// Circuito já aceita p_coupon_code — ao digitar o código, o kiosk aplica os
// minutos extras e bloqueia qualquer segunda tentativa com o mesmo código,
// em qualquer unidade ou dia. Isso resolve o risco de a família reusar ou
// repassar o código adiante: o bloqueio é feito pelo próprio banco do
// kiosk, não depende do atendente lembrar de checar nada.
//
// Best-effort: se isso falhar, o cadastro do Wi-Fi e o e-mail do cupom
// seguem normalmente — só o benefício automático no Circuito fica
// indisponível (o atendente ainda pode aplicar manualmente).
async function syncKioskCoupon(
  admin: Admin,
  params: { couponCode: string; guardianName: string; unitId: string; kind: "MINUTOS_EXTRA" | "DESCONTO_PCT"; value: number; label: string; expiresAtMs: number },
): Promise<{ synced: boolean; error?: string }> {
  const { error } = await admin.from("fa_kiosk_coupons").insert({
    unit_id: params.unitId,
    code: params.couponCode,
    kind: params.kind,
    value: params.value,
    max_uses: 1,
    // Validade própria no caixa: o gatilho fa_kiosk_coupons_validade recusa o uso depois deste instante.
    expires_at_ms: params.expiresAtMs,
    description: `Wi-Fi da clínica (${params.label}) — ${params.guardianName}`,
  });
  if (error) return { synced: false, error: error.message ?? "erro desconhecido" };
  return { synced: true };
}

async function sendCouponEmail(params: {
  guardianName: string;
  guardianEmail: string;
  couponCode: string;
  couponExpiresAt: Date;
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  const fromRaw = Deno.env.get("BREVO_FROM") ?? "Instituto Faça Amigos <nao-responder@institutofacaamigos.com.br>";
  const replyTo = Deno.env.get("BREVO_REPLY_TO");
  if (!apiKey) return { sent: false, error: "BREVO_API_KEY não configurada" };

  const expiresLabel = params.couponExpiresAt.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const siteUrl = "https://institutofacaamigos.com.br/playground?utm_source=wifi&amp;utm_medium=email&amp;utm_campaign=clinica_fatima&amp;utm_content=cupom";
  const mapaParque = "https://maps.google.com/?q=Parque+Shopping+Bel%C3%A9m";
  const mapaGraoPara =
    "https://www.google.com/maps/dir/?api=1&amp;destination=Shopping+Bosque+Gr%C3%A3o-Par%C3%A1%2C+Av.+Centen%C3%A1rio%2C+1052%2C+Bel%C3%A9m+PA&amp;travelmode=driving";
  // Um cartão por lugar onde o cupom vale. Endereços e horários espelham o site (assets/fa-footer.js e playground.html).
  const lugar = (tag: string, nome: string, linhas: string[], mapa: string) => `
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#FFF9F1;border:1px solid #E7DFC9;border-radius:12px;margin:0 0 10px 0;">
            <tr><td style="padding:14px 16px;">
              <span style="display:inline-block;background:#FFE234;color:#1A3F35;font-family:Arial,sans-serif;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;padding:3px 8px;border-radius:9999px;">${tag}</span>
              <div style="font-family:Arial,sans-serif;font-size:15px;font-weight:800;color:#1A3F35;margin:6px 0 4px 0;">${nome}</div>
              ${linhas.map((l) => `<div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.55;color:#3A4258;">${l}</div>`).join("")}
              <div style="margin-top:8px;"><a href="${mapa}" style="font-family:Arial,sans-serif;font-size:13px;font-weight:800;color:#f0196b;text-decoration:underline;">Como chegar</a></div>
            </td></tr>
          </table>`;
  const lugares = [
    lugar("Playground", "Parque Shopping Belém", [
      "Rod. Augusto Montenegro, 4300 · 1º piso",
      "Segunda a sábado, das 10h às 22h · Domingo, das 12h às 21h",
      "Piscina de bolinhas gigante, casa na árvore, cantinho de leitura, mediadores especializados e espaço sensorial completo.",
    ], mapaParque),
    lugar("Playground", "Shopping Bosque Grão-Pará", [
      "Av. Centenário, 1052 · Val-de-Cans · 1º piso, em frente à Renner",
      "Segunda a sábado, das 10h às 22h · Domingo, das 12h às 21h",
      "Mesmos preços, mesma equipe qualificada e os mesmos atrativos inclusivos do Parque Shopping. Sem agendamento: é só chegar.",
    ], mapaGraoPara),
    lugar("Circuito", "Parque Shopping Belém", [
      "Rod. Augusto Montenegro, 4300 · Térreo, em frente à C&A",
      "Segunda a sábado, das 10h às 22h · Domingo, das 12h às 21h",
      "Carrinhos elétricos a R$ 48 o passeio. Seu filho dirige, você acompanha de pertinho.",
    ], mapaParque),
  ].join("");

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#FFF9F1;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#FFF9F1;padding:24px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;width:100%;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E7DFC9;">
        <tr><td style="background:#FFFFFF;padding:18px 32px 10px 32px;text-align:center;">
          <img src="${LOGO_URL}" alt="Instituto Faça Amigos" width="36" height="36" style="display:inline-block;vertical-align:middle;margin-right:8px;">
          <span style="font-family:Arial,sans-serif;font-size:15px;font-weight:800;color:#1A3F35;vertical-align:middle;">Faça<span style="color:#f0196b;">Amigos</span></span>
        </td></tr>
        <tr><td style="background:linear-gradient(135deg,#f0196b 0%,#c8155a 100%);padding:24px 32px;text-align:center;">
          <h1 style="margin:0;font-family:Arial,sans-serif;font-size:20px;color:#fff;">Seu cupom da sala de espera chegou!</h1>
        </td></tr>
        <tr><td style="padding:28px 32px 8px 32px;">
          <p style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#3A4258;margin:0 0 16px 0;">Olá, ${escapeHtml(params.guardianName)}! Obrigado por se conectar ao Wi-Fi da clínica FaçaAmigos.</p>
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#FFF9F1;border:2px dashed #2ECFB5;border-radius:14px;margin-bottom:18px;">
            <tr><td style="padding:18px;text-align:center;">
              <div style="font-family:Arial,sans-serif;font-size:12px;color:#4C6B62;font-weight:700;text-transform:uppercase;letter-spacing:.05em;">Seu código</div>
              <div style="font-family:'Courier New',monospace;font-size:26px;font-weight:900;color:#1A3F35;letter-spacing:.05em;margin:6px 0;">${escapeHtml(params.couponCode)}</div>
              <div style="font-family:Arial,sans-serif;font-size:12px;color:#4C6B62;">Válido até ${expiresLabel}</div>
            </tr></td>
          </table>
          <p style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#3A4258;margin:0 0 6px 0;font-weight:800;">Apresente o código na recepção e escolha <strong>um</strong> destes benefícios:</p>
          <ul style="font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#3A4258;margin:0 0 8px 0;padding-left:20px;">
            <li><strong>Meia inclusiva no Playground:</strong> R$ 50 nos 30 minutos, contra R$ 60 do público geral, para crianças com laudo ou CIPTEA. Vale todos os dias, no Parque Shopping ou no Shopping Bosque Grão-Pará.</li>
            <li><strong>+5 minutos adicionais grátis no Circuito</strong>, em qualquer plano, de segunda a sexta.</li>
          </ul>
          <p style="font-family:Arial,sans-serif;font-size:12px;line-height:1.5;color:#8791A6;margin:0 0 22px 0;font-style:italic;">Cada cupom vale um único benefício, em um único lugar: Playground do Parque Shopping, Playground do Grão-Pará ou Circuito. Cada cliente recebe um cupom a cada 30 dias.</p>
          <p style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#3A4258;margin:0 0 10px 0;font-weight:800;">Onde usar</p>${lugares}
          <div style="text-align:center;margin:18px 0 8px 0;">
            <a href="${siteUrl}" style="display:inline-block;background:#f0196b;color:#fff;font-weight:800;text-decoration:none;padding:14px 26px;border-radius:9999px;font-size:15px;">Conhecer o Playground</a>
          </div>
        </td></tr>
        <tr><td style="padding:8px 32px 28px 32px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">Você recebeu este e-mail porque se conectou ao Wi-Fi da clínica FaçaAmigos e autorizou o contato.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  try {
    const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        sender: parseSenderAddress(fromRaw),
        to: [{ email: params.guardianEmail, name: params.guardianName }],
        subject: `Seu cupom ESPERA (${params.couponCode}) — Instituto Faça Amigos`,
        htmlContent: html,
        ...(replyTo ? { replyTo: parseSenderAddress(replyTo) } : {}),
      }),
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => null);
      return { sent: false, error: data?.message || `Erro HTTP ${resp.status}` };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : "erro desconhecido" };
  }
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

  // Um cupom por cliente a cada 30 dias. Quem já recebeu (mesmo telefone, e-mail ou aparelho) só soma uma visita:
  // o Wi-Fi libera, mas não nasce cupom, cupom no caixa nem e-mail. A resposta é igual à de um cadastro novo, para
  // ninguém descobrir, digitando um telefone ou e-mail, se aquela pessoa já usou o Wi-Fi da clínica.
  const emailKey = guardianEmail.toLowerCase();
  const recent = await findRecentLead(admin, {
    phoneDigits: guardianPhone,
    emailKey,
    mac,
    sinceIso: new Date(Date.now() - COUPON_INTERVAL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  });
  if (recent) {
    await admin
      .from("fa_wifi_leads")
      .update({ visit_count: (recent.visit_count ?? 1) + 1 })
      .eq("id", recent.id);
    return jsonResponse({ ok: true });
  }

  const couponExpiresAt = new Date(Date.now() + COUPON_VALIDITY_DAYS * 24 * 60 * 60 * 1000);

  // Código de 4 caracteres tem colisão possível (unique em coupon_code): gera outro e tenta de novo.
  let couponCode = generateCouponCode();
  let data: { id: string } | null = null;
  let error: { code?: string } | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    ({ data, error } = await admin
      .from("fa_wifi_leads")
      .insert({
        guardian_name: guardianName,
        guardian_phone: guardianPhone,
        guardian_email: emailKey,
        mac: isValidMac(mac) ? mac : null,
        coupon_code: couponCode,
        coupon_status: "issued",
        coupon_expires_at: couponExpiresAt.toISOString(),
        consent_at: str(body.consent_at) || new Date().toISOString(),
        marketing_opt_in_whatsapp: optInWhatsapp,
        marketing_opt_in_email: optInEmail,
        utm_source: utmSource,
        utm_medium: utmMedium,
        utm_campaign: utmCampaign,
        landing_page: landingPage,
        ip: ip || null,
        user_agent: userAgent || null,
      })
      .select("id")
      .single());
    if (!error || error.code !== "23505") break;
    couponCode = generateCouponCode();
  }

  if (error || !data) {
    console.error("Erro ao gravar lead do Wi-Fi:", error);
    return jsonResponse({ error: "falha ao registrar cadastro" }, 500);
  }

  // Sincroniza o cupom no kiosk (best-effort: nunca falha o cadastro).
  // Aguardamos aqui — em edge functions, uma promise não aguardada pode ser
  // cancelada assim que a resposta é enviada, então "dispara e esquece" não
  // é seguro neste ambiente.
  const onError = (err: unknown) => ({
    synced: false,
    error: err instanceof Error ? err.message : "erro desconhecido",
  });
  const kioskResult = await syncKioskCoupon(admin, {
    couponCode,
    guardianName,
    unitId: CIRCUITO_UNIT_ID,
    kind: "MINUTOS_EXTRA",
    value: CIRCUITO_BONUS_MINUTES,
    label: "+5 min Circuito",
    expiresAtMs: couponExpiresAt.getTime(),
  }).catch(onError);
  if (!kioskResult.synced) {
    console.error("Erro ao sincronizar cupom no kiosk:", kioskResult.error);
  }
  // Mesmo código no Playground (meia inclusiva). Falha aqui também não derruba o cadastro.
  const playgroundResult = await syncKioskCoupon(admin, {
    couponCode,
    guardianName,
    unitId: PLAYGROUND_UNIT_ID,
    kind: "DESCONTO_PCT",
    value: PLAYGROUND_DISCOUNT_PCT,
    label: "meia inclusiva Playground",
    expiresAtMs: couponExpiresAt.getTime(),
  }).catch(onError);
  if (!playgroundResult.synced) {
    console.error("Erro ao sincronizar cupom do Playground no kiosk:", playgroundResult.error);
  }
  // Mesmo código no Playground do Grão-Pará. Falha aqui também não derruba o cadastro.
  const graoparaResult = await syncKioskCoupon(admin, {
    couponCode,
    guardianName,
    unitId: GRAOPARA_UNIT_ID,
    kind: "DESCONTO_PCT",
    value: PLAYGROUND_DISCOUNT_PCT,
    label: "meia inclusiva Playground Grão-Pará",
    expiresAtMs: couponExpiresAt.getTime(),
  }).catch(onError);
  if (!graoparaResult.synced) {
    console.error("Erro ao sincronizar cupom do Grão-Pará no kiosk:", graoparaResult.error);
  }

  const emailResult = await sendCouponEmail({
    guardianName,
    guardianEmail,
    couponCode,
    couponExpiresAt,
  });

  await admin
    .from("fa_wifi_leads")
    .update({
      ...(emailResult.sent
        ? { email_sent_at: new Date().toISOString() }
        : { email_error: emailResult.error ?? "falha desconhecida" }),
      ...(kioskResult.synced
        ? { kiosk_coupon_synced_at: new Date().toISOString() }
        : { kiosk_coupon_error: kioskResult.error ?? "falha desconhecida" }),
      ...(playgroundResult.synced
        ? { playground_coupon_synced_at: new Date().toISOString() }
        : { playground_coupon_error: playgroundResult.error ?? "falha desconhecida" }),
      ...(graoparaResult.synced
        ? { graopara_coupon_synced_at: new Date().toISOString() }
        : { graopara_coupon_error: graoparaResult.error ?? "falha desconhecida" }),
    })
    .eq("id", data.id);

  return jsonResponse({ ok: true });
});
