/* ============================================================
   Scroll-in text animation (GSAP), site-wide.

   As text scrolls into view:
   - headings (h1-h3) rise in word by word from behind a mask
   - paragraphs, list items and eyebrow labels fade up
   Items that enter together are staggered in reading order.

   Skips anything with its own motion or interactive state (nav, the
   homepage hero copy, the About scroll highlight, Webflow interactions,
   the problem tabs, service details, audience cards, forms) and does
   nothing under prefers-reduced-motion. Uses window.gsap if the page
   already loads it, otherwise loads it from cdnjs.
   ============================================================ */
(function () {
  "use strict";

  if (!("IntersectionObserver" in window)) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var GSAP_URL = "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.4/gsap.min.js";
  var HEADINGS = "h1, h2, h3";
  var TEXT = [
    "p", "li", "blockquote",
    ".hp-section-label", ".ar-section-label", ".ps-eyebrow", ".services-eyebrow",
    ".pricing-eyebrow", ".section-tag-container", ".process-card-title", ".svc-subtitle",
  ].join(", ");
  var SKIP = [
    "#swft-nav", ".sn-nav", ".sn-panel", ".sf-footer", "header.nav_component",
    ".has-hero-ocean > .padding-global .course_content", // hero copy: the load intro animates it
    "[data-scroll-highlight]", "[data-w-id]", ".w-dyn-bind-empty",
    ".pain-tabs", ".svc-details", ".svc-featured", ".svc-pointer",
    ".hp-audience-track", ".ar-work-stack-item", ".swft-cube", ".swft-about-gallery",
    "form", ".ga-form-card", ".book-flow", "[hidden]", "[aria-hidden='true']",
    ".visually-hidden", ".w-richtext figure", "nav", ".vz",
  ].join(", ");

  function skip(el) {
    return !!el.closest(SKIP) || !el.textContent.trim();
  }

  // Wrap each word of an element's text in a mask so it can rise into view.
  // Child elements (links, accent spans, <br>) are kept; their text is split too.
  function splitWords(el) {
    var words = [];
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (child) {
        if (child.nodeType === 3) {
          var parts = child.textContent.split(/(\s+)/);
          if (parts.length < 2 && !parts[0].trim()) return;
          var frag = document.createDocumentFragment();
          parts.forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            var mask = document.createElement("span");
            mask.className = "tr-word";
            var inner = document.createElement("span");
            inner.className = "tr-word__in";
            inner.textContent = part;
            mask.appendChild(inner);
            frag.appendChild(mask);
            words.push(inner);
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === 1 && child.tagName !== "BR" && child.tagName !== "SVG") {
          walk(child);
        }
      });
    })(el);
    return words;
  }

  function injectStyles() {
    var css =
      ".tr-word{display:inline-block;overflow:hidden;vertical-align:top;padding-bottom:0.08em;margin-bottom:-0.08em}" +
      ".tr-word__in{display:inline-block;will-change:transform}";
    var style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }

  function run(gsap) {
    var all = Array.prototype.slice.call(document.querySelectorAll(HEADINGS + ", " + TEXT));
    var picked = all.filter(function (el) { return !skip(el); });
    // Don't animate something whose ancestor is already animating (e.g. a <p> inside an <li>)
    var set = new Set(picked);
    picked = picked.filter(function (el) {
      for (var p = el.parentElement; p; p = p.parentElement) if (set.has(p)) return false;
      return true;
    });
    if (!picked.length) return;
    injectStyles();

    var items = picked.map(function (el) {
      var heading = el.matches(HEADINGS);
      var words = heading ? splitWords(el) : null;
      if (heading) gsap.set(words, { yPercent: 110 });
      else gsap.set(el, { autoAlpha: 0, y: 18 });
      return { el: el, heading: heading, words: words };
    });
    var byEl = new Map(items.map(function (it) { return [it.el, it]; }));

    var queue = [];
    var flushing = false;
    function flush() {
      flushing = false;
      queue.sort(function (a, b) {
        return a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      });
      queue.forEach(function (it, i) {
        var delay = Math.min(i, 8) * 0.08;
        if (it.heading) {
          gsap.to(it.words, {
            yPercent: 0, duration: 0.95, ease: "power4.out", stagger: 0.035, delay: delay,
            onComplete: function () { gsap.set(it.words, { clearProps: "transform" }); },
          });
        } else {
          gsap.to(it.el, {
            autoAlpha: 1, y: 0, duration: 0.85, ease: "power3.out", delay: delay,
            clearProps: "transform,opacity,visibility",
          });
        }
      });
      queue = [];
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        queue.push(byEl.get(entry.target));
      });
      if (queue.length && !flushing) { flushing = true; requestAnimationFrame(flush); }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    items.forEach(function (it) { io.observe(it.el); });
  }

  function start() {
    if (window.gsap) { run(window.gsap); return; }
    var s = document.createElement("script");
    s.src = GSAP_URL;
    s.async = true;
    s.onload = function () { if (window.gsap) run(window.gsap); };
    document.head.appendChild(s);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
