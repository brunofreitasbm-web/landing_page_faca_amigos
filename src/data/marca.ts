// Fonte única dos fatos da marca para as páginas Astro.
// - Contatos, endereços, andar e referência: src/data/marca.json (único lugar para editar).
// - Horário e preços do Playground e do Circuito: public/geo-facts.json, que vem do caixa (função geo-facts).
// - Horário da Clínica: marca.json (o caixa não cobre a clínica).
// Nada aqui é escrito à mão numa página: mudou o fato, muda aqui e vale no site inteiro.
import marca from './marca.json';
import geo from '../../public/geo-facts.json';

export const SITE = marca.site;
export const CNPJ = marca.cnpj;
export const ISABELLA = marca.isabella;
export const NPS = marca.nps;
export const unidades = marca.unidades;
export type UnidadeId = keyof typeof marca.unidades;
export const ORDEM: UnidadeId[] = ['parque', 'graopara', 'circuito', 'clinica'];

type Linha = { texto: string; dias: string[]; abre: string; fecha: string };
type GeoUnit = (typeof geo.units)[number];

export const abs = (path: string) => SITE.url + (path === '/' ? '/' : path);

// "10:00" -> "10h", "11:45" -> "11h45"
const hora = (s: string) => `${Number(s.slice(0, 2))}h${s.slice(3) === '00' ? '' : s.slice(3)}`;
const faixa = (abre: string, fecha: string) => `das ${hora(abre)} às ${hora(fecha)}`;
const SEMANA = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function geoDe(id: UnidadeId): GeoUnit | undefined {
  const slug = marca.unidades[id].geoSlug;
  return slug ? geo.units.find((u) => u.slug === slug) : undefined;
}

export function horarioLinhas(id: UnidadeId): Linha[] {
  const g = geoDe(id);
  if (!g) return marca.horarioClinica.map((l) => ({ ...l }));
  const h = g.hours as { open: string; close: string; sunday?: { open: string; close: string } };
  const linhas: Linha[] = [
    { texto: `Segunda a sábado, ${faixa(h.open, h.close)}`, dias: SEMANA, abre: h.open, fecha: h.close },
  ];
  if (h.sunday) linhas.push({ texto: `Domingo, ${faixa(h.sunday.open, h.sunday.close)}`, dias: ['Sunday'], abre: h.sunday.open, fecha: h.sunday.close });
  return linhas;
}

export const horarioTexto = (id: UnidadeId) => horarioLinhas(id).map((l) => l.texto).join(' · ');

export const openingHoursSpec = (id: UnidadeId) =>
  horarioLinhas(id).map((l) => ({
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: l.dias.length === 1 ? l.dias[0] : l.dias,
    opens: l.abre,
    closes: l.fecha,
  }));

// "Parque Shopping Belém · 1º piso" / "Shopping Bosque Grão-Pará · 1º piso, em frente à Renner"
export function localTexto(id: UnidadeId): string {
  const u = marca.unidades[id];
  if (!u.shopping) return u.bairro ? `${u.bairro}, Belém` : 'Belém';
  const andar = [u.andar, u.referencia].filter(Boolean).join(', ');
  return andar ? `${u.shopping} · ${andar}` : u.shopping;
}

export const enderecoTexto = (id: UnidadeId) => {
  const u = marca.unidades[id];
  return [u.endereco, u.bairro].filter(Boolean).join(' · ');
};

export const fmtFone = (wa: string) => {
  const d = wa.replace(/^55/, '');
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

export const waUrl = (id: UnidadeId, texto?: string) => {
  const u = marca.unidades[id];
  if (!u.whatsapp) return null;
  return `https://wa.me/${u.whatsapp}?text=${encodeURIComponent(texto ?? u.waTexto)}`;
};

// Nó schema.org de uma unidade (LocalBusiness). A página de cada unidade é a dona do próprio nó.
export function localBusiness(id: UnidadeId, extra: Record<string, unknown> = {}) {
  const u = marca.unidades[id];
  return {
    '@type': 'LocalBusiness',
    '@id': `${SITE.url}${u.rota}#local`,
    name: `FaçaAmigos — ${u.nome}`,
    url: abs(u.rota),
    image: `${SITE.url}/${u.foto}`,
    ...(u.whatsapp ? { telephone: `+${u.whatsapp}` } : {}),
    address: {
      '@type': 'PostalAddress',
      streetAddress: [u.endereco, [u.shopping, u.andar, u.referencia].filter(Boolean).join(', ')].filter(Boolean).join(' — '),
      addressLocality: 'Belém',
      addressRegion: 'PA',
      postalCode: u.cep,
      addressCountry: 'BR',
    },
    ...(u.lat != null ? { geo: { '@type': 'GeoCoordinates', latitude: u.lat, longitude: u.lng } } : {}),
    openingHoursSpecification: openingHoursSpec(id),
    hasMap: u.mapa,
    parentOrganization: { '@id': `${SITE.url}/#organization` },
    ...extra,
  };
}

export type Pergunta = { q: string; a: string };

// FAQPage a partir da MESMA lista que a página mostra (o check.mjs exige texto idêntico ao <details> visível).
export const faqNo = (path: string, itens: Pergunta[]) => ({
  '@type': 'FAQPage',
  '@id': `${abs(path)}#faq`,
  mainEntity: itens.map((i) => ({ '@type': 'Question', name: i.q, acceptedAnswer: { '@type': 'Answer', text: i.a } })),
});

export const trilhaNo = (path: string, itens: { nome: string; path: string }[]) => ({
  '@type': 'BreadcrumbList',
  '@id': `${abs(path)}#trilha`,
  itemListElement: itens.map((i, n) => ({ '@type': 'ListItem', position: n + 1, name: i.nome, item: abs(i.path) })),
});
