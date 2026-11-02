// Fatos públicos do app dos quiosques (Playground e Circuito), para o site e para IAs nunca mais
// divergirem do que é cobrado de verdade. Único endpoint de fatos GEO — servido publicamente, em
// cache, sem dado pessoal nenhum (nunca lê guardians, children, sessions, pre_checkins).
//
// GET público, sem autenticação (é a mesma informação que já está nas páginas do site).
// Consumido por: scripts/geo-build.mjs (gera geo-facts.json + regiões geo:* do HTML + llms*.txt)
//                fa-health (seção "GEO": compara o que o site publicou com o que o quiosque cobra hoje)
//
// Regra de desconto (decidida com o usuário em 27/09/2026): o preço de tabela (fa_kiosk_plans /
// fa_kiosk_packages) tem um desconto automático aplicado no caixa via cupom percentual sem
// allowed_plan_id: hoje "40% PROMOCIONAL" para o público geral e "50% MEIA" (description
// "INCLUSIVO") para crianças neurodivergentes com laudo/CIPTEA. Cupons de fidelidade por estrelas
// (allowed_plan_id preenchido) e cupons de campanha (MINUTOS_EXTRA etc.) NÃO entram aqui.
//
// Secrets: nenhum além dos já injetados por padrão (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).

import { createClient } from "jsr:@supabase/supabase-js@2";

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      ...corsHeaders(),
    },
  });
}

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

// Metadados fixos por unidade enquanto fa_kiosk_units não tem latitude/longitude/slug preenchidos.
// unit_id -> { slug, city, state, postalCode, complement, lat, lng }
const UNIT_META: Record<string, { slug: string; city: string; state: string; street: string; postalCode: string; complement: string; lat: number | null; lng: number | null; sundayOpen?: string; sundayClose?: string }> = {
  "11111111-1111-1111-1111-111111111111": {
    slug: "playground-parque",
    city: "Belém",
    state: "PA",
    street: "Rod. Augusto Montenegro, 4300",
    postalCode: "66635-110",
    complement: "Parque Shopping Belém, 1º piso",
    lat: -1.3653,
    lng: -48.4552,
    sundayOpen: "12:00",
    sundayClose: "21:00",
  },
  "e43ba7a8-bd5f-47ad-b81d-dae7ea19d504": {
    slug: "circuito-parque",
    city: "Belém",
    state: "PA",
    street: "Rod. Augusto Montenegro, 4300",
    postalCode: "66635-110",
    complement: "Parque Shopping Belém, Térreo, em frente à C&A",
    lat: -1.3653,
    lng: -48.4552,
    sundayOpen: "12:00",
    sundayClose: "21:00",
  },
  "5fc99a57-81ee-4232-a105-1fcb4634cef4": {
    slug: "playground-bosque",
    city: "Belém",
    state: "PA",
    street: "Av. Centenário, 1052",
    postalCode: "66635-894",
    complement: "Shopping Bosque Grão-Pará",
    lat: -1.3912,
    lng: -48.4636,
    // Nos shoppings, aos domingos abre às 12h e fecha às 21h (vale para todas as unidades);
    // fa_kiosk_app_settings só guarda um closing_time por unidade, por isso o domingo fica aqui.
    sundayOpen: "12:00",
    sundayClose: "21:00",
  },
};

const OPEN_TIME = "10:00";
// closing_time em fa_kiosk_app_settings inclui uma tolerância operacional (ex.: "22:10"); o horário
// divulgado ao público é sempre a hora cheia.
function publicCloseTime(raw: string | null): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(raw ?? "");
  return m ? `${m[1].padStart(2, "0")}:00` : "22:00";
}

function centsToBrl(cents: number | null | undefined): number | null {
  return typeof cents === "number" ? Math.round(cents) / 100 : null;
}

function applyDiscountCents(listCents: number, pct: number | null): number | null {
  if (pct == null) return null;
  return Math.round(listCents * (1 - pct / 100)) / 100;
}

function durationMinutes(value: number, unit: string): number {
  return unit === "HORA" ? value * 60 : value;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
  if (req.method !== "GET") return jsonResponse({ error: "método não suportado" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ error: "serviço indisponível" }, 500);
  const admin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const [unitsQ, plansQ, packagesQ, couponsQ, loyaltyQ, settingsQ] = await Promise.all([
      admin.from("fa_kiosk_units").select("id, name, kind"),
      admin.from("fa_kiosk_plans").select("id, unit_id, activity, name, value_cents, duration_value, duration_unit, overage_cents_per_minute, asset_kind").eq("active", true),
      admin.from("fa_kiosk_packages").select("id, unit_id, activity, name, price_cents, included_minutes, validity_days").eq("active", true),
      admin.from("fa_kiosk_coupons").select("unit_id, code, kind, value, description, allowed_plan_id").eq("active", true).eq("kind", "DESCONTO_PCT").is("allowed_plan_id", null),
      admin.from("fa_kiosk_loyalty_rules").select("unit_id, activity, trigger_visits, reward_kind, reward_value").eq("active", true),
      admin.from("fa_kiosk_app_settings").select("unit_id, key, value").eq("key", "closing_time"),
    ]);
    for (const [nome, q] of [["units", unitsQ], ["plans", plansQ], ["packages", packagesQ], ["coupons", couponsQ], ["loyalty", loyaltyQ], ["settings", settingsQ]] as const) {
      if (q.error) return jsonResponse({ error: `falha ao consultar ${nome}: ${q.error.message}` }, 500);
    }

    const plans = (plansQ.data ?? []) as Row[];
    const packages = (packagesQ.data ?? []) as Row[];
    const coupons = (couponsQ.data ?? []) as Row[];
    const loyalty = (loyaltyQ.data ?? []) as Row[];
    const settings = (settingsQ.data ?? []) as Row[];

    // Desconto automático por unidade: maior % sem descrição "INCLUSIVO" = geral; com "INCLUSIVO" = inclusivo.
    const discountsByUnit = new Map<string, { geral: number | null; inclusivo: number | null }>();
    for (const c of coupons) {
      const cur = discountsByUnit.get(c.unit_id) ?? { geral: null, inclusivo: null };
      const isInclusivo = /inclusivo/i.test(c.description ?? "");
      if (isInclusivo) cur.inclusivo = Math.max(cur.inclusivo ?? 0, c.value);
      else cur.geral = Math.max(cur.geral ?? 0, c.value);
      discountsByUnit.set(c.unit_id, cur);
    }

    const closingByUnit = new Map<string, string>();
    for (const s of settings) closingByUnit.set(s.unit_id, publicCloseTime(s.value));

    const units = ((unitsQ.data ?? []) as Row[]).map((u) => {
      const meta = UNIT_META[u.id] ?? { slug: u.id, city: "Belém", state: "PA", street: "", postalCode: "", complement: "", lat: null, lng: null };
      const disc = discountsByUnit.get(u.id) ?? { geral: null, inclusivo: null };
      const unitPlans = plans.filter((p) => p.unit_id === u.id);
      const unitPackages = packages.filter((p) => p.unit_id === u.id);
      const unitLoyalty = loyalty.find((l) => l.unit_id === u.id) ?? null;

      return {
        id: u.id,
        slug: meta.slug,
        name: u.name,
        kind: u.kind,
        status: unitPlans.length > 0 ? "aberto" : "em_breve",
        address: {
          street: meta.street,
          complement: meta.complement,
          city: meta.city,
          state: meta.state,
          postal_code: meta.postalCode,
        },
        geo: { lat: meta.lat, lng: meta.lng },
        timezone: "America/Belem",
        hours: meta.sundayClose
          ? { open: OPEN_TIME, close: closingByUnit.get(u.id) ?? "22:00", days: "segunda a sábado", sunday: { open: meta.sundayOpen ?? OPEN_TIME, close: meta.sundayClose } }
          : { open: OPEN_TIME, close: closingByUnit.get(u.id) ?? "22:00", days: "todos os dias" },
        discounts: { geral_pct: disc.geral, inclusivo_pct: disc.inclusivo },
        plans: unitPlans.map((p) => ({
          id: p.id,
          activity: p.activity,
          name: p.name,
          asset_kind: p.asset_kind,
          duration_min: durationMinutes(p.duration_value, p.duration_unit),
          list_brl: centsToBrl(p.value_cents),
          price_brl: applyDiscountCents(p.value_cents, disc.geral) ?? centsToBrl(p.value_cents),
          inclusive_brl: applyDiscountCents(p.value_cents, disc.inclusivo),
          overage_list_brl: centsToBrl(p.overage_cents_per_minute),
          overage_brl: applyDiscountCents(p.overage_cents_per_minute, disc.geral) ?? centsToBrl(p.overage_cents_per_minute),
          overage_inclusive_brl: applyDiscountCents(p.overage_cents_per_minute, disc.inclusivo),
        })),
        packages: unitPackages.map((p) => ({
          id: p.id,
          activity: p.activity,
          name: p.name,
          included_minutes: p.included_minutes,
          validity_days: p.validity_days,
          list_brl: centsToBrl(p.price_cents),
          price_brl: applyDiscountCents(p.price_cents, disc.geral) ?? centsToBrl(p.price_cents),
          inclusive_brl: applyDiscountCents(p.price_cents, disc.inclusivo),
        })),
        loyalty: unitLoyalty ? { trigger_visits: unitLoyalty.trigger_visits, reward: unitLoyalty.reward_kind } : null,
      };
    });

    return jsonResponse({ version: 1, generated_at: new Date().toISOString(), units });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : "erro desconhecido" }, 500);
  }
});
