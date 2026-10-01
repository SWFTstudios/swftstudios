/* ============================================================
   SWFT hologram city (see css/swft-city.css).

   A 3D city grid drawn on a 2D canvas with its own small perspective
   camera (no libraries). Every ~15s the city grows from its centre:
   a wave rolls outward, towers rise as it passes and their window lights
   switch on behind it. Then it holds, pulsing rings sweep the grid, and it
   settles and starts again. The camera turns slowly; drag to turn it.
   Tap the ground to send a pulse ring out from that spot: the towers
   around it light up and glow.

   Pauses off-screen and in hidden tabs. Reduced motion: one still frame of
   the finished city (drag and tap still work; the tap glow fades in place
   instead of travelling).
   ============================================================ */
(function () {
  "use strict";

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var CYCLE = 15;      // seconds per growth cycle
  var GROW = 6.5;      // growth wave rolls out for this long
  var HOLD_END = 12.5; // pulsing hold ends, city settles
  var SETTLE = 2;      // seconds to settle back to the ground
  var PITCH = 0.9;     // camera tilt (radians)
  var SPIN = 0.05;     // auto-rotation, rad/s
  var PULSE_LIFE = 2.6;   // seconds a tapped pulse lasts
  var PULSE_SPEED = 6;    // ring speed, city units per second
  var PULSE_AREA = 2.7;   // radius of the lingering glow around a tap
  var MAX_PULSES = 6;

  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function ease(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }

  /* ---------------- City layout (deterministic) ---------------- */

  function makeCity(n) {
    var rand = rng(11), cells = [], half = (n - 1) / 2;
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        var x = i - half, z = j - half, d = Math.sqrt(x * x + z * z);
        if (d > 1.7 && rand() < 0.08) continue;              // a few plazas
        var core = Math.exp(-(d * d) / (n * n * 0.06));      // downtown is taller
        var h = 0.3 + (0.35 + rand() * 0.9) * (0.4 + 2.7 * core);
        var rows = Math.max(1, Math.floor(h * 3.2)), win = [];
        for (var f = 0; f < 4; f++) {
          var a = new Float32Array(rows * 3);
          for (var k = 0; k < a.length; k++) a[k] = rand();
          win.push(a);
        }
        cells.push({ x: x, z: z, d: d, h: h, s: 0.29 + rand() * 0.07, rows: rows, win: win });
      }
    }
    return { cells: cells, half: half, n: n, maxD: Math.sqrt(2) * half };
  }

  /* ---------------- One city on one canvas ---------------- */

  function init(el) {
    var canvas = el.querySelector("canvas");
    var ctx = canvas && canvas.getContext && canvas.getContext("2d");
    if (!ctx) return;

    var W = 0, H = 0, dpr = 1, city = null, f = 1, cx0 = 0, cy0 = 0;
    var clock = 0, spinYaw = 0.7, userYaw = 0, velYaw = 0;
    var visible = false, raf = 0, last = 0, dragging = false, dragX = 0, dragT = 0;
    var downX = 0, downY = 0, downT = 0, moved = 0, pulses = [];
    var bleedX = 0, bleedY = 0; // the canvas extends past the box by this much on each side

    function resize() {
      // The visible box is the layout box; the canvas is larger (see the CSS)
      // so glow, the rotating plate corners and the beacon never get cut off.
      var bw = el.clientWidth, bh = el.clientHeight;
      if (!bw || !bh) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth || bw; H = canvas.clientHeight || bh;
      bleedX = (W - bw) / 2; bleedY = (H - bh) / 2;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      var n = bw < 460 ? 9 : 11;
      if (!city || city.n !== n) city = makeCity(n);
      var radius = city.maxD + 1.6;
      var D = city.n * 1.55;
      var fit = bw < 460 ? 0.46 : 0.4;
      f = fit * Math.min(bw, bh) * D / radius;
      cx0 = W / 2;
      cy0 = bleedY + bh * (bw < 460 ? 0.56 : 0.6);
      if (!visible || reduce) frame(0, true);
    }

    /* camera */
    var cyaw = 1, syaw = 0, cp = Math.cos(PITCH), sp = Math.sin(PITCH), DIST = 14;
    function setCamera(yaw) {
      cyaw = Math.cos(yaw); syaw = Math.sin(yaw);
      DIST = city.n * 1.55;
    }
    var px = 0, py = 0;
    function project(x, y, z) {
      var X = x * cyaw - z * syaw;
      var Z = x * syaw + z * cyaw;
      var Y2 = y * cp + Z * sp;
      var Z2 = -y * sp + Z * cp + DIST;
      var k = f / Z2;
      px = cx0 + X * k;
      py = cy0 - Y2 * k;
    }

    /* ---- drawing ---- */

    function frame(dt, still) {
      if (!city || !W) return;
      var c, tt;
      if (still) { c = 10; tt = 0; } else { c = clock % CYCLE; tt = clock; }
      var yaw = spinYaw + userYaw;
      setCamera(yaw);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      var cells = city.cells, half = city.half, maxD = city.maxD;
      var pulse = still ? 0.9 : 0.82 + 0.18 * Math.sin(tt * 2.4);
      var wave = c < GROW + 3 ? (c / GROW) * (maxD + 2.6) : 99;          // growth wave radius
      var life = c < HOLD_END ? 1 : 1 - ease((c - HOLD_END) / SETTLE);   // settle back down
      var ring = (!still && c > GROW && c < HOLD_END) ? ((c - GROW) % 2.6) / 2.6 * (maxD + 3) : -1;

      // Tapped pulses: ring radius, fade, and the area they light up
      var pr = [];
      for (var pi = 0; pi < pulses.length; pi++) {
        var pu = pulses[pi], k0 = 1 - pu.age / PULSE_LIFE;
        if (k0 <= 0) continue;
        pr.push({ x: pu.x, z: pu.z, k: k0, rad: reduce ? 2.4 : Math.min(pu.age * PULSE_SPEED, maxD + 3) });
      }

      // Soft light pool under the city
      project(0, 0, 0);
      var gr = Math.min(W - 2 * bleedX, H - 2 * bleedY) * 0.55;
      var pool = ctx.createRadialGradient(px, py, 0, px, py, gr);
      pool.addColorStop(0, "rgba(86,180,233," + (0.22 * pulse * (0.4 + 0.6 * life)).toFixed(3) + ")");
      pool.addColorStop(1, "rgba(86,180,233,0)");
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(1, 0.55);
      ctx.translate(-px, -py);
      ctx.fillStyle = pool;
      ctx.fillRect(px - gr, py - gr, gr * 2, gr * 2);
      ctx.restore();

      // Base plate and street grid
      var ext = half + 1.2, x0, y0;
      ctx.beginPath();
      var off = city.n % 2 ? 0.5 : 0; // streets run between the towers
      for (var g = -Math.ceil(ext); g <= Math.ceil(ext); g++) {
        var gl = g + off;
        if (Math.abs(gl) > ext) continue;
        project(gl, 0, -ext); x0 = px; y0 = py; project(gl, 0, ext); ctx.moveTo(x0, y0); ctx.lineTo(px, py);
        project(-ext, 0, gl); x0 = px; y0 = py; project(ext, 0, gl); ctx.moveTo(x0, y0); ctx.lineTo(px, py);
      }
      ctx.strokeStyle = "rgba(120,200,245," + (0.13 * pulse).toFixed(3) + ")";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.beginPath();
      project(-ext, 0, -ext); ctx.moveTo(px, py);
      project(ext, 0, -ext); ctx.lineTo(px, py);
      project(ext, 0, ext); ctx.lineTo(px, py);
      project(-ext, 0, ext); ctx.lineTo(px, py);
      ctx.closePath();
      ctx.strokeStyle = "rgba(190,230,255," + (0.55 * pulse).toFixed(3) + ")";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Growth wavefront and pulse rings on the ground
      if (wave < maxD + 3 && life > 0) ringOnGround(wave, 0.9, 2.2);
      if (ring >= 0) ringOnGround(ring, 0.55 * (1 - ring / (maxD + 3)) + 0.1, 1.6);
      for (var gi = 0; gi < pr.length; gi++) {
        var pk = pr[gi];
        ctx.beginPath();
        for (var di = 0; di <= 48; di++) {
          var dt2 = di / 48 * Math.PI * 2;
          project(pk.x + Math.cos(dt2) * pk.rad, 0, pk.z + Math.sin(dt2) * pk.rad);
          if (di) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = "rgba(86,180,233," + (0.11 * pk.k).toFixed(3) + ")";
        ctx.fill();
        ringOnGround(pk.rad, 0.95 * pk.k, 2.4, pk.x, pk.z);
        ringOnGround(pk.rad * 0.62, 0.5 * pk.k, 1.3, pk.x, pk.z);
      }

      // Towers
      var dim = [], mid = [], bright = [];
      for (var ci = 0; ci < cells.length; ci++) {
        var cell = cells[ci];
        var g0 = ease((wave - cell.d) / 2.4);
        var Hc = cell.h * g0 * life;
        var lit = clamp((wave - cell.d) / 7, 0, 1) * life * life;
        var ringBoost = ring >= 0 ? Math.exp(-Math.pow((cell.d - ring) / 0.9, 2)) : 0;
        var tapGlow = 0;
        for (var qi = 0; qi < pr.length; qi++) {
          var tdx = cell.x - pr[qi].x, tdz = cell.z - pr[qi].z, td = Math.sqrt(tdx * tdx + tdz * tdz);
          tapGlow += pr[qi].k * (1.1 * Math.exp(-(td * td) / (PULSE_AREA * PULSE_AREA)) +
                                 0.9 * Math.exp(-Math.pow((td - pr[qi].rad) / 0.8, 2)));
        }
        ringBoost += tapGlow;
        lit = clamp(lit + 0.5 * Math.min(tapGlow, 1.2), 0, 1); // more windows flare on
        var s = cell.s, bx = cell.x, bz = cell.z;

        // Footprint (the seed waiting to grow)
        var seedA = (1 - g0) * 0.22 * life;
        if (seedA > 0.01 || Hc < 0.03) {
          ctx.beginPath();
          project(bx - s, 0, bz - s); ctx.moveTo(px, py);
          project(bx + s, 0, bz - s); ctx.lineTo(px, py);
          project(bx + s, 0, bz + s); ctx.lineTo(px, py);
          project(bx - s, 0, bz + s); ctx.lineTo(px, py);
          ctx.closePath();
          ctx.strokeStyle = "rgba(130,205,245," + Math.max(seedA, 0.05).toFixed(3) + ")";
          ctx.lineWidth = 1;
          ctx.stroke();
          if (Hc < 0.03) continue;
        }

        // 8 corners in screen space
        var bxs = [-s, s, s, -s], bzs = [-s, -s, s, s], sxs = [], sys = [], txs = [], tys = [];
        for (var k = 0; k < 4; k++) {
          project(bx + bxs[k], 0, bz + bzs[k]); sxs.push(px); sys.push(py);
          project(bx + bxs[k], Hc, bz + bzs[k]); txs.push(px); tys.push(py);
        }

        var edge = (0.28 + 0.5 * g0) * pulse + 0.7 * ringBoost;
        var topY = Math.min(tys[0], tys[1], tys[2], tys[3]);
        var botY = Math.max(sys[0], sys[1], sys[2], sys[3]);
        var shade = ctx.createLinearGradient(0, topY, 0, botY);
        shade.addColorStop(0, "rgba(120,200,245," + (0.02 + 0.05 * lit).toFixed(3) + ")");
        shade.addColorStop(1, "rgba(86,180,233," + (0.09 + 0.07 * lit + 0.25 * ringBoost).toFixed(3) + ")");

        // Side faces turned toward the camera: shaded fill + windows
        for (var face = 0; face < 4; face++) {
          // face 0: -z (corners 0,1)  1: +x (1,2)  2: +z (2,3)  3: -x (3,0)
          var nx = face === 1 ? 1 : face === 3 ? -1 : 0, nz = face === 2 ? 1 : face === 0 ? -1 : 0;
          var nzView = nx * syaw + nz * cyaw;
          if (nzView >= 0) continue;                       // faces away from the camera
          var a = face, b = (face + 1) % 4;
          ctx.beginPath();
          ctx.moveTo(sxs[a], sys[a]); ctx.lineTo(sxs[b], sys[b]); ctx.lineTo(txs[b], tys[b]); ctx.lineTo(txs[a], tys[a]);
          ctx.closePath();
          ctx.fillStyle = shade;
          ctx.fill();

          var rows = Math.min(cell.rows, Math.max(0, Math.floor(Hc * 3.2)));
          var wins = cell.win[face];
          for (var r = 0; r < rows; r++) {
            var v0 = (r + 0.22) / cell.rows * (cell.h / Math.max(Hc, 0.001)), v1 = (r + 0.78) / cell.rows * (cell.h / Math.max(Hc, 0.001));
            if (v1 > 1) continue;
            for (var col = 0; col < 3; col++) {
              var th = wins[r * 3 + col] * 1.25; // only ~80% of windows ever light up
              var flick = still ? 0 : 0.05 * Math.sin(tt * 3 + th * 40);
              if (th > lit + flick) continue;
              var u0 = 0.14 + col * 0.28, u1 = u0 + 0.14;
              var path = th < 0.2 ? bright : th < 0.6 ? mid : dim;
              path.push(
                lerp2(sxs, sys, txs, tys, a, b, u0, v0), lerp2(sxs, sys, txs, tys, a, b, u1, v0),
                lerp2(sxs, sys, txs, tys, a, b, u1, v1), lerp2(sxs, sys, txs, tys, a, b, u0, v1)
              );
            }
          }
        }

        // Roof
        ctx.beginPath();
        ctx.moveTo(txs[0], tys[0]); ctx.lineTo(txs[1], tys[1]); ctx.lineTo(txs[2], tys[2]); ctx.lineTo(txs[3], tys[3]);
        ctx.closePath();
        ctx.fillStyle = "rgba(190,230,255," + (0.05 + 0.08 * lit + 0.3 * ringBoost).toFixed(3) + ")";
        ctx.fill();

        // Light-tube edges: wide soft pass, then a thin bright pass
        ctx.beginPath();
        for (var e = 0; e < 4; e++) {
          var e2 = (e + 1) % 4;
          ctx.moveTo(txs[e], tys[e]); ctx.lineTo(txs[e2], tys[e2]);
          ctx.moveTo(sxs[e], sys[e]); ctx.lineTo(txs[e], tys[e]);
          // bottom edges only along the faces we can see
          var enx = e === 1 ? 1 : e === 3 ? -1 : 0, enz = e === 2 ? 1 : e === 0 ? -1 : 0;
          if (enx * syaw + enz * cyaw < 0) { ctx.moveTo(sxs[e], sys[e]); ctx.lineTo(sxs[e2], sys[e2]); }
        }
        ctx.strokeStyle = "rgba(86,180,233," + (edge * 0.13).toFixed(3) + ")";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.strokeStyle = "rgba(205,236,255," + clamp(edge * 0.8, 0, 1).toFixed(3) + ")";
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }

      // Window lights, batched in three brightness steps
      fillQuads(dim, "rgba(120,205,245," + (0.42 * pulse).toFixed(3) + ")");
      fillQuads(mid, "rgba(180,226,252," + (0.62 * pulse).toFixed(3) + ")");
      fillQuads(bright, "rgba(255,255,255," + (0.95).toFixed(3) + ")");

      // Beacon rising from the tallest tower
      var tall = cells[0];
      for (var q = 1; q < cells.length; q++) if (cells[q].h > tall.h) tall = cells[q];
      var th0 = tall.h * ease((wave - tall.d) / 2.4) * life;
      if (th0 > 0.2) {
        project(tall.x, th0, tall.z);
        var bx0 = px, by0 = py;
        project(tall.x, th0 + 3.2, tall.z);
        var beam = ctx.createLinearGradient(0, by0, 0, py);
        beam.addColorStop(0, "rgba(220,243,255," + (0.9 * pulse).toFixed(3) + ")");
        beam.addColorStop(1, "rgba(86,180,233,0)");
        ctx.strokeStyle = beam;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(bx0, by0); ctx.lineTo(px, py); ctx.stroke();
        var tip = ctx.createRadialGradient(bx0, by0, 0, bx0, by0, 14);
        tip.addColorStop(0, "rgba(255,255,255," + (0.95 * pulse).toFixed(3) + ")");
        tip.addColorStop(1, "rgba(86,180,233,0)");
        ctx.fillStyle = tip;
        ctx.fillRect(bx0 - 14, by0 - 14, 28, 28);
      }
    }

    function lerp2(sxs, sys, txs, tys, a, b, u, v) {
      // bilinear point on the face (bottom edge a->b, top edge a->b)
      var bxp = sxs[a] + (sxs[b] - sxs[a]) * u, byp = sys[a] + (sys[b] - sys[a]) * u;
      var txp = txs[a] + (txs[b] - txs[a]) * u, typ = tys[a] + (tys[b] - tys[a]) * u;
      return [bxp + (txp - bxp) * v, byp + (typ - byp) * v];
    }

    function fillQuads(quads, style) {
      if (!quads.length) return;
      ctx.beginPath();
      for (var i = 0; i < quads.length; i += 4) {
        ctx.moveTo(quads[i][0], quads[i][1]);
        ctx.lineTo(quads[i + 1][0], quads[i + 1][1]);
        ctx.lineTo(quads[i + 2][0], quads[i + 2][1]);
        ctx.lineTo(quads[i + 3][0], quads[i + 3][1]);
        ctx.closePath();
      }
      ctx.fillStyle = style;
      ctx.fill();
    }

    function ringOnGround(rad, alpha, width, ox, oz) {
      var steps = 72, i;
      ox = ox || 0; oz = oz || 0;
      ctx.beginPath();
      for (i = 0; i <= steps; i++) {
        var t = (i / steps) * Math.PI * 2;
        project(ox + Math.cos(t) * rad, 0, oz + Math.sin(t) * rad);
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.strokeStyle = "rgba(86,180,233," + (alpha * 0.35).toFixed(3) + ")";
      ctx.lineWidth = width * 4;
      ctx.stroke();
      ctx.strokeStyle = "rgba(215,240,255," + clamp(alpha, 0, 1).toFixed(3) + ")";
      ctx.lineWidth = width;
      ctx.stroke();
    }

    /* ---- loop ---- */

    function tick(ts) {
      raf = 0;
      var dt = last ? Math.min((ts - last) / 1000, 0.05) : 0.016;
      last = ts;
      if (!reduce) {
        clock += dt;
        spinYaw += SPIN * dt;
      }
      for (var pi = pulses.length - 1; pi >= 0; pi--) {
        pulses[pi].age += dt;
        if (pulses[pi].age >= PULSE_LIFE) pulses.splice(pi, 1);
      }
      if (!dragging && Math.abs(velYaw) > 0.01) {
        userYaw += velYaw * dt;
        velYaw *= Math.pow(0.05, dt);
      }
      frame(dt, reduce);
      if (visible && !document.hidden && (!reduce || dragging || pulses.length || Math.abs(velYaw) > 0.01)) {
        raf = requestAnimationFrame(tick);
      } else {
        last = 0;
      }
    }
    function kick() { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(tick); }

    /* ---- drag to turn, tap to pulse (on the visible box; the oversized
       canvas itself ignores the pointer so it never blocks the copy) ---- */

    el.addEventListener("pointerdown", function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      dragging = true; dragX = e.clientX; dragT = performance.now(); velYaw = 0;
      downX = e.clientX; downY = e.clientY; downT = dragT; moved = 0;
      el.classList.add("is-dragging");
      el.setPointerCapture(e.pointerId);
      kick();
    });
    el.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      moved = Math.max(moved, Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY));
      var now = performance.now(), dt = Math.max((now - dragT) / 1000, 0.001);
      var dy = (e.clientX - dragX) * 0.008;
      userYaw += dy;
      velYaw = reduce ? 0 : dy / dt;
      dragX = e.clientX; dragT = now;
      if (reduce) frame(0, true);
    });
    function end(e) {
      if (!dragging) return;
      dragging = false;
      el.classList.remove("is-dragging");
      var isTap = e && e.type === "pointerup" && moved < 8 && performance.now() - downT < 600;
      if (performance.now() - dragT > 90 || isTap) velYaw = 0;
      velYaw = clamp(velYaw, -4, 4);
      if (isTap) tap(e.clientX, e.clientY);
      kick();
    }
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);

    // Screen point -> spot on the ground (inverse of project() for y = 0)
    function tap(clientX, clientY) {
      if (!city) return;
      var cr = canvas.getBoundingClientRect();
      var a = (clientX - cr.left - cx0) / f, b = (cy0 - (clientY - cr.top)) / f;
      var den = sp - b * cp;
      if (den <= 0.02) return;                      // above the horizon: no ground there
      var Z = b * DIST / den, Z2 = Z * cp + DIST, X = a * Z2;
      var wx = X * cyaw + Z * syaw, wz = Z * cyaw - X * syaw;
      var ext = city.half + 1.2;
      if (Math.abs(wx) > ext + 2 || Math.abs(wz) > ext + 2) return; // well off the city
      pulses.push({ x: clamp(wx, -ext, ext), z: clamp(wz, -ext, ext), age: 0 });
      if (pulses.length > MAX_PULSES) pulses.shift();
      kick();
    }

    /* ---- lifecycle ---- */

    if ("ResizeObserver" in window) new ResizeObserver(resize).observe(el);
    else window.addEventListener("resize", resize);

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) { if (!reduce) clock = 0; kick(); }
      }, { threshold: 0.15 }).observe(el);
    } else {
      visible = true;
    }
    document.addEventListener("visibilitychange", kick);

    resize();
    if (reduce) frame(0, true);
    else if (visible) kick();
  }

  function start() {
    document.querySelectorAll("[data-swft-city]").forEach(init);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
