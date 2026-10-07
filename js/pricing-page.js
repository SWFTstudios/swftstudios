(function () {
  "use strict";

  // Old anchors from earlier pricing layouts (location pages, past links).
  // Offer ids (gbp-refresh, website-only, ...) still exist as card ids.
  var HASH_ALIASES = {
    ongoing: "content-growth-retainer",
    "project-tiers": "digital",
    "website-development": "web-design",
    "content-creation": "visual"
  };

  async function init() {
    var mount = document.getElementById("pricing-mount");
    if (!mount || !window.SwftPricing) return;

    try {
      var res = await fetch("data/pricing.json");
      if (!res.ok) throw new Error("pricing.json unavailable");
      var data = await res.json();

      var heroTitle = document.getElementById("hero-title");
      var heroLead = document.getElementById("hero-lead");
      if (heroTitle) heroTitle.textContent = data.hero.headline;
      if (heroLead) heroLead.textContent = data.hero.sub;

      // The category (#digital / #visual) and billing (?billing=monthly) stay
      // in the URL so a shared link opens the same view.
      function writeUrl(hash, billing) {
        if (!window.history || !history.replaceState) return;
        var params = new URLSearchParams(window.location.search);
        if (billing === "monthly") params.set("billing", "monthly");
        else if (billing) params.delete("billing");
        var query = params.toString();
        var nextHash = hash === undefined ? window.location.hash : hash ? "#" + hash : "";
        history.replaceState(null, "", window.location.pathname + (query ? "?" + query : "") + nextHash);
      }

      var startBilling = "one-time";
      try {
        if (new URLSearchParams(window.location.search).get("billing") === "monthly") startBilling = "monthly";
      } catch (e) {
        /* bad query string: start on one-time */
      }

      var pricingApi = SwftPricing.mountPricing(mount, data, {
        layout: "full",
        showHero: false,
        showFaqLink: false,
        showTrustLine: true,
        tabs: true,
        billingToggle: true,
        billing: startBilling,
        onTabChange: function (key) {
          writeUrl(key);
        },
        onBillingChange: function (mode) {
          writeUrl(undefined, mode);
        }
      });

      var faqList = document.getElementById("faq-list");
      if (faqList && data.faq) {
        faqList.innerHTML = SwftPricing.renderFaqList(data.faq);
      }

      var faqSchema = document.getElementById("faq-schema");
      if (faqSchema && data.faq) {
        faqSchema.textContent = SwftPricing.renderFaqSchema(data.faq);
      }

      var bookHeadline = document.getElementById("book-cta-headline");
      var bookQuote = document.getElementById("book-cta-quote");
      var bookSub = document.getElementById("book-cta-sub");
      var bookBtn = document.querySelector(".pricing-book-cta__actions .button_text");
      if (data.bookCta) {
        if (bookHeadline) bookHeadline.textContent = data.bookCta.headline;
        if (bookQuote) bookQuote.textContent = data.bookCta.quote;
        if (bookSub) bookSub.textContent = data.bookCta.sub;
        if (bookBtn && data.bookCta.button) bookBtn.textContent = data.bookCta.button;
      }

      // #digital / #visual open a category; a service or offer id opens the
      // category that holds it and scrolls to it.
      function showHashTarget(smooth) {
        var hash = "";
        try {
          hash = decodeURIComponent(window.location.hash.replace("#", ""));
        } catch (e) {
          return;
        }
        if (!hash) return;
        var target = document.getElementById(HASH_ALIASES[hash] || hash);
        if (!target || !mount.contains(target)) {
          if (target) target.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
          return;
        }
        var panel = target.closest("[data-pricing-panel]");
        if (panel && pricingApi) pricingApi.activateTab(panel.getAttribute("data-pricing-panel"));
        // A one-time or monthly card opens with the switch on its side.
        var group = target.closest("[data-billing-group]");
        if (group && pricingApi && pricingApi.billing() !== group.getAttribute("data-billing-group")) {
          pricingApi.setBilling(group.getAttribute("data-billing-group"));
          writeUrl(undefined, group.getAttribute("data-billing-group"));
        }
        var scrollTo = target.hasAttribute("data-pricing-panel") ? document.getElementById("pricing") : target;
        requestAnimationFrame(function () {
          (scrollTo || target).scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
        });
      }

      showHashTarget(true);
      window.addEventListener("hashchange", function () {
        showHashTarget(true);
      });

      // In-page links (service chips, "Ongoing care" links): handle them here so
      // a second click on the same link still switches tab/billing and scrolls.
      mount.addEventListener("click", function (e) {
        var link = e.target.closest('a[href^="#"]');
        if (!link || !mount.contains(link)) return;
        var id = link.getAttribute("href").slice(1);
        if (!id || !document.getElementById(HASH_ALIASES[id] || id)) return;
        e.preventDefault();
        writeUrl(id);
        showHashTarget(true);
      });
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
