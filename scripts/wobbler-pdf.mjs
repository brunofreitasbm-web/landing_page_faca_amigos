#!/usr/bin/env node
// Gera public/wobbler/adesivo-20cm.pdf e adesivo-15cm.pdf: A4 em tamanho real, 1 página de gabarito (papel comum)
// + 1 página por adesivo, com a linha de corte (+2 mm do original) e 3 mm de sangria além dela.
// Uso: node scripts/wobbler-pdf.mjs   (PW_MODULE: caminho do playwright)
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PW = process.env.PW_MODULE || '/opt/node-tools/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(PW).href);
const PORT = 8795;
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: path.join(ROOT, 'public'), stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
try {
  const browser = await chromium.launch();
  for (const d of ['20', '15']) {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/wobbler/?print=${d}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const bad = await page.evaluate(() => window.__check());
    if (bad.length) { console.error('Fora da margem de segurança:\n' + bad.join('\n')); process.exitCode = 1; }
    const out = path.join(ROOT, 'public', 'wobbler', `adesivo-${d}cm.pdf`);
    await page.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true });
    console.log('PDF gerado:', path.relative(ROOT, out));
  }
  await browser.close();
} finally {
  srv.kill();
}
