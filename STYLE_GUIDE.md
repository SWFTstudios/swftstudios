# SWFT Studios Style Guide

**Version:** 1.0  
**Last Updated:** December 2024  
**Purpose:** Complete design system documentation for replicating the SWFT Studios website in Figma or any design tool.

---

## Table of Contents

1. [Colors](#colors)
2. [Typography](#typography)
3. [Spacing System](#spacing-system)
4. [Layout & Grid](#layout--grid)
5. [Components](#components)
6. [Effects & Shadows](#effects--shadows)
7. [Breakpoints](#breakpoints)

---

## Colors

### Primary Colors

#### Swift Blue (Primary Accent)
- **Hex:** `#BEFFF2`
- **RGB:** `190, 255, 242`
- **HSL:** `168°, 100%, 87%`
- **Usage:** Primary accent color for interactive elements, highlights, links, buttons, and brand elements
- **Description:** A very light blue that appears almost white - the signature SWFT Studios color

#### Black
- **Hex:** `#010101`
- **RGB:** `1, 1, 1`
- **Usage:** Primary text color, backgrounds

#### White
- **Hex:** `#FFFFFF`
- **RGB:** `255, 255, 255`
- **Usage:** Text on dark backgrounds, backgrounds

#### Charcoal
- **Hex:** `#0C0C0C`
- **RGB:** `12, 12, 12`
- **Usage:** Secondary dark backgrounds

### Semantic Colors

#### Background Colors
- **Primary Background:** `#0A0A0A` (Dark theme)
- **Secondary Background:** `rgba(255, 255, 255, 0.02)`
- **Tertiary Background:** `rgba(255, 255, 255, 0.05)`
- **Hover Background:** `rgba(255, 255, 255, 0.08)`
- **Active Background:** `rgba(190, 255, 242, 0.15)` (Swift Blue with opacity)

#### Text Colors
- **Primary Text:** `#FFFFFF`
- **Secondary Text:** `rgba(255, 255, 255, 0.7)`
- **Tertiary Text:** `rgba(255, 255, 255, 0.5)`
- **Muted Text:** `rgba(255, 255, 255, 0.4)`

#### Border Colors
- **Default Border:** `rgba(255, 255, 255, 0.08)`
- **Hover Border:** `rgba(255, 255, 255, 0.12)`
- **Active Border:** `#BEFFF2` (Swift Blue)

#### Accent Colors (Legacy - for reference)
- **Green:** `#7FFFE5`
- **Glass Edge:** `rgba(255, 255, 255, 0.5)` (`#FFFFFF80`)
- **Glow:** `rgba(220, 243, 255, 0.34)` (`#DCF3FF57`)
- **Green Glow:** `rgba(76, 252, 255, 0.1)` (`#4CFCFF1A`)

### Color Usage Guidelines

- **Swift Blue (`#BEFFF2`)** should be used for:
  - Primary buttons
  - Active states
  - Focus outlines
  - Links
  - Highlights
  - Accent elements
  - Graph node colors (when appropriate)

- **Avoid using Swift Blue** for:
  - Large background areas (too light, low contrast)
  - Text on white backgrounds (insufficient contrast)

---

## Typography

### Font Family

**Primary Font:** Inter Display

#### Font Weights Available
- **Thin:** 100
- **Extra Light:** 200
- **Light:** 300
- **Regular:** 400 (default)
- **Medium:** 500
- **Semi Bold:** 600
- **Bold:** 700
- **Extra Bold:** 800
- **Black:** 900

#### Font Files
All fonts are in `.woff2` format, located in `/fonts/`:
- `InterDisplay-Thin.woff2` (weight: 100)
- `InterDisplay-ExtraLight.woff2` (weight: 200)
- `InterDisplay-Light.woff2` (weight: 300)
- `InterDisplay-Regular.woff2` (weight: 400)
- `InterDisplay-Medium.woff2` (weight: 500)
- `InterDisplay-SemiBold.woff2` (weight: 600)
- `InterDisplay-Bold.woff2` (weight: 700)
- `InterDisplay-ExtraBold.woff2` (weight: 800)
- `InterDisplay-Black.woff2` (weight: 900)

### Type Scale

#### Headings

**H1 - Large**
- **Font Size:** `4rem` (64px)
- **Font Weight:** `700` (Bold)
- **Line Height:** `1.1`
- **Letter Spacing:** Normal
- **Class:** `.heading-style-h1`

**H1 - Medium (Mobile)**
- **Font Size:** `2.5rem` (40px)
- **Font Weight:** `700` (Bold)
- **Line Height:** `1.1`

**H2**
- **Font Size:** `3rem` (48px)
- **Font Weight:** `700` (Bold)
- **Line Height:** `1.2`
- **Class:** `.heading-style-h2`

**H2 - Medium (Mobile)**
- **Font Size:** `2rem` (32px)
- **Font Weight:** `700` (Bold)

**H3**
- **Font Size:** `2rem` (32px)
- **Font Weight:** `700` (Bold)
- **Line Height:** `1.2`
- **Class:** `.heading-style-h3`

**H3 - Medium (Mobile)**
- **Font Size:** `1.5rem` (24px)
- **Font Weight:** `700` (Bold)

**H4**
- **Font Size:** `1.5rem` (24px)
- **Font Weight:** `700` (Bold)
- **Line Height:** `1.3`

**H4 - Medium (Mobile)**
- **Font Size:** `1.25rem` (20px)

**H5**
- **Font Size:** `1.25rem` (20px)
- **Font Weight:** `500` (Medium)

**H5 - Medium (Mobile)**
- **Font Size:** `1rem` (16px)

**H6**
- **Font Size:** `1rem` (16px)
- **Font Weight:** `500` (Medium)

**H6 - Medium (Mobile)**
- **Font Size:** `0.875rem` (14px)

#### Body Text

**Large**
- **Font Size:** `1.125rem` (18px)
- **Font Weight:** `400` (Regular)
- **Line Height:** `1.5`

**Regular (Default)**
- **Font Size:** `1rem` (16px)
- **Font Weight:** `400` (Regular)
- **Line Height:** `1.5`

**Small**
- **Font Size:** `0.875rem` (14px)
- **Font Weight:** `400` (Regular)
- **Line Height:** `1.5`
- **Class:** `.text-size-small`

**Tiny**
- **Font Size:** `0.75rem` (12px)
- **Font Weight:** `400` (Regular)
- **Line Height:** `1.4`
- **Class:** `.text-size-tiny`

#### Special Text Styles

**Weight Medium (Large Display)**
- **Font Size:** `2.9rem` (46.4px)
- **Font Weight:** `500` (Medium)
- **Class:** `.text-weight-medium`

**Weight Normal**
- **Font Weight:** `400` (Regular)
- **Class:** `.text-weight-normal`

**Italic**
- **Font Style:** `italic`
- **Class:** `.text-style-italic`

### Text Color Classes

- `.text-color-white` - White text
- `.text-color-black` - Black text
- `.text-color-grey` - Grey text
- `.text-color-green` - Green accent text

---

## Spacing System

The spacing system uses `rem` units based on a 16px base (1rem = 16px).

### Spacing Scale

| Name | Value (rem) | Value (px) | Usage |
|------|------------|------------|-------|
| Tiny | `0.25rem` | `4px` | Tight spacing, icon padding |
| Small | `0.5rem` | `8px` | Small gaps, tight padding |
| Medium | `0.75rem` | `12px` | Default gap, button padding |
| Base | `1rem` | `16px` | Standard spacing unit |
| Large | `1.5rem` | `24px` | Section spacing, larger gaps |
| XLarge | `2rem` | `32px` | Major spacing, section breaks |
| XXLarge | `3rem` | `48px` | Large section spacing |
| Huge | `3.5rem` | `56px` | Extra large spacing |
| XHuge | `4rem` | `64px` | Maximum spacing |
| XXHuge | `4.5rem` | `72px` | Extreme spacing |

### Padding Classes

#### Global Padding
- `.padding-global`
  - **Desktop:** `padding-left: 1.5rem; padding-right: 1.5rem;`
  - **Responsive:** `clamp(1rem, 4vw, 1.5rem)` (mobile to desktop)

#### Section Padding
- `.padding-section-small`
  - `padding-top: 3rem; padding-bottom: 3rem;`
- `.padding-section-large`
  - Variable based on context

#### Directional Padding
- `.padding-top` - Top padding only
- `.padding-right` - Right padding only
- `.padding-bottom` - Bottom padding only
- `.padding-left` - Left padding only
- `.padding-horizontal` - Left and right padding
- `.padding-vertical` - Top and bottom padding

#### Size-Based Padding
- `.padding-0` - `0rem`
- `.padding-small` - `0.5rem` (8px)
- `.padding-medium` - `1.25rem` (20px)
- `.padding-large` - `1.5rem` (24px)
- `.padding-xlarge` - `2rem` (32px)
- `.padding-xxlarge` - `3rem` (48px)
- `.padding-huge` - `3.5rem` (56px)
- `.padding-xhuge` - `4rem` (64px)
- `.padding-xxhuge` - `4.5rem` (72px)

### Margin Classes

#### Directional Margin
- `.margin-top` - Top margin only
- `.margin-right` - Right margin only
- `.margin-bottom` - Bottom margin only
- `.margin-left` - Left margin only
- `.margin-horizontal` - Left and right margin
- `.margin-vertical` - Top and bottom margin

#### Size-Based Margin
- `.margin-0` - `0rem`
- `.margin-small` - `0.5rem` (8px)
- `.margin-medium` - `1.25rem` (20px)
- `.margin-large` - `1.5rem` (24px)
- `.margin-xlarge` - `2rem` (32px)
- `.margin-xxlarge` - `3rem` (48px)
- `.margin-huge` - `3.5rem` (56px)
- `.margin-xhuge` - `4rem` (64px)
- `.margin-xxhuge` - `4.5rem` (72px)

#### Common Margin Patterns
- `.margin-bottom margin-small` - `margin-bottom: 0.5rem`
- `.margin-bottom margin-medium` - `margin-bottom: 1rem`
- `.margin-bottom margin-large` - `margin-bottom: 1.5rem`

### Gap (Flexbox/Grid)

- **Small Gap:** `0.5rem` (8px)
- **Medium Gap:** `0.75rem` (12px)
- **Base Gap:** `1rem` (16px)
- **Large Gap:** `1.5rem` (24px)
- **XLarge Gap:** `2rem` (32px)
- **XXLarge Gap:** `3rem` (48px)
- **Huge Gap:** `4rem` (64px)

---

## Layout & Grid

### Container Widths

- **Container Small:** `max-width: 48rem` (768px)
- **Container Large:** `100%` (full width with padding)
- **Max Width Small:** `max-width: 20rem` (320px)
- **Max Width Large:** `max-width: 80rem` (1280px)
- **Max Width XXLarge:** `max-width: 80rem` (1280px)

### Grid System

#### 2-Column Grid
- **Class:** `.fs-styleguide_2-col`
- **Gap:** `4rem` (64px)
- **Columns:** `1fr 1fr`

#### 1-Column Grid
- **Class:** `.fs-styleguide_1-col`
- **Gap:** `3rem` (48px)
- **Columns:** `1fr`

### Responsive Behavior

- **Mobile-first approach**
- **Fluid typography** using `clamp()` where appropriate
- **Breakpoints** (see Breakpoints section)

---

## Components

### Buttons

#### Primary Button
- **Background:** Swift Blue (`#BEFFF2`)
- **Text Color:** Black (`#010101`) or White (depending on contrast)
- **Padding:** `0.625rem 1rem` (10px 16px)
- **Border Radius:** `6px` or `8px`
- **Font Size:** `0.875rem` (14px)
- **Font Weight:** `500` (Medium)
- **Border:** `1px solid` (matching background or transparent)
- **Transition:** `all 0.2s`

#### Secondary Button
- **Background:** `rgba(255, 255, 255, 0.05)`
- **Text Color:** `rgba(255, 255, 255, 0.7)`
- **Border:** `1px solid rgba(255, 255, 255, 0.15)`
- **Padding:** `0.625rem 1rem`
- **Border Radius:** `6px`

#### Hover States
- **Background:** `rgba(255, 255, 255, 0.08)`
- **Border Color:** `rgba(255, 255, 255, 0.2)`
- **Transform:** `scale(1.05)` (subtle)

#### Active States
- **Background:** `rgba(190, 255, 242, 0.15)` (Swift Blue with opacity)
- **Transform:** `scale(0.95)`

### Cards

#### Blog Card
- **Background:** `rgba(255, 255, 255, 0.02)`
- **Border:** `1px solid rgba(255, 255, 255, 0.08)`
- **Border Radius:** `8px`
- **Padding:** `1.5rem` (24px)
- **Transition:** `all 0.3s ease`

#### Card Hover
- **Background:** `rgba(255, 255, 255, 0.05)`
- **Border Color:** `rgba(255, 255, 255, 0.15)`
- **Transform:** `translateY(-2px)`

#### Card Focus
- **Outline:** `2px solid #BEFFF2` (Swift Blue)
- **Outline Offset:** `2px`

### Input Fields

#### Text Input
- **Background:** `rgba(255, 255, 255, 0.02)`
- **Border:** `1px solid rgba(255, 255, 255, 0.1)`
- **Border Radius:** `4px`
- **Padding:** `0.75rem 1rem`
- **Font Size:** `0.875rem` (14px)
- **Color:** `#FFFFFF`

#### Input Focus
- **Border Color:** `#BEFFF2` (Swift Blue)
- **Outline:** `2px solid #BEFFF2`
- **Outline Offset:** `2px`

### Modals

#### Modal Backdrop
- **Background:** `rgba(0, 0, 0, 0.8)`
- **Backdrop Filter:** `blur(10px)`

#### Modal Content
- **Background:** `rgba(20, 20, 22, 0.95)`
- **Border:** `1px solid rgba(255, 255, 255, 0.1)`
- **Border Radius:** `12px`
- **Padding:** `2rem`
- **Box Shadow:** `0 8px 32px rgba(0, 0, 0, 0.5)`

### Media Controls

#### Control Button
- **Size:** `44px × 44px`
- **Background:** `rgba(255, 255, 255, 0.1)`
- **Border:** `1px solid rgba(255, 255, 255, 0.2)`
- **Border Radius:** `8px`
- **Icon Size:** `20px × 20px`

---

## Effects & Shadows

### Shadows

#### Box Shadow (Cards/Modals)
- **Small:** `0 2px 8px rgba(0, 0, 0, 0.2)`
- **Medium:** `0 4px 16px rgba(0, 0, 0, 0.3)`
- **Large:** `0 8px 32px rgba(0, 0, 0, 0.5)`

#### Text Shadow
- **Subtle:** `0 1px 2px rgba(0, 0, 0, 0.1)`

### Blur Effects

#### Backdrop Blur
- **Light:** `blur(5px)`
- **Medium:** `blur(10px)`
- **Heavy:** `blur(20px)`

### Glow Effects

#### Swift Blue Glow
- **Color:** `rgba(190, 255, 242, 0.3)`
- **Usage:** Subtle glow around interactive elements

### Border Radius

- **Small:** `4px` - Inputs, small buttons
- **Medium:** `6px` - Buttons, cards
- **Large:** `8px` - Cards, containers
- **XLarge:** `12px` - Modals, large containers
- **Round:** `50%` - Circular elements (icons, avatars)

---

## Breakpoints

### Mobile First Approach

| Breakpoint | Width | Usage |
|------------|-------|-------|
| Mobile | `0px - 479px` | Small phones |
| Mobile Landscape | `480px - 767px` | Large phones, small tablets |
| Tablet | `768px - 991px` | Tablets |
| Desktop | `992px - 1279px` | Small desktops |
| Large Desktop | `1280px+` | Large desktops |

### Media Query Examples

```css
/* Mobile Landscape and up */
@media screen and (max-width: 767px) { }

/* Tablet and up */
@media screen and (max-width: 991px) { }

/* Desktop and up */
@media screen and (min-width: 992px) { }
```

### Responsive Typography

Headings scale down on mobile:
- **H1:** `4rem` → `2.5rem` (mobile)
- **H2:** `3rem` → `2rem` (mobile)
- **H3:** `2rem` → `1.5rem` (mobile)

### Responsive Spacing

Padding and margins scale down on mobile:
- **Large sections:** `3rem` → `2rem` (mobile)
- **XLarge sections:** `4rem` → `3rem` (mobile)

---

## Accessibility

### Focus States

All interactive elements must have visible focus states:
- **Outline:** `2px solid #BEFFF2` (Swift Blue)
- **Outline Offset:** `2px`
- **Border Radius:** Match element's border radius

### Color Contrast

- **Text on Dark Background:** Minimum 4.5:1 contrast ratio
- **Text on Swift Blue:** Use dark text (`#010101`) for sufficient contrast
- **Interactive Elements:** Clear visual distinction between states

### Reduced Motion

Respect `prefers-reduced-motion`:
```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Figma Setup Guide

### Creating the Style Guide in Figma

1. **Colors**
   - Create color styles for all colors listed above
   - Name them: "Swift Blue", "Black", "White", etc.
   - Use hex values: `#BEFFF2`, `#010101`, `#FFFFFF`

2. **Typography**
   - Import Inter Display font family
   - Create text styles for each heading level (H1-H6)
   - Create text styles for body text (Large, Regular, Small, Tiny)
   - Set line heights as specified

3. **Spacing**
   - Create spacing tokens: 4px, 8px, 12px, 16px, 24px, 32px, 48px, 64px, 72px
   - Use these for padding and margin values

4. **Effects**
   - Create shadow styles for each shadow level
   - Create blur effects for backdrop blur

5. **Components**
   - Build button components with all states (default, hover, active, focus)
   - Build card components
   - Build input field components
   - Build modal components

### Design Tokens Export

Export design tokens as:
- **Colors:** JSON or CSS variables
- **Typography:** Text styles
- **Spacing:** Spacing tokens
- **Effects:** Effect styles

---

## Implementation Notes

### CSS Variables

The codebase uses CSS custom properties (variables) for theming:
```css
:root {
  --primary-color: #BEFFF2;
  --black: #010101;
  --white: #FFFFFF;
  /* etc. */
}
```

### Utility Classes

The site uses utility classes for rapid development:
- `.text-size-small` - Small text
- `.padding-large` - Large padding
- `.margin-bottom` - Bottom margin
- `.text-color-white` - White text
- etc.

### Component Classes

Components use BEM-like naming:
- `.blog_card` - Block
- `.blog_card-title` - Element
- `.blog_card.is-highlighted` - Modifier

---

## Version History

- **v1.0** (December 2024) - Initial style guide with Swift Blue accent color

---

## Questions or Updates?

For questions about this style guide or to request updates, contact the development team.

