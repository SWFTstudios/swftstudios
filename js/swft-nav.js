/* SWFT Studios — shared mobile nav toggle (self-initializing) */
(function () {
  function init() {
    var burger = document.getElementById('sn-burger');
    var panel = document.getElementById('sn-panel');
    var scrim = document.getElementById('sn-scrim');
    var close = document.getElementById('sn-close');
    if (!burger || !panel) return;
    function open() { panel.classList.add('open'); if (scrim) scrim.classList.add('open'); burger.setAttribute('aria-expanded', 'true'); panel.setAttribute('aria-hidden', 'false'); }
    function shut() { panel.classList.remove('open'); if (scrim) scrim.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); panel.setAttribute('aria-hidden', 'true'); }
    burger.addEventListener('click', open);
    if (close) close.addEventListener('click', shut);
    if (scrim) scrim.addEventListener('click', shut);
    panel.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', shut); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
