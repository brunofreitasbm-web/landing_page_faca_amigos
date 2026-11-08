// Convites do Hub: segurança (não sobrescrever conta) e convite com vários sistemas.
// Rodar: deno test --no-check --config supabase/tests/gestao-hub/deno.json --allow-env --allow-net=none supabase/tests/gestao-hub
import assert from "node:assert/strict";
import { A, TOKEN_GERENTE, chamar, contaBase, emailsEnviados, sha } from "./hub_bootstrap.ts";

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

// ---------- Fase 1: link com vários sistemas, função por sistema ----------
const DOIS_ITENS = [
  { sistema: "clinica", funcao: "Supervisor(a)", nivel: "admin", unidades: ["Unidade A"] },
  { sistema: "playground", funcao: "Gerente", nivel: "operar", unidades: ["Circuito"] },
];
const multi = (over: Record<string, unknown> = {}) => ({
  destinatario_nome: "Carla Dias", destinatario_email: "carla@t.com", cpf: "529.982.247-25", itens: DOIS_ITENS, ...over,
});

Deno.test("link_dois_sistemas_funcoes_diferentes", async () => {
  const r = await chamar("convite_link_gerar", multi());
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const conv = A.tabela("fa_gestao_convites").find((l) => l.destinatario_email === "carla@t.com")!;
  assert.equal(conv.cpf, "52998224725");
  assert.equal(conv.token, null);
  const itens = A.tabela("fa_gestao_convite_itens").filter((i) => i.convite_id === conv.id);
  assert.deepEqual(itens.map((i) => [i.modulo, i.nivel, i.funcao]).sort(), [["clinica", "admin", "Supervisor(a)"], ["playground", "operar", "Gerente"]]);
  assert.equal(r.corpo.itens.length, 2);
  const mail = emailsEnviados.find((e) => e.para === "carla@t.com")!;
  assert.ok(mail.html.includes("Clínica") && mail.html.includes("Playground"));
});

Deno.test("link_formato_antigo_continua", async () => {
  const r = await chamar("convite_link_gerar", { sistema: "clinica", funcao: "Gerente", permissao: "ver" });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.convite.sistema, "clinica");
});

Deno.test("itens_sem_email_recusa", async () => {
  const r = await chamar("convite_link_gerar", multi({ destinatario_email: "" }));
  assert.equal(r.status, 400);
  assert.equal(r.corpo.error, "informe o e-mail da pessoa");
});

Deno.test("cpf_invalido_recusa", async () => {
  const r = await chamar("convite_link_gerar", multi({ cpf: "111.111.111-11" }));
  assert.equal(r.status, 400);
  assert.equal(r.corpo.error, "CPF inválido");
});

Deno.test("cpf_ja_tem_conta_recusa", async () => {
  A.tabela("fa_gestao_contas").push(contaBase({ email: "dono.cpf@t.com", cpf: "12345678909" }));
  const r = await chamar("convite_link_gerar", multi({ destinatario_email: "x1@t.com", cpf: "123.456.789-09" }));
  assert.equal(r.status, 409);
});

Deno.test("rh_sem_escopo_recusa", async () => {
  const r = await chamar("convite_link_gerar", multi({ destinatario_email: "x2@t.com", itens: [{ sistema: "rh", funcao: "Supervisor(a)", nivel: "operar" }] }));
  assert.equal(r.status, 400);
  assert.equal(r.corpo.error, "escolha a empresa (Grupo IB ou Porto Terapia) desta pessoa");
});

Deno.test("sistema_repetido_recusa", async () => {
  const r = await chamar("convite_link_gerar", multi({ destinatario_email: "x3@t.com", itens: [DOIS_ITENS[0], DOIS_ITENS[0]] }));
  assert.equal(r.status, 400);
});

Deno.test("itens_vazio_recusa", async () => {
  const r = await chamar("convite_link_gerar", multi({ destinatario_email: "x4@t.com", itens: [] }));
  assert.equal(r.status, 400);
});

Deno.test("nao_owner_recusa", async () => {
  const r = await chamar("convite_link_gerar", multi({ destinatario_email: "x5@t.com" }), TOKEN_GERENTE);
  assert.equal(r.status, 403);
});
