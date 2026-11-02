    (function () {
      var API = 'https://ivjvpdzsfjdpyabbzzuj.supabase.co/functions/v1/eventos-public';
      var CAT = { palestra: 'Palestra', reuniao: 'Encontro', treinamento: 'Treinamento' };
      var PUB = { familias: 'Para famílias', profissionais: 'Para profissionais' };
      var $ = function (id) { return document.getElementById(id); };
      var ev = null, tipoSel = null, countdownTimer = null;

      function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
      function show(id, on) { var el = $(id); if (el) el.hidden = !on; }
      function text(id, v) { $(id).textContent = v == null ? '' : v; }
      function fmtData(iso) { return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Belem', weekday: 'long', day: '2-digit', month: 'long' }); }
      function fmtHora(iso) { return new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Belem', hour: '2-digit', minute: '2-digit' }); }
      function maskPhone(value) {
        var d = value.replace(/\D/g, '').slice(0, 11), out = '';
        if (d.length > 0) out += '(' + d.slice(0, 2);
        if (d.length >= 2) out += ') ';
        if (d.length > 2) { var r = d.slice(2); out += r.length > 5 ? r.slice(0, 1) + ' ' + r.slice(1, 5) + '-' + r.slice(5, 9) : (r.length > 4 ? r.slice(0, 1) + ' ' + r.slice(1) : r); }
        return out;
      }
      function slugFromUrl() {
        var m = /^\/eventos\/([a-z0-9-]+)\/?$/i.exec(location.pathname);
        if (m) return m[1].toLowerCase();
        return (new URLSearchParams(location.search).get('slug') || '').toLowerCase();
      }
      function post(body) {
        return fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
          .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, d: d }; }); });
      }

      // --- escassez: só número real vindo do servidor ---
      function escassezTexto(t) {
        var e = t.escassez || {};
        if (t.tipo === 'pago') return { cls: '', txt: e.vendidos ? e.vendidos + ' ingresso' + (e.vendidos > 1 ? 's' : '') + ' vendido' + (e.vendidos > 1 ? 's' : '') : 'Ingressos à venda' };
        if (e.estado === 'esgotado') return { cls: 'esgotado', txt: 'Vagas esgotadas' + (e.lista_espera ? ' · ' + e.lista_espera + ' na lista de espera' : '') };
        if (e.estado === 'ultimas') return { cls: 'ultimas', txt: 'Restam ' + e.restantes + (e.restantes === 1 ? ' vaga' : ' vagas') };
        return { cls: '', txt: 'Vagas abertas' };
      }
      function countdown() {
        var el = $('ev-countdown');
        if (!ev || ev.inscricoes_encerradas) { el.textContent = ''; return; }
        var ms = new Date(ev.inscricoes_ate).getTime() - Date.now();
        if (ms <= 0) { el.textContent = 'Inscrições encerradas.'; return; }
        var d = Math.floor(ms / 86400000), h = Math.floor(ms / 3600000) % 24, m = Math.floor(ms / 60000) % 60;
        el.textContent = 'Inscrições até ' + fmtData(ev.inscricoes_ate) + ' às ' + fmtHora(ev.inscricoes_ate) + ' · faltam ' + (d ? d + 'd ' : '') + h + 'h ' + m + 'min';
      }

      function renderTipos() {
        var box = $('ev-tipos');
        var tipos = ev.tipos || [];
        box.innerHTML = tipos.map(function (t) {
          var e = escassezTexto(t);
          return '<div class="tipo' + (tipoSel && tipoSel.id === t.id ? ' sel' : '') + '" role="radio" aria-checked="' + (tipoSel && tipoSel.id === t.id) + '" tabindex="0" data-tipo="' + esc(t.id) + '">' +
            '<div><div class="n">' + esc(t.nome) + '</div><div class="p">' + esc(e.txt) + '</div></div>' +
            '<div class="preco">' + (t.tipo === 'pago' ? esc(t.preco_exibicao || 'Pago') : 'Gratuito') + '</div></div>';
        }).join('');
        box.hidden = tipos.length < 2;
        var e = tipoSel ? escassezTexto(tipoSel) : { cls: '', txt: '' };
        $('ev-escassez').className = 'escassez ' + e.cls;
        text('ev-escassez-txt', e.txt);
        show('form', !!tipoSel && tipoSel.tipo === 'gratuito' && !ev.inscricoes_encerradas);
        show('pago', !!tipoSel && tipoSel.tipo === 'pago' && !ev.inscricoes_encerradas);
        show('encerrado', ev.inscricoes_encerradas || !tipos.length);
        var hc = $('ev-hero-cta');
        hc.hidden = !tipoSel || ev.inscricoes_encerradas;
        if (tipoSel) hc.textContent = tipoSel.tipo === 'pago' ? 'Garantir ingresso' : (tipoSel.escassez.estado === 'esgotado' ? 'Entrar na lista de espera' : 'Garantir minha vaga');
        if (tipoSel && tipoSel.tipo === 'gratuito') {
          var esg = tipoSel.escassez.estado === 'esgotado';
          $('f-submit').textContent = esg ? 'Entrar na lista de espera' : 'Garantir minha vaga';
          text('box-titulo', esg ? 'Entre na lista de espera' : 'Garanta sua vaga');
        }
        if (tipoSel && tipoSel.tipo === 'pago') {
          var u = tipoSel.hotmart_checkout_url || '#';
          try {
            var url = new URL(u);
            var o = (window.faOrigin && window.faOrigin()) || {};
            ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'xcod'].forEach(function (k) { if (o[k] && !url.searchParams.get(k)) url.searchParams.set(k, o[k]); });
            if (!url.searchParams.get('sck')) url.searchParams.set('sck', 'evento_' + ev.slug);
            u = url.toString();
          } catch (e) { /* mantém */ }
          $('pago-btn').href = u;
          text('box-titulo', 'Garanta seu ingresso');
        }
      }
      $('ev-tipos').addEventListener('click', function (e) {
        var el = e.target.closest ? e.target.closest('[data-tipo]') : null;
        if (!el) return;
        tipoSel = (ev.tipos || []).filter(function (t) { return t.id === el.getAttribute('data-tipo'); })[0] || tipoSel;
        renderTipos();
      });
      $('ev-tipos').addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var el = e.target.closest ? e.target.closest('[data-tipo]') : null;
        if (el) { e.preventDefault(); el.click(); }
      });

      function render() {
        document.title = ev.titulo + ' | Instituto FaçaAmigos';
        var mt = document.querySelector('meta[property="og:title"]'); if (mt) mt.setAttribute('content', ev.titulo);
        var md = document.querySelector('meta[name="description"]'); if (md && ev.descricao_curta) md.setAttribute('content', ev.descricao_curta);
        $('ev-tags').innerHTML = '<span class="tag">' + esc(CAT[ev.categoria] || ev.categoria) + '</span><span class="tag">' + esc(PUB[ev.publico] || '') + '</span>' +
          (ev.formato === 'online' ? '<span class="tag yellow">Online</span>' : (ev.formato === 'hibrido' ? '<span class="tag yellow">Presencial + online</span>' : ''));
        text('ev-titulo', ev.titulo);
        text('ev-quando', fmtData(ev.inicio) + ', das ' + fmtHora(ev.inicio) + ' às ' + fmtHora(ev.fim) + ' (horário de Belém)');
        text('ev-onde', ev.formato === 'online' ? 'Online · o link chega no seu ingresso após a confirmação' : [ev.local_nome, ev.local_endereco].filter(Boolean).join(' · ') || 'Belém/PA');
        if (ev.palestrante_nome) { text('ev-quem', ev.palestrante_nome); show('ev-quem-wrap', true); }
        if (ev.capa_url) { $('ev-capa').src = ev.capa_url; $('ev-capa').alt = ev.titulo || ''; show('ev-capa-wrap', true); }
        if (ev.promessa) { text('ev-promessa', ev.promessa); show('ev-promessa-wrap', true); }
        $('ev-beneficios').innerHTML = (ev.beneficios || []).map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('');
        if (ev.para_quem || ev.nao_e_para) {
          show('ev-quem-grid', true);
          if (ev.para_quem) { text('ev-para-quem', ev.para_quem); show('ev-para-quem-wrap', true); }
          if (ev.nao_e_para) { text('ev-nao-e-para', ev.nao_e_para); show('ev-nao-e-para-wrap', true); }
        }
        if (ev.descricao_longa || ev.palestrante_nome) {
          show('ev-descricao-wrap', true);
          $('ev-descricao').innerHTML = String(ev.descricao_longa || '').split(/\n\s*\n/).filter(function (p) { return p.trim(); }).map(function (p) { return '<p>' + esc(p.trim()).replace(/\n/g, '<br>') + '</p>'; }).join('');
          if (ev.palestrante_nome) {
            show('ev-palestrante', true);
            text('ev-palestrante-nome', ev.palestrante_nome);
            text('ev-palestrante-bio', ev.palestrante_bio || '');
            if (ev.palestrante_foto_url) { $('ev-palestrante-foto').src = ev.palestrante_foto_url; $('ev-palestrante-foto').alt = 'Foto de ' + ev.palestrante_nome; show('ev-palestrante-foto', true); }
          }
        }
        var tipos = ev.tipos || [];
        tipoSel = tipos.filter(function (t) { return t.tipo === 'gratuito' && t.escassez.estado !== 'esgotado'; })[0] || tipos[0] || null;
        renderTipos();
        countdown();
        clearInterval(countdownTimer);
        countdownTimer = setInterval(countdown, 30000);

        // JSON-LD Event: o middleware.js já injeta no HTML do servidor (data-ssr="evento"); este é só o reserva
        // para quando a página veio sem ele (falha da API no servidor, preview com proteção).
        var ld = document.querySelector('script[data-ssr="evento"]') ? null : document.createElement('script');
        if (ld) {
          ld.type = 'application/ld+json';
          ld.textContent = JSON.stringify({
            '@context': 'https://schema.org', '@type': 'Event', name: ev.titulo, startDate: ev.inicio, endDate: ev.fim,
            eventAttendanceMode: ev.formato === 'online' ? 'https://schema.org/OnlineEventAttendanceMode' : (ev.formato === 'hibrido' ? 'https://schema.org/MixedEventAttendanceMode' : 'https://schema.org/OfflineEventAttendanceMode'),
            eventStatus: 'https://schema.org/EventScheduled',
            location: ev.formato === 'online' ? { '@type': 'VirtualLocation', url: 'https://institutofacaamigos.com.br/eventos/' + ev.slug } : { '@type': 'Place', name: ev.local_nome || 'Belém/PA', address: ev.local_endereco || 'Belém, PA' },
            description: ev.descricao_curta || ev.promessa || '', image: ev.capa_url ? [ev.capa_url] : undefined,
            organizer: { '@type': 'Organization', name: 'Instituto FaçaAmigos', url: 'https://institutofacaamigos.com.br/' },
            offers: tipos.map(function (t) { return { '@type': 'Offer', name: t.nome, price: t.tipo === 'gratuito' ? '0' : undefined, priceCurrency: 'BRL', availability: t.escassez.estado === 'esgotado' ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock', url: 'https://institutofacaamigos.com.br/eventos/' + ev.slug }; })
          });
          document.head.appendChild(ld);
        }

        show('loading', false);
        show('evento', true);
        if (window.faTrack) window.faTrack('evento_view', { slug: ev.slug, trilha: ev.publico, categoria: ev.categoria });
      }

      // --- formulário ---
      $('f-whatsapp').addEventListener('input', function () { this.value = maskPhone(this.value); });
      var started = false;
      $('form').addEventListener('input', function () { if (!started) { started = true; if (window.faTrack) window.faTrack('evento_inscricao_start', { slug: ev.slug, trilha: ev.publico }); } });

      $('form').addEventListener('submit', function (e) {
        e.preventDefault();
        var err = $('f-error'); err.textContent = ''; err.classList.remove('active');
        var nome = $('f-nome').value.trim(), email = $('f-email').value.trim(), wa = $('f-whatsapp').value.replace(/\D/g, '');
        if (nome.length < 3) return fail('Escreva seu nome completo.');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Confira o e-mail: é para lá que vai o voucher.');
        if (wa.length < 10) return fail('Confira o WhatsApp com DDD.');
        if (!$('f-consent').checked) return fail('Precisamos do seu consentimento para registrar a inscrição.');
        if (!tipoSel) return fail('Escolha um tipo de ingresso.');
        var btn = $('f-submit'); btn.disabled = true; var label = btn.textContent; btn.textContent = 'Enviando…';
        var o = (window.faOrigin && window.faOrigin()) || {};
        post({
          action: 'inscrever', tipo_id: tipoSel.id, nome: nome, email: email, whatsapp: wa, perfil: $('f-perfil').value,
          consent: true, marketing_opt_in_email: $('f-optin-email').checked, marketing_opt_in_whatsapp: $('f-optin-wa').checked,
          'website-hp': $('website-hp').value,
          utm_source: o.utm_source || '', utm_medium: o.utm_medium || '', utm_campaign: o.utm_campaign || '', utm_content: o.utm_content || '', utm_term: o.utm_term || '',
          gclid: o.gclid || '', fbclid: o.fbclid || '', referrer: o.referrer || document.referrer || '', landing_page: location.href
        }).then(function (r) {
          btn.disabled = false; btn.textContent = label;
          if (!r.ok) return fail((r.d && r.d.error) || 'Não foi possível registrar agora. Tente de novo.');
          sucesso(r.d);
        }).catch(function () { btn.disabled = false; btn.textContent = label; fail('Sem conexão. Verifique sua internet e tente de novo.'); });
        function fail(m) { err.textContent = m; err.classList.add('active'); }
      });

      function sucesso(d) {
        show('box-inscricao', false);
        show('sucesso', true);
        var primeiro = $('f-nome').value.trim().split(/\s+/)[0];
        if (d.status === 'confirmada') {
          text('s-titulo', primeiro + ', sua vaga está confirmada!');
          text('s-texto', 'Enviamos o voucher com QR para ' + $('f-email').value.trim() + '. Guarde o código abaixo: ele é o seu ingresso.');
          $('s-codigo').textContent = d.codigo; show('s-codigo', true);
          if (d.ingresso_url) { $('s-ingresso').href = d.ingresso_url; show('s-ingresso', true); }
          if (d.comunidade_whatsapp_url) { $('s-comunidade').href = d.comunidade_whatsapp_url; show('s-comunidade', true); }
          text('s-nota', 'Não vai conseguir ir? Pelo link do ingresso você libera a vaga para quem está na fila.');
        } else if (d.status === 'lista_espera') {
          text('s-titulo', primeiro + ', você está na lista de espera');
          text('s-texto', 'As vagas acabaram, mas quem cancela libera a vaga para a fila, na ordem. Sua posição:');
          $('s-posicao').textContent = d.posicao + 'º'; show('s-posicao', true);
          text('s-nota', 'Quando abrir vaga, avisamos por e-mail e você terá 24 horas para confirmar. Sem confirmação, passa para a próxima pessoa.');
        } else {
          text('s-titulo', 'Você já está inscrita neste encontro');
          text('s-texto', 'Reenviamos o e-mail com o seu ' + (d.situacao === 'confirmada' ? 'voucher' : 'aviso da lista de espera') + ' para ' + $('f-email').value.trim() + '. Confira também a caixa de spam.');
        }
        if (window.faTrack) window.faTrack('evento_inscricao', { slug: ev.slug, trilha: ev.publico, tipo_ingresso: tipoSel ? tipoSel.nome : '', resultado: d.status });
        if (d.status === 'confirmada' || d.status === 'lista_espera') { window.dataLayer = window.dataLayer || []; window.dataLayer.push({ event: 'generate_lead', lead_type: 'evento', value: 0, currency: 'BRL' }); }
        $('sucesso').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      // --- boot ---
      var slug = slugFromUrl();
      if (!slug) { show('loading', false); show('notfound', true); return; }
      post({ action: 'detalhe', slug: slug }).then(function (r) {
        if (!r.ok || !r.d || !r.d.evento) { show('loading', false); show('notfound', true); return; }
        ev = r.d.evento;
        render();
      }).catch(function () { $('loading').textContent = 'Não foi possível carregar o encontro agora. Tente de novo em instantes.'; });
    })();
  
