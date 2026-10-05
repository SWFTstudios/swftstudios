# SWFT 3D Cube

An interactive 3D cube with its own image slideshow on each of its six faces. It uses no dependencies: CSS 3D transforms, Pointer Events and one `requestAnimationFrame` loop.

- Styles: [`css/swft-cube.css`](../css/swft-cube.css)
- Behavior: [`js/swft-cube.js`](../js/swft-cube.js)
- Ocean stage (optional): [`css/swft-ocean.css`](../css/swft-ocean.css) + [`js/swft-ocean.js`](../js/swft-ocean.js)
- Live on the homepage hero: [`index.html`](../index.html) with [`css/home-hero-ocean.css`](../css/home-hero-ocean.css)
- Demo page: [`/cube.html`](../cube.html) (`noindex`)

## Interactions

| Input | Result |
| --- | --- |
| Drag / swipe (mouse, touch, pen) | Rotates the cube freely. On release it snaps to the nearest face. |
| Fast flick | Uses the flick's momentum and always moves at least one face in that direction. |
| Vertical swipe | Turns the top or bottom face to the front. A horizontal swipe from there goes back to the four side faces. |
| Tap / click the front face | Next slide. Tapping the left third shows the previous slide. |
| Tap / click a side face | Rotates that face to the front. |
| Hover (fine pointer only) | Tilts the cube toward the pointer, scales it up slightly, coasts the idle spin to a stop and holds the current photo. |
| Keyboard (cube focused) | `←` `→` `↑` `↓` rotate. `Enter` / `Space` shows the next slide. |
| HUD buttons / dots | Rotate left or right, or jump to a slide on the front face. |

**Idle spin.** When nobody is using it, the cube spins slowly and continuously (`data-spin`, in degrees per second).
- A drag, tap, key press or button press stops the spin instantly, and you grab the cube where it is.
- Hovering with a mouse lets the spin coast to a stop in about 0.3s, so a face is easy to tap.
- After 3s without input, the cube eases back toward level and the spin ramps up over about 2s.
- A mouse click that focuses the cube doesn't block the spin. Keyboard focus (`:focus-visible`) does, until focus leaves.
- While it spins on its own, the HUD label's `aria-live` is off, so screen readers don't announce every face that passes.

Slideshows and the spin pause while the tab is hidden. With `prefers-reduced-motion`, the spin and auto-advance are off, and moves happen instantly.

## Markup

```html
<link href="css/swft-cube.css" rel="stylesheet">

<div class="swft-cube" data-swft-cube
     data-spin="14"
     data-slide-interval="3200"
     tabindex="0" role="region" aria-roledescription="3D image cube" aria-label="Our work">
  <div class="swft-cube__scene">
    <div class="swft-cube__body">
      <div data-face="front"  data-label="Websites"> <img class="swft-cube__slide" src="…" alt="…"> … </div>
      <div data-face="right"  data-label="…"> … </div>
      <div data-face="back"   data-label="…"> … </div>
      <div data-face="left"   data-label="…"> … </div>
      <div data-face="top"    data-label="…"> … </div>
      <div data-face="bottom" data-label="…"> … </div>
    </div>
  </div>
</div>

<script src="js/swft-cube.js"></script>
```

- `data-spin`: idle spin speed in degrees per second. `14` is one full turn about every 26s. Omit it or set it to `0` to turn the spin off. `data-slide-interval`: milliseconds between slides on each face (default 3500).
- Each face can hold any number of images. A face with 2 or more images gets progress pips and an auto-advancing slideshow. Faces advance at staggered times so they don't flip together.
- `data-label` shows as a chip on the face and in the HUD, where screen readers hear it through `aria-live`.
- The script builds the HUD (rotate buttons, current face label, slide dots, hint) automatically.
- Size: override `--cube-size` on `.swft-cube` (default `min(64vw, 320px)`).
- Glowing glass look: add `swft-cube--glow` to `.swft-cube`. Square, sharp corners (`--cube-radius: 0`), clear photos behind a faint glass sheen; inside the ocean stage the faces get bright ice-blue edges and a strong outer glow.
- Scrolling on touch: by default the cube handles every swipe that starts on it, so the page doesn't scroll there. Add `data-vertical-swipe="false"` to let vertical swipes scroll the page. Horizontal swipes still spin the cube.
- Cubes added after page load: call `SwftCube.init()`.
- Event: the root dispatches `swftcube:facechange` with `detail.face` whenever the front face changes.

## Edge cases

- Images are square-cropped with `object-fit: cover`, so use images whose subject is centred.
- The first slide of each face loads eagerly and the others lazily.
- When the cube lands on the top or bottom face, its Y rotation resets to the front orientation so the face reads upright.
- On phones, a rotating cube's corners can extend past the viewport. `cube.html` clips that with `overflow-x: clip` on `main`, and any host page needs the same.

## Ocean stage (optional)

Wrap the cube in `<section class="swft-ocean" data-swft-ocean>` and load `css/swft-ocean.css` and `js/swft-ocean.js` after `js/swft-cube.js`. The cube then hovers over a black, glassy night sea, and the cube itself is the only light:
- **Cube:** glowing ice-blue edges and an inner glow (CSS box-shadows, so the 3D stays intact), with bloom around it in the WebGL scene.
- **Water:** a long, low swell rolls toward the camera with faster, sharp-crested ripples on top. The thin crests between the viewer and the cube glow blue where its light passes through them, and the troughs fall away darker.
- **Reflection:** the camera sits just above the water, so the cube's glowing edges mirror in the moving ripples as a long, broken streak, with glints where its light catches the water.
- **Mist:** faint mist lies on the water under the cube.
- **Touching the water:** the cube floats low (`data-hover-gap`, `0.11` on the homepage), so as it spins and bobs its lowest corners dip into the crests. Each touch sends a ripple ring spreading across the surface; a corner that stays in the water keeps small rings pulsing out from it. The rings tilt the water's surface in the shader, so they show up as bending lines in the cube's glow and reflection. No droplets or spray. If a drag tilts the cube so a corner would sink deep, the cube bobs up (buoyancy). Rings from new touches are off under `prefers-reduced-motion`.
- **Alignment:** the cube's on-screen position (`--cube-y`) is solved from the same camera the water uses, so the reflection always lines up. It bobs gently. When the stage is short for the cube, the camera tilts up (by up to 6°) so the spinning cube's corners stay clear of the top edge.

Rendering:
- **Speed:** resolution starts within a fixed pixel budget and steps down when frames run slow. Rendering pauses when the stage is off screen or the tab is hidden.
- **Reduced motion:** with `prefers-reduced-motion`, the water keeps moving at about a third of the speed instead of freezing, and the cube stops bobbing.
- **No WebGL:** the stage keeps a painted CSS still of the scene (`.swft-ocean--static`).

Options and hooks:
- `data-hover-gap` on `.swft-ocean`: water line to cube bottom, in cube widths (default `0.5`; the homepage uses `0.2` so the cube sits just above the crests).
- `swftocean:ready` bubbles from the stage after its first frame (or at once on the static fallback). The homepage waits for it before running its intro, with a 1.5s fallback.
- Load-intro letter cubes render as **cut-crystal prisms** (faceted ice glass, chromatic prism sheen, carved SWFT glyphs) in [`js/swft-ocean.js`](../js/swft-ocean.js). Metaphor: a prism of ideas in the mind; the four SWFT crystals join like Infinity Stones into one system. Cubes hold off-camera for the first 10% of load, fly into the birdseye frame while the camera stays top-down, then spiral inward as `introCam` tilts into the hero (orbits shrink to stay framed). Near impact they share a soft crystalline spark (capped flash — not a full whiteout) and clear to the single white WebGL cube, which hands off to the **homepage crystal rock** ([`js/swft-crystal.js`](../js/swft-crystal.js)) — an irregular multi-face polyhedron whose faces (big and small) crossfade project photos. Without WebGL, the swirl is skipped and only the camera descent + DOM crystal handoff run. A 20s failsafe (replacing the head script's 12s timer once the intro JS runs) always reveals the page.

## Homepage hero

The ocean stage on the homepage hosts a **crystal rock of ideas** ([`js/swft-crystal.js`](../js/swft-crystal.js)) instead of the CSS photo cube. `cube.html` still uses the six-face cube.
- **Desktop (≥ 992px):** the ocean is full-bleed across the hero. A soft left scrim keeps the copy readable while the water shows through; the crystal sits on the right (`data-cube-bias-x="0.25"`, scene `left: 75%`).
- **Tablet and mobile:** the scene sits at the top of the hero, straight under the nav, and the copy sits below it. The scene is up to `56svh` tall (`--hero-scene-h`), trimmed on short screens so the headline and buttons stay above the fold, and never under `38svh`. The buttons sit side by side (they stack below 360px). On phones the scene runs edge to edge past the body's 12px gutter.
- **Controls:** drag or arrow keys tumble the crystal freely on pitch / yaw / roll (vertices can face the viewer); faces crossfade photos on staggered timers. No cube HUD on the homepage.
- **Pointer events:** the copy wrappers above the scene pass pointer events through, and only the copy, the buttons and the work marquee take them. The crystal scene alone receives pointer events over the water.
- **Removed from the homepage:** the Vimeo intro loader (`#swft-hero-loader`, `js/hero-vimeo-loader.js`, the Vimeo player API) and the hidden legacy cube videos. Other pages still use the Vimeo hero. The interactive CSS cube remains on [`cube.html`](../cube.html).
