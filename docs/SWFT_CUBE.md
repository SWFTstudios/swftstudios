# SWFT 3D Cube

An interactive 3D cube with its own image slideshow on each of its six faces. It uses no dependencies: CSS 3D transforms, Pointer Events and one `requestAnimationFrame` loop.

- Styles: [`css/swft-cube.css`](../css/swft-cube.css)
- Behavior: [`js/swft-cube.js`](../js/swft-cube.js)
- Demo page: [`/cube.html`](../cube.html) (`noindex` until it is placed on a live page)

## Interactions

| Input | Result |
| --- | --- |
| Drag / swipe (mouse, touch, pen) | Rotates the cube freely. On release it snaps to the nearest face. |
| Fast flick | Uses the flick's momentum and always moves at least one face in that direction. |
| Vertical swipe | Turns the top or bottom face to the front. A horizontal swipe from there goes back to the four side faces. |
| Tap / click the front face | Next slide. Tapping the left third shows the previous slide. |
| Tap / click a side face | Rotates that face to the front. |
| Hover (fine pointer only) | Tilts the cube toward the pointer, scales it up slightly, pauses auto-rotate and holds the current photo. |
| Keyboard (cube focused) | `←` `→` `↑` `↓` rotate. `Enter` / `Space` shows the next slide. |
| HUD buttons / dots | Rotate left or right, or jump to a slide on the front face. |

The idle auto-rotate (`data-auto-rotate`) waits 4s after the last interaction and doesn't run while the cube is hovered, dragged or focused. Slideshows and auto-rotate pause while the tab is hidden. With `prefers-reduced-motion`, auto-rotate and auto-advance are off, and moves happen instantly.

## Markup

```html
<link href="css/swft-cube.css" rel="stylesheet">

<div class="swft-cube" data-swft-cube
     data-auto-rotate="5000"
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

- `data-auto-rotate`: milliseconds between idle face turns. Omit it or set it to `0` to turn auto-rotate off. `data-slide-interval`: milliseconds between slides on each face (default 3500).
- Each face can hold any number of images. A face with 2 or more images gets progress pips and an auto-advancing slideshow. Faces advance at staggered times so they don't flip together.
- `data-label` shows as a chip on the face and in the HUD, where screen readers hear it through `aria-live`.
- The script builds the HUD (rotate buttons, current face label, slide dots, hint) automatically.
- Size: override `--cube-size` on `.swft-cube` (default `min(64vw, 320px)`).
- Scrolling on touch: by default the cube handles every swipe that starts on it, so the page doesn't scroll there. Add `data-vertical-swipe="false"` to let vertical swipes scroll the page. Horizontal swipes still spin the cube.
- Cubes added after page load: call `SwftCube.init()`.
- Event: the root dispatches `swftcube:facechange` with `detail.face` whenever the front face changes.

## Edge cases

- Images are square-cropped with `object-fit: cover`, so use images whose subject is centred.
- The first slide of each face loads eagerly and the others lazily.
- When the cube lands on the top or bottom face, its Y rotation resets to the front orientation so the face reads upright.
- On phones, a rotating cube's corners can extend past the viewport. `cube.html` clips that with `overflow-x: clip` on `main`, and any host page needs the same.
