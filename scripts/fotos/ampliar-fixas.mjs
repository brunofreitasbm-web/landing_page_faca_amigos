#!/usr/bin/env node
// Gera versões 4K das fotos fixas da tv2 (public/img/tv2hd/) a partir das melhores fontes locais.
// Não recupera detalhe que o arquivo não tem: faz a ampliação offline (Lanczos + nitidez leve), que
// fica mais limpa que o esticão bilinear que o navegador da TV faria. Quando a fotógrafa entregar
// os originais, troque a fonte em FONTES e rode de novo: `node ampliar-fixas.mjs`.
// Alvo: a foto cobre o quadro 1080x1180 do palco, em 2x (TV 4K), com margem de 6% para o zoom.
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
const SAIDA = 'img/tv2hd';
// nome da slide → arquivo-fonte (sem extensão). Fontes maiores do mesmo quadro, quando existem.
const FONTES = {
  'circuito-cachorro-buggy': 'img/tv3/circuito-cachorro-pelucia-v',
  'circuito-macaco': 'img/tv3/circuito-macaco-lambo-v',
};

const html = readFileSync(join(RAIZ, 'tv2.html'), 'utf8');
const nomes = [...new Set([...html.matchAll(/image: 'img\/(circuito-[^']+)'/g)].map((m) => m[1]))]
  .filter((n) => !n.startsWith('tv2hd/'));
mkdirSync(join(RAIZ, SAIDA), { recursive: true });

for (const n of nomes) {
  const fonte = join(RAIZ, `${FONTES[n] || `img/${n}`}.webp`);
  const { width: w, height: h } = await sharp(fonte).metadata();
  const k = Math.max(1080 / w, 1180 / h) * 2 * 1.06;
  const W = Math.round(w * k), H = Math.round(h * k);
  const base = () => sharp(fonte).resize(W, H, { kernel: 'lanczos3' }).sharpen({ sigma: 1.1, m1: 0.6, m2: 1.5 });
  await base().webp({ quality: 88 }).toFile(join(RAIZ, SAIDA, `${n}.webp`));
  await base().jpeg({ quality: 88, mozjpeg: true }).toFile(join(RAIZ, SAIDA, `${n}.jpg`));
  console.log(`${n}: ${w}x${h} → ${W}x${H}`);
}
