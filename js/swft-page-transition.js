/* ============================================================
   Card → case-study hero page transition. Load in <head> (not deferred)
   on the homepage and on project case-study pages, with
   css/swft-page-transition.css.

   Links opt in with  data-cs-transition  and  data-cs-cover="/images/…"
   (the case study's cover image, prefetched so the hero is ready).

   1. Cross-document View Transitions (Chrome/Edge 126+, Safari 18.2+):
      the clicked card image gets view-transition-name "cs-hero" and the
      browser morphs it into the case study's .cs-cover image. Coming back
      (Back button), the cover morphs into the matching card again.
   2. Everywhere else: a FLIP fallback. The card image is cloned, expanded
      to fill the screen, and the page navigates; the case study then
      starts on that full-screen image and settles it into the cover slot.
   Reduced motion: plain navigation.
   ============================================================ */
(function () {
  "use strict";

  var NAME = "cs-hero";
  var KEY = "swft-cs-transition";
  var EXPAND_MS = 520;
  var SETTLE_MS = 650;
  var EASE = "cubic-bezier(0.22, 0.8, 0.2, 1)";

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var crossDoc = "onpagereveal" in window && window.CSS && CSS.supports && CSS.supports("view-transition-name: a");
  var root = document.documentElement;

  function samePath(a, b) {
    try {
      var x = new URL(a, location.href), y = new URL(b, location.href);
      return x.origin === y.origin && x.pathname.replace(/\.html$/, "") === y.pathname.replace(/\.html$/, "");
    } catch (err) { return false; }
  }

  function inView(el) {
    var r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && r.width > 0;
  }

  /* ---------------- Destination: fallback arrival on a case study ---------------- */
  var arrival = null;
  try {
    arrival = JSON.parse(sessionStorage.getItem(KEY) || "null");
    sessionStorage.removeItem(KEY);
  } catch (err) { arrival = null; }
  if (arrival && (Date.now() - arrival.t > 6000 || !samePath(arrival.href, location.href))) arrival = null;
  if (arrival && !reduce) root.classList.add("cs-arriving");

  function settleArrival() {
    var cover = document.querySelector(".cs-cover img");
    if (!arrival || !cover) { root.classList.remove("cs-arriving"); return; }
    var fly = document.createElement("img");
    fly.src = arrival.src;
    fly.alt = "";
    fly.setAttribute("aria-hidden", "true");
    fly.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;object-fit:cover;z-index:10000;pointer-events:none;margin:0";
    document.body.appendChild(fly);

    var go = function () {
      var r = cover.getBoundingClientRect();
      root.classList.remove("cs-arriving");
      root.classList.add("cs-arrived");
      var anim = fly.animate([
        { left: "0px", top: "0px", width: innerWidth + "px", height: innerHeight + "px" },
        { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" }
      ], { duration: SETTLE_MS, easing: EASE, fill: "forwards" });
      anim.onfinish = function () {
        fly.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: "forwards" }).onfinish = function () { fly.remove(); };
      };
    };
    if (cover.complete) requestAnimationFrame(go);
    else {
      cover.addEventListener("load", go, { once: true });
      cover.addEventListener("error", go, { once: true });
    }
  }

  /* ---------------- Destination & back: name the matching element on reveal ---------------- */
  if (crossDoc) {
    window.addEventListener("pagereveal", function (e) {
      if (!e.viewTransition || !window.navigation || !navigation.activation || !navigation.activation.from) return;
      var from = navigation.activation.from.url;
      // Back on the homepage: morph the case study cover into the card that links to it
      var cards = document.querySelectorAll("a[data-cs-transition]");
      var match = null;
      for (var i = 0; i < cards.length; i++) {
        if (samePath(cards[i].href, from) && inView(cards[i])) { match = cards[i]; break; }
      }
      if (!match) return;
      var img = match.querySelector("img");
      if (!img) return;
      img.style.viewTransitionName = NAME;
      e.viewTransition.finished.finally(function () { img.style.viewTransitionName = ""; });
    });
    // Leaving a page via the browser's own navigation: make sure only one element carries the name
    window.addEventListener("pageswap", function (e) {
      if (!e.viewTransition) return;
      e.viewTransition.finished.finally(function () {
        var named = document.querySelectorAll("a[data-cs-transition] img");
        for (var i = 0; i < named.length; i++) named[i].style.viewTransitionName = "";
      });
    });
  }

  /* ---------------- Source: clicks on opted-in cards ---------------- */
  var prefetched = {};
  function prefetch(a) {
    var cover = a.getAttribute("data-cs-cover");
    if (cover && !prefetched[cover]) {
      prefetched[cover] = true;
      var im = new Image();
      im.decoding = "async";
      im.src = cover;
    }
    if (!prefetched[a.href]) {
      prefetched[a.href] = true;
      var l = document.createElement("link");
      l.rel = "prefetch";
      l.href = a.href;
      document.head.appendChild(l);
    }
  }

  function expandThenGo(a, img) {
    var r = img.getBoundingClientRect();
    var fly = document.createElement("img");
    fly.src = img.currentSrc || img.src;
    fly.alt = "";
    fly.setAttribute("aria-hidden", "true");
    fly.style.cssText = "position:fixed;margin:0;object-fit:cover;z-index:10000;pointer-events:none;" +
      "left:" + r.left + "px;top:" + r.top + "px;width:" + r.width + "px;height:" + r.height + "px";
    var veil = document.createElement("div");
    veil.style.cssText = "position:fixed;inset:0;background:#010101;z-index:9999;pointer-events:none;opacity:0";
    document.body.appendChild(veil);
    document.body.appendChild(fly);

    try {
      sessionStorage.setItem(KEY, JSON.stringify({ href: a.href, src: fly.src, t: Date.now() }));
    } catch (err) { /* private mode: the destination just loads normally */ }

    veil.animate([{ opacity: 0 }, { opacity: 1 }], { duration: EXPAND_MS * 0.8, fill: "forwards" });
    var anim = fly.animate([
      { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" },
      { left: "0px", top: "0px", width: innerWidth + "px", height: innerHeight + "px" }
    ], { duration: EXPAND_MS, easing: EASE, fill: "forwards" });
    var went = false;
    var go = function () { if (!went) { went = true; location.href = a.href; } };
    anim.onfinish = go;
    setTimeout(go, EXPAND_MS + 150);
    // If the user comes Back to this page from the bfcache, remove the overlay
    window.addEventListener("pageshow", function () { fly.remove(); veil.remove(); }, { once: true });
  }

  function onDomReady() {
    if (arrival) settleArrival();

    var links = document.querySelectorAll("a[data-cs-transition]");
    if (!links.length) return;

    // Warm the covers once the cards are near the viewport
    if (window.IntersectionObserver) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { prefetch(en.target); io.unobserve(en.target); }
        });
      }, { rootMargin: "300px 0px" });
      Array.prototype.forEach.call(links, function (a) { io.observe(a); });
    }
    Array.prototype.forEach.call(links, function (a) {
      a.addEventListener("pointerenter", function () { prefetch(a); });
      a.addEventListener("pointerdown", function () { prefetch(a); });
      a.addEventListener("focus", function () { prefetch(a); });
    });

    // Bubble phase on document: runs after the carousel's own tap-to-hold handler,
    // so a first tap that the carousel cancels never starts a transition.
    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("a[data-cs-transition]");
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (reduce) return;
      var img = a.querySelector("img");
      if (!img) return;
      if (crossDoc) {
        var named = document.querySelectorAll("a[data-cs-transition] img");
        for (var i = 0; i < named.length; i++) named[i].style.viewTransitionName = "";
        img.style.viewTransitionName = NAME; // the browser morphs it on navigation
        return;
      }
      e.preventDefault();
      expandThenGo(a, img);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", onDomReady);
  else onDomReady();
})();
