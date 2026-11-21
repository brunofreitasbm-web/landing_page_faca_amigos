// FA Tech: sorteio de brindes no evento. Roteada por `action` no corpo JSON.
//
//  participar {nome, telefone, email, perfil, origem, consentimento, website-hp}
//      cadastra, devolve o número e manda o e-mail. Contato repetido NUNCA recebe o número de volta
//      na tela (senão bastaria digitar o e-mail de outra pessoa): o número é reenviado ao e-mail cadastrado.
//  painel_resumo {senha}   total, contagem por perfil, cadastros (mais recentes primeiro) e ganhadores
//  sortear {senha}         sorteia 1 entre quem ainda não foi sorteado (crypto.getRandomValues)
//  marcar {senha, numero, status}   "ganhou" ou "ausente" (ausente sai do pool; sortear de novo)
//  exportar {senha}        CSV com todos os cadastros
//
// Secrets: FATECH_SORTEIO_SENHA (senha do painel; se ausente, lê do Vault: fatech_sorteio_senha), BREVO_API_KEY, BREVO_FROM, BREVO_REPLY_TO (os dois
// últimos opcionais). O navegador nunca lê tabela: só esta função, com service role.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SITE = (Deno.env.get("SITE_URL") ?? "https://institutofacaamigos.com.br").replace(/\/$/, "");
const TABELA = "fa_fatech_sorteio";
const LIMITE_CADASTROS_POR_IP_HORA = 60; // alto de propósito: o Wi-Fi do evento faz muita gente sair pelo mesmo IP
const PERFIS = ["gestor_clinica", "profissional", "familia_outro"] as const;
const PERFIL_ROTULO: Record<string, string> = {
  gestor_clinica: "Dono(a) ou gestor(a) de clínica",
  profissional: "Profissional de saúde",
  familia_outro: "Família ou outro",
};

const ALLOWED_ORIGINS = [
  "https://institutofacaamigos.com.br",
  "https://www.institutofacaamigos.com.br",
  "http://localhost:4321",
  "http://127.0.0.1:4321",
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
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  return `55${digits}`;
}
function fmtNumero(n: number): string {
  return String(n).padStart(3, "0");
}
function nomePublico(nome: string): string {
  const p = nome.split(/\s+/).filter(Boolean);
  return p.length > 1 ? `${p[0]} ${p[p.length - 1][0].toUpperCase()}.` : p[0] ?? "";
}
async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function clientIp(req: Request): string {
  return (req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
}
// Sorteio justo: inteiro uniforme em [0, n) sem viés de módulo.
function randomInt(n: number): number {
  const lim = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf); while (buf[0] >= lim);
  return buf[0] % n;
}

// Tentativas erradas de senha por IP (memória da instância: basta para frear força bruta no evento).
const falhas = new Map<string, { n: number; ate: number }>();
// Senha: variável de ambiente (supabase secrets) ou, se ausente, o Vault via fa_fatech_sorteio_senha (só service role).
async function senhaReal(admin: ReturnType<typeof createClient>): Promise<string> {
  const env = Deno.env.get("FATECH_SORTEIO_SENHA");
  if (env) return env;
  const { data } = await admin.rpc("fa_fatech_sorteio_senha");
  return typeof data === "string" ? data : "";
}
async function senhaOk(req: Request, senha: string, admin: ReturnType<typeof createClient>): Promise<boolean | "bloqueado"> {
  const ip = clientIp(req) || "?";
  const f = falhas.get(ip);
  if (f && f.n >= 8 && f.ate > Date.now()) return "bloqueado";
  const real = await senhaReal(admin);
  const ok = !!real && safeEqual(senha, real);
  if (ok) falhas.delete(ip);
  else falhas.set(ip, { n: (f && f.ate > Date.now() ? f.n : 0) + 1, ate: Date.now() + 10 * 60_000 });
  return ok;
}

// ---------------------------------------------------------------------------------------------
// Brevo
// ---------------------------------------------------------------------------------------------
function brevoHeaders(): Record<string, string> {
  return { "api-key": Deno.env.get("BREVO_API_KEY") ?? "", "Content-Type": "application/json", Accept: "application/json" };
}
function parseSender(raw: string): { name?: string; email: string } {
  const m = raw.match(/^(.*)<(.+)>$/);
  if (m) return { name: m[1].trim().replace(/^"|"$/g, "") || undefined, email: m[2].trim() };
  return { email: raw.trim() };
}

function emailHtml(nome: string, numero: string): string {
  const primeiro = esc(nome.split(/\s+/)[0] ?? "");
  return `<!DOCTYPE html>
<html lang="pt-BR"><body style="margin:0;padding:0;background:#F4F6F7;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#F4F6F7;padding:24px 0;"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #DCE2E5;font-family:Inter,Arial,sans-serif;color:#1C2328;">
<tr><td style="background:#0F2E36;padding:22px 28px;color:#ffffff;font-size:22px;font-weight:300;">FA <b style="font-weight:600;">Tech</b></td></tr>
<tr><td style="padding:32px 28px 8px;">
<p style="margin:0 0 6px;font-size:17px;">Oi, ${primeiro}. Você está no sorteio.</p>
<p style="margin:0;font-size:15px;color:#5C6870;">Este é o seu número para o sorteio de brindes de hoje:</p>
</td></tr>
<tr><td align="center" style="padding:20px 28px;"><div style="display:inline-block;background:#0F2E36;color:#3FB7BF;font-size:56px;font-weight:600;letter-spacing:4px;padding:18px 40px;border-radius:12px;">${numero}</div></td></tr>
<tr><td style="padding:0 28px 8px;font-size:15px;line-height:1.55;color:#1C2328;">
<p style="margin:0 0 14px;">O sorteio acontece no fim do dia. Fique de olho no telão: se o seu número sair e você não estiver por perto, sorteamos outro.</p>
<p style="margin:0 0 14px;">A FA Tech faz sistemas de gestão que nasceram dentro de uma clínica real: faturamento, atendimento, pessoas, TV da recepção e Wi-Fi. Se você cuida de uma clínica, vale ver como funciona.</p>
</td></tr>
<tr><td align="center" style="padding:6px 28px 28px;"><a href="${SITE}/fatech/demo?origem=sorteio-email" style="display:inline-block;background:#1F7F86;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 28px;border-radius:8px;">Ver os sistemas funcionando</a></td></tr>
<tr><td style="background:#F4F6F7;padding:16px 28px;font-size:12px;color:#5C6870;line-height:1.5;">FA Tech, uma iniciativa do Instituto FaçaAmigos. Você recebeu este e-mail porque se cadastrou no sorteio durante o evento. Para não receber mais nossos conteúdos, responda pedindo a remoção.</td></tr>
</table></td></tr></table></body></html>`;
}

async function enviarEmail(nome: string, email: string, numero: number): Promise<boolean> {
  if (!Deno.env.get("BREVO_API_KEY")) {
    console.error("fatech-sorteio: BREVO_API_KEY ausente, e-mail não enviado");
    return false;
  }
  const from = Deno.env.get("BREVO_FROM") ?? "Instituto Faça Amigos <nao-responder@institutofacaamigos.com.br>";
  const replyTo = Deno.env.get("BREVO_REPLY_TO");
  try {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: brevoHeaders(),
      body: JSON.stringify({
        sender: parseSender(from),
        to: [{ email, name: nome }],
        subject: `Seu número no sorteio da FA Tech: ${fmtNumero(numero)}`,
        htmlContent: emailHtml(nome, fmtNumero(numero)),
        tags: ["fatech-sorteio"],
        ...(replyTo ? { replyTo: parseSender(replyTo) } : {}),
      }),
    });
    if (!r.ok) console.error("fatech-sorteio: Brevo", r.status, await r.text().catch(() => ""));
    return r.ok;
  } catch (err) {
    console.error("fatech-sorteio: Brevo falhou", err instanceof Error ? err.message : err);
    return false;
  }
}

// Registra o contato no Brevo (sem lista, para não depender de id). Best-effort: nunca falha o cadastro.
async function syncBrevo(nome: string, email: string, telefone: string, perfil: string): Promise<boolean> {
  if (!Deno.env.get("BREVO_API_KEY")) return false;
  const tentar = (attributes: Record<string, string>) =>
    fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: brevoHeaders(),
      body: JSON.stringify({ email, attributes, updateEnabled: true }),
    });
  try {
    let r = await tentar({ NOME: nome.split(/\s+/)[0] ?? "", WHATSAPP: telefone, PERFIL_FATECH: perfil, ORIGEM: "fatech-sorteio-belem" });
    if (r.status === 400) r = await tentar({ NOME: nome.split(/\s+/)[0] ?? "" }); // conta sem os atributos personalizados
    return r.ok || r.status === 204;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "método não permitido" }, 405);

  // deno-lint-ignore no-explicit-any
  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "JSON inválido" }, 400);
  }
  const action = str(body.action);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // ---- público ----
  if (action === "participar") {
    // Honeypot: robô preenche. Responde como sucesso, sem gravar.
    if (str(body["website-hp"])) return json(req, { ok: true, numero: "000" });

    const nome = str(body.nome).replace(/\s+/g, " ");
    const email = str(body.email).toLowerCase();
    const telefone = normalizePhone(str(body.telefone));
    const perfil = str(body.perfil);
    const origem = (str(body.origem).toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40)) || "palestra";

    if (nome.length < 2 || nome.length > 120) return json(req, { error: "Informe seu nome." }, 400);
    if (!EMAIL_RE.test(email) || email.length > 254) return json(req, { error: "Confira o e-mail digitado." }, 400);
    if (!/^55\d{10,11}$/.test(telefone)) return json(req, { error: "Confira o WhatsApp, com DDD." }, 400);
    if (!(PERFIS as readonly string[]).includes(perfil)) return json(req, { error: "Escolha uma das opções." }, 400);
    if (body.consentimento !== true) return json(req, { error: "Marque a autorização para participar." }, 400);

    const ipHash = await sha256(`fatech-sorteio|${clientIp(req)}`);
    const desde = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await admin.from(TABELA).select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("criado_em", desde);
    if ((count ?? 0) >= LIMITE_CADASTROS_POR_IP_HORA) return json(req, { error: "Muitas tentativas. Fale com a equipe no estande." }, 429);

    const { data, error } = await admin
      .from(TABELA)
      .insert({ nome, email, telefone, perfil, origem, consentimento: true, ip_hash: ipHash })
      .select("id, numero")
      .single();

    if (error) {
      if (error.code === "23505") {
        // Já cadastrado (mesmo e-mail ou WhatsApp). Não mostra o número: reenvia ao e-mail DONO do cadastro.
        const { data: ja } = await admin.from(TABELA).select("id, nome, email, numero").or(`email.eq.${email},telefone.eq.${telefone}`).limit(1).maybeSingle();
        if (ja) await enviarEmail(ja.nome, ja.email, ja.numero);
        return json(req, { ok: true, ja_cadastrado: true });
      }
      console.error("fatech-sorteio: insert", error.message);
      return json(req, { error: "Não foi possível cadastrar agora. Tente de novo." }, 500);
    }

    const [enviado, sync] = await Promise.all([enviarEmail(nome, email, data.numero), syncBrevo(nome, email, telefone, perfil)]);
    const agora = new Date().toISOString();
    await admin.from(TABELA).update({ ...(enviado ? { email_enviado_em: agora } : {}), ...(sync ? { brevo_sync_at: agora } : {}) }).eq("id", data.id);
    return json(req, { ok: true, numero: fmtNumero(data.numero), email_enviado: enviado });
  }

  // ---- painel (senha) ----
  if (["painel_resumo", "sortear", "marcar", "exportar"].includes(action)) {
    const auth = await senhaOk(req, str(body.senha), admin);
    if (auth === "bloqueado") return json(req, { error: "Muitas tentativas. Aguarde 10 minutos." }, 429);
    if (!auth) return json(req, { error: "Senha incorreta." }, 401);

    if (action === "painel_resumo") {
      const { data: todos, error } = await admin.from(TABELA).select("numero, nome, perfil, sorteado_em, status_sorteio").order("numero");
      if (error) return json(req, { error: "erro ao ler" }, 500);
      const linhas = todos ?? [];
      const porPerfil: Record<string, number> = {};
      for (const l of linhas) porPerfil[l.perfil] = (porPerfil[l.perfil] ?? 0) + 1;
      const sorteados = linhas
        .filter((l) => l.sorteado_em)
        .sort((a, b) => (a.sorteado_em! < b.sorteado_em! ? 1 : -1))
        .map((l) => ({ numero: fmtNumero(l.numero), nome: nomePublico(l.nome), status: l.status_sorteio }));
      const cadastros = [...linhas].sort((a, b) => b.numero - a.numero).map((l) => ({ numero: fmtNumero(l.numero), nome: nomePublico(l.nome), perfil: l.perfil }));
      return json(req, { ok: true, cadastros, total: linhas.length, restantes: linhas.filter((l) => !l.sorteado_em).length, por_perfil: porPerfil, sorteados });
    }

    if (action === "sortear") {
      const { data: pool, error } = await admin.from(TABELA).select("id, numero, nome").is("sorteado_em", null);
      if (error) return json(req, { error: "erro ao ler" }, 500);
      if (!pool || pool.length === 0) return json(req, { error: "Ninguém restante para sortear." }, 409);
      const escolhido = pool[randomInt(pool.length)];
      // Marca só se ainda estiver livre (dois cliques seguidos não sorteiam a mesma pessoa duas vezes).
      const { data: marcado } = await admin.from(TABELA).update({ sorteado_em: new Date().toISOString() }).eq("id", escolhido.id).is("sorteado_em", null).select("id");
      if (!marcado || marcado.length === 0) return json(req, { error: "Tente de novo." }, 409);
      return json(req, { ok: true, numero: fmtNumero(escolhido.numero), nome: nomePublico(escolhido.nome), restantes: pool.length - 1 });
    }

    if (action === "marcar") {
      const numero = Number(body.numero);
      const status = str(body.status);
      if (!Number.isInteger(numero) || !["ganhou", "ausente"].includes(status)) return json(req, { error: "dados inválidos" }, 400);
      const { data, error } = await admin.from(TABELA).update({ status_sorteio: status }).eq("numero", numero).not("sorteado_em", "is", null).select("numero");
      if (error || !data || data.length === 0) return json(req, { error: "Número não encontrado entre os sorteados." }, 404);
      return json(req, { ok: true });
    }

    if (action === "exportar") {
      const { data, error } = await admin.from(TABELA).select("numero, nome, telefone, email, perfil, origem, status_sorteio, email_enviado_em, criado_em").order("numero");
      if (error) return json(req, { error: "erro ao ler" }, 500);
      // Anti injeção de fórmula no Excel: células que começam com = + - @ ganham um apóstrofo.
      const cel = (v: unknown) => {
        let s = v == null ? "" : String(v);
        if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
        return `"${s.replace(/"/g, '""')}"`;
      };
      const cab = ["numero", "nome", "whatsapp", "email", "perfil", "origem", "resultado_sorteio", "email_enviado_em", "cadastrado_em"];
      const linhas = (data ?? []).map((l) => [fmtNumero(l.numero), l.nome, l.telefone, l.email, PERFIL_ROTULO[l.perfil] ?? l.perfil, l.origem, l.status_sorteio ?? "", l.email_enviado_em ?? "", l.criado_em].map(cel).join(","));
      return json(req, { ok: true, csv: "\uFEFF" + [cab.join(","), ...linhas].join("\r\n") });
    }
  }

  return json(req, { error: "ação desconhecida" }, 400);
});
