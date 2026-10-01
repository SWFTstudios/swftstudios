/* Video gallery — double slider.
   Two synced sliders: a large stage (one video at a time, plays inline) and a
   thumbnail rail. A caption track moves vertically in step with them.
   Videos are hosted on Vimeo; titles and thumbnails come from Vimeo's public
   oEmbed endpoint at load time, so nothing here needs updating when a title
   changes on Vimeo. To add a video, add its id (and hash for unlisted videos). */
(function () {
  "use strict";

  // `hash` is the private-link key for unlisted videos (the part after the id
  // in vimeo.com/<id>/<hash>). Public videos leave it out.
  var VIDEOS = [
    { id: "1174189190", hash: "65b57ab239" },
    { id: "1174180245", hash: "8eb63b9ca8" },
    { id: "1174158034", hash: "c80e23ac22" },
    { id: "560930257", hash: "6815e3ec74" },
    { id: "644113323", hash: "81bf60a904" },
    { id: "758129469", hash: "ddf3e2edba" },
    { id: "658023657" },
    { id: "482515388" },
    { id: "446756609" },
    { id: "1019207124" },
    { id: "589028712", hash: "9f3505de73" },
    { id: "589026463", hash: "1c61253b73" },
    { id: "1066971784" }
  ];

  var root = document.querySelector(".vg");
  if (!root) return;

  var stage = root.querySelector("[data-vg-stage]");
  var stageTrack = root.querySelector("[data-vg-stage-track]");
  var railTrack = root.querySelector("[data-vg-rail-track]");
  var captionTrack = root.querySelector("[data-vg-caption-track]");
  var currentEl = root.querySelector("[data-vg-current]");
  var totalEl = root.querySelector("[data-vg-total]");
  var progressEl = root.querySelector("[data-vg-progress]");
  var prevBtn = root.querySelector("[data-vg-prev]");
  var nextBtn = root.querySelector("[data-vg-next]");

  var count = VIDEOS.length;
  var index = 0;
  var slides = [];
  var thumbs = [];
  var captions = [];

  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function pageUrl(v) {
    return "https://vimeo.com/" + v.id + (v.hash ? "/" + v.hash : "");
  }

  function playerUrl(v) {
    var params = "autoplay=1&title=0&byline=0&portrait=0&dnt=1";
    return "https://player.vimeo.com/video/" + v.id + "?" + (v.hash ? "h=" + v.hash + "&" : "") + params;
  }

  function el(tag, cls, html) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html != null) node.innerHTML = html;
    return node;
  }

  /* ---------- Build ---------- */

  VIDEOS.forEach(function (v, i) {
    var label = "Video " + (i + 1);

    // Stage slide
    var slide = el("div", "vg-slide");
    slide.setAttribute("role", "group");
    slide.setAttribute("aria-roledescription", "slide");
    slide.setAttribute("aria-label", (i + 1) + " of " + count);
    var media = el("button", "vg-slide-media");
    media.type = "button";
    media.setAttribute("aria-label", "Play " + label);
    media.innerHTML =
      '<span class="vg-slide-poster" aria-hidden="true"></span>' +
      '<span class="vg-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>';
    slide.appendChild(media);
    stageTrack.appendChild(slide);

    media.addEventListener("click", function () {
      if (dragMoved) return;
      if (i !== index) goTo(i);
      else play(i);
    });

    // Rail thumb
    var thumb = el("button", "vg-thumb");
    thumb.type = "button";
    thumb.setAttribute("role", "tab");
    thumb.setAttribute("aria-label", label);
    thumb.innerHTML =
      '<span class="vg-thumb-img" aria-hidden="true"></span>' +
      '<span class="vg-thumb-num">' + pad(i + 1) + "</span>";
    thumb.addEventListener("click", function () {
      goTo(i);
    });
    railTrack.appendChild(thumb);

    // Caption
    var cap = el("div", "vg-caption-item");
    cap.innerHTML =
      '<span class="vg-caption-title">' + label + "</span>" +
      '<a class="vg-caption-link" href="' + pageUrl(v) + '" target="_blank" rel="noopener noreferrer">Watch on Vimeo &#8599;</a>';
    captionTrack.appendChild(cap);

    slides.push({ slide: slide, media: media });
    thumbs.push(thumb);
    captions.push(cap);
  });

  totalEl.textContent = pad(count);

  /* ---------- Metadata from Vimeo oEmbed ---------- */

  function applyMeta(i, data) {
    var title = data.title || "Video " + (i + 1);
    var thumb = data.thumbnail_url || "";
    // oEmbed returns a small thumbnail; ask the CDN for a larger rendition.
    var big = thumb.replace(/_\d+x\d+(\.\w+)?$/, "_1280x720$1");
    var small = thumb.replace(/_\d+x\d+(\.\w+)?$/, "_640x360$1");

    if (big) slides[i].media.querySelector(".vg-slide-poster").style.backgroundImage = "url('" + big + "')";
    if (small) thumbs[i].querySelector(".vg-thumb-img").style.backgroundImage = "url('" + small + "')";
    slides[i].media.setAttribute("aria-label", "Play " + title);
    thumbs[i].setAttribute("aria-label", title);
    captions[i].querySelector(".vg-caption-title").textContent = title;
  }

  VIDEOS.forEach(function (v, i) {
    fetch("https://vimeo.com/api/oembed.json?width=1280&url=" + encodeURIComponent(pageUrl(v)))
      .then(function (r) {
        if (!r.ok) throw new Error("oEmbed " + r.status);
        return r.json();
      })
      .then(function (data) {
        applyMeta(i, data);
      })
      .catch(function () {
        // Embedding may be restricted for this video; keep the numbered fallback.
        slides[i].slide.classList.add("is-nometa");
      });
  });

  /* ---------- Playback ---------- */

  function stop(i) {
    var frame = slides[i].slide.querySelector("iframe");
    if (frame) frame.remove();
    slides[i].slide.classList.remove("is-playing");
  }

  function play(i) {
    if (slides[i].slide.classList.contains("is-playing")) return;
    var frame = document.createElement("iframe");
    frame.className = "vg-frame";
    frame.src = playerUrl(VIDEOS[i]);
    frame.title = captions[i].querySelector(".vg-caption-title").textContent;
    frame.allow = "autoplay; fullscreen; picture-in-picture";
    frame.allowFullscreen = true;
    slides[i].slide.appendChild(frame);
    slides[i].slide.classList.add("is-playing");
  }

  /* ---------- Layout ---------- */

  function layout() {
    // Stage: centre the active slide; neighbours peek in at the sides.
    var slideW = slides[0].slide.offsetWidth;
    var gap = parseFloat(getComputedStyle(stageTrack).columnGap) || 0;
    var offset = (stage.clientWidth - slideW) / 2 - index * (slideW + gap);
    stageTrack.style.transform = "translate3d(" + offset + "px,0,0)";

    // Rail: keep the active thumb centred, clamped to the rail's ends.
    var t = thumbs[index];
    var view = railTrack.clientWidth;
    var max = Math.max(0, railTrack.scrollWidth - view);
    var x = t.offsetLeft - (view - t.offsetWidth) / 2;
    x = Math.min(max, Math.max(0, x));
    railTrack.style.transform = "translate3d(" + -x + "px,0,0)";

    // Caption: one line tall, slides vertically.
    var h = captions[0].offsetHeight;
    captionTrack.style.transform = "translate3d(0," + -index * h + "px,0)";
  }

  function goTo(i) {
    i = (i + count) % count;
    if (i !== index) stop(index);
    index = i;

    slides.forEach(function (s, n) {
      s.slide.classList.toggle("is-active", n === index);
      s.slide.setAttribute("aria-hidden", n === index ? "false" : "true");
    });
    thumbs.forEach(function (t, n) {
      t.classList.toggle("is-active", n === index);
      t.setAttribute("aria-selected", n === index ? "true" : "false");
    });
    captions.forEach(function (c, n) {
      c.classList.toggle("is-active", n === index);
    });

    currentEl.textContent = pad(index + 1);
    progressEl.style.transform = "scaleX(" + (index + 1) / count + ")";
    layout();
  }

  prevBtn.addEventListener("click", function () { goTo(index - 1); });
  nextBtn.addEventListener("click", function () { goTo(index + 1); });

  root.addEventListener("keydown", function (e) {
    if (e.target.closest && e.target.closest("iframe")) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); goTo(index - 1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); goTo(index + 1); }
  });

  /* ---------- Drag / swipe on the stage ---------- */

  var dragStartX = null;
  var dragMoved = false;

  stage.addEventListener("pointerdown", function (e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragStartX = e.clientX;
    dragMoved = false;
  });

  window.addEventListener("pointerup", function (e) {
    if (dragStartX === null) return;
    var dx = e.clientX - dragStartX;
    dragStartX = null;
    if (Math.abs(dx) > 50) {
      dragMoved = true;
      goTo(dx < 0 ? index + 1 : index - 1);
      // Swallow the click that follows a swipe.
      setTimeout(function () { dragMoved = false; }, 0);
    }
  });

  var resizeRaf = 0;
  window.addEventListener("resize", function () {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(layout);
  });

  root.classList.add("is-ready");
  goTo(0);
})();
