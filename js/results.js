/* Home page Results: featured client sites whose traffic is up
   (GET /api/results, Cloudflare page views, last 30 days vs the 30 before).
   Stays hidden unless there is at least one real, positive result. */
(function () {
  "use strict";
  var box = document.querySelector("[data-mf-results]");
  if (!box) return;
  var list = box.querySelector("[data-mf-results-list]");
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  fetch("/api/results", { headers: { Accept: "application/json" } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d || !d.ok || !d.results || !d.results.length) return;
      list.innerHTML = d.results.map(function (x) {
        var name = x.link ? '<a href="' + esc(x.link) + '">' + esc(x.client) + "</a>" : esc(x.client);
        return '<div class="mf-stat"><span class="mf-stat__value">+' + esc(x.changePercent) + '%</span>' +
          "<p>More " + esc(x.metric) + " for " + name + ", last " + esc(x.days) + " days vs the " + esc(x.days) + " before. Source: " + esc(d.source) + ".</p></div>";
      }).join("");
      box.hidden = false;
    })
    .catch(function () { /* no results: the section stays hidden */ });
})();
