/**
 * SWFT lightweight analytics helper.
 * - Captures UTM params into sessionStorage
 * - Pushes events to dataLayer
 * - Optionally forwards to GA4 when window.SWFT_GA_ID or meta[name="swft-ga-id"] is set
 * Never send names, emails, phones, or free-text messages.
 */
(function (global) {
  "use strict";

  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];

  function readMetaGaId() {
    var el = document.querySelector('meta[name="swft-ga-id"]');
    return el ? el.getAttribute("content") : "";
  }

  function captureUtms() {
    try {
      var params = new URLSearchParams(location.search);
      var utm = {};
      var found = false;
      UTM_KEYS.forEach(function (k) {
        var v = params.get(k);
        if (v) {
          utm[k] = String(v).slice(0, 120);
          found = true;
        }
      });
      if (found) sessionStorage.setItem("swft_utm", JSON.stringify(utm));
    } catch (e) {
      /* ignore */
    }
  }

  function ensureDataLayer() {
    global.dataLayer = global.dataLayer || [];
  }

  function loadGtag(id) {
    if (!id || global.__swftGtagLoaded) return;
    global.__swftGtagLoaded = true;
    global.dataLayer = global.dataLayer || [];
    global.gtag =
      global.gtag ||
      function () {
        global.dataLayer.push(arguments);
      };
    global.gtag("js", new Date());
    global.gtag("config", id, { anonymize_ip: true, send_page_view: true });
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
    document.head.appendChild(s);
  }

  function sanitizeParams(params) {
    var out = {};
    var allowed = [
      "page_path",
      "source_page",
      "service_interest",
      "business_category",
      "budget_range",
      "form_name",
      "link_type",
    ];
    allowed.forEach(function (k) {
      if (params && params[k] != null && params[k] !== "") {
        out[k] = String(params[k]).slice(0, 120);
      }
    });
    out.page_path = out.page_path || location.pathname;
    return out;
  }

  function track(eventName, params) {
    ensureDataLayer();
    var safe = sanitizeParams(params || {});
    safe.event = eventName;
    global.dataLayer.push(safe);
    if (typeof global.gtag === "function" && global.__swftGtagLoaded) {
      global.gtag("event", eventName, safe);
    }
  }

  function bindDelegates() {
    document.addEventListener("click", function (e) {
      var a = e.target.closest("a");
      if (!a) return;
      var href = a.getAttribute("href") || "";
      var eventName = a.getAttribute("data-swft-event");
      if (eventName) {
        track(eventName, { page_path: location.pathname, link_type: eventName });
        return;
      }
      if (href.indexOf("mailto:") === 0) {
        track("email_click", { page_path: location.pathname, link_type: "email" });
      } else if (href.indexOf("tel:") === 0) {
        track("phone_click", { page_path: location.pathname, link_type: "phone" });
      } else if (href.indexOf("cal.com") !== -1) {
        track("calendar_click", { page_path: location.pathname, link_type: "calendar" });
      }
    });

    var path = location.pathname;
    if (path.indexOf("website-pricing") !== -1 || path.indexOf("pricing") !== -1) {
      track("pricing_view", { page_path: path });
    } else if (path.indexOf("websites") !== -1 || path.indexOf("apps") !== -1 || path.indexOf("media") !== -1) {
      track("portfolio_view", { page_path: path });
    } else if (path.indexOf("case-study") !== -1 || path.indexOf("case-studies") !== -1) {
      track("case_study_view", { page_path: path });
    }
  }

  function init() {
    captureUtms();
    ensureDataLayer();
    var gaId = global.SWFT_GA_ID || readMetaGaId();
    if (gaId) loadGtag(gaId);
    bindDelegates();
  }

  global.SWFTAnalytics = { track: track, init: init };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
