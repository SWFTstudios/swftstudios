/* ============================================================
   Visuals page (visuals.html, css/visuals.css, data/visuals.json)

   - Infinite draggable grid: columns of project tiles that wrap in both
     directions. Drag (with momentum), wheel/trackpad, arrow keys or Tab.
   - The page is Vimeo videos only. List them in data/visuals.json by Vimeo
     id (plus the private-link hash for unlisted ones). Titles, thumbnails,
     descriptions and durations load from Vimeo's public oEmbed, unless the
     JSON gives its own.
   - Click a tile: GSAP Flip grows its thumbnail into a full-screen
     project view (?p=<vimeo id>, so videos are linkable and Back closes them).
   - "Play video" opens the Vimeo player in a lightbox.
   - Works without GSAP too (no transitions). Reduced motion: no momentum,
     near-instant transitions.
   ============================================================ */
(function () {
  "use strict";

  var DATA_URL = "/data/visuals.json";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var RATIOS = [16 / 10, 4 / 5, 16 / 9, 1, 16 / 10, 3 / 4, 16 / 9]; // masonry rhythm (width / height)
  var BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"; // 1x1 clear, until a thumbnail arrives
  var OEMBED_TIMEOUT = 7000;

  var $ = function (id) { return document.getElementById(id); };
  var canvas = $("vz-canvas"), track = $("vz-track");
  if (!canvas || !track) return;

  var detail = $("vz-detail"), detailMedia = $("vz-detail-media");
  var shade = detail.querySelector(".vz-detail__shade");
  var content = detail.querySelector(".vz-detail__content");
  var dnav = detail.querySelector(".vz-detail__nav");
  var videoBox = $("vz-video");

  var all = [], items = [], tiles = [], cols = [];
  var colW = 0, gap = 0, setW = 0;
  var offX = 0, offY = 0, velX = 0, velY = 0;
  var raf = 0, last = 0, locked = false;
  var current = null;      // open project
  var source = null;       // tile the open project came from
  var detailImg = null;
  var lastFocus = null;
  var closing = false;
  var pushed = false;      // true when this page added the history entry for the open film

  function G() { return window.gsap; }
  function F() { return window.Flip; }
  function dur(s) { return reduce ? 0.01 : s; }
  function mod(n, m) { return ((n % m) + m) % m; }

  /* ---------------- Data ---------------- */

  function load() {
    return fetch(DATA_URL, { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) {
        all = (d.videos || []).filter(function (v) { return v && v.vimeo; }).map(function (v) {
          var id = String(v.vimeo);
          return {
            slug: String(v.slug || id), vimeo: id, hash: v.hash || "",
            title: v.title || "", client: v.client || "", category: v.category || "", year: v.year || "",
            description: v.description || "", thumb: v.thumb || "", duration: 0
          };
        });
      });
  }

  function pageUrl(item) { return "https://vimeo.com/" + item.vimeo + (item.hash ? "/" + item.hash : ""); }
  function shownTitle(item) { return item.title || "Film " + String(all.indexOf(item) + 1).padStart(2, "0"); }
  function fmtDuration(sec) {
    sec = Math.round(Number(sec) || 0);
    if (!sec) return "";
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s2 = sec % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s2).padStart(2, "0");
  }

  /* Titles, thumbnails, descriptions and durations from Vimeo's public oEmbed.
     Anything the JSON already gives is kept. A video Vimeo won't describe
     (private, or embedding restricted) still plays; it just keeps a numbered
     title and a plain tile. */
  function loadMeta(item) {
    if (item.title && item.thumb) return Promise.resolve();
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, OEMBED_TIMEOUT) : 0;
    return fetch("https://vimeo.com/api/oembed.json?width=1280&url=" + encodeURIComponent(pageUrl(item)), ctrl ? { signal: ctrl.signal } : {})
      .then(function (r) { if (!r.ok) throw new Error("oEmbed " + r.status); return r.json(); })
      .then(function (d) {
        if (!item.title && d.title) item.title = String(d.title);
        if (!item.thumb && d.thumbnail_url) item.thumb = String(d.thumbnail_url).replace(/_\d+x\d+(?=[.?]|$)/, "_1280x720");
        if (!item.description && d.description) item.description = String(d.description);
        if (!item.client && d.author_name) item.client = String(d.author_name);
        item.duration = Number(d.duration) || 0;
        refreshItem(item);
      })
      .catch(function () { /* keep the plain tile */ })
      .then(function () { clearTimeout(timer); });
  }

  // New details arrived: update every tile of this video (and the open view)
  function refreshItem(item) {
    tiles.forEach(function (t) {
      if (t.item !== item) return;
      if (item.thumb && t.img.getAttribute("src") !== item.thumb) {
        t.img.onload = function () { t.el.querySelector(".vz-tile__media").classList.remove("is-empty"); };
        t.img.src = item.thumb;
      }
      t.el.querySelector(".vz-tile__title").textContent = shownTitle(item);
      t.el.querySelector(".vz-tile__type").textContent = fmtDuration(item.duration) || "Film";
      if (t.el.getAttribute("aria-hidden") !== "true") {
        t.el.setAttribute("aria-label", shownTitle(item) + ", video. Open");
      }
    });
    if (current === item) {
      fillDetail(item);
      if (detailImg && item.thumb && detailImg.getAttribute("src") !== item.thumb) detailImg.src = item.thumb;
    }
  }

  /* ---------------- Grid ---------------- */

  function px(v) { return parseFloat(v) || 0; }

  function build(list) {
    items = list;
    track.innerHTML = "";
    tiles = []; cols = [];
    if (!items.length) return;

    var probe = document.createElement("div");
    probe.style.cssText = "position:absolute;visibility:hidden;width:var(--vz-col);height:var(--vz-gap)";
    track.appendChild(probe);
    colW = probe.offsetWidth; gap = probe.offsetHeight;
    track.removeChild(probe);

    var vw = window.innerWidth, vh = window.innerHeight;
    var step = colW + gap;
    var nCols = Math.ceil(vw / step) + 2;
    setW = nCols * step;

    var seen = {};
    var k = 0;
    for (var c = 0; c < nCols; c++) {
      var col = { x: c * step, h: 0, tiles: [] };
      // Columns start at different points in the list and stagger vertically
      var idx = (c * 3) % items.length;
      var y = 0;
      while (y < vh + 900 || col.tiles.length < 2) {
        var item = items[idx % items.length];
        var ratio = RATIOS[(k + c) % RATIOS.length];
        var t = makeTile(item, ratio, !seen[item.slug]);
        seen[item.slug] = true;
        track.appendChild(t.el);
        t.y = y;
        y += t.el.offsetHeight + gap;
        col.tiles.push(t); tiles.push(t);
        idx++; k++;
        if (col.tiles.length > 60) break;
      }
      col.h = y;
      col.shift = (c % 2) ? -col.tiles[0].el.offsetHeight / 2 : 0;
      cols.push(col);
    }
    $("vz-count").textContent = items.length + (items.length === 1 ? " video" : " videos");
    render();
  }

  function makeTile(item, ratio, primary) {
    var el = document.createElement("button");
    el.type = "button";
    el.className = "vz-tile";
    el.setAttribute("data-slug", item.slug);
    if (primary) {
      el.setAttribute("aria-label", shownTitle(item) + ", video. Open");
    } else {
      // Repeats of a video in the endless grid stay out of the tab order and screen readers
      el.tabIndex = -1;
      el.setAttribute("aria-hidden", "true");
    }
    el.innerHTML =
      '<span class="vz-tile__media' + (item.thumb ? "" : " is-empty") + '" style="aspect-ratio:' + ratio.toFixed(4) + '">' +
        '<img alt="" draggable="false" decoding="async" loading="lazy">' +
        '<span class="vz-tile__badge" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>' +
      "</span>" +
      '<span class="vz-tile__caption" aria-hidden="true">' +
        '<span class="vz-tile__title"></span>' +
        '<span class="vz-tile__type"></span>' +
      "</span>";
    var img = el.querySelector("img");
    img.src = item.thumb || BLANK;
    if (item.thumb) img.onload = function () { el.querySelector(".vz-tile__media").classList.remove("is-empty"); };
    el.querySelector(".vz-tile__title").textContent = shownTitle(item);
    el.querySelector(".vz-tile__type").textContent = fmtDuration(item.duration) || "Film";
    var t = { el: el, img: img, item: item, x: 0, y: 0 };
    el._vz = t;
    return t;
  }

  function render() {
    var step = colW + gap;
    for (var c = 0; c < cols.length; c++) {
      var col = cols[c];
      var x = mod(col.x + offX + step, setW) - step;
      for (var i = 0; i < col.tiles.length; i++) {
        var t = col.tiles[i];
        var y = mod(t.y + col.shift + offY + 400, col.h) - 400;
        t.x = x; t.cy = y;
        t.el.style.transform = "translate3d(" + x.toFixed(1) + "px," + y.toFixed(1) + "px,0)";
      }
    }
  }

  function loop(t) {
    raf = 0;
    var dt = last ? Math.min((t - last) / 1000, 0.05) : 0.016;
    last = t;
    if (!dragging && !locked && (Math.abs(velX) > 2 || Math.abs(velY) > 2)) {
      offX += velX * dt; offY += velY * dt;
      var k = Math.pow(0.06, dt);
      velX *= k; velY *= k;
      render();
      raf = requestAnimationFrame(loop);
    } else {
      last = 0;
    }
  }
  function kick() { if (!raf) raf = requestAnimationFrame(loop); }

  /* Drag / click */
  var dragging = false, downX = 0, downY = 0, lastX = 0, lastY = 0, lastT = 0, moved = 0, downTile = null;

  canvas.addEventListener("pointerdown", function (e) {
    if (locked || (e.button !== undefined && e.button !== 0)) return;
    dragging = true; moved = 0;
    downX = lastX = e.clientX; downY = lastY = e.clientY; lastT = performance.now();
    velX = velY = 0;
    downTile = e.target.closest ? e.target.closest(".vz-tile") : null;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", function (e) {
    if (!dragging) return;
    var now = performance.now(), dt = Math.max((now - lastT) / 1000, 0.001);
    var dx = e.clientX - lastX, dy = e.clientY - lastY;
    moved = Math.max(moved, Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY));
    if (moved > 6) {
      canvas.classList.add("is-dragging");
      hideHint();
    }
    offX += dx; offY += dy;
    velX = 0.8 * (dx / dt) + 0.2 * velX;
    velY = 0.8 * (dy / dt) + 0.2 * velY;
    lastX = e.clientX; lastY = e.clientY; lastT = now;
    render();
  });
  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    canvas.classList.remove("is-dragging");
    if (moved <= 6 && downTile && e.type === "pointerup") {
      open(downTile._vz, true);
      return;
    }
    if (performance.now() - lastT > 90 || reduce) velX = velY = 0;
    kick();
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  // Keyboard "click" on a focused tile (Enter / Space fire click on buttons)
  canvas.addEventListener("click", function (e) {
    if (e.detail !== 0) return;  // real pointer clicks are handled on pointerup
    var t = e.target.closest && e.target.closest(".vz-tile");
    if (t && !locked) open(t._vz, true);
  });

  canvas.addEventListener("wheel", function (e) {
    if (locked) return;
    e.preventDefault();
    var f = e.deltaMode === 1 ? 32 : 1;
    offX -= (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * f;
    offY -= (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * f;
    velX = velY = 0;
    hideHint();
    render();
  }, { passive: false });

  canvas.addEventListener("keydown", function (e) {
    if (locked) return;
    var d = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    if (!d) return;
    e.preventDefault();
    panBy(d[0] * (colW + gap), d[1] * (colW + gap));
  });

  // Tabbing to a tile that is off screen glides it into view
  canvas.addEventListener("focusin", function (e) {
    var t = e.target._vz;
    if (!t) return;
    var vw = window.innerWidth, vh = window.innerHeight, h = t.el.offsetHeight;
    var dx = 0, dy = 0;
    if (t.x < 24) dx = 24 - t.x; else if (t.x + colW > vw - 24) dx = vw - 24 - colW - t.x;
    var top = (window.innerHeight > 500 ? 90 : 70), bottom = vh - 80;
    if (t.cy < top) dy = top - t.cy; else if (t.cy + h > bottom) dy = bottom - h - t.cy;
    if (dx || dy) panBy(dx, dy);
  });

  function panBy(dx, dy) {
    var g = G();
    velX = velY = 0;
    if (!g || reduce) { offX += dx; offY += dy; render(); return; }
    var o = { x: offX, y: offY };
    g.to(o, { x: offX + dx, y: offY + dy, duration: 0.6, ease: "power3.out", onUpdate: function () { offX = o.x; offY = o.y; render(); } });
  }

  function hideHint() {
    var h = document.querySelector(".vz-hud__hint");
    if (h) h.classList.add("is-gone");
  }

  /* ---------------- Detail (Flip) ---------------- */

  function fillDetail(item) {
    var meta = [item.client, item.category, fmtDuration(item.duration), item.year].filter(Boolean);
    var metaEl = $("vz-detail-meta");
    metaEl.innerHTML = meta.map(function () { return "<span></span>"; }).join("");
    metaEl.querySelectorAll("span").forEach(function (sp, i) { sp.textContent = meta[i]; });
    $("vz-detail-title").textContent = shownTitle(item);
    $("vz-detail-desc").textContent = item.description || "";
    var link = $("vz-detail-vimeo");
    link.href = pageUrl(item);
    var i = all.indexOf(item);
    $("vz-index").textContent = String(i + 1).padStart(2, "0") + " / " + String(all.length).padStart(2, "0");
  }

  function newDetailImg(item) {
    var img = document.createElement("img");
    img.src = item.thumb || BLANK;
    img.alt = "";
    img.decoding = "async";
    return img;
  }

  function visibleTileFor(item) {
    var vw = window.innerWidth, vh = window.innerHeight, best = null, bestScore = -1;
    tiles.forEach(function (t) {
      if (t.item !== item) return;
      var r = t.img.getBoundingClientRect();
      var w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
      var h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
      if (w * h > bestScore) { bestScore = w * h; best = t; }
    });
    return bestScore > 0 ? best : null;
  }

  function open(tile, push) {
    var item = tile ? tile.item : null;
    if (!item || current || closing) return;
    current = item; source = tile; locked = true;
    velX = velY = 0;
    lastFocus = document.activeElement;
    fillDetail(item);
    detailMedia.innerHTML = "";
    detailImg = newDetailImg(item);
    detailMedia.appendChild(detailImg);
    detail.hidden = false;
    document.body.classList.add("vz-detail-open");
    if (push) { history.pushState({ vz: item.slug }, "", "?p=" + encodeURIComponent(item.slug)); pushed = true; }

    var g = G(), flip = F();
    if (g && flip && tile.img && !reduce) {
      tile.img.setAttribute("data-flip-id", "vz-open");
      detailImg.setAttribute("data-flip-id", "vz-open");
      var state = flip.getState(tile.img, { props: "borderRadius" });
      tile.img.style.visibility = "hidden";
      detailImg.style.borderRadius = "0px";
      flip.from(state, {
        targets: detailImg,
        duration: 0.95,
        ease: "expo.inOut",
        scale: false,
        absolute: true,
        zIndex: 1,
        onComplete: function () {
          tile.img.style.visibility = "";
          tile.img.removeAttribute("data-flip-id");
          detailImg.removeAttribute("data-flip-id");
          g.set(detailImg, { clearProps: "all" });
        }
      });
      g.fromTo(shade, { opacity: 0 }, { opacity: 1, duration: 0.6, delay: 0.35, ease: "power2.out" });
      g.fromTo([content.children, dnav], { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.8, delay: 0.55, stagger: 0.06, ease: "expo.out" });
      g.fromTo("#vz-detail-close", { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.5, delay: 0.6, ease: "back.out(2)" });
    } else if (g) {
      g.fromTo(detail, { opacity: 0 }, { opacity: 1, duration: dur(0.35) });
    }
    setTimeout(function () { $("vz-detail-close").focus({ preventScroll: true }); }, reduce ? 0 : 600);
  }

  function openBySlug(slug) {
    var item = all.filter(function (it) { return it.slug === slug; })[0];
    if (!item) return;
    if (current) { swapTo(item, false); return; }
    var tile = visibleTileFor(item) || { item: item, img: null };
    open(tile, false);
  }

  function close(pop) {
    if (!current || closing) return;
    closing = true;
    closeLightboxes();
    var item = current, g = G(), flip = F();
    var tile = (source && source.item === item && source.img && source.img.isConnected) ? source : visibleTileFor(item);
    // Step back only over the entry we added; a film opened from a direct link
    // has nothing of ours behind it (back would leave the site), so just clean the URL.
    if (!pop) {
      if (pushed) history.back();
      else history.replaceState(null, "", location.pathname);
    }
    pushed = false;

    function done() {
      detail.hidden = true;
      detailMedia.innerHTML = "";
      document.body.classList.remove("vz-detail-open");
      if (g) g.set([detail, shade, content.children, dnav, "#vz-detail-close"], { clearProps: "opacity,transform" });
      current = null; source = null; locked = false; closing = false;
      var f = tile && tile.el && tile.el.tabIndex === 0 ? tile.el : (lastFocus && lastFocus.isConnected ? lastFocus : canvas);
      if (f && f.focus) f.focus({ preventScroll: true });
    }

    if (g && flip && tile && detailImg && !reduce) {
      g.to([content.children, dnav, "#vz-detail-close"], { opacity: 0, y: 20, duration: 0.25, ease: "power2.in" });
      g.to(shade, { opacity: 0, duration: 0.5, delay: 0.15 });
      // Fly a copy from full screen back down onto the tile
      var r = tile.img.getBoundingClientRect();
      var fly = document.createElement("img");
      fly.src = detailImg.currentSrc || detailImg.src;
      fly.alt = "";
      fly.className = "vz-fly";
      fly.style.cssText = "position:fixed;z-index:1250;object-fit:cover;pointer-events:none;left:" + r.left + "px;top:" + r.top + "px;width:" + r.width + "px;height:" + r.height + "px;border-radius:6px";
      detailImg.setAttribute("data-flip-id", "vz-close");
      fly.setAttribute("data-flip-id", "vz-close");
      var state = flip.getState(detailImg, { props: "borderRadius" });
      document.body.appendChild(fly);
      tile.img.style.visibility = "hidden";
      detailMedia.style.visibility = "hidden";
      flip.from(state, {
        targets: fly,
        duration: 0.85,
        ease: "expo.inOut",
        scale: false,
        delay: 0.1,
        onComplete: function () {
          tile.img.style.visibility = "";
          detailMedia.style.visibility = "";
          fly.remove();
          done();
        }
      });
    } else if (g) {
      g.to(detail, { opacity: 0, duration: dur(0.3), onComplete: done });
    } else {
      done();
    }
  }

  // Prev / next inside the detail view: cross-fade to the neighbour
  function swapTo(item, push) {
    if (!item || item === current) return;
    current = item;
    source = visibleTileFor(item);
    if (push) history.replaceState({ vz: item.slug }, "", "?p=" + encodeURIComponent(item.slug));
    var g = G();
    var next = newDetailImg(item);
    var prev = detailImg;
    detailImg = next;
    if (g && !reduce) {
      g.to(content.children, { opacity: 0, y: -16, duration: 0.2, ease: "power2.in", onComplete: function () {
        fillDetail(item);
        g.fromTo(content.children, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.05, ease: "expo.out" });
      } });
      next.style.opacity = "0";
      detailMedia.appendChild(next);
      g.fromTo(next, { opacity: 0, scale: 1.06 }, { opacity: 1, scale: 1, duration: 0.7, ease: "power2.out", onComplete: function () { if (prev) prev.remove(); } });
    } else {
      fillDetail(item);
      detailMedia.innerHTML = "";
      detailMedia.appendChild(next);
    }
  }

  function step(dir) {
    if (!current) return;
    var i = all.indexOf(current);
    swapTo(all[mod(i + dir, all.length)], true);
  }

  $("vz-detail-close").addEventListener("click", function () { close(false); });
  $("vz-prev").addEventListener("click", function () { step(-1); });
  $("vz-next").addEventListener("click", function () { step(1); });
  $("vz-play").addEventListener("click", function () {
    if (current) openVideo(current);
  });

  window.addEventListener("popstate", function () {
    if (closing) return;
    var slug = new URLSearchParams(location.search).get("p");
    if (slug) openBySlug(slug);
    else close(true);
  });

  /* ---------------- Lightboxes ---------------- */

  var activeBox = null, boxReturn = null;

  function showBox(box) {
    activeBox = box;
    boxReturn = document.activeElement;
    box.hidden = false;
    var g = G();
    if (g) {
      g.fromTo(box, { opacity: 0 }, { opacity: 1, duration: dur(0.35), ease: "power2.out" });
      var inner = box.querySelector(".vz-lightbox__frame");
      if (inner) g.fromTo(inner, { scale: 0.94, y: 20 }, { scale: 1, y: 0, duration: dur(0.6), ease: "expo.out" });
    }
    setTimeout(function () { var c = box.querySelector("[data-close]"); if (c) c.focus({ preventScroll: true }); }, 30);
  }

  function hideBox(box, after) {
    var g = G();
    function fin() {
      box.hidden = true;
      if (after) after();
      if (activeBox === box) activeBox = null;
      if (boxReturn && boxReturn.focus) boxReturn.focus({ preventScroll: true });
    }
    if (g && !reduce) g.to(box, { opacity: 0, duration: 0.25, onComplete: fin });
    else fin();
  }

  function closeLightboxes() {
    if (!videoBox.hidden) hideBox(videoBox, function () { $("vz-video-frame").innerHTML = ""; });
  }

  function openVideo(item) {
    var frame = $("vz-video-frame");
    frame.innerHTML = "";
    var q = (item.hash ? "h=" + encodeURIComponent(item.hash) + "&" : "") + "autoplay=1&title=0&byline=0&portrait=0&dnt=1";
    var ifr = document.createElement("iframe");
    ifr.src = "https://player.vimeo.com/video/" + encodeURIComponent(item.vimeo) + "?" + q;
    ifr.allow = "autoplay; fullscreen; picture-in-picture";
    ifr.allowFullscreen = true;
    ifr.title = shownTitle(item) + " (Vimeo)";
    frame.appendChild(ifr);
    videoBox.setAttribute("aria-label", shownTitle(item) + ": video");
    showBox(videoBox);
  }

  videoBox.querySelector("[data-close]").addEventListener("click", function () {
    hideBox(videoBox, function () { $("vz-video-frame").innerHTML = ""; });
  });
  videoBox.addEventListener("click", function (e) {
    if (e.target === videoBox) hideBox(videoBox, function () { $("vz-video-frame").innerHTML = ""; });
  });

  /* ---------------- Keyboard: Esc, arrows, focus trap ---------------- */

  document.addEventListener("keydown", function (e) {
    var top = activeBox && !activeBox.hidden ? activeBox : (current ? detail : null);
    if (!top) return;
    if (e.key === "Escape") {
      e.preventDefault();
      if (top === videoBox) hideBox(videoBox, function () { $("vz-video-frame").innerHTML = ""; });
      else close(false);
      return;
    }
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      var d = e.key === "ArrowRight" ? 1 : -1;
      if (top === detail && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); step(d); }
      return;
    }
    if (e.key === "Tab") {
      var f = Array.prototype.filter.call(top.querySelectorAll("button, a[href], iframe, video"), function (el) {
        return !el.hidden && el.offsetParent !== null;
      });
      if (!f.length) return;
      var first = f[0], lastEl = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
    }
  });

  /* ---------------- Boot ---------------- */

  var resizeT = 0;
  window.addEventListener("resize", function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () { build(all); }, 150);
  });

  function boot() {
    build(all);
    var g = G();
    if (g && !reduce) {
      g.from(tiles.map(function (t) { return t.el; }), {
        opacity: 0, scale: 0.92, duration: 0.9, ease: "expo.out",
        stagger: { each: 0.012, from: "center" }
      });
    }
    all.forEach(loadMeta);
    var slug = new URLSearchParams(location.search).get("p");
    if (slug) {
      history.replaceState({ vz: slug }, "", location.href);
      openBySlug(slug);
    }
  }

  load().then(function () {
    if (window.gsap && window.Flip) window.gsap.registerPlugin(window.Flip);
    boot();
  }).catch(function () {
    $("vz-count").textContent = "";
    track.innerHTML = '<p class="vz-noscript">Couldn\'t load the videos. <a href="case-studies.html">See our case studies</a>.</p>';
  });
})();
