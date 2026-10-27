/**
 * SWFT client workspace app: the client dashboard (/portal/dashboard.html)
 * and the admin dashboard (/portal/admin.html, body[data-mode="admin"]).
 *
 * Talks to /api/portal/* and /api/admin/* (functions/_lib/portal-api.js).
 * State lives in the URL hash: #project=<id>&tab=<overview|files|notes|checklist|activity>
 */
(function () {
  "use strict";
  var P = window.SWFTPortal;
  var esc = P.esc;
  var ADMIN_MODE = document.body.getAttribute("data-mode") === "admin";
  var TABS = [
    ["overview", "Overview"],
    ["files", "Files"],
    ["notes", "Notes & requests"],
    ["checklist", "Checklist"],
    ["activity", "Activity"],
  ];
  var KIND_LABELS = { note: "Note", request: "Request", revision: "Revision", approval: "Approval", update: "Update" };
  var CATS = [["all", "All"], ["video", "Video"], ["image", "Images"], ["audio", "Audio"], ["document", "Docs"], ["brand", "Brand"], ["other", "Other"], ["link", "Links"]];
  var TYPE_LABELS = { website: "Website", video: "Video", photo: "Photo", content: "Content", app: "App", other: "Other" };
  var UPLOAD_CONCURRENCY = 3;

  var state = {
    session: null,
    stages: [],
    projects: [],
    current: null,
    tab: "overview",
    fileFilter: "all",
    search: "",
    view: "projects", // admin: projects | clients
    clients: [],
    showArchived: false,
  };

  var root = P.qs("#pt-root");

  /* ---------- hash state ---------- */
  function readHash() {
    var h = new URLSearchParams(location.hash.slice(1));
    return { project: h.get("project"), tab: h.get("tab"), view: h.get("view") };
  }
  function writeHash() {
    var h = new URLSearchParams();
    if (ADMIN_MODE && state.view === "clients") h.set("view", "clients");
    else if (state.current) {
      h.set("project", state.current.project.id);
      if (state.tab !== "overview") h.set("tab", state.tab);
    }
    var next = h.toString();
    if (location.hash.slice(1) !== next) history.replaceState(null, "", next ? "#" + next : location.pathname);
  }

  /* ---------- boot ---------- */
  async function boot() {
    var session = await P.requireAuth();
    if (!session) return;
    if (ADMIN_MODE && !session.user.admin) { location.href = "/portal/dashboard.html"; return; }
    if (!ADMIN_MODE && session.user.admin) { location.href = "/portal/admin.html" + location.hash; return; }
    state.session = session;
    state.stages = session.stages || [];
    var h = readHash();
    if (h.tab && TABS.some(function (t) { return t[0] === h.tab; })) state.tab = h.tab;
    if (ADMIN_MODE && h.view === "clients") state.view = "clients";
    renderShell();
    await loadProjects();
    if (state.view === "clients") return showClients();
    var first = h.project || (state.projects[0] && state.projects[0].id);
    if (first) await openProject(first, state.tab);
    else renderEmpty();
  }

  function renderShell() {
    var u = state.session.user;
    root.innerHTML =
      '<div class="pt-bar">' +
        '<div class="pt-bar__who"><p class="mf-label">(' + (ADMIN_MODE ? "Admin" : "Client portal") + ")</p>" +
          "<strong>" + esc(u.name || u.email) + "</strong>" + (u.company ? '<span class="mf-muted">' + esc(u.company) + "</span>" : "") + "</div>" +
        '<div class="mf-actions">' +
          (ADMIN_MODE
            ? '<div class="pt-adminnav" role="group" aria-label="Admin view">' +
                '<button type="button" class="mf-chip" data-view="projects" aria-pressed="' + (state.view === "projects") + '">Projects</button>' +
                '<button type="button" class="mf-chip" data-view="clients" aria-pressed="' + (state.view === "clients") + '">Clients</button></div>' +
              '<button type="button" class="mf-btn mf-btn--sm" data-act="new-client">New client</button>' +
              '<button type="button" class="mf-btn mf-btn--sm mf-btn--ghost" data-act="new-project">New project</button>'
            : '<button type="button" class="mf-btn mf-btn--sm mf-btn--ghost" data-act="account">Your details</button>') +
          '<button type="button" class="mf-btn mf-btn--sm mf-btn--ghost" data-act="logout">Sign out</button>' +
        "</div>" +
      "</div>" +
      '<div class="pt-layout">' +
        '<aside class="pt-side" aria-label="Projects">' +
          '<div class="pt-panel">' +
            '<div class="pt-panel__head"><h2>' + (ADMIN_MODE ? "All projects" : "Your projects") + "</h2></div>" +
            (ADMIN_MODE ? '<input type="search" class="pt-search" placeholder="Search projects or clients" aria-label="Search projects" data-search>' : "") +
            '<ul class="pt-projects" id="pt-projects"></ul>' +
            (ADMIN_MODE ? '<label class="pt-check" style="margin-top:0.75rem"><input type="checkbox" data-archived> Show archived</label>' : "") +
          "</div>" +
        "</aside>" +
        '<section id="pt-main" aria-live="polite"><p class="pt-loading">Loading…</p></section>' +
      "</div>" +
      dialogs();
  }

  /* ---------- project list ---------- */
  async function loadProjects() {
    var r = await P.api("/api/portal/projects" + (state.showArchived ? "?archived=1" : ""));
    state.projects = (r.data && r.data.projects) || [];
    renderList();
  }

  function renderList() {
    var list = P.qs("#pt-projects");
    if (!list) return;
    var q = state.search.toLowerCase();
    var items = state.projects.filter(function (p) {
      if (!q) return true;
      return (p.title + " " + p.client.email + " " + p.client.name + " " + p.client.company).toLowerCase().indexOf(q) !== -1;
    });
    if (!items.length) {
      list.innerHTML = '<li><p class="pt-empty">' + (state.projects.length ? "No matches." : ADMIN_MODE ? "No projects yet. Add a client to start one." : "No projects yet. We'll set yours up shortly.") + "</p></li>";
      return;
    }
    var cur = state.current && state.current.project.id;
    list.innerHTML = items.map(function (p) {
      var progress = p.taskCount ? p.tasksDone + "/" + p.taskCount + " tasks" : "";
      return '<li><button type="button" class="pt-proj" data-project="' + esc(p.id) + '" aria-current="' + (p.id === cur) + '">' +
        '<span class="pt-proj__top"><span class="pt-proj__title">' + esc(p.title) + "</span>" +
          (p.unseen && p.id !== cur ? '<span class="pt-badge pt-badge--new">' + p.unseen + " new</span>" : "") + "</span>" +
        (ADMIN_MODE ? '<span class="pt-proj__meta">' + esc(p.client.name || p.client.company || p.client.email) + "</span>" : "") +
        '<span class="pt-proj__meta"><span>' + esc(p.stageLabel) + "</span>" +
          (p.dueDate ? "<span>Due " + esc(P.fmtDate(p.dueDate)) + "</span>" : "") +
          (p.openRequests ? "<span>" + p.openRequests + " open request" + (p.openRequests > 1 ? "s" : "") + "</span>" : "") +
          (progress ? "<span>" + progress + "</span>" : "") +
          (p.archived ? "<span>Archived</span>" : "") + "</span>" +
        "</button></li>";
    }).join("");
  }

  function renderEmpty() {
    var main = P.qs("#pt-main");
    main.innerHTML = '<div class="pt-panel"><p class="mf-label">(Welcome)</p><h2 class="pt-head__title">' +
      (ADMIN_MODE ? "Start with a client." : "Your workspace is almost ready.") + "</h2>" +
      '<p class="pt-head__desc" style="margin-top:1rem">' +
      (ADMIN_MODE ? "Add a client and their first project. They get an email to set a password, then they can upload files and leave notes." : "As soon as we set up your project you'll be able to upload files, share links and leave notes here. Questions? Email hello@swftstudios.com.") +
      "</p>" + (ADMIN_MODE ? '<div class="mf-actions" style="margin-top:1.5rem"><button class="mf-btn" data-act="new-client">New client</button></div>' : "") + "</div>";
  }

  /* ---------- project detail ---------- */
  async function openProject(id, tab) {
    state.view = "projects";
    syncViewChips();
    var main = P.qs("#pt-main");
    if (!state.current || state.current.project.id !== id) main.innerHTML = '<p class="pt-loading">Loading project…</p>';
    var r = await P.api("/api/portal/projects/" + encodeURIComponent(id));
    if (!r.res.ok || !r.data.ok) {
      main.innerHTML = '<div class="pt-panel"><p class="pt-empty">' + esc((r.data && r.data.error) || "Couldn't open that project.") + "</p></div>";
      return;
    }
    state.current = r.data;
    if (tab) state.tab = tab;
    var listed = state.projects.find(function (p) { return p.id === id; });
    if (listed) listed.unseen = 0;
    renderList();
    renderProject();
    writeHash();
  }

  async function refresh() {
    if (!state.current) return;
    await openProject(state.current.project.id);
    loadProjects();
  }

  function stageTracker(stage) {
    var idx = state.stages.findIndex(function (s) { return s.id === stage; });
    return '<ol class="pt-stages" aria-label="Project stage">' + state.stages.map(function (s, i) {
      var cls = i < idx ? "is-done" : i === idx ? "is-current" : "";
      return '<li class="pt-stage ' + cls + '"' + (i === idx ? ' aria-current="step"' : "") + "><span>" + esc(s.label) + "</span></li>";
    }).join("") + "</ol>";
  }

  function renderProject() {
    var d = state.current;
    var p = d.project;
    var counts = {
      files: d.assets.length,
      notes: d.messages.filter(function (m) { return (m.kind === "request" || m.kind === "revision") && m.status === "open"; }).length,
      checklist: d.tasks.filter(function (t) { return !t.done; }).length,
    };
    var main = P.qs("#pt-main");
    main.innerHTML =
      '<div class="pt-panel">' +
        '<div class="pt-head">' +
          "<div>" +
            '<p class="mf-label mf-label--muted">(' + esc(TYPE_LABELS[p.type] || p.type) + (ADMIN_MODE ? " · " + esc(p.client.name || p.client.email) : "") + ")</p>" +
            '<h1 class="pt-head__title">' + esc(p.title) + "</h1>" +
          "</div>" +
          (p.description ? '<p class="pt-head__desc">' + esc(p.description) + "</p>" : "") +
          '<div class="pt-facts">' +
            '<span class="pt-badge">' + esc(p.stageLabel) + "</span>" +
            (p.dueDate ? '<span class="pt-badge">Due ' + esc(P.fmtDate(p.dueDate)) + "</span>" : "") +
            (p.siteHost ? '<a class="pt-badge" href="https://' + esc(p.siteHost) + '" target="_blank" rel="noopener">' + esc(p.siteHost) + " ↗</a>" : "") +
            (p.archived ? '<span class="pt-badge pt-badge--warn">Archived</span>' : "") +
          "</div>" +
          stageTracker(p.stage) +
          (ADMIN_MODE ? adminControls(p) : "") +
        "</div>" +
        '<div class="pt-tabs" role="tablist" aria-label="Project sections">' +
          TABS.map(function (t) {
            var c = counts[t[0]];
            return '<button type="button" class="pt-tab" role="tab" id="tab-' + t[0] + '" aria-controls="panel-' + t[0] + '" aria-selected="' + (state.tab === t[0]) + '" tabindex="' + (state.tab === t[0] ? 0 : -1) + '" data-tab="' + t[0] + '">' +
              esc(t[1]) + (c ? ' <span class="pt-count">' + c + "</span>" : "") + "</button>";
          }).join("") +
        "</div>" +
        '<div role="tabpanel" id="panel-' + state.tab + '" aria-labelledby="tab-' + state.tab + '">' + renderTab() + "</div>" +
      "</div>";
    if (state.tab === "overview") loadMetrics();
  }

  function adminControls(p) {
    return '<form class="pt-admin-controls" data-form="project-settings">' +
      '<label>Stage<select class="pt-input" name="stage">' + state.stages.map(function (s) {
        return '<option value="' + s.id + '"' + (s.id === p.stage ? " selected" : "") + ">" + esc(s.label) + "</option>";
      }).join("") + "</select></label>" +
      '<label>Due date<input class="pt-input" type="date" name="dueDate" value="' + esc(p.dueDate || "") + '"></label>' +
      '<label>Live site<input class="pt-input" name="siteHost" placeholder="www.client.com" value="' + esc(p.siteHost || "") + '"></label>' +
      '<div class="mf-actions"><button class="mf-btn mf-btn--sm" type="submit">Save</button>' +
        '<button class="pt-iconbtn" type="button" data-act="edit-project">Edit</button>' +
        '<button class="pt-iconbtn" type="button" data-act="archive">' + (p.archived ? "Restore" : "Archive") + "</button></div>" +
      "</form>";
  }

  function renderTab() {
    switch (state.tab) {
      case "files": return filesTab();
      case "notes": return notesTab();
      case "checklist": return checklistTab();
      case "activity": return activityTab();
      default: return overviewTab();
    }
  }

  /* ---------- overview ---------- */
  function overviewTab() {
    var d = state.current;
    var open = d.messages.filter(function (m) { return (m.kind === "request" || m.kind === "revision") && m.status === "open"; });
    var done = d.tasks.filter(function (t) { return t.done; }).length;
    var lastUpdate = d.messages.slice().reverse().find(function (m) { return m.kind === "update"; });
    return '<div class="pt-overview">' +
        stat(d.assets.length, "files and links shared") +
        stat(open.length, "open request" + (open.length === 1 ? "" : "s")) +
        stat(d.tasks.length ? done + "/" + d.tasks.length : "–", "checklist done") +
        stat(d.project.dueDate ? P.fmtDate(d.project.dueDate) : "–", "due date") +
      "</div>" +
      '<div class="pt-quick">' +
        '<button type="button" class="mf-btn mf-btn--sm" data-goto="files">Upload files</button>' +
        '<button type="button" class="mf-btn mf-btn--sm mf-btn--ghost" data-goto="notes">' + (ADMIN_MODE ? "Post an update" : "Leave a note or request") + "</button>" +
      "</div>" +
      (lastUpdate ? '<div style="margin-top:1.75rem"><p class="mf-label mf-label--muted">(Latest update)</p>' + messageItem(lastUpdate) + "</div>" : "") +
      '<div id="pt-metrics" style="margin-top:1.75rem"></div>' +
      '<div style="margin-top:1.75rem"><p class="mf-label mf-label--muted">(Recent activity)</p>' + activityList(d.activity.slice(0, 6)) + "</div>";
  }

  function stat(v, label) {
    return '<div class="pt-stat"><b>' + esc(v) + "</b><span>" + esc(label) + "</span></div>";
  }

  async function loadMetrics() {
    var d = state.current;
    var box = P.qs("#pt-metrics");
    if (!box || !d.project.siteHost) return;
    box.innerHTML = '<p class="mf-label mf-label--muted">(Site traffic · last 30 days)</p><p class="pt-loading">Loading…</p>';
    var r = await P.api("/api/portal/projects/" + d.project.id + "/metrics");
    if (!box.isConnected) return;
    var m = r.data && r.data.metrics;
    if (!m || !m.ok) {
      box.innerHTML = '<p class="mf-label mf-label--muted">(Site traffic)</p><p class="pt-empty">' + esc((m && m.message) || "Analytics unavailable.") + "</p>";
      return;
    }
    box.innerHTML = '<p class="mf-label mf-label--muted">(Site traffic · last 30 days)</p><div class="pt-overview" style="margin-top:0.75rem">' +
      stat(m.visitors, "visitors") + stat(m.pageviews, "page views") + "</div>" +
      (m.topPages && m.topPages.length ? '<ul class="pt-activity" style="margin-top:0.75rem">' + m.topPages.slice(0, 5).map(function (row) {
        return "<li><time>" + esc(row.pageviews) + " views</time><span>" + esc(row.path) + "</span></li>";
      }).join("") + "</ul>" : "");
  }

  /* ---------- files ---------- */
  function filesTab() {
    var d = state.current;
    var assets = d.assets.filter(function (a) {
      if (state.fileFilter === "all") return true;
      if (state.fileFilter === "link") return a.kind === "link";
      return a.kind === "file" && a.category === state.fileFilter;
    });
    return '<div class="pt-drop" tabindex="0" role="button" data-drop aria-label="Upload files: drop them here or press Enter to choose">' +
        "<b>Drop photos, videos, logos or docs here</b>" +
        "<span>or click to choose files · up to 5 GB each · big folders? share a link below</span>" +
        '<input type="file" multiple hidden data-file-input>' +
      "</div>" +
      '<ul class="pt-uploads" id="pt-uploads"></ul>' +
      '<form class="pt-linkform" data-form="link">' +
        '<div class="mf-field"><label for="link-url">Share a link (Google Drive, Dropbox, WeTransfer, YouTube…)</label><input id="link-url" name="url" type="url" inputmode="url" placeholder="https://" required></div>' +
        '<div class="mf-field"><label for="link-name">Label (optional)</label><input id="link-name" name="name" placeholder="e.g. Brand folder"></div>' +
        '<button type="submit" class="mf-btn mf-btn--sm">Add link</button>' +
      "</form>" +
      '<div class="pt-filters" role="group" aria-label="Filter files">' + CATS.map(function (c) {
        var n = c[0] === "all" ? d.assets.length : d.assets.filter(function (a) { return c[0] === "link" ? a.kind === "link" : a.kind === "file" && a.category === c[0]; }).length;
        if (!n && c[0] !== "all") return "";
        return '<button type="button" class="mf-chip" data-filter="' + c[0] + '" aria-pressed="' + (state.fileFilter === c[0]) + '">' + c[1] + ' <span class="mf-chip-count">' + n + "</span></button>";
      }).join("") + "</div>" +
      (assets.length ? '<ul class="pt-files">' + assets.map(fileCard).join("") + "</ul>" : '<p class="pt-empty">Nothing here yet.</p>');
  }

  function fileCard(a) {
    var me = state.session.user.id;
    var canDelete = ADMIN_MODE || (a.uploadedBy && a.uploadedBy.id === me);
    var thumb;
    if (a.kind === "link") thumb = '<div class="pt-file__thumb">Link</div>';
    else if (a.category === "image" && /^image\/(jpeg|png|gif|webp|avif)/.test(a.contentType || "")) thumb = '<div class="pt-file__thumb"><img src="' + esc(a.url) + '" alt="" loading="lazy"></div>';
    else if (a.category === "video" && /^video\/(mp4|webm|quicktime)/.test(a.contentType || "")) thumb = '<div class="pt-file__thumb"><video src="' + esc(a.url) + '#t=0.5" preload="metadata" muted playsinline></video></div>';
    else thumb = '<div class="pt-file__thumb">' + esc(a.category) + "</div>";
    var who = a.uploadedBy ? (a.uploadedBy.role === "admin" ? "SWFT" : a.uploadedBy.name) : "";
    return '<li class="pt-file">' + thumb +
      '<div class="pt-file__body">' +
        '<span class="pt-file__name">' + esc(a.name) + "</span>" +
        '<span class="pt-file__meta">' + [a.kind === "link" ? "Link" : P.fmtBytes(a.size), who, P.timeAgo(a.createdAt)].filter(Boolean).map(esc).join(" · ") + "</span>" +
        (a.note ? '<p class="pt-file__note">' + esc(a.note) + "</p>" : "") +
        '<div class="pt-file__actions">' +
          (a.kind === "link"
            ? '<a href="' + esc(a.url) + '" target="_blank" rel="noopener noreferrer">Open ↗</a>'
            : '<a href="' + esc(a.url) + '" target="_blank" rel="noopener">View</a><a href="' + esc(a.url) + '?download=1">Download</a>') +
          (canDelete ? '<button type="button" class="pt-danger" data-delete-asset="' + esc(a.id) + '">Remove</button>' : "") +
        "</div>" +
      "</div></li>";
  }

  /* Uploads: start → PUT parts (a few at a time) → complete */
  function queueFiles(files) {
    var list = P.qs("#pt-uploads");
    Array.prototype.forEach.call(files, function (file) {
      var li = document.createElement("li");
      li.className = "pt-upload";
      li.innerHTML = '<div class="pt-upload__row"><span class="pt-upload__name">' + esc(file.name) + '</span><span data-status>Waiting…</span></div><div class="pt-bar-track"><div class="pt-bar-fill"></div></div>';
      if (list) list.appendChild(li);
      uploadFile(file, li);
    });
  }

  var activeUploads = 0;
  window.addEventListener("beforeunload", function (e) {
    if (activeUploads) { e.preventDefault(); e.returnValue = ""; }
  });

  async function uploadFile(file, li) {
    var projectId = state.current.project.id;
    var statusEl = li.querySelector("[data-status]");
    var fill = li.querySelector(".pt-bar-fill");
    function fail(msg) {
      li.classList.add("is-error");
      statusEl.textContent = msg;
    }
    if (!file.size) return fail("Empty file, skipped");
    activeUploads++;
    try {
      statusEl.textContent = "Starting…";
      var start = await P.api("/api/portal/projects/" + projectId + "/uploads", {
        method: "POST",
        body: JSON.stringify({ name: file.name, size: file.size, type: file.type || "" }),
      });
      if (!start.res.ok || !start.data.ok) return fail((start.data && start.data.error) || "Couldn't start the upload");
      var assetId = start.data.assetId;
      var partSize = start.data.partSize;
      var total = Math.ceil(file.size / partSize);
      var parts = [];
      var sent = 0;
      var next = 1;
      var failed = false;

      async function sendPart(n) {
        var blob = file.slice((n - 1) * partSize, Math.min(file.size, n * partSize));
        for (var attempt = 1; attempt <= 3; attempt++) {
          try {
            var res = await fetch("/api/portal/uploads/" + assetId + "/parts/" + n, {
              method: "PUT",
              credentials: "same-origin",
              headers: { "Content-Type": "application/octet-stream" },
              body: blob,
            });
            var data = await res.json();
            if (res.ok && data.ok) {
              parts.push({ partNumber: data.partNumber, etag: data.etag });
              sent += blob.size;
              var pct = Math.round((sent / file.size) * 100);
              fill.style.width = pct + "%";
              statusEl.textContent = pct + "% of " + P.fmtBytes(file.size);
              return;
            }
            if (res.status < 500) throw new Error(data.error || "Upload refused");
          } catch (err) {
            if (attempt === 3) throw err;
          }
          await new Promise(function (r) { setTimeout(r, 800 * attempt); });
        }
      }

      async function worker() {
        while (!failed && next <= total) {
          var n = next++;
          await sendPart(n);
        }
      }

      try {
        var workers = [];
        for (var w = 0; w < Math.min(UPLOAD_CONCURRENCY, total); w++) workers.push(worker());
        await Promise.all(workers);
      } catch (err) {
        failed = true;
        P.api("/api/portal/uploads/" + assetId, { method: "DELETE" });
        return fail("Upload failed: " + (err.message || "network error") + ". Try again.");
      }

      statusEl.textContent = "Finishing…";
      var done = await P.api("/api/portal/uploads/" + assetId + "/complete", { method: "POST", body: JSON.stringify({ parts: parts }) });
      if (!done.res.ok || !done.data.ok) return fail((done.data && done.data.error) || "Couldn't finish the upload");
      fill.style.width = "100%";
      statusEl.textContent = "Uploaded ✓";
      if (state.current && state.current.project.id === projectId) {
        state.current.assets.unshift(done.data.asset);
        if (state.tab === "files") {
          // Re-render the grid but keep the upload list visible
          var uploads = P.qs("#pt-uploads");
          var keep = uploads ? Array.prototype.slice.call(uploads.children) : [];
          renderProject();
          var fresh = P.qs("#pt-uploads");
          keep.forEach(function (node) { if (fresh) fresh.appendChild(node); });
        }
      }
      loadProjects();
    } finally {
      activeUploads--;
    }
  }

  /* ---------- notes & requests ---------- */
  function notesTab() {
    var d = state.current;
    var kinds = ADMIN_MODE ? ["update", "note", "request", "approval"] : ["note", "request", "revision", "approval"];
    var hints = {
      note: "Anything we should know: context, ideas, references.",
      request: "Something you want added or changed. We'll mark it done when it's handled.",
      revision: "Feedback on something we delivered.",
      approval: "Sign off on a draft, cut or design.",
      update: "A progress update for the client. They get an email.",
    };
    return '<form class="pt-composer" data-form="message">' +
        '<div class="mf-chips" role="radiogroup" aria-label="Type">' + kinds.map(function (k, i) {
          return '<label class="mf-chip"><input type="radio" name="kind" value="' + k + '"' + (i === 0 ? " checked" : "") + "><span>" + KIND_LABELS[k] + "</span></label>";
        }).join("") + "</div>" +
        '<label class="mf-visually-hidden" for="msg-body">Message</label>' +
        '<textarea id="msg-body" name="body" required placeholder="' + esc(hints[kinds[0]]) + '" data-hints=\'' + esc(JSON.stringify(hints)) + "'></textarea>" +
        '<div class="pt-composer__row"><span class="mf-label mf-label--muted">' + (ADMIN_MODE ? "The client is emailed about updates and messages" : "SWFT is emailed right away") + "</span>" +
          '<button type="submit" class="mf-btn mf-btn--sm">Send</button></div>' +
      "</form>" +
      (d.messages.length ? '<ul class="pt-thread">' + d.messages.slice().reverse().map(function (m) { return "<li>" + messageItem(m) + "</li>"; }).join("") + "</ul>" : '<p class="pt-empty">No notes yet.</p>');
  }

  function messageItem(m) {
    var trackable = m.kind === "request" || m.kind === "revision";
    var canToggle = trackable && (ADMIN_MODE || m.mine);
    var isAdminAuthor = m.author && m.author.role === "admin";
    return '<article class="pt-msgitem' + (isAdminAuthor ? " is-admin" : "") + (m.mine ? " is-mine" : "") + (trackable && m.status === "done" ? " is-done" : "") + '">' +
      '<div class="pt-msgitem__head"><span class="pt-badge">' + esc(KIND_LABELS[m.kind] || m.kind) + "</span>" +
        "<strong>" + esc(isAdminAuthor ? "SWFT Studios" : m.author.name) + "</strong>" +
        "<time>" + esc(P.fmtDate(m.createdAt, true)) + "</time>" +
        (trackable ? '<span class="pt-badge' + (m.status === "done" ? "" : " pt-badge--warn") + '">' + (m.status === "done" ? "Done" : "Open") + "</span>" : "") +
      "</div>" +
      '<p class="pt-msgitem__body">' + esc(m.body) + "</p>" +
      (canToggle ? '<div class="pt-msgitem__foot"><button type="button" class="pt-iconbtn" data-toggle-message="' + esc(m.id) + '" data-status="' + (m.status === "done" ? "open" : "done") + '">' + (m.status === "done" ? "Reopen" : "Mark done") + "</button></div>" : "") +
      "</article>";
  }

  /* ---------- checklist ---------- */
  function checklistTab() {
    var d = state.current;
    return (d.tasks.length
        ? '<ul class="pt-tasks">' + d.tasks.map(function (t) {
            return '<li class="pt-task' + (t.done ? " is-done" : "") + '">' +
              '<input type="checkbox" aria-label="Done: ' + esc(t.title) + '" data-task-done="' + esc(t.id) + '"' + (t.done ? " checked" : "") + ">" +
              '<div><div class="pt-task__title">' + esc(t.title) + "</div>" +
                '<div class="pt-task__meta">' + [t.dueDate ? "Due " + P.fmtDate(t.dueDate) : "", ADMIN_MODE && !t.clientVisible ? "Hidden from client" : ""].filter(Boolean).map(esc).join(" · ") + "</div></div>" +
              (ADMIN_MODE ? '<div class="pt-task__actions"><button type="button" class="pt-iconbtn" data-task-visible="' + esc(t.id) + '" data-visible="' + (t.clientVisible ? "0" : "1") + '">' + (t.clientVisible ? "Hide" : "Show") + '</button><button type="button" class="pt-iconbtn" data-task-delete="' + esc(t.id) + '">Delete</button></div>' : "<span></span>") +
              "</li>";
          }).join("") + "</ul>"
        : '<p class="pt-empty">' + (ADMIN_MODE ? "No tasks yet. Add what you need from the client and your own milestones." : "Nothing on the checklist yet.") + "</p>") +
      (ADMIN_MODE
        ? '<form class="pt-taskform" data-form="task">' +
            '<input class="pt-input" name="title" placeholder="New task, e.g. Send logo files" required aria-label="Task">' +
            '<input class="pt-input" type="date" name="dueDate" aria-label="Due date">' +
            '<label class="pt-check"><input type="checkbox" name="clientVisible" checked> Client sees it</label>' +
            '<button class="mf-btn mf-btn--sm" type="submit">Add</button>' +
          "</form>"
        : "");
  }

  /* ---------- activity ---------- */
  function activityTab() {
    return activityList(state.current.activity);
  }

  function activityList(items) {
    if (!items.length) return '<p class="pt-empty">No activity yet.</p>';
    return '<ul class="pt-activity">' + items.map(function (a) {
      var who = a.actor ? (a.actor.role === "admin" ? "SWFT" : a.actor.name) : "System";
      return "<li><time>" + esc(P.timeAgo(a.createdAt)) + "</time><span><strong>" + esc(who) + "</strong> " + esc(a.action) + (a.detail ? " <em>" + esc(a.detail) + "</em>" : "") + "</span></li>";
    }).join("") + "</ul>";
  }

  /* ---------- admin: clients ---------- */
  async function showClients() {
    state.view = "clients";
    state.current = null;
    syncViewChips();
    renderList();
    writeHash();
    var main = P.qs("#pt-main");
    main.innerHTML = '<p class="pt-loading">Loading clients…</p>';
    var r = await P.api("/api/admin/clients");
    state.clients = (r.data && r.data.clients) || [];
    main.innerHTML = '<div class="pt-panel"><div class="pt-panel__head"><h2>Clients</h2><button class="mf-btn mf-btn--sm" data-act="new-client">New client</button></div>' +
      (state.clients.length
        ? '<div class="pt-table-wrap"><table class="pt-clients"><thead><tr><th>Client</th><th>Projects</th><th>Status</th><th>Last sign-in</th><th></th></tr></thead><tbody>' +
          state.clients.map(function (c) {
            return "<tr><td><strong>" + esc(c.name || c.email) + "</strong><br><span class=\"mf-muted\">" + esc([c.company, c.email].filter(Boolean).join(" · ")) + "</span></td>" +
              "<td>" + c.projectCount + "</td>" +
              "<td>" + (c.active ? "Active" : "Invited") + "</td>" +
              "<td>" + esc(c.lastLoginAt ? P.timeAgo(c.lastLoginAt) : "–") + "</td>" +
              '<td><div class="mf-actions">' +
                '<button class="pt-iconbtn" data-new-project-for="' + esc(c.id) + '">New project</button>' +
                (c.active ? "" : '<button class="pt-iconbtn" data-resend-invite="' + esc(c.id) + '">Resend invite</button>') +
              "</div></td></tr>";
          }).join("") + "</tbody></table></div>"
        : '<p class="pt-empty">No clients yet.</p>') + "</div>";
  }

  function syncViewChips() {
    P.qsa("[data-view]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-view") === state.view)); });
  }

  /* ---------- dialogs ---------- */
  function dialogs() {
    var typeOptions = Object.keys(TYPE_LABELS).map(function (k) { return '<option value="' + k + '">' + TYPE_LABELS[k] + "</option>"; }).join("");
    var html = "";
    if (ADMIN_MODE) {
      html +=
        '<dialog class="pt-dialog" id="dlg-client"><h2>New client</h2>' +
          '<form class="pt-form" data-form="client" method="dialog">' +
            '<label>Email<input class="pt-input" type="email" name="email" required></label>' +
            '<div class="pt-grid2"><label>Name<input class="pt-input" name="name"></label><label>Company<input class="pt-input" name="company"></label></div>' +
            '<label>First project (optional)<input class="pt-input" name="projectTitle" placeholder="e.g. Website redesign"></label>' +
            '<div class="pt-grid2"><label>Type<select class="pt-input" name="projectType">' + typeOptions + '</select></label><label>Due date<input class="pt-input" type="date" name="dueDate"></label></div>' +
            '<label>Personal note in the invite (optional)<input class="pt-input" name="inviteNote"></label>' +
            '<label class="pt-check"><input type="checkbox" name="sendInvite" checked> Email them an invite to set a password</label>' +
            '<p class="pt-msg" hidden data-msg></p>' +
            '<div class="mf-actions"><button class="mf-btn mf-btn--sm" type="submit">Add client</button><button class="mf-btn mf-btn--sm mf-btn--ghost" type="button" data-close>Cancel</button></div>' +
          "</form></dialog>" +
        '<dialog class="pt-dialog" id="dlg-project"><h2 data-title>New project</h2>' +
          '<form class="pt-form" data-form="project" method="dialog">' +
            '<input type="hidden" name="projectId">' +
            '<label data-client-field>Client<select class="pt-input" name="clientId" required></select></label>' +
            '<label>Title<input class="pt-input" name="title" required></label>' +
            '<div class="pt-grid2"><label>Type<select class="pt-input" name="type">' + typeOptions + '</select></label><label>Due date<input class="pt-input" type="date" name="dueDate"></label></div>' +
            '<label>Description (what we\'re making, what we need)<textarea class="pt-input" name="description" rows="4"></textarea></label>' +
            '<p class="pt-msg" hidden data-msg></p>' +
            '<div class="mf-actions"><button class="mf-btn mf-btn--sm" type="submit">Save project</button><button class="mf-btn mf-btn--sm mf-btn--ghost" type="button" data-close>Cancel</button></div>' +
          "</form></dialog>";
    } else {
      html +=
        '<dialog class="pt-dialog" id="dlg-account"><h2>Your details</h2>' +
          '<form class="pt-form" data-form="account" method="dialog">' +
            '<label>Name<input class="pt-input" name="name"></label>' +
            '<label>Company<input class="pt-input" name="company"></label>' +
            '<p class="pt-msg" hidden data-msg></p>' +
            '<div class="mf-actions"><button class="mf-btn mf-btn--sm" type="submit">Save</button><button class="mf-btn mf-btn--sm mf-btn--ghost" type="button" data-close>Cancel</button></div>' +
            '<p class="mf-muted" style="margin:0;font-size:0.9rem">To change your password, sign out and use “Forgot password”.</p>' +
          "</form></dialog>";
    }
    return html;
  }

  async function openProjectDialog(opts) {
    var dlg = P.qs("#dlg-project");
    var form = dlg.querySelector("form");
    form.reset();
    P.showMsg(form.querySelector("[data-msg]"), "");
    var editing = opts && opts.project;
    dlg.querySelector("[data-title]").textContent = editing ? "Edit project" : "New project";
    form.elements.projectId.value = editing ? editing.id : "";
    dlg.querySelector("[data-client-field]").hidden = !!editing;
    form.elements.clientId.required = !editing;
    if (!editing) {
      if (!state.clients.length) {
        var r = await P.api("/api/admin/clients");
        state.clients = (r.data && r.data.clients) || [];
      }
      form.elements.clientId.innerHTML = '<option value="">Choose a client</option>' + state.clients.map(function (c) {
        return '<option value="' + esc(c.id) + '">' + esc((c.name || c.email) + (c.company ? " · " + c.company : "")) + "</option>";
      }).join("");
      if (opts && opts.clientId) form.elements.clientId.value = opts.clientId;
    } else {
      form.elements.title.value = editing.title;
      form.elements.type.value = editing.type;
      form.elements.dueDate.value = editing.dueDate || "";
      form.elements.description.value = editing.description || "";
    }
    dlg.showModal();
  }

  /* ---------- events ---------- */
  root.addEventListener("click", async function (e) {
    var t = e.target.closest("button, [data-drop]");
    if (!t) return;

    if (t.hasAttribute("data-project")) return openProject(t.getAttribute("data-project"));
    if (t.hasAttribute("data-tab")) { state.tab = t.getAttribute("data-tab"); renderProject(); writeHash(); return; }
    if (t.hasAttribute("data-goto")) { state.tab = t.getAttribute("data-goto"); renderProject(); writeHash(); var f = P.qs(state.tab === "notes" ? "#msg-body" : "[data-drop]"); if (f) f.focus(); return; }
    if (t.hasAttribute("data-view")) {
      if (t.getAttribute("data-view") === "clients") return showClients();
      state.view = "projects";
      syncViewChips();
      var first = state.projects[0];
      return first ? openProject(first.id) : renderEmpty();
    }
    if (t.hasAttribute("data-filter")) { state.fileFilter = t.getAttribute("data-filter"); renderProject(); return; }
    if (t.hasAttribute("data-drop")) { var input = t.querySelector("[data-file-input]"); if (input) input.click(); return; }
    if (t.hasAttribute("data-close")) { t.closest("dialog").close(); return; }

    var act = t.getAttribute("data-act");
    if (act === "logout") return P.logout();
    if (act === "new-client") { var dc = P.qs("#dlg-client"); dc.querySelector("form").reset(); P.showMsg(dc.querySelector("[data-msg]"), ""); dc.showModal(); return; }
    if (act === "new-project") return openProjectDialog({});
    if (act === "edit-project") return openProjectDialog({ project: state.current.project });
    if (act === "account") {
      var da = P.qs("#dlg-account");
      da.querySelector("[name=name]").value = state.session.user.name || "";
      da.querySelector("[name=company]").value = state.session.user.company || "";
      da.showModal();
      return;
    }
    if (act === "archive") {
      var arch = !state.current.project.archived;
      if (arch && !confirm("Archive this project? The client keeps access, it just leaves the active list.")) return;
      await P.api("/api/admin/projects/" + state.current.project.id, { method: "PATCH", body: JSON.stringify({ archived: arch }) });
      P.toast(arch ? "Project archived" : "Project restored");
      return refresh();
    }

    if (t.hasAttribute("data-new-project-for")) return openProjectDialog({ clientId: t.getAttribute("data-new-project-for") });
    if (t.hasAttribute("data-resend-invite")) {
      t.disabled = true;
      var ri = await P.api("/api/admin/clients/" + t.getAttribute("data-resend-invite") + "/invite", { method: "POST" });
      P.toast(ri.data && ri.data.ok ? (ri.data.invited ? "Invite sent" : "Invite created, but the email didn't send. Check RESEND_API_KEY.") : (ri.data.error || "Couldn't send"));
      t.disabled = false;
      return;
    }
    if (t.hasAttribute("data-delete-asset")) {
      if (!confirm("Remove this from the project? Files are deleted from storage.")) return;
      var del = await P.api("/api/portal/assets/" + t.getAttribute("data-delete-asset"), { method: "DELETE" });
      if (!del.data.ok) return P.toast(del.data.error || "Couldn't remove");
      P.toast("Removed");
      return refresh();
    }
    if (t.hasAttribute("data-toggle-message")) {
      await P.api("/api/portal/messages/" + t.getAttribute("data-toggle-message"), { method: "PATCH", body: JSON.stringify({ status: t.getAttribute("data-status") }) });
      return refresh();
    }
    if (t.hasAttribute("data-task-delete")) {
      if (!confirm("Delete this task?")) return;
      await P.api("/api/admin/tasks/" + t.getAttribute("data-task-delete"), { method: "DELETE" });
      return refresh();
    }
    if (t.hasAttribute("data-task-visible")) {
      await P.api("/api/portal/tasks/" + t.getAttribute("data-task-visible"), { method: "PATCH", body: JSON.stringify({ clientVisible: t.getAttribute("data-visible") === "1" }) });
      return refresh();
    }
  });

  root.addEventListener("change", async function (e) {
    var t = e.target;
    if (t.matches("[data-file-input]")) { queueFiles(t.files); t.value = ""; return; }
    if (t.matches("[data-task-done]")) {
      await P.api("/api/portal/tasks/" + t.getAttribute("data-task-done"), { method: "PATCH", body: JSON.stringify({ done: t.checked }) });
      return refresh();
    }
    if (t.matches("[data-archived]")) { state.showArchived = t.checked; return loadProjects(); }
    if (t.matches("input[name=kind]")) {
      var ta = P.qs("#msg-body");
      try { ta.placeholder = JSON.parse(ta.getAttribute("data-hints"))[t.value] || ""; } catch (err) { /* ignore */ }
    }
  });

  root.addEventListener("input", function (e) {
    if (e.target.matches("[data-search]")) { state.search = e.target.value; renderList(); }
  });

  root.addEventListener("keydown", function (e) {
    var t = e.target;
    if (t.matches("[data-drop]") && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); t.querySelector("[data-file-input]").click(); }
    if (t.matches(".pt-tab") && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      var i = TABS.findIndex(function (x) { return x[0] === state.tab; });
      i = (i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length;
      state.tab = TABS[i][0];
      renderProject();
      writeHash();
      var nt = P.qs("#tab-" + state.tab);
      if (nt) nt.focus();
    }
  });

  ["dragenter", "dragover"].forEach(function (ev) {
    root.addEventListener(ev, function (e) {
      var z = e.target.closest && e.target.closest("[data-drop]");
      if (!z) return;
      e.preventDefault();
      z.classList.add("is-over");
    });
  });
  ["dragleave", "drop"].forEach(function (ev) {
    root.addEventListener(ev, function (e) {
      var z = e.target.closest && e.target.closest("[data-drop]");
      if (!z) return;
      e.preventDefault();
      z.classList.remove("is-over");
      if (ev === "drop" && e.dataTransfer && e.dataTransfer.files.length) queueFiles(e.dataTransfer.files);
    });
  });

  root.addEventListener("submit", async function (e) {
    var form = e.target;
    var kind = form.getAttribute("data-form");
    if (!kind) return;
    e.preventDefault();
    var btn = form.querySelector("[type=submit]");
    var msg = form.querySelector("[data-msg]");
    if (btn) btn.disabled = true;
    try {
      var fd = new FormData(form);
      var r;
      if (kind === "message") {
        r = await P.api("/api/portal/projects/" + state.current.project.id + "/messages", { method: "POST", body: JSON.stringify({ kind: fd.get("kind"), body: fd.get("body") }) });
        if (r.data.ok) { P.toast("Sent"); return refresh(); }
      } else if (kind === "link") {
        r = await P.api("/api/portal/projects/" + state.current.project.id + "/links", { method: "POST", body: JSON.stringify({ url: fd.get("url"), name: fd.get("name") }) });
        if (r.data.ok) { P.toast("Link added"); return refresh(); }
      } else if (kind === "task") {
        r = await P.api("/api/admin/projects/" + state.current.project.id + "/tasks", { method: "POST", body: JSON.stringify({ title: fd.get("title"), dueDate: fd.get("dueDate"), clientVisible: !!fd.get("clientVisible") }) });
        if (r.data.ok) return refresh();
      } else if (kind === "project-settings") {
        r = await P.api("/api/admin/projects/" + state.current.project.id, { method: "PATCH", body: JSON.stringify({ stage: fd.get("stage"), dueDate: fd.get("dueDate"), siteHost: fd.get("siteHost") }) });
        if (r.data.ok) { P.toast("Saved"); return refresh(); }
      } else if (kind === "client") {
        r = await P.api("/api/admin/clients", { method: "POST", body: JSON.stringify({
          email: fd.get("email"), name: fd.get("name"), company: fd.get("company"),
          projectTitle: fd.get("projectTitle"), projectType: fd.get("projectType"), dueDate: fd.get("dueDate"),
          inviteNote: fd.get("inviteNote"), sendInvite: !!fd.get("sendInvite"),
        }) });
        if (r.data.ok) {
          form.closest("dialog").close();
          state.clients = [];
          P.toast(r.data.invited ? "Client added and invited" : fd.get("sendInvite") ? "Client added. The invite email didn't send: check RESEND_API_KEY" : "Client added");
          await loadProjects();
          if (r.data.projectId) return openProject(r.data.projectId);
          return showClients();
        }
      } else if (kind === "project") {
        var id = fd.get("projectId");
        var payload = { title: fd.get("title"), type: fd.get("type"), dueDate: fd.get("dueDate"), description: fd.get("description") };
        if (id) r = await P.api("/api/admin/projects/" + id, { method: "PATCH", body: JSON.stringify(payload) });
        else { payload.clientId = fd.get("clientId"); r = await P.api("/api/admin/workspace/projects", { method: "POST", body: JSON.stringify(payload) }); }
        if (r.data.ok) {
          form.closest("dialog").close();
          await loadProjects();
          return openProject(id || r.data.project.id);
        }
      } else if (kind === "account") {
        r = await P.api("/api/portal/account", { method: "POST", body: JSON.stringify({ name: fd.get("name"), company: fd.get("company") }) });
        if (r.data.ok) {
          state.session.user.name = r.data.user.name;
          state.session.user.company = r.data.user.company;
          form.closest("dialog").close();
          renderShell();
          renderList();
          if (state.current) renderProject();
          return P.toast("Saved");
        }
      }
      var err = (r && r.data && r.data.error) || "Something went wrong.";
      if (msg) P.showMsg(msg, err, "error"); else P.toast(err);
    } finally {
      if (btn && btn.isConnected) btn.disabled = false;
    }
  });

  // Dialogs live inside #pt-root, so their submits bubble to the handler above.
  window.addEventListener("hashchange", function () {
    var h = readHash();
    if (h.view === "clients" && ADMIN_MODE) return showClients();
    if (h.project && (!state.current || h.project !== state.current.project.id)) openProject(h.project, h.tab || "overview");
  });

  boot();
})();
