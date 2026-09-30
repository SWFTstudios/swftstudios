# SWFT × ARAISE theme (branch `swft-araise-2027`)

Hand-rebuilt marketing chrome inspired by the ARAISE Webflow aesthetic. Not a Webflow template import — custom HTML/CSS/JS with SWFT content.

## What changed

### Local branch (`swft-araise-2027` / Pages)

- `/` ([`index.html`](../index.html))
- `/services.html`
- `/websites.html` (Our Work)
- `/website-pricing.html`
- `/team.html`
- `/contact.html`
- `/growth-audit.html`
- `/case-studies.html` (shell only; hub grid JS/data unchanged)

### Webflow staging (`swft2027` → [swft2027.webflow.io](https://swft2027.webflow.io/))

Primary place to test interactions and custom code before git/Pages sync:

| Route | Notes |
| --- | --- |
| `/` | Preloader → hero floats → **About** (scrub + gallery) → **sticky Work** → Services → Clients → Process → **Team** (dark) → **sticky Testimonials** → FAQ → Contact |
| `/services`, `/websites`, `/website-pricing`, `/team`, `/contact`, `/growth-audit`, `/case-studies` | ARAISE chrome + content |
| `/apps`, `/media`, `/404` | ARAISE-themed |
| `/locations` | Hub (city detail pages stay on git/Pages) |
| `/book` | Offer hub (interactive booker stays on Pages/Workers) |

Site freeform head/footer: Chakra Petch + Inter Tight, theme tokens, `#swft-nav` clock header, theme toggle, footer mount, GSAP float hover, hosted `swft-site-head-v2.css`, plus **About gallery** freeform `<style id="swft-about-gallery">` and ScrollTrigger scripts (preloader, About scrub + gallery, sticky work cursor, team dark, sticky testimonials).

### Home interactions (`swft2027`)

| Block | Behavior |
| --- | --- |
| **Preloader** | ARAISE-style: always-visible **SWFT** + cycling **Visual → Digital → Studios**; dual black gates (`rotateY`) then wrap lifts (`yPercent: -100`) to reveal hero; transparent wrap so gates expose the page; Home-only; respects `prefers-reduced-motion` |
| **About (`#about`)** | Meta row `→ [ ABOUT US ]` / SWFT; massive ALL-CAPS statement; ScrollTrigger word opacity scrub (dim → white); **ARAISE-style scroll gallery** under the headline |
| **About gallery** | `.ar-about-gallery` stage with **3 duplicated** `.ar-about-strip` rows of SWFT project thumbs (`brooklyn-steel`, `manna-hydration`, `thyme-and-table`, `Snooze-Lane-Desktop`, `hamper_app_website` from `swftstudios.com/images` — not ARAISE CDN). Page-scroll scrub moves `.ar-about-scroll-gallery` via `xPercent` (~`0 → -33.333`). Top/bottom `.ar-ornament-eclipse` black rounded bars mask the strip into a curved window. `prefers-reduced-motion`: static strip, no transform |
| **Work (`#work`)** | Sticky stacked covers + centered “View Work” cursor (`xPercent/yPercent: -50`, desktop fine pointer); head opacity fade |
| **Team (`#team`)** | Dark section, split head, grayscale portraits + name/role |
| **Testimonials** | Sticky stacked quote cards with project photos (Brooklyn Steel, Snooze Lane, Manna); no dedicated client video assets yet |

Body HtmlEmbed: `ab8c245b-a2ce-0723-6fb0-b1d0cf4feaf4` on Home `6abd3e502eac1e49f19d232d`.

Deferred elsewhere: portal, case-study detail templates, full book checkout APIs, custom-domain publish, unicode polish on section arrows (`->` ASCII in embed until re-pushed).

## Fonts (ARAISE-matched)

| Role | Face |
| --- | --- |
| Display / mega titles | **Chakra Petch** (Google Fonts, 500–700) |
| UI / body | **Inter Tight** (Google Fonts) + local **Inter Display** for extra-thin weights |

CSS vars: `--ar-display`, `--ar-font` in [`css/araise-theme.css`](../css/araise-theme.css).

### Scan hierarchy

- Default body/lead: thin (`font-weight: 200–300`, class `.ar-thin`)
- Marketing punch lines: `<strong class="ar-mark">` (bold, full `--fg`)

## Theme tokens

| Token | Role |
| --- | --- |
| `--bg` | Page background |
| `--fg` | Primary text |
| `--muted` | Secondary text |
| `--surface` | Cards / header / footer |
| `--border` | Hairlines |
| `--cta-bg` / `--cta-fg` | Primary buttons |
| `--ghost` | Outline / watermark type |
| `--accent` | Red accents (`#FF0000`) |
| `--theme-t` | 0 = day/light … 1 = night/dark |

## Clock + day/night

[`js/swft-theme-clock.js`](../js/swft-theme-clock.js):

1. **Clock** — local time + short timezone in the header (`#swft-clock`).
2. **Auto theme** — sunrise/sunset via local solar math; geolocation when allowed (cached), else timezone→coords map (default Jersey City).
3. **Gradual lerp** — ~50 minutes of twilight blend around rise/set; text contrast snaps earlier than backgrounds for readability.
4. **Toggle** — cycles `auto → light → dark → auto`; preference in `localStorage` (`swft-theme-mode`).

## GSAP letter reveals

| File | Role |
| --- | --- |
| [`css/araise-motion.css`](../css/araise-motion.css) | `.ar-char` helpers, fade-up |
| [`js/swft-split-text.js`](../js/swft-split-text.js) | Char splitter (no Club SplitText) + ScrollTrigger setups |
| [`js/swft-motion.js`](../js/swft-motion.js) | Page bootstrap |

Markup:

```html
<h2 class="ar-mega" data-split="scrub">Long marketing headline…</h2>
<h1 class="ar-mega" data-split="enter">Our <span class="ghost">Team</span></h1>
```

- `data-split="scrub"` — letters fade/rise as the user scrolls the section
- `data-split="enter"` — one-shot stagger when scrolled into view
- Nested `<strong class="ar-mark">`, `.ghost`, and links are preserved

Requires GSAP 3.12 + ScrollTrigger (cdnjs), already used elsewhere in the repo.

### Reduced motion

If `prefers-reduced-motion: reduce`, splitting is skipped, `html` gets `.ar-no-motion`, and text stays fully visible.

### Progressive enhancement

Characters are only split when GSAP + ScrollTrigger load successfully. Without JS, headlines remain normal readable text.

## Load order (marketing pages)

```html
<link rel="stylesheet" href="css/araise-theme.css">
<link rel="stylesheet" href="css/araise-motion.css">
<link rel="stylesheet" href="css/swft-nav.css">
…
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.4/gsap.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.4/ScrollTrigger.min.js"></script>
<script src="js/swft-nav.js" defer></script>
<script src="js/swft-theme-clock.js" defer></script>
<script src="js/swft-split-text.js" defer></script>
<script src="js/swft-motion.js" defer></script>
```

## Hero float 3D motion

Homepage only ([`js/swft-hero-float.js`](../js/swft-hero-float.js)):

1. **Z fly-in** — floats scale up from depth (`scale` + `z`) with stagger on load
2. **Mouse push** — pointer near a float gently repels it (lerped `x`/`y` + slight `rotationX/Y`)
3. **Idle** — subtle rotation drift after enter

Skipped when `prefers-reduced-motion` or viewport `< 901px` (floats already hidden). Without GSAP, floats stay at CSS rest positions.

## Failure behavior

| Case | Behavior |
| --- | --- |
| Geolocation denied | TZ fallback coords; clock still works |
| `localStorage` blocked | In-memory preference for the session |
| Mid-twilight murky contrast | Text `t` clamped/snapped before mid-gray |
| JS disabled | Light CSS defaults; no clock/toggle/letter motion |
| GSAP CDN blocked | No split applied; full text visible |
| `prefers-reduced-motion` | No letter animation |

## Design notes

- Header: logo · centered nav · clock · theme toggle · Growth Audit CTA
- Section chrome: `→ [ SECTION ]` left, `SWFT` right
- Mega titles: Chakra Petch, uppercase, solid + ghost/outline word pairs
- Positioning: digital/video marketing + content-rich websites for Bergen, Hudson, and NYC five boroughs
