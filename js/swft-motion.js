/* ============================================================
   SWFT marketing motion bootstrap
   Requires: gsap, ScrollTrigger, swft-split-text.js
   ============================================================ */
(function () {
  function reduceMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function initFadeUps() {
    if (!window.gsap || !window.ScrollTrigger) return;
    var els = document.querySelectorAll("[data-fade-up]");
    if (!els.length) return;

    if (reduceMotion()) {
      els.forEach(function (el) { el.classList.add("is-in"); });
      return;
    }

    els.forEach(function (el) {
      el.classList.add("ar-fade-up");
      window.gsap.to(el, {
        opacity: 1,
        y: 0,
        duration: 0.7,
        ease: "power2.out",
        scrollTrigger: {
          trigger: el,
          start: "top 90%",
          toggleActions: "play none none none",
          onEnter: function () { el.classList.add("is-in"); }
        }
      });
    });
  }

  function init() {
    if (reduceMotion()) {
      document.documentElement.classList.add("ar-no-motion");
    }

    if (window.SWFTSplitText) {
      window.SWFTSplitText.init({
        gsap: window.gsap,
        ScrollTrigger: window.ScrollTrigger
      });
    }

    initFadeUps();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
