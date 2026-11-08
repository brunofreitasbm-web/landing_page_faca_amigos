// Testes do próprio fake (só o que os testes do Hub passaram a usar).
import assert from "node:assert/strict";
import { createClient, projeto } from "./fake_supabase.ts";

Deno.test("count_head_devolve_contagem", async () => {
  const p = projeto("http://fake-count");
  p.tabela("t").push({ x: 1 }, { x: 1 }, { x: 2 });
  const c = createClient("http://fake-count", "k");
  const r = await c.from("t").select("id", { count: "exact", head: true }).eq("x", 1);
  assert.equal(r.count, 2);
  assert.equal(r.data, null);
});

Deno.test("ilike_com_curinga", async () => {
  const p = projeto("http://fake-ilike");
  p.tabela("t").push({ nome: "Ana Souza" }, { nome: "Bruno" });
  const c = createClient("http://fake-ilike", "k");
  const r = await c.from("t").select("nome").ilike("nome", "%souz%");
  assert.deepEqual(r.data.map((l: { nome: string }) => l.nome), ["Ana Souza"]);
  const exato = await c.from("t").select("nome").ilike("nome", "bruno");
  assert.equal(exato.data.length, 1);
});
