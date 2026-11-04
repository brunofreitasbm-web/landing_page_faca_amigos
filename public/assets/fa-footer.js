/*
 * FaçaAmigos: rodapé único + bloco "Contato desta unidade".
 *
 * Todas as páginas públicas usam  <footer data-fa-footer="KIND" [data-fa-ops="..."]></footer>
 * e  <script src="/assets/fa-footer.js" defer></script>.
 *
 * 1. O rodapé é IDÊNTICO em todas as páginas: lista cada operação do hub (Parque Shopping, Bosque
 *    Grão-Pará, Clínica) com endereço, horário, WhatsApp e site próprios. KIND só alimenta o tracking (utm).
 * 2. O bloco "Contato desta unidade" aparece acima do rodapé nas páginas de uma operação. Escolha por
 *    data-fa-ops (lista separada por vírgula de: parque, graopara, clinica) (sem o atributo, o bloco não aparece; o rodapé já mostra as unidades):
 *    playground → parque+graopara · circuito → parque · teste/aprender/glossario/eventos/ebook → clinica.
 *    Use data-fa-ops="" (ou KIND hub/legal) para não mostrar o bloco.
 *
 * Dados de cada operação: só em UNITS (abaixo). Ao editar este arquivo, atualize o ?v= dos <script> nas páginas.
 */
(function () {
  'use strict';

  // ---- Dados das operações (única fonte; editar aqui quando abrir / mudar contato) ----
  var UNITS = {
    parque: {
      nome: 'Parque Shopping Belém',
      papel: 'Playground & Circuito',
      endereco: 'Rod. Augusto Montenegro, 4300 · Playground no 1º piso · Circuito no térreo, em frente à C&amp;A',
      horario: '',
      waRotulo: 'Parque',
      wa: '5591992347673',
      waTexto: 'Oi! Gostaria de informações sobre a unidade Parque Shopping.',
      mapa: 'https://maps.google.com/?q=Parque+Shopping+Bel%C3%A9m',
      paginas: [['Playground', '/playground'], ['Circuito', '/circuito']]
    },
    graopara: {
      nome: 'Shopping Bosque Grão-Pará',
      papel: 'Playground',
      endereco: 'Av. Centenário, 1052 · Val-de-Cans · 1º piso, em frente à Renner',
      horario: '',
      waRotulo: 'Grão-Pará',
      wa: '5591991101215',
      waTexto: 'Oi! Gostaria de informações sobre o Playground Grão-Pará.',
      mapa: 'https://www.google.com/maps/dir/?api=1&amp;destination=Shopping+Bosque+Gr%C3%A3o-Par%C3%A1%2C+Av.+Centen%C3%A1rio%2C+1052%2C+Bel%C3%A9m+PA&amp;travelmode=driving',
      paginas: [['Playground', '/playground']]
    },
    clinica: {
      nome: 'Centro de Terapia Comportamental',
      papel: 'Clínica',
      status: 'Atendendo',
      endereco: 'Rua Boaventura da Silva, 1573 · Umarizal',
      horario: '',
      waRotulo: 'Clínica',
      wa: '5591991782027',
      waTexto: 'Olá! Gostaria de informações sobre o FaçaAmigos - Centro de Terapia Comportamental.',
      mapa: 'https://maps.google.com/?q=Rua+Boaventura+da+Silva,+1573,+Bel%C3%A9m+PA',
      paginas: [['Clínica', '/clinica'], ['Pacotes particulares', '/planos']]
    }
  };
  var ORDEM = ['parque', 'graopara', 'clinica'];
  var EMAIL = 'institutofacaamigos@gmail.com';
  var INSTAGRAM = 'https://www.instagram.com/facaamigos.belem/';

  // O rodapé já lista as três unidades: o bloco "Contato desta unidade" só aparece com data-fa-ops explícito.
  var OPS_PADRAO = {};

  var footer = document.querySelector('footer[data-fa-footer]');
  if (!footer) return;
  var kind = footer.getAttribute('data-fa-footer') || 'hub';

  // Links absolutos em produção; em localhost/preview ficam relativos. Playground e Circuito
  // moram no mesmo domínio do hub (/playground e /circuito).
  var HUB = 'https://institutofacaamigos.com.br';
  var isProd = /(^|\.)institutofacaamigos\.com\.br$/.test(location.hostname);
  function hub(p) { return (isProd ? HUB : '') + p; }

  function link(href, text, extra) { return '<a href="' + href + '"' + (extra || '') + '>' + text + '</a>'; }
  var EXT = ' target="_blank" rel="noopener"';

  function fmtFone(n) {
    var d = n.replace(/^55/, '');
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  }
  function siteUrl(u) {
    return u.site + '?utm_source=hub&amp;utm_medium=site&amp;utm_campaign=rodape_' + kind;
  }

  // ---- Estilos (rodapé idêntico em todas as páginas: o visual não depende do CSS de cada página) ----
  if (!document.getElementById('fa-footer-styles')) {
    var style = document.createElement('style');
    style.id = 'fa-footer-styles';
    style.textContent = [
      'footer[data-fa-footer] { box-sizing: border-box; display: block; width: 100%; max-width: none; margin: 0; padding: 48px 20px 100px; background: #065264; color: #fff; text-align: left; font-family: inherit; font-size: 1rem; font-weight: 400; line-height: 1.5; border: 0; border-top: 1px solid rgba(255, 255, 255, 0.14); }',
      'footer[data-fa-footer] .fa-footer-wrap { width: 100%; max-width: 1120px; margin: 0 auto; box-sizing: border-box; }',
      'footer[data-fa-footer] .fa-footer-units { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin: 20px 0 8px; }',
      'footer[data-fa-footer] .fa-unit { background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 14px; padding: 18px 18px 16px; }',
      'footer[data-fa-footer] .fa-unit h4 { margin: 0; font-size: 1.02rem; font-weight: 800; line-height: 1.3; color: #fff; }',
      'footer[data-fa-footer] .fa-unit-role { display: block; margin: 2px 0 10px; font-size: 0.82rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #FFD84D; }',
      'footer[data-fa-footer] .fa-unit p { margin: 0 0 6px; font-size: 0.9rem; line-height: 1.5; color: rgba(255, 255, 255, 0.92); }',
      'footer[data-fa-footer] .fa-unit-wa, .fa-ops .fa-unit-wa { margin: 8px 0 4px; display: inline-flex; align-items: center; min-height: 44px; padding: 9px 16px; border-radius: 999px; background: #25D366; color: #053b1c !important; font-weight: 800; font-size: 0.9rem; text-decoration: none !important; }',
      'footer[data-fa-footer] .fa-unit-links { margin: 6px 0 0; font-size: 0.85rem; }',
      'footer[data-fa-footer] .fa-unit-links a { margin-right: 14px; }',
      'footer[data-fa-footer] .fa-footer-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 28px 40px; margin: 28px 0 28px; }',
      'footer[data-fa-footer] .fa-footer-title { margin: 0 0 14px; font-size: 0.8rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.88; color: inherit; }',
      'footer[data-fa-footer] .fa-footer-list { list-style: none; padding: 0; margin: 0; }',
      'footer[data-fa-footer] .fa-footer-list li { margin: 0 0 10px; font-size: 0.92rem; line-height: 1.5; }',
      'footer[data-fa-footer] a { color: inherit; font-weight: 600; text-decoration: underline; text-underline-offset: 3px; text-decoration-color: rgba(255, 255, 255, 0.4); }',
      'footer[data-fa-footer] a:hover { text-decoration-color: currentColor; }',
      'footer[data-fa-footer] .fa-footer-bottom { border-top: 1px solid rgba(255, 255, 255, 0.14); padding-top: 20px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px; font-size: 0.85rem; opacity: 0.9; }',
      'footer[data-fa-footer] .fa-footer-bottom p { margin: 0; line-height: 1.5; font-size: inherit; }',
      '.fa-ops { box-sizing: border-box; max-width: 1120px; margin: 40px auto 0; padding: 0 20px; font-family: inherit; }',
      '.fa-ops-title { margin: 0 0 12px; font-size: 0.8rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #065264; }',
      '.fa-ops-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }',
      '.fa-ops .fa-unit { background: #fff; border: 2px solid #07C5C8; border-radius: 16px; padding: 18px 20px; color: #065264; box-sizing: border-box; }',
      '.fa-ops .fa-unit h4 { margin: 0; font-size: 1.1rem; font-weight: 800; line-height: 1.3; }',
      '.fa-ops .fa-unit-role { display: block; margin: 2px 0 10px; font-size: 0.82rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #D61F4A; }',
      '.fa-ops .fa-unit p { margin: 0 0 6px; font-size: 0.95rem; line-height: 1.5; }',
      '.fa-ops .fa-unit-links { margin: 6px 0 0; font-size: 0.9rem; }',
      '.fa-ops .fa-unit-links a { margin-right: 14px; color: #065264; font-weight: 800; }',
      '@media (max-width: 640px) { footer[data-fa-footer] { padding-left: 16px; padding-right: 16px; } .fa-ops { padding: 0 16px; } }'
    ].join('\n');
    document.head.appendChild(style);
  }

  // ---- Cartão de uma operação (usado no rodapé e no bloco da página) ----
  function unitCard(id) {
    var u = UNITS[id];
    var linhas = [];
    linhas.push('<p>' + u.endereco + (u.status ? ' <strong>(' + u.status + ')</strong>' : '') + '</p>');
    if (u.horario) linhas.push('<p>' + u.horario + '</p>');
    var links = [link(u.mapa, 'Como chegar', EXT)];
    if (u.site) links.push(link(siteUrl(u), 'Site', EXT));
    u.paginas.forEach(function (p) { links.push(link(hub(p[1]), p[0])); });
    return [
      '<div class="fa-unit" data-fa-unit="' + id + '">',
      '  <h4>' + u.nome + '</h4>',
      '  <span class="fa-unit-role">' + u.papel + '</span>',
      linhas.join('\n'),
      '  ' + link('https://wa.me/' + u.wa + '?text=' + encodeURIComponent(u.waTexto), 'WhatsApp ' + u.waRotulo + ': ' + fmtFone(u.wa), ' class="fa-unit-wa"' + EXT),
      '  <div class="fa-unit-links">' + links.join('') + '</div>',
      '</div>'
    ].join('\n');
  }

  // ---- Rodapé ----
  var colNavegacao = [
    '<div class="fa-footer-col">',
    '  <h4 class="fa-footer-title">Navegação</h4>',
    '  <ul class="fa-footer-list">',
    '    <li>' + link(hub('/'), 'Início') + '</li>',
    '    <li>' + link(hub('/clinica'), 'Clínica: especialidades e avaliação') + '</li>',
    '    <li>' + link(hub('/planos'), 'Pacotes particulares') + '</li>',
    '    <li>' + link(hub('/playground'), 'Playground Inclusivo') + '</li>',
    '    <li>' + link(hub('/circuito'), 'Circuito de Carrinhos') + '</li>',
    '    <li>' + link(hub('/mapeamento'), 'Mapeamento Gratuito', ' data-fa-link="rodape_' + kind + '"') + '</li>',
    '    <li>' + link(hub('/eventos'), 'Eventos (palestras e treinamentos)') + '</li>',
    '  </ul>',
    '</div>'
  ].join('\n');

  var colConteudos = [
    '<div class="fa-footer-col">',
    '  <h4 class="fa-footer-title">Conteúdos</h4>',
    '  <ul class="fa-footer-list">',
    '    <li>' + link(hub('/aprender'), 'Aprender (Artigos &amp; Guias)') + '</li>',
    '    <li>' + link(hub('/glossario'), 'Glossário Comportamental') + '</li>',
    '    <li>' + link(hub('/guia'), 'E-book: O Brincar com Propósito', ' data-fa-link="rodape_' + kind + '"') + '</li>',
    '    <li>' + link(hub('/codigo'), 'E-book: O Código do Desenvolvimento Infantil', ' data-fa-link="rodape_' + kind + '"') + '</li>',
    '  </ul>',
    '</div>'
  ].join('\n');

  var colInstituto = [
    '<div class="fa-footer-col">',
    '  <h4 class="fa-footer-title">Instituto Faça Amigos</h4>',
    '  <ul class="fa-footer-list">',
    '    <li>E-mail: ' + link('mailto:' + EMAIL, EMAIL) + '</li>',
    '    <li>Instagram: ' + link(INSTAGRAM, '@facaamigos.belem', EXT) + '</li>',
    '    <li>' + link(hub('/trabalhe-conosco'), 'Faça parte do nosso time') + '</li>',
    '    <li>' + link(hub('/politica-privacidade'), 'Política de Privacidade') + '</li>',
    '    <li>' + link(hub('/termos'), 'Termos de Uso e de Compra') + '</li>',
    '  </ul>',
    '</div>'
  ].join('\n');

  var htmlGrid = [
    '<div class="fa-footer-wrap">',
    '  <span class="fa-logo-card fa-logo-card--footer"><img class="fa-logo-img" src="' + hub('/img/logo-facaamigos.png') + '" alt="FaçaAmigos" width="1024" height="147" loading="lazy" decoding="async"></span>',
    '  <div class="fa-footer-units">',
    ORDEM.map(unitCard).join('\n'),
    '  </div>',
    '  <div class="fa-footer-grid">',
    colNavegacao,
    colConteudos,
    colInstituto,
    '  </div>',
    '  <div class="fa-footer-bottom">',
    '    <p class="legal">FaçaAmigos Playground Inclusivo · CNPJ 66.318.630/0001-17 (Playground e Circuito)</p>',
    '    <p class="legal">Instituto Faça Amigos Ltda · CNPJ 22.161.197/0001-83 (Clínica, Mapeamento Comportamental e e-books) · Belém/PA</p>',
    '    <a href="#" data-fa-cookies style="display:inline-block;margin:6px 10px;color:inherit;text-decoration:underline;font-size:13px;opacity:.85">Preferências de cookies</a>',
    '  </div>',
    '</div>'
  ].join('\n');

  // Limpa o conteúdo estático de cada página (variava de página para página) e injeta o rodapé único.
  footer.innerHTML = '';
  footer.insertAdjacentHTML('beforeend', htmlGrid);
  var cookies = footer.querySelector('[data-fa-cookies]');
  if (cookies) cookies.addEventListener('click', function (e) { e.preventDefault(); if (window.faConsentOpen) window.faConsentOpen(); });

  // ---- Bloco "Contato desta unidade" ----
  var opsAttr = footer.hasAttribute('data-fa-ops') ? footer.getAttribute('data-fa-ops') : (OPS_PADRAO[kind] || '');
  var ids = opsAttr.split(',').map(function (s) { return s.trim(); }).filter(function (s) { return UNITS[s]; });
  if (ids.length) {
    var plural = ids.length > 1;
    footer.insertAdjacentHTML('beforebegin', [
      '<section class="fa-ops" aria-label="Contato desta unidade">',
      '  <h2 class="fa-ops-title">' + (plural ? 'Contato das unidades' : 'Contato desta unidade') + '</h2>',
      '  <div class="fa-ops-grid">',
      ids.map(unitCard).join('\n'),
      '  </div>',
      '</section>'
    ].join('\n'));
  }
})();
