// Convites do Hub: segurança (não sobrescrever conta) e convite com vários sistemas.
// Rodar: deno test --no-check --config supabase/tests/gestao-hub/deno.json --allow-env --allow-net=none supabase/tests/gestao-hub
import assert from "node:assert/strict";
import { A, chamar, sha } from "./hub_bootstrap.ts";

async function criarConvite(token: string, over: Record<string, unknown> = {}) {
  const linha = {
    id: crypto.randomUUID(), token, token_hash: await sha(token), unidade: "Unidade A", sistema: "clinica",
    funcao: "Supervisor(a)", permissao: "operar", destinatario_nome: null, destinatario_email: null,
    criado_por: "bruno@t.com", usado_em: null, usado_por: null,
    expires_at: new Date(Date.now() + 86400_000).toISOString(), created_at: new Date().toISOString(), cpf: null, ...over,
  };
  A.tabela("fa_gestao_convites").push(linha);
  return linha;
}
const cadastro = (token: string, email: string) => ({
  token, nome: "Pessoa Teste", data_nascimento: "1990-01-01", email, password: "SenhaForte@1",
});
const conta = (email: string) => A.tabela("fa_gestao_contas").find((c) => c.email === email);

Deno.test("convite_email_diferente_do_destinatario_recusa", async () => {
  await criarConvite("tk-dest", { destinatario_email: "ana@t.com" });
  const r = await chamar("convite_cadastrar", cadastro("tk-dest", "outro@t.com"), null);
  assert.equal(r.status, 403);
  assert.equal(r.corpo.error, "use o e-mail para o qual o convite foi enviado");
  assert.equal(conta("outro@t.com"), undefined);
});

Deno.test("convite_contra_conta_existente_nao_sobrescreve", async () => {
  const c = await criarConvite("tk-existente");
  const antes = { ...conta("bruno@t.com")! };
  const r = await chamar("convite_cadastrar", cadastro("tk-existente", "bruno@t.com"), null);
  assert.equal(r.status, 409);
  assert.equal(r.corpo.error, "já existe uma conta com este e-mail. Entre no Hub e peça acesso ao responsável");
  const depois = conta("bruno@t.com")!;
  assert.equal(depois.senha_hash, antes.senha_hash);
  assert.equal(depois.papel, "owner");
  assert.equal(depois.email_codigo, antes.email_codigo);
  assert.equal(A.tabela("fa_gestao_convites").find((l) => l.id === c.id)!.usado_em, null);
});

Deno.test("convite_valido_cria_conta_nova", async () => {
  await criarConvite("tk-ok", { destinatario_email: "nova@t.com" });
  const r = await chamar("convite_cadastrar", cadastro("tk-ok", "nova@t.com"), null);
  assert.equal(r.status, 200);
  assert.equal(conta("nova@t.com")?.papel, "gerente");
});

Deno.test("convite_novo_grava_so_hash", async () => {
  const r = await chamar("convite_link_gerar", { sistema: "clinica", funcao: "Gerente", permissao: "operar" });
  assert.equal(r.status, 200);
  const linha = A.tabela("fa_gestao_convites").at(-1)!;
  assert.equal(linha.token, null);
  assert.equal(linha.token_hash, await sha(r.corpo.token));
});

Deno.test("convite_antigo_backfill_abre", async () => {
  const c = await criarConvite("t1-antigo");
  c.token = null; // depois da migration o token em claro pode não existir mais; só o hash vale
  const r = await chamar("convite_consultar", { token: "t1-antigo" }, null);
  assert.equal(r.status, 200);
  assert.equal(r.corpo.ok, true);
});
