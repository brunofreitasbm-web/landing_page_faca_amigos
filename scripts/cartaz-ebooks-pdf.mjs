#!/usr/bin/env node
// Gera public/cartaz-ebooks/cartaz-ebooks-a5.pdf (para imprimir) a partir de public/cartaz-ebooks/index.html.
// Uso: node scripts/cartaz-ebooks-pdf.mjs   (PW_MODULE: caminho do playwright, padrão /opt/node-tools/node_modules/playwright/index.mjs)
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PW = process.env.PW_MODULE || '/opt/node-tools/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(PW).href);
const PORT = 8793;
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: path.join(ROOT, 'public'), stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
try {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/cartaz-ebooks/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const out = path.join(ROOT, 'public', 'cartaz-ebooks', 'cartaz-ebooks-a5.pdf');
  await page.pdf({ path: out, format: 'A5', printBackground: true, preferCSSPageSize: true });
  await browser.close();
  console.log('PDF gerado:', path.relative(ROOT, out));
} finally {
  srv.kill();
}
