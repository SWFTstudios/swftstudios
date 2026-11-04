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

  function num(n) {
    n = Number(n) || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
    return n.toLocaleString();
  }

  // Small bar chart from [{date, value}] (SVG, no library). Hover shows the day.
  function bars(points, label) {
    var NS = "http://www.w3.org/2000/svg";
    var w = 600, h = 120, max = Math.max.apply(null, points.map(function (p) { return p.value; }).concat([1]));
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    svg.setAttribute("class", "admin-chart");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", label + ", " + points.length + " days, peak " + num(max));
    var bw = w / Math.max(points.length, 1);
    points.forEach(function (p, i) {
      var bh = Math.max(1, (p.value / max) * (h - 6));
      var r = document.createElementNS(NS, "rect");
      r.setAttribute("x", (i * bw + bw * 0.15).toFixed(1));
      r.setAttribute("y", (h - bh).toFixed(1));
      r.setAttribute("width", (bw * 0.7).toFixed(1));
      r.setAttribute("height", bh.toFixed(1));
      r.setAttribute("rx", "2");
      var t = document.createElementNS(NS, "title");
      t.textContent = p.date + ": " + p.value.toLocaleString();
      r.appendChild(t);
      svg.appendChild(r);
    });
    var first = points[0], last = points[points.length - 1];
    return el("figure", { class: "admin-chart-wrap" }, [
      svg,
      el("figcaption", { class: "admin-chart-axis" }, [el("span", { text: first ? first.date : "" }), el("span", { text: label }), el("span", { text: last ? last.date : "" })]),
    ]);
  }

  function progressBar(p) {
    if (!p || !p.total) return el("span", { class: "admin-muted", text: "No milestones" });
    return el("div", { class: "admin-progress", title: p.done + " of " + p.total + " milestones done" }, [
      el("span", { class: "admin-progress__bar" }, [el("span", { style: "width:" + p.percent + "%" })]),
      el("small", { text: p.percent + "%" + (p.current ? " · " + p.current : "") }),
    ]);
  }

  function notice(text) { return el("p", { class: "portal-msg portal-msg--info", text: text }); }

  /* ---------- panels ---------- */

  function renderOverview(root) {
    var s = state.summary, o = state.outreach;
    root.replaceChildren(
      card("Business", [el("div", { class: "admin-stats" }, [stat("Clients", s.clients), stat("Active / paid", s.activeClients), stat("In progress", s.inProgress == null ? "—" : s.inProgress), stat("Past due", s.pastDue)])]),
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

  /* ---------- Projects ---------- */

  var STATUS_LABEL = { upcoming: "Upcoming", in_progress: "In progress", done: "Done" };

  function post(body) {
    return P.api("/api/admin/project", { method: "POST", body: JSON.stringify(body) }).then(function (x) {
      if (!x.res.ok || !x.data.ok) { alert((x.data && x.data.error) || "Could not save."); return false; }
      return true;
    });
  }

  function openProject(detail, c) {
    detail.replaceChildren(card("Project", [el("p", { class: "admin-muted", text: "Loading…" })]));
    P.api("/api/admin/project?id=" + encodeURIComponent(c.id)).then(function (r) {
      if (!r.res.ok || !r.data.ok) { detail.replaceChildren(card("Project", [notice((r.data && r.data.error) || "Could not load the project.")])); return; }
      var v = r.data.view;
      var reload = function () { refreshList(); openProject(detail, c); };

      var head = el("div", { class: "admin-project-head" }, [
        el("div", {}, [
          el("h2", { class: "admin-project-title", text: v.project.name + (v.project.isDemo ? " · demo" : "") }),
          el("p", { class: "admin-muted", text: v.client.email + " · " + v.project.tierName + " · " + v.project.status + (v.project.siteHost ? " · " + v.project.siteHost : "") }),
        ]),
        el("div", { class: "admin-project-actions" }, [
          el("a", { class: "admin-row-btn", href: "/portal/dashboard.html?preview=" + encodeURIComponent(v.project.id), target: "_blank", rel: "noopener", text: "View as client ↗" }),
          el("button", { class: "admin-row-btn", type: "button", text: "Rename", onclick: function () {
            var name = prompt("Project name (shown to the client)", v.project.name);
            if (name != null) post({ action: "rename", projectId: v.project.id, name: name }).then(function (ok) { if (ok) reload(); });
          } }),
        ]),
      ]);

      var ms = v.progressReady
        ? el("ol", { class: "admin-milestones" }, v.milestones.map(function (m) {
            var sel = el("select", { "aria-label": "Status of " + m.title, onchange: function () {
              post({ action: "milestone_status", id: m.id, status: sel.value }).then(function (ok) { if (ok) reload(); });
            } }, ["upcoming", "in_progress", "done"].map(function (k) {
              var o = el("option", { value: k, text: STATUS_LABEL[k] }); if (k === m.status) o.selected = true; return o;
            }));
            return el("li", { class: "admin-milestone is-" + m.status }, [
              el("div", {}, [el("strong", { text: m.title }), m.detail ? el("p", { class: "admin-muted", text: m.detail }) : null, m.dueDate ? el("small", { text: (m.status === "done" ? "Done " : "Due ") + (m.completedAt ? date(m.completedAt) : m.dueDate) }) : null]),
              el("div", { class: "admin-milestone__ctl" }, [sel, el("button", { class: "admin-row-btn", type: "button", text: "Remove", onclick: function () {
                if (confirm("Remove milestone \u201c" + m.title + "\u201d?")) post({ action: "delete_milestone", id: m.id }).then(function (ok) { if (ok) reload(); });
              } })]),
            ]);
          }))
        : notice("Apply migration 0004 to track milestones and updates.");

      var mt = el("input", { type: "text", placeholder: "New milestone", "aria-label": "New milestone title", maxlength: "120" });
      var md = el("input", { type: "date", "aria-label": "Due date" });
      var addMs = el("form", { class: "admin-inline-form", onsubmit: function (e) {
        e.preventDefault();
        if (!mt.value.trim()) return;
        post({ action: "add_milestone", projectId: v.project.id, title: mt.value, dueDate: md.value }).then(function (ok) { if (ok) reload(); });
      } }, [mt, md, el("button", { class: "admin-row-btn", type: "submit", text: "Add" })]);

      var ut = el("textarea", { placeholder: "Write an update the client will see on their dashboard…", "aria-label": "New client update", maxlength: "2000" });
      var addUp = el("div", { class: "admin-note-form" }, [ut, el("button", { class: "admin-row-btn", type: "button", text: "Post update", onclick: function () {
        if (!ut.value.trim()) return;
        post({ action: "add_update", projectId: v.project.id, body: ut.value }).then(function (ok) { if (ok) reload(); });
      } })]);
      var ups = v.updates.map(function (u) {
        return el("div", { class: "admin-note" }, [
          el("div", {}, [el("p", { text: u.body }), el("small", { text: date(u.createdAt) })]),
          el("button", { class: "admin-row-btn", type: "button", text: "Delete", onclick: function () {
            if (confirm("Delete this update?")) post({ action: "delete_update", id: u.id }).then(function (ok) { if (ok) reload(); });
          } }),
        ]);
      });

      var notesBox = el("div");
      detail.replaceChildren(
        el("div", { class: "portal-card admin-project" }, [
          head,
          el("div", { class: "admin-project-progress" }, [progressBar(v.progress)]),
          el("p", { class: "portal-stat-label", text: "Milestones (client sees these)" }), ms, v.progressReady ? addMs : null,
          el("p", { class: "portal-stat-label", text: "Updates (client sees these)" }), v.progressReady ? addUp : null,
          el("div", {}, ups),
          el("p", { class: "portal-stat-label", text: "Private notes (only you)" }), notesBox,
        ])
      );
      renderNotes(notesBox, c.id);
    });
  }

  var listCard = null, detailBox = null;
  function projectRows() {
    return state.clients.map(function (c) {
      return [
        el("div", {}, [el("strong", { text: c.name }), c.isDemo ? el("span", { class: "admin-tag", text: "demo" }) : null, el("br"), el("small", { class: "admin-muted", text: c.email })]),
        c.tierName, c.status, progressBar(c.progress), c.siteHost || "—",
        el("button", { class: "admin-row-btn", type: "button", text: "Open", onclick: function () {
          openProject(detailBox, c);
          detailBox.scrollIntoView({ behavior: "smooth", block: "start" });
        } }),
      ];
    });
  }
  function refreshList() {
    P.api("/api/admin/overview").then(function (r) {
      if (r.res.ok && r.data.ok) { state = r.data; listCard.replaceChildren(el("p", { class: "portal-stat-label", text: "Client projects" }), table(["Project", "Package", "Status", "Progress", "Site", ""], projectRows(), "No client projects yet.")); }
    });
  }

  function renderClients(root) {
    detailBox = el("div");
    listCard = card("Client projects", [table(["Project", "Package", "Status", "Progress", "Site", ""], projectRows(), "No client projects yet. Run scripts/seed-demo-project.sql for a demo.")]);
    var general = el("div");
    root.replaceChildren(listCard, detailBox, card("General notes", [general]));
    renderNotes(general, null);
    var demo = state.clients.find(function (k) { return k.isDemo; });
    if (demo) openProject(detailBox, demo);
  }

  /* ---------- Analytics (the SWFT site itself) ---------- */

  function renderAnalytics(root) {
    root.replaceChildren(card("Website analytics", [el("p", { class: "admin-muted", text: "Loading…" })]));
    P.api("/api/admin/analytics").then(function (r) {
      if (!r.res.ok || !r.data.ok) { root.replaceChildren(card("Website analytics", [notice((r.data && r.data.error) || "Could not load analytics.")])); return; }
      var cf = r.data.cloudflare, ph = r.data.posthog;
      var cfCard = cf.ok
        ? card("Traffic · Cloudflare · last 30 days", [
            el("div", { class: "admin-stats" }, [stat("Unique visitors", num(cf.totals.visitors)), stat("Requests", num(cf.totals.requests)), stat("Page views", num(cf.totals.pageViews)), stat("Served from cache", cf.totals.percentCached + "%")]),
            bars(cf.daily.map(function (d) { return { date: d.date, value: d.visitors }; }), "Unique visitors per day"),
            el("p", { class: "admin-muted admin-src", text: "Everything Cloudflare served for " + r.data.host + ", bots and image/script files included. Unique visitors = unique IP addresses per day, so this runs higher than PostHog or Google Analytics." }),
          ])
        : card("Traffic · Cloudflare", [notice(cf.message)]);
      var phBody;
      if (!ph.ok) phBody = [notice(ph.message)];
      else if (ph.empty) phBody = [notice(ph.message)];
      else phBody = [
        el("div", { class: "admin-stats" }, [stat("Visitors", num(ph.visitors)), stat("Page views", num(ph.pageviews))]),
        ph.daily && ph.daily.length ? bars(ph.daily.map(function (d) { return { date: d.date, value: d.pageviews }; }), "Page views per day") : null,
        table(["Top pages", "Views"], (ph.topPages || []).map(function (p) { return [p.path, num(p.pageviews)]; }), "No page data yet."),
        el("p", { class: "admin-muted admin-src", text: "People who loaded pages with the tracking snippet (ad blockers and bots mostly excluded). Visitors are summed daily uniques." }),
      ];
      root.replaceChildren(
        cfCard,
        card("Visitors · PostHog · last 30 days", phBody),
        card("Google Analytics", [el("p", { class: "admin-muted", text: "GA4 (G-F2BXR858CL) has the full picture, including key events and revenue. Open it in Google Analytics; the guide on the blog explains every column." }),
          el("p", {}, [el("a", { class: "portal-link", href: "https://analytics.google.com/", target: "_blank", rel: "noopener", text: "Open Google Analytics ↗" }), " · ", el("a", { class: "portal-link", href: "/blog/google-analytics-metrics-explained.html", text: "What the numbers mean" })])])
      );
    });
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

  /* ---------- Guides: Free SWFT Growth Guide requests ----------
     "Do it for me" requests and worksheet answers get a Write results button:
     a template to fill in, then Send results emails it with the 1-on-1 link. */
  var GUIDE_KIND = { dfy: "Do it for me", answers: "Worksheet answers", diy: "Started on their own" };
  var GUIDE_TEMPLATE = [
    "Here's what stood out:",
    "",
    "Build the foundation",
    "- ",
    "",
    "Grow your reach",
    "- ",
    "",
    "Automate the rest",
    "- ",
    "",
    "Do this first",
    "- "
  ].join("\n");

  function guideDetails(g, questions) {
    var d = g.details || {};
    if (g.kind === "dfy") {
      return table(["", ""], [
        ["Business", d.businessName], ["Links", d.links], ["Sells", d.sells],
        ["Customers", d.customers || "—"], ["90-day goal", d.goal], ["Anything else", d.notes || "—"]
      ].filter(function (r) { return r[1]; }));
    }
    var a = d.answers || {};
    return table(["Question", "Answer"], questions.filter(function (q) { return a[q.key]; }).map(function (q) {
      return [q.q.replace("___", "…"), a[q.key]];
    }), "No answers.");
  }

  function openGuide(box, g, questions, reload) {
    var ta = el("textarea", { "aria-label": "Results for " + (g.firstName || g.email), rows: "14" });
    ta.value = g.results || GUIDE_TEMPLATE;
    var msg = el("p", { class: "admin-muted", text: g.status === "sent" ? "Sent " + date(g.resultsSentAt) + ". Sending again emails the new text." : "" });
    var btn = el("button", { class: "mf-btn mf-btn--sm", type: "button", text: g.status === "sent" ? "Send again" : "Send results", onclick: function () {
      if (!confirm("Email these results to " + g.email + "?")) return;
      btn.disabled = true; msg.textContent = "Sending…";
      P.api("/api/admin/guides", { method: "POST", body: JSON.stringify({ id: g.id, results: ta.value }) }).then(function (r) {
        btn.disabled = false;
        if (r.res.ok && r.data.ok) { msg.textContent = "Sent to " + g.email + "."; reload(); }
        else msg.textContent = (r.data && r.data.error) || "Could not send.";
      });
    } });
    box.replaceChildren(card((g.businessName || g.firstName || g.email) + " · " + GUIDE_KIND[g.kind], [
      el("p", {}, [el("a", { class: "portal-link", href: "mailto:" + g.email, text: g.email }), " · " + date(g.createdAt)]),
      guideDetails(g, questions),
      el("p", { class: "portal-stat-label", text: "Results email" }),
      el("p", { class: "admin-muted", text: "Plain text. A line followed by \"- \" lines becomes a heading with a list. The email adds a greeting and a Book my 1-on-1 button." }),
      el("div", { class: "admin-note-form" }, [ta]),
      el("div", { class: "admin-inline-form" }, [btn, msg])
    ]));
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderGuides(root) {
    var list = el("div"), detail = el("div", { class: "admin-guide-detail" });
    root.replaceChildren(list, detail);
    list.replaceChildren(card("Growth Guide requests", [el("p", { class: "admin-muted", text: "Loading…" })]));
    var load = function () {
      P.api("/api/admin/guides").then(function (r) {
        var d = r.data || {};
        if (!r.res.ok || !d.ok) { list.replaceChildren(card("Growth Guide requests", [notice((d && d.error) || "Could not load guides.")])); return; }
        var waiting = d.guides.filter(function (g) { return g.kind !== "diy" && g.status !== "sent"; }).length;
        list.replaceChildren(card("Growth Guide requests", [
          el("p", { class: "admin-muted", text: waiting ? waiting + " waiting for results." : "Nothing waiting." }),
          table(["When", "Who", "Business", "Type", "Status", ""], d.guides.map(function (g) {
            var action = g.kind === "diy" ? "" : el("button", { class: "admin-row-btn", type: "button", text: g.status === "sent" ? "View" : "Write results", onclick: function () { openGuide(detail, g, d.questions, load); } });
            return [date(g.createdAt), (g.firstName ? g.firstName + " · " : "") + g.email, g.businessName || "—", GUIDE_KIND[g.kind], g.kind === "diy" ? "—" : g.status === "sent" ? "Sent" : "New", action];
          }), "No guide requests yet.")
        ]));
      });
    };
    load();
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

  var RENDER = { overview: renderOverview, analytics: renderAnalytics, clients: renderClients, outreach: renderOutreach, guides: renderGuides, emails: renderEmails, blog: renderBlog };
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
    window.addEventListener("hashchange", function () {
      var t = (location.hash || "").slice(1);
      if (RENDER[t]) show(t);
    });
  }

  P.qs("#logout-btn").addEventListener("click", async function () {
    await P.api("/api/portal/logout", { method: "POST", body: "{}" });
    window.location.href = "/portal/login.html";
  });

  init();
})();
