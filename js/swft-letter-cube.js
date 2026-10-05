/* ============================================================
   SWFT letter cube (see css/swft-letter-cube.css).
   Flattened table-cut gem with S/W/F/T on the side facets.
   Spins slowly on its own; swipe freely on all axes (pitch / yaw /
   roll + inertia). Arrow keys step yaw a face at a time. Pauses
   off-screen and in hidden tabs; no auto-spin or momentum under
   reduced motion.
   ============================================================ */
(function () {
  var TILT = -22;          // resting X tilt so the table face reads
  var SPIN = -14;          // auto-spin speed, deg/s (negative: S -> W -> F -> T)
  var DRAG = 0.55;         // deg per px — pitch / yaw
  var ROLL = 0.22;         // deg per px² curl — roll around view / vertices
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function init(el) {
    var body = el.querySelector(".swft-lcube__body");
    if (!body) return;
    el.classList.add("is-js");

    var rx = TILT, ry = -28, rz = 8;
    var vx = 0, vy = 0, vz = 0;   // momentum after a drag, deg/s
    var target = null;            // keyboard: Y angle to ease to
    var dragging = false, lastX = 0, lastY = 0, lastT = 0;
    var prevDx = 0, prevDy = 0;
    var idleAt = 0;               // when auto-spin may resume
    var visible = true, raf = 0, prev = 0;

    function render() {
      body.style.transform =
        "rotateZ(" + rz.toFixed(2) + "deg) rotateX(" + rx.toFixed(2) + "deg) rotateY(" + ry.toFixed(2) + "deg)";
    }

    function frame(t) {
      raf = 0;
      var dt = prev ? Math.min((t - prev) / 1000, 0.05) : 0;
      prev = t;
      if (!dragging) {
        if (target !== null) {
          ry += (target - ry) * Math.min(1, dt * 8);
          if (Math.abs(target - ry) < 0.05) { ry = target; target = null; }
        } else if (Math.abs(vx) > 0.5 || Math.abs(vy) > 0.5 || Math.abs(vz) > 0.5) {
          ry += vx * dt;
          rx += vy * dt;
          rz += vz * dt;
          var k = Math.pow(0.04, dt);  // momentum fades over about a second
          vx *= k; vy *= k; vz *= k;
        } else if (!reduce && t > idleAt) {
          ry += SPIN * dt;
          rz += Math.cos(t / 1000 * 0.28) * 0.04;
        }
        // Soft settle toward resting tilt / roll when nearly still
        if (Math.sqrt(vx * vx + vy * vy + vz * vz) < 12) {
          rx += (TILT - rx) * Math.min(1, dt * 1.6);
          rz += (8 - rz) * Math.min(1, dt * 1.2);
        }
      }
      render();
      if (visible && !document.hidden && (!reduce || dragging || target !== null || Math.abs(rx - TILT) > 0.05 || Math.abs(rz - 8) > 0.05)) {
        raf = requestAnimationFrame(frame);
      } else {
        prev = 0;
      }
    }

    function kick() { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame); }

    el.addEventListener("pointerdown", function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      dragging = true; target = null; vx = vy = vz = 0;
      lastX = e.clientX; lastY = e.clientY; lastT = performance.now();
      prevDx = 0; prevDy = 0;
      el.classList.add("is-dragging");
      if (el.setPointerCapture) el.setPointerCapture(e.pointerId);
      kick();
    });
    el.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var now = performance.now(), dt = Math.max((now - lastT) / 1000, 0.001);
      var dx = e.clientX - lastX, dy = e.clientY - lastY;
      // Screen-space free tumble: yaw (Y), pitch (X), roll (Z) from swipe curl
      // so the gem can turn over any face or vertex.
      ry += dx * DRAG;
      rx += dy * DRAG;
      var roll = (dx * prevDy - dy * prevDx) * ROLL * 0.08;
      roll += (dx * 0.08 - dy * 0.04) * DRAG * 0.35;
      rz += roll;
      if (!reduce) {
        vx = (dx * DRAG) / dt;
        vy = (dy * DRAG) / dt;
        vz = roll / dt;
      }
      prevDx = dx; prevDy = dy;
      lastX = e.clientX; lastY = e.clientY; lastT = now;
      render();
    });
    function end() {
      if (!dragging) return;
      dragging = false;
      el.classList.remove("is-dragging");
      if (performance.now() - lastT > 80) vx = vy = vz = 0;  // held still before letting go
      vx = Math.max(-900, Math.min(900, vx));
      vy = Math.max(-900, Math.min(900, vy));
      vz = Math.max(-900, Math.min(900, vz));
      idleAt = performance.now() + 1500;
      kick();
    }
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("lostpointercapture", end);

    el.addEventListener("keydown", function (e) {
      var stepY = { ArrowLeft: 90, ArrowRight: -90 }[e.key];
      var stepX = { ArrowUp: -18, ArrowDown: 18 }[e.key];
      if (stepY) {
        e.preventDefault();
        vx = vy = vz = 0;
        var base = target !== null ? target : Math.round(ry / 90) * 90;
        target = base + stepY;
        rz -= stepY > 0 ? 6 : -6;
        idleAt = performance.now() + 2500;
        kick();
      } else if (stepX) {
        e.preventDefault();
        vx = vy = vz = 0;
        target = null;
        rx += stepX;
        rz += stepX > 0 ? -4 : 4;
        idleAt = performance.now() + 2500;
        kick();
      }
    });

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) kick();
      }).observe(el);
    }
    document.addEventListener("visibilitychange", kick);

    render();
    kick();
  }

  function start() {
    document.querySelectorAll(".swft-lcube").forEach(init);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
