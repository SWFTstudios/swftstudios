---
name: Kinetic Noir
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#393939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1b1b1c'
  surface-container: '#202020'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353535'
  on-surface: '#e5e2e1'
  on-surface-variant: '#c4c7c7'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#303030'
  outline: '#8e9192'
  outline-variant: '#444748'
  surface-tint: '#c9c6c5'
  primary: '#c9c6c5'
  on-primary: '#313030'
  primary-container: '#0a0a0a'
  on-primary-container: '#7b7979'
  inverse-primary: '#5f5e5e'
  secondary: '#adc6ff'
  on-secondary: '#002e6a'
  secondary-container: '#0566d9'
  on-secondary-container: '#e6ecff'
  tertiary: '#c1c7cf'
  on-tertiary: '#2b3137'
  tertiary-container: '#050b10'
  on-tertiary-container: '#747a81'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e5e2e1'
  primary-fixed-dim: '#c9c6c5'
  on-primary-fixed: '#1c1b1b'
  on-primary-fixed-variant: '#474646'
  secondary-fixed: '#d8e2ff'
  secondary-fixed-dim: '#adc6ff'
  on-secondary-fixed: '#001a42'
  on-secondary-fixed-variant: '#004395'
  tertiary-fixed: '#dde3eb'
  tertiary-fixed-dim: '#c1c7cf'
  on-tertiary-fixed: '#161c22'
  on-tertiary-fixed-variant: '#41474e'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353535'
  surface-deep: '#0A0A0A'
  surface-subtle: '#1F1F1F'
  border-low-light: rgba(255, 255, 255, 0.08)
  text-muted: '#888888'
  accent-silver: '#CBD5E1'
typography:
  display-xl:
    fontFamily: Hanken Grotesk
    fontSize: 80px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.04em
  display-xl-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 48px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-mono:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.0'
    letterSpacing: 0.1em
  quote-editorial:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '300'
    lineHeight: '1.4'
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  section-padding: 120px
  grid-gutter: 24px
  container-max: 1440px
  stack-sm: 12px
  stack-md: 24px
  stack-lg: 48px
---

## Brand & Style
The design system is engineered for a high-end venture studio environment, evoking a sense of technical precision and founder-led authority. The aesthetic is a sophisticated blend of **Minimalism** and **Modern Corporate**, utilizing a "dark studio" atmosphere where deep charcoal surfaces provide a high-contrast canvas for editorial typography.

The brand personality is credible, futuristic, and grounded. It avoids "tech-bro" tropes in favor of a polished, architectural approach. Key visual identifiers include structured grid lines, oversized section headers, and monochromatic depth, creating a premium environment that feels both stable and innovative.

## Colors
The palette is rooted in a "void" aesthetic—using `#0A0A0A` as the primary foundation to ensure true depth on OLED screens and high-end monitors. 

- **Primary Canvas:** The background is consistently deep charcoal. 
- **Accents:** A sharp, sophisticated blue is used sparingly for critical action points, while silver is utilized for secondary technical details.
- **Grayscale:** We use a tiered system of slates (#1F1F1F, #333333) to create structural separation without relying on traditional shadows.
- **Typography:** Crisp white (#FFFFFF) is reserved for headers to ensure maximum impact, while muted grays handle secondary information.

## Typography
The typographic strategy relies on a high-contrast pairing of **Hanken Grotesk** for an editorial, wide-aperture feel and **Inter** for clinical legibility in body text. 

A third typeface, **JetBrains Mono**, is introduced for "technical" metadata, numbered labels (e.g., 01, 02), and utility tags. This reinforces the "studio" and "technical" nature of the brand. Headings should utilize tight letter spacing to appear more intentional and architectural, while body text maintains standard spacing for comfort.

## Layout & Spacing
This design system utilizes a **Fixed Grid** approach for desktop, centered within a 1440px container. The layout is defined by visible 1px borders (#1F1F1F) that act as a "blueprint" for the content.

- **Vertical Rhythm:** Generous section padding (120px) ensures a premium, airy feel.
- **Modular Blocks:** Content is organized into clear rectangular zones. 
- **Mobile Adaptation:** On mobile devices, the 12-column grid collapses to a single column, but the 1px horizontal dividers remain to preserve the "structured" aesthetic.

## Elevation & Depth
In this dark studio environment, elevation is conveyed through **Tonal Layers** rather than shadows. 

Surfaces move "closer" to the user by becoming lighter in value (e.g., a card sits at #1F1F1F against a #0A0A0A background). 
- **Grid Lines:** 1px solid borders at low opacity (8-10%) define the architecture. 
- **Glassmorphism:** Reserved exclusively for navigation bars and dropdowns, using a heavy backdrop blur (20px) to maintain focus on the content below.
- **Hover States:** Interactive elements should utilize a subtle glow or a shift to a slightly lighter slate tone to indicate state changes.

## Shapes
The shape language is primarily **Soft (0.25rem)**. This slight rounding takes the edge off the brutalist grid lines without making the UI feel "bubbly" or informal. Large components like Hero blocks and Case Study images should maintain crisp, sharp edges (0px) to emphasize the architectural rigors of the studio, while buttons and input fields use the soft radius for tactile comfort.

## Components

### Premium Hero Section
Large-scale editorial typography (Display XL) left-aligned. Use a `label-mono` number (e.g., 01) above the headline to signify the start of the experience. Backgrounds should be pure #0A0A0A with a subtle, dark-to-transparent gradient overlay on any imagery.

### Venture & Case Study Cards
- **Structure:** 1px border (#333333). No shadow.
- **Numbered Indicators:** Use `label-mono` in the top right corner.
- **Content:** For Case Studies, use a structured "Problem -> System -> Impact" layout with small, bold sub-headers for each phase. 
- **Interaction:** On hover, the border color shifts to the primary blue or silver.

### The SWFT Method (Numbered Steps)
A vertical or horizontal list of steps where the number is the largest visual element (using `headline-lg` in silver). Each step is separated by a 1px vertical line to simulate a timeline or assembly process.

### CTA Blocks & Buttons
- **Primary Button:** Solid white background with black text. Sharp edges. No border.
- **Secondary Button:** 1px white border with transparent background.
- **Text:** Uppercase with increased letter spacing for a "technical" feel.

### Inquiry Form
A clean, structured form using underline-only inputs or very subtle #1F1F1F filled fields. Focus states should trigger a change in the bottom border color to the primary blue. Labels should be small and positioned above the input using the `label-mono` style.