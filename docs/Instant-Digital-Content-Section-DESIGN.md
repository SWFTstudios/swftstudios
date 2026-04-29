---
version: "alpha"
name: "Instant Digital Content Section"
description: "Instant Digital Content Section is designed for structuring a full-width content block for modern web pages. Key features include reusable structure, responsive behavior, and production-ready presentation. It is suitable for component libraries and responsive product interfaces."
colors:
  primary: "#9CA3AF"
  secondary: "#6B7280"
  tertiary: "#A69DB9"
  neutral: "#000000"
  background: "#000000"
  surface: "#FFFFFF"
  text-primary: "#9CA3AF"
  text-secondary: "#FFFFFF"
  border: "#FFFFFF"
  accent: "#9CA3AF"
typography:
  display-lg:
    fontFamily: "System Font"
    fontSize: "96px"
    fontWeight: 300
    lineHeight: "96px"
    letterSpacing: "-0.025em"
  body-md:
    fontFamily: "System Font"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
rounded:
  md: "0px"
  full: "9999px"
spacing:
  base: "8px"
  sm: "8px"
  md: "10px"
  lg: "16px"
  xl: "20px"
  gap: "8px"
components:
  button-primary:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.full}"
    padding: "8px"
  button-link:
    textColor: "#E5E7EB"
    rounded: "{rounded.md}"
    padding: "0px"
---

## Overview

- **Composition cues:**
  - Layout: Flex
  - Content Width: Full Bleed
  - Framing: Glassy
  - Grid: Minimal

## Colors

The color system uses dark mode with #9CA3AF as the main accent and #000000 as the neutral foundation.

- **Primary (#9CA3AF):** Main accent and emphasis color.
- **Secondary (#6B7280):** Supporting accent for secondary emphasis.
- **Tertiary (#A69DB9):** Reserved accent for supporting contrast moments.
- **Neutral (#000000):** Neutral foundation for backgrounds, surfaces, and supporting chrome.

- **Usage:** Background: #000000; Surface: #FFFFFF; Text Primary: #9CA3AF; Text Secondary: #FFFFFF; Border: #FFFFFF; Accent: #9CA3AF

## Typography

Typography relies on System Font across display, body, and utility text.

- **Display (`display-lg`):** System Font, 96px, weight 300, line-height 96px, letter-spacing -0.025em.
- **Body (`body-md`):** System Font, 12px, weight 400, line-height 16px.

## Layout

Layout follows a flex composition with reusable spacing tokens. Preserve the flex, full bleed structural frame before changing ornament or component styling. Use 8px as the base rhythm and let larger gaps step up from that cadence instead of introducing unrelated spacing values.

Treat the page as a flex / full bleed composition, and keep that framing stable when adding or remixing sections.

- **Layout type:** Flex
- **Content width:** Full Bleed
- **Base unit:** 8px
- **Scale:** 8px, 10px, 16px, 20px
- **Gaps:** 8px, 12px, 24px

## Elevation & Depth

Depth is communicated through glass, border contrast, and reusable shadow or blur treatments. Keep those recipes consistent across hero panels, cards, and controls so the page reads as one material system.

Surfaces should read as glass first, with borders, shadows, and blur only reinforcing that material choice.

- **Surface style:** Glass
- **Borders:** 1px #FFFFFF
- **Shadows:** rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.25) 0px 25px 50px -12px; rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.1) 0px 10px 15px -3px, rgba(0, 0, 0, 0.1) 0px 4px 6px -4px; rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.05) 0px 1px 2px 0px
- **Blur:** 4px, 12px

## Shapes

Shapes rely on a tight radius system anchored by 8px and scaled across cards, buttons, and supporting surfaces. Icon geometry should stay compatible with that soft-to-controlled silhouette.

Use the radius family intentionally: larger surfaces can open up, but controls and badges should stay within the same rounded DNA instead of inventing sharper or pill-only exceptions.

- **Corner radii:** 8px, 32px, 9999px
- **Icon treatment:** Linear
- **Icon sets:** Solar

## Components

Anchor interactions to the detected button styles.

### Buttons
- **Primary:** background #000000, text #9CA3AF, radius 9999px, padding 8px, border 1px solid rgba(255, 255, 255, 0.1).
- **Links:** text #E5E7EB, radius 0px, padding 0px, border 0px solid rgb(229, 231, 235).

### Iconography
- **Treatment:** Linear.
- **Sets:** Solar.

## Do's and Don'ts

Use these constraints to keep future generations aligned with the current system instead of drifting into adjacent styles.

### Do
- Do use the primary palette as the main accent for emphasis and action states.
- Do keep spacing aligned to the detected 8px rhythm.
- Do reuse the Glass surface treatment consistently across cards and controls.
- Do keep corner radii within the detected 8px, 32px, 9999px family.

### Don't
- Don't introduce extra accent colors outside the core palette roles unless the page needs a new semantic state.
- Don't mix unrelated shadow or blur recipes that break the current depth system.
- Don't exceed the detected expressive motion intensity without a deliberate reason.

## Motion

Motion feels expressive but remains focused on interface, text, and layout transitions. Timing clusters around 150ms and 500ms. Easing favors ease and cubic-bezier(0.4. Hover behavior focuses on grayscale and text changes. Scroll choreography uses Parallax for section reveals and pacing.

**Motion Level:** expressive

**Durations:** 150ms, 500ms

**Easings:** ease, cubic-bezier(0.4, 0, 0.2, 1)

**Hover Patterns:** grayscale, text, stroke, color, transform

**Scroll Patterns:** parallax

## WebGL

Reconstruct the graphics as a full-bleed background field using canvas-backed effect. The effect should read as technical, meditative, and atmospheric: dot-matrix particle field with black and sparse spacing. Build it from dot particles + soft depth fade so the effect reads clearly. Animate it as slow breathing pulse. Interaction can react to the pointer, but only as a subtle drift. Preserve dom fallback.

**Id:** webgl

**Label:** WebGL

**Stack:** WebGL

**Insights:**
  - **Scene:**
    - **Value:** Full-bleed background field
  - **Effect:**
    - **Value:** Dot-matrix particle field
  - **Primitives:**
    - **Value:** Dot particles + soft depth fade
  - **Motion:**
    - **Value:** Slow breathing pulse
  - **Interaction:**
    - **Value:** Pointer-reactive drift
  - **Render:**
    - **Value:** Canvas-backed effect

**Techniques:** Dot matrix, Breathing pulse, Pointer parallax, DOM fallback

**Code Evidence:**
  - **HTML reference:**
    - **Language:** html
    - **Snippet:**
      ```html
      <!-- WebGL-like Canvas Background -->
      <canvas id="bg-canvas" class="absolute inset-0 z-0 pointer-events-none opacity-40"></canvas>

      <!-- Header -->
      ```
  - **JS reference:**
    - **Language:** js
    - **Snippet:**
      ```
      // WebGL-like Background Animation (Canvas)
      const canvas = document.getElementById('bg-canvas');
      const ctx = canvas.getContext('2d');
      let width, height;
      let particles = [];

      function initCanvas() {
          width = canvas.width = window.innerWidth;
      …
      ```
