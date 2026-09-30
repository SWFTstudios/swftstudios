# SWFT × ARAISE theme (branch `swft-araise-2027`)

Hand-rebuilt marketing chrome inspired by the ARAISE Webflow aesthetic. Not a Webflow template import — custom HTML/CSS/JS with SWFT content.

## What changed

Redesigned on this branch:

- `/` ([`index.html`](../index.html))
- `/services.html`
- `/websites.html` (Our Work)
- `/website-pricing.html`
- `/team.html`
- `/contact.html`
- `/growth-audit.html`
- `/case-studies.html` (shell only; hub grid JS/data unchanged)

Deferred (shared nav/theme only when those pages already use `#swft-nav`): locations, book, portal, case-study detail pages, apps, media.

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
