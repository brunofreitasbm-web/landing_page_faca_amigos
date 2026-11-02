#!/usr/bin/env node
// Avisa Bing, Yandex, Seznam e Naver (protocolo IndexNow) que páginas do sitemap mudaram. Sem dependências (Node 18+).
//   node scripts/indexnow.mjs <base> [head]   envia só as páginas cujo .html mudou entre os dois commits (git diff)
//   node scripts/indexnow.mjs --all           envia todas as URLs do sitemap.xml
//   --dry                                     só lista o que seria enviado
//
// Chave: o arquivo <chave>.txt na raiz do site (público por definição do protocolo; não é segredo).
// Diferente do bing-submit.mjs, não precisa de API key nem de conta: qualquer mecanismo IndexNow repassa aos demais.
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const todas = args.includes('--all');
const [base, head = 'HEAD'] = args.filter((a) => !a.startsWith('--'));

const arqChave = readdirSync(join(root, 'public')).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
if (!arqChave) {
  console.error('Arquivo de chave IndexNow (<32 hex>.txt) não encontrado na raiz.');
  process.exit(1);
}
const key = readFileSync(join(root, 'public', arqChave), 'utf8').trim();

const sitemap = [...readFileSync(join(root, 'public', 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
const origem = new URL(sitemap[0]).origin;

// index.html -> /, playground.html -> /playground, aprender/x.html -> /aprender/x (cleanUrls da Vercel)
// Fonte -> caminho do site: public/x.html -> x.html, src/pages/x.astro -> x.html (páginas dinâmicas [x] ficam de fora).
const caminhoDoSite = (f) => {
  if (f.startsWith('public/') && f.endsWith('.html')) return f.slice('public/'.length);
  const pg = /^src\/data\/paginas\/([^/.]+)\.(?:json|html|\d+\.js)$/.exec(f); // glossário, termos, política, índice, 404
  if (pg) return `${pg[1]}.html`;
  const dado = /^src\/data\/aprender\/([^/]+)\.(?:json|html)$/.exec(f); // artigos de /aprender
  if (dado) return `aprender/${dado[1]}.html`;
  if (f.startsWith('src/pages/') && f.endsWith('.astro') && !f.includes('[')) return f.slice('src/pages/'.length, -'.astro'.length) + '.html';
  return null;
};
const urlDe = (arq) => origem + '/' + arq.replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '');

let urls;
if (todas) {
  urls = sitemap;
} else {
  if (!base || /^0+$/.test(base)) {
    console.log('Sem commit base (primeiro push?): nada a enviar. Use --all para enviar tudo.');
    process.exit(0);
  }
  const mudados = execFileSync('git', ['diff', '--name-only', '--diff-filter=AM', base, head], { cwd: root, encoding: 'utf8' })
    .split('\n').map(caminhoDoSite).filter(Boolean);
  urls = [...new Set(mudados.map(urlDe))].filter((u) => sitemap.includes(u));
}

if (!urls.length) {
  console.log('Nenhuma página do sitemap mudou.');
  process.exit(0);
}
console.log(`${urls.length} URL(s):\n  ${urls.join('\n  ')}`);
if (dry) process.exit(0);

const r = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: new URL(origem).host, key, keyLocation: `${origem}/${arqChave}`, urlList: urls }),
});
// 200 = recebido; 202 = recebido, chave ainda em validação. 403/422 = chave ou host inválidos.
console.log(r.ok ? `IndexNow: ${r.status} OK` : `IndexNow: erro ${r.status} ${await r.text()}`);
if (!r.ok) process.exit(1);
