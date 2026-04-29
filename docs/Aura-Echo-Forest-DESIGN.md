---
version: "alpha"
name: "Aura • Echo Forest"
description: "Aura Echo Hero Section is designed for introducing a product with clear above-the-fold messaging. Key features include headline hierarchy, supporting copy, and a primary call-to-action. It is suitable for homepage hero areas and campaign landing pages."
colors:
  primary: "#00FF66"
  secondary: "#000000"
  tertiary: "#0AE7FF"
  neutral: "#000000"
  background: "#000000"
  surface: "#00FF66"
  text-primary: "#FFFFFF"
  text-secondary: "#00FF66"
  border: "#FFFFFF"
  accent: "#00FF66"
typography:
  display-lg:
    fontFamily: "Inter"
    fontSize: "160px"
    fontWeight: 400
    lineHeight: "160px"
    letterSpacing: "-0.05em"
  body-md:
    fontFamily: "Inter"
    fontSize: "12px"
    fontWeight: 300
    lineHeight: "16px"
    letterSpacing: "0.1em"
    textTransform: "uppercase"
  label-md:
    fontFamily: "Inter"
    fontSize: "12px"
    fontWeight: 300
    lineHeight: "16px"
    letterSpacing: "1.2px"
rounded:
  md: "0px"
  full: "9999px"
spacing:
  base: "4px"
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  gap: "8px"
  card-padding: "32px"
  section-padding: "32px"
components:
  button-primary:
    textColor: "{colors.text-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: "8px"
  button-link:
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "0px"
  card:
    rounded: "{rounded.md}"
    padding: "32px"
---

## Overview

- **Composition cues:**
  - Layout: Grid
  - Content Width: Bounded
  - Framing: Glassy
  - Grid: Strong

## Colors

The color system uses dark mode with #00FF66 as the main accent and #000000 as the neutral foundation.

- **Primary (#00FF66):** Main accent and emphasis color.
- **Secondary (#000000):** Supporting accent for secondary emphasis.
- **Tertiary (#0AE7FF):** Reserved accent for supporting contrast moments.
- **Neutral (#000000):** Neutral foundation for backgrounds, surfaces, and supporting chrome.

- **Usage:** Background: #000000; Surface: #00FF66; Text Primary: #FFFFFF; Text Secondary: #00FF66; Border: #FFFFFF; Accent: #00FF66

## Typography

Typography relies on Inter across display, body, and utility text.

- **Display (`display-lg`):** Inter, 160px, weight 400, line-height 160px, letter-spacing -0.05em.
- **Body (`body-md`):** Inter, 12px, weight 300, line-height 16px, letter-spacing 0.1em, uppercase.
- **Labels (`label-md`):** Inter, 12px, weight 300, line-height 16px, letter-spacing 1.2px.

## Layout

Layout follows a grid composition with reusable spacing tokens. Preserve the grid, bounded structural frame before changing ornament or component styling. Use 4px as the base rhythm and let larger gaps step up from that cadence instead of introducing unrelated spacing values.

Treat the page as a grid / bounded composition, and keep that framing stable when adding or remixing sections.

- **Layout type:** Grid
- **Content width:** Bounded
- **Base unit:** 4px
- **Scale:** 4px, 8px, 12px, 16px, 20px, 32px, 40px, 48.4px
- **Section padding:** 32px, 40px
- **Card padding:** 32px, 40px
- **Gaps:** 8px, 12px, 32px, 40px

## Elevation & Depth

Depth is communicated through glass, border contrast, and reusable shadow or blur treatments. Keep those recipes consistent across hero panels, cards, and controls so the page reads as one material system.

Surfaces should read as glass first, with borders, shadows, and blur only reinforcing that material choice.

- **Surface style:** Glass
- **Borders:** 1px #FFFFFF
- **Shadows:** rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.1) 0px 2.8px 2.2px 0px, rgba(0, 0, 0, 0.15) 0px 6.7px 5.3px 0px, rgba(0, 0, 0, 0.4) 0px 100px 80px 0px; rgba(255, 255, 255, 0.05) 0px 1px 0px 0px inset; rgba(255, 255, 255, 0.02) 1px 0px 0px 0px inset
- **Blur:** 40px

### Techniques
- **Gradient border shell:** Use a thin gradient border shell around the main card. Wrap the surface in an outer shell with 0px padding and a 32px radius. Drive the shell with linear-gradient(rgb(10, 10, 10), rgb(10, 10, 10)), linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.01) 100%) so the edge reads like premium depth instead of a flat stroke. Keep the actual stroke understated so the gradient shell remains the hero edge treatment. Inset the real content surface inside the wrapper with a slightly smaller radius so the gradient only appears as a hairline frame.

## Shapes

Shapes rely on a tight radius system anchored by 32px and scaled across cards, buttons, and supporting surfaces. Icon geometry should stay compatible with that soft-to-controlled silhouette.

Use the radius family intentionally: larger surfaces can open up, but controls and badges should stay within the same rounded DNA instead of inventing sharper or pill-only exceptions.

- **Corner radii:** 32px, 9999px
- **Icon treatment:** Linear
- **Icon sets:** Solar

## Components

Anchor interactions to the detected button styles. Reuse the existing card surface recipe for content blocks.

### Buttons
- **Primary:** text #FFFFFF, radius 9999px, padding 8px, border 1px solid rgba(255, 255, 255, 0.1).
- **Links:** text #FFFFFF, radius 0px, padding 0px, border 0px solid rgb(229, 231, 235).

### Cards and Surfaces
- **Card surface:** radius 0px, padding 32px, shadow none, blur 40px.
- **Card surface:** background #141414, border 0px solid rgb(229, 231, 235), radius 0px, padding 40px, shadow rgba(255, 255, 255, 0.02) 1px 0px 0px 0px inset.

### Iconography
- **Treatment:** Linear.
- **Sets:** Solar.

## Do's and Don'ts

Use these constraints to keep future generations aligned with the current system instead of drifting into adjacent styles.

### Do
- Do use the primary palette as the main accent for emphasis and action states.
- Do keep spacing aligned to the detected 4px rhythm.
- Do reuse the Glass surface treatment consistently across cards and controls.
- Do keep corner radii within the detected 32px, 9999px family.

### Don't
- Don't introduce extra accent colors outside the core palette roles unless the page needs a new semantic state.
- Don't mix unrelated shadow or blur recipes that break the current depth system.
- Don't exceed the detected moderate motion intensity without a deliberate reason.

## Motion

Motion feels controlled and interface-led across text, layout, and section transitions. Timing clusters around 300ms and 1000ms. Easing favors ease and 0. Hover behavior focuses on text and stroke changes. Scroll choreography uses GSAP ScrollTrigger for section reveals and pacing.

**Motion Level:** moderate

**Durations:** 300ms, 1000ms

**Easings:** ease, 0, 0.2, 1), cubic-bezier(0.4, cubic-bezier(0

**Hover Patterns:** text, stroke, color

**Scroll Patterns:** gsap-scrolltrigger
