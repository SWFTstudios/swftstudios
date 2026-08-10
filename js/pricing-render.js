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
    var planHref = calUrl;
    if (tier.id) {
      planHref +=
        (calUrl.indexOf("?") === -1 ? "?" : "&") + "plan=" + encodeURIComponent(tier.id);
    }
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
      escapeHtml(planHref) +
      '" class="' +
      btnClass +
      '" data-stripe-tier="' +
      escapeHtml(groupId + ":" + tier.id) +
      '" data-plan="' +
      escapeHtml(tier.id) +
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
      (groupId === "ongoing" ? " hp-pricing-grid--ongoing" : "") +
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
    var hideTitle = options && options.hideTitle;
    var intro = group.intro
      ? '<p class="hp-pricing-group-intro">' + escapeHtml(group.intro) + "</p>"
      : "";
    var title = hideTitle
      ? ""
      : '<h3 id="hp-pricing-' +
        escapeHtml(group.id) +
        '-heading" class="hp-pricing-group-title">' +
        escapeHtml(group.label) +
        "</h3>";
    return (
      '<section class="hp-pricing-group" id="' +
      escapeHtml(group.id) +
      '" aria-labelledby="hp-pricing-' +
      escapeHtml(group.id) +
      '-heading">' +
      title +
      intro +
      renderTierGrid(group.tiers, group.id, layout) +
      "</section>"
    );
  }

  function renderTabs(projectGroup, ongoingGroup, layout) {
    return (
      '<div class="hp-pricing-tabs" data-pricing-tabs>' +
      '<div class="hp-billing-toggle" role="tablist" aria-label="Pricing type">' +
      '<button type="button" class="hp-billing-toggle__btn is-active" role="tab" id="hp-tab-onetime" aria-selected="true" aria-controls="project-tiers" data-pricing-tab="onetime">One-time projects</button>' +
      '<button type="button" class="hp-billing-toggle__btn" role="tab" id="hp-tab-ongoing" aria-selected="false" aria-controls="ongoing" data-pricing-tab="ongoing" tabindex="-1">Ongoing retainers</button>' +
      "</div>" +
      '<div class="hp-pricing-tab-panels">' +
      '<div class="hp-pricing-tab-panel is-active" role="tabpanel" id="project-tiers" aria-labelledby="hp-tab-onetime" data-pricing-panel="onetime">' +
      '<h3 id="hp-pricing-project-tiers-heading" class="visually-hidden">' +
      escapeHtml(projectGroup.label || "One-time projects") +
      "</h3>" +
      (projectGroup.intro
        ? '<p class="hp-pricing-group-intro">' + escapeHtml(projectGroup.intro) + "</p>"
        : "") +
      renderTierGrid(projectGroup.tiers, projectGroup.id, layout) +
      "</div>" +
      '<div class="hp-pricing-tab-panel" role="tabpanel" id="ongoing" aria-labelledby="hp-tab-ongoing" data-pricing-panel="ongoing" hidden>' +
      '<h3 id="hp-pricing-ongoing-heading" class="visually-hidden">' +
      escapeHtml(ongoingGroup.label || "Ongoing") +
      "</h3>" +
      (ongoingGroup.intro
        ? '<p class="hp-pricing-group-intro">' + escapeHtml(ongoingGroup.intro) + "</p>"
        : "") +
      renderTierGrid(ongoingGroup.tiers, ongoingGroup.id, layout) +
      "</div>" +
      "</div></div>"
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
    var useTabs = options.tabs === true && !projectOnly && showOngoing && data.ongoingTiers;
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

    if (useTabs) {
      html += renderTabs(data.projectTiers, data.ongoingTiers, layout);
    } else {
      html += renderGroup(data.projectTiers, layout, { hideTitle: false });

      if (showOngoing && !projectOnly && data.ongoingTiers) {
        html += renderGroup(data.ongoingTiers, layout, null);
      } else if (projectOnly && data.ongoingTiers) {
        html +=
          '<p class="hp-pricing-desc hp-pricing-ongoing-link">Retainers start at $450/mo. <a href="#homepage-pricing" data-pricing-open-tab="ongoing" class="highlight">See ongoing options</a> or <a href="website-pricing.html#ongoing" class="highlight">full pricing</a>.</p>';
      }
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

  function activateTab(rootEl, tabKey) {
    if (!rootEl) return;
    var tabs = rootEl.querySelectorAll("[data-pricing-tab]");
    var panels = rootEl.querySelectorAll("[data-pricing-panel]");
    tabs.forEach(function (tab) {
      var active = tab.getAttribute("data-pricing-tab") === tabKey;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
      tab.setAttribute("tabindex", active ? "0" : "-1");
    });
    panels.forEach(function (panel) {
      var active = panel.getAttribute("data-pricing-panel") === tabKey;
      panel.classList.toggle("is-active", active);
      if (active) {
        panel.removeAttribute("hidden");
      } else {
        panel.setAttribute("hidden", "");
      }
    });
  }

  function bindTabs(rootEl) {
    var wrap = rootEl.querySelector("[data-pricing-tabs]");
    if (!wrap) return null;

    var tabs = Array.prototype.slice.call(wrap.querySelectorAll("[data-pricing-tab]"));

    wrap.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-pricing-tab]");
      if (!btn || !wrap.contains(btn)) return;
      activateTab(rootEl, btn.getAttribute("data-pricing-tab"));
    });

    wrap.addEventListener("keydown", function (e) {
      var current = e.target.closest("[data-pricing-tab]");
      if (!current || !wrap.contains(current)) return;
      var idx = tabs.indexOf(current);
      if (idx < 0) return;
      var nextIdx = idx;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        nextIdx = (idx + 1) % tabs.length;
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        nextIdx = (idx - 1 + tabs.length) % tabs.length;
      } else if (e.key === "Home") {
        nextIdx = 0;
      } else if (e.key === "End") {
        nextIdx = tabs.length - 1;
      } else {
        return;
      }
      e.preventDefault();
      tabs[nextIdx].focus();
      activateTab(rootEl, tabs[nextIdx].getAttribute("data-pricing-tab"));
    });

    document.addEventListener("click", function (e) {
      var link = e.target.closest("[data-pricing-open-tab]");
      if (!link) return;
      var key = link.getAttribute("data-pricing-open-tab");
      if (!key) return;
      activateTab(rootEl, key);
    });

    return {
      activate: function (tabKey) {
        activateTab(rootEl, tabKey);
      }
    };
  }

  function mountPricing(rootEl, data, options) {
    if (!rootEl || !data) return null;

    options = options || {};
    options.layout = options.layout || "full";

    rootEl.innerHTML = buildPricingHtml(data, options);
    var tabApi = bindTabs(rootEl);

    return {
      refresh: function () {
        rootEl.innerHTML = buildPricingHtml(data, options);
        tabApi = bindTabs(rootEl);
      },
      activateTab: function (tabKey) {
        if (tabApi) tabApi.activate(tabKey);
      }
    };
  }

  global.SwftPricing = {
    mountPricing: mountPricing,
    buildPricingHtml: buildPricingHtml,
    activateTab: activateTab,
    renderFaqList: renderFaqList,
    renderFaqSchema: renderFaqSchema
  };
})(window);
