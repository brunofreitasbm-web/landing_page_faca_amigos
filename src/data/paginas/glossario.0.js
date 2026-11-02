(function () {
      var input = document.getElementById('busca');
      var terms = Array.prototype.slice.call(document.querySelectorAll('.term'));
      var groups = Array.prototype.slice.call(document.querySelectorAll('.letter-group'));
      var noResults = document.getElementById('no-results');
      var letters = Array.prototype.slice.call(document.querySelectorAll('.letters a'));

      input.addEventListener('input', function () {
        var q = input.value.trim().toLowerCase();
        var any = false;
        terms.forEach(function (t) {
          var hit = !q || t.textContent.toLowerCase().indexOf(q) !== -1;
          t.classList.toggle('is-hidden', !hit);
          if (hit) any = true;
        });
        groups.forEach(function (g) {
          var visible = g.querySelectorAll('.term:not(.is-hidden)').length > 0;
          g.style.display = visible ? '' : 'none';
        });
        noResults.style.display = any ? 'none' : 'block';
      });

      // Desativa letras sem termo (nenhuma hoje, mas fica pronto para o glossário crescer)
      letters.forEach(function (a) {
        var id = a.getAttribute('href').slice(1);
        if (!document.getElementById(id)) a.classList.add('off');
      });
    })();
