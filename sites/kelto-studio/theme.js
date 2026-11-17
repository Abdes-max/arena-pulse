// Bascule clair/sombre, mémorisée dans le navigateur (localStorage) --
// aucun cookie, rien d'envoyé au serveur. Sombre reste le thème par défaut
// (voir theme-init.js pour l'application avant le premier rendu). Fichier
// externe, pas de <script> inline : la CSP du site n'autorise que
// script-src 'self'.
(function () {
  var STORAGE_KEY = 'kelto-theme';

  function apply(mode) {
    if (mode === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
      button.setAttribute('aria-pressed', mode === 'light' ? 'true' : 'false');
      button.setAttribute('aria-label', mode === 'light' ? 'Passer en mode sombre' : 'Passer en mode clair');
    });
  }

  var stored = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    // Navigation privée ou stockage bloqué : le thème reste sombre par défaut.
  }
  apply(stored === 'light' ? 'light' : 'dark');

  document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
    button.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      apply(next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch (e) {}
    });
  });
})();
