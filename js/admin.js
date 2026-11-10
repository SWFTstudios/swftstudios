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

  /** Local calendar day as YYYY-MM-DD, for <input type="date">. */
  function isoLocal(d) {
    function p2(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
  }
  /** Stored completion time (UTC "YYYY-MM-DD HH:MM:SS") as the local calendar day. */
  function isoFromStored(s) {
    if (!s) return "";
    var d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : String(s).replace(" ", "T") + "Z");
    return isNaN(d) ? "" : isoLocal(d);
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

  var refocusId = null, openIds = {}, openFor = null;
  // The admin calendar survives reloads of the project view, so it stays on the week/month you were looking at.
  var calFor = null, calBox = null, calApi = null;

  /**
   * Drag-and-drop ordering with pointer events (mouse, touch and pen). The list
   * element captures the pointer, so moving cards around in the DOM can't drop
   * the drag. On release the full new order is saved; the page reloads either
   * way, so a failed save puts the cards back where the server has them.
   */
  function enableReorder(list, projectId, reload) {
    var dragging = null, before = "";
    var order = function () { return [].map.call(list.children, function (li) { return li.getAttribute("data-id"); }); };
    list.addEventListener("pointerdown", function (e) {
      if (e.button != null && e.button !== 0) return;
      var grip = e.target.closest ? e.target.closest(".admin-grip") : null;
      var li = grip && grip.closest(".admin-milestone");
      if (!li) return;
      e.preventDefault();
      dragging = li; before = order().join(",");
      li.classList.add("is-dragging"); list.classList.add("is-sorting");
      try { list.setPointerCapture(e.pointerId); } catch (err) { /* older browsers: window listeners below still work */ }
    });
    list.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var others = [].filter.call(list.children, function (li) { return li !== dragging; });
      var next = null;
      for (var i = 0; i < others.length; i++) {
        var r = others[i].getBoundingClientRect();
        if (e.clientY < r.top + r.height / 2) { next = others[i]; break; }
      }
      if (next ? dragging.nextElementSibling !== next : dragging !== list.lastElementChild) list.insertBefore(dragging, next);
    });
    function finish(save) {
      if (!dragging) return;
      var li = dragging; dragging = null;
      li.classList.remove("is-dragging"); list.classList.remove("is-sorting");
      var ids = order();
      if (save && ids.join(",") !== before) {
        refocusId = li.getAttribute("data-id");
        post({ action: "reorder_milestones", projectId: projectId, ids: ids }).then(function () { reload(); });
      } else if (!save) {
        reload();
      }
    }
    list.addEventListener("pointerup", function () { finish(true); });
    list.addEventListener("pointercancel", function () { finish(false); });
  }

  function openProject(detail, c) {
    detail.replaceChildren(card("Project", [el("p", { class: "admin-muted", text: "Loading…" })]));
    P.api("/api/admin/project?id=" + encodeURIComponent(c.id)).then(function (r) {
      if (!r.res.ok || !r.data.ok) { detail.replaceChildren(card("Project", [notice((r.data && r.data.error) || "Could not load the project.")])); return; }
      var v = r.data.view;
      var reload = function () { refreshList(); openProject(detail, c); };

      var back = el("button", { class: "admin-back", type: "button", text: "\u2190 All projects", onclick: function () { location.hash = "clients"; } });
      // One-time link to set (or reset) the client's password. Emailed, and shown here to copy into a text.
      var linkBox = el("div", { class: "admin-login-link", hidden: "hidden", role: "status" });
      var linkBtn = el("button", { class: "admin-row-btn", type: "button", text: "Send login link", onclick: function () {
        if (!confirm("Email " + v.client.email + " a one-time link to set their portal password? Any earlier link stops working.")) return;
        linkBtn.disabled = true;
        P.api("/api/admin/project", { method: "POST", body: JSON.stringify({ action: "send_login_link", projectId: v.project.id }) }).then(function (x) {
          linkBtn.disabled = false;
          var d = x.data || {};
          if (!x.res.ok || !d.ok) { alert(d.error || "Could not create a login link."); return; }
          var input = el("input", { type: "text", readonly: "readonly", value: d.url, "aria-label": "Login link", onfocus: function () { input.select(); } });
          var copy = el("button", { class: "admin-row-btn", type: "button", text: "Copy", onclick: function () {
            input.select();
            (navigator.clipboard ? navigator.clipboard.writeText(d.url) : Promise.reject()).then(function () { copy.textContent = "Copied"; }, function () { document.execCommand("copy"); copy.textContent = "Copied"; });
          } });
          linkBox.replaceChildren(
            el("p", { text: (d.emailed ? "Emailed to " + d.email + ". " : "Couldn't email it (check RESEND_API_KEY), so send it yourself. ")
              + (d.hasPassword ? "They already have a password; this link lets them choose a new one." : "They haven't set a password yet.")
              + " Works once, for 7 days:" }),
            el("div", { class: "admin-inline-form" }, [input, copy]),
          );
          linkBox.hidden = false;
        });
      } });
      var head = el("div", { class: "admin-project-head" }, [
        el("div", {}, [
          el("h2", { class: "admin-project-title", text: v.project.name + (v.project.isDemo && !/demo/i.test(v.project.name) ? " · demo" : "") }),
          el("p", { class: "admin-muted", text: v.client.email + " · " + v.project.tierName + " · " + v.project.status + (v.project.siteHost ? " · " + v.project.siteHost : "") }),
        ]),
        el("div", { class: "admin-project-actions" }, [
          el("a", { class: "admin-row-btn", href: "/portal/dashboard.html?preview=" + encodeURIComponent(v.project.id), target: "_blank", rel: "noopener", text: "View as client ↗" }),
          el("button", { class: "admin-row-btn", type: "button", text: "Rename", onclick: function () {
            var name = prompt("Project name (shown to the client)", v.project.name);
            if (name != null) post({ action: "rename", projectId: v.project.id, name: name }).then(function (ok) { if (ok) reload(); });
          } }),
          linkBtn,
        ]),
      ]);

      // Which step cards are open survives reloads (status change, edit, drag). A freshly opened
      // project starts with its in-progress step open.
      if (openFor !== v.project.id) {
        openFor = v.project.id; openIds = {};
        v.milestones.forEach(function (m) { if (m.status === "in_progress") openIds[m.id] = true; });
      }
      var ms = v.progressReady
        ? el("ol", { class: "admin-milestones" }, v.milestones.map(function (m) {
            var panelId = "ms-panel-" + m.id;
            var isOpen = !!openIds[m.id];
            var today = isoLocal(new Date());
            var sel = el("select", { "aria-label": "Status of " + m.title, onchange: function () {
              // Marking a step done stamps today; the calendar field next to it changes the day.
              var body = { action: "milestone_status", id: m.id, status: sel.value };
              if (sel.value === "done") body.completedOn = today;
              post(body).then(function (ok) { if (ok) reload(); });
            } }, ["upcoming", "in_progress", "done"].map(function (k) {
              var o = el("option", { value: k, text: STATUS_LABEL[k] }); if (k === m.status) o.selected = true; return o;
            }));
            // Drag tab: pointer drag is wired on the list (enableReorder); arrow keys move the step one place.
            var grip = el("button", { class: "admin-grip", type: "button", title: "Drag to reorder", "aria-label": "Reorder " + m.title + ". Drag, or use the up and down arrow keys.", onkeydown: function (e) {
              if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
              e.preventDefault();
              refocusId = m.id;
              post({ action: "move_milestone", id: m.id, direction: e.key === "ArrowUp" ? "up" : "down" }).then(function (ok) { if (ok) reload(); });
            } }, [el("span", { class: "admin-grip__dots", "aria-hidden": "true" })]);
            var li = el("li", { class: "admin-milestone is-" + m.status + (isOpen ? " is-open" : ""), "data-id": m.id });
            var toggle = el("button", { class: "admin-milestone__toggle", type: "button", "aria-expanded": isOpen ? "true" : "false", "aria-controls": panelId, title: m.title, onclick: function () {
              var open = !li.classList.contains("is-open");
              li.classList.toggle("is-open", open);
              toggle.setAttribute("aria-expanded", open ? "true" : "false");
              if (open) openIds[m.id] = true; else delete openIds[m.id];
            } }, [
              el("span", { class: "admin-milestone__dot", "aria-hidden": "true" }),
              el("span", { class: "admin-milestone__title", text: m.title }),
              el("span", { class: "admin-pill", text: STATUS_LABEL[m.status] }),
              el("span", { class: "admin-milestone__chev", "aria-hidden": "true" }),
            ]);
            // One calendar field: the completion day on a done step, the target day on any other.
            var isDone = m.status === "done";
            var dateIn = el("input", { type: "date", value: isDone ? isoFromStored(m.completedAt) : (m.dueDate || ""), "aria-label": (isDone ? "Completed on, " : "Target date, ") + m.title, onchange: function () {
              post({ action: "set_milestone_date", id: m.id, date: dateIn.value }).then(function () { reload(); });
            } });
            if (isDone) { dateIn.max = today; dateIn.required = true; }
            var dateField = el("label", { class: "admin-milestone__date" }, [el("span", { text: isDone ? "Completed on" : "Target date" }), dateIn]);
            li.append(
              el("div", { class: "admin-milestone__row" }, [grip, toggle]),
              el("div", { class: "admin-milestone__panel", id: panelId }, [el("div", { class: "admin-milestone__panel-inner" }, [
                m.detail ? el("p", { class: "admin-milestone__detail", text: m.detail }) : el("p", { class: "admin-milestone__detail admin-muted", text: "No description." }),
                el("div", { class: "admin-milestone__ctl" }, [sel, dateField,
                  el("button", { class: "admin-row-btn", type: "button", text: "Edit", onclick: function () {
                    var title = prompt("Step title (client sees this)", m.title);
                    if (title == null || !title.trim()) return;
                    var detail = prompt("Short description (optional, client sees this)", m.detail || "");
                    if (detail == null) return;
                    post({ action: "edit_milestone", id: m.id, title: title, detail: detail, dueDate: m.dueDate || "" }).then(function (ok) { if (ok) reload(); });
                  } }),
                  el("button", { class: "admin-row-btn", type: "button", text: "Remove", onclick: function () {
                    if (confirm("Remove milestone \u201c" + m.title + "\u201d?")) post({ action: "delete_milestone", id: m.id }).then(function (ok) { if (ok) reload(); });
                  } })]),
              ])]),
            );
            return li;
          }))
        : notice("Apply migration 0004 to track milestones and updates.");
      if (v.progressReady) enableReorder(ms, v.project.id, reload);

      var mt = el("input", { type: "text", placeholder: "New milestone", "aria-label": "New milestone title", maxlength: "120" });
      var mdt = el("input", { type: "text", placeholder: "Short description (optional)", "aria-label": "New milestone description", maxlength: "400" });
      var md = el("input", { type: "date", "aria-label": "Due date" });
      var addMs = el("form", { class: "admin-inline-form", onsubmit: function (e) {
        e.preventDefault();
        if (!mt.value.trim()) return;
        post({ action: "add_milestone", projectId: v.project.id, title: mt.value, detail: mdt.value, dueDate: md.value }).then(function (ok) { if (ok) reload(); });
      } }, [mt, mdt, md, el("button", { class: "admin-row-btn", type: "submit", text: "Add" })]);

      // Plan target dates over a window, sized by each step's default length; the client's calendar shows the result.
      var plusDays = function (iso, n) { var p = iso.split("-"); return isoLocal(new Date(+p[0], +p[1] - 1, +p[2] + n)); };
      var schStart = el("input", { type: "date", value: isoLocal(new Date()), "aria-label": "Schedule start" });
      var schEnd = el("input", { type: "date", value: plusDays(isoLocal(new Date()), 21), "aria-label": "Schedule end (launch)" });
      var weeksBtn = function (w) {
        return el("button", { class: "admin-row-btn", type: "button", text: w + " weeks", onclick: function () { schEnd.value = plusDays(schStart.value || isoLocal(new Date()), w * 7); } });
      };
      var runSchedule = function (end) {
        var left = v.milestones.filter(function (m) { return m.status !== "done"; }).length;
        if (!left) { alert("Every step is done, so there is nothing to schedule."); return; }
        if (!schStart.value) { schStart.focus(); return; }
        var span = end ? "from " + schStart.value + " to " + end : "from " + schStart.value + " using the default length of each step";
        if (!confirm("Set target dates for the " + left + " steps that aren't done, " + span + "? This replaces their current target dates.")) return;
        post({ action: "schedule_milestones", projectId: v.project.id, start: schStart.value, end: end || "" }).then(function (ok) { if (ok) reload(); });
      };
      var schedule = el("form", { class: "admin-inline-form admin-schedule", onsubmit: function (e) { e.preventDefault(); runSchedule(schEnd.value); } }, [
        el("label", { class: "admin-milestone__date" }, [el("span", { text: "Start" }), schStart]),
        el("label", { class: "admin-milestone__date" }, [el("span", { text: "Launch by" }), schEnd]),
        weeksBtn(2), weeksBtn(3), weeksBtn(4),
        el("button", { class: "admin-row-btn", type: "submit", text: "Set target dates" }),
        el("button", { class: "admin-row-btn", type: "button", text: "Use default lengths", onclick: function () { runSchedule(""); } }),
      ]);

      // Calendar: same one the client sees, but tap/drag a step to change it.
      if (calFor !== v.project.id) { calFor = v.project.id; calBox = el("div", { class: "admin-cal" }); calApi = null; }
      var calSummary = SWFTCalendar.summary(v.milestones);
      var calHead = el("div", { class: "admin-cal__head" }, [
        el("p", { class: "portal-cal__eta", text: calSummary.eta }),
        el("p", { class: "admin-muted portal-cal__sub", text: calSummary.sub }),
      ]);
      var saveFromCal = function (m, ch) {
        var wasDate = m.status === "done" ? isoFromStored(m.completedAt) : (m.dueDate || "");
        var step = Promise.resolve(true);
        if (ch.status !== m.status) {
          var body = { action: "milestone_status", id: m.id, status: ch.status };
          if (ch.status === "done") body.completedOn = ch.date || isoLocal(new Date());
          step = post(body);
          if (ch.status === "done") wasDate = ch.date; // the status call already set the day
          else if (m.status === "done") wasDate = m.dueDate || "";
        }
        return step.then(function (ok) {
          if (ok && ch.date !== wasDate && (ch.date || ch.status !== "done")) return post({ action: "set_milestone_date", id: m.id, date: ch.date });
          return ok;
        }).then(function () { reload(); });
      };
      if (v.progressReady) {
        if (calApi) calApi.update(v.milestones);
        else calApi = SWFTCalendar.mount(calBox, { milestones: v.milestones, editable: true, onSave: saveFromCal });
      }

      var ut = el("textarea", { placeholder: "Write an update for " + v.client.email + "…", "aria-label": "New client update", maxlength: "2000" });
      var notify = el("input", { type: "checkbox", id: "notify-client", checked: "checked", class: "portal-switch" });
      var upMsg = el("p", { class: "admin-muted admin-update-msg", role: "status" });
      var postBtn = el("button", { class: "mf-btn mf-btn--sm", type: "button", text: "Post update", onclick: function () {
        if (!ut.value.trim()) { ut.focus(); return; }
        postBtn.disabled = true; upMsg.textContent = "Posting…";
        P.api("/api/admin/project", { method: "POST", body: JSON.stringify({ action: "add_update", projectId: v.project.id, body: ut.value, notify: notify.checked }) }).then(function (x) {
          postBtn.disabled = false;
          if (!x.res.ok || !x.data.ok) { upMsg.textContent = (x.data && x.data.error) || "Could not post."; return; }
          lastUpdateMsg = "Posted. " + (EMAIL_STATUS[x.data.emailStatus] || "");
          reload();
        });
      } });
      var addUp = el("div", { class: "admin-update-form" }, [
        ut,
        el("div", { class: "admin-update-form__row" }, [
          el("label", { class: "admin-update-form__notify", for: "notify-client" }, [notify, el("span", { text: "Email the client" })]),
          postBtn,
        ]),
        upMsg,
      ]);
      if (lastUpdateMsg) { upMsg.textContent = lastUpdateMsg; lastUpdateMsg = ""; }
      var ups = v.updates.map(function (u) {
        return el("div", { class: "admin-note" }, [
          el("div", {}, [el("p", { text: u.body }), el("small", { text: date(u.createdAt) + (u.emailStatus ? " · " + (EMAIL_SHORT[u.emailStatus] || u.emailStatus) : "") })]),
          el("button", { class: "admin-row-btn", type: "button", text: "Delete", onclick: function () {
            if (confirm("Delete this update?")) post({ action: "delete_update", id: u.id }).then(function (ok) { if (ok) reload(); });
          } }),
        ]);
      });

      var notesBox = el("div");
      var filesBox = el("div", { class: "admin-files" });
      var syncBtn = el("button", { class: "admin-row-btn", type: "button", text: "Sync to Drive now", onclick: function () {
        syncBtn.disabled = true;
        P.api("/api/admin/files?sync=1", { method: "POST" }).then(function (x) {
          syncBtn.disabled = false;
          if (!x.res.ok || !x.data.ok) { alert((x.data && x.data.error) || "Sync failed."); return; }
          if (!x.data.drive) { alert("Google Drive is not connected yet (needs the service account secrets)."); return; }
          SWFTFiles.mount(filesBox, { base: "/api/admin/files", project: v.project.id, admin: true });
        });
      } });
      detail.replaceChildren(
        el("div", { class: "portal-card admin-project" }, [
          back,
          head,
          linkBox,
          el("div", { class: "admin-project-progress" }, [progressBar(v.progress)]),
          el("p", { class: "portal-stat-label", text: "Post an update (shows in the client's Notifications)" }), v.progressReady ? addUp : null,
          el("div", { class: "admin-updates" }, ups.length ? ups : [el("p", { class: "admin-muted", text: "No updates yet." })]),
          el("p", { class: "portal-stat-label", text: "Milestones (client sees these)" }),
          v.progressReady ? el("p", { class: "admin-sort-hint", text: "Drag the grip on the left of a card to reorder. Tap a card to see its details and set dates. The client's dashboard updates right away." }) : null,
          ms, v.progressReady ? addMs : null,
          v.progressReady ? el("p", { class: "portal-stat-label", text: "Schedule (the client sees this calendar)" }) : null,
          v.progressReady ? calHead : null,
          v.progressReady ? calBox : null,
          v.progressReady ? el("p", { class: "admin-sort-hint", text: "Plan dates for every step that isn't done, in order. Each step gets its default length (Design 4 days, Build 5, Review 3, Approval/Payment/Launch 1 each, other steps 2), stretched or squeezed to fit the window. Launch lands on the launch date, the 30-day check-in 30 days after it, and weekend dates move to Friday. Use default lengths to let the plan pick the launch date. You can still change any single date on the calendar or in the steps above." }) : null,
          v.progressReady ? schedule : null,
          el("p", { class: "portal-stat-label", text: "Files (shared with the client, mirrored to Google Drive)" }), filesBox, el("div", {}, [syncBtn]),
          el("p", { class: "portal-stat-label", text: "Private notes (only you)" }), notesBox,
        ])
      );
      renderNotes(notesBox, c.id);
      SWFTFiles.mount(filesBox, { base: "/api/admin/files", project: v.project.id, admin: true });
      if (refocusId) {
        var g = detail.querySelector('.admin-milestone[data-id="' + refocusId + '"] .admin-grip');
        refocusId = null;
        if (g) g.focus();
      }
    });
  }

  var listCard = null, detailBox = null, generalCard = null;
  var route = { id: null };
  var lastUpdateMsg = "";
  var EMAIL_STATUS = { sent: "The client was emailed.", opted_out: "Not emailed: the client turned off update emails.", failed: "The email didn't send (check RESEND_API_KEY). The update is on their dashboard.", unavailable: "Email isn't set up (RESEND_API_KEY). The update is on their dashboard.", not_sent: "Not emailed." };
  var EMAIL_SHORT = { sent: "emailed", opted_out: "not emailed (opted out)", failed: "email failed", unavailable: "email not set up", not_sent: "not emailed" };

  /* Project list controls: search, filter, sort. Remembered on this device. */
  var LIST_KEY = "swft-admin-projects";
  var listOpts = (function () {
    var d = { q: "", filter: "all", sort: "activity", hideDemos: false };
    try { var saved = JSON.parse(localStorage.getItem(LIST_KEY) || "{}"); Object.keys(d).forEach(function (k) { if (k !== "q" && saved[k] != null) d[k] = saved[k]; }); } catch (e) { /* private mode */ }
    return d;
  })();
  function saveListOpts() { try { localStorage.setItem(LIST_KEY, JSON.stringify({ filter: listOpts.filter, sort: listOpts.sort, hideDemos: listOpts.hideDemos })); } catch (e) { /* ignore */ } }
  var STALE_DAYS = 7;
  function daysSince(s) {
    if (!s) return null;
    var d = new Date(String(s).replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? "" : "Z"));
    return isNaN(d) ? null : Math.floor((Date.now() - d) / 864e5);
  }
  function isComplete(c) { return !!(c.progress && c.progress.total && c.progress.done >= c.progress.total); }
  // Why a project needs a look, or null. Finished and canceled projects never do.
  function attention(c) {
    if (c.status === "past_due") return "Payment past due";
    if (isComplete(c) || c.status === "canceled") return null;
    if (c.overdue) return c.overdue === 1 ? "1 step past its target date" : c.overdue + " steps past their target date";
    var since = daysSince(c.lastUpdateAt || c.createdAt);
    if (since != null && since >= STALE_DAYS) return c.lastUpdateAt ? "No update in " + since + " days" : "No update posted yet";
    return null;
  }
  var FILTERS = [
    ["all", "All"],
    ["attention", "Needs attention"],
    ["progress", "In progress"],
    ["complete", "Complete"],
    ["past_due", "Past due"],
  ];
  var SORTS = [
    ["activity", "Recently active"],
    ["newest", "Newest"],
    ["oldest", "Oldest"],
    ["most", "Most progress"],
    ["least", "Least progress"],
    ["name", "Name A–Z"],
  ];
  function matches(c) {
    if (listOpts.hideDemos && c.isDemo) return false;
    var q = listOpts.q.trim().toLowerCase();
    if (q && (c.name + " " + c.email + " " + (c.tierName || "") + " " + (c.siteHost || "")).toLowerCase().indexOf(q) === -1) return false;
    switch (listOpts.filter) {
      case "attention": return !!attention(c);
      case "progress": return !isComplete(c) && c.status !== "canceled";
      case "complete": return isComplete(c);
      case "past_due": return c.status === "past_due";
      default: return true;
    }
  }
  function pct(c) { return c.progress && c.progress.total ? c.progress.percent : -1; }
  function compare(a, b) {
    var k = listOpts.sort;
    if (k === "name") return a.name.localeCompare(b.name);
    if (k === "most") return pct(b) - pct(a) || a.name.localeCompare(b.name);
    if (k === "least") return pct(a) - pct(b) || a.name.localeCompare(b.name);
    if (k === "oldest") return String(a.createdAt).localeCompare(String(b.createdAt));
    if (k === "newest") return String(b.createdAt).localeCompare(String(a.createdAt));
    return String(b.activityAt || "").localeCompare(String(a.activityAt || ""));
  }

  var listBody = null, listCount = null, filterBtns = [];
  function projectControls() {
    var search = el("input", { type: "search", class: "admin-plist__search", placeholder: "Search projects or client email", "aria-label": "Search projects", value: listOpts.q });
    search.addEventListener("input", function () { listOpts.q = search.value; drawList(); });
    var chips = el("div", { class: "admin-plist__chips", role: "group", "aria-label": "Filter projects" });
    filterBtns = FILTERS.map(function (f) {
      var b = el("button", { type: "button", class: "admin-chip", "data-filter": f[0], "aria-pressed": String(listOpts.filter === f[0]), onclick: function () {
        listOpts.filter = f[0]; saveListOpts(); drawList();
      } }, [el("span", { text: f[1] }), el("span", { class: "admin-chip__n" })]);
      chips.appendChild(b);
      return b;
    });
    var sort = el("select", { class: "admin-plist__sort", "aria-label": "Sort projects", onchange: function () { listOpts.sort = sort.value; saveListOpts(); drawList(); } },
      SORTS.map(function (o) { var opt = el("option", { value: o[0], text: o[1] }); if (o[0] === listOpts.sort) opt.setAttribute("selected", "selected"); return opt; }));
    var demos = el("input", { type: "checkbox", class: "portal-switch", id: "hide-demos" });
    demos.checked = !!listOpts.hideDemos;
    demos.addEventListener("change", function () { listOpts.hideDemos = demos.checked; saveListOpts(); drawList(); });
    listCount = el("p", { class: "admin-muted admin-plist__count", role: "status" });
    return el("div", { class: "admin-plist__controls" }, [
      search,
      chips,
      el("div", { class: "admin-plist__row" }, [
        el("label", { class: "admin-plist__sortwrap" }, [el("span", { class: "admin-muted", text: "Sort" }), sort]),
        el("label", { class: "admin-plist__demos", for: "hide-demos" }, [demos, el("span", { text: "Hide demos" })]),
      ]),
      listCount,
    ]);
  }

  function projectCard(c) {
    var p = c.progress, why = attention(c);
    var since = daysSince(c.activityAt);
    return el("li", {}, [el("button", { class: "admin-pcard" + (why ? " needs-attention" : ""), type: "button", onclick: function () { location.hash = "clients/" + encodeURIComponent(c.id); } }, [
      el("span", { class: "admin-pcard__main" }, [
        el("span", { class: "admin-pcard__name" }, [el("strong", { text: c.name }), c.isDemo ? el("span", { class: "admin-tag", text: "demo" }) : null]),
        el("small", { class: "admin-muted", text: c.email }),
        p && p.total ? el("span", { class: "admin-pcard__bar" }, [el("span", { style: "width:" + p.percent + "%" })]) : null,
        el("small", { class: "admin-pcard__now", text: (p && p.total ? p.percent + "%" + (p.current ? " · " + p.current : " · All steps done") : "No steps yet") + (since != null ? " · active " + (since === 0 ? "today" : since === 1 ? "yesterday" : since + "d ago") : "") }),
        why ? el("small", { class: "admin-pcard__why", text: why }) : null,
      ]),
      el("span", { class: "admin-pcard__side" }, [el("span", { class: "admin-pcard__status", text: String(c.status || "").replace(/_/g, " ") }), el("span", { class: "admin-pcard__chev", "aria-hidden": "true", text: "›" })]),
    ])]);
  }

  function drawList() {
    if (!listBody) return;
    var all = state.clients || [];
    // Counts on each chip respect search + demo toggle, so they match what tapping shows.
    var keep = listOpts.filter;
    filterBtns.forEach(function (b) {
      listOpts.filter = b.getAttribute("data-filter");
      b.querySelector(".admin-chip__n").textContent = String(all.filter(matches).length);
      b.setAttribute("aria-pressed", String(b.getAttribute("data-filter") === keep));
    });
    listOpts.filter = keep;
    var shown = all.filter(matches).sort(compare);
    listCount.textContent = shown.length === all.length ? all.length + (all.length === 1 ? " project" : " projects") : "Showing " + shown.length + " of " + all.length + " projects";
    if (!all.length) { listBody.replaceChildren(el("p", { class: "admin-muted", text: "No client projects yet." })); return; }
    if (!shown.length) {
      listBody.replaceChildren(el("div", { class: "admin-plist__empty" }, [
        el("p", { class: "admin-muted", text: "No projects match." }),
        el("button", { class: "admin-row-btn", type: "button", text: "Clear search and filters", onclick: function () {
          listOpts.q = ""; listOpts.filter = "all"; listOpts.hideDemos = false; saveListOpts();
          renderListCard();
        } }),
      ]));
      return;
    }
    listBody.replaceChildren(el("ul", { class: "admin-pcards" }, shown.map(projectCard)));
  }

  function renderListCard() {
    listBody = el("div");
    listCard.replaceChildren(el("p", { class: "portal-stat-label", text: "Client projects" }), projectControls(), listBody);
    drawList();
  }

  function refreshList() {
    P.api("/api/admin/overview").then(function (r) {
      if (r.res.ok && r.data.ok) { state = r.data; drawList(); }
    });
  }
  function applyRoute() {
    if (!listCard) return;
    var c = route.id ? state.clients.find(function (k) { return k.id === route.id; }) : null;
    listCard.hidden = !!c; generalCard.hidden = !!c; detailBox.hidden = !c;
    if (c) { openProject(detailBox, c); window.scrollTo(0, 0); }
    else detailBox.replaceChildren();
  }

  function renderClients(root) {
    detailBox = el("div");
    listCard = el("div", { class: "portal-card" });
    renderListCard();
    var general = el("div");
    generalCard = card("General notes", [general]);
    root.replaceChildren(listCard, detailBox, generalCard);
    renderNotes(general, null);
    applyRoute();
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
      var sitesBox = el("div");
      renderClientSites(sitesBox);
      root.replaceChildren(
        cfCard,
        sitesBox,
        card("Visitors · PostHog · last 30 days", phBody),
        card("Google Analytics", [el("p", { class: "admin-muted", text: "GA4 (G-F2BXR858CL) has the full picture, including key events and revenue. Open it in Google Analytics; the guide on the blog explains every column." }),
          el("p", {}, [el("a", { class: "portal-link", href: "https://analytics.google.com/", target: "_blank", rel: "noopener", text: "Open Google Analytics ↗" }), " · ", el("a", { class: "portal-link", href: "/blog/google-analytics-metrics-explained.html", text: "What the numbers mean" })])])
      );
    });
  }

  /* Client sites (every Cloudflare zone): last 30 days vs the 30 before.
     "Feature" puts a site on the home page Results cards while it's up. */
  function pctText(v) { return v == null ? "—" : (v > 0 ? "+" : "") + v + "%"; }
  function renderClientSites(box) {
    box.replaceChildren(card("Client sites · Cloudflare", [el("p", { class: "admin-muted", text: "Loading every site in your Cloudflare account…" })]));
    P.api("/api/admin/results").then(function (r) {
      var d = r.data || {};
      if (!r.res.ok || !d.ok) { box.replaceChildren(card("Client sites · Cloudflare", [notice((d && d.error) || "Could not load sites.")])); return; }
      if (!d.configured) { box.replaceChildren(card("Client sites · Cloudflare", [notice(d.message)])); return; }
      box.replaceChildren(card("Client sites · last 30 days vs the 30 before", [
        table(["Site", "Page views", "Change", "Visitors", "Change", "Home page"], d.sites.map(function (s) {
          if (!s.ok) return [s.domain, "—", "—", "—", "—", "No data"];
          var up = s.change.pageViews > 0;
          var btn = el("button", { class: "admin-row-btn", type: "button", text: s.featured ? "Featured · remove" : up ? "Feature" : "Not up yet", onclick: function () {
            var body = { zoneId: s.zoneId, domain: s.domain, featured: !s.featured };
            if (!s.featured) {
              var label = prompt("Client name to show on the home page", s.label || s.domain);
              if (label == null) return;
              var link = prompt("Case study link (optional), e.g. /case-study/brooklyn-steel.html", s.link || "");
              body.label = label; body.link = link || "";
            }
            P.api("/api/admin/results", { method: "POST", body: JSON.stringify(body) }).then(function (x) { if (x.res.ok && x.data.ok) renderClientSites(box); else alert((x.data && x.data.error) || "Could not save."); });
          } });
          if (!up && !s.featured) btn.disabled = true;
          return [s.domain, num(s.now.pageViews), pctText(s.change.pageViews), num(s.now.visitors), pctText(s.change.visitors), btn];
        }), "No sites found."),
        el("p", { class: "admin-muted admin-src", text: "Cloudflare counts every request, bots included. Featured sites show on the home page only while page views are up and above 100 a month; the home page checks every 6 hours." })
      ]));
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
  var GUIDE_KIND = { dfy: "Do it for me", answers: "Journey check / worksheet", diy: "Started on their own" };
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
    if (d.check && d.check.lines) return table(["", ""], d.check.lines, "No answers.");
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

  /* ---------- Newsletter: email subscribers about a new post or video ---------- */

  var NL_KIND = { blog: "Blog post", videos: "Video" };

  // Video titles not set in data/visuals.json come from Vimeo, like on the Visuals page.
  function vimeoMeta(item) {
    var page = "https://vimeo.com/" + item.vimeo + (item.hash ? "/" + item.hash : "");
    return fetch("https://vimeo.com/api/oembed.json?url=" + encodeURIComponent(page))
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  function renderNewsletter(root) {
    var list = el("div"), detail = el("div", { class: "admin-guide-detail" });
    root.replaceChildren(list, detail);
    list.replaceChildren(card("Newsletter", [el("p", { class: "admin-muted", text: "Loading…" })]));
    var load = function () {
      P.api("/api/admin/newsletter").then(function (r) {
        var d = r.data || {};
        if (!r.res.ok || !d.ok) { list.replaceChildren(card("Newsletter", [notice((d && d.error) || "Could not load the newsletter.")])); return; }
        var rows = d.items.map(function (it) {
          var titleCell = el("span", { text: it.title || "Video " + it.vimeo });
          if (!it.title && it.kind === "videos") vimeoMeta(it).then(function (m) {
            if (m && m.title) { it.title = m.title; if (!it.summary && m.description) it.summary = m.description.slice(0, 300); titleCell.textContent = m.title; }
          });
          var sent = it.sent ? "Sent to " + it.sent.count + " · " + date(it.sent.at) : "Not sent";
          var a = it.auto, autoBtn = null;
          var setAuto = function (action) {
            P.api("/api/admin/newsletter", { method: "POST", body: JSON.stringify({ action: action, kind: it.kind, key: it.key }) }).then(function (x) {
              if (!x.res.ok || !x.data.ok) alert((x.data && x.data.error) || "Could not save."); load();
            });
          };
          if (a && a.status === "waiting") {
            sent = "Sends automatically after " + date(a.sendAfter);
            autoBtn = el("button", { class: "admin-row-btn", type: "button", text: "Don't auto-send", onclick: function () { setAuto("skip"); } });
          } else if (a && a.status === "skipped") {
            sent = it.sent ? sent : "Won't send automatically";
            autoBtn = el("button", { class: "admin-row-btn", type: "button", text: "Auto-send", onclick: function () { setAuto("unskip"); } });
          }
          var btn = el("button", { class: "admin-row-btn", type: "button", text: it.sent ? "Send to new subscribers" : "Email subscribers", onclick: function () { compose(detail, it, d, load); } });
          return [NL_KIND[it.kind], titleCell, sent, el("div", { class: "admin-row-actions" }, [btn, autoBtn])];
        });
        list.replaceChildren(card("Newsletter", [
          !d.configured ? notice("RESEND_API_KEY is not set on this project, so nothing can be sent yet.") : null,
          !d.ready ? notice("Apply migration 0010 (npx wrangler d1 migrations apply swft-portal --remote) to send to subscribers.") : null,
          el("div", { class: "admin-stats" }, [stat("Active subscribers", d.counts.active), stat("Want blog posts", d.counts.blog), stat("Want videos", d.counts.videos)]),
          el("p", { class: "admin-muted", text: "Sending from " + d.from + ". Replies go to hello@swftstudios.com. Each subscriber only gets each post or video once." }),
          el("p", { class: "admin-muted", text: d.autoOn
            ? "New blog posts and videos email the matching subscribers automatically about " + d.autoHoldMinutes + " minutes after they go live. Click \u201cDon't auto-send\u201d before then to stop one."
            : "Automatic sending is off: deploy workers/newsletter (see docs/EMAIL_UPDATES.md) to email new blog posts and videos on their own." }),
          table(["Type", "Title", "Status", ""], rows, "No blog posts or videos found."),
        ]));
      });
    };
    load();
  }

  function compose(box, it, d, reload) {
    var audience = d.counts[it.kind];
    var subject = el("input", { type: "text", value: it.title || "", maxlength: "150", "aria-label": "Subject line" });
    var summary = el("textarea", { maxlength: "600", "aria-label": "Short summary" });
    summary.value = it.summary || "";
    var msg = el("p", { class: "admin-muted admin-update-msg", role: "status" });
    var body = function (action) { return JSON.stringify({ action: action, kind: it.kind, key: it.key, subject: subject.value, summary: summary.value }); };

    var testBtn = el("button", { class: "admin-row-btn", type: "button", text: "Send me a test", onclick: function () {
      testBtn.disabled = true; msg.textContent = "Sending test…";
      P.api("/api/admin/newsletter", { method: "POST", body: body("test") }).then(function (x) {
        testBtn.disabled = false;
        msg.textContent = x.res.ok && x.data.ok ? "Test sent to " + x.data.to + "." : (x.data && x.data.error) || "Could not send the test.";
      });
    } });

    var sendBtn = el("button", { class: "mf-btn mf-btn--sm", type: "button", text: "Send to " + audience + (audience === 1 ? " subscriber" : " subscribers"), onclick: function () {
      if (!subject.value.trim()) { subject.focus(); return; }
      if (!confirm("Email “" + subject.value + "” to everyone who signed up for " + NL_KIND[it.kind].toLowerCase() + "s and hasn't had it yet?")) return;
      sendBtn.disabled = testBtn.disabled = true;
      var total = 0;
      var step = function () {
        P.api("/api/admin/newsletter", { method: "POST", body: body("send") }).then(function (x) {
          var r = x.data || {};
          if (!x.res.ok || !r.ok) { sendBtn.disabled = testBtn.disabled = false; msg.textContent = (total ? "Sent " + total + ", then stopped: " : "") + (r.error || "Could not send."); reload(); return; }
          total += r.sent;
          if (r.remaining > 0 && r.sent > 0 && !r.failed) { msg.textContent = "Sent " + total + ", " + r.remaining + " to go…"; step(); return; }
          sendBtn.disabled = testBtn.disabled = false;
          msg.textContent = r.failed ? "Sent " + total + ". Resend stopped accepting emails; click Send again to finish the other " + r.remaining + "."
            : total ? "Done. Sent to " + total + (total === 1 ? " subscriber." : " subscribers.") : "Everyone on the list already has this one.";
          reload();
        });
      };
      msg.textContent = "Sending…";
      step();
    } });

    box.replaceChildren(card("Email subscribers: " + NL_KIND[it.kind].toLowerCase(), [
      el("p", { class: "admin-muted", text: "Link in the email: " + location.origin + it.path }),
      el("label", { class: "admin-field" }, [el("span", { class: "portal-stat-label", text: "Subject" }), subject]),
      el("label", { class: "admin-field" }, [el("span", { class: "portal-stat-label", text: "Summary (one or two sentences)" }), summary]),
      el("div", { class: "admin-inline-form" }, [testBtn, sendBtn]),
      msg,
    ]));
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  var RENDER = { overview: renderOverview, analytics: renderAnalytics, clients: renderClients, outreach: renderOutreach, guides: renderGuides, emails: renderEmails, blog: renderBlog, newsletter: renderNewsletter };
  var drawn = {};

  function show(tab) {
    document.querySelectorAll(".admin-tabs button").forEach(function (b) { b.setAttribute("aria-selected", String(b.dataset.tab === tab)); });
    document.querySelectorAll(".admin-panel").forEach(function (p) { p.hidden = p.id !== "tab-" + tab; });
    var root = document.getElementById("tab-" + tab);
    if (!drawn[tab] || tab === "overview") { RENDER[tab](root); drawn[tab] = true; }
    var h = "#" + tab + (tab === "clients" && route.id ? "/" + encodeURIComponent(route.id) : "");
    try { history.replaceState(null, "", h); } catch (e) { /* ignore */ }
  }

  // #clients = project list, #clients/<id> = one project's details
  function parseHash() {
    var parts = (location.hash || "").slice(1).split("/");
    route.id = parts[0] === "clients" && parts[1] ? decodeURIComponent(parts[1]) : null;
    return parts[0];
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
    var start = parseHash();
    show(RENDER[start] ? start : "overview");
    window.addEventListener("hashchange", function () {
      var t = parseHash();
      if (!RENDER[t]) return;
      if (t === "clients" && drawn.clients) { if (document.getElementById("tab-clients").hidden) show(t); applyRoute(); }
      else show(t);
    });
  }

  P.qs("#logout-btn").addEventListener("click", async function () {
    await P.api("/api/portal/logout", { method: "POST", body: "{}" });
    window.location.href = "/portal/login.html";
  });

  init();
})();
