/* ============================================================
   Homepage "The Problem" tabs (css/home-pain-tabs.css).
   - Auto-plays through the pain points (data-interval ms each); the active
     tab's bar fills as it goes.
   - Holds while the pointer is over the tabs or panel, while focus is inside,
     and while the section is off screen. The Pause button stops it for good
     until pressed again. prefers-reduced-motion starts it paused.
   - Standard tabs keyboard: Left/Right (Up/Down), Home/End.
   No dependencies. Without this script every panel is shown, stacked.
   ============================================================ */
(function () {
  "use strict";

  var mqReduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

  function init(root) {
    var tablist = root.querySelector('[role="tablist"]');
    var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
    var panels = tabs.map(function (t) { return document.getElementById(t.getAttribute("aria-controls")); });
    var toggle = root.querySelector(".pain-toggle");
    if (!tablist || !tabs.length) return;

    var interval = parseInt(root.getAttribute("data-interval"), 10) || 7000;
    var current = 0;
    var elapsed = 0;
    var last = 0;
    var raf = 0;
    var paused = !!(mqReduce && mqReduce.matches);   // the user's (or OS) choice
    var hovering = false, focused = false, onScreen = true;

    root.classList.add("is-js");

    function select(i, moveFocus) {
      current = (i + tabs.length) % tabs.length;
      tabs.forEach(function (t, n) {
        var on = n === current;
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.setAttribute("tabindex", on ? "0" : "-1");
        t.style.setProperty("--p", "0");
        if (panels[n]) {
          panels[n].classList.toggle("is-active", on);
          panels[n].hidden = false;
          panels[n].setAttribute("aria-hidden", on ? "false" : "true");
          if (on) panels[n].setAttribute("tabindex", "0"); else panels[n].removeAttribute("tabindex");
        }
      });
      // Keep the active chip in view on phones without scrolling the page
      var t = tabs[current];
      if (tablist.scrollWidth > tablist.clientWidth) {
        tablist.scrollTo({ left: t.offsetLeft - 16, behavior: mqReduce && mqReduce.matches ? "auto" : "smooth" });
      }
      if (moveFocus) t.focus();
      elapsed = 0;
      paint();
    }

    function playing() { return !paused && !hovering && !focused && onScreen && !document.hidden; }

    function paint() {
      var p = paused ? 1 : Math.min(1, elapsed / interval);
      tabs[current].style.setProperty("--p", p.toFixed(4));
    }

    function frame(now) {
      raf = 0;
      if (!playing()) { last = 0; return; }
      if (last) elapsed += now - last;
      last = now;
      if (elapsed >= interval) select(current + 1, false);
      paint();
      raf = requestAnimationFrame(frame);
    }

    function kick() {
      if (!raf && playing()) { last = 0; raf = requestAnimationFrame(frame); }
      paint();
    }

    function setPaused(v) {
      paused = v;
      if (toggle) {
        toggle.setAttribute("aria-pressed", v ? "true" : "false");
        toggle.querySelector(".pain-toggle__text").textContent = v ? "Play" : "Pause";
        toggle.setAttribute("aria-label", v ? "Play the problem slides" : "Pause the problem slides");
      }
      kick();
    }

    tabs.forEach(function (t, n) {
      t.addEventListener("click", function () { select(n, false); kick(); });
    });

    tablist.addEventListener("keydown", function (e) {
      var i = current;
      switch (e.key) {
        case "ArrowRight": case "ArrowDown": i = current + 1; break;
        case "ArrowLeft": case "ArrowUp": i = current - 1; break;
        case "Home": i = 0; break;
        case "End": i = tabs.length - 1; break;
        default: return;
      }
      e.preventDefault();
      select(i, true);
    });

    // Hover holds the slides for a mouse only (touch fires enter without a matching leave)
    root.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") hovering = true; });
    root.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") { hovering = false; kick(); } });
    // Keyboard focus holds the slides; a mouse click or tap that focuses a tab doesn't.
    function keyboardFocusInside() {
      var a = document.activeElement;
      return !!(a && a !== toggle && root.contains(a) && a.matches && a.matches(":focus-visible"));
    }
    root.addEventListener("focusin", function () { focused = keyboardFocusInside(); kick(); });
    root.addEventListener("focusout", function () {
      setTimeout(function () { focused = keyboardFocusInside(); kick(); }, 0);
    });
    document.addEventListener("visibilitychange", kick);

    if (window.IntersectionObserver) {
      new IntersectionObserver(function (entries) {
        onScreen = entries[0].isIntersecting;
        kick();
      }, { threshold: 0.35 }).observe(root);
    }

    if (toggle) {
      toggle.hidden = false;
      toggle.addEventListener("click", function () { setPaused(!paused); });
    }

    select(0, false);
    setPaused(paused);
  }

  function boot() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-pain-tabs]"), function (el) {
      if (el.__painTabs) return;
      el.__painTabs = true;
      init(el);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
