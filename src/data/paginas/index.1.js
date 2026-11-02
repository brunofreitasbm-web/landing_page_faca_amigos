    // Botões de triagem do hero (e qualquer [data-cta] da home): cta_click com cta_location, no mesmo formato do fa-cta.js.
    (function () {
      document.querySelectorAll('a[data-cta]').forEach(function (a) {
        a.addEventListener('click', function () {
          if (window.faTrack) window.faTrack('cta_click', { cta_location: a.getAttribute('data-cta'), destino: a.getAttribute('data-destino') || '', pagina: location.pathname });
        });
      });
    })();
    // Resumo rápido (#geo-facts): recolhido por padrão; sem JS continua aberto.
    (function () {
      var btn = document.getElementById('geo-facts-toggle');
      var body = document.getElementById('geo-facts-body');
      if (!btn || !body) return;
      function set(open) {
        body.hidden = !open;
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        btn.textContent = open ? 'Fechar resumo' : 'Ver resumo';
      }
      btn.hidden = false;
      set(false);
      btn.addEventListener('click', function () { set(body.hidden); });
    })();
  
