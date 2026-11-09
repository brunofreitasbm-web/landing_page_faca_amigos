// Recadastro de identidade: painel e fila de conflitos do owner (Fase 2b).
// Rodar: deno test --no-check --config supabase/tests/gestao-hub/deno.json --allow-env --allow-read --allow-net=none supabase/tests/gestao-hub
import assert from "node:assert/strict";
import { A, B, TOKEN_GERENTE, chamar, contaBase } from "./hub_bootstrap.ts";

const DIA = 86_400_000;
const antes = (dias: number) => new Date(Date.now() - dias * DIA - 60_000).toISOString();

function limpar() {
  for (const t of ["fa_gestao_recadastro_estado", "fa_gestao_recadastro_conflitos"]) A.tabelas[t] = [];
}

Deno.test("gerente_recebe_403", async () => {
  for (const acao of ["recadastro_painel", "recadastro_resolver"]) {
    const r = await chamar(acao, { id: crypto.randomUUID() }, TOKEN_GERENTE);
    assert.equal(r.status, 403);
  }
});

Deno.test("painel_conta_estados", async () => {
  limpar();
  A.tabela("fa_gestao_contas").push(contaBase({ email: "ana@t.com", email_codigo: "ana@t.com", nome: "Ana Hub" }));
  const idB = crypto.randomUUID();
  B.tabela("profiles").push({ id: idB, full_name: "Beto Clinica", role: "terapeuta", active: true });
  const idBloq = crypto.randomUUID();
  const idConf = crypto.randomUUID();
  A.tabela("fa_gestao_recadastro_estado").push(
    { chave: "hub:ana@t.com", primeiro_aviso_em: antes(2) },          // pendente, 5 dias
    { chave: `b:${idB}`, primeiro_aviso_em: antes(0) },               // pendente, 7 dias
    { chave: `b:${idBloq}`, primeiro_aviso_em: antes(9) },            // bloqueado
    { chave: `b:${idConf}`, primeiro_aviso_em: antes(9) },            // vencido mas com conflito: nao bloqueia
    { chave: "hub:feito@t.com", primeiro_aviso_em: antes(9), concluido_em: antes(1) },
  );
  A.tabela("fa_gestao_recadastro_conflitos").push({
    id: crypto.randomUUID(), chave: `b:${idConf}`, motivo: "cpf_de_outra_pessoa", cpf_informado: "12345678901",
    email_informado: "x@y.com", criado_em: antes(1),
  });
  const r = await chamar("recadastro_painel");
  assert.equal(r.status, 200);
  assert.deepEqual(r.corpo.resumo, { concluidos: 1, pendentes: 4, bloqueados: 1 });
  assert.equal(r.corpo.pendentes.length, 4);
  const ana = r.corpo.pendentes.find((p: { nome: string }) => p.nome === "Ana Hub");
  assert.deepEqual(ana, { nome: "Ana Hub", origem: "hub", dias_restantes: 5 });
  const beto = r.corpo.pendentes.find((p: { nome: string }) => p.nome === "Beto Clinica");
  assert.deepEqual(beto, { nome: "Beto Clinica", origem: "clinica/rh", dias_restantes: 7 });
  assert.ok(r.corpo.pendentes.some((p: { nome: string; dias_restantes: number }) => p.nome === "(sem nome)" && p.dias_restantes === 0));
  assert.equal(r.corpo.conflitos.length, 1);
});

Deno.test("erro_de_leitura_responde_500_generico", async () => {
  limpar();
  A.operacoesComErro.add("select:fa_gestao_recadastro_estado");
  try {
    const r = await chamar("recadastro_painel");
    assert.equal(r.status, 500);
    assert.ok(!JSON.stringify(r.corpo).includes("falha simulada"));
  } finally { A.operacoesComErro.delete("select:fa_gestao_recadastro_estado"); }
});

Deno.test("cpf_vem_mascarado", async () => {
  limpar();
  const velho = crypto.randomUUID();
  const novo = crypto.randomUUID();
  A.tabela("fa_gestao_recadastro_conflitos").push(
    { id: velho, chave: "hub:a@t.com", motivo: "cpf_de_outra_pessoa", cpf_informado: "12345678901", email_informado: "a@Real.com", criado_em: antes(3) },
    { id: novo, chave: "hub:b@t.com", motivo: "email_de_outro_login", cpf_informado: "98765432100", email_informado: "b@real.com", criado_em: antes(1) },
    { id: crypto.randomUUID(), chave: "hub:c@t.com", motivo: "cpf_de_outra_pessoa", cpf_informado: "11111111111", email_informado: "c@r.com", criado_em: antes(2), resolvido_em: antes(1) },
  );
  const r = await chamar("recadastro_painel");
  assert.equal(r.status, 200);
  assert.deepEqual(r.corpo.conflitos.map((c: { id: string }) => c.id), [novo, velho]);
  assert.equal(r.corpo.conflitos[0].cpf, "***.***.***-00");
  assert.equal(r.corpo.conflitos[1].cpf, "***.***.***-01");
  assert.equal(r.corpo.conflitos[1].email_informado, "a@Real.com");
  const texto = JSON.stringify(r.corpo);
  assert.ok(!texto.includes("12345678901") && !texto.includes("98765432100") && !texto.includes("123.456"));
});

Deno.test("resolver_da_baixa_e_libera_a_pessoa", async () => {
  limpar();
  const id = crypto.randomUUID();
  A.tabela("fa_gestao_recadastro_estado").push({ chave: "hub:z@t.com", primeiro_aviso_em: antes(9) });
  A.tabela("fa_gestao_recadastro_conflitos").push({
    id, chave: "hub:z@t.com", motivo: "cpf_de_outra_pessoa", cpf_informado: "12345678901", email_informado: "z@r.com", criado_em: antes(1),
  });
  let p = await chamar("recadastro_painel");
  assert.equal(p.corpo.conflitos.length, 1);
  assert.equal(p.corpo.resumo.bloqueados, 0);

  const r = await chamar("recadastro_resolver", { id });
  assert.equal(r.status, 200);
  const gravado = A.tabela("fa_gestao_recadastro_conflitos").find((l) => l.id === id)!;
  assert.ok(gravado.resolvido_em);
  const quando = gravado.resolvido_em;
  assert.ok(A.tabela("fa_gestao_auditoria").some((l) => l.evento === "recadastro_conflito_resolvido" && String(l.detalhe).includes(id) && l.email === "bruno@t.com"));

  p = await chamar("recadastro_painel");
  assert.equal(p.corpo.conflitos.length, 0);
  assert.equal(p.corpo.resumo.bloqueados, 1); // fora do prazo e sem conflito: volta a poder bloquear

  const de_novo = await chamar("recadastro_resolver", { id });
  assert.equal(de_novo.status, 200);
  assert.equal(A.tabela("fa_gestao_recadastro_conflitos").find((l) => l.id === id)!.resolvido_em, quando);
});

Deno.test("resolver_id_invalido_ou_inexistente_da_404", async () => {
  limpar();
  for (const id of ["nao-e-uuid", crypto.randomUUID(), "", 5]) {
    const r = await chamar("recadastro_resolver", { id });
    assert.equal(r.status, 404);
  }
});
