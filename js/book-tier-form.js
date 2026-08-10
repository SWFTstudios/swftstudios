(function () {
  "use strict";

  var form = document.getElementById("book-tier-form");
  if (!form) return;

  var tierId = form.getAttribute("data-tier-id") || "";
  var statusEl = document.getElementById("book-status");
  var submitBtn = document.getElementById("book-submit");
  var submitLabel = submitBtn ? submitBtn.querySelector(".button_text") : null;
  var defaultLabel = submitLabel ? submitLabel.textContent : "Continue to payment";
  var submitting = false;

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
    statusEl.className = "ga-status is-" + (type || "error");
  }

  function clearStatus() {
    if (!statusEl) return;
    statusEl.hidden = true;
    statusEl.textContent = "";
  }

  function clearErrors() {
    form.querySelectorAll(".ga-field.is-error").forEach(function (el) {
      el.classList.remove("is-error");
    });
    form.querySelectorAll(".ga-error").forEach(function (el) {
      el.remove();
    });
    form.querySelectorAll("[aria-invalid]").forEach(function (el) {
      el.removeAttribute("aria-invalid");
    });
  }

  function markError(input, message) {
    if (!input) return;
    var field = input.closest(".ga-field");
    if (field) field.classList.add("is-error");
    input.setAttribute("aria-invalid", "true");
    var err = document.createElement("p");
    err.className = "ga-error";
    err.id = input.id + "-error";
    err.textContent = message;
    input.setAttribute("aria-describedby", err.id);
    input.insertAdjacentElement("afterend", err);
  }

  function validate() {
    clearErrors();
    var ok = true;
    var name = form.querySelector("#book-name");
    var email = form.querySelector("#book-email");
    var business = form.querySelector("#book-business");
    var consent = form.querySelector("#book-consent");

    if (!name || !String(name.value || "").trim()) {
      markError(name, "Enter your name.");
      ok = false;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email.value || "").trim())) {
      markError(email, "Enter a valid email.");
      ok = false;
    }
    if (!business || !String(business.value || "").trim()) {
      markError(business, "Enter your business name.");
      ok = false;
    }
    if (consent && !consent.checked) {
      markError(consent, "Please confirm to continue.");
      ok = false;
    }
    return ok;
  }

  function setBusy(busy) {
    submitting = busy;
    if (submitBtn) submitBtn.disabled = !!busy;
    if (submitLabel) submitLabel.textContent = busy ? "Starting checkout…" : defaultLabel;
  }

  // Returning from cancelled Stripe Checkout
  try {
    var params = new URLSearchParams(window.location.search);
    if (params.get("status") === "cancel") {
      showStatus("Checkout was cancelled. You can try again when ready.", "error");
      track("book_tier_cancel", { tier_id: tierId });
    }
  } catch (e) {}

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (submitting) return;
    clearStatus();
    if (!validate()) {
      showStatus("Please fix the highlighted fields.", "error");
      return;
    }
    if (!tierId) {
      showStatus("Missing tier. Refresh the page or pick an offer from pricing.", "error");
      return;
    }

    var utm = getUtms();
    var payload = {
      tierId: tierId,
      name: form.querySelector("#book-name").value.trim(),
      email: form.querySelector("#book-email").value.trim(),
      phone: (form.querySelector("#book-phone") || {}).value
        ? form.querySelector("#book-phone").value.trim()
        : "",
      businessName: form.querySelector("#book-business").value.trim(),
      website: (form.querySelector("#book-website") || {}).value
        ? form.querySelector("#book-website").value.trim()
        : "",
      notes: (form.querySelector("#book-notes") || {}).value
        ? form.querySelector("#book-notes").value.trim()
        : "",
      honeypot: (form.querySelector("#company_website") || {}).value || "",
      utmSource: utm.utm_source || "",
      utmMedium: utm.utm_medium || "",
      utmCampaign: utm.utm_campaign || "",
      sourcePage: window.location.pathname,
    };

    setBusy(true);
    track("book_tier_submit", { tier_id: tierId });

    fetch("/api/book-tier", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { okHttp: res.ok, data: data || {} };
        });
      })
      .then(function (result) {
        var data = result.data;
        if (data.checkoutUrl) {
          track("book_tier_checkout_redirect", { tier_id: tierId });
          window.location.href = data.checkoutUrl;
          return;
        }
        setBusy(false);
        showStatus(
          data.error ||
            "Unable to start checkout right now. Email hello@swftstudios.com or try again.",
          "error"
        );
        track("book_tier_error", { tier_id: tierId, reason: data.error || "no_checkout" });
      })
      .catch(function () {
        setBusy(false);
        showStatus(
          "Network error. Check your connection and try again, or email hello@swftstudios.com.",
          "error"
        );
        track("book_tier_error", { tier_id: tierId, reason: "network" });
      });
  });
})();
