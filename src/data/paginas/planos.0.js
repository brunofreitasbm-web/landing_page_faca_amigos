    (function () {
      var push = function (o) { (window.dataLayer = window.dataLayer || []).push(o); };
      document.querySelectorAll('[data-cta]').forEach(function (a) {
        var where = a.getAttribute('data-cta');
        a.addEventListener('click', function () { push({ event: 'planos_cta_click', cta_location: where }); });
      });
    })();
  
