# SWFT Studios — Design System

Source of truth for typography, color, and spacing on the production marketing site.

**Implementation:** [`css/swft-tokens.css`](../css/swft-tokens.css)  
**Live internal reference:** [`/style-guide.html`](../style-guide.html) (noindex, robots Disallow, not in nav/sitemap)

Brand tokens in [`css/swftstudios000.css`](../css/swftstudios000.css) still define Webflow/Untitled UI variables; production pages should prefer the `--swft-*` semantic tokens below.

---

## Colors

### Semantic (`--swft-*`)

| Token | Value | Notes |
|---|---|---|
| `--swft-bg` | `#010101` | Page background |
| `--swft-text` | `#e5e2e1` | Primary body text (soft white for readability) |
| `--swft-text-strong` | `#ffffff` | Headings and strong UI text |
| `--swft-lead` | `#c4c7c7` | Supporting / lead copy |
| `--swft-muted` | `#a8a8a8` | Meta, labels, secondary UI |
| `--swft-accent` | `#7fffe5` (`var(--green)`) | Only accent — CTAs, eyebrows, interactive |
| `--swft-border` | `rgba(255, 255, 255, 0.1)` | Dividers and card edges |
| `--swft-card` | `#0a0a0a` | Elevated surfaces |

### Brand (legacy aliases)

| Token | Value | Notes |
|---|---|---|
| `--black` | `#010101` | Same as `--swft-bg` |
| `--charcoal` | `#0c0c0c` | Secondary dark surface |
| `--white` | `#ffffff` | Same as `--swft-text-strong` |
| `--green` | `#7fffe5` | Same as `--swft-accent` |
| `--glass_edge` | `#ffffff80` | Glass borders |
| `--glow` | `#dcf3ff57` | Ambient glow |
| `--green-glow` | `#4cfcff1a` | Subtle green glow |

### Gray Scale (Untitled UI)

Still present in `swftstudios000.css` for Webflow components. Prefer `--swft-muted` / `--swft-lead` for new work.

---

## Typography

**Font family:** `--swft-font` → `"Inter Display", Inter, sans-serif` (loaded via `swft-fonts.css`)

### Fluid type scale

Sizes use `clamp()` so type scales continuously across viewports (no hard 4rem → 2.5rem jump).

| Token / element | Size | Line height | Notes |
|---|---|---|---|
| `--swft-h1` / `h1` | `clamp(2.25rem, 1.6rem + 2.8vw, 3.5rem)` | `1.05` | Heroes / page titles |
| `--swft-h2` / `h2` | `clamp(1.75rem, 1.35rem + 1.8vw, 2.75rem)` | `1.1` | Section headings |
| `--swft-h3` / `h3` | `clamp(1.35rem, 1.15rem + 0.9vw, 2rem)` | `1.1` | Cards / bands |
| `--swft-h4` / `h4` | `clamp(1.2rem, 1.1rem + 0.45vw, 1.5rem)` | `1.3` | |
| `--swft-h5` / `h5` | `clamp(1.1rem, 1.05rem + 0.25vw, 1.25rem)` | `1.4` | |
| `--swft-h6` / `h6` | `1rem` | `1.4` | |
| `--swft-text-body` / `body` / `p` | `clamp(1.0625rem … 1.1875rem)` (~17–19px) | `1.6` | Color: `--swft-text` |
| `--swft-text-lead` | `clamp(1.125rem … 1.25rem)` | `1.65` | Color: `--swft-lead` |
| `--swft-text-small` | `clamp(0.9375rem … 1rem)` | `1.6` | |
| `--swft-text-tiny` | `0.8125rem` | `1.4` | Eyebrows / labels |

Utility classes: `.swft-text-body`, `.swft-text-lead`, `.swft-text-small`, `.swft-text-tiny`, `.swft-text-strong`, `.swft-text-accent`.

Client-First classes (`.heading-style-h*`, `.text-size-*`) map to the same tokens in `swftstudios000.css`.

### Notes
- Headings have `margin-top/bottom: 0` — spacing comes from layout wrappers.
- Paragraphs have `margin-bottom: 0` — same principle.
- `.skinny` utility: `font-weight: 400`.

---

## Spacing Scale

Utility classes follow: `.padding-{size}` and `.margin-{size}`.

| Name | Value |
|---|---|
| `tiny` | `0.125rem` (2px) |
| `xxsmall` | `0.25rem` (4px) |
| `xsmall` | `0.5rem` (8px) |
| `small` | `1rem` (16px) |
| `custom1` | `1.5rem` (24px) |
| `medium` | `2rem` (32px) |
| `custom2` | `2.5rem` (40px) |
| `large` | `3rem` (48px) |
| `custom3` | `3.5rem` (56px) |
| `xlarge` | `4rem` (64px) |
| `xxlarge` | `5rem` (80px) |
| `huge` | `6rem` (96px) |
| `xhuge` | `8rem` (128px) |
| `xxhuge` | `12rem` (192px) |
| `0` | `0` |

### Directional modifiers
```
.margin-bottom.margin-large  → margin-bottom: 3rem, all other sides: 0
.padding-vertical            → padding-left: 0; padding-right: 0
.padding-horizontal          → padding-top: 0; padding-bottom: 0
```

---

## Layout

| Class | Max Width | Notes |
|---|---|---|
| `.w-container` | `940px` | Webflow default container |
| `.w-layout-blockcontainer` | `940px` | Webflow block layout |
| `.background_image-container` | `87rem` (1392px) | Full-bleed hero image container |
| `.ps-shell` | `1120px` | Custom page shell |

### Page shell (`.ps-*`)

Shared patterns in [`css/page-shell.css`](../css/page-shell.css) for team, contact, case studies, growth audit:

- `.ps-eyebrow`, `.ps-title`, `.ps-lead` — hero type
- `.ps-cta-band` — bottom CTA band
- Local `--ps-*` vars alias `--swft-*`

### Breakpoints

| Name | Max Width |
|---|---|
| Desktop (default) | > 991px |
| Tablet | ≤ 991px |
| Mobile Landscape | ≤ 767px |
| Mobile Portrait | ≤ 479px |
| Nav burger | ≤ 860px |

---

## Buttons

Prefer the unified system in [`css/swft-buttons.css`](../css/swft-buttons.css):

- `swft-btn` + `swft-btn--primary` | `--secondary` | `--outline` | `--text`

Legacy Webflow `.button` / `.button_bg` still exist; fill uses `var(--green)` / `--swft-accent`.

---

## Usage Guidelines

- **Dark backgrounds only** — `--swft-bg` (`#010101`) is the base.
- **Green is the only accent** — use `--swft-accent` for CTAs, highlights, and interactive states. Never for large text blocks.
- **Do not invent page-local gray accents** — services/pricing use mint, same as the rest of the site.
- **No heading margins** — use spacing utilities on wrappers.
- **New CSS** — reference `--swft-*` tokens instead of hard-coded hex/rem where possible.
- **Style guide** — open `/style-guide.html` locally or on preview; do not link it from public nav/footer.

---

## Changelog

- **2026-07-19 — body/bullet readability pass**
  - Raised body/lead/small sizes; softened body to `#f0eeec` and lead to `#e3e0de`.
  - Homepage problem bullets and deliverables lists use larger body/lead type (not muted gray).
- **2026-07-19 — typography & color unification**
  - Added `css/swft-tokens.css` with semantic colors and fluid type scale.
  - Wired tokens into `swftstudios000.css`, `page-shell.css`, services, pricing, growth audit, and homepage section styles.
  - Unified accent to mint `#7fffe5` on services/pricing (removed gray `#c9c6c5` accents).
  - Expanded internal `style-guide.html` with SWFT Tokens specimens; kept noindex + robots Disallow.
