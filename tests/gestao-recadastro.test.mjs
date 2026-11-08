// Página #recadastro e bloco "Recadastro" do owner (public/gestao.html) com a API do Hub simulada.
// Rodar: node --test tests/gestao-recadastro.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const HTML = readFileSync(new URL('../public/gestao.html', import.meta.url), 'utf8');
const API = 'https://ivjvpdzsfjdpyabbzzuj.supabase.co/functions/v1/gestao-hub';
const SHOT = '/tmp/claude-0/-home-user/087972d1-dce6-50fa-b3f2-4b3af4bf1e14/scratchpad/recadastro-390.png';

let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); });

// hash: o que vem depois de gestao.html; comToken: sessão do Hub no localStorage.
async function abrir(respostas, { hash = '', comToken = false, largura = 1200 } = {}) {
  const page = await browser.newPage({ viewport: { width: largura, height: 900 }, deviceScaleFactor: 1 });
  const chamadas = [];
  await page.route('http://hub.test/**', (route) => {
    if (route.request().url().split('#')[0].endsWith('/gestao.html')) return route.fulfill({ contentType: 'text/html', body: HTML });
    return route.fulfill({ status: 404, body: '' });
  });
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route(API, async (route) => {
    const corpo = JSON.parse(route.request().postData() || '{}');
    chamadas.push(corpo);
    const f = respostas[corpo.action];
    const resp = f ? f(corpo, chamadas) : { status: 400, body: { error: 'ação não simulada' } };
    await route.fulfill({ status: resp.status ?? 200, contentType: 'application/json', body: JSON.stringify(resp.body ?? resp) });
  });
  if (comToken) {
    await page.addInitScript(() => {
      localStorage.setItem('fa_gestao_token', 'tok-owner');
      localStorage.setItem('fa_gestao_expires', new Date(Date.now() + 3600e3).toISOString());
    });
  }
  await page.goto('http://hub.test/gestao.html' + hash);
  return { page, chamadas };
}

const CONSULTA = (extra = {}) => () => ({
  nome: 'Carla Dias', dias_restantes: 5, bloquear: false, voltar_url: 'https://evil.test/x', pagina: 'pag-1', ...extra,
});
const ME_OWNER = (extra = {}) => () => ({ nome: 'Bruno', email: 'bruno@t.com', papel: 'owner', apps: {}, niveis: {}, pode_gerir_equipe: true, ...extra });
const CPF = '52998224725';

test('fluxo_completo_cpf_email_codigo', async () => {
  const { page, chamadas } = await abrir({
    recadastro_consultar: CONSULTA(),
    recadastro_enviar_codigo: () => ({ challenge_id: 'ch-1' }),
    recadastro_confirmar: () => ({ ok: true }),
  }, { hash: '#recadastro&c=abc123' });
  await page.waitForSelector('#recadForm1:not([hidden])');
  assert.equal(chamadas[0].action, 'recadastro_consultar');
  assert.equal(chamadas[0].c, 'abc123');
  // O código do link não fica na barra de endereço.
  assert.equal(new URL(page.url()).hash, '#recadastro');
  assert.match(await page.textContent('#recadIntro'), /Carla/);

  await page.type('#recad-cpf', CPF);
  assert.equal(await page.inputValue('#recad-cpf'), '529.982.247-25');
  await page.fill('#recad-email', ' Carla@T.com ');
  await page.click('#recadEnviar');
  await page.waitForSelector('#recadForm2:not([hidden])');
  const env = chamadas.find((c) => c.action === 'recadastro_enviar_codigo');
  assert.equal(env.pagina, 'pag-1');
  assert.equal(env.cpf, CPF);
  assert.equal(env.email, 'carla@t.com');
  assert.equal(env.c, undefined);

  await page.fill('#recad-codigo', '12a3b4');
  assert.equal(await page.inputValue('#recad-codigo'), '1234');
  await page.fill('#recad-codigo', '123456');
  await page.click('#recadConfirmar');
  await page.waitForSelector('#recadSucesso:not([hidden])');
  const conf = chamadas.find((c) => c.action === 'recadastro_confirmar');
  assert.deepEqual([conf.pagina, conf.challenge_id, conf.code], ['pag-1', 'ch-1', '123456']);
  assert.match(await page.textContent('#recadSucesso'), /Concluído, você já pode voltar ao sistema/);
  // Quem veio de sistema não é redirecionado nem recebe link vindo do servidor.
  assert.equal(await page.locator('#recadSucesso a').count(), 0);
  assert.equal(await page.locator('#recadContinuar').isVisible(), false);
  await page.waitForTimeout(300);
  assert.match(page.url(), /^http:\/\/hub\.test\/gestao\.html/);
  assert.equal(await page.content().then((h) => h.includes('evil.test')), false);
  await page.close();
});

test('fluxo_do_hub_com_sessao_e_volta_ao_painel', async () => {
  const { page, chamadas } = await abrir({
    recadastro_consultar: CONSULTA(),
    recadastro_enviar_codigo: () => ({ challenge_id: 'ch-1' }),
    recadastro_confirmar: () => ({ ok: true }),
    me: ME_OWNER({ recadastro: { pendente: false, bloquear: false, dias_restantes: 7 } }),
    recadastro_painel: () => ({ resumo: { concluidos: 0, pendentes: 0, bloqueados: 0 }, pendentes: [], conflitos: [] }),
  }, { hash: '#recadastro', comToken: true });
  await page.waitForSelector('#recadForm1:not([hidden])');
  assert.equal(chamadas[0].c, undefined);
  await page.fill('#recad-cpf', CPF);
  await page.fill('#recad-email', 'carla@t.com');
  await page.click('#recadEnviar');
  await page.fill('#recad-codigo', '123456');
  await page.click('#recadConfirmar');
  await page.waitForSelector('#recadContinuar:not([hidden])');
  await page.click('#recadContinuar');
  await page.waitForSelector('#hubScreen:not([hidden])');
  assert.equal(await page.locator('#recadScreen').isVisible(), false);
  await page.close();
});

test('sem_codigo_e_sem_sessao_mostra_login_sem_erro_tecnico', async () => {
  const { page, chamadas } = await abrir({}, { hash: '#recadastro' });
  await page.waitForSelector('#recadIrLogin:not([hidden])');
  assert.equal(chamadas.length, 0);
  assert.match(await page.textContent('#recadErro'), /entre pelo login/);
  await page.click('#recadIrLogin');
  await page.waitForSelector('#loginScreen:not([hidden])');
  await page.close();
});

test('login_com_pendencia_abre_recadastro', async () => {
  const { page, chamadas } = await abrir({
    me: ME_OWNER({ recadastro: { pendente: true, bloquear: false, dias_restantes: 4 } }),
    recadastro_consultar: CONSULTA(),
  }, { comToken: true });
  await page.waitForSelector('#recadForm1:not([hidden])');
  assert.equal(new URL(page.url()).hash, '#recadastro');
  assert.equal(await page.locator('#hubScreen').isVisible(), false);
  assert.equal(chamadas.find((c) => c.action === 'recadastro_consultar').c, undefined);
  await page.close();
});

test('fazer_depois_some_quando_bloquear', async () => {
  // Bloqueando: o botão nem existe no DOM.
  let { page } = await abrir({ recadastro_consultar: CONSULTA({ bloquear: true, dias_restantes: 0 }) }, { hash: '#recadastro&c=x' });
  await page.waitForSelector('#recadForm1:not([hidden])');
  assert.equal(await page.locator('#recadAdiar').count(), 0);
  assert.equal(await page.getByText('Fazer depois').count(), 0);
  await page.close();
  // Sem bloquear mas sem dias: também não.
  ({ page } = await abrir({ recadastro_consultar: CONSULTA({ bloquear: false, dias_restantes: 0 }) }, { hash: '#recadastro&c=x' }));
  await page.waitForSelector('#recadForm1:not([hidden])');
  assert.equal(await page.locator('#recadAdiar').count(), 0);
  await page.close();
  // Sem bloquear e com prazo: existe e chama recadastro_adiar.
  const r = await abrir({
    recadastro_consultar: CONSULTA({ bloquear: false, dias_restantes: 3 }),
    recadastro_adiar: () => ({ ok: true }),
  }, { hash: '#recadastro&c=x' });
  await r.page.waitForSelector('#recadAdiar');
  await r.page.click('#recadAdiar');
  await r.page.waitForSelector('#recadSucesso:not([hidden])');
  assert.equal(r.chamadas.find((c) => c.action === 'recadastro_adiar').pagina, 'pag-1');
  assert.match(await r.page.textContent('#recadSucesso'), /voltar ao sistema/);
  await r.page.close();
});

test('erro_de_conflito_mostra_mensagem_generica', async () => {
  const { page } = await abrir({
    recadastro_consultar: CONSULTA(),
    recadastro_enviar_codigo: () => ({ status: 409, body: { error: 'CPF 52998224725 já é de Maria Souza (maria@t.com)' } }),
  }, { hash: '#recadastro&c=x' });
  await page.waitForSelector('#recadForm1:not([hidden])');
  await page.fill('#recad-cpf', CPF);
  await page.fill('#recad-email', 'carla@t.com');
  await page.click('#recadEnviar');
  await page.waitForSelector('#recadErro.show');
  const txt = await page.textContent('#recadErro');
  assert.match(txt, /O responsável foi avisado/);
  assert.doesNotMatch(txt, /Maria|maria@|52998224725/);
  assert.equal(await page.locator('#recadForm2').isVisible(), false);
  await page.close();
});

test('erros_de_codigo_e_de_rede_nunca_travam', async () => {
  let envios = 0;
  let tentativaConfirmar = 0;
  const { page } = await abrir({
    recadastro_consultar: CONSULTA(),
    recadastro_enviar_codigo: () => (++envios === 1 ? { status: 503, body: { error: 'boom interno' } } : { challenge_id: 'ch-1' }),
    recadastro_confirmar: () => {
      tentativaConfirmar++;
      if (tentativaConfirmar === 1) return { status: 401, body: { error: 'código incorreto (restam 3 tentativas)' } };
      return { status: 401, body: { error: 'tentativas esgotadas, comece de novo', reiniciar: true } };
    },
  }, { hash: '#recadastro&c=x' });
  await page.waitForSelector('#recadForm1:not([hidden])');
  await page.fill('#recad-cpf', CPF);
  await page.fill('#recad-email', 'carla@t.com');
  await page.click('#recadEnviar');
  await page.waitForSelector('#recadErro.show');
  let txt = await page.textContent('#recadErro');
  assert.match(txt, /tente de novo/);
  assert.doesNotMatch(txt, /boom/);
  assert.equal(await page.locator('#recadEnviar').isEnabled(), true);
  await page.click('#recadEnviar'); // segunda tentativa funciona
  await page.waitForSelector('#recadForm2:not([hidden])');
  await page.fill('#recad-codigo', '111111');
  await page.click('#recadConfirmar');
  await page.waitForFunction(() => document.getElementById('recadErro').classList.contains('show'));
  txt = await page.textContent('#recadErro');
  assert.match(txt, /Código incorreto/);
  assert.doesNotMatch(txt, /restam|3/);
  await page.fill('#recad-codigo', '222222');
  await page.click('#recadConfirmar');
  await page.waitForSelector('#recadForm1:not([hidden])'); // reiniciar volta ao passo 1
  assert.match(await page.textContent('#recadErro'), /Peça um novo código/);
  await page.close();
});

test('consulta_com_erro_de_rede_oferece_tentar_de_novo', async () => {
  let n = 0;
  const { page } = await abrir({
    recadastro_consultar: () => (++n === 1 ? { status: 500, body: {} } : CONSULTA()()),
  }, { hash: '#recadastro&c=x' });
  await page.waitForSelector('#recadTentar:not([hidden])');
  await page.click('#recadTentar');
  await page.waitForSelector('#recadForm1:not([hidden])');
  await page.close();
});

test('sem_rolagem_horizontal_390px', async () => {
  const semRolagem = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  const { page } = await abrir({
    recadastro_consultar: CONSULTA({ nome: 'Maria Aparecida de Souza Albuquerque Nogueira' }),
    recadastro_enviar_codigo: () => ({ challenge_id: 'ch-1' }),
    recadastro_confirmar: () => ({ ok: true }),
  }, { hash: '#recadastro&c=x', largura: 390 });
  await page.waitForSelector('#recadForm1:not([hidden])');
  assert.equal(await semRolagem(page), true);
  await page.fill('#recad-cpf', CPF);
  await page.fill('#recad-email', 'maria.aparecida.souza@exemplo.com.br');
  await page.screenshot({ path: SHOT, fullPage: false });
  await page.click('#recadEnviar');
  await page.waitForSelector('#recadForm2:not([hidden])');
  assert.equal(await semRolagem(page), true);
  await page.fill('#recad-codigo', '123456');
  await page.click('#recadConfirmar');
  await page.waitForSelector('#recadSucesso:not([hidden])');
  assert.equal(await semRolagem(page), true);
  await page.close();
});

const PAINEL = () => ({
  resumo: { concluidos: 3, pendentes: 2, bloqueados: 1 },
  pendentes: [
    { nome: 'Ana Souza', origem: 'hub', dias_restantes: 4 },
    { nome: 'Beto Lima', origem: 'clinica/rh', dias_restantes: 0 },
  ],
  conflitos: [{
    id: '11111111-1111-4111-8111-111111111111', motivo: 'cpf_de_outra_pessoa',
    criado_em: '2026-11-08T12:00:00Z', cpf: '***.***.***-25', email_informado: 'carla@t.com',
  }],
});

test('owner_ve_painel_e_resolve_conflito', async () => {
  let baixa = false;
  const { page, chamadas } = await abrir({
    me: ME_OWNER(),
    contas_listar: () => ({ contas: [], modulos: [] }),
    recadastro_painel: () => (baixa ? { ...PAINEL(), conflitos: [], resumo: { concluidos: 3, pendentes: 2, bloqueados: 1 } } : PAINEL()),
    recadastro_resolver: () => { baixa = true; return { ok: true }; },
  }, { comToken: true });
  await page.click('#pessoasBtn');
  await page.waitForSelector('#recadConflitos button');
  const bloco = await page.textContent('#recadPainel');
  assert.match(bloco, /só depois de resolver o caso à mão/);
  assert.match(await page.textContent('#recadResumo'), /Concluídos/);
  assert.match(await page.textContent('#recadResumo'), /de 5 pessoas \(60%\)/); // todo número vem com referência
  assert.match(await page.textContent('#recadPendentes'), /Ana Souza.*Hub.*4 dias restantes/s);
  assert.match(await page.textContent('#recadPendentes'), /Beto Lima.*Clínica\/RH.*Prazo encerrado/s);
  const conf = await page.textContent('#recadConflitos');
  assert.match(conf, /CPF já usado por outra pessoa/);
  assert.match(conf, /\*\*\*\.\*\*\*\.\*\*\*-25/);
  assert.match(conf, /carla@t\.com/);
  await page.click('#recadConflitos button:has-text("Dar baixa")');
  await page.waitForSelector('#recadConflitos .recad-vazio');
  const res = chamadas.find((c) => c.action === 'recadastro_resolver');
  assert.equal(res.id, '11111111-1111-4111-8111-111111111111');
  assert.equal(chamadas.filter((c) => c.action === 'recadastro_painel').length, 2);
  await page.close();
});

test('painel_do_owner_a_390px_sem_rolagem_horizontal', async () => {
  const { page } = await abrir({
    me: ME_OWNER(),
    contas_listar: () => ({ contas: [], modulos: [] }),
    recadastro_painel: PAINEL,
  }, { comToken: true, largura: 390 });
  await page.click('#pessoasBtn');
  await page.waitForSelector('#recadConflitos button');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.close();
});

test('nao_usa_innerHTML_com_dados_do_servidor', async () => {
  const MAU = '<img src=x onerror="window.__pwn=1">Eva';
  // Página de recadastro: o nome vem do servidor.
  let { page } = await abrir({ recadastro_consultar: CONSULTA({ nome: MAU, voltar_url: 'javascript:window.__pwn=2' }) }, { hash: '#recadastro&c=x' });
  await page.waitForSelector('#recadForm1:not([hidden])');
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.__pwn), undefined);
  assert.equal(await page.locator('#recadScreen img[src="x"]').count(), 0);
  assert.ok((await page.textContent('#recadIntro')).includes('<img'));
  await page.close();
  // Painel do owner: nome, e-mail informado e motivo vêm do servidor.
  ({ page } = await abrir({
    me: ME_OWNER(),
    contas_listar: () => ({ contas: [], modulos: [] }),
    recadastro_painel: () => ({
      resumo: { concluidos: 0, pendentes: 1, bloqueados: 0 },
      pendentes: [{ nome: MAU, origem: '<b onclick="window.__pwn=3">x</b>', dias_restantes: 2 }],
      conflitos: [{ id: '11111111-1111-4111-8111-111111111111', motivo: '<img src=x onerror="window.__pwn=4">',
        criado_em: '2026-11-08T12:00:00Z', cpf: '<img src=x onerror="window.__pwn=5">', email_informado: MAU }],
    }),
  }, { comToken: true }));
  await page.click('#pessoasBtn');
  await page.waitForSelector('#recadConflitos button');
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.__pwn), undefined);
  assert.equal(await page.locator('#recadPainel img').count(), 0);
  assert.equal(await page.locator('#recadPainel b[onclick]').count(), 0);
  assert.ok((await page.textContent('#recadPendentes')).includes(MAU));
  assert.ok((await page.textContent('#recadConflitos')).includes(MAU));
  await page.close();
});
