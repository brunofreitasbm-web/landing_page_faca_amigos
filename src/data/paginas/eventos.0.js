(function () {
      var API = 'https://ivjvpdzsfjdpyabbzzuj.supabase.co/functions/v1/eventos-public';
      var lista = document.getElementById('lista');
      var state = document.getElementById('lista-state');
      var vazia = document.getElementById('lista-vazia');
      var eventos = [];
      var trilha = '';
      var CAT = { palestra: 'Palestra', reuniao: 'Encontro', treinamento: 'Treinamento' };
      var PUB = { familias: 'Para famílias', profissionais: 'Para profissionais' };

      function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
      function fmt(iso) {
        var d = new Date(iso);
        var data = d.toLocaleDateString('pt-BR', { timeZone: 'America/Belem', weekday: 'short', day: '2-digit', month: 'short' }).replace('.', '');
        var hora = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Belem', hour: '2-digit', minute: '2-digit' });
        return data + ' · ' + hora;
      }
      // Sinal de escassez: SÓ o que o servidor devolve (número real). Nada inventado aqui.
      function escassezTag(ev) {
        if (ev.realizado) return '<span class="tag gray">Realizado</span>';
        if (ev.inscricoes_encerradas) return '<span class="tag gray">Inscrições encerradas</span>';
        var gratis = (ev.tipos || []).filter(function (t) { return t.tipo === 'gratuito'; });
        var pagos = (ev.tipos || []).filter(function (t) { return t.tipo === 'pago'; });
        if (!gratis.length && !pagos.length) return '<span class="tag gray">Em breve</span>';
        var ultimas = gratis.filter(function (t) { return t.escassez.estado === 'ultimas'; });
        var abertas = gratis.filter(function (t) { return t.escassez.estado === 'abertas'; });
        if (ultimas.length) {
          var n = ultimas.reduce(function (a, t) { return a + t.escassez.restantes; }, 0);
          return '<span class="tag pink">Restam ' + n + (n === 1 ? ' vaga' : ' vagas') + '</span>';
        }
        if (abertas.length) return '<span class="tag">Vagas abertas</span>';
        if (gratis.length) {
          var fila = gratis.reduce(function (a, t) { return a + (t.escassez.lista_espera || 0); }, 0);
          return '<span class="tag yellow">Esgotado · lista de espera' + (fila ? ' (' + fila + ' na fila)' : '') + '</span>';
        }
        return '<span class="tag">Ingressos à venda</span>';
      }
      function card(ev) {
        var capa = ev.capa_url
          ? '<img class="capa" src="' + esc(ev.capa_url) + '" alt="' + esc(ev.titulo) + '" loading="lazy" decoding="async">'
          : '<div class="capa placeholder" aria-hidden="true">' + (ev.categoria === 'treinamento' ? '🎓' : (ev.categoria === 'reuniao' ? '🤝' : '🎤')) + '</div>';
        var local = ev.formato === 'online' ? 'Online' : (ev.local_nome || 'Belém/PA');
        var preco = (ev.tipos || []).some(function (t) { return t.tipo === 'gratuito'; }) ? 'Gratuito' : ((ev.tipos || []).map(function (t) { return t.preco_exibicao; }).filter(Boolean)[0] || 'Pago');
        return '<a class="card" href="/eventos/' + encodeURIComponent(ev.slug) + '" data-slug="' + esc(ev.slug) + '">' + capa +
          '<div class="body"><div class="tags"><span class="tag">' + esc(CAT[ev.categoria] || ev.categoria) + '</span><span class="tag gray">' + esc(PUB[ev.publico] || '') + '</span>' + escassezTag(ev) + '</div>' +
          '<h3>' + esc(ev.titulo) + '</h3>' +
          '<div class="when">' + esc(fmt(ev.inicio)) + ' · ' + esc(local) + '</div>' +
          (ev.promessa ? '<p class="desc">' + esc(ev.promessa) + '</p>' : (ev.descricao_curta ? '<p class="desc">' + esc(ev.descricao_curta) + '</p>' : '')) +
          '<div class="foot"><span>' + esc(preco) + '</span><span class="go">' + (ev.inscricoes_encerradas ? 'Ver detalhes' : 'Garantir vaga →') + '</span></div></div></a>';
      }
      function render() {
        var vis = eventos.filter(function (e) { return !trilha || e.publico === trilha; });
        state.hidden = true;
        lista.hidden = !vis.length;
        vazia.hidden = !!vis.length;
        lista.innerHTML = vis.map(card).join('');
      }
      document.querySelectorAll('.trilhas button').forEach(function (b) {
        b.addEventListener('click', function () {
          trilha = b.getAttribute('data-trilha');
          document.querySelectorAll('.trilhas button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
          render();
          if (window.faTrack) window.faTrack('eventos_filtro', { trilha: trilha || 'todos' });
        });
      });
      lista.addEventListener('click', function (e) {
        var a = e.target.closest ? e.target.closest('[data-slug]') : null;
        if (a && window.faTrack) window.faTrack('evento_card_click', { slug: a.getAttribute('data-slug') });
      });
      function carregar() {
      state.hidden = false;
      state.textContent = 'Carregando a agenda…';
      fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'listar' }) })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          eventos = (d && d.eventos) || [];
          var q = new URLSearchParams(location.search).get('trilha');
          if (q === 'familias' || q === 'profissionais') {
            trilha = q;
            document.querySelectorAll('.trilhas button').forEach(function (x) { x.setAttribute('aria-pressed', x.getAttribute('data-trilha') === q ? 'true' : 'false'); });
          }
          render();
        })
        .catch(function () {
          state.innerHTML = 'Não foi possível carregar a agenda agora. Tente de novo em instantes.<br>' +
            '<button type="button" class="btn-buy" id="lista-retry">Tentar de novo</button>' +
            '<p class="alt">Ou escreva para <a href="mailto:institutofacaamigos@gmail.com">institutofacaamigos@gmail.com</a></p>';
          document.getElementById('lista-retry').addEventListener('click', carregar);
        });
      }
      carregar();
    })();
