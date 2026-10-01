/* ============================================================
   Homepage "Creative Services" (css/home-services.css).
   - The service nearest the middle of the screen is active: its name lights
     up, its description opens and its featured project fades in on the right.
   - Hovering or focusing a service makes it active straight away.
   - Desktop, fine pointer: a round accent arrow trails the pointer over the list.
   No dependencies. Without this script every service is shown open.
   ============================================================ */
(function () {
  "use strict";

  var mqReduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  var mqFine = window.matchMedia ? window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 992px)") : null;

  function init(root) {
    var list = root.querySelector(".svc-list");
    var items = Array.prototype.slice.call(root.querySelectorAll(".svc-item"));
    var features = Array.prototype.slice.call(root.querySelectorAll("[data-svc-feature]"));
    var pointer = root.querySelector(".svc-pointer");
    if (!list || !items.length) return;

    list.classList.add("is-js");
    var active = -1;
    var hovering = false;

    function setActive(i) {
      if (i === active || i < 0) return;
      active = i;
      items.forEach(function (el, n) { el.classList.toggle("is-active", n === i); });
      features.forEach(function (el, n) {
        var on = n === i;
        el.classList.toggle("is-active", on);
        // Only the visible project is reachable by keyboard / screen readers
        if (on) { el.removeAttribute("aria-hidden"); el.removeAttribute("tabindex"); }
        else { el.setAttribute("aria-hidden", "true"); el.setAttribute("tabindex", "-1"); }
      });
    }

    // Scroll: the item whose middle is nearest the viewport's middle wins.
    var ticking = false;
    function fromScroll() {
      ticking = false;
      if (hovering) return;
      var mid = window.innerHeight / 2;
      var best = 0, bestD = Infinity;
      items.forEach(function (el, n) {
        var name = el.querySelector(".svc-name") || el;
        var r = name.getBoundingClientRect();
        var d = Math.abs(r.top + r.height / 2 - mid);
        if (d < bestD) { bestD = d; best = n; }
      });
      setActive(best);
    }
    function onScroll() {
      if (!ticking) { ticking = true; requestAnimationFrame(fromScroll); }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    items.forEach(function (el, n) {
      el.addEventListener("mouseenter", function () { if (mqFine && mqFine.matches) { hovering = true; setActive(n); } });
      el.addEventListener("focusin", function () { setActive(n); });
    });
    list.addEventListener("mouseleave", function () { hovering = false; onScroll(); });

    // Pointer arrow: eases toward the cursor, grows in over the list, shrinks out when leaving.
    if (pointer) {
      var tx = 0, ty = 0, x = 0, y = 0, s = 0, ts = 0, raf = 0;
      function frame() {
        var k = mqReduce && mqReduce.matches ? 1 : 0.18;
        x += (tx - x) * k; y += (ty - y) * k; s += (ts - s) * 0.2;
        pointer.style.setProperty("--px", x.toFixed(1) + "px");
        pointer.style.setProperty("--py", y.toFixed(1) + "px");
        pointer.style.setProperty("--ps", s.toFixed(3));
        if (Math.abs(tx - x) > 0.3 || Math.abs(ty - y) > 0.3 || Math.abs(ts - s) > 0.005) raf = requestAnimationFrame(frame);
        else raf = 0;
      }
      function kick() { if (!raf) raf = requestAnimationFrame(frame); }
      list.addEventListener("mousemove", function (e) {
        if (!mqFine || !mqFine.matches) return;
        var r = list.getBoundingClientRect();
        tx = e.clientX - r.left; ty = e.clientY - r.top;
        if (!ts) { x = tx; y = ty; }
        ts = 1;
        kick();
      });
      list.addEventListener("mouseleave", function () { ts = 0; kick(); });
    }

    setActive(0);
    fromScroll();
  }

  function boot() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-services]"), function (el) {
      if (el.__svc) return;
      el.__svc = true;
      init(el.closest(".svc-section") || el);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
