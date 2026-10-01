/**
 * Video gallery double slider — SketchzLab-style synced main + sub tracks,
 * spinning dashed rings, keyboard/swipe, dialog lightbox with lazy Vimeo embeds.
 */
(function () {
  const DATA_URL = "data/videos.json";
  const AUTO_MS = 4000;
  const SLIDE_MS = 500;

  const mount = document.getElementById("vs-mount");
  const fallback = document.getElementById("vs-fallback");
  if (!mount) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let videos = [];
  let index = 0;
  let autoTimer = null;
  let autoRemaining = AUTO_MS;
  let autoStartedAt = 0;
  let autoPaused = false;
  let lightboxOpen = false;
  let lastPlayBtn = null;
  let touchStartX = 0;
  let touchStartY = 0;
  let animating = false;

  const els = {
    status: null,
    track: null,
    subTrack: null,
    previewBtn: null,
    dots: null,
    prevBtn: null,
    nextBtn: null,
    lightbox: null,
    frame: null,
    lightTitle: null,
    lightLink: null,
  };

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/'/g, "&#39;");
  }

  function largeThumb(url) {
    if (!url) return "";
    return String(url)
      .replace(/_(\d+)x(\d+)/, "_1920x1080")
      .replace(/_(\d+)(?!\d)/, "_1920");
  }

  function vimeoPageUrl(video) {
    const base = `https://vimeo.com/${video.id}`;
    return video.hash ? `${base}/${video.hash}` : base;
  }

  function vimeoEmbedUrl(video) {
    const params = new URLSearchParams({
      autoplay: "1",
      title: "0",
      byline: "0",
      portrait: "0",
      dnt: "1",
    });
    if (video.hash) params.set("h", video.hash);
    return `https://player.vimeo.com/video/${video.id}?${params.toString()}`;
  }

  function formatDuration(sec) {
    const s = Number(sec) || 0;
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  }

  function showFallback(message) {
    mount.hidden = true;
    if (fallback) {
      fallback.hidden = false;
      if (message) {
        const p = fallback.querySelector("[data-vs-fallback-msg]");
        if (p) p.textContent = message;
      }
    }
  }

  function buildShell() {
    mount.innerHTML = `
      <div class="vs-status" data-vs-status role="status">Loading videos…</div>
      <div class="vs-main" aria-roledescription="carousel" aria-label="SWFT video gallery">
        <div class="vs-main-track" data-vs-track></div>
      </div>
      <div class="vs-funtext" aria-hidden="true"><span>SWFT VIDEOS</span></div>
      <div class="vs-second">
        <div class="vs-controls">
          <button type="button" class="vs-nav-btn" data-vs-prev aria-label="Previous video">
            <span class="vs-nav-circle" aria-hidden="true"></span>
            <span class="vs-nav-spin" aria-hidden="true"></span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button type="button" class="vs-nav-btn" data-vs-next aria-label="Next video">
            <span class="vs-nav-circle" aria-hidden="true"></span>
            <span class="vs-nav-spin" aria-hidden="true"></span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
        <div class="vs-sub" aria-hidden="true">
          <div class="vs-sub-track" data-vs-sub-track></div>
        </div>
      </div>
      <div class="vs-dots" data-vs-dots role="tablist" aria-label="Select video"></div>
      <dialog class="vs-lightbox" data-vs-lightbox aria-label="Video player">
        <div class="vs-lightbox-inner">
          <div class="vs-lightbox-frame" data-vs-frame></div>
          <div class="vs-lightbox-bar">
            <p class="vs-lightbox-title" data-vs-light-title></p>
            <div class="vs-lightbox-actions">
              <a class="vs-lightbox-link" data-vs-light-link href="#" target="_blank" rel="noopener noreferrer">Watch on Vimeo</a>
              <button type="button" class="vs-lightbox-close" data-vs-close>Close</button>
            </div>
          </div>
        </div>
      </dialog>
    `;

    els.status = mount.querySelector("[data-vs-status]");
    els.track = mount.querySelector("[data-vs-track]");
    els.subTrack = mount.querySelector("[data-vs-sub-track]");
    els.dots = mount.querySelector("[data-vs-dots]");
    els.prevBtn = mount.querySelector("[data-vs-prev]");
    els.nextBtn = mount.querySelector("[data-vs-next]");
    els.lightbox = mount.querySelector("[data-vs-lightbox]");
    els.frame = mount.querySelector("[data-vs-frame]");
    els.lightTitle = mount.querySelector("[data-vs-light-title]");
    els.lightLink = mount.querySelector("[data-vs-light-link]");
  }

  function buildSlides() {
    els.track.innerHTML = videos
      .map((video, i) => {
        const bg = largeThumb(video.thumbnail);
        const category = video.category
          ? `<span class="vs-category">${escapeHtml(video.category)}</span>`
          : "";
        const desc = video.description
          ? `<p class="vs-desc">${escapeHtml(video.description)}</p>`
          : "";
        const dur = video.duration ? ` (${formatDuration(video.duration)})` : "";
        return `
          <article class="vs-slide${i === 0 ? " is-active" : ""}" data-vs-slide="${i}"
            aria-hidden="${i === 0 ? "false" : "true"}" aria-roledescription="slide"
            aria-label="${escapeAttr(video.title)}${escapeAttr(dur)}">
            <div class="vs-slide-bg" style="--vs-bg: url('${escapeAttr(bg)}')"></div>
            <div class="vs-slide-content">
              <div class="vs-slide-copy">
                ${category}
                <h2 class="vs-title">${escapeHtml(video.title)}</h2>
                ${desc}
              </div>
              <button type="button" class="vs-play" data-vs-play="${i}" aria-label="Play ${escapeAttr(video.title)}">
                <span class="vs-play-label">Play ${escapeHtml(video.title)}</span>
                <span class="vs-play-frame" aria-hidden="true"></span>
                <span class="vs-play-spin" aria-hidden="true"></span>
                <svg class="vs-play-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
              </button>
            </div>
          </article>
        `;
      })
      .join("");

    // Sub track: each card shows the *next* video relative to that main index
    els.subTrack.innerHTML = videos
      .map((_, i) => {
        const next = videos[nextIndex(i)];
        const thumb = next.thumbnail || "";
        return `
          <div class="vs-sub-slide" data-vs-sub="${i}">
            <button type="button" class="vs-sub-card" data-vs-preview
              style="--vs-bg: url('${escapeAttr(thumb)}')"
              aria-label="Next: ${escapeAttr(next.title)}. Go to next video.">
              <span class="vs-sub-title">${escapeHtml(next.title)}</span>
            </button>
          </div>
        `;
      })
      .join("");

    els.dots.innerHTML = videos
      .map(
        (video, i) => `
        <button type="button" class="vs-dot${i === 0 ? " is-active" : ""}" data-vs-dot="${i}"
          role="tab" aria-selected="${i === 0 ? "true" : "false"}"
          aria-label="Go to ${escapeAttr(video.title)}"></button>
      `
      )
      .join("");

    applyTransforms(false);
  }

  function nextIndex(from) {
    return (from + 1) % videos.length;
  }

  function prevIndex(from) {
    return (from - 1 + videos.length) % videos.length;
  }

  function applyTransforms(animate) {
    const duration = animate && !reducedMotion ? `${SLIDE_MS}ms` : "0ms";
    els.track.style.transitionDuration = duration;
    els.subTrack.style.transitionDuration = duration;
    const x = `translate3d(${-index * 100}%, 0, 0)`;
    els.track.style.transform = x;
    els.subTrack.style.transform = x;
  }

  function clearAuto() {
    if (autoTimer) {
      clearTimeout(autoTimer);
      autoTimer = null;
    }
  }

  function scheduleAuto(delay) {
    clearAuto();
    if (reducedMotion || lightboxOpen || videos.length < 2) return;
    autoRemaining = typeof delay === "number" ? delay : AUTO_MS;
    autoStartedAt = performance.now();
    autoPaused = false;
    autoTimer = setTimeout(() => {
      goTo(nextIndex(index));
    }, autoRemaining);
  }

  function pauseAuto() {
    if (autoPaused || reducedMotion || !autoTimer) return;
    autoPaused = true;
    autoRemaining = Math.max(0, AUTO_MS - (performance.now() - autoStartedAt));
    clearAuto();
  }

  function resumeAuto() {
    if (lightboxOpen || document.hidden || reducedMotion) return;
    if (!autoPaused && autoTimer) return;
    scheduleAuto(autoRemaining > 0 ? autoRemaining : AUTO_MS);
  }

  function goTo(i, { restartAuto = true } = {}) {
    if (!videos.length || animating) return;
    const next = ((i % videos.length) + videos.length) % videos.length;
    if (next === index && restartAuto) {
      scheduleAuto(AUTO_MS);
      return;
    }

    index = next;
    animating = !reducedMotion;
    applyTransforms(true);

    mount.querySelectorAll("[data-vs-slide]").forEach((slide) => {
      const active = Number(slide.dataset.vsSlide) === index;
      slide.classList.toggle("is-active", active);
      slide.setAttribute("aria-hidden", active ? "false" : "true");
    });

    mount.querySelectorAll("[data-vs-dot]").forEach((dot) => {
      const active = Number(dot.dataset.vsDot) === index;
      dot.classList.toggle("is-active", active);
      dot.setAttribute("aria-selected", active ? "true" : "false");
    });

    if (animating) {
      window.setTimeout(() => {
        animating = false;
      }, SLIDE_MS);
    }

    autoRemaining = AUTO_MS;
    if (restartAuto) scheduleAuto(AUTO_MS);
  }

  function destroyIframe() {
    if (!els.frame) return;
    els.frame.innerHTML = "";
  }

  function openLightbox(i, trigger) {
    const video = videos[i];
    if (!video || !els.lightbox) return;
    lastPlayBtn = trigger || null;
    lightboxOpen = true;
    pauseAuto();

    const portrait = video.aspect === "9:16";
    els.frame.classList.toggle("is-portrait", portrait);
    els.frame.innerHTML = `<iframe
      src="${escapeAttr(vimeoEmbedUrl(video))}"
      title="${escapeAttr(video.title)}"
      allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
      allowfullscreen
      referrerpolicy="strict-origin-when-cross-origin"
    ></iframe>`;
    els.lightTitle.textContent = video.title || "";
    els.lightLink.href = vimeoPageUrl(video);

    if (typeof els.lightbox.showModal === "function") {
      els.lightbox.showModal();
    } else {
      els.lightbox.setAttribute("open", "");
    }
  }

  function closeLightbox() {
    if (!els.lightbox) return;
    if (typeof els.lightbox.close === "function" && els.lightbox.open) {
      els.lightbox.close();
    } else {
      els.lightbox.removeAttribute("open");
    }
    destroyIframe();
    lightboxOpen = false;
    if (lastPlayBtn && typeof lastPlayBtn.focus === "function") {
      lastPlayBtn.focus();
    }
    resumeAuto();
  }

  function onKeydown(e) {
    if (lightboxOpen) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      goTo(nextIndex(index));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      goTo(prevIndex(index));
    }
  }

  function bindEvents() {
    els.prevBtn.addEventListener("click", () => goTo(prevIndex(index)));
    els.nextBtn.addEventListener("click", () => goTo(nextIndex(index)));

    els.subTrack.addEventListener("click", (e) => {
      const card = e.target.closest("[data-vs-preview]");
      if (!card) return;
      goTo(nextIndex(index));
    });

    els.dots.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-vs-dot]");
      if (!btn) return;
      goTo(Number(btn.dataset.vsDot));
    });

    els.track.addEventListener("click", (e) => {
      const play = e.target.closest("[data-vs-play]");
      if (!play) return;
      openLightbox(Number(play.dataset.vsPlay), play);
    });

    mount.querySelector("[data-vs-close]").addEventListener("click", closeLightbox);
    els.lightbox.addEventListener("close", () => {
      destroyIframe();
      lightboxOpen = false;
      resumeAuto();
    });
    els.lightbox.addEventListener("cancel", (e) => {
      e.preventDefault();
      closeLightbox();
    });

    const pauseTargets = [els.prevBtn, els.nextBtn, els.dots, els.subTrack];
    pauseTargets.forEach((el) => {
      if (!el) return;
      el.addEventListener("mouseenter", pauseAuto);
      el.addEventListener("mouseleave", resumeAuto);
      el.addEventListener("focusin", pauseAuto);
      el.addEventListener("focusout", (e) => {
        if (!el.contains(e.relatedTarget)) resumeAuto();
      });
    });

    els.track.addEventListener("mouseover", (e) => {
      if (e.target.closest("[data-vs-play]")) pauseAuto();
    });
    els.track.addEventListener("mouseout", (e) => {
      if (e.target.closest("[data-vs-play]") && !e.relatedTarget?.closest("[data-vs-play]")) {
        resumeAuto();
      }
    });
    els.track.addEventListener("focusin", (e) => {
      if (e.target.closest("[data-vs-play]")) pauseAuto();
    });
    els.track.addEventListener("focusout", (e) => {
      if (!e.relatedTarget || !els.track.contains(e.relatedTarget)) resumeAuto();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) pauseAuto();
      else resumeAuto();
    });

    document.addEventListener("keydown", onKeydown);

    mount.addEventListener(
      "touchstart",
      (e) => {
        if (!e.changedTouches || !e.changedTouches[0]) return;
        touchStartX = e.changedTouches[0].clientX;
        touchStartY = e.changedTouches[0].clientY;
      },
      { passive: true }
    );

    mount.addEventListener(
      "touchend",
      (e) => {
        if (lightboxOpen || !e.changedTouches || !e.changedTouches[0]) return;
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
        if (dx < 0) goTo(nextIndex(index));
        else goTo(prevIndex(index));
      },
      { passive: true }
    );
  }

  function populateStaticFallback() {
    if (!fallback) return;
    const list = fallback.querySelector("[data-vs-fallback-list]");
    if (!list || !videos.length) return;
    list.innerHTML = videos
      .map(
        (v) =>
          `<li><a href="${escapeAttr(vimeoPageUrl(v))}" target="_blank" rel="noopener noreferrer">${escapeHtml(v.title)}</a></li>`
      )
      .join("");
  }

  async function init() {
    buildShell();
    try {
      const res = await fetch(DATA_URL, { credentials: "same-origin" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      videos = Array.isArray(data.videos) ? data.videos.filter((v) => v && v.id) : [];
      if (!videos.length) throw new Error("No videos in data/videos.json");
    } catch (err) {
      console.error("[video-slider] Failed to load videos:", err);
      if (els.status) {
        els.status.hidden = false;
        els.status.classList.add("is-error");
        els.status.textContent = "Couldn’t load the video gallery.";
      }
      showFallback("Couldn’t load the video gallery. Watch on Vimeo instead:");
      return;
    }

    populateStaticFallback();
    buildSlides();
    bindEvents();
    if (els.status) els.status.hidden = true;
    scheduleAuto(AUTO_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
