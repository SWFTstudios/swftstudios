/**
 * Project schedule calendar, shared by the client dashboard and the admin
 * project page. Week and month views; swipe left/right (touch), trackpad
 * side-scroll, the arrow buttons or the arrow keys move between weeks/months.
 *
 *   var cal = SWFTCalendar.mount(el, { milestones, editable, onSave });
 *   cal.update(milestones);           // re-render, keeping the view and the page you're on
 *   SWFTCalendar.summary(milestones)  // { eta, sub } for the heading
 *
 * editable (admin): tap a step to change its date or status (onSave(m, { date, status })
 * returns a promise); on desktop, steps can also be dragged to another day.
 * All text goes through textContent.
 */
(function () {
  var VIEW_KEY = "swft-cal-view";
  var LABEL = { done: "Done", in_progress: "In progress", upcoming: "Up next" };
  var LAUNCH = /launch|go[- ]?live/i;
  var AFTER = /support|check[- ]?in|follow[- ]?up/i;
  var reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  function h(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function p2(n) { return (n < 10 ? "0" : "") + n; }
  function iso(d) { return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function startOfWeek(d) { return addDays(d, -d.getDay()); }
  function today() { var t = new Date(); t.setHours(0, 0, 0, 0); return t; }
  /** A bare YYYY-MM-DD is a local calendar day; a stored timestamp is UTC. */
  function localDay(s) {
    if (!s) return null;
    var ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
    var d = ymd ? new Date(+ymd[1], +ymd[2] - 1, +ymd[3]) : new Date(String(s).replace(" ", "T") + (/T|Z/.test(s) ? "" : "Z"));
    if (isNaN(d)) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  }
  function dateOf(m) { return localDay(m.status === "done" ? m.completedAt : m.dueDate); }
  function fmt(d, o) { return d.toLocaleDateString([], o); }
  function longDay(d) { return fmt(d, { weekday: "short", month: "short", day: "numeric" }); }

  /** The launch step (or last dated working step): what "estimated completion" means. */
  function finishStep(milestones) {
    var dated = milestones.filter(function (m) { return dateOf(m); });
    var launch = dated.filter(function (m) { return LAUNCH.test(m.title); }).pop();
    if (launch) return launch;
    var work = dated.filter(function (m) { return !AFTER.test(m.title); });
    return work.sort(function (a, b) { return dateOf(a) - dateOf(b); }).pop() || null;
  }

  function summary(milestones) {
    var t = today();
    var open = milestones.filter(function (m) { return m.status !== "done"; });
    var undated = open.filter(function (m) { return !m.dueDate; }).length;
    var f = finishStep(milestones);
    if (!milestones.some(dateOf)) return { eta: "Dates coming soon", sub: "We'll add target dates to your steps shortly." };
    if (!open.length) {
      var last = milestones.map(dateOf).filter(Boolean).sort(function (a, b) { return a - b; }).pop();
      return { eta: "All steps complete", sub: "Finished " + longDay(last) + "." };
    }
    if (f && f.status === "done") {
      var next = open.filter(function (m) { return m.dueDate; })[0];
      return { eta: "Launched " + fmt(dateOf(f), { month: "long", day: "numeric" }), sub: next ? "Next: " + next.title + " · " + longDay(localDay(next.dueDate)) : "" };
    }
    if (!f) return { eta: "Dates coming soon", sub: "We'll add target dates to your steps shortly." };
    var fd = dateOf(f), days = Math.round((fd - t) / 864e5);
    var sub = days > 1 ? days + " days to go" : days === 1 ? "1 day to go" : days === 0 ? "Due today" : "Wrapping up";
    if (undated) sub += " · " + (undated === 1 ? "1 step doesn't" : undated + " steps don't") + " have a date yet";
    return { eta: "Estimated completion: " + fmt(fd, { month: "long", day: "numeric" }), sub: sub, finish: fd };
  }

  function readView() {
    try { var v = localStorage.getItem(VIEW_KEY); if (v === "week" || v === "month") return v; } catch (e) { /* ignore */ }
    return window.matchMedia && matchMedia("(max-width: 640px)").matches ? "week" : "month";
  }

  function mount(root, opts) {
    opts = opts || {};
    var milestones = opts.milestones || [];
    var view = readView();
    var anchor = today();
    var selected = iso(today());
    var dragId = null;

    root.classList.add("portal-cal__app");
    var label = h("p", "portal-cal__label");
    label.setAttribute("aria-live", "polite");
    var prev = h("button", "portal-cal__nav", "‹"); prev.type = "button";
    var next = h("button", "portal-cal__nav", "›"); next.type = "button";
    var todayBtn = h("button", "portal-cal__today-btn", "Today"); todayBtn.type = "button";
    var seg = h("div", "portal-cal__seg"); seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "Calendar view");
    var weekBtn = h("button", null, "Week"); weekBtn.type = "button";
    var monthBtn = h("button", null, "Month"); monthBtn.type = "button";
    seg.append(weekBtn, monthBtn);
    var bar = h("div", "portal-cal__bar");
    var navs = h("div", "portal-cal__navs");
    navs.append(prev, label, next);
    var right = h("div", "portal-cal__navs");
    right.append(todayBtn, seg);
    bar.append(navs, right);

    var viewport = h("div", "portal-cal__viewport");
    viewport.tabIndex = 0;
    viewport.setAttribute("aria-roledescription", "calendar");
    var pane = h("div", "portal-cal__pane");
    viewport.append(pane);
    var dayBox = h("div", "portal-cal__dayinfo");
    var undatedBox = h("div", "portal-cal__undated");
    var hint = h("p", "portal-cal__hint portal-muted");
    root.replaceChildren(bar, viewport, dayBox, undatedBox, hint);

    function byDay() {
      var map = {};
      milestones.forEach(function (m) { var d = dateOf(m); if (d) (map[iso(d)] = map[iso(d)] || []).push(m); });
      return map;
    }

    function stepEl(m, tag) {
      var el = h(tag || "li", "portal-cal__step is-" + m.status);
      el.append(h("span", "portal-cal__step-name", m.title));
      el.title = m.title + " (" + (LABEL[m.status] || m.status) + ")";
      if (opts.editable) {
        el.tabIndex = 0;
        el.setAttribute("role", "button");
        el.setAttribute("aria-label", "Edit " + m.title);
        el.draggable = true;
        el.addEventListener("click", function (e) { e.stopPropagation(); edit(m); });
        el.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); edit(m); } });
        el.addEventListener("dragstart", function (e) { dragId = m.id; e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", m.id); } catch (x) { /* ignore */ } });
        el.addEventListener("dragend", function () { dragId = null; });
      }
      return el;
    }

    function render(dir) {
      var map = byDay(), t = today(), s = summary(milestones);
      var first, last;
      if (view === "week") {
        first = startOfWeek(anchor); last = addDays(first, 6);
        label.textContent = first.getMonth() === last.getMonth()
          ? fmt(first, { month: "short", day: "numeric" }) + " – " + last.getDate() + ", " + last.getFullYear()
          : fmt(first, { month: "short", day: "numeric" }) + " – " + fmt(last, { month: "short", day: "numeric", year: "numeric" });
      } else {
        var m1 = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
        first = startOfWeek(m1);
        last = addDays(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0), 0);
        last = addDays(last, 6 - last.getDay());
        label.textContent = fmt(m1, { month: "long", year: "numeric" });
      }
      weekBtn.setAttribute("aria-pressed", String(view === "week"));
      monthBtn.setAttribute("aria-pressed", String(view === "month"));
      prev.setAttribute("aria-label", view === "week" ? "Previous week" : "Previous month");
      next.setAttribute("aria-label", view === "week" ? "Next week" : "Next month");

      var grid = h("div", "portal-cal__grid portal-cal__grid--" + view);
      if (view === "month") {
        for (var w = 0; w < 7; w++) grid.append(h("div", "portal-cal__dow", fmt(addDays(first, w), { weekday: "short" })));
      }
      for (var d = first; d <= last; d = addDays(d, 1)) {
        var key = iso(d), steps = map[key] || [];
        var cls = "portal-cal__day";
        if (view === "month" && d.getMonth() !== anchor.getMonth()) cls += " is-outside";
        if (d < t) cls += " is-past";
        if (+d === +t) cls += " is-today";
        if (s.finish && d >= t && d <= s.finish) cls += " is-window";
        if (s.finish && +d === +s.finish) cls += " is-finish";
        if (steps.length) cls += " has-steps";
        if (key === selected) cls += " is-selected";
        var cell = h("div", cls);
        cell.setAttribute("data-day", key);
        var head = h("div", "portal-cal__dayhead");
        if (view === "week") head.append(h("span", "portal-cal__wd", fmt(d, { weekday: "short" })));
        head.append(h("span", "portal-cal__num", d.getDate() === 1 && view === "month" ? fmt(d, { month: "short", day: "numeric" }) : String(d.getDate())));
        if (+d === +t) head.append(h("span", "portal-cal__tag", "Today"));
        cell.append(head);
        var ul = h("ul", "portal-cal__steps");
        steps.forEach(function (m) { ul.append(stepEl(m)); });
        if (steps.length) cell.append(ul);
        else if (view === "week") cell.append(h("p", "portal-cal__empty", "—"));
        cell.setAttribute("aria-label", longDay(d) + (steps.length ? ": " + steps.map(function (m) { return m.title + " (" + (LABEL[m.status] || m.status) + ")"; }).join(", ") : ": nothing scheduled"));
        cell.addEventListener("click", (function (k) { return function () { selected = k; render(); }; })(key));
        if (opts.editable) {
          cell.addEventListener("dragover", function (e) { if (dragId) { e.preventDefault(); this.classList.add("is-drop"); } });
          cell.addEventListener("dragleave", function () { this.classList.remove("is-drop"); });
          cell.addEventListener("drop", (function (k) { return function (e) {
            e.preventDefault(); this.classList.remove("is-drop");
            var m = milestones.filter(function (x) { return x.id === dragId; })[0];
            dragId = null;
            if (m && (!dateOf(m) || iso(dateOf(m)) !== k)) save(m, { date: k, status: m.status });
          }; })(key));
        }
        grid.append(cell);
      }
      pane.replaceChildren(grid);
      if (dir && !reduceMotion) {
        pane.style.transition = "none";
        pane.style.transform = "translateX(" + (dir * 28) + "%)";
        pane.style.opacity = "0";
        void pane.offsetWidth;
        pane.style.transition = "";
        pane.style.transform = "";
        pane.style.opacity = "";
      }
      renderDay(map);
      renderUndated();
      hint.textContent = opts.editable
        ? "Swipe or use the arrows to move around. Tap a step to change its date or status" + (window.matchMedia && matchMedia("(hover: hover)").matches ? ", or drag it to another day." : ".")
        : "Swipe or use the arrows to see other weeks and months. Tap a day to see what's planned.";
    }

    function renderDay(map) {
      var d = localDay(selected);
      var steps = map[selected] || [];
      var title = h("p", "portal-cal__dayinfo-title", longDay(d) + (+d === +today() ? " · Today" : ""));
      var body;
      if (!steps.length) body = h("p", "portal-muted portal-cal__dayinfo-empty", "Nothing scheduled.");
      else {
        body = h("ul", "portal-cal__dayinfo-list");
        steps.forEach(function (m) {
          var li = stepEl(m);
          li.append(h("span", "portal-cal__dayinfo-status", LABEL[m.status] || m.status));
          body.append(li);
        });
      }
      dayBox.replaceChildren(title, body);
    }

    function renderUndated() {
      var open = milestones.filter(function (m) { return !dateOf(m); });
      if (!open.length) { undatedBox.replaceChildren(); undatedBox.hidden = true; return; }
      undatedBox.hidden = false;
      var ul = h("ul", "portal-cal__dayinfo-list");
      open.forEach(function (m) { ul.append(stepEl(m)); });
      undatedBox.replaceChildren(h("p", "portal-cal__dayinfo-title", "No date yet"), ul);
    }

    function go(n) {
      anchor = view === "week" ? addDays(anchor, 7 * n) : new Date(anchor.getFullYear(), anchor.getMonth() + n, 1);
      render(n);
    }
    function setView(v) {
      if (v === view) return;
      view = v;
      try { localStorage.setItem(VIEW_KEY, v); } catch (e) { /* ignore */ }
      anchor = localDay(selected) || anchor;
      render();
    }
    prev.onclick = function () { go(-1); };
    next.onclick = function () { go(1); };
    todayBtn.onclick = function () { anchor = today(); selected = iso(anchor); render(); };
    weekBtn.onclick = function () { setView("week"); };
    monthBtn.onclick = function () { setView("month"); };
    viewport.addEventListener("keydown", function (e) {
      if (e.target !== viewport) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
    });

    // Touch / pen swipe. Vertical scrolling stays with the page (touch-action: pan-y).
    var sx = null, sy = 0, st = 0, moved = false;
    viewport.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse") return;
      sx = e.clientX; sy = e.clientY; st = Date.now(); moved = false;
    });
    viewport.addEventListener("pointermove", function (e) {
      if (sx == null) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (!moved && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) moved = true;
      if (moved) { pane.style.transition = "none"; pane.style.transform = "translateX(" + dx + "px)"; }
    });
    function endSwipe(e, cancel) {
      if (sx == null) return;
      var dx = e.clientX - sx, fast = Math.abs(dx) / Math.max(1, Date.now() - st) > 0.4;
      sx = null;
      pane.style.transition = ""; pane.style.transform = "";
      if (!cancel && moved && (Math.abs(dx) > viewport.clientWidth / 5 || (fast && Math.abs(dx) > 30))) go(dx < 0 ? 1 : -1);
    }
    viewport.addEventListener("pointerup", function (e) { endSwipe(e, false); });
    viewport.addEventListener("pointercancel", function (e) { endSwipe(e, true); });
    // A tap after a swipe shouldn't also select a day.
    viewport.addEventListener("click", function (e) { if (moved) { e.stopPropagation(); moved = false; } }, true);

    // Trackpad two-finger side swipe.
    var wheelX = 0, wheelLock = 0;
    viewport.addEventListener("wheel", function (e) {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      if (Date.now() < wheelLock) return;
      wheelX += e.deltaX;
      if (Math.abs(wheelX) > 60) { go(wheelX > 0 ? 1 : -1); wheelX = 0; wheelLock = Date.now() + 450; }
    }, { passive: false });

    // ---------- editing (admin) ----------
    var dialog = null;
    function save(m, change) {
      if (!opts.onSave) return;
      root.classList.add("is-saving");
      Promise.resolve(opts.onSave(m, change)).then(function () { root.classList.remove("is-saving"); });
    }
    function edit(m) {
      if (!opts.editable) return;
      if (!dialog) { dialog = h("dialog", "portal-cal__dialog"); document.body.append(dialog); }
      var form = h("form", "portal-cal__dialog-form");
      form.method = "dialog";
      var status = h("select");
      ["upcoming", "in_progress", "done"].forEach(function (k) {
        var o = h("option", null, k === "upcoming" ? "Upcoming" : LABEL[k]); o.value = k; if (k === m.status) o.selected = true; status.append(o);
      });
      var d0 = dateOf(m);
      var date = h("input"); date.type = "date"; date.value = d0 ? iso(d0) : "";
      var dateLab = h("span", null, m.status === "done" ? "Completed on" : "Target date");
      status.onchange = function () {
        dateLab.textContent = status.value === "done" ? "Completed on" : "Target date";
        if (status.value === "done") { date.max = iso(today()); if (!date.value || date.value > date.max) date.value = date.max; }
        else date.removeAttribute("max");
      };
      if (m.status === "done") date.max = iso(today());
      var f1 = h("label", "portal-cal__field"); f1.append(h("span", null, "Status"), status);
      var f2 = h("label", "portal-cal__field"); f2.append(dateLab, date);
      var cancel = h("button", "portal-cal__btn portal-cal__btn--ghost", "Cancel"); cancel.type = "button"; cancel.value = "cancel";
      cancel.onclick = function () { dialog.close(); };
      var ok = h("button", "portal-cal__btn", "Save"); ok.type = "submit";
      var acts = h("div", "portal-cal__dialog-actions"); acts.append(cancel, ok);
      form.append(h("p", "portal-stat-label", "Edit step"), h("p", "portal-cal__dialog-title", m.title), f1, f2, acts);
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (status.value === "done" && !date.value) { date.focus(); return; }
        dialog.close();
        if (status.value !== m.status || date.value !== (d0 ? iso(d0) : "")) save(m, { date: date.value, status: status.value });
      });
      dialog.replaceChildren(form);
      if (dialog.showModal) dialog.showModal(); else dialog.setAttribute("open", "");
      date.focus();
    }

    render();
    return {
      update: function (ms) { milestones = ms || []; render(); },
    };
  }

  window.SWFTCalendar = { mount: mount, summary: summary };
})();
