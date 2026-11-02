    (function () {
      // ---- CONFIGURAÇÃO ----
      var CONFIG = {
        checkout: 'https://pay.hotmart.com/V107698297N?off=fndry1ka', // produto na Hotmart; o widget abre o checkout em janela (checkoutMode=2)
      };

      // ---- Pixel da Meta ----
      // O pixel (init + PageView) é carregado por assets/fa-track.js em todas as páginas, só com o aceite do banner.
      // Aqui fica o evento específico desta página; 'fa-consent-all' cobre quem aceita depois de abrir.
      function viewContentMeta() { if (window.fbq) fbq('track', 'ViewContent', { content_name: 'O Código do Desenvolvimento Infantil', content_type: 'product', value: 9.9, currency: 'BRL' }); }
      if (window.fbq) viewContentMeta(); else document.addEventListener('fa-consent-all', viewContentMeta, { once: true });

      function push(o) { try { (window.dataLayer = window.dataLayer || []).push(o); } catch (e) { } }

      // ---- Repasse de origem (UTMs, src, sck) da página para o checkout ----
      var qs = new URLSearchParams(location.search);
      var origin = (window.faOrigin && window.faOrigin()) || {};
      var pass = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'src', 'sck', 'xcod'];
      var checkoutUrl = CONFIG.checkout + '?checkoutMode=2';
      try {
        var u = new URL(CONFIG.checkout);
        u.searchParams.set('checkoutMode', '2');
        pass.forEach(function (k) { var v = qs.get(k) || origin[k]; if (v) u.searchParams.set(k, v); });
        if (!u.searchParams.get('src')) u.searchParams.set('src', u.searchParams.get('utm_source') ? 'codigo_' + u.searchParams.get('utm_source') : 'codigo_direto');
        checkoutUrl = u.toString();
      } catch (e) { /* mantém o link como está */ }

      // Botões de compra: mesmo link para todos. Com o widget da Hotmart carregado, no desktop o
      // checkout abre em janela sobre a página; no celular (ou sem o widget) o link abre o checkout.
      var ctas = [].slice.call(document.querySelectorAll('[data-cta]'));
      ctas.forEach(function (a) {
        var where = a.getAttribute('data-cta');
        a.href = checkoutUrl;
        a.addEventListener('click', function () {
          push({ event: 'codigo_cta_click', cta_location: where });
          if (window.fbq) fbq('track', 'InitiateCheckout', { value: 9.9, currency: 'BRL' });
        });
      });

      // ---- Widget da Hotmart (carrega depois da página, para não competir com a capa) ----
      window.addEventListener('load', function () {
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://static.hotmart.com/css/hotmart-fb.min.css';
        document.head.appendChild(link);
        var s = document.createElement('script');
        s.src = 'https://static.hotmart.com/checkout/widget.min.js';
        document.head.appendChild(s);
      });

      // O widget apaga da página todo link para hotmart.com quando a checagem de saúde da API dele
      // falha (rede instável, bloqueador). Se isso acontecer, o botão volta como link comum, que
      // abre o checkout em outra aba.
      var slots = ctas.map(function (a) { return { a: a, parent: a.parentNode, next: a.nextSibling }; });
      new MutationObserver(function () {
        slots.forEach(function (s) {
          if (s.a.isConnected || !s.parent.isConnected) return;
          s.a.classList.remove('hotmart-fb');
          s.a.target = '_blank';
          s.a.rel = 'noopener';
          s.parent.insertBefore(s.a, s.next && s.next.parentNode === s.parent ? s.next : null);
        });
      }).observe(document.body, { childList: true, subtree: true });

      // Carrossel de prévia: setas (desktop)
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
            push({ event: 'codigo_oferta_view' });
            if (window.fbq) fbq('track', 'AddToCart', { value: 9.9, currency: 'BRL' });
            io.disconnect();
          }
        }, { threshold: 0.35 });
        io.observe(offer);
      }
    })();
  
