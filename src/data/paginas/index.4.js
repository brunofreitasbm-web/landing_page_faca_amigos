    /* Refinos de UI: cabeçalho compacto no celular e botão flutuante que sai da frente dos CTAs de WhatsApp */
    (function () {
      var nav = document.querySelector('.navbar');
      if (nav && window.matchMedia) {
        var mq = window.matchMedia('(max-width: 760px)'), lastY = window.scrollY, ticking = false;
        window.addEventListener('scroll', function () {
          if (ticking) return; ticking = true;
          requestAnimationFrame(function () {
            var y = window.scrollY;
            if (!mq.matches || y < 120) nav.classList.remove('nav-compact');
            else if (y > lastY + 6) nav.classList.add('nav-compact');
            else if (y < lastY - 6) nav.classList.remove('nav-compact');
            lastY = y; ticking = false;
          });
        }, { passive: true });
      }
      var fab = document.querySelector('.wa-float');
      if (fab && 'IntersectionObserver' in window) {
        var seen = new Set();
        var io = new IntersectionObserver(function (es) {
          es.forEach(function (e) { e.isIntersecting ? seen.add(e.target) : seen.delete(e.target); });
          fab.classList.toggle('is-hidden', seen.size > 0);
        });
        document.querySelectorAll('a.btn-wa:not(.wa-float), footer').forEach(function (el) { io.observe(el); });
      }
    })();
  
