/* ============================================================
   Free strategy call pop-up. Loaded on every page by js/swft-nav.js.

   When it shows (once, then it backs off):
   - after 40 seconds on a page, or
   - on desktop, when the pointer leaves through the top of the window
     (exit intent), once the visitor has been on the page 10 seconds.
   It never shows on pages that are already a booking or lead step
   (contact, booking, growth audit, portal, admin) or to reduced-data
   visitors. "Maybe later" / close hides it for 7 days; clicking the
   button hides it for 60 days. Storage failures just mean it can show
   again next visit; they never break the page.
   ?strategy=1 forces it open (for testing).
   ============================================================ */
(function () {
  "use strict";
  var BOOK_URL = "https://cal.com/swftstudios/swft-meeting";
  var KEY = "swft-strategy-call-v1";
  var DAY = 864e5;
  var SKIP = /^\/(contact|book|growth-audit|portal|admin|approve|401|404)(\b|\/|\.html|$)/;

  function get() {
    try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; }
  }
  function set(days) {
    try { localStorage.setItem(KEY, JSON.stringify({ until: Date.now() + days * DAY })); } catch (e) { /* ignore */ }
    try { sessionStorage.setItem(KEY, "1"); } catch (e) { /* ignore */ }
  }
  function snoozed() {
    try { if (sessionStorage.getItem(KEY)) return true; } catch (e) { /* ignore */ }
    var s = get();
    return !!(s && s.until > Date.now());
  }

  var forced = /[?&]strategy=1\b/.test(location.search);
  if (!forced) {
    if (SKIP.test(location.pathname)) return;
    if (navigator.connection && navigator.connection.saveData) return;
    if (snoozed()) return;
  }

  var ICON = {
    plan: '<path d="M8 4h8M9 4v2h6V4M6 6h12v14H6z"/><path d="m9 13 2 2 4-4"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'
  };
  function icon(n) {
    return '<span class="sn-mega__icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + ICON[n] + "</svg></span>";
  }
  function spark(points) {
    return '<svg class="sc-spark" viewBox="0 0 120 34" preserveAspectRatio="none" aria-hidden="true">' +
      '<path d="M0 34 ' + points + ' L120 34Z" fill="#c3cdfa" opacity=".12"/>' +
      '<path d="' + points.replace(/^/, "M") + '" fill="none" stroke="#c3cdfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>';
  }

  var shown = false, overlay, lastFocus;

  function build() {
    overlay = document.createElement("div");
    overlay.className = "sc-overlay";
    overlay.innerHTML =
      '<div class="sc-dialog" role="dialog" aria-modal="true" aria-labelledby="sc-title" aria-describedby="sc-body">' +
        '<p class="sc-tag"><span class="mf-dot" aria-hidden="true"></span>Free strategy call</p>' +
        '<button type="button" class="sc-close" aria-label="Close">×</button>' +
        '<div class="sc-tiles">' +
          '<div class="sc-tile"><p class="sc-tile__head">' + icon("clock") + 'Your time</p><p class="sc-tile__value">30 min, free</p>' + spark("0 28 L20 27 L40 24 L60 25 L80 16 L100 12 L120 4") + "</div>" +
          '<div class="sc-tile"><p class="sc-tile__head">' + icon("plan") + 'You leave with</p><p class="sc-tile__value">A written plan</p>' + spark("0 30 L20 26 L40 27 L60 20 L80 18 L100 9 L120 6") + "</div>" +
        "</div>" +
        '<h2 class="sc-title" id="sc-title">Ready for more leads and less busywork?</h2>' +
        '<p class="sc-body" id="sc-body">We&rsquo;re one team for your software, automations, marketing and content. Tell us where you&rsquo;re stuck and we&rsquo;ll map the fastest fix.</p>' +
        '<a class="mf-btn sc-go" href="' + BOOK_URL + '" target="_blank" rel="noopener">Book my free call <span class="mf-arrow" aria-hidden="true">→</span></a>' +
        '<button type="button" class="sc-later">Maybe later</button>' +
      "</div>";
    document.body.appendChild(overlay);

    overlay.querySelector(".sc-close").addEventListener("click", function () { close(7); });
    overlay.querySelector(".sc-later").addEventListener("click", function () { close(7); });
    overlay.querySelector(".sc-go").addEventListener("click", function () {
      track("strategy_popup_click");
      close(60);
    });
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(7); });
    overlay.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.preventDefault(); close(7); return; }
      if (e.key !== "Tab") return;
      var items = overlay.querySelectorAll("a, button");
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  function track(name) {
    try { if (window.posthog && window.posthog.capture) window.posthog.capture(name, { path: location.pathname }); } catch (e) { /* ignore */ }
  }

  function busy() {
    // Don't interrupt the open phone menu, the mega-menu or a typing visitor.
    var root = document.documentElement;
    if (root.classList.contains("sn-locked") || document.querySelector(".sc-overlay")) return true;
    var btn = document.getElementById("sn-menu-btn");
    if (btn && btn.getAttribute("aria-expanded") === "true") return true;
    var a = document.activeElement;
    return !!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
  }

  function open() {
    if (shown || (!forced && busy())) return;
    shown = true;
    cleanup();
    build();
    lastFocus = document.activeElement;
    document.documentElement.classList.add("sn-locked");
    requestAnimationFrame(function () { overlay.classList.add("is-open"); });
    overlay.querySelector(".sc-go").focus({ preventScroll: true });
    try { sessionStorage.setItem(KEY, "1"); } catch (e) { /* ignore */ }
    track("strategy_popup_shown");
  }

  function close(days) {
    if (!overlay) return;
    if (!forced) set(days);
    overlay.classList.remove("is-open");
    document.documentElement.classList.remove("sn-locked");
    var el = overlay;
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 320);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  var start = Date.now(), timer;
  function onLeave(e) {
    if (e.relatedTarget || e.clientY > 0) return;
    if (Date.now() - start < 10000) return;
    open();
  }
  function cleanup() {
    clearTimeout(timer);
    document.removeEventListener("mouseout", onLeave);
  }

  function arm() {
    if (forced) { open(); return; }
    timer = setTimeout(function retry() {
      if (busy()) { timer = setTimeout(retry, 5000); return; }
      open();
    }, 40000);
    if (window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      document.addEventListener("mouseout", onLeave);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arm);
  else arm();
})();
