/* ============================================================
   Swipeable tab view ([data-swft-tabs]), used by the homepage
   Build / Grow / Automate services. Markup: scripts/build-service-pages.mjs
   (svc:rows). Styles: css/home.css.

   The panels sit side by side in a horizontal scroll-snap track, so
   phones swipe between them natively (momentum, rubber-banding, the lot)
   and trackpads can swipe sideways too. This script only listens:
     - the pill indicator follows the scroll position continuously, so it
       glides under the tabs as you drag rather than jumping at the end;
     - the track's height eases between the panels' heights;
     - the tab closest to the scroll position becomes aria-selected and
       the other panels go inert (out of the tab order).
   Tabs: click or Arrow/Home/End scrolls the track smoothly to the panel.
   ============================================================ */
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function setup(root) {
    var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
    var panels = tabs.map(function (t) { return document.getElementById(t.getAttribute("aria-controls")); });
    var view = root.querySelector(".sv-tabs__view");
    var ind = root.querySelector(".sv-tabs__ind");
    if (!tabs.length || !view || panels.indexOf(null) !== -1) return;

    var cur = 0, ticking = false, settleTimer = null;
    root.classList.add("is-live");

    function progress() {
      var w = view.clientWidth || 1;
      return Math.max(0, Math.min(panels.length - 1, view.scrollLeft / w));
    }

    function paint() {
      ticking = false;
      var p = progress();
      var a = Math.floor(p), b = Math.min(panels.length - 1, a + 1), f = p - a;
      // indicator: interpolate position and width between the two tabs
      if (ind) {
        var x = tabs[a].offsetLeft + (tabs[b].offsetLeft - tabs[a].offsetLeft) * f;
        var w = tabs[a].offsetWidth + (tabs[b].offsetWidth - tabs[a].offsetWidth) * f;
        ind.style.transform = "translateX(" + x + "px)";
        ind.style.width = w + "px";
      }
      // height: interpolate between the two panels
      var h = panels[a].offsetHeight + (panels[b].offsetHeight - panels[a].offsetHeight) * f;
      view.style.height = Math.round(h) + "px";
      // subtle depth on the panels as they slide
      panels.forEach(function (el, i) {
        var d = Math.min(1, Math.abs(i - p));
        el.style.opacity = String(1 - d * 0.55);
        el.style.transform = "scale(" + (1 - d * 0.03) + ")";
      });
      var near = Math.round(p);
      if (near !== cur) select(near, false);
    }

    function select(i, focus) {
      cur = i;
      tabs.forEach(function (t, k) {
        var on = k === i;
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
      });
      if (focus) tabs[i].focus();
      clearTimeout(settleTimer);
      settleTimer = setTimeout(function () {
        panels.forEach(function (el, k) {
          if (k === cur) { el.removeAttribute("inert"); el.removeAttribute("aria-hidden"); }
          else { el.setAttribute("inert", ""); el.setAttribute("aria-hidden", "true"); }
        });
      }, 180);
    }

    function goTo(i) {
      i = (i + panels.length) % panels.length;
      select(i, false);
      view.scrollTo({ left: i * view.clientWidth, behavior: reduce ? "auto" : "smooth" });
      try { if (window.posthog) window.posthog.capture("services_tab", { tab: tabs[i].textContent }); } catch (e) { /* ignore */ }
    }

    view.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; requestAnimationFrame(paint); }
    }, { passive: true });

    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { goTo(i); });
      t.addEventListener("keydown", function (e) {
        var k = { ArrowRight: 1, ArrowLeft: -1 }[e.key], to = null;
        if (k) to = i + k;
        else if (e.key === "Home") to = 0;
        else if (e.key === "End") to = tabs.length - 1;
        if (to === null) return;
        e.preventDefault();
        to = (to + tabs.length) % tabs.length;
        goTo(to); tabs[to].focus();
      });
    });

    // Keep the current panel in place when the width changes
    var rw = view.clientWidth;
    window.addEventListener("resize", function () {
      if (view.clientWidth === rw) return;
      rw = view.clientWidth;
      view.scrollLeft = cur * view.clientWidth;
      paint();
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(paint);
    // Re-measure when a panel's content changes height (fonts, images, wraps)
    if ("ResizeObserver" in window) {
      var ro = new ResizeObserver(function () { if (!ticking) { ticking = true; requestAnimationFrame(paint); } });
      panels.forEach(function (el) { ro.observe(el); });
    }

    select(cur, false);
    paint();
  }

  function init() { Array.prototype.forEach.call(document.querySelectorAll("[data-swft-tabs]"), setup); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
