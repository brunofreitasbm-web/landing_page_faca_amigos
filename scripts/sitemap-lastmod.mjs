#!/usr/bin/env node
// Mantém o sitemap.xml e o sitemap-playground.xml (sem dependências, Node 18+).
//   npm run build && node scripts/sitemap-lastmod.mjs            reescreve os sitemaps
//   npm run build && node scripts/sitemap-lastmod.mjs --check    só confere (código 1 se algo estiver defasado)
//
// sitemap.xml: as URLs vêm das PÁGINAS CONSTRUÍDAS (dist/): toda página com canonical do hub e sem noindex entra; página
// nova entra sozinha (changefreq/priority padrão, ajustáveis no próprio arquivo) e página que saiu ou virou noindex sai.
// Por isso o script precisa do build feito antes. O arquivo continua versionado: o <lastmod> sai do git local, e o CI
// faz checkout raso, onde essa data não existe.
// Data de cada URL = data do último commit que mexeu no arquivo da página (git log -1 --format=%cs).
// Se o arquivo tem mudanças ainda não commitadas (ou é novo), usa a data de hoje.
// sitemap-playground.xml: lista fixa de transição (URLs do host antigo); só o <lastmod> é atualizado.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITEMAPS = ['sitemap.xml', 'sitemap-playground.xml'];
const HUB = 'https://institutofacaamigos.com.br';
// Padrão para página nova (o que já está no sitemap.xml mantém changefreq e priority como estão).
const PADRAO = (path) => (path.startsWith('/aprender/') ? { changefreq: 'monthly', priority: '0.7' } : { changefreq: 'monthly', priority: '0.6' });
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
  // Páginas geradas de dados (src/pages/aprender/[slug].astro): a fonte é o par <slug>.json + <slug>.html em src/data/.
  const dinamica = /^aprender\/([^/]+)\.html$/.exec(rel);
  if (dinamica && existsSync(join(root, 'src/data/aprender', dinamica[1] + '.json'))) {
    return [join('src/data/aprender', dinamica[1] + '.json'), join('src/data/aprender', dinamica[1] + '.html')];
  }
  // Páginas de conteúdo (src/pages/x.astro + src/data/paginas/x.*): vale a alteração mais recente entre a página e os dados.
  const slugPg = rel.endsWith('.html') ? rel.slice(0, -5) : null;
  if (slugPg && existsSync(join(root, 'src/data/paginas', slugPg + '.json')) && existsSync(join(root, 'src/pages', slugPg + '.astro'))) {
    const fontes = [join('src/pages', slugPg + '.astro'), join('src/data/paginas', slugPg + '.json'), join('src/data/paginas', slugPg + '.html')];
    if (slugPg === 'aprender') fontes.push(...readdirSync(join(root, 'src/data/aprender')).filter((f) => f.endsWith('.json')).map((f) => join('src/data/aprender', f)));
    return fontes;
  }
  const candidatos = [join('public', rel)];
  if (rel.endsWith('.html')) {
    const base = rel.slice(0, -5);
    candidatos.push(join('src', 'pages', base + '.astro'), join('src', 'pages', base, 'index.astro'));
  }
  return [candidatos.find((c) => existsSync(join(root, c))) ?? candidatos[0]];
}

// arqs: um ou mais arquivos-fonte da mesma URL; vale a data da alteração mais recente.
function dataDoArquivo(arqs) {
  return arqs.map(dataDeUm).sort().at(-1);
}
function dataDeUm(arq) {
  if (git(['status', '--porcelain', '--', arq])) return hoje(); // alterado, novo ou não commitado
  // --follow + --diff-filter=AM: o arquivo foi movido para public/. Um commit que só renomeia (status R) não conta
  // como alteração; sem isso a data de todas as páginas viraria a da mudança de pasta.
  return git(['log', '--follow', '--diff-filter=AM', '-1', '--format=%cs', '--', arq]) || hoje();
}

// Páginas indexáveis do hub, lidas de dist/ (mesma regra do scripts/check.mjs: canonical do hub, sem noindex, e o canonical
// é o endereço da própria página; evento.html aponta para /eventos e fica de fora).
function paginasIndexaveis() {
  const dist = join(root, 'dist');
  if (!existsSync(dist)) {
    console.error('dist/ não existe: rode "npm run build" antes.');
    process.exit(2);
  }
  const achadas = new Set();
  const visita = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const f = join(dir, e.name);
      if (e.isDirectory()) { if (!['assets', 'img', '_astro'].includes(e.name)) visita(f); continue; }
      if (!e.name.endsWith('.html')) continue;
      const html = readFileSync(f, 'utf8');
      const canon = /<link\s+rel="canonical"\s+href="([^"]+)"/.exec(html)?.[1];
      if (!canon || !canon.startsWith(HUB)) continue;
      if (/<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html)) continue;
      const rel = f.slice(dist.length + 1).replace(/\\/g, '/');
      const esperado = rel === 'index.html' ? '/' : '/' + rel.replace(/\.html$/, '');
      if (new URL(canon).pathname.replace(/\/+$/, '') !== esperado.replace(/\/+$/, '')) continue;
      achadas.add(HUB + esperado);
    }
  };
  visita(dist);
  return achadas;
}

// Recompõe o sitemap.xml: mantém os blocos (e comentários) das URLs que continuam, tira as que saíram, acrescenta as novas.
function sincronizarUrls(xml) {
  const alvo = paginasIndexaveis();
  const blocos = [...xml.matchAll(/((?:[ \t]*<!--[\s\S]*?-->[ \t]*\n)*)([ \t]*<url>[\s\S]*?<\/url>)/g)];
  if (!blocos.length) return xml;
  const topo = xml.slice(0, blocos[0].index);
  const fim = xml.slice(blocos.at(-1).index + blocos.at(-1)[0].length);
  const vistos = new Set();
  const partes = [];
  for (const b of blocos) {
    const loc = /<loc>([^<]+)<\/loc>/.exec(b[2])?.[1]?.trim();
    if (!loc || !alvo.has(loc)) { console.log(`sai do sitemap: ${loc}`); continue; }
    vistos.add(loc);
    partes.push(b[0].replace(/^\s*\n/, ''));
  }
  for (const loc of [...alvo].filter((l) => !vistos.has(l)).sort()) {
    const { changefreq, priority } = PADRAO(new URL(loc).pathname);
    console.log(`entra no sitemap: ${loc}`);
    partes.push(`  <url>\n    <loc>${loc}</loc>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`);
  }
  return topo + partes.join('\n') + fim;
}

let defasados = 0;
let semArquivo = 0;
const novos = new Map();

for (const nome of SITEMAPS) {
  const sitemapPath = join(root, 'public', nome);
  const antes = readFileSync(sitemapPath, 'utf8');
  const base = nome === 'sitemap.xml' ? sincronizarUrls(antes) : antes;
  if (base !== antes) defasados++;
  const xml = base.replace(/<url>[\s\S]*?<\/url>/g, (bloco) => {
    const loc = /<loc>([^<]+)<\/loc>/.exec(bloco)?.[1]?.trim();
    if (!loc) return bloco;
    const arq = arquivoDaUrl(loc);
    if (!arq.every((a) => existsSync(join(root, a)))) {
      console.warn(`AVISO: ${loc} aponta para ${arq.join(', ')}, que não existe.`);
      semArquivo++;
      return bloco;
    }
    const nova = dataDoArquivo(arq);
    const atual = /<lastmod>([^<]*)<\/lastmod>/.exec(bloco)?.[1];
    if (atual !== nova) {
      defasados++;
      console.log(`${loc}: ${atual ?? '(sem lastmod)'} -> ${nova}  [${arq.join(', ')}]`);
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
