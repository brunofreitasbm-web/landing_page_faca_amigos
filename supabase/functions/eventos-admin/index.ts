// Eventos — API do painel (aba "Eventos" do admin.html). Roteada por `action` no corpo JSON.
//
// Autenticação: o MESMO token de sessão do painel (fa_teste_admin_sessions, criado pelo login em
// behavior-test-admin). Aqui não há login: só validação do Bearer. Quem entrou no painel entra aqui.
//
// Ações:
//   eventos_listar {status?}                       lista com contagens
//   evento_salvar {evento:{id?, ...}}              cria/edita (slug automático; publicar exige promessa + 3 benefícios)
//   evento_cancelar {id, mensagem}                 status=cancelled + e-mail em massa (fila do eventos-dispatch)
//   tipos_listar {evento_id} / tipo_salvar {tipo:{...}} / tipo_desativar {id}
//   inscricoes_listar {evento_id, status?, tipo_id?, q?, page?, page_size?}
//   inscricoes_csv {evento_id, status?}            text/csv (BOM, ;)
//   inscricao_adicionar {tipo_id, nome, email, whatsapp, perfil?}
//   inscricao_confirmar {id}                       da fila para confirmada (overbooking consciente)
//   inscricao_cancelar {id, motivo?}
//   inscricao_reenviar_voucher {id}
//   checkin {codigo, evento_id?}                   rpc fa_eventos_checkin (idempotente)
//   dashboard {evento_id?}
//   hotmart_reprocessar {}                         vendas que chegaram antes do tipo existir
//   imagem_upload {data_base64}                    capa/foto do palestrante no bucket publico eventos-imagens (owner)
//   comunicados_listar {evento_id}                 historico de comunicados com o andamento do envio (owner)
//   comunicado_enviar {evento_id, assunto, mensagem, destinatarios, teste?}  recado a quem esta inscrito (owner)
//
// Secrets: OPS_KEY (para chamar o eventos-dispatch). CORS/JSON inline como nas demais funções.

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

const DISPATCH_URL = `${Deno.env.get("SUPABASE_URL") ?? "https://ivjvpdzsfjdpyabbzzuj.supabase.co"}/functions/v1/eventos-dispatch`;

const ALLOWED_ORIGINS = [
  "https://institutofacaamigos.com.br",
  "https://www.institutofacaamigos.com.br",
  "https://playground.institutofacaamigos.com.br",
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "http://localhost:3000",
];

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders(req) } });
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function strOrNull(v: unknown, max = 2000): string | null {
  const s = str(v);
  return s ? s.slice(0, max) : null;
}
function isUuid(v: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(v);
}

// Valor seguro dentro de .or() do PostgREST (mesmo helper de behavior-test-admin).
function quoteFilterValue(v: string): string {
  return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function belemStamp(iso: unknown): string {
  if (typeof iso !== "string" || !iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  return new Date(t - 3 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
}

function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function slugify(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

// ---------------------------------------------------------------------------------------------
// Sessão (cópia de behavior-test-admin: a tabela é a mesma)
// ---------------------------------------------------------------------------------------------

async function requireSession(admin: Admin, req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return null;
  const { data, error } = await admin.from("fa_teste_admin_sessions")
    .select("token, clinica_user_id, admin_email, expires_at, escopo, escopo_eventos").eq("token", token).maybeSingle();
  if (error || !data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) {
    await admin.from("fa_teste_admin_sessions").delete().eq("token", token);
    return null;
  }
  return {
    token,
    userId: data.clinica_user_id as string,
    email: data.admin_email as string,
    // Escopo do módulo Eventos: o da coluna própria; sessão antiga (sem ela) usa o escopo geral.
    escopo: lerEscopo(data.escopo_eventos ?? data.escopo),
  };
}

type Escopo = "owner" | "equipe" | "ver" | "nenhum";
function lerEscopo(v: unknown): Escopo {
  return v === "owner" || v === "equipe" || v === "ver" || v === "nenhum" ? v : "nenhum";
}

// Escopo 'equipe' (login direto limitado): só a porta do evento. Lista de permissão: ação nova nasce
// negada. Quem edita evento, vê e-mail/WhatsApp, exporta ou cancela entra pelo Hub de Gestão (owner).
const ACOES_EQUIPE = new Set(["eventos_listar", "inscricoes_listar", "checkin"]);
// Nível "ver" no Hub: mesma leitura da equipe, sem fazer check-in. "nenhum": nada.
const ACOES_VER = new Set(["eventos_listar", "inscricoes_listar"]);
const EVENTO_COLS_EQUIPE = ["id", "slug", "titulo", "categoria", "publico", "formato", "inicio", "fim", "status", "local_nome", "contagens"];
const INS_COLS_EQUIPE = ["id", "nome", "status", "codigo", "tipo", "checkin_at", "created_at", "posicao"];

function pick(row: Record<string, unknown>, cols: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of cols) if (c in row) out[c] = row[c];
  return out;
}

// ---------------------------------------------------------------------------------------------
// Dispatch (e-mails)
// ---------------------------------------------------------------------------------------------

async function dispatch(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const key = segredo("OPS_KEY");
  if (!key) return { ok: false, error: "OPS_KEY ausente" };
  try {
    const r = await fetch(DISPATCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ops-key": key },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    return r.ok ? { ok: true } : { ok: false, error: d?.error ?? `HTTP ${r.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "erro de rede" };
  }
}

async function enviarPromocoes(ids: unknown): Promise<void> {
  for (const id of (Array.isArray(ids) ? ids : []) as string[]) {
    await dispatch({ action: "enviar", inscricao_id: id, tipo: "promocao" });
  }
}

// Tipo real da imagem pelos primeiros bytes (nao confia no content-type enviado pelo navegador).
function tipoDaImagem(b: Uint8Array): { mime: string; ext: string } | null {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (b.length > 12 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { mime: "image/png", ext: "png" };
  if (b.length > 12 && String.fromCharCode(b[0], b[1], b[2], b[3]) === "RIFF" && String.fromCharCode(b[8], b[9], b[10], b[11]) === "WEBP") return { mime: "image/webp", ext: "webp" };
  return null;
}

// ---------------------------------------------------------------------------------------------
// Validação do evento
// ---------------------------------------------------------------------------------------------

const CATEGORIAS = ["palestra", "reuniao", "treinamento"];
const PUBLICOS = ["familias", "profissionais"];
const FORMATOS = ["presencial", "online", "hibrido"];
const STATUS_EDITAVEL = ["draft", "published", "closed"];

function parseDate(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

// deno-lint-ignore no-explicit-any
function sanitizeEvento(raw: any): { ok: true; row: Record<string, unknown> } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "evento inválido" };
  const titulo = str(raw.titulo);
  if (titulo.length < 4) return { ok: false, error: "título muito curto" };
  const categoria = str(raw.categoria);
  const publico = str(raw.publico);
  const formato = str(raw.formato) || "presencial";
  const status = str(raw.status) || "draft";
  if (!CATEGORIAS.includes(categoria)) return { ok: false, error: "categoria inválida" };
  if (!PUBLICOS.includes(publico)) return { ok: false, error: "público inválido" };
  if (!FORMATOS.includes(formato)) return { ok: false, error: "formato inválido" };
  if (!STATUS_EDITAVEL.includes(status)) return { ok: false, error: "status inválido (cancelar é pela ação própria)" };
  const inicio = parseDate(raw.inicio);
  const fim = parseDate(raw.fim);
  const inscricoesAte = parseDate(raw.inscricoes_ate);
  if (!inicio || !fim) return { ok: false, error: "informe início e fim" };
  if (new Date(fim) <= new Date(inicio)) return { ok: false, error: "o fim precisa ser depois do início" };
  if (inscricoesAte && new Date(inscricoesAte) > new Date(inicio)) return { ok: false, error: "as inscrições precisam encerrar até o início" };

  let slug = slugify(str(raw.slug) || titulo);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) slug = slugify(titulo);
  if (!slug) return { ok: false, error: "slug inválido" };

  const beneficios = (Array.isArray(raw.beneficios) ? raw.beneficios : [])
    .map((b: unknown) => str(b).slice(0, 200)).filter(Boolean).slice(0, 5);
  const promessa = strOrNull(raw.promessa, 400);
  if (status === "published") {
    if (!promessa) return { ok: false, error: "para publicar, escreva a promessa do evento" };
    if (beneficios.length < 3) return { ok: false, error: "para publicar, informe ao menos 3 benefícios" };
    if (!strOrNull(raw.descricao_curta, 300)) return { ok: false, error: "para publicar, escreva a descrição curta" };
  }
  const url = (v: unknown) => {
    const s = strOrNull(v, 500);
    if (!s) return null;
    return /^https?:\/\//i.test(s) ? s : null;
  };

  return {
    ok: true,
    row: {
      slug, titulo, categoria, publico, formato, status,
      descricao_curta: strOrNull(raw.descricao_curta, 300),
      descricao_longa: strOrNull(raw.descricao_longa, 8000),
      promessa,
      beneficios,
      para_quem: strOrNull(raw.para_quem, 600),
      nao_e_para: strOrNull(raw.nao_e_para, 600),
      local_nome: strOrNull(raw.local_nome, 200),
      local_endereco: strOrNull(raw.local_endereco, 300),
      online_url: url(raw.online_url),
      inicio, fim,
      inscricoes_ate: inscricoesAte,
      capa_url: url(raw.capa_url),
      palestrante_nome: strOrNull(raw.palestrante_nome, 200),
      palestrante_bio: strOrNull(raw.palestrante_bio, 1500),
      palestrante_foto_url: url(raw.palestrante_foto_url),
      comunidade_whatsapp_url: url(raw.comunidade_whatsapp_url),
    },
  };
}

// deno-lint-ignore no-explicit-any
function sanitizeTipo(raw: any): { ok: true; row: Record<string, unknown> } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "tipo inválido" };
  const eventoId = str(raw.evento_id);
  if (!isUuid(eventoId)) return { ok: false, error: "evento inválido" };
  const nome = str(raw.nome).slice(0, 80);
  if (nome.length < 2) return { ok: false, error: "nome do ingresso muito curto" };
  const tipo = str(raw.tipo);
  if (!["gratuito", "pago"].includes(tipo)) return { ok: false, error: "tipo inválido" };
  const vagas = Math.max(0, Math.floor(Number(raw.vagas) || 0));
  const row: Record<string, unknown> = {
    evento_id: eventoId, nome, tipo, vagas,
    ordem: Math.max(0, Math.floor(Number(raw.ordem) || 0)),
    ativo: raw.ativo !== false,
    preco_exibicao: strOrNull(raw.preco_exibicao, 40),
    hotmart_product_id: null,
    hotmart_checkout_url: null,
  };
  if (tipo === "pago") {
    const pid = Number(raw.hotmart_product_id);
    const url = str(raw.hotmart_checkout_url);
    if (!Number.isInteger(pid) || pid <= 0) return { ok: false, error: "informe o id numérico do produto na Hotmart" };
    if (!/^https:\/\/([a-z0-9-]+\.)*hotmart\.com\//i.test(url)) return { ok: false, error: "o link de checkout precisa ser da Hotmart (https://pay.hotmart.com/...)" };
    row.hotmart_product_id = pid;
    row.hotmart_checkout_url = url;
  } else if (vagas < 1) {
    return { ok: false, error: "ingresso gratuito precisa ter ao menos 1 vaga" };
  }
  return { ok: true, row };
}

// ---------------------------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------------------------

const INS_COLS =
  "id, evento_id, tipo_id, nome, email, whatsapp, perfil, status, origem, codigo, marketing_opt_in_email, marketing_opt_in_whatsapp, " +
  "utm_source, utm_medium, utm_campaign, hotmart_transaction, valor_pago, lista_espera_em, promovida_em, promocao_prazo, confirmada_em, " +
  "cancelada_em, cancel_motivo, checkin_at, checkin_por, created_at, tipo:fa_eventos_ingresso_tipos(nome, tipo)";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (req.method !== "POST") return jsonResponse(req, { error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(req, { error: "corpo inválido" }, 400);
  }
  const action = str(body.action);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse(req, { error: "serviço indisponível" }, 500);
  const admin: Admin = createClient(supabaseUrl, serviceRoleKey);

  const session = await requireSession(admin, req);
  if (!session) return jsonResponse(req, { error: "sessão inválida ou expirada" }, 401);
  const equipe = session.escopo !== "owner"; // quem não é owner recebe as respostas filtradas (sem receita, e-mail, WhatsApp)
  const permitidas = session.escopo === "equipe" ? ACOES_EQUIPE : session.escopo === "ver" ? ACOES_VER : session.escopo === "nenhum" ? new Set<string>() : null;
  if (permitidas && !permitidas.has(action)) return jsonResponse(req, { error: "sem permissão para esta ação" }, 403);

  // --- eventos ---
  if (action === "eventos_listar") {
    const status = str(body.status);
    let q = admin.from("fa_eventos").select("*").order("inicio", { ascending: false }).limit(200);
    if (["draft", "published", "closed", "cancelled"].includes(status)) q = q.eq("status", status);
    const { data: eventos, error } = await q;
    if (error) return jsonResponse(req, { error: "falha ao listar eventos" }, 500);

    const ids = (eventos ?? []).map((e) => e.id);
    const contagens: Record<string, Record<string, number>> = {};
    if (ids.length) {
      const { data: ins } = await admin.from("fa_eventos_inscricoes").select("evento_id, status, checkin_at, valor_pago, origem").in("evento_id", ids);
      for (const i of ins ?? []) {
        const c = (contagens[i.evento_id] ??= { confirmadas: 0, lista_espera: 0, promovidas: 0, canceladas: 0, checkins: 0, vendidos: 0, receita: 0 });
        if (i.status === "confirmada") c.confirmadas++;
        else if (i.status === "lista_espera") c.lista_espera++;
        else if (i.status === "promovida") c.promovidas++;
        else if (i.status === "cancelada" || i.status === "expirada") c.canceladas++;
        if (i.checkin_at) c.checkins++;
        if (i.origem === "hotmart" && i.status === "confirmada") { c.vendidos++; c.receita += Number(i.valor_pago ?? 0); }
      }
    }
    const { data: tipos } = ids.length
      ? await admin.from("fa_eventos_ingresso_tipos").select("evento_id, tipo, vagas, ativo").in("evento_id", ids)
      : { data: [] };
    const vagasPorEvento: Record<string, number> = {};
    for (const t of tipos ?? []) if (t.ativo && t.tipo === "gratuito") vagasPorEvento[t.evento_id] = (vagasPorEvento[t.evento_id] ?? 0) + t.vagas;

    const completos = (eventos ?? []).map((e) => ({
      ...e,
      contagens: contagens[e.id] ?? { confirmadas: 0, lista_espera: 0, promovidas: 0, canceladas: 0, checkins: 0, vendidos: 0, receita: 0 },
      vagas_gratuitas: vagasPorEvento[e.id] ?? 0,
    }));
    if (equipe) {
      // Sem receita, sem link online, sem rascunhos/cancelados: a equipe só precisa dos eventos que vão acontecer.
      return jsonResponse(req, {
        eventos: completos.filter((e) => e.status === "published" || e.status === "closed")
          .map((e) => pick({ ...e, contagens: { confirmadas: e.contagens.confirmadas, checkins: e.contagens.checkins } }, EVENTO_COLS_EQUIPE)),
      });
    }
    return jsonResponse(req, { eventos: completos });
  }

  if (action === "evento_salvar") {
    const s = sanitizeEvento(body.evento);
    if (!s.ok) return jsonResponse(req, { error: s.error }, 400);
    // deno-lint-ignore no-explicit-any
    const id = str((body.evento as any)?.id);
    if (id) {
      if (!isUuid(id)) return jsonResponse(req, { error: "id inválido" }, 400);
      const { data: atual } = await admin.from("fa_eventos").select("status").eq("id", id).maybeSingle();
      if (!atual) return jsonResponse(req, { error: "evento não encontrado" }, 404);
      if (atual.status === "cancelled") return jsonResponse(req, { error: "evento cancelado não pode ser editado" }, 409);
      const { data, error } = await admin.from("fa_eventos").update(s.row).eq("id", id).select("*").single();
      if (error) return jsonResponse(req, { error: error.code === "23505" ? "já existe um evento com este slug" : "falha ao salvar" }, error.code === "23505" ? 409 : 500);
      return jsonResponse(req, { evento: data });
    }
    const { data, error } = await admin.from("fa_eventos").insert({ ...s.row, criado_por: session.email }).select("*").single();
    if (error) return jsonResponse(req, { error: error.code === "23505" ? "já existe um evento com este slug" : "falha ao criar" }, error.code === "23505" ? 409 : 500);
    return jsonResponse(req, { evento: data });
  }

  if (action === "evento_cancelar") {
    const id = str(body.id);
    const mensagem = strOrNull(body.mensagem, 1500);
    if (!isUuid(id)) return jsonResponse(req, { error: "id inválido" }, 400);
    const { data: ev } = await admin.from("fa_eventos").select("id, status").eq("id", id).maybeSingle();
    if (!ev) return jsonResponse(req, { error: "evento não encontrado" }, 404);
    if (ev.status === "cancelled") return jsonResponse(req, { error: "evento já cancelado" }, 409);
    const { error } = await admin.from("fa_eventos").update({ status: "cancelled", cancel_mensagem: mensagem }).eq("id", id);
    if (error) return jsonResponse(req, { error: "falha ao cancelar" }, 500);

    // Enfileira o aviso para todos os ativos; o eventos-dispatch drena a fila (agora e a cada 30 min).
    const { data: ativos } = await admin.from("fa_eventos_inscricoes").select("id")
      .eq("evento_id", id).in("status", ["confirmada", "lista_espera", "promovida"]);
    const fila = (ativos ?? []).map((i) => ({ inscricao_id: i.id, tipo: "evento_cancelado", status: "pendente" }));
    if (fila.length) {
      // insert simples: upsert com onConflict nao casa com o indice unico PARCIAL (erro 42P10) e a fila ficava vazia.
      // Um evento so e cancelado uma vez (409 acima), entao nao ha envio anterior do mesmo tipo.
      const { error: e2 } = await admin.from("fa_eventos_envios").insert(fila);
      if (e2) console.error("evento_cancelar: fila", e2);
    }
    const disp = await dispatch({ action: "run" });
    return jsonResponse(req, { ok: true, enfileirados: fila.length, dispatch_ok: disp.ok });
  }

  // --- tipos de ingresso ---
  if (action === "tipos_listar") {
    const eventoId = str(body.evento_id);
    if (!isUuid(eventoId)) return jsonResponse(req, { error: "evento inválido" }, 400);
    const { data, error } = await admin.from("fa_eventos_ingresso_tipos").select("*").eq("evento_id", eventoId).order("ordem").order("nome");
    if (error) return jsonResponse(req, { error: "falha ao listar tipos" }, 500);
    const ids = (data ?? []).map((t) => t.id);
    const contagens: Record<string, { ocupadas: number; lista_espera: number }> = {};
    if (ids.length) {
      const { data: ins } = await admin.from("fa_eventos_inscricoes").select("tipo_id, status").in("tipo_id", ids);
      for (const i of ins ?? []) {
        const c = (contagens[i.tipo_id] ??= { ocupadas: 0, lista_espera: 0 });
        if (i.status === "confirmada" || i.status === "promovida") c.ocupadas++;
        else if (i.status === "lista_espera") c.lista_espera++;
      }
    }
    return jsonResponse(req, { tipos: (data ?? []).map((t) => ({ ...t, ...(contagens[t.id] ?? { ocupadas: 0, lista_espera: 0 }) })) });
  }

  if (action === "tipo_salvar") {
    const s = sanitizeTipo(body.tipo);
    if (!s.ok) return jsonResponse(req, { error: s.error }, 400);
    // deno-lint-ignore no-explicit-any
    const id = str((body.tipo as any)?.id);
    let vagasAntes = 0;
    let saved;
    if (id) {
      if (!isUuid(id)) return jsonResponse(req, { error: "id inválido" }, 400);
      const { data: atual } = await admin.from("fa_eventos_ingresso_tipos").select("vagas, evento_id").eq("id", id).maybeSingle();
      if (!atual) return jsonResponse(req, { error: "tipo não encontrado" }, 404);
      vagasAntes = atual.vagas;
      const { evento_id: _ignored, ...semEvento } = s.row; // o tipo não muda de evento
      const { data, error } = await admin.from("fa_eventos_ingresso_tipos").update(semEvento).eq("id", id).select("*").single();
      if (error) return jsonResponse(req, { error: error.code === "23505" ? "já existe um ingresso com esse nome ou produto Hotmart" : "falha ao salvar" }, error.code === "23505" ? 409 : 500);
      saved = data;
    } else {
      const { data, error } = await admin.from("fa_eventos_ingresso_tipos").insert(s.row).select("*").single();
      if (error) return jsonResponse(req, { error: error.code === "23505" ? "já existe um ingresso com esse nome ou produto Hotmart" : "falha ao criar" }, error.code === "23505" ? 409 : 500);
      saved = data;
    }
    // Vagas aumentaram: puxa da fila o que couber e avisa os promovidos.
    let promovidas: string[] = [];
    if (saved.tipo === "gratuito" && saved.vagas > vagasAntes) {
      const { data: r } = await admin.rpc("fa_eventos_reprocessar_vagas", { p_evento_id: saved.evento_id });
      promovidas = (r?.promovidas ?? []) as string[];
      await enviarPromocoes(promovidas);
    }
    return jsonResponse(req, { tipo: saved, promovidas: promovidas.length });
  }

  if (action === "tipo_desativar") {
    const id = str(body.id);
    if (!isUuid(id)) return jsonResponse(req, { error: "id inválido" }, 400);
    const { count } = await admin.from("fa_eventos_inscricoes").select("id", { count: "exact", head: true }).eq("tipo_id", id);
    if ((count ?? 0) === 0) {
      const { error } = await admin.from("fa_eventos_ingresso_tipos").delete().eq("id", id);
      if (error) return jsonResponse(req, { error: "falha ao remover" }, 500);
      return jsonResponse(req, { ok: true, removido: true });
    }
    const { error } = await admin.from("fa_eventos_ingresso_tipos").update({ ativo: false }).eq("id", id);
    if (error) return jsonResponse(req, { error: "falha ao desativar" }, 500);
    return jsonResponse(req, { ok: true, removido: false });
  }

  // --- inscrições ---
  if (action === "inscricoes_listar") {
    const eventoId = str(body.evento_id);
    if (!isUuid(eventoId)) return jsonResponse(req, { error: "evento inválido" }, 400);
    const status = str(body.status);
    const tipoId = str(body.tipo_id);
    const q = str(body.q);
    const pageSize = Math.min(Math.max(Number(body.page_size) || 100, 1), 500);
    const page = Math.max(Number(body.page) || 0, 0);

    let query = admin.from("fa_eventos_inscricoes").select(INS_COLS, { count: "exact" })
      .eq("evento_id", eventoId)
      .order("created_at", { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (["confirmada", "lista_espera", "promovida", "cancelada", "expirada"].includes(status)) query = query.eq("status", status);
    if (isUuid(tipoId)) query = query.eq("tipo_id", tipoId);
    if (q) {
      const like = quoteFilterValue(`%${q.replace(/[%_]/g, "")}%`);
      // A equipe busca só por nome e código: buscar por e-mail/WhatsApp revelaria quem está inscrito.
      const conds = equipe ? [`nome.ilike.${like}`, `codigo.ilike.${like}`] : [`nome.ilike.${like}`, `email.ilike.${like}`, `codigo.ilike.${like}`];
      const digits = q.replace(/\D/g, "");
      if (!equipe && digits.length >= 3) conds.push(`whatsapp.ilike.${quoteFilterValue(`%${digits}%`)}`);
      query = query.or(conds.join(","));
    }
    const { data, error, count } = await query;
    if (error) return jsonResponse(req, { error: "falha ao listar inscrições" }, 500);

    // Posição na fila (por tipo) de quem está em lista de espera.
    const { data: fila } = await admin.from("fa_eventos_inscricoes").select("id, tipo_id, lista_espera_em, created_at")
      .eq("evento_id", eventoId).eq("status", "lista_espera").order("lista_espera_em").order("created_at");
    const posicao: Record<string, number> = {};
    const porTipo: Record<string, number> = {};
    for (const f of fila ?? []) posicao[f.id] = (porTipo[f.tipo_id] = (porTipo[f.tipo_id] ?? 0) + 1);

    // deno-lint-ignore no-explicit-any
    const rows = (data ?? []) as any[];
    const comPosicao = rows.map((i) => ({ ...i, posicao: posicao[i.id] ?? null }));
    return jsonResponse(req, {
      inscricoes: equipe ? comPosicao.map((i) => pick(i, INS_COLS_EQUIPE)) : comPosicao,
      total: count ?? 0, page, page_size: pageSize,
    });
  }

  if (action === "inscricoes_csv") {
    const eventoId = str(body.evento_id);
    if (!isUuid(eventoId)) return jsonResponse(req, { error: "evento inválido" }, 400);
    const status = str(body.status);
    const { data: ev } = await admin.from("fa_eventos").select("slug").eq("id", eventoId).maybeSingle();
    let query = admin.from("fa_eventos_inscricoes").select(INS_COLS).eq("evento_id", eventoId).order("created_at").limit(5000);
    if (["confirmada", "lista_espera", "promovida", "cancelada", "expirada"].includes(status)) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return jsonResponse(req, { error: "falha ao exportar" }, 500);
    const header = ["criado em", "status", "ingresso", "nome", "e-mail", "whatsapp", "perfil", "código", "origem", "check-in", "opt-in e-mail", "opt-in whatsapp", "utm_source", "utm_medium", "utm_campaign", "transação hotmart", "valor pago", "cancelada em", "motivo"];
    const lines = [header.map(csvCell).join(";")];
    // deno-lint-ignore no-explicit-any
    for (const r of (data ?? []) as any[]) {
      lines.push([
        belemStamp(r.created_at), r.status, r.tipo?.nome, r.nome, r.email, r.whatsapp, r.perfil, r.codigo, r.origem,
        belemStamp(r.checkin_at), r.marketing_opt_in_email ? "sim" : "não", r.marketing_opt_in_whatsapp ? "sim" : "não",
        r.utm_source, r.utm_medium, r.utm_campaign, r.hotmart_transaction, r.valor_pago, belemStamp(r.cancelada_em), r.cancel_motivo,
      ].map(csvCell).join(";"));
    }
    return new Response("﻿" + lines.join("\r\n") + "\r\n", {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="inscricoes-${ev?.slug ?? eventoId}.csv"`,
        "Cache-Control": "no-store",
        ...corsHeaders(req),
      },
    });
  }

  if (action === "inscricao_adicionar") {
    const tipoId = str(body.tipo_id);
    const nome = str(body.nome);
    const email = str(body.email).toLowerCase();
    const whatsapp = str(body.whatsapp).replace(/\D/g, "");
    const perfil = str(body.perfil);
    if (!isUuid(tipoId)) return jsonResponse(req, { error: "tipo inválido" }, 400);
    if (nome.length < 3) return jsonResponse(req, { error: "informe o nome" }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonResponse(req, { error: "e-mail inválido" }, 400);
    const { data: r, error } = await admin.rpc("fa_eventos_inscrever", {
      p_tipo_id: tipoId, p_nome: nome, p_email: email, p_whatsapp: whatsapp || null,
      p_perfil: ["mae_pai_responsavel", "educador", "terapeuta", "outro"].includes(perfil) ? perfil : null,
      p_consent_at: new Date().toISOString(), p_optin_email: false, p_optin_whatsapp: false,
      p_origem: "admin", p_rastreio: { utm_source: "admin", utm_medium: "manual", utm_campaign: session.email },
    });
    if (error) return jsonResponse(req, { error: "falha ao inscrever" }, 500);
    if (r.resultado === "confirmada") await dispatch({ action: "enviar", inscricao_id: r.inscricao_id, tipo: "voucher" });
    else if (r.resultado === "lista_espera") await dispatch({ action: "enviar", inscricao_id: r.inscricao_id, tipo: "lista_espera" });
    else if (r.resultado === "ja_inscrito") return jsonResponse(req, { error: `este e-mail já tem inscrição (${r.status})` }, 409);
    else if (r.resultado === "inscricoes_encerradas") return jsonResponse(req, { error: "inscrições encerradas" }, 409);
    else if (r.resultado !== "confirmada") return jsonResponse(req, { error: `não foi possível inscrever (${r.resultado})` }, 400);
    return jsonResponse(req, { ok: true, resultado: r.resultado, codigo: r.codigo, posicao: r.posicao ?? null });
  }

  if (action === "inscricao_confirmar") {
    const id = str(body.id);
    if (!isUuid(id)) return jsonResponse(req, { error: "id inválido" }, 400);
    const { data: r, error } = await admin.rpc("fa_eventos_confirmar_manual", { p_inscricao_id: id, p_admin: session.email });
    if (error) return jsonResponse(req, { error: "falha ao confirmar" }, 500);
    if (r?.resultado !== "confirmada") return jsonResponse(req, { error: `não dá para confirmar (${r?.status ?? r?.resultado})` }, 409);
    const disp = await dispatch({ action: "enviar", inscricao_id: id, tipo: "voucher" });
    return jsonResponse(req, { ok: true, codigo: r.codigo, email_ok: disp.ok });
  }

  if (action === "inscricao_cancelar") {
    const id = str(body.id);
    if (!isUuid(id)) return jsonResponse(req, { error: "id inválido" }, 400);
    const motivo = `admin:${session.email}${str(body.motivo) ? " " + str(body.motivo).slice(0, 120) : ""}`;
    const { data: r, error } = await admin.rpc("fa_eventos_cancelar", { p_inscricao_id: id, p_motivo: motivo });
    if (error) return jsonResponse(req, { error: "falha ao cancelar" }, 500);
    if (r?.resultado !== "cancelada") return jsonResponse(req, { error: "esta inscrição não pode ser cancelada" }, 409);
    await enviarPromocoes(r.promovidas);
    return jsonResponse(req, { ok: true, promovidas: (r.promovidas ?? []).length });
  }

  if (action === "inscricao_reenviar_voucher") {
    const id = str(body.id);
    if (!isUuid(id)) return jsonResponse(req, { error: "id inválido" }, 400);
    const { data: ins } = await admin.from("fa_eventos_inscricoes").select("status").eq("id", id).maybeSingle();
    if (!ins) return jsonResponse(req, { error: "inscrição não encontrada" }, 404);
    const tipo = ins.status === "confirmada" ? "voucher_reenvio" : ins.status === "promovida" ? "promocao" : ins.status === "lista_espera" ? "lista_espera" : null;
    if (!tipo) return jsonResponse(req, { error: "inscrição sem e-mail aplicável neste status" }, 409);
    if (tipo !== "voucher_reenvio") {
      // promocao/lista_espera têm chave única: apaga a reserva anterior para poder reenviar.
      await admin.from("fa_eventos_envios").delete().eq("inscricao_id", id).eq("tipo", tipo);
    }
    const disp = await dispatch({ action: "enviar", inscricao_id: id, tipo });
    if (!disp.ok) return jsonResponse(req, { error: disp.error ?? "falha ao enviar" }, 502);
    return jsonResponse(req, { ok: true, tipo });
  }

  if (action === "checkin") {
    const codigo = str(body.codigo).toUpperCase().replace(/\s+/g, "");
    const eventoId = str(body.evento_id);
    if (!codigo) return jsonResponse(req, { error: "informe o código" }, 400);
    const { data: r, error } = await admin.rpc("fa_eventos_checkin", {
      p_codigo: codigo, p_admin: session.email, p_evento_id: isUuid(eventoId) ? eventoId : null,
    });
    if (error) return jsonResponse(req, { error: "falha no check-in" }, 500);
    return jsonResponse(req, r);
  }

  if (action === "dashboard") {
    const eventoId = str(body.evento_id);
    let q = admin.from("fa_eventos_inscricoes").select("evento_id, status, origem, perfil, valor_pago, checkin_at, created_at, utm_source, tipo_id").limit(20000);
    if (isUuid(eventoId)) q = q.eq("evento_id", eventoId);
    const { data, error } = await q;
    if (error) return jsonResponse(req, { error: "falha ao carregar" }, 500);
    const porStatus: Record<string, number> = {};
    const porPerfil: Record<string, number> = {};
    const porOrigem: Record<string, number> = {};
    const porDia: Record<string, number> = {};
    let checkins = 0, confirmadas = 0, vendidos = 0, receita = 0;
    const desde = Date.now() - 30 * 86400_000;
    for (const i of data ?? []) {
      porStatus[i.status] = (porStatus[i.status] ?? 0) + 1;
      if (i.perfil) porPerfil[i.perfil] = (porPerfil[i.perfil] ?? 0) + 1;
      const src = i.utm_source || "direto";
      porOrigem[src] = (porOrigem[src] ?? 0) + 1;
      if (i.status === "confirmada") { confirmadas++; if (i.checkin_at) checkins++; }
      if (i.origem === "hotmart" && i.status === "confirmada") { vendidos++; receita += Number(i.valor_pago ?? 0); }
      const t = new Date(i.created_at).getTime();
      if (t >= desde) { const d = belemStamp(i.created_at).slice(0, 10); porDia[d] = (porDia[d] ?? 0) + 1; }
    }
    const topOrigem = Object.entries(porOrigem).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ origem: k, total: v }));
    return jsonResponse(req, {
      total: data?.length ?? 0, por_status: porStatus, por_perfil: porPerfil, top_origem: topOrigem,
      confirmadas, checkins, taxa_checkin: confirmadas ? Math.round((checkins / confirmadas) * 100) : null,
      vendidos, receita: Math.round(receita * 100) / 100,
      por_dia: Object.entries(porDia).sort().map(([d, n]) => ({ dia: d, total: n })),
    });
  }

  // Vendas da Hotmart que chegaram antes do tipo de ingresso existir (hotmart-webhook grava error 'evento: ...').
  if (action === "hotmart_reprocessar") {
    const { data: evs, error } = await admin.from("fa_hotmart_eventos").select("event_id, event, transaction, payload")
      .like("error", "evento:%").order("processed_at").limit(200);
    if (error) return jsonResponse(req, { error: "falha ao ler eventos da Hotmart" }, 500);
    let processados = 0, pendentes = 0;
    for (const e of evs ?? []) {
      // deno-lint-ignore no-explicit-any
      const data = (e.payload as any)?.data ?? {};
      const productId = Number(data?.product?.id);
      const email = String(data?.buyer?.email ?? "").trim().toLowerCase();
      const tx = String(data?.purchase?.transaction ?? "");
      const { data: tipo } = Number.isFinite(productId) && productId > 0
        ? await admin.from("fa_eventos_ingresso_tipos").select("id").eq("hotmart_product_id", productId).maybeSingle()
        : { data: null };
      if (!tipo || !email || !tx || !["PURCHASE_APPROVED", "PURCHASE_COMPLETE"].includes(String(e.event))) { pendentes++; continue; }
      const valor = Number(data?.purchase?.price?.value);
      const { data: r, error: rpcErr } = await admin.rpc("fa_eventos_confirmar_hotmart", {
        p_tipo_id: tipo.id, p_email: email, p_nome: data?.buyer?.name ?? "", p_whatsapp: data?.buyer?.checkout_phone ?? data?.buyer?.phone ?? null,
        p_transaction: tx, p_valor: Number.isFinite(valor) ? valor : null,
        p_rastreio: { utm_source: "hotmart", utm_content: data?.purchase?.origin?.src ?? null, landing_page: data?.purchase?.origin?.sck ?? null },
      });
      if (rpcErr) { pendentes++; continue; }
      if (r?.novo) {
        await dispatch({ action: "enviar", inscricao_id: r.inscricao_id, tipo: "voucher" });
        await enviarPromocoes(r.promovidas);
      }
      await admin.from("fa_hotmart_eventos").update({ error: null, processed_at: new Date().toISOString() }).eq("event_id", e.event_id);
      processados++;
    }
    return jsonResponse(req, { ok: true, processados, pendentes });
  }

  // --- imagens: capa e foto do palestrante ---
  if (action === "imagem_upload") {
    const b64 = str(body.data_base64).replace(/^data:[^,]*,/, "");
    if (!b64) return jsonResponse(req, { error: "envie uma imagem" }, 400);
    if (b64.length > 3_000_000) return jsonResponse(req, { error: "imagem muito grande (máximo 2 MB)" }, 413);
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    } catch {
      return jsonResponse(req, { error: "imagem inválida" }, 400);
    }
    if (bytes.length > 2 * 1024 * 1024) return jsonResponse(req, { error: "imagem muito grande (máximo 2 MB)" }, 413);
    const tipo = tipoDaImagem(bytes);
    if (!tipo) return jsonResponse(req, { error: "use uma imagem JPG, PNG ou WebP" }, 400);
    const nome = `${crypto.randomUUID()}.${tipo.ext}`;
    const { error } = await admin.storage.from("eventos-imagens").upload(nome, bytes, { contentType: tipo.mime, upsert: false, cacheControl: "31536000" });
    if (error) {
      console.error("imagem_upload", error);
      return jsonResponse(req, { error: "falha ao enviar a imagem" }, 500);
    }
    return jsonResponse(req, { ok: true, url: `${supabaseUrl}/storage/v1/object/public/eventos-imagens/${nome}` });
  }

  // --- comunicados ---
  if (action === "comunicados_listar") {
    const eventoId = str(body.evento_id);
    if (!isUuid(eventoId)) return jsonResponse(req, { error: "evento inválido" }, 400);
    const { data, error } = await admin.from("fa_eventos_comunicados").select("id, assunto, destinatarios, total, criado_por, created_at")
      .eq("evento_id", eventoId).order("created_at", { ascending: false }).limit(50);
    if (error) return jsonResponse(req, { error: "falha ao listar comunicados" }, 500);
    const ids = (data ?? []).map((c) => c.id);
    const andamento: Record<string, { enviado: number; pendente: number; erro: number }> = {};
    if (ids.length) {
      const { data: envios } = await admin.from("fa_eventos_envios").select("comunicado_id, status").in("comunicado_id", ids).limit(20000);
      for (const e of envios ?? []) {
        const a = (andamento[e.comunicado_id] ??= { enviado: 0, pendente: 0, erro: 0 });
        if (e.status === "enviado" || e.status === "pendente" || e.status === "erro") a[e.status as "enviado" | "pendente" | "erro"]++;
      }
    }
    return jsonResponse(req, { comunicados: (data ?? []).map((c) => ({ ...c, ...(andamento[c.id] ?? { enviado: 0, pendente: 0, erro: 0 }) })) });
  }

  if (action === "comunicado_enviar") {
    const eventoId = str(body.evento_id);
    const assunto = str(body.assunto);
    const mensagem = str(body.mensagem);
    const destinatarios = str(body.destinatarios);
    if (!isUuid(eventoId)) return jsonResponse(req, { error: "evento inválido" }, 400);
    if (assunto.length < 3 || assunto.length > 150) return jsonResponse(req, { error: "o assunto precisa ter de 3 a 150 caracteres" }, 400);
    if (mensagem.length < 10 || mensagem.length > 5000) return jsonResponse(req, { error: "a mensagem precisa ter de 10 a 5000 caracteres" }, 400);
    if (!["confirmadas", "ativos"].includes(destinatarios)) return jsonResponse(req, { error: "escolha os destinatários" }, 400);

    const { data: ev } = await admin.from("fa_eventos").select("id, status").eq("id", eventoId).maybeSingle();
    if (!ev) return jsonResponse(req, { error: "evento não encontrado" }, 404);
    if (ev.status !== "published" && ev.status !== "closed") return jsonResponse(req, { error: "só dá para enviar comunicado de evento publicado ou encerrado" }, 409);

    if (body.teste === true) {
      const t = await dispatch({ action: "comunicado_teste", to: session.email, assunto, mensagem, evento_id: eventoId });
      if (!t.ok) return jsonResponse(req, { error: t.error ?? "falha ao enviar o teste" }, 502);
      return jsonResponse(req, { ok: true, teste: true });
    }

    const statuses = destinatarios === "confirmadas" ? ["confirmada"] : ["confirmada", "lista_espera", "promovida"];
    const { data: alvo, error: eAlvo } = await admin.from("fa_eventos_inscricoes").select("id").eq("evento_id", eventoId).in("status", statuses).limit(5000);
    if (eAlvo) return jsonResponse(req, { error: "falha ao buscar os inscritos" }, 500);
    if (!alvo?.length) return jsonResponse(req, { error: "não há inscritos nesse grupo" }, 409);

    // Trava contra clique duplo: mesmo texto, mesmo evento, nos últimos 2 minutos.
    const { count: repetido } = await admin.from("fa_eventos_comunicados").select("id", { count: "exact", head: true })
      .eq("evento_id", eventoId).eq("assunto", assunto).eq("mensagem", mensagem).gte("created_at", new Date(Date.now() - 120_000).toISOString());
    if ((repetido ?? 0) > 0) return jsonResponse(req, { error: "este comunicado já foi enviado agora há pouco" }, 409);

    const { data: com, error: eCom } = await admin.from("fa_eventos_comunicados")
      .insert({ evento_id: eventoId, assunto, mensagem, destinatarios, total: alvo.length, criado_por: session.email }).select("id").single();
    if (eCom || !com) return jsonResponse(req, { error: "falha ao registrar o comunicado" }, 500);
    for (let i = 0; i < alvo.length; i += 500) {
      const fila = alvo.slice(i, i + 500).map((a) => ({ inscricao_id: a.id, tipo: "comunicado", status: "pendente", comunicado_id: com.id }));
      const { error: eFila } = await admin.from("fa_eventos_envios").insert(fila);
      if (eFila) console.error("comunicado_enviar: fila", eFila);
    }
    const disp = await dispatch({ action: "run" });
    return jsonResponse(req, { ok: true, comunicado_id: com.id, total: alvo.length, dispatch_ok: disp.ok });
  }

  return jsonResponse(req, { error: "ação inválida" }, 400);
});
