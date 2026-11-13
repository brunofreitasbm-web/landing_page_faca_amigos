// Edge Function: playground-reviews
// Endpoint público de leitura e captação de NPS/avaliações do Playground FaçaAmigos.
//
// GET: Retorna as avaliações aprovadas para a landing page (playground.html e index.html),
//      com cache HTTP e sem expor dados sensíveis.
// POST: Webhook/API para o SISTEMA APP PLAYGROUND enviar novas respostas de NPS.
//       Gera o registro em fa_playground_reviews com moderação pendente (approved=false)
//       para aprovação no painel /admin.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

// deno-lint-ignore no-explicit-any
type Admin = SupabaseClient<any, any, any, any, any>;

const ALLOWED_ORIGINS = [
  "https://institutofacaamigos.com.br",
  "https://www.institutofacaamigos.com.br",
  "https://playground.institutofacaamigos.com.br",
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
];

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "content-type, authorization, x-ops-key",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
}

function jsonResponse(req: Request, body: unknown, status = 200, cacheSeconds = 0): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    ...corsHeaders(req),
  };
  if (cacheSeconds > 0) {
    headers["Cache-Control"] = `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds * 5}, stale-while-revalidate=86400`;
  } else {
    headers["Cache-Control"] = "no-store";
  }
  return new Response(JSON.stringify(body), { status, headers });
}

/** Remove marcação HTML e caracteres de controle de texto livre vindo de fora (vai para a home). */
function plain(v: unknown): string {
  return String(v ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    // deno-lint-ignore no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim();
}

/** Compara em tempo constante. */
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function formatMonthYear(d: Date = new Date()): string {
  const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${months[d.getMonth()]}/${d.getFullYear()}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes");
    return jsonResponse(req, { error: "serviço indisponível" }, 500);
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // -------------------------------------------------------------------------
  // GET: Lista de avaliações aprovadas para o site (Playground / Hub)
  // -------------------------------------------------------------------------
  if (req.method === "GET") {
    try {
      const { data, error } = await admin
        .from("fa_playground_reviews")
        .select("id, author_name, author_role, visit_count, rating, nps_score, comment, unit, source, visit_date, featured, created_at")
        .eq("approved", true)
        .order("featured", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) {
        console.error("Erro ao buscar avaliações aprovadas:", error);
        return jsonResponse(req, { error: "falha ao buscar avaliações" }, 500);
      }

      const reviews = (data ?? []).map((r) => {
        const nameParts = (r.author_name || "").trim().split(/\s+/);
        const firstName = nameParts[0] || "Cliente";
        const initial = firstName.charAt(0).toUpperCase();
        const visitCount = Number(r.visit_count) || 1;
        const visitLabel = r.author_role && r.author_role.includes("visita") ? r.author_role : `${visitCount}ª visita`;

        return {
          id: r.id,
          author_name: plain(r.author_name),
          author_first_name: plain(firstName),
          author_initial: plain(initial),
          author_role: plain(visitLabel),
          visit_count: visitCount,
          rating: Number(r.rating) || 5,
          nps_score: r.nps_score != null ? Number(r.nps_score) : null,
          comment: plain(r.comment),
          unit: plain(r.unit) || "Playground (Parque Shopping)",
          source: r.source || "app_nps",
          visit_date: plain(r.visit_date),
          featured: !!r.featured,
          created_at: r.created_at,
        };
      });

      const total = reviews.length;
      const avgRating = total > 0
        ? Number((reviews.reduce((acc, r) => acc + r.rating, 0) / total).toFixed(1))
        : 5.0;

      return jsonResponse(req, {
        reviews,
        stats: {
          total,
          average_rating: avgRating,
        },
      }, 200, 60); // cache de 60s no browser / 300s no edge
    } catch (err) {
      console.error("Exceção no GET reviews:", err);
      return jsonResponse(req, { error: "erro interno" }, 500);
    }
  }

  // -------------------------------------------------------------------------
  // POST: Captação de NPS pelo SISTEMA APP PLAYGROUND
  // -------------------------------------------------------------------------
  if (req.method === "POST") {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse(req, { error: "corpo JSON inválido" }, 400);
    }

    const authorName = str(body.author_name || body.nome || body.guardian_name);
    const comment = str(body.comment || body.comentario || body.feedback || body.depoimento);
    const rawNps = body.nps_score ?? body.nps ?? body.nota;
    const npsScore = rawNps !== undefined && rawNps !== null && rawNps !== "" ? Number(rawNps) : null;
    let rating = Number(body.rating || body.estrelas) || 0;
    const unit = str(body.unit || body.unidade) || "Playground (Parque Shopping)";
    const source = str(body.source || body.origem) || "app_nps";
    const rawVisits = body.visit_count ?? body.visitas ?? body.visits;
    const visitCount = rawVisits ? Math.max(1, Number(rawVisits) || 1) : 1;

    // Validações básicas
    if (!authorName || authorName.length < 2) {
      return jsonResponse(req, { error: "author_name é obrigatório (mínimo 2 caracteres)" }, 400);
    }
    if (!comment || comment.length < 3) {
      return jsonResponse(req, { error: "comment é obrigatório (mínimo 3 caracteres)" }, 400);
    }
    if (npsScore !== null && (isNaN(npsScore) || npsScore < 0 || npsScore > 10)) {
      return jsonResponse(req, { error: "nps_score deve ser entre 0 e 10" }, 400);
    }

    // Se estrelas não vierem explícitas, calcula pelas regras de NPS:
    // 9 ou 10 (Promotor) -> 5 estrelas
    // 7 ou 8 (Neutro)    -> 4 estrelas
    // <= 6 (Detrator)    -> 3 estrelas (raramente vai para o site)
    if (!rating) {
      if (npsScore !== null) {
        if (npsScore >= 9) rating = 5;
        else if (npsScore >= 7) rating = 4;
        else rating = 3;
      } else {
        rating = 5;
      }
    }
    rating = Math.max(1, Math.min(5, Math.round(rating)));

    // Regra de Auto-Aprovação (Opção A):
    // Se o cliente avaliou com NPS 9 ou 10 (Promotor) ou 5 estrelas, aprova na hora e publica no site!
    // Notas inferiores (neutros e detratores) ficam pendentes de moderação no admin.
    const opsKey = Deno.env.get("OPS_KEY");
    const reqOpsKey = req.headers.get("x-ops-key");
    const explicitOpsApprove = !!(opsKey && reqOpsKey && safeEqual(opsKey, reqOpsKey));
    const isPromoter = (npsScore !== null && npsScore >= 9) || (npsScore === null && rating >= 5);
    const autoApprove = explicitOpsApprove || isPromoter;

    const visitDate = str(body.visit_date) || formatMonthYear();
    const visitRole = str(body.author_role) || `${visitCount}ª visita`;

    const newRecord = {
      author_name: plain(authorName).slice(0, 100),
      author_role: plain(visitRole).slice(0, 60),
      visit_count: visitCount,
      rating,
      nps_score: npsScore,
      comment: plain(comment).slice(0, 1000),
      unit: plain(unit).slice(0, 80),
      source: plain(source).slice(0, 40),
      visit_date: plain(visitDate).slice(0, 40),
      approved: autoApprove,
      featured: false,
      approved_at: autoApprove ? new Date().toISOString() : null,
      approved_by: autoApprove ? (explicitOpsApprove ? "api_ops_key" : "auto_promoter_nps") : null,
    };

    const { data: inserted, error: insertError } = await admin
      .from("fa_playground_reviews")
      .insert(newRecord)
      .select("id, approved")
      .single();

    if (insertError) {
      console.error("Erro ao inserir avaliação de NPS:", insertError);
      return jsonResponse(req, { error: "falha ao salvar avaliação" }, 500);
    }

    return jsonResponse(req, {
      ok: true,
      id: inserted.id,
      status: inserted.approved ? "approved" : "pending_moderation",
      message: inserted.approved
        ? "Avaliação (NPS 9-10) auto-aprovada e publicada no site com sucesso."
        : "Avaliação recebida com sucesso e aguardando moderação no painel.",
    }, 201);
  }

  return jsonResponse(req, { error: "método não permitido" }, 405);
});
