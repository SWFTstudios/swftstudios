/* ============================================================
   Homepage About: word-by-word scroll highlight + work carousel.
   Splits [data-scroll-highlight] into words; they start dim and light up,
   in reading order, from when the element's top reaches 75% of the viewport
   height until its bottom reaches 35% (the swft2027 ScrollTrigger window). No dependencies. Links and <strong> keep working.
   ============================================================ */
(function () {
  "use strict";

  // Same window as the swft2027 ScrollTrigger: start "top 75%", end "bottom 35%"
  var START = 0.75; // element top at 75% of viewport height: first word lights
  var END = 0.35;   // element bottom at 35%: every word lit

  function reducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  // Wrap each word of every text node in a span, leaving elements (a, strong) in place.
  function split(el) {
    var words = [];
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      var parts = node.nodeValue.split(/(\s+)/);
      var frag = document.createDocumentFragment();
      parts.forEach(function (part) {
        if (!part) return;
        if (/^\s+$/.test(part)) {
          frag.appendChild(document.createTextNode(part));
          return;
        }
        var span = document.createElement("span");
        span.className = "swft-about__word";
        span.textContent = part;
        frag.appendChild(span);
        words.push(span);
      });
      node.parentNode.replaceChild(frag, node);
    });
    return words;
  }

  function init() {
    var targets = document.querySelectorAll("[data-scroll-highlight]");
    if (!targets.length || reducedMotion()) return;

    var items = Array.prototype.map.call(targets, function (el) {
      var words = split(el);
      el.classList.add("is-ready");
      return { el: el, words: words, lit: -1 };
    });

    var ticking = false;
    function update() {
      ticking = false;
      var vh = window.innerHeight || document.documentElement.clientHeight;
      items.forEach(function (item) {
        var r = item.el.getBoundingClientRect();
        // top travels from vh*START down to (vh*END - height) over the window
        var p = (vh * START - r.top) / Math.max(1, vh * (START - END) + r.height);
        p = Math.max(0, Math.min(1, p));
        var count = Math.round(p * item.words.length);
        if (count === item.lit) return;
        item.lit = count;
        for (var i = 0; i < item.words.length; i++) {
          item.words[i].classList.toggle("is-lit", i < count);
        }
      });
    }
    function onScroll() {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();
  }

  /* ---------- Work carousel ([data-about-carousel]) ----------
     Loops continuously at a steady speed. Touch: the first tap on a card holds
     the carousel for HOLD_MS and shows the project; a second tap on that card
     during the hold opens it. When the hold ends the carousel eases back up to
     speed from where it stopped. Mouse clicks and Enter open the project
     straight away; keyboard focus on a card holds the carousel until it leaves. */
  var SPEED_DESKTOP = 70;  // px per second
  var SPEED_MOBILE = 50;
  var HOLD_MS = 3000;
  var EASE_OUT_S = 0.18;   // time constant to glide to a stop
  var EASE_IN_S = 0.9;     // time constant to ramp back up (gradual resume)

  function initCarousel(gallery) {
    var track = gallery.querySelector(".swft-about-gallery__track");
    if (!track || reducedMotion()) return;
    var cards = Array.prototype.slice.call(track.querySelectorAll(".swft-about-gallery__card"));
    var half = cards.length / 2;
    if (!half || half % 1) return;

    gallery.classList.add("is-js"); // turns off the CSS fallback animation

    var x = 0, v = 0, setW = 0, last = 0, raf = 0;
    var held = null, holdUntil = 0, focused = false, visible = true, pointerType = "";

    function speed() {
      return window.matchMedia("(max-width: 767px)").matches ? SPEED_MOBILE : SPEED_DESKTOP;
    }
    function measure() {
      setW = cards[half].offsetLeft - cards[0].offsetLeft; // one full set incl. its gap
    }
    function release() {
      if (held) held.classList.remove("is-held");
      held = null;
    }
    function hold(card) {
      release();
      held = card;
      card.classList.add("is-held");
      holdUntil = performance.now() + HOLD_MS;
    }

    function frame(now) {
      raf = 0;
      if (!visible || document.hidden) { last = 0; return; }
      var dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      if (held && now >= holdUntil) release();
      var target = held || focused ? 0 : speed();
      var tau = target < v ? EASE_OUT_S : EASE_IN_S;
      v += (target - v) * (1 - Math.exp(-dt / tau));
      if (setW > 0) {
        x = (x + v * dt) % setW;
        track.style.transform = "translate3d(" + (-x).toFixed(2) + "px,0,0)";
      }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (!raf) raf = requestAnimationFrame(frame);
    }

    track.addEventListener("pointerdown", function (e) { pointerType = e.pointerType; });
    track.addEventListener("click", function (e) {
      var card = e.target.closest(".swft-about-gallery__card");
      var type = pointerType;
      pointerType = "";
      if (!card || (type !== "touch" && type !== "pen")) return; // mouse / keyboard: open it
      if (card === held && performance.now() < holdUntil) return; // second tap: open it
      e.preventDefault();
      hold(card);
    });
    // Only keyboard focus holds the loop; a tap also focuses the link, and that
    // hold is handled (and timed) by the tap itself.
    track.addEventListener("focusin", function (e) {
      focused = !!(e.target.matches && e.target.matches(":focus-visible"));
    });
    track.addEventListener("focusout", function () { focused = false; });

    if (window.IntersectionObserver) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) start();
      }).observe(gallery);
    }
    document.addEventListener("visibilitychange", function () { if (!document.hidden) start(); });
    window.addEventListener("resize", measure);
    window.addEventListener("load", measure);

    measure();
    v = speed(); // already moving when it first comes into view
    start();
  }

  function initAll() {
    init();
    Array.prototype.forEach.call(document.querySelectorAll("[data-about-carousel]"), initCarousel);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initAll);
  else initAll();
})();
