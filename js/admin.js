/**
 * Owner dashboard. The server decides who is an admin (/api/admin/*); this file
 * only renders. All dynamic text goes through el()/textContent, never innerHTML.
 */
(function () {
  var P = window.SWFTPortal;
  var state = null;

  function el(tag, props, children) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === "text") n.textContent = props[k];
      else if (k === "class") n.className = props[k];
      else if (k.indexOf("on") === 0) n.addEventListener(k.slice(2), props[k]);
      else n.setAttribute(k, props[k]);
    });
    (children || []).forEach(function (c) {
      if (c != null) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return n;
  }

  function date(s) {
    if (!s) return "";
    var d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : String(s).replace(" ", "T") + "Z");
    return isNaN(d) ? String(s) : d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  }

  function card(label, children) {
    return el("div", { class: "portal-card" }, [el("p", { class: "portal-stat-label", text: label })].concat(children));
  }

  function stat(label, value) {
    return el("div", {}, [el("p", { class: "portal-stat-label", text: label }), el("p", { class: "portal-stat", text: String(value) })]);
  }

  function table(headers, rows, empty) {
    if (!rows.length) return el("p", { class: "admin-muted", text: empty || "Nothing here yet." });
    return el("div", { class: "admin-table-wrap" }, [
      el("table", { class: "admin-table" }, [
        el("thead", {}, [el("tr", {}, headers.map(function (h) { return el("th", { text: h }); }))]),
        el("tbody", {}, rows.map(function (r) {
          return el("tr", {}, r.map(function (c) { return el("td", {}, [c instanceof Node ? c : String(c == null ? "" : c)]); }));
        })),
      ]),
    ]);
  }

  function notice(text) { return el("p", { class: "portal-msg portal-msg--info", text: text }); }

  /* ---------- panels ---------- */

  function renderOverview(root) {
    var s = state.summary, o = state.outreach;
    root.replaceChildren(
      card("Business", [el("div", { class: "admin-stats" }, [stat("Clients", s.clients), stat("Active / paid", s.activeClients), stat("Past due", s.pastDue)])]),
      card("Outreach", o.configured && !o.error
        ? [el("div", { class: "admin-stats" }, [
            stat("Drafts to approve", o.pendingDrafts.length),
            stat("Leads scored", (o.leadsByStatus.scored || 0)),
            stat("Sent", o.recentSends.length + (o.recentSends.length === 25 ? "+" : "")),
            stat("Replies", o.replies.length),
          ])]
        : [notice(o.error || "Outreach database not connected yet. See docs/ADMIN_DASHBOARD.md.")]),
      card("Blog", [el("p", { class: "portal-stat", text: state.blog.configured ? state.blog.posts.length + " posts" : "Not indexed" })])
    );
  }

  function renderNotes(box, projectId) {
    var q = projectId ? "?projectId=" + encodeURIComponent(projectId) : "";
    box.replaceChildren(el("p", { class: "admin-muted", text: "Loading notes…" }));
    P.api("/api/admin/notes" + q).then(function (r) {
      var list = (r.data && r.data.notes) || [];
      var ta = el("textarea", { placeholder: "Add a private note…", "aria-label": "New note" });
      var form = el("div", { class: "admin-note-form" }, [
        ta,
        el("button", {
          class: "admin-row-btn", type: "button", text: "Save note",
          onclick: function () {
            if (!ta.value.trim()) return;
            P.api("/api/admin/notes", { method: "POST", body: JSON.stringify({ projectId: projectId || null, body: ta.value }) })
              .then(function (x) {
                if (!x.res.ok) { alert((x.data && x.data.error) || "Could not save."); return; }
                if (projectId) { var c = state.clients.find(function (k) { return k.id === projectId; }); if (c) c.noteCount++; }
                renderNotes(box, projectId);
              });
          },
        }),
      ]);
      box.replaceChildren.apply(box, [form].concat(list.map(function (n) {
        return el("div", { class: "admin-note" }, [
          el("div", {}, [el("p", { text: n.body }), el("small", { text: date(n.created_at) })]),
          el("button", {
            class: "admin-row-btn", type: "button", text: "Delete",
            onclick: function () {
              if (!confirm("Delete this note?")) return;
              P.api("/api/admin/notes?id=" + encodeURIComponent(n.id), { method: "DELETE" }).then(function () {
                if (projectId) { var c = state.clients.find(function (k) { return k.id === projectId; }); if (c && c.noteCount) c.noteCount--; }
                renderNotes(box, projectId);
              });
            },
          }),
        ]);
      })));
    });
  }

  function renderClients(root) {
    var detail = el("div");
    var rows = state.clients.map(function (c) {
      return [
        c.email, c.tierName, c.status, c.siteHost || "—", date(c.createdAt),
        el("button", {
          class: "admin-row-btn", type: "button", text: "Notes (" + c.noteCount + ")",
          onclick: function () {
            detail.replaceChildren(card("Notes: " + c.email + " · " + c.tierName, [el("div", { id: "notes-box" })]));
            renderNotes(detail.querySelector("#notes-box"), c.id);
            detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
          },
        }),
      ];
    });
    var general = el("div", { id: "general-notes" });
    root.replaceChildren(
      card("Client projects", [table(["Client", "Package", "Status", "Site", "Started", ""], rows, "No client projects yet.")]),
      detail,
      card("General notes", [general])
    );
    renderNotes(general, null);
  }

  function renderOutreach(root) {
    var o = state.outreach;
    if (!o.configured || o.error) { root.replaceChildren(card("Outreach", [notice(o.error || "Outreach database not connected yet. See docs/ADMIN_DASHBOARD.md.")])); return; }
    root.replaceChildren(
      card("Leads by status", [table(["Status", "Count"], Object.keys(o.leadsByStatus).map(function (k) { return [k, o.leadsByStatus[k]]; }), "No leads yet.")]),
      card("Drafts awaiting approval", [table(["Lead", "City", "Score", "Subject"], o.pendingDrafts.map(function (d) { return [d.lead, d.city, d.score, d.subject]; }), "No drafts waiting. Review and approve them at the outreach /approve page.")]),
      card("Recent sends", [table(["When", "Lead", "Subject", "Status"], o.recentSends.map(function (s) { return [date(s.sent_at), s.lead, s.subject, s.status]; }), "Nothing sent yet.")]),
      card("Replies", [table(["When", "Lead", "Class", "Excerpt"], o.replies.map(function (r) { return [date(r.received_at), r.lead || "—", r.class || "unclassified", r.excerpt]; }), "No replies yet.")]),
      card("Job runs", [table(["When", "Job", "OK", "Detail"], o.runs.map(function (r) { return [date(r.started_at), r.job, r.ok ? "yes" : "no", r.detail]; }), "No runs recorded.")])
    );
  }

  function renderEmails(root) {
    root.replaceChildren(card("Sent emails (Resend)", [el("p", { class: "admin-muted", text: "Loading…" })]));
    P.api("/api/admin/emails").then(function (r) {
      var d = r.data || {};
      var body;
      if (!r.res.ok || !d.ok) body = [notice((d && d.error) || "Could not load emails.")];
      else if (!d.configured) body = [notice("RESEND_API_KEY is not set on this project.")];
      else body = (d.note ? [notice(d.note)] : []).concat([table(["When", "To", "Subject", "Status"], d.emails.map(function (e) { return [date(e.createdAt), e.to, e.subject, e.status]; }), "No emails found.")]);
      root.replaceChildren(card("Sent emails (Resend)", body));
    });
  }

  function renderBlog(root) {
    var b = state.blog;
    if (!b.configured) { root.replaceChildren(card("Blog posts", [notice("Run npm run build:blog-index to generate data/blog-posts.json.")])); return; }
    root.replaceChildren(card("Blog posts", [table(["Title", "Last updated", "URL"], b.posts.map(function (p) {
      return [p.title, p.updated, el("a", { href: p.url, class: "portal-link", text: p.url })];
    }))]));
  }

  var RENDER = { overview: renderOverview, clients: renderClients, outreach: renderOutreach, emails: renderEmails, blog: renderBlog };
  var drawn = {};

  function show(tab) {
    document.querySelectorAll(".admin-tabs button").forEach(function (b) { b.setAttribute("aria-selected", String(b.dataset.tab === tab)); });
    document.querySelectorAll(".admin-panel").forEach(function (p) { p.hidden = p.id !== "tab-" + tab; });
    var root = document.getElementById("tab-" + tab);
    if (!drawn[tab] || tab === "overview") { RENDER[tab](root); drawn[tab] = true; }
    try { history.replaceState(null, "", "#" + tab); } catch (e) { /* ignore */ }
  }

  async function init() {
    var gate = P.qs("#gate-msg");
    var r = await P.api("/api/admin/overview");
    if (r.res.status === 401) { window.location.href = "/portal/login.html"; return; }
    if (r.res.status === 403) {
      P.qs("#who").textContent = "This area is for the site owner.";
      P.showMsg(gate, "Your account does not have admin access. Go to your client dashboard instead.", "error");
      return;
    }
    if (!r.res.ok || !r.data.ok) { P.showMsg(gate, (r.data && r.data.error) || "Could not load the dashboard.", "error"); return; }
    state = r.data;
    P.qs("#who").textContent = "Signed in as " + state.admin.email;
    P.qs("#app").hidden = false;
    document.querySelectorAll(".admin-tabs button").forEach(function (b) { b.addEventListener("click", function () { show(b.dataset.tab); }); });
    var start = (location.hash || "").slice(1);
    show(RENDER[start] ? start : "overview");
  }

  P.qs("#logout-btn").addEventListener("click", async function () {
    await P.api("/api/portal/logout", { method: "POST", body: "{}" });
    window.location.href = "/portal/login.html";
  });

  init();
})();
