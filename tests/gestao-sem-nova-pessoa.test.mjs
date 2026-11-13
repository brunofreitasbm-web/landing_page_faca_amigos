// Criar pessoa passa a ter um único caminho: "Enviar Link de Usuário" (com CPF e função por sistema).
// "Pessoas e acessos" só edita quem já existe.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/gestao.html", import.meta.url), "utf8");

test("Pessoas e acessos nao tem o botao Nova pessoa", () => {
  assert.equal(html.includes('id="novaPessoaBtn"'), false);
  assert.equal(html.includes("novaPessoaBtn"), false);
});

test("o envio de link continua sendo o caminho para criar pessoa", () => {
  assert.match(html, /id="btnAbrirCriarLink"/);
  assert.match(html, /Enviar Link de Usuário/);
});

test("editar quem ja existe continua disponivel", () => {
  assert.match(html, /abrirFormPessoa\(c\)/);
  assert.match(html, /id="pessoaFormEl"/);
});
