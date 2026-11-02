/* ============================================================
   /account.html: email-updates sign-up + member log-in.
   - ?confirm=<token>          → POST /api/subscribe/confirm
   - ?unsubscribe=<id>         → POST /api/subscribe/unsubscribe
   (Done from the page, not a GET link, so mail scanners that pre-open
   links can't confirm or unsubscribe anyone.) The query is then removed
   from the address bar so the token isn't left in history.
   - Sign-up form → POST /api/subscribe (double opt-in).
   - Log-in form → POST /api/portal/login, then the dashboard.
   - Already signed in (GET /api/portal/me) → "Open my dashboard".
   ============================================================ */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };

  function show(el, msg, type) {
    el.textContent = msg;
    el.className = "mf-status is-" + type + (el.id === "ac-banner" ? " ac-banner" : "");
    el.hidden = false;
  }

  function post(url, body) {
    return fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { d.status = r.status; return d; });
    });
  }

  var NETWORK = "We couldn't reach the server. Check your connection and try again.";

  /* ---------- Links from emails ---------- */
  function handleLinks() {
    var q = new URLSearchParams(location.search);
    var banner = $("ac-banner");
    var token = q.get("confirm");
    var unsubId = q.get("unsubscribe");
    if (!token && !unsubId) return;
    try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) { /* ignore */ }

    if (token) {
      show(banner, "Confirming your email…", "info");
      post("/api/subscribe/confirm", { token: token }).then(function (d) {
        if (d.ok) show(banner, "You're in. We'll email you when something new drops.", "success");
        else show(banner, d.error || "That link isn't valid.", "error");
      }, function () { show(banner, NETWORK, "error"); });
    } else {
      show(banner, "Unsubscribing…", "info");
      post("/api/subscribe/unsubscribe", { id: unsubId }).then(function (d) {
        if (d.ok) show(banner, "You're unsubscribed. You won't get any more update emails. Changed your mind? Sign up again below.", "success");
        else show(banner, d.error || "That unsubscribe link isn't valid.", "error");
      }, function () { show(banner, NETWORK, "error"); });
    }
  }

  /* ---------- Sign-up ---------- */
  function wireSignup() {
    var form = $("sub-form"), status = $("sub-status"), btn = $("sub-submit");
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = form.email.value.trim();
      var interests = Array.prototype.map.call(form.querySelectorAll('input[name="interests"]:checked'), function (i) { return i.value; });
      if (!interests.length) { show(status, "Pick at least one kind of update.", "error"); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { show(status, "Enter a valid email address.", "error"); form.email.focus(); return; }
      btn.disabled = true;
      post("/api/subscribe", {
        email: email,
        name: form.name.value.trim(),
        interests: interests,
        honeypot: form.company.value,
        sourcePage: location.pathname
      }).then(function (d) {
        btn.disabled = false;
        if (d.ok) {
          form.reset();
          show(status, "Almost done. Check your inbox and tap the link to confirm.", "success");
          try { if (window.posthog) window.posthog.capture("updates_signup", { interests: interests.join(",") }); } catch (err) { /* ignore */ }
        } else {
          show(status, d.error || "Something went wrong. Try again.", "error");
        }
      }, function () { btn.disabled = false; show(status, NETWORK, "error"); });
    });
  }

  /* ---------- Log-in ---------- */
  function signedIn(user) {
    $("ac-signed-email").textContent = user.email;
    if (user.isAdmin) $("ac-dash").href = "/admin/";
    $("ac-signed").hidden = false;
    $("login-form").hidden = true;
  }

  function wireLogin() {
    var form = $("login-form"), status = $("login-status"), btn = $("login-submit");
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = form.email.value.trim(), password = form.password.value;
      if (!email || !password) { show(status, "Enter your email and password.", "error"); return; }
      btn.disabled = true;
      post("/api/portal/login", { email: email, password: password }).then(function (d) {
        if (d.ok) {
          show(status, "Signed in. Opening your dashboard…", "success");
          location.href = d.redirect || "/portal/dashboard.html";
        } else {
          btn.disabled = false;
          show(status, d.status === 401 ? "That email and password don't match." : (d.error || "Couldn't sign in. Try again."), "error");
        }
      }, function () { btn.disabled = false; show(status, NETWORK, "error"); });
    });

    $("ac-logout").addEventListener("click", function () {
      post("/api/portal/logout").then(function () { location.reload(); }, function () { location.reload(); });
    });

    fetch("/api/portal/me", { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.ok && d.user) signedIn(d.user); })
      .catch(function () { /* not signed in or offline: keep the form */ });
  }

  function init() { handleLinks(); wireSignup(); wireLogin(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
