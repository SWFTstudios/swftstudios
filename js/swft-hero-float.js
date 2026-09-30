/* ============================================================
   Homepage hero floats — Z fly-in + hover float bob
   Outer .home-float: enter + hover lift. Inner .home-float__motion: bob.
   Desktop only (>=901px). Skips reduced-motion.
   ============================================================ */
(function () {
  var DESKTOP = "(min-width: 901px)";

  function reduceMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function isDesktop() {
    return window.matchMedia && window.matchMedia(DESKTOP).matches;
  }

  function init() {
    var hero = document.querySelector(".home-hero");
    if (!hero) return;

    var floats = ["home-float-1", "home-float-2", "home-float-3", "home-float-4"]
      .map(function (id) { return document.getElementById(id); })
      .filter(Boolean);
    if (!floats.length) {
      floats = Array.prototype.slice.call(hero.querySelectorAll(".home-float"));
    }
    if (!floats.length || !window.gsap) return;
    if (reduceMotion() || !isDesktop()) return;

    var gsap = window.gsap;
    var items = floats.map(function (el, i) {
      var motionId = el.id ? el.id + "-motion" : null;
      var inner =
        (motionId && document.getElementById(motionId)) ||
        el.querySelector(".home-float__motion") ||
        el;
      return {
        el: el,
        inner: inner,
        index: i,
        bobTween: null,
        hovering: false
      };
    });

    floats.forEach(function (el, i) {
      gsap.set(el, {
        opacity: 0,
        scale: 0.35,
        z: -(280 + i * 55),
        y: 48,
        x: 0,
        rotationX: 0,
        rotationY: 0,
        rotation: 0,
        force3D: true,
        transformPerspective: 1200,
        transformOrigin: "50% 50%"
      });
      gsap.set(items[i].inner, { y: 0, rotation: 0, force3D: true });
    });

    var tl = gsap.timeline();

    floats.forEach(function (el, i) {
      tl.to(
        el,
        {
          opacity: 0.92,
          scale: 1,
          z: 0,
          y: 0,
          duration: 1.3 + i * 0.1,
          ease: "power3.out",
          force3D: true
        },
        0.1 + i * 0.14
      );
    });

    function startHover(item) {
      if (item.hovering) return;
      item.hovering = true;

      gsap.to(item.el, {
        y: -10,
        scale: 1.06,
        duration: 0.45,
        ease: "power2.out",
        force3D: true,
        overwrite: "auto"
      });

      var amp = 12 + (item.index % 3) * 3;
      var rot = item.index % 2 === 0 ? 2.4 : -2.4;

      if (item.bobTween) item.bobTween.kill();
      item.bobTween = gsap.to(item.inner, {
        y: amp,
        rotation: rot,
        duration: 1.6 + item.index * 0.15,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
        force3D: true
      });
    }

    function endHover(item) {
      if (!item.hovering) return;
      item.hovering = false;

      if (item.bobTween) {
        item.bobTween.kill();
        item.bobTween = null;
      }

      gsap.to(item.inner, {
        y: 0,
        rotation: 0,
        duration: 0.5,
        ease: "power2.out",
        force3D: true,
        overwrite: "auto"
      });

      gsap.to(item.el, {
        y: 0,
        scale: 1,
        duration: 0.5,
        ease: "power2.out",
        force3D: true,
        overwrite: "auto"
      });
    }

    items.forEach(function (item) {
      item.el.addEventListener("pointerenter", function () {
        startHover(item);
      });
      item.el.addEventListener("pointerleave", function () {
        endHover(item);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
