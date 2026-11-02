/*
 * FaçaAmigos: barra de ação fixa no celular (aparece depois de rolar um pouco).
 * Uso:
 *   <script src="/assets/fa-cta.js" defer data-label="Ver preços" data-href="#precos" data-event="ver_precos"></script>
 * - data-label / data-href: ação principal (obrigatórios).
 * - O botão de WhatsApp reaproveita o link do .wa-float da própria página (número certo de cada unidade).
 *   Para páginas em que a ação principal já é o WhatsApp, use data-href="whatsapp" (sem segundo botão).
 * - Só em telas até 760px. Esconde o .wa-float enquanto a barra está visível (evita botões empilhados).
 * - Eventos: cta_click {cta_location: 'barra_fixa', destino} e whatsapp_click (o fa-track.js já cuida do WhatsApp).
 */
(function () {
  'use strict';
  var me = document.currentScript;
  if (!me) return;
  var label = me.getAttribute('data-label');
  var href = me.getAttribute('data-href');
  if (!label || !href) return;
  var mq = window.matchMedia ? window.matchMedia('(max-width: 760px)') : { matches: false };

  var waFloat = document.querySelector('.wa-float');
  var waHref = waFloat ? waFloat.getAttribute('href') : '';
  var primaryIsWa = href === 'whatsapp';
  if (primaryIsWa) { if (!waHref) return; href = waHref; }

  var bar = document.createElement('div');
  bar.id = 'fa-cta';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Ação rápida');
  var wa = !primaryIsWa && waHref
    ? '<a class="fa-cta-wa" href="' + waHref + '" target="_blank" rel="noopener" aria-label="Chamar no WhatsApp">' +
      '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.8 11.8 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z"/></svg></a>'
    : '';
  bar.innerHTML =
    '<style>' +
    '#fa-cta{position:fixed;left:0;right:0;bottom:0;z-index:900;display:none;gap:10px;align-items:center;' +
    'padding:10px 14px calc(10px + env(safe-area-inset-bottom));background:#fff;box-shadow:0 -4px 18px rgba(0,0,0,.14);' +
    'transform:translateY(110%);transition:transform .25s ease}' +
    '#fa-cta.on{transform:translateY(0)}' +
    'html.fa-consent-open #fa-cta{display:none!important}' +
    '#fa-cta .fa-cta-main{flex:1;text-align:center;min-height:46px;display:flex;align-items:center;justify-content:center;' +
    'border-radius:999px;background:#F0196B;color:#fff;font:800 16px Nunito,"Nunito Fallback",system-ui,sans-serif;text-decoration:none;padding:10px 16px}' +
    '#fa-cta .fa-cta-wa{flex:0 0 46px;height:46px;border-radius:50%;background:#25D366;color:#fff;display:flex;align-items:center;justify-content:center}' +
    '@media (max-width:760px){#fa-cta{display:flex}body.fa-cta-on .wa-float{display:none!important}}' +
    '@media (prefers-reduced-motion:reduce){#fa-cta{transition:none}}' +
    '</style>' +
    '<a class="fa-cta-main" href="' + href + '"' + (primaryIsWa || /^https?:/.test(href) ? ' target="_blank" rel="noopener"' : '') + '>' + label + '</a>' + wa;

  function show(on) {
    bar.classList.toggle('on', on);
    document.body.classList.toggle('fa-cta-on', on && mq.matches);
  }
  function onScroll() {
    // Só depois de passar do topo (hero) e antes do rodapé, para não cobrir o fim da página.
    var y = window.pageYOffset || document.documentElement.scrollTop;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    show(y > 420 && y < max - 300);
  }

  function ready() {
    document.body.appendChild(bar);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    bar.querySelector('.fa-cta-main').addEventListener('click', function () {
      if (window.faTrack) window.faTrack('cta_click', { cta_location: 'barra_fixa', destino: me.getAttribute('data-event') || label, pagina: location.pathname });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();
