// Eventos — API pública (eventos.html, evento.html, ingresso.html). Roteada por `action` no corpo JSON.
//
//  listar {publico?}                → eventos publicados (fim >= agora) com contagens e "escassez" real
//  detalhe {slug}                   → um evento com descrição completa
//  inscrever {...}                  → inscrição gratuita: confirma ou entra na lista de espera (rpc fa_eventos_inscrever)
//  ingresso {t}                     → dados do ingresso (token de acesso do e-mail)
//  cancelar {t}                     → participante libera a vaga (promove o próximo da fila)
//  confirmar_promocao {t}           → promovido da fila confirma no prazo (token de escopo "confirmar")
//
// Regras que não podem ser quebradas:
//  - O navegador nunca lê tabela: só esta função (service role), e só via a view fa_eventos_publicos
//    (contagens; nenhuma coluna de inscrito) ou via token HMAC da própria inscrição.
//  - Escassez só com número real do banco, e o número exato só aparece abaixo do limiar (<= 10 vagas ou
//    <= 30%). Acima disso é "vagas abertas". Nada inventado.
//  - `ja_inscrito` NUNCA devolve código nem link: senão bastaria digitar o e-mail de outra pessoa para
//    pegar o ingresso dela. Reenvia o voucher para o e-mail dono da inscrição (no máximo 1 a cada 10 min).
//  - Todo e-mail sai pelo eventos-dispatch (x-ops-key = OPS_KEY).
//
// Mesmo padrão de wifi-lead-webhook: honeypot "website-hp", rate limit por IP (10 inscrições/hora),
// validação de e-mail e WhatsApp, CORS/JSON inline. Secrets: EVENTOS_SECRET, OPS_KEY, SITE_URL (opcional),
// COMUNIDADE_WHATSAPP_FAMILIAS / COMUNIDADE_WHATSAPP_PROFISSIONAIS (opcionais).

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

// Segredos: variavel de ambiente (supabase secrets) ou, se ausente, o Vault via fa_eventos_segredo (so service role).
const SEG: Record<string, string> = {};
try {
  const u = Deno.env.get("SUPABASE_URL"), k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const faltam = ["OPS_KEY", "EVENTOS_SECRET"].filter((n) => !Deno.env.get(n));
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
const DISPATCH_URL = `${Deno.env.get("SUPABASE_URL") ?? "https://ivjvpdzsfjdpyabbzzuj.supabase.co"}/functions/v1/eventos-dispatch`;
const RATE_LIMIT_PER_HOUR = 10;
const REENVIO_MIN_MS = 10 * 60_000;

const ALLOWED_ORIGINS = [
  "https://institutofacaamigos.com.br",
  "https://www.institutofacaamigos.com.br",
  "https://playground.institutofacaamigos.com.br",
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
];

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

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------------------------------
// Token HMAC (mesmo formato de eventos-dispatch): base64url(id|escopo|exp) "." base64url(hmac)
// ---------------------------------------------------------------------------------------------

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): Uint8Array | null {
  try {
    const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
    return Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}
async function hmac(payload: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo("EVENTOS_SECRET") ?? ""), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}
async function signToken(inscricaoId: string, escopo: "acesso" | "confirmar", expMs: number): Promise<string> {
  const payload = `${inscricaoId}|${escopo}|${Math.floor(expMs / 1000)}`;
  return `${b64url(new TextEncoder().encode(payload))}.${b64url(await hmac(payload))}`;
}
async function verifyToken(token: string, escopo: "acesso" | "confirmar"): Promise<string | null> {
  if (!segredo("EVENTOS_SECRET") || !token || token.length > 400) return null;
  const [p, s] = token.split(".");
  if (!p || !s) return null;
  const payloadBytes = b64urlDecode(p);
  if (!payloadBytes) return null;
  const payload = new TextDecoder().decode(payloadBytes);
  if (!safeEqual(b64url(await hmac(payload)), s)) return null;
  const [id, esc, exp] = payload.split("|");
  if (!/^[0-9a-f-]{36}$/i.test(id ?? "") || esc !== escopo || Number(exp) * 1000 < Date.now()) return null;
  return id;
}

// ---------------------------------------------------------------------------------------------
// Dispatch (e-mails)
// ---------------------------------------------------------------------------------------------

async function dispatch(inscricaoId: string, tipo: string): Promise<boolean> {
  const key = segredo("OPS_KEY");
  if (!key) {
    console.error("eventos-public: OPS_KEY ausente, e-mail não enviado");
    return false;
  }
  try {
    const r = await fetch(DISPATCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ops-key": key },
      body: JSON.stringify({ action: "enviar", inscricao_id: inscricaoId, tipo }),
    });
    if (!r.ok) console.error("eventos-public: dispatch", tipo, r.status, await r.text().catch(() => ""));
    return r.ok;
  } catch (err) {
    console.error("eventos-public: dispatch falhou", err instanceof Error ? err.message : err);
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// Escassez real
// ---------------------------------------------------------------------------------------------

interface TipoView {
  id: string;
  nome: string;
  tipo: "gratuito" | "pago";
  vagas: number;
  preco_exibicao: string | null;
  hotmart_checkout_url: string | null;
  ordem: number;
  ocupadas: number;
  lista_espera: number;
}

function escassez(t: TipoView) {
  if (t.tipo === "pago") return { estado: "abertas", vendidos: t.ocupadas };
  const restantes = Math.max(0, t.vagas - t.ocupadas);
  if (restantes <= 0) return { estado: "esgotado", lista_espera: t.lista_espera };
  if (restantes <= 10 || restantes <= Math.ceil(t.vagas * 0.3)) return { estado: "ultimas", restantes };
  return { estado: "abertas" };
}

// deno-lint-ignore no-explicit-any
function shapeEvento(row: any, completo: boolean) {
  const agora = Date.now();
  const encerra = row.inscricoes_ate ?? row.inicio;
  const tipos = ((row.tipos ?? []) as TipoView[]).map((t) => ({
    id: t.id,
    nome: t.nome,
    tipo: t.tipo,
    preco_exibicao: t.preco_exibicao,
    hotmart_checkout_url: t.tipo === "pago" ? t.hotmart_checkout_url : null,
    escassez: escassez(t),
  }));
  const base = {
    id: row.id,
    slug: row.slug,
    titulo: row.titulo,
    categoria: row.categoria,
    publico: row.publico,
    formato: row.formato,
    descricao_curta: row.descricao_curta,
    promessa: row.promessa,
    local_nome: row.local_nome,
    local_endereco: row.local_endereco,
    inicio: row.inicio,
    fim: row.fim,
    inscricoes_ate: encerra,
    inscricoes_encerradas: row.status !== "published" || new Date(encerra).getTime() < agora,
    realizado: new Date(row.fim).getTime() < agora,
    capa_url: row.capa_url,
    palestrante_nome: row.palestrante_nome,
    status: row.status,
    tipos,
  };
  if (!completo) return base;
  return {
    ...base,
    descricao_longa: row.descricao_longa,
    beneficios: row.beneficios ?? [],
    para_quem: row.para_quem,
    nao_e_para: row.nao_e_para,
    palestrante_bio: row.palestrante_bio,
    palestrante_foto_url: row.palestrante_foto_url,
  };
}

function comunidadeUrl(ev: { publico: string; comunidade_whatsapp_url: string | null }): string {
  return ev.comunidade_whatsapp_url ||
    (Deno.env.get(ev.publico === "profissionais" ? "COMUNIDADE_WHATSAPP_PROFISSIONAIS" : "COMUNIDADE_WHATSAPP_FAMILIAS") ?? "");
}

async function ingressoUrl(inscricaoId: string, fimIso: string): Promise<string> {
  return `${SITE}/ingresso?t=${await signToken(inscricaoId, "acesso", new Date(fimIso).getTime() + 30 * 86400_000)}`;
}

const INSCRICAO_SELECT =
  "id, nome, email, status, codigo, checkin_at, promocao_prazo, lista_espera_em, created_at, tipo_id, origem, " +
  "evento:fa_eventos!inner(id, slug, titulo, publico, formato, local_nome, local_endereco, online_url, inicio, fim, status, comunidade_whatsapp_url), " +
  "tipo:fa_eventos_ingresso_tipos!inner(nome, tipo)";

// deno-lint-ignore no-explicit-any
async function loadInscricao(admin: Admin, id: string): Promise<any | null> {
  const { data } = await admin.from("fa_eventos_inscricoes").select(INSCRICAO_SELECT).eq("id", id).maybeSingle();
  return data ?? null;
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json(req, { error: "serviço indisponível" }, 500);
  const admin: Admin = createClient(supabaseUrl, serviceRoleKey);

  // Sem EVENTOS_SECRET (links do ingresso) ou OPS_KEY (envio de e-mail) uma inscrição gravaria e depois falharia
  // ao entregar o voucher. Enquanto o Lote 7 do PUBLICAR.md não estiver completo, essas ações são recusadas
  // ANTES de gravar qualquer coisa. Listar e detalhe seguem funcionando.
  if (["inscrever", "ingresso", "cancelar", "confirmar_promocao"].includes(action) &&
      (!segredo("EVENTOS_SECRET") || !segredo("OPS_KEY"))) {
    console.error("eventos-public: EVENTOS_SECRET/OPS_KEY ausentes, ação recusada:", action);
    return json(req, { error: "inscrições temporariamente indisponíveis, tente novamente em instantes" }, 503);
  }

  // --- listar ---
  if (action === "listar") {
    const publico = str(body.publico);
    let q = admin.from("fa_eventos_publicos").select("*").gte("fim", new Date().toISOString()).order("inicio").limit(50);
    if (publico === "familias" || publico === "profissionais") q = q.eq("publico", publico);
    const { data, error } = await q;
    if (error) {
      console.error("listar", error);
      return json(req, { error: "falha ao listar eventos" }, 500);
    }
    return json(req, { ok: true, eventos: (data ?? []).map((r) => shapeEvento(r, false)) });
  }

  // --- detalhe ---
  if (action === "detalhe") {
    const slug = str(body.slug).toLowerCase();
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return json(req, { error: "evento não encontrado" }, 404);
    const { data, error } = await admin.from("fa_eventos_publicos").select("*").eq("slug", slug).maybeSingle();
    if (error || !data) return json(req, { error: "evento não encontrado" }, 404);
    return json(req, { ok: true, evento: shapeEvento(data, true) });
  }

  // --- inscrever ---
  if (action === "inscrever") {
    if (str(body["website-hp"])) return json(req, { ok: true, status: "confirmada" }); // honeypot: finge sucesso

    const tipoId = str(body.tipo_id);
    const nome = str(body.nome);
    const email = str(body.email).toLowerCase();
    const whatsapp = normalizePhone(str(body.whatsapp));
    const perfil = str(body.perfil);
    if (!/^[0-9a-f-]{36}$/i.test(tipoId)) return json(req, { error: "escolha um tipo de ingresso" }, 400);
    if (nome.length < 3 || nome.length > 120) return json(req, { error: "informe seu nome completo" }, 400);
    if (!EMAIL_RE.test(email) || email.length > 200) return json(req, { error: "e-mail inválido" }, 400);
    if (!isValidPhone(whatsapp)) return json(req, { error: "WhatsApp inválido" }, 400);
    if (body.consent !== true) return json(req, { error: "é preciso aceitar a política de privacidade" }, 400);
    if (perfil && !["mae_pai_responsavel", "educador", "terapeuta", "outro"].includes(perfil)) {
      return json(req, { error: "perfil inválido" }, 400);
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
    const userAgent = (req.headers.get("user-agent") || "").slice(0, 300);
    if (ip) {
      const { count } = await admin.from("fa_eventos_inscricoes").select("id", { count: "exact", head: true })
        .eq("ip", ip).gte("created_at", new Date(Date.now() - 3600_000).toISOString());
      if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) return json(req, { error: "muitas tentativas, tente novamente mais tarde" }, 429);
    }

    const rastreio: Record<string, string | null> = { ip: ip || null, user_agent: userAgent || null };
    for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid", "referrer", "landing_page"]) {
      rastreio[k] = str(body[k]).slice(0, 300) || null;
    }

    const { data: r, error } = await admin.rpc("fa_eventos_inscrever", {
      p_tipo_id: tipoId,
      p_nome: nome,
      p_email: email,
      p_whatsapp: whatsapp,
      p_perfil: perfil || null,
      p_consent_at: new Date().toISOString(),
      p_optin_email: body.marketing_opt_in_email === true,
      p_optin_whatsapp: body.marketing_opt_in_whatsapp === true,
      p_origem: "site",
      p_rastreio: rastreio,
    });
    if (error || !r) {
      console.error("inscrever", error);
      return json(req, { error: "falha ao registrar inscrição" }, 500);
    }

    switch (r.resultado) {
      case "confirmada": {
        const ins = await loadInscricao(admin, r.inscricao_id);
        await dispatch(r.inscricao_id, "voucher");
        return json(req, {
          ok: true,
          status: "confirmada",
          codigo: r.codigo,
          ingresso_url: ins ? await ingressoUrl(ins.id, ins.evento.fim) : null,
          comunidade_whatsapp_url: ins ? comunidadeUrl(ins.evento) : "",
        });
      }
      case "lista_espera": {
        await dispatch(r.inscricao_id, "lista_espera");
        return json(req, { ok: true, status: "lista_espera", posicao: r.posicao });
      }
      case "ja_inscrito": {
        // Não devolve código nem link. Reenvia o voucher/aviso para o e-mail dono (com intervalo mínimo).
        const { data: ultimo } = await admin.from("fa_eventos_envios").select("created_at").eq("inscricao_id", r.inscricao_id)
          .in("tipo", ["voucher", "voucher_reenvio", "lista_espera"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
        const podeReenviar = !ultimo || Date.now() - new Date(ultimo.created_at).getTime() > REENVIO_MIN_MS;
        if (podeReenviar) await dispatch(r.inscricao_id, r.status === "confirmada" ? "voucher_reenvio" : "lista_espera");
        return json(req, { ok: true, status: "ja_inscrito", situacao: r.status });
      }
      case "tipo_pago":
        return json(req, { error: "este ingresso é pago: use o botão de compra", hotmart_checkout_url: r.hotmart_checkout_url }, 400);
      case "inscricoes_encerradas":
        return json(req, { error: "as inscrições deste evento já encerraram" }, 409);
      default:
        return json(req, { error: "este ingresso não está disponível" }, 400);
    }
  }

  // --- ingresso {t} ---
  if (action === "ingresso") {
    const id = await verifyToken(str(body.t), "acesso");
    if (!id) return json(req, { error: "link inválido ou expirado" }, 400);
    const ins = await loadInscricao(admin, id);
    if (!ins) return json(req, { error: "ingresso não encontrado" }, 404);
    const ev = ins.evento;
    const confirmada = ins.status === "confirmada";
    let posicao: number | null = null;
    if (ins.status === "lista_espera") {
      const { count } = await admin.from("fa_eventos_inscricoes").select("id", { count: "exact", head: true })
        .eq("tipo_id", ins.tipo_id).eq("status", "lista_espera").lt("lista_espera_em", ins.lista_espera_em);
      posicao = (count ?? 0) + 1;
    }
    return json(req, {
      ok: true,
      nome: ins.nome,
      codigo: ins.codigo,
      status: ins.status,
      origem: ins.origem,
      checkin_at: ins.checkin_at,
      posicao,
      promocao_prazo: ins.status === "promovida" ? ins.promocao_prazo : null,
      tipo_nome: ins.tipo.nome,
      tipo: ins.tipo.tipo,
      pode_cancelar: ["confirmada", "lista_espera", "promovida"].includes(ins.status) && ev.status === "published" && new Date(ev.inicio).getTime() > Date.now(),
      evento: {
        slug: ev.slug,
        titulo: ev.titulo,
        publico: ev.publico,
        formato: ev.formato,
        local_nome: ev.local_nome,
        local_endereco: ev.local_endereco,
        inicio: ev.inicio,
        fim: ev.fim,
        status: ev.status,
        online_url: confirmada ? ev.online_url : null,
      },
      comunidade_whatsapp_url: confirmada ? comunidadeUrl(ev) : "",
    });
  }

  // --- cancelar {t} ---
  if (action === "cancelar") {
    const id = await verifyToken(str(body.t), "acesso");
    if (!id) return json(req, { error: "link inválido ou expirado" }, 400);
    const { data: r, error } = await admin.rpc("fa_eventos_cancelar", { p_inscricao_id: id, p_motivo: "participante" });
    if (error) return json(req, { error: "falha ao cancelar" }, 500);
    if (r?.resultado !== "cancelada") return json(req, { error: "esta inscrição não pode mais ser cancelada" }, 409);
    for (const pid of (r.promovidas ?? []) as string[]) await dispatch(pid, "promocao");
    return json(req, { ok: true });
  }

  // --- confirmar_promocao {t} ---
  if (action === "confirmar_promocao") {
    const id = await verifyToken(str(body.t), "confirmar");
    if (!id) return json(req, { error: "link inválido ou expirado" }, 400);
    const { data: r, error } = await admin.rpc("fa_eventos_confirmar_promocao", { p_inscricao_id: id });
    if (error) return json(req, { error: "falha ao confirmar" }, 500);
    if (r?.resultado === "confirmada" || r?.resultado === "ja_confirmada") {
      const ins = await loadInscricao(admin, id);
      if (r.resultado === "confirmada") await dispatch(id, "voucher");
      return json(req, {
        ok: true,
        status: "confirmada",
        codigo: r.codigo,
        ingresso_url: ins ? await ingressoUrl(ins.id, ins.evento.fim) : null,
        comunidade_whatsapp_url: ins ? comunidadeUrl(ins.evento) : "",
      });
    }
    if (r?.resultado === "expirada") return json(req, { error: "o prazo para confirmar passou e a vaga foi para a próxima pessoa" }, 410);
    return json(req, { error: "esta confirmação não é mais válida" }, 409);
  }

  return json(req, { error: "ação inválida" }, 400);
});
