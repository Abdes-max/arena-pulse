// First paint in the visitor's own light/dark choice (ThemeService stores it),
// else the dark default already on <html>. A file, not inline: the CSP
// allows no inline scripts.
try {
  var mode = localStorage.getItem('tournarena.mode');
  if (mode === 'light' || mode === 'dark') {
    document.documentElement.setAttribute('data-mode', mode);
  }
} catch (e) {
  // Storage unavailable: keep the default.
}
