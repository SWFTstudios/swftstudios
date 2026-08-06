# Changelog

## 2026-08-06 — Vimeo hero + intro loader

### Changed
- Replaced the Spline 3D hero background with a muted autoplay/loop Vimeo embed (`1216244886` — “NYC View”) on:
  - `index.html`, `websites.html`, `apps.html`, `media.html`, `resources.html`, `swft-tv.html`, `videos.html`
- Added a site intro loader (SWFT wordmark + progress bar + %) that stays up until the Vimeo player is ready, so visitors never see the Vimeo buffering UI.

### Added
- [`css/hero-vimeo-loader.css`](../css/hero-vimeo-loader.css) — cover iframe styles + loader UI
- [`js/hero-vimeo-loader.js`](../js/hero-vimeo-loader.js) — Vimeo Player API gating, soft timeout, connection/reduced-motion fallbacks
- [`images/hero-nyc-view-still.jpg`](../images/hero-nyc-view-still.jpg) — local still from the Vimeo thumbnail for offline / slow / reduced-motion paths

### Removed
- Unused Webflow `page-loader_component` markup and GSAP fake-progress preloader script on `index.html` (was wrapped in `.hide` / `display: none`)

### Fallback behavior
- Offline, Save-Data, `2g` / `slow-2g`, or `prefers-reduced-motion`: skip iframe, show still, dismiss loader quickly
- Soft timeout (~8s): show still and reveal the page
