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

## Theme tokens

Defined in [`css/araise-theme.css`](../css/araise-theme.css):

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

Load order on themed pages:

```html
<link rel="stylesheet" href="css/araise-theme.css">
<link rel="stylesheet" href="css/swft-nav.css">
…
<script src="js/swft-nav.js" defer></script>
<script src="js/swft-theme-clock.js" defer></script>
```

## Failure behavior

| Case | Behavior |
| --- | --- |
| Geolocation denied | TZ fallback coords; clock still works |
| `localStorage` blocked | In-memory preference for the session |
| Mid-twilight murky contrast | Text `t` clamped/snapped before mid-gray |
| JS disabled | Light CSS defaults; no clock/toggle |

## Design notes

- Display face: Syne (Google Fonts) + Inter Display (local) for UI/body.
- Header: logo · centered nav · clock · theme toggle · Growth Audit CTA.
- Section chrome: `→ [ SECTION ]` left, `SWFT` right.
- Mega titles use solid + ghost/outline word pairs.
