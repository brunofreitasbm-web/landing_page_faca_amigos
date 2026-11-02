    // Próximos encontros (eventos-public: só contagens, nenhum dado pessoal). Seção e link do menu só aparecem com evento publicado.
    (function () {
      var box = document.getElementById('eventos-cards');
      if (!box) return;
      function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
      function tag(ev) {
        if (ev.inscricoes_encerradas) return '<span class="tag gray">Inscrições encerradas</span>';
        var g = (ev.tipos || []).filter(function (t) { return t.tipo === 'gratuito'; });
        var u = g.filter(function (t) { return t.escassez.estado === 'ultimas'; });
        if (u.length) { var n = u.reduce(function (a, t) { return a + t.escassez.restantes; }, 0); return '<span class="tag pink">Restam ' + n + (n === 1 ? ' vaga' : ' vagas') + '</span>'; }
        if (g.some(function (t) { return t.escassez.estado === 'abertas'; })) return '<span class="tag">Vagas abertas</span>';
        if (g.length) return '<span class="tag gray">Lista de espera</span>';
        return '<span class="tag">Ingressos à venda</span>';
      }
      fetch('https://ivjvpdzsfjdpyabbzzuj.supabase.co/functions/v1/eventos-public', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'listar' }) })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          var evs = ((d && d.eventos) || []).filter(function (e) { return !e.realizado; }).slice(0, 3);
          if (!evs.length) return;
          box.innerHTML = evs.map(function (ev) {
            var dt = new Date(ev.inicio);
            var quando = dt.toLocaleDateString('pt-BR', { timeZone: 'America/Belem', weekday: 'short', day: '2-digit', month: 'short' }).replace('.', '') + ' · ' + dt.toLocaleTimeString('pt-BR', { timeZone: 'America/Belem', hour: '2-digit', minute: '2-digit' });
            return '<a data-fa-link="secao_hub" class="ev-mini" href="/eventos/' + encodeURIComponent(ev.slug) + '">' + tag(ev) +
              '<h3>' + esc(ev.titulo) + '</h3><div class="when">' + esc(quando) + ' · ' + esc(ev.publico === 'profissionais' ? 'Profissionais' : 'Famílias') + '</div>' +
              (ev.promessa ? '<p style="font-size:var(--fs-sm);color:var(--ink-soft);">' + esc(ev.promessa) + '</p>' : '') +
              '<span class="go">' + (ev.inscricoes_encerradas ? 'Ver detalhes' : 'Garantir vaga →') + '</span></a>';
          }).join('');
          document.getElementById('eventos').hidden = false;
          var nav = document.getElementById('nav-eventos'); if (nav) nav.hidden = false;
        }).catch(function () { /* sem agenda, sem seção */ });
    })();
  
