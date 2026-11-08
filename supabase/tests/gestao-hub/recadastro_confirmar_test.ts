// Recadastro de identidade: confirmação com vínculo, troca do e-mail fictício e reversão (Fase 2b, Tarefa 5).
import assert from "node:assert/strict";
import { A, B, chamar, contaBase, emailsEnviados, sha } from "./hub_bootstrap.ts";

function ligar() { Deno.env.set("GESTAO_RECADASTRO", "1"); }
function desligar() { Deno.env.delete("GESTAO_RECADASTRO"); }
const DIA = 86_400_000;
const pessoas = () => A.tabela("fa_gestao_pessoas");
const vinculos = () => A.tabela("fa_gestao_pessoa_contas");
const conflitos = () => A.tabela("fa_gestao_recadastro_conflitos");
const estado = (chave: string) => A.tabela("fa_gestao_recadastro_estado").find((l) => l.chave === chave);
const usuario = (id: string) => B.usuarios.find((u) => u.id === id)!;
const perfil = (id: string) => B.tabela("profiles").find((l) => l.id === id);
const trocasDeEmail = (id: string) => B.atualizacoesUsuario.filter((a) => a.id === id && a.attrs.email !== undefined);

// Cada teste usa um CPF próprio (válido) para não depender da ordem.
function cpfCom(base9: string): string {
  let d = base9;
  for (const t of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += Number(d[i]) * (t + 1 - i);
    d += String(((soma * 10) % 11) % 10);
  }
  return d;
}
let ic = 0;
const novoCpf = () => cpfCom(String(314159260 + ++ic));

let n = 0;
type Pag = { token: string; chave: string; id: string | null; login: string };
async function pagina(over: { origem?: "clinica" | "rh" | "hub"; login?: string; hubEmail?: string; perfil?: boolean; app_metadata?: Record<string, unknown> } = {}): Promise<Pag> {
  n++;
  const origem = over.origem ?? "clinica";
  const id = origem === "hub" ? null : crypto.randomUUID();
  const login = (over.login ?? (origem === "hub" ? over.hubEmail! : `pessoa${n}@staff.facaamigos.local`)).toLowerCase();
  const chave = origem === "hub" ? `hub:${over.hubEmail}` : `b:${id}`;
  const token = `pagina-confirmar-${n}-${"y".repeat(40)}`;
  A.tabela("fa_gestao_recadastro_tickets").push({
    ticket_hash: `hc-${n}`, chave, origem, auth_user_id: id, hub_email: over.hubEmail ?? null,
    login_email: login, nome: "Fulana", expira_em: new Date().toISOString(),
    pagina_hash: await sha(token), pagina_expira_em: new Date(Date.now() + 600_000).toISOString(),
  });
  if (id) {
    B.usuarios.push({
      id, email: login, app_metadata: over.app_metadata ?? { role: "terapeuta" }, user_metadata: {},
      created_at: new Date().toISOString(), last_sign_in_at: null, banned_until: null,
    });
    if (over.perfil !== false) B.tabela("profiles").push({ id, email: login, cpf: null, role: "terapeuta", active: true, full_name: "Fulana" });
  }
  return { token, chave, id, login };
}

// Pede o código pelo fluxo real e devolve o desafio e o código que chegou no e-mail.
async function pedirCodigo(p: Pag, cpf: string, email: string): Promise<{ challenge_id: string; code: string }> {
  const antes = emailsEnviados.length;
  const r = await chamar("recadastro_enviar_codigo", { pagina: p.token, cpf, email }, null);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const code = /letter-spacing:10px[^>]*>(\d{6})</.exec(emailsEnviados[antes].html)![1];
  return { challenge_id: r.corpo.challenge_id, code };
}
const confirmar = (p: Pag, d: { challenge_id: string; code: string }) =>
  chamar("recadastro_confirmar", { pagina: p.token, challenge_id: d.challenge_id, code: d.code }, null);

function nadaGravado(p: Pag, cpf: string) {
  assert.equal(pessoas().filter((l) => l.cpf === cpf).length, 0, "pessoa não gravada");
  assert.equal(vinculos().filter((l) => l.cpf === cpf).length, 0, "vínculo não gravado");
  assert.ok(!estado(p.chave)?.concluido_em, "não concluído");
}

Deno.test("desligado_sem_identidade", async () => {
  desligar();
  const p = await pagina();
  assert.deepEqual((await chamar("recadastro_confirmar", { pagina: p.token, challenge_id: crypto.randomUUID(), code: "123456" }, null)).corpo, { pendente: false });
  assert.deepEqual((await chamar("recadastro_adiar", { pagina: p.token }, null)).corpo, { pendente: false });
  ligar();
  try {
    assert.equal((await chamar("recadastro_confirmar", { pagina: "nao-existe", challenge_id: crypto.randomUUID(), code: "123456" }, null)).status, 401);
    assert.equal((await chamar("recadastro_adiar", { pagina: "nao-existe" }, null)).status, 401);
  } finally { desligar(); }
});

Deno.test("email_ficticio_vira_real_mesmo_id", async () => {
  ligar();
  try {
    const cpf = novoCpf();
    const p = await pagina();
    const r = await confirmar(p, await pedirCodigo(p, cpf, "ana@real.com"));
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.deepEqual(r.corpo, { ok: true });
    assert.equal(usuario(p.id!).email, "ana@real.com");
    assert.equal(B.usuarios.filter((u) => u.id === p.id).length, 1, "mesmo id, nenhum login novo");
    assert.equal(trocasDeEmail(p.id!)[0].attrs.email_confirm, true);
    const v = vinculos().find((l) => l.auth_user_id === p.id)!;
    assert.equal(v.cpf, cpf);
    assert.equal(v.origem, "clinica");
    assert.equal(v.email_login_antes, p.login);
    assert.equal(pessoas().find((l) => l.cpf === cpf)!.email_real, "ana@real.com");
    assert.equal(perfil(p.id!)!.cpf, cpf);
    assert.equal(perfil(p.id!)!.email, "ana@real.com");
    assert.ok(estado(p.chave)!.concluido_em);
    assert.ok(A.tabela("fa_gestao_auditoria").some((l) => l.evento === "recadastro_concluido" && l.detalhe === p.chave));
  } finally { desligar(); }
});

Deno.test("email_real_nao_muda_e_vira_contato", async () => {
  ligar();
  try {
    const cpf = novoCpf();
    const p = await pagina({ origem: "rh", login: "bruno.rh@grupoib.com.br", perfil: true });
    const r = await confirmar(p, await pedirCodigo(p, cpf, "bruno.pessoal@real.com"));
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal(usuario(p.id!).email, "bruno.rh@grupoib.com.br");
    assert.equal(trocasDeEmail(p.id!).length, 0);
    assert.equal(pessoas().find((l) => l.cpf === cpf)!.email_real, "bruno.pessoal@real.com");
    const v = vinculos().find((l) => l.auth_user_id === p.id)!;
    assert.equal(v.origem, "rh");
    assert.equal(v.email_login_antes, null);
    assert.equal(perfil(p.id!)!.cpf, cpf);
    assert.equal(perfil(p.id!)!.email, "bruno.rh@grupoib.com.br", "e-mail do perfil só muda quando o login muda");
  } finally { desligar(); }
});

Deno.test("rh_nao_escreve_app_metadata", async () => {
  ligar();
  try {
    const cpf = novoCpf();
    const meta = { role: "gestor_rh", escopo: ["loja-1"] };
    const p = await pagina({ origem: "rh", login: "joana@grupoib.internal", perfil: false, app_metadata: meta });
    const r = await confirmar(p, await pedirCodigo(p, cpf, "joana@real.com"));
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal(usuario(p.id!).email, "joana@real.com");
    assert.deepEqual(usuario(p.id!).app_metadata, meta);
    assert.ok(B.atualizacoesUsuario.filter((a) => a.id === p.id).every((a) => !("app_metadata" in a.attrs)));
    assert.equal(perfil(p.id!), undefined, "RH puro não ganha perfil");
  } finally { desligar(); }
});

Deno.test("conta_do_hub_recebe_cpf_sem_renomear_chave", async () => {
  ligar();
  try {
    const cpf = novoCpf();
    const p = await pagina({ login: "carla@staff.facaamigos.local" });
    A.tabela("fa_gestao_contas").push(contaBase({ email: "carla.hub@t.com", email_codigo: "carla.hub@t.com", nome: "Carla", clinica_email: "carla@staff.facaamigos.local" }));
    const r = await confirmar(p, await pedirCodigo(p, cpf, "carla@real.com"));
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    const c = A.tabela("fa_gestao_contas").find((l) => l.nome === "Carla")!;
    assert.equal(c.email, "carla.hub@t.com");
    assert.equal(c.cpf, cpf);
    assert.equal(c.email_codigo, "carla@real.com");

    // Conta do próprio Hub (sessão/página com origem hub)
    const cpf2 = novoCpf();
    A.tabela("fa_gestao_contas").push(contaBase({ email: "dora@t.com", email_codigo: "dora@t.com", nome: "Dora" }));
    const h = await pagina({ origem: "hub", hubEmail: "dora@t.com" });
    const r2 = await confirmar(h, await pedirCodigo(h, cpf2, "dora@real.com"));
    assert.equal(r2.status, 200, JSON.stringify(r2.corpo));
    const d = A.tabela("fa_gestao_contas").find((l) => l.nome === "Dora")!;
    assert.equal(d.email, "dora@t.com");
    assert.equal(d.cpf, cpf2);
    assert.equal(d.email_codigo, "dora@real.com");
    const v = vinculos().find((l) => l.hub_email === "dora@t.com")!;
    assert.equal(v.origem, "hub");
    assert.equal(v.auth_user_id, null);
  } finally { desligar(); }
});

Deno.test("mesma_pessoa_dois_logins_vincula", async () => {
  ligar();
  try {
    const cpf = novoCpf();
    const p = await pagina();
    assert.equal((await confirmar(p, await pedirCodigo(p, cpf, "eva@real.com"))).status, 200);
    A.tabela("fa_gestao_contas").push(contaBase({ email: "eva.hub@t.com", email_codigo: "eva.hub@t.com", nome: "Eva Hub" }));
    const h = await pagina({ origem: "hub", hubEmail: "eva.hub@t.com" });
    const r = await confirmar(h, await pedirCodigo(h, cpf, "Eva@Real.com"));
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal(pessoas().filter((l) => l.cpf === cpf).length, 1);
    assert.equal(vinculos().filter((l) => l.cpf === cpf).length, 2);
    assert.equal(conflitos().filter((l) => l.chave === h.chave).length, 0);
  } finally { desligar(); }
});

Deno.test("troca_de_email_que_colide_nao_grava_nada", async () => {
  ligar();
  try {
    const cpf = novoCpf();
    const p = await pagina();
    const d = await pedirCodigo(p, cpf, "fabi@real.com");
    // Outro login passa a usar o e-mail depois do envio do código e a listagem falha (checagem não vê a colisão).
    B.usuarios.push({ id: crypto.randomUUID(), email: "fabi@real.com", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString(), last_sign_in_at: null, banned_until: null });
    B.operacoesComErro.add("auth.listUsers");
    const r = await confirmar(p, d);
    assert.equal(r.status, 409);
    assert.equal(r.corpo.error, "não foi possível concluir, o responsável foi avisado");
    assert.equal(usuario(p.id!).email, p.login);
    assert.equal(perfil(p.id!)!.cpf, null);
    nadaGravado(p, cpf);
    const c = conflitos().filter((l) => l.chave === p.chave);
    assert.equal(c.length, 1);
    assert.equal(c[0].motivo, "email_de_outro_login");
    assert.ok(A.tabela("fa_gestao_auditoria").some((l) => l.evento === "recadastro_conflito" && String(l.detalhe).startsWith(p.chave)));
  } finally { desligar(); B.operacoesComErro.delete("auth.listUsers"); }
});

Deno.test("confirmar_duas_vezes_nao_duplica", async () => {
  ligar();
  try {
    const cpf = novoCpf();
    const p = await pagina();
    const d = await pedirCodigo(p, cpf, "gabi@real.com");
    assert.equal((await confirmar(p, d)).status, 200);
    const r = await confirmar(p, d);
    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo, { ok: true });
    assert.equal(pessoas().filter((l) => l.cpf === cpf).length, 1);
    assert.equal(vinculos().filter((l) => l.cpf === cpf).length, 1);
    assert.equal(trocasDeEmail(p.id!).length, 1, "troca o e-mail uma vez só");
    assert.equal(A.tabela("fa_gestao_auditoria").filter((l) => l.evento === "recadastro_concluido" && l.detalhe === p.chave).length, 1);
  } finally { desligar(); }
});

Deno.test("codigo_errado_5_vezes_bloqueia", async () => {
  ligar();
  try {
    const cpf = novoCpf();
    const p = await pagina();
    const d = await pedirCodigo(p, cpf, "helo@real.com");
    const errado = d.code === "000000" ? "111111" : "000000";
    let r = { status: 0, corpo: {} as Record<string, unknown> };
    for (let i = 0; i < 5; i++) r = await confirmar(p, { ...d, code: errado });
    assert.equal(r.status, 401);
    assert.equal(r.corpo.reiniciar, true);
    const certo = await confirmar(p, d);
    assert.equal(certo.status, 401);
    assert.equal(certo.corpo.reiniciar, true);
    nadaGravado(p, cpf);
    assert.equal(usuario(p.id!).email, p.login);
  } finally { desligar(); }
});

Deno.test("adiar_so_dentro_do_prazo", async () => {
  ligar();
  try {
    const p = await pagina();
    const r = await chamar("recadastro_adiar", { pagina: p.token }, null);
    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo, { ok: true });
    assert.ok(estado(p.chave)!.adiado_em);
    assert.ok(A.tabela("fa_gestao_auditoria").some((l) => l.evento === "recadastro_adiado" && l.detalhe === p.chave));

    const q = await pagina();
    A.tabela("fa_gestao_recadastro_estado").push({ chave: q.chave, primeiro_aviso_em: new Date(Date.now() - 8 * DIA).toISOString(), concluido_em: null });
    const fora = await chamar("recadastro_adiar", { pagina: q.token }, null);
    assert.equal(fora.status, 409);
    assert.equal(fora.corpo.error, "prazo encerrado");
    assert.ok(!estado(q.chave)!.adiado_em);

    const c = await pagina();
    A.tabela("fa_gestao_recadastro_estado").push({ chave: c.chave, primeiro_aviso_em: new Date(Date.now() - 8 * DIA).toISOString(), concluido_em: new Date().toISOString() });
    const concl = await chamar("recadastro_adiar", { pagina: c.token }, null);
    assert.equal(concl.status, 200);
    assert.deepEqual(concl.corpo, { ok: true });
  } finally { desligar(); }
});

Deno.test("profiles_cpf_duplicado_vira_conflito", async () => {
  ligar();
  B.unicos.profiles = ["cpf"];
  try {
    const cpf = novoCpf();
    const p = await pagina();
    const d = await pedirCodigo(p, cpf, "iara@real.com");
    // Outro perfil grava o mesmo CPF entre a checagem e a gravação.
    B.antesDoUpdate.profiles = () => {
      B.antesDoUpdate.profiles = () => {};
      B.tabela("profiles").push({ id: crypto.randomUUID(), cpf, email: "outro@x.com" });
    };
    const r = await confirmar(p, d);
    assert.equal(r.status, 409);
    assert.equal(r.corpo.error, "não foi possível concluir, o responsável foi avisado");
    nadaGravado(p, cpf);
    assert.equal(usuario(p.id!).email, p.login, "e-mail do login voltou");
    assert.equal(perfil(p.id!)!.cpf, null);
    assert.equal(conflitos().find((l) => l.chave === p.chave)!.motivo, "cpf_de_outra_pessoa");
  } finally {
    desligar();
    delete B.unicos.profiles;
    delete B.antesDoUpdate.profiles;
  }
});

Deno.test("desafio_de_outra_chave_recusado", async () => {
  ligar();
  try {
    const cpf = novoCpf();
    const dono = await pagina();
    const outro = await pagina();
    const d = await pedirCodigo(dono, cpf, "jade@real.com");
    const r = await confirmar(outro, d);
    assert.equal(r.status, 403);
    nadaGravado(outro, cpf);
    nadaGravado(dono, cpf);
    assert.equal(usuario(outro.id!).email, outro.login);
    assert.equal(usuario(dono.id!).email, dono.login);
    // O desafio do dono continua valendo para o próprio dono.
    assert.equal((await confirmar(dono, d)).status, 200);
  } finally { desligar(); }
});

Deno.test("falha_de_gravacao_no_meio_desfaz_tudo", async () => {
  ligar();
  try {
    const cpf = novoCpf();
    const p = await pagina({ login: "lia@staff.facaamigos.local" });
    A.tabela("fa_gestao_contas").push(contaBase({ email: "lia.hub@t.com", email_codigo: "lia.hub@t.com", nome: "Lia", clinica_email: "lia@staff.facaamigos.local" }));
    const d = await pedirCodigo(p, cpf, "lia@real.com");
    A.operacoesComErro.add("update:fa_gestao_contas");
    const r = await confirmar(p, d);
    assert.equal(r.status, 500);
    assert.equal(r.corpo.error, "não foi possível concluir agora");
    assert.equal(usuario(p.id!).email, "lia@staff.facaamigos.local", "e-mail do login voltou");
    assert.equal(perfil(p.id!)!.cpf, null);
    assert.equal(perfil(p.id!)!.email, "lia@staff.facaamigos.local");
    nadaGravado(p, cpf);
    assert.equal(conflitos().filter((l) => l.chave === p.chave).length, 0, "falha técnica não vira conflito");
    const st = await chamar("recadastro_status", { pagina: p.token }, null);
    assert.equal(st.corpo.bloquear, false);
  } finally { desligar(); A.operacoesComErro.delete("update:fa_gestao_contas"); }
});

Deno.test("e_mail_sempre_em_minusculas", async () => {
  ligar();
  try {
    const cpf = novoCpf();
    const p = await pagina({ login: "mel@staff.facaamigos.local" });
    A.tabela("fa_gestao_contas").push(contaBase({ email: "mel.hub@t.com", email_codigo: "mel.hub@t.com", nome: "Mel", clinica_email: "mel@staff.facaamigos.local" }));
    const d = await pedirCodigo(p, cpf, "Mel@Real.COM");
    // Mesmo que o desafio tivesse maiúsculas, nada é gravado com elas.
    A.tabela("fa_gestao_desafios").find((l) => l.id === d.challenge_id)!.email = "Mel@Real.COM";
    const r = await chamar("recadastro_confirmar", { pagina: p.token, challenge_id: d.challenge_id, code: d.code, email: "Outro@X.com", cpf: "39053344705" }, null);
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal(pessoas().find((l) => l.cpf === cpf)!.email_real, "mel@real.com");
    assert.equal(usuario(p.id!).email, "mel@real.com");
    assert.equal(perfil(p.id!)!.email, "mel@real.com");
    assert.equal(A.tabela("fa_gestao_contas").find((l) => l.nome === "Mel")!.email_codigo, "mel@real.com");
    assert.equal(pessoas().filter((l) => l.email_real === "outro@x.com").length, 0, "nunca usa o corpo da requisição");
  } finally { desligar(); }
});
