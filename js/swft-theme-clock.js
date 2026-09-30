/* ============================================================
   SWFT theme clock — live local clock + sunrise/sunset theme lerp
   Modes: auto | light | dark (cycles on toggle; persisted)
   ============================================================ */
(function () {
  var STORAGE_MODE = "swft-theme-mode";
  var STORAGE_COORDS = "swft-theme-coords";
  var TWILIGHT_MS = 50 * 60 * 1000; /* ~50 min civil twilight blend */
  var DEFAULT_COORDS = { lat: 40.7282, lng: -74.0776 }; /* Jersey City */

  var TZ_COORDS = {
    "America/New_York": { lat: 40.7282, lng: -74.0776 },
    "America/Chicago": { lat: 41.8781, lng: -87.6298 },
    "America/Denver": { lat: 39.7392, lng: -104.9903 },
    "America/Los_Angeles": { lat: 34.0522, lng: -118.2437 },
    "America/Phoenix": { lat: 33.4484, lng: -112.074 },
    "America/Anchorage": { lat: 61.2181, lng: -149.9003 },
    "Pacific/Honolulu": { lat: 21.3069, lng: -157.8583 },
    "America/Toronto": { lat: 43.6532, lng: -79.3832 },
    "America/Vancouver": { lat: 49.2827, lng: -123.1207 },
    "Europe/London": { lat: 51.5074, lng: -0.1278 },
    "Europe/Paris": { lat: 48.8566, lng: 2.3522 },
    "Europe/Berlin": { lat: 52.52, lng: 13.405 },
    "Asia/Tokyo": { lat: 35.6762, lng: 139.6503 },
    "Asia/Dubai": { lat: 25.2048, lng: 55.2708 },
    "Australia/Sydney": { lat: -33.8688, lng: 151.2093 },
    "UTC": { lat: 0, lng: 0 }
  };

  var LIGHT = {
    bg: [245, 245, 245],
    fg: [0, 0, 0],
    muted: [112, 112, 112],
    surface: [255, 255, 255],
    border: [0, 0, 0, 0.12],
    ctaBg: [0, 0, 0],
    ctaFg: [255, 255, 255],
    ghost: [0, 0, 0, 0.18]
  };
  var DARK = {
    bg: [0, 0, 0],
    fg: [255, 255, 255],
    muted: [136, 136, 136],
    surface: [17, 17, 17],
    border: [255, 255, 255, 0.14],
    ctaBg: [255, 255, 255],
    ctaFg: [0, 0, 0],
    ghost: [255, 255, 255, 0.22]
  };

  var state = {
    mode: "auto",
    coords: null,
    reduceMotion: false
  };

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, val) {
    try { localStorage.setItem(key, val); } catch (e) { /* ignore */ }
  }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }
  function clamp01(t) { return Math.max(0, Math.min(1, t)); }

  function rgb(c, t) {
    var a = LIGHT[c];
    var b = DARK[c];
    if (a.length === 4) {
      return "rgba(" +
        Math.round(lerp(a[0], b[0], t)) + "," +
        Math.round(lerp(a[1], b[1], t)) + "," +
        Math.round(lerp(a[2], b[2], t)) + "," +
        (lerp(a[3], b[3], t).toFixed(3)) + ")";
    }
    return "rgb(" +
      Math.round(lerp(a[0], b[0], t)) + "," +
      Math.round(lerp(a[1], b[1], t)) + "," +
      Math.round(lerp(a[2], b[2], t)) + ")";
  }

  /* High-contrast text: snap earlier so mid-twilight stays readable */
  function textT(t) {
    if (t < 0.35) return 0;
    if (t > 0.65) return 1;
    return easeInOut((t - 0.35) / 0.3);
  }

  /* ---- Solar calculator (NOAA-style approximation) ---- */
  function toJulian(date) {
    return date.getTime() / 86400000 + 2440587.5;
  }

  function sunTimes(date, lat, lng) {
    var rad = Math.PI / 180;
    var J = toJulian(date);
    var n = Math.ceil(J - 2451545.0009 - lng / 360);
    var Jstar = 2451545.0009 + lng / 360 + n;
    var M = (357.5291 + 0.98560028 * (Jstar - 2451545)) % 360;
    var C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
    var lambda = (M + C + 180 + 102.9372) % 360;
    var Jtransit = Jstar + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * lambda * rad);
    var sinDec = Math.sin(lambda * rad) * Math.sin(23.4397 * rad);
    var cosDec = Math.cos(Math.asin(sinDec));
    var cosH = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * sinDec) /
      (Math.cos(lat * rad) * cosDec);
    if (cosH < -1) cosH = -1;
    if (cosH > 1) cosH = 1;
    var w0 = Math.acos(cosH);
    var Jrise = Jtransit - (w0 / (2 * Math.PI));
    var Jset = Jtransit + (w0 / (2 * Math.PI));
    function fromJ(j) { return new Date((j - 2440587.5) * 86400000); }
    return { sunrise: fromJ(Jrise), sunset: fromJ(Jset) };
  }

  function nightFraction(now, coords) {
    var times = sunTimes(now, coords.lat, coords.lng);
    var rise = times.sunrise.getTime();
    var set = times.sunset.getTime();
    var t = now.getTime();

    /* Polar / invalid: fall back to clock hours */
    if (!(rise < set)) {
      var h = now.getHours() + now.getMinutes() / 60;
      if (h >= 7 && h < 19) return 0;
      return 1;
    }

    if (t >= rise + TWILIGHT_MS && t <= set - TWILIGHT_MS) return 0;
    if (t <= rise - TWILIGHT_MS || t >= set + TWILIGHT_MS) return 1;

    if (t < rise + TWILIGHT_MS && t > rise - TWILIGHT_MS) {
      /* dawn: night → day */
      return 1 - easeInOut((t - (rise - TWILIGHT_MS)) / (2 * TWILIGHT_MS));
    }
    /* dusk: day → night */
    return easeInOut((t - (set - TWILIGHT_MS)) / (2 * TWILIGHT_MS));
  }

  function resolveCoords() {
    var cached = storageGet(STORAGE_COORDS);
    if (cached) {
      try {
        var parsed = JSON.parse(cached);
        if (typeof parsed.lat === "number" && typeof parsed.lng === "number") {
          state.coords = parsed;
          return;
        }
      } catch (e) { /* ignore */ }
    }
    var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
    state.coords = TZ_COORDS[tz] || DEFAULT_COORDS;

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          state.coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          storageSet(STORAGE_COORDS, JSON.stringify(state.coords));
          applyTheme();
        },
        function () { /* keep TZ fallback */ },
        { maximumAge: 86400000, timeout: 8000, enableHighAccuracy: false }
      );
    }
  }

  function themeT() {
    if (state.mode === "light") return 0;
    if (state.mode === "dark") return 1;
    return nightFraction(new Date(), state.coords || DEFAULT_COORDS);
  }

  function applyTheme() {
    var t = clamp01(themeT());
    var tt = textT(t);
    var root = document.documentElement;
    root.style.setProperty("--theme-t", String(t));
    root.style.setProperty("--bg", rgb("bg", t));
    root.style.setProperty("--fg", rgb("fg", tt));
    root.style.setProperty("--muted", rgb("muted", tt));
    root.style.setProperty("--surface", rgb("surface", t));
    root.style.setProperty("--border", rgb("border", t));
    root.style.setProperty("--cta-bg", rgb("ctaBg", tt));
    root.style.setProperty("--cta-fg", rgb("ctaFg", tt));
    root.style.setProperty("--ghost", rgb("ghost", t));
    root.setAttribute("data-theme-mode", t >= 0.5 ? "dark" : "light");
    root.setAttribute("data-theme-pref", state.mode);
    updateToggleUI();
  }

  function formatClock(now) {
    var time = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit"
    }).format(now);
    var tzParts = new Intl.DateTimeFormat(undefined, { timeZoneName: "short" }).formatToParts(now);
    var tz = "";
    for (var i = 0; i < tzParts.length; i++) {
      if (tzParts[i].type === "timeZoneName") { tz = tzParts[i].value; break; }
    }
    return { time: time, tz: tz, iso: now.toISOString() };
  }

  function tickClock() {
    var el = document.getElementById("swft-clock");
    if (!el) return;
    var f = formatClock(new Date());
    el.setAttribute("datetime", f.iso);
    el.innerHTML =
      '<span class="sn-clock-time">' + f.time + "</span>" +
      (f.tz ? '<span class="sn-clock-tz">' + f.tz + "</span>" : "");
  }

  function updateToggleUI() {
    var btn = document.getElementById("swft-theme-toggle");
    if (!btn) return;
    var labels = { auto: "Auto", light: "Light", dark: "Dark" };
    var next = { auto: "light", light: "dark", dark: "auto" };
    btn.setAttribute("aria-label", "Theme: " + labels[state.mode] + ". Click for " + labels[next[state.mode]]);
    btn.setAttribute("data-mode", state.mode);
    btn.setAttribute("aria-pressed", state.mode === "dark" ? "true" : "false");
    var label = btn.querySelector(".sn-theme-label");
    if (label) label.textContent = labels[state.mode];
  }

  function cycleMode() {
    var order = ["auto", "light", "dark"];
    var i = order.indexOf(state.mode);
    state.mode = order[(i + 1) % order.length];
    storageSet(STORAGE_MODE, state.mode);
    applyTheme();
  }

  function wireToggle() {
    var btn = document.getElementById("swft-theme-toggle");
    if (!btn || btn._swftWired) return;
    btn._swftWired = true;
    btn.addEventListener("click", cycleMode);
  }

  function init() {
    state.reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (state.reduceMotion) document.body.classList.add("ar-reduce-motion");

    var saved = storageGet(STORAGE_MODE);
    if (saved === "light" || saved === "dark" || saved === "auto") state.mode = saved;

    resolveCoords();
    applyTheme();
    tickClock();
    wireToggle();

    setInterval(function () {
      tickClock();
      if (state.mode === "auto") applyTheme();
    }, 1000);

    /* Re-wire if nav mounts after us */
    document.addEventListener("swft:nav-ready", function () {
      tickClock();
      wireToggle();
      updateToggleUI();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.SWFTTheme = {
    getMode: function () { return state.mode; },
    setMode: function (m) {
      if (m === "auto" || m === "light" || m === "dark") {
        state.mode = m;
        storageSet(STORAGE_MODE, m);
        applyTheme();
      }
    },
    refresh: applyTheme
  };
})();
