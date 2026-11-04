/* ============================================================
   SWFT shop cart. Loaded on every page by js/swft-nav.js.
   - Any [data-cart-add="<offer id>"] button adds that service to the cart
     (saved in this browser) and opens a pop-up with add-on suggestions.
   - A small "Cart" pill shows bottom-right while the cart has items.
   - /cart.html (#cart-root): review, totals (50% deposit today, monthly
     plans start with the first month), details, then Stripe Checkout via
     POST /api/checkout. Admins also get "Create free order".
   Prices shown here come from /data/pricing.json; the server re-prices
   everything from its own copy before charging.
   ============================================================ */
(function () {
  "use strict";
  if (window.SWFTCart) return;
  var KEY = "swft-cart";
  var DEPOSIT = 50;
  var CAL = "https://cal.com/swftstudios/swft-meeting";

  // What to suggest after adding each service (only services you can buy online)
  var UPSELLS = {
    "website-only": ["gbp-refresh", "photo-session", "lead-follow-up", "website-care"],
    "website-content-half": ["lead-follow-up", "analytics-setup", "website-care"],
    "website-content-full": ["lead-follow-up", "analytics-setup", "website-care"],
    "app-design-sprint": ["app-care", "analytics-setup"],
    "gbp-refresh": ["website-only", "photo-session", "lead-follow-up"],
    "ads-management": ["analytics-setup", "lead-follow-up", "short-form-pack"],
    "full-growth-partner": ["analytics-reporting", "lead-follow-up"],
    "photo-session": ["social-setup", "short-form-pack", "gbp-refresh"],
    "product-photos": ["short-form-pack", "social-setup"],
    "short-form-pack": ["social-setup", "ads-management"],
    "brand-film": ["short-form-pack", "ads-management"],
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
  var catalogP = null;
  function catalog() {
    if (!catalogP) {
      catalogP = fetch("/data/pricing.json", { credentials: "same-origin" }).then(function (r) { return r.json(); }).then(function (d) {
        var map = {};
        (d.categories || []).forEach(function (cat) {
          (cat.services || []).forEach(function (s) {
            (s.offers || []).forEach(function (o) {
              if (!o.pay || !o.priceCents) return; // quote-first offers can't be bought online
              var monthly = o.pay.type === "monthly";
              map[o.id] = {
                id: o.id, name: o.name, monthly: monthly, priceCents: o.priceCents,
                dueNow: monthly ? o.priceCents : Math.round(o.priceCents * DEPOSIT / 100),
                priceLabel: o.priceLabel || "", desc: o.description || "", category: cat.label, url: o.bookUrl || "/pricing.html#" + o.id
              };
            });
          });
        });
        return map;
      }).catch(function () { catalogP = null; return {}; });
    }
    return catalogP;
  }

  function add(id) {
    var a = items();
    if (a.indexOf(id) === -1) a.push(id);
    write(a);
    track("cart_add", { item: id });
  }
  function remove(id) { write(items().filter(function (x) { return x !== id; })); }

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
    return (UPSELLS[id] || DEFAULT_UPSELLS).filter(function (x) { return cat[x] && have.indexOf(x) === -1; }).slice(0, 3);
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
          '<p class="sc-body">' + (o.monthly ? usd(o.priceCents) + " a month, first month today." : usd(o.dueNow) + " today (50% deposit of " + usd(o.priceCents) + ").") + "</p>" +
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
        var lines = ids.map(function (id) { return cat[id]; });
        list.innerHTML = lines.map(function (o) {
          return '<li class="cart-line"><div class="cart-line__main"><p class="mf-label mf-label--muted">' + esc(o.category) + (o.monthly ? " · Monthly" : " · One-time") + "</p>" +
            '<h3><a href="' + esc(o.url) + '">' + esc(o.name) + "</a></h3><p>" + esc(o.priceLabel) + "</p></div>" +
            '<div class="cart-line__money"><b>' + usd(o.dueNow) + '</b><span>' + (o.monthly ? "first month today" : "deposit today") + "</span>" +
            '<button type="button" class="cart-line__remove" data-cart-remove="' + esc(o.id) + '" aria-label="Remove ' + esc(o.name) + '">Remove</button></div></li>';
        }).join("");
        var due = 0, project = 0, later = 0, monthly = 0;
        lines.forEach(function (o) { due += o.dueNow; if (o.monthly) monthly += o.priceCents; else { project += o.priceCents; later += o.priceCents - o.dueNow; } });
        sum.innerHTML =
          (project ? '<div class="cart-sum__row"><span>Projects (starting prices)</span><b>' + usd(project) + "</b></div>" : "") +
          (monthly ? '<div class="cart-sum__row"><span>Monthly plans</span><b>' + usd(monthly) + "/mo</b></div>" : "") +
          '<div class="cart-sum__row cart-sum__row--due"><span>Due today</span><b>' + usd(due) + "</b></div>" +
          (later ? '<div class="cart-sum__row"><span>Balance, invoiced before delivery</span><b>' + usd(later) + "</b></div>" : "") +
          '<p class="cart-sum__note">Every project starts with a 50% deposit. Final price is confirmed on your kickoff call; scope changes are quoted before work starts. Have a discount code? Enter it on the payment page.</p>';
        // Suggestions from everything in the cart
        var pool = [];
        ids.forEach(function (id) { (UPSELLS[id] || DEFAULT_UPSELLS).forEach(function (x) { if (cat[x] && ids.indexOf(x) === -1 && pool.indexOf(x) === -1) pool.push(x); }); });
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
      fetch("/api/checkout", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ items: items(), email: v("email"), name: v("name"), business: v("business"), notes: v("notes"), comp: !!comp })
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

  window.SWFTCart = { add: add, remove: remove, items: items, open: openPop };
  function init() {
    paint();
    var root = document.getElementById("cart-root");
    if (root) renderCartPage(root);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  window.addEventListener("storage", function (e) { if (e.key === KEY) paint(); });
})();
