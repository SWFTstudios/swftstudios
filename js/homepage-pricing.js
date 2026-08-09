(function () {
  "use strict";

  async function init() {
    var mount = document.getElementById("hp-pricing-mount");
    if (!mount || !window.SwftPricing) return;

    var pricingApi = null;

    try {
      var res = await fetch("data/pricing.json");
      if (!res.ok) throw new Error("pricing.json unavailable");
      var data = await res.json();

      pricingApi = SwftPricing.mountPricing(mount, data, {
        layout: "compact",
        showHero: false,
        showFaqLink: true,
        showTrustLine: false,
        showOngoing: true,
        tabs: true
      });

      function openTabFromContext() {
        var hash = window.location.hash.replace("#", "");
        var params = new URLSearchParams(window.location.search);
        var service = params.get("service");
        if (
          hash === "ongoing" ||
          hash === "homepage-ongoing" ||
          service === "content"
        ) {
          if (pricingApi) pricingApi.activateTab("ongoing");
        } else if (
          hash === "project-tiers" ||
          hash === "offers" ||
          service === "website"
        ) {
          if (pricingApi) pricingApi.activateTab("onetime");
        }
      }

      function scrollToHashTarget() {
        var hash = window.location.hash.replace("#", "");
        var params = new URLSearchParams(window.location.search);
        var service = params.get("service");
        var targetId = null;

        openTabFromContext();

        if (
          hash === "homepage-pricing" ||
          hash === "pricing" ||
          hash === "project-tiers" ||
          hash === "ongoing" ||
          hash === "homepage-ongoing" ||
          service === "content" ||
          service === "website"
        ) {
          targetId = "homepage-pricing";
        } else if (
          hash === "offers" ||
          hash === "homepage-services" ||
          hash === "homepage-audience" ||
          hash === "who"
        ) {
          targetId = "homepage-audience";
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
