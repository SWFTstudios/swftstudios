/**
 * Client portal front-end helpers.
 */
(function () {
  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function showMsg(el, text, kind) {
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || "";
    el.className = "portal-msg" + (kind ? " portal-msg--" + kind : "");
  }

  async function api(path, options) {
    const res = await fetch(path, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(options && options.headers) },
      ...options,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = { ok: false, error: "Unexpected response" };
    }
    return { res, data };
  }

  function params() {
    return new URLSearchParams(window.location.search);
  }

  window.SWFTPortal = {
    qs,
    showMsg,
    api,
    params,
    async requireAuth() {
      const { res, data } = await api("/api/portal/me");
      if (!res.ok || !data.ok) {
        window.location.href = "/portal/login.html";
        return null;
      }
      return data;
    },
  };
})();
