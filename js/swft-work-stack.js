(function () {
  function initWorkStack() {
    if (!window.gsap) return;

    var wrap = document.querySelector(".ar-work-pointer-wrap");
    var works = document.querySelector(".ar-works-wrap");
    var head = document.querySelector(".ar-work-stack-head");
    var pointer = document.querySelector(".ar-pointer-work");
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var coarse =
      window.matchMedia("(pointer:coarse)").matches ||
      window.matchMedia("(max-width:900px)").matches;

    if (window.ScrollTrigger) {
      gsap.registerPlugin(ScrollTrigger);
    }

    if (works && head && window.ScrollTrigger && !reduce) {
      gsap.fromTo(
        head,
        { opacity: 1 },
        {
          opacity: 0,
          ease: "none",
          scrollTrigger: {
            trigger: works,
            start: "top 75%",
            end: "top 15%",
            scrub: 0.8,
          },
        }
      );
    }

    if (!wrap || !pointer || reduce || coarse) return;

    // Center via xPercent/yPercent only (no CSS margin) so the circle sits on the cursor
    gsap.set(pointer, {
      x: 0,
      y: 0,
      scale: 0,
      xPercent: -50,
      yPercent: -50,
      force3D: true,
    });
    var xTo = gsap.quickTo(pointer, "x", { duration: 0.35, ease: "power3.out" });
    var yTo = gsap.quickTo(pointer, "y", { duration: 0.35, ease: "power3.out" });

    wrap.addEventListener("pointerenter", function (e) {
      xTo(e.clientX);
      yTo(e.clientY);
      gsap.to(pointer, { scale: 1, duration: 0.35, ease: "power2.out", overwrite: "auto" });
    });
    wrap.addEventListener("pointerleave", function () {
      gsap.to(pointer, { scale: 0, duration: 0.3, ease: "power2.in", overwrite: "auto" });
    });
    wrap.addEventListener("pointermove", function (e) {
      xTo(e.clientX);
      yTo(e.clientY);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initWorkStack);
  } else {
    initWorkStack();
  }
})();
