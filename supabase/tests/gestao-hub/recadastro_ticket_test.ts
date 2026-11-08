// Recadastro de identidade: código de uso único e token de página (Fase 2b).
// Rodar: deno test --no-check --config supabase/tests/gestao-hub/deno.json --allow-env --allow-net=none supabase/tests/gestao-hub
import assert from "node:assert/strict";
import { A, B, TOKEN_GERENTE, chamar, sha } from "./hub_bootstrap.ts";

const DIA = 86_400_000;
const tickets = () => A.tabela("fa_gestao_recadastro_tickets");

function ligar() { Deno.env.set("GESTAO_RECADASTRO", "1"); }
function desligar() { Deno.env.delete("GESTAO_RECADASTRO"); }

let n = 0;
function usuarioB(over: { app_role?: string; role?: string } = {}) {
  const id = crypto.randomUUID();
  const jwt = `jwt-t-${++n}`;
  B.usuarios.push({
    id, email: `t${n}@fake.local`, app_metadata: over.app_role ? { role: over.app_role } : {},
    user_metadata: {}, created_at: new Date().toISOString(), last_sign_in_at: null, banned_until: null,
  });
  B.tokens[jwt] = id;
  B.tabela("profiles").push({ id, role: over.role ?? "terapeuta", active: true, full_name: "Fulana Silva" });
  return { id, jwt, email: `t${n}@fake.local` };
}
const codigoDe = (url: string) => /#recadastro&c=([0-9a-f]{64})$/.exec(url)![1];

async function emitir(u: { jwt: string }, sistema = "clinica") {
  const r = await chamar("recadastro_ticket", { sistema }, u.jwt);
  assert.equal(r.status, 200);
  return codigoDe(r.corpo.url);
}

Deno.test("ticket_valido_vira_pagina_uma_vez", async () => {
  ligar();
  try {
    const u = usuarioB();
    const c = await emitir(u);
    const linha = tickets().find((l) => l.chave === `b:${u.id}`)!;
    assert.equal(linha.ticket_hash, await sha(c));
    assert.ok(!JSON.stringify(tickets()).includes(c), "o código em claro não é gravado");
    const r1 = await chamar("recadastro_consultar", { c }, null);
    assert.equal(r1.status, 200);
    assert.equal(r1.corpo.nome, "Fulana Silva");
    assert.equal(r1.corpo.dias_restantes, 7);
    assert.equal(r1.corpo.bloquear, false);
    assert.match(r1.corpo.pagina, /^[0-9a-f]{64}$/);
    const r2 = await chamar("recadastro_consultar", { c }, null);
    assert.equal(r2.status, 410);
    assert.equal(r2.corpo.error, "código inválido ou já usado");
    assert.equal(tickets().filter((l) => l.chave === `b:${u.id}`).length, 1);
    // a página identifica o usuário nas demais ações
    const st = await chamar("recadastro_status", { pagina: r1.corpo.pagina }, null);
    assert.equal(st.status, 200);
  } finally { desligar(); }
});

Deno.test("ticket_expirado_2_min", async () => {
  ligar();
  try {
    const u = usuarioB();
    const antesDeEmitir = Date.now();
    const c = await emitir(u);
    const linha = tickets().find((l) => l.chave === `b:${u.id}`)!;
    const dur = new Date(linha.expira_em).getTime() - antesDeEmitir;
    assert.ok(dur > 119_000 && dur < 121_500, `duração ${dur}`);
    linha.expira_em = new Date(Date.now() - 1000).toISOString();
    const r = await chamar("recadastro_consultar", { c }, null);
    assert.equal(r.status, 410);
    assert.equal(linha.usado_em ?? null, null);
  } finally { desligar(); }
});

Deno.test("ticket_de_isento_recusado", async () => {
  ligar();
  try {
    const antes = tickets().length;
    for (const u of [usuarioB({ app_role: "terapeuta_unit" }), usuarioB({ role: "responsavel" })]) {
      const r = await chamar("recadastro_ticket", { sistema: "clinica" }, u.jwt);
      assert.equal(r.status, 403);
      assert.deepEqual(r.corpo, { error: "não disponível" });
    }
    assert.equal((await chamar("recadastro_ticket", { sistema: "clinica" }, "jwt-invalido")).status, 401);
    assert.equal((await chamar("recadastro_ticket", { sistema: "clinica" }, null)).status, 401);
    assert.equal(tickets().length, antes);
  } finally { desligar(); }
});

Deno.test("ticket_com_recadastro_desligado_nao_grava", async () => {
  desligar();
  const u = usuarioB();
  const antes = tickets().length;
  const r = await chamar("recadastro_ticket", { sistema: "clinica" }, u.jwt);
  assert.deepEqual(r.corpo, { pendente: false });
  assert.equal(tickets().length, antes);
});

Deno.test("consultar_nao_vaza_cpf_nem_email", async () => {
  ligar();
  try {
    const u = usuarioB();
    A.tabela("fa_gestao_pessoas").push({ id: crypto.randomUUID(), cpf: "52998224725", email: "segredo@pessoa.com", nome: "Fulana Silva" });
    const c = await emitir(u);
    const r = await chamar("recadastro_consultar", { c }, null);
    const txt = JSON.stringify(r.corpo);
    assert.ok(!txt.includes("52998224725") && !txt.includes("segredo@pessoa.com") && !txt.includes(u.email));
    assert.deepEqual(Object.keys(r.corpo).sort(), ["bloquear", "dias_restantes", "nome", "pagina", "voltar_url"]);
  } finally { desligar(); }
});

Deno.test("voltar_url_aponta_para_o_sistema_certo", async () => {
  ligar();
  try {
    const c1 = await emitir(usuarioB(), "clinica");
    const r1 = await chamar("recadastro_consultar", { c: c1 }, null);
    assert.equal(r1.corpo.voltar_url, (Deno.env.get("GESTAO_URL_CLINICA") ?? "https://sistema.institutofacaamigos.com.br").replace(/\/+$/, ""));
    const c2 = await emitir(usuarioB(), "rh");
    const r2 = await chamar("recadastro_consultar", { c: c2 }, null);
    assert.equal(r2.corpo.voltar_url, (Deno.env.get("GESTAO_URL_RH") ?? "https://rh.institutofacaamigos.com.br").replace(/\/+$/, ""));
    assert.notEqual(r2.corpo.voltar_url, r1.corpo.voltar_url);
    // conta do Hub: sem código, volta para o Hub
    const r3 = await chamar("recadastro_consultar", {}, TOKEN_GERENTE);
    assert.equal(r3.status, 200);
    assert.equal(r3.corpo.voltar_url, "https://gestao.institutofacaamigos.com.br");
    assert.match(r3.corpo.pagina, /^[0-9a-f]{64}$/);
    const linha = tickets().find((l) => l.chave === "hub:gerente@t.com")!;
    assert.equal(linha.origem, "hub");
    assert.ok(linha.usado_em);
  } finally { desligar(); }
});

Deno.test("pagina_expira_em_30_min", async () => {
  ligar();
  try {
    const u = usuarioB();
    const c = await emitir(u);
    const t0 = Date.now();
    const r = await chamar("recadastro_consultar", { c }, null);
    const linha = tickets().find((l) => l.chave === `b:${u.id}`)!;
    assert.equal(linha.pagina_hash, await sha(r.corpo.pagina));
    const dur = new Date(linha.pagina_expira_em).getTime() - t0;
    assert.ok(dur > 29 * 60_000 && dur < 30 * 60_000 + 2000, `duração ${dur}`);
    linha.pagina_expira_em = new Date(Date.now() - 1000).toISOString();
    assert.equal((await chamar("recadastro_status", { pagina: r.corpo.pagina }, null)).status, 401);
    void DIA;
  } finally { desligar(); }
});
