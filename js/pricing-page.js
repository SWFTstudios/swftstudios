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
        showFaqLink: false
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
      if (data.bookCta) {
        if (bookHeadline) bookHeadline.textContent = data.bookCta.headline;
        if (bookQuote) bookQuote.textContent = data.bookCta.quote;
        if (bookSub) bookSub.textContent = data.bookCta.sub;
      }

      var hash = window.location.hash.replace("#", "");
      if (hash === "content-creation" || hash === "website-development") {
        var target = document.getElementById(hash);
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
          '<p class="hp-pricing-desc">Pricing is temporarily unavailable. <a href="https://cal.com/swftstudios/swft-meeting" class="highlight">Book a call</a> for a quote.</p>';
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
