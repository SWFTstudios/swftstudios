/**
 * Client portal front-end helpers (auth pages + workspace app).
 */
(function () {
  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function qsa(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function showMsg(el, text, kind) {
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || "";
    el.className = "pt-msg" + (kind ? " pt-msg--" + kind : "");
    el.setAttribute("role", kind === "error" ? "alert" : "status");
  }

  async function api(path, options) {
    options = options || {};
    const headers = Object.assign({}, options.headers || {});
    if (options.body && typeof options.body === "string" && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    let res;
    try {
      res = await fetch(path, Object.assign({ credentials: "same-origin" }, options, { headers: headers }));
    } catch (err) {
      return { res: { ok: false, status: 0 }, data: { ok: false, error: "You seem to be offline. Try again." } };
    }
    let data = null;
    try {
      data = await res.json();
    } catch (err) {
      data = { ok: false, error: "Unexpected response" };
    }
    return { res: res, data: data };
  }

  function params() {
    return new URLSearchParams(window.location.search);
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function fmtBytes(n) {
    if (!n && n !== 0) return "";
    if (n < 1024) return n + " B";
    var u = ["KB", "MB", "GB"], i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
    return (n >= 10 ? Math.round(n) : n.toFixed(1)) + " " + u[i];
  }

  // D1 stores "YYYY-MM-DD HH:MM:SS" in UTC
  function parseDate(s) {
    if (!s) return null;
    var d = new Date(/T/.test(s) ? s : String(s).replace(" ", "T") + "Z");
    return isNaN(d) ? null : d;
  }

  function fmtDate(s, withTime) {
    var d = /^\d{4}-\d{2}-\d{2}$/.test(s || "") ? new Date(s + "T12:00:00") : parseDate(s);
    if (!d) return "";
    var opts = { month: "short", day: "numeric" };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
    if (withTime) { opts.hour = "numeric"; opts.minute = "2-digit"; }
    return d.toLocaleString(undefined, opts);
  }

  function timeAgo(s) {
    var d = parseDate(s);
    if (!d) return "";
    var sec = Math.round((Date.now() - d.getTime()) / 1000);
    if (sec < 60) return "just now";
    if (sec < 3600) return Math.floor(sec / 60) + "m ago";
    if (sec < 86400) return Math.floor(sec / 3600) + "h ago";
    if (sec < 7 * 86400) return Math.floor(sec / 86400) + "d ago";
    return fmtDate(s);
  }

  var toastTimer = 0;
  function toast(text) {
    var el = qs("#pt-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "pt-toast";
      el.className = "pt-toast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
  }

  async function logout() {
    await api("/api/portal/logout", { method: "POST" });
    window.location.href = "/portal/login.html";
  }

  window.SWFTPortal = {
    qs: qs,
    qsa: qsa,
    showMsg: showMsg,
    api: api,
    params: params,
    esc: esc,
    fmtBytes: fmtBytes,
    fmtDate: fmtDate,
    timeAgo: timeAgo,
    toast: toast,
    logout: logout,
    async requireAuth() {
      const r = await api("/api/portal/session");
      if (!r.res.ok || !r.data.ok) {
        window.location.href = "/portal/login.html?next=" + encodeURIComponent(location.pathname + location.hash);
        return null;
      }
      return r.data;
    },
  };
})();
