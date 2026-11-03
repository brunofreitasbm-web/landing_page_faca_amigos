#!/usr/bin/env node
// Gera o MP4 da /tv3 para o pen-drive da TV da sala de espera (TV sem navegador).
//
// Uso: node scripts/tv3-video.mjs [--dias 1,2,3,4,5] [--teste] [--giro 90|270|0]
//
// O que faz:
//   1. Abre tv3.html?video=1 (sem relógio, sem data, boas-vindas sem "bom dia" nem dia da semana) em 1080x1920, em pé.
//   2. Uma volta por dia do ciclo (dias 1 a 5, nessa ordem), com a mesma ordem de slides que a TV montaria (seed fixa).
//   3. Cada slide: a entrada animada quadro a quadro (as transições CSS são pausadas e posicionadas, então não
//      depende da velocidade da máquina) e depois o slide parado pelo tempo do roteiro (dur x CONFIG.ritmo).
//   4. Grava video/tv3-master-vertical.mp4 (em pé, alta qualidade) e, dele, o arquivo do pen-drive:
//      video/tv3-sala-de-espera.mp4, 1920x1080 com o conteúdo já girado para a TV em pé.
//
// Giro: a TV da sala é uma Roku em pé com a borda de baixo original do lado DIREITO (foi girada no sentido anti-horário).
// O player USB mostra o vídeo deitado, então o conteúdo vai girado 90° no sentido horário (--giro 90, o padrão).
// Se na TV a imagem aparecer de cabeça para baixo, rode de novo com --giro 270 --so-girar (não renderiza de novo).
//
// --teste      gera só video/tv3-teste-rotacao.mp4 (15 s, com seta "ESTE LADO PARA CIMA") para conferir o giro na TV
// --so-girar   não renderiza: só refaz o arquivo final a partir do master já gravado
//
// Precisa de ffmpeg e do Playwright (PW_MODULE, padrão /opt/node-tools/node_modules/playwright/index.mjs).
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = process.env.TV3_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PW = process.env.PW_MODULE || '/opt/node-tools/node_modules/playwright/index.mjs';
const OUT = path.join(ROOT, 'video');
const FPS = 30;
const ENTRADA_S = 1.8; // as transições de entrada mais longas terminam em ~1,6 s (tv3.html, #tvStage.anim)

const args = process.argv.slice(2);
const opt = (nome, padrao) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : padrao; };
const TESTE = args.includes('--teste');
const SO_GIRAR = args.includes('--so-girar');
const GIRO = +opt('--giro', '90');
const DIAS = opt('--dias', '1,2,3,4,5').split(',').map(Number).filter((d) => d >= 1 && d <= 5);
const filtroGiro = GIRO === 90 ? 'transpose=1' : GIRO === 270 ? 'transpose=2' : 'null';

fs.mkdirSync(OUT, { recursive: true });
const MASTER = path.join(OUT, TESTE ? 'tv3-teste-master.mp4' : 'tv3-master-vertical.mp4');
const FINAL = path.join(OUT, TESTE ? 'tv3-teste-rotacao.mp4' : 'tv3-sala-de-espera.mp4');

function ffmpeg(argv, stdin = false) {
  const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...argv], { stdio: [stdin ? 'pipe' : 'ignore', 'inherit', 'inherit'] });
  const fim = new Promise((ok, erro) => p.on('close', (c) => (c === 0 ? ok() : erro(new Error('ffmpeg saiu com ' + c)))));
  return { p, fim };
}

async function renderizar() {
  const { chromium } = await import(pathToFileURL(PW).href);
  const PORT = 8890 + Math.floor(Math.random() * 100);
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: path.join(ROOT, 'public'), stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 900));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();

  // master em pé: MJPEG pelo stdin, H.264 de alta qualidade (a compressão final é feita depois, no giro)
  const enc = ffmpeg(['-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-tune', 'stillimage', '-crf', '14', '-pix_fmt', 'yuv420p', '-r', String(FPS), MASTER], true);
  let quadros = 0;
  const escrever = async (buf, vezes = 1) => {
    for (let i = 0; i < vezes; i++) {
      quadros++;
      if (!enc.p.stdin.write(buf)) await new Promise((r) => enc.p.stdin.once('drain', r));
    }
  };
  const foto = () => page.screenshot({ type: 'jpeg', quality: 95 });

  const dias = TESTE ? [1] : DIAS;
  let totalSeg = 0;
  for (const dia of dias) {
    await page.goto(`http://127.0.0.1:${PORT}/tv3.html?video=1&som=0&orientacao=vertical&debug=1&seed=video-d${dia}&dia=${dia}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.TV3 && document.fonts.status === 'loaded');
    const ritmo = await page.evaluate(() => { TV3.parar(); return TV3.CONFIG.ritmo; });
    let volta = await page.evaluate(() => { TV3.state.round = TV3.buildRound(); return TV3.state.round.map((s) => ({ id: s.id, dur: s.dur })); });
    if (TESTE) volta = volta.slice(0, 1).map((s) => ({ ...s, dur: 15 / ritmo }));
    console.log(`dia ${dia}: ${volta.length} slides, ${(volta.reduce((a, s) => a + s.dur, 0) * ritmo / 60).toFixed(1)} min`);

    for (let i = 0; i < volta.length; i++) {
      const s = volta[i];
      // troca com a transição normal, já pausada: as animações ficam paradas no início e são avançadas quadro a quadro
      await page.evaluate(async (idx) => {
        const item = TV3.state.round[idx];
        await TV3.tocar(item);
        await new Promise((r) => { const ver = () => (document.querySelector('.tv-slide.active') ? r() : requestAnimationFrame(ver)); ver(); });
        getComputedStyle(document.body).opacity; // força o cálculo de estilo para as transições existirem
        window.__anims = document.getAnimations();
        window.__anims.forEach((a) => { a.pause(); a.currentTime = 0; });
      }, i);
      if (TESTE) await page.evaluate(() => {
        const d = document.createElement('div');
        d.textContent = '▲ ESTE LADO PARA CIMA ▲';
        d.style.cssText = 'position:absolute;top:150px;left:0;right:0;text-align:center;font:900 72px sans-serif;color:#fff;background:#E01560;padding:24px;z-index:99';
        document.getElementById('tvStage').appendChild(d);
      });
      const nEntrada = Math.round(ENTRADA_S * FPS);
      for (let k = 0; k < nEntrada; k++) {
        await page.evaluate((t) => window.__anims.forEach((a) => { try { a.currentTime = t; } catch (e) {} }), (k * 1000) / FPS);
        await escrever(await foto());
      }
      await page.evaluate(() => {
        window.__anims.forEach((a) => { try { a.finish(); } catch (e) {} });
        document.querySelectorAll('.tv-slide.saindo').forEach((x) => x.remove());
      });
      const parado = await foto();
      const totalQ = Math.round(s.dur * ritmo * FPS);
      await escrever(parado, Math.max(1, totalQ - nEntrada));
      totalSeg += s.dur * ritmo;
      process.stdout.write(`  ${i + 1}/${volta.length} ${s.id}\n`);
    }
  }
  enc.p.stdin.end();
  await enc.fim;
  await browser.close();
  srv.kill();
  console.log(`master: ${MASTER} (${quadros} quadros, ${(totalSeg / 60).toFixed(1)} min)`);
}

async function girar() {
  // arquivo do pen-drive: H.264 High 4.1, yuv420p, 30 fps, sem áudio, moov no início (abre em quase toda TV com USB)
  await ffmpeg(['-i', MASTER, '-vf', filtroGiro, '-an', '-c:v', 'libx264', '-preset', 'slow', '-tune', 'stillimage', '-crf', '20',
    '-profile:v', 'high', '-level', '4.1', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-g', String(FPS * 4), '-movflags', '+faststart', FINAL]).fim;
  const mb = (fs.statSync(FINAL).size / 1e6).toFixed(0);
  console.log(`pen-drive: ${FINAL} (${mb} MB, giro ${GIRO})`);
}

if (!SO_GIRAR) await renderizar();
await girar();
