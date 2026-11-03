/* ============================================================
   "How it works for <industry>" walkthrough ([data-swft-flow]).
   Markup: scripts/build-service-pages.mjs. Styles: css/flow.css.

   - Industry tabs: click or Arrow/Home/End (WAI-ARIA tabs).
   - Plays the five steps; each step's bar fills, then the next step
     shows. After the last step it moves to the next industry, until
     the visitor picks a tab or a step themselves.
   - Pauses while hovered, while focus is inside, while a "Why it
     matters" note is open, while off screen or in a background tab,
     and when the visitor presses Pause. Resumes where it stopped.
   - "Why it matters": tap/click toggles the note (aria-expanded).
   - Reduced motion: no autoplay; steps change only when chosen.
   ============================================================ */
(function () {
  "use strict";
  var STEP_MS = 5200;   // keep in sync with --wf-step-ms in css/flow.css
  var HOLD_MS = 1600;   // pause on the last step before the next industry
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function setup(root) {
    var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
    var panels = tabs.map(function (t) { return document.getElementById(t.getAttribute("aria-controls")); });
    if (!tabs.length || panels.indexOf(null) !== -1) return;
    var playBtn = root.querySelector(".wf__play");
    var playLabel = root.querySelector(".wf__play-label");

    var cur = Math.max(0, tabs.findIndex(function (t) { return t.getAttribute("aria-selected") === "true"; }));
    var step = 0, timer = null, startedAt = 0, remaining = STEP_MS, userPicked = false;
    var why = {}, reasons = {}; // why: open notes; reasons: why we're paused

    root.classList.add("is-live");
    if (reduce) root.classList.add("is-static");

    function steps(i) { return panels[i].querySelectorAll(".wf__step"); }
    function moments(i) { return panels[i].querySelectorAll(".wf__moment"); }

    function paint() {
      var s = steps(cur), m = moments(cur);
      for (var j = 0; j < s.length; j++) {
        var on = j === step;
        s[j].classList.toggle("is-active", on);
        s[j].classList.toggle("is-done", j < step);
        if (on) s[j].setAttribute("aria-current", "step"); else s[j].removeAttribute("aria-current");
        m[j].classList.toggle("is-active", on);
        m[j].setAttribute("aria-hidden", on ? "false" : "true");
        // keep links/buttons in hidden cards out of the tab order
        m[j].querySelectorAll("a, button").forEach(function (el) { el.tabIndex = on ? 0 : -1; });
      }
      // restart the active bar's fill
      var bar = s[step] && s[step].querySelector(".wf__bar span");
      if (bar) { bar.style.animation = "none"; void bar.offsetWidth; bar.style.animation = ""; }
    }

    function closeWhy() {
      panels.forEach(function (p) {
        p.querySelectorAll(".wf__why-btn").forEach(function (b) {
          b.setAttribute("aria-expanded", "false");
          var n = document.getElementById(b.getAttribute("aria-controls"));
          if (n) n.classList.remove("is-open");
        });
      });
      why = {};
      delete reasons.why;
    }

    function isPaused() { return reduce || Object.keys(reasons).length > 0; }

    function schedule() {
      clearTimeout(timer); timer = null;
      root.classList.toggle("is-paused", isPaused());
      if (isPaused()) return;
      startedAt = Date.now();
      timer = setTimeout(advance, remaining);
    }

    function pause(reason) {
      if (reasons[reason]) return;
      var was = isPaused();
      reasons[reason] = true;
      if (!was && timer) { remaining = Math.max(200, remaining - (Date.now() - startedAt)); }
      schedule();
    }
    function resume(reason) {
      if (!reasons[reason]) return;
      delete reasons[reason];
      schedule();
    }

    function go(i, s, keepTimer) {
      closeWhy();
      step = s;
      remaining = STEP_MS;
      if (i !== cur) {
        tabs.forEach(function (t, k) {
          var on = k === i;
          t.setAttribute("aria-selected", on ? "true" : "false");
          t.tabIndex = on ? 0 : -1;
          panels[k].hidden = !on;
        });
        cur = i;
      }
      paint();
      if (!keepTimer) schedule();
    }

    function advance() {
      var n = steps(cur).length;
      if (step < n - 1) { go(cur, step + 1); return; }
      if (userPicked) { remaining = STEP_MS; pause("done"); setPlay(); return; }
      clearTimeout(timer);
      timer = setTimeout(function () { go((cur + 1) % tabs.length, 0); }, HOLD_MS);
    }

    function setPlay() {
      if (!playBtn) return;
      var paused = !!(reasons.user || reasons.done);
      playBtn.setAttribute("aria-pressed", paused ? "true" : "false");
      playBtn.setAttribute("aria-label", paused ? "Play the walkthrough" : "Pause the walkthrough");
      if (playLabel) playLabel.textContent = paused ? "Play" : "Pause";
    }

    // Tabs
    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { userPicked = true; delete reasons.done; go(i, 0); setPlay(); });
      t.addEventListener("keydown", function (e) {
        var k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key], to = null;
        if (k) to = (i + k + tabs.length) % tabs.length;
        else if (e.key === "Home") to = 0;
        else if (e.key === "End") to = tabs.length - 1;
        if (to === null) return;
        e.preventDefault(); userPicked = true; go(to, 0); tabs[to].focus();
      });
    });

    // Steps and "Why it matters"
    panels.forEach(function (p, pi) {
      p.querySelectorAll(".wf__step").forEach(function (b) {
        b.addEventListener("click", function () {
          userPicked = true; delete reasons.done;
          go(pi, Number(b.getAttribute("data-step")));
          setPlay();
        });
      });
      p.querySelectorAll(".wf__why-btn").forEach(function (b) {
        b.addEventListener("click", function () {
          var note = document.getElementById(b.getAttribute("aria-controls"));
          var open = b.getAttribute("aria-expanded") !== "true";
          b.setAttribute("aria-expanded", open ? "true" : "false");
          if (note) note.classList.toggle("is-open", open);
          if (open) pause("why"); else resume("why");
          try { if (open && window.posthog) window.posthog.capture("flow_why_open", { industry: tabs[cur].textContent, step: step + 1 }); } catch (err) { /* ignore */ }
        });
      });
    });

    // Play / pause
    if (playBtn && !reduce) {
      playBtn.hidden = false;
      playBtn.addEventListener("click", function () {
        if (reasons.user || reasons.done) {
          delete reasons.user;
          if (reasons.done) { delete reasons.done; userPicked = false; go(cur, step < steps(cur).length - 1 ? step : 0, true); }
          schedule();
        } else pause("user");
        setPlay();
      });
    }

    // Hover and keyboard focus pause it so people can read
    root.addEventListener("mouseenter", function () { pause("hover"); });
    root.addEventListener("mouseleave", function () { resume("hover"); });
    root.addEventListener("focusin", function () { pause("focus"); });
    root.addEventListener("focusout", function (e) { if (!root.contains(e.relatedTarget)) resume("focus"); });

    // Off screen / background tab
    if ("IntersectionObserver" in window) {
      reasons.offscreen = true;
      new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) resume("offscreen"); else pause("offscreen");
      }, { threshold: 0.35 }).observe(root);
    }
    document.addEventListener("visibilitychange", function () { if (document.hidden) pause("hidden"); else resume("hidden"); });

    go(cur, 0);
    setPlay();
  }

  function init() { Array.prototype.forEach.call(document.querySelectorAll("[data-swft-flow]"), setup); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
