# SWFT Studios — Design System

Source of truth for typography, color, and spacing used in `swftstudios000.webflow`.
All values are pulled directly from `css/swftstudios000.css`.

---

## Colors

Defined in `:root` as CSS custom properties.

### Brand

| Token | Value | Notes |
|---|---|---|
| `--black` | `#010101` | Page background, primary dark |
| `--charcoal` | `#0c0c0c` | Secondary dark surface |
| `--white` | `#ffffff` | Primary text, surfaces |
| `--green` | `#7fffe5` | Accent / CTA / highlight color |
| `--glass_edge` | `#ffffff80` | 50% white — border on glass elements |
| `--glow` | `#dcf3ff57` | Ambient glow effect |
| `--green-glow` | `#4cfcff1a` | Subtle green glow overlay |

### Gray Scale (Untitled UI)

| Token | Value |
|---|---|
| `--untitled-ui--gray100` | `#f2f4f7` |
| `--untitled-ui--gray200` | `#eaecf0` |
| `--untitled-ui--gray300` | `#d0d5dd` |
| `--untitled-ui--gray400` | `#98a2b3` |
| `--untitled-ui--gray500` | `#c0c0c0` (silver) |
| `--untitled-ui--gray600` | `#b1b1b1` |
| `--untitled-ui--gray700` | `#344054` |
| `--untitled-ui--gray800` | `#1d2939` |
| `--untitled-ui--gray900` | `#7fffe5` (mapped to brand green) |

---

## Typography

**Font family:** `Inter Display, sans-serif`

### Type Scale

| Element | Size | Weight | Line Height | Notes |
|---|---|---|---|---|
| `body` | `1rem` (16px) | — | `1.3` | |
| `h1` | `4rem` (64px) | `700` | `1` | Hero headings |
| `h2` | `3rem` (48px) | `500` | `1.2` | Section headings |
| `h3` | `2rem` (32px) | `700` | `1.2` | |
| `h4` | `1.5rem` (24px) | `700` | `1.4` | |
| `h5` | `1.25rem` (20px) | `700` | `1.5` | |
| `h6` | `1rem` (16px) | `700` | `1.5` | |
| `p` | inherited | — | — | `letter-spacing: -0.019em` |
| `blockquote` | `1.25rem` | — | `1.5` | Left border `0.25rem solid #e2e2e2` |

### Notes
- All headings have `margin-top: 0` and `margin-bottom: 0` — spacing is controlled by layout wrappers, not the element itself.
- Paragraphs have `margin-bottom: 0` — same principle.
- `.skinny` utility class: `font-weight: 400` (overrides bold headings when needed).

---

## Spacing Scale

Utility classes follow a consistent naming pattern: `.padding-{size}` and `.margin-{size}`.

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
Combine a size class with a direction class to zero out the other sides:

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
| `.background_image-container` | `87rem` (1392px) | Full-bleed hero image container; `max-height: 50rem` |

### Breakpoints

| Name | Max Width |
|---|---|
| Desktop (default) | > 991px |
| Tablet | ≤ 991px |
| Mobile Landscape | ≤ 767px |
| Mobile Portrait | ≤ 479px |

---

## Buttons

`.button` base:
- `padding-top / padding-bottom`: `1.25rem`
- `font-weight`: `600`
- `transition`: `width 0.4s ease-out`
- Uses `.button_bg` for animated fill on hover (width animates from 0% → 100%)
- `.button_bg` fill color: `var(--green)` — override with `.is-white` for white fill

`.button_prompt` variant:
- `padding: 1.5rem`
- `font-size: 0.875rem`
- `line-height: 1.3`

---

## Usage Guidelines

- **Dark backgrounds only** — the palette is built for dark mode. `--black` (#010101) is the base.
- **Green is the only accent** — use `var(--green)` for CTAs, highlights, and interactive states. Never use it for large text blocks.
- **No heading margins** — don't rely on `h1`–`h6` margins for vertical rhythm. Use spacing utility classes on wrapper elements instead.
- **Gap values in components** — most grid/flex components use `1rem` column gap and `1rem` row gap as a default. Increase with spacing utilities as needed.
