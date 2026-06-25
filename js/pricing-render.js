(function (global) {
  "use strict";

  var CAL_URL = "https://cal.com/swftstudios/swft-meeting";

  function formatMoney(n) {
    return "$" + n.toLocaleString("en-US");
  }

  function priceLabel(tier, billing) {
    if (billing === "oneTime") {
      if (tier.oneTime == null) return null;
      return formatMoney(tier.oneTime);
    }
    return formatMoney(tier.monthly) + "/mo";
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function tierCardClass(tier, layout) {
    var base = "hp-pricing-card";
    if (layout === "compact") base += " hp-pricing-card--compact";
    if (tier.featured) base += " hp-pricing-card--featured";
    return base;
  }

  function renderIncludesList(items, layout) {
    if (!items || !items.length) return "";
    var limit = layout === "compact" ? 4 : items.length;
    var slice = items.slice(0, limit);
    var list =
      '<ul class="hp-pricing-includes" role="list">' +
      slice
        .map(function (item) {
          return "<li>" + escapeHtml(item) + "</li>";
        })
        .join("") +
      "</ul>";
    if (layout === "compact" && items.length > limit) {
      list +=
        '<p class="hp-pricing-includes-more"><a href="website-pricing.html#pricing" class="highlight">See full pricing</a></p>';
    }
    return list;
  }

  function renderNotIncluded(items) {
    if (!items || !items.length) return "";
    return (
      '<p class="hp-pricing-not-included"><span>Not included:</span> ' +
      escapeHtml(items.join(" · ")) +
      "</p>"
    );
  }

  function tierIncludesForBilling(tier, billing) {
    if (billing === "oneTime") {
      return tier.oneTimeIncludes || tier.monthlyIncludes || [];
    }
    return tier.monthlyIncludes || tier.oneTimeIncludes || [];
  }

  function renderTierCard(tier, billing, groupId, layout) {
    var price = priceLabel(tier, billing);
    if (price === null) return "";

    var featured = tier.featured
      ? '<span class="hp-pricing-badge">' + escapeHtml(tier.badge || "Featured") + "</span>"
      : "";
    var ghlBadge = tier.ghl
      ? '<span class="hp-pricing-ghl-badge">' + escapeHtml(tier.ghlLabel || "Includes GoHighLevel") + "</span>"
      : "";
    var platform = tier.platform
      ? '<p class="hp-pricing-platform">' + escapeHtml(tier.platform) + "</p>"
      : "";
    var btnClass = tier.featured ? "button is-course w-inline-block" : "button is-course outlined w-inline-block";
    var calUrl = (global.SwftPricingConfig && global.SwftPricingConfig.calUrl) || CAL_URL;
    var includes = renderIncludesList(tierIncludesForBilling(tier, billing), layout);
    var notIncluded = layout === "full" ? renderNotIncluded(tier.notIncluded) : "";
    var desc = tier.cardDescription || tier.description;
    var whoLine =
      tier.whoItsFor && tier.whoItsFor.intro && layout === "full"
        ? '<p class="hp-pricing-who">' + escapeHtml(tier.whoItsFor.intro.slice(0, 120)) + (tier.whoItsFor.intro.length > 120 ? "…" : "") + "</p>"
        : "";
    var detailLink = tier.detailPath
      ? '<p class="hp-pricing-detail-link"><a href="' +
        escapeHtml(tier.detailPath) +
        '">See what\'s included →</a></p>'
      : "";

    return (
      '<article class="' +
      tierCardClass(tier, layout) +
      '" data-tier-id="' +
      escapeHtml(tier.id) +
      '">' +
      featured +
      ghlBadge +
      "<h3>" +
      escapeHtml(tier.name) +
      "</h3>" +
      platform +
      '<p class="hp-pricing-price">' +
      escapeHtml(price) +
      "</p>" +
      '<p class="hp-pricing-desc">' +
      escapeHtml(desc) +
      "</p>" +
      whoLine +
      includes +
      notIncluded +
      detailLink +
      '<a href="' +
      escapeHtml(calUrl) +
      '" target="_blank" rel="noopener noreferrer" class="' +
      btnClass +
      '" data-stripe-tier="' +
      escapeHtml(groupId + ":" + tier.id) +
      '">' +
      '<div class="button_bg"></div>' +
      '<div class="button_text">' +
      escapeHtml(tier.cta || "Get Started") +
      "</div></a></article>"
    );
  }

  function renderTierGrid(tiers, billing, groupId, layout) {
    return (
      '<div class="hp-pricing-grid' +
      (layout === "compact" ? " hp-pricing-grid--compact" : "") +
      '">' +
      tiers
        .map(function (tier) {
          return renderTierCard(tier, billing, groupId, layout);
        })
        .join("") +
      "</div>"
    );
  }

  function renderBundle(bundle, billing, calUrl, layout) {
    var priceHtml;
    if (billing === "oneTime") {
      priceHtml =
        '<p class="hp-pricing-bundle-price">' +
        escapeHtml(formatMoney(bundle.setup)) +
        ' <span class="hp-pricing-bundle-price-note">setup</span></p>';
    } else {
      priceHtml =
        '<p class="hp-pricing-bundle-price">' +
        escapeHtml(formatMoney(bundle.setup)) +
        ' setup + <span class="hp-pricing-bundle-price-accent">' +
        escapeHtml(formatMoney(bundle.monthly)) +
        " /mo</span></p>";
    }

    return (
      '<article class="hp-pricing-bundle hp-pricing-card--featured" id="' +
      escapeHtml(bundle.id) +
      '">' +
      '<span class="hp-pricing-badge">' +
      escapeHtml(bundle.badge) +
      "</span>" +
      "<h3>" +
      escapeHtml(bundle.name) +
      "</h3>" +
      '<p class="hp-pricing-desc">' +
      escapeHtml(bundle.cardDescription || bundle.description) +
      "</p>" +
      priceHtml +
      renderIncludesList(bundle.includes || [], layout) +
      (bundle.detailPath
        ? '<p class="hp-pricing-detail-link"><a href="' +
          escapeHtml(bundle.detailPath) +
          '">See what\'s included →</a></p>'
        : "") +
      '<a href="' +
      escapeHtml(calUrl) +
      '" target="_blank" rel="noopener noreferrer" class="button is-course w-inline-block" data-stripe-tier="' +
      escapeHtml(bundle.id) +
      '">' +
      '<div class="button_bg"></div>' +
      '<div class="button_text">' +
      escapeHtml(bundle.cta) +
      "</div></a></article>"
    );
  }

  function renderToggle(data, billing) {
    var bt = data.billingToggle;
    return (
      '<div class="hp-billing-toggle" role="group" aria-label="Billing type" data-active="' +
      escapeHtml(billing) +
      '">' +
      '<span class="hp-billing-toggle__pill" aria-hidden="true"></span>' +
      '<button type="button" class="hp-billing-toggle__btn' +
      (billing === "monthly" ? " is-active" : "") +
      '" data-billing="monthly" aria-pressed="' +
      (billing === "monthly" ? "true" : "false") +
      '">' +
      escapeHtml(bt.monthly) +
      "</button>" +
      '<button type="button" class="hp-billing-toggle__btn' +
      (billing === "oneTime" ? " is-active" : "") +
      '" data-billing="oneTime" aria-pressed="' +
      (billing === "oneTime" ? "true" : "false") +
      '">' +
      escapeHtml(bt.oneTime) +
      "</button></div>"
    );
  }

  function renderFaqList(faq) {
    return faq
      .map(function (item) {
        return (
          '<article class="hp-pricing-faq-item">' +
          "<h3>" +
          escapeHtml(item.q) +
          "</h3>" +
          "<p>" +
          escapeHtml(item.a) +
          "</p></article>"
        );
      })
      .join("");
  }

  function renderFaqSchema(faq) {
    return JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map(function (item) {
        return {
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a }
        };
      })
    });
  }

  function buildPricingBodyHtml(data, options) {
    var billing = options.billing;
    var layout = options.layout || "full";
    var showFaqLink = options.showFaqLink === true;
    var calUrl = data.calUrl || CAL_URL;
    var html = "";

    if (billing === "oneTime" && data.revisionPolicy) {
      html +=
        '<p class="hp-pricing-note" aria-live="polite">' +
        escapeHtml(data.revisionPolicy.cardNote) +
        ". " +
        escapeHtml(data.revisionPolicy.scopeNote) +
        "</p>";
    }

    html +=
      '<section class="hp-pricing-group" id="website-development" aria-labelledby="hp-pricing-website-heading">' +
      '<h3 id="hp-pricing-website-heading" class="hp-pricing-group-title">' +
      escapeHtml(data.websiteDevelopment.label) +
      "</h3>" +
      renderTierGrid(
        data.websiteDevelopment.tiers,
        billing,
        data.websiteDevelopment.id,
        layout
      ) +
      "</section>";

    if (billing === "monthly") {
      html +=
        '<section class="hp-pricing-group" id="content-creation" aria-labelledby="hp-pricing-content-heading">' +
        '<h3 id="hp-pricing-content-heading" class="hp-pricing-group-title">' +
        escapeHtml(data.contentCreation.label) +
        "</h3>" +
        renderTierGrid(
          data.contentCreation.tiers,
          billing,
          data.contentCreation.id,
          layout
        ) +
        "</section>";
    } else if (data.contentCreation.monthlyOnlyNote) {
      html +=
        '<section class="hp-pricing-group hp-pricing-group--note" id="content-creation">' +
        '<h3 class="hp-pricing-group-title">' +
        escapeHtml(data.contentCreation.label) +
        "</h3>" +
        '<p class="hp-pricing-desc">' +
        escapeHtml(data.contentCreation.monthlyOnlyNote) +
        ' <a href="' +
        escapeHtml(calUrl) +
        '" target="_blank" rel="noopener noreferrer" class="highlight">Book a discovery call</a>.</p></section>';
    }

    html += renderBundle(data.bundle, billing, calUrl, layout);

    if (showFaqLink) {
      html +=
        '<div class="hp-pricing-full-link">' +
        '<a href="website-pricing.html#pricing" class="button is-course outlined w-inline-block">' +
        '<div class="button_bg"></div>' +
        '<div class="button_text">View full pricing &amp; FAQ</div></a></div>';
    }

    return html;
  }

  function buildPricingHtml(data, options) {
    var showHero = options.showHero !== false;
    var html = "";

    if (showHero) {
      html +=
        '<header class="hp-pricing-hero">' +
        "<h2>" +
        escapeHtml(data.hero.headline) +
        "</h2>" +
        "<p>" +
        escapeHtml(data.hero.sub) +
        "</p></header>";
    }

    html += renderToggle(data, options.billing);
    html += '<div class="hp-pricing-body">' + buildPricingBodyHtml(data, options) + "</div>";

    return html;
  }

  function updateToggleState(toggle, billing) {
    toggle.setAttribute("data-active", billing);
    toggle.querySelectorAll(".hp-billing-toggle__btn").forEach(function (btn) {
      var active = btn.getAttribute("data-billing") === billing;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function wireToggle(rootEl, data, options, onBillingChange) {
    var toggle = rootEl.querySelector(".hp-billing-toggle");
    if (!toggle) return;

    toggle.addEventListener("click", function (e) {
      var btn = e.target.closest(".hp-billing-toggle__btn");
      if (!btn) return;
      var mode = btn.getAttribute("data-billing");
      if (!mode || mode === options.billing) return;
      options.billing = mode;
      onBillingChange(mode);
    });
  }

  function mountPricing(rootEl, data, options) {
    if (!rootEl || !data) return null;

    options = options || {};
    options.billing = options.billing || data.billingToggle.default || "monthly";
    options.layout = options.layout || "full";

    function repaint() {
      var toggle = rootEl.querySelector(".hp-billing-toggle");
      var bodyWrap = rootEl.querySelector(".hp-pricing-body");
      if (toggle && bodyWrap) {
        updateToggleState(toggle, options.billing);
        bodyWrap.innerHTML = buildPricingBodyHtml(data, options);
      } else {
        rootEl.innerHTML = buildPricingHtml(data, options);
      }
    }

    repaint();
    wireToggle(rootEl, data, options, function (mode) {
      options.billing = mode;
      repaint();
    });

    return {
      setBilling: function (mode) {
        options.billing = mode;
        repaint();
      }
    };
  }

  global.SwftPricing = {
    mountPricing: mountPricing,
    buildPricingHtml: buildPricingHtml,
    renderFaqList: renderFaqList,
    renderFaqSchema: renderFaqSchema,
    formatMoney: formatMoney
  };
})(window);
