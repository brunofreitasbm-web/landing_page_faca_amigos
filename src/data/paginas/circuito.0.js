    (function () {
      var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var els = document.querySelectorAll('.fx');
      if (reduced || !('IntersectionObserver' in window)) {
        els.forEach(function (el) { el.classList.add('on'); });
        return;
      }
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add('on'); io.unobserve(e.target); }
        });
      }, { threshold: 0.12 });
      els.forEach(function (el) { io.observe(el); });
    })();
  
