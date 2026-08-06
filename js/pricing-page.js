(function () {
  "use strict";

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

      SwftPricing.mountPricing(mount, data, {
        layout: "full",
        showHero: false,
        showFaqLink: false,
        showOngoing: true,
        showTrustLine: true
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

      var hash = window.location.hash.replace("#", "");
      var scrollIds = {
        "content-creation": "ongoing",
        "website-development": "project-tiers",
        pricing: "pricing",
        ongoing: "ongoing",
        "project-tiers": "project-tiers"
      };
      var targetId = scrollIds[hash] || hash;
      if (targetId) {
        var target = document.getElementById(targetId);
        if (target) {
          requestAnimationFrame(function () {
            target.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        }
      }
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
