#!/usr/bin/env node
// Pré-visualiza uma campanha DORMENTE (src/content/campanhas/_<nome>.json) sem ativá-la e sem tocar em dist/.
//   node scripts/preview-campanha.mjs [nome] [--sem-build] [--sem-shots] [--check]
// - Constrói o site com INCLUDE_DORMANT_CAMPAIGNS=<nome> numa pasta à parte (node_modules/.cache/preview-<nome>), que nunca é publicada.
// - Sobe um servidor estático local (cleanUrls) e tira screenshots com Playwright em docs/<nome>-preview/.
// - --check roda scripts/check.mjs (SITE_DIR) contra esse build de pré-visualização.
import { spawnSync, execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, extname, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const nome = args.find((a) => !a.startsWith('--')) ?? 'ritmo';
const flag = (f) => args.includes(f);
if (!/^[a-z0-9-]+$/.test(nome)) { console.error('nome inválido'); process.exit(1); }
if (!existsSync(join(repo, 'src/content/campanhas', `_${nome}.json`))) { console.error(`src/content/campanhas/_${nome}.json não existe (ou já foi ativada: renomeada para ${nome}.json).`); process.exit(1); }
const out = join(repo, 'node_modules/.cache', `preview-${nome}`);
const shots = join(repo, 'docs', `${nome}-preview`);

if (!flag('--sem-build')) {
  rmSync(out, { recursive: true, force: true });
  console.log(`> build de pré-visualização em ${out}`);
  const r = spawnSync('npx', ['astro', 'build', '--outDir', out], { cwd: repo, stdio: 'inherit', env: { ...process.env, INCLUDE_DORMANT_CAMPAIGNS: nome } });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
if (!existsSync(join(out, 'lp', `${nome}.html`))) { console.error(`lp/${nome}.html não saiu no build de pré-visualização.`); process.exit(1); }

if (flag('--check')) {
  const r = spawnSync('node', ['scripts/check.mjs'], { cwd: repo, stdio: 'inherit', env: { ...process.env, SITE_DIR: out } });
  if (r.status !== 0) process.exitCode = r.status ?? 1;
}
if (flag('--sem-shots')) process.exit(process.exitCode ?? 0);

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json', '.ico': 'image/x-icon' };
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  p = normalize(p).replace(/^(\.\.[/\\])+/, '');
  let f = join(out, p);
  if (!existsSync(f) || statSync(f).isDirectory()) f = existsSync(f + '.html') ? f + '.html' : join(f, 'index.html');
  if (!existsSync(f)) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'content-type': TIPOS[extname(f)] ?? 'application/octet-stream' });
  createReadStream(f).pipe(res);
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;

let chromium;
// Playwright global primeiro (os navegadores baixados costumam ser os dele); o do projeto (@playwright/test) é o plano B.
try { ({ chromium } = createRequire(join(execSync('npm root -g').toString().trim(), 'x.js'))('playwright')); }
catch { ({ chromium } = createRequire(import.meta.url)('playwright')); }
mkdirSync(shots, { recursive: true });
const url = `/lp/${nome}?utm_source=instagram&utm_medium=reel&utm_campaign=${nome}-6`;
const browser = await chromium.launch();
const perfis = [
  ['mobile', { width: 390, height: 844 }, true],
  ['desktop', { width: 1280, height: 800 }, false],
];
for (const [rotulo, viewport, mobile] of perfis) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile, locale: 'pt-BR' });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort()); // sem GTM/Clarity/etc.
  const page = await ctx.newPage();
  await page.addInitScript(() => { try { localStorage.setItem('fa_consent', 'essential'); } catch {} });
  await page.goto(base + url, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(shots, `${rotulo}-dobra.png`) });
  // percorre a página para disparar as entradas ao rolar (fa-reveal.js) e esconde a barra fixa só na foto de página inteira
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 300) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } window.scrollTo(0, 0); });
  await page.waitForTimeout(900);
  const ocultar = await page.addStyleTag({ content: '#fa-cta{display:none!important}' });
  await page.screenshot({ path: join(shots, `${rotulo}-pagina.png`), fullPage: true });
  await ocultar.evaluate((el) => el.remove());
  if (mobile) {
    await page.evaluate(() => window.scrollTo(0, 1100));
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(shots, `${rotulo}-barra-fixa.png`) });
    const info = await page.evaluate(() => {
      const bar = document.querySelector('#fa-cta .fa-cta-main');
      const r = bar?.getBoundingClientRect();
      const box = document.getElementById('fa-cta'); return { visivel: !!box && box.classList.contains('on'), noRodapeDaTela: !!box && Math.round(box.getBoundingClientRect().bottom) === innerHeight, barra: !!bar, altura: r && Math.round(r.height), largura: r && Math.round(r.width), href: bar?.href, overflowX: document.documentElement.scrollWidth > innerWidth };
    });
    console.log('barra fixa:', JSON.stringify(info));
    const hero = await page.evaluate(() => { const a = document.querySelector('.lp-hero .btn'); const r = a.getBoundingClientRect(); return { altura: Math.round(r.height), largura: Math.round(r.width), topo: Math.round(r.top), href: a.href }; });
    console.log('botão do topo:', JSON.stringify(hero));
    // clique na barra: o link deve levar a etiqueta de origem
    const href = await page.evaluate(() => { const a = document.querySelector('#fa-cta .fa-cta-main'); a.addEventListener('click', (e) => e.preventDefault(), { once: true }); a.click(); return decodeURIComponent(a.href); });
    console.log('mensagem após clique:', href);
  } else {
    console.log('desktop overflowX:', await page.evaluate(() => document.documentElement.scrollWidth > innerWidth));
  }
  await ctx.close();
}
// primeira visita: banner de cookies sobre a página
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  const page = await ctx.newPage();
  await page.goto(base + url, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(shots, 'mobile-primeira-visita.png') });
  await ctx.close();
}
await browser.close();
server.close();
console.log(`> screenshots em ${shots}`);
