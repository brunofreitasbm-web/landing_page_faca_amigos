// Testes da função gestao-hub com Supabase e Cacau simulados (nada sai da máquina).
// Rodar: deno test --config supabase/tests/gestao-hub/deno.json --allow-env --allow-net=none supabase/tests/gestao-hub
// Cobre o provisionamento ao salvar (fase 3) e o desligar/religar (fase 2).
import assert from "node:assert/strict";
import { projeto, projetos } from "./fake_supabase.ts";

Deno.env.set("SUPABASE_URL", "http://a");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "ka");
Deno.env.set("CLINICA_SUPABASE_URL", "http://b");
Deno.env.set("CLINICA_SUPABASE_SERVICE_ROLE_KEY", "kb");
Deno.env.set("GESTAO_SSO_SECRET_CACAU", "segredo-de-teste");
Deno.env.set("GESTAO_URL_CACAU", "http://cacau");
Deno.env.set("GESTAO_URL_RH", "https://rh.grupoib.test");
Deno.env.delete("GESTAO_URL_RH_PORTO_TERAPIA");

// ---- Cacau simulado: responde a /api/auth/hub/acesso conforme o estado de `cacau` ----
type ColabCacau = { ativo: boolean; role: string };
const cacau = new Map<string, ColabCacau>();
const ordensCacau: Array<{ u: string; a: string }> = [];
let cacauFalha = false;

const fetchOriginal = globalThis.fetch;
globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url === "http://cacau/api/auth/hub/acesso") {
    const ticket = JSON.parse(String(init?.body)).ticket as string;
    const payload = JSON.parse(atob(ticket.split(".")[0].replace(/-/g, "+").replace(/_/g, "/")));
    ordensCacau.push({ u: payload.u, a: payload.a });
    if (cacauFalha) return new Response(JSON.stringify({ error: "fora do ar" }), { status: 503 });
    const c = cacau.get(payload.u);
    if (!c) return Response.json({ ok: true, encontrado: false, mudou: false });
    if (payload.a === "consultar") return Response.json({ ok: true, encontrado: true, ativo: c.ativo, role: c.role });
    const quer = payload.a === "religar";
    const mudou = c.ativo !== quer;
    c.ativo = quer;
    return Response.json({ ok: true, encontrado: true, mudou });
  }
  if (url.startsWith("http://a") || url.startsWith("http://b")) return fetchOriginal(input as string, init);
  return new Response("{}", { status: 200 }); // e-mail (Brevo) etc.
}) as typeof fetch;

// ---- carrega a função com Deno.serve capturado ----
let handler!: (req: Request) => Promise<Response>;
(Deno as unknown as { serve: unknown }).serve = (h: (req: Request) => Promise<Response>) => {
  handler = h;
  return { finished: Promise.resolve() };
};
await import("../../functions/gestao-hub/index.ts");

const A = projeto("http://a");
const B = projeto("http://b");
B.gatilhoPerfil = true; // todo login novo na Clínica nasce 'terapeuta', como no banco real

const TOKEN = "a".repeat(64);
async function sha(s: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function contaBase(over: Record<string, unknown>) {
  return {
    email: "x", email_codigo: "x", nome: "x", playground_email: null, clinica_email: null, financeiro_email: null,
    rh_email: null, cacau_usuario: null, painel_usuario: null, ativo: true, papel: "gerente", auth_modo: "hub",
    senha_hash: null, senha_definida_em: null, convidado_em: null, login_email: null, criado_por: null,
    created_at: new Date().toISOString(), ...over,
  };
}
A.tabela("fa_gestao_contas").push(contaBase({ email: "bruno@t.com", email_codigo: "bruno@t.com", nome: "Bruno", papel: "owner", auth_modo: "clinica" }));
A.tabela("fa_gestao_sessoes").push({ token_hash: await sha(TOKEN), email: "bruno@t.com", expires_at: new Date(Date.now() + 3600_000).toISOString() });

async function chamar(action: string, corpo: Record<string, unknown> = {}, token = TOKEN) {
  const res = await handler(new Request("http://hub", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ action, ...corpo }),
  }));
  return { status: res.status, corpo: await res.json() as any };
}
const usuario = (p: typeof A, email: string) => p.usuarios.find((u) => u.email === email)!;
const perfil = (email: string) => B.tabela("profiles").find((l) => l.email === email);
const banido = (u: { banned_until: string | null }) => !!u.banned_until && Date.parse(u.banned_until) > Date.now();
const resultado = (r: any, app: string) => r.corpo.provisionamento.find((x: any) => x.app === app);

const ANA = {
  novo: true, cpf: "529.982.247-25", email: "ana@t.com", nome: "Ana", email_codigo: "ana@t.com", papel: "gerente", convidar: false,
  permissoes: { clinica: "operar", rh: "operar", playground: "operar", financeiro: "ver", cacau: "operar" },
  papeis: { clinica: "recepcao", playground: "OPERADOR" },
  escopos: { rh: "grupoib" },
  mapeamentos: {
    clinica_email: "ana.clinica@t.com", rh_email: "ana.rh@t.com", playground_email: "ana.pg@t.com",
    financeiro_email: "ana.fin@t.com", cacau_usuario: "Ana",
  },
};

// =====================================================================
// Fase 3: provisionar ao salvar
// =====================================================================

Deno.test("salvar uma gerência cria o login e dá o papel escolhido em cada sistema", async () => {
  cacau.set("Ana", { ativo: true, role: "consultora" });
  const r = await chamar("conta_salvar", ANA);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(r.corpo.falhas, 0, JSON.stringify(r.corpo.provisionamento));
  assert.equal(r.corpo.provisionamento.length, 5);

  assert.equal(perfil("ana.clinica@t.com")?.role, "recepcao");
  assert.equal(usuario(B, "ana.rh@t.com").app_metadata.role, "supervisor");
  assert.ok(usuario(A, "ana.pg@t.com"));
  assert.ok(usuario(A, "ana.fin@t.com"));
  assert.equal(A.tabela("fa_kiosk_employees").find((l) => l.email === "ana.pg@t.com")?.role, "OPERADOR");
  assert.equal(A.tabela("fa_gestao_provisionamento").length, 5);
  assert.equal(A.tabela("fa_gestao_provisionamento").find((l) => l.modulo === "clinica")?.papel_aplicado, "recepcao");
  assert.match(resultado(r, "cacau").texto, /existe no Cacau Show como consultora/);
});

Deno.test("provisionar de novo não muda nada", async () => {
  const antes = B.chamadas.filter((c) => c === "update:profiles" || c === "insert:profiles").length;
  const r = await chamar("conta_provisionar", { email: "ana@t.com" });
  assert.equal(r.corpo.falhas, 0, JSON.stringify(r.corpo.provisionamento));
  assert.equal(resultado(r, "clinica").texto, "já estava em dia");
  assert.equal(B.chamadas.filter((c) => c === "update:profiles" || c === "insert:profiles").length, antes);
});

Deno.test("trocar o papel escolhido troca o que o Hub tinha dado", async () => {
  const r = await chamar("conta_salvar", { ...ANA, novo: false, papeis: { clinica: "faturamento", playground: "GERENTE" } });
  assert.equal(r.corpo.falhas, 0, JSON.stringify(r.corpo.provisionamento));
  assert.equal(perfil("ana.clinica@t.com")?.role, "faturamento");
  assert.equal(A.tabela("fa_kiosk_employees").find((l) => l.email === "ana.pg@t.com")?.role, "GERENTE");
});

Deno.test("colaborador do Playground com o mesmo e-mail (login do convite) fica registrado como duplicado", async () => {
  const antigo = { id: crypto.randomUUID(), auth_user_id: crypto.randomUUID(), email: "Dani.PG@t.com", role: "GERENTE", active: true, full_name: "Dani" };
  A.tabela("fa_kiosk_employees").push(antigo);
  const r = await chamar("conta_salvar", {
    novo: true, cpf: "111.444.777-35", email: "dani@t.com", nome: "Dani", email_codigo: "dani@t.com", papel: "gerente", convidar: false,
    permissoes: { playground: "operar" }, papeis: { playground: "GERENTE" }, mapeamentos: { playground_email: "dani.pg@t.com" },
  });
  assert.equal(resultado(r, "playground").estado, "ok", JSON.stringify(r.corpo.provisionamento));
  const linhas = A.tabela("fa_kiosk_employees").filter((l) => String(l.email).toLowerCase() === "dani.pg@t.com");
  assert.equal(linhas.length, 2);
  const novo = linhas.find((l) => l.id !== antigo.id)!;
  const log = A.tabela("fa_kiosk_audit_log").find((l) => l.action === "HUB_PROVISION_EMPLOYEE" && l.details_json.employeeId === novo.id);
  assert.deepEqual(log?.details_json.duplicaEmailDe, [antigo.id]);
});

Deno.test("papel que a pessoa já tinha no sistema não é trocado, e o motivo aparece", async () => {
  const u = { id: crypto.randomUUID(), email: "bia.clinica@t.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z", last_sign_in_at: "2026-02-01T00:00:00Z", banned_until: null };
  B.usuarios.push(u);
  B.tabela("profiles").push({ id: u.id, email: u.email, role: "recepcao", active: true });
  const r = await chamar("conta_salvar", {
    novo: true, cpf: "390.533.447-05", email: "bia@t.com", nome: "Bia", email_codigo: "bia@t.com", papel: "gerente", convidar: false,
    permissoes: { clinica: "operar" }, papeis: { clinica: "supervisor" }, mapeamentos: { clinica_email: "bia.clinica@t.com" },
  });
  const c = resultado(r, "clinica");
  assert.equal(c.estado, "erro");
  assert.match(c.texto, /já é "recepcao" na Clínica/);
  assert.equal(perfil("bia.clinica@t.com")?.role, "recepcao");
});

Deno.test("conta de unidade (quiosque) nunca é aberta nem alterada", async () => {
  const quiosque = { id: crypto.randomUUID(), email: "quiosque@t.com", app_metadata: { role: "intern_unit" }, user_metadata: {}, created_at: "2026-01-01T00:00:00Z", last_sign_in_at: null, banned_until: null };
  B.usuarios.push(quiosque);
  const r = await chamar("conta_salvar", {
    novo: true, cpf: "168.995.350-09", email: "caio@t.com", nome: "Caio", email_codigo: "caio@t.com", papel: "gerente", convidar: false,
    permissoes: { rh: "operar" }, escopos: { rh: "grupoib" }, mapeamentos: { rh_email: "quiosque@t.com" },
  });
  assert.equal(resultado(r, "rh").estado, "pulado");
  assert.deepEqual(usuario(B, "quiosque@t.com").app_metadata, { role: "intern_unit" });
  assert.equal(banido(usuario(B, "quiosque@t.com")), false);
});

Deno.test("Cacau: usuário que não existe e nível 'ver' viram erro explicado; o Hub não cria colaborador", async () => {
  const semUsuario = await chamar("conta_salvar", {
    novo: true, cpf: "746.971.314-01", email: "dora@t.com", nome: "Dora", email_codigo: "dora@t.com", papel: "gerente", convidar: false,
    permissoes: { cacau: "operar" }, mapeamentos: { cacau_usuario: "Dora" },
  });
  assert.match(resultado(semUsuario, "cacau").texto, /não existe no Cacau Show/);
  assert.equal(cacau.has("Dora"), false);

  cacau.set("Eva", { ativo: true, role: "consultora" });
  const soLeitura = await chamar("conta_salvar", {
    novo: true, cpf: "935.411.347-80", email: "eva@t.com", nome: "Eva", email_codigo: "eva@t.com", papel: "gerente", convidar: false,
    permissoes: { cacau: "ver" }, mapeamentos: { cacau_usuario: "Eva" },
  });
  assert.match(resultado(soLeitura, "cacau").texto, /acesso só de leitura/);
});

Deno.test("conta owner não é provisionada", async () => {
  const r = await chamar("conta_salvar", { novo: true, cpf: "123.456.789-09", email: "fabi@t.com", nome: "Fabi", email_codigo: "fabi@t.com", papel: "owner", convidar: false });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.deepEqual(r.corpo.provisionamento, []);
});

Deno.test("a lista devolve o papel escolhido, o estado de cada sistema e as opções de papel", async () => {
  const r = await chamar("contas_listar");
  const ana = r.corpo.contas.find((c: any) => c.email === "ana@t.com");
  assert.equal(ana.papeis.clinica, "faturamento");
  assert.equal(ana.provisionamento.clinica.estado, "ok");
  const clinica = r.corpo.modulos.find((m: any) => m.id === "clinica");
  assert.deepEqual(clinica.papeis.map((o: any) => o.id), ["supervisor", "recepcao", "faturamento"]);
  assert.equal(clinica.papel_padrao, "supervisor");
});

// =====================================================================
// Gestão de Pessoas: empresa (workspace) por pessoa
// =====================================================================

Deno.test("a gerência recebe só a empresa escolhida, nunca 'all'", async () => {
  assert.deepEqual(usuario(B, "ana.rh@t.com").app_metadata.workspace_scope, ["grupoib"]);
  assert.equal(usuario(B, "ana.rh@t.com").app_metadata.role, "supervisor");
});

Deno.test("gerência com Gestão de Pessoas sem empresa escolhida não é salva", async () => {
  const antes = A.tabela("fa_gestao_contas").length;
  const r = await chamar("conta_salvar", {
    novo: true, cpf: "135.792.468-28", email: "gil@t.com", nome: "Gil", email_codigo: "gil@t.com", papel: "gerente", convidar: false,
    permissoes: { rh: "operar" }, mapeamentos: { rh_email: "gil.rh@t.com" },
  });
  assert.equal(r.status, 400);
  assert.match(r.corpo.error, /escolha a empresa/);
  assert.equal(A.tabela("fa_gestao_contas").length, antes);
  assert.equal(B.usuarios.some((u) => u.email === "gil.rh@t.com"), false);
});

Deno.test("o Hub muda a empresa que ele mesmo deu, mas não o escopo de quem já existia", async () => {
  const r = await chamar("conta_salvar", { ...ANA, novo: false, papeis: { clinica: "faturamento", playground: "GERENTE" }, escopos: { rh: "porto-terapia" } });
  assert.equal(r.corpo.falhas, 0, JSON.stringify(r.corpo.provisionamento));
  assert.deepEqual(usuario(B, "ana.rh@t.com").app_metadata.workspace_scope, ["porto-terapia"]);

  // Supervisor que já existia na Gestão de Pessoas com acesso às duas empresas (não foi o Hub): fica como está.
  const u = { id: crypto.randomUUID(), email: "hugo.rh@t.com", app_metadata: { role: "supervisor", workspace_scope: ["all"] }, user_metadata: {}, created_at: "2026-01-01T00:00:00Z", last_sign_in_at: "2026-02-01T00:00:00Z", banned_until: null };
  B.usuarios.push(u);
  const h = await chamar("conta_salvar", {
    novo: true, cpf: "112.233.445-17", email: "hugo@t.com", nome: "Hugo", email_codigo: "hugo@t.com", papel: "gerente", convidar: false,
    permissoes: { rh: "operar" }, escopos: { rh: "grupoib" }, mapeamentos: { rh_email: "hugo.rh@t.com" },
  });
  const rh = resultado(h, "rh");
  assert.equal(rh.estado, "erro");
  assert.match(rh.texto, /já tem acesso a "all"/);
  assert.deepEqual(usuario(B, "hugo.rh@t.com").app_metadata.workspace_scope, ["all"]);

  // volta ao estado do restante dos testes
  await chamar("conta_salvar", { ...ANA, novo: false, papeis: { clinica: "faturamento", playground: "GERENTE" }, escopos: { rh: "grupoib" } });
  assert.deepEqual(usuario(B, "ana.rh@t.com").app_metadata.workspace_scope, ["grupoib"]);
});

Deno.test("ao abrir, a gerência vai ao site da própria empresa; sem endereço configurado, o Hub recusa", async () => {
  const tokenAna = "b".repeat(64);
  A.tabela("fa_gestao_sessoes").push({ token_hash: await sha(tokenAna), email: "ana@t.com", expires_at: new Date(Date.now() + 3600_000).toISOString() });

  const grupo = await chamar("launch", { app: "rh" }, tokenAna);
  assert.equal(grupo.status, 200, JSON.stringify(grupo.corpo));
  assert.match(grupo.corpo.url, /^https:\/\/rh\.grupoib\.test\/sso\?token_hash=/);

  await chamar("conta_salvar", { ...ANA, novo: false, papeis: { clinica: "faturamento", playground: "GERENTE" }, escopos: { rh: "porto-terapia" } });
  const semUrl = await chamar("launch", { app: "rh" }, tokenAna);
  assert.equal(semUrl.status, 409);
  assert.match(semUrl.corpo.error, /endereço do site da sua empresa/);

  Deno.env.set("GESTAO_URL_RH_PORTO_TERAPIA", "https://rh.porto.test");
  try {
    const porto = await chamar("launch", { app: "rh" }, tokenAna);
    assert.match(porto.corpo.url, /^https:\/\/rh\.porto\.test\/sso\?token_hash=/);
  } finally {
    Deno.env.delete("GESTAO_URL_RH_PORTO_TERAPIA");
    await chamar("conta_salvar", { ...ANA, novo: false, papeis: { clinica: "faturamento", playground: "GERENTE" }, escopos: { rh: "grupoib" } });
  }
});

Deno.test("a lista devolve a empresa escolhida e as empresas disponíveis", async () => {
  const r = await chamar("contas_listar");
  assert.equal(r.corpo.contas.find((c: any) => c.email === "ana@t.com").escopos.rh, "grupoib");
  assert.deepEqual(r.corpo.modulos.find((m: any) => m.id === "rh").escopos.map((e: any) => e.id), ["grupoib", "porto-terapia"]);
});

// =====================================================================
// Equipe da Clínica: criar, redefinir senha e bloquear (terapeutas, recepção, faturamento)
// =====================================================================

const EQUIPE = {
  nome: "Paula Souza", cpf: "529.982.247-25", papel: "terapeuta", conselho: "CRP 10/12345",
  avaliador: true, at: false, nascimento: "1990-05-17",
};
let paulaId = "";

Deno.test("owner cria uma terapeuta: login por CPF, senha temporária com troca obrigatória", async () => {
  B.tabela("units").push({ id: "unidade-1", name: "Unidade Centro" });
  const r = await chamar("equipe_criar", EQUIPE);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  paulaId = r.corpo.id;
  assert.match(r.corpo.senha_temporaria, /^[A-Za-z0-9]{12}@9$/);

  const u = usuario(B, "equipe_52998224725@staff.facaamigos.local");
  assert.ok(u, "login por CPF (e-mail sintético) criado");
  assert.equal(u.password, r.corpo.senha_temporaria);
  const p = perfil("equipe_52998224725@staff.facaamigos.local");
  assert.equal(p?.role, "terapeuta");
  assert.equal(p?.cpf, "52998224725");
  assert.equal(p?.must_change_password, true);
  assert.equal(p?.active, true);
  assert.equal(p?.council_type, "CRP 10/12345");
  assert.equal(p?.is_evaluator, true);
  assert.equal(p?.unit_id, "unidade-1");
  assert.equal(p?.clinic_id, "c0000000-0000-0000-0000-000000000001");
});

Deno.test("a senha temporária não aparece em nenhum log nem auditoria", async () => {
  const r = await chamar("equipe_criar", { ...EQUIPE, nome: "Rita Lima", cpf: "11144477735", email: "rita@t.com", papel: "recepcao" });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.ok(usuario(B, "rita@t.com"), "com e-mail informado, usa o e-mail");
  const tudo = JSON.stringify([A.tabela("fa_gestao_auditoria"), B.tabela("audit_log")]);
  assert.equal(tudo.includes(r.corpo.senha_temporaria), false);
  assert.ok(B.tabela("audit_log").some((l) => l.action === "staff_created" && l.after?.via === "gestao-hub"));
  assert.ok(A.tabela("fa_gestao_auditoria").some((l) => l.evento === "equipe_criada"));
});

Deno.test("criar recusa CPF inválido ou repetido, e-mail e papel inválidos", async () => {
  assert.equal((await chamar("equipe_criar", { ...EQUIPE, cpf: "123.456.789-00" })).status, 400);
  assert.equal((await chamar("equipe_criar", { ...EQUIPE, cpf: "111.111.111-11" })).status, 400);
  assert.equal((await chamar("equipe_criar", { ...EQUIPE, cpf: "123.456.789-09", email: "sem-arroba" })).status, 400);
  assert.equal((await chamar("equipe_criar", { ...EQUIPE, cpf: "123.456.789-09", papel: "gestor" })).status, 400);
  const repetido = await chamar("equipe_criar", { ...EQUIPE, nome: "Outra Paula" });
  assert.equal(repetido.status, 409);
  assert.match(repetido.corpo.error, /já existe alguém com este CPF/);
});

Deno.test("se o perfil falha, o login criado é desfeito (sem lixo no Auth)", async () => {
  const antes = B.usuarios.length;
  B.operacoesComErro.add("upsert:profiles");
  try {
    const r = await chamar("equipe_criar", { ...EQUIPE, nome: "Caco Reis", cpf: "123.456.789-09" });
    assert.equal(r.status, 502);
  } finally {
    B.operacoesComErro.delete("upsert:profiles");
  }
  assert.equal(B.usuarios.length, antes);
});

Deno.test("a lista mostra só a equipe, com CPF mascarado, e marca quem tem conta no Hub", async () => {
  B.tabela("profiles").push({ id: crypto.randomUUID(), clinic_id: "c0000000-0000-0000-0000-000000000001", role: "responsavel", full_name: "Família X", email: "familia@t.com", active: true });
  B.tabela("profiles").push({ id: crypto.randomUUID(), clinic_id: "outra-clinica", role: "terapeuta", full_name: "De Fora", email: "fora@t.com", active: true });
  const r = await chamar("equipe_listar");
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const nomes = r.corpo.equipe.map((e: any) => e.nome);
  assert.ok(nomes.includes("Paula Souza") && nomes.includes("Rita Lima"));
  assert.ok(!nomes.includes("Família X") && !nomes.includes("De Fora"));
  const paula = r.corpo.equipe.find((e: any) => e.nome === "Paula Souza");
  assert.equal(paula.cpf, "***.982.247-**");
  assert.equal(paula.email, null); // e-mail sintético não é mostrado
  assert.equal(paula.trocar_senha, true);
  assert.equal(JSON.stringify(r.corpo).includes("52998224725"), false); // CPF completo nunca sai
  const ana = r.corpo.equipe.find((e: any) => e.email === "ana.clinica@t.com");
  assert.equal(ana?.no_hub, true);
});

Deno.test("redefinir senha: nova temporária, troca obrigatória, e o PIN de assinatura não é tocado", async () => {
  const p = B.tabela("profiles").find((l) => l.id === paulaId)!;
  p.signature_pin_hash = "HASH-DO-PIN-DE-ASSINATURA";
  p.signature_pin_failed_attempts = 2;
  p.must_change_password = false;
  const senhaAntes = usuario(B, "equipe_52998224725@staff.facaamigos.local").password;

  const r = await chamar("equipe_resetar_senha", { id: paulaId });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.notEqual(r.corpo.senha_temporaria, senhaAntes);
  assert.equal(usuario(B, "equipe_52998224725@staff.facaamigos.local").password, r.corpo.senha_temporaria);
  assert.equal(p.must_change_password, true);
  assert.equal(p.signature_pin_hash, "HASH-DO-PIN-DE-ASSINATURA");
  assert.equal(p.signature_pin_failed_attempts, 2);
  assert.equal(JSON.stringify([A.tabela("fa_gestao_auditoria"), B.tabela("audit_log")]).includes(r.corpo.senha_temporaria), false);
});

Deno.test("bloquear e reativar: login banido e perfil inativo, depois devolvidos; nada é excluído", async () => {
  const r = await chamar("equipe_ativo", { id: paulaId, ativo: false });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(banido(usuario(B, "equipe_52998224725@staff.facaamigos.local")), true);
  assert.equal(B.tabela("profiles").find((l) => l.id === paulaId)?.active, false);

  const volta = await chamar("equipe_ativo", { id: paulaId, ativo: true });
  assert.equal(volta.status, 200);
  assert.equal(banido(usuario(B, "equipe_52998224725@staff.facaamigos.local")), false);
  assert.equal(B.tabela("profiles").find((l) => l.id === paulaId)?.active, true);
  assert.ok(!B.chamadas.includes("delete:profiles"));
});

Deno.test("não mexe em conta do Hub, em família nem em quem não é da equipe; gerência sem nível admin na Clínica não usa", async () => {
  const anaPerfil = B.tabela("profiles").find((l) => l.email === "ana.clinica@t.com")!;
  const noHub = await chamar("equipe_resetar_senha", { id: anaPerfil.id });
  assert.equal(noHub.status, 409);
  assert.match(noHub.corpo.error, /tem conta no Hub/);

  const familia = B.tabela("profiles").find((l) => l.role === "responsavel")!;
  assert.equal((await chamar("equipe_ativo", { id: familia.id, ativo: false })).status, 409);
  assert.equal((await chamar("equipe_resetar_senha", { id: "nao-e-uuid" })).status, 409);

  const tokenGerente = "c".repeat(64);
  A.tabela("fa_gestao_sessoes").push({ token_hash: await sha(tokenGerente), email: "ana@t.com", expires_at: new Date(Date.now() + 3600_000).toISOString() });
  for (const acao of ["equipe_listar", "equipe_criar", "equipe_resetar_senha", "equipe_ativo"]) {
    assert.equal((await chamar(acao, { id: paulaId }, tokenGerente)).status, 403, acao);
  }
});

// =====================================================================
// Administração delegada: gerência com nível admin na Clínica gerencia a equipe
// =====================================================================

const DAVI = {
  novo: true, cpf: "987.654.321-00", email: "davi@t.com", nome: "Davi", email_codigo: "davi@t.com", papel: "gerente", convidar: false,
  permissoes: { clinica: "admin" }, papeis: { clinica: "supervisor" }, mapeamentos: { clinica_email: "davi.clinica@t.com" },
};
const TOKEN_DAVI = "d".repeat(64);
let marinaId = "";

Deno.test("administrador da Clínica (gerência com nível admin) usa a equipe: listar, criar, redefinir, bloquear", async () => {
  const salvo = await chamar("conta_salvar", DAVI);
  assert.equal(salvo.corpo.falhas, 0, JSON.stringify(salvo.corpo.provisionamento));
  A.tabela("fa_gestao_sessoes").push({ token_hash: await sha(TOKEN_DAVI), email: "davi@t.com", expires_at: new Date(Date.now() + 3600_000).toISOString() });

  assert.equal((await chamar("me", {}, TOKEN_DAVI)).corpo.pode_gerir_equipe, true);
  assert.equal((await chamar("equipe_listar", {}, TOKEN_DAVI)).status, 200);

  const criada = await chamar("equipe_criar", { nome: "Marina Alves", cpf: "123.456.789-09", papel: "terapeuta" }, TOKEN_DAVI);
  assert.equal(criada.status, 200, JSON.stringify(criada.corpo));
  marinaId = criada.corpo.id;
  assert.equal((await chamar("equipe_resetar_senha", { id: marinaId }, TOKEN_DAVI)).status, 200);
  assert.equal((await chamar("equipe_ativo", { id: marinaId, ativo: false }, TOKEN_DAVI)).status, 200);
  assert.equal(B.tabela("profiles").find((l) => l.id === marinaId)?.active, false);
  assert.equal((await chamar("equipe_ativo", { id: marinaId, ativo: true }, TOKEN_DAVI)).status, 200);

  // A trilha mostra quem fez: o administrador, não o owner.
  assert.ok(A.tabela("fa_gestao_auditoria").some((l) => l.evento === "equipe_criada" && l.email === "davi@t.com"));
  assert.ok(B.tabela("audit_log").some((l) => l.action === "staff_created" && l.after?.por === "davi@t.com"));
});

Deno.test("delegar não dá poder acima do da equipe: nada de supervisor/gestor, de contas do Hub nem de si mesmo", async () => {
  for (const papel of ["supervisor", "gestor", "owner"]) {
    assert.equal((await chamar("equipe_criar", { nome: "Fulano Teste", cpf: "111.444.777-35", papel }, TOKEN_DAVI)).status, 400, papel);
  }
  const doDavi = B.tabela("profiles").find((l) => l.email === "davi.clinica@t.com")!;
  assert.equal((await chamar("equipe_ativo", { id: doDavi.id, ativo: false }, TOKEN_DAVI)).status, 409);
  assert.equal((await chamar("equipe_resetar_senha", { id: doDavi.id }, TOKEN_DAVI)).status, 409);
  assert.equal(doDavi.active !== false, true);

  const anaPerfil = B.tabela("profiles").find((l) => l.email === "ana.clinica@t.com")!;
  assert.equal((await chamar("equipe_ativo", { id: anaPerfil.id, ativo: false }, TOKEN_DAVI)).status, 409);
});

Deno.test("o administrador da Clínica NÃO administra contas do Hub nem o que é de outros sistemas", async () => {
  for (const acao of ["contas_listar", "conta_salvar", "conta_provisionar", "conta_ativo", "convidar", "conta_acesso", "sessoes_revogar", "auditoria_listar"]) {
    const r = await chamar(acao, { email: "ana@t.com", ativo: false, novo: true, nome: "X", papel: "owner" }, TOKEN_DAVI);
    assert.equal(r.status, 403, acao);
  }
  // Nenhuma conta do Hub mudou.
  assert.equal(A.tabela("fa_gestao_contas").find((c) => c.email === "ana@t.com")?.ativo, true);
  assert.equal(A.tabela("fa_gestao_contas").filter((c) => c.papel === "owner").length, 2); // bruno + fabi
});

Deno.test("nível operar ou ver na Clínica não delega; tirar o nível admin tira o acesso", async () => {
  assert.equal((await chamar("me", {}, "c".repeat(64))).corpo.pode_gerir_equipe, false); // Ana: operar
  assert.equal((await chamar("equipe_listar", {}, "c".repeat(64))).status, 403);

  await chamar("conta_salvar", { ...DAVI, novo: false, permissoes: { clinica: "ver" } });
  assert.equal((await chamar("equipe_listar", {}, TOKEN_DAVI)).status, 403);
  assert.equal((await chamar("me", {}, TOKEN_DAVI)).corpo.pode_gerir_equipe, false);
  assert.ok(A.tabela("fa_gestao_auditoria").some((l) => l.evento === "acao_equipe_negada" && l.email === "davi@t.com"));

  await chamar("conta_salvar", { ...DAVI, novo: false, permissoes: { clinica: "admin" } });
  assert.equal((await chamar("equipe_listar", {}, TOKEN_DAVI)).status, 200);
});

Deno.test("administrador desativado perde o acesso à equipe na hora", async () => {
  await chamar("conta_ativo", { email: "davi@t.com", ativo: false });
  assert.equal((await chamar("equipe_listar", {}, TOKEN_DAVI)).status, 401);
  await chamar("conta_ativo", { email: "davi@t.com", ativo: true });
});

// =====================================================================
// Fase 2: desligar e religar
// =====================================================================

Deno.test("desativar bloqueia o acesso em cada sistema, sem apagar nada", async () => {
  const contasAntes = A.tabela("fa_gestao_contas").length;
  const r = await chamar("conta_ativo", { email: "ana@t.com", ativo: false });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(r.corpo.falhas, 0, JSON.stringify(r.corpo.resultados));

  for (const e of ["ana.clinica@t.com", "ana.rh@t.com"]) assert.equal(banido(usuario(B, e)), true, e);
  for (const e of ["ana.pg@t.com", "ana.fin@t.com"]) assert.equal(banido(usuario(A, e)), true, e);
  assert.equal(perfil("ana.clinica@t.com")?.active, false);
  assert.equal(A.tabela("fa_kiosk_employees").find((l) => l.email === "ana.pg@t.com")?.active, false);
  assert.deepEqual(ordensCacau.filter((o) => o.a === "desligar"), [{ u: "Ana", a: "desligar" }]);
  assert.equal(cacau.get("Ana")?.ativo, false);
  assert.equal(A.tabela("fa_gestao_contas").find((c) => c.email === "ana@t.com")?.ativo, false);
  assert.equal(A.tabela("fa_gestao_contas").length, contasAntes); // nada foi apagado
  assert.ok(!A.chamadas.some((c) => c.startsWith("delete:") && c !== "delete:fa_gestao_sessoes" && c !== "delete:fa_teste_admin_sessions" && c !== "delete:fa_gestao_permissoes"));
});

Deno.test("desativar de novo não muda nada (idempotente)", async () => {
  const r = await chamar("conta_ativo", { email: "ana@t.com", ativo: false });
  assert.equal(r.corpo.falhas, 0);
  assert.ok(r.corpo.resultados.every((x: any) => x.estado === "ja_bloqueado"), JSON.stringify(r.corpo.resultados));
});

Deno.test("reativar devolve exatamente o que o Hub bloqueou", async () => {
  const r = await chamar("conta_ativo", { email: "ana@t.com", ativo: true });
  assert.equal(r.corpo.falhas, 0, JSON.stringify(r.corpo.resultados));
  for (const e of ["ana.clinica@t.com", "ana.rh@t.com"]) assert.equal(banido(usuario(B, e)), false, e);
  for (const e of ["ana.pg@t.com", "ana.fin@t.com"]) assert.equal(banido(usuario(A, e)), false, e);
  assert.equal(perfil("ana.clinica@t.com")?.active, true);
  assert.equal(A.tabela("fa_kiosk_employees").find((l) => l.email === "ana.pg@t.com")?.active, true);
  assert.equal(cacau.get("Ana")?.ativo, true);
  assert.ok(A.tabela("fa_gestao_bloqueios").every((b) => b.desfeito_em));
});

Deno.test("quem já estava desativado no sistema continua desativado depois de reativar", async () => {
  const u = { id: crypto.randomUUID(), email: "dani.pg@t.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z", last_sign_in_at: null, banned_until: null };
  A.usuarios.push(u);
  A.tabela("fa_kiosk_employees").push({ id: "emp-dani", auth_user_id: u.id, email: u.email, role: "OPERADOR", active: false });
  A.tabela("fa_gestao_contas").push(contaBase({ email: "dani@t.com", email_codigo: "dani@t.com", nome: "Dani", playground_email: "dani.pg@t.com" }));
  await chamar("conta_ativo", { email: "dani@t.com", ativo: false });
  assert.equal(banido(usuario(A, "dani.pg@t.com")), true);
  await chamar("conta_ativo", { email: "dani@t.com", ativo: true });
  assert.equal(banido(usuario(A, "dani.pg@t.com")), false);
  assert.equal(A.tabela("fa_kiosk_employees").find((l) => l.id === "emp-dani")?.active, false); // não era do Hub
});

Deno.test("desativar não toca em conta de unidade", async () => {
  const r = await chamar("conta_ativo", { email: "caio@t.com", ativo: false });
  const rh = r.corpo.resultados.find((x: any) => x.app === "rh");
  assert.equal(rh.estado, "pulado");
  assert.equal(banido(usuario(B, "quiosque@t.com")), false);
  await chamar("conta_ativo", { email: "caio@t.com", ativo: true });
});

Deno.test("falha no Cacau não impede os outros sistemas e 'Reaplicar' refaz só o que faltou", async () => {
  cacauFalha = true;
  const r = await chamar("conta_ativo", { email: "ana@t.com", ativo: false });
  assert.equal(r.corpo.falhas, 1);
  assert.equal(r.corpo.resultados.find((x: any) => x.app === "cacau").estado, "erro");
  assert.equal(banido(usuario(B, "ana.clinica@t.com")), true);
  cacauFalha = false;
  const de_novo = await chamar("conta_ativo", { email: "ana@t.com", ativo: false });
  assert.equal(de_novo.corpo.falhas, 0, JSON.stringify(de_novo.corpo.resultados));
  assert.equal(de_novo.corpo.resultados.find((x: any) => x.app === "cacau").estado, "bloqueado");
  await chamar("conta_ativo", { email: "ana@t.com", ativo: true });
  assert.equal(cacau.get("Ana")?.ativo, true);
});

Deno.test("sem a tabela de registro nenhum sistema é alterado", async () => {
  A.tabelasComErro.add("fa_gestao_bloqueios");
  try {
    const r = await chamar("conta_ativo", { email: "ana@t.com", ativo: false });
    assert.equal(r.corpo.falhas, 1);
    assert.match(r.corpo.resultados[0].texto, /nenhum sistema foi alterado/);
    assert.equal(r.corpo.resultados.length, 1);
    assert.ok(![...A.usuarios, ...B.usuarios].some((u) => banido(u)), "ninguém pode ter sido bloqueado");
  } finally {
    A.tabelasComErro.delete("fa_gestao_bloqueios");
    await chamar("conta_ativo", { email: "ana@t.com", ativo: true });
  }
});

// =====================================================================
// Sessão imediata: desativar também derruba a sessão que já estava aberta (projeto B)
// =====================================================================

Deno.test("desativar encerra as sessões abertas na Clínica e na Gestão de Pessoas, e só lá", async () => {
  const ids = ["ana.clinica@t.com", "ana.rh@t.com"].map((e) => usuario(B, e).id);
  for (const id of ids) B.sessoes[id] = 2;
  const idPg = usuario(A, "ana.pg@t.com").id;
  A.sessoes[idPg] = 4;
  A.chamadas.length = 0;

  const r = await chamar("conta_ativo", { email: "ana@t.com", ativo: false });
  assert.equal(r.corpo.falhas, 0, JSON.stringify(r.corpo.resultados));
  for (const id of ids) assert.equal(B.sessoes[id], 0);
  assert.match(r.corpo.resultados.find((x: any) => x.app === "rh").texto, /2 sessão\(ões\) aberta\(s\) encerrada\(s\)/);
  assert.equal(A.sessoes[idPg], 4, "o projeto A não é tocado por esta correção");
  assert.ok(!A.chamadas.includes("rpc:hub_encerrar_sessoes"));

  // Repetir "desativar" (login já banido) encerra sessões que tenham voltado a existir.
  B.sessoes[ids[0]] = 1;
  await chamar("conta_ativo", { email: "ana@t.com", ativo: false });
  assert.equal(B.sessoes[ids[0]], 0);
  await chamar("conta_ativo", { email: "ana@t.com", ativo: true });
});

Deno.test("desativar nunca encerra a sessão de conta de unidade", async () => {
  const quiosque = usuario(B, "quiosque@t.com");
  B.sessoes[quiosque.id] = 3;
  await chamar("conta_ativo", { email: "caio@t.com", ativo: false });
  assert.equal(B.sessoes[quiosque.id], 3);
  assert.equal(banido(quiosque), false);
  await chamar("conta_ativo", { email: "caio@t.com", ativo: true });
});

Deno.test("sem a função do banco o login fica bloqueado, o erro aparece e repetir completa", async () => {
  const id = usuario(B, "ana.rh@t.com").id;
  B.sessoes[id] = 2;
  B.operacoesComErro.add("rpc:hub_encerrar_sessoes");
  const r = await chamar("conta_ativo", { email: "ana@t.com", ativo: false });
  assert.equal(banido(usuario(B, "ana.rh@t.com")), true);
  const rh = r.corpo.resultados.find((x: any) => x.app === "rh");
  assert.equal(rh.estado, "erro");
  assert.match(rh.texto, /encerrar as sessões/);
  assert.equal(B.sessoes[id], 2);

  B.operacoesComErro.delete("rpc:hub_encerrar_sessoes");
  const de_novo = await chamar("conta_ativo", { email: "ana@t.com", ativo: false });
  assert.equal(de_novo.corpo.falhas, 0, JSON.stringify(de_novo.corpo.resultados));
  assert.equal(B.sessoes[id], 0);
  await chamar("conta_ativo", { email: "ana@t.com", ativo: true });
});


// ---- Manutenção TI: arquivos de TI só para owner, por URL assinada ----
const GTOKEN = "e".repeat(64);
A.tabela("fa_gestao_contas").push(contaBase({ email: "ti-gerente@t.com", email_codigo: "ti-gerente@t.com", nome: "Gerente TI", papel: "gerente" }));
A.tabela("fa_gestao_sessoes").push({ token_hash: await sha(GTOKEN), email: "ti-gerente@t.com", expires_at: new Date(Date.now() + 3600_000).toISOString() });
const eventosTi = () => A.tabela("fa_gestao_auditoria").filter((l) => l.evento === "ti_download");

async function shaBytes(b: Uint8Array) {
  const h = await crypto.subtle.digest("SHA-256", b);
  return Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

Deno.test("ti_listar: owner recebe os 2 arquivos, sem o campo nome", async () => {
  const r = await chamar("ti_listar");
  assert.equal(r.status, 200);
  assert.deepEqual(r.corpo.arquivos.map((a: any) => a.id), ["otimizar-win11", "comandos-otimizar"]);
  for (const a of r.corpo.arquivos) assert.equal("nome" in a, false);
});

Deno.test("ti_listar e ti_baixar: gerente recebe 403 e fica na auditoria como acao_owner_negada", async () => {
  const antes = A.assinaturas.length;
  for (const acao of ["ti_listar", "ti_baixar"]) {
    const r = await chamar(acao, { id: "otimizar-win11" }, GTOKEN);
    assert.equal(r.status, 403, acao);
  }
  assert.equal(A.assinaturas.length, antes);
  assert.ok(A.tabela("fa_gestao_auditoria").some((l) => l.evento === "acao_owner_negada" && l.email === "ti-gerente@t.com" && l.detalhe === "ti_baixar"));
});

Deno.test("ti_listar e ti_baixar: sem token ou com token inexistente recebem 401", async () => {
  for (const acao of ["ti_listar", "ti_baixar"]) {
    assert.equal((await chamar(acao, { id: "otimizar-win11" }, "")).status, 401, `${acao} sem token`);
    assert.equal((await chamar(acao, { id: "otimizar-win11" }, "f".repeat(64))).status, 401, `${acao} token inexistente`);
  }
});

Deno.test("ti_baixar: owner recebe url, 60 segundos e auditoria ti_download", async () => {
  const antes = eventosTi().length;
  const r = await chamar("ti_baixar", { id: "otimizar-win11" });
  assert.equal(r.status, 200);
  assert.match(r.corpo.url, /^http:\/\/a\/storage\/ti-arquivos\/otimizar-win11\.ps1/);
  assert.deepEqual(A.assinaturas.at(-1), { bucket: "ti-arquivos", path: "otimizar-win11.ps1", seconds: 60, download: "otimizar-win11.ps1" });
  const novos = eventosTi().slice(antes);
  assert.equal(novos.length, 1);
  assert.equal(novos[0].email, "bruno@t.com");
  assert.equal(novos[0].app, "ti");
  assert.equal(novos[0].detalhe, "otimizar-win11");
});

Deno.test("ti_baixar: id fora do catálogo é 404 e nada é assinado", async () => {
  const antes = A.assinaturas.length;
  for (const id of ["../otimizar-win11.ps1", "otimizar-win11.ps1/..", "otimizar-win11.ps1", "nao-existe", "", undefined, 42, {}]) {
    const r = await chamar("ti_baixar", id === undefined ? {} : { id });
    assert.equal(r.status, 404, JSON.stringify(id));
  }
  assert.equal(A.assinaturas.length, antes);
});

Deno.test("ti_baixar: objeto ausente no Storage é 502 sem vazar o bucket e sem auditoria de sucesso", async () => {
  const antes = eventosTi().length;
  A.operacoesComErro.add("storage:createSignedUrl");
  const r = await chamar("ti_baixar", { id: "comandos-otimizar" });
  A.operacoesComErro.delete("storage:createSignedUrl");
  assert.equal(r.status, 502);
  assert.equal(JSON.stringify(r.corpo).includes("ti-arquivos"), false);
  assert.equal(eventosTi().length, antes);
});

Deno.test("ti_listar: tamanho e SHA256 do catálogo batem com os arquivos reais", async () => {
  const r = await chamar("ti_listar");
  const porId = Object.fromEntries(r.corpo.arquivos.map((a: any) => [a.id, a]));
  const reais: Record<string, string> = {
    "otimizar-win11": "supabase/ops/ti/otimizar-win11.ps1",
    "comandos-otimizar": "supabase/ops/ti/comandos-otimizar.txt",
  };
  for (const [id, caminho] of Object.entries(reais)) {
    const bytes = await Deno.readFile(new URL(`../../../${caminho}`, import.meta.url));
    assert.equal(porId[id].tamanho_bytes, bytes.length, `${id} tamanho`);
    assert.equal(porId[id].sha256, await shaBytes(bytes), `${id} sha256`);
  }
});

void projetos;

// =====================================================================
// Criar pessoa pelo conta_salvar exige CPF (o caminho normal é Enviar Link de Usuário)
// =====================================================================

const BASE_NOVA = { novo: true, nome: "Nina", papel: "gerente", convidar: false, permissoes: {}, papeis: {}, mapeamentos: {} };

Deno.test("conta_salvar novo sem CPF e recusado e nada e gravado", async () => {
  const r = await chamar("conta_salvar", { ...BASE_NOVA, email: "nina@t.com", email_codigo: "nina@t.com" });
  assert.equal(r.status, 400, JSON.stringify(r.corpo));
  assert.match(String(r.corpo.error), /CPF/i);
  assert.equal(A.tabela("fa_gestao_contas").some((c) => c.email === "nina@t.com"), false);
});

Deno.test("conta_salvar novo com CPF invalido e recusado", async () => {
  for (const cpf of ["123", "11111111111", "52998224726", "abc", ""]) {
    const r = await chamar("conta_salvar", { ...BASE_NOVA, email: "nina@t.com", email_codigo: "nina@t.com", cpf });
    assert.equal(r.status, 400, `cpf ${cpf}: ${JSON.stringify(r.corpo)}`);
  }
  assert.equal(A.tabela("fa_gestao_contas").some((c) => c.email === "nina@t.com"), false);
});

Deno.test("conta_salvar novo com CPF de outra conta e recusado com 409", async () => {
  A.tabela("fa_gestao_contas").push({ email: "dono.do.cpf@t.com", nome: "Dono", email_codigo: "dono.do.cpf@t.com", papel: "gerente", ativo: true, auth_modo: "hub", cpf: "52998224725" });
  const r = await chamar("conta_salvar", { ...BASE_NOVA, email: "nina@t.com", email_codigo: "nina@t.com", cpf: "529.982.247-25" });
  assert.equal(r.status, 409, JSON.stringify(r.corpo));
  assert.equal(A.tabela("fa_gestao_contas").some((c) => c.email === "nina@t.com"), false);
});

Deno.test("conta_salvar novo com CPF valido grava o CPF so com digitos", async () => {
  const r = await chamar("conta_salvar", { ...BASE_NOVA, email: "nina@t.com", email_codigo: "nina@t.com", cpf: "246.813.579-28" });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(A.tabela("fa_gestao_contas").find((c) => c.email === "nina@t.com")?.cpf, "24681357928");
});

Deno.test("editar conta existente nao exige CPF nem altera o CPF gravado", async () => {
  const antes = A.tabela("fa_gestao_contas").find((c) => c.email === "nina@t.com")?.cpf;
  const r = await chamar("conta_salvar", { ...BASE_NOVA, novo: false, email: "nina@t.com", email_codigo: "nina@t.com", nome: "Nina Souza", cpf: "11144477735" });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(A.tabela("fa_gestao_contas").find((c) => c.email === "nina@t.com")?.cpf, antes);
});
