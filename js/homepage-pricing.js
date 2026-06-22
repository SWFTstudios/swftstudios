(function () {
  "use strict";

  async function init() {
    var mount = document.getElementById("hp-pricing-mount");
    if (!mount || !window.SwftPricing) return;

    try {
      var res = await fetch("data/pricing.json");
      if (!res.ok) throw new Error("pricing.json unavailable");
      var data = await res.json();

      SwftPricing.mountPricing(mount, data, {
        layout: "compact",
        showHero: true,
        showFaqLink: true
      });

      function scrollToHashTarget() {
        var hash = window.location.hash.replace("#", "");
        var params = new URLSearchParams(window.location.search);
        var service = params.get("service");
        var targetId = null;
        if (hash === "content-creation" || service === "content") {
          targetId = "content-creation";
        } else if (hash === "homepage-pricing" || hash === "website-development" || service === "website") {
          targetId = "website-development";
        } else if (hash) {
          targetId = hash;
        }
        if (!targetId) return;
        var target = document.getElementById(targetId);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }

      requestAnimationFrame(scrollToHashTarget);
      window.addEventListener("hashchange", scrollToHashTarget);
    } catch (err) {
      console.error(err);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
