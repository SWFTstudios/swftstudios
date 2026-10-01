/* ============================================================
   Pricing page renderer (website-pricing.html, css/pricing-detail.css).
   Everything comes from data/pricing.json, so prices, counts and scope
   live in one place:
     - compare table (all packages side by side)
     - package cards: price, quantity tiles, what you get / you provide /
       not included
     - priced extras, how it works, how we keep pricing fair
   The homepage uses its own compact cards (js/pricing-render.js).
   ============================================================ */
(function (global) {
  "use strict";

  var ICONS = {
    pages: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9h16M9 9v11"/>',
    photo: '<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13.5" r="3.3"/>',
    video: '<rect x="3" y="6.5" width="13" height="11" rx="2"/><path d="M16 10.5l5-3v9l-5-3z"/>',
    shoot: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    user: '<circle cx="12" cy="8" r="3.4"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>'
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function icon(name, cls) {
    return '<svg class="pp-ico ' + (cls || "") + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + ICONS[name] + "</svg>";
  }

  /* "Up to 3 hrs / mo" -> { lead: "Up to", num: "3", unit: "hrs", per: "/ mo" }; "—" -> null */
  function parseStat(s) {
    var m = String(s || "").match(/^(Up to )?(\d+)\s*([A-Za-z]*)(?:\s*\/\s*(mo))?$/);
    if (!m) return null;
    return { lead: m[1] ? "Up to" : "", num: m[2], unit: m[3] || "", per: m[4] ? "/ mo" : "" };
  }

  function priceParts(tier) {
    var amount = (String(tier.priceLabel || "").match(/\$[\d,]+/) || [""])[0];
    var notes = String(tier.priceNote || "").split("·").map(function (p) { return p.trim(); }).filter(Boolean);
    var monthly = tier.stripe && tier.stripe.mode === "subscription";
    return {
      amount: amount,
      per: monthly ? "/ month" : "one-time",
      note: notes.slice(1).join(" · ")
    };
  }

  /* ---------- Package card ---------- */

  function tileHtml(label, value, iconName) {
    var s = parseStat(value);
    if (!s) {
      return '<li class="pp-tile is-off">' + icon(iconName) +
        '<span class="pp-tile__value" aria-hidden="true">&mdash;</span>' +
        '<span class="pp-tile__label">' + esc(label) + '<span class="pp-tile__off"> &middot; not included</span></span></li>';
    }
    return '<li class="pp-tile">' + icon(iconName) +
      '<span class="pp-tile__value">' +
        (s.lead ? '<small class="pp-tile__lead">' + esc(s.lead) + "</small>" : "") +
        esc(s.num) +
        (s.unit ? '<small class="pp-tile__unit">' + esc(s.unit) + "</small>" : "") +
        (s.per ? '<small class="pp-tile__unit">' + esc(s.per) + "</small>" : "") +
      "</span>" +
      '<span class="pp-tile__label">' + esc(label) + "</span></li>";
  }

  function listHtml(items, kind, iconName) {
    return '<ul class="pp-list pp-list--' + kind + '" role="list">' + (items || []).map(function (t) {
      return "<li>" + icon(iconName) + "<span>" + esc(t) + "</span></li>";
    }).join("") + "</ul>";
  }

  function cardHtml(tier, groupId) {
    var c = tier.compare || {};
    var pr = priceParts(tier);
    var badge = tier.featured ? '<span class="pp-card__badge">' + esc(tier.badge || "Featured") + "</span>" : "";
    var calUrl = (global.SwftPricingConfig && global.SwftPricingConfig.calUrl) || "/growth-audit";
    var href = tier.bookUrl || (calUrl + (calUrl.indexOf("?") === -1 ? "?" : "&") + "plan=" + encodeURIComponent(tier.id));
    var btn = "button is-course w-inline-block" + (tier.featured ? "" : " outlined");
    var monthly = pr.per !== "one-time";

    return '<article class="pp-card' + (tier.featured ? " pp-card--featured" : "") + '" id="' + esc(tier.id) + '" data-tier-id="' + esc(tier.id) + '">' +
      badge +
      '<header class="pp-card__head">' +
        '<p class="pp-card__stage">' + esc(tier.bestFor || "") + "</p>" +
        '<h3 class="pp-card__name">' + esc(tier.name) + "</h3>" +
        '<p class="pp-card__price"><span class="pp-card__from">Starting at</span>' +
          '<span class="pp-card__amount">' + esc(pr.amount) + "</span>" +
          '<span class="pp-card__per">' + esc(pr.per) + "</span></p>" +
        (pr.note ? '<p class="pp-card__note">' + esc(pr.note) + "</p>" : "") +
        '<p class="pp-card__desc">' + esc(tier.description || "") + "</p>" +
      "</header>" +
      '<ul class="pp-tiles" aria-label="What is included' + (monthly ? " each month" : "") + '">' +
        tileHtml("Website pages", c.pages, "pages") +
        tileHtml("Edited photos", c.photos, "photo") +
        tileHtml("Short videos", c.videos, "video") +
        tileHtml("On-site shoot", c.shoot, "shoot") +
      "</ul>" +
      '<section class="pp-block" aria-labelledby="' + esc(tier.id) + '-get">' +
        '<h4 class="pp-block__title" id="' + esc(tier.id) + '-get">What you get</h4>' +
        listHtml(tier.includes, "yes", "check") +
      "</section>" +
      '<div class="pp-split">' +
        '<section class="pp-block pp-block--panel" aria-labelledby="' + esc(tier.id) + '-you">' +
          '<h4 class="pp-block__title" id="' + esc(tier.id) + '-you">What you provide</h4>' +
          listHtml(tier.youProvide, "you", "user") +
        "</section>" +
        '<section class="pp-block pp-block--panel" aria-labelledby="' + esc(tier.id) + '-no">' +
          '<h4 class="pp-block__title" id="' + esc(tier.id) + '-no">Not included</h4>' +
          listHtml(tier.notIncluded, "no", "x") +
        "</section>" +
      "</div>" +
      '<footer class="pp-card__foot">' +
        '<a href="' + esc(href) + '" class="' + btn + '" data-stripe-tier="' + esc(groupId + ":" + tier.id) + '" data-plan="' + esc(tier.id) + '">' +
          '<div class="button_bg"></div><div class="button_text">' + esc(tier.cta || "Get started") + "</div></a>" +
        (tier.checkoutNote ? '<p class="pp-card__fine">' + esc(tier.checkoutNote) + "</p>" : "") +
      "</footer>" +
    "</article>";
  }

  function groupHtml(group, anchorId, heading) {
    if (!group || !group.tiers || !group.tiers.length) return "";
    return '<section class="pp-section" id="' + anchorId + '" aria-labelledby="' + anchorId + '-h">' +
      '<header class="pp-section__head">' +
        '<p class="pp-section__eyebrow">' + esc(group.label || "") + "</p>" +
        '<h2 id="' + anchorId + '-h" class="pp-section__title">' + esc(heading) + "</h2>" +
        '<p class="pp-section__intro">' + esc(group.intro || "") + "</p>" +
      "</header>" +
      '<div class="pp-cards">' + group.tiers.map(function (t) { return cardHtml(t, group.id); }).join("") + "</div>" +
    "</section>";
  }

  /* ---------- Compare table ---------- */

  function cellHtml(v, featured) {
    var off = !v || v === "—";
    var cls = [off ? "is-off" : "", featured ? "is-featured" : ""].filter(Boolean).join(" ");
    var open = "<td" + (cls ? ' class="' + cls + '"' : "") + ">";
    if (off) return open + '<span aria-hidden="true">&mdash;</span><span class="visually-hidden">Not included</span></td>';
    return open + esc(v) + "</td>";
  }

  function compareHtml(data) {
    var one = data.projectTiers.tiers, mo = data.ongoingTiers.tiers, all = one.concat(mo);
    var rows = data.compareRows || [];

    var head1 = '<tr><td class="pp-table__corner"></td>' +
      '<th scope="colgroup" colspan="' + one.length + '" class="pp-table__group">One-time projects</th>' +
      '<th scope="colgroup" colspan="' + mo.length + '" class="pp-table__group pp-table__group--mo">Monthly plans</th></tr>';

    var head2 = '<tr><th scope="col" class="pp-table__corner"><span class="visually-hidden">Package</span></th>' + all.map(function (t) {
      var pr = priceParts(t);
      return '<th scope="col" class="pp-table__pkg' + (t.featured ? " is-featured" : "") + '">' +
        '<a href="#' + esc(t.id) + '" class="pp-table__name">' + esc(t.name) + "</a>" +
        (t.featured ? '<span class="pp-table__badge">' + esc(t.badge || "Featured") + "</span>" : "") +
        '<span class="pp-table__price"><small>from</small> ' + esc(pr.amount) + "<small>" + (pr.per === "one-time" ? "" : " / mo") + "</small></span>" +
      "</th>";
    }).join("") + "</tr>";

    var body = rows.map(function (r) {
      return '<tr><th scope="row">' + esc(r.label) + "</th>" + all.map(function (t) {
        return cellHtml((t.compare || {})[r.key], t.featured);
      }).join("") + "</tr>";
    }).join("");

    return '<section class="pp-section" id="compare" aria-labelledby="compare-h">' +
      '<header class="pp-section__head">' +
        '<h2 id="compare-h" class="pp-section__title">Compare packages</h2>' +
        '<p class="pp-section__intro">Every number below is what the starting price includes. Figures marked &ldquo;/ mo&rdquo; reset each month.</p>' +
      "</header>" +
      '<div class="pp-table-wrap" role="region" aria-label="Package comparison table. Scroll sideways on small screens." tabindex="0">' +
        '<table class="pp-table"><caption class="visually-hidden">What each SWFT package includes</caption>' +
        "<thead>" + head1 + head2 + "</thead><tbody>" + body + "</tbody></table>" +
      "</div>" +
      '<p class="pp-swipe" aria-hidden="true">Swipe the table to compare &rarr;</p>' +
      (data.compareNote ? '<p class="pp-note">' + esc(data.compareNote) + "</p>" : "") +
    "</section>";
  }

  /* ---------- Extras ---------- */

  function extrasHtml(data) {
    var ex = data.extras;
    if (!ex) return "";
    var items = (ex.priced || []).map(function (e) {
      return '<li class="pp-extra"><span class="pp-extra__group">' + esc(e.group) + "</span>" +
        '<span class="pp-extra__label">' + esc(e.label) + "</span>" +
        '<span class="pp-extra__price">$' + esc(e.price) + "<small> " + esc(e.unit) + "</small></span>" +
        '<span class="pp-extra__detail">' + esc(e.detail) + "</span></li>";
    }).join("");
    var quoted = (ex.quoted || []).map(function (q) { return "<li>" + esc(q.label) + "</li>"; }).join("");

    return '<section class="pp-section" id="extras" aria-labelledby="extras-h">' +
      '<header class="pp-section__head">' +
        '<h2 id="extras-h" class="pp-section__title">Optional extras</h2>' +
        '<p class="pp-section__intro">' + esc(ex.intro || "") + "</p>" +
      "</header>" +
      '<ul class="pp-extras" role="list">' + items + "</ul>" +
      '<div class="pp-quoted"><h3 class="pp-extras__title">' + esc(ex.quotedTitle || "Quoted individually") + '</h3><ul class="pp-chips" role="list">' + quoted + "</ul></div>" +
    "</section>";
  }

  /* ---------- How it works + promises ---------- */

  function stepsHtml(data) {
    var h = data.howItWorks;
    if (!h) return "";
    return '<section class="pp-section" id="how-it-works" aria-labelledby="how-h">' +
      '<header class="pp-section__head"><h2 id="how-h" class="pp-section__title">' + esc(h.title) + "</h2></header>" +
      '<ol class="pp-steps">' + h.steps.map(function (s, i) {
        return '<li class="pp-step"><span class="pp-step__num" aria-hidden="true">' + String(i + 1).padStart(2, "0") + "</span>" +
          '<h3 class="pp-step__title">' + esc(s.title) + "</h3><p>" + esc(s.text) + "</p></li>";
      }).join("") + "</ol></section>";
  }

  function promisesHtml(data) {
    var p = data.promises;
    if (!p) return "";
    return '<section class="pp-section" id="fair" aria-labelledby="fair-h">' +
      '<header class="pp-section__head"><h2 id="fair-h" class="pp-section__title">' + esc(p.title) + "</h2></header>" +
      '<ul class="pp-promises" role="list">' + p.items.map(function (i) {
        return "<li>" + icon("check", "pp-promises__ico") + "<div><h3>" + esc(i.title) + "</h3><p>" + esc(i.text) + "</p></div></li>";
      }).join("") + "</ul></section>";
  }

  function jumpHtml() {
    var links = [["compare", "Compare"], ["project-tiers", "One-time projects"], ["ongoing", "Monthly plans"], ["extras", "Extras"], ["how-it-works", "How it works"], ["faq", "FAQ"]];
    return '<nav class="pp-jump" aria-label="On this page">' + links.map(function (l) {
      return '<a href="#' + l[0] + '">' + l[1] + "</a>";
    }).join("") + "</nav>";
  }

  function mount(root, data) {
    if (!root || !data) return;
    root.innerHTML =
      jumpHtml() +
      compareHtml(data) +
      groupHtml(data.projectTiers, "project-tiers", "One-time projects") +
      groupHtml(data.ongoingTiers, "ongoing", "Monthly plans") +
      extrasHtml(data) +
      stepsHtml(data) +
      promisesHtml(data);
  }

  global.SwftPricingDetail = { mount: mount, parseStat: parseStat, priceParts: priceParts };
})(window);
