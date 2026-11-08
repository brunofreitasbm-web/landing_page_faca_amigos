// sincronizar_login_clinica com segredo compartilhado (GESTAO_SYNC_SECRET) entre o Hub e a Clínica.
import assert from "node:assert/strict";
import { A, chamar, sha } from "./hub_bootstrap.ts";

const SEGREDO = "segredo-de-teste-sincronizacao";
const SENHA = "SenhaCerta@1";

async function criarContaHub(email: string) {
  const token = `tk-${email}`;
  A.tabela("fa_gestao_convites").push({
    id: crypto.randomUUID(), token: null, token_hash: await sha(token), unidade: "U", sistema: "clinica",
    funcao: "Gerente", permissao: "operar", destinatario_email: email, criado_por: "bruno@t.com",
    usado_em: null, expires_at: new Date(Date.now() + 86400_000).toISOString(),
  });
  const r = await chamar("convite_cadastrar", { token, nome: "Pessoa Teste", data_nascimento: "1990-01-01", email, password: SENHA }, null);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
}
const tentativas = () => A.tabela("fa_gestao_login_attempts").length;

Deno.test("sincronizar_sem_segredo_configurado_funciona_como_antes", async () => {
  Deno.env.delete("GESTAO_SYNC_SECRET");
  await criarContaHub("s1@t.com");
  const r = await chamar("sincronizar_login_clinica", { identifier: "s1@t.com", password: SENHA }, null);
  assert.equal(r.status, 200);
  assert.equal(r.corpo.ok, true);
});

Deno.test("sincronizar_com_segredo_recusa_sem_header", async () => {
  await criarContaHub("s2@t.com");
  Deno.env.set("GESTAO_SYNC_SECRET", SEGREDO);
  try {
    const antes = tentativas();
    const semHeader = await chamar("sincronizar_login_clinica", { identifier: "s2@t.com", password: SENHA }, null);
    assert.equal(semHeader.status, 401);
    assert.equal(semHeader.corpo.ok, false);
    const errado = await chamar("sincronizar_login_clinica", { identifier: "s2@t.com", password: SENHA }, null, { "x-gestao-sync-secret": "outro" });
    assert.equal(errado.status, 401);
    assert.equal(tentativas(), antes);
  } finally {
    Deno.env.delete("GESTAO_SYNC_SECRET");
  }
});

Deno.test("sincronizar_com_segredo_aceita_header_certo", async () => {
  await criarContaHub("s3@t.com");
  Deno.env.set("GESTAO_SYNC_SECRET", SEGREDO);
  try {
    const r = await chamar("sincronizar_login_clinica", { identifier: "s3@t.com", password: SENHA }, null, { "x-gestao-sync-secret": SEGREDO });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.ok, true);
  } finally {
    Deno.env.delete("GESTAO_SYNC_SECRET");
  }
});

Deno.test("sincronizar_com_segredo_aplica_limite_por_ip_do_cliente", async () => {
  Deno.env.set("GESTAO_SYNC_SECRET", SEGREDO);
  const h = { "x-gestao-sync-secret": SEGREDO, "x-cliente-ip": "1.2.3.4" };
  try {
    for (let i = 0; i < 5; i++) {
      const r = await chamar("sincronizar_login_clinica", { identifier: `spray${i}@t.com`, password: "x" }, null, h);
      assert.equal(r.corpo.ok, false, `tentativa ${i + 1}`);
    }
    const bloqueada = await chamar("sincronizar_login_clinica", { identifier: "spray9@t.com", password: "x" }, null, h);
    assert.equal(bloqueada.status, 429);
    // Outro usuário (outro IP) segue normal.
    const outro = await chamar("sincronizar_login_clinica", { identifier: "spray9@t.com", password: "x" }, null, { ...h, "x-cliente-ip": "5.6.7.8" });
    assert.equal(outro.status, 200);
  } finally {
    Deno.env.delete("GESTAO_SYNC_SECRET");
  }
});
