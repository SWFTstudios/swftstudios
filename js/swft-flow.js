/* ============================================================
   "How it works for <industry>" workflow map ([data-swft-flow]).
   Markup: scripts/build-service-pages.mjs. Styles: css/flow.css.

   Plays one customer through the five steps. Time runs as a float
   t = 0 … n: each step dwells, then the spark travels along the journey
   line to the next node. Every frame writes
     --wf-pos  spark position on the line (0 … n-1)
     --wf-p    overall progress 0 … 1 (fills the S W F T letters)
   When t reaches n the walkthrough is complete ("T" lands), holds, then
   moves to the next industry until the visitor picks something.

   - Tabs: click, Arrow/Home/End (WAI-ARIA tabs), sliding pill indicator.
   - Nodes: click to jump. Phones: swipe the card left/right.
   - Pauses while hovered, focused, off screen, in a background tab, and
     when the visitor presses Pause. Resumes where it stopped.
   - Reduced motion: no autoplay; steps change only when chosen.
   ============================================================ */
(function () {
  "use strict";
  var STEP_MS = 4200;   // dwell + travel per step
  var TRAVEL = 0.24;    // last 24% of each step is the spark moving on
  var HOLD_MS = 2200;   // pause on "Transformation" before the next industry
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function ease(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }

  function setup(root) {
    var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
    var panels = tabs.map(function (t) { return document.getElementById(t.getAttribute("aria-controls")); });
    if (!tabs.length || panels.indexOf(null) !== -1) return;
    var ind = root.querySelector(".wf__tabs-ind");
    var tablist = root.querySelector(".wf__tabs");
    var playBtn = root.querySelector(".wf__play");
    var playLabel = root.querySelector(".wf__play-label");
    var n = panels[0].querySelectorAll(".wf__node").length;

    var cur = Math.max(0, tabs.findIndex(function (t) { return t.getAttribute("aria-selected") === "true"; }));
    var t = 0, active = -1, last = 0, raf = 0, holdTimer = null, userPicked = false;
    var reasons = {}, pendingNext = false;

    root.classList.add("is-live");

    function nodes(i) { return panels[i].querySelectorAll(".wf__node"); }
    function notes(i) { return panels[i].querySelectorAll(".wf__note"); }

    function moveIndicator() {
      if (!ind) return;
      var tab = tabs[cur];
      ind.style.width = tab.offsetWidth + "px";
      ind.style.transform = "translateX(" + tab.offsetLeft + "px)";
      // keep the selected pill in view when the menu scrolls (phones)
      if (tablist && tablist.scrollWidth > tablist.clientWidth) {
        var target = tab.offsetLeft - (tablist.clientWidth - tab.offsetWidth) / 2;
        tablist.scrollTo({ left: target, behavior: reduce ? "auto" : "smooth" });
      }
    }

    function render() {
      var step = Math.min(n - 1, Math.floor(t));
      var frac = t - Math.floor(t);
      var pos = step;
      if (t < n - 1 && frac > 1 - TRAVEL) pos = step + ease((frac - (1 - TRAVEL)) / TRAVEL);
      if (t >= n - 1) pos = n - 1;
      root.style.setProperty("--wf-pos", pos.toFixed(4));
      root.style.setProperty("--wf-p", Math.min(1, t / n).toFixed(4));
      root.classList.toggle("is-complete", t >= n);
      if (step !== active) {
        var dir = step >= active ? "24px" : "-24px";
        root.style.setProperty("--wf-dir", dir);
        active = step;
        var ns = nodes(cur), no = notes(cur);
        for (var j = 0; j < ns.length; j++) {
          var on = j === step;
          ns[j].classList.toggle("is-active", on);
          ns[j].classList.toggle("is-done", j < step || (t >= n && j === step));
          var dot = ns[j].querySelector(".wf__dot");
          if (on) dot.setAttribute("aria-current", "step"); else dot.removeAttribute("aria-current");
          if (no[j]) no[j].classList.toggle("is-active", on);
        }
      }
      if (t >= n) {
        var end = nodes(cur)[n - 1];
        if (end) end.classList.add("is-done");
      }
    }

    function isPaused() { return reduce || Object.keys(reasons).length > 0; }

    function frame(now) {
      raf = 0;
      if (isPaused()) return;
      var dt = Math.min(100, now - last); last = now;
      t = Math.min(n, t + dt / STEP_MS);
      render();
      if (t >= n) { finish(); return; }
      raf = requestAnimationFrame(frame);
    }

    function schedule() {
      root.classList.toggle("is-paused", isPaused());
      if (isPaused() || raf || holdTimer || t >= n) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }

    function finish() {
      if (userPicked) { pause("done"); setPlay(); return; }
      holdTimer = setTimeout(function () {
        holdTimer = null;
        if (isPaused()) { pendingNext = true; return; }
        go((cur + 1) % tabs.length, 0);
      }, HOLD_MS);
    }

    function pause(reason) {
      if (reasons[reason]) return;
      reasons[reason] = true;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      root.classList.add("is-paused");
    }
    function resume(reason) {
      if (!reasons[reason]) return;
      delete reasons[reason];
      if (!isPaused() && pendingNext) { pendingNext = false; go((cur + 1) % tabs.length, 0); return; }
      schedule();
    }

    function go(i, s) {
      clearTimeout(holdTimer); holdTimer = null; pendingNext = false;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (i !== cur) {
        tabs.forEach(function (tab, k) {
          var on = k === i;
          tab.setAttribute("aria-selected", on ? "true" : "false");
          tab.tabIndex = on ? 0 : -1;
          panels[k].hidden = !on;
        });
        // clear the old panel's states
        Array.prototype.forEach.call(nodes(cur), function (el) { el.classList.remove("is-active", "is-done"); });
        cur = i;
        moveIndicator();
      }
      t = s; active = -1;
      render();
      schedule();
    }

    function setPlay() {
      if (!playBtn) return;
      var paused = !!(reasons.user || reasons.done);
      playBtn.setAttribute("aria-pressed", paused ? "true" : "false");
      playBtn.setAttribute("aria-label", paused ? "Play the walkthrough" : "Pause the walkthrough");
      if (playLabel) playLabel.textContent = reasons.done ? "Replay" : paused ? "Play" : "Pause";
    }

    function pick(i, s) { userPicked = true; delete reasons.done; go(i, s); setPlay(); }

    // Tabs
    tabs.forEach(function (tab, i) {
      tab.addEventListener("click", function () { pick(i, 0); });
      tab.addEventListener("keydown", function (e) {
        var k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key], to = null;
        if (k) to = (i + k + tabs.length) % tabs.length;
        else if (e.key === "Home") to = 0;
        else if (e.key === "End") to = tabs.length - 1;
        if (to === null) return;
        e.preventDefault(); pick(to, 0); tabs[to].focus();
      });
    });

    // Nodes + swipe between steps on phones
    panels.forEach(function (p, pi) {
      p.querySelectorAll(".wf__dot").forEach(function (b) {
        b.addEventListener("click", function () { pick(pi, Number(b.getAttribute("data-step"))); });
      });
      var steps = p.querySelector(".wf__steps"), x0 = null, y0 = 0;
      steps.addEventListener("pointerdown", function (e) { if (e.pointerType !== "mouse") { x0 = e.clientX; y0 = e.clientY; } });
      steps.addEventListener("pointerup", function (e) {
        if (x0 === null) return;
        var dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
        if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
        var s = Math.min(n - 1, Math.floor(t)) + (dx < 0 ? 1 : -1);
        if (s < 0 || s > n - 1) return;
        pick(pi, s);
      });
      steps.addEventListener("pointercancel", function () { x0 = null; });
    });

    // Play / pause / replay
    if (playBtn && !reduce) {
      playBtn.hidden = false;
      playBtn.addEventListener("click", function () {
        if (reasons.done) { delete reasons.done; delete reasons.user; userPicked = false; go(cur, 0); }
        else if (reasons.user) { delete reasons.user; schedule(); }
        else pause("user");
        setPlay();
      });
    }

    // Hover and keyboard focus pause it so people can read
    root.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") pause("hover"); });
    root.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") resume("hover"); });
    root.addEventListener("focusin", function (e) { if (e.target.matches(":focus-visible")) pause("focus"); });
    root.addEventListener("focusout", function (e) { if (!root.contains(e.relatedTarget)) resume("focus"); });

    if ("IntersectionObserver" in window) {
      reasons.offscreen = true;
      new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) resume("offscreen"); else pause("offscreen");
      }, { threshold: 0.3 }).observe(root);
    }
    document.addEventListener("visibilitychange", function () { if (document.hidden) pause("hidden"); else resume("hidden"); });
    window.addEventListener("resize", moveIndicator);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(moveIndicator);

    moveIndicator();
    go(cur, 0);
    setPlay();
  }

  function init() { Array.prototype.forEach.call(document.querySelectorAll("[data-swft-flow]"), setup); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
