// Fluxo completo do sincronizador com Drive, Storage e IA falsos (sem rede). As imagens são de
// verdade: um JPEG gerado com sharp passa por previa() e versoes().
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import * as imagemReal from '../imagem.mjs';
import { sincronizar } from '../sync.mjs';

const JPEG = await sharp({ create: { width: 2000, height: 1500, channels: 3, background: '#e44' } }).jpeg().toBuffer();
const imagem = { ...imagemReal, decodificar: async (b) => b };

function storageFalso() {
  const objetos = new Map();
  return {
    objetos,
    async garantirBuckets() {},
    async lerJson(b, c) { const o = objetos.get(`${b}/${c}`); return o ? JSON.parse(o.dados) : null; },
    async gravar(b, c, dados, tipo, cache) { objetos.set(`${b}/${c}`, { dados: dados.toString(), tipo, cache }); },
    async apagar(b, cs) { for (const c of cs) objetos.delete(`${b}/${c}`); },
  };
}

const arq = (id, md5, o = {}) => ({ id, name: `${id}.jpg`, mimeType: 'image/jpeg', md5Checksum: md5, size: '1000',
  createdTime: `2026-10-2${id.length}T10:00:00Z`, owners: [{ emailAddress: 'fotografa@x.com' }], aprovada: false, pastaIgnorada: false, caminho: `${id}.jpg`, ...o });

const respostas = {
  carro: { e_foto: true, tema: 'crianca_dirigindo', qualidade: 5, problemas: [], crianca_identificavel: true, sensivel: false, motivo_sensivel: '',
    descricao: 'menino no carro', alt: 'Menino ao volante', rotulo: 'Lamborghini', legenda: 'No volante', kicker: '🏎️ Lamborghini',
    headline: 'Olha a cara de quem <em>chegou</em>.', plano: 30, sfx: 'vroom', foco_x: 50, foco_y: 40, slug: 'menino-lamborghini' },
  logo: { e_foto: false, tema: 'outro', qualidade: 5, problemas: [], crianca_identificavel: false, sensivel: false, motivo_sensivel: '',
    descricao: 'logo', alt: 'Logo', rotulo: 'Logo', legenda: '', kicker: '', headline: '', plano: 0, sfx: 'plim', foco_x: 50, foco_y: 50, slug: 'logo' },
  clinica: { e_foto: true, tema: 'clinica_terapia', qualidade: 4, problemas: [], crianca_identificavel: true, sensivel: false, motivo_sensivel: '',
    descricao: 'sessão', alt: 'Sala de terapia', rotulo: 'Sala', legenda: 'Sala', kicker: '🧩 Clínica', headline: 'Cuidado', plano: 0, sfx: 'plim', foco_x: 50, foco_y: 50, slug: 'sala-terapia' },
};

function cenario(lista) {
  const chamadas = { classificar: 0, baixar: 0 };
  return {
    chamadas,
    drive: { listar: async () => lista(), baixar: async () => { chamadas.baixar++; return JPEG; } },
    classificar: async (b64, ctx) => { chamadas.classificar++; assert.ok(b64.length > 100); return { dados: respostas[ctx.nome.split('.')[0].replace(/\d+$/, '')] }; },
  };
}

const config = { donos: 'fotografa@x.com', maxPorRodada: 25 };

test('rodada completa: publica na TV certa, descarta logo, segura clínica, aprova para o site', async () => {
  const storage = storageFalso();
  let lista = [arq('carro', 'a'), arq('logo', 'b'), arq('clinica', 'c'), arq('carro2', 'a')];
  const c = cenario(() => lista);
  let r = await sincronizar({ ...c, storage, imagem, config, log: () => {} });

  // carro e carro2 têm o mesmo md5: uma foto só, uma chamada à IA
  assert.equal(c.chamadas.classificar, 3);
  assert.equal(r.manifesto.length, 1);
  const m = r.manifesto[0];
  assert.equal(m.tv, true);
  assert.equal(m.tema, 'crianca_dirigindo');
  assert.equal(m.unidade, 'circuito');
  assert.equal(m.site, false);
  assert.equal(m.plano, 30);
  assert.equal(m.pos, '50% 40%');
  assert.match(m.src, /^img\/menino-lamborghini-/);
  assert.ok(storage.objetos.has(`fotos-site/${m.src}.webp`));
  assert.ok(storage.objetos.has(`fotos-site/${m.src}-p.webp`));
  assert.equal(storage.objetos.get(`fotos-site/${m.src}.webp`).cache, 'max-age=31536000');
  // nada da clínica nem do logo foi enviado ao bucket público
  assert.equal([...storage.objetos.keys()].filter((k) => k.startsWith('fotos-site/img/')).length, 3);
  // o manifesto público não leva ID do Drive nem descrição interna
  const pub = storage.objetos.get('fotos-site/manifest.json').dados;
  assert.ok(!pub.includes('menino no carro') && !pub.includes('"carro"'));

  // 2ª rodada sem mudanças: não chama a IA de novo
  r = await sincronizar({ ...c, storage, imagem, config, log: () => {} });
  assert.equal(c.chamadas.classificar, 3);

  // A clínica vai para "Aprovadas": entra na TV da clínica e no site, sem nova chamada à IA
  lista = [arq('carro', 'a'), arq('logo', 'b'), arq('clinica', 'c', { aprovada: true })];
  r = await sincronizar({ ...c, storage, imagem, config, log: () => {} });
  assert.equal(c.chamadas.classificar, 3);
  const cl = r.manifesto.find((x) => x.unidade === 'clinica');
  assert.equal(cl.tv, true);
  assert.equal(cl.tema, 'clinica_terapia');
  assert.equal(cl.site, true);

  // Sai de "Aprovadas": some do ar e os arquivos são apagados
  lista = [arq('carro', 'a'), arq('logo', 'b'), arq('clinica', 'c')];
  r = await sincronizar({ ...c, storage, imagem, config, log: () => {} });
  assert.equal(r.manifesto.find((x) => x.unidade === 'clinica'), undefined);
  assert.ok(!storage.objetos.has(`fotos-site/${cl.src}.webp`));

  // Fotógrafa apaga o carro do Drive: sai do ar
  lista = [arq('logo', 'b'), arq('clinica', 'c')];
  r = await sincronizar({ ...c, storage, imagem, config, log: () => {} });
  assert.equal(r.manifesto.length, 0);
  assert.ok(!storage.objetos.has(`fotos-site/${m.src}.webp`));
});

test('reprocessamento HD: nome novo -hd, apaga o antigo, não repete e falha não derruba', async () => {
  const storage = storageFalso();
  const c = cenario(() => [arq('carro', 'a'), arq('carro22', 'z')]);
  let r = await sincronizar({ ...c, storage, imagem, config, log: () => {} });
  const antigos = r.manifesto.map((m) => m.src);
  assert.equal(antigos.length, 2);

  // 2 fotos: a de 'carro22' falha no download durante o HD e fica como estava
  const baixarOriginal = c.drive.baixar;
  const hd = { ...config, reprocessarHd: true };
  c.drive.baixar = async (id) => { if (id === 'carro22') throw new Error('Drive fora'); return baixarOriginal(id); };
  r = await sincronizar({ ...c, storage, imagem, config: hd, log: () => {} });
  const ok = r.manifesto.find((m) => m.src.endsWith('-hd'));
  assert.ok(ok, 'uma foto virou HD');
  const intacta = r.manifesto.find((m) => !m.src.endsWith('-hd'));
  assert.ok(intacta && antigos.includes(intacta.src), 'a que falhou continua com o nome antigo');
  assert.equal(r.resumo.erros.length, 1);
  assert.ok(storage.objetos.has(`fotos-site/${intacta.src}.webp`), 'antigo da que falhou mantido');
  const antigoOk = antigos.find((s) => ok.src === `${s}-hd`);
  assert.ok(antigoOk);
  for (const suf of ['.webp', '.jpg', '-p.webp']) {
    assert.ok(storage.objetos.has(`fotos-site/${ok.src}${suf}`));
    assert.equal(storage.objetos.get(`fotos-site/${ok.src}${suf}`).cache, 'max-age=31536000');
    assert.ok(!storage.objetos.has(`fotos-site/${antigoOk}${suf}`), 'arquivo antigo apagado');
  }
  const pub = storage.objetos.get('fotos-site/manifest.json').dados;
  assert.ok(pub.includes(ok.src));

  // Próxima rodada (Drive de volta): só a pendente é reprocessada; a já HD não baixa de novo e não vira -hd-hd
  c.drive.baixar = baixarOriginal;
  c.chamadas.baixar = 0;
  r = await sincronizar({ ...c, storage, imagem, config: hd, log: () => {} });
  assert.equal(c.chamadas.baixar, 1);
  assert.equal(r.resumo.erros.length, 0);
  assert.ok(r.manifesto.every((m) => /-hd$/.test(m.src) && !/-hd-hd/.test(m.src)));

  // E depois disso, nenhuma baixa
  c.chamadas.baixar = 0;
  r = await sincronizar({ ...c, storage, imagem, config: hd, log: () => {} });
  assert.equal(c.chamadas.baixar, 0);
  assert.equal(c.chamadas.classificar, 2);
});

test('listagem vazia de repente não apaga tudo', async () => {
  const storage = storageFalso();
  const muitas = Array.from({ length: 8 }, (_, i) => arq(`carro${i}`, `md${i}`));
  let lista = muitas;
  const c = cenario(() => lista);
  await sincronizar({ ...c, storage, imagem, config, log: () => {} });
  lista = [];
  await assert.rejects(sincronizar({ ...c, storage, imagem, config, log: () => {} }), /sumiram da listagem/);
  const r = await sincronizar({ ...c, storage, imagem, config: { ...config, permitirRemocaoEmMassa: true }, log: () => {} });
  assert.equal(r.manifesto.length, 0);
});

test('erro numa foto não derruba as outras e é tentado de novo depois', async () => {
  const storage = storageFalso();
  const c = cenario(() => [arq('carro', 'a'), arq('carro22', 'z')]);
  let falhar = true;
  const classificar = async (b64, ctx) => {
    if (ctx.nome === 'carro22.jpg' && falhar) throw new Error('API fora');
    return c.classificar(b64, ctx);
  };
  let r = await sincronizar({ ...c, classificar, storage, imagem, config, log: () => {} });
  assert.equal(r.resumo.erros.length, 1);
  assert.equal(r.manifesto.length, 1);
  falhar = false;
  r = await sincronizar({ ...c, classificar, storage, imagem, config, log: () => {} });
  assert.equal(r.resumo.erros.length, 0);
  assert.equal(r.manifesto.length, 2);
});

test('sem FOTOS_DONOS não roda', async () => {
  const c = cenario(() => []);
  await assert.rejects(sincronizar({ ...c, storage: storageFalso(), imagem, config: { maxPorRodada: 1 } }), /FOTOS_DONOS/);
});

test('catálogo: falha ao publicar não faz a IA reler as fotos', async () => {
  const storage = storageFalso();
  const muitas = Array.from({ length: 25 }, (_, i) => arq(`carro${i}`, `mm${i}`));
  const c = cenario(() => muitas);
  // a publicação falha depois da classificação
  const gravarOriginal = storage.gravar;
  storage.gravar = async (b, cam, ...r) => { if (cam.startsWith('img/')) throw new Error('runner perdido'); return gravarOriginal(b, cam, ...r); };
  const r1 = await sincronizar({ ...c, storage, imagem, config, log: () => {} });
  assert.equal(c.chamadas.classificar, 25);
  assert.ok(r1.resumo.erros.length > 0);
  storage.gravar = gravarOriginal;
  const r2 = await sincronizar({ ...c, storage, imagem, config, log: () => {} });
  assert.equal(c.chamadas.classificar, 25, 'nenhuma foto relida pela IA');
  assert.equal(r2.manifesto.length, 25);
});

test('catálogo: salvamento parcial a cada 10 fotos', async () => {
  const storage = storageFalso();
  const muitas = Array.from({ length: 25 }, (_, i) => arq(`carro${i}`, `pp${i}`));
  const c = cenario(() => muitas);
  const tamanhos = [];
  const gravarOriginal = storage.gravar;
  storage.gravar = async (b, cam, dados, ...r) => {
    if (cam === 'estado.json') tamanhos.push(Object.keys(JSON.parse(dados.toString()).fotos).length);
    return gravarOriginal(b, cam, dados, ...r);
  };
  await sincronizar({ ...c, storage, imagem, config, log: () => {} });
  assert.deepEqual(tamanhos, [10, 20, 25]);
});

test('catálogo: segunda semana só chama a IA para as fotos novas', async () => {
  const storage = storageFalso();
  let lista = Array.from({ length: 12 }, (_, i) => arq(`carro${i}`, `sem1-${i}`));
  const c = cenario(() => lista);
  await sincronizar({ ...c, storage, imagem, config, log: () => {} });
  assert.equal(c.chamadas.classificar, 12);
  lista = lista.concat(Array.from({ length: 3 }, (_, i) => arq(`carro${i + 50}`, `sem2-${i}`)));
  const r = await sincronizar({ ...c, storage, imagem, config, log: () => {} });
  assert.equal(c.chamadas.classificar, 15);
  assert.equal(r.resumo.novas.length, 3);
  assert.equal(r.manifesto.length, 15);
});
