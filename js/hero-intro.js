/* ============================================================
   Homepage load intro (css/hero-intro.css).

   1. Load:     a birdseye shot straight down over the dark sea; in the centre
                a small cube of white light spins (the spark of ideas in a
                dark sea). The bar tracks real loading (fonts, first-face
                photos, the ocean's first frame, window load).
   2. Descent:  the WebGL camera falls from high overhead in an arc,
                tilting up to the horizon until it lands on the hero camera,
                while the full-screen shot frames into its hero slot.
                js/swft-ocean.js draws the cube itself during the move
                (introCam / introShowCube), since the DOM cube can't be seen
                from above.
   3. Hand-off: the white WebGL cube cross-fades to the DOM cube (also white),
                which cools into the photos; then "swft:hero-ready" fires so
                the hero copy animates in.

   Runs only when the inline <head> script set html.swft-intro (first visit
   per session, motion allowed, no #hash). Needs js/swft-cube.js and
   js/swft-ocean.js to have initialised first.
   ============================================================ */
(function () {
  "use strict";

  var root = document.documentElement;
  if (!root.classList.contains("swft-intro")) return;

  // swft-cube.js and swft-ocean.js set up on DOMContentLoaded; their listeners
  // were registered first, so by the time this runs both instances exist.
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", main);
  else main();

  function main() {
    var oceanEl = document.querySelector(".home-hero-ocean");
    var cubeEl = oceanEl && oceanEl.querySelector("[data-swft-cube]");
    var ocean = oceanEl && oceanEl.__swftOcean;
    var cube = cubeEl && cubeEl.__swftCube;
    if (!oceanEl || !cubeEl) { finish(); return; }

    var MIN_LOAD_MS = 1600;     // let the spin read even on a fast connection
    var MAX_LOAD_MS = 7000;     // never hold the page longer than this
    var ZOOM_MS = 3600;      // the descent
    var INTRO_SPIN = 120;       // deg/s while loading
    var restSpin = cube ? cube.spinDps : 0;
    var start = performance.now();

    try { if ("scrollRestoration" in history) history.scrollRestoration = "manual"; } catch (e) { /* ignore */ }
    window.scrollTo(0, 0);
    if (cube) cube.spinDps = INTRO_SPIN;

    // ---------- Loading UI ----------
    var ui = document.createElement("div");
    ui.className = "swft-intro-ui";
    ui.setAttribute("role", "progressbar");
    ui.setAttribute("aria-label", "Loading SWFT Studios");
    ui.setAttribute("aria-valuemin", "0");
    ui.setAttribute("aria-valuemax", "100");
    ui.innerHTML =
      '<div class="swft-intro-ui__brand">SWFT <span>STUDIOS</span></div>' +
      '<div class="swft-intro-ui__track"><div class="swft-intro-ui__bar"></div></div>' +
      '<div class="swft-intro-ui__meta"><span>Loading</span><span class="swft-intro-ui__pct">0%</span></div>';
    document.body.appendChild(ui);
    var pctEl = ui.querySelector(".swft-intro-ui__pct");

    // ---------- Real progress ----------
    var tasks = [];
    function track(promise) {
      var t = { done: false };
      tasks.push(t);
      Promise.resolve(promise).then(function () { t.done = true; }, function () { t.done = true; });
    }
    if (document.fonts && document.fonts.ready) track(document.fonts.ready);
    Array.prototype.forEach.call(cubeEl.querySelectorAll('img[loading="eager"]'), function (img) {
      track(img.decode ? img.decode() : new Promise(function (r) { img.complete ? r() : img.addEventListener("load", r); }));
    });
    track(new Promise(function (r) {
      if (ocean && ocean.ready) r();
      else document.addEventListener("swftocean:ready", r, { once: true });
    }));
    track(new Promise(function (r) {
      if (document.readyState === "complete") r();
      else window.addEventListener("load", r, { once: true });
    }));

    var shown = 0;
    function loadFrame(now) {
      var elapsed = now - start;
      var done = tasks.filter(function (t) { return t.done; }).length;
      var target = tasks.length ? done / tasks.length : 1;
      // The bar can't outrun the minimum show time, and creeps while waiting.
      target = Math.min(target, elapsed / MIN_LOAD_MS);
      if (elapsed > MAX_LOAD_MS) target = 1;
      shown += (target - shown) * 0.12;
      if (target === 1 && shown > 0.995) shown = 1;
      ui.style.setProperty("--p", shown.toFixed(4));
      var pct = Math.round(shown * 100);
      pctEl.textContent = pct + "%";
      ui.setAttribute("aria-valuenow", String(pct));
      if (shown >= 1) {
        ui.classList.add("is-leaving");
        setTimeout(zoom, 250);
        return;
      }
      requestAnimationFrame(loadFrame);
    }
    requestAnimationFrame(loadFrame);

    // ---------- Cinematic descent into the hero ----------
    function measureHero() {
      // Where the scene sits in the hero, measured with the intro styles off.
      root.classList.remove("swft-intro");
      var r = oceanEl.getBoundingClientRect();
      root.classList.add("swft-intro");
      return { top: r.top, left: r.left, w: r.width, h: r.height };
    }

    function easeInOutCubic(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
    function easeInOutSine(x) { return -(Math.cos(Math.PI * x) - 1) / 2; }
    function easeOutQuart(x) { return 1 - Math.pow(1 - x, 4); }
    function clamp01(x) { return Math.max(0, Math.min(1, x)); }
    function phase(x, a, b) { return clamp01((x - a) / (b - a)); }
    function set(name, value) { root.style.setProperty(name, value); }

    function zoom() {
      var to = measureHero();
      var from = { top: 0, left: 0, w: window.innerWidth, h: window.innerHeight };
      var t0 = performance.now();
      root.classList.add("swft-intro--zoom");

      function frame(now) {
        var x = clamp01((now - t0) / ZOOM_MS);
        // 1. The camera falls from the birdseye shot and tilts up to the horizon.
        var cam = easeInOutCubic(phase(x, 0, 0.86));
        // 2. Partway down, the full-screen shot starts framing into the hero slot.
        var frameIn = easeInOutCubic(phase(x, 0.32, 0.94));
        set("--intro-top", (from.top + (to.top - from.top) * frameIn).toFixed(2) + "px");
        set("--intro-left", (from.left + (to.left - from.left) * frameIn).toFixed(2) + "px");
        set("--intro-w", (from.w + (to.w - from.w) * frameIn).toFixed(2) + "px");
        set("--intro-h", (from.h + (to.h - from.h) * frameIn).toFixed(2) + "px");
        set("--intro-fades", frameIn.toFixed(3));
        // 3. Once the camera has landed, the white cube hands over to the photo cube and cools.
        var handoff = easeInOutSine(phase(x, 0.8, 0.9));
        var white = 1 - easeInOutCubic(phase(x, 0.86, 1));
        set("--intro-dom", handoff.toFixed(3));
        set("--intro-white", white.toFixed(3));
        if (ocean) {
          ocean.introCam = cam;
          ocean.introShowCube = 1 - handoff;
          ocean.intro = white;
          ocean.layout();
          ocean.redraw();
        }
        if (cube) cube.spinDps = restSpin + (INTRO_SPIN - restSpin) * (1 - easeOutQuart(x));
        if (x < 1) requestAnimationFrame(frame);
        else finish();
      }
      requestAnimationFrame(frame);
    }

    // ---------- Hand-off ----------
    function finish() {
      ["--intro-top", "--intro-left", "--intro-w", "--intro-h", "--intro-dom", "--intro-white", "--intro-fades"]
        .forEach(function (n) { root.style.removeProperty(n); });
      root.classList.remove("swft-intro", "swft-intro--zoom");
      root.classList.add("swft-intro-done");
      if (cube) cube.spinDps = restSpin;
      if (ocean) { ocean.intro = 0; ocean.introCam = null; ocean.introShowCube = 0; ocean.layout(); ocean.redraw(); }
      if (ui && ui.parentNode) ui.parentNode.removeChild(ui);
      try { sessionStorage.setItem("swft-intro-seen", "1"); } catch (e) { /* private mode */ }
      if (window.__swftIntroFailsafe) clearTimeout(window.__swftIntroFailsafe);
      if (!document.body.classList.contains("hero-ready")) {
        document.body.classList.add("hero-ready");
        window.dispatchEvent(new CustomEvent("swft:hero-ready"));
      }
    }
  }
})();
