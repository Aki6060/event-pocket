(function () {
  function boot() {
    var node = document.getElementById('root');
    if (node && window.EP && window.EP.app) window.EP.app.mount(node);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
