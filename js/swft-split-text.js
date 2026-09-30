/* ============================================================
   SWFT char splitter + ScrollTrigger letter reveals
   data-split="scrub"  — letters appear as user scrolls section
   data-split="enter"  — stagger once when scrolled into view
   Preserves nested strong / .ghost / a / span wrappers.
   ============================================================ */
(function (global) {
  function reduceMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function wrapTextNode(textNode) {
    var text = textNode.nodeValue;
    if (!text) return;
    var frag = document.createDocumentFragment();
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      var span = document.createElement("span");
      span.className = "ar-char" + (ch === " " || ch === "\n" || ch === "\t" ? " ar-char--space" : "");
      span.textContent = ch === " " ? "\u00A0" : ch;
      span.setAttribute("aria-hidden", "true");
      frag.appendChild(span);
    }
    textNode.parentNode.replaceChild(frag, textNode);
  }

  function walk(node) {
    if (node.nodeType === 3) {
      if (node.nodeValue && node.nodeValue.replace(/\s/g, "").length === 0) {
        /* keep pure whitespace text nodes as single space char for layout */
        if (node.nodeValue.length) wrapTextNode(node);
        return;
      }
      wrapTextNode(node);
      return;
    }
    if (node.nodeType !== 1) return;
    var tag = node.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "BR") return;
    var children = Array.prototype.slice.call(node.childNodes);
    for (var i = 0; i < children.length; i++) walk(children[i]);
  }

  function splitElement(el) {
    if (el.getAttribute("data-split-done") === "1") return;
    var accessible = el.textContent;
    el.setAttribute("aria-label", accessible);
    walk(el);
    el.setAttribute("data-split-done", "1");
    el.classList.add("is-split");
  }

  function charsOf(el) {
    return el.querySelectorAll(".ar-char");
  }

  function setupScrub(el, gsap, ScrollTrigger) {
    var chars = charsOf(el);
    if (!chars.length) return;
    gsap.set(chars, { opacity: 0, y: 12 });
    gsap.to(chars, {
      opacity: 1,
      y: 0,
      ease: "none",
      stagger: { each: 0.02, from: "start" },
      scrollTrigger: {
        trigger: el,
        start: "top 85%",
        end: "top 25%",
        scrub: 0.6
      }
    });
  }

  function setupEnter(el, gsap, ScrollTrigger) {
    var chars = charsOf(el);
    if (!chars.length) return;
    gsap.set(chars, { opacity: 0, y: "0.35em" });
    gsap.to(chars, {
      opacity: 1,
      y: 0,
      duration: 0.45,
      ease: "power2.out",
      stagger: 0.018,
      scrollTrigger: {
        trigger: el,
        start: "top 88%",
        toggleActions: "play none none none"
      }
    });
  }

  function init(options) {
    options = options || {};
    var gsap = options.gsap || global.gsap;
    var ScrollTrigger = options.ScrollTrigger || global.ScrollTrigger;
    var root = options.root || document;

    if (reduceMotion()) {
      root.querySelectorAll("[data-split]").forEach(function (el) {
        el.classList.add("is-reduced");
      });
      return { skipped: true };
    }

    if (!gsap || !ScrollTrigger) {
      return { skipped: true, reason: "gsap-missing" };
    }

    gsap.registerPlugin(ScrollTrigger);

    root.querySelectorAll("[data-split]").forEach(function (el) {
      var mode = el.getAttribute("data-split") || "enter";
      splitElement(el);
      if (mode === "scrub") setupScrub(el, gsap, ScrollTrigger);
      else setupEnter(el, gsap, ScrollTrigger);
    });

    ScrollTrigger.refresh();
    return { skipped: false };
  }

  global.SWFTSplitText = { init: init, splitElement: splitElement };
})(typeof window !== "undefined" ? window : this);
