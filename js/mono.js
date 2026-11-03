/* ============================================================
   Mono helpers, loaded once per page by js/swft-nav.js:
   - Booking pills ([data-mf-booking]) show the next open slot on the
     Cal.com calendar, from /api/availability.
   - [data-mf-reveal] blocks fade up as they scroll into view.
   - A ring cursor on fine pointers ([data-mf-cursor="View"] grows it).
   - The accent word (.mf-script, .ps-accent) is white Skylight Graffiti: its
     letters pop in with a bounce, a click changes the color, and five quick
     clicks set off a rainbow + glow burst.
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

  /* ---------- Accent word: bold, funky pen script ---------- */
  // Click = next color. Five clicks inside ~1.8s = rainbow + glow + hop that settles
  // back to the color the word had. (Mouse/touch only; the word stays plain text.)
  var ACCENT_PALETTE = ["#ffffff", "#ff5a36", "#c3cdfa", "#e9d3a6"]; // white first (default), then signal, ice, sand (css/mono.css)
  var RAPID_CLICKS = 5, RAPID_WINDOW = 1800;
  // Each letter's resting tilt (deg) and lift (em): fixed patterns, so it looks hand-placed, not random.
  var TILT = [-7, 5, -3, 8, -6, 3, -8, 6, -2, 7];
  var LIFT = [0.02, -0.04, 0.03, -0.02, 0.04, -0.03, 0.01, -0.05];

  function popLetters(letters) {
    if (reduce) return;
    letters.forEach(function (l, i) {
      if (l.animate) l.animate([{ scale: 1 }, { scale: 1.3 }, { scale: 1 }], { duration: 320, delay: i * 25, easing: "ease-out" });
    });
  }

  function bindAccentClicks(el, letters) {
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
          if (e.animationName !== "mf-glow") return; // each letter's glow ends together; the first one ends the burst
          el.classList.remove("is-rainbow");
          el.removeEventListener("animationend", done);
        };
        el.addEventListener("animationend", done);
        return;
      }
      idx = (idx + 1) % ACCENT_PALETTE.length;
      el.style.setProperty("--mf-accent-color", ACCENT_PALETTE[idx]);
      popLetters(letters);
    });
  }

  // The accent word overlaps the word before it (negative margin). When it wraps
  // to the start of a line there's nothing to overlap, so drop the overlap.
  function lastCharRect(node) {
    while (node) {
      if (node.nodeType === 3 && node.textContent.trim()) {
        var t = node.textContent.replace(/\s+$/, "");
        var r = document.createRange();
        r.setStart(node, t.length - 1);
        r.setEnd(node, t.length);
        return r.getBoundingClientRect();
      }
      if (node.nodeType === 1 && node.textContent.trim()) {
        var last = node.lastChild;
        var inner = last ? lastCharRect(last) : null;
        if (inner) return inner;
      }
      node = node.previousSibling;
    }
    return null;
  }
  function markLineStarts(words) {
    words.forEach(function (el) {
      var host = el.parentNode && el.parentNode.matches && el.parentNode.matches("[data-mf-notify]") ? el.parentNode : el;
      el.classList.remove("is-line-start");
      var prev = lastCharRect(host.previousSibling);
      var me = el.getBoundingClientRect();
      if (!prev || prev.bottom <= me.top + me.height * 0.25) el.classList.add("is-line-start");
    });
  }

  function initAccent() {
    var words = document.querySelectorAll(".mf-script, .ps-title .ps-accent");
    if (!words.length) return;
    var io = !reduce && "IntersectionObserver" in window
      ? new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (!e.isIntersecting) return;
            e.target.classList.remove("mf-funky-pre");
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          });
        }, { threshold: 0.6 })
      : null;
    var placed = [];
    words.forEach(function (el) {
      if (el.closest(".sf-wordmark") || el.classList.contains("is-funky")) return; // the logo wordmark stays as is
      placed.push(el);
      var text = el.textContent;
      if (!text.trim()) return;
      // One span per letter so each can tilt and bounce; spaces stay plain text so words still wrap.
      el.textContent = "";
      var letters = [], n = 0;
      Array.from(text).forEach(function (ch) {
        if (/\s/.test(ch)) { el.appendChild(document.createTextNode(ch)); return; }
        var l = document.createElement("span");
        l.className = "mf-l";
        l.textContent = ch;
        l.style.setProperty("--i", n);
        l.style.setProperty("--r", TILT[n % TILT.length] + "deg");
        l.style.setProperty("--y", LIFT[n % LIFT.length] + "em");
        el.appendChild(l);
        letters.push(l);
        n++;
      });
      el.classList.add("is-funky");
      bindAccentClicks(el, letters);
      if (io) {
        el.classList.add("mf-funky-pre");
        io.observe(el);
      } else {
        el.classList.add("is-in");
      }
    });
    if (!placed.length) return;
    var mark = function () { markLineStarts(placed); };
    mark();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(mark);
    var rt;
    window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(mark, 120); });
  }

  function init() {
    initRows();
    initAccent();
    loadAvailability();
    initReveal();
    initCursor();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
