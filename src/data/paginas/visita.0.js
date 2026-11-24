    (function () {
      // Só o "onde clicou" para leitura no GTM. A conversão (visita_click / whatsapp_click) vem do fa-track.js.
      var push = function (o) { (window.dataLayer = window.dataLayer || []).push(o); };
      document.querySelectorAll('[data-cta]').forEach(function (a) {
        var where = a.getAttribute('data-cta');
        a.addEventListener('click', function () { push({ event: 'visita_cta_click', cta_location: where }); });
      });
    })();
