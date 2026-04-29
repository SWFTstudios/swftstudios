---
version: "alpha"
name: "Scalable Computing Tiers"
description: "Scalable Computing Pricing Section is designed for comparing plans and supporting conversion decisions. Key features include plan comparison blocks and conversion-oriented actions. It is suitable for subscription pricing pages and plan comparison experiences."
colors:
  primary: "#0F172A"
  secondary: "#475569"
  tertiary: "#3B82F6"
  neutral: "#FFFFFF"
  background: "#0F172A"
  surface: "#475569"
  text-primary: "#CBD5E1"
  text-secondary: "#FFFFFF"
  border: "#1E293B"
  accent: "#0F172A"
typography:
  display-lg:
    fontFamily: "Roboto"
    fontSize: "60px"
    fontWeight: 200
    lineHeight: "60px"
    letterSpacing: "-0.025em"
  body-md:
    fontFamily: "Roboto"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
  label-md:
    fontFamily: "Roboto"
    fontSize: "12px"
    fontWeight: 300
    lineHeight: "16px"
    letterSpacing: "0.3px"
rounded:
  md: "0px"
spacing:
  base: "4px"
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "10px"
  gap: "4px"
  section-padding: "40px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.text-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: "12px"
  button-link:
    textColor: "#64748B"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: "10px"
  card:
    rounded: "{rounded.md}"
    padding: "36px"
---

## Overview

- **Composition cues:**
  - Layout: Grid
  - Content Width: Full Bleed
  - Framing: Glassy
  - Grid: Strong

## Colors

The color system uses dark mode with #0F172A as the main accent and #FFFFFF as the neutral foundation.

- **Primary (#0F172A):** Main accent and emphasis color.
- **Secondary (#475569):** Supporting accent for secondary emphasis.
- **Tertiary (#3B82F6):** Reserved accent for supporting contrast moments.
- **Neutral (#FFFFFF):** Neutral foundation for backgrounds, surfaces, and supporting chrome.

- **Usage:** Background: #0F172A; Surface: #475569; Text Primary: #CBD5E1; Text Secondary: #FFFFFF; Border: #1E293B; Accent: #0F172A

- **Gradients:** bg-gradient-to-r from-transparent to-transparent via-slate-800/60, bg-gradient-to-r from-transparent to-transparent via-blue-900/50

## Typography

Typography relies on Roboto across display, body, and utility text.

- **Display (`display-lg`):** Roboto, 60px, weight 200, line-height 60px, letter-spacing -0.025em.
- **Body (`body-md`):** Roboto, 14px, weight 400, line-height 20px.
- **Labels (`label-md`):** Roboto, 12px, weight 300, line-height 16px, letter-spacing 0.3px.

## Layout

Layout follows a grid composition with reusable spacing tokens. Preserve the grid, full bleed structural frame before changing ornament or component styling. Use 4px as the base rhythm and let larger gaps step up from that cadence instead of introducing unrelated spacing values.

Treat the page as a grid / full bleed composition, and keep that framing stable when adding or remixing sections.

- **Layout type:** Grid
- **Content width:** Full Bleed
- **Base unit:** 4px
- **Scale:** 4px, 6px, 8px, 10px, 12px, 14px, 16px, 24px
- **Section padding:** 40px, 52px
- **Gaps:** 4px, 8px, 12px, 16px

## Elevation & Depth

Depth is communicated through glass, border contrast, and reusable shadow or blur treatments. Keep those recipes consistent across hero panels, cards, and controls so the page reads as one material system.

Surfaces should read as glass first, with borders, shadows, and blur only reinforcing that material choice.

- **Surface style:** Glass
- **Borders:** 1px #1E293B; 1px #1E3A8A; 1px #475569; 1px #334155
- **Shadows:** rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(59, 130, 246, 0.2) 0px 0px 15px 0px; rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(59, 130, 246, 0.6) 0px 0px 10px 0px; rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(59, 130, 246, 0.1) 0px 0px 10px 0px
- **Blur:** 12px, 4px

### Techniques
- **Gradient border shell:** Use a thin gradient border shell around the main card. Wrap the surface in an outer shell with 4px padding and a 0px radius. Drive the shell with none so the edge reads like premium depth instead of a flat stroke. Keep the actual stroke understated so the gradient shell remains the hero edge treatment. Inset the real content surface inside the wrapper with a slightly smaller radius so the gradient only appears as a hairline frame.

## Shapes

Shapes stay consistent across cards, controls, and icon treatments.

- **Icon treatment:** Linear
- **Icon sets:** Solar

## Components

Anchor interactions to the detected button styles. Reuse the existing card surface recipe for content blocks.

### Buttons
- **Primary:** background #0F172A, text #CBD5E1, radius 0px, padding 12px, border 1px solid rgba(30, 41, 59, 0.6).
- **Links:** text #64748B, radius 0px, padding 10px, border 0px solid rgb(229, 231, 235).

### Cards and Surfaces
- **Card surface:** background rgba(15, 23, 42, 0.3), border 1px solid rgba(30, 41, 59, 0.6), radius 0px, padding 36px, shadow none, blur 12px.

### Iconography
- **Treatment:** Linear.
- **Sets:** Solar.

## Do's and Don'ts

Use these constraints to keep future generations aligned with the current system instead of drifting into adjacent styles.

### Do
- Do use the primary palette as the main accent for emphasis and action states.
- Do keep spacing aligned to the detected 4px rhythm.
- Do reuse the Glass surface treatment consistently across cards and controls.

### Don't
- Don't introduce extra accent colors outside the core palette roles unless the page needs a new semantic state.
- Don't mix unrelated shadow or blur recipes that break the current depth system.
- Don't exceed the detected moderate motion intensity without a deliberate reason.

## Motion

Motion feels controlled and interface-led across text, layout, and section transitions. Timing clusters around 150ms and 500ms. Easing favors ease and cubic-bezier(0.4. Hover behavior focuses on stroke and color changes.

**Motion Level:** moderate

**Durations:** 150ms, 500ms

**Easings:** ease, cubic-bezier(0.4, 0, 0.2, 1)

**Hover Patterns:** stroke, color, text, shadow

## WebGL

Reconstruct the graphics as a full-bleed background field using webgl, renderer, alpha, antialias, dpr clamp. The effect should read as retro-futurist, technical, and meditative: perspective grid field with green on black and sparse spacing. Build it from grid lines + depth fade so the effect reads clearly. Animate it as slow breathing pulse. Interaction can react to the pointer, but only as a subtle drift. Preserve dom fallback.

**Id:** webgl

**Label:** WebGL

**Stack:** ThreeJS, WebGL

**Insights:**
  - **Scene:**
    - **Value:** Full-bleed background field
  - **Effect:**
    - **Value:** Perspective grid field
  - **Primitives:**
    - **Value:** Grid lines + depth fade
  - **Motion:**
    - **Value:** Slow breathing pulse
  - **Interaction:**
    - **Value:** Pointer-reactive drift
  - **Render:**
    - **Value:** WebGL, Renderer, alpha, antialias, DPR clamp

**Techniques:** Perspective grid, Breathing pulse, Pointer parallax, DOM fallback

**Code Evidence:**
  - **HTML reference:**
    - **Language:** html
    - **Snippet:**
      ```html
      <canvas width="2136" height="1626" style="display: block; width: 1068px; height: 813px;"></canvas>
      ```
  - **JS reference:**
    - **Language:** js
    - **Snippet:**
      ```
      const initWebGL = () => {
          const container = document.getElementById('webgl-canvas');
          const scene = new THREE.Scene();
          const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
          const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });

          renderer.setSize(window.innerWidth, window.innerHeight);
          renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      ```
  - **Renderer setup:**
    - **Language:** js
    - **Snippet:**
      ```
      const initWebGL = () => {
          const container = document.getElementById('webgl-canvas');
          const scene = new THREE.Scene();
          const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
          const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });

          renderer.setSize(window.innerWidth, window.innerHeight);
          renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      …
      ```
  - **Scene setup:**
    - **Language:** js
    - **Snippet:**
      ```
      const initWebGL = () => {
          const container = document.getElementById('webgl-canvas');
          const scene = new THREE.Scene();
          const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
          const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });

          renderer.setSize(window.innerWidth, window.innerHeight);
      ```

## ThreeJS

Reconstruct the Three.js layer as a full-bleed background field with layered spatial depth that feels retro-futurist, volumetric, and technical. Use alpha, antialias, dpr clamp renderer settings, perspective, ~60deg fov, custom buffer geometry geometry, pointsmaterial + meshbasicmaterial materials, and ambient + point lighting. Motion should read as slow orbital drift, with poster frame + dom fallback.

**Id:** threejs

**Label:** ThreeJS

**Stack:** ThreeJS, WebGL

**Insights:**
  - **Scene:**
    - **Value:** Full-bleed background field with layered spatial depth
  - **Render:**
    - **Value:** alpha, antialias, DPR clamp
  - **Camera:**
    - **Value:** Perspective, ~60deg FOV
  - **Lighting:**
    - **Value:** ambient + point
  - **Materials:**
    - **Value:** PointsMaterial + MeshBasicMaterial
  - **Geometry:**
    - **Value:** custom buffer geometry
  - **Motion:**
    - **Value:** Slow orbital drift

**Techniques:** Particle depth, Timeline beats, alpha, antialias, DPR clamp, Poster frame + DOM fallback

**Code Evidence:**
  - **HTML reference:**
    - **Language:** html
    - **Snippet:**
      ```html
      <canvas width="2136" height="1626" style="display: block; width: 1068px; height: 813px;"></canvas>
      ```
  - **JS reference:**
    - **Language:** js
    - **Snippet:**
      ```
      const initWebGL = () => {
          const container = document.getElementById('webgl-canvas');
          const scene = new THREE.Scene();
          const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
          const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });

          renderer.setSize(window.innerWidth, window.innerHeight);
          renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      ```
  - **Renderer setup:**
    - **Language:** js
    - **Snippet:**
      ```
      const initWebGL = () => {
          const container = document.getElementById('webgl-canvas');
          const scene = new THREE.Scene();
          const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
          const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });

          renderer.setSize(window.innerWidth, window.innerHeight);
          renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      …
      ```
  - **Scene setup:**
    - **Language:** js
    - **Snippet:**
      ```
      const initWebGL = () => {
          const container = document.getElementById('webgl-canvas');
          const scene = new THREE.Scene();
          const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
          const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });

          renderer.setSize(window.innerWidth, window.innerHeight);
      ```
