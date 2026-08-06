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
        showHero: false,
        showFaqLink: true,
        showTrustLine: false,
        projectOnly: true
      });

      function scrollToHashTarget() {
        var hash = window.location.hash.replace("#", "");
        var params = new URLSearchParams(window.location.search);
        var service = params.get("service");
        var targetId = null;
        if (hash === "homepage-pricing" || hash === "pricing" || hash === "project-tiers") {
          targetId = "homepage-pricing";
        } else if (hash === "ongoing" || hash === "homepage-ongoing" || service === "content") {
          targetId = "homepage-ongoing";
        } else if (hash === "offers" || hash === "homepage-services" || service === "website") {
          targetId = "homepage-services";
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
      if (mount) {
        mount.innerHTML =
          '<p class="hp-pricing-desc">Pricing is temporarily unavailable. <a href="/growth-audit" class="highlight">Request a Growth Audit</a> for a scoped quote.</p>';
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
