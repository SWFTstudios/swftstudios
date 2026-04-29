(function () {
  var STORAGE_KEY = 'swft-theme';

  var themes = [
    { id: 'aura-echo', label: 'Echo',     color: '#00ff66' },
    { id: 'scalable',  label: 'Carbon',   color: '#3b82f6' },
    { id: 'instant',   label: 'Mono',     color: '#9ca3af' },
    { id: 'aethel',    label: 'Cyan',     color: '#06b6d4' },
    { id: 'spectral',  label: 'Spectral', color: '#f2ead3' },
  ];

  function applyTheme(id) {
    if (id) {
      document.documentElement.setAttribute('data-theme', id);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    try { localStorage.setItem(STORAGE_KEY, id || ''); } catch (_) {}
    updateActiveButton(id);
  }

  function updateActiveButton(activeId) {
    document.querySelectorAll('.theme-btn').forEach(function (btn) {
      if (btn.dataset.themeId === activeId) {
        btn.classList.add('is-active');
      } else {
        btn.classList.remove('is-active');
      }
    });
  }

  function buildBar() {
    var bar = document.createElement('div');
    bar.className = 'theme-switcher-bar';

    var label = document.createElement('span');
    label.textContent = 'Theme:';
    label.style.cssText = 'font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.3);margin-right:4px;white-space:nowrap;';
    bar.appendChild(label);

    themes.forEach(function (theme) {
      var btn = document.createElement('button');
      btn.className = 'theme-btn';
      btn.dataset.themeId = theme.id;
      btn.style.setProperty('--btn-dot-color', theme.color);

      var dot = document.createElement('span');
      dot.className = 'theme-btn-dot';
      dot.style.background = theme.color;

      btn.appendChild(dot);
      btn.appendChild(document.createTextNode(theme.label));

      btn.addEventListener('click', function () {
        var current = document.documentElement.getAttribute('data-theme');
        applyTheme(current === theme.id ? null : theme.id);
      });

      bar.appendChild(btn);
    });

    return bar;
  }

  function init() {
    var navbar = document.querySelector('.fixed-navbar');
    if (!navbar) return;

    var bar = buildBar();
    navbar.appendChild(bar);

    var saved = '';
    try { saved = localStorage.getItem(STORAGE_KEY) || ''; } catch (_) {}
    if (saved) applyTheme(saved);
    else updateActiveButton(null);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
