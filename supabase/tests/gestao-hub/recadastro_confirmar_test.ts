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
    assert.deepEqual(r.corpo, { ok: true, login_trocado: true });
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
    assert.deepEqual(r.corpo, { ok: true, login_trocado: false });
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
    A.tabela("fa_gestao_contas").push(contaBase({ email: "carla.hub@t.com", email_codigo: "carla@staff.facaamigos.local", nome: "Carla", clinica_email: "carla@staff.facaamigos.local" }));
    const r = await confirmar(p, await pedirCodigo(p, cpf, "carla@real.com"));
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    const c = A.tabela("fa_gestao_contas").find((l) => l.nome === "Carla")!;
    assert.equal(c.email, "carla.hub@t.com");
    assert.equal(c.cpf, cpf);
    assert.equal(c.email_codigo, "carla@real.com");
    assert.equal(c.clinica_email, "carla@staff.facaamigos.local");

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
    assert.deepEqual(r.corpo, { ok: true, login_trocado: true }, "clique duplo responde igual ao primeiro");
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
    const d = await pedirCodigo(p, cpf, "lia@real.com");
    A.operacoesComErro.add("upsert:fa_gestao_recadastro_estado");
    const r = await confirmar(p, d);
    A.operacoesComErro.delete("upsert:fa_gestao_recadastro_estado");
    assert.equal(r.status, 500);
    assert.equal(r.corpo.error, "não foi possível concluir agora");
    assert.equal(trocasDeEmail(p.id!)[0].attrs.email, "lia@real.com", "a troca chegou a acontecer");
    assert.equal(usuario(p.id!).email, "lia@staff.facaamigos.local", "e-mail do login voltou");
    assert.equal(perfil(p.id!)!.cpf, null);
    assert.equal(perfil(p.id!)!.email, "lia@staff.facaamigos.local");
    nadaGravado(p, cpf);
    assert.equal(conflitos().filter((l) => l.chave === p.chave).length, 0, "falha técnica não vira conflito");
    const st = await chamar("recadastro_status", { pagina: p.token }, null);
    assert.equal(st.corpo.bloquear, false);
  } finally { desligar(); A.operacoesComErro.delete("upsert:fa_gestao_recadastro_estado"); }
});

Deno.test("e_mail_sempre_em_minusculas", async () => {
  ligar();
  try {
    const cpf = novoCpf();
    const p = await pagina({ login: "mel@staff.facaamigos.local" });
    const d = await pedirCodigo(p, cpf, "Mel@Real.COM");
    // Mesmo que o desafio tivesse maiúsculas, nada é gravado com elas.
    A.tabela("fa_gestao_desafios").find((l) => l.id === d.challenge_id)!.email = "Mel@Real.COM";
    const r = await chamar("recadastro_confirmar", { pagina: p.token, challenge_id: d.challenge_id, code: d.code, email: "Outro@X.com", cpf: "39053344705" }, null);
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal(pessoas().find((l) => l.cpf === cpf)!.email_real, "mel@real.com");
    assert.equal(usuario(p.id!).email, "mel@real.com");
    assert.equal(perfil(p.id!)!.email, "mel@real.com");
    assert.equal(pessoas().filter((l) => l.email_real === "outro@x.com").length, 0, "nunca usa o corpo da requisição");

    const cpf2 = novoCpf();
    const q = await pagina({ login: "nina@staff.facaamigos.local" });
    A.tabela("fa_gestao_contas").push(contaBase({ email: "nina.hub@t.com", email_codigo: "nina@staff.facaamigos.local", nome: "Nina", clinica_email: "nina@staff.facaamigos.local" }));
    const d2 = await pedirCodigo(q, cpf2, "Nina@Real.COM");
    assert.equal((await confirmar(q, d2)).status, 200);
    assert.equal(A.tabela("fa_gestao_contas").find((l) => l.nome === "Nina")!.email_codigo, "nina@real.com");
    assert.equal(pessoas().find((l) => l.cpf === cpf2)!.email_real, "nina@real.com");
  } finally { desligar(); }
});

Deno.test("conta_ligada_ao_hub_nao_troca_o_login", async () => {
  ligar();
  try {
    const cpf = novoCpf();
    const p = await pagina({ login: "olga@staff.facaamigos.local" });
    A.tabela("fa_gestao_contas").push(contaBase({ email: "olga.hub@t.com", email_codigo: "olga@staff.facaamigos.local", nome: "Olga", clinica_email: "olga@staff.facaamigos.local" }));
    const r = await confirmar(p, await pedirCodigo(p, cpf, "olga@real.com"));
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal(usuario(p.id!).email, "olga@staff.facaamigos.local");
    assert.equal(trocasDeEmail(p.id!).length, 0);
    assert.equal(pessoas().find((l) => l.cpf === cpf)!.email_real, "olga@real.com");
    const c = A.tabela("fa_gestao_contas").find((l) => l.nome === "Olga")!;
    assert.equal(c.email, "olga.hub@t.com");
    assert.equal(c.cpf, cpf);
    assert.equal(c.email_codigo, "olga@real.com");
    assert.equal(c.clinica_email, "olga@staff.facaamigos.local");
    assert.equal(perfil(p.id!)!.cpf, cpf);
    assert.equal(perfil(p.id!)!.email, "olga@staff.facaamigos.local");
    assert.equal(vinculos().find((l) => l.auth_user_id === p.id)!.email_login_antes, null);
    assert.ok(estado(p.chave)!.concluido_em);
  } finally { desligar(); }
});

Deno.test("launch_da_clinica_continua_achando_o_usuario_e_nao_cria_outro", async () => {
  ligar();
  try {
    const cpf = novoCpf();
    const p = await pagina({ login: "paula@staff.facaamigos.local" });
    A.tabela("fa_gestao_contas").push(contaBase({ email: "paula.hub@t.com", email_codigo: "paula.hub@t.com", nome: "Paula", papel: "owner", clinica_email: "paula@staff.facaamigos.local" }));
    const tokenPaula = "c".repeat(64);
    A.tabela("fa_gestao_sessoes").push({ token_hash: await sha(tokenPaula), email: "paula.hub@t.com", expires_at: new Date(Date.now() + 3600_000).toISOString() });
    assert.equal((await confirmar(p, await pedirCodigo(p, cpf, "paula@real.com"))).status, 200);
    const antes = B.usuarios.length;
    const criacoes = B.chamadas.filter((c) => c === "auth.createUser").length;
    const l = await chamar("launch", { app: "clinica" }, tokenPaula);
    assert.equal(l.status, 200, JSON.stringify(l.corpo));
    assert.equal(B.usuarios.length, antes, "nenhum login novo no projeto B");
    assert.equal(B.chamadas.filter((c) => c === "auth.createUser").length, criacoes);
    assert.equal(B.usuarios.filter((u) => u.email === "paula@staff.facaamigos.local").length, 1);
  } finally { desligar(); }
});

Deno.test("consulta_do_hub_com_erro_nao_troca_o_login", async () => {
  ligar();
  try {
    const cpf = novoCpf();
    const p = await pagina({ login: "rita@staff.facaamigos.local" });
    const d = await pedirCodigo(p, cpf, "rita@real.com");
    A.operacoesComErro.add("select:fa_gestao_contas");
    const r = await confirmar(p, d);
    A.operacoesComErro.delete("select:fa_gestao_contas");
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal(usuario(p.id!).email, "rita@staff.facaamigos.local");
    assert.equal(trocasDeEmail(p.id!).length, 0);
    assert.equal(pessoas().find((l) => l.cpf === cpf)!.email_real, "rita@real.com");
    assert.ok(estado(p.chave)!.concluido_em);
  } finally { desligar(); A.operacoesComErro.delete("select:fa_gestao_contas"); }
});

Deno.test("falha_ao_reverter_login_mantem_consistencia_e_registra", async () => {
  ligar();
  try {
    const cpf = novoCpf();
    const p = await pagina({ login: "sara@staff.facaamigos.local" });
    const d = await pedirCodigo(p, cpf, "sara@real.com");
    A.operacoesComErro.add("upsert:fa_gestao_recadastro_estado");
    B.aoAtualizarUsuario = (_id, attrs) => attrs.email === "sara@staff.facaamigos.local" ? { aplica: false, erro: "timeout" } : undefined;
    const r = await confirmar(p, d);
    A.operacoesComErro.delete("upsert:fa_gestao_recadastro_estado");
    B.aoAtualizarUsuario = null;
    assert.equal(r.status, 500);
    assert.equal(usuario(p.id!).email, "sara@real.com", "a volta falhou: o login segue com o e-mail real");
    assert.equal(perfil(p.id!)!.email, "sara@real.com", "perfil consistente com o login");
    const v = vinculos().find((l) => l.auth_user_id === p.id);
    assert.ok(v, "vínculo mantido");
    assert.equal(v!.email_login_antes, "sara@staff.facaamigos.local");
    assert.ok(pessoas().some((l) => l.cpf === cpf), "pessoa mantida (o vínculo depende dela)");
    assert.ok(!estado(p.chave)?.concluido_em);
    const aud = A.tabela("fa_gestao_auditoria").find((l) => l.evento === "recadastro_reversao_falhou");
    assert.ok(aud);
    assert.ok(String(aud!.detalhe).includes(p.chave) && String(aud!.detalhe).includes("sara@staff.facaamigos.local"));
  } finally { desligar(); A.operacoesComErro.delete("upsert:fa_gestao_recadastro_estado"); B.aoAtualizarUsuario = null; }
});

Deno.test("erro_ambiguo_no_updateUser_volta_o_login", async () => {
  ligar();
  try {
    const cpf = novoCpf();
    const p = await pagina({ login: "tina@staff.facaamigos.local" });
    const d = await pedirCodigo(p, cpf, "tina@real.com");
    // O GoTrue grava a troca, mas a resposta chega como erro (timeout/5xx).
    B.aoAtualizarUsuario = (_id, attrs) => attrs.email === "tina@real.com" ? { aplica: true, erro: "AuthRetryableFetchError: 504" } : undefined;
    const r = await confirmar(p, d);
    B.aoAtualizarUsuario = null;
    assert.equal(r.status, 500);
    assert.equal(usuario(p.id!).email, "tina@staff.facaamigos.local", "login voltou ao e-mail antigo");
    assert.equal(perfil(p.id!)!.email, "tina@staff.facaamigos.local");
    nadaGravado(p, cpf);
  } finally { desligar(); B.aoAtualizarUsuario = null; }
});

Deno.test("vinculo_existente_sem_concluido_nao_duplica", async () => {
  ligar();
  try {
    const cpf = novoCpf();
    const p = await pagina({ login: "vera@staff.facaamigos.local" });
    assert.equal((await confirmar(p, await pedirCodigo(p, cpf, "vera@real.com"))).status, 200);
    // Estado volta a pendente (ex.: owner reabriu): segunda confirmação passa pelo ramo "vínculo já existe".
    estado(p.chave)!.concluido_em = null;
    const r = await confirmar(p, await pedirCodigo(p, cpf, "vera@real.com"));
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal(pessoas().filter((l) => l.cpf === cpf).length, 1);
    assert.equal(vinculos().filter((l) => l.cpf === cpf).length, 1);
    assert.equal(vinculos().find((l) => l.auth_user_id === p.id)!.email_login_antes, "vera@staff.facaamigos.local");
    assert.equal(trocasDeEmail(p.id!).length, 1, "troca o e-mail do login uma vez só");
    assert.equal(usuario(p.id!).email, "vera@real.com");
    assert.ok(estado(p.chave)!.concluido_em);
  } finally { desligar(); }
});

Deno.test("erro_ambiguo_e_volta_falha_perfil_acompanha_login", async () => {
  ligar();
  try {
    const cpf = novoCpf();
    const p = await pagina({ login: "ugo@staff.facaamigos.local" });
    const d = await pedirCodigo(p, cpf, "ugo@real.com");
    // A troca é gravada mas responde erro; a volta também falha.
    B.aoAtualizarUsuario = (_id, attrs) =>
      attrs.email === "ugo@real.com" ? { aplica: true, erro: "AuthRetryableFetchError: 504" }
      : attrs.email === "ugo@staff.facaamigos.local" ? { aplica: false, erro: "timeout" } : undefined;
    const r = await confirmar(p, d);
    B.aoAtualizarUsuario = null;
    assert.equal(r.status, 500);
    assert.equal(usuario(p.id!).email, "ugo@real.com");
    assert.equal(perfil(p.id!)!.email, "ugo@real.com", "perfil acompanha o login");
    assert.equal(vinculos().find((l) => l.auth_user_id === p.id)!.email_login_antes, "ugo@staff.facaamigos.local");
    assert.ok(pessoas().some((l) => l.cpf === cpf));
    assert.ok(!estado(p.chave)?.concluido_em);
    assert.ok(A.tabela("fa_gestao_auditoria").some((l) => l.evento === "recadastro_reversao_falhou" && String(l.detalhe).includes(p.chave)));
  } finally { desligar(); B.aoAtualizarUsuario = null; }
});

Deno.test("falha_no_perfil_e_volta_falha_perfil_acompanha_login", async () => {
  ligar();
  try {
    const cpf = novoCpf();
    const p = await pagina({ login: "vivi@staff.facaamigos.local" });
    const d = await pedirCodigo(p, cpf, "vivi@real.com");
    B.operacoesComErro.add("select:profiles");
    B.aoAtualizarUsuario = (_id, attrs) => attrs.email === "vivi@staff.facaamigos.local" ? { aplica: false, erro: "timeout" } : undefined;
    const r = await confirmar(p, d);
    B.operacoesComErro.delete("select:profiles");
    B.aoAtualizarUsuario = null;
    assert.equal(r.status, 500);
    assert.equal(usuario(p.id!).email, "vivi@real.com");
    assert.equal(perfil(p.id!)!.email, "vivi@real.com", "perfil acompanha o login");
    assert.equal(perfil(p.id!)!.cpf, null, "cpf do perfil não é gravado");
    assert.equal(vinculos().find((l) => l.auth_user_id === p.id)!.email_login_antes, "vivi@staff.facaamigos.local");
    assert.ok(!estado(p.chave)?.concluido_em);
    assert.ok(A.tabela("fa_gestao_auditoria").some((l) => l.evento === "recadastro_reversao_falhou" && String(l.detalhe).includes(p.chave)));
  } finally { desligar(); B.operacoesComErro.delete("select:profiles"); B.aoAtualizarUsuario = null; }
});

Deno.test("falha_depois_da_conta_do_hub_volta_cpf_e_email_codigo", async () => {
  ligar();
  try {
    const cpf = novoCpf();
    const p = await pagina({ login: "xena@staff.facaamigos.local" });
    A.tabela("fa_gestao_contas").push(contaBase({ email: "xena.hub@t.com", email_codigo: "xena@staff.facaamigos.local", nome: "Xena", clinica_email: "xena@staff.facaamigos.local" }));
    const d = await pedirCodigo(p, cpf, "xena@real.com");
    A.operacoesComErro.add("upsert:fa_gestao_recadastro_estado");
    const r = await confirmar(p, d);
    A.operacoesComErro.delete("upsert:fa_gestao_recadastro_estado");
    assert.equal(r.status, 500);
    const c = A.tabela("fa_gestao_contas").find((l) => l.nome === "Xena")!;
    assert.equal(c.cpf, null);
    assert.equal(c.email_codigo, "xena@staff.facaamigos.local");
    assert.equal(perfil(p.id!)!.cpf, null);
    nadaGravado(p, cpf);
  } finally { desligar(); A.operacoesComErro.delete("upsert:fa_gestao_recadastro_estado"); }
});

// ---------- Correção final (Ruling 12): CPF já preenchido nunca é sobrescrito; e-mail de código só em vazio/fictício/igual ao login ----------
const conta = (nome: string) => A.tabela("fa_gestao_contas").find((l) => l.nome === nome)!;

Deno.test("conta_do_hub_com_cpf_diferente_vira_conflito_e_nada_gravado", async () => {
  ligar();
  try {
    const cpf = novoCpf();
    const cpfDono = novoCpf();
    const p = await pagina({ origem: "rh", login: "zeca@grupoib.com.br" });
    A.tabela("fa_gestao_contas").push(contaBase({ email: "dono.hub@t.com", email_codigo: "zeca@grupoib.internal", nome: "Dono", papel: "owner", rh_email: "zeca@grupoib.com.br", cpf: cpfDono }));
    const r = await confirmar(p, await pedirCodigo(p, cpf, "invasor@real.com"));
    assert.equal(r.status, 409, JSON.stringify(r.corpo));
    assert.equal(r.corpo.error, "não foi possível concluir, o responsável foi avisado");
    const c = conta("Dono");
    assert.equal(c.cpf, cpfDono, "cpf da conta do Hub não muda");
    assert.equal(c.email_codigo, "zeca@grupoib.internal", "e-mail de código não muda");
    assert.equal(perfil(p.id!)!.cpf, null);
    assert.equal(usuario(p.id!).email, "zeca@grupoib.com.br");
    nadaGravado(p, cpf);
    assert.equal(conflitos().find((l) => l.chave === p.chave)!.motivo, "cpf_de_outra_pessoa");
  } finally { desligar(); }
});

Deno.test("conta_do_hub_com_email_codigo_real_distinto_fica_intacta", async () => {
  ligar();
  try {
    // (a) cpf nulo e e-mail de código real de outra caixa: nada da conta muda, o e-mail fica só como contato.
    const cpf = novoCpf();
    const p = await pagina({ origem: "rh", login: "yara@grupoib.com.br" });
    A.tabela("fa_gestao_contas").push(contaBase({ email: "yara.hub@t.com", email_codigo: "yara.dona@real.com", nome: "Yara", papel: "owner", rh_email: "yara@grupoib.com.br" }));
    const r = await confirmar(p, await pedirCodigo(p, cpf, "yara.outra@real.com"));
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal(conta("Yara").email_codigo, "yara.dona@real.com");
    assert.equal(conta("Yara").cpf, null, "sem caixa confirmada, o CPF também não entra na conta do Hub");
    assert.equal(pessoas().find((l) => l.cpf === cpf)!.email_real, "yara.outra@real.com");
    assert.ok(estado(p.chave)!.concluido_em);

    // (b) cpf igual já preenchido: não reescreve o cpf e não troca o e-mail de código real.
    const cpf2 = novoCpf();
    const q = await pagina({ origem: "rh", login: "zuza@grupoib.com.br" });
    A.tabela("fa_gestao_contas").push(contaBase({ email: "zuza.hub@t.com", email_codigo: "zuza.dona@real.com", nome: "Zuza", rh_email: "zuza@grupoib.com.br", cpf: cpf2 }));
    const atualizacoes = () => A.chamadas.filter((c) => c === "update:fa_gestao_contas").length;
    const antes = atualizacoes();
    const r2 = await confirmar(q, await pedirCodigo(q, cpf2, "zuza.nova@real.com"));
    assert.equal(r2.status, 200, JSON.stringify(r2.corpo));
    assert.equal(conta("Zuza").cpf, cpf2);
    assert.equal(conta("Zuza").email_codigo, "zuza.dona@real.com");
    assert.equal(atualizacoes(), antes, "conta do Hub nem é tocada");
  } finally { desligar(); }
});

Deno.test("conta_do_hub_com_cpf_nulo_e_email_codigo_ficticio_vazio_ou_igual_ao_login_preenche", async () => {
  ligar();
  try {
    const casos: Array<[string, string, string | null]> = [
      ["Fic", "fic@staff.facaamigos.local", "fic.velho@grupoib.internal"],
      ["Vaz", "vaz@staff.facaamigos.local", null],
      ["Igu", "igu@grupoib.com.br", "igu@grupoib.com.br"],
    ];
    for (const [nome, login, emailCodigo] of casos) {
      const cpf = novoCpf();
      const p = await pagina({ origem: "rh", login });
      A.tabela("fa_gestao_contas").push(contaBase({ email: `${nome.toLowerCase()}.hub@t.com`, email_codigo: emailCodigo, nome, rh_email: login }));
      const r = await confirmar(p, await pedirCodigo(p, cpf, `${nome.toLowerCase()}@real.com`));
      assert.equal(r.status, 200, JSON.stringify(r.corpo));
      assert.equal(conta(nome).cpf, cpf, nome);
      assert.equal(conta(nome).email_codigo, `${nome.toLowerCase()}@real.com`, nome);
      assert.equal(conta(nome).email, `${nome.toLowerCase()}.hub@t.com`, "a chave não é renomeada");
    }
  } finally { desligar(); }
});

Deno.test("perfil_com_cpf_diferente_vira_conflito_e_nada_gravado", async () => {
  ligar();
  try {
    const cpf = novoCpf();
    const cpfAntigo = novoCpf();
    const p = await pagina({ login: "wil@staff.facaamigos.local" });
    perfil(p.id!)!.cpf = cpfAntigo.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
    const r = await confirmar(p, await pedirCodigo(p, cpf, "wil@real.com"));
    assert.equal(r.status, 409, JSON.stringify(r.corpo));
    assert.equal(perfil(p.id!)!.cpf, cpfAntigo.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4"), "cpf do perfil não muda");
    assert.equal(usuario(p.id!).email, "wil@staff.facaamigos.local", "login não é trocado");
    assert.equal(trocasDeEmail(p.id!).length, 0);
    nadaGravado(p, cpf);
    assert.equal(conflitos().find((l) => l.chave === p.chave)!.motivo, "cpf_de_outra_pessoa");

    // Mesmo CPF já gravado com máscara: segue e não reescreve.
    const cpf2 = novoCpf();
    const q = await pagina({ login: "wal@staff.facaamigos.local" });
    const mascarado = cpf2.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
    perfil(q.id!)!.cpf = mascarado;
    const r2 = await confirmar(q, await pedirCodigo(q, cpf2, "wal@real.com"));
    assert.equal(r2.status, 200, JSON.stringify(r2.corpo));
    assert.equal(perfil(q.id!)!.cpf, mascarado);
    assert.equal(perfil(q.id!)!.email, "wal@real.com", "e-mail do perfil acompanha a troca do login");
  } finally { desligar(); }
});

Deno.test("conflito_e_gravado_mesmo_se_a_checagem_de_duplicado_falhar", async () => {
  ligar();
  try {
    const cpf = novoCpf();
    const p = await pagina();
    const d = await pedirCodigo(p, cpf, "kiko@real.com");
    // Outra pessoa confirma o mesmo CPF entre o envio do código e a confirmação.
    pessoas().push({ cpf, email_real: "dono.do.cpf@real.com", nome: "Dono" });
    A.operacoesComErro.add("select-linhas:fa_gestao_recadastro_conflitos");
    const r = await confirmar(p, d);
    A.operacoesComErro.delete("select-linhas:fa_gestao_recadastro_conflitos");
    assert.equal(r.status, 409);
    assert.equal(conflitos().filter((l) => l.chave === p.chave).length, 1, "conflito gravado");
  } finally { desligar(); A.operacoesComErro.delete("select-linhas:fa_gestao_recadastro_conflitos"); }
});

Deno.test("conta_do_proprio_hub_recebe_cpf_mas_nao_troca_email_codigo_real_distinto", async () => {
  ligar();
  try {
    // Origem Hub: quem confirma é o dono da sessão da própria conta, então o CPF entra; o destino do código não muda.
    const cpf = novoCpf();
    A.tabela("fa_gestao_contas").push(contaBase({ email: "hugo@t.com", email_codigo: "hugo.pessoal@real.com", nome: "Hugo" }));
    const h = await pagina({ origem: "hub", hubEmail: "hugo@t.com" });
    const r = await confirmar(h, await pedirCodigo(h, cpf, "hugo.novo@real.com"));
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal(conta("Hugo").cpf, cpf);
    assert.equal(conta("Hugo").email_codigo, "hugo.pessoal@real.com");
    assert.equal(r.corpo.login_trocado, false);
  } finally { desligar(); }
});
