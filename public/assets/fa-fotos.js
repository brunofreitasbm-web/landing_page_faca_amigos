/* Fotos novas da fotógrafa (Google Drive → scripts/fotos/sync.mjs → Supabase Storage).
 *
 * O tema da foto (escolhido pela IA) decide o lugar: cada slide tem o tema da sua foto fixa
 * (temaDaImagem) e só recebe foto nova do mesmo tema.
 *
 * window.FAFotos.carregar({ tv: true, temas })       → Promise<[foto]> liberadas para TV, desses temas
 * window.FAFotos.carregar({ site: true, unidades })  → Promise<[foto]> só as aprovadas para o site
 * window.FAFotos.vigiar(filtro, fn, ms)              → chama fn(fotos) agora e de novo a cada `ms` quando mudar
 * window.FAFotos.sorteio()                           → { atualizar(fotos), novaVolta(), pegar(tema, aceita) }
 * window.FAFotos.doDia(fotos, n)                     → n fotos: as da última semana primeiro, o resto em rodízio diário
 * window.FAFotos.temaDaImagem('img/hero-piscina-bolinhas.webp') → 'piscina_bolinhas'
 *
 * Cada foto: { id, webp, jpg, webpP, w, h, tema, unidade, alt, rotulo, legenda, kicker, headline, plano, sfx, pos }
 * Falha de rede nunca derruba a página: volta lista vazia e a página segue com as fotos fixas.
 * Desligar numa tela: ?fotos=0 na URL.
 */
(function () {
  'use strict';
  var BASE = 'https://ivjvpdzsfjdpyabbzzuj.supabase.co/storage/v1/object/public/fotos-site/';
  var desligado = /[?&]fotos=0\b/.test(location.search);

  function baixar() {
    if (desligado || !window.fetch) return Promise.resolve([]);
    // Um parâmetro por minuto: fura o cache do CDN no máximo uma vez por minuto por tela.
    var url = BASE + 'manifest.json?m=' + Math.floor(Date.now() / 60000);
    var timeout = new Promise(function (ok) { setTimeout(function () { ok(null); }, 8000); });
    var req = fetch(url, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
    return Promise.race([req, timeout]).then(function (m) {
      return m && m.fotos && m.fotos.length ? m.fotos.map(montar) : [];
    });
  }

  function montar(f) {
    return {
      id: f.id, w: f.w, h: f.h, tema: f.tema, unidade: f.unidade, tv: !!f.tv, site: f.site,
      webp: BASE + f.src + '.webp', jpg: BASE + f.src + '.jpg', webpP: BASE + f.src + '-p.webp',
      alt: f.alt || '', rotulo: f.rotulo || '', legenda: f.legenda || '',
      kicker: f.kicker || '', headline: f.headline || '', plano: f.plano, sfx: f.sfx, pos: f.pos || '50% 45%',
      adicionada: f.adicionada || ''
    };
  }

  function filtrar(fotos, filtro) {
    filtro = filtro || {};
    return fotos.filter(function (f) {
      if (filtro.tv && !f.tv) return false;
      if (filtro.temas && filtro.temas.indexOf(f.tema) < 0) return false;
      if (filtro.site && !f.site) return false;
      if (filtro.unidades && filtro.unidades.indexOf(f.unidade) < 0) return false;
      return true;
    });
  }

  function carregar(filtro) {
    return baixar().then(function (fotos) { return filtrar(fotos, filtro); });
  }

  function vigiar(filtro, fn, ms) {
    var ultimo = null;
    function rodada() {
      carregar(filtro).then(function (fotos) {
        var chave = fotos.map(function (f) { return f.id; }).join(',');
        if (chave !== ultimo) { ultimo = chave; try { fn(fotos); } catch (e) { /* a página segue */ } }
      });
    }
    rodada();
    // O catálogo muda ~1x por semana: uma consulta por hora basta.
    if (!desligado) setInterval(rodada, ms || 60 * 60 * 1000);
  }

  /* Escapa texto puro para atributo/HTML (use no alt). Rótulo, legenda, kicker e headline já vêm do
     sincronizador como HTML seguro (escapado, só com <em>/<br>): entram direto, sem esc(). */
  function esc(t) {
    return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* Tema de cada foto fixa do site (a ordem importa: a primeira regra que bate vale). Os nomes dos
     temas são os de scripts/fotos/regras.mjs (TEMAS). Foto sem tema (ex.: retrato da Isabella) nunca é trocada. */
  var TEMA_POR_IMAGEM = [
    [/piscina/, 'piscina_bolinhas'], [/mediadora/, 'acolhimento'], [/oficina/, 'oficina_arte'],
    [/cantinho/, 'cantinho_calma'], [/amarelinha/, 'brincadeira'], [/playground-fachada/, 'fachada_playground'],
    [/equipe/, 'equipe'],
    [/circuito-(frota|lamborghini-volante|bombeiro-painel)/, 'frota_carrinhos'],
    [/circuito-(quiosque|totem)/, 'quiosque_circuito'],
    [/circuito-(capivara|stitch|unicornio|cachorro)/, 'pelucia_motorizada'],
    [/circuito-/, 'crianca_dirigindo'],
    [/clinica-atividade/, 'clinica_terapia'], [/clinica-recursos/, 'clinica_materiais'],
    [/sensorial/, 'clinica_sensorial'], [/clinica-fachada/, 'clinica_fachada']
  ];
  function temaDaImagem(caminho) {
    var nome = String(caminho || '').split('/').pop();
    for (var i = 0; i < TEMA_POR_IMAGEM.length; i++) if (TEMA_POR_IMAGEM[i][0].test(nome)) return TEMA_POR_IMAGEM[i][1];
    return null;
  }

  /* Distribui as fotos novas pelos slides: pegar(tema) devolve a próxima foto daquele tema ainda não
     usada nesta volta (ou null, e o slide fica com a foto fixa). O cursor por tema anda a cada volta,
     então com várias fotos do mesmo tema cada volta mostra outras. */
  function diaBelem() { return Math.floor((Date.now() - 3 * 3600000) / 86400000); }

  /* Rodízio do catálogo: as fotos da última semana sempre entram; as outras são embaralhadas com o dia
     como semente, então o mesmo dia mostra as mesmas (em qualquer tela e a cada recarga) e o dia
     seguinte mostra outras. Assim as fotos antigas do catálogo voltam a aparecer. */
  function doDia(fotos, n) {
    var hoje = diaBelem();
    var semana = hoje - 7;
    var novas = [], resto = [];
    fotos.forEach(function (f) {
      var dia = Math.floor((Date.parse(f.adicionada) - 3 * 3600000) / 86400000);
      (dia > semana ? novas : resto).push(f);
    });
    var semente = hoje;
    function aleatorio() { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648; }
    for (var i = resto.length - 1; i > 0; i--) {
      var j = Math.floor(aleatorio() * (i + 1));
      var t = resto[i]; resto[i] = resto[j]; resto[j] = t;
    }
    return novas.concat(resto).slice(0, n);
  }

  function sorteio() {
    // Cursor começa no dia de hoje: cada dia começa por outras fotos de cada tema, e não sempre pelas mesmas.
    var fotos = [], usadas = {}, cursor = {}, inicio = diaBelem();
    return {
      atualizar: function (lista) { fotos = lista || []; },
      novaVolta: function () { usadas = {}; },
      pegar: function (tema, aceita) {
        if (!tema) return null;
        var c = fotos.filter(function (f) { return f.tema === tema && !usadas[f.id] && (!aceita || aceita(f)); });
        if (!c.length) return null;
        cursor[tema] = (cursor[tema] === undefined ? inicio : cursor[tema]) + 1;
        var f = c[cursor[tema] % c.length];
        usadas[f.id] = true;
        return f;
      }
    };
  }

  function figuraHtml(f) {
    return '<figure data-foto="' + esc(f.id) + '"><picture>' +
      '<source type="image/webp" srcset="' + f.webpP + ' 720w, ' + f.webp + ' 1600w" sizes="(max-width: 760px) 50vw, 380px">' +
      '<img src="' + f.jpg + '" width="' + (f.w | 0) + '" height="' + (f.h | 0) + '" alt="' + esc(f.alt) +
      '" loading="lazy" decoding="async" style="object-position:' + esc(f.pos) + '"></picture>' +
      (f.rotulo ? '<figcaption>' + f.rotulo + '</figcaption>' : '') + '</figure>';
  }

  /* Landings: põe as fotos aprovadas numa grade que já existe.
     onde: 'inicio' | 'apos-primeiro' (mantém a foto de destaque) | 'fim'. Devolve quantas entraram. */
  function galeria(grade, filtro, opcoes) {
    opcoes = opcoes || {};
    if (!grade) return Promise.resolve(0);
    return carregar(filtro).then(function (fotos) {
      fotos = doDia(fotos, opcoes.max || 6);
      if (!fotos.length) return 0;
      var html = fotos.map(figuraHtml).join('');
      if (opcoes.onde === 'inicio') grade.insertAdjacentHTML('afterbegin', html);
      else if (opcoes.onde === 'apos-primeiro' && grade.firstElementChild) grade.firstElementChild.insertAdjacentHTML('afterend', html);
      else grade.insertAdjacentHTML('beforeend', html);
      return fotos.length;
    });
  }

  window.FAFotos = {
    carregar: carregar, vigiar: vigiar, galeria: galeria, figuraHtml: figuraHtml, esc: esc, base: BASE,
    temaDaImagem: temaDaImagem, sorteio: sorteio, doDia: doDia,
    // tv2 é exclusiva do Circuito: só carrinho ou pelúcia andando (igual a TEMAS_TV2 em scripts/fotos/regras.mjs)
    TEMAS_TV2: ['crianca_dirigindo', 'pelucia_motorizada', 'frota_carrinhos']
  };
})();
