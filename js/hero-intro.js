/* ============================================================
   Homepage load intro (css/hero-intro.css).

   1. Load:     cubes hold off-camera for the first 10% of the bar, then fly
                into view while the camera already starts rotating down from
                birdseye. Bar tracks real loading.
   2. Flight:   cubes spiral inward (still spinning) while the camera continues
                tilting into the hero; orbits shrink so they stay framed.
   3. Impact:   near the end the four crystal prisms join with a soft spark;
                letters clear to one white cube, which hands off to the DOM photo cube.
   4. Hand-off: the photo cube cools in; then "swft:hero-ready" fires.

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

    var MIN_LOAD_MS = 1600;     // let the letters read even on a fast connection
    var MAX_LOAD_MS = 7000;     // never hold the page longer than this
    var FLIGHT_MS = 5800;       // spiral + camera tilt after load
    var INTRO_SPIN = 120;       // deg/s on the DOM cube near handoff
    var OFF_SPREAD = 58;        // off-camera at birdseye (half-view ~44 world units)
    var VIEW_SPREAD = 18;       // on-screen corner radius under birdseye
    var LETTER_HALF = 0.42;     // mini-cube half-size
    var useLetters = !!(ocean && ocean.gl && typeof ocean.setIntroLetters === "function");

    // NW=S, NE=W, SW=F, SE=T (screen space from birdseye: +X right, +Z up-screen)
    var LETTERS = [
      { letter: 0, sx: -1, sz: 1 },
      { letter: 1, sx: 1, sz: 1 },
      { letter: 2, sx: -1, sz: -1 },
      { letter: 3, sx: 1, sz: -1 }
    ];

    var restSpin = cube ? cube.spinDps : 0;
    var start = performance.now();
    var flashEl = null;
    var finished = false;

    try { if ("scrollRestoration" in history) history.scrollRestoration = "manual"; } catch (e) { /* ignore */ }
    window.scrollTo(0, 0);
    if (cube) cube.spinDps = 0;

    // Head script's 12s failsafe is too short for load + flight; replace it.
    if (window.__swftIntroFailsafe) clearTimeout(window.__swftIntroFailsafe);
    window.__swftIntroFailsafe = setTimeout(function () { finish(); }, 20000);

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

    flashEl = document.createElement("div");
    flashEl.className = "swft-intro-flash";
    flashEl.setAttribute("aria-hidden", "true");
    document.body.appendChild(flashEl);

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

    function clamp01(x) { return Math.max(0, Math.min(1, x)); }
    function easeInOutCubic(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
    function easeInOutSine(x) { return -(Math.cos(Math.PI * x) - 1) / 2; }
    function easeOutQuart(x) { return 1 - Math.pow(1 - x, 4); }
    function easeInQuad(x) { return x * x; }
    function phase(x, a, b) { return clamp01((x - a) / (b - a)); }
    function set(name, value) { root.style.setProperty(name, value); }

    function cubeCenter() {
      if (!ocean || !ocean.cube) return { x: 0, y: 0.8, z: 8 };
      return { x: ocean.cube[0], y: ocean.cube[1], z: ocean.cube[2] };
    }

    // Map flight progress (0..1) onto angle covering 3 orbits with
    // durations in a 4:2:1 ratio (each orbit ~2× faster than the last).
    function swirlAngle(p) {
      var parts = [4 / 7, 2 / 7, 1 / 7];
      var t = clamp01(p);
      var acc = 0, angle = 0;
      for (var i = 0; i < 3; i++) {
        var end = acc + parts[i];
        if (t <= end || i === 2) {
          var local = clamp01((t - acc) / parts[i]);
          angle += local * Math.PI * 2;
          break;
        }
        angle += Math.PI * 2;
        acc = end;
      }
      return angle;
    }

    function buildLetterCubes(radius, orbitExtra, spinDeg, halfScale, flash) {
      var c = cubeCenter();
      var half = LETTER_HALF * (halfScale == null ? 1 : halfScale);
      var cubes = [];
      for (var i = 0; i < LETTERS.length; i++) {
        var L = LETTERS[i];
        var base = Math.atan2(L.sz, L.sx);
        var ang = base + orbitExtra;
        cubes.push({
          x: c.x + Math.cos(ang) * radius,
          y: c.y,
          z: c.z + Math.sin(ang) * radius,
          half: half,
          rx: spinDeg * 0.55 + i * 17,
          ry: spinDeg + i * 40,
          rz: spinDeg * 0.25 - i * 11,
          letter: L.letter
        });
      }
      return { cubes: cubes, flash: flash || 0 };
    }

    // camK: optional introCam 0..1; omit to leave cam unchanged (load hold).
    function pushLetters(state, camK) {
      if (!useLetters || !ocean) return;
      ocean.setIntroLetters(state);
      ocean.intro = 1;
      ocean.introShowCube = 1;
      if (camK != null) ocean.introCam = camK;
      ocean.redraw();
    }

    function clearLetters() {
      if (!useLetters || !ocean) return;
      ocean.setIntroLetters(null);
    }

    function setFlash(v) {
      var f = clamp01(v);
      set("--intro-flash", f.toFixed(4));
      if (ocean) ocean.introFlash = f;
    }

    function measureHero() {
      root.classList.remove("swft-intro");
      var r = oceanEl.getBoundingClientRect();
      root.classList.add("swft-intro");
      return { top: r.top, left: r.left, w: r.width, h: r.height };
    }

    // ---------- Load: hold off-cam 0–10%, then fly-in with view already tilting ----------
    var loadSpin = 0;
    var loadLast = 0;
    var shown = 0;
    var loadOrbit = 0;
    var loadCam = 0; // introCam carried into flight()

    function loadFrame(now) {
      if (document.hidden) {
        loadLast = 0;
        requestAnimationFrame(loadFrame);
        return;
      }
      if (!loadLast) loadLast = now;
      var dt = Math.min(50, now - loadLast);
      loadLast = now;
      loadSpin += dt * 0.045;

      var elapsed = now - start;
      var done = tasks.filter(function (t) { return t.done; }).length;
      var target = tasks.length ? done / tasks.length : 1;
      target = Math.min(target, elapsed / MIN_LOAD_MS);
      if (elapsed > MAX_LOAD_MS) target = 1;
      shown += (target - shown) * 0.12;
      if (target === 1 && shown > 0.995) shown = 1;
      ui.style.setProperty("--p", shown.toFixed(4));
      var pct = Math.round(shown * 100);
      pctEl.textContent = pct + "%";
      ui.setAttribute("aria-valuenow", String(pct));

      if (useLetters) {
        var radius;
        var orbit = 0;
        var cam = 0;
        if (shown < 0.1) {
          // 0–10%: hold off-camera, top-down.
          radius = OFF_SPREAD;
          loadCam = 0;
        } else {
          // 10–100%: fly into view while the camera already starts rotating down.
          var fly = easeOutQuart(phase(shown, 0.1, 1));
          radius = OFF_SPREAD + (VIEW_SPREAD - OFF_SPREAD) * fly;
          // Mild tilt during fly-in so the view is already rotating (not still birdseye).
          cam = easeInOutCubic(fly) * 0.32;
          loadCam = cam;
          loadOrbit += dt * 0.00035 * (0.4 + fly);
          orbit = loadOrbit;
          loadSpin += dt * 0.02 * fly;
          // Keep cubes framed as the view starts to tip.
          radius *= (1 - 0.2 * cam);
        }
        pushLetters(buildLetterCubes(radius, orbit, loadSpin, 1, 0), cam);
      }

      if (shown >= 1) {
        ui.classList.add("is-leaving");
        setTimeout(useLetters ? flight : zoomOnly, 250);
        return;
      }
      requestAnimationFrame(loadFrame);
    }
    requestAnimationFrame(loadFrame);

    // ---------- Flight: continue tilt from loadCam + spiral in-frame ----------
    function flight() {
      var elapsed = 0;
      var last = 0;
      var spin = loadSpin;
      var to = measureHero();
      var from = { top: 0, left: 0, w: window.innerWidth, h: window.innerHeight };
      var lettersCleared = false;
      var startCam = loadCam || 0;
      // Full-bleed until late frame-in; don't drop z-index early (that exposed the black hero chrome).
      if (cube) cube.spinDps = INTRO_SPIN;

      function frame(now) {
        if (document.hidden) {
          last = 0;
          requestAnimationFrame(frame);
          return;
        }
        if (!last) last = now;
        var dt = Math.min(50, now - last);
        last = now;
        elapsed += dt;

        var p = clamp01(elapsed / FLIGHT_MS);
        spin += dt * (0.1 + 0.55 * p);

        // Spiral from on-screen VIEW_SPREAD → centre (expo orbits over most of flight).
        var spiralP = Math.min(1, p / 0.88);
        var baseRadius = VIEW_SPREAD * (1 - easeInQuad(spiralP));
        var orbit = swirlAngle(spiralP) + loadOrbit;

        // Continue rotating the view from wherever load left off → hero.
        var cam = startCam + (1 - startCam) * easeInOutCubic(phase(p, 0, 0.92));
        // Shrink orbits as the camera tilts so spinning cubes stay framed.
        var radius = baseRadius * (1 - 0.35 * cam);

        // Keep the scene full-bleed while cubes fly/spiral; only frame into the
        // hero slot at the end (early frame-in was the black left overlay).
        var frameIn = easeInOutCubic(phase(p, 0.88, 0.99));
        set("--intro-top", (from.top + (to.top - from.top) * frameIn).toFixed(2) + "px");
        set("--intro-left", (from.left + (to.left - from.left) * frameIn).toFixed(2) + "px");
        set("--intro-w", (from.w + (to.w - from.w) * frameIn).toFixed(2) + "px");
        set("--intro-h", (from.h + (to.h - from.h) * frameIn).toFixed(2) + "px");
        set("--intro-fades", frameIn.toFixed(3));
        if (frameIn > 0.02) root.classList.add("swft-intro--zoom");

        // Soft crystalline click at join (capped — full whiteout stalls mid-tier GPUs).
        var impact = phase(p, 0.86, 1);
        var flash = 0;
        if (impact > 0 && impact < 1) {
          flash = Math.sin(Math.PI * clamp01((impact - 0.05) / 0.5));
          flash = Math.max(0, flash) * 0.32;
        }
        setFlash(flash);

        var handoff = easeInOutSine(phase(p, 0.9, 0.97));
        var white = 1 - easeInOutCubic(phase(p, 0.92, 1));
        set("--intro-dom", handoff.toFixed(3));
        set("--intro-white", white.toFixed(3));

        if (impact >= 0.35) {
          if (!lettersCleared) {
            clearLetters();
            lettersCleared = true;
          }
          if (ocean) {
            ocean.introCam = cam;
            ocean.introShowCube = 1 - handoff;
            ocean.intro = white;
            ocean.introFlash = flash;
            ocean.layout();
            ocean.redraw();
          }
        } else {
          pushLetters(buildLetterCubes(radius, orbit, spin, 1, flash), cam);
          if (ocean) ocean.layout();
        }

        if (cube) {
          cube.spinDps = restSpin + (INTRO_SPIN - restSpin) * (1 - easeOutQuart(p));
        }

        if (p >= 1) {
          setFlash(0);
          finish();
          return;
        }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }

    // Fallback when WebGL letters aren't available: camera descent only.
    function zoomOnly() {
      clearLetters();
      setFlash(0);
      var to = measureHero();
      var from = { top: 0, left: 0, w: window.innerWidth, h: window.innerHeight };
      var t0 = performance.now();
      var ZOOM_MS = 3600;
      root.classList.add("swft-intro--zoom");

      function frame(now) {
        var x = clamp01((now - t0) / ZOOM_MS);
        var cam = easeInOutCubic(phase(x, 0, 0.86));
        var frameIn = easeInOutCubic(phase(x, 0.32, 0.94));
        set("--intro-top", (from.top + (to.top - from.top) * frameIn).toFixed(2) + "px");
        set("--intro-left", (from.left + (to.left - from.left) * frameIn).toFixed(2) + "px");
        set("--intro-w", (from.w + (to.w - from.w) * frameIn).toFixed(2) + "px");
        set("--intro-h", (from.h + (to.h - from.h) * frameIn).toFixed(2) + "px");
        set("--intro-fades", frameIn.toFixed(3));
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
      if (finished) return;
      finished = true;
      ["--intro-top", "--intro-left", "--intro-w", "--intro-h", "--intro-dom", "--intro-white", "--intro-fades", "--intro-flash"]
        .forEach(function (n) { root.style.removeProperty(n); });
      root.classList.remove("swft-intro", "swft-intro--zoom");
      root.classList.add("swft-intro-done");
      if (cube) cube.spinDps = restSpin;
      if (ocean) {
        clearLetters();
        ocean.intro = 0;
        ocean.introCam = null;
        ocean.introShowCube = 0;
        ocean.introFlash = 0;
        ocean.layout();
        ocean.redraw();
      }
      if (ui && ui.parentNode) ui.parentNode.removeChild(ui);
      if (flashEl && flashEl.parentNode) flashEl.parentNode.removeChild(flashEl);
      try { sessionStorage.setItem("swft-intro-seen", "1"); } catch (e) { /* private mode */ }
      if (window.__swftIntroFailsafe) clearTimeout(window.__swftIntroFailsafe);
      if (!document.body.classList.contains("hero-ready")) {
        document.body.classList.add("hero-ready");
        window.dispatchEvent(new CustomEvent("swft:hero-ready"));
      }
    }
  }
})();
