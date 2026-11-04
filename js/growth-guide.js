/* Free SWFT Growth Guide.
   growth-guide.html   #gg-form: email + "do it myself" / "do it for me" → POST /api/growth-guide
   guide-worksheet.html #ws-form: fill-in-the-blank answers, saved on this device as you
                        type; "Email me my answers" → POST /api/growth-guide (kind "answers") */
(function () {
  "use strict";
  var API = "/api/growth-guide";
  var KEY = "swft-guide-answers";
  var $ = function (id) { return document.getElementById(id); };

  function say(el, msg, type) {
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg || "";
    el.className = "mf-status" + (type ? " is-" + type : "");
  }
  function post(body) {
    return fetch(API, {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json().catch(function () { return {}; }); });
  }
  function track(name, data) { try { if (window.SWFTAnalytics) window.SWFTAnalytics.track(name, data || {}); } catch (e) { /* analytics is optional */ } }
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var OFFLINE = "You look offline. Check your connection and try again.";

  /* ---------- Landing page ---------- */
  function initLanding() {
    var form = $("gg-form");
    if (!form) return;
    var dfy = $("gg-dfy"), status = $("gg-status"), btn = $("gg-submit"), label = form.querySelector("[data-gg-label]");
    function kind() { var c = form.querySelector('input[name="kind"]:checked'); return c ? c.value : "diy"; }
    function sync() {
      var k = kind();
      dfy.hidden = k !== "dfy";
      label.textContent = k === "dfy" ? "Send my details" : "Email me the guide";
    }
    form.addEventListener("change", function (e) { if (e.target.name === "kind") sync(); });
    sync();

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var k = kind();
      var v = function (n) { return (form.elements[n] && form.elements[n].value || "").trim(); };
      if (!EMAIL_RE.test(v("email"))) { say(status, "Enter a valid email address.", "error"); form.elements.email.focus(); return; }
      if (k === "dfy") {
        var missing = ["businessName", "links", "sells", "goal"].filter(function (n) { return !v(n); });
        if (missing.length) { say(status, "Fill in the fields marked *.", "error"); form.elements[missing[0]].focus(); return; }
      }
      var body = { kind: k, firstName: v("firstName"), email: v("email"), honeypot: v("honeypot"), sourcePage: location.pathname };
      if (k === "dfy") ["businessName", "links", "sells", "customers", "goal", "notes"].forEach(function (n) { body[n] = v(n); });
      btn.disabled = true;
      say(status, k === "dfy" ? "Sending your details…" : "Sending your guide…", "info");
      post(body).then(function (d) {
        btn.disabled = false;
        if (!d.ok) { say(status, d.error || "That didn't go through. Try again.", "error"); return; }
        track("growth_guide_submit", { path: k });
        form.hidden = true;
        var done = $(k === "dfy" ? "gg-done-dfy" : "gg-done-diy");
        done.querySelectorAll("[data-gg-email]").forEach(function (b) { b.textContent = body.email; });
        var open = $("gg-open");
        if (open) open.href = "/guide-worksheet.html?email=" + encodeURIComponent(body.email) + (body.firstName ? "&name=" + encodeURIComponent(body.firstName) : "");
        done.hidden = false;
        var h = done.querySelector("h3"); if (h) { h.tabIndex = -1; h.focus(); }
      }, function () { btn.disabled = false; say(status, OFFLINE, "error"); });
    });
  }

  /* ---------- Worksheet ---------- */
  function initWorksheet() {
    var form = $("ws-form");
    if (!form) return;
    var blanks = form.querySelectorAll(".ws-blank");
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { saved = {}; }
    blanks.forEach(function (i) { if (saved[i.name]) i.value = saved[i.name]; size(i); });
    // Prefill who they are from the email link (?email=&name=) or last time
    var q = new URLSearchParams(location.search);
    if (q.get("email")) form.elements.email.value = q.get("email");
    else if (saved._email) form.elements.email.value = saved._email;
    if (q.get("name")) form.elements.firstName.value = q.get("name");
    else if (saved._name) form.elements.firstName.value = saved._name;

    // Each blank grows with what's typed, like writing on a line
    function size(i) { i.style.width = Math.max(i.classList.contains("ws-blank--s") ? 3 : 8, Math.min((i.value || i.placeholder || "").length + 1, 40)) + "ch"; }
    var t;
    function store() {
      var out = {};
      blanks.forEach(function (i) { if (i.value.trim()) out[i.name] = i.value.trim(); });
      out._email = form.elements.email.value.trim();
      out._name = form.elements.firstName.value.trim();
      try { localStorage.setItem(KEY, JSON.stringify(out)); } catch (e) { /* private mode: answers stay on the page only */ }
      return out;
    }
    form.addEventListener("input", function (e) {
      if (e.target.classList.contains("ws-blank")) size(e.target);
      clearTimeout(t); t = setTimeout(store, 250);
    });

    var status = $("ws-status"), btn = $("ws-submit");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var all = store();
      var answers = {};
      Object.keys(all).forEach(function (k) { if (k.charAt(0) !== "_") answers[k] = all[k]; });
      if (!Object.keys(answers).length) { say(status, "Fill in at least one blank first.", "error"); blanks[0].focus(); return; }
      if (!EMAIL_RE.test(all._email)) { say(status, "Enter a valid email address.", "error"); form.elements.email.focus(); return; }
      btn.disabled = true;
      say(status, "Sending your answers…", "info");
      post({ kind: "answers", firstName: all._name, email: all._email, answers: answers, honeypot: form.elements.honeypot.value, sourcePage: location.pathname })
        .then(function (d) {
          btn.disabled = false;
          if (!d.ok) { say(status, d.error || "That didn't go through. Try again.", "error"); return; }
          track("growth_guide_answers", { count: Object.keys(answers).length });
          say(status, "Sent to " + all._email + ". Next: pick a time to go over it with us.", "success");
          var cal = $("ws-cal"); if (cal) { cal.classList.remove("mf-btn--ghost"); cal.focus(); }
        }, function () { btn.disabled = false; say(status, OFFLINE, "error"); });
    });
  }

  function init() { initLanding(); initWorksheet(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
