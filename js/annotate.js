/* ============================================================
   Sketch annotations, drawn by hand as you scroll (css/annotate.css).
     .an-hl      highlighter swipes across the phrase
     .an-ul      pen underline is drawn left to right, then a quick second pass
     .an-circle  pen loop is drawn around the word, then a looser second loop
     .an-note    handwritten margin note drops in
   Every pen mark gets its own slightly different path, so no two look alike.
   Nothing draws until the visitor first scrolls (or after a short pause for
   marks already on screen); then each mark draws once, the first time it is
   in view. Marks entering together go top to bottom.
   Loaded by js/swft-nav.js on pages that have annotations.
   Reduced motion or no IntersectionObserver: everything is shown drawn.
   ============================================================ */
(function () {
  "use strict";
  var marks = Array.prototype.slice.call(document.querySelectorAll(".an-hl, .an-ul, .an-circle, .an-note"));
  if (!marks.length) return;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !("IntersectionObserver" in window)) return; // CSS shows them drawn

  var NS = "http://www.w3.org/2000/svg";
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function r1(n) { return Math.round(n * 10) / 10; }

  // A loose underline across a 200×14 box, with a little wobble
  function underlinePath() {
    var y = rnd(7, 9);
    return "M" + r1(rnd(1, 5)) + " " + r1(y + rnd(-1, 1)) +
      " C " + r1(rnd(35, 50)) + " " + r1(y - rnd(2, 4)) + ", " + r1(rnd(70, 90)) + " " + r1(y + rnd(2, 4)) + ", " + r1(rnd(110, 125)) + " " + r1(y + rnd(-1, 1)) +
      " S " + r1(rnd(170, 182)) + " " + r1(y - rnd(2, 4)) + ", " + r1(rnd(194, 199)) + " " + r1(y + rnd(-0.5, 1.5));
  }
  // A short flick under the end, like going back over it
  function flickPath() {
    var y = rnd(10, 12);
    return "M" + r1(rnd(60, 90)) + " " + r1(y) + " Q " + r1(rnd(120, 140)) + " " + r1(y + rnd(-2, 1)) + ", " + r1(rnd(170, 192)) + " " + r1(y - rnd(1, 3));
  }
  // An overshooting loop around a word in a 200×64 box. `loose` = second pass.
  function loopPath(loose) {
    var j = loose ? 7 : 3;
    var sx = rnd(28, 46), sy = rnd(4, 10);
    return "M" + r1(sx) + " " + r1(sy) +
      " C " + r1(86 + rnd(-j, j)) + " " + r1(rnd(-3, 2)) + ", " + r1(170 + rnd(-j, j)) + " " + r1(rnd(0, 6)) + ", " + r1(193 + rnd(-j, j / 2)) + " " + r1(23 + rnd(-j, j)) +
      " C " + r1(206 + rnd(-j, 0)) + " " + r1(41 + rnd(-j, j)) + ", " + r1(160 + rnd(-j, j)) + " " + r1(59 + rnd(-2, 3)) + ", " + r1(100 + rnd(-j, j)) + " " + r1(59 + rnd(-2, 3)) +
      " C " + r1(38 + rnd(-j, j)) + " " + r1(59 + rnd(-2, 3)) + ", " + r1(4 + rnd(-2, j)) + " " + r1(49 + rnd(-j, j)) + ", " + r1(6 + rnd(-2, j)) + " " + r1(32 + rnd(-j, j)) +
      " C " + r1(8 + rnd(-2, j)) + " " + r1(16 + rnd(-j, j)) + ", " + r1(46 + rnd(-j, j)) + " " + r1(6 + rnd(-j, 2)) + ", " + r1(sx + rnd(30, 52)) + " " + r1(sy + rnd(-4, 2));
  }

  function svg(viewBox, paths) {
    var s = document.createElementNS(NS, "svg");
    s.setAttribute("viewBox", viewBox);
    s.setAttribute("preserveAspectRatio", "none");
    s.setAttribute("aria-hidden", "true");
    s.setAttribute("focusable", "false");
    s.classList.add("an-ink");
    paths.forEach(function (p, i) {
      var el = document.createElementNS(NS, "path");
      el.setAttribute("d", p.d);
      el.setAttribute("pathLength", "1");
      el.setAttribute("class", "an-stroke" + (i ? " an-stroke--2" : ""));
      if (p.w) el.style.strokeWidth = p.w;
      s.appendChild(el);
    });
    return s;
  }

  // Pen marks that sit on one line get a real drawn SVG stroke. An underline
  // that wraps across lines keeps the CSS stroke (it wipes in instead).
  marks.forEach(function (m) {
    if (m.classList.contains("an-circle")) {
      m.classList.add("an-svg");
      m.appendChild(svg("0 0 200 64", [{ d: loopPath(false) }, { d: loopPath(true), w: "1.6px" }]));
    } else if (m.classList.contains("an-ul") && m.getClientRects().length === 1) {
      m.classList.add("an-svg");
      m.appendChild(svg("0 0 200 14", [{ d: underlinePath() }, { d: flickPath(), w: "1.8px" }]));
    }
  });

  document.documentElement.classList.add("an-js");

  function draw(el) { el.classList.add("is-drawn"); }

  var io = new IntersectionObserver(function (entries) {
    var hits = entries.filter(function (e) { return e.isIntersecting; })
      .sort(function (a, b) { return a.boundingClientRect.top - b.boundingClientRect.top; });
    hits.forEach(function (e, i) {
      io.unobserve(e.target);
      setTimeout(function () { draw(e.target); }, 140 + i * 260);
    });
  }, { rootMargin: "0px 0px -10% 0px", threshold: 0.6 });

  // Wait for the first scroll (or a short pause, for marks already on screen),
  // so the drawing happens while the visitor is watching.
  var started = false;
  function start() {
    if (started) return;
    started = true;
    window.removeEventListener("scroll", start);
    marks.forEach(function (m) { io.observe(m); });
  }
  window.addEventListener("scroll", start, { passive: true });
  setTimeout(start, 1200);

})();
