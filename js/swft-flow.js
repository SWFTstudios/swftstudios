/* ============================================================
   "How it works for <industry>" walkthrough ([data-swft-flow]).
   Markup comes from scripts/build-service-pages.mjs; styles from
   css/flow.css.
   - Tabs: click, or Arrow/Home/End keys (WAI-ARIA tabs pattern).
   - Animation: the line fills node by node, each card un-blurs and
     gets its check, then after a pause the next industry plays.
     Auto-advance stops for good once the visitor picks a tab.
   - Plays only while on screen and the tab is visible.
   - Reduced motion: no animation, every step shows as done.
   ============================================================ */
(function () {
  "use strict";
  var STEP_MS = 1500;   // time on each step
  var HOLD_MS = 3800;   // pause on the finished flow before the next industry
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function setup(root) {
    var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
    var panels = tabs.map(function (t) { return document.getElementById(t.getAttribute("aria-controls")); });
    if (!tabs.length || panels.indexOf(null) !== -1) return;

    var current = Math.max(0, tabs.findIndex(function (t) { return t.getAttribute("aria-selected") === "true"; }));
    var step = -1, timer = null, visible = false, userPicked = false;

    function stepsOf(i) { return panels[i].querySelectorAll(".sf-flow__step"); }

    function paint() {
      var steps = stepsOf(current), n = steps.length;
      for (var j = 0; j < n; j++) {
        steps[j].classList.toggle("is-done", j < step || step >= n);
        steps[j].classList.toggle("is-active", j === step && step < n);
      }
      var fill = panels[current].querySelector(".sf-flow__fill");
      if (fill) {
        var reached = Math.min(Math.max(step, 0), n - 1);
        var pct = n > 1 ? (reached / (n - 1)) * 100 + "%" : "100%";
        fill.style.width = pct;
        fill.style.setProperty("--sf-fill", pct);
      }
    }

    function stop() { clearTimeout(timer); timer = null; }

    function tick() {
      var n = stepsOf(current).length;
      step += 1;
      paint();
      if (step < n) {
        timer = setTimeout(tick, STEP_MS);
      } else if (!userPicked) {
        timer = setTimeout(function () { select((current + 1) % tabs.length, false); }, HOLD_MS);
      } else {
        timer = null; // finished; stays complete until another tab is picked
      }
    }

    function play() {
      stop();
      if (reduce || !visible || document.hidden) return;
      tick();
    }

    function select(i, byUser, focus) {
      if (byUser) userPicked = true;
      tabs.forEach(function (t, k) {
        var on = k === i;
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
        panels[k].hidden = !on;
      });
      current = i;
      if (focus) tabs[i].focus();
      // keep the chosen tab in view when the tab row scrolls (phones)
      var row = tabs[i].parentNode;
      if (row && row.scrollWidth > row.clientWidth) {
        row.scrollTo({ left: tabs[i].offsetLeft - row.clientWidth / 2 + tabs[i].offsetWidth / 2, behavior: reduce ? "auto" : "smooth" });
      }
      step = reduce ? Infinity : -1;
      paint();
      play();
    }

    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { select(i, true); });
      t.addEventListener("keydown", function (e) {
        var k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        var to = null;
        if (k) to = (i + k + tabs.length) % tabs.length;
        else if (e.key === "Home") to = 0;
        else if (e.key === "End") to = tabs.length - 1;
        if (to === null) return;
        e.preventDefault();
        select(to, true, true);
      });
    });

    if (reduce) { step = Infinity; paint(); return; }

    root.classList.add("is-playing");
    paint();

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        var was = visible;
        visible = entries[0].isIntersecting;
        if (visible && !was) { step = -1; paint(); play(); }
        else if (!visible) stop();
      }, { threshold: 0.35 }).observe(root);
    } else {
      visible = true;
      play();
    }
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop();
      else if (visible && !timer) play();
    });
  }

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-swft-flow]"), setup);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
