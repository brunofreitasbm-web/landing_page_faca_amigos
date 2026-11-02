    // ===== Scroll reveal (respeita prefers-reduced-motion) =====
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

    // ===== Teste de Comportamento — motor do quiz =====
    (function () {
      var API_BASE = 'https://ivjvpdzsfjdpyabbzzuj.supabase.co/functions/v1/behavior-test-webhook';
      var STORAGE_KEY = 'fa_teste_state';
      var WHATSAPP_NUMBER = '5591991782027';

      var QUIZ = null;

      var state = {
        childName: '',
        ageRange: '',
        relation: '',
        guardianName: '',
        guardianEmail: '',
        guardianPhone: '',
        unit: '',
        marketingOptIn: false,
        leadId: null,
        testVersion: null,
        answers: {},
        currentQ: 0,
        completed: false,
        result: null,
        utm: null,
        referrer: '',
        landingPage: ''
      };

      var steps = ['step-landing', 'step-contact', 'step-question', 'step-lead', 'step-result'];

      function $(id) { return document.getElementById(id); }

      function saveState() {
        try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
      }

      function loadState() {
        try {
          var raw = sessionStorage.getItem(STORAGE_KEY);
          if (raw) {
            var saved = JSON.parse(raw);
            for (var k in saved) { if (Object.prototype.hasOwnProperty.call(saved, k)) state[k] = saved[k]; }
          }
        } catch (e) { /* ignore */ }
      }

      function pushEvent(payload) {
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push(payload);
      }

      // Voltar do aparelho: contato -> landing; pergunta N -> pergunta N-1. Landing, 1ª pergunta e resultado
      // são "raiz" (depth 0): o voltar sai da página, como o botão "Voltar" da tela, que também não existe ali.
      var setBackDepth = faBack.use('teste', function () {
        if (!$('step-contact').hidden) {
          showStep('step-landing', 'landing-heading');
        } else if (!$('step-lead').hidden) {
          renderQuestion(totalQuestions() - 1);
          showStep('step-question', 'question-heading');
        } else if (!$('step-question').hidden && state.currentQ > 0 && $('question-loading').hidden) {
          renderQuestion(state.currentQ - 1); // com o envio em andamento, ignora (a pilha é reempilhada)
        }
      });
      function syncBack() {
        var depth = 0;
        if (!$('step-contact').hidden || !$('step-lead').hidden) depth = 1;
        else if (!$('step-question').hidden) depth = state.currentQ;
        setBackDepth(depth);
      }

      function showStep(id, focusId) {
        steps.forEach(function (s) {
          var el = $(s);
          if (!el) return;
          el.hidden = (s !== id);
        });
        if (focusId) {
          var focusEl = $(focusId);
          if (focusEl) {
            requestAnimationFrame(function () { focusEl.focus(); });
          }
        }
        window.scrollTo({ top: 0, behavior: 'auto' });
        syncBack();
      }

      function replaceChild(text) {
        var name = state.childName || 'seu filho';
        return String(text).split('{{crianca}}').join(name);
      }

      // ---- Captura UTM/referrer (uma vez por sessão) ----
      function captureAcquisition() {
        if (state.utm) return;
        var params = new URLSearchParams(window.location.search);
        // fa-track.js guarda a origem real (Instagram, Google, QR...) mesmo depois de navegar pelo site.
        var o = (window.faOrigin && window.faOrigin()) || {};
        state.utm = {
          source: params.get('utm_source') || o.utm_source || '',
          medium: params.get('utm_medium') || o.utm_medium || '',
          campaign: params.get('utm_campaign') || o.utm_campaign || '',
          content: params.get('utm_content') || o.utm_content || '',
          term: params.get('utm_term') || o.utm_term || '',
          gclid: params.get('gclid') || o.gclid || '',
          fbclid: params.get('fbclid') || o.fbclid || ''
        };
        state.referrer = o.referrer || document.referrer || '';
        state.landingPage = window.location.href;
        saveState();
      }

      // ---- Máscara de telefone ----
      function maskPhone(value) {
        var digits = value.replace(/\D/g, '').slice(0, 11);
        var out = '';
        if (digits.length > 0) out += '(' + digits.slice(0, 2);
        if (digits.length >= 2) out += ') ';
        if (digits.length > 2) {
          var rest = digits.slice(2);
          if (rest.length > 5) {
            out += rest.slice(0, 1) + ' ' + rest.slice(1, 5) + '-' + rest.slice(5, 9);
          } else if (rest.length > 4) {
            out += rest.slice(0, 1) + ' ' + rest.slice(1);
          } else {
            out += rest;
          }
        }
        return out.trim();
      }

      function phoneDigitsValid(value) {
        var digits = value.replace(/\D/g, '');
        return digits.length === 10 || digits.length === 11;
      }

      // ---- Carregar JSON do quiz ----
      function loadQuiz() {
        return fetch('/teste-perguntas.json')
          .then(function (res) {
            if (!res.ok) throw new Error('Falha ao carregar o mapeamento');
            return res.json();
          })
          .then(function (data) {
            QUIZ = data;
            var durationEl = $('intro-duration-text');
            if (durationEl) durationEl.textContent = (QUIZ.intro && QUIZ.intro.duration) ? QUIZ.intro.duration : '~5 minutos';
            var questionsEl = $('intro-questions-text');
            if (questionsEl) questionsEl.textContent = (QUIZ.intro && QUIZ.intro.questions_label) ? QUIZ.intro.questions_label : '25 perguntas rápidas';
            var disclaimerEl = $('intro-disclaimer');
            if (disclaimerEl && QUIZ.intro && QUIZ.intro.disclaimer) disclaimerEl.textContent = QUIZ.intro.disclaimer;
            var startBtn = $('btn-start');
            startBtn.disabled = false;
            startBtn.textContent = 'Começar agora';
          })
          .catch(function () {
            var startBtn = $('btn-start');
            startBtn.disabled = false;
            startBtn.textContent = 'Tentar novamente';
            var err = $('landing-error');
            err.textContent = 'Não foi possível carregar o mapeamento agora. Verifique sua conexão e tente novamente.';
            err.style.display = 'block';
          });
      }

      // ---- Passo 0: Landing ----
      $('btn-start').addEventListener('click', function () {
        var err = $('landing-error');
        err.style.display = 'none';
        if (!QUIZ) {
          $('btn-start').disabled = true;
          $('btn-start').textContent = 'Carregando mapeamento...';
          loadQuiz();
          return;
        }
        pushEvent({ event: 'teste_start' });
        showStep('step-contact', 'contact-heading');
      });

      // ---- Passo 1: Contato e dados da criança ----
      document.querySelectorAll('input[name="age-range"]').forEach(function (input) {
        input.addEventListener('change', function () {
          var notice = $('under4-notice');
          var submitBtn = $('contact-form-submit');
          if (input.value === 'under-4' && input.checked) {
            notice.hidden = false;
            if (submitBtn) submitBtn.disabled = true;
            pushEvent({ event: 'teste_under4' });
          } else if (input.checked) {
            notice.hidden = true;
            if (submitBtn) submitBtn.disabled = false;
          }
        });
      });

      var phoneInput = $('guardian-phone');
      phoneInput.addEventListener('input', function () {
        var pos = phoneInput.selectionStart;
        var before = phoneInput.value.length;
        phoneInput.value = maskPhone(phoneInput.value);
        var after = phoneInput.value.length;
        try { phoneInput.selectionEnd = pos + (after - before); } catch (e) { /* ignore */ }
      });

      // Passo 1: só nome e faixa etária da criança. Nenhuma chamada ao servidor aqui.
      var childForm = $('child-form');
      childForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var errBox = $('contact-form-error');
        errBox.style.display = 'none';

        var childName = $('child-name').value.trim().split(' ')[0];
        var ageEl = document.querySelector('input[name="age-range"]:checked');

        if (!childName) {
          errBox.textContent = 'Digite o primeiro nome da criança.';
          errBox.style.display = 'block';
          $('child-name').focus();
          return;
        }
        if (!ageEl) {
          errBox.textContent = 'Selecione a faixa etária da criança.';
          errBox.style.display = 'block';
          return;
        }
        if (ageEl.value === 'under-4') {
          errBox.textContent = 'Este questionário é para crianças de 4 a 17 anos. Fale com a gente pelo WhatsApp acima.';
          errBox.style.display = 'block';
          return;
        }

        state.childName = childName;
        state.ageRange = ageEl.value;
        state.leadId = null;
        state.testVersion = null;
        state.currentQ = 0;
        state.answers = {};
        state.completed = false;
        state.result = null;
        saveState();
        pushEvent({ event: 'teste_child_info' });
        renderQuestion(0);
        showStep('step-question', 'question-heading');
      });

      // Passo 2 (depois da última pergunta): contato. Só aqui criamos o lead no servidor
      // (evento "start") e, em seguida, enviamos as respostas já guardadas (evento "complete").
      function showLeadStep() {
        document.querySelectorAll('[data-child-name]').forEach(function (el) {
          el.textContent = state.childName || 'seu filho';
        });
        $('lead-form-submit').textContent = 'Ver o retrato de ' + (state.childName || 'seu filho');
        $('lead-form-error').style.display = 'none';
        pushEvent({ event: 'teste_lead_step' });
        showStep('step-lead', 'lead-heading');
      }

      $('btn-lead-back').addEventListener('click', function () {
        renderQuestion(totalQuestions() - 1);
        showStep('step-question', 'question-heading');
      });

      var phoneInput = $('guardian-phone');
      phoneInput.addEventListener('input', function () {
        var pos = phoneInput.selectionStart;
        var before = phoneInput.value.length;
        phoneInput.value = maskPhone(phoneInput.value);
        var after = phoneInput.value.length;
        try { phoneInput.selectionEnd = pos + (after - before); } catch (e) { /* ignore */ }
      });

      var leadForm = $('lead-form');
      leadForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var errBox = $('lead-form-error');
        errBox.style.display = 'none';

        var relEl = document.querySelector('input[name="relation"]:checked');
        var guardianName = $('guardian-name').value.trim();
        var guardianPhone = $('guardian-phone').value.trim();
        var guardianEmail = $('guardian-email').value.trim();
        var unit = $('preferred-unit').value;
        var consent = $('consent-check').checked;
        var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        function fail(msg, focusEl) {
          errBox.textContent = msg;
          errBox.style.display = 'block';
          if (focusEl) focusEl.focus();
        }
        if (!relEl) return fail('Selecione quem está respondendo.');
        if (!guardianName) return fail('Digite seu nome.', $('guardian-name'));
        if (!phoneDigitsValid(guardianPhone)) return fail('Digite um WhatsApp válido, com DDD.', $('guardian-phone'));
        if (!emailRe.test(guardianEmail)) return fail('Digite um e-mail válido.', $('guardian-email'));
        if (!consent) return fail('É preciso aceitar a Política de Privacidade para continuar.');

        state.relation = relEl.value;
        state.guardianName = guardianName;
        state.guardianEmail = guardianEmail;
        state.guardianPhone = guardianPhone;
        state.unit = unit;
        state.marketingOptIn = !!($('marketing-opt-in') && $('marketing-opt-in').checked);
        saveState();

        var submitBtn = $('lead-form-submit');
        var label = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Enviando...';

        fetch(API_BASE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'start',
            child_first_name: state.childName,
            child_age_range: state.ageRange,
            guardian_relation: state.relation,
            guardian_name: state.guardianName,
            guardian_email: state.guardianEmail,
            guardian_phone: state.guardianPhone,
            preferred_unit: state.unit,
            consent: true,
            marketing_opt_in: state.marketingOptIn,
            website: ($('website-hp') && $('website-hp').value) || '',
            utm: state.utm || {},
            referrer: state.referrer || '',
            landing_page: state.landingPage || window.location.href
          })
        })
          .then(function (res) {
            return res.json().then(function (data) { return { ok: res.ok, status: res.status, data: data }; });
          })
          .then(function (r) {
            if (!r.ok) {
              if (r.status === 429) throw new Error('Muitas tentativas em pouco tempo. Aguarde um instante e tente novamente.');
              throw new Error(r.data && r.data.error ? r.data.error : 'Não foi possível enviar seus dados.');
            }
            state.leadId = r.data.lead_id;
            state.testVersion = r.data.test_version;
            saveState();
            pushEvent({ event: 'teste_lead' });
            pushEvent({ event: 'generate_lead', lead_source: 'teste_comportamento' });
            // As respostas já estão em state.answers: envia na sequência (a tela mostra "Montando o retrato...").
            showStep('step-question', 'question-heading');
            submitAnswers();
          })
          .catch(function (err) {
            var msg = err.message || '';
            if (msg.toLowerCase().indexOf('failed to fetch') !== -1) {
              msg = 'Não foi possível conectar agora. Verifique sua conexão e tente novamente.';
            }
            fail(msg || 'Não foi possível enviar seus dados. Tente novamente.');
          })
          .then(function () {
            submitBtn.disabled = false;
            submitBtn.textContent = label;
          });
      });

      // ---- Passo 2: Perguntas ----
      function totalQuestions() { return QUIZ && QUIZ.questions ? QUIZ.questions.length : 0; }

      function renderQuestion(index) {
        if (!QUIZ) return;
        var total = totalQuestions();
        var q = QUIZ.questions[index];
        state.currentQ = index;
        saveState();

        $('question-eyebrow').textContent = replaceChild('Sobre {{crianca}}');
        $('question-heading').textContent = q.text;

        var percentAnswered = Math.round(((index + 1) / total) * 100);
        $('progress-fill').style.width = percentAnswered + '%';
        $('progress-fill').setAttribute('aria-valuenow', String(percentAnswered));
        $('progress-label').textContent = 'Pergunta ' + (index + 1) + ' de ' + total;

        var list = $('scale-options');
        list.innerHTML = '';
        var existingAnswer = state.answers[q.id];
        QUIZ.scale.forEach(function (opt, i) {
          var inputId = 'scale-opt-' + i;
          var input = document.createElement('input');
          input.type = 'radio';
          input.name = 'scale-answer';
          input.id = inputId;
          input.className = 'visually-hidden';
          input.value = String(opt.v);
          if (existingAnswer !== undefined && Number(existingAnswer) === opt.v) input.checked = true;

          var label = document.createElement('label');
          label.className = 'scale-opt';
          label.setAttribute('for', inputId);
          label.textContent = opt.label;

          var picked = false;
          input.addEventListener('change', function () {
            if (picked) return;
            picked = true;
            state.answers[q.id] = opt.v;
            saveState();
            var percent = Math.round(((index + 1) / total) * 100);
            pushEvent({ event: 'teste_progress', percent: percent });

            window.setTimeout(function () {
              if (index + 1 < total) {
                renderQuestion(index + 1);
                var heading = $('question-heading');
                requestAnimationFrame(function () { heading.focus(); });
              } else {
                pushEvent({ event: 'teste_complete' });
                // Sessões antigas já têm lead_id (contato pedido no começo): envia direto.
                if (state.leadId) submitAnswers(); else showLeadStep();
              }
            }, 180);
          });

          // Voltar e tocar na resposta que já estava marcada não dispara "change": avança mesmo assim.
          input.addEventListener('click', function () {
            window.setTimeout(function () {
              if (!picked && input.checked) input.dispatchEvent(new Event('change'));
            }, 0);
          });

          list.appendChild(input);
          list.appendChild(label);
        });

        $('btn-back').hidden = (index === 0);
        $('question-error').style.display = 'none';
        $('question-loading').hidden = true;
        syncBack();
      }

      $('btn-back').addEventListener('click', function () {
        if (state.currentQ > 0) {
          renderQuestion(state.currentQ - 1);
        }
      });

      function submitAnswers() {
        var errBox = $('question-error');
        errBox.style.display = 'none';

        var answersArr = (QUIZ.questions || []).map(function (q) {
          return { id: q.id, v: state.answers[q.id] };
        });
        if (answersArr.some(function (a) { return a.v === undefined; })) {
          errBox.textContent = 'Parece que faltou responder alguma pergunta. Vamos recomeçar o mapeamento.';
          errBox.style.display = 'block';
          window.setTimeout(resetAll, 1800);
          return;
        }
        if (!state.leadId) {
          errBox.textContent = 'Sua sessão expirou. Vamos recomeçar o mapeamento.';
          errBox.style.display = 'block';
          window.setTimeout(resetAll, 1800);
          return;
        }

        $('scale-options').style.display = 'none';
        $('btn-back').hidden = true;
        var loadingBox = $('question-loading');
        var loadingText = $('question-loading-text');
        if (loadingText) loadingText.textContent = 'Montando o retrato de ' + (state.childName || 'seu filho') + '...';
        loadingBox.hidden = false;

        fetch(API_BASE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'complete',
            lead_id: state.leadId,
            test_version: state.testVersion,
            website: ($('website-hp') && $('website-hp').value) || '',
            answers: answersArr
          })
        })
          .then(function (res) {
            return res.json().then(function (data) { return { ok: res.ok, status: res.status, data: data }; });
          })
          .then(function (r) {
            if (!r.ok) {
              if (r.status === 404) {
                throw new Error('__RESTART__Mapeamento não encontrado. Vamos recomeçar do início.');
              }
              if (r.status === 409) {
                throw new Error('__RELOAD__Uma nova versão do mapeamento foi publicada. Atualize a página para continuar.');
              }
              throw new Error(r.data && r.data.error ? r.data.error : 'Não foi possível enviar seus dados.');
            }
            state.completed = true;
            state.result = r.data;
            saveState();
            pushEvent({ event: 'teste_result', result_band: r.data.result_band, tier3_count: r.data.tier3_count });
            renderResult();
            showStep('step-result', 'result-title');
          })
          .catch(function (err) {
            var msg = err.message || '';
            loadingBox.hidden = true;
            if (msg.indexOf('__RESTART__') === 0) {
              errBox.textContent = msg.replace('__RESTART__', '');
              errBox.style.display = 'block';
              window.setTimeout(resetAll, 2200);
              return;
            }
            if (msg.indexOf('__RELOAD__') === 0) {
              errBox.innerHTML = '';
              errBox.appendChild(document.createTextNode(msg.replace('__RELOAD__', '') + ' '));
              var reloadBtn = document.createElement('button');
              reloadBtn.type = 'button';
              reloadBtn.className = 'btn btn-ghost btn-sm';
              reloadBtn.style.marginTop = '8px';
              reloadBtn.textContent = 'Atualizar página';
              reloadBtn.addEventListener('click', function () { window.location.reload(); });
              errBox.appendChild(document.createElement('br'));
              errBox.appendChild(reloadBtn);
              errBox.style.display = 'block';
              return;
            }
            if (msg.toLowerCase().indexOf('failed to fetch') !== -1) {
              msg = 'Não foi possível enviar seus dados agora. Verifique sua conexão e tente novamente.';
            }
            errBox.innerHTML = '';
            errBox.appendChild(document.createTextNode((msg || 'Não foi possível enviar seus dados. Tente novamente.') + ' '));
            var retryBtn = document.createElement('button');
            retryBtn.type = 'button';
            retryBtn.className = 'btn btn-ghost btn-sm';
            retryBtn.style.marginTop = '8px';
            retryBtn.textContent = 'Tentar novamente';
            retryBtn.addEventListener('click', function () { submitAnswers(); });
            errBox.appendChild(document.createElement('br'));
            errBox.appendChild(retryBtn);
            errBox.style.display = 'block';
            $('scale-options').style.display = '';
          });
      }

      // ---- Passo 3: Resultado ----
      var TIER_ORDER = ['emotional', 'conduct', 'hyperactivity', 'peer', 'prosocial'];

      function renderResult() {
        var result = state.result || {};
        var results = result.results || [];
        var tier3Count = result.tier3_count || 0;
        var hasTier3 = tier3Count > 0;

        $('result-eyebrow').textContent = 'O retrato de ' + (state.childName || 'seu filho(a)');
        $('result-title').textContent = 'Seu retrato de observação';
        $('result-intro').textContent = hasTier3
          ? 'Identificamos ' + tier3Count + (tier3Count === 1 ? ' área' : ' áreas') + ' que merecem atenção especial. Respire fundo — isto é um retrato inicial e um ponto de partida, não um veredito.'
          : 'Aqui está o retrato de observação que você preencheu, com carinho e base científica. Veja abaixo o panorama de cada área observada.';

        var emailNote = $('result-email-note');
        if (emailNote) emailNote.hidden = !result.result_email_sent;

        // Gráfico de barras
        var chart = $('result-chart');
        chart.innerHTML = '';
        results.forEach(function (r) {
          var col = document.createElement('div');
          col.className = 'bar-col';

          var track = document.createElement('div');
          track.className = 'bar-track';

          var fill = document.createElement('div');
          fill.className = 'bar-fill ' + r.tier;
          fill.style.height = Math.max(0, Math.min(100, (r.score / r.max) * 100)) + '%';
          track.appendChild(fill);

          var value = document.createElement('div');
          value.className = 'bar-value';
          value.textContent = r.score + '/' + r.max;

          var label = document.createElement('div');
          label.className = 'bar-label';
          label.textContent = r.name;

          col.appendChild(track);
          col.appendChild(value);
          col.appendChild(label);
          chart.appendChild(col);
        });

        var legend = $('result-legend');
        var legendLabels = (result.tier_legend) || {
          tier1: 'Está fluindo bem',
          tier2: 'Merece um olhar mais de perto',
          tier3: 'Merece atenção especial'
        };
        legend.innerHTML = '';
        ['tier1', 'tier2', 'tier3'].forEach(function (t) {
          var span = document.createElement('span');
          var dot = document.createElement('span');
          dot.className = 'dot ' + t;
          span.appendChild(dot);
          span.appendChild(document.createTextNode(legendLabels[t]));
          legend.appendChild(span);
        });

        // Cards por área
        var areasBox = $('result-areas');
        areasBox.innerHTML = '';
        results.forEach(function (r) {
          var card = document.createElement('div');
          card.className = 'area-card ' + r.tier;

          var head = document.createElement('div');
          head.className = 'area-card-head';

          var name = document.createElement('span');
          name.className = 'area-card-name';
          name.textContent = r.name;

          var badge = document.createElement('span');
          badge.className = 'area-badge ' + r.tier;
          badge.textContent = r.tier_label;

          head.appendChild(name);
          head.appendChild(badge);

          var text = document.createElement('p');
          text.className = 'area-card-text';
          text.textContent = r.feedback;

          card.appendChild(head);
          card.appendChild(text);
          areasBox.appendChild(card);
        });

        // Bloco de contato humano
        $('result-human').hidden = !hasTier3;

        renderEbook(result.ebook, hasTier3, result.result_band);

        var childLabel = state.childName || 'meu filho';
        // Clínica ainda não abriu: com área em atenção especial o convite é para a lista de espera.
        var waResultMsg = hasTier3
          ? 'Acabei de fazer o Mapeamento Comportamental do(a) ' + childLabel + ' e gostaria de entrar na lista de espera da Clínica.'
          : 'Acabei de fazer o Mapeamento Comportamental do(a) ' + childLabel + '. Gostaria de conversar.';
        $('result-wa-label').textContent = hasTier3 ? 'Entrar na lista de espera da Clínica' : 'Conversar no WhatsApp';
        $('result-wa').href = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(waResultMsg);
      }

      // ---- Oferta do e-book (Hotmart) ----
      // Todo o conteúdo (copy, preço, link) vem do servidor em result.ebook;
      // sem ele (EBOOK_URL não configurada) o banner fica oculto. Sem nenhuma área em atenção especial e com
      // EBOOK2_URL, a oferta é O Código do Desenvolvimento Infantil (ebook.offer = 'codigo', sem preço nem amostra). Bullets e copy vêm do servidor.
      var ebookViewSent = false;
      var ebookObserver = null;

      function setText(id, text) {
        var el = $(id);
        if (!el) return;
        el.textContent = text || '';
        el.hidden = !text;
      }

      function renderEbook(ebook, hasTier3, band) {
        var box = $('result-ebook');
        if (!box) return;
        if (ebookObserver) { ebookObserver.disconnect(); ebookObserver = null; }
        if (!ebook || !ebook.url) { box.hidden = true; return; }

        setText('ebook-eyebrow', ebook.eyebrow);
        setText('ebook-headline', ebook.headline);
        setText('ebook-sub', ebook.sub);
        setText('ebook-trust', ebook.trust);

        var list = $('ebook-bullets');
        list.innerHTML = '';
        (ebook.bullets || []).forEach(function (b) {
          var li = document.createElement('li');
          li.textContent = b;
          list.appendChild(li);
        });

        setText('ebook-price-from', ebook.price_from ? 'de ' + ebook.price_from : '');
        setText('ebook-price-to', ebook.price_to);
        $('ebook-price-to-label').hidden = !(ebook.price_to && ebook.price_from);
        setText('ebook-installments', ebook.installments);
        $('ebook-price').hidden = !(ebook.price_from || ebook.price_to);

        // O botão leva à página de vendas (/guia) com src/sck/utm já montados no servidor.
        // Nome e e-mail NÃO vão na URL: ela passa por analytics (GA4/Clarity) e não pode carregar dados pessoais.
        $('ebook-cta').href = ebook.url;
        $('ebook-cta').textContent = ebook.cta_label || 'Quero o guia';
        var cover = $('ebook-cover-img');
        if (cover) {
          cover.src = ebook.cover_url || 'img/guia/capa.webp';
          cover.alt = ebook.cover_alt || 'Capa do e-book O Brincar com Propósito';
        }
        var sample = $('ebook-sample');
        if (sample) { sample.href = ebook.sample_url || '#'; sample.hidden = !ebook.sample_url; }
        box.setAttribute('data-band', band || '');
        box.setAttribute('data-offer', ebook.offer || 'guia');

        // Com área em atenção especial, o contato humano vem primeiro e o
        // e-book fica depois dos botões; sem ela, entra logo após o mapa.
        var actions = $('result-actions');
        if (actions && actions.parentNode) {
          if (hasTier3) actions.parentNode.insertBefore(box, actions.nextSibling);
          else actions.parentNode.insertBefore(box, actions);
        }
        box.hidden = false;

        if ('IntersectionObserver' in window && !ebookViewSent) {
          ebookObserver = new IntersectionObserver(function (entries) {
            if (entries.some(function (en) { return en.isIntersecting; })) {
              ebookViewSent = true;
              pushEvent({ event: 'teste_ebook_view', band: band || '', offer: ebook.offer || 'guia' });
              ebookObserver.disconnect();
              ebookObserver = null;
            }
          }, { threshold: 0.5 });
          ebookObserver.observe(box);
        }
      }

      $('ebook-cta').addEventListener('click', function () {
        var box = $('result-ebook');
        pushEvent({ event: 'teste_ebook_click', band: (box && box.getAttribute('data-band')) || '', offer: (box && box.getAttribute('data-offer')) || 'guia' });
      });

      $('ebook-sample').addEventListener('click', function () {
        var box = $('result-ebook');
        pushEvent({ event: 'teste_ebook_amostra_click', band: (box && box.getAttribute('data-band')) || '', offer: (box && box.getAttribute('data-offer')) || 'guia' });
      });

      $('result-wa').addEventListener('click', function () {
        pushEvent({ event: 'teste_whatsapp_click' });
      });

      $('result-clinica').addEventListener('click', function () {
        pushEvent({ event: 'teste_clinica_click' });
      });

      var under4Wa = $('under4-wa');
      if (under4Wa) {
        under4Wa.addEventListener('click', function () {
          var childLabel = ($('child-name') && $('child-name').value.trim()) || 'meu filho';
          var msg = 'Oi! Minha criança (' + childLabel + ') tem menos de 4 anos e eu gostaria de conversar sobre o desenvolvimento dela.';
          under4Wa.href = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(msg);
        });
      }

      $('btn-restart').addEventListener('click', function () {
        resetAll();
      });

      function resetAll() {
        try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
        state = {
          childName: '', ageRange: '', relation: '',
          guardianName: '', guardianEmail: '', guardianPhone: '', unit: '', marketingOptIn: false,
          leadId: null, testVersion: null,
          answers: {}, currentQ: 0, completed: false, result: null,
          utm: state.utm, referrer: state.referrer, landingPage: state.landingPage
        };
        childForm.reset();
        leadForm.reset();
        $('under4-notice').hidden = true;
        $('scale-options').style.display = '';
        $('question-loading').hidden = true;
        showStep('step-landing', 'landing-heading');
      }

      // ---- Inicialização ----
      // loadState antes de captureAcquisition: esta chama saveState() e, na
      // ordem inversa, sobrescrevia a sessão salva com o estado vazio.
      loadState();
      captureAcquisition();

      loadQuiz().then(function () {
        if (!QUIZ) return;

        // Sessão de uma versão antiga do teste — nunca reaproveitar estado.
        if (state.testVersion && state.testVersion !== QUIZ.version) {
          resetAll();
          return;
        }

        if (state.completed && state.result) {
          renderResult();
          showStep('step-result', 'result-title');
          return;
        }

        var answeredCount = Object.keys(state.answers || {}).length;
        if (state.leadId || (state.childName && state.ageRange)) {
          if (answeredCount >= totalQuestions() && totalQuestions() > 0) {
            if (state.leadId) {
              // lead criado mas o envio das respostas falhou: tenta de novo
              renderQuestion(totalQuestions() - 1);
              showStep('step-question', 'question-heading');
              submitAnswers();
            } else {
              renderQuestion(totalQuestions() - 1);
              showLeadStep();
            }
            return;
          }
          var resumeIndex = Math.min(answeredCount, totalQuestions() - 1);
          if (resumeIndex < 0) resumeIndex = 0;
          renderQuestion(resumeIndex);
          showStep('step-question', 'question-heading');
          return;
        }

        // sem criança informada: fica na landing (pré-preenche o que já tinha sido digitado)
        if (state.childName) $('child-name').value = state.childName;
        if (state.ageRange) {
          var ageInput = document.querySelector('input[name="age-range"][value="' + state.ageRange + '"]');
          if (ageInput) ageInput.checked = true;
        }
        showStep('step-landing');
      });
    })();
  
