/* ============================================================
   Homepage About: word-by-word scroll highlight.
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

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
