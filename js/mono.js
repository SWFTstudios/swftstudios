/* ============================================================
   Mono helpers, loaded once per page by js/swft-nav.js:
   - Booking pills ([data-mf-booking]) show the next open slot on the
     Cal.com calendar, from /api/availability.
   - [data-mf-reveal] blocks fade up as they scroll into view.
   - A ring cursor on fine pointers ([data-mf-cursor="View"] grows it).
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

  function init() {
    initRows();
    loadAvailability();
    initReveal();
    initCursor();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
