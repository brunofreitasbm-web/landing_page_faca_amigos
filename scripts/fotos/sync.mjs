#!/usr/bin/env node
// Sincroniza a pasta da fotógrafa no Google Drive com as TVs (tv, tv2, tv3) e as landings.
// Roda uma vez por semana no GitHub Actions (.github/workflows/fotos-drive.yml), ou na hora pelo
// botão "Run workflow". Passo a passo de configuração em scripts/fotos/LEIA-ME.md.
//
// O catálogo (estado.json, bucket privado) guarda a classificação de cada foto já lida, pela chave
// do conteúdo (md5). A IA só vê foto que não está no catálogo; mover entre pastas não relê.
//
// Fluxo de cada rodada:
//   1. lista a pasta (e subpastas) no Drive;
//   2. cada foto nova é baixada, convertida (HEIC → JPEG) e classificada pela IA;
//   3. regras.mjs decide o destino (TV automática; site só com "Aprovadas");
//   4. o que pode ir ao ar é publicado no Supabase Storage (bucket fotos-site) e entra no
//      manifest.json que as páginas leem; o que saiu do Drive ou perdeu a aprovação é apagado.
//
// Variáveis de ambiente: veja `CONFIG` abaixo.
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  agrupar, destinos, donosPermitidos, ehHeic, itemManifesto, normalizarClassificacao, remocaoSegura,
} from './regras.mjs';
import { BUCKET_PRIVADO, BUCKET_PUBLICO } from './storage.mjs';

const MAX_TENTATIVAS = 3;
const SALVAR_A_CADA = 10; // fotos classificadas entre um salvamento do catálogo e outro
const LIMITE_BYTES = 80 * 1024 * 1024;

export async function sincronizar({ drive, storage, classificar, imagem, config, log = console.log }) {
  const donos = donosPermitidos(config.donos);
  if (!donos.length) throw new Error('FOTOS_DONOS vazio: liste os e-mails donos dos arquivos que podem ir ao ar.');

  await storage.garantirBuckets();
  const estado = (await storage.lerJson(BUCKET_PRIVADO, 'estado.json')) || { versao: 1, fotos: {} };
  const estadoOriginal = JSON.stringify(estado);
  const fotos = estado.fotos;

  const arquivos = await drive.listar();
  const { grupos, ignorados } = agrupar(arquivos, donos);
  const resumo = { listados: arquivos.length, ignorados: ignorados.length, novas: [], removidas: 0, erros: [], publicadas: 0 };
  if (ignorados.length) log(`Ignorados ${ignorados.length} arquivo(s) de donos fora de FOTOS_DONOS.`);

  // 1. Fotos que sumiram do Drive (apagadas, movidas para fora ou para "Recusadas").
  const sumidas = Object.keys(fotos).filter((k) => !grupos.has(k));
  if (sumidas.length && !remocaoSegura(Object.keys(fotos).length, sumidas.length) && !config.permitirRemocaoEmMassa) {
    throw new Error(`${sumidas.length} de ${Object.keys(fotos).length} fotos sumiram da listagem de uma vez. ` +
      'Parece falha de acesso, não remoção de verdade. Confira o compartilhamento da pasta com a conta de serviço; ' +
      'se foi de propósito, rode o workflow com "permitir remoção em massa".');
  }
  for (const k of sumidas) {
    if (fotos[k].arquivo) await apagarArquivos(storage, fotos[k].arquivo);
    delete fotos[k];
    resumo.removidas++;
  }

  // 2. Classificação das novas (e nova tentativa das que deram erro).
  const decodificadas = new Map();
  const pendentes = [...grupos.values()].filter((g) => {
    const f = fotos[g.chave];
    return !f || f.status === 'erro' && (f.tentativas || 0) < MAX_TENTATIVAS;
  });
  // Mais antigas primeiro: segue a ordem em que a fotógrafa subiu.
  pendentes.sort((a, b) => primeiro(a).createdTime.localeCompare(primeiro(b).createdTime));
  for (const g of pendentes.slice(0, config.maxPorRodada)) {
    const arq = primeiro(g);
    const anterior = fotos[g.chave] || {};
    const registro = { nome: arq.name, criadaEm: arq.createdTime, tentativas: (anterior.tentativas || 0) + 1, arquivo: null };
    try {
      if (Number(arq.size) > LIMITE_BYTES) throw new Error(`arquivo grande demais (${Math.round(arq.size / 1048576)} MB)`);
      const buf = await imagem.decodificar(await drive.baixar(arq.id), ehHeic(arq));
      decodificadas.set(g.chave, buf);
      const r = await classificar(await imagem.previa(buf), { nome: arq.name, pasta: arq.caminho.replace(/[^/]*$/, '') });
      if (r.recusada) {
        fotos[g.chave] = { ...registro, status: 'recusada-ia', motivo: r.motivo };
      } else {
        fotos[g.chave] = { ...registro, status: 'classificada', c: normalizarClassificacao(r.dados) };
      }
      resumo.novas.push(g.chave);
      // Salva o catálogo no meio da rodada: se o job cair (timeout, runner), a IA não relê o que já leu.
      if (resumo.novas.length % SALVAR_A_CADA === 0) {
        await storage.gravar(BUCKET_PRIVADO, 'estado.json', Buffer.from(JSON.stringify(estado)), 'application/json', 'no-cache');
      }
    } catch (e) {
      fotos[g.chave] = { ...registro, status: 'erro', erro: String(e.message).slice(0, 300) };
      resumo.erros.push(`${arq.name}: ${e.message}`);
      log(`ERRO ${arq.name}: ${e.message}`);
    }
  }
  if (pendentes.length > config.maxPorRodada) log(`${pendentes.length - config.maxPorRodada} foto(s) ficam para a próxima rodada.`);

  // 3. Publica, atualiza ou despublica conforme o destino atual (a aprovação pode ter mudado).
  const manifesto = [];
  for (const g of grupos.values()) {
    const f = fotos[g.chave];
    if (!f || f.status !== 'classificada') continue;
    const d = destinos(f.c, g.aprovada);
    f.destino = d;
    try {
      if ((d.tv || d.site) && !f.arquivo) {
        const buf = decodificadas.get(g.chave) || await imagem.decodificar(await drive.baixar(primeiro(g).id), ehHeic(primeiro(g)));
        const v = await imagem.versoes(buf);
        const nome = `img/${f.c.slug}-${g.chave.slice(0, 6)}`;
        const imutavel = 'max-age=31536000';
        await storage.gravar(BUCKET_PUBLICO, `${nome}.webp`, v.webp, 'image/webp', imutavel);
        await storage.gravar(BUCKET_PUBLICO, `${nome}.jpg`, v.jpg, 'image/jpeg', imutavel);
        await storage.gravar(BUCKET_PUBLICO, `${nome}-p.webp`, v.p, 'image/webp', imutavel);
        f.arquivo = nome;
        f.dims = v.dims;
      } else if ((d.tv || d.site) && f.arquivo && config.reprocessarHd && !f.hd) {
        // Reprocessamento HD: o cache é imutável, então grava com nome novo e só depois apaga o antigo.
        // Se falhar, o arquivo antigo continua no ar (f.arquivo não muda) e a falha vira erro do resumo.
        const antigo = f.arquivo;
        try {
          const buf = await imagem.decodificar(await drive.baixar(primeiro(g).id), ehHeic(primeiro(g)));
          const v = await imagem.versoes(buf);
          const nome = `${antigo.replace(/(-hd)+$/, '')}-hd`;
          const imutavel = 'max-age=31536000';
          await storage.gravar(BUCKET_PUBLICO, `${nome}.webp`, v.webp, 'image/webp', imutavel);
          await storage.gravar(BUCKET_PUBLICO, `${nome}.jpg`, v.jpg, 'image/jpeg', imutavel);
          await storage.gravar(BUCKET_PUBLICO, `${nome}-p.webp`, v.p, 'image/webp', imutavel);
          f.arquivo = nome;
          f.dims = v.dims;
          f.hd = true;
        } catch (e) {
          resumo.erros.push(`${f.nome}: HD falhou, mantida a versão antiga: ${e.message}`);
          log(`ERRO HD ${f.nome}: ${e.message}`);
        }
        if (f.hd && f.arquivo !== antigo) {
          try { await apagarArquivos(storage, antigo); } catch (e) {
            resumo.erros.push(`${f.nome}: HD publicado, mas não apagou o antigo: ${e.message}`);
          }
        }
      } else if (!(d.tv || d.site) && f.arquivo) {
        await apagarArquivos(storage, f.arquivo);
        f.arquivo = null;
      }
    } catch (e) {
      resumo.erros.push(`${f.nome}: ${e.message}`);
      log(`ERRO ao publicar ${f.nome}: ${e.message}`);
      continue;
    }
    if (f.arquivo && (d.tv || d.site)) {
      manifesto.push(itemManifesto({ chave: g.chave, c: f.c, d, arquivo: f.arquivo, dims: f.dims, criadaEm: f.criadaEm }));
    }
  }
  manifesto.sort((a, b) => String(b.adicionada).localeCompare(String(a.adicionada)));
  resumo.publicadas = manifesto.length;

  // Sem mudança, não regrava (a rodada roda a cada 10 min e quase sempre não há nada novo).
  const anterior = await storage.lerJson(BUCKET_PUBLICO, 'manifest.json');
  if (!anterior || JSON.stringify(anterior.fotos) !== JSON.stringify(manifesto)) {
    await storage.gravar(BUCKET_PUBLICO, 'manifest.json',
      Buffer.from(JSON.stringify({ versao: 1, atualizado: new Date().toISOString(), fotos: manifesto })),
      'application/json', 'max-age=60');
  }
  const estadoJson = JSON.stringify(estado);
  if (estadoJson !== estadoOriginal) {
    await storage.gravar(BUCKET_PRIVADO, 'estado.json', Buffer.from(estadoJson), 'application/json', 'no-cache');
  }

  return { resumo, estado, manifesto };
}

function primeiro(g) {
  // Preferência pelo arquivo mais antigo do grupo (o original da fotógrafa).
  return [...g.arquivos].sort((a, b) => a.createdTime.localeCompare(b.createdTime))[0];
}

async function apagarArquivos(storage, nome) {
  await storage.apagar(BUCKET_PUBLICO, [`${nome}.webp`, `${nome}.jpg`, `${nome}-p.webp`]);
}

/** Resumo legível para a aba do GitHub Actions. Os logs do repositório são públicos: sem IDs, sem descrição das fotos. */
export function textoResumo({ resumo, estado, manifesto }) {
  const linhas = [`## Fotos do Drive`, '',
    `- Arquivos na pasta: ${resumo.listados} (${resumo.ignorados} ignorado(s) por dono fora da lista)`,
    `- Novas nesta rodada: ${resumo.novas.length}`,
    `- Removidas: ${resumo.removidas}`,
    `- No ar agora: ${manifesto.length} (TV: ${manifesto.filter((m) => m.tv).length}, site: ${manifesto.filter((m) => m.site).length})`, ''];
  if (resumo.novas.length) {
    linhas.push('| Arquivo | Unidade | Destino |', '|---|---|---|');
    for (const k of resumo.novas) {
      const f = estado.fotos[k];
      const destino = f.status === 'classificada'
        ? [f.destino?.tv && 'TV', f.destino?.site && 'site'].filter(Boolean).join(' + ') || `fora (${f.destino?.motivo})`
        : f.status === 'recusada-ia' ? 'fora (a IA não classificou; revise à mão)' : 'erro';
      linhas.push(`| ${f.nome} | ${f.c?.unidade || '-'} | ${destino} |`);
    }
  }
  if (resumo.erros.length) linhas.push('', '### Erros', ...resumo.erros.map((e) => `- ${e}`));
  return linhas.join('\n');
}

async function main() {
  const env = process.env;
  const faltando = ['FOTOS_DRIVE_FOLDER_ID', 'GOOGLE_SERVICE_ACCOUNT_JSON', 'ANTHROPIC_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'FOTOS_DONOS']
    .filter((k) => !env[k]);
  if (faltando.length) {
    console.error(`Faltam segredos/variáveis no GitHub: ${faltando.join(', ')}. Veja scripts/fotos/LEIA-ME.md.`);
    process.exit(1);
  }
  const { token, listar, baixar } = await import('./drive.mjs');
  const { criarStorage } = await import('./storage.mjs');
  const { criarClassificador } = await import('./classificar.mjs');
  const imagem = await import('./imagem.mjs');

  const tk = await token(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  console.log(`Conta de serviço: ${tk.email}`);
  const resultado = await sincronizar({
    drive: { listar: () => listar(tk.accessToken, env.FOTOS_DRIVE_FOLDER_ID), baixar: (id) => baixar(tk.accessToken, id) },
    storage: criarStorage(env.SUPABASE_URL || 'https://ivjvpdzsfjdpyabbzzuj.supabase.co', env.SUPABASE_SERVICE_ROLE_KEY),
    classificar: criarClassificador({ apiKey: env.ANTHROPIC_API_KEY, modelo: env.FOTOS_MODELO || undefined }),
    imagem,
    config: {
      donos: env.FOTOS_DONOS,
      maxPorRodada: Number(env.FOTOS_MAX_POR_RODADA) || 200,
      permitirRemocaoEmMassa: env.FOTOS_PERMITIR_REMOCAO_EM_MASSA === '1',
      reprocessarHd: env.FOTOS_REPROCESSAR_HD === '1',
    },
  });
  const texto = textoResumo(resultado);
  console.log(texto);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, texto + '\n');
  if (resultado.resumo.erros.length) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
