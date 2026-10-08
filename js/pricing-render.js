/* ============================================================
   Pricing renderer (data/pricing.json → HTML).
   Data shape: categories (Digital, Visual) → services → offers.
   - An offer with a bookUrl (and a stripe config) books online at /book/.
   - Any other offer is quote-first: its CTA opens /contact.html?service=<service id>.
   With billingToggle: true, each service renders a one-time group and a
   monthly group (by offer.kind) and a switch shows one of them; the mount
   element carries data-billing="one-time" | "monthly".
   Optional offer fields: specs (quick-look numbers), scale (size table),
   rhythm (monthly steps), handoff (what you keep at the end) and next
   (a link to the matching care plan or monthly option).
   With tabs: true each category is a tab panel (id = category id); otherwise
   the categories render stacked. Offer cards keep their id, so old links like
   website-pricing.html#gbp-refresh still land on the right card.
   ============================================================ */
(function (global) {
  "use strict";

  var QUOTE_URL = "/contact.html";

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function renderIncludesList(items, layout, label) {
    if (!items || !items.length) return "";
    var limit = layout === "compact" ? 4 : items.length;
    var list =
      '<p class="hp-pricing-includes-label">' + escapeHtml(label || "What you get") + "</p>" +
      '<ul class="hp-pricing-includes" role="list">' +
      items
        .slice(0, limit)
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

  // Quick-look numbers: shoot time, edited photos, pages, delivery...
  function renderSpecs(specs) {
    if (!specs || !specs.length) return "";
    return (
      '<dl class="hp-pricing-specs">' +
      specs
        .map(function (s) {
          return "<div><dt>" + escapeHtml(s.label) + "</dt><dd>" + escapeHtml(s.value) + "</dd></div>";
        })
        .join("") +
      "</dl>"
    );
  }

  // Size table: how scope (products, hours, videos, plans) changes the price.
  function renderScale(scale) {
    if (!scale || !scale.columns || !scale.rows || !scale.rows.length) return "";
    var head = scale.columns
      .map(function (c) {
        return '<th scope="col">' + escapeHtml(c) + "</th>";
      })
      .join("");
    var body = scale.rows
      .map(function (row, r) {
        return (
          "<tr" + (r === 0 ? ' class="is-base"' : "") + ">" +
          row
            .map(function (cell, i) {
              return i === 0
                ? '<th scope="row">' + escapeHtml(cell) + "</th>"
                : '<td data-label="' + escapeHtml(scale.columns[i] || "") + '">' + escapeHtml(cell) + "</td>";
            })
            .join("") +
          "</tr>"
        );
      })
      .join("");
    return (
      '<div class="hp-pricing-scale">' +
      '<p class="hp-pricing-includes-label">' + escapeHtml(scale.title || "Sizes") + "</p>" +
      '<div class="hp-pricing-scale__wrap"><table><thead><tr>' + head + "</tr></thead><tbody>" + body + "</tbody></table></div>" +
      (scale.note ? '<p class="hp-pricing-scale__note">' + escapeHtml(scale.note) + "</p>" : "") +
      "</div>"
    );
  }

  function renderSteps(label, items, ordered) {
    if (!items || !items.length) return "";
    var tag = ordered ? "ol" : "ul";
    return (
      '<p class="hp-pricing-includes-label">' + escapeHtml(label) + "</p>" +
      "<" + tag + ' class="hp-pricing-includes hp-pricing-includes--' + (ordered ? "steps" : "handoff") + '" role="list">' +
      items
        .map(function (item) {
          return "<li>" + escapeHtml(item) + "</li>";
        })
        .join("") +
      "</" + tag + ">"
    );
  }

  // "Ongoing care: Website Care from $150/mo" links to another offer's card.
  function renderNext(next, index) {
    var target = next && index && index[next.offer];
    if (!target) return "";
    var price = String(target.priceLabel || "").replace(/^Starting at /, "from ");
    return (
      '<p class="hp-pricing-next"><span>' + escapeHtml(next.label || "Next") + "</span>" +
      '<a href="#' + escapeHtml(target.id) + '">' + escapeHtml(target.name) +
      (price ? " · " + escapeHtml(price) : "") + ' <span aria-hidden="true">&rarr;</span></a></p>'
    );
  }

  function offerIndex(data) {
    var index = {};
    (data.categories || []).forEach(function (c) {
      (c.services || []).forEach(function (s) {
        (s.offers || []).forEach(function (o) {
          index[o.id] = o;
        });
      });
    });
    return index;
  }

  function offerHref(offer, service, data) {
    if (offer.bookUrl) return offer.bookUrl;
    var base = (data && data.quoteUrl) || QUOTE_URL;
    return base + (base.indexOf("?") === -1 ? "?" : "&") + "service=" + encodeURIComponent(service.id);
  }

  function renderOfferCard(offer, service, data, layout, index) {
    var bookable = !!offer.bookUrl;
    var monthly = offer.kind === "Monthly";
    var full = layout !== "compact";
    var cls = "hp-pricing-card";
    if (layout === "compact") cls += " hp-pricing-card--compact";
    if (offer.featured) cls += " hp-pricing-card--featured";

    var badge = offer.featured
      ? '<span class="hp-pricing-badge">' + escapeHtml(offer.badge || "Featured") + "</span>"
      : "";
    var kicker =
      '<p class="hp-pricing-kicker">' +
      (offer.kind ? '<span class="hp-pricing-kicker__kind' + (monthly ? " is-monthly" : "") + '">' + escapeHtml(offer.kind) + "</span>" : "") +
      '<span class="hp-pricing-kicker__how' + (bookable ? " is-bookable" : "") + '">' +
      (bookable ? "Book online" : "Quote first") +
      "</span></p>";
    var crossover = offer.crossover
      ? '<p class="hp-pricing-crossover">' + escapeHtml(offer.crossover) + "</p>"
      : "";
    var priceNote = offer.priceNote
      ? '<span class="hp-pricing-price-note">' + escapeHtml(offer.priceNote) + "</span>"
      : "";
    var notIncluded =
      offer.notIncluded && layout !== "compact"
        ? '<p class="hp-pricing-not-included"><span>Not included</span>' + escapeHtml(offer.notIncluded) + "</p>"
        : "";
    var note = bookable ? data && data.bookNote : data && data.quoteNote;
    var checkoutNote = note && layout !== "compact"
      ? '<p class="hp-pricing-checkout-note">' + escapeHtml(note) + "</p>"
      : "";
    var btnClass = offer.featured
      ? "button is-course w-inline-block"
      : "button is-course outlined w-inline-block";

    return (
      '<article class="' + cls + '" data-tier-id="' + escapeHtml(offer.id) + '" id="' + escapeHtml(offer.id) + '">' +
      badge +
      kicker +
      '<h4 class="hp-pricing-name">' + escapeHtml(offer.name) + "</h4>" +
      crossover +
      '<p class="hp-pricing-price">' + escapeHtml(offer.priceLabel || "") + " " + priceNote + "</p>" +
      '<p class="hp-pricing-desc">' + escapeHtml(offer.description || "") + "</p>" +
      renderSpecs(offer.specs) +
      renderIncludesList(offer.includes || [], layout, monthly ? "Every month you get" : "What you get") +
      (full && offer.rhythm ? renderSteps(offer.rhythm.title || "How each month runs", offer.rhythm.steps, true) : "") +
      (full ? renderScale(offer.scale) : "") +
      (full ? renderSteps("At handoff", offer.handoff, false) : "") +
      (full ? renderNext(offer.next, index) : "") +
      '<div class="hp-pricing-card__foot">' +
      notIncluded +
      checkoutNote +
      '<a href="' + escapeHtml(offerHref(offer, service, data)) + '" class="' + btnClass + '"' +
      ' data-plan="' + escapeHtml(offer.id) + '"' +
      (bookable ? ' data-stripe-tier="' + escapeHtml(service.id + ":" + offer.id) + '"' : "") +
      ">" +
      '<div class="button_bg"></div>' +
      '<div class="button_text">' + escapeHtml(offer.cta || (bookable ? "Book now" : "Request a quote")) + "</div></a>" +
      "</div></article>"
    );
  }

  var BILLING = [
    { key: "one-time", label: "One-time", also: "Also one-time" },
    { key: "monthly", label: "Monthly", also: "Also monthly" }
  ];

  function billingOf(offer) {
    return offer.kind === "Monthly" ? "monthly" : "one-time";
  }

  // The other billing mode's offers for the same service, with a button that
  // flips the switch. Sits beside a lone card, or as a bar under a full row.
  function renderSwitchTeaser(service, mode, others) {
    if (!others.length) return "";
    var other = BILLING[mode.key === "monthly" ? 0 : 1];
    return (
      '<aside class="pr-switch-teaser" aria-label="' + escapeHtml(other.also + ": " + service.name) + '">' +
      '<p class="pr-switch-teaser__label">' + escapeHtml(other.also) + "</p>" +
      '<ul class="pr-switch-teaser__list" role="list">' +
      others
        .map(function (o) {
          return (
            "<li><span>" + escapeHtml(o.name) + "</span><b>" +
            escapeHtml(String(o.priceLabel || "").replace(/^Starting at /, "from ")) + "</b></li>"
          );
        })
        .join("") +
      "</ul>" +
      '<button type="button" class="pr-switch-teaser__btn" data-billing-set="' + other.key + '" data-billing-scroll="' + escapeHtml(service.id) + '">' +
      "See " + escapeHtml(other.label.toLowerCase()) + ' pricing <span aria-hidden="true">&rarr;</span></button>' +
      "</aside>"
    );
  }

  function renderOfferGrid(list, service, data, layout, index, teaser) {
    var cols = list.length === 1 ? " pr-offer-grid--1" : list.length === 3 ? " pr-offer-grid--3" : "";
    return (
      '<div class="hp-pricing-grid pr-offer-grid' + cols + (layout === "compact" ? " hp-pricing-grid--compact" : "") + '">' +
      list
        .map(function (offer) {
          return renderOfferCard(offer, service, data, layout, index);
        })
        .join("") +
      (teaser || "") +
      "</div>"
    );
  }

  function renderService(service, n, data, layout, index, options) {
    var offers = service.offers || [];
    if (!offers.length) return "";
    var headingId = "pr-" + service.id + "-heading";
    var body;
    if (options && options.billingToggle) {
      // One group per billing mode; the switch on the mount shows one of them.
      body = BILLING.map(function (mode) {
        var list = offers.filter(function (o) {
          return billingOf(o) === mode.key;
        });
        var others = offers.filter(function (o) {
          return billingOf(o) !== mode.key;
        });
        var inner = list.length
          ? renderOfferGrid(list, service, data, layout, index, renderSwitchTeaser(service, mode, others))
          : '<p class="pr-billing-empty">No ' + escapeHtml(mode.label.toLowerCase()) + " option for this service yet. " +
            '<a href="' + escapeHtml(offerHref({}, service, data)) + '">Ask us about one</a>.</p>';
        return '<div class="pr-billing-group" data-billing-group="' + mode.key + '">' + inner + "</div>";
      }).join("");
    } else {
      body = renderOfferGrid(offers, service, data, layout, index, "");
    }
    return (
      '<section class="pr-service" id="' + escapeHtml(service.id) + '" aria-labelledby="' + escapeHtml(headingId) + '">' +
      '<header class="pr-service__head">' +
      '<span class="pr-service__num" aria-hidden="true">' + pad2(n + 1) + "</span>" +
      '<h3 class="pr-service__name" id="' + escapeHtml(headingId) + '">' + escapeHtml(service.name) + "</h3>" +
      (service.summary ? '<p class="pr-service__summary">' + escapeHtml(service.summary) + "</p>" : "") +
      "</header>" +
      body +
      "</section>"
    );
  }

  // One-time / Monthly switch. The labels are clickable for pointer users;
  // the switch itself is the keyboard and screen reader control.
  function renderBillingSwitch(data) {
    return (
      '<div class="pr-billing-bar">' +
      '<div class="pr-billing" data-billing-switch-root>' +
      '<span class="pr-billing__label is-active" data-billing-set="one-time" aria-hidden="true">One-time</span>' +
      '<button type="button" class="pr-billing__switch" role="switch" aria-checked="false" data-billing-switch>' +
      '<span class="visually-hidden">Show monthly pricing</span><span class="pr-billing__knob" aria-hidden="true"></span></button>' +
      '<span class="pr-billing__label" data-billing-set="monthly" aria-hidden="true">Monthly</span>' +
      "</div>" +
      (data.billingNote ? '<p class="pr-billing-note">' + escapeHtml(data.billingNote) + "</p>" : "") +
      "</div>"
    );
  }

  function renderCategoryBody(category, data, layout, index, options) {
    var services = category.services || [];
    var jump = services.length > 1
      ? '<nav class="pr-jump" aria-label="' + escapeHtml(category.label) + ' services">' +
        services
          .map(function (s) {
            return '<a href="#' + escapeHtml(s.id) + '">' + escapeHtml(s.name) + "</a>";
          })
          .join("") +
        "</nav>"
      : "";
    return (
      '<header class="pr-cat__head">' +
      '<p class="pr-cat__eyebrow">' + escapeHtml(category.label) + "</p>" +
      '<h2 class="pr-cat__title">' + escapeHtml(category.tagline || category.label) + "</h2>" +
      (category.intro ? '<p class="pr-cat__intro">' + escapeHtml(category.intro) + "</p>" : "") +
      jump +
      "</header>" +
      services
        .map(function (s, i) {
          return renderService(s, i, data, layout, index, options);
        })
        .join("")
    );
  }

  function serviceNames(category) {
    return (category.services || [])
      .map(function (s) {
        return s.name;
      })
      .join(" · ");
  }

  function renderTabs(categories, data, layout, index, options) {
    return (
      '<div class="pr-tabs" data-pricing-tabs>' +
      '<div class="pr-cat-tabs" role="tablist" aria-label="Service category">' +
      categories
        .map(function (c, i) {
          var on = i === 0;
          return (
            '<button type="button" class="pr-cat-tab' + (on ? " is-active" : "") + '" role="tab"' +
            ' id="pr-tab-' + escapeHtml(c.id) + '" aria-selected="' + (on ? "true" : "false") + '"' +
            ' aria-controls="' + escapeHtml(c.id) + '" data-pricing-tab="' + escapeHtml(c.id) + '"' +
            (on ? "" : ' tabindex="-1"') + ">" +
            '<span class="pr-cat-tab__label">' + escapeHtml(c.label) + "</span>" +
            '<span class="pr-cat-tab__sub">' + escapeHtml(serviceNames(c)) + "</span>" +
            "</button>"
          );
        })
        .join("") +
      "</div>" +
      (options && options.billingToggle ? renderBillingSwitch(data) : "") +
      categories
        .map(function (c, i) {
          var on = i === 0;
          return (
            '<div class="hp-pricing-tab-panel pr-cat' + (on ? " is-active" : "") + '" role="tabpanel"' +
            ' id="' + escapeHtml(c.id) + '" aria-labelledby="pr-tab-' + escapeHtml(c.id) + '"' +
            ' data-pricing-panel="' + escapeHtml(c.id) + '"' + (on ? "" : " hidden") + ">" +
            renderCategoryBody(c, data, layout, index, options) +
            "</div>"
          );
        })
        .join("") +
      "</div>"
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
    var index = offerIndex(data);
    var categories = (data.categories || []).filter(function (c) {
      return c && c.services && c.services.length;
    });
    var html = "";

    if (options.showHero !== false && data.hero) {
      html +=
        '<header class="hp-pricing-hero">' +
        "<h2>" + escapeHtml(data.hero.headline) + "</h2>" +
        "<p>" + escapeHtml(data.hero.sub) + "</p></header>";
    }

    if (data.hero && data.hero.trustLine && options.showTrustLine) {
      html += '<p class="hp-pricing-trust">' + escapeHtml(data.hero.trustLine) + "</p>";
    }

    if (options.tabs === true && categories.length > 1) {
      html += renderTabs(categories, data, layout, index, options);
    } else {
      if (options.billingToggle) html += renderBillingSwitch(data);
      html += categories
        .map(function (c) {
          return (
            '<section class="pr-cat" id="' + escapeHtml(c.id) + '" aria-label="' + escapeHtml(c.label) + ' services">' +
            renderCategoryBody(c, data, layout, index, options) +
            "</section>"
          );
        })
        .join("");
    }

    if (options.showFaqLink === true) {
      html +=
        '<div class="hp-pricing-full-link">' +
        '<a href="website-pricing.html#pricing" class="button is-course outlined w-inline-block">' +
        '<div class="button_bg"></div>' +
        '<div class="button_text">View full pricing &amp; FAQ</div></a></div>';
    }

    return html;
  }

  function activateTab(rootEl, tabKey) {
    if (!rootEl) return false;
    var tabs = rootEl.querySelectorAll("[data-pricing-tab]");
    var panels = rootEl.querySelectorAll("[data-pricing-panel]");
    var found = false;
    panels.forEach(function (panel) {
      if (panel.getAttribute("data-pricing-panel") === tabKey) found = true;
    });
    if (!found) return false;
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
    return true;
  }

  function bindTabs(rootEl, options) {
    var wrap = rootEl.querySelector("[data-pricing-tabs]");
    if (!wrap) return null;

    var tabs = Array.prototype.slice.call(wrap.querySelectorAll("[data-pricing-tab]"));
    function select(key) {
      if (activateTab(rootEl, key) && options && typeof options.onTabChange === "function") {
        options.onTabChange(key);
      }
    }

    wrap.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-pricing-tab]");
      if (!btn || !wrap.contains(btn)) return;
      select(btn.getAttribute("data-pricing-tab"));
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
      select(tabs[nextIdx].getAttribute("data-pricing-tab"));
    });

    document.addEventListener("click", function (e) {
      var link = e.target.closest("[data-pricing-open-tab]");
      if (!link) return;
      var key = link.getAttribute("data-pricing-open-tab");
      if (key) select(key);
    });

    return {
      activate: function (tabKey) {
        return activateTab(rootEl, tabKey);
      }
    };
  }

  // Show one billing mode. The mount carries data-billing; CSS hides the other
  // mode's groups. keepInView: the element whose position on screen should not
  // jump when the content above or around it changes height.
  function setBilling(rootEl, mode, keepInView) {
    if (!rootEl || (mode !== "one-time" && mode !== "monthly")) return false;
    var before = keepInView ? keepInView.getBoundingClientRect().top : 0;
    rootEl.setAttribute("data-billing", mode);
    var sw = rootEl.querySelector("[data-billing-switch]");
    if (sw) sw.setAttribute("aria-checked", mode === "monthly" ? "true" : "false");
    rootEl.querySelectorAll(".pr-billing__label").forEach(function (el) {
      el.classList.toggle("is-active", el.getAttribute("data-billing-set") === mode);
    });
    if (keepInView) {
      var after = keepInView.getBoundingClientRect().top;
      if (after !== before) window.scrollBy(0, after - before);
    }
    return true;
  }

  // The service section the visitor is reading: the one crossing a line a
  // third of the way down the screen (or just under the pinned switch).
  function serviceInView(rootEl) {
    var bar = rootEl.querySelector(".pr-billing-bar");
    var line = Math.max(bar ? bar.getBoundingClientRect().bottom : 0, window.innerHeight * 0.3);
    var sections = rootEl.querySelectorAll(".pr-service");
    for (var i = 0; i < sections.length; i++) {
      var r = sections[i].getBoundingClientRect();
      if (r.height && r.top <= line && r.bottom > line) return sections[i];
    }
    return null;
  }

  function bindBilling(rootEl, options) {
    if (!rootEl.querySelector("[data-billing-switch]")) return;
    function change(mode, how) {
      if (rootEl.getAttribute("data-billing") === mode) return;
      var service = how && how.scrollTo ? how.scrollTo : serviceInView(rootEl);
      // Header still on screen: keep it where it is. Scrolled past it: jump
      // back to the header so the other mode's cards start in view.
      var headerVisible = service && service.getBoundingClientRect().top >= 0 && !(how && how.scrollTo);
      setBilling(rootEl, mode, headerVisible ? service : null);
      if (service && !headerVisible) service.scrollIntoView({ block: "start" });
      if (typeof options.onBillingChange === "function") options.onBillingChange(mode);
    }
    rootEl.addEventListener("click", function (e) {
      var sw = e.target.closest("[data-billing-switch]");
      if (sw && rootEl.contains(sw)) {
        change(rootEl.getAttribute("data-billing") === "monthly" ? "one-time" : "monthly");
        return;
      }
      var set = e.target.closest("[data-billing-set]");
      if (!set || !rootEl.contains(set)) return;
      var scrollId = set.getAttribute("data-billing-scroll");
      change(set.getAttribute("data-billing-set"), scrollId ? { scrollTo: document.getElementById(scrollId) } : null);
    });
  }

  function mountPricing(rootEl, data, options) {
    if (!rootEl || !data) return null;

    options = options || {};
    options.layout = options.layout || "full";

    rootEl.innerHTML = buildPricingHtml(data, options);
    var tabApi = bindTabs(rootEl, options);
    if (options.billingToggle) {
      setBilling(rootEl, options.billing === "monthly" ? "monthly" : "one-time");
      bindBilling(rootEl, options);
    }

    return {
      refresh: function () {
        var mode = rootEl.getAttribute("data-billing");
        rootEl.innerHTML = buildPricingHtml(data, options);
        tabApi = bindTabs(rootEl, options);
        if (mode) setBilling(rootEl, mode);
      },
      activateTab: function (tabKey) {
        return tabApi ? tabApi.activate(tabKey) : false;
      },
      setBilling: function (mode) {
        return setBilling(rootEl, mode);
      },
      billing: function () {
        return rootEl.getAttribute("data-billing");
      }
    };
  }

  global.SwftPricing = {
    mountPricing: mountPricing,
    buildPricingHtml: buildPricingHtml,
    activateTab: activateTab,
    setBilling: setBilling,
    renderFaqList: renderFaqList,
    renderFaqSchema: renderFaqSchema
  };
})(window);
