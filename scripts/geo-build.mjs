#!/usr/bin/env node
// Gera llms.txt e llms-full.txt a partir do que o app dos quiosques cobra de verdade, para as três
// fontes (site, JSON-LD, llms*.txt) nunca mais divergirem (ver plano "GEO: fonte única de fatos").
//
//   node scripts/geo-build.mjs                 usa o geo-facts.json já commitado (offline, para CI)
//   node scripts/geo-build.mjs --fetch [url]    baixa geo-facts.json da função geo-facts antes de gerar
//                                                (padrão: https://ivjvpdzsfjdpyabbzzuj.supabase.co/functions/v1/geo-facts)
//   node scripts/geo-build.mjs --check          não escreve; código 1 se alguma saída divergir do disco
//
// O HTML das páginas (preços visíveis, JSON-LD) continua editado à mão — este gerador cobre só os
// arquivos llms.txt/llms-full.txt. scripts/check.mjs garante que os preços do llms*.txt são um
// subconjunto dos preços das páginas; supabase/functions/fa-health compara os % de desconto do
// quiosque com os 40%/50% que o site pressupõe.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_GEO_FACTS_URL = 'https://ivjvpdzsfjdpyabbzzuj.supabase.co/functions/v1/geo-facts';

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const fetchIdx = args.indexOf('--fetch');
const shouldFetch = fetchIdx !== -1;
const fetchUrl = shouldFetch && args[fetchIdx + 1] && !args[fetchIdx + 1].startsWith('--') ? args[fetchIdx + 1] : DEFAULT_GEO_FACTS_URL;

const brl = (v) => (v == null ? '—' : v.toFixed(2).replace('.', ','));
const hora = (hhmm) => `${parseInt(hhmm.split(':')[0], 10)}h`;

const PACKAGE_LABEL = {
  'DAY USE': (p) => `Day Use (${Math.round(p.included_minutes / 60)}h no mesmo dia)`,
  'PORTO SEGURO': (p) => `Passaporte mensal (${Math.round(p.included_minutes / 60)}h/mês, 3x sem juros)`,
};
const packageLabel = (p) => (PACKAGE_LABEL[p.name] ? PACKAGE_LABEL[p.name](p) : p.name);

async function loadGeoFacts() {
  const localPath = join(root, 'geo-facts.json');
  if (shouldFetch) {
    console.log(`Baixando fatos de ${fetchUrl} ...`);
    const resp = await fetch(fetchUrl);
    if (!resp.ok) throw new Error(`geo-facts respondeu HTTP ${resp.status}`);
    const data = await resp.json();
    writeFileSync(localPath, JSON.stringify(data, null, 2) + '\n');
    return data;
  }
  if (!existsSync(localPath)) throw new Error('geo-facts.json não existe. Rode com --fetch para baixar da função.');
  return JSON.parse(readFileSync(localPath, 'utf8'));
}

function unit(facts, slug) {
  const u = facts.units.find((x) => x.slug === slug);
  if (!u) throw new Error(`unidade "${slug}" não encontrada em geo-facts.json`);
  return u;
}

function render(tpl, vars) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (m, key) => {
    if (!(key in vars)) throw new Error(`placeholder {{${key}}} sem valor`);
    return vars[key];
  });
}

function buildVars(facts) {
  const parque = unit(facts, 'playground-parque');
  const bosque = unit(facts, 'playground-bosque');
  const circuito = unit(facts, 'circuito-parque');

  const enderecoParque = `${parque.address.street}, ${parque.address.city} - ${parque.address.state}, CEP ${parque.address.postal_code}`;
  const enderecoBosque = `${bosque.address.street}, ${bosque.address.city} - ${bosque.address.state}`;
  const horario = `${hora(parque.hours.open)} às ${hora(parque.hours.close)}`;
  const horarioDomingo = `${hora(parque.hours.sunday.open)} às ${hora(parque.hours.sunday.close)}`;
  const horarioBosque = `${hora(bosque.hours.open)} às ${hora(bosque.hours.close)}`;
  const horarioBosqueDomingo = `${hora(bosque.hours.sunday.open)} às ${hora(bosque.hours.sunday.close)}`;
  // Meia-entrada em R$, nunca em %: o "50%" é sobre uma tabela-base que o cliente não vê (R$ 100 → R$ 50), e ao lado
  // do preço geral (R$ 60) faz qualquer leitor, humano ou IA, calcular "50% de 60 = 30".
  const plano30 = parque.plans.find((p) => !p.asset_kind && p.duration_min === 30);
  if (!plano30) throw new Error('plano de 30 minutos do Playground não encontrado em geo-facts.json');
  const meiaInclusiva = `R$ ${brl(plano30.inclusive_brl)} os 30 minutos (público geral: R$ ${brl(plano30.price_brl)})`;

  const fidelidadePlayground = `a cada ${parque.loyalty.trigger_visits} visitas registradas pelo CPF do responsável, a ${parque.loyalty.trigger_visits}ª entrada de 30 minutos é 100% gratuita. Vale no Playground e no Circuito.`;
  const fidelidadeCircuito = fidelidadePlayground;

  const parquePlans = parque.plans.filter((p) => !p.asset_kind); // exclui itens avulsos que não são o passaporte padrão
  const linhasListaPlayground = [
    ...parquePlans.map(
      (p) => `  - ${p.duration_min} minutos: R$ ${brl(p.price_brl)} (Público geral) / R$ ${brl(p.inclusive_brl)} (Meia-Entrada Inclusiva)`
    ),
    ...parque.packages.map(
      (p) => `  - ${packageLabel(p)}: R$ ${brl(p.price_brl)} (Público geral) / R$ ${brl(p.inclusive_brl)} (Meia-Entrada Inclusiva)`
    ),
    `  - Minuto adicional: R$ ${brl(parquePlans[0]?.overage_brl)} (Público geral) / R$ ${brl(parquePlans[0]?.overage_inclusive_brl)} (Meia-Entrada Inclusiva)`,
    `  - Meia-Entrada Inclusiva (PCD/TEA): preços da coluna "Meia-Entrada Inclusiva" acima, mediante laudo ou CIPTEA. Só no Playground; o Circuito tem preço único.`,
  ].join('\n');

  const tabelaPlayground = [
    ...parquePlans.map((p) => `| ${p.duration_min} minutos | R$ ${brl(p.price_brl)} | R$ ${brl(p.inclusive_brl)} |`),
    ...parque.packages.map((p) => `| ${packageLabel(p)} | R$ ${brl(p.price_brl)} | R$ ${brl(p.inclusive_brl)} |`),
    `| Minuto adicional | R$ ${brl(parquePlans[0]?.overage_brl)} | R$ ${brl(parquePlans[0]?.overage_inclusive_brl)} |`,
  ].join('\n');

  const circuitoPrecoUnico = circuito.plans.every((p) => p.price_brl === circuito.plans[0]?.price_brl);
  const listaCircuito = circuitoPrecoUnico
    ? `${circuito.plans.map((p) => `${p.name.toLowerCase()}`).join(' ou ')}, R$ ${brl(circuito.plans[0]?.price_brl)} por passeio.`
    : circuito.plans.map((p) => `${p.name}: R$ ${brl(p.price_brl)}`).join('; ') + '.';
  const tabelaCircuito = circuito.plans.map((p) => `- **${p.name}**: R$ ${brl(p.price_brl)}`).join('\n');

  return {
    ENDERECO_PARQUE: enderecoParque,
    ENDERECO_BOSQUE: enderecoBosque,
    HORARIO: horario,
    HORARIO_DOMINGO: horarioDomingo,
    HORARIO_BOSQUE: horarioBosque,
    HORARIO_BOSQUE_DOMINGO: horarioBosqueDomingo,
    MEIA_INCLUSIVA: meiaInclusiva,
    FIDELIDADE_PLAYGROUND: fidelidadePlayground,
    FIDELIDADE_CIRCUITO: fidelidadeCircuito,
    PRECOS_PLAYGROUND_LISTA: linhasListaPlayground,
    PRECOS_PLAYGROUND_TABELA: tabelaPlayground,
    PRECOS_CIRCUITO_LISTA: listaCircuito,
    PRECOS_CIRCUITO_TABELA: tabelaCircuito,
    CIRCUITO_MINUTO_ADICIONAL: `R$ ${brl(circuito.plans[0]?.overage_brl)}`,
  };
}

async function main() {
  const facts = await loadGeoFacts();
  const vars = buildVars(facts);

  const outputs = [
    ['llms.txt', 'scripts/geo-templates/llms.txt.tpl'],
    ['llms-full.txt', 'scripts/geo-templates/llms-full.txt.tpl'],
  ];

  let divergente = 0;
  for (const [destino, tplPath] of outputs) {
    const tpl = readFileSync(join(root, tplPath), 'utf8');
    const conteudo = render(tpl, vars);
    const destPath = join(root, destino);
    const atual = existsSync(destPath) ? readFileSync(destPath, 'utf8') : null;
    if (atual === conteudo) {
      console.log(`${destino}: já em dia.`);
      continue;
    }
    divergente++;
    if (checkOnly) {
      console.log(`${destino}: DIVERGENTE do que o quiosque cobra hoje. Rode "npm run geo".`);
    } else {
      writeFileSync(destPath, conteudo);
      console.log(`${destino}: atualizado.`);
    }
  }

  if (checkOnly) {
    console.log(divergente ? `${divergente} arquivo(s) desatualizado(s).` : 'Tudo em dia.');
    process.exit(divergente ? 1 : 0);
  }
}

main().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
