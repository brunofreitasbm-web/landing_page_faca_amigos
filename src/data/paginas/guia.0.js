    (function () {
      // ---- CONFIGURAÇÃO (preencher antes do lançamento) ----
      var CONFIG = {
        checkout: 'https://pay.hotmart.com/M107692257Y?off=ko8af9ku', // checkout direto da Hotmart (o go.hotmart.com/M107692257Y cai na vitrine do marketplace)
        parcelas: 'ou 9x de R$ 3,33 no cartão',         // deixe vazio para ocultar
      };

      // ---- Pixel da Meta ----
      // O pixel (init + PageView) é carregado por assets/fa-track.js em todas as páginas, só com o aceite do banner.
      // Aqui fica o evento específico desta página; 'fa-consent-all' cobre quem aceita depois de abrir.
      function viewContentMeta() { if (window.fbq) fbq('track', 'ViewContent', { content_name: 'O Brincar com Propósito', content_type: 'product', value: 29.9, currency: 'BRL' }); }
      if (window.fbq) viewContentMeta(); else document.addEventListener('fa-consent-all', viewContentMeta, { once: true });

      function push(o) { try { (window.dataLayer = window.dataLayer || []).push(o); } catch (e) { } }

      // ---- Repasse de origem (UTMs, src, sck) da página para o checkout ----
      // Os botões já trazem o link do checkout no HTML (funcionam sem JS); o script só acrescenta a origem.
      var qs = new URLSearchParams(location.search);
      var origin = (window.faOrigin && window.faOrigin()) || {};
      var pass = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'src', 'sck', 'xcod'];
      var checkoutUrl = CONFIG.checkout;
      try {
        var u = new URL(CONFIG.checkout);
        pass.forEach(function (k) { var v = qs.get(k) || origin[k]; if (v) u.searchParams.set(k, v); });
        if (!u.searchParams.get('src')) u.searchParams.set('src', u.searchParams.get('utm_source') ? 'guia_' + u.searchParams.get('utm_source') : 'guia_direto');
        checkoutUrl = u.toString();
      } catch (e) { /* mantém o link como está */ }

      var configured = CONFIG.checkout.indexOf('PREENCHER') === -1;

      // Todos os botões de compra vão direto ao checkout da Hotmart. Enquanto o link não
      // estiver configurado, eles apenas rolam até a oferta (href="#oferta").
      document.querySelectorAll('[data-cta]').forEach(function (a) {
        var where = a.getAttribute('data-cta');
        if (configured) { a.href = checkoutUrl; a.target = '_blank'; a.rel = 'noopener'; }
        a.addEventListener('click', function () {
          push({ event: 'guia_cta_click', cta_location: where, goes_to_checkout: configured });
          if (window.fbq && configured) fbq('track', 'InitiateCheckout', { value: 29.9, currency: 'BRL' });
        });
      });

      // Parcelamento (só aparece se configurado)
      if (CONFIG.parcelas) { ['parcelas', 'parcelas-hero'].forEach(function (id) { var p = document.getElementById(id); if (p) { p.textContent = CONFIG.parcelas; p.hidden = false; } }); }

      // Downloads do capítulo grátis
      document.querySelectorAll('[data-sample]').forEach(function (a) {
        a.addEventListener('click', function () { push({ event: 'guia_amostra_click', origem: a.getAttribute('data-sample') }); });
      });

      // Carrosséis: setas (desktop)
      document.querySelectorAll('.snap-nav button').forEach(function (b) {
        b.addEventListener('click', function () {
          var el = document.getElementById(b.getAttribute('data-snap'));
          if (el) el.scrollBy({ left: (parseInt(b.getAttribute('data-dir'), 10) || 1) * 280, behavior: 'smooth' });
        });
      });

      // Evento de visualização da oferta
      if ('IntersectionObserver' in window) {
        var offer = document.getElementById('oferta');
        var io = new IntersectionObserver(function (es) {
          if (es.some(function (e) { return e.isIntersecting; })) {
            push({ event: 'guia_oferta_view' });
            if (window.fbq && configured) fbq('track', 'AddToCart', { value: 29.9, currency: 'BRL' });
            io.disconnect();
          }
        }, { threshold: 0.35 });
        io.observe(offer);
      }
    })();
  
