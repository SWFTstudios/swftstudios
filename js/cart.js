/* ============================================================
   SWFT shop cart. Loaded on every page by js/swft-nav.js.
   - Any [data-cart-add="<offer id>"] button adds that service to the cart
     (saved in this browser) and opens a pop-up with add-on suggestions.
   - A small "Cart" pill shows bottom-right while the cart has items.
   - /cart.html (#cart-root): review, itemized totals, details, then Stripe
     Checkout via POST /api/checkout. Admins also get "Create free order".
   Prices and payment terms (paid in full, deposit, monthly) come from
   /data/pricing.json + /data/addons.json through js/swft-pricing.js, the same
   rules the builder uses. The server re-prices everything from its own copy
   before charging.
   ============================================================ */
(function () {
  "use strict";
  if (window.SWFTCart) return;
  var KEY = "swft-cart";
  var INTENT_KEY = "swft-cart-brief";
  var PRICING_SRC = "/js/swft-pricing.js?v=20261116";
  var CAL = "https://cal.com/swftstudios/swft-meeting";

  // What to suggest after adding each service (only services you can buy online)
  var UPSELLS = {
    "website-only": ["extra-pages", "photo-session", "gbp-refresh", "lead-follow-up"],
    "website-content-half": ["extra-photos", "extra-reels", "lead-follow-up", "website-care"],
    "website-content-full": ["extra-photos", "extra-reels", "lead-follow-up", "analytics-setup"],
    "app-design-sprint": ["app-care", "analytics-setup"],
    "gbp-refresh": ["location-profiles", "local-page", "website-only"],
    "ads-management": ["analytics-setup", "lead-follow-up", "short-form-pack"],
    "full-growth-partner": ["analytics-reporting", "lead-follow-up"],
    "photo-session": ["extra-photos", "social-setup", "short-form-pack"],
    "product-photos": ["short-form-pack", "social-setup"],
    "short-form-pack": ["extra-reels", "extra-shoot", "social-setup"],
    "brand-film": ["extra-reels", "raw-assets", "ads-management"],
    "social-setup": ["managed-social", "photo-session"],
    "livestream-single": ["short-form-pack"],
    "livestream-multi": ["short-form-pack", "brand-film"],
    "lead-follow-up": ["automation-care", "analytics-setup"],
    "analytics-setup": ["analytics-reporting", "lead-follow-up"]
  };
  var DEFAULT_UPSELLS = ["lead-follow-up", "analytics-setup", "gbp-refresh"];

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function usd(c) { return "$" + (c / 100).toLocaleString("en-US", { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 }); }
  function read() { try { var a = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function write(a) { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) { /* private mode: cart lasts this page only */ } memory = a; paint(); }
  var memory = null;
  function items() { var a = read(); return a.length || memory === null ? a : memory; }
  function track(n, d) { try { if (window.SWFTAnalytics) window.SWFTAnalytics.track(n, d || {}); } catch (e) { /* optional */ } }

  /* ---------- Catalog (from the public pricing data) ---------- */
  var catalogP = null, cachedCatalog = {};
  function pricingLib() {
    if (window.SWFTPricing) return Promise.resolve(window.SWFTPricing);
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = PRICING_SRC; s.async = true;
      s.onload = function () { window.SWFTPricing ? resolve(window.SWFTPricing) : reject(Error("Pricing unavailable")); };
      s.onerror = function () { reject(Error("Pricing unavailable")); };
      document.head.appendChild(s);
    });
  }
  function catalog() {
    if (!catalogP) {
      catalogP = Promise.all([pricingLib()].concat(["/data/pricing.json", "/data/addons.json"].map(function (url) { return fetch(url, { credentials: "same-origin" }).then(function (r) { if (!r.ok) throw Error("Catalog unavailable"); return r.json(); }); }))).then(function (data) {
        var map = data[0].buildCatalog(data[1], data[2]);
        Object.keys(map).forEach(function (id) { if (map[id].addon) map[id].priceLabel = usd(map[id].priceCents) + " one-time"; });
        cachedCatalog = map;
        return map;
      }).catch(function () { catalogP = null; return cachedCatalog; });
    }
    return catalogP;
  }
  function quote(ids, cat) { return window.SWFTPricing.quote(ids, cat || cachedCatalog); }
  function termsLine(o, list, cat) {
    if (o.monthly) return usd(o.priceCents) + " a month, first month today.";
    var line = window.SWFTPricing ? quote(list.indexOf(o.id) === -1 ? list.concat(o.id) : list, cat).lines.filter(function (l) { return l.id === o.id; })[0] : null;
    if (!line) return usd(o.priceCents) + ".";
    return line.pay === "deposit"
      ? usd(line.dueNowCents) + " today (" + line.percent + "% deposit of " + usd(line.totalCents) + ")."
      : usd(line.totalCents) + " today, paid in full.";
  }

  function eligible(id, list, cat) {
    return window.SWFTPricing ? window.SWFTPricing.eligible(id, list, cat) : !!cat[id] && !cat[id].addon;
  }
  function add(id) {
    var a = items().slice();
    if (cachedCatalog[id] && !eligible(id, a, cachedCatalog)) return false;
    if (a.indexOf(id) === -1 && a.length < 12) a.push(id);
    write(a);
    track("cart_add", { item: id });
    return true;
  }
  function saveBrief(brief) {
    if (!brief || typeof brief !== "object") return;
    var clean = {};
    ["service","goal","goalName","serviceName","tierId"].forEach(function (key) {
      clean[key] = String(brief[key] || "").slice(0,120).replace(/[<>]/g,"");
    });
    try { localStorage.setItem(INTENT_KEY,JSON.stringify(clean)); } catch(e) { /* optional */ }
  }
  function readBrief() {
    try { return JSON.parse(localStorage.getItem(INTENT_KEY) || "null"); } catch(e) { return null; }
  }
  function addMany(ids, brief) {
    return catalog().then(function (cat) {
      var next = items().slice();
      ids.filter(function (x) { return cat[x] && !cat[x].addon; }).forEach(function (x) { if (next.indexOf(x) === -1) next.push(x); });
      ids.filter(function (x) { return cat[x] && cat[x].addon; }).forEach(function (x) { if (next.indexOf(x) === -1 && eligible(x, next, cat)) next.push(x); });
      if (next.length > 12 || ids.some(function (x) { return !cat[x] || !eligible(x, next, cat); })) {
        throw Error("Review your selections. Every extra needs an eligible service, with up to 12 line items per order.");
      }
      write(next);
      saveBrief(brief);
      ids.forEach(function (id) { track("cart_add", { item: id }); });
      return next;
    });
  }
  function remove(id) {
    var next = items().filter(function (x) { return x !== id; });
    next = next.filter(function (x) { return eligible(x, next, cachedCatalog); });
    var brief = readBrief();
    if (brief && next.indexOf(brief.tierId) === -1) { try { localStorage.removeItem(INTENT_KEY); } catch(e){} }
    write(next);
  }

  /* ---------- Floating cart pill ---------- */
  var pill;
  function paint() {
    var n = items().length;
    document.querySelectorAll("[data-cart-count]").forEach(function (el) { el.textContent = String(n); });
    if (/^\/cart(\.html)?$/.test(location.pathname)) return;
    if (!pill) {
      pill = document.createElement("a");
      pill.className = "cart-pill";
      pill.href = "/cart.html";
      document.body.appendChild(pill);
    }
    pill.hidden = !n;
    pill.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h2l2 10h10l2-7H7"/><circle cx="9.5" cy="19" r="1.3"/><circle cx="17" cy="19" r="1.3"/></svg>' +
      "<span>Cart</span><b>" + n + '</b><span class="mf-visually-hidden"> items</span>';
  }

  /* ---------- Added + suggestions pop-up ---------- */
  var overlay = null, lastFocus = null;
  function closePop() {
    if (!overlay) return;
    var o = overlay; overlay = null;
    o.classList.remove("is-open");
    document.documentElement.classList.remove("sn-locked");
    setTimeout(function () { o.remove(); }, 250);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function suggestionsFor(id, cat) {
    var have = items();
    return (UPSELLS[id] || DEFAULT_UPSELLS).filter(function (x) { return eligible(x, have, cat) && have.indexOf(x) === -1; }).slice(0, 3);
  }
  function suggestionHTML(o) {
    return '<li class="cart-sugg"><div><b>' + esc(o.name) + "</b><span>" + esc(o.priceLabel) + "</span></div>" +
      '<button type="button" class="mf-btn mf-btn--sm mf-btn--ghost" data-cart-sugg="' + esc(o.id) + '">Add</button></li>';
  }
  function openPop(id) {
    catalog().then(function (cat) {
      var o = cat[id];
      if (!o) return;
      closePop();
      lastFocus = document.activeElement;
      var sugg = suggestionsFor(id, cat).map(function (x) { return cat[x]; });
      overlay = document.createElement("div");
      overlay.className = "sc-overlay";
      overlay.innerHTML =
        '<div class="sc-dialog cart-pop" role="dialog" aria-modal="true" aria-labelledby="cart-pop-title">' +
          '<button type="button" class="sc-close" aria-label="Close">×</button>' +
          '<p class="sc-tag"><span class="mf-dot" aria-hidden="true"></span>Added to your cart</p>' +
          '<h2 class="sc-title" id="cart-pop-title">' + esc(o.name) + "</h2>" +
          '<p class="sc-body">' + esc(termsLine(o, items(), cat)) + "</p>" +
          (sugg.length ? '<p class="cart-pop__label">Often added with it</p><ul class="cart-suggs">' + sugg.map(suggestionHTML).join("") + "</ul>" : "") +
          '<a class="mf-btn sc-go" href="/cart.html">View cart <span class="mf-arrow" aria-hidden="true">→</span></a>' +
          '<button type="button" class="sc-later">Keep browsing</button>' +
        "</div>";
      document.body.appendChild(overlay);
      document.documentElement.classList.add("sn-locked");
      requestAnimationFrame(function () { if (overlay) overlay.classList.add("is-open"); });
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay || e.target.closest(".sc-close, .sc-later")) closePop();
        var s = e.target.closest("[data-cart-sugg]");
        if (s) { add(s.getAttribute("data-cart-sugg")); s.textContent = "Added"; s.disabled = true; track("cart_upsell_add", { item: s.getAttribute("data-cart-sugg"), from: id }); }
      });
      var go = overlay.querySelector(".sc-go"); if (go) go.focus();
    });
  }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && overlay) closePop(); });
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-cart-add]");
    if (!b) return;
    e.preventDefault();
    var id = b.getAttribute("data-cart-add");
    add(id);
    b.classList.add("is-added");
    var label = b.querySelector("[data-cart-label]") || b;
    label.textContent = "In your cart";
    openPop(id);
  });

  /* ---------- Itemized summary (shared by cart page) ---------- */
  function summaryRows(q) {
    var row = function (label, value, cls) { return '<div class="cart-sum__row' + (cls ? " " + cls : "") + '"><span>' + label + "</span><b>" + value + "</b></div>"; };
    return (q.packageCents ? row("Packages", usd(q.packageCents)) : "") +
      (q.extrasCents ? row("Extras", usd(q.extrasCents)) : "") +
      (q.oneTimeCents && q.extrasCents && q.packageCents ? row("One-time total", usd(q.oneTimeCents)) : "") +
      (q.monthlyCents ? row("Monthly plans", usd(q.monthlyCents) + "/mo") : "") +
      row("Due today", usd(q.dueNowCents), "cart-sum__row--due") +
      (q.laterCents ? row("Balance, invoiced before delivery", usd(q.laterCents)) : "");
  }
  function termsNote(q) {
    var parts = [];
    if (q.lines.some(function (l) { return l.pay === "full"; })) parts.push("Paid-in-full items are charged in full today.");
    if (q.hasDeposit) parts.push("Deposit items are charged a deposit today; the balance is invoiced before delivery.");
    if (q.hasMonthly) parts.push("Monthly plans start with the first month today.");
    return parts.join(" ");
  }

  /* ---------- /cart.html ---------- */
  function renderCartPage(root) {
    var list = root.querySelector("[data-cart-lines]");
    var sum = root.querySelector("[data-cart-summary]");
    var sug = root.querySelector("[data-cart-suggs]");
    var form = root.querySelector("#cart-form");
    var status = root.querySelector("#cart-status");
    var empty = root.querySelector("[data-cart-empty]");
    var full = root.querySelector("[data-cart-full]");
    var compBtn = root.querySelector("#cart-comp");
    if (/status=cancel/.test(location.search)) { status.hidden = false; status.className = "mf-status is-info"; status.textContent = "Checkout was cancelled. Your cart is still here."; }

    function draw() {
      catalog().then(function (cat) {
        var ids = items().filter(function (id) { return cat[id]; });
        empty.hidden = !!ids.length; full.hidden = !ids.length;
        if (!ids.length) return;
        var q = quote(ids, cat);
        list.innerHTML = q.lines.map(function (l) {
          var o = cat[l.id];
          return '<li class="cart-line"><div class="cart-line__main"><p class="mf-label mf-label--muted">' + esc(o.category) + (l.monthly ? " · Monthly" : " · One-time") + "</p>" +
            '<h3><a href="' + esc(o.url) + '">' + esc(o.name) + "</a></h3><p>" + (l.monthly ? usd(l.totalCents) + "/mo" : usd(l.totalCents) + (l.kind === "addon" ? " add-on" : "")) + "</p></div>" +
            '<div class="cart-line__money"><b>' + usd(l.dueNowCents) + '</b><span>' + esc(window.SWFTPricing.termsLabel(l)) + "</span>" +
            '<button type="button" class="cart-line__remove" data-cart-remove="' + esc(o.id) + '" aria-label="Remove ' + esc(o.name) + '">Remove</button></div></li>';
        }).join("");
        var brief = readBrief();
        var briefLine = brief && ids.indexOf(brief.tierId) !== -1
          ? '<p class="cart-sum__note"><strong>Your project type:</strong> ' + esc(brief.goalName || brief.goal) + ' · ' + esc(brief.serviceName || brief.service) + '. <a href="/build.html?service='+encodeURIComponent(brief.service || "")+'&amp;resume=1">Edit choices</a></p>'
          : "";
        sum.innerHTML = briefLine + summaryRows(q) +
          '<p class="cart-sum__note">' + termsNote(q) + ' Scope changes are quoted before work starts. Have a discount code? Enter it on the payment page.</p>';
        var pay = root.querySelector("#cart-pay");
        if (pay) pay.innerHTML = (q.hasDeposit ? "Pay deposit &amp; continue" : "Continue to secure checkout") + ' <span class="mf-arrow" aria-hidden="true">↗</span>';
        // Suggestions from everything in the cart
        var pool = [];
        ids.forEach(function (id) { (UPSELLS[id] || DEFAULT_UPSELLS).forEach(function (x) { if (eligible(x, ids, cat) && ids.indexOf(x) === -1 && pool.indexOf(x) === -1) pool.push(x); }); });
        sug.parentNode.hidden = !pool.length;
        sug.innerHTML = pool.slice(0, 4).map(function (x) { return suggestionHTML(cat[x]); }).join("");
      });
    }
    root.addEventListener("click", function (e) {
      var r = e.target.closest("[data-cart-remove]");
      if (r) { remove(r.getAttribute("data-cart-remove")); draw(); return; }
      var s = e.target.closest("[data-cart-sugg]");
      if (s) { add(s.getAttribute("data-cart-sugg")); draw(); }
    });

    function submit(comp) {
      var v = function (n) { return (form.elements[n].value || "").trim(); };
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v("email"))) { status.hidden = false; status.className = "mf-status is-error"; status.textContent = "Enter a valid email address."; form.elements.email.focus(); return; }
      if (comp && !confirm("Create a free order for " + v("email") + "? No payment is taken.")) return;
      var btns = root.querySelectorAll("#cart-pay, #cart-comp");
      btns.forEach(function (b) { b.disabled = true; });
      status.hidden = false; status.className = "mf-status is-info"; status.textContent = comp ? "Creating the order…" : "Opening secure checkout…";
      var brief = readBrief();
      var briefNote = brief && items().indexOf(brief.tierId) !== -1
        ? "Chosen project: " + (brief.serviceName||brief.service) + " / " + (brief.goalName||brief.goal) + ".\n"
        : "";
      fetch("/api/checkout", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ items: items(), email: v("email"), name: v("name"), business: v("business"), notes: (briefNote+v("notes")).slice(0,1500), comp: !!comp })
      }).then(function (r) { return r.json().catch(function () { return {}; }); }).then(function (d) {
        btns.forEach(function (b) { b.disabled = false; });
        if (d.ok && d.url) { track(comp ? "cart_comp" : "cart_checkout", { items: items().length }); if (comp) write([]); location.href = d.url; return; }
        status.className = "mf-status is-error";
        status.innerHTML = esc(d.error || "Checkout couldn't start. Try again.") + (d.code === "checkout_unavailable" ? ' <a class="mf-link" href="' + CAL + '" target="_blank" rel="noopener">Book a call</a>' : "");
      }, function () { btns.forEach(function (b) { b.disabled = false; }); status.className = "mf-status is-error"; status.textContent = "You look offline. Try again in a moment."; });
    }
    form.addEventListener("submit", function (e) { e.preventDefault(); submit(false); });
    if (compBtn) {
      compBtn.addEventListener("click", function () { submit(true); });
      fetch("/api/portal/me", { credentials: "same-origin" }).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) { if (d && d.ok && d.user) { if (d.user.isAdmin) compBtn.hidden = false; if (!form.elements.email.value) form.elements.email.value = d.user.email || ""; } })
        .catch(function () { /* signed out */ });
    }
    draw();
  }

  window.SWFTCart = { add: add, addMany: addMany, remove: remove, items: items, catalog: catalog, quote: quote, open: openPop };
  function init() {
    paint();
    var root = document.getElementById("cart-root");
    if (root) renderCartPage(root);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  window.addEventListener("storage", function (e) { if (e.key === KEY) paint(); });
})();
