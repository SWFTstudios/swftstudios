/* ============================================================
   Draws the notebook annotations (css/annotate.css) in as they scroll into
   view: the highlighter swipes across, the pen underline and circle are
   drawn, margin notes drop in. Marks in the same block go one after another.
   Loaded by js/swft-nav.js only on pages that have annotations.
   Reduced motion or no IntersectionObserver: everything is shown at once.
   ============================================================ */
(function () {
  "use strict";
  var marks = document.querySelectorAll(".an-hl, .an-ul, .an-circle, .an-note");
  if (!marks.length) return;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !("IntersectionObserver" in window)) return; // CSS shows them drawn

  document.documentElement.classList.add("an-js");

  var io = new IntersectionObserver(function (entries) {
    // Stagger marks that enter together, top to bottom
    var hits = entries.filter(function (e) { return e.isIntersecting; })
      .sort(function (a, b) { return a.boundingClientRect.top - b.boundingClientRect.top; });
    hits.forEach(function (e, i) {
      io.unobserve(e.target);
      setTimeout(function () { e.target.classList.add("is-drawn"); }, 120 + i * 220);
    });
  }, { rootMargin: "0px 0px -12% 0px", threshold: 0.6 });

  marks.forEach(function (m) { io.observe(m); });
})();
