    // Estado de funcionamento pelo horário de Belém (UTC-3, sem horário de verão), referente ao Parque Shopping.
    // Sem JS, o texto fixo "Abre às 10h (dom. às 12h)" continua verdadeiro. Seg a sáb: 10h às 22h; domingo: 12h às 21h.
    (function () {
      try {
        var el = document.getElementById('topbar-status');
        if (!el) return;
        var now = new Date(Date.now() - 3 * 3600 * 1000);
        var h = now.getUTCHours() + now.getUTCMinutes() / 60;
        var dom = now.getUTCDay() === 0; // domingo em Belém (a data já está em UTC-3)
        var abre = dom ? 12 : 10, fecha = dom ? 21 : 22;
        el.textContent = (h < abre || h >= fecha) ? 'Fechado agora'
          : 'Aberto agora até ' + fecha + 'h (Parque Shopping)';
      } catch (e) {}
    })();
  
