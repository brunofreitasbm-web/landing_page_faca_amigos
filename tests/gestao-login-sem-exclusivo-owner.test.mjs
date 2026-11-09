// O login do Hub serve owner e gerente: a tela de entrada não pode dizer "Exclusivo Owner".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/gestao.html", import.meta.url), "utf8");

test("tela de login nao exibe 'Exclusivo Owner'", () => {
  assert.equal(/Exclusivo Owner/i.test(html), false);
});

test("subtitulo do login nasce oculto e so aparece no host da clinica", () => {
  assert.match(html, /<p class="sub" id="loginSub" hidden><\/p>/);
  assert.match(html, /loginSubEl\.textContent = 'Centro de Terapia comportamental';\s*loginSubEl\.hidden = false;/);
});
