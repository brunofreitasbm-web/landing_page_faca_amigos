(function () {
      function push(o) { try { (window.dataLayer = window.dataLayer || []).push(o); } catch (e) { } }
      document.querySelectorAll('[data-cta]').forEach(function (a) {
        var where = a.getAttribute('data-cta');
        a.addEventListener('click', function () { push({ event: 'aprender_cta_click', cta_location: where }); });
      });
    })();
