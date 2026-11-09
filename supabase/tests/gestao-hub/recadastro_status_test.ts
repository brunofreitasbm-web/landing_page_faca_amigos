// Recadastro de identidade: status, prazo de 7 dias e identificação (Fase 2b).
// Rodar: deno test --no-check --config supabase/tests/gestao-hub/deno.json --allow-env --allow-net=none supabase/tests/gestao-hub
import assert from "node:assert/strict";
import { A, B, TOKEN_GERENTE, TOKEN_OWNER, chamar, contaBase } from "./hub_bootstrap.ts";

const DIA = 86_400_000;
const antes = (dias: number) => new Date(Date.now() - dias * DIA - 60_000).toISOString();
const estado = (chave: string) => A.tabela("fa_gestao_recadastro_estado").find((l) => l.chave === chave);

function ligar() { Deno.env.set("GESTAO_RECADASTRO", "1"); }
function desligar() { Deno.env.delete("GESTAO_RECADASTRO"); }

let n = 0;
function usuarioB(over: { role?: string; app_role?: string; banido?: boolean; ativo?: boolean; nome?: string } = {}) {
  const id = crypto.randomUUID();
  const jwt = `jwt-${++n}`;
  B.usuarios.push({
    id, email: `u${n}@fake.local`, app_metadata: over.app_role ? { role: over.app_role } : {},
    user_metadata: {}, created_at: new Date().toISOString(), last_sign_in_at: null,
    banned_until: over.banido ? new Date(Date.now() + DIA).toISOString() : null,
  });
  B.tokens[jwt] = id;
  B.tabela("profiles").push({ id, role: over.role ?? "terapeuta", active: over.ativo ?? true, full_name: over.nome ?? "Fulana" });
  return { id, jwt };
}
const status = (jwt: string, sistema: unknown = "clinica", extra: Record<string, unknown> = {}) =>
  chamar("recadastro_status", { sistema, ...extra }, jwt);

Deno.test("desligado_responde_nao_pendente", async () => {
  desligar();
  const u = usuarioB();
  const r = await status(u.jwt);
  assert.equal(r.status, 200);
  assert.deepEqual(r.corpo, { pendente: false, bloquear: false, dias_restantes: 7 });
  assert.equal(estado(`b:${u.id}`), undefined);
});

Deno.test("jwt_de_outro_projeto_ou_quiosque_ou_banido_recusado", async () => {
  ligar();
  try {
    const invalido = await status("jwt-que-nao-existe");
    assert.equal(invalido.status, 401);
    const semSistema = await status(usuarioB().jwt, "");
    assert.equal(semSistema.status, 401);
    const sistemaErrado = await status(usuarioB().jwt, "playground");
    assert.equal(sistemaErrado.status, 401);
    const isentos = [
      usuarioB({ app_role: "terapeuta_unit" }), usuarioB({ app_role: "intern" }), usuarioB({ role: "responsavel" }),
      usuarioB({ banido: true }), usuarioB({ ativo: false }),
    ];
    for (const u of isentos) {
      const r = await status(u.jwt);
      assert.equal(r.status, 200);
      assert.deepEqual(r.corpo, { pendente: false, bloquear: false, dias_restantes: 7 });
      assert.equal(estado(`b:${u.id}`), undefined);
    }
  } finally { desligar(); }
});

Deno.test("primeira_consulta_cria_estado_e_diz_7_dias", async () => {
  ligar();
  try {
    const u = usuarioB();
    const r = await status(u.jwt, "rh");
    assert.deepEqual(r.corpo, { pendente: true, bloquear: false, dias_restantes: 7 });
    const e = estado(`b:${u.id}`);
    assert.ok(e?.primeiro_aviso_em);
    const r2 = await status(u.jwt, "rh");
    assert.equal(r2.corpo.dias_restantes, 7);
    assert.equal(A.tabela("fa_gestao_recadastro_estado").filter((l) => l.chave === `b:${u.id}`).length, 1);
  } finally { desligar(); }
});

Deno.test("dia_6_ainda_adia", async () => {
  ligar();
  try {
    const u = usuarioB();
    A.tabela("fa_gestao_recadastro_estado").push({ chave: `b:${u.id}`, primeiro_aviso_em: antes(6) });
    const r = await status(u.jwt);
    assert.deepEqual(r.corpo, { pendente: true, bloquear: false, dias_restantes: 1 });
  } finally { desligar(); }
});

Deno.test("dia_7_e_dia_8_bloqueiam", async () => {
  ligar();
  try {
    for (const dias of [7, 8]) {
      const u = usuarioB();
      A.tabela("fa_gestao_recadastro_estado").push({ chave: `b:${u.id}`, primeiro_aviso_em: antes(dias) });
      const r = await status(u.jwt);
      assert.deepEqual(r.corpo, { pendente: true, bloquear: true, dias_restantes: 0 });
    }
  } finally { desligar(); }
});

Deno.test("conflito_aberto_nunca_bloqueia", async () => {
  ligar();
  try {
    const u = usuarioB();
    A.tabela("fa_gestao_recadastro_estado").push({ chave: `b:${u.id}`, primeiro_aviso_em: antes(30) });
    A.tabela("fa_gestao_recadastro_conflitos").push({ chave: `b:${u.id}`, motivo: "cpf_de_outra_pessoa", resolvido_em: null });
    const r = await status(u.jwt);
    assert.deepEqual(r.corpo, { pendente: true, bloquear: false, dias_restantes: 0 });
  } finally { desligar(); }
});

Deno.test("ja_concluido_nao_pendente", async () => {
  ligar();
  try {
    const u = usuarioB();
    A.tabela("fa_gestao_recadastro_estado").push({ chave: `b:${u.id}`, primeiro_aviso_em: antes(30), concluido_em: antes(1) });
    const r = await status(u.jwt);
    assert.deepEqual(r.corpo, { pendente: false, bloquear: false, dias_restantes: 7 });
  } finally { desligar(); }
});

Deno.test("pagina_valida_identifica_sem_jwt", async () => {
  ligar();
  try {
    const u = usuarioB();
    const codigo = `pag-${crypto.randomUUID()}`;
    const { sha } = await import("./hub_bootstrap.ts");
    A.tabela("fa_gestao_recadastro_tickets").push({
      ticket_hash: `t-${codigo}`, chave: `b:${u.id}`, origem: "clinica", auth_user_id: u.id, hub_email: null,
      login_email: "x@fake.local", nome: "Fulana", expira_em: new Date(Date.now() + DIA).toISOString(),
      pagina_hash: await sha(codigo), pagina_expira_em: new Date(Date.now() + 3600_000).toISOString(),
    });
    const ok = await chamar("recadastro_status", { pagina: codigo }, null);
    assert.equal(ok.status, 200);
    assert.equal(ok.corpo.pendente, true);
    assert.ok(estado(`b:${u.id}`));
    A.tabela("fa_gestao_recadastro_tickets").at(-1)!.pagina_expira_em = antes(1);
    const vencida = await chamar("recadastro_status", { pagina: codigo }, null);
    assert.equal(vencida.status, 401);
  } finally { desligar(); }
});

Deno.test("me_do_hub_traz_recadastro", async () => {
  ligar();
  try {
    A.tabela("fa_gestao_recadastro_estado").push({ chave: "hub:gerente@t.com", primeiro_aviso_em: antes(8) });
    const r = await chamar("me", {}, TOKEN_GERENTE);
    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo.recadastro, { pendente: true, bloquear: true, dias_restantes: 0 });
    const viaAcao = await chamar("recadastro_status", {}, TOKEN_GERENTE);
    assert.deepEqual(viaAcao.corpo, { pendente: true, bloquear: true, dias_restantes: 0 });
    desligar();
    const off = await chamar("me", {}, TOKEN_OWNER);
    assert.deepEqual(off.corpo.recadastro, { pendente: false, bloquear: false, dias_restantes: 7 });
  } finally { desligar(); }
});

Deno.test("conta_hub_inativa_e_isenta", async () => {
  ligar();
  try {
    const { sha } = await import("./hub_bootstrap.ts");
    A.tabela("fa_gestao_contas").push(contaBase({ email: "off@t.com", ativo: false }));
    const tok = "c".repeat(64);
    A.tabela("fa_gestao_sessoes").push({ token_hash: await sha(tok), email: "off@t.com", expires_at: new Date(Date.now() + 3600_000).toISOString() });
    const r = await chamar("recadastro_status", {}, tok);
    assert.deepEqual(r.corpo, { pendente: false, bloquear: false, dias_restantes: 7 });
    assert.equal(estado("hub:off@t.com"), undefined);
  } finally { desligar(); }
});

Deno.test("erro_de_leitura_do_estado_nao_bloqueia_nem_reescreve_a_data", async () => {
  ligar();
  try {
    const u = usuarioB();
    const velha = antes(8);
    A.tabela("fa_gestao_recadastro_estado").push({ chave: `b:${u.id}`, primeiro_aviso_em: velha });
    A.operacoesComErro.add("select:fa_gestao_recadastro_estado");
    const r = await status(u.jwt);
    A.operacoesComErro.delete("select:fa_gestao_recadastro_estado");
    // Erro de leitura nunca deixa pendente (senão o Hub abre o recadastro e a pessoa fica presa).
    assert.deepEqual(r.corpo, { pendente: false, bloquear: false, dias_restantes: 7 });
    assert.equal(estado(`b:${u.id}`)!.primeiro_aviso_em, velha);
    const depois = await status(u.jwt);
    assert.deepEqual(depois.corpo, { pendente: true, bloquear: true, dias_restantes: 0 });
  } finally { A.operacoesComErro.delete("select:fa_gestao_recadastro_estado"); desligar(); }
});

Deno.test("erro_na_consulta_de_conflitos_nao_bloqueia", async () => {
  ligar();
  try {
    const u = usuarioB();
    A.tabela("fa_gestao_recadastro_estado").push({ chave: `b:${u.id}`, primeiro_aviso_em: antes(8) });
    A.operacoesComErro.add("select:fa_gestao_recadastro_conflitos");
    const r = await status(u.jwt);
    assert.equal(r.corpo.pendente, true);
    assert.equal(r.corpo.bloquear, false);
  } finally { A.operacoesComErro.delete("select:fa_gestao_recadastro_conflitos"); desligar(); }
});

Deno.test("segunda_consulta_nao_muda_primeiro_aviso_em", async () => {
  ligar();
  try {
    const u = usuarioB();
    await status(u.jwt);
    const primeiro = estado(`b:${u.id}`)!.primeiro_aviso_em;
    await new Promise((res) => setTimeout(res, 5));
    await status(u.jwt);
    assert.equal(estado(`b:${u.id}`)!.primeiro_aviso_em, primeiro);
  } finally { desligar(); }
});

// ---------- Correção final: I1 (erro de leitura) e I4 (adiado e conta do Hub com CPF) ----------
async function contaHub(email: string, over: Record<string, unknown> = {}) {
  const { sha } = await import("./hub_bootstrap.ts");
  A.tabela("fa_gestao_contas").push(contaBase({ email, email_codigo: email, nome: "Conta " + email, ...over }));
  const tok = Array.from(crypto.getRandomValues(new Uint8Array(32))).map((b) => b.toString(16).padStart(2, "0")).join("");
  A.tabela("fa_gestao_sessoes").push({ token_hash: await sha(tok), email, expires_at: new Date(Date.now() + 3600_000).toISOString() });
  return tok;
}

Deno.test("me_com_erro_de_leitura_do_estado_nao_fica_pendente", async () => {
  ligar();
  try {
    const tok = await contaHub("leitura@t.com");
    A.operacoesComErro.add("select:fa_gestao_recadastro_estado");
    const r = await chamar("me", {}, tok);
    A.operacoesComErro.delete("select:fa_gestao_recadastro_estado");
    assert.equal(r.status, 200);
    assert.equal(r.corpo.recadastro.pendente, false);
    assert.equal(r.corpo.recadastro.bloquear, false);
    A.operacoesComErro.add("upsert:fa_gestao_recadastro_estado");
    const r2 = await chamar("me", {}, tok);
    A.operacoesComErro.delete("upsert:fa_gestao_recadastro_estado");
    assert.equal(r2.corpo.recadastro.pendente, false, "falha ao criar o estado também não deixa pendente");
  } finally { A.operacoesComErro.delete("select:fa_gestao_recadastro_estado"); A.operacoesComErro.delete("upsert:fa_gestao_recadastro_estado"); desligar(); }
});

Deno.test("adiado_ha_pouco_nao_reabre_a_cada_carga", async () => {
  ligar();
  try {
    const tok = await contaHub("adia@t.com");
    const primeira = await chamar("me", {}, tok);
    assert.equal(primeira.corpo.recadastro.pendente, true);
    const adiar = await chamar("recadastro_adiar", {}, tok);
    assert.equal(adiar.status, 200, JSON.stringify(adiar.corpo));
    const recarga = await chamar("me", {}, tok);
    assert.deepEqual(recarga.corpo.recadastro, { pendente: false, bloquear: false, dias_restantes: 7 });
    // Passadas 12 horas, volta a pedir.
    estado("hub:adia@t.com")!.adiado_em = new Date(Date.now() - 13 * 3600_000).toISOString();
    const depois = await chamar("me", {}, tok);
    assert.equal(depois.corpo.recadastro.pendente, true);
    // Prazo vencido: adiamento recente não impede o bloqueio.
    estado("hub:adia@t.com")!.primeiro_aviso_em = antes(8);
    estado("hub:adia@t.com")!.adiado_em = new Date().toISOString();
    const vencido = await chamar("me", {}, tok);
    assert.deepEqual(vencido.corpo.recadastro, { pendente: true, bloquear: true, dias_restantes: 0 });
  } finally { desligar(); }
});

Deno.test("conta_do_hub_com_cpf_ja_preenchido_conta_como_concluida", async () => {
  ligar();
  try {
    // CPF gravado na conta (recadastro pela sessão do Hub ou pelo owner), mesmo sem o estado concluído.
    const tok = await contaHub("comcpf@t.com", { cpf: "52998224725" });
    A.tabela("fa_gestao_recadastro_estado").push({ chave: "hub:comcpf@t.com", primeiro_aviso_em: antes(8) });
    const r = await chamar("me", {}, tok);
    assert.deepEqual(r.corpo.recadastro, { pendente: false, bloquear: false, dias_restantes: 7 });
    const viaAcao = await chamar("recadastro_status", {}, tok);
    assert.equal(viaAcao.corpo.pendente, false);
  } finally { desligar(); }
});
