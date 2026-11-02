#!/usr/bin/env node
// Envia as URLs do sitemap.xml e do sitemap-playground.xml ao Bing Webmaster Tools (SubmitUrlBatch), sem dependências (Node 18+).
//   node scripts/bing-submit.mjs            envia
//   node scripts/bing-submit.mjs --dry      só lista o que seria enviado
//
// Chave: variável BING_WEBMASTER_API_KEY (ambiente ou arquivo .env, que não é versionado).
// Só envia URLs de sites já verificados na conta (GetUserSites); as demais são puladas.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dry = process.argv.includes('--dry');
const API = 'https://ssl.bing.com/webmaster/api.svc/json';

function chave() {
  if (process.env.BING_WEBMASTER_API_KEY) return process.env.BING_WEBMASTER_API_KEY;
  const env = join(root, '.env');
  if (!existsSync(env)) return null;
  return /^BING_WEBMASTER_API_KEY=(.+)$/m.exec(readFileSync(env, 'utf8'))?.[1]?.trim() ?? null;
}

const apikey = chave();
if (!apikey) {
  console.error('Defina BING_WEBMASTER_API_KEY (ambiente ou .env).');
  process.exit(1);
}

const xml = ['sitemap.xml', 'sitemap-playground.xml'].map((f) => readFileSync(join(root, 'public', f), 'utf8')).join('\n');
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());

const sites = await (await fetch(`${API}/GetUserSites?apikey=${apikey}`)).json();
const verificados = (sites.d ?? []).filter((s) => s.IsVerified).map((s) => s.Url.replace(/\/$/, ''));

const porSite = new Map();
const pulados = [];
for (const u of urls) {
  const site = verificados.find((s) => new URL(u).origin === s);
  if (site) (porSite.get(site) ?? porSite.set(site, []).get(site)).push(u);
  else pulados.push(u);
}

for (const [site, lista] of porSite) {
  console.log(`${site}: ${lista.length} URL(s)`);
  if (dry) continue;
  const r = await fetch(`${API}/SubmitUrlBatch?apikey=${apikey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ siteUrl: site + '/', urlList: lista }),
  });
  console.log(r.ok ? '  enviado' : `  erro ${r.status}: ${await r.text()}`);
}
if (pulados.length) console.log(`Pulados (site não verificado no Bing): ${pulados.join(', ')}`);
