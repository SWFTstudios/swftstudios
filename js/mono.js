/* ============================================================
   Mono helpers, loaded once per page by js/swft-nav.js:
   - Booking pills ([data-mf-booking]) show the next open slot on the
     Cal.com calendar, from /api/availability.
   - [data-mf-reveal] blocks fade up as they scroll into view.
   - A ring cursor on fine pointers ([data-mf-cursor="View"] grows it).
   - The accent word (.mf-script, .ps-accent) is sprayed on like colored
     graffiti with overspray and paint drips when it scrolls into view.
   ============================================================ */
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Booking availability ---------- */
  var CACHE_KEY = "swft-availability-v1";
  var DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function label(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "";
    var today = new Date();
    var tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    if (d.toDateString() === today.toDateString()) return "today";
    if (d.toDateString() === tomorrow.toDateString()) return "tomorrow";
    return DAY[d.getDay()] + " " + MONTH[d.getMonth()] + " " + d.getDate();
  }

  function paint(data) {
    var pills = document.querySelectorAll("[data-mf-booking]");
    if (!pills.length || !data || !data.ok) return;
    var when = data.next ? label(data.next) : "";
    pills.forEach(function (pill) {
      var slot = pill.querySelector("[data-mf-next]");
      if (!slot) return;
      if (when) {
        slot.textContent = " · Next opening " + when;
        pill.setAttribute("title", "Next open call on our calendar: " + new Date(data.next).toLocaleString());
      } else if (data.next === null) {
        slot.textContent = " · Join the waitlist";
      }
    });
  }

  function loadAvailability() {
    if (!document.querySelector("[data-mf-booking]")) return;
    try {
      var cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
      if (cached && Date.now() - cached.t < 10 * 60 * 1000) { paint(cached.d); return; }
    } catch (e) { /* storage blocked: fetch instead */ }
    if (!window.fetch) return;
    fetch("/api/availability", { headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return;
        paint(d);
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), d: d })); } catch (e) { /* ignore */ }
      })
      .catch(function () { /* keep "Booking now" */ });
  }

  /* ---------- Reveal ---------- */
  function initReveal() {
    var items = document.querySelectorAll("[data-mf-reveal]");
    if (!items.length) return;
    if (reduce || !("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("is-in");
        io.unobserve(e.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    // Only blocks below the fold animate, so nothing already on screen
    // blinks out when this script arrives.
    var fold = window.innerHeight;
    items.forEach(function (el) {
      if (el.getBoundingClientRect().top < fold) return;
      el.classList.add("mf-pre");
      io.observe(el);
    });
  }

  /* ---------- Cursor ---------- */
  function initCursor() {
    if (reduce || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (!document.querySelector("[data-mf-cursor]")) return;
    var c = document.createElement("div");
    c.className = "mf-cursor";
    c.setAttribute("aria-hidden", "true");
    document.body.appendChild(c);
    var x = 0, y = 0, cx = 0, cy = 0, raf = 0;
    function loop() {
      cx += (x - cx) * 0.22; cy += (y - cy) * 0.22;
      c.style.transform = "translate(" + cx + "px," + cy + "px)";
      raf = Math.abs(x - cx) + Math.abs(y - cy) > 0.3 ? requestAnimationFrame(loop) : 0;
    }
    document.addEventListener("pointermove", function (e) {
      x = e.clientX; y = e.clientY;
      c.classList.add("is-on");
      var t = e.target.closest && e.target.closest("[data-mf-cursor]");
      c.classList.toggle("is-view", !!t);
      if (t) c.setAttribute("data-label", t.getAttribute("data-mf-cursor") || "View");
      if (!raf) raf = requestAnimationFrame(loop);
    }, { passive: true });
    document.addEventListener("pointerleave", function () { c.classList.remove("is-on"); });
  }

  /* ---------- Expanding rows (services list) ---------- */
  function initRows() {
    document.querySelectorAll("button.mf-row[aria-controls]").forEach(function (btn) {
      var panel = document.getElementById(btn.getAttribute("aria-controls"));
      if (!panel) return;
      btn.addEventListener("click", function () {
        var open = btn.getAttribute("aria-expanded") === "true";
        btn.setAttribute("aria-expanded", open ? "false" : "true");
        panel.hidden = open;
      });
    });
    // Deep links like /services.html#web-design open that service
    var id = location.hash.slice(1);
    var target = id && document.getElementById(id);
    var row = target && target.querySelector && target.querySelector("button.mf-row[aria-controls]");
    if (row && row.getAttribute("aria-expanded") === "false") row.click();
  }

  /* ---------- Spray-paint accent word ---------- */
  function sprayFilter() {
    if (document.getElementById("mf-spray-rough")) return;
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
    // Rough, sprayed edges (displacement) plus fine grain (speckle holes).
    svg.innerHTML =
      '<filter id="mf-spray-rough" x="-8%" y="-12%" width="116%" height="130%" color-interpolation-filters="sRGB">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" result="warp"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="warp" scale="4" xChannelSelector="R" yChannelSelector="G" result="rough"/>' +
      '<feTurbulence type="fractalNoise" baseFrequency="1.9" numOctaves="1" seed="3" result="grain"/>' +
      '<feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -9 6.4" result="holes"/>' +
      '<feComposite in="rough" in2="holes" operator="in"/>' +
      "</filter>" +
      // Overspray: random speckle (no regular dot grid) so the blurred halo looks like mist.
      '<filter id="mf-spray-speckle" x="-10%" y="-20%" width="120%" height="140%" color-interpolation-filters="sRGB">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="11" result="dots"/>' +
      '<feColorMatrix in="dots" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -14 8.2" result="specks"/>' +
      '<feComposite in="SourceGraphic" in2="specks" operator="in"/>' +
      "</filter>";
    document.body.appendChild(svg);
  }

  // Click = next spray color. Five clicks inside ~1.8s = rainbow + glow burst that settles
  // back to the color the word had. (Mouse/touch only; the word stays plain text for readers.)
  var SPRAY_PALETTE = ["#ff2e93", "#ff7a18", "#ffd400", "#2ee6a6", "#2fa8ff", "#b14aed"];
  var RAPID_CLICKS = 5, RAPID_WINDOW = 1800;

  function puff(el, ink) {
    if (reduce || !el.animate) return;
    try {
      el.animate(
        [{ opacity: 0.85, transform: "scale(1.06)" }, { opacity: 1, transform: "scale(1.18)" }, { opacity: 0.85, transform: "scale(1.06)" }],
        { duration: 450, easing: "ease-out", pseudoElement: "::before" }
      );
    } catch (e) { /* older browsers: the color change alone is fine */ }
    ink.animate([{ filter: "brightness(1)" }, { filter: "brightness(1.35)" }, { filter: "brightness(1)" }], { duration: 300, easing: "ease-out" });
  }

  function bindSprayClicks(el, ink) {
    if (el.closest("a, button")) return; // never hijack a link or button
    var idx = 0, hits = [];
    el.addEventListener("click", function (ev) {
      ev.stopPropagation();
      if (el.classList.contains("is-rainbow")) return; // let the burst finish
      var now = Date.now();
      hits = hits.filter(function (t) { return now - t < RAPID_WINDOW; });
      hits.push(now);
      if (!reduce && hits.length >= RAPID_CLICKS) {
        hits = [];
        el.classList.add("is-rainbow");
        var done = function (e) {
          if (e && e.animationName !== "mf-rainbow") return;
          el.classList.remove("is-rainbow");
          ink.removeEventListener("animationend", done);
        };
        ink.addEventListener("animationend", done);
        return;
      }
      idx = (idx + 1) % SPRAY_PALETTE.length;
      el.style.setProperty("--mf-spray-color", SPRAY_PALETTE[idx]);
      puff(el, ink);
    });
  }

  function initSpray() {
    var words = document.querySelectorAll(".mf-script, .ps-title .ps-accent");
    if (!words.length) return;
    sprayFilter();
    var io = !reduce && "IntersectionObserver" in window
      ? new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (!e.isIntersecting) return;
            e.target.classList.remove("mf-spray-pre");
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          });
        }, { threshold: 0.6 })
      : null;
    var n = 0;
    words.forEach(function (el) {
      if (el.closest(".sf-wordmark") || el.classList.contains("is-spray")) return; // the logo wordmark stays pen script
      var text = el.textContent;
      if (!text.trim()) return;
      var ink = document.createElement("span");
      ink.className = "mf-spray__ink";
      ink.textContent = text;
      el.setAttribute("data-spray", text); // feeds the overspray ::before
      el.textContent = "";
      el.appendChild(ink); // the real text stays in the page, once, for readers and search
      // 2-3 drips, spread along the word, with staggered timing
      var drips = text.trim().length < 5 ? 2 : 3;
      for (var i = 0; i < drips; i++) {
        var d = document.createElement("i");
        d.className = "mf-drip";
        d.setAttribute("aria-hidden", "true");
        var xPct = 14 + (i * 72) / drips + ((n + i * 7) % 5) * 3;
        d.style.setProperty("--x", xPct.toFixed(0) + "%");
        d.style.setProperty("--len", (0.26 + (((n + i * 3) % 4) * 0.1)).toFixed(2) + "em");
        d.style.setProperty("--delay", (1.0 + i * 0.28 + (n % 3) * 0.1).toFixed(2) + "s");
        d.style.setProperty("--dur", (1.3 + ((i + n) % 3) * 0.35).toFixed(2) + "s");
        el.appendChild(d);
      }
      el.classList.add("is-spray");
      bindSprayClicks(el, ink);
      if (io) {
        el.classList.add("mf-spray-pre");
        io.observe(el);
      } else {
        el.classList.add("is-in");
      }
      n++;
    });
  }

  function init() {
    initRows();
    initSpray();
    loadAvailability();
    initReveal();
    initCursor();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
