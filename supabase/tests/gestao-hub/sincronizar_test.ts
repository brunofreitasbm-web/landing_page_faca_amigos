// sincronizar_login_clinica: limite de tentativas por login (sem limite por IP: quem chama é o servidor da Clínica).
import assert from "node:assert/strict";
import { A, chamar, sha } from "./hub_bootstrap.ts";

Deno.test("sincronizar_bloqueia_apos_10_falhas", async () => {
  A.tabela("fa_gestao_convites").push({
    id: crypto.randomUUID(), token: null, token_hash: await sha("tk-ana"), unidade: "U", sistema: "clinica",
    funcao: "Gerente", permissao: "operar", destinatario_email: "ana@t.com", criado_por: "bruno@t.com",
    usado_em: null, expires_at: new Date(Date.now() + 86400_000).toISOString(),
  });
  const cad = await chamar("convite_cadastrar", {
    token: "tk-ana", nome: "Ana Teste", data_nascimento: "1990-01-01", email: "ana@t.com", password: "SenhaCerta@1",
  }, null);
  assert.equal(cad.status, 200);

  for (let i = 0; i < 10; i++) {
    const r = await chamar("sincronizar_login_clinica", { identifier: "ana@t.com", password: "errada" }, null);
    assert.equal(r.corpo.ok, false, `tentativa ${i + 1}`);
  }
  assert.equal(A.tabela("fa_gestao_login_attempts").filter((l) => l.login === "ana@t.com").length, 10);
  const bloqueada = await chamar("sincronizar_login_clinica", { identifier: "ana@t.com", password: "SenhaCerta@1" }, null);
  assert.equal(bloqueada.status, 429);
});

Deno.test("sincronizar_senha_certa_passa", async () => {
  // Conta criada no teste anterior está bloqueada; outra conta segue normal (o limite é por login).
  const r = await chamar("sincronizar_login_clinica", { identifier: "naoexiste@t.com", password: "x" }, null);
  assert.equal(r.status, 200);
  assert.equal(r.corpo.ok, false);
});
