    /* Carrossel Interativo + Hidratação dinâmica de Prova Social vinda do Sistema App Playground */
    (function () {
      var grid = document.getElementById('hubReviewsGrid');
      var prevBtn = document.getElementById('hubRevPrevBtn');
      var nextBtn = document.getElementById('hubRevNextBtn');

      if (grid) {
        function scrollTrack(dir) {
          var step = grid.clientWidth > 640 ? 340 : 280;
          grid.scrollBy({ left: dir * step, behavior: 'smooth' });
        }
        if (prevBtn) prevBtn.addEventListener('click', function () { scrollTrack(-1); });
        if (nextBtn) nextBtn.addEventListener('click', function () { scrollTrack(1); });

        var isDown = false, startX, scrollLeft;
        grid.addEventListener('mousedown', function (e) {
          isDown = true;
          grid.classList.add('is-dragging');
          startX = e.pageX - grid.offsetLeft;
          scrollLeft = grid.scrollLeft;
        });
        grid.addEventListener('mouseleave', function () {
          isDown = false;
          grid.classList.remove('is-dragging');
        });
        grid.addEventListener('mouseup', function () {
          isDown = false;
          grid.classList.remove('is-dragging');
        });
        grid.addEventListener('mousemove', function (e) {
          if (!isDown) return;
          e.preventDefault();
          var x = e.pageX - grid.offsetLeft;
          var walk = (x - startX) * 1.5;
          grid.scrollLeft = scrollLeft - walk;
        });
      }

      if (!grid || !window.fetch) return;
      var API = 'https://ivjvpdzsfjdpyabbzzuj.supabase.co/functions/v1/playground-reviews';
      fetch(API).then(function (r) {
        if (!r.ok) return null;
        return r.json();
      }).then(function (d) {
        if (!d || !Array.isArray(d.reviews) || !d.reviews.length) return;
        var html = '';
        d.reviews.forEach(function (r) {
          var nameParts = (r.author_name || 'Cliente').split(' ');
          var shortName = nameParts[0] + (nameParts[1] ? ' ' + nameParts[1].charAt(0) + '.' : '');
          var stars = '★'.repeat(Math.max(1, Math.min(5, r.rating || 5)));
          var visitLabel = r.author_role || (r.visit_count ? r.visit_count + 'ª visita' : '');
          var figText = [shortName, visitLabel].filter(Boolean).join(' · ');
          var comment = r.comment ? r.comment.replace(/^["“”]+|["“”]+$/g, '') : '';
          html += '<figure class="rv"><div class="rv-stars" aria-label="' + (r.rating || 5) + ' estrelas">' + stars + '</div>' +
            '<blockquote>“' + comment + '”</blockquote>' +
            '<figcaption>' + figText + '</figcaption></figure>';
        });
        if (html) grid.innerHTML = html;
      }).catch(function () { /* fallback estático preservado */ });
    })();
  
