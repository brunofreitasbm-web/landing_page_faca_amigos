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

export const collections = { vagas };
