/* ============================================================
   SWFT pricing rules (browser + Node). One source of truth for what the
   builder and cart show, so they can never disagree with each other.
   The server (functions/_lib/shop.js) applies the same rules to its own
   copy of the catalog and is what actually charges; tests keep them in sync.

   Payment terms come from each offer's `pay` in data/pricing.json:
     - full     → whole price due today
     - deposit  → pay.percent (e.g. 50%) today, the balance invoiced before delivery
     - monthly  → first month today, then monthly
   Add-ons (data/addons.json) inherit the terms of the qualifying package(s)
   in the same order: if any qualifying package is a deposit package, the
   add-on uses that deposit percent; otherwise it is paid in full. An add-on
   with no qualifying package in the order is not purchasable.
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SWFTPricing = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function depositDue(totalCents, percent) { return Math.round((totalCents * percent) / 100); }

  /** Build {id: entry} from the public pricing + add-on data. Quote-only offers are skipped. */
  function buildCatalog(pricing, addonData) {
    var map = {};
    ((pricing && pricing.categories) || []).forEach(function (cat) {
      (cat.services || []).forEach(function (s) {
        (s.offers || []).forEach(function (o) {
          if (!o.pay || !o.priceCents || !o.stripe) return; // quote-first offers can't be bought online
          var type = o.pay.type === "monthly" ? "monthly" : o.pay.type === "deposit" ? "deposit" : "full";
          map[o.id] = {
            id: o.id, name: o.name, kind: "package", pay: type,
            percent: type === "deposit" ? Number(o.pay.percent) || 50 : 100,
            monthly: type === "monthly", priceCents: o.priceCents,
            priceLabel: o.priceLabel || "", desc: o.description || "",
            category: cat.label, url: o.bookUrl || "/pricing.html#" + o.id
          };
        });
      });
    });
    ((addonData && addonData.addons) || []).forEach(function (a) {
      map[a.id] = {
        id: a.id, name: a.name, kind: "addon", addon: true, monthly: false,
        requires: (a.requires || []).slice(), priceCents: a.priceCents,
        priceLabel: "", desc: a.description || "", category: a.category || "Add-on", url: "/build.html"
      };
    });
    return map;
  }

  /** True when `id` can be bought alongside the other ids in `list`. */
  function eligible(id, list, catalog) {
    var e = catalog[id];
    if (!e) return false;
    if (!e.addon) return true;
    return e.requires.some(function (base) { return list.indexOf(base) !== -1 && catalog[base] && !catalog[base].addon; });
  }

  /** Terms an add-on takes from the qualifying packages in `list`. */
  function addonTerms(addon, list, catalog) {
    var bases = addon.requires.filter(function (b) { return list.indexOf(b) !== -1 && catalog[b] && !catalog[b].addon; });
    if (!bases.length) return null;
    var deposit = bases.map(function (b) { return catalog[b]; }).filter(function (b) { return b.pay === "deposit"; });
    if (deposit.length) return { pay: "deposit", percent: Math.min.apply(null, deposit.map(function (b) { return b.percent; })) };
    return { pay: "full", percent: 100 };
  }

  /**
   * Price an order. Unknown ids and add-ons without a qualifying package are
   * reported, never priced. Packages are listed before add-ons.
   */
  function quote(ids, catalog) {
    var unique = [];
    (ids || []).forEach(function (id) { if (unique.indexOf(id) === -1) unique.push(id); });
    var unknownIds = unique.filter(function (id) { return !catalog[id]; });
    var known = unique.filter(function (id) { return catalog[id]; });
    var packages = known.filter(function (id) { return !catalog[id].addon; });
    var extras = known.filter(function (id) { return catalog[id].addon; });
    var invalidAddons = [];
    var lines = packages.map(function (id) {
      var p = catalog[id];
      var due = p.pay === "deposit" ? depositDue(p.priceCents, p.percent) : p.priceCents;
      return { id: id, name: p.name, kind: "package", pay: p.pay, percent: p.percent, monthly: p.monthly,
        totalCents: p.priceCents, dueNowCents: due, laterCents: p.monthly ? 0 : p.priceCents - due };
    });
    extras.forEach(function (id) {
      var a = catalog[id], t = addonTerms(a, packages, catalog);
      if (!t) { invalidAddons.push(id); return; }
      var due = t.pay === "deposit" ? depositDue(a.priceCents, t.percent) : a.priceCents;
      lines.push({ id: id, name: a.name, kind: "addon", pay: t.pay, percent: t.percent, monthly: false,
        totalCents: a.priceCents, dueNowCents: due, laterCents: a.priceCents - due });
    });
    var sum = function (key, f) { return lines.filter(f || function () { return true; }).reduce(function (n, l) { return n + l[key]; }, 0); };
    var oneTime = function (l) { return !l.monthly; };
    return {
      lines: lines, unknownIds: unknownIds, invalidAddons: invalidAddons,
      packageCents: sum("totalCents", function (l) { return l.kind === "package" && !l.monthly; }),
      extrasCents: sum("totalCents", function (l) { return l.kind === "addon"; }),
      oneTimeCents: sum("totalCents", oneTime),
      oneTimeDueNowCents: sum("dueNowCents", oneTime),
      monthlyCents: sum("totalCents", function (l) { return l.monthly; }),
      dueNowCents: sum("dueNowCents"),
      laterCents: sum("laterCents"),
      hasMonthly: lines.some(function (l) { return l.monthly; }),
      hasDeposit: lines.some(function (l) { return l.pay === "deposit"; })
    };
  }

  /** Short human label for a line's payment terms. */
  function termsLabel(line) {
    if (line.monthly) return "first month today";
    if (line.pay === "deposit") return line.percent + "% deposit today";
    return "paid in full today";
  }

  return { buildCatalog: buildCatalog, eligible: eligible, quote: quote, termsLabel: termsLabel };
});
