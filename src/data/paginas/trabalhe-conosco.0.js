// Formulário "Faça parte do nosso time": mesma lógica e mesmo endpoint do antigo modal (home, playground e circuito).
    (function () {
      var jobForm = document.getElementById('job-form');
      if (!jobForm) return;
      jobForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var errorBox = document.getElementById('job-form-error');
        var submitBtn = document.getElementById('job-form-submit');
        var resumeInput = document.getElementById('job-curriculo');
        errorBox.style.display = 'none';

        var resumeFile = resumeInput.files[0];
        if (!resumeFile || resumeFile.type !== 'application/pdf') {
          errorBox.textContent = 'Selecione um currículo em PDF.';
          errorBox.style.display = 'block';
          return;
        }
        if (resumeFile.size > 5 * 1024 * 1024) {
          errorBox.textContent = 'O currículo deve ter até 5MB.';
          errorBox.style.display = 'block';
          return;
        }

        var formData = new FormData();
        formData.append('full_name', document.getElementById('job-nome').value);
        formData.append('email', document.getElementById('job-email').value);
        formData.append('phone', document.getElementById('job-telefone').value);
        formData.append('course', document.getElementById('job-curso').value);
        formData.append('preferred_unit', document.getElementById('job-unidade') ? document.getElementById('job-unidade').value : '');
        formData.append('desired_area', document.getElementById('job-area').value);
        formData.append('opportunity_type', document.getElementById('job-tipo').value);
        formData.append('resume', resumeFile);

        submitBtn.disabled = true;
        submitBtn.textContent = 'Enviando...';

        var supabaseKey = (typeof window !== 'undefined' && window.VITE_SUPABASE_PUBLISHABLE_KEY) ? window.VITE_SUPABASE_PUBLISHABLE_KEY : '';
        fetch('https://ivjvpdzsfjdpyabbzzuj.supabase.co/functions/v1/job-application-webhook', {
          method: 'POST',
          headers: supabaseKey ? { 'Authorization': 'Bearer ' + supabaseKey } : {},
          body: formData
        })
          .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
          .then(function (r) {
            if (!r.ok) throw new Error(r.data.error || 'Falha ao enviar candidatura');
            if (window.faTrack) window.faTrack('job_application_submit', { pagina: location.pathname });
            var sentEmail = document.getElementById('job-email').value.trim();
            jobForm.innerHTML = '<div style="text-align:center; padding: 10px 0;" role="status">' +
              '<h3 style="color:var(--dark, #1a3f35); margin-bottom:12px; font-family:\'Fredoka One\',sans-serif; font-size:1.3rem;">Currículo enviado com sucesso!</h3>' +
              '<p style="color:var(--ink-soft, #556b63); font-weight:600; font-size:0.95rem; margin-bottom:10px;">Agradecemos por querer fazer parte do Instituto Faça Amigos. Recebemos sua candidatura.</p>' +
              '<p style="color:var(--ink-soft, #556b63); font-weight:600; font-size:0.95rem; margin-bottom:10px;">Fique atento(a) ao seu e-mail <strong id="job-sent-email" style="word-break:break-all;"></strong>: em alguns minutos você vai receber o link do nosso <strong>teste de perfil comportamental</strong>. Responda em até 7 dias para seguir no processo seletivo.</p>' +
              '<p style="color:var(--ink-soft, #556b63); font-size:0.85rem;">Não encontrou? Confira as pastas de spam e promoções.</p></div>';
            // textContent, não innerHTML: o e-mail vem do campo digitado.
            document.getElementById('job-sent-email').textContent = sentEmail;
            var card = document.getElementById('candidatura');
            if (card && card.scrollIntoView) card.scrollIntoView({ block: 'start' });
          })
          .catch(function (err) {
            var errorMsg = err.message || '';
            if (errorMsg.toLowerCase().includes('failed to fetch')) {
              errorMsg = 'Não foi possível enviar seu currículo no momento. Verifique sua conexão e tente novamente.';
            } else {
              errorMsg = errorMsg || 'Não foi possível enviar sua candidatura. Tente novamente.';
            }
            errorBox.textContent = errorMsg;
            errorBox.style.display = 'block';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Enviar candidatura';
          });
      });
    })();
