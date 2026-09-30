/* ============================================================
   SWFT 3D Cube — six-face image slideshow cube.
   Enhances every [data-swft-cube] element. Markup contract and
   options are documented in docs/SWFT_CUBE.md.

   Gestures
     drag / swipe   rotate the cube freely; release snaps to a face,
                    a fast flick always advances at least one face
     tap / click    front face: next slide (left third = previous)
                    side face: rotate that face to the front
     hover (mouse)  cube tilts toward the pointer, idle spin coasts to a stop
     keyboard       arrows rotate, Enter/Space = next slide
     idle           slow continuous spin (data-spin, deg/s) that eases
                    out on any interaction and eases back in afterwards
   ============================================================ */
(function () {
  "use strict";

  var FACE_ORDER = ["front", "right", "back", "left", "top", "bottom"];
  // Cube rotation (rx, ry) that brings each face to the viewer.
  var FACE_ANGLES = {
    front: [0, 0], left: [0, 90], back: [0, 180], right: [0, -90],
    top: [-90, null], bottom: [90, null]
  };

  var DRAG_DEG_PER_PX = 0.45;
  var TAP_SLOP_PX = 8;
  var FLICK_SPEED = 0.35;       // px per ms
  var FLICK_PROJECTION = 220;   // ms of momentum projected before snapping
  var HOVER_TILT_DEG = 12;
  var REST_TILT = [-10, 16];    // idle x/y lean so the cube always reads as 3D
  var IDLE_RESUME_MS = 3000;     // quiet time before the idle spin eases back in
  var SPIN_EASE_IN_S = 1.6;      // time constant for the spin ramping back up
  var SPIN_EASE_OUT_S = 0.3;     // ...and for coasting to a stop on hover
  var IDLE_RETURN = 0.035;       // per-frame pull back to the level ring while idle

  var mqReduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  var mqHover = window.matchMedia ? window.matchMedia("(hover: hover) and (pointer: fine)") : null;

  function reducedMotion() { return !!(mqReduce && mqReduce.matches); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function snap90(v) { return Math.round(v / 90) * 90; }
  function mod(n, m) { return ((n % m) + m) % m; }

  function Cube(root) {
    this.root = root;
    this.scene = root.querySelector(".swft-cube__scene");
    this.body = root.querySelector(".swft-cube__body");
    if (!this.scene || !this.body) return;

    this.spinDps = parseFloat(root.getAttribute("data-spin")) || 0;
    this.spin = 0;               // current spin speed, deg/s
    this.slideMs = parseInt(root.getAttribute("data-slide-interval"), 10) || 3500;

    // Rotation state: current (rx, ry), target (tx, ty); hover tilt current/target.
    this.rx = 0; this.ry = 0; this.tx = 0; this.ty = 0;
    this.hx = this.thx = REST_TILT[0];
    this.hy = this.thy = REST_TILT[1];
    this.raf = 0;
    this.pointer = null;
    this.hovered = false;
    this.lastInteraction = 0;
    this.activeName = null;

    this.faces = {};
    this.buildFaces();
    this.buildHud();
    this.bind();
    this.updateActive();
    this.render();
    this.startTimers();
  }

  Cube.prototype.buildFaces = function () {
    var self = this;
    FACE_ORDER.forEach(function (name) {
      var el = self.body.querySelector('[data-face="' + name + '"]');
      if (!el) return;
      el.classList.add("swft-cube__face", "swft-cube__face--" + name);
      var slides = Array.prototype.slice.call(el.querySelectorAll(".swft-cube__slide"));
      if (!slides.length) {
        slides = Array.prototype.slice.call(el.querySelectorAll("img"));
        slides.forEach(function (img) { img.classList.add("swft-cube__slide"); });
      }
      slides.forEach(function (img) { img.draggable = false; });

      var pips = null;
      if (slides.length > 1) {
        pips = document.createElement("div");
        pips.className = "swft-cube__face-pips";
        pips.setAttribute("aria-hidden", "true");
        slides.forEach(function () { pips.appendChild(document.createElement("span")); });
        el.appendChild(pips);
      }
      var label = el.getAttribute("data-label");
      if (label) {
        var tag = document.createElement("span");
        tag.className = "swft-cube__face-label";
        tag.setAttribute("aria-hidden", "true");
        tag.textContent = label;
        el.appendChild(tag);
      }

      self.faces[name] = { name: name, el: el, slides: slides, pips: pips, index: 0, label: label || name };
      self.showSlide(name, 0);
    });
  };

  Cube.prototype.buildHud = function () {
    var hud = this.root.querySelector(".swft-cube__hud");
    if (!hud) {
      hud = document.createElement("div");
      hud.className = "swft-cube__hud";
      this.root.appendChild(hud);
    }
    hud.innerHTML =
      '<div class="swft-cube__controls">' +
        '<button type="button" class="swft-cube__btn" data-cube-rotate="left" aria-label="Rotate to previous face">&larr;</button>' +
        '<span class="swft-cube__current" aria-live="polite"></span>' +
        '<button type="button" class="swft-cube__btn" data-cube-rotate="right" aria-label="Rotate to next face">&rarr;</button>' +
      "</div>" +
      '<div class="swft-cube__dots" role="group" aria-label="Slides on this face"></div>' +
      '<p class="swft-cube__hint">Drag or swipe to spin &middot; tap to flip photos &middot; arrow keys work too</p>';
    this.current = hud.querySelector(".swft-cube__current");
    this.dots = hud.querySelector(".swft-cube__dots");
  };

  /* ---------------- Slides ---------------- */

  Cube.prototype.showSlide = function (name, index) {
    var face = this.faces[name];
    if (!face || !face.slides.length) return;
    face.index = mod(index, face.slides.length);
    face.slides.forEach(function (img, i) {
      img.classList.toggle("is-active", i === face.index);
    });
    if (face.pips) {
      Array.prototype.forEach.call(face.pips.children, function (pip, i) {
        pip.classList.toggle("is-active", i === face.index);
      });
    }
    if (name === this.activeName) this.renderDots();
  };

  Cube.prototype.stepSlide = function (name, delta) {
    var face = this.faces[name];
    if (face) this.showSlide(name, face.index + delta);
  };

  Cube.prototype.renderDots = function () {
    var face = this.faces[this.activeName];
    var self = this;
    this.dots.innerHTML = "";
    if (!face || face.slides.length < 2) return;
    face.slides.forEach(function (img, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "swft-cube__dot";
      b.setAttribute("aria-label", "Show " + (img.alt || "slide " + (i + 1)));
      b.setAttribute("aria-current", i === face.index ? "true" : "false");
      b.addEventListener("click", function () {
        self.touch();
        self.showSlide(face.name, i);
      });
      self.dots.appendChild(b);
    });
  };

  /* ---------------- Orientation ---------------- */

  Cube.prototype.faceForTarget = function () {
    if (this.tx <= -45) return "top";
    if (this.tx >= 45) return "bottom";
    return ["front", "left", "back", "right"][mod(Math.round(this.ty / 90), 4)];
  };

  // On top/bottom, turn Y back to the front orientation so the face reads upright.
  Cube.prototype.uprightPoles = function () {
    if (Math.abs(this.tx) >= 45) this.ty = Math.round(this.ty / 360) * 360;
  };

  Cube.prototype.updateActive = function () {
    var name = this.faceForTarget();
    if (!this.faces[name]) return;
    if (name === this.activeName) return;
    this.activeName = name;
    var self = this;
    FACE_ORDER.forEach(function (n) {
      if (self.faces[n]) self.faces[n].el.classList.toggle("is-front", n === name);
    });
    this.current.textContent = this.faces[name].label;
    this.renderDots();
    this.root.dispatchEvent(new CustomEvent("swftcube:facechange", { detail: { face: name } }));
  };

  Cube.prototype.rotateTo = function (name) {
    var a = FACE_ANGLES[name];
    if (!a) return;
    this.tx = a[0];
    // Take the shortest path around the Y axis from wherever we are now.
    if (a[1] !== null) this.ty = this.ty + (mod(a[1] - this.ty + 180, 360) - 180);
    this.uprightPoles();
    this.updateActive();
    this.kick();
  };

  Cube.prototype.rotateBy = function (dxFaces, dyFaces) {
    // Leaving the top/bottom face horizontally drops back to the ring.
    if (dxFaces && Math.abs(this.tx) >= 45) this.tx = 0;
    this.ty = snap90(this.ty) + dxFaces * 90;
    this.tx = clamp(snap90(this.tx) + dyFaces * 90, -90, 90);
    this.uprightPoles();
    this.updateActive();
    this.kick();
  };

  /* ---------------- Render loop ---------------- */

  Cube.prototype.render = function () {
    // Tilt is applied first (outermost) so it stays relative to the viewer on every face.
    this.body.style.transform =
      "rotateX(" + this.hx.toFixed(3) + "deg) rotateY(" + this.hy.toFixed(3) + "deg) " +
      "rotateX(" + this.rx.toFixed(3) + "deg) rotateY(" + this.ry.toFixed(3) + "deg)";
  };

  Cube.prototype.isIdle = function () {
    if (!this.spinDps || reducedMotion() || document.hidden) return false;
    if (this.pointer || this.hovered) return false;
    if (Date.now() - this.lastInteraction < IDLE_RESUME_MS) return false;
    var focused = document.activeElement;
    // Keyboard users keep control; a mouse click that focused the cube doesn't count.
    if (focused && this.root.contains(focused) && focused.matches(":focus-visible")) return false;
    return true;
  };

  Cube.prototype.kick = function () {
    if (this.raf) return;
    var self = this;
    var last = 0;
    var step = function (now) {
      var dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      var frames = dt * 60;
      var idle = self.isIdle();

      // Ease the spin speed toward its target: slowly back in, quicker coast out.
      var target = idle ? self.spinDps : 0;
      var tau = target > self.spin ? SPIN_EASE_IN_S : SPIN_EASE_OUT_S;
      self.spin += (target - self.spin) * (1 - Math.exp(-dt / tau));
      if (!idle && self.spin < 0.05) self.spin = 0;
      if (self.spin) {
        self.ty -= self.spin * dt;
        self.updateActive();
      }
      if (idle) {
        self.tx = 0;
        self.thx = REST_TILT[0]; self.thy = REST_TILT[1];
      }
      self.setLive(!self.spin);

      var base = reducedMotion() ? 1 : (self.pointer && self.pointer.dragging ? 0.4 : (idle ? IDLE_RETURN : 0.14));
      var k = 1 - Math.pow(1 - base, frames);
      var kt = 1 - Math.pow(0.88, frames);
      self.rx += (self.tx - self.rx) * k;
      self.ry += (self.ty - self.ry) * k;
      self.hx += (self.thx - self.hx) * kt;
      self.hy += (self.thy - self.hy) * kt;
      self.render();
      var settled = !idle && !self.spin &&
        Math.abs(self.tx - self.rx) < 0.02 && Math.abs(self.ty - self.ry) < 0.02 &&
        Math.abs(self.thx - self.hx) < 0.02 && Math.abs(self.thy - self.hy) < 0.02;
      if (settled) {
        self.rx = self.tx; self.ry = self.ty; self.hx = self.thx; self.hy = self.thy;
        self.render();
        self.raf = 0;
        return;
      }
      self.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  };

  /* ---------------- Input ---------------- */

  // Any direct interaction stops the idle spin on the spot and restarts the idle clock.
  Cube.prototype.touch = function () {
    this.lastInteraction = Date.now();
    this.spin = 0;
  };

  // Don't announce every face that passes while the cube spins on its own.
  Cube.prototype.setLive = function (on) {
    var v = on ? "polite" : "off";
    if (this.current.getAttribute("aria-live") !== v) this.current.setAttribute("aria-live", v);
  };

  Cube.prototype.bind = function () {
    var self = this;
    var scene = this.scene;

    scene.addEventListener("pointerdown", function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      self.touch();
      // Grab the cube exactly where it is, mid-spin or not.
      self.tx = self.rx; self.ty = self.ry;
      self.pointer = {
        id: e.pointerId, type: e.pointerType,
        x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t: e.timeStamp,
        vx: 0, vy: 0, dragging: false,
        tx0: self.tx, ty0: self.ty,
        target: e.target
      };
      self.root.classList.add("is-pressed");
      try { scene.setPointerCapture(e.pointerId); } catch (err) { /* capture unsupported */ }
    });

    scene.addEventListener("pointermove", function (e) {
      var p = self.pointer;
      if (!p || p.id !== e.pointerId) {
        if (!p && e.pointerType === "mouse") self.hoverTilt(e);
        return;
      }
      var dx = e.clientX - p.x;
      var dy = e.clientY - p.y;
      var dt = Math.max(1, e.timeStamp - p.t);
      // Exponentially smoothed velocity for flick detection.
      p.vx = p.vx * 0.6 + (dx / dt) * 0.4;
      p.vy = p.vy * 0.6 + (dy / dt) * 0.4;
      p.x = e.clientX; p.y = e.clientY; p.t = e.timeStamp;

      if (!p.dragging && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > TAP_SLOP_PX) {
        p.dragging = true;
        self.root.classList.add("is-dragging");
      }
      if (!p.dragging) return;
      e.preventDefault();
      self.ty += dx * DRAG_DEG_PER_PX;
      self.tx = clamp(self.tx - dy * DRAG_DEG_PER_PX, -90, 90);
      self.updateActive();
      self.kick();
    });

    var end = function (e, cancelled) {
      var p = self.pointer;
      if (!p || p.id !== e.pointerId) return;
      self.pointer = null;
      self.touch();
      self.root.classList.remove("is-pressed", "is-dragging");

      if (!p.dragging && !cancelled) {
        self.handleTap(p.target, e);
      } else {
        self.settle(p, e.timeStamp - p.t > 80);
      }
      self.kick();
    };
    scene.addEventListener("pointerup", function (e) { end(e, false); });
    scene.addEventListener("pointercancel", function (e) { end(e, true); });

    scene.addEventListener("pointerenter", function (e) {
      if (e.pointerType !== "mouse") return;
      self.hovered = true;
      self.root.classList.add("is-hovered");
    });
    scene.addEventListener("pointerleave", function (e) {
      if (e.pointerType !== "mouse") return;
      self.hovered = false;
      self.root.classList.remove("is-hovered");
      self.lastInteraction = Date.now(); // wait the idle pause before spinning again
      self.thx = REST_TILT[0]; self.thy = REST_TILT[1];
      self.kick();
    });

    // Stop native image drag ghosts / long-press menus from hijacking the gesture.
    scene.addEventListener("dragstart", function (e) { e.preventDefault(); });
    scene.addEventListener("contextmenu", function (e) {
      if (self.pointer && self.pointer.type !== "mouse") e.preventDefault();
    });

    this.root.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-cube-rotate]");
      if (!btn) return;
      self.touch();
      self.rotateBy(btn.getAttribute("data-cube-rotate") === "left" ? 1 : -1, 0);
    });

    this.root.addEventListener("keydown", function (e) {
      if (e.target.closest("button")) {
        if (e.key === "Enter" || e.key === " ") return; // let buttons activate normally
      }
      var handled = true;
      switch (e.key) {
        case "ArrowLeft": self.rotateBy(1, 0); break;
        case "ArrowRight": self.rotateBy(-1, 0); break;
        case "ArrowUp": self.rotateBy(0, -1); break;
        case "ArrowDown": self.rotateBy(0, 1); break;
        case "Enter": case " ": self.stepSlide(self.activeName, 1); break;
        default: handled = false;
      }
      if (handled) { e.preventDefault(); self.touch(); }
    });
  };

  Cube.prototype.hoverTilt = function (e) {
    if (!mqHover || !mqHover.matches || reducedMotion()) return;
    var r = this.scene.getBoundingClientRect();
    var px = (e.clientX - r.left) / r.width - 0.5;
    var py = (e.clientY - r.top) / r.height - 0.5;
    this.thy = px * 2 * HOVER_TILT_DEG;
    this.thx = -py * 2 * HOVER_TILT_DEG;
    this.kick();
  };

  Cube.prototype.handleTap = function (target, e) {
    var faceEl = target && target.closest ? target.closest(".swft-cube__face") : null;
    if (!faceEl) return;
    var name = faceEl.getAttribute("data-face");
    if (name !== this.activeName) {
      this.rotateTo(name);
      return;
    }
    // Square the face up if it was caught mid-spin.
    this.ty = snap90(this.ty);
    this.tx = clamp(snap90(this.tx), -90, 90);
    this.uprightPoles();
    var r = faceEl.getBoundingClientRect();
    var back = r.width && (e.clientX - r.left) / r.width < 1 / 3;
    this.stepSlide(name, back ? -1 : 1);
  };

  // Snap after a drag. A fast flick projects momentum and always moves at least one face.
  Cube.prototype.settle = function (p, stale) {
    var vx = stale ? 0 : p.vx;
    var vy = stale ? 0 : p.vy;
    var horizontal = Math.abs(vx) >= Math.abs(vy);

    var ty = snap90(this.ty + vx * FLICK_PROJECTION * DRAG_DEG_PER_PX);
    var tx = clamp(snap90(this.tx - vy * FLICK_PROJECTION * DRAG_DEG_PER_PX), -90, 90);

    if (horizontal && Math.abs(vx) > FLICK_SPEED && ty === snap90(p.ty0)) {
      ty += vx > 0 ? 90 : -90;
    }
    if (!horizontal && Math.abs(vy) > FLICK_SPEED && tx === snap90(p.tx0)) {
      tx = clamp(tx + (vy > 0 ? -90 : 90), -90, 90);
    }
    // A horizontal flick while looking at top/bottom returns to the side ring.
    if (horizontal && Math.abs(vx) > FLICK_SPEED && Math.abs(p.tx0) >= 45) tx = 0;

    this.ty = ty;
    this.tx = tx;
    this.uprightPoles();
    this.updateActive();
  };

  /* ---------------- Timers ---------------- */

  Cube.prototype.startTimers = function () {
    var self = this;
    var names = Object.keys(this.faces);

    // Stagger each face's slideshow so they don't all flip in lockstep.
    names.forEach(function (name, i) {
      var face = self.faces[name];
      if (face.slides.length < 2) return;
      setTimeout(function () {
        setInterval(function () {
          if (document.hidden || reducedMotion()) return;
          if (self.hovered && name === self.activeName) return; // hold the photo being looked at
          self.stepSlide(name, 1);
        }, self.slideMs);
      }, (i * self.slideMs) / names.length);
    });

    // The render loop sleeps once the cube settles; wake it when the idle spin is due.
    if (this.spinDps > 0) {
      setInterval(function () { if (self.isIdle()) self.kick(); }, 250);
      this.kick();
    }
  };

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-swft-cube]"), function (el) {
      if (el.__swftCube) return;
      el.__swftCube = new Cube(el);
    });
  }

  window.SwftCube = { init: init };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
