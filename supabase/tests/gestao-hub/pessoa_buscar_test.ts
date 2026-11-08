// pessoa_buscar: procura a pessoa por nome ou CPF no Hub, na Clínica e no Playground (evita duplicar cadastro).
import assert from "node:assert/strict";
import { A, B, TOKEN_GERENTE, chamar, contaBase } from "./hub_bootstrap.ts";

A.tabela("fa_gestao_contas").push(contaBase({ email: "ana.hub@t.com", nome: "Ana Souza", cpf: "52998224725" }));
B.tabela("profiles").push({ id: "p1", full_name: "Ana Souza Lima", cpf: "12345678909", email: "ana.clinica@t.com" });
A.tabela("fa_kiosk_employees").push({ id: "e1", full_name: "ANA SOUZA", cpf: null, active: true });

Deno.test("busca_por_nome_nas_tres_origens", async () => {
  const r = await chamar("pessoa_buscar", { termo: "souz" });
  assert.equal(r.status, 200);
  assert.deepEqual(r.corpo.pessoas.map((p: { origem: string }) => p.origem).sort(), ["clinica", "hub", "playground"]);
});

Deno.test("busca_por_cpf_ignora_mascara", async () => {
  const r = await chamar("pessoa_buscar", { cpf: "123.456.789-09" });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.pessoas.length, 1);
  assert.equal(r.corpo.pessoas[0].origem, "clinica");
  assert.equal(r.corpo.pessoas[0].cpf, "***.456.789-**");
});

Deno.test("termo_curto_recusa", async () => {
  const r = await chamar("pessoa_buscar", { termo: "an" });
  assert.equal(r.status, 400);
});

Deno.test("gerente_nao_busca", async () => {
  const r = await chamar("pessoa_buscar", { termo: "souza" }, TOKEN_GERENTE);
  assert.equal(r.status, 403);
});
