// S'applique avant le premier rendu pour éviter un flash sombre -> clair :
// sombre reste la valeur par défaut tant que rien n'est mémorisé (ou que
// le stockage est inaccessible, navigation privée). Volontairement sans
// defer ni async -- doit tourner avant que le navigateur affiche la page.
// Fichier externe, pas de <script> inline : la CSP du site (infra/deployment/
// Caddyfile) n'autorise que script-src 'self'.
(function () {
  try {
    if (localStorage.getItem('kelto-theme') === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  } catch (e) {}
})();
