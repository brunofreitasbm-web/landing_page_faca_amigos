// Convites do Hub: segurança (não sobrescrever conta) e convite com vários sistemas.
// Rodar: deno test --no-check --config supabase/tests/gestao-hub/deno.json --allow-env --allow-net=none supabase/tests/gestao-hub
import assert from "node:assert/strict";
import { A, B, TOKEN_GERENTE, chamar, contaBase, emailsEnviados, sha } from "./hub_bootstrap.ts";

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
  { sistema: "clinica", papel: "supervisor", unidades: ["Unidade A"] },
  { sistema: "playground", papel: "GERENTE", unidades: ["Circuito"] },
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
  assert.deepEqual(itens.map((i) => [i.modulo, i.nivel, i.funcao]).sort(), [["clinica", "operar", "Supervisão"], ["playground", "operar", "Gerente"]]);
  assert.deepEqual(itens.map((i) => [i.modulo, i.papel_nativo]).sort(), [["clinica", "supervisor"], ["playground", "GERENTE"]]);
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
  const r = await chamar("convite_link_gerar", multi({ destinatario_email: "x2@t.com", itens: [{ sistema: "rh", papel: "supervisor" }] }));
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

// ---------- Fase 1: cadastro aplica os sistemas do convite e provisiona ----------
async function linkMulti(email: string, cpf: string) {
  const r = await chamar("convite_link_gerar", multi({ destinatario_email: email, cpf }));
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  return r.corpo.token as string;
}
const permissao = (email: string, modulo: string) =>
  A.tabela("fa_gestao_permissoes").find((p) => p.email === email && p.modulo === modulo);

Deno.test("consultar_mostra_itens", async () => {
  const token = await linkMulti("diego@t.com", "11144477735");
  const r = await chamar("convite_consultar", { token }, null);
  assert.equal(r.status, 200);
  assert.deepEqual(r.corpo.convite.itens.map((i: { sistema: string; nivel: string }) => [i.sistema, i.nivel]), [["clinica", "operar"], ["playground", "operar"]]);
});

Deno.test("cadastro_multi_item_cria_permissoes_e_provisiona", async () => {
  const token = await linkMulti("elisa@t.com", "39053344705");
  const r = await chamar("convite_cadastrar", cadastro(token, "elisa@t.com"), null);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const c = conta("elisa@t.com")!;
  assert.equal(c.cpf, "39053344705");
  assert.equal(c.papel, "gerente");
  assert.equal(c.clinica_email, "elisa@t.com");
  assert.equal(c.playground_email, "elisa@t.com");
  assert.equal(permissao("elisa@t.com", "clinica")?.nivel, "operar");
  assert.equal(permissao("elisa@t.com", "clinica")?.papel_nativo, "supervisor");
  assert.deepEqual(permissao("elisa@t.com", "clinica")?.unidades, ["Unidade A"]);
  assert.equal(permissao("elisa@t.com", "playground")?.nivel, "operar");
  assert.equal(B.tabela("profiles").find((p) => p.email === "elisa@t.com")?.role, "supervisor");
  assert.equal(r.corpo.provisionamento.length, 2);
  assert.ok(String(r.corpo.destino).startsWith("http"));
});

Deno.test("cadastro_provisao_parcial_mantem_conta", async () => {
  const token = await linkMulti("fabio@t.com", "86288366757");
  B.operacoesComErro.add("upsert:profiles");
  B.operacoesComErro.add("update:profiles");
  B.operacoesComErro.add("insert:profiles");
  try {
    const r = await chamar("convite_cadastrar", cadastro(token, "fabio@t.com"), null);
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.ok(conta("fabio@t.com"));
    assert.equal(permissao("fabio@t.com", "clinica")?.nivel, "operar");
    const conv = A.tabela("fa_gestao_convites").find((l) => l.destinatario_email === "fabio@t.com")!;
    assert.ok(conv.usado_em);
    const cli = r.corpo.provisionamento.find((p: { app: string }) => p.app === "clinica");
    assert.equal(cli.estado, "erro");
  } finally {
    B.operacoesComErro.clear();
  }
});

Deno.test("convite_sem_itens_segue_fluxo_antigo", async () => {
  const g = await chamar("convite_link_gerar", { sistema: "clinica", funcao: "Gerente", permissao: "ver", destinatario_email: "gabi@t.com" });
  const r = await chamar("convite_cadastrar", cadastro(g.corpo.token, "gabi@t.com"), null);
  assert.equal(r.status, 200);
  assert.equal(permissao("gabi@t.com", "clinica")?.nivel, "ver");
  assert.equal(r.corpo.provisionamento, undefined);
});

// ---------- Ajustes da revisão ----------
Deno.test("link_recusa_email_que_e_login_de_outra_conta", async () => {
  A.tabela("fa_gestao_contas").push(contaBase({ email: "ivo@corp.com", login_email: "ivo@gmail.com" }));
  const r = await chamar("convite_link_gerar", multi({ destinatario_email: "ivo@gmail.com", cpf: "71428793860" }));
  assert.equal(r.status, 409);
});

Deno.test("cadastro_recusa_email_que_e_login_de_outra_conta", async () => {
  A.tabela("fa_gestao_contas").push(contaBase({ email: "jo@corp.com", login_email: "jo@gmail.com" }));
  await criarConvite("tk-jo");
  const r = await chamar("convite_cadastrar", cadastro("tk-jo", "jo@gmail.com"), null);
  assert.equal(r.status, 409);
  assert.equal(conta("jo@gmail.com"), undefined);
});

Deno.test("sistema_do_prototype_recusa", async () => {
  const r = await chamar("convite_link_gerar", multi({ destinatario_email: "x6@t.com", itens: [{ sistema: "constructor", papel: "x" }] }));
  assert.equal(r.status, 400);
});

Deno.test("convite_ja_reservado_nao_cria_segunda_conta", async () => {
  const c = await criarConvite("tk-corrida");
  c.usado_em = new Date().toISOString(); // outro cadastro já reservou
  const r = await chamar("convite_cadastrar", cadastro("tk-corrida", "corrida@t.com"), null);
  assert.equal(r.status, 410);
  assert.equal(conta("corrida@t.com"), undefined);
});

Deno.test("multi_nao_deriva_usuario_cacau_do_email", async () => {
  const r = await chamar("convite_link_gerar", multi({
    destinatario_email: "admin@qualquer.com", cpf: "15350946056",
    itens: [{ sistema: "cacau" }],
  }));
  assert.equal(r.status, 200);
  const cad = await chamar("convite_cadastrar", cadastro(r.corpo.token, "admin@qualquer.com"), null);
  assert.equal(cad.status, 200, JSON.stringify(cad.corpo));
  assert.equal(conta("admin@qualquer.com")!.cacau_usuario ?? null, null);
});

Deno.test("multi_avisa_quando_permissoes_falham", async () => {
  const token = await linkMulti("lia@t.com", "34608514300");
  A.operacoesComErro.add("upsert:fa_gestao_permissoes");
  try {
    const r = await chamar("convite_cadastrar", cadastro(token, "lia@t.com"), null);
    assert.equal(r.status, 200);
    assert.ok(conta("lia@t.com"));
    assert.ok(Array.isArray(r.corpo.avisos) && r.corpo.avisos.length > 0, JSON.stringify(r.corpo));
  } finally {
    A.operacoesComErro.clear();
  }
});

Deno.test("papel_de_outro_sistema_recusa", async () => {
  const r = await chamar("convite_link_gerar", multi({ destinatario_email: "x7@t.com", itens: [{ sistema: "clinica", papel: "GERENTE" }] }));
  assert.equal(r.status, 400);
  assert.equal(r.corpo.error, "escolha a função de Clínica");
});

Deno.test("papel_ausente_em_sistema_com_catalogo_recusa", async () => {
  const r = await chamar("convite_link_gerar", multi({ destinatario_email: "x8@t.com", itens: [{ sistema: "playground" }] }));
  assert.equal(r.status, 400);
});

Deno.test("sistema_sem_catalogo_nao_pede_funcao_e_nivel_vem_fixo", async () => {
  // nivel "admin" vindo do cliente é ignorado: o servidor fixa operar.
  const r = await chamar("convite_link_gerar", multi({ destinatario_email: "x9@t.com", cpf: "52998224725", itens: [{ sistema: "porto", nivel: "admin" }] }));
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const conv = A.tabela("fa_gestao_convites").find((l) => l.destinatario_email === "x9@t.com")!;
  const item = A.tabela("fa_gestao_convite_itens").find((i) => i.convite_id === conv.id)!;
  assert.equal(item.nivel, "operar");
  assert.equal(item.papel_nativo, null);
  assert.equal(r.corpo.itens[0].tem_funcao, false);
});
