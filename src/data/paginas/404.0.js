(function () {
      try {
        var p = location.pathname + location.search;
        if (p && p !== '/' && p !== '/404.html') {
          document.getElementById('tried-path').textContent = p.length > 80 ? p.slice(0, 77) + '...' : p;
          document.getElementById('tried').style.display = 'block';
        }
      } catch (e) {}
    })();
