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
const campanhas = defineCollection({
  loader: glob({ pattern: '**/[^_]*.json', base: './src/content/campanhas' }),
  schema: z
    .object({
      titulo: texto, // h1
      subtitulo: texto,
      descricao: texto.pipe(z.string().max(160, 'meta description com até 160 caracteres')),
      unidade: z.enum(['parque', 'graopara', 'clinica']), // de quem é o WhatsApp e o endereço do rodapé
      imagem: z.object({ src: z.string(), alt: z.string().min(5) }).optional(), // caminho relativo a public/, ex.: img/clinica-fachada.webp
      beneficios: z.array(z.object({ titulo: texto, texto })).min(3).max(6),
      faq: z.array(z.object({ q: texto, a: texto })).default([]),
      cta: z
        .object({ rotulo: texto, tipo: z.enum(['whatsapp', 'link']).default('whatsapp'), mensagem: texto.optional(), href: z.string().optional() })
        .refine((c) => c.tipo !== 'link' || !!c.href, { message: 'cta do tipo "link" precisa de href', path: ['href'] }),
      encerraEm: z.coerce.date().optional(), // fim da campanha; depois disso a página deixa de ser gerada no próximo deploy
    }),
});

export const collections = { vagas, campanhas };
