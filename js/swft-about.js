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
     straight away; keyboard focus on a card holds the carousel until it leaves.
     Drag / swipe (mouse, touch, pen) or a sideways trackpad swipe moves it by
     hand; on release it keeps the fling's speed and direction, then glides
     back to its default speed. A drag never opens or holds a card. */
  var SPEED_DESKTOP = 70;  // px per second
  var SPEED_MOBILE = 50;
  var HOLD_MS = 3000;
  var EASE_OUT_S = 0.18;   // time constant to glide to a stop
  var EASE_IN_S = 0.9;     // time constant to ramp back up (gradual resume)
  var GLIDE_S = 1.1;       // time constant for a fling to settle back to default speed
  var DRAG_SLOP = 6;       // px before a press becomes a drag (below this it's a tap)
  var MAX_FLING = 4000;    // px per second

  function initCarousel(gallery) {
    var track = gallery.querySelector(".swft-about-gallery__track");
    if (!track || reducedMotion()) return;
    var cards = Array.prototype.slice.call(track.querySelectorAll(".swft-about-gallery__card"));
    var half = cards.length / 2;
    if (!half || half % 1) return;

    gallery.classList.add("is-js"); // turns off the CSS fallback animation

    var x = 0, v = 0, setW = 0, last = 0, raf = 0;
    var held = null, holdUntil = 0, focused = false, visible = true, pointerType = "";
    var drag = null, gliding = false, suppressClick = false, wheelAt = 0;

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
      if (!drag) {
        var target = held || focused ? 0 : speed();
        var tau = gliding ? GLIDE_S : (target < v ? EASE_OUT_S : EASE_IN_S);
        v += (target - v) * (1 - Math.exp(-dt / tau));
        if (gliding && Math.abs(target - v) < 2) gliding = false;
        x += v * dt;
      }
      paint();
      raf = requestAnimationFrame(frame);
    }
    function paint() {
      if (setW > 0) {
        x = ((x % setW) + setW) % setW; // wrap both ways
        track.style.transform = "translate3d(" + (-x).toFixed(2) + "px,0,0)";
      }
    }
    function start() {
      if (!raf) raf = requestAnimationFrame(frame);
    }
    function fling(vel) {
      v = Math.max(-MAX_FLING, Math.min(MAX_FLING, vel));
      gliding = true;
      release(); // a swipe replaces any tap-hold
      start();
    }

    /* ---- Drag / swipe ---- */
    track.addEventListener("pointerdown", function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      drag = null;
      suppressClick = false;
      var p = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, t: e.timeStamp, samples: [], active: false };
      var onMove = function (ev) {
        if (ev.pointerId !== p.id) return;
        var dx = ev.clientX - p.x0, dy = ev.clientY - p.y0;
        if (!p.active) {
          if (Math.abs(dx) < DRAG_SLOP) return;
          if (Math.abs(dy) > Math.abs(dx)) { cleanup(); return; } // vertical: let the page scroll
          p.active = true;
          drag = p;
          gallery.classList.add("is-dragging");
          try { track.setPointerCapture(p.id); } catch (err) { /* not capturable */ }
        }
        ev.preventDefault();
        x -= ev.clientX - p.x;
        p.x = ev.clientX;
        p.samples.push({ x: ev.clientX, t: ev.timeStamp });
        while (p.samples.length > 2 && ev.timeStamp - p.samples[0].t > 100) p.samples.shift();
        paint();
      };
      var onUp = function (ev) {
        if (ev.pointerId !== p.id) return;
        if (p.active) {
          suppressClick = true; // the click that follows a drag must not open or hold a card
          var sm = p.samples, vel = 0;
          if (sm.length > 1) {
            var a = sm[0], b = sm[sm.length - 1];
            var dt = (b.t - a.t) / 1000;
            if (dt > 0 && ev.timeStamp - b.t < 80) vel = -(b.x - a.x) / dt; // stale samples = stopped
          }
          drag = null;
          gallery.classList.remove("is-dragging");
          fling(vel);
        }
        cleanup();
      };
      var cleanup = function () {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    });
    // Swallow the click after a drag before the card, hold or page-transition handlers see it
    track.addEventListener("click", function (e) {
      if (!suppressClick) return;
      suppressClick = false;
      e.preventDefault();
      e.stopImmediatePropagation();
    }, true);
    // No native image / link dragging while swiping with a mouse
    track.addEventListener("dragstart", function (e) { e.preventDefault(); });

    /* ---- Trackpad sideways swipe ---- */
    gallery.addEventListener("wheel", function (e) {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // vertical: page scroll
      e.preventDefault();
      var now = e.timeStamp, dt = wheelAt ? Math.max(0.008, Math.min(0.1, (now - wheelAt) / 1000)) : 0.016;
      wheelAt = now;
      var dx = e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX;
      x += dx;
      paint();
      fling(v * 0.5 + (dx / dt) * 0.5);
    }, { passive: false });

    track.addEventListener("pointerdown", function (e) { pointerType = e.pointerType; }, true);
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
