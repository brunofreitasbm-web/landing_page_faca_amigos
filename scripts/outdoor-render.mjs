#!/usr/bin/env node
// Renderiza outdoor/led-1200x480.html em MP4 (1200x480, 30fps, 10s, sem áudio).
// Uso: node scripts/outdoor-render.mjs [--quadros 0.5,2,4]   (com --quadros salva só PNGs de conferência)
//
// Variáveis: PW_MODULE (padrão /opt/node-tools/node_modules/playwright/index.mjs)
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PW = process.env.PW_MODULE || '/opt/node-tools/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(PW).href);

const FPS = 30, DUR = 10, W = 1200, H = 480;
const SAIDA = path.join(ROOT, 'outdoor', 'faca-amigos-led-1200x480-10s.mp4');
const iq = process.argv.indexOf('--quadros');
const quadros = iq > 0 ? process.argv[iq + 1].split(',').map(Number) : null;

const PORT = 8890 + Math.floor(Math.random() * 100);
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'outdoor-'));
try {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${PORT}/outdoor/led-1200x480.html?render`);
  await page.evaluate(() => window.__pronto);

  if (quadros) {
    const dir = path.join(ROOT, 'outdoor', 'quadros');
    fs.mkdirSync(dir, { recursive: true });
    for (const t of quadros) {
      await page.evaluate((t) => window.render(t), t);
      await page.screenshot({ path: path.join(dir, `t-${t.toFixed(2)}.png`) });
    }
    console.log('quadros salvos em', dir);
  } else {
    const n = FPS * DUR;
    for (let i = 0; i < n; i++) {
      await page.evaluate((t) => window.render(t), i / FPS);
      await page.screenshot({ path: path.join(tmp, `${String(i).padStart(4, '0')}.png`) });
      if (i % 60 === 0) console.log(`quadro ${i}/${n}`);
    }
    const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(tmp, '%04d.png'),
      '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'slow',
      '-r', String(FPS), '-frames:v', String(n), '-an', '-movflags', '+faststart', SAIDA], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error('ffmpeg falhou');
    console.log('ok ->', SAIDA);
  }
  await browser.close();
} finally {
  srv.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
}
