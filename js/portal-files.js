/**
 * Shared Files section used by the client dashboard and the admin Projects tab.
 *   SWFTFiles.mount(container, { base, project, admin, readOnly })
 * base: "/api/portal/files" (client) or "/api/admin/files" (owner; project id is sent as ?project=)
 */
(function () {
  function h(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function size(n) {
    if (n < 1024) return n + " B";
    if (n < 1048576) return Math.round(n / 1024) + " KB";
    return (n / 1048576).toFixed(1).replace(/\.0$/, "") + " MB";
  }
  function when(s) {
    var d = new Date(String(s).replace(" ", "T") + "Z");
    return isNaN(d) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }
  var DRIVE = { synced: "In Drive", pending: "Syncing to Drive", failed: "Drive sync retrying", skipped: "Saved (Drive not connected yet)" };

  function mount(box, opts) {
    var q = opts.admin ? "?project=" + encodeURIComponent(opts.project) : "";
    var url = function (extra) { return opts.base + (q ? q + (extra ? "&" + extra : "") : (extra ? "?" + extra : "")); };
    var list = h("ul", "portal-files__list");
    var msg = h("p", "portal-muted portal-files__msg"); msg.setAttribute("role", "status");
    var maxMb = 25;

    function render(files, drive) {
      list.replaceChildren.apply(list, files.map(function (f) {
        var li = h("li", "portal-file");
        var a = h("a", "portal-file__name", f.name);
        a.href = url("id=" + encodeURIComponent(f.id));
        var meta = h("small", "portal-muted", size(f.size) + " · " + (f.by === "admin" ? "From SWFT" : "From you") + " · " + when(f.createdAt) + (opts.admin ? " · " + (DRIVE[f.drive] || "") : ""));
        if (opts.admin) meta.textContent = size(f.size) + " · " + (f.by === "admin" ? "SWFT" : "Client") + " · " + when(f.createdAt) + " · " + (DRIVE[f.drive] || "");
        var info = h("div", "portal-file__info"); info.append(a, meta);
        li.append(info);
        if (!opts.readOnly && (opts.admin || f.by === "client")) {
          var del = h("button", "portal-file__del", "Remove"); del.type = "button";
          del.setAttribute("aria-label", "Remove " + f.name);
          del.onclick = function () {
            if (!confirm("Remove " + f.name + "?")) return;
            SWFTPortal.api(url("id=" + encodeURIComponent(f.id)), { method: "DELETE" }).then(function (r) {
              if (r.res.ok && r.data.ok) render(r.data.files); else msg.textContent = (r.data && r.data.error) || "Could not remove it.";
            });
          };
          li.append(del);
        }
        return li;
      }));
      if (!files.length) list.replaceChildren(h("li", "portal-muted portal-files__empty", opts.admin ? "No files yet." : "No files yet. Upload logos, photos, copy or anything we need for your site."));
    }

    function upload(fileList) {
      var files = [].slice.call(fileList || []);
      if (!files.length) return;
      var i = 0;
      (function next() {
        if (i >= files.length) { msg.textContent = ""; return; }
        var f = files[i++];
        msg.textContent = "Uploading " + f.name + " (" + i + " of " + files.length + ")…";
        var fd = new FormData();
        fd.append("file", f);
        if (opts.admin) fd.append("project", opts.project);
        fetch(opts.base, { method: "POST", body: fd, credentials: "same-origin" })
          .then(function (res) { return res.json().then(function (d) { return { res: res, d: d }; }); })
          .then(function (r) {
            if (r.res.ok && r.d.ok) { render(r.d.files); next(); }
            else { msg.textContent = f.name + ": " + ((r.d && r.d.error) || "upload failed."); next(); }
          })
          .catch(function () { msg.textContent = f.name + ": upload failed. Check your connection."; next(); });
      })();
    }

    var parts = [];
    if (!opts.readOnly) {
      var input = h("input"); input.type = "file"; input.multiple = true; input.hidden = true;
      input.onchange = function () { upload(input.files); input.value = ""; };
      var zone = h("div", "portal-files__drop");
      var btn = h("button", "mf-btn mf-btn--sm", "Choose files"); btn.type = "button";
      btn.onclick = function () { input.click(); };
      zone.append(h("span", null, "Drag files here or "), btn, h("small", "portal-muted", "Up to " + maxMb + " MB each"));
      ["dragenter", "dragover"].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add("is-over"); }); });
      ["dragleave", "drop"].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove("is-over"); }); });
      zone.addEventListener("drop", function (e) { upload(e.dataTransfer && e.dataTransfer.files); });
      parts.push(zone, input);
    }
    parts.push(msg, list);
    box.replaceChildren.apply(box, parts);

    SWFTPortal.api(url()).then(function (r) {
      if (!r.res.ok || !r.data.ok) {
        box.replaceChildren(h("p", "portal-muted", r.res.status === 503 ? "File sharing is not available yet." : ((r.data && r.data.error) || "Could not load files.")));
        return;
      }
      maxMb = r.data.maxMb || maxMb;
      render(r.data.files, r.data.drive);
      if (opts.admin && r.data.drive === false) msg.textContent = "Google Drive is not connected yet. Files are saved here and will sync once it is.";
    });
  }
  window.SWFTFiles = { mount: mount };
})();
