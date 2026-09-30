/* ============================================================
   Homepage "Selected Work": a vanilla port of js/swft-work-stack.js
   from branch swft-araise-2027 (no GSAP / ScrollTrigger needed).
   - The section head fades out as the stacked covers scroll up over it
     (covers' top from 40% of the viewport to the top edge; the staging
     75% -> 15% window dimmed the heading while it was still being read).
   - A "View Work" circle follows the cursor over the covers (desktop only).
   ============================================================ */
(function () {
  "use strict";

  function init() {
    var wrap = document.querySelector(".ar-work-pointer-wrap");
    var works = document.querySelector(".ar-works-wrap");
    var head = document.querySelector(".ar-work-stack-head");
    var pointer = document.querySelector(".ar-pointer-work");
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var coarse = window.matchMedia("(pointer: coarse)").matches || window.matchMedia("(max-width: 900px)").matches;

    // Head fade
    if (works && head && !reduce) {
      var ticking = false;
      var fade = function () {
        ticking = false;
        var vh = window.innerHeight;
        var top = works.getBoundingClientRect().top;
        var p = (vh * 0.4 - top) / (vh * 0.4);
        p = Math.max(0, Math.min(1, p));
        head.style.opacity = (1 - p).toFixed(3);
      };
      window.addEventListener("scroll", function () {
        if (!ticking) { ticking = true; requestAnimationFrame(fade); }
      }, { passive: true });
      window.addEventListener("resize", fade);
      fade();
    }

    // Cursor circle
    if (!wrap || !pointer || reduce || coarse) return;
    var x = 0, y = 0, tx = 0, ty = 0, s = 0, ts = 0, raf = 0;
    var step = function () {
      raf = 0;
      x += (tx - x) * 0.2;
      y += (ty - y) * 0.2;
      s += (ts - s) * 0.18;
      pointer.style.transform = "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px) translate(-50%,-50%) scale(" + s.toFixed(3) + ")";
      if (Math.abs(tx - x) > 0.3 || Math.abs(ty - y) > 0.3 || Math.abs(ts - s) > 0.002) raf = requestAnimationFrame(step);
    };
    var kick = function () { if (!raf) raf = requestAnimationFrame(step); };
    wrap.addEventListener("pointerenter", function (e) {
      if (e.pointerType !== "mouse") return;
      tx = x = e.clientX; ty = y = e.clientY; ts = 1; kick();
    });
    wrap.addEventListener("pointermove", function (e) {
      if (e.pointerType !== "mouse") return;
      tx = e.clientX; ty = e.clientY; kick();
    });
    wrap.addEventListener("pointerleave", function () { ts = 0; kick(); });
    // Scrolling moves the covers under a still cursor; hide the circle until it moves again
    window.addEventListener("scroll", function () {
      if (ts && !wrap.matches(":hover")) { ts = 0; kick(); }
    }, { passive: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
