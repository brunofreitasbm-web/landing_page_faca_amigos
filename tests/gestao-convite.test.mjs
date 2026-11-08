// Tela "Enviar Link de Usuário" (public/gestao.html) com a API do Hub simulada: nada sai da máquina.
// Rodar: node --test tests/gestao-convite.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const HTML = readFileSync(new URL('../public/gestao.html', import.meta.url), 'utf8');
const API = 'https://ivjvpdzsfjdpyabbzzuj.supabase.co/functions/v1/gestao-hub';

let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); });

async function abrir(respostas, largura = 1200) {
  const page = await browser.newPage({ viewport: { width: largura, height: 900 } });
  const chamadas = [];
  await page.route('http://hub.test/**', (route) => {
    const url = route.request().url();
    if (url.endsWith('/gestao.html')) return route.fulfill({ contentType: 'text/html', body: HTML });
    return route.fulfill({ status: 404, body: '' });
  });
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route(API, async (route) => {
    const corpo = JSON.parse(route.request().postData() || '{}');
    chamadas.push(corpo);
    const f = respostas[corpo.action];
    const resp = f ? f(corpo) : { status: 400, body: { error: 'ação não simulada' } };
    await route.fulfill({ status: resp.status ?? 200, contentType: 'application/json', body: JSON.stringify(resp.body ?? resp) });
  });
  await page.addInitScript(() => {
    localStorage.setItem('fa_gestao_token', 'tok-owner');
    localStorage.setItem('fa_gestao_expires', new Date(Date.now() + 3600e3).toISOString());
  });
  await page.goto('http://hub.test/gestao.html');
  return { page, chamadas };
}

const ME = () => ({ nome: 'Bruno', email: 'bruno@t.com', papel: 'owner', apps: {}, niveis: {}, pode_gerir_equipe: true });

test('monta_payload_multi_sistema', async () => {
  const { page, chamadas } = await abrir({
    me: ME,
    pessoa_buscar: () => ({ pessoas: [] }),
    convite_link_gerar: () => ({ ok: true, token: 't', link: 'https://gestao/#cadastro?token=t', email_enviado: true,
      convite: { sistema: 'clinica', sistema_nome: 'Clínica', sistema_url: 'https://sistema' },
      itens: [{ sistema: 'clinica', sistema_nome: 'Clínica' }, { sistema: 'playground', sistema_nome: 'Playground' }] }),
  });
  await page.click('#btnAbrirCriarLink');
  await page.fill('#txtDestinatarioNome', 'Carla Dias');
  await page.fill('#txtDestinatarioCpf', '529.982.247-25');
  await page.fill('#txtDestinatarioEmail', 'carla@t.com');
  const linhas = page.locator('.item-convite');
  await linhas.nth(0).locator('.item-sistema').selectOption('clinica');
  await linhas.nth(0).locator('.item-nivel').selectOption('admin');
  await page.click('#btnAddSistema');
  await linhas.nth(1).locator('.item-sistema').selectOption('playground');
  await linhas.nth(1).locator('.item-nivel').selectOption('operar');
  await linhas.nth(1).locator('.item-unidades').fill('Circuito, Parque');
  await page.click('#btnSubmitGerarLink');
  await page.waitForSelector('#boxLinkGerado:not([hidden])');
  const env = chamadas.find((c) => c.action === 'convite_link_gerar');
  assert.equal(env.cpf, '529.982.247-25');
  assert.equal(env.destinatario_email, 'carla@t.com');
  assert.deepEqual(env.itens.map((i) => [i.sistema, i.nivel]), [['clinica', 'admin'], ['playground', 'operar']]);
  assert.deepEqual(env.itens[1].unidades, ['Circuito', 'Parque']);
  assert.match(await page.textContent('#resSistemaNome'), /Clínica.*Playground/);
  await page.close();
});

test('rh_mostra_empresa', async () => {
  const { page } = await abrir({ me: ME, pessoa_buscar: () => ({ pessoas: [] }) });
  await page.click('#btnAbrirCriarLink');
  const linha = page.locator('.item-convite').first();
  assert.equal(await linha.locator('.item-escopo-grupo').isVisible(), false);
  await linha.locator('.item-sistema').selectOption('rh');
  assert.equal(await linha.locator('.item-escopo-grupo').isVisible(), true);
  await page.close();
});

test('busca_mostra_duplicados', async () => {
  const { page, chamadas } = await abrir({
    me: ME,
    pessoa_buscar: () => ({ pessoas: [{ origem: 'clinica', nome: 'Ana Souza', cpf: '***.456.789-**', email: 'ana@t.com' }] }),
  });
  await page.click('#btnAbrirCriarLink');
  await page.fill('#txtDestinatarioNome', 'souz');
  await page.waitForSelector('#avisoDuplicados:not([hidden])');
  assert.match(await page.textContent('#avisoDuplicados'), /Possível cadastro existente/);
  assert.match(await page.textContent('#avisoDuplicados'), /Ana Souza/);
  assert.equal(chamadas.find((c) => c.action === 'pessoa_buscar').termo, 'souz');
  await page.close();
});

test('celular_sem_rolagem_horizontal', async () => {
  const { page } = await abrir({ me: ME, pessoa_buscar: () => ({ pessoas: [] }) }, 390);
  await page.click('#btnAbrirCriarLink');
  await page.click('#btnAddSistema');
  const larga = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(larga, false);
  // Nenhum campo do convite pode passar da borda do card do modal.
  const vaza = await page.evaluate(() => {
    const card = document.querySelector('#modalCriarLink .modal-card').getBoundingClientRect();
    return [...document.querySelectorAll('#formGerarLinkConvite .form-control')]
      .some((el) => el.getBoundingClientRect().right > card.right + 0.5);
  });
  assert.equal(vaza, false);
  await page.screenshot({ path: process.env.SHOT || '/dev/null', fullPage: false }).catch(() => {});
  await page.close();
});
