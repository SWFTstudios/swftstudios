/* ============================================================
   SWFT letter cube (see css/swft-letter-cube.css).
   Spins slowly on its own; drag to turn it (with a little momentum),
   arrow keys turn it a face at a time. Pauses off-screen and in hidden
   tabs; no auto-spin or momentum under reduced motion.
   ============================================================ */
(function () {
  var TILT = -18;          // resting X tilt so the top edge shows
  var SPIN = -14;          // auto-spin speed, deg/s (negative: S -> W -> F -> T)
  var DRAG = 0.45;         // deg per px dragged
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function init(el) {
    var body = el.querySelector(".swft-lcube__body");
    if (!body) return;
    el.classList.add("is-js");

    var rx = TILT, ry = -28;
    var vx = 0, vy = 0;              // momentum after a drag, deg/s
    var target = null;               // keyboard: Y angle to ease to
    var dragging = false, lastX = 0, lastY = 0, lastT = 0;
    var idleAt = 0;                  // when auto-spin may resume
    var visible = true, raf = 0, prev = 0;

    function render() {
      body.style.transform = "rotateX(" + rx.toFixed(2) + "deg) rotateY(" + ry.toFixed(2) + "deg)";
    }

    function frame(t) {
      raf = 0;
      var dt = prev ? Math.min((t - prev) / 1000, 0.05) : 0;
      prev = t;
      if (!dragging) {
        if (target !== null) {
          ry += (target - ry) * Math.min(1, dt * 8);
          if (Math.abs(target - ry) < 0.05) { ry = target; target = null; }
        } else if (Math.abs(vx) > 0.5 || Math.abs(vy) > 0.5) {
          ry += vy * dt; rx += vx * dt;
          var k = Math.pow(0.04, dt);  // momentum fades over about a second
          vx *= k; vy *= k;
        } else if (!reduce && t > idleAt) {
          ry += SPIN * dt;
        }
        rx += (TILT - rx) * Math.min(1, dt * 2.5);  // settle back to the resting tilt
      }
      render();
      if (visible && !document.hidden && (!reduce || dragging || target !== null || Math.abs(rx - TILT) > 0.05)) {
        raf = requestAnimationFrame(frame);
      } else {
        prev = 0;
      }
    }

    function kick() { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame); }

    el.addEventListener("pointerdown", function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      dragging = true; target = null; vx = vy = 0;
      lastX = e.clientX; lastY = e.clientY; lastT = performance.now();
      el.classList.add("is-dragging");
      if (el.setPointerCapture) el.setPointerCapture(e.pointerId);
      kick();
    });
    el.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var now = performance.now(), dt = Math.max((now - lastT) / 1000, 0.001);
      var dx = e.clientX - lastX, dy = e.clientY - lastY;
      ry += dx * DRAG;
      rx = Math.max(-70, Math.min(40, rx - dy * DRAG));
      if (!reduce) { vy = (dx * DRAG) / dt; vx = (-dy * DRAG) / dt * 0.5; }
      lastX = e.clientX; lastY = e.clientY; lastT = now;
      render();
    });
    function end() {
      if (!dragging) return;
      dragging = false;
      el.classList.remove("is-dragging");
      if (performance.now() - lastT > 80) vx = vy = 0;  // held still before letting go
      vy = Math.max(-900, Math.min(900, vy));
      idleAt = performance.now() + 1500;
      kick();
    }
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("lostpointercapture", end);

    el.addEventListener("keydown", function (e) {
      var step = { ArrowLeft: 90, ArrowRight: -90 }[e.key];
      if (step) {
        e.preventDefault();
        vx = vy = 0;
        var base = target !== null ? target : Math.round(ry / 90) * 90;
        target = base + step;
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
