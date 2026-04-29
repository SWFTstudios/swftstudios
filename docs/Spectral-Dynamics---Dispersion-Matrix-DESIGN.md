---
version: "alpha"
name: "Spectral Dynamics - Dispersion Matrix"
description: "Spectral Dynamics Onboarding Section is designed for building reusable UI components in modern web projects. Key features include reusable structure, responsive behavior, and production-ready presentation. It is suitable for component libraries and responsive product interfaces."
colors:
  primary: "#F2EAD3"
  secondary: "#000000"
  tertiary: "#E9F6D9"
  neutral: "#000000"
  background: "#F2EAD3"
  surface: "#000000"
  text-primary: "#FFFFFF"
  text-secondary: "#F2EAD3"
  border: "#FFFFFF"
  accent: "#F2EAD3"
typography:
  display-lg:
    fontFamily: "Geist"
    fontSize: "72px"
    fontWeight: 100
    lineHeight: "72px"
    letterSpacing: "-0.05em"
  body-md:
    fontFamily: "Geist"
    fontSize: "18px"
    fontWeight: 300
    lineHeight: "28px"
  label-md:
    fontFamily: "Geist"
    fontSize: "14px"
    fontWeight: 300
    lineHeight: "20px"
rounded:
  full: "9999px"
spacing:
  base: "6px"
  sm: "1px"
  md: "3.6px"
  lg: "6px"
  xl: "7.2px"
  gap: "12px"
  card-padding: "9px"
  section-padding: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.secondary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: "14px"
  card:
    backgroundColor: "#171717"
    rounded: "23px"
    padding: "28px"
---

## Overview

- **Composition cues:**
  - Layout: Grid
  - Content Width: Full Bleed
  - Framing: Glassy
  - Grid: Strong

## Colors

The color system uses dark mode with #F2EAD3 as the main accent and #000000 as the neutral foundation.

- **Primary (#F2EAD3):** Main accent and emphasis color.
- **Secondary (#000000):** Supporting accent for secondary emphasis.
- **Tertiary (#E9F6D9):** Reserved accent for supporting contrast moments.
- **Neutral (#000000):** Neutral foundation for backgrounds, surfaces, and supporting chrome.

- **Usage:** Background: #F2EAD3; Surface: #000000; Text Primary: #FFFFFF; Text Secondary: #F2EAD3; Border: #FFFFFF; Accent: #F2EAD3

- **Gradients:** bg-gradient-to-br from-white/[0.02] to-transparent via-transparent

## Typography

Typography relies on Geist across display, body, and utility text.

- **Display (`display-lg`):** Geist, 72px, weight 100, line-height 72px, letter-spacing -0.05em.
- **Body (`body-md`):** Geist, 18px, weight 300, line-height 28px.
- **Labels (`label-md`):** Geist, 14px, weight 300, line-height 20px.

## Layout

Layout follows a grid composition with reusable spacing tokens. Preserve the grid, full bleed structural frame before changing ornament or component styling. Use 6px as the base rhythm and let larger gaps step up from that cadence instead of introducing unrelated spacing values.

Treat the page as a grid / full bleed composition, and keep that framing stable when adding or remixing sections.

- **Layout type:** Grid
- **Content width:** Full Bleed
- **Base unit:** 6px
- **Scale:** 1px, 3.6px, 6px, 7.2px, 8px, 12px, 14px, 18px
- **Section padding:** 24px, 32px, 48px
- **Card padding:** 9px, 32px, 48px
- **Gaps:** 12px, 16px, 20px, 24px

## Elevation & Depth

Depth is communicated through glass, border contrast, and reusable shadow or blur treatments. Keep those recipes consistent across hero panels, cards, and controls so the page reads as one material system.

Surfaces should read as glass first, with borders, shadows, and blur only reinforcing that material choice.

- **Surface style:** Glass
- **Borders:** 1px #FFFFFF; 1px #F2EAD3
- **Shadows:** rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.1) 0px 10px 15px -3px, rgba(0, 0, 0, 0.1) 0px 4px 6px -4px; rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.25) 0px 25px 50px -12px; rgba(255, 255, 255, 0.02) 0px 0px 40px 0px inset
- **Blur:** 4px

### Techniques
- **Gradient border shell:** Use a thin gradient border shell around the main card. Wrap the surface in an outer shell with 1px padding and a 24px radius. Drive the shell with linear-gradient(to right bottom, rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.05), rgba(0, 0, 0, 0)) so the edge reads like premium depth instead of a flat stroke. Keep the actual stroke understated so the gradient shell remains the hero edge treatment. Inset the real content surface inside the wrapper with a slightly smaller radius so the gradient only appears as a hairline frame.

## Shapes

Shapes rely on a tight radius system anchored by 23px and scaled across cards, buttons, and supporting surfaces. Icon geometry should stay compatible with that soft-to-controlled silhouette.

Use the radius family intentionally: larger surfaces can open up, but controls and badges should stay within the same rounded DNA instead of inventing sharper or pill-only exceptions.

- **Corner radii:** 23px, 24px, 9999px
- **Icon treatment:** Linear
- **Icon sets:** Solar

## Components

Anchor interactions to the detected button styles. Reuse the existing card surface recipe for content blocks.

### Buttons
- **Primary:** background #F2EAD3, text #000000, radius 9999px, padding 14px, border 0px solid rgb(229, 231, 235).

### Cards and Surfaces
- **Card surface:** background #171717, border 0px solid rgb(229, 231, 235), radius 23px, padding 28px, shadow rgba(255, 255, 255, 0.02) 0px 0px 40px 0px inset.

### Iconography
- **Treatment:** Linear.
- **Sets:** Solar.

## Do's and Don'ts

Use these constraints to keep future generations aligned with the current system instead of drifting into adjacent styles.

### Do
- Do use the primary palette as the main accent for emphasis and action states.
- Do keep spacing aligned to the detected 6px rhythm.
- Do reuse the Glass surface treatment consistently across cards and controls.
- Do keep corner radii within the detected 23px, 24px, 9999px family.

### Don't
- Don't introduce extra accent colors outside the core palette roles unless the page needs a new semantic state.
- Don't mix unrelated shadow or blur recipes that break the current depth system.
- Don't exceed the detected moderate motion intensity without a deliberate reason.

## Motion

Motion feels controlled and interface-led across text, layout, and section transitions. Timing clusters around 150ms and 300ms. Easing favors ease and cubic-bezier(0.4. Hover behavior focuses on text and transform changes. Scroll choreography uses GSAP ScrollTrigger for section reveals and pacing.

**Motion Level:** moderate

**Durations:** 150ms, 300ms, 200ms

**Easings:** ease, cubic-bezier(0.4, 0, 0.2, 1)

**Hover Patterns:** text, transform

**Scroll Patterns:** gsap-scrolltrigger

## WebGL

Reconstruct the graphics as a full-bleed background field using webgl, renderer, alpha, dpr clamp, custom shaders. The effect should read as retro-futurist, technical, and meditative: dot-matrix particle field with green on black and sparse spacing. Build it from dot particles + soft depth fade so the effect reads clearly. Animate it as slow breathing pulse. Interaction can react to the pointer, but only as a subtle drift. Preserve reduced motion + dom fallback.

**Id:** webgl

**Label:** WebGL

**Stack:** ThreeJS, WebGL

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
    - **Value:** WebGL, Renderer, alpha, DPR clamp, custom shaders

**Techniques:** Dot matrix, Breathing pulse, Pointer parallax, Shader gradients, Noise fields

**Code Evidence:**
  - **HTML reference:**
    - **Language:** html
    - **Snippet:**
      ```html
      <div class="fixed inset-0 z-0 bg-[#000000]">
          <!-- WebGL Canvas Background -->
          <canvas id="webgl-canvas" class="absolute inset-0 w-full h-full pointer-events-none block"></canvas>

          <!-- Depth Grid: Diagonal hairline grid -->
      ```
  - **JS reference:**
    - **Language:** js
    - **Snippet:**
      ```
      // --- WebGL Three.js Chromatic Dispersion Setup ---
      const initThreeJS = () => {
          const canvas = document.getElementById('webgl-canvas');
          if (!canvas || typeof THREE === 'undefined') return;

          const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
          renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      …
      ```
  - **Renderer setup:**
    - **Language:** js
    - **Snippet:**
      ```
      const initThreeJS = () => {
          const canvas = document.getElementById('webgl-canvas');
          if (!canvas || typeof THREE === 'undefined') return;

          const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
          renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

          const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      …
      ```
  - **Scene setup:**
    - **Language:** js
    - **Snippet:**
      ```
      // --- WebGL Three.js Chromatic Dispersion Setup ---
      const initThreeJS = () => {
          const canvas = document.getElementById('webgl-canvas');
          if (!canvas || typeof THREE === 'undefined') return;
      ```
  - **Draw call:**
    - **Language:** js
    - **Snippet:**
      ```
      const scene = new THREE.Scene();
      const geometry = new THREE.PlaneGeometry(2, 2);

      const fragmentShader = `
          uniform float u_time;
          uniform vec2 u_resolution;
          uniform float u_fidelity;
      …
      ```

## ThreeJS

Reconstruct the Three.js layer as a full-bleed background field with layered spatial depth that feels retro-futurist and technical. Use alpha, dpr clamp renderer settings, orthographic projection, plane geometry, shadermaterial materials, and ambient + key + rim lighting. Motion should read as slow orbital drift, with reduced motion + non-3d fallback.

**Id:** threejs

**Label:** ThreeJS

**Stack:** ThreeJS, WebGL

**Insights:**
  - **Scene:**
    - **Value:** Full-bleed background field with layered spatial depth
  - **Render:**
    - **Value:** alpha, DPR clamp
  - **Camera:**
    - **Value:** Orthographic projection
  - **Lighting:**
    - **Value:** ambient + key + rim
  - **Materials:**
    - **Value:** ShaderMaterial
  - **Geometry:**
    - **Value:** plane
  - **Motion:**
    - **Value:** Slow orbital drift

**Techniques:** Shader materials, Timeline beats, alpha, DPR clamp, Reduced motion + non-3D fallback

**Code Evidence:**
  - **HTML reference:**
    - **Language:** html
    - **Snippet:**
      ```html
      <div class="fixed inset-0 z-0 bg-[#000000]">
          <!-- WebGL Canvas Background -->
          <canvas id="webgl-canvas" class="absolute inset-0 w-full h-full pointer-events-none block"></canvas>

          <!-- Depth Grid: Diagonal hairline grid -->
      ```
  - **JS reference:**
    - **Language:** js
    - **Snippet:**
      ```
      // --- WebGL Three.js Chromatic Dispersion Setup ---
      const initThreeJS = () => {
          const canvas = document.getElementById('webgl-canvas');
          if (!canvas || typeof THREE === 'undefined') return;

          const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
          renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      …
      ```
  - **Renderer setup:**
    - **Language:** js
    - **Snippet:**
      ```
      const initThreeJS = () => {
          const canvas = document.getElementById('webgl-canvas');
          if (!canvas || typeof THREE === 'undefined') return;

          const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
          renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

          const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      …
      ```
  - **Scene setup:**
    - **Language:** js
    - **Snippet:**
      ```
      // --- WebGL Three.js Chromatic Dispersion Setup ---
      const initThreeJS = () => {
          const canvas = document.getElementById('webgl-canvas');
          if (!canvas || typeof THREE === 'undefined') return;
      ```
  - **Draw call:**
    - **Language:** js
    - **Snippet:**
      ```
      const scene = new THREE.Scene();
      const geometry = new THREE.PlaneGeometry(2, 2);

      const fragmentShader = `
          uniform float u_time;
          uniform vec2 u_resolution;
          uniform float u_fidelity;
      …
      ```
