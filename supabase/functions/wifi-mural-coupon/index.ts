// Emite (ou devolve) o cupom ESPERA-XXXX de um responsável do Mural da Família (app da Clínica).
// Chamada SOMENTE pelo servidor do Mural, com a service role deste projeto (verify_jwt ligado: sem JWT válido
// o gateway recusa). Nunca chamar do navegador.
//
// Dois tipos (body.kind):
//  - "mural" (padrão): cupom ESPERA-XXXX, regras abaixo.
//  - "boas_vindas": cupom BEMVINDO-XXXX do 1º acesso ao Portal. 1 por responsável (para sempre), vale 15 dias,
//    uso único, só de segunda a quinta (a trava de dia fica no trigger do caixa), no Playground OU no Circuito:
//    Playground ganha +30 min na compra de 30 min; Circuito ganha +10 min no passeio.
// Os dois tipos não se misturam: com um cupom ativo (emitido, não usado, não vencido) o outro não é emitido e
// a resposta devolve o ativo (campo kind diz qual é).
//
// Regras do ESPERA- (as mesmas do Wi-Fi): 1 cupom por responsável a cada 30 dias, contados da emissão; vale 15 dias;
// um benefício por cupom (Circuito +5 min, ou meia inclusiva R$ 50 no Playground do Parque Shopping ou do
// Grão-Pará). Não envia e-mail. Os três cupons do caixa nascem com o mesmo código, como em wifi-lead-webhook.
// (Duplicado de wifi-lead-webhook de propósito: deploy via MCP não resolve import relativo.)

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

// deno-lint-ignore no-explicit-any
type Admin = SupabaseClient<any, any, any, any, any>;

const COUPON_VALIDITY_DAYS = 15;
const COUPON_INTERVAL_DAYS = 30;
const CIRCUITO_UNIT_ID = "e43ba7a8-bd5f-47ad-b81d-dae7ea19d504";
const PLAYGROUND_UNIT_ID = "11111111-1111-1111-1111-111111111111";
const GRAOPARA_UNIT_ID = "5fc99a57-81ee-4232-a105-1fcb4634cef4";
// Benefício do cupom de boas-vindas. Se o caixa do Playground não aplicar MINUTOS_EXTRA, trocar o Playground
// para { kind: "DESCONTO_PCT", value: 30, label: "30% Playground" }.
const BV_CIRCUITO = { kind: "MINUTOS_EXTRA", value: 10, label: "+10 min Circuito" } as const;
const BV_PLAYGROUND = { kind: "MINUTOS_EXTRA", value: 30, label: "+30 min Playground" } as const;
type CouponKind = "mural" | "boas_vindas";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function generateCouponCode(prefix = "ESPERA"): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${prefix}-${code}`;
}
function normalizePhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  return d.startsWith("55") && d.length >= 12 ? d : `55${d}`;
}

async function syncKioskCoupon(
  admin: Admin,
  p: { code: string; name: string; unitId: string; kind: "MINUTOS_EXTRA" | "DESCONTO_PCT"; value: number; label: string; expiresAtMs: number; origin?: string },
): Promise<string | null> {
  const { error } = await admin.from("fa_kiosk_coupons").insert({
    unit_id: p.unitId,
    code: p.code,
    kind: p.kind,
    value: p.value,
    max_uses: 1,
    expires_at_ms: p.expiresAtMs,
    description: `${p.origin ?? "Mural da Família"} (${p.label}) — ${p.name}`,
  });
  return error ? (error.message ?? "erro desconhecido") : null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "corpo inválido" }, 400);
  }

  const couponKind: CouponKind = body.kind === "boas_vindas" ? "boas_vindas" : "mural";
  const guardianId = str(body.guardian_id);
  const name = str(body.guardian_name);
  const email = str(body.guardian_email).toLowerCase();
  const phone = normalizePhone(str(body.guardian_phone));
  if (!UUID_RE.test(guardianId)) return json({ error: "guardian_id inválido" }, 400);
  if (name.length < 2) return json({ error: "nome é obrigatório" }, 400);
  if (!/^55\d{10,11}$/.test(phone)) return json({ error: "telefone inválido" }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "e-mail inválido" }, 400);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "serviço indisponível" }, 500);

  // Só o servidor do Mural chama, com a chave de serviço DESTE projeto. O gateway
  // (verify_jwt) aceita também a chave anon, que é pública: sem esta checagem
  // qualquer pessoa emitia cupons de meia entrada. A prova é uma operação de
  // admin feita com a própria chave recebida — vale para a chave legada (JWT) e
  // para a nova (sb_secret_...).
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!bearer) return json({ error: "não autorizado" }, 401);
  if (bearer !== key) {
    const probe = createClient(url, bearer, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: probeErr } = await probe.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (probeErr) return json({ error: "não autorizado" }, 403);
  }

  const admin = createClient(url, key);

  type LeadRow = { coupon_code: string; coupon_status: string; coupon_expires_at: string; created_at: string; source: string };
  const view = (r: LeadRow) => {
    const expired = new Date(r.coupon_expires_at).getTime() < Date.now();
    const status = r.coupon_status === "redeemed" ? "redeemed" : expired ? "expired" : "issued";
    const kind: CouponKind = r.source === "boas_vindas" ? "boas_vindas" : "mural";
    return { status, kind };
  };
  const { data: rows, error: findErr } = await admin
    .from("fa_wifi_leads")
    .select("coupon_code, coupon_status, coupon_expires_at, created_at, source")
    .eq("mural_guardian_id", guardianId)
    .in("source", ["mural", "boas_vindas"])
    .order("created_at", { ascending: false })
    .limit(20);
  if (findErr) {
    console.error("wifi-mural-coupon: consulta falhou:", findErr.message);
    return json({ error: "falha ao consultar" }, 500);
  }
  const all = (rows ?? []) as LeadRow[];
  const respond = (r: LeadRow) => {
    const { status, kind } = view(r);
    const nextAt = new Date(new Date(r.created_at).getTime() + COUPON_INTERVAL_DAYS * 24 * 3600 * 1000);
    return json({ ok: true, code: r.coupon_code, status, kind, expires_at: r.coupon_expires_at, next_coupon_at: nextAt.toISOString() });
  };

  // Um cupom ativo por responsável: se o OUTRO tipo está ativo (emitido, não usado, não vencido), devolve ele.
  const activeOther = all.find((r) => view(r).kind !== couponKind && view(r).status === "issued");
  if (activeOther) return respond(activeOther);

  if (couponKind === "boas_vindas") {
    // 1 por responsável, para sempre (índice único parcial garante também no banco).
    const own = all.find((r) => view(r).kind === "boas_vindas");
    if (own) return respond(own);
  } else {
    // Idempotente: já emitiu nos últimos 30 dias? Devolve o mesmo cupom (recarregar o Mural não gera outro).
    const since = Date.now() - COUPON_INTERVAL_DAYS * 24 * 3600 * 1000;
    const recent = all.find((r) => view(r).kind === "mural" && new Date(r.created_at).getTime() >= since);
    if (recent) return respond(recent);
  }

  // peek: só consulta (o Mural mostra o cartão sem gerar cupom a cada abertura da página).
  if (body.peek === true) return json({ ok: true, status: "none", kind: couponKind });

  const prefix = couponKind === "boas_vindas" ? "BEMVINDO" : "ESPERA";
  const expiresAt = new Date(Date.now() + COUPON_VALIDITY_DAYS * 24 * 3600 * 1000);
  let code = generateCouponCode(prefix);
  let leadId: string | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await admin
      .from("fa_wifi_leads")
      .insert({
        guardian_name: name,
        guardian_phone: phone,
        guardian_email: email,
        coupon_code: code,
        coupon_status: "issued",
        coupon_expires_at: expiresAt.toISOString(),
        consent_at: new Date().toISOString(),
        mural_guardian_id: guardianId,
        source: couponKind === "boas_vindas" ? "boas_vindas" : "mural",
        utm_source: "mural",
        utm_medium: "portal_responsavel",
        utm_campaign: couponKind === "boas_vindas" ? "cupom_boas_vindas" : "wifi_cupom",
        landing_page: "mural/familia",
      })
      .select("id")
      .single();
    if (!error && data) { leadId = data.id; break; }
    if (error?.code === "23505" && couponKind === "boas_vindas") {
      // Corrida: outra chamada emitiu o cupom de boas-vindas deste responsável agora. Devolve o dele.
      const { data: raced } = await admin
        .from("fa_wifi_leads")
        .select("coupon_code, coupon_status, coupon_expires_at, created_at, source")
        .eq("mural_guardian_id", guardianId)
        .eq("source", "boas_vindas")
        .maybeSingle();
      if (raced) return respond(raced as LeadRow);
    }
    if (error?.code !== "23505") {
      console.error("wifi-mural-coupon: gravação falhou:", error?.message);
      return json({ error: "falha ao emitir" }, 500);
    }
    code = generateCouponCode(prefix);
  }
  if (!leadId) return json({ error: "falha ao emitir" }, 500);

  const expiresAtMs = expiresAt.getTime();
  const bv = couponKind === "boas_vindas";
  const origin = bv ? "Boas-vindas Portal (1ª visita, seg a qui)" : undefined;
  const [kiosk, pg, grao] = await Promise.all([
    syncKioskCoupon(admin, { code, name, unitId: CIRCUITO_UNIT_ID, expiresAtMs, origin,
      ...(bv ? BV_CIRCUITO : { kind: "MINUTOS_EXTRA", value: 5, label: "+5 min Circuito" } as const) }),
    syncKioskCoupon(admin, { code, name, unitId: PLAYGROUND_UNIT_ID, expiresAtMs, origin,
      ...(bv ? BV_PLAYGROUND : { kind: "DESCONTO_PCT", value: 50, label: "meia inclusiva Playground" } as const) }),
    syncKioskCoupon(admin, { code, name, unitId: GRAOPARA_UNIT_ID, expiresAtMs, origin,
      ...(bv ? BV_PLAYGROUND : { kind: "DESCONTO_PCT", value: 50, label: "meia inclusiva Playground Grão-Pará" } as const) }),
  ]);
  const now = new Date().toISOString();
  await admin.from("fa_wifi_leads").update({
    ...(kiosk ? { kiosk_coupon_error: kiosk } : { kiosk_coupon_synced_at: now }),
    ...(pg ? { playground_coupon_error: pg } : { playground_coupon_synced_at: now }),
    ...(grao ? { graopara_coupon_error: grao } : { graopara_coupon_synced_at: now }),
  }).eq("id", leadId);
  if (kiosk || pg || grao) console.error("wifi-mural-coupon: sincronização parcial:", { kiosk, pg, grao });

  const nextAt = new Date(Date.now() + COUPON_INTERVAL_DAYS * 24 * 3600 * 1000);
  return json({ ok: true, code, status: "issued", kind: couponKind, expires_at: expiresAt.toISOString(), next_coupon_at: nextAt.toISOString() });
});
