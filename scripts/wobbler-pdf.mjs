#!/usr/bin/env node
// Gera public/wobbler/wobbler-20cm.pdf e wobbler-15cm.pdf (tamanho real, 1 disco por página, 3 mm de sangria).
// Uso: node scripts/wobbler-pdf.mjs   (PW_MODULE: caminho do playwright; ?guia=1 na URL desenha a linha de corte)
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
    const out = path.join(ROOT, 'public', 'wobbler', `wobbler-${d}cm.pdf`);
    await page.pdf({ path: out, printBackground: true, preferCSSPageSize: true });
    console.log('PDF gerado:', path.relative(ROOT, out));
  }
  await browser.close();
} finally {
  srv.kill();
}
