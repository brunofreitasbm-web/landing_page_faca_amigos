    /* Carrossel Interativo + Hidratação dinâmica de Prova Social do Sistema App Playground */
    (function () {
      var container = document.getElementById('reviewsContainer');
      var prevBtn = document.getElementById('revPrevBtn');
      var nextBtn = document.getElementById('revNextBtn');

      if (container) {
        function scrollTrack(dir) {
          var step = container.clientWidth > 640 ? 380 : 300;
          container.scrollBy({ left: dir * step, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        }
        if (prevBtn) prevBtn.addEventListener('click', function () { scrollTrack(-1); });
        if (nextBtn) nextBtn.addEventListener('click', function () { scrollTrack(1); });

        var isDown = false, startX, scrollLeft;
        container.addEventListener('mousedown', function (e) {
          isDown = true;
          container.classList.add('is-dragging');
          startX = e.pageX - container.offsetLeft;
          scrollLeft = container.scrollLeft;
        });
        container.addEventListener('mouseleave', function () {
          isDown = false;
          container.classList.remove('is-dragging');
        });
        container.addEventListener('mouseup', function () {
          isDown = false;
          container.classList.remove('is-dragging');
        });
        container.addEventListener('mousemove', function (e) {
          if (!isDown) return;
          e.preventDefault();
          var x = e.pageX - container.offsetLeft;
          var walk = (x - startX) * 1.5;
          container.scrollLeft = scrollLeft - walk;
        });
      }

      if (!container || !window.fetch) return;
      var API = 'https://ivjvpdzsfjdpyabbzzuj.supabase.co/functions/v1/playground-reviews';
      fetch(API).then(function (res) {
        if (!res.ok) return null;
        return res.json();
      }).then(function (data) {
        if (!data || !Array.isArray(data.reviews) || data.reviews.length === 0) return;
        var html = '';
        data.reviews.forEach(function (r) {
          var initial = (r.author_initial || (r.author_name ? r.author_name.charAt(0) : 'V')).toUpperCase();
          var name = r.author_name || 'Família FaçaAmigos';
          var visitLabel = r.author_role || (r.visit_count ? r.visit_count + 'ª visita' : '');
          var meta = [visitLabel, r.visit_date].filter(Boolean).join(' · ');
          var stars = '★ '.repeat(Math.max(1, Math.min(5, r.rating || 5))).trim();
          var comment = r.comment ? r.comment.replace(/^["“”]+|["“”]+$/g, '') : '';
          html += '<div class="review">' +
            '<div class="who">' +
            '<div class="av"><div>' + initial + '</div></div>' +
            '<div><b>' + name + '</b>' + (meta ? '<small>' + meta + '</small>' : '') + '</div>' +
            '</div>' +
            '<div class="stars">' + stars + '</div>' +
            '<p>"' + comment + '"</p>' +
            '</div>';
        });
        if (html) container.innerHTML = html;
      }).catch(function () { /* preserva os cards já existentes */ });
    })();
  
