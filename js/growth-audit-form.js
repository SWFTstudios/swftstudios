(function () {
  "use strict";

  var form = document.getElementById("growth-audit-form");
  if (!form) return;

  var statusEl = document.getElementById("ga-status");
  var submitBtn = document.getElementById("ga-submit");
  var submitLabel = submitBtn ? submitBtn.querySelector(".button_text") : null;
  var started = false;

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
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.hidden = false;
    statusEl.className = "ga-status is-" + type;
  }

  function clearErrors() {
    form.querySelectorAll(".ga-field.is-error").forEach(function (el) {
      el.classList.remove("is-error");
    });
    form.querySelectorAll(".ga-error").forEach(function (el) {
      el.remove();
    });
  }

  function setFieldError(name, message) {
    var field = form.querySelector('[name="' + name + '"]');
    if (!field) return;
    var wrap = field.closest(".ga-field");
    if (!wrap) return;
    wrap.classList.add("is-error");
    var err = document.createElement("p");
    err.className = "ga-error";
    err.id = name + "-error";
    err.textContent = message;
    wrap.appendChild(err);
    field.setAttribute("aria-invalid", "true");
    field.setAttribute("aria-describedby", err.id);
  }

  function val(name) {
    var el = form.elements.namedItem(name);
    return el ? String(el.value || "").trim() : "";
  }

  function validate() {
    clearErrors();
    form.querySelectorAll("[aria-invalid]").forEach(function (el) {
      el.removeAttribute("aria-invalid");
      el.removeAttribute("aria-describedby");
    });
    var ok = true;
    var required = [
      ["first_name", "First name is required."],
      ["email", "A valid email is required."],
      ["business_name", "Business name is required."],
      ["website", "Website URL or primary social profile is required."],
      ["business_category", "Select a business category."],
      ["challenge", "Select your biggest current challenge."],
      ["desired_outcome", "Tell us the desired business outcome."],
    ];
    required.forEach(function (pair) {
      if (!val(pair[0])) {
        setFieldError(pair[0], pair[1]);
        ok = false;
      }
    });
    var email = val("email");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFieldError("email", "Enter a valid email address.");
      ok = false;
    }
    var consent = form.elements.namedItem("consent");
    if (consent && !consent.checked) {
      showStatus("Please confirm you agree to be contacted about your audit.", "error");
      ok = false;
    }
    return ok;
  }

  form.addEventListener(
    "focusin",
    function () {
      if (started) return;
      started = true;
      track("growth_audit_start", { page_path: location.pathname, form_name: "growth_audit" });
    },
    true
  );

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (val("company_website")) {
      // Honeypot filled — pretend success
      window.location.href = "/growth-audit/thank-you";
      return;
    }
    if (!validate()) {
      showStatus("Please fix the highlighted fields and try again.", "error");
      var firstErr = form.querySelector(".ga-field.is-error input, .ga-field.is-error select, .ga-field.is-error textarea");
      if (firstErr) firstErr.focus();
      return;
    }

    var utm = getUtms();
    var payload = {
      firstName: val("first_name"),
      email: val("email"),
      phone: val("phone"),
      businessName: val("business_name"),
      website: val("website"),
      businessCategory: val("business_category"),
      challenge: val("challenge"),
      desiredOutcome: val("desired_outcome"),
      instagram: val("instagram"),
      budget: val("budget"),
      timeline: val("timeline"),
      details: val("details"),
      sourcePage: document.referrer ? new URL(document.referrer, location.origin).pathname : "/",
      utmSource: utm.utm_source || "",
      utmMedium: utm.utm_medium || "",
      utmCampaign: utm.utm_campaign || "",
      honeypot: val("company_website"),
    };

    submitBtn.disabled = true;
    if (submitLabel) submitLabel.textContent = "Submitting…";
    if (statusEl) statusEl.hidden = true;

    fetch("/api/growth-audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (result.ok && result.data && result.data.ok) {
          track("growth_audit_submit", {
            page_path: location.pathname,
            form_name: "growth_audit",
            business_category: payload.businessCategory,
            budget_range: payload.budget || "",
            service_interest: "growth_audit",
          });
          window.location.href = "/growth-audit/thank-you";
          return;
        }
        var msg =
          (result.data && result.data.error) ||
          "Something went wrong. Email hello@swftstudios.com and we will follow up.";
        showStatus(msg, "error");
      })
      .catch(function () {
        showStatus("Unable to send right now. Email hello@swftstudios.com.", "error");
      })
      .finally(function () {
        submitBtn.disabled = false;
        if (submitLabel) submitLabel.textContent = "Get Your Free Growth Audit";
      });
  });

  track("growth_audit_view", { page_path: location.pathname, form_name: "growth_audit" });
})();
