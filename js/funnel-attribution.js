/* Preserve campaign UTMs across SWFT CTAs and record qualified intent without PII. */
(function () {
  "use strict";
  var KEYS = ["utm_source","utm_medium","utm_campaign","utm_term","utm_content"];
  function storedUtms() {
    try { return JSON.parse(sessionStorage.getItem("swft_utm") || "{}"); }
    catch (_) { return {}; }
  }
  function decorateLink(anchor, utms) {
    try {
      var url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin && url.hostname !== "cal.com") return;
      KEYS.forEach(function (key) {
        if (!url.searchParams.has(key) && utms[key]) url.searchParams.set(key, utms[key]);
      });
      anchor.href = url.href;
    } catch (_) { /* Leave original destination intact. */ }
  }
  function initialize() {
    var utms = storedUtms();
    var page = new URLSearchParams(location.search);
    KEYS.forEach(function (key) { if (page.has(key)) utms[key] = String(page.get(key)).slice(0,120); });
    document.querySelectorAll("a[data-funnel-cta]").forEach(function (a) {
      decorateLink(a, utms);
      a.addEventListener("click", function () {
        if (!window.SWFTAnalytics) return;
        window.SWFTAnalytics.track("funnel_cta_click", {
          page_path: location.pathname,
          source_page: location.pathname,
          service_interest: document.body.getAttribute("data-funnel-service") || "all",
          link_type: a.getAttribute("data-funnel-cta") || "other"
        });
      });
    });
    if (document.body.matches(".fnl-campaign") && window.SWFTAnalytics) {
      window.SWFTAnalytics.track("service_landing_view", {
        page_path: location.pathname,
        service_interest: document.body.getAttribute("data-funnel-service") || ""
      });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize);
  else initialize();
})();
