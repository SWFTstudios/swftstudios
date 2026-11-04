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
   - Vertical rail: the track runs from the first icon to the last; while a
     step plays, the fill and its runner travel down to the next icon.
   - (i) and "Why it matters" open a pop-up (template .wf__pop-tpl) with why
     the step matters and links to related blogs, services and case studies.
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

    // Track: from the first icon's centre to the last one's, in the visible panel
    function layoutTrack() {
      var wrap = panels[cur].querySelector(".wf__rail-wrap");
      var track = wrap && wrap.querySelector(".wf__track");
      var dots = wrap ? wrap.querySelectorAll(".wf__dot") : [];
      if (!track || dots.length < 2) return;
      var base = wrap.getBoundingClientRect();
      var a = dots[0].getBoundingClientRect(), b = dots[dots.length - 1].getBoundingClientRect();
      track.style.top = (a.top + a.height / 2 - base.top) + "px";
      track.style.height = Math.max(0, b.top + b.height / 2 - (a.top + a.height / 2)) + "px";
      track.style.left = (a.left + a.width / 2 - base.left - 1) + "px";
    }
    function fillEl() { return panels[cur].querySelector(".wf__fill"); }
    function span() {
      var n = steps(cur).length, last = n - 1;
      var from = last ? (step / last) * 100 : 100;
      return { from: from, to: step >= last ? 100 : ((step + 1) / last) * 100 };
    }
    // Paused: freeze where it is. Playing: glide to the next icon over the time left.
    function setFill(reset) {
      var f = fillEl();
      if (!f) return;
      var r = span(), total = f.parentNode.getBoundingClientRect().height;
      var now = reset || !total ? r.from : (f.getBoundingClientRect().height / total) * 100;
      if (now < r.from - 0.5 || now > r.to + 0.5) now = r.from;
      f.style.transition = "none";
      f.style.height = now + "%";
      if (isPaused() || reduce) return;
      void f.offsetHeight;
      f.style.transition = "height " + remaining + "ms linear";
      f.style.height = r.to + "%";
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
      setFill(false);
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
        layoutTrack();
      }
      paint();
      setFill(true);
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
    });

    // Pop-up: (i) on a step or "Why it matters" on the card
    var overlay = null, lastFocus = null;
    function closePop() {
      if (!overlay) return;
      var o = overlay; overlay = null;
      o.classList.remove("is-open");
      document.documentElement.classList.remove("sn-locked");
      setTimeout(function () { o.remove(); }, 250);
      resume("pop");
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }
    function openPop(id) {
      var tpl = root.querySelector('.wf__pop-tpl[data-pop="' + id + '"]');
      if (!tpl) return;
      closePop();
      lastFocus = document.activeElement;
      pause("pop");
      overlay = document.createElement("div");
      overlay.className = "sc-overlay";
      var dialog = document.createElement("div");
      dialog.className = "sc-dialog wf-pop";
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-labelledby", "wf-pop-title");
      dialog.innerHTML = '<button type="button" class="sc-close" aria-label="Close">\u00d7</button>' + tpl.innerHTML;
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      document.documentElement.classList.add("sn-locked");
      requestAnimationFrame(function () { if (overlay) overlay.classList.add("is-open"); });
      overlay.addEventListener("click", function (e) { if (e.target === overlay || e.target.closest(".sc-close")) closePop(); });
      var close = dialog.querySelector(".sc-close"); if (close) close.focus({ preventScroll: true });
      try { if (window.SWFTAnalytics) window.SWFTAnalytics.track("method_popup_open", { step: id }); } catch (err) { /* ignore */ }
    }
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && overlay) closePop(); });
    root.querySelectorAll("button[data-pop]").forEach(function (b) {
      b.addEventListener("click", function (e) { e.preventDefault(); openPop(b.getAttribute("data-pop")); });
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
      }, { threshold: 0.12 }).observe(root);
    }
    document.addEventListener("visibilitychange", function () { if (document.hidden) pause("hidden"); else resume("hidden"); });

    var rt;
    window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(layoutTrack, 120); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layoutTrack);
    layoutTrack();
    go(cur, 0);
    setPlay();
  }

  function init() { Array.prototype.forEach.call(document.querySelectorAll("[data-swft-flow]"), setup); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
