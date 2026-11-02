// Volta para a página de onde o leitor veio (mesmo site); sem referrer válido, mantém o Playground.
    (function () {
      try {
        var r = document.referrer;
        if (!r) return;
        var u = new URL(r);
        if (u.origin === location.origin && u.pathname.replace(/\/$/, '') !== location.pathname.replace(/\/$/, '')) {
          document.getElementById('voltar').href = r;
        }
      } catch (e) {}
    })();
