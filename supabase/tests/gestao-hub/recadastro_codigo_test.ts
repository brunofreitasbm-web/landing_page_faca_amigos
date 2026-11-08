// Recadastro de identidade: código por e-mail, conflito e CORS do RH (Fase 2b, Tarefa 4).
import assert from "node:assert/strict";
import { A, B, chamar, emailsEnviados, sha } from "./hub_bootstrap.ts";

function ligar() { Deno.env.set("GESTAO_RECADASTRO", "1"); }
function desligar() { Deno.env.delete("GESTAO_RECADASTRO"); }
const desafios = () => A.tabela("fa_gestao_desafios");
const conflitos = () => A.tabela("fa_gestao_recadastro_conflitos");
const CPF = "52998224725"; // válido
const CPF_MASCARA = "529.982.247-25";

let n = 0;
async function pagina(over: { origem?: string; authUserId?: string | null; hubEmail?: string | null; chave?: string } = {}) {
  const id = over.authUserId === undefined ? crypto.randomUUID() : over.authUserId;
  const origem = over.origem ?? "clinica";
  const chave = over.chave ?? (origem === "hub" ? `hub:${over.hubEmail}` : `b:${id}`);
  const token = `pagina-${++n}-${"x".repeat(40)}`;
  A.tabela("fa_gestao_recadastro_tickets").push({
    ticket_hash: `h-${n}`, chave, origem, auth_user_id: id, hub_email: over.hubEmail ?? null,
    login_email: `login${n}@fake.local`, nome: "Fulana", expira_em: new Date().toISOString(),
    pagina_hash: await sha(token), pagina_expira_em: new Date(Date.now() + 600_000).toISOString(),
  });
  if (id) B.usuarios.push({
    id, email: `login${n}@fake.local`, app_metadata: {}, user_metadata: {},
    created_at: new Date().toISOString(), last_sign_in_at: null, banned_until: null,
  });
  return { token, chave, id };
}
const enviar = (token: string, cpf: string, email: string) => chamar("recadastro_enviar_codigo", { pagina: token, cpf, email }, null);

Deno.test("cpf_invalido_400", async () => {
  ligar();
  try {
    const p = await pagina();
    const antes = desafios().length;
    const r = await enviar(p.token, "11111111111", "a@b.com");
    assert.equal(r.status, 400);
    assert.equal(r.corpo.error, "CPF inválido");
    assert.equal((await enviar(p.token, CPF, "sem-arroba")).status, 400);
    assert.equal(desafios().length, antes);
  } finally { desligar(); }
});

Deno.test("desligado_sem_identidade_e_conclusao", async () => {
  desligar();
  const p = await pagina();
  const off = await enviar(p.token, CPF, "a@b.com");
  assert.deepEqual(off.corpo, { pendente: false });
  ligar();
  try {
    assert.equal((await enviar("token-inexistente", CPF, "a@b.com")).status, 401);
    A.tabela("fa_gestao_recadastro_estado").push({ chave: p.chave, primeiro_aviso_em: new Date().toISOString(), concluido_em: new Date().toISOString() });
    const r = await enviar(p.token, CPF, "a@b.com");
    assert.equal(r.status, 409);
    assert.equal(r.corpo.error, "recadastro já concluído");
  } finally { desligar(); }
});

Deno.test("cpf_com_mascara_igual_sem_mascara", async () => {
  ligar();
  try {
    const p = await pagina();
    const r = await enviar(p.token, CPF_MASCARA, "  Maria@Real.COM ");
    assert.equal(r.status, 200);
    const d = desafios().find((l) => l.id === r.corpo.challenge_id)!;
    assert.deepEqual(d.dados, { cpf: CPF });
    assert.equal(d.email, "maria@real.com");
  } finally { desligar(); }
});

Deno.test("codigo_vai_para_o_email_digitado_e_cpf_fica_em_dados", async () => {
  ligar();
  try {
    const p = await pagina();
    const antes = emailsEnviados.length;
    const r = await enviar(p.token, CPF, "Real@Mail.com");
    assert.equal(r.status, 200);
    const d = desafios().find((l) => l.id === r.corpo.challenge_id)!;
    assert.equal(d.finalidade, "recadastro");
    assert.equal(d.alvo_id, p.chave);
    assert.equal(d.tentativas, 0);
    assert.ok(new Date(d.expires_at).getTime() > Date.now() + 9 * 60_000);
    const mail = emailsEnviados[antes];
    assert.equal(mail.para, "real@mail.com");
    assert.match(mail.assunto, /Confirme o seu e-mail/);
    const codigo = /letter-spacing:10px[^>]*>(\d{6})</.exec(mail.html)![1];
    assert.equal(d.code_hash, await sha(`${d.id}:${codigo}`));
  } finally { desligar(); }
});

Deno.test("mais_de_3_codigos_em_15_min_429", async () => {
  ligar();
  try {
    const p = await pagina();
    for (let i = 0; i < 3; i++) assert.equal((await enviar(p.token, CPF, "a@b.com")).status, 200);
    const antes = emailsEnviados.length;
    const r = await enviar(p.token, CPF, "a@b.com");
    assert.equal(r.status, 429);
    assert.equal(r.corpo.error, "muitos códigos pedidos, aguarde 15 minutos");
    assert.equal(emailsEnviados.length, antes);
  } finally { desligar(); }
});

Deno.test("cpf_de_outra_pessoa_abre_conflito_e_nao_envia", async () => {
  ligar();
  try {
    A.tabela("fa_gestao_pessoas").push({ cpf: CPF, email_real: "dona@real.com", nome: "Dona" });
    const p = await pagina();
    const antes = emailsEnviados.length;
    const r = await enviar(p.token, CPF, "outra@real.com");
    assert.equal(r.status, 409);
    assert.equal(r.corpo.error, "não foi possível concluir, o responsável foi avisado");
    assert.equal(emailsEnviados.length, antes);
    assert.equal(desafios().filter((l) => l.alvo_id === p.chave).length, 0);
    const c = conflitos().filter((l) => l.chave === p.chave);
    assert.equal(c.length, 1);
    assert.equal(c[0].motivo, "cpf_de_outra_pessoa");
    assert.equal(c[0].cpf_informado, CPF);
    assert.equal(c[0].email_informado, "outra@real.com");
    await enviar(p.token, CPF, "outra@real.com");
    assert.equal(conflitos().filter((l) => l.chave === p.chave).length, 1, "não duplica conflito aberto");
    assert.ok(A.tabela("fa_gestao_auditoria").some((l) => l.evento === "recadastro_conflito"));
  } finally { desligar(); }
});

Deno.test("cpf_do_projeto_b_de_outro_id_e_conflito", async () => {
  ligar();
  try {
    B.tabela("profiles").push({ id: crypto.randomUUID(), cpf: CPF, email: "x@y.com" });
    const p = await pagina();
    const r = await enviar(p.token, CPF, "novo@real.com");
    assert.equal(r.status, 409);
    assert.equal(conflitos().find((l) => l.chave === p.chave)!.motivo, "cpf_de_outra_pessoa");
  } finally { desligar(); B.tabelas["profiles"] = (B.tabelas["profiles"] ?? []).filter((l) => l.cpf !== CPF); }
});

Deno.test("mesmo_cpf_e_mesmo_email_nao_e_conflito", async () => {
  ligar();
  try {
    A.tabela("fa_gestao_pessoas").push({ cpf: "39053344705", email_real: "mesma@real.com", nome: "Mesma" });
    const p = await pagina();
    const r = await enviar(p.token, "39053344705", "Mesma@Real.com");
    assert.equal(r.status, 200);
    assert.equal(conflitos().filter((l) => l.chave === p.chave).length, 0);
  } finally { desligar(); }
});

Deno.test("email_de_outro_login_abre_conflito", async () => {
  ligar();
  try {
    B.usuarios.push({
      id: crypto.randomUUID(), email: "ocupado@real.com", app_metadata: {}, user_metadata: {},
      created_at: new Date().toISOString(), last_sign_in_at: null, banned_until: null,
    });
    const p = await pagina();
    const antes = emailsEnviados.length;
    const r = await enviar(p.token, "11144477735", "Ocupado@Real.com");
    assert.equal(r.status, 409);
    assert.equal(emailsEnviados.length, antes);
    assert.equal(conflitos().find((l) => l.chave === p.chave)!.motivo, "email_de_outro_login");
    // o próprio login da pessoa não é conflito
    const dono = B.usuarios[B.usuarios.length - 2];
    const p2 = await pagina({ authUserId: dono.id });
    assert.equal((await enviar(p2.token, "11144477735", dono.email)).status, 200);
  } finally { desligar(); }
});

Deno.test("hub_confere_outra_conta_do_hub", async () => {
  ligar();
  try {
    const p = await pagina({ origem: "hub", authUserId: null, hubEmail: "gerente@t.com" });
    const r = await enviar(p.token, "11144477735", "bruno@t.com");
    assert.equal(r.status, 409);
    assert.equal(conflitos().find((l) => l.chave === p.chave)!.motivo, "email_de_outro_login");
  } finally { desligar(); }
});

Deno.test("erro_de_consulta_nao_vira_conflito", async () => {
  ligar();
  try {
    A.operacoesComErro.add("select:fa_gestao_pessoas");
    const p = await pagina();
    assert.equal((await enviar(p.token, "39053344705", "livre@real.com")).status, 200);
  } finally { A.operacoesComErro.delete("select:fa_gestao_pessoas"); desligar(); }
});

Deno.test("cors_aceita_origem_do_rh", async () => {
  // OPTIONS devolve os cabeçalhos de CORS sem corpo; o handler está em hub_bootstrap (chamar só faz POST).
  const { handlerParaTeste } = await import("./hub_bootstrap.ts") as unknown as { handlerParaTeste?: (r: Request) => Promise<Response> };
  assert.ok(handlerParaTeste, "hub_bootstrap exporta handlerParaTeste");
  for (const origem of ["https://rh.institutofacaamigos.com.br", "https://porto-terapia-gestao.vercel.app"]) {
    const res = await handlerParaTeste(new Request("http://hub", { method: "OPTIONS", headers: { Origin: origem } }));
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), origem);
  }
});

function cpfsValidos(qtd: number): string[] {
  const dv = (d: number[]) => {
    let r = (d.reduce((a, v, i) => a + v * (d.length + 1 - i), 0) * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const out: string[] = [];
  for (let i = 1; out.length < qtd; i++) {
    const base = String(100000000 + i * 7919).slice(0, 9).split("").map(Number);
    if (new Set(base).size === 1) continue;
    base.push(dv(base)); base.push(dv(base));
    out.push(base.join(""));
  }
  return out;
}
const CPF_LIVRE = cpfsValidos(30)[29];
const semear = (chave: string, minutosAtras: number) =>
  A.tabela("fa_gestao_desafios").push({
    id: crypto.randomUUID(), email: "a@b.com", finalidade: "recadastro", alvo_id: chave, tentativas: 0,
    created_at: new Date(Date.now() - minutosAtras * 60_000).toISOString(),
  });

Deno.test("conflitos_contam_no_orcamento_e_dao_429", async () => {
  ligar();
  try {
    const cpfs = cpfsValidos(8);
    for (const c of cpfs.slice(0, 7)) A.tabela("fa_gestao_pessoas").push({ cpf: c, email_real: "dona@real.com", nome: "D" });
    const p = await pagina();
    const antes = emailsEnviados.length;
    for (let i = 0; i < 5; i++) assert.equal((await enviar(p.token, cpfs[i], "outra@real.com")).status, 409);
    assert.equal(conflitos().filter((l) => l.chave === p.chave).length, 5);
    const existente = await enviar(p.token, cpfs[5], "outra@real.com");
    const livre = await enviar(p.token, cpfs[7], "outra@real.com");
    for (const r of [existente, livre]) {
      assert.equal(r.status, 429);
      assert.equal(r.corpo.error, "muitos códigos pedidos, aguarde 15 minutos");
    }
    assert.equal(conflitos().filter((l) => l.chave === p.chave).length, 5);
    assert.equal(emailsEnviados.length, antes);
  } finally { desligar(); }
});

Deno.test("desafio_acima_do_limite_e_apagado_e_nao_envia_email", async () => {
  ligar();
  try {
    const p = await pagina();
    for (let i = 0; i < 3; i++) semear(p.chave, 1);
    const antes = emailsEnviados.length;
    const r = await enviar(p.token, CPF_LIVRE, "a@b.com");
    assert.equal(r.status, 429);
    assert.equal(desafios().filter((l) => l.alvo_id === p.chave).length, 3);
    assert.equal(emailsEnviados.length, antes);
  } finally { desligar(); }
});

Deno.test("rajada_paralela_nao_passa_de_3_codigos", async () => {
  ligar();
  try {
    const p = await pagina();
    const antes = emailsEnviados.length;
    const rs = await Promise.all(Array.from({ length: 8 }, () => enviar(p.token, CPF_LIVRE, "a@b.com")));
    const ok = rs.filter((r) => r.status === 200).length;
    assert.ok(ok <= 3);
    assert.equal(desafios().filter((l) => l.alvo_id === p.chave).length, ok);
    assert.equal(emailsEnviados.length - antes, ok);
    assert.ok(rs.every((r) => r.status === 200 || r.status === 429));
  } finally { desligar(); }
});

Deno.test("janela_de_15_min_expira", async () => {
  ligar();
  try {
    const p = await pagina();
    for (let i = 0; i < 3; i++) semear(p.chave, 16);
    assert.equal((await enviar(p.token, CPF_LIVRE, "a@b.com")).status, 200);
  } finally { desligar(); }
});

Deno.test("orcamento_isolado_por_chave", async () => {
  ligar();
  try {
    const p1 = await pagina();
    const p2 = await pagina();
    for (let i = 0; i < 3; i++) semear(p1.chave, 1);
    assert.equal((await enviar(p1.token, CPF_LIVRE, "a@b.com")).status, 429);
    assert.equal((await enviar(p2.token, CPF_LIVRE, "a@b.com")).status, 200);
  } finally { desligar(); }
});
