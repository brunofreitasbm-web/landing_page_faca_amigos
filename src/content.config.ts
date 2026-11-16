import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Vagas REAIS e abertas (um arquivo .json por vaga em src/content/vagas/). Arquivos que começam com "_" são ignorados
// (modelo e instruções em _LEIA-ME.md). O schema.org JobPosting só é gerado para vaga com todos os campos obrigatórios
// e dentro do prazo: banco de talentos NÃO é vaga (o Google pode aplicar ação manual).
const vagas = defineCollection({
  loader: glob({ pattern: '**/[^_]*.json', base: './src/content/vagas' }),
  schema: z
    .object({
      titulo: z.string().min(5),
      unidade: z.enum(['parque', 'graopara', 'clinica']),
      // FULL_TIME e PART_TIME = CLT conforme a jornada; CONTRACTOR = PJ; INTERN = estágio. Quem escreve a vaga escolhe.
      tipo: z.array(z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACTOR', 'INTERN', 'TEMPORARY'])).min(1),
      publicadaEm: z.coerce.date(),
      validaAte: z.coerce.date(),
      descricao: z.string().min(200, 'a descrição precisa ter pelo menos 200 caracteres (função de verdade, não texto genérico)'),
      atividades: z.array(z.string()).default([]),
      requisitos: z.array(z.string()).default([]),
      // Só preencher com autorização: valor em reais por mês ou por hora.
      salario: z.object({ min: z.number().positive(), max: z.number().positive().optional(), por: z.enum(['MONTH', 'HOUR']) }).optional(),
    })
    .refine((v) => v.validaAte > v.publicadaEm, { message: 'validaAte precisa ser depois de publicadaEm', path: ['validaAte'] }),
});

// Landings de campanha (/lp/<arquivo>): páginas curtas para anúncio, sem menu e com noindex. Um .json por campanha real
// em src/content/campanhas/ (modelo e regras em _LEIA-ME.md). Texto público segue as regras da marca: o schema recusa os
// termos proibidos abaixo (não existe serviço de festa/aniversário; copy não usa "promessa", "confiança" nem "oferta").
const PROIBIDAS = /\b(festa|festas|anivers[aá]rio|anivers[aá]rios|promessa|promessas|confian[cç]a|oferta|ofertas)\b/i;
const texto = z.string().min(2).refine((t) => !PROIBIDAS.test(t), { message: 'termo proibido pela marca (festa, aniversário, promessa, confiança, oferta)' });
// Pré-visualização de campanha dormente (arquivo "_<nome>.json"): só com a variável INCLUDE_DORMANT_CAMPAIGNS=<nome>[,<nome>]
// (usada por scripts/preview-campanha.mjs, que constrói numa pasta à parte). Sem a variável, o padrão e os ids são os de sempre.
const DORMENTES = (process.env.INCLUDE_DORMANT_CAMPAIGNS ?? '').split(',').map((s) => s.trim()).filter((s) => /^[a-z0-9-]+$/.test(s));
const loaderCampanhas = DORMENTES.length
  ? glob({
      pattern: ['**/[^_]*.json', ...DORMENTES.map((n) => `_${n}.json`)],
      base: './src/content/campanhas',
      generateId: ({ entry }) => entry.replace(/\.json$/, '').replace(/^_/, ''),
    })
  : glob({ pattern: '**/[^_]*.json', base: './src/content/campanhas' });

// Campos opcionais acrescentados para a campanha "Ritmo" (retrocompatíveis; ver docs/ritmo-landing-LEIA-ME.md):
//  nome: "{nome}" em qualquer texto da campanha vira esse valor ANTES da validação (um único ponto para trocar o nome).
//  rotulo, destaques, comparacao, passos, faqTitulo, fim: blocos extras da página. cta.origemNaMensagem: etiqueta de origem (UTM) no WhatsApp.
//  regrasSaude: trava extra no build para campanhas de serviço de saúde (preço, desconto, "pacote", pagamento, resultado etc.).
const comNome = (v: unknown): unknown => {
  if (!v || typeof v !== 'object' || typeof (v as { nome?: unknown }).nome !== 'string') return v;
  const nome = (v as { nome: string }).nome;
  const sub = (x: unknown): unknown =>
    typeof x === 'string' ? x.replaceAll('{nome}', nome)
    : Array.isArray(x) ? x.map(sub)
    : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, y]) => [k, sub(y)]))
    : x;
  return sub(v);
};
const SAUDE = [
  [/R\$|\breais\b|\d\s?%/i, 'valor em reais ou percentual'],
  [/\b(pre[cç]os?|descontos?|promo[cç][aãoõ]\w*|promocional|cupom|cupons|sorteios?|gr[aá]tis|gratuit[oa]s?|sem juros|parcel\w*)\b/i, 'preço, desconto, promoção ou gratuidade'],
  [/\b(pacotes?|garantia|garantias|garantid[oa]s?|garantimos|garantir)\b/i, '"pacote" ou "garantia"'],
  [/\b(pix|boleto|cart[aã]o|cr[eé]dito)\b/i, 'forma de pagamento específica (o gateway ainda não existe)'],
  [/melhor(es)? (cl[ií]nica|terapia|profissional|psic[óo]log|tratamento)|refer[êe]ncia (em|no|na) /i, 'superlativo sem fato público'],
  [/\bcura(r|do|da)?\b/i, '"cura"'],
  [/resultados? (garantidos?|comprovados?|r[aá]pidos?)|melhora garantida|evolu[cç][aã]o garantida/i, 'promessa de resultado clínico'],
  [/depoimentos?|avalia[cç][oõ]es de (pais|clientes)/i, 'depoimento'],
  [/vagas? (limitadas?|restantes?)|[uú]ltimas? vagas?|[uú]ltimas? horas?|corra\b|s[oó] hoje/i, 'escassez/urgência não verificável'],
  [/—/, 'travessão (copy da marca não usa)'],
] as const;
const campanhaObj = z.object({
  nome: texto.optional(), // ex.: "Ritmo"
  titulo: texto, // h1
  subtitulo: texto,
  descricao: texto.pipe(z.string().max(160, 'meta description com até 160 caracteres')),
  unidade: z.enum(['parque', 'graopara', 'clinica']), // de quem é o WhatsApp e o endereço do rodapé
  imagem: z.object({ src: z.string(), alt: z.string().min(5) }).optional(), // caminho relativo a public/, ex.: img/clinica-fachada.webp
  rotulo: texto.optional(), // linha curta acima do h1 (ex.: "Plano {nome}")
  destaques: z.array(texto).max(4).default([]), // chips sob o subtítulo
  beneficios: z.array(z.object({ titulo: texto, texto })).min(3).max(6),
  comparacao: z
    .object({
      titulo: texto,
      intro: texto.optional(),
      antes: z.object({ rotulo: texto, itens: z.array(texto).min(2).max(5) }),
      depois: z.object({ rotulo: texto, itens: z.array(texto).min(2).max(5) }),
      nota: texto.optional(),
    })
    .optional(),
  passos: z.object({ titulo: texto, itens: z.array(z.object({ titulo: texto, texto })).min(2).max(5) }).optional(),
  faqTitulo: texto.optional(),
  faq: z.array(z.object({ q: texto, a: texto })).default([]),
  fim: z.object({ titulo: texto, texto: texto.optional(), imagem: z.object({ src: z.string(), alt: z.string().min(5) }).optional() }).optional(),
  cta: z
    .object({
      rotulo: texto,
      tipo: z.enum(['whatsapp', 'link']).default('whatsapp'),
      mensagem: texto.optional(),
      href: z.string().optional(),
      origemNaMensagem: z.boolean().default(false), // acrescenta "(ref: <utm_source>-<utm_medium>-<utm_campaign>)" à mensagem do WhatsApp
      microtexto: texto.optional(), // linha curta sob o botão do topo
    })
    .refine((c) => c.tipo !== 'link' || !!c.href, { message: 'cta do tipo "link" precisa de href', path: ['href'] }),
  regrasSaude: z.boolean().default(false),
  encerraEm: z.coerce.date().optional(), // fim da campanha; depois disso a página deixa de ser gerada no próximo deploy
});
const campanhas = defineCollection({
  loader: loaderCampanhas,
  schema: z.preprocess(
    comNome,
    campanhaObj.superRefine((v, ctx) => {
      if (!v.regrasSaude) return;
      const { regrasSaude: _r, encerraEm: _e, ...conteudo } = v;
      const strings: string[] = [];
      const juntar = (x: unknown) => { if (typeof x === 'string') strings.push(x); else if (Array.isArray(x)) x.forEach(juntar); else if (x && typeof x === 'object') Object.values(x).forEach(juntar); };
      juntar(conteudo);
      for (const s of strings) for (const [re, rotulo] of SAUDE) if (re.test(s)) ctx.addIssue({ code: 'custom', message: `regrasSaude: ${rotulo} em "${s.slice(0, 80)}"` });
    }),
  ),
});

export const collections = { vagas, campanhas };
