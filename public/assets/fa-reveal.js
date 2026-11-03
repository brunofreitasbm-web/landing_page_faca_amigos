/* Revelação suave ao rolar (sobe ~20px e aparece, uma vez só).
   - Só atua em páginas sem o sistema .fx próprio (home, playground, circuito e teste ficam como estão).
   - Não anima o que já está visível ao carregar (nada de piscar nem de atrasar o LCP).
   - Sem JS, sem IntersectionObserver ou com "reduzir movimento": o conteúdo aparece normal. */
(function () {
  if (!('IntersectionObserver' in window)) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var main = document.getElementById('conteudo');
  if (!main || main.querySelector('.fx')) return;

  var alvos = [];
  main.querySelectorAll('section').forEach(function (sec) {
    var wraps = sec.querySelectorAll(':scope > .wrap');
    if (!wraps.length) wraps = [sec];
    wraps.forEach(function (w) {
      Array.prototype.forEach.call(w.children, function (el) { alvos.push(el); });
    });
  });

  var vh = window.innerHeight || document.documentElement.clientHeight;
  alvos = alvos.filter(function (el) { return el.getBoundingClientRect().top >= vh; });
  if (!alvos.length) return;

  var io = new IntersectionObserver(function (entradas) {
    entradas.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('fa-rv-in');
      io.unobserve(e.target);
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });

  alvos.forEach(function (el) { el.classList.add('fa-rv'); io.observe(el); });
  document.documentElement.classList.add('fa-rv-on');
})();
