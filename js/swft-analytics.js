/**
 * SWFT lightweight analytics helper.
 * - Loads PostHog (project 486061) for web analytics + custom events
 * - Captures UTM params into sessionStorage (+ PostHog register)
 * - Pushes events to dataLayer
 * - Optionally forwards to GA4 when window.SWFT_GA_ID or meta[name="swft-ga-id"] is set
 * Never send names, emails, phones, or free-text messages.
 *
 * Disable PostHog with window.SWFT_POSTHOG_DISABLED = true before this script loads.
 */
(function (global) {
  "use strict";

  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
  var POSTHOG_KEY = "phc_AwfkAWFJ3Xs2vcFLcjhN9CfeSfZ6nYStWvpXMTi3uMkb";
  var POSTHOG_HOST = "https://us.i.posthog.com";

  function readMetaGaId() {
    var el = document.querySelector('meta[name="swft-ga-id"]');
    return el ? el.getAttribute("content") : "";
  }

  function readStoredUtms() {
    try {
      var raw = sessionStorage.getItem("swft_utm");
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
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

  function loadPostHog() {
    if (global.SWFT_POSTHOG_DISABLED || global.__swftPosthogLoaded) return;
    global.__swftPosthogLoaded = true;

    !(function (t, e) {
      var o, n, p, r;
      e.__SV ||
        ((window.posthog = e),
        (e._i = []),
        (e.init = function (i, s, a) {
          function g(t, e) {
            var o = e.split(".");
            2 == o.length && ((t = t[o[0]]), (e = o[1]));
            t[e] = function () {
              t.push([e].concat(Array.prototype.slice.call(arguments, 0)));
            };
          }
          ((p = t.createElement("script")).type = "text/javascript"),
            (p.crossOrigin = "anonymous"),
            (p.async = !0),
            (p.src = s.api_host.replace(".i.posthog.com", "-assets.i.posthog.com") + "/static/array.js");
          (r = t.getElementsByTagName("script")[0]).parentNode.insertBefore(p, r);
          var u = e;
          for (
            void 0 !== a ? (u = e[a] = []) : (a = "posthog"),
              u.people = u.people || [],
              u.toString = function (t) {
                var e = "posthog";
                return "posthog" !== a && (e += "." + a), t || (e += " (stub)"), e;
              },
              u.people.toString = function () {
                return u.toString(1) + ".people (stub)";
              },
              (o =
                "init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(
                  " "
                )),
              (n = 0);
            n < o.length;
            n++
          )
            g(u, o[n]);
          e._i.push([i, s, a]);
        }),
        (e.__SV = 1));
    })(document, global.posthog || []);

    global.posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      defaults: "2025-05-24",
      capture_pageview: true,
      capture_pageleave: true,
      persistence: "localStorage+cookie",
    });

    var utm = readStoredUtms();
    if (utm && Object.keys(utm).length && typeof global.posthog.register === "function") {
      global.posthog.register(utm);
    }
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
      "tier_id",
      "reason",
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
    if (global.posthog && typeof global.posthog.capture === "function") {
      var phProps = {};
      Object.keys(safe).forEach(function (k) {
        if (k !== "event") phProps[k] = safe[k];
      });
      global.posthog.capture(eventName, phProps);
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
    loadPostHog();
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
