// Bootstrap comum aos testes novos do gestao-hub: Supabase simulado (A e B), e-mail simulado,
// handler capturado e uma sessão de owner pronta. Cada arquivo de teste roda isolado no Deno.
import { projeto } from "./fake_supabase.ts";

Deno.env.set("SUPABASE_URL", "http://a");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "ka");
Deno.env.set("CLINICA_SUPABASE_URL", "http://b");
Deno.env.set("CLINICA_SUPABASE_SERVICE_ROLE_KEY", "kb");
Deno.env.set("CLINICA_SUPABASE_ANON_KEY", "anon-b");
Deno.env.set("BREVO_API_KEY", "chave-ficticia-de-teste"); // fetch do Brevo é simulado abaixo

export const emailsEnviados: Array<{ para: string; assunto: string; html: string }> = [];
const fetchOriginal = globalThis.fetch;
globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.includes("api.brevo.com")) {
    const b = JSON.parse(String(init?.body ?? "{}"));
    emailsEnviados.push({ para: b?.to?.[0]?.email ?? "", assunto: b?.subject ?? "", html: b?.htmlContent ?? "" });
    return new Response("{}", { status: 201 });
  }
  if (url.startsWith("http://a") || url.startsWith("http://b")) return fetchOriginal(input as string, init);
  return new Response("{}", { status: 200 });
}) as typeof fetch;

let handler!: (req: Request) => Promise<Response>;
(Deno as unknown as { serve: unknown }).serve = (h: (req: Request) => Promise<Response>) => {
  handler = h;
  return { finished: Promise.resolve() };
};
await import("../../functions/gestao-hub/index.ts");

export const handlerParaTeste = (req: Request) => handler(req);

export const A = projeto("http://a");
export const B = projeto("http://b");
B.gatilhoPerfil = true;

export async function sha(s: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function contaBase(over: Record<string, unknown>) {
  return {
    email: "x", email_codigo: "x", nome: "x", playground_email: null, clinica_email: null, financeiro_email: null,
    rh_email: null, cacau_usuario: null, painel_usuario: null, ativo: true, papel: "gerente", auth_modo: "hub",
    senha_hash: null, senha_definida_em: null, convidado_em: null, login_email: null, criado_por: null, cpf: null,
    created_at: new Date().toISOString(), ...over,
  };
}

export const TOKEN_OWNER = "a".repeat(64);
export const TOKEN_GERENTE = "b".repeat(64);
A.tabela("fa_gestao_contas").push(
  contaBase({ email: "bruno@t.com", email_codigo: "bruno@t.com", nome: "Bruno", papel: "owner", auth_modo: "clinica", senha_hash: "hash-do-bruno" }),
  contaBase({ email: "gerente@t.com", email_codigo: "gerente@t.com", nome: "Gerente" }),
);
const validade = new Date(Date.now() + 3600_000).toISOString();
A.tabela("fa_gestao_sessoes").push(
  { token_hash: await sha(TOKEN_OWNER), email: "bruno@t.com", expires_at: validade },
  { token_hash: await sha(TOKEN_GERENTE), email: "gerente@t.com", expires_at: validade },
);

export async function chamar(
  action: string,
  corpo: Record<string, unknown> = {},
  token: string | null = TOKEN_OWNER,
  extras: Record<string, string> = {},
  // deno-lint-ignore no-explicit-any
): Promise<{ status: number; corpo: any }> {
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": "10.0.0.1", ...extras };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await handler(new Request("http://hub", { method: "POST", headers, body: JSON.stringify({ action, ...corpo }) }));
  return { status: res.status, corpo: await res.json() };
}
