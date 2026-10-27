/* ============================================================
   3D project carousel ([data-mf-carousel])

   Reads the project tiles already in the page (built from
   data/portfolio-projects.json by scripts/build-mono-sections.mjs) and
   stands them on the inside of a cylinder, so the side cards curve toward
   you. Drag, swipe or two-finger swipe on a trackpad to spin it (it always
   settles with one card centered), use the arrow buttons or keys, and pick
   a category chip to re-form the ring with just those projects. When left
   alone it steps to the next card every few seconds. The card in front opens its case study;
   any other card turns to the front first.

   Without JS, without 3D transforms, or with reduced motion, the plain
   tile grid stays, and the chips filter that instead.
   ============================================================ */
(function () {
  "use strict";

  var MIN_SLOTS = 12;      // short filtered lists repeat to keep the ring full
  var AUTOPLAY_MS = 4500;  // idle time before stepping to the next card
  var WHEEL_SETTLE_MS = 160; // trackpad swipe ends this long after the last wheel event
  var MAX_FLING = 2;       // a fast drag moves at most this many cards past the release point

  function supports3d() {
    return window.CSS && CSS.supports && CSS.supports("transform-style", "preserve-3d") &&
      CSS.supports("perspective", "1px");
  }

  function init(root) {
    var stage = root.querySelector(".mf-carousel__stage");
    var ring = root.querySelector(".mf-carousel__ring");
    var grid = root.querySelector("[data-mf-grid]");
    var now = root.querySelector(".mf-carousel__now");
    var chips = Array.prototype.slice.call(root.querySelectorAll("[data-filter]"));
    var countEl = root.querySelector("[data-mf-count]");
    var tiles = Array.prototype.slice.call(grid ? grid.querySelectorAll(".mf-tile") : []);
    if (!tiles.length) return;

    var projects = tiles.map(function (t) {
      var img = t.querySelector("img");
      var title = t.querySelector(".mf-tile__title");
      return {
        tile: t,
        href: t.getAttribute("href"),
        category: t.getAttribute("data-category") || "",
        label: t.getAttribute("data-label") || "",
        summary: t.getAttribute("data-summary") || "",
        name: title ? title.textContent.trim() : "",
        img: img ? img.getAttribute("src") : ""
      };
    });

    var filter = "all";
    function visibleProjects() {
      return projects.filter(function (p) { return filter === "all" || p.category === filter; });
    }

    function applyGridFilter() {
      var list = visibleProjects();
      projects.forEach(function (p) { p.tile.hidden = list.indexOf(p) === -1; });
      if (countEl) countEl.textContent = String(list.length);
    }

    function setFilter(key) {
      filter = key;
      chips.forEach(function (c) { c.setAttribute("aria-pressed", c.getAttribute("data-filter") === key ? "true" : "false"); });
      applyGridFilter();
      if (enhanced) rebuild(true);
    }
    chips.forEach(function (c) {
      c.addEventListener("click", function () { setFilter(c.getAttribute("data-filter")); });
    });

    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var enhanced = !!(stage && ring && now && supports3d() && !reduce);
    if (!enhanced) return; // grid + chips only

    grid.hidden = true;
    stage.hidden = false;
    now.hidden = false;

    var nameEl = now.querySelector("[data-mf-now-name]");
    var labelEl = now.querySelector("[data-mf-now-label]");
    var summaryEl = now.querySelector("[data-mf-now-summary]");
    var linkEl = now.querySelector("[data-mf-now-link]");

    var cards = [];        // { el, item, theta }
    var step = 30, radius = 600, persp = 800, cardW = 240;
    var rot = 0, target = 0, frontIndex = -1;
    var dragging = false, dragMoved = false, startX = 0, lastX = 0, lastT = 0, velocity = 0;
    var lastInteract = 0, inView = true, raf = 0, prevT = 0;

    function rebuild(animate) {
      var items = visibleProjects();
      if (!items.length) items = projects;
      var slots = items.length;
      var reps = 1;
      while (slots * reps < MIN_SLOTS) reps++;
      var list = [];
      for (var r = 0; r < reps; r++) items.forEach(function (it) { list.push({ item: it, copy: r > 0 }); });

      var W = stage.clientWidth, H = stage.clientHeight;
      cardW = Math.max(128, Math.min(330, Math.min(W * 0.23, H * 0.56)));
      if (W < 640) cardW = Math.max(128, Math.min(230, W * 0.52));
      step = 360 / list.length;
      radius = (cardW * 1.16) / (2 * Math.sin(Math.PI / list.length));
      persp = radius * 1.32;
      stage.style.perspective = persp + "px";
      stage.style.setProperty("--mf-card-w", cardW + "px");

      if (animate) ring.style.opacity = "0";
      var build = function () {
        ring.innerHTML = "";
        cards = list.map(function (entry, i) {
          var a = document.createElement("a");
          a.className = "mf-card3d";
          a.href = entry.item.href;
          a.tabIndex = -1;
          a.setAttribute("draggable", "false");
          if (entry.copy) a.setAttribute("aria-hidden", "true");
          a.innerHTML =
            '<img src="' + entry.item.img + '" alt="" draggable="false" loading="' + (i < 8 ? "eager" : "lazy") + '" decoding="async">' +
            '<span class="mf-card3d__meta"><span class="mf-label">' + escapeHtml(entry.item.label) + "</span>" +
            '<span class="mf-card3d__name">' + escapeHtml(entry.item.name) + "</span></span>";
          ring.appendChild(a);
          return { el: a, item: entry.item, theta: i * step };
        });
        rot = target = Math.round(rot / step) * step;
        frontIndex = -1;
        render();
        ring.style.opacity = "";
      };
      if (animate) setTimeout(build, 220); else build();
    }

    function escapeHtml(s) {
      return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
    }

    function norm(a) {
      a = a % 360;
      if (a > 180) a -= 360;
      if (a < -180) a += 360;
      return a;
    }

    // A card leaves the view before it would pass behind the camera.
    function limitDeg() {
      var c = 1 - (0.82 * persp) / radius;
      return Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI;
    }

    function render() {
      ring.style.transform = "translateZ(" + radius + "px) rotateY(" + rot + "deg)";
      var limit = limitDeg();
      var best = -1, bestAbs = 999;
      for (var i = 0; i < cards.length; i++) {
        var c = cards[i];
        var phi = norm(c.theta + rot);
        var abs = Math.abs(phi);
        c.el.style.transform = "rotateY(" + c.theta + "deg) translateZ(" + (-radius) + "px)";
        var fade = abs > limit ? 0 : abs > limit * 0.7 ? 1 - (abs - limit * 0.7) / (limit * 0.3) : 1;
        c.el.style.opacity = fade.toFixed(3);
        c.el.style.visibility = fade <= 0.01 ? "hidden" : "visible";
        c.el.style.filter = abs < step * 0.5 ? "" : "brightness(" + (1 - Math.min(abs / limit, 1) * 0.3).toFixed(3) + ")";
        if (abs < bestAbs) { bestAbs = abs; best = i; }
      }
      if (best !== frontIndex) {
        if (cards[frontIndex]) cards[frontIndex].el.classList.remove("is-front");
        frontIndex = best;
        if (cards[best]) {
          cards[best].el.classList.add("is-front");
          showNow(cards[best].item);
        }
      }
    }

    function showNow(item) {
      if (nameEl) nameEl.textContent = item.name;
      if (labelEl) labelEl.textContent = "(" + item.label + ")";
      if (summaryEl) summaryEl.textContent = item.summary;
      if (linkEl) {
        linkEl.href = item.href;
        linkEl.setAttribute("aria-label", "View the " + item.name + " case study");
      }
    }

    function snap(base) {
      target = Math.round(base / step) * step;
    }

    function go(dir) {
      lastInteract = performance.now();
      snap(target - dir * step);
      kick();
    }

    function goToCard(card) {
      lastInteract = performance.now();
      var phi = norm(card.theta + rot);
      target = rot - phi;
      kick();
    }

    function tick(t) {
      raf = 0;
      var dt = prevT ? Math.min(64, t - prevT) : 16;
      prevT = t;
      if (!dragging) {
        if (t - lastInteract > AUTOPLAY_MS && !root.matches(":hover") && !root.contains(document.activeElement)) {
          lastInteract = t;
          snap(target - step);
        }
        var diff = target - rot;
        rot += diff * Math.min(1, 0.0075 * dt);
        if (Math.abs(diff) < 0.01) rot = target;
      }
      render();
      if (inView && !document.hidden) raf = requestAnimationFrame(tick);
      else prevT = 0;
    }

    function kick() {
      if (!raf && inView) { prevT = 0; raf = requestAnimationFrame(tick); }
    }

    /* Drag / swipe */
    var degPerPx = function () { return step / (cardW * 1.1); };
    stage.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      dragging = true; dragMoved = false;
      startX = lastX = e.clientX; lastT = performance.now(); velocity = 0;
      lastInteract = lastT;
    });
    window.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var dx = e.clientX - lastX;
      if (!dragMoved && Math.abs(e.clientX - startX) > 6) {
        dragMoved = true;
        stage.classList.add("is-dragging");
        try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      }
      if (!dragMoved) return;
      var nowT = performance.now();
      var d = dx * degPerPx();
      rot += d; target = rot;
      velocity = d / Math.max(1, nowT - lastT);
      lastX = e.clientX; lastT = nowT; lastInteract = nowT;
      kick();
    });
    function endDrag() {
      if (!dragging) return;
      dragging = false;
      stage.classList.remove("is-dragging");
      if (dragMoved) {
        var fling = Math.max(-MAX_FLING * step, Math.min(MAX_FLING * step, velocity * 180));
        snap(rot + fling);
      }
      lastInteract = performance.now();
      kick();
    }
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);

    // A drag never opens a link; a tap on a side card turns it to the front.
    ring.addEventListener("click", function (e) {
      var a = e.target.closest(".mf-card3d");
      if (!a) return;
      if (dragMoved) { e.preventDefault(); dragMoved = false; return; }
      var card = cards.filter(function (c) { return c.el === a; })[0];
      if (card && card !== cards[frontIndex]) {
        e.preventDefault();
        goToCard(card);
      }
    });

    /* Keys */
    stage.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
      else if ((e.key === "Enter" || e.key === " ") && cards[frontIndex]) {
        e.preventDefault();
        window.location.href = cards[frontIndex].item.href;
      }
    });
    var prev = now.querySelector("[data-mf-prev]");
    var next = now.querySelector("[data-mf-next-btn]");
    if (prev) prev.addEventListener("click", function () { go(-1); });
    if (next) next.addEventListener("click", function () { go(1); });

    /* Trackpad two-finger swipe (horizontal wheel). Handled here so it turns
       the ring instead of triggering the browser's back/forward gesture;
       vertical scrolling still scrolls the page. */
    var wheelTimer = 0;
    stage.addEventListener("wheel", function (e) {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      var px = e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX;
      rot -= px * degPerPx(); target = rot;
      lastInteract = performance.now();
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(function () { snap(rot); kick(); }, WHEEL_SETTLE_MS);
      kick();
    }, { passive: false });

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView) kick();
      }).observe(stage);
    }
    document.addEventListener("visibilitychange", function () { if (!document.hidden) kick(); });

    var resizeTimer = 0, lastW = stage.clientWidth;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (stage.clientWidth === lastW) return;
        lastW = stage.clientWidth;
        rebuild(false);
      }, 150);
    });

    applyGridFilter();
    rebuild(false);
    kick();
  }

  function start() {
    document.querySelectorAll("[data-mf-carousel]").forEach(init);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
