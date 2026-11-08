// Painel de administração do Teste de Comportamento (admin.html): login da
// idealizadora, listagem/detalhe dos leads, exportação dos leads em CSV, geração de insight via Gemini,
// envio desse insight ao responsável por e-mail (Brevo) e a aba "Cupons Wi-Fi" (consulta e resgate dos cupons
// do portal Wi-Fi da clínica, com a mesma regra de wifi-coupon-admin). Tudo numa única
// função, roteada por `action` no corpo JSON — mesmo motivo de CORS/JSON
// inline das demais funções deste projeto (import relativo de ../_shared
// quebra no deploy via MCP).
//
// Autenticação NÃO guarda senha própria: o login é o mesmo e-mail/senha
// do Sistema da Clínica FaçaAmigos (Next.js, projeto Supabase separado
// "vththexblpxwocbowhsv"), papel `gestor`. O fluxo é:
//   1. POST no /auth/v1/token do projeto da Clínica com email+senha
//      (mesma API que o próprio app da Clínica usa) — se autenticar,
//      devolve um access_token do usuário.
//   2. Com esse access_token (não com service role), GET em
//      /rest/v1/profiles?id=eq.<uid> do MESMO projeto — a RLS de lá
//      (`profiles_read_same_clinic`) deixa qualquer usuário ler o próprio
//      perfil, então isso funciona sem precisar da service role da
//      Clínica aqui.
//   3. Só role === "gestor" pode entrar; qualquer outro papel (terapeuta,
//      recepção etc.) é recusado, mesmo com senha correta.
// Continua havendo um token de sessão opaco próprio em
// fa_teste_admin_sessions (validade 12h) — só para não repetir o login
// contra a Clínica a cada clique no painel.
//
// Dois escopos de sessão (coluna `escopo`):
//   - owner: painel completo. Entra pelo Hub de Gestão (gestao-hub gera um
//     ticket de uso único; a ação `sso` daqui troca por sessão) e, enquanto
//     fa_teste_config.admin_login_direto não for {"escopo":"equipe"}, também
//     pelo login direto do Gestor (comportamento legado).
//   - equipe: login direto limitado a ACOES_EQUIPE (cupons Wi-Fi). Com a
//     chave em "equipe", o login direto aceita qualquer perfil da Clínica,
//     mas só entrega este escopo.
//   - ver / nenhum: só pelo Hub. O Hub de Gestão grava o nível de cada pessoa
//     (admin -> owner, operar -> equipe, ver -> ver, sem acesso -> nenhum) no
//     ticket; a ação `sso` cria um escopo para o painel (`escopo`) e outro para
//     Eventos (`escopo_eventos`, lido por eventos-admin).

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { type Escopo, escopoDoNivel } from "./escopo.ts";

// deno-lint-ignore no-explicit-any
type Admin = SupabaseClient<any, any, any, any, any>;

const LOGO_URL = "https://institutofacaamigos.com.br/img/logo-simbolo.png";

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
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req) },
  });
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// Valor seguro dentro de .or() do PostgREST (aspas duplas + escape), para a
// busca do painel não virar operador de filtro se alguém digitar vírgula
// ou parêntese.
function quoteFilterValue(v: string): string {
  return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

// Títulos de resultado por versão do teste. "2026-09-16" é o placeholder
// antigo (8 perguntas, banda única); "2026-09-18" é o questionário
// definitivo (25 perguntas, pior faixa entre 5 áreas) — ver
// supabase/functions/behavior-test-webhook/index.ts (fonte de verdade).
const RESULT_TITLES: Record<string, string> = {
  recomendado: "Recomendamos uma avaliação profissional",
  observar: "Vale a pena observar de perto",
  esperado: "Dentro do esperado para a idade",
  tier1: "Está fluindo bem",
  tier2: "Merece um olhar mais de perto",
  tier3: "Merece atenção especial",
};

function resultTitleFor(lead: { result_band?: string | null; results?: unknown }): string {
  const band = lead.result_band ?? "";
  const base = RESULT_TITLES[band] ?? band ?? "—";
  if (Array.isArray(lead.results)) {
    const tier3Count = (lead.results as AreaResult[]).filter((r) => r?.tier === "tier3").length;
    if (tier3Count > 0) return `${base} (${tier3Count} área${tier3Count > 1 ? "s" : ""})`;
  }
  return base;
}

interface AreaResult {
  key: string;
  name: string;
  score: number;
  max: number;
  tier: "tier1" | "tier2" | "tier3";
  tier_label: string;
}

const LEAD_STATUSES = ["started", "abandoned", "completed", "contacted"];

// Início do dia de hoje em Belém (UTC-3, sem horário de verão), em ISO/UTC. Igual a wifi-coupon-admin.
function startOfTodayBelemIso(now = new Date()): string {
  const belem = new Date(now.getTime() - 3 * 3600_000);
  belem.setUTCHours(0, 0, 0, 0);
  return new Date(belem.getTime() + 3 * 3600_000).toISOString();
}

// "AAAA-MM-DD HH:MM" em horário de Belém (para planilha).
function belemStamp(iso: unknown): string {
  if (typeof iso !== "string" || !iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  return new Date(t - 3 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
}

// Célula de CSV: aspas duplas dobradas, campo entre aspas se tiver vírgula/aspas/quebra de linha, e proteção
// contra injeção de fórmula (planilha executa células que começam com = + - @ ; tab e CR também) prefixando '.
function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CSV_MAX_ROWS = 5000;
const CSV_PAGE = 1000; // o PostgREST costuma limitar a 1000 linhas por requisição: pagina com range()

// 5 áreas do questionário definitivo (versão 2026-09-18) e seus defaults —
// devem ficar em sincronia com AREAS/DEFAULT_TIER_LABELS/DEFAULT_FEEDBACK em
// supabase/functions/behavior-test-webhook/index.ts (o deploy via MCP não
// resolve import relativo de um módulo compartilhado, daí a duplicação).
const CONFIG_AREA_KEYS = ["emotional", "conduct", "hyperactivity", "peer", "prosocial"] as const;
type ConfigAreaKey = (typeof CONFIG_AREA_KEYS)[number];

const CONFIG_DEFAULTS: Record<ConfigAreaKey, {
  name: string;
  tier_labels: Record<"tier1" | "tier2" | "tier3", string>;
  feedback: Record<"tier1" | "tier2" | "tier3", string>;
}> = {
  emotional: {
    name: "Emoções e segurança",
    tier_labels: { tier1: "Está fluindo bem", tier2: "Merece um olhar mais de perto", tier3: "Merece atenção especial" },
    feedback: {
      tier1: "Seu filho(a) parece lidar bem com as próprias emoções no dia a dia. Momentos de tristeza ou medo aparecem, mas de forma leve e passageira — sinal de que ele(a) está encontrando formas saudáveis de se expressar.",
      tier2: "Alguns sinais de insegurança apareceram nas suas respostas — talvez um choro mais frequente, medos específicos ou queixas físicas em certos momentos (como antes de sair de casa). Vale observar com carinho quando esses momentos acontecem, sem pressa para \"resolver\" — muitas vezes é só uma forma de pedir colo.",
      tier3: "Suas respostas indicam que as emoções do seu filho(a) parecem estar mais pesadas ultimamente — choro frequente, medos mais intensos ou queixas físicas recorrentes (como dor de barriga antes da escola). Isso costuma ser uma forma de comunicar algo que ainda não sabe nomear, e merece um acolhimento mais próximo.",
    },
  },
  conduct: {
    name: "Rotina e limites",
    tier_labels: { tier1: "Está fluindo bem", tier2: "Merece um olhar mais de perto", tier3: "Merece atenção especial" },
    feedback: {
      tier1: "A rotina em casa parece estar em um bom momento — birras e desafios de comportamento aparecem pouco, dentro do que se espera para a idade.",
      tier2: "Birras, desobediências ou momentos de raiva têm aparecido com alguma frequência. Vale lembrar: isso raramente é uma afronta pessoal — é uma forma de comunicação não-verbal. Observar o que acontece um pouco antes desses momentos pode ajudar a entender os gatilhos.",
      tier3: "Birras intensas, desobediências ou explosões de raiva parecem estar desafiando bastante a paz da rotina em casa. Vale mapear com calma o que costuma vir antes e depois desses momentos — isso ajuda a entender os gatilhos e, aos poucos, devolver equilíbrio ao dia a dia.",
    },
  },
  hyperactivity: {
    name: "Foco e energia",
    tier_labels: { tier1: "Está fluindo bem", tier2: "Merece um olhar mais de perto", tier3: "Merece atenção especial" },
    feedback: {
      tier1: "Seu filho(a) parece conseguir manter o foco em atividades por um tempo adequado para a idade, sem sinais relevantes de agitação excessiva.",
      tier2: "Você notou alguma agitação ou dificuldade de manter o foco em atividades mais longas. Isso é comum em fases de muita energia — pequenas pausas estruturadas e ordens em passos curtos costumam ajudar bastante.",
      tier3: "Agitação constante, pressa e dificuldade de manter o foco parecem estar comandando boa parte do dia a dia. Para mentes tão aceleradas, uma rotina previsível costuma ser um grande aliado — junto com metas pequenas e reforço positivo para os momentos de concentração.",
    },
  },
  peer: {
    name: "Amizades e convivência",
    tier_labels: { tier1: "Está fluindo bem", tier2: "Merece um olhar mais de perto", tier3: "Merece atenção especial" },
    feedback: {
      tier1: "A socialização parece estar florescendo — seu filho(a) demonstra abertura para interagir, compartilhar momentos e se conectar com outras crianças de forma natural.",
      tier2: "Você notou alguma dificuldade nos momentos de convivência com outras crianças — talvez mais timidez ou algum retraimento em grupos. Isso costuma variar bastante conforme o contexto e o momento, e vale observar com leveza.",
      tier3: "Parece haver uma dificuldade mais consistente nos momentos de convivência com outras crianças — seja se aproximar, ser aceito no grupo ou manter uma brincadeira em conjunto. Esse é um ponto que vale um olhar mais próximo.",
    },
  },
  prosocial: {
    name: "Empatia e gentileza",
    tier_labels: { tier1: "Está fluindo bem", tier2: "Em desenvolvimento", tier3: "Merece incentivo especial" },
    feedback: {
      tier1: "Empatia e gentileza parecem estar no coração do seu filho(a) — vontade de ajudar, compartilhar e acolher quem está por perto. Essa sensibilidade é linda e merece ser bastante celebrada.",
      tier2: "Seu filho(a) demonstra gestos de gentileza e cuidado com os outros, ainda em construção. Isso é parte natural do desenvolvimento social e costuma se fortalecer com o exemplo e o incentivo do dia a dia.",
      tier3: "Os gestos de empatia e cuidado com o outro ainda aparecem pouco nas suas respostas. Isso não é motivo de preocupação — é uma habilidade que se desenvolve com modelagem e prática, e pequenas oportunidades de exercitar gentileza no dia a dia costumam fazer diferença.",
    },
  },
};

interface ConfigOverride {
  areas?: Partial<Record<ConfigAreaKey, {
    name?: string;
    tier_labels?: Partial<Record<"tier1" | "tier2" | "tier3", string>>;
    feedback?: Partial<Record<"tier1" | "tier2" | "tier3", string>>;
  }>>;
}

function sanitizeConfig(raw: unknown): ConfigOverride {
  const out: ConfigOverride = { areas: {} };
  if (!raw || typeof raw !== "object") return out;
  const areasIn = (raw as any).areas;
  if (!areasIn || typeof areasIn !== "object") return out;
  for (const key of CONFIG_AREA_KEYS) {
    const areaIn = areasIn[key];
    if (!areaIn || typeof areaIn !== "object") continue;
    const areaOut: NonNullable<ConfigOverride["areas"]>[ConfigAreaKey] = {};
    if (typeof areaIn.name === "string" && areaIn.name.trim()) {
      areaOut.name = areaIn.name.trim().slice(0, 200);
    }
    if (areaIn.tier_labels && typeof areaIn.tier_labels === "object") {
      const labels: Partial<Record<"tier1" | "tier2" | "tier3", string>> = {};
      for (const t of ["tier1", "tier2", "tier3"] as const) {
        const v = areaIn.tier_labels[t];
        if (typeof v === "string" && v.trim()) labels[t] = v.trim().slice(0, 200);
      }
      if (Object.keys(labels).length) areaOut.tier_labels = labels;
    }
    if (areaIn.feedback && typeof areaIn.feedback === "object") {
      const fb: Partial<Record<"tier1" | "tier2" | "tier3", string>> = {};
      for (const t of ["tier1", "tier2", "tier3"] as const) {
        const v = areaIn.feedback[t];
        if (typeof v === "string" && v.trim()) fb[t] = v.trim().slice(0, 1200);
      }
      if (Object.keys(fb).length) areaOut.feedback = fb;
    }
    if (Object.keys(areaOut).length) out.areas![key] = areaOut;
  }
  return out;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------
// Login delegado ao Sistema da Clínica (Supabase Auth de outro projeto)
// ---------------------------------------------------------------------

async function verifyClinicaGestorLogin(
  identifier: string,
  password: string,
  exigirGestor = true,
): Promise<{ ok: true; userId: string; email: string } | { ok: false; error: string; status: number }> {
  const clinicaUrl = Deno.env.get("CLINICA_SUPABASE_URL");
  const clinicaAnonKey = Deno.env.get("CLINICA_SUPABASE_ANON_KEY");
  if (!clinicaUrl || !clinicaAnonKey) {
    return { ok: false, error: "integração com o Sistema da Clínica não configurada", status: 500 };
  }

  let emailToUse = identifier.trim();

  // Se não contém '@', é CPF: acha o e-mail com a service role da Clínica. Com a chave anon a RLS de
  // `profiles` (só lê a própria clínica, logado) devolve vazio, e `profiles` não tem a coluna `cpf_clean`
  // (coluna inexistente dentro do .or() derruba a consulta inteira). O CPF é guardado só com dígitos.
  if (!emailToUse.includes("@")) {
    const clinicaServiceKey = Deno.env.get("CLINICA_SUPABASE_SERVICE_ROLE_KEY");
    const cleanDigits = emailToUse.replace(/\D/g, "");
    const filters: string[] = [];
    if (emailToUse) filters.push(`cpf.eq.${quoteFilterValue(emailToUse)}`);
    if (cleanDigits && cleanDigits !== emailToUse) filters.push(`cpf.eq.${quoteFilterValue(cleanDigits)}`);

    if (clinicaServiceKey && filters.length > 0) {
      const lookupRes = await fetch(
        `${clinicaUrl}/rest/v1/profiles?select=email&or=(${filters.join(",")})&limit=1`,
        { headers: { apikey: clinicaServiceKey, Authorization: `Bearer ${clinicaServiceKey}` } },
      ).catch(() => null);

      if (lookupRes && lookupRes.ok) {
        const found = await lookupRes.json().catch(() => []);
        if (Array.isArray(found) && found[0]?.email) {
          emailToUse = found[0].email;
        }
      }
    }
  }

  // 1) Autentica contra o Supabase Auth da Clínica — mesma chamada que o
  // próprio app dela faz (auth.signInWithPassword usa este endpoint por
  // baixo dos panos).
  const tokenRes = await fetch(`${clinicaUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: clinicaAnonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: emailToUse, password }),
  });

  if (!tokenRes.ok) {
    return { ok: false, error: "credenciais inválidas", status: 401 };
  }

  const tokenData = await tokenRes.json().catch(() => null);
  const accessToken = tokenData?.access_token as string | undefined;
  const userId = tokenData?.user?.id as string | undefined;
  if (!accessToken || !userId) {
    return { ok: false, error: "credenciais inválidas", status: 401 };
  }

  // 2) Com o access_token do próprio usuário (não a service role), lê o
  // perfil dele — a RLS de lá (`profiles_read_same_clinic`) deixa
  // qualquer usuário autenticado ler o próprio registro.
  const profileRes = await fetch(
    `${clinicaUrl}/rest/v1/profiles?select=role,email&id=eq.${userId}`,
    { headers: { apikey: clinicaAnonKey, Authorization: `Bearer ${accessToken}` } },
  );

  if (!profileRes.ok) {
    return { ok: false, error: "não foi possível verificar seu perfil na Clínica", status: 502 };
  }

  const profiles = await profileRes.json().catch(() => []);
  const profile = Array.isArray(profiles) ? profiles[0] : undefined;

  // Modo "equipe" (acesso direto limitado): qualquer perfil da Clínica entra,
  // mas só recebe o escopo restrito (ver ACOES_EQUIPE). Owner só pelo Hub.
  if (!profile || (exigirGestor && String(profile.role).toLowerCase() !== "gestor")) {
    return { ok: false, error: "apenas o Gestor da Clínica pode acessar este painel", status: 403 };
  }

  return { ok: true, userId, email: profile.email ?? emailToUse };
}

// ---------------------------------------------------------------------
// Sessão (própria deste painel — só evita repetir o login acima a cada clique)
// ---------------------------------------------------------------------

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILS_PER_IP = 5;
const LOGIN_MAX_FAILS_PER_LOGIN = 10;

function newSessionToken(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return toHex(arr.buffer);
}

// Nível do Hub -> escopo da sessão: ver ./escopo.ts (falha fechado).

// Escopos de quem não é owner. Lista de permissão: ação nova nasce negada.
//   equipe  (nível "operar" no Hub; também o login direto): cupons Wi-Fi (listar e resgatar).
//   ver     (nível "ver" no Hub): só leitura, lista os cupons sem resgatar.
//   nenhum  (sem acesso ao painel): só sair.
// O resto é do owner (nível "admin" no Hub).
const ACOES_EQUIPE = new Set(["wifi_list_coupons", "wifi_redeem", "logout"]);
const ACOES_VER = new Set(["wifi_list_coupons", "logout"]);
const ACOES_NENHUM = new Set(["logout"]);

function acoesDoEscopo(escopo: Escopo): Set<string> | null {
  if (escopo === "equipe") return ACOES_EQUIPE;
  if (escopo === "ver") return ACOES_VER;
  if (escopo === "nenhum") return ACOES_NENHUM;
  return null; // owner: sem restrição
}


function lerEscopo(v: unknown): Escopo {
  return v === "owner" || v === "equipe" || v === "ver" || v === "nenhum" ? v : "nenhum";
}

async function requireSession(admin: Admin, req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return null;

  const { data, error } = await admin
    .from("fa_teste_admin_sessions")
    .select("token, clinica_user_id, admin_email, expires_at, escopo")
    .eq("token", token)
    .maybeSingle();

  if (error || !data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) {
    await admin.from("fa_teste_admin_sessions").delete().eq("token", token);
    return null;
  }
  return {
    token,
    userId: data.clinica_user_id as string,
    email: data.admin_email as string,
    escopo: lerEscopo(data.escopo),
  };
}

// O que o login direto (e-mail + senha em /admin) entrega. Sem a chave, vale o
// comportamento legado: Gestor da Clínica = owner. Depois que o Hub está no ar,
// grava-se {"escopo":"equipe"} em fa_teste_config (chave admin_login_direto) e o
// login direto passa a dar só o escopo limitado; o owner entra pelo Hub.
async function escopoLoginDireto(admin: Admin): Promise<Escopo> {
  const { data } = await admin.from("fa_teste_config").select("value").eq("key", "admin_login_direto").maybeSingle();
  return (data?.value as { escopo?: string } | null)?.escopo === "equipe" ? "equipe" : "owner";
}

// clinica_user_id é uuid NOT NULL; sessão vinda do Hub não tem usuário da Clínica (quem é fica em admin_email).
const HUB_USER_ID = "00000000-0000-0000-0000-000000000000";

async function sha256Hex(s: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

// ---------------------------------------------------------------------
// Gemini — mesmo endpoint REST usado em Clínica FaçaAmigos (lib/gemini.ts)
// ---------------------------------------------------------------------

const GEMINI_MODEL = "gemini-3.5-flash-lite";

async function generateInsight(params: {
  childFirstName: string;
  childAgeRange: string;
  testVersion: string;
  score: number;
  bandTitle: string;
  results?: AreaResult[];
  answers: Array<{ id: string; v: number }>;
  questions: Record<string, string>;
  maxScale: number;
}): Promise<{ text?: string; error?: string }> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return { error: "GEMINI_API_KEY não configurada" };

  const answersDescription = params.answers
    .map((a) => `- ${params.questions[a.id] ?? a.id}: nível ${a.v} de ${params.maxScale}`)
    .join("\n");

  const areaLines = (params.results ?? [])
    .map((r) => `- ${r.name}: ${r.score}/${r.max} — ${r.tier_label}`)
    .join("\n");

  const systemInstruction =
    "Você é uma assistente de apoio para a idealizadora de uma clínica de terapia comportamental infantil (FaçaAmigos), em Belém-PA. " +
    "Sua tarefa é ler o resultado de um teste de triagem inicial (não diagnóstico) respondido por um responsável sobre uma criança, e escrever um " +
    "resumo curto e acolhedor (até 120 palavras) com: (1) uma leitura geral do padrão de respostas, em linguagem simples, sem termos técnicos, " +
    "sem citar transtornos específicos e sem citar o nome de nenhum instrumento ou questionário; (2) 2-3 sugestões práticas de observação ou " +
    "brincadeira para os pais aplicarem em casa; (3) sempre reforçar que isso não é um diagnóstico e que uma avaliação profissional é o próximo " +
    "passo recomendado. Nunca alarme os pais. Escreva em português do Brasil, em tom caloroso e profissional, como se fosse parte do retorno que " +
    "a clínica dará à família.";

  const prompt =
    `Criança: ${params.childFirstName}, faixa etária ${params.childAgeRange}.\n` +
    `Resultado: "${params.bandTitle}".\n` +
    (areaLines ? `\nPanorama por área:\n${areaLines}\n` : "") +
    `\nRespostas do responsável:\n${answersDescription}\n\n` +
    "Escreva o resumo acolhedor para os pais.";

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey.trim()}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: { temperature: 0.6, maxOutputTokens: 500 },
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      return { error: `Erro HTTP Gemini ${res.status}: ${errText.slice(0, 300)}` };
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text as string | undefined;
    if (!text) return { error: "Gemini não retornou texto" };
    return { text: text.trim() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "erro desconhecido ao chamar Gemini" };
  }
}

// Rótulos curtos das perguntas para o painel/Gemini, por versão do teste.
// "2026-09-16" = placeholder antigo (8 perguntas). "2026-09-18" = definitivo
// (25 perguntas) — devem ficar em sincronia com QUESTION_IDS/teste-perguntas.json.
const QUESTION_LABELS_BY_VERSION: Record<string, Record<string, string>> = {
  "2026-09-16": {
    q01: "Olha nos olhos quando é chamado(a) pelo nome",
    q02: "Usa palavras ou gestos para pedir o que quer",
    q03: "Demonstra interesse em brincar perto/junto de outras crianças",
    q04: "Imita gestos, sons ou brincadeiras",
    q05: "Se adapta bem a pequenas mudanças na rotina",
    q06: "Consegue se acalmar sozinho(a) ou com apoio",
    q07: "Reage de forma tranquila a sons, luzes ou texturas",
    q08: "Segue instruções simples de 1 ou 2 passos",
  },
  "2026-09-18": {
    q01: "Respeita os sentimentos das outras pessoas",
    q02: "É irrequieto(a), muito agitado(a)",
    q03: "Queixa-se de dor de cabeça, dor de barriga ou enjoo",
    q04: "Reparte facilmente com outras crianças",
    q05: "Tem acessos de raiva ou birra",
    q06: "É solitário(a), prefere brincar sozinho(a)",
    q07: "Em geral é obediente",
    q08: "Anda muito preocupado(a)",
    q09: "É prestativo(a) se alguém está magoado ou mal",
    q10: "Está sempre se mexendo, se contorcendo",
    q11: "Tem pelo menos um bom amigo ou boa amiga",
    q12: "Briga com outras crianças ou as intimida",
    q13: "É infeliz, desanimado(a) ou choroso(a)",
    q14: "É benquisto(a) por outras crianças",
    q15: "É facilmente distraído(a)",
    q16: "É nervoso(a) ou grudento(a) em situações novas",
    q17: "É gentil com crianças mais novas",
    q18: "Frequentemente mente ou engana",
    q19: "É atormentado(a) ou intimidado(a) por outras crianças",
    q20: "Se oferece para ajudar os outros",
    q21: "Pensa antes de agir",
    q22: "Rouba coisas de casa, da escola ou de outros lugares",
    q23: "Se dá melhor com adultos do que com outras crianças",
    q24: "Tem muitos medos, assusta-se facilmente",
    q25: "Termina o que começa, tem boa concentração",
  },
};

const MAX_SCALE_BY_VERSION: Record<string, number> = {
  "2026-09-16": 3,
  "2026-09-18": 2,
};

// ---------------------------------------------------------------------
// E-mail do insight para o responsável (Brevo)
// ---------------------------------------------------------------------

function parseSenderAddress(raw: string): { name?: string; email: string } {
  const match = raw.match(/^(.*)<(.+)>$/);
  if (match) {
    const name = match[1].trim().replace(/^"|"$/g, "");
    return { name: name || undefined, email: match[2].trim() };
  }
  return { email: raw.trim() };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function sendInsightEmailToGuardian(params: {
  guardianName: string;
  guardianEmail: string;
  childFirstName: string;
  bandTitle: string;
  insight: string;
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  const fromRaw = Deno.env.get("BREVO_FROM") ?? "Instituto Faça Amigos <nao-responder@institutofacaamigos.com.br>";
  const replyTo = Deno.env.get("BREVO_REPLY_TO");
  if (!apiKey) return { sent: false, error: "BREVO_API_KEY não configurada" };

  const waNumber = (Deno.env.get("LEAD_WHATSAPP") ?? "5591991782027").replace(/\D/g, "");
  const waLink = `https://wa.me/${waNumber}?text=` + encodeURIComponent(
    `Oi! Acabei de receber o retrato do teste de comportamento do(a) ${params.childFirstName} e gostaria de conversar.`,
  );

  const html = `
<div style="font-family:'Nunito','Segoe UI',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a3f35;">
  <div style="font-size:11px;color:#9ca3af;text-align:center;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;font-weight:700;">🤖 E-mail automático — Favor não responder a esta mensagem</div>
  <div style="text-align:center;padding:10px 0 4px;">
    <img src="${LOGO_URL}" alt="Instituto Faça Amigos" width="32" height="32" style="display:inline-block;vertical-align:middle;margin-right:8px;">
    <span style="font-family:'Nunito','Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;color:#1a3f35;vertical-align:middle;">Faça<span style="color:#f0196b;">Amigos</span></span>
  </div>
  <div style="background:linear-gradient(135deg,#f0196b 0%,#c8155a 100%);padding:28px 24px;border-radius:24px 24px 0 0;text-align:center;">
    <h1 style="margin:0;font-family:'Fredoka One',cursive,sans-serif;font-weight:400;font-size:22px;color:#fff;">O retrato do(a) ${escapeHtml(params.childFirstName)} está pronto</h1>
  </div>
  <div style="background:#fff;padding:28px 24px;border-radius:0 0 24px 24px;">
    <p style="margin:0 0 12px;font-size:15px;">Olá, ${escapeHtml(params.guardianName)}!</p>
    <p style="margin:0 0 14px;font-size:14px;color:#4C6B62;"><strong>Resultado:</strong> ${escapeHtml(params.bandTitle)}</p>
    <div style="background:#FFF9F1;border-radius:16px;padding:18px;font-size:14px;line-height:1.6;white-space:pre-line;">${escapeHtml(params.insight)}</div>
    <p style="margin:18px 0;font-size:12px;color:#9ca3af;">Este teste é um retrato inicial e não substitui uma avaliação profissional.</p>
    <div style="text-align:center;margin:20px 0 4px;">
      <a href="${waLink}" style="display:inline-block;background:#25D366;color:#fff;font-weight:800;text-decoration:none;padding:14px 28px;border-radius:9999px;font-size:15px;">Falar com a equipe no WhatsApp</a>
    </div>
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #f3f4f6;text-align:center;font-size:12px;color:#9ca3af;">
      Mensagem automática enviada pelo sistema FaçaAmigos • Favor não responder a este e-mail.
    </div>
  </div>
</div>`.trim();

  try {
    const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        sender: parseSenderAddress(fromRaw),
        to: [{ email: params.guardianEmail, name: params.guardianName }],
        subject: `O retrato do(a) ${params.childFirstName} está pronto — Instituto Faça Amigos`,
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

// ---------------------------------------------------------------------
// Cupons Wi-Fi: uso no caixa (fa_kiosk_coupons)
// ---------------------------------------------------------------------
// wifi-lead-webhook cria, no mesmo código ESPERA-XXXX, um cupom de uso único em cada unidade
// (Circuito: +5 min; Playground do Parque e do Grão-Pará: meia inclusiva). Quem lê aqui só consulta o uso
// (used_count) e, no resgate pela aba, desativa os três para o código não valer duas vezes.
const KIOSK_PLAYGROUND_UNIT_ID = "11111111-1111-1111-1111-111111111111";
const KIOSK_CIRCUITO_UNIT_ID = "e43ba7a8-bd5f-47ad-b81d-dae7ea19d504";
const KIOSK_GRAOPARA_UNIT_ID = "5fc99a57-81ee-4232-a105-1fcb4634cef4";

type UsoCaixa = { playground: Set<string>; circuito: Set<string>; graopara: Set<string> };

// Códigos ESPERA já usados no caixa, por unidade. Sem lista de códigos = todos.
async function usoNoCaixa(admin: Admin, codes?: string[]): Promise<UsoCaixa> {
  const uso: UsoCaixa = { playground: new Set(), circuito: new Set(), graopara: new Set() };
  let q = admin.from("fa_kiosk_coupons").select("code, unit_id, used_count").like("code", "ESPERA-%").gt("used_count", 0).limit(20000);
  if (codes) {
    if (!codes.length) return uso;
    q = q.in("code", codes);
  }
  const { data } = await q;
  for (const r of (data ?? []) as { code: string; unit_id: string }[]) {
    if (r.unit_id === KIOSK_PLAYGROUND_UNIT_ID) uso.playground.add(r.code);
    else if (r.unit_id === KIOSK_CIRCUITO_UNIT_ID) uso.circuito.add(r.code);
    else if (r.unit_id === KIOSK_GRAOPARA_UNIT_ID) uso.graopara.add(r.code);
  }
  return uso;
}

// ---------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------

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
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes");
    return jsonResponse(req, { error: "serviço indisponível" }, 500);
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // --- login: mesmo e-mail/senha do Gestor no Sistema da Clínica ---
  if (action === "login") {
    const inputStr = str(body.email || body.identifier || body.cpf).trim();
    const loginInput = inputStr.includes("@") ? inputStr.toLowerCase() : inputStr;
    const password = str(body.password);
    if (!loginInput || !password) return jsonResponse(req, { error: "e-mail/CPF e senha são obrigatórios" }, 400);

    // Limite de tentativas: este endpoint é a porta dos fundos para a senha do Gestor da Clínica.
    // Conta falhas por IP e por identificador (quem troca de IP continua barrado pelo segundo filtro).
    const loginIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const since = new Date(Date.now() - LOGIN_WINDOW_MS).toISOString();
    const [byIp, byLogin] = await Promise.all([
      admin.from("fa_teste_admin_login_attempts").select("id", { count: "exact", head: true }).eq("ip", loginIp).gte("created_at", since),
      admin.from("fa_teste_admin_login_attempts").select("id", { count: "exact", head: true }).eq("login", loginInput.toLowerCase()).gte("created_at", since),
    ]);
    if ((byIp.count ?? 0) >= LOGIN_MAX_FAILS_PER_IP || (byLogin.count ?? 0) >= LOGIN_MAX_FAILS_PER_LOGIN) {
      return jsonResponse(req, { error: "muitas tentativas, aguarde 15 minutos" }, 429);
    }

    const escopo = await escopoLoginDireto(admin);
    const check = await verifyClinicaGestorLogin(loginInput, password, escopo === "owner");
    if (!check.ok) {
      // Só senha errada conta; erro de serviço (5xx) não pune o gestor.
      if (check.status < 500) {
        await admin.from("fa_teste_admin_login_attempts").insert({ ip: loginIp, login: loginInput.toLowerCase() });
      }
      return jsonResponse(req, { error: check.error }, check.status);
    }

    const token = newSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    const { error: sessionError } = await admin
      .from("fa_teste_admin_sessions")
      .insert({ token, clinica_user_id: check.userId, admin_email: check.email, expires_at: expiresAt, escopo });
    if (sessionError) {
      console.error("Erro ao criar sessão:", sessionError);
      return jsonResponse(req, { error: "falha ao autenticar" }, 500);
    }

    return jsonResponse(req, { token, expires_at: expiresAt, email: check.email, escopo });
  }

  // --- entrada do owner pelo Hub de Gestão: troca o ticket de uso único por sessão completa ---
  if (action === "sso") {
    const ticket = str(body.ticket);
    if (!/^[0-9a-f]{64}$/.test(ticket)) return jsonResponse(req, { error: "ticket inválido ou expirado" }, 401);

    // Consumo atômico: só uma requisição leva o ticket, e só dentro dos 60 s.
    const { data: usado, error: usoErr } = await admin
      .from("fa_gestao_painel_tickets")
      .update({ used_at: new Date().toISOString() })
      .eq("token_hash", await sha256Hex(ticket))
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .select("email, nivel_painel, nivel_eventos");
    const email = usado?.[0]?.email as string | undefined;
    if (usoErr || !email) return jsonResponse(req, { error: "ticket inválido ou expirado" }, 401);

    // Conta desativada no Hub não entra, mesmo com ticket válido.
    const { data: conta } = await admin
      .from("fa_gestao_contas")
      .select("ativo, painel_usuario")
      .eq("email", email)
      .maybeSingle();
    if (!conta?.ativo || !conta.painel_usuario) return jsonResponse(req, { error: "acesso não autorizado" }, 403);

    // Um escopo por módulo que o /admin hospeda: painel (aqui) e eventos (eventos-admin).
    const escopo = escopoDoNivel(usado?.[0]?.nivel_painel);
    const escopoEventos = escopoDoNivel(usado?.[0]?.nivel_eventos);

    const token = newSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    const { error: sessionError } = await admin.from("fa_teste_admin_sessions").insert({
      token,
      clinica_user_id: HUB_USER_ID,
      admin_email: conta.painel_usuario,
      expires_at: expiresAt,
      escopo,
      escopo_eventos: escopoEventos,
    });
    if (sessionError) {
      console.error("Erro ao criar sessão (sso):", sessionError);
      return jsonResponse(req, { error: "falha ao autenticar" }, 500);
    }
    return jsonResponse(req, { token, expires_at: expiresAt, email: conta.painel_usuario, escopo, escopo_eventos: escopoEventos });
  }

  // --- todas as ações abaixo exigem sessão válida ---
  const session = await requireSession(admin, req);
  if (!session) return jsonResponse(req, { error: "sessão inválida ou expirada" }, 401);
  const permitidas = acoesDoEscopo(session.escopo);
  if (permitidas && !permitidas.has(action)) {
    return jsonResponse(req, { error: "sem permissão para esta ação" }, 403);
  }

  if (action === "logout") {
    await admin.from("fa_teste_admin_sessions").delete().eq("token", session.token);
    return jsonResponse(req, { success: true });
  }

  if (action === "list_leads") {
    const status = str(body.status);
    const q = str(body.q);
    const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 200);

    let query = admin
      .from("fa_leads_teste_comportamento")
      .select(
        "id, status, child_first_name, child_age_range, guardian_name, guardian_email, guardian_phone, preferred_unit, score, result_band, results, test_version, ai_insight_generated_at, ai_insight_sent_at, contacted_at, marketing_opt_in, created_at, utm_source, utm_medium, utm_campaign, lista_espera_clinica",
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status && LEAD_STATUSES.includes(status)) query = query.eq("status", status);
    if (q) {
      const pattern = quoteFilterValue(`%${q.replace(/[%_]/g, "")}%`);
      query = query.or(
        `guardian_name.ilike.${pattern},guardian_email.ilike.${pattern},child_first_name.ilike.${pattern}`,
      );
    }

    const { data, error } = await query;
    if (error) return jsonResponse(req, { error: "falha ao listar leads" }, 500);
    return jsonResponse(req, { leads: data });
  }

  // Exportação dos leads em CSV (mesmos filtros de list_leads, até 5000 linhas). Devolve o arquivo (text/csv com BOM
  // UTF-8, para o Excel reconhecer os acentos); quem baixa é o admin.html.
  if (action === "export_leads_csv") {
    const status = str(body.status);
    const q = str(body.q);
    const cols =
      "created_at, status, child_first_name, child_age_range, guardian_name, guardian_email, guardian_phone, result_band, score, marketing_opt_in, contacted_at, preferred_unit, utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer, lista_espera_clinica";
    const rows: Record<string, unknown>[] = [];
    for (let from = 0; from < CSV_MAX_ROWS; from += CSV_PAGE) {
      let query = admin
        .from("fa_leads_teste_comportamento")
        .select(cols)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, Math.min(from + CSV_PAGE, CSV_MAX_ROWS) - 1);
      if (status && LEAD_STATUSES.includes(status)) query = query.eq("status", status);
      if (q) {
        const pattern = quoteFilterValue(`%${q.replace(/[%_]/g, "")}%`);
        query = query.or(
          `guardian_name.ilike.${pattern},guardian_email.ilike.${pattern},child_first_name.ilike.${pattern}`,
        );
      }
      const { data, error } = await query;
      if (error) {
        console.error("export_leads_csv:", error);
        return jsonResponse(req, { error: "falha ao exportar leads" }, 500);
      }
      rows.push(...((data ?? []) as Record<string, unknown>[]));
      if (!data || data.length < CSV_PAGE) break;
    }

    const header = [
      "criado em", "status", "criança", "faixa etária", "responsável", "e-mail", "telefone", "resultado", "score",
      "opt-in", "contatado em", "unidade", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
      "referrer", "lista_espera_clinica",
    ];
    const lines = [header.map(csvCell).join(",")];
    for (const r of rows) {
      lines.push([
        belemStamp(r.created_at), r.status, r.child_first_name, r.child_age_range, r.guardian_name, r.guardian_email,
        r.guardian_phone, r.result_band, r.score, r.marketing_opt_in ? "sim" : "não", belemStamp(r.contacted_at),
        r.preferred_unit, r.utm_source, r.utm_medium, r.utm_campaign, r.utm_content, r.utm_term, r.referrer,
        r.lista_espera_clinica ? "sim" : "não",
      ].map(csvCell).join(","));
    }
    const day = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
    return new Response("\uFEFF" + lines.join("\r\n") + "\r\n", {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="leads-${day}.csv"`,
        "Cache-Control": "no-store",
        ...corsHeaders(req),
      },
    });
  }

  if (action === "get_lead") {
    const leadId = str(body.lead_id);
    const { data, error } = await admin.from("fa_leads_teste_comportamento").select("*").eq("id", leadId).maybeSingle();
    if (error || !data) return jsonResponse(req, { error: "lead não encontrado" }, 404);
    return jsonResponse(req, { lead: data });
  }

  if (action === "generate_insight") {
    const leadId = str(body.lead_id);
    const { data: lead, error } = await admin
      .from("fa_leads_teste_comportamento")
      .select("id, child_first_name, child_age_range, score, result_band, results, test_version, answers, status")
      .eq("id", leadId)
      .maybeSingle();
    if (error || !lead) return jsonResponse(req, { error: "lead não encontrado" }, 404);
    if (lead.status !== "completed" && lead.status !== "contacted") {
      return jsonResponse(req, { error: "lead ainda não concluiu o teste" }, 400);
    }

    const version = lead.test_version ?? "2026-09-16";
    const result = await generateInsight({
      childFirstName: lead.child_first_name,
      childAgeRange: lead.child_age_range,
      testVersion: version,
      score: lead.score ?? 0,
      bandTitle: resultTitleFor(lead),
      results: Array.isArray(lead.results) ? (lead.results as AreaResult[]) : undefined,
      answers: (lead.answers ?? []) as Array<{ id: string; v: number }>,
      questions: QUESTION_LABELS_BY_VERSION[version] ?? QUESTION_LABELS_BY_VERSION["2026-09-18"],
      maxScale: MAX_SCALE_BY_VERSION[version] ?? 2,
    });

    if (result.error) {
      await admin.from("fa_leads_teste_comportamento").update({ ai_insight_error: result.error }).eq("id", leadId);
      return jsonResponse(req, { error: result.error }, 502);
    }

    await admin
      .from("fa_leads_teste_comportamento")
      .update({ ai_insight: result.text, ai_insight_generated_at: new Date().toISOString(), ai_insight_error: null })
      .eq("id", leadId);

    return jsonResponse(req, { insight: result.text });
  }

  if (action === "send_insight_email") {
    const leadId = str(body.lead_id);
    const { data: lead, error } = await admin
      .from("fa_leads_teste_comportamento")
      .select("id, child_first_name, guardian_name, guardian_email, ai_insight, result_band, results")
      .eq("id", leadId)
      .maybeSingle();
    if (error || !lead) return jsonResponse(req, { error: "lead não encontrado" }, 404);
    if (!lead.ai_insight) return jsonResponse(req, { error: "gere o insight antes de enviar" }, 400);
    if (!lead.guardian_email) return jsonResponse(req, { error: "lead sem e-mail" }, 400);

    const result = await sendInsightEmailToGuardian({
      guardianName: lead.guardian_name ?? "",
      guardianEmail: lead.guardian_email,
      childFirstName: lead.child_first_name,
      bandTitle: resultTitleFor(lead),
      insight: lead.ai_insight,
    });

    if (!result.sent) return jsonResponse(req, { error: result.error ?? "falha ao enviar e-mail" }, 502);

    await admin
      .from("fa_leads_teste_comportamento")
      .update({ ai_insight_sent_at: new Date().toISOString() })
      .eq("id", leadId);

    return jsonResponse(req, { success: true });
  }

  if (action === "get_config") {
    const { data, error } = await admin
      .from("fa_teste_config")
      .select("value")
      .eq("key", "resultado_v2")
      .maybeSingle();
    if (error) return jsonResponse(req, { error: "falha ao carregar configuração" }, 500);
    return jsonResponse(req, { defaults: CONFIG_DEFAULTS, overrides: sanitizeConfig(data?.value ?? {}) });
  }

  if (action === "update_config") {
    const config = sanitizeConfig(body.config);
    const { error } = await admin
      .from("fa_teste_config")
      .upsert({
        key: "resultado_v2",
        value: config,
        updated_at: new Date().toISOString(),
        updated_by: session.email,
      });
    if (error) {
      console.error("Erro ao salvar configuração:", error);
      return jsonResponse(req, { error: "falha ao salvar configuração" }, 500);
    }
    return jsonResponse(req, { overrides: config });
  }

  // --- aba "Cupons Wi-Fi" (portal Wi-Fi da clínica) ---
  if (action === "wifi_list_coupons") {
    const q = str(body.q);
    const optin = str(body.optin); // owner: "whatsapp" | "email" mostra só quem aceitou contato
    const equipe = session.escopo !== "owner";
    let query = admin
      .from("fa_wifi_leads")
      .select(
        "id, guardian_name, guardian_phone, guardian_email, coupon_code, coupon_status, coupon_operation, coupon_expires_at, last_redeemed_at, redeemed_count, visit_count, created_at, marketing_opt_in_whatsapp, marketing_opt_in_email, kiosk_coupon_synced_at, kiosk_coupon_error, playground_coupon_synced_at, playground_coupon_error, graopara_coupon_synced_at, graopara_coupon_error",
      )
      .not("coupon_code", "is", null) // cadastro do portal sem cupom não aparece na aba de cupons
      .order("created_at", { ascending: false })
      .limit(100);
    if (!equipe && optin === "whatsapp") query = query.eq("marketing_opt_in_whatsapp", true);
    if (!equipe && optin === "email") query = query.eq("marketing_opt_in_email", true);
    if (q) {
      const like = quoteFilterValue(`%${q.replace(/[%_]/g, "")}%`);
      // A equipe só precisa achar pelo código ou pelo nome: buscar por telefone/e-mail revelaria quem se cadastrou.
      const conds = equipe
        ? [`coupon_code.ilike.${like}`, `guardian_name.ilike.${like}`]
        : [`coupon_code.ilike.${like}`, `guardian_email.ilike.${like}`, `guardian_name.ilike.${like}`];
      const digits = q.replace(/\D/g, "");
      if (!equipe && digits.length >= 3) conds.push(`guardian_phone.ilike.${quoteFilterValue(`%${digits}%`)}`);
      query = query.or(conds.join(","));
    }
    const { data, error } = await query;
    if (error) return jsonResponse(req, { error: "falha ao listar cupons" }, 500);

    const now = Date.now();
    const todayStart = new Date(startOfTodayBelemIso()).getTime();
    const uso = await usoNoCaixa(admin, (data ?? []).map((c) => c.coupon_code as string));
    const coupons = (data ?? []).map((c) => {
      const usadoNoCaixa = uso.playground.has(c.coupon_code) ? "playground" : uso.graopara.has(c.coupon_code) ? "graopara" : uso.circuito.has(c.coupon_code) ? "circuito" : null;
      const base = {
        id: c.id,
        guardian_name: c.guardian_name,
        coupon_code: c.coupon_code,
        coupon_status: c.coupon_status,
        coupon_operation: c.coupon_operation,
        coupon_expires_at: c.coupon_expires_at,
        last_redeemed_at: c.last_redeemed_at,
        redeemed_count: c.redeemed_count,
        visit_count: c.visit_count,
        created_at: c.created_at,
        expired: new Date(c.coupon_expires_at).getTime() < now,
        redeemed_today: !!c.last_redeemed_at && new Date(c.last_redeemed_at).getTime() >= todayStart,
        // Um benefício por cupom: qualquer resgate anterior (em qualquer dia) encerra o cupom.
        redeemed: Number(c.redeemed_count ?? 0) > 0,
        used_at_register: usadoNoCaixa,
      };
      if (equipe) return base;
      return {
        ...base,
        guardian_phone: c.guardian_phone,
        guardian_email: c.guardian_email,
        marketing_opt_in_whatsapp: !!c.marketing_opt_in_whatsapp,
        marketing_opt_in_email: !!c.marketing_opt_in_email,
        // Cupom que não chegou ao caixa não trava reuso nem aplica o benefício sozinho.
        register_sync_ok: !c.kiosk_coupon_error && !c.playground_coupon_error && !c.graopara_coupon_error && !!c.kiosk_coupon_synced_at && !!c.playground_coupon_synced_at && !!c.graopara_coupon_synced_at,
      };
    });
    return jsonResponse(req, { coupons });
  }

  // Resumo do portal Wi-Fi para o dono: quantos se cadastraram, quantos aceitaram contato, quantos cupons foram usados
  // (na aba ou direto no caixa) e por onde. Só apresenta; nada é enviado a ninguém. Não está em ACOES_EQUIPE.
  if (action === "wifi_resumo") {
    const { data, error } = await admin
      .from("fa_wifi_leads")
      .select(
        "created_at, coupon_code, coupon_expires_at, redeemed_count, coupon_operation, visit_count, marketing_opt_in_whatsapp, marketing_opt_in_email, email_error, kiosk_coupon_error, playground_coupon_error, graopara_coupon_error",
      )
      .order("created_at", { ascending: false })
      .limit(20000);
    if (error) return jsonResponse(req, { error: "falha ao carregar o resumo" }, 500);
    const leads = (data ?? []) as Array<Record<string, unknown>>;
    const uso = await usoNoCaixa(admin);

    const now = Date.now();
    const todayStart = new Date(startOfTodayBelemIso()).getTime();
    const DAY = 86400_000;
    const dia = (ms: number) => new Date(ms - 3 * 3600_000).toISOString().slice(0, 10); // dia de Belém (UTC-3)
    const porDia: Record<string, number> = {};
    for (let i = 13; i >= 0; i--) porDia[dia(todayStart - i * DAY)] = 0;

    const r = {
      cadastros: leads.length, hoje: 0, ultimos_7_dias: 0, ultimos_30_dias: 0,
      optin_whatsapp: 0, optin_email: 0, voltaram: 0,
      resgatados: 0, resgate_aba_playground: 0, resgate_aba_circuito: 0, resgate_caixa_playground: 0, resgate_caixa_graopara: 0, resgate_caixa_circuito: 0,
      vigentes: 0, vencem_em_3_dias: 0, vencidos_sem_uso: 0,
      falhas_caixa: 0, falhas_email: 0,
    };
    let comCupom = 0;
    for (const l of leads) {
      const criado = new Date(String(l.created_at)).getTime();
      const code = l.coupon_code ? String(l.coupon_code) : null;
      if (criado >= todayStart) r.hoje++;
      if (criado >= now - 7 * DAY) r.ultimos_7_dias++;
      if (criado >= now - 30 * DAY) r.ultimos_30_dias++;
      const k = dia(criado);
      if (k in porDia) porDia[k]++;
      if (l.marketing_opt_in_whatsapp) r.optin_whatsapp++;
      if (l.marketing_opt_in_email) r.optin_email++;
      if (Number(l.visit_count ?? 1) > 1) r.voltaram++;

      // Cadastro do portal sem cupom (o cupom agora nasce no Mural): conta como cadastro, mas fora das métricas de cupom.
      if (!code) continue;
      comCupom++;
      const naAba = Number(l.redeemed_count ?? 0) > 0;
      const noPlay = uso.playground.has(code);
      const noGrao = uso.graopara.has(code);
      const noCirc = uso.circuito.has(code);
      if (naAba) {
        if (l.coupon_operation === "playground") r.resgate_aba_playground++;
        else if (l.coupon_operation === "circuito") r.resgate_aba_circuito++;
      }
      if (noPlay) r.resgate_caixa_playground++;
      if (noGrao) r.resgate_caixa_graopara++;
      if (noCirc) r.resgate_caixa_circuito++;
      const usado = naAba || noPlay || noGrao || noCirc;
      if (usado) r.resgatados++;
      const vence = new Date(String(l.coupon_expires_at)).getTime();
      if (!usado) {
        if (vence < now) r.vencidos_sem_uso++;
        else {
          r.vigentes++;
          if (vence - now <= 3 * DAY) r.vencem_em_3_dias++;
        }
      }
      if (l.kiosk_coupon_error || l.playground_coupon_error || l.graopara_coupon_error) r.falhas_caixa++;
      if (l.email_error) r.falhas_email++;
    }
    return jsonResponse(req, {
      ...r,
      taxa_resgate: comCupom ? Math.round((r.resgatados / comCupom) * 100) : 0,
      por_dia: Object.entries(porDia).map(([data, total]) => ({ data, total })),
    });
  }

  // Mesma regra de negócio e mesmo resgate atômico de wifi-coupon-admin e do caixa: um benefício por cupom (em
  // qualquer dia ou unidade), cupom expirado bloqueia, e o filtro vai na própria UPDATE para dois toques
  // simultâneos não passarem.
  if (action === "wifi_redeem") {
    const code = str(body.code).toUpperCase();
    const operation = str(body.operation);
    if (!code) return jsonResponse(req, { error: "informe o código do cupom" }, 400);
    if (!["playground", "circuito"].includes(operation)) {
      return jsonResponse(req, { error: "escolha playground ou circuito" }, 400);
    }

    const { data: lead, error: fetchError } = await admin
      .from("fa_wifi_leads")
      .select("id, coupon_expires_at, last_redeemed_at, redeemed_count")
      .eq("coupon_code", code)
      .maybeSingle();
    if (fetchError) return jsonResponse(req, { error: "falha na consulta" }, 500);
    if (!lead) return jsonResponse(req, { error: "cupom não encontrado" }, 404);
    if (new Date(lead.coupon_expires_at) < new Date()) {
      return jsonResponse(req, { error: "cupom expirado" }, 409);
    }

    // Já usado direto no caixa (Playground, Playground do Grão-Pará ou Circuito): o benefício de hoje acabou, não vale de novo pela aba.
    const usoCaixa = await usoNoCaixa(admin, [code]);
    if (usoCaixa.playground.has(code) || usoCaixa.graopara.has(code) || usoCaixa.circuito.has(code)) {
      const onde = usoCaixa.playground.has(code) ? "Playground" : usoCaixa.graopara.has(code) ? "Playground do Grão-Pará" : "Circuito";
      return jsonResponse(req, { error: "este cupom já foi usado no caixa do " + onde }, 409);
    }

    if (Number(lead.redeemed_count ?? 0) > 0) {
      return jsonResponse(req, { error: "este cupom já foi usado — um benefício por cupom" }, 409);
    }
    const { data: updated, error: updateError } = await admin
      .from("fa_wifi_leads")
      .update({
        coupon_status: "redeemed",
        coupon_operation: operation,
        last_redeemed_at: new Date().toISOString(),
        redeemed_count: (lead.redeemed_count ?? 0) + 1,
      })
      .eq("id", lead.id)
      .is("last_redeemed_at", null)
      .select("id");
    if (updateError) return jsonResponse(req, { error: "falha ao registrar resgate" }, 500);
    if (!updated?.length) {
      return jsonResponse(req, { error: "este cupom já foi usado — um benefício por cupom" }, 409);
    }
    // Resgatado pela aba: desativa o cupom nas três unidades do caixa para o código não valer de novo lá.
    const { error: caixaErr } = await admin.from("fa_kiosk_coupons").update({ active: false }).eq("code", code).like("code", "ESPERA-%");
    if (caixaErr) console.error("Erro ao desativar cupom no caixa:", caixaErr.message);
    return jsonResponse(req, { ok: true, coupon_code: code, operation });
  }

  if (action === "mark_contacted") {
    const leadId = str(body.lead_id);
    const notes = str(body.notes);
    const { error } = await admin
      .from("fa_leads_teste_comportamento")
      .update({ status: "contacted", contacted_at: new Date().toISOString(), admin_notes: notes || null })
      .eq("id", leadId);
    if (error) return jsonResponse(req, { error: "falha ao atualizar lead" }, 500);
    return jsonResponse(req, { success: true });
  }

  // -------------------------------------------------------------------------
  // Avaliações / Depoimentos de NPS do Playground (moderação para o site)
  // -------------------------------------------------------------------------
  if (action === "reviews_list") {
    const status = str(body.status); // "all", "approved", "pending"
    const q = str(body.q);
    const limit = Math.min(Math.max(Number(body.limit) || 100, 1), 300);

    let query = admin
      .from("fa_playground_reviews")
      .select("id, author_name, author_role, visit_count, rating, nps_score, comment, unit, source, visit_date, approved, featured, created_at, approved_at, approved_by")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status === "approved") query = query.eq("approved", true);
    else if (status === "pending") query = query.eq("approved", false);

    if (q) {
      const pattern = quoteFilterValue(`%${q.replace(/[%_]/g, "")}%`);
      query = query.or(`author_name.ilike.${pattern},comment.ilike.${pattern}`);
    }

    const { data: reviews, error } = await query;
    if (error) {
      console.error("Erro ao listar reviews:", error);
      return jsonResponse(req, { error: "falha ao listar avaliações" }, 500);
    }

    // Contadores rápidos para o painel
    const [allCount, approvedCount] = await Promise.all([
      admin.from("fa_playground_reviews").select("id", { count: "exact", head: true }),
      admin.from("fa_playground_reviews").select("id", { count: "exact", head: true }).eq("approved", true),
    ]);

    const total = allCount.count ?? 0;
    const approved = approvedCount.count ?? 0;
    const pending = Math.max(0, total - approved);

    return jsonResponse(req, {
      reviews: reviews ?? [],
      kpis: {
        total,
        approved,
        pending,
      },
    });
  }

  if (action === "reviews_toggle_approval") {
    const id = str(body.id);
    const approved = !!body.approved;
    if (!id) return jsonResponse(req, { error: "id da avaliação é obrigatório" }, 400);

    const { data: updated, error } = await admin
      .from("fa_playground_reviews")
      .update({
        approved,
        approved_at: approved ? new Date().toISOString() : null,
        approved_by: approved ? session.email : null,
      })
      .eq("id", id)
      .select("id, approved, approved_at, approved_by")
      .single();

    if (error) {
      console.error("Erro ao alternar aprovação de review:", error);
      return jsonResponse(req, { error: "falha ao atualizar status da avaliação" }, 500);
    }

    return jsonResponse(req, { success: true, review: updated });
  }

  if (action === "reviews_toggle_featured") {
    const id = str(body.id);
    const featured = !!body.featured;
    if (!id) return jsonResponse(req, { error: "id da avaliação é obrigatório" }, 400);

    const { data: updated, error } = await admin
      .from("fa_playground_reviews")
      .update({ featured })
      .eq("id", id)
      .select("id, featured")
      .single();

    if (error) {
      console.error("Erro ao alternar destaque de review:", error);
      return jsonResponse(req, { error: "falha ao atualizar destaque" }, 500);
    }

    return jsonResponse(req, { success: true, review: updated });
  }

  if (action === "reviews_delete") {
    const id = str(body.id);
    if (!id) return jsonResponse(req, { error: "id da avaliação é obrigatório" }, 400);

    const { error } = await admin
      .from("fa_playground_reviews")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Erro ao excluir review:", error);
      return jsonResponse(req, { error: "falha ao excluir avaliação" }, 500);
    }

    return jsonResponse(req, { success: true, id });
  }

  if (action === "reviews_update") {
    const id = str(body.id);
    const authorName = str(body.author_name);
    const comment = str(body.comment);
    const rating = Number(body.rating) || 5;
    if (!id || !authorName || !comment) {
      return jsonResponse(req, { error: "dados incompletos para atualização" }, 400);
    }

    const { error } = await admin
      .from("fa_playground_reviews")
      .update({
        author_name: authorName.slice(0, 100),
        comment: comment.slice(0, 1000),
        rating: Math.max(1, Math.min(5, Math.round(rating))),
      })
      .eq("id", id);

    if (error) {
      console.error("Erro ao editar review:", error);
      return jsonResponse(req, { error: "falha ao editar avaliação" }, 500);
    }

    return jsonResponse(req, { success: true });
  }

  return jsonResponse(req, { error: "ação inválida" }, 400);
});
