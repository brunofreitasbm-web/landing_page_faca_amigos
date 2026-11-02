/*
 * FaçaAmigos: rastreamento + consentimento (LGPD) num arquivo só.
 * Incluir no <head> de cada página pública, antes de qualquer outro script:
 *   <script src="/assets/fa-track.js"></script>
 *
 * O que faz
 *  1. Consent Mode v2: tudo começa NEGADO. GTM e GA4 carregam em modo sem cookies até a pessoa aceitar no
 *     banner. O Microsoft Clarity (mapas de calor e gravação de sessão) só carrega DEPOIS do aceite — voltou em
 *     01/10/2026 com o projeto novo yr1no82bvm; o Contentsquare continua removido.)
 *  2. Origem do visitante: guarda a primeira origem (utm_*, gclid, fbclid, src, sck, referrer) e a mais recente,
 *     num cookie do domínio raiz — assim ela sobrevive ao salto entre o hub e o subdomínio do playground.
 *     Links internos não levam UTM (a origem real fica no cookie; UTM interno abriria sessão nova no GA4).
 *     window.faOrigin() devolve a origem para os formulários.
 *  3. Eventos: whatsapp_click, begin_checkout (Hotmart), file_download, scroll_depth 50/90 e cta_click nos
 *     links internos marcados com data-fa-link="<onde>" (substitui os antigos ?utm_source=site&utm_medium=...).
 *  4. client_id do GA4 até o checkout: guia.html/codigo.html pegam o xcod de faOrigin() e mandam junto no link
 *     da Hotmart. O hotmart-webhook lê de volta e manda a compra pro GA4 via Measurement Protocol — sem isso,
 *     nenhuma venda aparecia ligada à campanha que trouxe a pessoa.
 *
 * IDs em um lugar só (antes estavam copiados em 9 arquivos).
 */
(function () {
  'use strict';

  // GTM: um container só (GTM-NPDJ58XR). Até 29/09/2026 carregavam dois (GTM-PN5D2BTS e GTM-NPDJ58XR); em 09/10/2026
  // o site passou a usar só o GTM-NPDJ58XR, em todas as páginas e no portal Wi-Fi. Ao criar tags
  // no painel, criar SÓ nesse container e conferir que a tag GA4 não duplica o gtag direto abaixo (page_view em
  // dobro). O scripts/check.mjs reprova a volta de um segundo container.
  var IDS = { gtm: 'GTM-NPDJ58XR', ga4: 'G-37G5XLBXKG', clarity: 'yr1no82bvm', meta: '2388086018599846' };
  var CONSENT_KEY = 'fa_consent';
  var ORIGIN_KEY = 'fa_origin';
  var PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid', 'src', 'sck'];
  var ROOT_DOMAIN = 'institutofacaamigos.com.br';
  // playground. fica na lista enquanto durar o redirecionamento 308 para /playground (links antigos, QR, anúncios).
  var INTERNAL_HOSTS = ['institutofacaamigos.com.br', 'www.institutofacaamigos.com.br', 'playground.institutofacaamigos.com.br'];
  var WHATSAPP_UNITS = { '5591991782027': 'clinica', '5591992347673': 'playground_circuito', '5591991101215': 'playground_graopara' };
  // GEO & AEO: quando não há utm_source na URL, mas o referrer é um desses domínios, a visita entrou por uma
  // resposta de IA generativa / Answer Engine. Vira utm_source=<engine>&utm_medium=ai em fa_origin, evento GA4 e user_property
  // "ai_engine" (ver fa-weekly-report para o relatório semanal).
  var AI_REFERRERS = {
    'chatgpt.com': 'chatgpt',
    'chat.openai.com': 'chatgpt',
    'perplexity.ai': 'perplexity',
    'www.perplexity.ai': 'perplexity',
    'gemini.google.com': 'gemini',
    'bard.google.com': 'gemini',
    'copilot.microsoft.com': 'copilot',
    'edgeservices.bing.com': 'copilot',
    'claude.ai': 'claude',
    'you.com': 'you',
    'poe.com': 'poe',
    'searchgpt.com': 'searchgpt',
    'iask.ai': 'iask',
    'phind.com': 'phind',
    'deepseek.com': 'deepseek',
    'chat.deepseek.com': 'deepseek',
    'mistral.ai': 'mistral',
    'chat.mistral.ai': 'mistral',
    'grok.com': 'grok',
    'x.ai': 'grok',
    'meta.ai': 'meta_ai'
  };
  var CHECKOUTS = {
    M107692257Y: { id: 'guia', name: 'O Brincar com Propósito', value: 29.9 },
    // O begin_checkout precisa do valor: sem ele o Google Ads e o Meta não conseguem otimizar por ROAS nem
    // calcular custo por conversão. Se o preço mudar na Hotmart, mudar aqui e na página do produto.
    V107698297N: { id: 'codigo', name: 'O Código do Desenvolvimento Infantil', value: 9.9 }
  };

  function read(key) { try { return window.localStorage.getItem(key); } catch (e) { return null; } }
  function write(key, val) { try { window.localStorage.setItem(key, val); } catch (e) { /* modo privado */ } }

  // ---------- origem compartilhada entre os subdomínios ----------
  // O localStorage é isolado por origem: o que institutofacaamigos.com.br grava, playground.institutofacaamigos.com.br
  // NÃO lê. Quem entra por anúncio no hub e vai para o playground perdia a origem no meio do caminho. Por isso a
  // origem passa a viver num cookie de primeira parte no domínio raiz (.institutofacaamigos.com.br), que todos os
  // subdomínios enxergam. O localStorage continua como espelho: serve de leitura para quem já tinha origem gravada
  // antes desta mudança e de reserva quando o cookie não está disponível (localhost, file://, cookies bloqueados).
  var ORIGIN_MAX_AGE = 15552000; // 180 dias
  var COOKIE_LIMIT = 3500;       // margem para o limite de ~4KB por cookie

  function cookieDomain() {
    var h = window.location.hostname;
    if (h === ROOT_DOMAIN || h.slice(-(ROOT_DOMAIN.length + 1)) === '.' + ROOT_DOMAIN) return '.' + ROOT_DOMAIN;
    return ''; // localhost/preview: cookie de host mesmo
  }

  function readCookie(key) {
    try {
      var parts = document.cookie ? document.cookie.split('; ') : [];
      for (var i = 0; i < parts.length; i++) {
        var eq = parts[i].indexOf('=');
        if (eq > 0 && parts[i].slice(0, eq) === key) return decodeURIComponent(parts[i].slice(eq + 1));
      }
    } catch (e) { /* cookies bloqueados */ }
    return null;
  }

  function writeCookie(key, val) {
    var encoded = encodeURIComponent(val);
    if (encoded.length > COOKIE_LIMIT) return false;
    try {
      var d = cookieDomain();
      document.cookie = key + '=' + encoded + '; path=/; max-age=' + ORIGIN_MAX_AGE + '; SameSite=Lax' +
        (d ? '; domain=' + d : '') + (window.location.protocol === 'https:' ? '; Secure' : '');
      return true;
    } catch (e) { return false; }
  }

  // Lê o cookie primeiro; cai no localStorage para não perder a origem de quem já navegava antes.
  function readOrigin() { var v = readCookie(ORIGIN_KEY); return v !== null && v !== '' ? v : read(ORIGIN_KEY); }
  function writeOrigin(val) { writeCookie(ORIGIN_KEY, val); write(ORIGIN_KEY, val); }

  // client_id do GA4 (cookie _ga, formato GA1.1.<id1>.<id2>; client_id = "<id1>.<id2>"). Serve para levar a
  // compra até o Measurement Protocol no hotmart-webhook: a Hotmart não devolve o client_id sozinha, então ele
  // viaja disfarçado no campo xcod (criado pela Hotmart para isso mesmo — "código externo") até o checkout, e
  // volta no webhook da compra. Sem isso, toda venda aparece no GA4 como sessão desconhecida, sem UTM nenhuma.
  function ga4ClientId() {
    var raw = readCookie('_ga');
    if (!raw) return '';
    var m = /^GA1\.\d+\.(\d+\.\d+)$/.exec(raw);
    return m ? m[1] : '';
  }

  // ---------- dataLayer / gtag ----------
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;
  function track(name, params) {
    var e = { event: name };
    for (var k in params) if (Object.prototype.hasOwnProperty.call(params, k)) e[k] = params[k];
    window.dataLayer.push(e);
  }
  window.faTrack = track;

  // ---------- consentimento ----------
  var DENIED = { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' };
  var GRANTED = { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'granted' };
  gtag('consent', 'default', Object.assign({ wait_for_update: 500 }, DENIED));

  function loadScript(src, attrs) {
    var s = document.createElement('script');
    s.async = true; s.src = src;
    for (var k in attrs) s.setAttribute(k, attrs[k]);
    (document.head || document.documentElement).appendChild(s);
  }
  // Clarity: grava sessão, então só entra com o aceite do banner (nunca em "Só o essencial"). Carrega uma vez só;
  // se a pessoa aceitar numa página, as seguintes já o carregam pelo consentimento salvo. Contentsquare segue removido.
  var clarityLoaded = false;
  function loadClarity() {
    if (clarityLoaded) return;
    clarityLoaded = true;
    (function (c, a) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
    })(window, 'clarity');
    loadScript('https://www.clarity.ms/tag/' + IDS.clarity);
  }
  // Painel de quiosque (<html data-fa-kiosk>, ex.: tv2.html): é uma TV da empresa, sem ninguém para responder ao
  // banner e sem dado de pessoa. Não abre o banner; libera só a medição (analytics_storage) para os eventos do
  // painel chegarem ao GA4. Anúncios e o Clarity (gravação de sessão) continuam desligados, mesmo com aceite salvo.
  var KIOSK = document.documentElement.hasAttribute('data-fa-kiosk');
  // Pixel da Meta: mesmo critério do Clarity (só com o aceite "todos"; quiosque nunca entra). Fica fora do portal
  // Wi-Fi/hotspot, para o público de remarketing não virar quem só conectou na loja. Não ativar o pixel também
  // pelo GTM: cada evento contaria em dobro. Os eventos de compra (AddToCart etc.) ficam em guia.html/codigo.html.
  var metaLoaded = false;
  function loadMetaPixel() {
    if (metaLoaded || KIOSK || /^\/(wifi|hotspot)(\/|\.html|$)/.test(location.pathname)) return;
    metaLoaded = true;
    !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', IDS.meta);
    window.fbq('track', 'PageView');
  }
  function applyConsent(choice) {
    if (KIOSK) {
      gtag('consent', 'update', { analytics_storage: 'granted' });
      return;
    }
    if (choice === 'all') {
      gtag('consent', 'update', GRANTED);
      loadClarity();
      loadMetaPixel();
      try { document.dispatchEvent(new CustomEvent('fa-consent-all')); } catch (e) { }
    }
  }
  function setConsent(choice) {
    write(CONSENT_KEY, choice);
    applyConsent(choice);
    var bar = document.getElementById('fa-consent');
    if (bar) bar.remove();
    document.documentElement.classList.remove('fa-consent-open');
    track('consent_update', { consent_choice: choice });
  }

  // ---------- GTM + GA4 (sempre, em modo sem cookies até o aceite) ----------
  window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
  loadScript('https://www.googletagmanager.com/gtm.js?id=' + IDS.gtm);
  loadScript('https://www.googletagmanager.com/gtag/js?id=' + IDS.ga4);
  gtag('js', new Date());
  // linker: sem isso o GA4 abre sessão nova no salto hub -> playground e registra o próprio subdomínio como
  // referral, matando a atribuição do tráfego pago. accept_incoming fecha o outro lado do mesmo problema.
  gtag('config', IDS.ga4, { linker: { domains: INTERNAL_HOSTS, accept_incoming: true } });
  applyConsent(read(CONSENT_KEY));

  // ---------- origem do visitante ----------
  function isInternalHost(h) { return INTERNAL_HOSTS.indexOf(h) !== -1; }

  function captureOrigin() {
    var q = new URLSearchParams(window.location.search);
    var found = {};
    var has = false;
    PARAMS.forEach(function (p) { var v = q.get(p); if (v) { found[p] = v.slice(0, 120); has = true; } });
    // utm_source=site era o UTM dos links internos (removido em 10/2026); links velhos em cache não viram origem.
    if (found.utm_source === 'site') { found = {}; has = false; }
    var stored = {};
    try { stored = JSON.parse(readOrigin() || '{}') || {}; } catch (e) { stored = {}; }

    var ref = '';
    var aiEngine = null;
    try {
      var rh = document.referrer ? new URL(document.referrer).hostname : '';
      ref = rh && !isInternalHost(rh) ? rh : '';
      if (ref) aiEngine = AI_REFERRERS[ref.replace(/^www\./, '')] || null;
    } catch (e) { ref = ''; }
    if (aiEngine && !found.utm_source) { found.utm_source = aiEngine; found.utm_medium = 'ai'; has = true; }

    var snapshot = { params: found, referrer: ref, landing: window.location.pathname, ts: Date.now(), aiEngine: aiEngine };
    // O first-touch nunca é sobrescrito. O "last" só muda quando chega parâmetro novo, ou quando vem de outro
    // site e ainda não há origem com parâmetros; navegar entre páginas do próprio site não zera nada.
    var lastHasParams = stored.last && Object.keys(stored.last.params || {}).length > 0;
    if (!stored.first) stored.first = snapshot;
    if (has || (ref && !lastHasParams)) stored.last = snapshot;
    writeOrigin(JSON.stringify(stored));
    return stored;
  }
  var originStore = captureOrigin();
  // Só marca IA na primeira visita real (evita reclassificar sessões internas como IA de novo a cada página).
  var landingAiEngine = originStore.first && originStore.first.aiEngine;
  if (landingAiEngine && originStore.first.landing === window.location.pathname) {
    gtag('set', 'user_properties', { ai_engine: landingAiEngine });
    track('ai_referral', { ai_engine: landingAiEngine });
  }

  // Origem para formulários: a mais recente que tenha parâmetros; senão a primeira.
  window.faOrigin = function () {
    var pick = (originStore.last && Object.keys(originStore.last.params).length) ? originStore.last
      : (originStore.first || { params: {}, referrer: '', landing: '' });
    var p = pick.params || {};
    var o = {
      utm_source: p.utm_source || pick.referrer || '',
      utm_medium: p.utm_medium || (pick.referrer ? 'referral' : ''),
      utm_campaign: p.utm_campaign || '',
      utm_content: p.utm_content || '',
      utm_term: p.utm_term || '',
      gclid: p.gclid || '',
      fbclid: p.fbclid || '',
      referrer: pick.referrer || '',
      first_landing: (originStore.first && originStore.first.landing) || ''
    };
    // xcod carrega o client_id do GA4 até o checkout da Hotmart (ver ga4ClientId acima). Só entra se a página
    // não tiver definido outro xcod na URL — guia.html/codigo.html priorizam ?xcod=... quando presente.
    var gaId = ga4ClientId();
    if (gaId) o.xcod = 'ga.' + gaId;
    return o;
  };

  // Helper de métricas AEO/GEO da página atual (extratore de schemas, bot AI status, llms.txt, etc)
  window.faAeoMetrics = function () {
    var schemas = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(function (s) {
      try { return JSON.parse(s.textContent); } catch (e) { return null; }
    }).filter(Boolean);
    var llmsLink = document.querySelector('link[rel="alternate"][href*="llms.txt"]');
    var robotsMeta = document.querySelector('meta[name="robots"]');
    var origin = window.faOrigin();
    return {
      page: window.location.pathname,
      has_llms_link: !!llmsLink,
      robots_content: robotsMeta ? robotsMeta.getAttribute('content') : null,
      schema_count: schemas.length,
      schema_types: schemas.flatMap(function (s) {
        if (s['@graph']) return s['@graph'].map(function (item) { return [].concat(item['@type'] || []); }).flat();
        return [].concat(s['@type'] || []);
      }),
      ai_referrer: origin.utm_medium === 'ai' ? origin.utm_source : null,
      first_touch_ai: landingAiEngine || null
    };
  };

  // ---------- eventos por delegação ----------
  function sectionOf(el) {
    var s = el.closest('section[id], [data-section], footer, header, nav');
    return s ? (s.getAttribute('data-section') || s.id || s.tagName.toLowerCase()) : '';
  }

  function onClick(ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';

    // Links internos sem UTM: o "onde clicou" vai como evento. A origem real já está no cookie fa_origin.
    var linkId = a.getAttribute('data-fa-link');
    if (linkId) {
      track('cta_click', { cta_location: linkId, destino: a.pathname, pagina: window.location.pathname, secao: sectionOf(a) });
      return;
    }

    var wa = href.match(/(?:wa\.me\/|phone=)(\d{10,15})/);
    if (wa) {
      track('whatsapp_click', {
        unidade: WHATSAPP_UNITS[wa[1]] || wa[1],
        pagina: window.location.pathname,
        secao: sectionOf(a),
        link_text: (a.textContent || '').trim().slice(0, 60)
      });
      return;
    }

    var hm = href.match(/pay\.hotmart\.com\/([A-Z0-9]+)/i);
    if (hm) {
      var item = CHECKOUTS[hm[1].toUpperCase()] || { id: hm[1], name: hm[1] };
      var ecommerce = { currency: 'BRL', items: [{ item_id: item.id, item_name: item.name }] };
      if (item.value) { ecommerce.value = item.value; ecommerce.items[0].price = item.value; }
      window.dataLayer.push({ ecommerce: null });
      track('begin_checkout', { ecommerce: ecommerce, pagina: window.location.pathname, secao: sectionOf(a) });
      return;
    }

    if (/\.pdf(\?|$)/i.test(href)) {
      track('file_download', { file_name: href.split('/').pop().split('?')[0], pagina: window.location.pathname });
    }
  }
  document.addEventListener('click', onClick, true);
  document.addEventListener('auxclick', onClick, true);

  // scroll_depth 50 e 90, uma vez por página
  var sent = {};
  function onScroll() {
    var h = document.documentElement;
    var total = h.scrollHeight - h.clientHeight;
    if (total <= 0) return;
    var pct = (window.pageYOffset || h.scrollTop) / total * 100;
    [50, 90].forEach(function (mark) {
      if (pct >= mark && !sent[mark]) {
        sent[mark] = true;
        track('scroll_depth', { percent: mark, pagina: window.location.pathname });
      }
    });
    if (sent[50] && sent[90]) window.removeEventListener('scroll', onScroll);
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  // ---------- banner de consentimento ----------
  function buildBanner() {
    if (document.getElementById('fa-consent')) return;
    var bar = document.createElement('div');
    bar.id = 'fa-consent';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Preferências de cookies');
    bar.innerHTML =
      '<style>' +
      // Faixa compacta: no desktop texto e botões numa linha só (antes era um card de ~150px sobre os CTAs da página)
      '#fa-consent{position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483000;max-width:980px;margin:0 auto;' +
      'background:#065264;color:#fff;border-radius:14px;padding:10px 12px 10px 18px;box-shadow:0 8px 28px rgba(0,0,0,.28);' +
      'font:400 13px/1.45 Nunito,"Nunito Fallback",system-ui,sans-serif;display:flex;align-items:center;gap:16px}' +
      '#fa-consent p{margin:0;flex:1 1 auto}#fa-consent a{color:#FDC51D;text-decoration:underline}' +
      '#fa-consent .fa-c-row{display:flex;gap:8px;flex:0 0 auto}' +
      '#fa-consent button{min-height:44px;border-radius:999px;border:2px solid #fff;cursor:pointer;white-space:nowrap;' +
      'font:700 14px Nunito,"Nunito Fallback",system-ui,sans-serif;padding:8px 18px}' +
      '@media (max-width:760px){#fa-consent{flex-direction:column;align-items:stretch;gap:10px;padding:12px 14px;left:8px;right:8px;bottom:8px}' +
      '#fa-consent button{flex:1 1 0}#fa-consent .fa-c-more{display:none}#fa-consent{font-size:12.5px;line-height:1.4}}' +
      'html.fa-consent-open body{padding-bottom:var(--fa-consent-h,0px)}' +
      '#fa-consent .fa-c-ok{background:#FDC51D;border-color:#FDC51D;color:#065264}' +
      '#fa-consent .fa-c-no{background:transparent;color:#fff}' +
      '</style>' +
      '<p>Usamos cookies para entender como o site é usado e melhorar a experiência, e medir a origem das ' +
      'visitas para o Google e a Meta.<span class="fa-c-more"> Nenhum campo digitado (nome, e-mail, telefone) é gravado.</span> ' +
      '<a href="/politica-privacidade">Saiba mais</a>.</p>' +
      '<div class="fa-c-row"><button type="button" class="fa-c-ok">Aceitar</button>' +
      '<button type="button" class="fa-c-no">Só o essencial</button></div>';
    bar.querySelector('.fa-c-ok').addEventListener('click', function () { setConsent('all'); });
    bar.querySelector('.fa-c-no').addEventListener('click', function () { setConsent('essential'); });
    document.body.appendChild(bar);
    document.documentElement.classList.add('fa-consent-open');
    document.documentElement.style.setProperty('--fa-consent-h', (bar.offsetHeight + 16) + 'px');
  }
  window.faConsentOpen = function () { buildBanner(); };

  function addFooterLink() {
    var f = document.querySelector('footer');
    if (!f || f.querySelector('[data-fa-cookies]')) return;
    var a = document.createElement('a');
    a.href = '#';
    a.setAttribute('data-fa-cookies', '');
    a.textContent = 'Preferências de cookies';
    a.style.cssText = 'display:inline-block;margin:6px 10px;color:inherit;text-decoration:underline;font-size:13px;opacity:.85';
    a.addEventListener('click', function (e) { e.preventDefault(); buildBanner(); });
    f.appendChild(a);
  }

  function ready() {
    if (KIOSK) return;
    if (!read(CONSENT_KEY)) buildBanner();
    addFooterLink();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();
