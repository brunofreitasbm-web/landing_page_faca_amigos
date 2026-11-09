// Contrato Hub <-> página: public/gestao.html (tela #recadastro) decide a mensagem pelo TEXTO destes dois erros.
// Se alguém mudar uma destas strings no index.ts, a página passa a mostrar a mensagem errada:
//   - confirmar com página inválida/vencida: 401 "não autorizado" (a página mostra "acesso expirado", não "código incorreto")
//   - enviar_codigo com recadastro concluído: 409 "recadastro já concluído" (a página mostra "já concluído", não "conflito")
// Ao trocar o texto aqui, troque também em gestao.html e em tests/gestao-recadastro.test.mjs.
import assert from "node:assert/strict";
import { A, chamar, sha } from "./hub_bootstrap.ts";

function ligar() { Deno.env.set("GESTAO_RECADASTRO", "1"); }
function desligar() { Deno.env.delete("GESTAO_RECADASTRO"); }
const CPF = "52998224725";

async function paginaHub(email: string, expiraEmMs: number) {
  const token = `pagina-contrato-${email}-${"z".repeat(40)}`;
  A.tabela("fa_gestao_recadastro_tickets").push({
    ticket_hash: `hc-${email}`, chave: `hub:${email}`, origem: "hub", auth_user_id: null, hub_email: email,
    login_email: email, nome: "Fulana", expira_em: new Date().toISOString(),
    pagina_hash: await sha(token), pagina_expira_em: new Date(Date.now() + expiraEmMs).toISOString(),
  });
  return token;
}

Deno.test("confirmar_com_pagina_invalida_ou_vencida_401_nao_autorizado", async () => {
  ligar();
  try {
    const confirmarCom = (pagina: string) =>
      chamar("recadastro_confirmar", { pagina, challenge_id: crypto.randomUUID(), code: "123456" }, null);
    const inexistente = await confirmarCom("token-que-nao-existe");
    assert.equal(inexistente.status, 401);
    assert.equal(inexistente.corpo.error, "não autorizado");
    assert.equal(inexistente.corpo.reiniciar, undefined);
    const vencida = await confirmarCom(await paginaHub("vencida@t.com", -60_000));
    assert.equal(vencida.status, 401);
    assert.equal(vencida.corpo.error, "não autorizado");
  } finally { desligar(); }
});

Deno.test("enviar_codigo_com_recadastro_concluido_409_recadastro_ja_concluido", async () => {
  ligar();
  try {
    const token = await paginaHub("concluida@t.com", 600_000);
    A.tabela("fa_gestao_recadastro_estado").push({
      chave: "hub:concluida@t.com", primeiro_aviso_em: new Date().toISOString(), concluido_em: new Date().toISOString(),
    });
    const r = await chamar("recadastro_enviar_codigo", { pagina: token, cpf: CPF, email: "a@b.com" }, null);
    assert.equal(r.status, 409);
    assert.equal(r.corpo.error, "recadastro já concluído");
  } finally { desligar(); }
});
