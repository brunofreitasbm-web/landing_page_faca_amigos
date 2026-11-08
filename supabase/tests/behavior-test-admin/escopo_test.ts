// Nível do Hub -> escopo da sessão do /admin. Ticket sem nível não pode virar owner.
import assert from "node:assert/strict";
import { escopoDoNivel } from "../../functions/behavior-test-admin/escopo.ts";

Deno.test("escopo_do_nivel_falha_fechado", () => {
  assert.equal(escopoDoNivel("admin"), "owner");
  assert.equal(escopoDoNivel("operar"), "equipe");
  assert.equal(escopoDoNivel("ver"), "ver");
  assert.equal(escopoDoNivel(null), "nenhum");
  assert.equal(escopoDoNivel(undefined), "nenhum");
  assert.equal(escopoDoNivel("x"), "nenhum");
});
