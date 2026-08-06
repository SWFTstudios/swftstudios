(function (global) {
  "use strict";

  var CAL_URL = "/growth-audit";

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

  function renderTierCard(tier, groupId, layout) {
    var featured = tier.featured
      ? '<span class="hp-pricing-badge">' + escapeHtml(tier.badge || "Featured") + "</span>"
      : "";
    var btnClass = tier.featured
      ? "button is-course w-inline-block"
      : "button is-course outlined w-inline-block";
    var calUrl = (global.SwftPricingConfig && global.SwftPricingConfig.calUrl) || CAL_URL;
    var priceNote = tier.priceNote
      ? '<span class="hp-pricing-price-note">' + escapeHtml(tier.priceNote) + "</span>"
      : "";
    var scopeDriver = tier.scopeDriver
      ? '<p class="hp-pricing-scope">' + escapeHtml(tier.scopeDriver) + "</p>"
      : "";

    return (
      '<article class="' +
      tierCardClass(tier, layout) +
      '" data-tier-id="' +
      escapeHtml(tier.id) +
      '" id="' +
      escapeHtml(tier.id) +
      '">' +
      featured +
      "<h3>" +
      escapeHtml(tier.name) +
      "</h3>" +
      '<p class="hp-pricing-price">' +
      escapeHtml(tier.priceLabel || "") +
      " " +
      priceNote +
      "</p>" +
      '<p class="hp-pricing-desc">' +
      escapeHtml(tier.description || "") +
      "</p>" +
      scopeDriver +
      renderIncludesList(tier.includes || [], layout) +
      '<a href="' +
      escapeHtml(calUrl) +
      '" class="' +
      btnClass +
      '" data-stripe-tier="' +
      escapeHtml(groupId + ":" + tier.id) +
      '">' +
      '<div class="button_bg"></div>' +
      '<div class="button_text">' +
      escapeHtml(tier.cta || "Get started") +
      "</div></a></article>"
    );
  }

  function renderTierGrid(tiers, groupId, layout) {
    return (
      '<div class="hp-pricing-grid' +
      (layout === "compact" ? " hp-pricing-grid--compact" : "") +
      '">' +
      tiers
        .map(function (tier) {
          return renderTierCard(tier, groupId, layout);
        })
        .join("") +
      "</div>"
    );
  }

  function renderGroup(group, layout, options) {
    if (!group || !group.tiers || !group.tiers.length) return "";
    var intro = group.intro
      ? '<p class="hp-pricing-group-intro">' + escapeHtml(group.intro) + "</p>"
      : "";
    var linkNote = "";
    if (options && options.ongoingLink && group.id === "project-tiers") {
      linkNote =
        '<p class="hp-pricing-desc hp-pricing-ongoing-link">Looking for monthly content or ads support? <a href="#ongoing" class="highlight">See ongoing retainers</a>.</p>';
    }
    return (
      '<section class="hp-pricing-group" id="' +
      escapeHtml(group.id) +
      '" aria-labelledby="hp-pricing-' +
      escapeHtml(group.id) +
      '-heading">' +
      '<h3 id="hp-pricing-' +
      escapeHtml(group.id) +
      '-heading" class="hp-pricing-group-title">' +
      escapeHtml(group.label) +
      "</h3>" +
      intro +
      renderTierGrid(group.tiers, group.id, layout) +
      linkNote +
      "</section>"
    );
  }

  function renderFaqList(faq) {
    return (faq || [])
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
      mainEntity: (faq || []).map(function (item) {
        return {
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a }
        };
      })
    });
  }

  function buildPricingHtml(data, options) {
    var layout = options.layout || "full";
    var showHero = options.showHero !== false;
    var showFaqLink = options.showFaqLink === true;
    var showOngoing = options.showOngoing !== false;
    var projectOnly = options.projectOnly === true;
    var html = "";

    if (showHero && data.hero) {
      html +=
        '<header class="hp-pricing-hero">' +
        "<h2>" +
        escapeHtml(data.hero.headline) +
        "</h2>" +
        "<p>" +
        escapeHtml(data.hero.sub) +
        "</p></header>";
    }

    if (data.hero && data.hero.trustLine && options.showTrustLine) {
      html +=
        '<p class="hp-pricing-trust">' +
        escapeHtml(data.hero.trustLine) +
        "</p>";
    }

    html += renderGroup(data.projectTiers, layout, {
      ongoingLink: showOngoing && !projectOnly && layout === "compact"
    });

    if (showOngoing && !projectOnly && data.ongoingTiers) {
      html += renderGroup(data.ongoingTiers, layout, null);
    } else if (projectOnly && data.ongoingTiers) {
      html +=
        '<p class="hp-pricing-desc hp-pricing-ongoing-link">Retainers start at $450/mo. <a href="#homepage-ongoing" class="highlight">See ongoing options</a> or <a href="website-pricing.html#ongoing" class="highlight">full pricing</a>.</p>';
    }

    if (showFaqLink) {
      html +=
        '<div class="hp-pricing-full-link">' +
        '<a href="website-pricing.html#pricing" class="button is-course outlined w-inline-block">' +
        '<div class="button_bg"></div>' +
        '<div class="button_text">View full pricing &amp; FAQ</div></a></div>';
    }

    return html;
  }

  function mountPricing(rootEl, data, options) {
    if (!rootEl || !data) return null;

    options = options || {};
    options.layout = options.layout || "full";

    rootEl.innerHTML = buildPricingHtml(data, options);
    return {
      refresh: function () {
        rootEl.innerHTML = buildPricingHtml(data, options);
      }
    };
  }

  global.SwftPricing = {
    mountPricing: mountPricing,
    buildPricingHtml: buildPricingHtml,
    renderFaqList: renderFaqList,
    renderFaqSchema: renderFaqSchema
  };
})(window);
