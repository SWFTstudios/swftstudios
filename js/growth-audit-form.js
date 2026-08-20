(function () {
  "use strict";

  var form = document.getElementById("growth-audit-form");
  if (!form) return;

  var TOTAL_STEPS = 5;
  var currentStep = 1;
  var submitted = false;
  var started = false;

  var statusEl = document.getElementById("ga-status");
  var backBtn = document.getElementById("ga-back");
  var nextBtn = document.getElementById("ga-next");
  var nextLabel = nextBtn ? nextBtn.querySelector(".button_text"): null;
  var stepLabel = document.getElementById("ga-step-label");
  var stepTitle = document.getElementById("ga-step-title");
  var progressFill = document.getElementById("ga-progress-fill");
  var progressBar = document.querySelector(".ga-progress-track");
  var serviceSelect = document.getElementById("desired_service");

  var STEP_TITLES = {
    1: "Contact info",
    2: "Website & social",
    3: "Desired service",
    4: "Details & photos",
    5: "Schedule a call",
  };

  var SERVICE_LABELS = {
    "gbp-refresh": "GBP Content Refresh",
    "website-only": "Website Only",
    "website-content-half": "Website + Content Capture",
    "website-content-full": "Website + Extended Content",
    "content-growth-retainer": "Content + Growth Retainer",
    "full-growth-partner": "Full Growth Partner",
    "not-sure": "Not sure, help me choose",
  };

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
      return raw ? JSON.parse(raw): {};
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
      el.removeAttribute("aria-describedby");
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
    return el ? String(el.value || "").trim(): "";
  }

  function serviceLabel(id) {
    return SERVICE_LABELS[id] || id || "";
  }

  function applyPlanFromUrl() {
    if (!serviceSelect) return;
    try {
      var params = new URLSearchParams(window.location.search);
      var plan = params.get("plan") || params.get("service") || "";
      if (!plan) return;
      var option = serviceSelect.querySelector('option[value="' + plan + '"]');
      if (option) {
        serviceSelect.value = plan;
      }
    } catch (e) {
      /* ignore bad URL */
    }
  }

  function validateStep(step) {
    clearErrors();
    clearStatus();
    var ok = true;

    if (step === 1) {
      [
        ["first_name", "First name is required."],
        ["last_name", "Last name is required."],
        ["email", "A valid email is required."],
        ["business_name", "Business / company is required."],
      ].forEach(function (pair) {
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
    }

    if (step === 2) {
      if (!val("website") && !val("instagram")) {
        setFieldError("website", "Add a website URL or a social profile.");
        setFieldError("instagram", "Add a website URL or a social profile.");
        ok = false;
      }
    }

    if (step === 3) {
      if (!val("desired_service")) {
        setFieldError("desired_service", "Select the service you’re interested in.");
        ok = false;
      }
    }

    if (step === 4) {
      var consent = form.elements.namedItem("consent");
      if (consent && !consent.checked) {
        showStatus("Please confirm you agree to be contacted about your audit.", "error");
        ok = false;
      }
    }

    if (!ok) {
      var firstErr = form.querySelector(
        '.ga-step-panel[data-step="' +
          step +
          '"] .ga-field.is-error input, .ga-step-panel[data-step="' +
          step +
          '"] .ga-field.is-error select, .ga-step-panel[data-step="' +
          step +
          '"] .ga-field.is-error textarea'
      );
      if (firstErr) firstErr.focus();
    }
    return ok;
  }

  function showStep(step) {
    currentStep = step;
    form.querySelectorAll(".ga-step-panel").forEach(function (panel) {
      var n = Number(panel.getAttribute("data-step"));
      var active = n === step;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });

    if (stepLabel) stepLabel.textContent = "Step " + step + " of " + TOTAL_STEPS;
    if (stepTitle) stepTitle.textContent = STEP_TITLES[step] || "";
    if (progressFill) progressFill.style.width = Math.round((step / TOTAL_STEPS) * 100) + "%";
    if (progressBar) progressBar.setAttribute("aria-valuenow", String(step));

    if (backBtn) {
      var hideBack = step === 1 || step === 5;
      backBtn.hidden = hideBack;
      backBtn.disabled = hideBack;
    }
    if (nextBtn) {
      nextBtn.hidden = step === 5;
      if (nextLabel) {
        nextLabel.textContent = step === 4 ? "Save & schedule call": "Continue";
      }
    }

    track("growth_audit_step", {
      page_path: location.pathname,
      form_name: "growth_audit",
      step: step,
      step_title: STEP_TITLES[step] || "",
    });
  }

  function buildPayload() {
    var utm = getUtms();
    var serviceId = val("desired_service");
    var website = val("website");
    var social = val("instagram");
    var presence = website || social;
    var details = val("details");
    var photoLinks = val("photo_links");
    var combinedDetails = [details, photoLinks ? "Photo links: " + photoLinks: ""]
      .filter(Boolean)
      .join("\n\n");

    return {
      firstName: val("first_name"),
      lastName: val("last_name"),
      email: val("email"),
      phone: val("phone"),
      businessName: val("business_name"),
      website: presence,
      websiteUrl: website,
      instagram: social,
      desiredService: serviceId,
      desiredServiceLabel: serviceLabel(serviceId),
      details: combinedDetails,
      photoLinks: photoLinks,
      /* Compatibility aliases for existing Airtable columns */
      businessCategory: serviceLabel(serviceId) || "Growth Audit",
      challenge: serviceLabel(serviceId) || "Growth Audit inquiry",
      desiredOutcome: details || "Discuss " + (serviceLabel(serviceId) || "next steps"),
      sourcePage: location.pathname + location.search,
      utmSource: utm.utm_source || "",
      utmMedium: utm.utm_medium || "",
      utmCampaign: utm.utm_campaign || "",
      honeypot: val("company_website"),
    };
  }

  function submitLead() {
    if (submitted) return Promise.resolve(true);
    if (val("company_website")) {
      submitted = true;
      return Promise.resolve(true);
    }

    var payload = buildPayload();
    if (nextBtn) nextBtn.disabled = true;
    if (nextLabel) nextLabel.textContent = "Submitting…";
    clearStatus();

    return fetch("/api/growth-audit", {
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
          submitted = true;
          track("growth_audit_submit", {
            page_path: location.pathname,
            form_name: "growth_audit",
            service_interest: payload.desiredService || "",
            desired_service: payload.desiredServiceLabel || "",
          });
          return true;
        }
        var msg =
          (result.data && result.data.error) ||
          "Something went wrong. Email hello@swftstudios.com and we will follow up.";
        showStatus(msg, "error");
        return false;
      })
      .catch(function () {
        showStatus("Unable to send right now. Email hello@swftstudios.com.", "error");
        return false;
      })
      .finally(function () {
        if (nextBtn) nextBtn.disabled = false;
        if (nextLabel) nextLabel.textContent = "Save & schedule call";
      });
  }

  function goNext() {
    if (!validateStep(currentStep)) {
      if (currentStep !== 4 || !statusEl || statusEl.hidden) {
        showStatus("Please fix the highlighted fields and try again.", "error");
      }
      return;
    }

    if (currentStep === 4) {
      submitLead().then(function (ok) {
        if (ok) showStep(5);
      });
      return;
    }

    if (currentStep < TOTAL_STEPS) showStep(currentStep + 1);
  }

  function goBack() {
    clearErrors();
    clearStatus();
    if (currentStep > 1 && currentStep < 5) showStep(currentStep - 1);
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
    goNext();
  });

  if (nextBtn) nextBtn.addEventListener("click", goNext);
  if (backBtn) backBtn.addEventListener("click", goBack);

  form.addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    var tag = (e.target && e.target.tagName) || "";
    if (tag === "TEXTAREA" || tag === "BUTTON" || tag === "A") return;
    if (currentStep >= 5) return;
    e.preventDefault();
    goNext();
  });

  applyPlanFromUrl();
  showStep(1);
  track("growth_audit_view", {
    page_path: location.pathname,
    form_name: "growth_audit",
    plan: (serviceSelect && serviceSelect.value) || "",
  });
})();
