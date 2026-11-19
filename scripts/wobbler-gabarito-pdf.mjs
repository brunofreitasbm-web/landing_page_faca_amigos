#!/usr/bin/env node
// Gera public/wobbler/gabarito-29cm-A3.pdf (1 folha) e gabarito-29cm-A4.pdf (4 folhas para montar), tamanho real 1:1.
// Uso: node scripts/wobbler-gabarito-pdf.mjs   (PW_MODULE: caminho do playwright)
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PW = process.env.PW_MODULE || '/opt/node-tools/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(PW).href);
const PORT = 8796;
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: path.join(ROOT, 'public'), stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
try {
  const browser = await chromium.launch();
  for (const [mode, name] of [['a3', 'A3'], ['a4', 'A4']]) {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/wobbler/gabarito-29.html?print=${mode}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const out = path.join(ROOT, 'public', 'wobbler', `gabarito-29cm-${name}.pdf`);
    await page.pdf({ path: out, printBackground: true, preferCSSPageSize: true });
    console.log('PDF gerado:', path.relative(ROOT, out));
  }
  await browser.close();
} finally {
  srv.kill();
}
