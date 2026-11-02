import { getCollection } from 'astro:content';
import { unidades, SITE, abs } from '../data/marca';

export type Vaga = Awaited<ReturnType<typeof getCollection<'vagas'>>>[number];

// Data de hoje em Belém (UTC-3, sem horário de verão). A vaga vale até o fim do dia de "validaAte".
const hojeBelem = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const diaDe = (d: Date) => d.toISOString().slice(0, 10);

export async function vagasAbertas(): Promise<Vaga[]> {
  const todas = await getCollection('vagas');
  const hoje = hojeBelem();
  return todas
    .filter((v) => diaDe(v.data.publicadaEm) <= hoje && diaDe(v.data.validaAte) >= hoje)
    .sort((a, b) => b.data.publicadaEm.getTime() - a.data.publicadaEm.getTime());
}

export const rotuloTipo: Record<string, string> = {
  FULL_TIME: 'CLT, tempo integral', PART_TIME: 'CLT, meio período', CONTRACTOR: 'Prestador de serviço (PJ)', INTERN: 'Estágio', TEMPORARY: 'Temporário',
};

export const caminhoDaVaga = (v: Vaga) => `/trabalhe-conosco/${v.id}`;

export function jobPosting(v: Vaga) {
  const u = unidades[v.data.unidade];
  const s = v.data.salario;
  return {
    '@type': 'JobPosting',
    '@id': `${abs(caminhoDaVaga(v))}#vaga`,
    title: v.data.titulo,
    description: v.data.descricao.split(/\n{2,}/).map((p) => `<p>${p.trim()}</p>`).join(''),
    datePosted: diaDe(v.data.publicadaEm),
    validThrough: `${diaDe(v.data.validaAte)}T23:59:59-03:00`,
    employmentType: v.data.tipo,
    directApply: false,
    url: abs(caminhoDaVaga(v)),
    hiringOrganization: { '@type': 'Organization', name: 'Instituto Faça Amigos', sameAs: SITE.url, url: SITE.url },
    jobLocation: {
      '@type': 'Place',
      address: { '@type': 'PostalAddress', streetAddress: u.endereco, addressLocality: 'Belém', addressRegion: 'PA', addressCountry: 'BR', ...(u.cep ? { postalCode: u.cep } : {}) },
    },
    ...(s
      ? { baseSalary: { '@type': 'MonetaryAmount', currency: 'BRL', value: { '@type': 'QuantitativeValue', minValue: s.min, ...(s.max ? { maxValue: s.max } : {}), unitText: s.por } } }
      : {}),
  };
}
