(function () {
  "use strict";

  var form = document.getElementById("book-tier-form");
  if (!form) return;

  var tierId = form.getAttribute("data-tier-id") || "";
  var basePrice = form.getAttribute("data-base-price") || "";
  var billingMode = form.getAttribute("data-billing-mode") || "payment";
  var subscription = billingMode === "subscription";
  var statusEl = document.getElementById("book-status");
  var submitBtn = document.getElementById("book-submit");
  var submitLabel = submitBtn.querySelector(".button_text");
  var quoteFirst = document.getElementById("book-quote-first");
  var consentLabel = document.getElementById("book-consent-label");
  var summary = document.getElementById("book-order-summary");
  var paymentExplainer = document.getElementById("book-payment-explainer");
  var currentStep = 0;
  var submitting = false;

  // All extras request a scoped quote; the existing Stripe link is base-only.
  var pricedAddOns = {
    "extra-pages": { cents: 17500, unit: "page" },
    "local-page": { cents: 25000, unit: "page" },
    "extra-reels": { cents: 12500, unit: "video" },
    "extra-photos": { cents: 10000, unit: "10 edited photos" },
    "extra-shoot": { cents: 15000, unit: "hour" },
    "testimonials": { cents: 17500, unit: "testimonial" },
    "raw-assets": { cents: 10000, unit: "shoot" },
    "location-profiles": { cents: 17500, unit: "profile" }
  };
  var baseCents = Math.round(Number(basePrice.replace(/[^0-9.]/g, "")) * 100) || 0;
  var forcedQuote = false;
  var catalog = {
    website: {
      title: "Website extras",
      intro: "More than the base build? Tell us what you'd like to explore.",
      items: [
        ["extra-pages", "Additional page", "One standard page beyond the agreed base site; complex features quoted separately."],
        ["booking-advanced", "Advanced booking setup", "More complex calendars, deposits or scheduling workflows."],
        ["shopify-migration", "Store or catalog migration", "Move products or content from an existing platform."],
        ["automations", "CRM + email follow-ups", "Connect leads to email or follow-up automations."],
        ["multilingual", "Multilingual pages", "Make your site accessible in additional languages."],
        ["priority-launch", "Priority launch", "Ask about an accelerated production schedule."]
      ]
    },
    content: {
      title: "Content extras",
      intro: "Add the shots and formats your customers should see.",
      items: [
        ["extra-reels", "Extra edited Reel", "One extra short-form edit from footage captured at the same shoot."],
        ["testimonials", "Filmed testimonial", "One interview captured during your shoot with a short edited cut."],
        ["extra-photos", "10 extra edited photos", "An additional selection from the same shoot; new product setups quoted separately."],
        ["product-detail", "Product / detail photos", "A dedicated new set of product or process shots."],
        ["extra-location", "Additional location", "Cover a second address or shoot environment."],
        ["extra-shoot", "Extra filming hour", "One additional hour at the same location, subject to availability."],
        ["raw-assets", "Raw footage delivery", "Available source footage from one shoot; transfer method confirmed at kickoff."]
      ]
    },
    local: {
      title: "Local visibility extras",
      intro: "Make it easier for nearby customers to find and trust you.",
      items: [
        ["location-profiles", "Additional Google Business Profile", "One extra existing eligible profile; an on-site shoot at that location is separate."],
        ["local-page", "Local landing page", "One additional location-focused landing page using existing assets."],
        ["review-flow", "Advanced review follow-up", "A tailored review-request workflow."],
        ["monthly-visibility", "Ongoing local content", "Ask about repeat visits and monthly updates."]
      ]
    },
    growth: {
      title: "Growth extras",
      intro: "Optional channels or campaigns beyond the base plan.",
      items: [
        ["social-posting", "Social media posting", "Publishing on channels beyond your included scope."],
        ["email-campaign", "Email campaign", "A planned campaign and follow-up sequence."],
        ["campaign-extra", "Extra ad campaign", "An additional audience, offer or campaign structure."],
        ["landing-campaign", "Dedicated campaign landing page", "A page built around a specific offer."],
        ["reporting-extra", "Deeper reporting", "Ask for a custom dashboard or extra reporting cadence."]
      ]
    }
  };

  var tiers = {
    "gbp-refresh": {
      goals: ["Look more professional locally", "Show my services or space", "Get more Google inquiries", "Build trust with new customers"],
      groups: ["content", "local", "website"]
    },
    "website-only": {
      goals: ["Get more inquiries", "Make booking easier", "Sell products online", "Refresh an outdated site"],
      groups: ["website", "content", "local"]
    },
    "website-content-half": {
      goals: ["Launch a new business", "Show my work with real content", "Get more leads and bookings", "Refresh my whole online presence"],
      groups: ["website", "content", "local"]
    },
    "website-content-full": {
      goals: ["Cover multiple locations", "Launch a bigger website", "Build a content library", "Refresh my brand across channels"],
      groups: ["website", "content", "local"]
    },
    "content-growth-retainer": {
      goals: ["Post consistently", "Refresh my local profile", "Get new photo and video each month", "Promote new services and offers"],
      groups: ["content", "local", "growth"]
    },
    "full-growth-partner": {
      goals: ["Generate more qualified leads", "Promote a new offer", "Keep content and ads aligned", "Reach a new local audience"],
      groups: ["growth", "content", "website", "local"]
    }
  };

  var tier = tiers[tierId] || tiers["website-content-half"];

  function dollars(cents) {
    return new Intl.NumberFormat("en-US", {
      style: "currency", currency: "USD", maximumFractionDigits: 0
    }).format(cents / 100);
  }

  function addonPricing(id) { return pricedAddOns[id] || null; }
  function pricedSubtotal(items) {
    return items.reduce(function (total, item) {
      var p = addonPricing(item.id);
      return total + (p ? p.cents : 0);
    }, 0);
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function track(name, params) {
    if (window.SWFTAnalytics && typeof window.SWFTAnalytics.track === "function") {
      window.SWFTAnalytics.track(name, params || {});
    } else if (window.dataLayer) {
      window.dataLayer.push(Object.assign({ event: name }, params || {}));
    }
  }

  function getUtms() {
    try {
      var raw = sessionStorage.getItem("swft_utm");
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function showStatus(msg, type) {
    statusEl.textContent = msg;
    statusEl.hidden = false;
    statusEl.className = "ga-status is-" + (type || "error");
  }

  function clearStatus() {
    statusEl.hidden = true;
    statusEl.textContent = "";
  }

  function clearErrors() {
    form.querySelectorAll(".ga-field.is-error").forEach(function (el) { el.classList.remove("is-error"); });
    form.querySelectorAll(".ga-error").forEach(function (el) { el.remove(); });
    form.querySelectorAll("[aria-invalid]").forEach(function (el) {
      el.removeAttribute("aria-invalid");
      el.removeAttribute("aria-describedby");
    });
  }

  function markError(input, message) {
    if (!input) return;
    var field = input.closest(".ga-field") || input.closest(".book-goal-field");
    if (field) field.classList.add("is-error");
    input.setAttribute("aria-invalid", "true");
    var err = document.createElement("p");
    err.className = "ga-error";
    err.id = input.id + "-error";
    err.textContent = message;
    input.setAttribute("aria-describedby", err.id);
    (field || input.parentNode).appendChild(err);
  }

  function buildConfigurator() {
    var mount = document.getElementById("book-configurator");
    var goals = tier.goals.map(function (goal, i) {
      return '<label class="book-choice"><input type="radio" name="book-goal" value="' + escapeHtml(goal) +
        '" ' + (i === 0 ? "" : "") + '><span class="book-choice-body"><strong>' +
        escapeHtml(goal) + '</strong></span><span class="book-choice-check" aria-hidden="true">✓</span></label>';
    }).join("");

    var groups = tier.groups.map(function (key) {
      var group = catalog[key];
      return '<fieldset class="book-choice-field"><legend>' + escapeHtml(group.title) +
        '</legend><p class="book-choice-help">' + escapeHtml(group.intro) +
        '</p><div class="book-choice-grid">' + group.items.map(function (item) {
          return '<label class="book-choice book-choice--addon"><input type="checkbox" name="book-addon" value="' +
            escapeHtml(item[0]) + '" data-addon-group="' + escapeHtml(group.title) +
            '" data-addon-label="' + escapeHtml(item[1]) +
            '"><span class="book-choice-body"><strong>' + escapeHtml(item[1]) +
            '</strong><small>' + escapeHtml(item[2]) +
            '</small><em>Quote add-on</em></span><span class="book-choice-check" aria-hidden="true">✓</span></label>';
        }).join("") + '</div></fieldset>';
    }).join("");

    mount.innerHTML = '<fieldset class="book-choice-field book-goal-field"><legend>What matters most to you? <span class="req">*</span></legend>' +
      '<p class="book-choice-help">Choose one. We will tailor the project around your priority.</p>' +
      '<div class="book-choice-grid">' + goals + '</div></fieldset>' +
      '<div class="book-addons-head"><h3>Want to add anything?</h3><p>Every extra is optional. Select what interests you; we will quote additions separately before any extra charge.</p></div>' + groups;
  }

  function addons() {
    return Array.prototype.map.call(form.querySelectorAll('input[name="book-addon"]:checked'), function (el) {
      return {
        id: el.value,
        label: el.getAttribute("data-addon-label") || el.value,
        group: el.getAttribute("data-addon-group") || ""
      };
    });
  }

  function customization() {
    var goal = form.querySelector('input[name="book-goal"]:checked');
    var timeline = form.querySelector("#book-timeline");
    var platform = form.querySelector("#book-platform");
    return {
      goal: goal ? goal.value : "",
      addOns: addons(),
      timeline: timeline ? timeline.value : "",
      platform: platform ? platform.value : ""
    };
  }

  function isQuote() {
    return addons().length > 0 || quoteFirst.checked;
  }

  function el(tag, className, value) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  }

  function summaryRow(label, value) {
    var row = el("div", "book-summary-row");
    row.appendChild(el("span", "", label));
    row.appendChild(el("strong", "", value));
    return row;
  }

  function renderSummary() {
    var details = customization();
    var quote = isQuote();
    summary.replaceChildren();
    summary.appendChild(summaryRow("Package", document.querySelector(".ps-title .ps-accent").textContent));
    summary.appendChild(summaryRow("Your priority", details.goal));
    if (details.timeline) summary.appendChild(summaryRow("Timeline", details.timeline));
    if (details.platform) summary.appendChild(summaryRow("Platform", details.platform));
    if (details.addOns.length) {
      var box = el("div", "book-summary-extras");
      box.appendChild(el("h3", "", "Your requested add-ons"));
      var ul = el("ul");
      details.addOns.forEach(function (addon) { ul.appendChild(el("li", "", addon.label)); });
      box.appendChild(ul);
      box.appendChild(el("p", "", "We'll price these separately after reviewing your request."));
      summary.appendChild(box);
    }
    summary.appendChild(summaryRow(quote ? "Today's payment" : (subscription ? "Base monthly checkout" : "Base checkout amount"),
      quote ? "$0 · quote request" : basePrice));
    if (details.addOns.length) {
      quoteFirst.checked = true;
      quoteFirst.disabled = true;
      quoteFirst.closest(".book-quote-option").classList.add("is-required-quote");
      paymentExplainer.textContent = "Because you selected extras, we'll review and price your custom scope first. No payment is taken on this request.";
    } else {
      quoteFirst.disabled = false;
      quoteFirst.closest(".book-quote-option").classList.remove("is-required-quote");
      paymentExplainer.textContent = quoteFirst.checked
        ? "We'll email a quote for your base service. Nothing is charged today."
        : (subscription ? "Next: secure Stripe Checkout for the base " + basePrice + " monthly plan."
          : "Next: secure Stripe Checkout for the " + basePrice + " base project. Any changes require a separate quote and approval.");
    }
    consentLabel.textContent = quote
      ? "I understand this sends a custom quote request. No payment will be taken today."
      : ("I understand this starts Stripe Checkout at " + basePrice + (subscription ? " per month" : " one time") +
        " for the base service. Any extras require a separate quote and my approval.");
    submitLabel.textContent = quote ? "Request my custom quote" : "Continue to secure checkout";
  }

  function setStep(step) {
    currentStep = step;
    clearStatus();
    clearErrors();
    form.querySelectorAll("[data-book-step]").forEach(function (panel) {
      panel.hidden = Number(panel.getAttribute("data-book-step")) !== step;
    });
    document.querySelectorAll("[data-book-progress]").forEach(function (item) {
      var n = Number(item.getAttribute("data-book-progress"));
      item.classList.toggle("is-current", n === step);
      item.classList.toggle("is-complete", n < step);
      if (n === step) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    });
    if (step === 2) renderSummary();
    var active = form.querySelector('[data-book-step="' + step + '"] h2');
    if (active) {
      active.setAttribute("tabindex", "-1");
      active.focus({ preventScroll: true });
    }
    document.querySelector(".book-flow-progress").scrollIntoView({ behavior: "smooth", block: "start" });
    track("book_tier_step", { tier_id: tierId, step: step + 1 });
  }

  function validateStep0() {
    var checked = form.querySelector('input[name="book-goal"]:checked');
    if (checked) return true;
    var first = form.querySelector('input[name="book-goal"]');
    showStatus("Choose the main goal for your project to continue.", "error");
    if (first) first.focus();
    return false;
  }

  function validateDetails() {
    clearErrors();
    var ok = true, firstInvalid = null;
    var name = form.querySelector("#book-name");
    var email = form.querySelector("#book-email");
    var business = form.querySelector("#book-business");
    [[name, "Enter your name.", function (v) { return !!v; }],
      [email, "Enter a valid email.", function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }],
      [business, "Enter your business name.", function (v) { return !!v; }]
    ].forEach(function (item) {
      if (!item[0] || !item[2](String(item[0].value || "").trim())) {
        markError(item[0], item[1]);
        if (!firstInvalid) firstInvalid = item[0];
        ok = false;
      }
    });
    if (!ok) {
      showStatus("Please complete the highlighted fields.", "error");
      if (firstInvalid) firstInvalid.focus();
    }
    return ok;
  }

  function validateConsent() {
    var consent = form.querySelector("#book-consent");
    if (consent && consent.checked) return true;
    markError(consent, "Please confirm to continue.");
    showStatus("Please confirm the payment or quote terms.", "error");
    if (consent) consent.focus();
    return false;
  }

  function setBusy(busy) {
    submitting = busy;
    submitBtn.disabled = !!busy;
    if (busy) submitLabel.textContent = isQuote() ? "Sending request…" : "Starting checkout…";
    else renderSummary();
  }

  buildConfigurator();
  setStep(0);
  try {
    var params = new URLSearchParams(window.location.search);
    if (params.get("status") === "cancel") {
      showStatus("Checkout was cancelled. Your choices are still here. Continue when ready.", "error");
      track("book_tier_cancel", { tier_id: tierId });
    }
  } catch (e) {}

  form.addEventListener("click", function (event) {
    var next = event.target.closest("[data-book-next]");
    var back = event.target.closest("[data-book-back]");
    if (submitting || (!next && !back)) return;
    if (back) {
      setStep(Math.max(0, currentStep - 1));
      return;
    }
    if (currentStep === 0 && !validateStep0()) return;
    if (currentStep === 1 && !validateDetails()) return;
    setStep(Math.min(2, currentStep + 1));
  });

  quoteFirst.addEventListener("change", renderSummary);

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (submitting) return;
    if (currentStep !== 2) return;
    clearStatus();
    clearErrors();
    if (!validateStep0()) { setStep(0); showStatus("Choose your priority.", "error"); return; }
    if (!validateDetails()) { setStep(1); showStatus("Please complete your details.", "error"); return; }
    if (!validateConsent()) return;
    if (!tierId) { showStatus("Missing service selection. Please return to pricing.", "error"); return; }

    var choices = customization();
    var quoteOnly = isQuote();
    var utm = getUtms();
    var payload = {
      tierId: tierId,
      name: form.querySelector("#book-name").value.trim(),
      email: form.querySelector("#book-email").value.trim(),
      phone: form.querySelector("#book-phone").value.trim(),
      businessName: form.querySelector("#book-business").value.trim(),
      website: form.querySelector("#book-website").value.trim(),
      notes: form.querySelector("#book-notes").value.trim(),
      customization: choices,
      quoteOnly: quoteOnly,
      honeypot: (form.querySelector("#swft_hp_confirm") || {}).value || "",
      utmSource: utm.utm_source || "",
      utmMedium: utm.utm_medium || "",
      utmCampaign: utm.utm_campaign || "",
      sourcePage: window.location.pathname
    };

    setBusy(true);
    track("book_tier_submit", { tier_id: tierId, quote_only: quoteOnly, addons: choices.addOns.length });

    fetch("/api/book-tier", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().then(function (body) { return { ok: res.ok, body: body || {} }; });
    }).then(function (result) {
      if (result.ok && result.body.checkoutUrl && !quoteOnly) {
        track("book_tier_checkout_redirect", { tier_id: tierId });
        window.location.href = result.body.checkoutUrl;
        return;
      }
      if (result.ok && result.body.quoteRequested) {
        form.hidden = true;
        document.querySelector(".book-flow-progress").hidden = true;
        var success = el("div", "book-quote-success");
        success.appendChild(el("p", "book-step-kicker", "YOUR REQUEST IS IN"));
        success.appendChild(el("h2", "", "Thanks. We'll take it from here."));
        success.appendChild(el("p", "", "We received your preferences and will email you to confirm the scope and next steps. No payment was collected."));
        var link = el("a", "book-action-primary", "Back to SWFT Studios");
        link.href = "/";
        success.appendChild(link);
        form.parentNode.appendChild(success);
        clearStatus();
        track("book_tier_quote_success", { tier_id: tierId });
        return;
      }
      setBusy(false);
      showStatus(result.body.error || "We couldn't send your request right now. Try again or email hello@swftstudios.com.", "error");
      track("book_tier_error", { tier_id: tierId, reason: result.body.error || "no_response" });
    }).catch(function () {
      setBusy(false);
      showStatus("Network error. Try again or email hello@swftstudios.com.", "error");
      track("book_tier_error", { tier_id: tierId, reason: "network" });
    });
  });
})();