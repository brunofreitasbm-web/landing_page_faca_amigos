    addEventListener('DOMContentLoaded', function () {
      if (!window.FAFotos) return;
      var sec = document.getElementById('momentos');
      FAFotos.galeria(sec.querySelector('.momentos-grid'), { site: true }, { max: 6 }).then(function (n) {
        if (n >= 3) sec.hidden = false; // com 1 ou 2 fotos a grade fica com buraco: espera juntar 3
      });
    });
  
