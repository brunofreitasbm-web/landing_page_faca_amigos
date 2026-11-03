/* Entrada ao rolar, uma vez só:
   - títulos e textos sobem;
   - cards e colunas entram pelos lados (esquerda → da esquerda, direita → da direita, meio → de baixo),
     em sequência curta, e crescem de leve;
   - em coluna única (celular) os cards alternam esquerda/direita.
   Só atua em páginas sem o sistema .fx próprio (home, playground, circuito e teste ficam como estão).
   Não anima o que já está visível ao carregar (sem piscar, sem atrasar o LCP).
   Sem JS, sem IntersectionObserver ou com "reduzir movimento": o conteúdo aparece normal. */
(function () {
  if (!('IntersectionObserver' in window)) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var main = document.getElementById('conteudo');
  if (!main || main.querySelector('.fx')) return;

  var vh = window.innerHeight || document.documentElement.clientHeight;
  var alvos = []; // { el, dir, delay }

  function ehGrupo(el) {
    if (el.children.length < 2) return false;
    var d = getComputedStyle(el).display;
    return d === 'grid' || d === 'flex' || d === 'inline-grid' || d === 'inline-flex';
  }

  function adicionarGrupo(grupo) {
    var filhos = Array.prototype.slice.call(grupo.children);
    var g = grupo.getBoundingClientRect();
    var centro = g.left + g.width / 2;
    var topo0 = filhos[0].getBoundingClientRect().top;
    var cols = filhos.filter(function (f) { return Math.abs(f.getBoundingClientRect().top - topo0) < 8; }).length || 1;
    filhos.forEach(function (f, i) {
      var r = f.getBoundingClientRect();
      var dir;
      if (cols === 1) dir = i % 2 === 0 ? 'l' : 'r';
      else {
        var dx = (r.left + r.width / 2) - centro;
        dir = Math.abs(dx) < g.width * 0.12 ? 'u' : (dx < 0 ? 'l' : 'r');
      }
      alvos.push({ el: f, dir: dir, delay: cols > 1 ? (i % cols) * 90 : 0 });
    });
  }

  main.querySelectorAll('section').forEach(function (sec) {
    var wraps = sec.querySelectorAll(':scope > .wrap');
    if (!wraps.length) wraps = [sec];
    wraps.forEach(function (w) {
      Array.prototype.forEach.call(w.children, function (el) {
        if (ehGrupo(el)) adicionarGrupo(el);
        else alvos.push({ el: el, dir: 'u', delay: 0 });
      });
    });
  });

  alvos = alvos.filter(function (a) { return a.el.getBoundingClientRect().top >= vh; });
  if (!alvos.length) return;

  var io = new IntersectionObserver(function (entradas) {
    entradas.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('fa-rv-in');
      io.unobserve(e.target);
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });

  alvos.forEach(function (a) {
    a.el.classList.add('fa-rv', 'fa-rv-' + a.dir);
    if (a.delay) a.el.style.transitionDelay = a.delay + 'ms';
    io.observe(a.el);
  });
  document.documentElement.classList.add('fa-rv-on');
})();
