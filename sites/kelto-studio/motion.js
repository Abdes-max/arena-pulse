// Effets au scroll de la vitrine Kelto Studio. Fichier externe (pas de
// <script> inline) : la CSP du site (infra/deployment/Caddyfile) n'autorise
// que script-src 'self'. Toute la page est lisible sans ce script ; il
// n'ajoute que des animations, et rien du tout avec « réduire les
// animations » ou sans IntersectionObserver.
(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
    return;
  }

  function animateCount(element) {
    var target = Number(element.dataset.count);
    var start = performance.now();
    function step(now) {
      var progress = Math.min((now - start) / 900, 1);
      element.textContent = String(Math.round(target * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) {
        requestAnimationFrame(step);
      }
    }
    element.textContent = '0';
    requestAnimationFrame(step);
  }

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) {
          return;
        }
        var element = entry.target;
        element.classList.remove('reveal-pending');
        if (element.dataset.count) {
          animateCount(element);
        }
        observer.unobserve(element);
      });
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 }
  );

  // Seul ce qui est encore sous la ligne de flottaison est masqué puis révélé :
  // aucun flash pour ce que le visiteur voit déjà au chargement.
  document.querySelectorAll('.reveal').forEach(function (element) {
    if (element.getBoundingClientRect().top > window.innerHeight * 0.92) {
      element.classList.add('reveal-pending');
      observer.observe(element);
    }
  });
  document.querySelectorAll('[data-count]').forEach(function (element) {
    observer.observe(element);
  });

  // Maquette TournArena : un score qui « tombe » de temps en temps, pour
  // illustrer le direct dont parle la section.
  var live = document.querySelector('[data-live-score]');
  if (live) {
    var home = 2;
    var away = 2;
    setInterval(function () {
      if (Math.random() < 0.5) {
        home += 1;
      } else {
        away += 1;
      }
      if (home + away > 7) {
        home = 2;
        away = 2;
      }
      live.textContent = home + ' – ' + away;
      live.classList.remove('score-flash');
      void live.offsetWidth;
      live.classList.add('score-flash');
    }, 3200);
  }
})();
