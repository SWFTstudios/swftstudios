/* ============================================================
   Notification badge on the hero's "booked." ([data-mf-notify]).
   Loaded by js/swft-nav.js only on pages that have the marker.

   A red "1" badge sits on the corner of the word like an unread
   notification. Clicking it opens a pop-up: a phone-style notification
   ("New customer booked…") and the pitch for the Free SWFT Growth Guide,
   "Imagine that was a new customer." Uses the strategy pop-up's
   dialog styles (.sc-* in css/swft-nav.css).
   ============================================================ */
(function () {
  "use strict";
  var AUDIT_URL = "/growth-guide.html";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // What the imaginary notification says. One is picked per open, in turn.
  var PINGS = [
    { app: "Bookings", title: "New customer booked", text: "Kitchen remodel consult · Thu 10:00 AM" },
    { app: "Orders", title: "New order · $480", text: "2 items · paid with Apple Pay" },
    { app: "Messages", title: "New lead from your website", text: "“Are you free this Saturday?”" }
  ];
  var HEADS = [
    "Imagine that was a new customer.",
    "Imagine that ping was a sale.",
    "Imagine that was a new lead."
  ];

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }

  var overlay = null, lastFocus = null, turn = 0;

  function open() {
    if (overlay) return;
    var p = PINGS[turn % PINGS.length];
    var head = HEADS[turn % HEADS.length];
    turn++;
    lastFocus = document.activeElement;
    overlay = document.createElement("div");
    overlay.className = "sc-overlay";
    overlay.innerHTML =
      '<div class="sc-dialog" role="dialog" aria-modal="true" aria-labelledby="nb-title" aria-describedby="nb-body">' +
        '<p class="sc-tag"><span class="mf-dot" aria-hidden="true"></span>You&rsquo;ve got 1 new notification</p>' +
        '<button type="button" class="sc-close" aria-label="Close">×</button>' +
        '<div class="nb-ping" role="img" aria-label="Example notification: ' + esc(p.title) + ", " + esc(p.text) + '">' +
          '<span class="nb-ping__app" aria-hidden="true">S</span>' +
          '<span class="nb-ping__body"><span class="nb-ping__row"><b>' + esc(p.app) + '</b><span>now</span></span>' +
          '<span class="nb-ping__title">' + esc(p.title) + '</span>' +
          '<span class="nb-ping__text">' + esc(p.text) + "</span></span>" +
        "</div>" +
        '<h2 class="sc-title" id="nb-title">' + esc(head) + "</h2>" +
        '<p class="sc-body" id="nb-body">That ping should be your phone, every day. The Free SWFT Growth Guide walks you through your website, content and follow-up in a few minutes, so you know what to fix first.</p>' +
        '<a class="mf-btn sc-go" href="' + AUDIT_URL + '">Get the free guide <span class="mf-arrow" aria-hidden="true">→</span></a>' +
        '<button type="button" class="sc-later">Maybe later</button>' +
      "</div>";
    document.body.appendChild(overlay);
    document.documentElement.classList.add("sn-locked");
    requestAnimationFrame(function () { if (overlay) overlay.classList.add("is-open"); });

    overlay.querySelector(".sc-close").addEventListener("click", close);
    overlay.querySelector(".sc-later").addEventListener("click", close);
    overlay.querySelector(".sc-go").addEventListener("click", function () { track("notify_badge_audit_click"); });
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    overlay.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key !== "Tab") return;
      var items = overlay.querySelectorAll("a, button");
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    overlay.querySelector(".sc-go").focus({ preventScroll: true });
    track("notify_badge_open");
  }

  function close() {
    if (!overlay) return;
    var el = overlay;
    overlay = null;
    el.classList.remove("is-open");
    document.documentElement.classList.remove("sn-locked");
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, reduce ? 0 : 320);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  function track(name) {
    try { if (window.posthog && window.posthog.capture) window.posthog.capture(name, { path: location.pathname }); } catch (e) { /* ignore */ }
  }

  function init() {
    document.querySelectorAll("[data-mf-notify]").forEach(function (host) {
      if (host.querySelector(".mf-notif")) return;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "mf-notif";
      b.setAttribute("aria-label", "1 new notification. Open it");
      b.setAttribute("aria-haspopup", "dialog");
      b.innerHTML = '<span aria-hidden="true">1</span>';
      b.addEventListener("click", function (e) {
        e.stopPropagation(); // the accent word's own click changes its color
        b.classList.add("is-seen");
        open();
      });
      host.appendChild(b);
      // Arrive just after the word pops in
      setTimeout(function () { b.classList.add("is-in"); }, reduce ? 0 : 900);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
