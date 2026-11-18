// Transforma toda imagem citada no JSON-LD (image, primaryImageOfPage, thumbnailUrl) num ImageObject completo:
// url, contentUrl, dimensões reais, tipo do arquivo, legenda/descrição (src/data/imagens.json), criador, crédito e
// copyright. Roda uma vez em Base.astro: nenhuma página precisa repetir esses campos à mão.
import { join } from 'node:path';
import { statSync } from 'node:fs';
import tabela from '../data/imagens.json';
import { SITE } from '../data/marca';
import { dims } from './img';

const CHAVES = ['image', 'primaryImageOfPage', 'thumbnailUrl'];
const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const { _credito: cred, ...porArquivo } = tabela as Record<string, any>;
const PREFIXO = SITE.url + '/img/';

function relativo(u: string): string | null {
  return typeof u === 'string' && u.startsWith(PREFIXO) ? 'img/' + u.slice(PREFIXO.length) : null;
}

async function objeto(entrada: unknown): Promise<unknown> {
  const base = typeof entrada === 'string' ? { url: entrada } : { ...(entrada as Record<string, unknown>) };
  const rel = relativo(base.url as string);
  if (!rel) return entrada; // imagem de fora do site: não mexe
  try { statSync(join(process.cwd(), 'public', rel)); } catch { return entrada; }
  const meta = (porArquivo[rel] ?? porArquivo[rel.replace(/\.webp$/, '.jpg')] ?? {}) as { caption?: string; description?: string };
  const { width, height } = await dims(rel);
  const ext = rel.split('.').pop()!.toLowerCase();
  const completo: Record<string, unknown> = {
    '@type': 'ImageObject',
    url: base.url,
    contentUrl: base.url,
    ...(width && height ? { width, height } : {}),
    ...(MIME[ext] ? { encodingFormat: MIME[ext] } : {}),
    ...(meta.caption ? { caption: meta.caption } : {}),
    ...(meta.description ? { description: meta.description } : {}),
    creditText: cred.creditText,
    copyrightNotice: `© ${cred.ano} ${cred.criador}`,
    creator: { '@type': 'Organization', name: cred.criador, url: SITE.url + '/' },
    ...base, // o que a página já declarava tem prioridade
  };
  return completo;
}

async function visita(no: unknown): Promise<unknown> {
  if (Array.isArray(no)) return Promise.all(no.map(visita));
  if (!no || typeof no !== 'object') return no;
  const saida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(no as Record<string, unknown>)) {
    if (CHAVES.includes(k)) {
      saida[k] = Array.isArray(v) ? await Promise.all(v.map(objeto)) : await objeto(v);
    } else saida[k] = await visita(v);
  }
  return saida;
}

export const enriquecerImagens = (nos: Record<string, unknown>[]) => visita(nos) as Promise<Record<string, unknown>[]>;
