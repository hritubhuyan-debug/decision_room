// Desktop | Phone toggle. On a laptop, "Phone" shows the real mobile layout inside a phone frame
// (the app runs in an iframe at phone width, so every mobile style and interaction applies).
(function () {
  var q = new URLSearchParams(location.search);
  var inFrame = q.has('frame') || window.self !== window.top;
  if (inFrame) return;
  var base = location.pathname;

  function toggleHTML(active) {
    return '<div class="view-toggle" role="group" aria-label="Preview size">' +
      '<a href="#" data-view="desktop" aria-pressed="' + (active === 'desktop') + '">Desktop</a>' +
      '<a href="#" data-view="phone" aria-pressed="' + (active === 'phone') + '">Phone</a></div>';
  }
  function bind(root, getHash) {
    root.querySelectorAll('.view-toggle a').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var h = getHash() || '';
        location.href = base + (a.getAttribute('data-view') === 'phone' ? '?view=phone' : '') + h;
      });
    });
  }

  if (q.get('view') === 'phone') {
    window.DR_PREVIEW = true; // tells app.js not to start on this page
    document.addEventListener('DOMContentLoaded', function () {
      document.body.classList.add('is-preview');
      document.body.innerHTML = '<div class="device-stage">' + toggleHTML('phone') +
        '<div class="device-wrap"><div class="device"><iframe title="Decision Room, phone view" src="' + base + '?frame=1' + location.hash + '"></iframe></div></div>' +
        '<p class="device-note">Phone view · 390 × 844</p></div>';
      var frame = document.querySelector('.device iframe');
      bind(document, function () { try { return frame.contentWindow.location.hash; } catch (e) { return location.hash; } });
      function fit() {
        var s = Math.min(1, (window.innerHeight - 110) / 868, (window.innerWidth - 40) / 414);
        var wrap = document.querySelector('.device-wrap');
        wrap.style.width = Math.round(414 * s) + 'px'; wrap.style.height = Math.round(868 * s) + 'px';
        document.querySelector('.device').style.transform = 'scale(' + s.toFixed(3) + ')';
      }
      fit(); window.addEventListener('resize', fit);
    });
    return;
  }

  document.addEventListener('DOMContentLoaded', function () {
    var wrap = document.createElement('div');
    wrap.className = 'view-toggle-float';
    wrap.innerHTML = toggleHTML('desktop');
    document.body.appendChild(wrap);
    bind(wrap, function () { return location.hash; });
  });
})();
