#!/usr/bin/env node
// Atualiza os <lastmod> do sitemap.xml e do sitemap-playground.xml a partir do git (sem dependências, Node 18+).
//   node scripts/sitemap-lastmod.mjs            reescreve o sitemap.xml
//   node scripts/sitemap-lastmod.mjs --check    só confere (código 1 se algum lastmod estiver defasado)
//
// Data de cada URL = data do último commit que mexeu no arquivo da página (git log -1 --format=%cs).
// Se o arquivo tem mudanças ainda não commitadas (ou é novo), usa a data de hoje.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITEMAPS = ['sitemap.xml', 'sitemap-playground.xml'];
const checkOnly = process.argv.includes('--check');

const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

function hoje() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// cleanUrls: "/" -> index.html, "/guia" -> guia.html.
// Exceção (middleware.js): a raiz do subdomínio playground. serve playground.html.
// O arquivo-fonte pode estar em public/ (HTML copiado como está) ou em src/pages/ (página Astro, ainda a migrar).
function arquivoDaUrl(loc) {
  const u = new URL(loc);
  const path = u.pathname.replace(/\/+$/, '');
  let rel;
  if (path === '' && u.hostname.startsWith('playground.')) rel = 'playground.html';
  else if (path === '') rel = 'index.html';
  else {
    rel = path.slice(1);
    // Arquivos com extensão própria (.txt, .json, .xml...) não ganham .html — são servidos como estão.
    if (!/\.[a-z0-9]+$/i.test(rel)) rel += '.html';
  }
  const candidatos = [join('public', rel)];
  if (rel.endsWith('.html')) {
    const base = rel.slice(0, -5);
    candidatos.push(join('src', 'pages', base + '.astro'), join('src', 'pages', base, 'index.astro'));
  }
  return candidatos.find((c) => existsSync(join(root, c))) ?? candidatos[0];
}

function dataDoArquivo(arq) {
  if (git(['status', '--porcelain', '--', arq])) return hoje(); // alterado, novo ou não commitado
  // --follow + --diff-filter=AM: o arquivo foi movido para public/. Um commit que só renomeia (status R) não conta
  // como alteração; sem isso a data de todas as páginas viraria a da mudança de pasta.
  return git(['log', '--follow', '--diff-filter=AM', '-1', '--format=%cs', '--', arq]) || hoje();
}

let defasados = 0;
let semArquivo = 0;
const novos = new Map();

for (const nome of SITEMAPS) {
  const sitemapPath = join(root, 'public', nome);
  const antes = readFileSync(sitemapPath, 'utf8');
  const xml = antes.replace(/<url>[\s\S]*?<\/url>/g, (bloco) => {
    const loc = /<loc>([^<]+)<\/loc>/.exec(bloco)?.[1]?.trim();
    if (!loc) return bloco;
    const arq = arquivoDaUrl(loc);
    if (!existsSync(join(root, arq))) {
      console.warn(`AVISO: ${loc} aponta para ${arq}, que não existe.`);
      semArquivo++;
      return bloco;
    }
    const nova = dataDoArquivo(arq);
    const atual = /<lastmod>([^<]*)<\/lastmod>/.exec(bloco)?.[1];
    if (atual !== nova) {
      defasados++;
      console.log(`${loc}: ${atual ?? '(sem lastmod)'} -> ${nova}  [${arq}]`);
    }
    if (/<lastmod>/.test(bloco)) return bloco.replace(/<lastmod>[^<]*<\/lastmod>/, `<lastmod>${nova}</lastmod>`);
    return bloco.replace('</loc>', `</loc>\n    <lastmod>${nova}</lastmod>`);
  });
  if (xml !== antes) novos.set(sitemapPath, xml);
}

if (checkOnly) {
  console.log(defasados ? `${defasados} lastmod defasado(s).` : 'Sitemaps em dia.');
  process.exit(defasados ? 1 : 0);
}
if (defasados) {
  for (const [caminho, xml] of novos) writeFileSync(caminho, xml);
  console.log(`Sitemaps atualizados (${defasados} lastmod).`);
} else {
  console.log('Sitemaps já estavam em dia.');
}
process.exit(semArquivo ? 1 : 0);
