    (function () {
      document.querySelectorAll('.more-btn').forEach(function (b) { b.addEventListener('click', function () { var o = b.getAttribute('aria-expanded') === 'true'; b.setAttribute('aria-expanded', String(!o)); document.getElementById(b.getAttribute('aria-controls')).hidden = o; }); });
      function push(o) { try { (window.dataLayer = window.dataLayer || []).push(o); } catch (e) { } }
      // Busca + filtro das 14 especialidades (data-tags em cada .svc)
      (function () {
        var input = document.getElementById('busca-servicos');
        var cards = [].slice.call(document.querySelectorAll('#lista-servicos .svc'));
        var chips = [].slice.call(document.querySelectorAll('.svc-chip'));
        var empty = document.getElementById('svc-no-results');
        if (!input || !cards.length) return;
        var filter = 'all', timer;
        function norm(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
        function apply() {
          var q = norm(input.value).trim(), shown = 0;
          cards.forEach(function (c) {
            var tags = ' ' + c.getAttribute('data-tags') + ' ';
            var okF = filter === 'all' || tags.indexOf(' ' + filter + ' ') > -1;
            var okQ = !q || norm(c.textContent + ' ' + tags).indexOf(q) > -1;
            var show = okF && okQ;
            c.classList.toggle('is-hidden', !show);
            if (show) shown++;
          });
          if (empty) empty.style.display = shown ? 'none' : 'block';
          return shown;
        }
        input.addEventListener('input', function () {
          apply();
          clearTimeout(timer);
          timer = setTimeout(function () {
            var q = norm(input.value).trim();
            if (q.length > 1) push({ event: 'clinica_busca_servico', search_term: q, results: apply() });
          }, 900);
        });
        chips.forEach(function (b) {
          b.addEventListener('click', function () {
            filter = b.getAttribute('data-filter');
            chips.forEach(function (x) { x.classList.toggle('active', x === b); });
            apply();
            push({ event: 'clinica_filtro_servico', filter_area: filter });
          });
        });
        // Cada especialidade aberta pelo link/âncora (hub ou busca) vira evento
        cards.forEach(function (c) {
          var wa = c.querySelector('.svc-wa-btn');
          if (wa) wa.addEventListener('click', function () { push({ event: 'clinica_especialidade_click', especialidade: c.id }); });
        });
      })();
      document.querySelectorAll('[data-cta]').forEach(function (a) {
        var where = a.getAttribute('data-cta');
        a.addEventListener('click', function () { push({ event: 'clinica_cta_click', cta_location: where }); });
      });
    })();
  
