// Hub de Gestão (gestao.html, servido em gestao.institutofacaamigos.com.br):
// login único de Bruno e Isabella e "um clique = entra no sistema já logado"
// nos sistemas (Playground, Clínica, Simulador Financeiro, Gestão de
// Pessoas/Grupo IB e Hub de Operações Cacau Show). Tudo numa única função,
// roteada por `action` no corpo JSON — mesmo motivo de CORS/JSON inline das
// demais funções deste projeto (import relativo de ../_shared quebra no
// deploy via MCP). O import é npm: (o jsr: falha no deploy via MCP).
//
// Login (2 passos):
//   1. `login`: e-mail/CPF + senha do Sistema da Clínica (mesma chamada
//      grant_type=password de behavior-test-admin). Só entra quem está em
//      fa_gestao_contas com ativo = true. Se a senha confere, manda um código
//      de 6 dígitos por e-mail (Brevo) para `email_codigo` (o login da Clínica
//      pode ser um e-mail interno sem caixa de entrada) e devolve o id do desafio.
//   2. `verificar`: código certo → token de sessão opaco (7 dias). No banco
//      fica só o SHA-256 do token.
//
// Entrada nos sistemas (`launch`): nenhum sistema compartilha sessão com
// outro (2 projetos Supabase, localStorage em parte deles, e o Cacau Show
// nem usa Supabase Auth), então a função entrega um ticket de uso único:
//   - Supabase (Playground/Financeiro no projeto A, Clínica/RH no projeto B):
//     auth.admin.generateLink({ type: "magiclink" }) — o e-mail NÃO é
//     enviado; só o hashed_token vai na URL, e a porta /sso do sistema troca
//     por sessão com verifyOtp({ token_hash, type: "email" }). Mesmo
//     mecanismo do login por PIN do Playground (login-pin).
//   - Cacau Show: ticket HMAC-SHA256 (usuário, expira em 60s, jti de uso
//     único) com o segredo GESTAO_SSO_SECRET_CACAU, conferido em
//     POST /api/auth/sso do hub-operacoes.
//
//   - Painel do site (/admin, quadrados "Mapeamento Comportamental" e "Eventos"): ticket
//     aleatório de uso único guardado (SHA-256) em fa_gestao_painel_tickets, 60 s;
//     a ação `sso` de behavior-test-admin troca por sessão de escopo `owner`.
//
// Deploy com verify_jwt = false (o Bearer é o token de sessão do hub, não um
// JWT do Supabase) — igual a behavior-test-admin.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const LOGO_URL = "https://institutofacaamigos.com.br/img/logo-simbolo.png";
const HUB_URL = "https://gestao.institutofacaamigos.com.br";

const ALLOWED_ORIGINS = [
  "https://gestao.institutofacaamigos.com.br",
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
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...corsHeaders(req) },
  });
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function quoteFilterValue(v: string): string {
  return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(s: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return toHex(arr.buffer);
}

// 6 dígitos sem viés de módulo (rejeita o topo do intervalo de 32 bits).
function randomCode(): string {
  const limit = Math.floor(0xffffffff / 1_000_000) * 1_000_000;
  const arr = new Uint32Array(1);
  do crypto.getRandomValues(arr); while (arr[0] >= limit);
  return String(arr[0] % 1_000_000).padStart(6, "0");
}

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return email;
  const visible = user.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(user.length - 2, 3))}@${domain}`;
}

// ---------------------------------------------------------------------
// Configuração dos 5 sistemas (quadrados do hub)
// ---------------------------------------------------------------------

type Conta = {
  email: string;
  email_codigo: string;
  nome: string;
  playground_email: string | null;
  clinica_email: string | null;
  financeiro_email: string | null;
  rh_email: string | null;
  cacau_usuario: string | null;
  painel_usuario: string | null;
  ativo: boolean;
  papel: "owner" | "gerente";
  auth_modo: "clinica" | "hub";
  senha_hash: string | null;
  senha_definida_em: string | null;
  convidado_em: string | null;
  login_email: string | null;
  criado_por: string | null;
  created_at: string;
};

type AppId = "playground" | "clinica" | "financeiro" | "rh" | "cacau" | "painel" | "eventos" | "porto";

// Nível da pessoa num módulo. `nenhum` = sem linha em fa_gestao_permissoes.
type Nivel = "nenhum" | "ver" | "operar" | "admin";
const NIVEIS: Nivel[] = ["nenhum", "ver", "operar", "admin"];
type Niveis = Record<AppId, Nivel>;

const APPS: Record<AppId, {
  rotulo: string;
  campo: keyof Conta;
  campoRotulo: string;
  tipo: "supabase_a" | "supabase_b" | "cacau" | "painel";
  baseEnv: string;
  baseDefault: string;
  entrada: (base: string, ticket: string) => string;
}> = {
  playground: {
    rotulo: "Playground",
    campo: "playground_email",
    campoRotulo: "E-mail no Playground",
    tipo: "supabase_a",
    baseEnv: "GESTAO_URL_PLAYGROUND",
    baseDefault: "https://app.institutofacaamigos.com.br",
    entrada: (b, t) => `${b}/sso?token_hash=${encodeURIComponent(t)}`,
  },
  clinica: {
    rotulo: "Clínica",
    campo: "clinica_email",
    campoRotulo: "E-mail na Clínica",
    tipo: "supabase_b",
    baseEnv: "GESTAO_URL_CLINICA",
    baseDefault: "https://sistema.institutofacaamigos.com.br",
    entrada: (b, t) => `${b}/auth/sso?token_hash=${encodeURIComponent(t)}`,
  },
  financeiro: {
    rotulo: "Simulador Financeiro",
    campo: "financeiro_email",
    campoRotulo: "E-mail no Simulador",
    tipo: "supabase_a",
    baseEnv: "GESTAO_URL_FINANCEIRO",
    baseDefault: "https://simulador-financeiro-blush.vercel.app",
    entrada: (b, t) => `${b}/auth/sso?token_hash=${encodeURIComponent(t)}`,
  },
  rh: {
    rotulo: "Gestão de Pessoas",
    campo: "rh_email",
    campoRotulo: "E-mail na Gestão de Pessoas",
    tipo: "supabase_b",
    baseEnv: "GESTAO_URL_RH",
    baseDefault: "https://rh.institutofacaamigos.com.br",
    entrada: (b, t) => `${b}/sso?token_hash=${encodeURIComponent(t)}`,
  },
  porto: {
    rotulo: "Porto Terapia",
    campo: "rh_email",
    campoRotulo: "E-mail na Porto Terapia",
    tipo: "supabase_b",
    baseEnv: "GESTAO_URL_RH_PORTO_TERAPIA",
    baseDefault: "https://porto-terapia-gestao.vercel.app",
    entrada: (b, t) => `${b}/sso?token_hash=${encodeURIComponent(t)}`,
  },
  cacau: {
    rotulo: "Cacau Show",
    campo: "cacau_usuario",
    campoRotulo: "Usuário no Cacau Show",
    tipo: "cacau",
    baseEnv: "GESTAO_URL_CACAU",
    baseDefault: "https://hub-operacoes-theta.vercel.app",
    // No fragmento (#): não vai para o servidor nem para logs de acesso.
    entrada: (b, t) => `${b}/#sso=${encodeURIComponent(t)}`,
  },
  // Painel do site (/admin do institutofacaamigos.com.br): ticket guardado no
  // banco (fa_gestao_painel_tickets), trocado pela ação `sso` de
  // behavior-test-admin. Também no fragmento: fora de logs e do Referer.
  painel: {
    rotulo: "Mapeamento Comportamental",
    campo: "painel_usuario",
    campoRotulo: "Usuário no painel",
    tipo: "painel",
    baseEnv: "GESTAO_URL_PAINEL",
    baseDefault: "https://institutofacaamigos.com.br",
    entrada: (b, t) => `${b}/admin#sso=${encodeURIComponent(t)}`,
  },
  // Mesmo painel, já aberto na aba Eventos.
  eventos: {
    rotulo: "Eventos",
    campo: "painel_usuario",
    campoRotulo: "Usuário no painel",
    tipo: "painel",
    baseEnv: "GESTAO_URL_PAINEL",
    baseDefault: "https://institutofacaamigos.com.br",
    entrada: (b, t) => `${b}/admin#sso=${encodeURIComponent(t)}&aba=eventos`,
  },
};

const APP_IDS = Object.keys(APPS) as AppId[];

// Nível efetivo em cada módulo: owner é admin em tudo; gerente vale o que está na matriz.
async function carregarNiveis(admin: Admin, conta: Conta): Promise<Niveis> {
  const out = {} as Niveis;
  for (const id of APP_IDS) out[id] = conta.papel === "owner" ? "admin" : "nenhum";
  if (conta.papel === "owner") return out;
  const { data } = await admin.from("fa_gestao_permissoes").select("modulo, nivel").eq("email", conta.email);
  for (const p of data ?? []) {
    if (p.modulo in APPS && NIVEIS.includes(p.nivel)) out[p.modulo as AppId] = p.nivel as Nivel;
  }
  return out;
}

// Quadrado habilitado = tem nível no módulo E a identidade da pessoa naquele sistema está preenchida.
// Para conta owner: todos os sistemas são habilitados por padrão.
function appsDisponiveis(conta: Conta, niveis: Niveis): Record<AppId, boolean> {
  const out = {} as Record<AppId, boolean>;
  for (const id of APP_IDS) {
    if (conta.papel === "owner") {
      out[id] = true;
    } else {
      out[id] = niveis[id] !== "nenhum" && !!conta[APPS[id].campo];
    }
  }
  return out;
}

// Ticket do Hub de Operações Cacau Show: base64url(payload).base64url(HMAC-SHA256).
// `n` leva o nível (ver|operar|admin) para o Cacau passar a honrá-lo; payload extra é ignorado por quem não conhece.
async function ticketCacau(usuario: string, nivel: Nivel): Promise<string | null> {
  const secret = Deno.env.get("GESTAO_SSO_SECRET_CACAU");
  if (!secret) return null;
  const payload = {
    u: usuario,
    n: nivel,
    aud: "hub-operacoes",
    exp: Math.floor(Date.now() / 1000) + 60,
    jti: crypto.randomUUID(),
  };
  const payloadB64 = base64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${base64url(new Uint8Array(sig))}`;
}

// Ticket do painel do site: 32 bytes aleatórios; no banco fica só o SHA-256,
// vale 60 s e só serve uma vez (a troca é feita por behavior-test-admin).
const PAINEL_TICKET_TTL_MS = 60 * 1000;

// O /admin hospeda dois módulos (painel e eventos); o ticket leva o nível da pessoa nos dois,
// e a troca (`sso`) grava um escopo para cada, independente de qual quadrado foi clicado.
async function ticketPainel(admin: Admin, email: string, niveis: Niveis): Promise<string | null> {
  const ticket = randomHex(32);
  const { error } = await admin.from("fa_gestao_painel_tickets").insert({
    token_hash: await sha256Hex(ticket),
    email,
    nivel_painel: niveis.painel,
    nivel_eventos: niveis.eventos,
    expires_at: new Date(Date.now() + PAINEL_TICKET_TTL_MS).toISOString(),
  });
  if (error) {
    console.error("ticket painel:", error.message);
    return null;
  }
  return ticket;
}

// Papéis que uma conta `gerente` recebe em cada sistema ao abrir pelo Hub. O nível do módulo no
// Hub (ver/operar/admin) só decide se o quadrado abre; o papel dentro do sistema é este.
// Contas `owner` não são provisionadas: já existem nos sistemas, cadastradas à mão.
const PAPEL_CLINICA = "supervisor"; // public.profiles.role (Clínica)
const PAPEL_RH = "supervisor"; // app_metadata.role (Gestão de Pessoas)
const PAPEL_PLAYGROUND = "GERENTE"; // fa_kiosk_employees.role (Playground)
const CLINICA_ID = "c0000000-0000-0000-0000-000000000001";

// Papéis que o dono pode dar a uma pessoa em cada sistema ao salvá-la no Hub. É o papel NATIVO do sistema
// (o que a pessoa realmente tem lá dentro), separado do nível ver/operar/admin do Hub, que só decide se o
// quadrado abre. Fora do catálogo de propósito:
//   - "gestor" (Clínica) e "ADMIN" (Playground): só se dão direto no sistema;
//   - "terapeuta" (Clínica): terapeuta entra direto no sistema, com fluxo próprio;
//   - contas de unidade (*_unit): logins compartilhados do tablet, o Hub não mexe.
// Sem entrada aqui = o sistema não tem papel para escolher (Simulador; Cacau, onde o cadastro é feito lá).
type OpcaoPapel = { id: string; rotulo: string };
const PAPEIS_NATIVOS: Partial<Record<AppId, { opcoes: OpcaoPapel[]; padrao: string }>> = {
  clinica: {
    opcoes: [
      { id: PAPEL_CLINICA, rotulo: "Supervisão" },
      { id: "recepcao", rotulo: "Recepção" },
      { id: "faturamento", rotulo: "Faturamento" },
    ],
    padrao: PAPEL_CLINICA,
  },
  rh: { opcoes: [{ id: PAPEL_RH, rotulo: "Supervisor" }], padrao: PAPEL_RH },
  playground: {
    opcoes: [
      { id: PAPEL_PLAYGROUND, rotulo: "Gerente" },
      { id: "OPERADOR", rotulo: "Operador" },
    ],
    padrao: PAPEL_PLAYGROUND,
  },
};

// Empresa (workspace) da Gestão de Pessoas. É o mesmo sistema com dois sites, um por empresa
// (VITE_WORKSPACE_ID no build), e o que separa os dados é app_metadata.workspace_scope no login:
// "all" enxerga as duas empresas (só donos), o id de uma enxerga só ela. Cada gerência pertence a UMA
// empresa: o Hub grava só o escopo escolhido (nunca "all") e abre o site da empresa dela. A URL do
// Grupo IB tem padrão; a da Porto Terapia vem do segredo GESTAO_URL_RH_PORTO_TERAPIA (sem padrão:
// sem ele o Hub recusa abrir em vez de levar a pessoa ao site da outra empresa).
type EscopoSistema = { id: string; rotulo: string; baseEnv: string; baseDefault: string | null };
const ESCOPOS: Partial<Record<AppId, EscopoSistema[]>> = {
  rh: [
    { id: "grupoib", rotulo: "Grupo IB", baseEnv: "GESTAO_URL_RH", baseDefault: APPS.rh.baseDefault },
    { id: "porto-terapia", rotulo: "Porto Terapia", baseEnv: "GESTAO_URL_RH_PORTO_TERAPIA", baseDefault: null },
  ],
};

function escopoValido(appId: AppId, v: unknown): string | null {
  return typeof v === "string" && ESCOPOS[appId]?.some((e) => e.id === v) ? v : null;
}

// Endereço do site da empresa; null se não estiver configurado.
function baseDoEscopo(appId: AppId, escopo: string): string | null {
  const e = ESCOPOS[appId]?.find((x) => x.id === escopo);
  if (!e) return null;
  const url = Deno.env.get(e.baseEnv) ?? e.baseDefault;
  return url ? url.replace(/\/+$/, "") : null;
}

// Papel escolhido se for do catálogo; senão o padrão do sistema; null se o sistema não tem papel.
function papelEfetivo(appId: AppId, escolhido: string | null | undefined): string | null {
  const cat = PAPEIS_NATIVOS[appId];
  if (!cat) return null;
  return cat.opcoes.some((o) => o.id === escolhido) ? (escolhido as string) : cat.padrao;
}

type UsuarioAuth = {
  id: string;
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
  last_sign_in_at?: string | null;
};

// Recusa com motivo legível: chega ao dono no clique do quadrado (409), em vez de um "não foi possível
// abrir o sistema agora" que não diz o que fazer.
class RecusaAcesso extends Error {}

// Contas de unidade/quiosque (intern_unit, professional_unit, employee_unit na Gestão de Pessoas) são
// LOGINS COMPARTILHADOS do tablet da loja, não de uma pessoa: o estagiário só toca no próprio nome na
// tela. O Hub nunca abre, provisiona, rebaixa nem desativa uma conta dessas. Só supervisores (pessoas)
// entram por aqui.
function ehContaDeUnidade(user: UsuarioAuth): boolean {
  const papel = (user.app_metadata?.role ?? user.user_metadata?.role) as unknown;
  return typeof papel === "string" && papel.endsWith("_unit");
}

// O magic link cria o usuário vazio se ele não existir, e cada sistema exige mais que isso para
// abrir (RH: papel no claim; Playground: linha de colaborador; Clínica: perfil com o papel certo).
// Aqui a pessoa é completada (ao salvar no Hub e, por garantia, ao abrir o quadrado), sempre de forma
// idempotente. `papel` é o papel nativo escolhido; `papelAnterior` é o que o Hub aplicou da última vez:
// o Hub só TROCA um papel que ele mesmo tinha dado, nunca um que a pessoa já tinha no sistema (nem baixa
// "gestor"). Devolve uma descrição do que foi feito ("" se nada); se recusar ou falhar, lança RecusaAcesso
// com o motivo.
async function provisionar(
  client: SupabaseClient,
  appId: AppId,
  user: UsuarioAuth,
  conta: Conta,
  email: string,
  papel: string | null,
  papelAnterior: string | null,
  escopo: string | null,
): Promise<string> {
  if (conta.papel !== "gerente") {
    if (conta.papel === "owner") {
      if (appId === "clinica") {
        const { data: perfil } = await client.from("profiles").select("id, role, active").eq("id", user.id).maybeSingle();
        if (!perfil) {
          await client.from("profiles").insert({
            id: user.id,
            clinic_id: CLINICA_ID,
            role: "gestor",
            full_name: conta.nome,
            email,
            active: true,
          });
          return "clinica=gestor(owner_novo)";
        } else if (perfil.role !== "gestor" || perfil.active === false) {
          await client.from("profiles").update({ role: "gestor", active: true }).eq("id", user.id);
          return "clinica=gestor(owner)";
        }
      }

      if (appId === "playground") {
        const { data: colab } = await client
          .from("fa_kiosk_employees")
          .select("id, active, role")
          .eq("auth_user_id", user.id)
          .maybeSingle();
        if (!colab) {
          await client.from("fa_kiosk_employees").insert({
            auth_user_id: user.id,
            full_name: conta.nome,
            role: "ADMIN",
            email,
            active: true,
          });
          return "playground=ADMIN(owner_novo)";
        } else if (colab.role !== "ADMIN" || colab.active === false) {
          await client.from("fa_kiosk_employees").update({ role: "ADMIN", active: true }).eq("id", colab.id);
          return "playground=ADMIN(owner)";
        }
      }

      if (appId === "rh" || appId === "porto") {
        const atual = (user.app_metadata ?? {}) as Record<string, unknown>;
        const escopoAtual = Array.isArray(atual.workspace_scope) ? (atual.workspace_scope as unknown[]) : [];
        const roleAtual = String(atual.role ?? "");
        const roleDesejado = roleAtual === "gestor" || roleAtual === "admin" || roleAtual === "supervisor" ? roleAtual : "admin";
        if (!escopoAtual.includes("all") || roleAtual !== roleDesejado) {
          await client.auth.admin.updateUserById(user.id, {
            app_metadata: { ...atual, role: roleDesejado, workspace_scope: ["all"] },
          });
          return `${appId}=${roleDesejado}(all_owner)`;
        }
      }
    }
    return "";
  }
  const papelAlvo = papel ?? papelEfetivo(appId, null);

  if (appId === "rh") {
    // Sem empresa escolhida o Hub não dá acesso: nunca cai em "all" (as duas empresas).
    if (!escopo) throw new RecusaAcesso("Escolha a empresa (Grupo IB ou Porto Terapia) desta pessoa na Gestão de Pessoas.");
    const atual = (user.app_metadata ?? {}) as Record<string, unknown>;
    // role/workspace_scope só em app_metadata: user_metadata é editável pela própria pessoa.
    const escopoAtual = Array.isArray(atual.workspace_scope) ? (atual.workspace_scope as unknown[]) : [];
    const mesmoEscopo = escopoAtual.length === 1 && escopoAtual[0] === escopo;
    if (atual.role === papelAlvo && mesmoEscopo) return "";
    // O Hub só ajusta o que ele mesmo deu antes; o papel e o escopo que a pessoa já tinha no sistema não.
    const deleMesmo = papelAnterior !== null;
    if (atual.role && atual.role !== papelAlvo && !(deleMesmo && atual.role === papelAnterior)) {
      console.error(`provisionar rh: ${email} já tem papel '${String(atual.role)}', não sobrescrevo`);
      throw new RecusaAcesso(
        `${email} já tem o papel "${String(atual.role)}" na Gestão de Pessoas e o Hub não troca papel existente. Use o e-mail de supervisor da pessoa ou ajuste o papel direto naquele sistema.`,
      );
    }
    if (atual.role === papelAlvo && escopoAtual.length && !mesmoEscopo && !deleMesmo) {
      const quais = escopoAtual.map((x) => String(x)).join(", ");
      throw new RecusaAcesso(
        `${email} já tem acesso a "${quais}" na Gestão de Pessoas e o Hub não troca o escopo de uma conta que ele não criou. Ajuste em Usuários do Sistema, dentro da Gestão de Pessoas, ou use outro e-mail.`,
      );
    }
    const { error } = await client.auth.admin.updateUserById(user.id, {
      app_metadata: { ...atual, role: papelAlvo, workspace_scope: [escopo] },
    });
    if (error) {
      console.error("provisionar rh:", error.message);
      throw new RecusaAcesso("A Gestão de Pessoas recusou criar o acesso agora. Tente de novo em instantes.");
    }
    return `rh=${papelAlvo}(${escopo})`;
  }

  if (appId === "clinica") {
    const { data: perfil, error } = await client.from("profiles").select("id, role, active").eq("id", user.id).maybeSingle();
    if (error) {
      console.error("provisionar clinica (lê perfil):", error.message);
      throw new RecusaAcesso("Não consegui consultar o perfil na Clínica agora. Tente de novo em instantes.");
    }
    if (!perfil) {
      const { error: insErr } = await client.from("profiles").insert({
        id: user.id,
        clinic_id: CLINICA_ID,
        role: papelAlvo,
        full_name: conta.nome,
        email,
        active: true,
      });
      if (insErr) {
        console.error("provisionar clinica (cria perfil):", insErr.message);
        throw new RecusaAcesso("A Clínica recusou criar o perfil agora. Tente de novo em instantes.");
      }
      return `clinica=${papelAlvo}(novo)`;
    }
    const desativadoNaClinica = () =>
      new RecusaAcesso(`${email} está desativado na Clínica. Reative lá primeiro; o Hub respeita essa decisão.`);
    if (perfil.role === "gestor" || perfil.role === papelAlvo) {
      if (perfil.active === false) throw desativadoNaClinica();
      return "";
    }
    if (perfil.active === false) throw desativadoNaClinica();
    // O trigger de auth.users cria todo usuário novo como 'terapeuta'. Só esse usuário recém-criado (que
    // nunca entrou) recebe o papel escolhido, ou quem tem o papel que o próprio Hub deu antes. Quem já é
    // terapeuta de verdade, recepção, faturamento etc. fica como está.
    const recemCriado = perfil.role === "terapeuta" && !user.last_sign_in_at;
    const foiDadoPeloHub = papelAnterior !== null && perfil.role === papelAnterior;
    if (!recemCriado && !foiDadoPeloHub) {
      throw new RecusaAcesso(
        `${email} já é "${String(perfil.role)}" na Clínica e o Hub não muda esse papel. Para dar acesso de gestão, ajuste o papel direto na Clínica ou use outro e-mail.`,
      );
    }
    const { error: upErr } = await client.from("profiles").update({ role: papelAlvo }).eq("id", user.id);
    if (upErr) {
      console.error("provisionar clinica (atualiza perfil):", upErr.message);
      throw new RecusaAcesso("A Clínica recusou atualizar o perfil agora. Tente de novo em instantes.");
    }
    return `clinica=${papelAlvo}(era ${perfil.role})`;
  }

  if (appId === "playground") {
    const { data: colab, error } = await client
      .from("fa_kiosk_employees")
      .select("id, active, role")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (error) {
      console.error("provisionar playground (lê colaborador):", error.message);
      throw new RecusaAcesso("Não consegui consultar o colaborador no Playground agora. Tente de novo em instantes.");
    }
    if (colab) {
      if (colab.active === false) {
        throw new RecusaAcesso(`${email} está desativado no Playground. Reative lá primeiro; o Hub respeita essa decisão.`);
      }
      if (colab.role === papelAlvo) return "";
      // Só troca o papel que o próprio Hub deu antes; o de quem já existia no Playground não é tocado.
      if (papelAnterior === null || colab.role !== papelAnterior) return "";
      const { error: upErr } = await client.from("fa_kiosk_employees").update({ role: papelAlvo }).eq("id", colab.id);
      if (upErr) {
        console.error("provisionar playground (troca papel):", upErr.message);
        throw new RecusaAcesso("O Playground recusou trocar o papel agora. Tente de novo em instantes.");
      }
      await client.from("fa_kiosk_audit_log").insert({
        action: "HUB_CHANGE_EMPLOYEE_ROLE",
        severity: "ALERTA",
        details_json: { employeeId: colab.id, de: colab.role, para: papelAlvo, via: "gestao-hub" },
      });
      return `playground=${papelAlvo}(era ${colab.role})`;
    }
    // Quem entrou no Playground por convite tem login sintético (@kiosk.internal), então a busca por
    // auth_user_id não o acha e o Hub cria uma segunda linha com o mesmo e-mail. Não dá para reaproveitar a
    // linha antiga daqui (o app do Playground liga o colaborador ao login), mas o duplicado fica registrado
    // para ninguém desativar "a sobra" sem saber qual delas o Hub usa.
    const { data: mesmoEmail } = await client
      .from("fa_kiosk_employees")
      .select("id")
      .ilike("email", email)
      .neq("auth_user_id", user.id);
    const { data: novo, error: insErr } = await client
      .from("fa_kiosk_employees")
      .insert({ auth_user_id: user.id, full_name: conta.nome, role: papelAlvo, email, active: true })
      .select("id")
      .single();
    if (insErr || !novo) {
      console.error("provisionar playground (cria colaborador):", insErr?.message);
      throw new RecusaAcesso("O Playground recusou criar o colaborador agora. Tente de novo em instantes.");
    }
    await client.from("fa_kiosk_audit_log").insert({
      action: "HUB_PROVISION_EMPLOYEE",
      severity: "ALERTA",
      details_json: {
        employeeId: novo.id,
        role: papelAlvo,
        via: "gestao-hub",
        ...(mesmoEmail?.length ? { duplicaEmailDe: mesmoEmail.map((c) => c.id), aviso: "esta é a linha usada pelo Hub; não desative" } : {}),
      },
    });
    return `playground=${papelAlvo}(novo)`;
  }

  return "";
}

// hashed_token de magic link (nunca enviado por e-mail) no projeto A ou B, com a pessoa já provisionada.
async function ticketSupabase(
  tipo: "supabase_a" | "supabase_b",
  email: string,
  appId: AppId,
  conta: Conta,
  papel: string | null,
  papelAnterior: string | null,
  escopo: string | null,
): Promise<{ ticket: string; provisionado: string } | { erro: string }> {
  const url = tipo === "supabase_a" ? Deno.env.get("SUPABASE_URL") : Deno.env.get("CLINICA_SUPABASE_URL");
  const key = tipo === "supabase_a"
    ? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    : Deno.env.get("CLINICA_SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return { erro: "Este sistema ainda não está ligado ao Hub (falta configuração no servidor)." };
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let resLink = await client.auth.admin.generateLink({ type: "magiclink", email });
  if (resLink.error || !resLink.data?.properties?.hashed_token || !resLink.data?.user) {
    const { error: createErr } = await client.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { name: conta.nome },
    });
    if (!createErr) {
      resLink = await client.auth.admin.generateLink({ type: "magiclink", email });
    }
  }
  const data = resLink.data;
  const error = resLink.error;
  if (error || !data?.properties?.hashed_token || !data.user) {
    console.error(`generateLink (${tipo}) falhou:`, error?.message);
    return { erro: "O sistema não gerou a entrada agora. Confira o e-mail cadastrado para ele e tente de novo." };
  }
  if (ehContaDeUnidade(data.user)) {
    return {
      erro: `${email} é uma conta de unidade (quiosque compartilhado), não de uma pessoa. O Hub não abre nem altera essas contas: informe o e-mail individual do supervisor.`,
    };
  }
  try {
    const provisionado = await provisionar(client, appId, data.user, conta, email, papel, papelAnterior, escopo);
    return { ticket: data.properties.hashed_token, provisionado };
  } catch (e) {
    if (e instanceof RecusaAcesso) return { erro: e.message };
    throw e;
  }
}

// ---------------------------------------------------------------------
// Senha: delegada ao Supabase Auth do Sistema da Clínica
// ---------------------------------------------------------------------

async function verificarSenhaClinica(
  identifier: string,
  password: string,
): Promise<{ ok: true; email: string } | { ok: false; status: number }> {
  const clinicaUrl = Deno.env.get("CLINICA_SUPABASE_URL");
  const clinicaAnonKey = Deno.env.get("CLINICA_SUPABASE_ANON_KEY");
  if (!clinicaUrl || !clinicaAnonKey) return { ok: false, status: 500 };

  let emailToUse = identifier;

  // Sem '@': é CPF. A busca usa a service role da Clínica: com a chave anon a RLS de `profiles` (só lê a
  // própria clínica, logado) devolve vazio e o login por CPF nunca achava o e-mail.
  if (!emailToUse.includes("@")) {
    const alvo = await acharUsuarioClinica(emailToUse);
    if (alvo) emailToUse = alvo.email;
  }

  const tokenRes = await fetch(`${clinicaUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: clinicaAnonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: emailToUse, password }),
  }).catch(() => null);
  if (!tokenRes) return { ok: false, status: 502 };
  if (!tokenRes.ok) return { ok: false, status: 401 };

  const tokenData = await tokenRes.json().catch(() => null);
  const email = String(tokenData?.user?.email ?? "").toLowerCase();
  if (!email) return { ok: false, status: 401 };
  return { ok: true, email };
}

// Localiza o usuário da Clínica por CPF ou e-mail (para redefinir a senha). Usa a service role do projeto da Clínica.
function clinicaAdmin(): SupabaseClient | null {
  const url = Deno.env.get("CLINICA_SUPABASE_URL");
  const key = Deno.env.get("CLINICA_SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function acharUsuarioClinica(identifier: string): Promise<{ id: string; email: string } | null> {
  const b = clinicaAdmin();
  if (!b) return null;
  const filters: string[] = [];
  if (identifier.includes("@")) {
    filters.push(`email.eq.${quoteFilterValue(identifier.toLowerCase())}`);
  } else {
    // `profiles` só tem a coluna `cpf` (guardada só com dígitos); não existe `cpf_clean`, e uma coluna
    // inexistente dentro do .or() derruba a consulta inteira.
    const digits = identifier.replace(/\D/g, "");
    filters.push(`cpf.eq.${quoteFilterValue(identifier)}`);
    if (digits && digits !== identifier) filters.push(`cpf.eq.${quoteFilterValue(digits)}`);
  }
  const { data, error } = await b.from("profiles").select("id, email").or(filters.join(",")).limit(1);
  if (error || !data?.[0]?.id || !data[0].email) return null;
  return { id: String(data[0].id), email: String(data[0].email).toLowerCase() };
}

// ---------------------------------------------------------------------
// Senha própria do Hub (contas com auth_modo = 'hub'): PBKDF2-SHA256 com sal.
// Formato guardado: pbkdf2$iterações$salt(hex)$hash(hex). A senha nunca é guardada.
// ---------------------------------------------------------------------

const PBKDF2_ITER = 150_000;
const SENHA_MIN = 8;
const SENHA_MAX = 72;

async function derivarSenha(senha: string, salt: Uint8Array, iter: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, key, 256);
  return toHex(bits);
}

async function hashSenha(senha: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return `pbkdf2$${PBKDF2_ITER}$${toHex(salt.buffer)}$${await derivarSenha(senha, salt, PBKDF2_ITER)}`;
}

async function verificarSenhaHub(senha: string, guardado: string): Promise<boolean> {
  const [alg, iterStr, saltHex, hashHex] = guardado.split("$");
  const iter = Number(iterStr);
  if (alg !== "pbkdf2" || !Number.isInteger(iter) || iter < 1 || !/^[0-9a-f]+$/.test(saltHex ?? "") || !hashHex) return false;
  const salt = Uint8Array.from(saltHex.match(/../g)!.map((h) => parseInt(h, 16)));
  const calculado = await derivarSenha(senha, salt, iter);
  // Comparação sem curto-circuito.
  if (calculado.length !== hashHex.length) return false;
  let diff = 0;
  for (let i = 0; i < calculado.length; i++) diff |= calculado.charCodeAt(i) ^ hashHex.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------
// E-mail do código (Brevo)
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

function moldeEmail(corpo: string): string {
  return `
<div style="font-family:'Nunito','Segoe UI',Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a3f35;">
  <div style="text-align:center;padding:10px 0 16px;">
    <img src="${LOGO_URL}" alt="Instituto Faça Amigos" width="32" height="32" style="display:inline-block;vertical-align:middle;margin-right:8px;">
    <span style="font-size:15px;font-weight:800;vertical-align:middle;">Faça<span style="color:#f0196b;">Amigos</span> · Gestão</span>
  </div>
  <div style="background:#fff;border-radius:24px;padding:28px 24px;text-align:center;border:1px solid #edf1ef;">${corpo}</div>
</div>`.trim();
}

// `modo` diz de quem é a senha: contas 'hub' têm senha própria; as legadas usam a do Sistema da Clínica.
async function enviarCodigo(
  email: string,
  nome: string,
  code: string,
  finalidade: "login" | "reset" = "login",
  modo: "clinica" | "hub" = "clinica",
): Promise<boolean> {
  const reset = finalidade === "reset";
  const quemSenha = modo === "hub" ? "do Hub de Gestão" : "do Hub de Gestão e do Sistema da Clínica";
  const html = moldeEmail(`
    <p style="margin:0 0 12px;font-size:15px;">Olá, ${escapeHtml(nome)}!</p>
    <p style="margin:0 0 18px;font-size:14px;color:#4C6B62;">${reset ? `Seu código para definir a senha ${quemSenha}:` : "Seu código para entrar no Hub de Gestão:"}</p>
    <div style="font-size:34px;font-weight:900;letter-spacing:10px;color:#1a3f35;background:#FFF9F1;border-radius:16px;padding:16px 0;">${code}</div>
    <p style="margin:18px 0 0;font-size:12px;color:#8B9A94;">Vale por 10 minutos. ${reset ? "Se não foi você, ignore este e-mail: a senha só muda com este código." : modo === "hub" ? "Se não foi você, avise quem administra o Hub e troque sua senha." : "Se não foi você, troque a senha do Sistema da Clínica agora."}</p>`);
  return enviarEmail(email, nome, reset ? `${code} é o código para definir sua senha` : `${code} é o seu código do Hub de Gestão`, html);
}

// `loginEmail` é o e-mail que a pessoa digita na tela de primeiro acesso (pode ser diferente do e-mail que recebe o código).
async function enviarConvite(email: string, nome: string, quemConvidou: string, loginEmail: string): Promise<boolean> {
  const html = moldeEmail(`
    <p style="margin:0 0 12px;font-size:15px;">Olá, ${escapeHtml(nome)}!</p>
    <p style="margin:0 0 18px;font-size:14px;color:#4C6B62;">${escapeHtml(quemConvidou)} liberou o seu acesso ao Hub de Gestão do Instituto Faça Amigos. Para entrar pela primeira vez, defina a sua senha:</p>
    <p style="margin:0 0 18px;"><a href="${HUB_URL}/#primeiro-acesso" style="display:inline-block;background:#f0196b;color:#fff;text-decoration:none;font-weight:800;font-size:14px;padding:12px 22px;border-radius:999px;">Definir minha senha</a></p>
    <p style="margin:0;font-size:12px;color:#8B9A94;">Na tela, informe o e-mail ${escapeHtml(loginEmail)} e digite o código de 6 dígitos que enviaremos para cá. Se você não esperava este convite, ignore a mensagem.</p>`);
  return enviarEmail(email, nome, "Seu acesso ao Hub de Gestão Faça Amigos", html);
}

async function enviarEmail(email: string, nome: string, assunto: string, html: string): Promise<boolean> {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  const fromRaw = Deno.env.get("BREVO_FROM") ?? "Instituto Faça Amigos <nao-responder@institutofacaamigos.com.br>";
  if (!apiKey) {
    console.error("BREVO_API_KEY não configurada");
    return false;
  }

  try {
    const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        sender: parseSenderAddress(fromRaw),
        to: [{ email, name: nome }],
        subject: assunto,
        htmlContent: html,
      }),
    });
    if (!resp.ok) {
      console.error("Brevo:", resp.status, await resp.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (err) {
    console.error("Brevo:", err);
    return false;
  }
}

// ---------------------------------------------------------------------
// Sessão, limites e auditoria
// ---------------------------------------------------------------------

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_MAX_TRIES = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILS_PER_IP = 5;
const LOGIN_MAX_FAILS_PER_LOGIN = 10;
const CODES_MAX_PER_WINDOW = 5;

type Admin = SupabaseClient;

function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

// Falhas recentes de login (janela LOGIN_WINDOW_MS). `ip` nulo = só o limite por login.
async function excedeuTentativas(admin: Admin, ip: string | null, login: string): Promise<boolean> {
  const since = new Date(Date.now() - LOGIN_WINDOW_MS).toISOString();
  const porLogin = admin.from("fa_gestao_login_attempts").select("id", { count: "exact", head: true })
    .eq("login", login.toLowerCase()).gte("created_at", since);
  const porIp = ip === null ? null : admin.from("fa_gestao_login_attempts").select("id", { count: "exact", head: true })
    .eq("ip", ip).gte("created_at", since);
  const [byLogin, byIp] = await Promise.all([porLogin, porIp]);
  return (byLogin.count ?? 0) >= LOGIN_MAX_FAILS_PER_LOGIN || (byIp?.count ?? 0) >= LOGIN_MAX_FAILS_PER_IP;
}

async function auditar(
  admin: Admin,
  req: Request,
  evento: string,
  extra: { email?: string | null; app?: string | null; detalhe?: string | null } = {},
) {
  const { error } = await admin.from("fa_gestao_auditoria").insert({
    evento,
    email: extra.email ?? null,
    app: extra.app ?? null,
    detalhe: extra.detalhe ?? null,
    ip: clientIp(req),
    user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300),
  });
  if (error) console.error("auditoria:", error.message);
}

async function carregarConta(admin: Admin, email: string): Promise<Conta | null> {
  const { data } = await admin.from("fa_gestao_contas").select("*").eq("email", email).maybeSingle();
  return data && data.ativo ? (data as Conta) : null;
}

// Acha a conta ativa pelo e-mail de login: a chave (email) ou o e-mail de login próprio do Hub (login_email).
async function acharContaPorLogin(admin: Admin, login: string): Promise<Conta | null> {
  const e = quoteFilterValue(login.toLowerCase());
  const { data } = await admin.from("fa_gestao_contas").select("*").or(`email.eq.${e},login_email.eq.${e}`).limit(1);
  const c = data?.[0] as Conta | undefined;
  return c && c.ativo ? c : null;
}

async function exigirSessao(admin: Admin, req: Request): Promise<{ tokenHash: string; conta: Conta } | null> {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!/^[0-9a-f]{64}$/.test(token)) return null;

  const tokenHash = await sha256Hex(token);
  const { data } = await admin
    .from("fa_gestao_sessoes")
    .select("email, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) {
    await admin.from("fa_gestao_sessoes").delete().eq("token_hash", tokenHash);
    return null;
  }
  // Conta desativada derruba a sessão na hora.
  const conta = await carregarConta(admin, data.email);
  if (!conta) return null;
  return { tokenHash, conta };
}

type Desafio = {
  id: string;
  email: string;
  code_hash: string;
  tentativas: number;
  expires_at: string;
  usado_em: string | null;
  finalidade: string;
  alvo_id: string | null;
};

// Confere o código de um desafio (mesmas regras para entrar e para redefinir a senha) e o marca como usado.
async function conferirCodigo(
  admin: Admin,
  req: Request,
  challengeId: string,
  code: string,
  finalidade: "login" | "reset",
): Promise<{ ok: true; desafio: Desafio } | { ok: false; resp: Response }> {
  if (!/^[0-9a-f-]{36}$/.test(challengeId) || code.length !== 6) {
    return { ok: false, resp: jsonResponse(req, { error: "código inválido" }, 400) };
  }
  const { data } = await admin
    .from("fa_gestao_desafios")
    .select("id, email, code_hash, tentativas, expires_at, usado_em, finalidade, alvo_id")
    .eq("id", challengeId)
    .maybeSingle();
  const desafio = data as Desafio | null;
  if (!desafio || desafio.finalidade !== finalidade || desafio.usado_em || new Date(desafio.expires_at).getTime() < Date.now()) {
    return { ok: false, resp: jsonResponse(req, { error: "código expirado, comece de novo", reiniciar: true }, 401) };
  }
  if (desafio.tentativas >= CODE_MAX_TRIES) {
    return { ok: false, resp: jsonResponse(req, { error: "tentativas esgotadas, comece de novo", reiniciar: true }, 401) };
  }
  const confere = (await sha256Hex(`${challengeId}:${code}`)) === desafio.code_hash;
  if (!confere) {
    const tentativas = desafio.tentativas + 1;
    await admin.from("fa_gestao_desafios").update({ tentativas }).eq("id", challengeId);
    await auditar(admin, req, "codigo_falhou", { email: desafio.email, detalhe: finalidade });
    const restam = CODE_MAX_TRIES - tentativas;
    return {
      ok: false,
      resp: jsonResponse(
        req,
        restam > 0
          ? { error: `código incorreto (restam ${restam} tentativa${restam > 1 ? "s" : ""})` }
          : { error: "tentativas esgotadas, comece de novo", reiniciar: true },
        401,
      ),
    };
  }
  // Marca como usado só se ninguém usou antes (dois envios simultâneos).
  const { data: marcado } = await admin
    .from("fa_gestao_desafios")
    .update({ usado_em: new Date().toISOString() })
    .eq("id", challengeId)
    .is("usado_em", null)
    .select("id");
  if (!marcado?.length) {
    return { ok: false, resp: jsonResponse(req, { error: "código já usado, comece de novo", reiniciar: true }, 401) };
  }
  return { ok: true, desafio };
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
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  // Valida a senha do Hub e sincroniza com o Supabase Auth da Clínica
  if (action === "sincronizar_login_clinica") {
    const raw = str(body.identifier || body.email);
    const password = typeof body.password === "string" ? body.password : "";
    if (!raw || !password) return jsonResponse(req, { ok: false }, 400);

    const loginInput = raw.toLowerCase();
    // Só limite por login: quem chama é o servidor da Clínica, então o IP é sempre o mesmo para todos.
    if (await excedeuTentativas(admin, null, loginInput)) {
      return jsonResponse(req, { ok: false, error: "muitas tentativas, aguarde 15 minutos" }, 429);
    }
    const falhou = async () => {
      await admin.from("fa_gestao_login_attempts").insert({ ip: clientIp(req), login: loginInput });
      return jsonResponse(req, { ok: false });
    };
    const contaHub = await acharContaPorLogin(admin, loginInput);
    if (!contaHub || !contaHub.ativo || !contaHub.senha_hash || contaHub.auth_modo !== "hub") {
      return await falhou();
    }

    const confere = await verificarSenhaHub(password, contaHub.senha_hash);
    if (!confere) {
      return await falhou();
    }

    const clinicaEmail = (contaHub.clinica_email || contaHub.login_email || contaHub.email).toLowerCase();
    const b = clinicaAdmin();
    if (b && clinicaEmail) {
      const alvo = await acharUsuarioClinica(clinicaEmail);
      if (alvo?.id) {
        const { error: updErr } = await b.auth.admin.updateUserById(alvo.id, { password });
        if (updErr) {
          console.error("sincronizar_login_clinica updateUserById:", updErr.message);
        }
      }
    }

    return jsonResponse(req, { ok: true, email: clinicaEmail });
  }

  // Atualiza a senha no Hub quando redefinida pela Clínica
  if (action === "atualizar_senha_hub") {
    const clinicaKey = Deno.env.get("CLINICA_SUPABASE_SERVICE_ROLE_KEY");
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!clinicaKey || token !== clinicaKey) {
      return jsonResponse(req, { error: "não autorizado" }, 401);
    }

    const raw = str(body.identifier || body.email);
    const password = typeof body.new_password === "string" ? body.new_password : "";
    if (!raw || !password) return jsonResponse(req, { error: "dados incompletos" }, 400);

    const contaHub = await acharContaPorLogin(admin, raw.toLowerCase());
    if (contaHub) {
      await admin
        .from("fa_gestao_contas")
        .update({ senha_hash: await hashSenha(password), senha_definida_em: new Date().toISOString() })
        .eq("email", contaHub.email);
      await admin.from("fa_gestao_sessoes").delete().eq("email", contaHub.email);
      await auditar(admin, req, "senha_redefinida", { email: contaHub.email, detalhe: "via_clinica" });
    }

    return jsonResponse(req, { ok: true });
  }

  // --- passo 1: senha da Clínica → código por e-mail ---
  if (action === "login") {
    const raw = str(body.identifier || body.email);
    const loginInput = raw.includes("@") ? raw.toLowerCase() : raw;
    const password = str(body.password);
    if (!loginInput || !password) return jsonResponse(req, { error: "informe e-mail/CPF e senha" }, 400);

    const ip = clientIp(req);
    if (await excedeuTentativas(admin, ip, loginInput)) {
      return jsonResponse(req, { error: "muitas tentativas, aguarde 15 minutos" }, 429);
    }

    const falhou = async (status: number, detalhe: string, email?: string) => {
      if (status < 500) {
        await admin.from("fa_gestao_login_attempts").insert({ ip, login: loginInput.toLowerCase() });
      }
      await auditar(admin, req, "login_falhou", { email: email ?? loginInput.toLowerCase(), detalhe });
      // Mesma mensagem para senha errada e conta fora da lista: não revela quem tem acesso.
      return jsonResponse(
        req,
        { error: status >= 500 ? "serviço indisponível, tente de novo" : "e-mail/CPF ou senha incorretos" },
        status >= 500 ? 502 : 401,
      );
    };

    // Conta com senha própria do Hub (login = e-mail); as demais seguem pela senha do Sistema da Clínica.
    const contaHub = loginInput.includes("@") ? await acharContaPorLogin(admin, loginInput) : null;
    let conta: Conta | null;
    if (contaHub?.auth_modo === "hub") {
      if (!contaHub.senha_hash || !(await verificarSenhaHub(password, contaHub.senha_hash))) {
        return falhou(401, "senha", contaHub.email);
      }
      if (contaHub.clinica_email) {
        const b = clinicaAdmin();
        if (b) {
          const alvo = await acharUsuarioClinica(contaHub.clinica_email);
          if (alvo?.id) {
            await b.auth.admin.updateUserById(alvo.id, { password }).catch((e) => {
              console.error("sincronizar senha clinica falhou:", e?.message);
            });
          }
        }
      }
      conta = contaHub;
    } else {
      const check = await verificarSenhaClinica(loginInput, password);
      if (!check.ok) return falhou(check.status, "senha");
      conta = await carregarConta(admin, check.email);
      if (!conta) return falhou(401, "fora_da_lista", check.email);
    }

    const { count: codigosRecentes } = await admin
      .from("fa_gestao_desafios")
      .select("id", { count: "exact", head: true })
      .eq("email", conta.email)
      .eq("finalidade", "login")
      .gte("created_at", since);
    if ((codigosRecentes ?? 0) >= CODES_MAX_PER_WINDOW) {
      return jsonResponse(req, { error: "muitos códigos pedidos, aguarde 15 minutos" }, 429);
    }

    const code = randomCode();
    const challengeId = crypto.randomUUID();
    const { error: insErr } = await admin.from("fa_gestao_desafios").insert({
      id: challengeId,
      email: conta.email,
      code_hash: await sha256Hex(`${challengeId}:${code}`),
      ip,
      expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    });
    if (insErr) {
      console.error("desafio:", insErr.message);
      return jsonResponse(req, { error: "falha ao gerar código" }, 500);
    }

    if (!(await enviarCodigo(conta.email_codigo, conta.nome, code, "login", conta.auth_modo))) {
      return jsonResponse(req, { error: "não foi possível enviar o código por e-mail" }, 502);
    }

    await auditar(admin, req, "login_senha_ok", { email: conta.email });
    return jsonResponse(req, { challenge_id: challengeId, email_mascarado: maskEmail(conta.email_codigo) });
  }

  // --- passo 2: código → sessão ---
  if (action === "verificar") {
    const conf = await conferirCodigo(admin, req, str(body.challenge_id), str(body.code).replace(/\D/g, ""), "login");
    if (!conf.ok) return conf.resp;
    const desafio = conf.desafio;

    const conta = await carregarConta(admin, desafio.email);
    if (!conta) return jsonResponse(req, { error: "acesso não autorizado" }, 403);

    const token = randomHex(32);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    const { error: sessErr } = await admin.from("fa_gestao_sessoes").insert({
      token_hash: await sha256Hex(token),
      email: conta.email,
      expires_at: expiresAt,
    });
    if (sessErr) {
      console.error("sessão:", sessErr.message);
      return jsonResponse(req, { error: "falha ao entrar" }, 500);
    }

    await auditar(admin, req, "codigo_ok", { email: conta.email });
    const niveis = await carregarNiveis(admin, conta);
    return jsonResponse(req, {
      token,
      expires_at: expiresAt,
      nome: conta.nome,
      papel: conta.papel,
      apps: appsDisponiveis(conta, niveis),
      niveis,
      pode_gerir_equipe: conta.papel === "owner" || niveis.clinica === "admin",
    });
  }

  // --- esqueci a senha (1/2): pede o código, que vai para o e-mail real cadastrado ---
  if (action === "esqueci") {
    const raw = str(body.identifier || body.email);
    const loginInput = raw.includes("@") ? raw.toLowerCase() : raw;
    if (!loginInput) return jsonResponse(req, { error: "informe e-mail ou CPF" }, 400);

    const ip = clientIp(req);
    const since = new Date(Date.now() - LOGIN_WINDOW_MS).toISOString();
    const { count: pedidosIp } = await admin
      .from("fa_gestao_desafios")
      .select("id", { count: "exact", head: true })
      .eq("finalidade", "reset")
      .eq("ip", ip)
      .gte("created_at", since);
    if ((pedidosIp ?? 0) >= CODES_MAX_PER_WINDOW) {
      return jsonResponse(req, { error: "muitos pedidos, aguarde 15 minutos" }, 429);
    }

    // Resposta igual para quem tem e para quem não tem acesso: não revela quem está na lista.
    const generica = (id: string) =>
      jsonResponse(req, { challenge_id: id, mensagem: "Se os dados conferem, enviamos um código para o e-mail cadastrado." });

    // Conta de senha própria: acha pelo e-mail no próprio Hub. As legadas, pelo usuário da Clínica.
    const contaHub = loginInput.includes("@") ? await acharContaPorLogin(admin, loginInput) : null;
    const ehHub = contaHub?.auth_modo === "hub";
    const alvo = ehHub ? null : await acharUsuarioClinica(loginInput);
    const conta = ehHub ? contaHub : alvo ? await carregarConta(admin, alvo.email) : null;
    if ((!ehHub && !alvo) || !conta) {
      await auditar(admin, req, "reset_ignorado", { email: loginInput.toLowerCase() });
      return generica(crypto.randomUUID());
    }

    const { count: pedidosConta } = await admin
      .from("fa_gestao_desafios")
      .select("id", { count: "exact", head: true })
      .eq("finalidade", "reset")
      .eq("email", conta.email)
      .gte("created_at", since);
    if ((pedidosConta ?? 0) >= CODES_MAX_PER_WINDOW) return generica(crypto.randomUUID());

    const code = randomCode();
    const challengeId = crypto.randomUUID();
    const { error: insErr } = await admin.from("fa_gestao_desafios").insert({
      id: challengeId,
      email: conta.email,
      code_hash: await sha256Hex(`${challengeId}:${code}`),
      ip,
      finalidade: "reset",
      alvo_id: alvo?.id ?? null,
      expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    });
    if (insErr) {
      console.error("desafio reset:", insErr.message);
      return jsonResponse(req, { error: "falha ao gerar código" }, 500);
    }
    if (!(await enviarCodigo(conta.email_codigo, conta.nome, code, "reset", conta.auth_modo))) {
      return jsonResponse(req, { error: "não foi possível enviar o código por e-mail" }, 502);
    }
    await auditar(admin, req, "reset_codigo_enviado", { email: conta.email });
    return generica(challengeId);
  }

  // --- esqueci a senha (2/2): código certo + senha nova -> troca a senha do Sistema da Clínica ---
  if (action === "redefinir") {
    const novaSenha = typeof body.new_password === "string" ? body.new_password : "";
    if (novaSenha.length < SENHA_MIN || novaSenha.length > SENHA_MAX) {
      return jsonResponse(req, { error: `a senha nova precisa ter de ${SENHA_MIN} a ${SENHA_MAX} caracteres` }, 400);
    }
    const conf = await conferirCodigo(admin, req, str(body.challenge_id), str(body.code).replace(/\D/g, ""), "reset");
    if (!conf.ok) return conf.resp;
    const desafio = conf.desafio;

    const conta = await carregarConta(admin, desafio.email);

    // Conta de senha própria: a senha nova é do Hub (convite = primeiro acesso, o mesmo caminho).
    if (conta?.auth_modo === "hub") {
      const { error: hubErr } = await admin
        .from("fa_gestao_contas")
        .update({ senha_hash: await hashSenha(novaSenha), senha_definida_em: new Date().toISOString() })
        .eq("email", conta.email);
      if (hubErr) {
        console.error("senha hub:", hubErr.message);
        return jsonResponse(req, { error: "não foi possível trocar a senha agora" }, 500);
      }
      if (conta.clinica_email) {
        const b = clinicaAdmin();
        if (b) {
          const alvo = await acharUsuarioClinica(conta.clinica_email);
          if (alvo?.id) {
            await b.auth.admin.updateUserById(alvo.id, { password: novaSenha }).catch((e) => {
              console.error("sincronizar senha clinica falhou:", e?.message);
            });
          }
        }
      }
      await admin.from("fa_gestao_sessoes").delete().eq("email", conta.email);
      await auditar(admin, req, "senha_redefinida", { email: conta.email, detalhe: "hub" });
      return jsonResponse(req, { ok: true });
    }

    const b = clinicaAdmin();
    if (!conta || !b || !desafio.alvo_id) return jsonResponse(req, { error: "não foi possível trocar a senha agora" }, 500);

    const { error: updErr } = await b.auth.admin.updateUserById(desafio.alvo_id, { password: novaSenha });
    if (updErr) {
      console.error("updateUserById:", updErr.message);
      await auditar(admin, req, "reset_falhou", { email: conta.email, detalhe: updErr.message.slice(0, 120) });
      return jsonResponse(req, { error: "a Clínica recusou essa senha. Tente uma mais longa e diferente.", reiniciar: true }, 400);
    }
    // Senha nova derruba as sessões abertas do hub.
    await admin.from("fa_gestao_sessoes").delete().eq("email", conta.email);
    await auditar(admin, req, "senha_redefinida", { email: conta.email });
    return jsonResponse(req, { ok: true });
  }

  // --- convite: consultar dados do link (público) ---
  if (action === "convite_consultar") {
    const token = str(body.token);
    if (!token) return jsonResponse(req, { error: "token de convite obrigatório" }, 400);

    const { data: convite, error } = await admin
      .from("fa_gestao_convites")
      .select("*")
      .eq("token_hash", await sha256Hex(token))
      .maybeSingle();

    if (error || !convite) {
      return jsonResponse(req, { error: "convite não encontrado ou inválido" }, 404);
    }
    if (convite.usado_em) {
      return jsonResponse(req, { error: "este convite já foi utilizado", usado: true }, 410);
    }
    if (new Date(convite.expires_at).getTime() < Date.now()) {
      return jsonResponse(req, { error: "este convite expirou", expirado: true }, 410);
    }

    const appId = convite.sistema as AppId;
    const sistemaInfo = APPS[appId];
    const sistemaUrl = (Deno.env.get(sistemaInfo?.baseEnv) ?? sistemaInfo?.baseDefault ?? "").replace(/\/+$/, "");

    return jsonResponse(req, {
      ok: true,
      convite: {
        token,
        unidade: convite.unidade,
        sistema: convite.sistema,
        sistema_nome: sistemaInfo?.rotulo || convite.sistema,
        sistema_url: sistemaUrl,
        funcao: convite.funcao,
        permissao: convite.permissao,
        destinatario_nome: convite.destinatario_nome || null,
        destinatario_email: convite.destinatario_email,
      },
    });
  }

  // --- convite: cadastrar usuário (público) ---
  if (action === "convite_cadastrar") {
    const token = str(body.token);
    const nome = str(body.nome).slice(0, 120);
    const dataNascimento = str(body.data_nascimento);
    const emailReal = str(body.email).toLowerCase();
    const senha = typeof body.password === "string" ? body.password : "";

    if (!token) return jsonResponse(req, { error: "token inválido" }, 400);
    if (!nome || nome.length < 3) return jsonResponse(req, { error: "informe seu nome completo" }, 400);
    if (!EMAIL_RE.test(emailReal)) return jsonResponse(req, { error: "informe um e-mail válido" }, 400);
    if (!dataNascimento) return jsonResponse(req, { error: "informe a data de nascimento" }, 400);
    if (senha.length < SENHA_MIN) return jsonResponse(req, { error: `a senha precisa ter pelo menos ${SENHA_MIN} caracteres` }, 400);

    const { data: convite, error: convErr } = await admin
      .from("fa_gestao_convites")
      .select("*")
      .eq("token_hash", await sha256Hex(token))
      .maybeSingle();

    if (convErr || !convite) return jsonResponse(req, { error: "convite não encontrado" }, 404);
    if (convite.usado_em) return jsonResponse(req, { error: "este convite já foi utilizado" }, 410);
    if (new Date(convite.expires_at).getTime() < Date.now()) return jsonResponse(req, { error: "este convite expirou" }, 410);

    const appId = convite.sistema as AppId;
    const sistemaInfo = APPS[appId];
    if (!sistemaInfo) return jsonResponse(req, { error: "sistema de destino inválido" }, 400);

    // O convite vale só para o e-mail a quem foi enviado (quando foi enviado a alguém).
    const destinatario = str(convite.destinatario_email).toLowerCase();
    if (destinatario && destinatario !== emailReal) {
      return jsonResponse(req, { error: "use o e-mail para o qual o convite foi enviado" }, 403);
    }

    // Convite só cria conta NOVA. Nunca sobrescreve senha, papel ou e-mail de código de quem já existe:
    // dar acesso a uma conta existente é feito pelo owner no Hub (conta_salvar).
    const { data: contaExistente } = await admin.from("fa_gestao_contas").select("email").eq("email", emailReal).maybeSingle();
    if (contaExistente) {
      return jsonResponse(req, { error: "já existe uma conta com este e-mail. Entre no Hub e peça acesso ao responsável" }, 409);
    }
    const senhaHash = await hashSenha(senha);
    const agoraIso = new Date().toISOString();

    const dadosConta: Record<string, unknown> = {
      email: emailReal,
      email_codigo: emailReal,
      nome,
      data_nascimento: dataNascimento,
      unidade: convite.unidade,
      funcao: convite.funcao,
      papel: "gerente",
      auth_modo: "hub",
      senha_hash: senhaHash,
      senha_definida_em: agoraIso,
      ativo: true,
      criado_por: convite.criado_por || "convite"
    };

    if (sistemaInfo.campo && sistemaInfo.campo !== "painel_usuario") {
      dadosConta[sistemaInfo.campo] = appId === "cacau" ? emailReal.split("@")[0] : emailReal;
    }
    if (appId === "painel" || appId === "eventos") {
      dadosConta.painel_usuario = emailReal;
    }

    const { error: insErr } = await admin.from("fa_gestao_contas").insert(dadosConta);
    if (insErr) {
      console.error("ins conta convite:", insErr.message);
      return jsonResponse(req, { error: "não foi possível criar o usuário" }, 500);
    }

    const nivelPermissao = convite.permissao === "admin" || convite.permissao === "ver" ? convite.permissao : "operar";
    await admin.from("fa_gestao_permissoes").upsert({
      email: emailReal,
      modulo: appId,
      nivel: nivelPermissao,
      atualizado_por: convite.criado_por || "convite"
    });

    await admin.from("fa_gestao_convites").update({
      usado_em: agoraIso,
      usado_por: emailReal
    }).eq("id", convite.id);

    await auditar(admin, req, "usuario_cadastrado_convite", {
      email: emailReal,
      app: appId,
      detalhe: `unidade=${convite.unidade}; funcao=${convite.funcao}; perm=${nivelPermissao}`
    });

    const sistemaBase = (Deno.env.get(sistemaInfo.baseEnv) ?? sistemaInfo.baseDefault).replace(/\/+$/, "");

    return jsonResponse(req, {
      ok: true,
      mensagem: "Cadastro concluído com sucesso!",
      sistema_nome: sistemaInfo.rotulo,
      sistema_url: sistemaBase,
      unidade: convite.unidade,
      funcao: convite.funcao
    });
  }

  // --- daqui para baixo exige sessão ---
  const sessao = await exigirSessao(admin, req);
  if (!sessao) return jsonResponse(req, { error: "sessão inválida ou expirada" }, 401);
  const { conta } = sessao;

  if (action === "me") {
    const niveis = await carregarNiveis(admin, conta);
    return jsonResponse(req, {
      nome: conta.nome,
      email: conta.email,
      papel: conta.papel,
      apps: appsDisponiveis(conta, niveis),
      niveis,
      // Mostra a "Equipe da Clínica": owner ou administrador da Clínica (administração delegada).
      pode_gerir_equipe: conta.papel === "owner" || niveis.clinica === "admin",
    });
  }

  if (action === "logout") {
    await admin.from("fa_gestao_sessoes").delete().eq("token_hash", sessao.tokenHash);
    await auditar(admin, req, "logout", { email: conta.email });
    return jsonResponse(req, { success: true });
  }

  if (action === "launch") {
    const appId = str(body.app) as AppId;
    const app = APPS[appId];
    if (!app) return jsonResponse(req, { error: "sistema desconhecido" }, 400);

    // O nível é conferido aqui no servidor: esconder o quadrado no front não é controle de acesso.
    const niveis = await carregarNiveis(admin, conta);
    if (niveis[appId] === "nenhum") {
      await auditar(admin, req, "launch_negado", { email: conta.email, app: appId });
      return jsonResponse(req, { error: "você não tem acesso a este sistema" }, 403);
    }

    let identidade = conta[app.campo];
    if ((typeof identidade !== "string" || !identidade) && conta.papel === "owner") {
      if (app.tipo === "cacau") {
        identidade = conta.cacau_usuario || (conta.nome ? conta.nome.toLowerCase().split(" ")[0] : conta.email.split("@")[0]);
      } else {
        identidade = (conta.login_email || conta.email).toLowerCase();
      }
    }
    if (typeof identidade !== "string" || !identidade) {
      return jsonResponse(req, { error: "você ainda não tem acesso configurado a este sistema" }, 403);
    }

    let provisionado = "";
    let ticket: string | null;
    if (app.tipo === "cacau") {
      // O Cacau Show não tem acesso só de leitura: avisar aqui, em vez de abrir a aba para a pessoa ouvir "acesso negado".
      if (conta.papel !== "owner" && niveis[appId] === "ver") {
        return jsonResponse(req, { error: "O Cacau Show ainda não tem acesso só de leitura. Peça ao owner para mudar seu nível para operar." }, 403);
      }
      ticket = await ticketCacau(identidade, niveis[appId]);
    } else if (app.tipo === "painel") ticket = await ticketPainel(admin, conta.email, niveis);
    else {
      const { escolhido, aplicado, escopo } = await papeisDaConta(admin, conta.email, appId);
      const papel = papelEfetivo(appId, escolhido);
      // Gestão de Pessoas: cada gerência abre o site da SUA empresa. Sem empresa escolhida, ou com o site
      // da empresa sem endereço configurado, recusa em vez de levar a pessoa ao site da outra empresa.
      if (appId === "rh" && conta.papel === "gerente") {
        if (!escopo) {
          await auditar(admin, req, "launch", { email: conta.email, app: appId, detalhe: "recusado: empresa não escolhida" });
          return jsonResponse(req, { error: "Sua empresa na Gestão de Pessoas ainda não foi escolhida. Peça ao owner para escolher Grupo IB ou Porto Terapia." }, 409);
        }
        if (!baseDoEscopo(appId, escopo)) {
          await auditar(admin, req, "launch", { email: conta.email, app: appId, detalhe: `recusado: site da empresa '${escopo}' sem endereço` });
          return jsonResponse(req, { error: "O endereço do site da sua empresa na Gestão de Pessoas ainda não foi configurado. Avise o owner." }, 409);
        }
      }
      const r = await ticketSupabase(app.tipo, identidade, appId, conta, papel, aplicado, escopo);
      if ("erro" in r) {
        await auditar(admin, req, "launch", { email: conta.email, app: appId, detalhe: `recusado: ${r.erro}`.slice(0, 200) });
        return jsonResponse(req, { error: r.erro }, 409);
      }
      ticket = r.ticket;
      provisionado = r.provisionado;
      // Se o clique completou a pessoa (ex.: trocou o papel), o Hub passa a saber o que aplicou.
      if (provisionado && papel) await registrarProvisao(admin, conta.email, appId, "ok", provisionado, papel);
    }
    if (provisionado) await auditar(admin, req, "acesso_provisionado", { email: conta.email, app: appId, detalhe: provisionado });
    if (!ticket) {
      await auditar(admin, req, "launch", { email: conta.email, app: appId, detalhe: "falhou" });
      return jsonResponse(req, { error: "não foi possível abrir o sistema agora" }, 502);
    }

    let base = (Deno.env.get(app.baseEnv) ?? app.baseDefault).replace(/\/+$/, "");
    if (appId === "rh" && conta.papel === "gerente") {
      const { escopo } = await papeisDaConta(admin, conta.email, appId);
      base = (escopo && baseDoEscopo(appId, escopo)) || base;
    }
    await auditar(admin, req, "launch", { email: conta.email, app: appId });
    return jsonResponse(req, { url: app.entrada(base, ticket) });
  }

  // --- gestão de pessoas e acessos: só owner ---
  const ACOES_OWNER = [
    "contas_listar",
    "conta_salvar",
    "conta_provisionar",
    "conta_ativo",
    "convidar",
    "conta_acesso",
    "sessoes_revogar",
    "auditoria_listar",
    "convite_link_gerar",
    "pessoa_buscar",
  ];
  if (ACOES_OWNER.includes(action)) {
    if (conta.papel !== "owner") {
      await auditar(admin, req, "acao_owner_negada", { email: conta.email, detalhe: action });
      return jsonResponse(req, { error: "apenas owner" }, 403);
    }
    return await acaoOwner(admin, req, body, action, conta);
  }

  // --- equipe da Clínica: owner OU administrador da Clínica (administração delegada) ---
  // Quem é "administrador" é decidido aqui, no servidor, pelo nível do Hub: gerência com nível admin no
  // módulo Clínica. Delegar NÃO dá poder sobre contas do Hub (criar, dar nível, desativar gerências
  // continua só do owner) nem sobre papéis acima do da equipe: só terapeuta, recepção e faturamento, e
  // nunca quem tem conta no Hub (inclusive o próprio administrador).
  const ACOES_EQUIPE = ["equipe_listar", "equipe_criar", "equipe_resetar_senha", "equipe_ativo"];
  if (ACOES_EQUIPE.includes(action)) {
    const niveis = await carregarNiveis(admin, conta);
    if (conta.papel !== "owner" && niveis.clinica !== "admin") {
      await auditar(admin, req, "acao_equipe_negada", { email: conta.email, detalhe: action });
      return jsonResponse(req, { error: "apenas o owner ou quem administra a Clínica" }, 403);
    }
    return await acaoEquipe(admin, req, body, action, conta);
  }

  return jsonResponse(req, { error: "ação inválida" }, 400);
});

// ---------------------------------------------------------------------
// Pessoas e acessos (só owner)
// ---------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CAMPOS_MAPEAMENTO = [...new Set(APP_IDS.map((id) => APPS[id].campo))].filter((c) => c !== "painel_usuario");
const COLUNAS_PUBLICAS =
  "email, email_codigo, nome, playground_email, clinica_email, financeiro_email, rh_email, cacau_usuario, painel_usuario, ativo, papel, auth_modo, login_email, senha_definida_em, convidado_em, criado_por, created_at";

// ---------------------------------------------------------------------
// Desligar / religar a pessoa em cada sistema (conta_ativo)
//
// Desativar uma conta no Hub passa a bloquear o ACESSO dela em cada sistema onde ela tem identidade:
//   - Supabase (Clínica, Gestão de Pessoas, Playground, Simulador): banimento do login
//     (auth.admin ban_duration) e, quando o sistema tem a flag, `active = false` (Clínica: profiles;
//     Playground: fa_kiosk_employees), que também corta a sessão que já estava aberta nas políticas RLS;
//   - Cacau Show: ordem assinada para POST /api/auth/hub/acesso (colaboradores.ativo = 0).
//
// REGRAS DURAS:
//   - NUNCA apaga nada: PIN, hash de PIN, biometria, ponto e histórico ficam intactos.
//   - NUNCA toca em conta de unidade/quiosque (*_unit): é login compartilhado do tablet da loja.
//   - Reativar desfaz SÓ o que o Hub bloqueou (fa_gestao_bloqueios). Quem já estava desativado no
//     sistema por outro motivo continua desativado.
//   - Idempotente: repetir a ordem não muda nada, e uma falha em um sistema não impede os outros.
// ---------------------------------------------------------------------

const BAN_LONGO = "876000h"; // ~100 anos; reativar usa "none"

type EstadoSistema = "bloqueado" | "ja_bloqueado" | "restaurado" | "nada_a_restaurar" | "sem_conta" | "pulado" | "erro";
type ResultadoSistema = { app: AppId; rotulo: string; estado: EstadoSistema; texto: string };
type ParcialSistema = { estado: EstadoSistema; texto: string };

const SISTEMAS_BLOQUEAVEIS: AppId[] = ["playground", "clinica", "financeiro", "rh", "cacau"];

function clienteSupabase(tipo: "supabase_a" | "supabase_b"): SupabaseClient | null {
  const url = tipo === "supabase_a" ? Deno.env.get("SUPABASE_URL") : Deno.env.get("CLINICA_SUPABASE_URL");
  const key = tipo === "supabase_a"
    ? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    : Deno.env.get("CLINICA_SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

type UsuarioBloqueavel = UsuarioAuth & { banned_until?: string | null };

// Procura pelo e-mail SEM criar ninguém (generateLink criaria o usuário se não existisse).
async function acharUsuarioAuth(client: SupabaseClient, email: string): Promise<UsuarioBloqueavel | null> {
  const alvo = email.toLowerCase();
  const POR_PAGINA = 200;
  for (let pagina = 1; pagina <= 25; pagina++) {
    const { data, error } = await client.auth.admin.listUsers({ page: pagina, perPage: POR_PAGINA });
    if (error) throw new Error(error.message);
    const achou = data.users.find((u) => (u.email ?? "").toLowerCase() === alvo);
    if (achou) return achou as unknown as UsuarioBloqueavel;
    if (data.users.length < POR_PAGINA) return null;
  }
  return null;
}

// Encerra as sessões que a pessoa já tinha abertas (projeto B: Clínica e Gestão de Pessoas). O banimento
// só impede novas entradas e a renovação do token; sem isto, quem estava logado seguia até o app pedir
// um token novo. A função do banco só age em quem já está banido e nunca em conta de unidade, e só
// apaga sessão e refresh token (nada de usuário, PIN ou dado). O token de acesso já emitido ainda vale
// até expirar (1 h), pois a API de dados confere só a assinatura dele.
async function encerrarSessoes(client: SupabaseClient, userId: string): Promise<{ encerradas: number } | { erro: string }> {
  const { data, error } = await client.rpc("hub_encerrar_sessoes", { p_user_id: userId });
  if (error) {
    console.error("hub_encerrar_sessoes:", error.message);
    return { erro: `não consegui encerrar as sessões abertas: ${error.message}` };
  }
  return { encerradas: typeof data === "number" ? data : 0 };
}

async function bloqueioAberto(admin: Admin, email: string, modulo: AppId): Promise<Record<string, unknown> | null> {
  const { data, error } = await admin
    .from("fa_gestao_bloqueios")
    .select("detalhe")
    .eq("email", email)
    .eq("modulo", modulo)
    .is("desfeito_em", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? ((data.detalhe ?? {}) as Record<string, unknown>) : null;
}

// Mescla com o que já estava registrado: se uma tentativa anterior bloqueou só uma parte, a próxima
// não pode esquecer o que foi feito.
async function registrarBloqueio(admin: Admin, email: string, modulo: AppId, novo: Record<string, unknown>) {
  const antes = await bloqueioAberto(admin, email, modulo);
  const detalhe = { ...(antes ?? {}), ...novo };
  const { error } = antes
    ? await admin.from("fa_gestao_bloqueios").update({ detalhe }).eq("email", email).eq("modulo", modulo).is("desfeito_em", null)
    : await admin.from("fa_gestao_bloqueios").insert({ email, modulo, detalhe });
  if (error) throw new Error(`não consegui registrar o bloqueio: ${error.message}`);
}

async function desligarSupabase(admin: Admin, appId: AppId, email: string): Promise<ParcialSistema> {
  const client = clienteSupabase(APPS[appId].tipo as "supabase_a" | "supabase_b");
  if (!client) return { estado: "erro", texto: "sistema sem configuração no servidor" };
  const user = await acharUsuarioAuth(client, email);
  if (!user) return { estado: "sem_conta", texto: "sem conta com esse e-mail, nada a bloquear" };
  if (ehContaDeUnidade(user)) return { estado: "pulado", texto: "é conta de unidade (quiosque), o Hub não mexe" };

  const novo: Record<string, unknown> = {};
  const erros: string[] = [];

  const jaBanido = !!user.banned_until && Date.parse(user.banned_until) > Date.now();
  if (!jaBanido) {
    const { error } = await client.auth.admin.updateUserById(user.id, { ban_duration: BAN_LONGO });
    if (error) erros.push(`login: ${error.message}`);
    else novo.ban = true;
  }

  if (appId === "clinica") {
    const { data: perfil, error } = await client.from("profiles").select("active").eq("id", user.id).maybeSingle();
    if (error) erros.push(`perfil: ${error.message}`);
    else if (perfil && perfil.active !== false) {
      const { error: upErr } = await client.from("profiles").update({ active: false }).eq("id", user.id);
      if (upErr) erros.push(`perfil: ${upErr.message}`);
      else novo.perfil_ativo_antes = true;
    }
  }

  if (appId === "playground") {
    const { data: colab, error } = await client
      .from("fa_kiosk_employees")
      .select("id, active")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (error) erros.push(`colaborador: ${error.message}`);
    else if (colab && colab.active !== false) {
      const { error: upErr } = await client.from("fa_kiosk_employees").update({ active: false }).eq("id", colab.id);
      if (upErr) erros.push(`colaborador: ${upErr.message}`);
      else {
        novo.colaborador_id = colab.id;
        novo.colaborador_ativo_antes = true;
        await client.from("fa_kiosk_audit_log").insert({
          action: "HUB_DISABLE_EMPLOYEE",
          severity: "ALERTA",
          details_json: { employeeId: colab.id, via: "gestao-hub" },
        });
      }
    }
  }

  if (Object.keys(novo).length) await registrarBloqueio(admin, email, appId, novo);

  // Projeto B: derruba também a sessão aberta. Roda mesmo se o login já estava banido, para que repetir
  // "desativar" complete o que faltou.
  let sessoes = "";
  if (APPS[appId].tipo === "supabase_b" && (jaBanido || novo.ban === true)) {
    const r = await encerrarSessoes(client, user.id);
    if ("erro" in r) erros.push(r.erro);
    else if (r.encerradas > 0) sessoes = `, ${r.encerradas} sessão(ões) aberta(s) encerrada(s)`;
  }
  if (erros.length) return { estado: "erro", texto: erros.join("; ") };
  return Object.keys(novo).length
    ? { estado: "bloqueado", texto: `acesso bloqueado${sessoes}` }
    : { estado: "ja_bloqueado", texto: `já estava bloqueado, nada a mudar${sessoes}` };
}

async function religarSupabase(admin: Admin, appId: AppId, email: string): Promise<ParcialSistema> {
  const feito = await bloqueioAberto(admin, email, appId);
  if (!feito) return { estado: "nada_a_restaurar", texto: "o Hub não tinha bloqueado aqui, nada a restaurar" };
  const client = clienteSupabase(APPS[appId].tipo as "supabase_a" | "supabase_b");
  if (!client) return { estado: "erro", texto: "sistema sem configuração no servidor" };
  const user = await acharUsuarioAuth(client, email);
  const erros: string[] = [];

  if (user && !ehContaDeUnidade(user)) {
    if (feito.ban === true) {
      const { error } = await client.auth.admin.updateUserById(user.id, { ban_duration: "none" });
      if (error) erros.push(`login: ${error.message}`);
    }
    if (appId === "clinica" && feito.perfil_ativo_antes === true) {
      const { error } = await client.from("profiles").update({ active: true }).eq("id", user.id);
      if (error) erros.push(`perfil: ${error.message}`);
    }
    if (appId === "playground" && feito.colaborador_ativo_antes === true && typeof feito.colaborador_id === "string") {
      const { error } = await client.from("fa_kiosk_employees").update({ active: true }).eq("id", feito.colaborador_id);
      if (error) erros.push(`colaborador: ${error.message}`);
      else {
        await client.from("fa_kiosk_audit_log").insert({
          action: "HUB_ENABLE_EMPLOYEE",
          severity: "ALERTA",
          details_json: { employeeId: feito.colaborador_id, via: "gestao-hub" },
        });
      }
    }
  }
  // Com erro, o bloqueio segue aberto: reativar de novo tenta o que faltou.
  if (erros.length) return { estado: "erro", texto: erros.join("; ") };
  const { error } = await admin
    .from("fa_gestao_bloqueios")
    .update({ desfeito_em: new Date().toISOString() })
    .eq("email", email)
    .eq("modulo", appId)
    .is("desfeito_em", null);
  if (error) return { estado: "erro", texto: `restaurei o acesso, mas não consegui fechar o registro: ${error.message}` };
  return { estado: "restaurado", texto: "acesso restaurado" };
}

// Ordem assinada (HMAC-SHA256) para o Cacau: base64url(payload).base64url(assinatura), 60 s, uso único.
async function ordemCacau(usuario: string, acao: "desligar" | "religar" | "consultar"): Promise<string | null> {
  const secret = Deno.env.get("GESTAO_SSO_SECRET_CACAU");
  if (!secret) return null;
  const payload = {
    u: usuario,
    a: acao,
    aud: "hub-operacoes-acesso",
    exp: Math.floor(Date.now() / 1000) + 60,
    jti: crypto.randomUUID(),
  };
  const payloadB64 = base64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${base64url(new Uint8Array(sig))}`;
}

type RespostaCacau = { mudou: boolean; encontrado: boolean; ativo?: boolean; role?: string };
async function chamarCacau(usuario: string, acao: "desligar" | "religar" | "consultar"): Promise<RespostaCacau | { erro: string }> {
  const ticket = await ordemCacau(usuario, acao);
  if (!ticket) return { erro: "sistema sem configuração no servidor (GESTAO_SSO_SECRET_CACAU)" };
  const base = (Deno.env.get(APPS.cacau.baseEnv) ?? APPS.cacau.baseDefault).replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/api/auth/hub/acesso`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket }),
      signal: AbortSignal.timeout(8000),
    });
    const corpo = await res.json().catch(() => ({}));
    if (!res.ok) return { erro: String(corpo.error ?? `o Cacau respondeu ${res.status}`) };
    return {
      mudou: corpo.mudou === true,
      encontrado: corpo.encontrado !== false,
      ativo: typeof corpo.ativo === "boolean" ? corpo.ativo : undefined,
      role: typeof corpo.role === "string" ? corpo.role : undefined,
    };
  } catch (e) {
    return { erro: `o Cacau não respondeu (${e instanceof Error ? e.message : "falha de rede"})` };
  }
}

async function desligarCacau(admin: Admin, email: string, usuario: string): Promise<ParcialSistema> {
  const r = await chamarCacau(usuario, "desligar");
  if ("erro" in r) return { estado: "erro", texto: r.erro };
  if (!r.encontrado) return { estado: "sem_conta", texto: "usuário não existe no Cacau, nada a bloquear" };
  if (!r.mudou) return { estado: "ja_bloqueado", texto: "já estava bloqueado, nada a mudar" };
  await registrarBloqueio(admin, email, "cacau", { ativo_antes: true });
  return { estado: "bloqueado", texto: "acesso bloqueado" };
}

async function religarCacau(admin: Admin, email: string, usuario: string): Promise<ParcialSistema> {
  const feito = await bloqueioAberto(admin, email, "cacau");
  if (!feito) return { estado: "nada_a_restaurar", texto: "o Hub não tinha bloqueado aqui, nada a restaurar" };
  const r = await chamarCacau(usuario, "religar");
  if ("erro" in r) return { estado: "erro", texto: r.erro };
  const { error } = await admin
    .from("fa_gestao_bloqueios")
    .update({ desfeito_em: new Date().toISOString() })
    .eq("email", email)
    .eq("modulo", "cacau")
    .is("desfeito_em", null);
  if (error) return { estado: "erro", texto: `restaurei o acesso, mas não consegui fechar o registro: ${error.message}` };
  return { estado: "restaurado", texto: "acesso restaurado" };
}

// Percorre os sistemas onde a pessoa tem identidade. Cada sistema é independente: erro em um
// (rede, configuração) vira uma linha de resultado e não impede os outros.
async function aplicarEmSistemas(
  admin: Admin,
  req: Request,
  conta: Conta,
  acao: "desligar" | "religar",
  porQuem: string,
): Promise<ResultadoSistema[]> {
  const resultados: ResultadoSistema[] = [];
  // Sem a tabela de registro o Hub bloquearia sem saber desfazer: se ela não existe (migração
  // 20261026130000 ainda não aplicada), não mexe em sistema nenhum.
  const { error: semTabela } = await admin.from("fa_gestao_bloqueios").select("id").limit(1);
  if (semTabela) {
    console.error("fa_gestao_bloqueios indisponível:", semTabela.message);
    return [{
      app: "cacau",
      rotulo: "Hub",
      estado: "erro",
      texto: "nenhum sistema foi alterado: aplique a migração fa_gestao_bloqueios no Supabase e tente de novo",
    }];
  }
  for (const appId of SISTEMAS_BLOQUEAVEIS) {
    const app = APPS[appId];
    const identidade = conta[app.campo];
    if (typeof identidade !== "string" || !identidade) continue;
    let parcial: ParcialSistema;
    try {
      if (app.tipo === "cacau") {
        parcial = acao === "desligar" ? await desligarCacau(admin, conta.email, identidade) : await religarCacau(admin, conta.email, identidade);
      } else {
        parcial = acao === "desligar"
          ? await desligarSupabase(admin, appId, identidade.toLowerCase())
          : await religarSupabase(admin, appId, identidade.toLowerCase());
      }
    } catch (e) {
      console.error(`${acao} ${appId}:`, e instanceof Error ? e.message : e);
      parcial = { estado: "erro", texto: e instanceof Error ? e.message : "falha inesperada" };
    }
    resultados.push({ app: appId, rotulo: app.rotulo, ...parcial });
    await auditar(admin, req, acao === "desligar" ? "sistema_bloqueado" : "sistema_restaurado", {
      email: conta.email,
      app: appId,
      detalhe: `${parcial.estado}: ${parcial.texto} (por ${porQuem})`.slice(0, 200),
    });
  }
  return resultados;
}

// ---------------------------------------------------------------------
// Provisionar a pessoa nos sistemas AO SALVAR (conta_salvar / conta_provisionar)
//
// Antes, a pessoa só era completada no primeiro clique no quadrado, e qualquer problema (papel já
// existente, conta desativada, e-mail errado) aparecia para ELA, sem explicação. Agora o Hub cria o login
// e dá o papel escolhido no ato de salvar e mostra ao dono o resultado de cada sistema.
//
// Mesmas regras duras do resto: idempotente, nunca troca papel que a pessoa já tinha no sistema, nunca
// toca em conta de unidade (*_unit), nunca apaga nada e nunca cria colaborador do Cacau (só confere).
// ---------------------------------------------------------------------

type ResultadoProvisao = { app: AppId; rotulo: string; estado: "ok" | "erro" | "pulado"; texto: string };
type ParcialProvisao = { estado: "ok" | "erro" | "pulado"; texto: string; papelAplicado?: string | null };

// Papel escolhido pelo dono (permissoes.papel_nativo) e o que o Hub aplicou da última vez (provisionamento).
async function papeisDaConta(
  admin: Admin,
  email: string,
  modulo: AppId,
): Promise<{ escolhido: string | null; aplicado: string | null; escopo: string | null }> {
  const [{ data: p }, { data: v }] = await Promise.all([
    admin.from("fa_gestao_permissoes").select("papel_nativo, escopo").eq("email", email).eq("modulo", modulo).maybeSingle(),
    admin.from("fa_gestao_provisionamento").select("papel_aplicado").eq("email", email).eq("modulo", modulo).maybeSingle(),
  ]);
  return {
    escolhido: (p?.papel_nativo as string | null | undefined) ?? null,
    aplicado: (v?.papel_aplicado as string | null | undefined) ?? null,
    escopo: escopoValido(modulo, p?.escopo),
  };
}

// `papelAplicado` só entra quando o Hub de fato criou ou mudou algo: um papel que já estava lá não é "do Hub".
async function registrarProvisao(admin: Admin, email: string, modulo: AppId, estado: string, mensagem: string, papelAplicado: string | null) {
  const linha: Record<string, unknown> = { email, modulo, estado, mensagem: mensagem.slice(0, 300), atualizado_em: new Date().toISOString() };
  if (papelAplicado) linha.papel_aplicado = papelAplicado;
  const { error } = await admin.from("fa_gestao_provisionamento").upsert(linha, { onConflict: "email,modulo" });
  if (error) console.error("registrar provisão:", error.message);
}

async function provisionarSupabase(
  appId: AppId,
  email: string,
  conta: Conta,
  papel: string | null,
  papelAnterior: string | null,
  escopo: string | null,
): Promise<ParcialProvisao> {
  const client = clienteSupabase(APPS[appId].tipo as "supabase_a" | "supabase_b");
  if (!client) return { estado: "erro", texto: "sistema sem configuração no servidor" };

  let user = await acharUsuarioAuth(client, email);
  let criado = false;
  if (!user) {
    const { data, error } = await client.auth.admin.createUser({ email, email_confirm: true });
    if (error || !data?.user) return { estado: "erro", texto: `não consegui criar o login: ${error?.message ?? "sem resposta"}` };
    user = data.user as unknown as UsuarioBloqueavel;
    criado = true;
  }
  if (ehContaDeUnidade(user)) {
    return { estado: "pulado", texto: `${email} é conta de unidade (quiosque compartilhado), não de uma pessoa. O Hub não mexe: informe o e-mail individual.` };
  }
  if (user.banned_until && Date.parse(user.banned_until) > Date.now()) {
    return { estado: "erro", texto: "o login está bloqueado (a pessoa foi desligada). Reative a conta primeiro" };
  }
  try {
    const feito = await provisionar(client, appId, user, conta, email, papel, papelAnterior, escopo);
    const texto = [criado ? "login criado" : "", feito].filter(Boolean).join("; ") || "já estava em dia";
    return { estado: "ok", texto, papelAplicado: feito ? papel : null };
  } catch (e) {
    if (e instanceof RecusaAcesso) return { estado: "erro", texto: e.message };
    throw e;
  }
}

// Cacau: o Hub NÃO cria colaborador (quem cadastra e dá o papel é o owner, no Cacau). Só confere que o
// usuário informado existe e está ativo, para o erro de digitação aparecer agora e não no primeiro clique.
async function conferirCacau(usuario: string, nivel: Nivel): Promise<ParcialProvisao> {
  if (nivel === "ver") {
    return { estado: "erro", texto: "o Cacau Show ainda não tem acesso só de leitura: use o nível operar ou admin" };
  }
  const r = await chamarCacau(usuario, "consultar");
  if ("erro" in r) return { estado: "erro", texto: r.erro };
  if (!r.encontrado) {
    return { estado: "erro", texto: `"${usuario}" não existe no Cacau Show. Cadastre o colaborador lá primeiro (o Hub não cria colaborador do Cacau)` };
  }
  if (r.ativo === false) return { estado: "erro", texto: `"${usuario}" está desativado no Cacau Show` };
  return { estado: "ok", texto: `existe no Cacau Show${r.role ? ` como ${r.role}` : ""}` };
}

// Percorre os sistemas em que a pessoa tem nível. Um sistema com problema vira uma linha do resultado e não
// impede os outros. Contas owner não são provisionadas (já existem nos sistemas, cadastradas à mão).
async function provisionarModulos(
  admin: Admin,
  req: Request,
  conta: Conta,
  niveis: Niveis,
  porQuem: string,
): Promise<ResultadoProvisao[]> {
  if (conta.papel !== "gerente") return [];
  const resultados: ResultadoProvisao[] = [];
  for (const appId of SISTEMAS_BLOQUEAVEIS) {
    if (niveis[appId] === "nenhum") continue;
    const app = APPS[appId];
    const identidade = conta[app.campo];
    let parcial: ParcialProvisao;
    if (typeof identidade !== "string" || !identidade) {
      parcial = { estado: "pulado", texto: `falta informar ${app.campoRotulo.toLowerCase()}` };
    } else {
      try {
        if (app.tipo === "cacau") {
          parcial = await conferirCacau(identidade, niveis[appId]);
        } else {
          const { escolhido, aplicado, escopo } = await papeisDaConta(admin, conta.email, appId);
          parcial = appId === "rh" && !escopo
            ? { estado: "erro", texto: "escolha a empresa (Grupo IB ou Porto Terapia) desta pessoa" }
            : await provisionarSupabase(appId, identidade.toLowerCase(), conta, papelEfetivo(appId, escolhido), aplicado, escopo);
        }
      } catch (e) {
        console.error(`provisionar ${appId}:`, e instanceof Error ? e.message : e);
        parcial = { estado: "erro", texto: e instanceof Error ? e.message : "falha inesperada" };
      }
    }
    await registrarProvisao(admin, conta.email, appId, parcial.estado, parcial.texto, parcial.papelAplicado ?? null);
    resultados.push({ app: appId, rotulo: app.rotulo, estado: parcial.estado, texto: parcial.texto });
    await auditar(admin, req, "sistema_provisionado", {
      email: conta.email,
      app: appId,
      detalhe: `${parcial.estado}: ${parcial.texto} (por ${porQuem})`.slice(0, 200),
    });
  }
  return resultados;
}

// Derruba o que a pessoa tem aberto: sessão do Hub e sessão do /admin (12 h), para um novo nível valer já.
async function revogarSessoes(admin: Admin, email: string, painelUsuario: string | null) {
  await admin.from("fa_gestao_sessoes").delete().eq("email", email);
  if (painelUsuario) await admin.from("fa_teste_admin_sessions").delete().eq("admin_email", painelUsuario);
}

// ---------------------------------------------------------------------
// Equipe da Clínica (terapeutas, recepção e faturamento): criar, redefinir senha e bloquear
// (owner, ou gerência com nível admin na Clínica: administração delegada)
//
// Esta equipe NÃO tem conta no Hub: entra direto na Clínica, por CPF e senha. O Hub é só o lugar onde o
// owner cria, redefine e bloqueia, sem abrir a Clínica. A fonte da verdade continua sendo `profiles`
// da Clínica (nada é copiado para o Hub). Segue o que a própria tela da Clínica já faz:
//   - criar: login por CPF (e-mail é opcional; sem ele, um sintético que a pessoa nunca vê) e senha
//     TEMPORÁRIA com troca obrigatória no primeiro acesso (profiles.must_change_password). O Hub não
//     escolhe nem guarda senha: ela aparece uma única vez para o owner, nunca vai a log nem a auditoria.
//     Link por e-mail não serve aqui, porque parte da equipe não tem e-mail real.
//   - redefinir: nova senha temporária + troca obrigatória.
//   - bloquear / reativar: banimento do login + profiles.active, como no desligamento das gerências.
// REGRAS DURAS: nunca toca no PIN de assinatura da Clínica (signature_pin_*), nunca exclui ninguém e
// nunca mexe em conta de gerência do Hub (essas são geridas em "Pessoas e acessos").
// ---------------------------------------------------------------------

const PAPEIS_EQUIPE = ["terapeuta", "recepcao", "faturamento"];
const DOMINIO_EMAIL_INTERNO = "staff.facaamigos.local";
// Sem caracteres ambíguos (0/O, 1/l/I): a senha é lida em voz alta ou digitada à mão. Sempre termina
// em "@9", o que cumpre a regra da Clínica (maiúscula, caractere especial, mínimo de 6).
const ALFABETO_SENHA = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function senhaTemporaria(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALFABETO_SENHA[b % ALFABETO_SENHA.length]).join("") + "@9";
}

function cpfValido(d: string): boolean {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  for (const t of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += Number(d[i]) * (t + 1 - i);
    const dv = ((soma * 10) % 11) % 10;
    if (dv !== Number(d[t])) return false;
  }
  return true;
}

const mascararCpf = (d: string | null) => (d && d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : null);

async function acaoEquipe(
  admin: Admin,
  req: Request,
  body: Record<string, unknown>,
  action: string,
  dono: Conta,
): Promise<Response> {
  const client = clienteSupabase("supabase_b");
  if (!client) return jsonResponse(req, { error: "A Clínica não está ligada ao Hub neste servidor." }, 503);

  // Contas de gerência do Hub que também existem na Clínica: geridas em "Pessoas e acessos", não aqui.
  const { data: contasHub } = await admin.from("fa_gestao_contas").select("clinica_email");
  const emailsDoHub = new Set((contasHub ?? []).map((c: { clinica_email: string | null }) => (c.clinica_email ?? "").toLowerCase()).filter(Boolean));

  const trilha = async (profileId: string, acao: string, depois: Record<string, unknown>) => {
    // Rastro na Clínica (como as telas dela): se falhar, a ação já aconteceu e não é desfeita.
    const { error } = await client.from("audit_log").insert({
      table_name: "profiles",
      row_id: profileId,
      action: acao,
      actor_id: null,
      clinic_id: CLINICA_ID,
      after: { ...depois, via: "gestao-hub", por: dono.email },
    });
    if (error) console.error("audit_log da Clínica:", error.message);
  };

  const alvoDaEquipe = async (id: string) => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return { erro: "colaborador inválido" as const };
    const { data: alvo, error } = await client
      .from("profiles")
      .select("id, full_name, role, clinic_id, email")
      .eq("id", id)
      .maybeSingle();
    if (error) return { erro: "não consegui consultar a Clínica agora" as const };
    if (!alvo || alvo.clinic_id !== CLINICA_ID || !PAPEIS_EQUIPE.includes(alvo.role)) {
      return { erro: "colaborador não encontrado na equipe da Clínica" as const };
    }
    if (emailsDoHub.has(String(alvo.email ?? "").toLowerCase())) {
      return { erro: "esta pessoa tem conta no Hub: só o owner gerencia (em Pessoas e acessos)" as const };
    }
    return { alvo };
  };

  if (action === "equipe_listar") {
    const { data, error } = await client
      .from("profiles")
      .select("id, full_name, cpf, email, role, active, must_change_password, council_type, is_evaluator, is_at_professional")
      .eq("clinic_id", CLINICA_ID)
      .in("role", PAPEIS_EQUIPE)
      .order("full_name", { ascending: true });
    if (error) return jsonResponse(req, { error: "não consegui listar a equipe da Clínica" }, 502);
    return jsonResponse(req, {
      papeis: [
        { id: "terapeuta", rotulo: "Terapeuta" },
        { id: "recepcao", rotulo: "Recepção" },
        { id: "faturamento", rotulo: "Faturamento" },
      ],
      equipe: (data ?? []).map((p: Record<string, any>) => ({
        id: p.id,
        nome: p.full_name,
        cpf: mascararCpf(p.cpf ?? null),
        email: p.email && !String(p.email).endsWith(`@${DOMINIO_EMAIL_INTERNO}`) ? p.email : null,
        papel: p.role,
        ativo: p.active !== false,
        trocar_senha: p.must_change_password === true,
        conselho: p.council_type ?? null,
        avaliador: p.is_evaluator === true,
        at: p.is_at_professional === true,
        no_hub: emailsDoHub.has(String(p.email ?? "").toLowerCase()),
      })),
    });
  }

  if (action === "equipe_criar") {
    const nome = str(body.nome).slice(0, 120);
    const cpf = str(body.cpf).replace(/\D/g, "");
    const emailInformado = str(body.email).toLowerCase();
    const papel = str(body.papel);
    const conselho = str(body.conselho).slice(0, 40) || null;
    const nascimento = /^\d{4}-\d{2}-\d{2}$/.test(str(body.nascimento)) ? str(body.nascimento) : null;
    if (nome.length < 2) return jsonResponse(req, { error: "informe o nome" }, 400);
    if (!cpfValido(cpf)) return jsonResponse(req, { error: "CPF inválido" }, 400);
    if (emailInformado && !EMAIL_RE.test(emailInformado)) return jsonResponse(req, { error: "e-mail inválido" }, 400);
    if (!PAPEIS_EQUIPE.includes(papel)) return jsonResponse(req, { error: "papel inválido" }, 400);

    const { data: mesmoCpf, error: cpfErr } = await client.from("profiles").select("id").eq("cpf", cpf).maybeSingle();
    if (cpfErr) return jsonResponse(req, { error: "não consegui consultar a Clínica agora" }, 502);
    if (mesmoCpf) return jsonResponse(req, { error: "já existe alguém com este CPF na Clínica" }, 409);

    const email = emailInformado || `equipe_${cpf}@${DOMINIO_EMAIL_INTERNO}`;
    const senha = senhaTemporaria();
    const { data: criado, error: authErr } = await client.auth.admin.createUser({ email, password: senha, email_confirm: true });
    if (authErr || !criado?.user) {
      const existe = /already been registered|already registered/i.test(authErr?.message ?? "");
      return jsonResponse(req, { error: existe ? "já existe um login com este e-mail" : "não consegui criar o login na Clínica" }, existe ? 409 : 502);
    }
    const { data: unidade } = await client.from("units").select("id").order("name", { ascending: true }).limit(1).maybeSingle();

    // O gatilho de auth.users já criou um perfil provisório: é upsert, não insert.
    const { error: perfilErr } = await client.from("profiles").upsert({
      id: criado.user.id,
      clinic_id: CLINICA_ID,
      role: papel,
      full_name: nome,
      cpf,
      email,
      council_type: conselho,
      is_evaluator: body.avaliador === true,
      is_at_professional: body.at === true,
      birth_date: nascimento,
      unit_id: unidade?.id ?? null,
      active: true,
      must_change_password: true,
    }, { onConflict: "id" });
    if (perfilErr) {
      // Sem perfil a conta não serve para nada: desfaz o login para não deixar lixo no Auth.
      await client.auth.admin.deleteUser(criado.user.id);
      const cpfDuplicado = perfilErr.message.includes("profiles_cpf_unique") || /cpf/i.test(perfilErr.message);
      console.error("equipe_criar (perfil):", perfilErr.message);
      return jsonResponse(req, { error: cpfDuplicado ? "já existe alguém com este CPF na Clínica" : "não consegui criar o perfil na Clínica" }, cpfDuplicado ? 409 : 502);
    }
    await trilha(criado.user.id, "staff_created", { role: papel, must_change_password: true });
    await auditar(admin, req, "equipe_criada", { email: dono.email, app: "clinica", detalhe: `por ${dono.email}; ${nome}; ${papel}`.slice(0, 200) });
    return jsonResponse(req, { ok: true, id: criado.user.id, senha_temporaria: senha });
  }

  if (action === "equipe_resetar_senha") {
    const r = await alvoDaEquipe(str(body.id));
    if ("erro" in r) return jsonResponse(req, { error: r.erro }, 409);
    const senha = senhaTemporaria();
    const { error: authErr } = await client.auth.admin.updateUserById(r.alvo.id, { password: senha });
    if (authErr) return jsonResponse(req, { error: "não consegui redefinir a senha na Clínica" }, 502);
    const { error: flagErr } = await client.from("profiles").update({ must_change_password: true }).eq("id", r.alvo.id);
    if (flagErr) {
      // A senha já mudou; sem a flag a pessoa ficaria com a temporária. Avisa em vez de passar batido.
      return jsonResponse(req, { error: "A senha foi redefinida, mas não consegui exigir a troca no próximo acesso. Redefina de novo." }, 502);
    }
    await trilha(r.alvo.id, "staff_password_reset", { must_change_password: true });
    await auditar(admin, req, "equipe_senha_redefinida", { email: dono.email, app: "clinica", detalhe: `por ${dono.email}; ${r.alvo.full_name}`.slice(0, 200) });
    return jsonResponse(req, { ok: true, senha_temporaria: senha });
  }

  if (action === "equipe_ativo") {
    const ativo = body.ativo === true;
    const r = await alvoDaEquipe(str(body.id));
    if ("erro" in r) return jsonResponse(req, { error: r.erro }, 409);
    const { error: banErr } = await client.auth.admin.updateUserById(r.alvo.id, { ban_duration: ativo ? "none" : BAN_LONGO });
    if (banErr) return jsonResponse(req, { error: "não consegui alterar o login na Clínica" }, 502);
    const { error: flagErr } = await client.from("profiles").update({ active: ativo }).eq("id", r.alvo.id);
    if (flagErr) return jsonResponse(req, { error: "o login foi alterado, mas não consegui atualizar o perfil. Tente de novo." }, 502);
    if (!ativo) {
      const enc = await encerrarSessoes(client, r.alvo.id);
      if ("erro" in enc) return jsonResponse(req, { error: "A pessoa foi bloqueada, mas não consegui encerrar a sessão aberta dela. Bloqueie de novo para tentar outra vez." }, 502);
    }
    await trilha(r.alvo.id, ativo ? "staff_enabled" : "staff_disabled", { active: ativo });
    await auditar(admin, req, ativo ? "equipe_reativada" : "equipe_bloqueada", { email: dono.email, app: "clinica", detalhe: `por ${dono.email}; ${r.alvo.full_name}`.slice(0, 200) });
    return jsonResponse(req, { ok: true });
  }

  return jsonResponse(req, { error: "ação inválida" }, 400);
}

async function acaoOwner(
  admin: Admin,
  req: Request,
  body: Record<string, unknown>,
  action: string,
  dono: Conta,
): Promise<Response> {
  const alvoEmail = str(body.email).toLowerCase();

  if (action === "contas_listar") {
    const [{ data: contas, error }, { data: perms }, { data: provs }] = await Promise.all([
      admin.from("fa_gestao_contas").select(COLUNAS_PUBLICAS).order("created_at", { ascending: true }),
      admin.from("fa_gestao_permissoes").select("email, modulo, nivel, papel_nativo, escopo"),
      admin.from("fa_gestao_provisionamento").select("email, modulo, estado, mensagem, atualizado_em"),
    ]);
    if (error) return jsonResponse(req, { error: "falha ao listar" }, 500);
    const porEmail = new Map<string, Record<string, string>>();
    const papeisPorEmail = new Map<string, Record<string, string>>();
    const escoposPorEmail = new Map<string, Record<string, string>>();
    for (const p of perms ?? []) {
      if (p.escopo) {
        const ee = escoposPorEmail.get(p.email) ?? {};
        ee[p.modulo] = p.escopo;
        escoposPorEmail.set(p.email, ee);
      }
      const m = porEmail.get(p.email) ?? {};
      m[p.modulo] = p.nivel;
      porEmail.set(p.email, m);
      if (p.papel_nativo) {
        const pp = papeisPorEmail.get(p.email) ?? {};
        pp[p.modulo] = p.papel_nativo;
        papeisPorEmail.set(p.email, pp);
      }
    }
    const provPorEmail = new Map<string, Record<string, { estado: string; mensagem: string | null; atualizado_em: string }>>();
    for (const v of provs ?? []) {
      const m = provPorEmail.get(v.email) ?? {};
      m[v.modulo] = { estado: v.estado, mensagem: v.mensagem, atualizado_em: v.atualizado_em };
      provPorEmail.set(v.email, m);
    }
    return jsonResponse(req, {
      contas: (contas ?? []).map((c) => ({
        ...c,
        permissoes: porEmail.get(c.email) ?? {},
        papeis: papeisPorEmail.get(c.email) ?? {},
        escopos: escoposPorEmail.get(c.email) ?? {},
        provisionamento: provPorEmail.get(c.email) ?? {},
      })),
      modulos: APP_IDS.map((id) => ({
        id,
        rotulo: APPS[id].rotulo,
        campo: APPS[id].campo,
        campo_rotulo: APPS[id].campoRotulo,
        papeis: PAPEIS_NATIVOS[id]?.opcoes ?? [],
        papel_padrao: PAPEIS_NATIVOS[id]?.padrao ?? null,
        escopos: (ESCOPOS[id] ?? []).map((e) => ({ id: e.id, rotulo: e.rotulo })),
      })),
      niveis: NIVEIS,
    });
  }

  if (action === "auditoria_listar") {
    const limite = Math.min(Math.max(Number(body.limit) || 50, 1), 200);
    let q = admin
      .from("fa_gestao_auditoria")
      .select("evento, email, app, detalhe, ip, created_at")
      .order("created_at", { ascending: false })
      .limit(limite);
    if (EMAIL_RE.test(alvoEmail)) q = q.eq("email", alvoEmail);
    const { data, error } = await q;
    if (error) return jsonResponse(req, { error: "falha ao listar" }, 500);
    return jsonResponse(req, { eventos: data ?? [] });
  }

  // Antes de convidar: a pessoa já existe em algum lugar? Busca por nome (parte dele) ou por CPF.
  if (action === "pessoa_buscar") {
    const cpf = str(body.cpf).replace(/\D/g, "");
    const termo = str(body.termo).replace(/[%_,()]/g, " ").trim();
    if (!cpf && termo.length < 3) return jsonResponse(req, { error: "digite pelo menos 3 letras do nome ou o CPF" }, 400);
    type Achado = { origem: "hub" | "clinica" | "playground"; nome: string; cpf: string | null; email: string | null };
    const pessoas: Achado[] = [];
    const padrao = `%${termo}%`;

    const hub = cpf
      ? await admin.from("fa_gestao_contas").select("nome, cpf, email").eq("cpf", cpf).limit(10)
      : await admin.from("fa_gestao_contas").select("nome, cpf, email").ilike("nome", padrao).limit(10);
    for (const c of hub.data ?? []) pessoas.push({ origem: "hub", nome: c.nome, cpf: mascararCpf(c.cpf ?? null), email: c.email });

    const b = clienteSupabase("supabase_b");
    if (b) {
      const cli = cpf
        ? await b.from("profiles").select("full_name, cpf, email").eq("cpf", cpf).limit(10)
        : await b.from("profiles").select("full_name, cpf, email").ilike("full_name", padrao).limit(10);
      for (const p of cli.data ?? []) pessoas.push({ origem: "clinica", nome: p.full_name, cpf: mascararCpf(p.cpf ?? null), email: p.email ?? null });
    }

    const pg = cpf
      ? await admin.from("fa_kiosk_employees").select("full_name, cpf").eq("cpf", cpf).limit(10)
      : await admin.from("fa_kiosk_employees").select("full_name, cpf").ilike("full_name", padrao).limit(10);
    for (const e of pg.data ?? []) pessoas.push({ origem: "playground", nome: e.full_name, cpf: mascararCpf(e.cpf ?? null), email: null });

    return jsonResponse(req, { pessoas });
  }

  if (action === "convite_link_gerar") {
    const unidade = str(body.unidade) || "Instituto Faça Amigos";
    const sistema = str(body.sistema) as AppId;
    const funcao = str(body.funcao) || "Supervisor";
    const permissao = (str(body.permissao) || "operar") as Nivel;
    const destinatarioNome = str(body.destinatario_nome);
    const destinatarioEmail = str(body.destinatario_email).toLowerCase();

    if (!sistema || !APPS[sistema]) {
      return jsonResponse(req, { error: "selecione um sistema válido" }, 400);
    }

    const token = randomHex(24);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { error: insErr } = await admin.from("fa_gestao_convites").insert({
      token: null,
      token_hash: await sha256Hex(token),
      unidade,
      sistema,
      funcao,
      permissao,
      destinatario_nome: destinatarioNome || null,
      destinatario_email: destinatarioEmail || null,
      criado_por: dono.email,
      expires_at: expiresAt,
    });
    if (insErr) {
      console.error("fa_gestao_convites insert error:", insErr.message);
      return jsonResponse(req, { error: "não foi possível gravar o convite no banco" }, 500);
    }

    const link = `${HUB_URL}/#cadastro?token=${token}`;
    const sistemaNome = APPS[sistema]?.rotulo || sistema;
    const sistemaBase = (Deno.env.get(APPS[sistema]?.baseEnv) ?? APPS[sistema]?.baseDefault ?? "").replace(/\/+$/, "");

    let emailEnviado = false;
    if (destinatarioEmail && EMAIL_RE.test(destinatarioEmail)) {
      const html = moldeEmail(`
        <p style="margin:0 0 12px;font-size:15px;">Olá${destinatarioNome ? `, ${escapeHtml(destinatarioNome)}` : ""}!</p>
        <p style="margin:0 0 16px;font-size:14px;color:#4C6B62;">
          ${escapeHtml(dono.nome)} enviou um convite para você ingressar no sistema da <strong>${escapeHtml(unidade)}</strong> como <strong>${escapeHtml(funcao)}</strong>.
        </p>
        <div style="background:#FFF9F1;border:1.5px solid #2ECFB5;border-radius:16px;padding:16px;margin:16px 0;text-align:left;font-size:13px;line-height:1.6;">
          <div><strong>Unidade:</strong> ${escapeHtml(unidade)}</div>
          <div><strong>Sistema:</strong> ${escapeHtml(sistemaNome)}</div>
          <div><strong>Função / Cargo:</strong> ${escapeHtml(funcao)}</div>
          <div><strong>Permissão:</strong> ${escapeHtml(permissao)}</div>
        </div>
        <p style="margin:20px 0;">
          <a href="${link}" style="display:inline-block;background:#f0196b;color:#fff;text-decoration:none;font-weight:800;font-size:14px;padding:12px 24px;border-radius:999px;">
            Completar Meu Cadastro
          </a>
        </p>
        <p style="margin:0;font-size:12px;color:#8B9A94;">Ou copie o link: ${link}</p>
      `);
      emailEnviado = await enviarEmail(destinatarioEmail, destinatarioNome || "Novo Colaborador", `Convite de acesso: ${sistemaNome} — Faça Amigos`, html);
    }

    await auditar(admin, req, "convite_link_gerado", {
      email: dono.email,
      detalhe: `unidade=${unidade}; sistema=${sistema}; funcao=${funcao}; perm=${permissao}; nome=${destinatarioNome || "-"}; dest=${destinatarioEmail || "link"}`.slice(0, 300),
    });

    return jsonResponse(req, {
      ok: true,
      token,
      link,
      email_enviado: emailEnviado,
      convite: {
        unidade,
        sistema,
        sistema_nome: sistemaNome,
        sistema_url: sistemaBase,
        funcao,
        permissao,
        destinatario_nome: destinatarioNome || null,
        destinatario_email: destinatarioEmail || null,
      },
    });
  }

  if (!EMAIL_RE.test(alvoEmail)) return jsonResponse(req, { error: "e-mail inválido" }, 400);
  const { data: existente } = await admin.from("fa_gestao_contas").select("*").eq("email", alvoEmail).maybeSingle();
  const atual = existente as Conta | null;

  if (action === "conta_salvar") {
    const novo = body.novo === true;
    if (novo && atual) return jsonResponse(req, { error: "já existe uma conta com este e-mail" }, 409);
    if (!novo && !atual) return jsonResponse(req, { error: "conta não encontrada" }, 404);

    const nome = str(body.nome).slice(0, 120);
    const emailCodigo = (str(body.email_codigo) || alvoEmail).toLowerCase();
    const papel = body.papel === "owner" ? "owner" : "gerente";
    if (!nome) return jsonResponse(req, { error: "informe o nome" }, 400);
    if (!EMAIL_RE.test(emailCodigo)) return jsonResponse(req, { error: "e-mail do código inválido" }, 400);
    // Ninguém tira o próprio owner: evita deixar o Hub sem quem o administre.
    if (atual && atual.email === dono.email && papel !== "owner") {
      return jsonResponse(req, { error: "você não pode rebaixar a si mesmo" }, 400);
    }
    // Conta nova: o e-mail de acesso não pode ser o login de outra conta.
    if (novo) {
      const q = quoteFilterValue(alvoEmail);
      const { data: colide } = await admin.from("fa_gestao_contas").select("email").eq("login_email", alvoEmail).limit(1);
      if (colide?.length) return jsonResponse(req, { error: "já existe uma conta com este e-mail" }, 409);
      void q;
    }

    // Matriz: só níveis válidos; owner não precisa de linhas (é admin em tudo).
    const recebidas = (body.permissoes && typeof body.permissoes === "object" ? body.permissoes : {}) as Record<string, unknown>;
    const permissoes: Partial<Record<AppId, "ver" | "operar" | "admin">> = {};
    if (papel === "gerente") {
      for (const id of APP_IDS) {
        const n = recebidas[id];
        if (n === "ver" || n === "operar" || n === "admin") permissoes[id] = n;
      }
    }

    // Papel nativo escolhido em cada sistema (só valem os do catálogo; o resto cai no padrão do sistema).
    const recebidosPapeis = (body.papeis && typeof body.papeis === "object" ? body.papeis : {}) as Record<string, unknown>;
    const papeisEscolhidos: Partial<Record<AppId, string>> = {};
    for (const id of APP_IDS) {
      const v = recebidosPapeis[id];
      if (typeof v === "string" && PAPEIS_NATIVOS[id]?.opcoes.some((o) => o.id === v)) papeisEscolhidos[id] = v;
    }

    // Empresa (workspace) em cada sistema que tem mais de uma. Gerência com acesso à Gestão de Pessoas
    // PRECISA ter uma: é isso que impede de dar acesso às duas empresas por engano.
    const recebidosEscopos = (body.escopos && typeof body.escopos === "object" ? body.escopos : {}) as Record<string, unknown>;
    const escoposEscolhidos: Partial<Record<AppId, string>> = {};
    for (const id of APP_IDS) {
      const e = escopoValido(id, recebidosEscopos[id]);
      if (e) escoposEscolhidos[id] = e;
    }
    if (papel === "gerente") {
      for (const id of APP_IDS) {
        if (permissoes[id] && ESCOPOS[id] && !escoposEscolhidos[id]) {
          return jsonResponse(req, { error: `escolha a empresa (${ESCOPOS[id]!.map((x) => x.rotulo).join(" ou ")}) em ${APPS[id].rotulo}` }, 400);
        }
      }
    }

    // Identidade da pessoa em cada sistema (o owner informa; o Hub cria o login e o papel ao salvar).
    const mapa = (body.mapeamentos && typeof body.mapeamentos === "object" ? body.mapeamentos : {}) as Record<string, unknown>;
    const campos: Record<string, string | null> = {};
    // Campo ausente = mantém o que está gravado; campo enviado vazio = limpa.
    for (const campo of CAMPOS_MAPEAMENTO) {
      if (typeof mapa[campo] === "string") {
        const bruto = str(mapa[campo]).slice(0, 200);
        campos[campo] = bruto ? (campo === "cacau_usuario" ? bruto : bruto.toLowerCase()) : null;
      } else {
        campos[campo] = atual ? (atual[campo as keyof Conta] as string | null) : null;
      }
    }
    // O /admin identifica a pessoa pelo próprio e-mail de login no Hub.
    const usaPainel = papel === "owner" || !!permissoes.painel || !!permissoes.eventos;
    campos.painel_usuario = usaPainel ? (atual?.painel_usuario ?? alvoEmail) : null;

    const linha = { email: alvoEmail, nome, email_codigo: emailCodigo, papel, ...campos };
    const { error: gravaErr } = novo
      ? await admin.from("fa_gestao_contas").insert({ ...linha, auth_modo: "hub", ativo: true, criado_por: dono.email })
      : await admin.from("fa_gestao_contas").update(linha).eq("email", alvoEmail);
    if (gravaErr) {
      console.error("conta_salvar:", gravaErr.message);
      return jsonResponse(req, { error: "não foi possível salvar" }, 500);
    }

    // Permissões: apaga o que saiu da matriz e grava o resto.
    const { data: antes } = await admin.from("fa_gestao_permissoes").select("modulo, nivel").eq("email", alvoEmail);
    await admin.from("fa_gestao_permissoes").delete().eq("email", alvoEmail);
    const linhas = Object.entries(permissoes).map(([modulo, nivel]) => ({
      email: alvoEmail,
      modulo,
      nivel,
      papel_nativo: papeisEscolhidos[modulo as AppId] ?? null,
      escopo: escoposEscolhidos[modulo as AppId] ?? null,
      atualizado_por: dono.email,
    }));
    if (linhas.length) {
      const { error: permErr } = await admin.from("fa_gestao_permissoes").insert(linhas);
      if (permErr) {
        console.error("permissões:", permErr.message);
        return jsonResponse(req, { error: "conta salva, mas as permissões falharam. Tente de novo." }, 500);
      }
    }

    const resumo = (m: Record<string, string>) => Object.keys(m).sort().map((k) => `${k}=${m[k]}`).join(",") || "-";
    const antesMapa = Object.fromEntries((antes ?? []).map((p) => [p.modulo, p.nivel]));
    const depoisMapa = permissoes as Record<string, string>;
    const mudou = resumo(antesMapa) !== resumo(depoisMapa) || atual?.papel !== papel;
    await auditar(admin, req, novo ? "conta_criada" : "conta_atualizada", {
      email: alvoEmail,
      detalhe: `por ${dono.email}; papel=${papel}; ${resumo(depoisMapa)}`.slice(0, 300),
    });
    // Nível novo vale já: derruba a sessão aberta do /admin (12 h). A do Hub segue: ele recalcula o nível a cada clique.
    const painelAntes = atual?.painel_usuario ?? null;
    if (mudou) {
      for (const u of new Set([painelAntes, campos.painel_usuario].filter(Boolean) as string[])) {
        await admin.from("fa_teste_admin_sessions").delete().eq("admin_email", u);
      }
    }

    let conviteEnviado: boolean | null = null;
    if (novo && body.convidar !== false) {
      conviteEnviado = await enviarConvite(emailCodigo, nome, dono.nome, alvoEmail);
      if (conviteEnviado) {
        await admin.from("fa_gestao_contas").update({ convidado_em: new Date().toISOString() }).eq("email", alvoEmail);
        await auditar(admin, req, "convite_enviado", { email: alvoEmail, detalhe: `por ${dono.email}` });
      }
    }

    // Cria o login e dá o papel escolhido em cada sistema, e devolve o resultado de cada um. A conta já
    // está salva: um sistema com problema não desfaz nada, e "Reprovisionar" (conta_provisionar) repete.
    let provisionamento: ResultadoProvisao[] = [];
    if (papel === "gerente" && body.provisionar !== false) {
      const { data: salva } = await admin.from("fa_gestao_contas").select("*").eq("email", alvoEmail).maybeSingle();
      if (salva) {
        const niveisNovos = {} as Niveis;
        for (const id of APP_IDS) niveisNovos[id] = permissoes[id] ?? "nenhum";
        provisionamento = await provisionarModulos(admin, req, salva as Conta, niveisNovos, dono.email);
      }
    }
    return jsonResponse(req, {
      ok: true,
      convite_enviado: conviteEnviado,
      provisionamento,
      falhas: provisionamento.filter((r) => r.estado === "erro").length,
    });
  }

  if (!atual) return jsonResponse(req, { error: "conta não encontrada" }, 404);

  if (action === "conta_provisionar") {
    if (!atual.ativo) return jsonResponse(req, { error: "a conta está desativada: reative antes de provisionar" }, 400);
    const niveis = await carregarNiveis(admin, atual);
    const provisionamento = await provisionarModulos(admin, req, atual, niveis, dono.email);
    return jsonResponse(req, {
      ok: true,
      provisionamento,
      falhas: provisionamento.filter((r) => r.estado === "erro").length,
    });
  }

  if (action === "conta_ativo") {
    const ativo = body.ativo === true;
    if (!ativo && atual.email === dono.email) return jsonResponse(req, { error: "você não pode desativar a si mesmo" }, 400);
    const { error } = await admin.from("fa_gestao_contas").update({ ativo }).eq("email", atual.email);
    if (error) return jsonResponse(req, { error: "não foi possível atualizar" }, 500);
    if (!ativo) await revogarSessoes(admin, atual.email, atual.painel_usuario);
    await auditar(admin, req, ativo ? "conta_reativada" : "conta_desativada", { email: atual.email, detalhe: `por ${dono.email}` });
    // Bloqueia (ou restaura) o acesso da pessoa nos sistemas. Desativar de novo uma conta já
    // desativada refaz só o que faltou: serve para repetir depois de uma falha.
    const resultados = await aplicarEmSistemas(admin, req, atual, ativo ? "religar" : "desligar", dono.email);
    return jsonResponse(req, { ok: true, resultados, falhas: resultados.filter((r) => r.estado === "erro").length });
  }

  if (action === "sessoes_revogar") {
    await revogarSessoes(admin, atual.email, atual.painel_usuario);
    await auditar(admin, req, "sessoes_revogadas", { email: atual.email, detalhe: `por ${dono.email}` });
    return jsonResponse(req, { ok: true });
  }

  // Troca a forma de entrar: senha própria do Hub com um e-mail de login real (a chave da conta e os
  // usuários nos sistemas não mudam), ou volta para a senha do Sistema da Clínica (só contas antigas).
  if (action === "conta_acesso") {
    if (body.modo === "clinica") {
      if (atual.criado_por) return jsonResponse(req, { error: "conta criada no Hub não tem senha da Clínica" }, 400);
      const { error } = await admin.from("fa_gestao_contas").update({ auth_modo: "clinica", login_email: null }).eq("email", atual.email);
      if (error) return jsonResponse(req, { error: "não foi possível atualizar" }, 500);
      await auditar(admin, req, "acesso_clinica", { email: atual.email, detalhe: `por ${dono.email}` });
      return jsonResponse(req, { ok: true });
    }
    const login = str(body.login_email).toLowerCase();
    if (!EMAIL_RE.test(login)) return jsonResponse(req, { error: "e-mail de login inválido" }, 400);
    const q = quoteFilterValue(login);
    const { data: colide } = await admin.from("fa_gestao_contas").select("email")
      .or(`email.eq.${q},login_email.eq.${q}`).neq("email", atual.email).limit(1);
    if (colide?.length) return jsonResponse(req, { error: "este e-mail já é usado por outra conta" }, 409);
    const { error } = await admin.from("fa_gestao_contas").update({ auth_modo: "hub", login_email: login }).eq("email", atual.email);
    if (error) return jsonResponse(req, { error: "não foi possível atualizar" }, 500);
    await auditar(admin, req, "acesso_hub", { email: atual.email, detalhe: `por ${dono.email}; login=${login}` });
    // Sem senha própria ainda: manda o convite para definir (a sessão aberta segue valendo).
    let conviteEnviado: boolean | null = null;
    if (!atual.senha_hash) {
      conviteEnviado = await enviarConvite(atual.email_codigo, atual.nome, dono.nome, login);
      if (conviteEnviado) await admin.from("fa_gestao_contas").update({ convidado_em: new Date().toISOString() }).eq("email", atual.email);
    }
    return jsonResponse(req, { ok: true, convite_enviado: conviteEnviado, senha_definida: !!atual.senha_hash });
  }

  if (action === "convidar") {
    if (!atual.ativo || atual.auth_modo !== "hub") {
      return jsonResponse(req, { error: "convite só vale para conta ativa com senha própria do Hub" }, 400);
    }
    if (atual.convidado_em && Date.now() - new Date(atual.convidado_em).getTime() < 60_000) {
      return jsonResponse(req, { error: "convite enviado há pouco, aguarde 1 minuto" }, 429);
    }
    if (!(await enviarConvite(atual.email_codigo, atual.nome, dono.nome, atual.login_email ?? atual.email))) {
      return jsonResponse(req, { error: "não foi possível enviar o e-mail" }, 502);
    }
    await admin.from("fa_gestao_contas").update({ convidado_em: new Date().toISOString() }).eq("email", atual.email);
    await auditar(admin, req, "convite_enviado", { email: atual.email, detalhe: `por ${dono.email}` });
    return jsonResponse(req, { ok: true });
  }

  return jsonResponse(req, { error: "ação inválida" }, 400);
}
