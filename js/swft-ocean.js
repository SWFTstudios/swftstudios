/* ============================================================
   SWFT Ocean stage — a black, glassy night sea for the SWFT 3D cube
   (js/swft-cube.js) to hover over, lit only by the cube itself.

   Enhances every [data-swft-ocean] element:
     - raymarched ripple heightfield seen from just above the water
     - the cube glows: bloom around it, its glowing edges mirrored in
       the water, glints on the ripples beneath it, low mist on the sea
     - the cube bobs gently; its on-screen position is solved from the
       same camera, so the reflection always lines up with it

   No libraries. Falls back to a static CSS scene without WebGL.
   Docs: docs/SWFT_CUBE.md
   ============================================================ */
(function () {
  "use strict";

  // World units. The cube is CUBE_SIZE wide; everything else is scaled from it.
  var CUBE_SIZE = 1.6;
  var HOVER_GAP = 0.5;           // default water line to cube bottom, in cube widths (data-hover-gap)
  var CAM_HEIGHT = 0.6;          // eye just above the wave crests
  var CAM_PITCH = -3.5 * Math.PI / 180; // tipped slightly up: horizon a little below centre
  var FOCAL = 1.6;               // vertical field of view ~ 34deg
  var BOB_WORLD = 0.07;          // bob amplitude
  var BOB_SPEED = 1.3;           // radians per second
  var TARGET_PIXELS = 460000;    // render budget before adaptive scaling
  var CALM_SPEED = 0.35;
  var PITCH_STEP = 0.25 * Math.PI / 180; // camera tilt step when fitting a big cube (max 6deg extra)
  var TILT_EXTENT = 0.66;        // half-height of the tilted, spinning cube, in cube widths         // water speed under prefers-reduced-motion (slowed, not frozen)

  // Splashes: the cube floats low enough that its corners clip the crests as it spins.
  var DIP_MAX = 0.07;            // deepest a corner may sink below the mean water line before the cube bobs up

  var VERT = "attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}";

  var FRAG = [
    "#ifdef GL_FRAGMENT_PRECISION_HIGH",
    "precision highp float;",
    "#else",
    "precision mediump float;",
    "#endif",
    "uniform vec2 uRes;",
    "uniform float uTime;",
    "uniform vec3 uCam, uFw, uRight, uUp;",
    "uniform float uFocal;",
    "uniform vec3 uCube;",
    "uniform float uHalf;",
    "uniform float uHasCube;",
    "uniform mat3 uToLocal;",
    "uniform vec4 uFoam[8];",

    "const float DEPTH = 0.3;",
    "const vec3 ICE = vec3(0.55, 0.8, 1.0);",

    // Sum of directional waves with sharp exp(sin) crests; each wave drags
    // the sample point along its slope, which bunches the crests like real swell.
    "float waves(vec2 p, int it) {",
    "  float a = 0.0, f = 1.0, amp = 1.0, sum = 0.0, wsum = 0.0, tm = 1.0;",
    "  for (int i = 0; i < 30; i++) {",
    "    if (i >= it) break;",
    "    vec2 d = vec2(sin(a), cos(a));",
    "    float x = dot(d, p) * f + uTime * tm * 1.25;",
    "    float w = exp(sin(x) - 1.0);",
    "    p -= d * w * cos(x) * amp * 0.28;",
    "    sum += w * amp; wsum += amp;",
    "    f *= 1.18; amp *= 0.82; tm *= 1.07; a += 1232.399963;",
    "  }",
    "  return sum / wsum;",
    "}",
    // Long, low swell rolling toward the camera underneath the chop.
    "float swell(vec2 p) {",
    "  return 0.09 * sin(p.y * 0.45 + uTime * 1.1 + sin(p.x * 0.18) * 1.5)",
    "       + 0.05 * sin(dot(p, vec2(0.31, 0.22)) - uTime * 0.8);",
    "}",
    // Surface height, centred on y = 0 (the water line the cube's hover gap is measured from).
    // Crests never pass SURF_TOP, where the raymarch starts.
    "const float SURF_TOP = 0.34;",
    "float hgt(vec2 p, int it) { return (waves(p, it) - 1.0) * DEPTH + 0.16 + swell(p); }",

    "float march(vec3 ro, vec3 rd) {",
    "  vec3 p = ro + rd * ((SURF_TOP - ro.y) / rd.y);",
    "  for (int i = 0; i < 40; i++) {",
    "    float h = hgt(p.xz, 10);",
    "    if (h + 0.005 > p.y) break;",
    "    p += rd * (p.y - h);",
    "  }",
    "  return distance(p, ro);",
    "}",

    "vec3 waterNormal(vec2 p, float e, int it) {",
    "  float h = hgt(p, it);",
    "  vec3 a = vec3(p.x, h, p.y);",
    "  vec3 b = vec3(p.x - e, hgt(p - vec2(e, 0.0), it), p.y);",
    "  vec3 c = vec3(p.x, hgt(p + vec2(0.0, e), it), p.y + e);",
    "  return normalize(cross(a - b, a - c));",
    "}",

    // Near-black night sky with the faintest cool lift at the horizon.
    // A thin cool band at the horizon gives the far swell something to reflect.
    "float crestShade(float y) { return smoothstep(-0.3, 0.2, y); }",
    "vec3 sky(vec3 d) {",
    "  float y = max(d.y, 0.0);",
    "  vec3 c = mix(vec3(0.006, 0.011, 0.02), vec3(0.0006, 0.0008, 0.0016), pow(y, 0.3));",
    "  return c + vec3(0.012, 0.022, 0.04) * exp(-y * 28.0);",
    "}",

    // Cheap value noise for fine capillary ripples on top of the wave normals.
    "float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }",
    "float vnoise(vec2 p) {",
    "  vec2 i = floor(p), f = fract(p);",
    "  f = f * f * (3.0 - 2.0 * f);",
    "  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),",
    "             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);",
    "}",
    "vec2 ripple(vec2 p) {",
    "  vec2 q = p * 7.0 + vec2(uTime * 0.6, -uTime * 0.9);",
    "  vec2 r = p * 13.0 + vec2(-uTime * 1.1, uTime * 0.4);",
    "  float e = 0.05;",
    "  float a = vnoise(q) + 0.5 * vnoise(r);",
    "  return vec2(vnoise(q + vec2(e, 0.0)) + 0.5 * vnoise(r + vec2(e, 0.0)) - a,",
    "              vnoise(q + vec2(0.0, e)) + 0.5 * vnoise(r + vec2(0.0, e)) - a) / e;",
    "}",

    // Bloom around the glowing cube, from the ray's closest approach to its centre.
    "vec3 glow(vec3 ro, vec3 rd, float tMax) {",
    "  if (uHasCube < 0.5) return vec3(0.0);",
    "  vec3 oc = uCube - ro;",
    "  float t = dot(oc, rd);",
    "  if (t < 0.0 || t > tMax) return vec3(0.0);",
    "  float d = length(ro + rd * t - uCube) / uHalf;",
    "  return ICE * (0.012 / (d * d * 0.9 + 0.15) + 0.55 * exp(-d * 2.4));",
    "}",

    // Low mist lying on the water, lit by the cube and spread sideways.
    "vec3 mist(vec3 ro, vec3 rd, float tMax) {",
    "  if (uHasCube < 0.5) return vec3(0.0);",
    "  vec2 dxz = rd.xz;",
    "  float t = dot(uCube.xz - ro.xz, dxz) / dot(dxz, dxz);",
    "  if (t < 0.0 || t > tMax) return vec3(0.0);",
    "  vec3 p = ro + rd * t;",
    "  float side = (p.x - uCube.x) / uHalf;",
    "  float h = max(p.y, 0.0) / uHalf;",
    "  return ICE * 0.07 * exp(-side * side * 0.35) * exp(-h * 3.5);",
    "}",

    // Ray vs the cube (in its own rotated space). Returns hit distance or -1; lp = local hit point.
    "float hitCube(vec3 ro, vec3 rd, out vec3 lp, out vec3 nl) {",
    "  if (uHasCube < 0.5) return -1.0;",
    "  vec3 o = uToLocal * (ro - uCube);",
    "  vec3 d = uToLocal * rd;",
    "  vec3 m = 1.0 / d;",
    "  vec3 n = m * o;",
    "  vec3 k = abs(m) * uHalf;",
    "  vec3 t1 = -n - k, t2 = -n + k;",
    "  float tN = max(max(t1.x, t1.y), t1.z);",
    "  float tF = min(min(t2.x, t2.y), t2.z);",
    "  if (tN > tF || tF < 0.0) return -1.0;",
    "  nl = -sign(d) * step(t1.yzx, t1.xyz) * step(t1.zxy, t1.xyz);",
    "  lp = o + d * tN;",
    "  return tN;",
    "}",

    // The cube as seen in the water: dim glassy faces with bright glowing edges.
    "vec3 cubeEmission(vec3 lp, vec3 nl) {",
    "  vec3 q = abs(lp) / uHalf;",
    "  vec3 an = abs(nl);",
    "  float edge = max(q.x * (1.0 - an.x), max(q.y * (1.0 - an.y), q.z * (1.0 - an.z)));",
    "  float rim = smoothstep(0.84, 0.985, edge);",
    // Frosted glass: a milky body that brightens toward the panes' centres, softer rims.
    "  float haze = 1.0 - 0.5 * max(max(q.x * (1.0 - an.x), q.y * (1.0 - an.y)), q.z * (1.0 - an.z));",
    "  return ICE * (0.12 + 0.22 * haze + 1.3 * rim);",
    "}",

    "void main() {",
    "  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;",
    "  vec3 rd = normalize(uFw * uFocal + uRight * uv.x + uUp * uv.y);",
    "  vec3 ro = uCam;",
    "  vec3 col;",
    "  float tHit = 80.0;",
    "  if (rd.y < 0.0) {",
    "    tHit = march(ro, rd);",
    "    vec3 p = ro + rd * tHit;",
    "    vec3 N = waterNormal(p.xz, 0.01, 26);",
    // The mirror image rides the bigger waves only, so it wobbles like liquid instead of shattering.
    "    vec3 Ns = waterNormal(p.xz, 0.025, 16);",
    "    Ns = normalize(mix(Ns, N, 0.35));",
    "    float near = exp(-tHit * 0.09);",
    "    N = normalize(N + vec3(ripple(p.xz), 0.0).xzy * vec3(1.0, 0.0, 1.0) * 0.045 * near);",
    "    N = normalize(mix(N, vec3(0.0, 1.0, 0.0), 0.55 * min(1.0, sqrt(tHit * 0.012) * 1.1)));",
    "    float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, -rd), 0.0), 5.0);",
    "    vec3 R = reflect(rd, N);",
    "    R.y = abs(R.y);",
    "    vec3 Rs = reflect(rd, Ns);",
    "    Rs.y = abs(Rs.y);",
    // Mirror image: the cube itself where the reflected ray meets it, its bloom everywhere else.
    "    vec3 lp, nl;",
    "    vec3 refl = sky(R) + glow(p, R, 80.0);",
    "    if (hitCube(p, Rs, lp, nl) > 0.0) refl += cubeEmission(lp, nl) * (0.75 + 0.5 * crestShade(p.y));",
    // The cube also lights the ripples directly: sharp glints plus a faint cool sheen.
    "    vec3 toL = uCube - p;",
    "    float dl = length(toL);",
    "    toL /= dl;",
    "    float nh = max(dot(N, normalize(toL - rd)), 0.0);",
    "    float atten = 6.0 / (1.0 + dl * dl);",
    // Sparkle: the sharpest highlights break into glitter along the light path.
    "    float sparkle = step(0.82, hash(floor(p.xz * 40.0) + floor(uTime * 6.0)));",
    "    vec3 lit = ICE * atten * (pow(nh, 180.0) * 3.5 + pow(nh, 60.0) * sparkle * 1.4 + pow(nh, 24.0) * 0.12)",
    "             + vec3(0.01, 0.025, 0.05) * atten * max(dot(N, toL), 0.0);",
    // Light passing through the thin crests between the viewer and the cube.
    "    float crest = smoothstep(-0.28, 0.16, p.y);",
    "    float back = pow(max(dot(rd, toL), 0.0), 3.0);",
    "    vec3 sss = vec3(0.04, 0.3, 0.55) * atten * crest * crest * (0.2 + 1.6 * back) * 0.45;",
    "    vec3 deep = vec3(0.0002, 0.0012, 0.0026) * (0.4 + crest) + vec3(0.0, 0.004, 0.007) * atten * 0.15;",
    "    col = mix(deep + sss, refl, fres) + lit;",
    // Foam where the cube's corners clip the water: a patch at each contact and a ring
    // spreading from each splash (x, z, age or -1 for a live contact, strength).
    "    float foam = 0.0;",
    "    for (int i = 0; i < 8; i++) {",
    "      vec4 f = uFoam[i];",
    "      if (f.w <= 0.0) continue;",
    "      float d = length(p.xz - f.xy);",
    "      if (f.z < 0.0) {",
    "        foam += f.w * exp(-d * d / 0.012);",
    "      } else {",
    "        float r = 0.06 + f.z * 0.75;",
    "        float wdt = 0.03 + 0.04 * f.z;",
    "        foam += f.w * exp(-f.z * 1.6) * (exp(-(d - r) * (d - r) / (wdt * wdt)) + 0.6 * exp(-d * d / 0.01) * exp(-f.z * 4.0));",
    "      }",
    "    }",
    "    foam = clamp(foam, 0.0, 1.0) * (0.55 + 0.45 * vnoise(p.xz * 22.0 + vec2(uTime * 1.3, -uTime)));",
    "    col = mix(col, vec3(0.6, 0.8, 1.0) * (0.06 + 0.4 * atten), foam * 0.9);",
    "    col = mix(col, sky(vec3(rd.x, 0.02, rd.z)), 1.0 - exp(-tHit * 0.015));",
    "  } else {",
    "    col = sky(rd);",
    "  }",
    "  col += glow(ro, rd, tHit) + mist(ro, rd, tHit);",
    "  col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);",
    "  col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));",
    // Dither so the dark gradients don't band.
    "  col += (hash(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5) / 255.0;",
    "  vec2 s = gl_FragCoord.xy / uRes;",
    "  col *= 0.45 + 0.55 * pow(16.0 * s.x * s.y * (1.0 - s.x) * (1.0 - s.y), 0.22);",
    "  gl_FragColor = vec4(col, 1.0);",
    "}"
  ].join("\n");

  var mqReduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  function reducedMotion() { return !!(mqReduce && mqReduce.matches); }

  function compile(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(sh) || "shader compile failed");
    }
    return sh;
  }

  // CSS rotateX / rotateY matrices (rows), in CSS's y-down, z-toward-viewer space.
  function rotX(deg) {
    var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return [[1, 0, 0], [0, c, -s], [0, s, c]];
  }
  function rotY(deg) {
    var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return [[c, 0, s], [0, 1, 0], [-s, 0, c]];
  }
  function mul(A, B) {
    var R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) {
      R[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
    }
    return R;
  }

  // Same surface as the shader's hgt(p, 10), so splashes line up with the waves drawn.
  function waterHeight(x, z, t) {
    var a = 0, f = 1, amp = 1, sum = 0, wsum = 0, tm = 1, px = x, pz = z;
    for (var i = 0; i < 10; i++) {
      var dx = Math.sin(a), dz = Math.cos(a);
      var xx = (dx * px + dz * pz) * f + t * tm * 1.25;
      var w = Math.exp(Math.sin(xx) - 1);
      var k = w * Math.cos(xx) * amp * 0.28;
      px -= dx * k; pz -= dz * k;
      sum += w * amp; wsum += amp;
      f *= 1.18; amp *= 0.82; tm *= 1.07; a += 1232.399963;
    }
    var swell = 0.09 * Math.sin(z * 0.45 + t * 1.1 + Math.sin(x * 0.18) * 1.5) +
                0.05 * Math.sin(x * 0.31 + z * 0.22 - t * 0.8);
    return (sum / wsum - 1) * 0.3 + 0.16 + swell;
  }

  function rand(a, b) { return a + Math.random() * (b - a); }

  function Ocean(root) {
    this.root = root;
    this.cubeEl = root.querySelector("[data-swft-cube]");
    this.sceneEl = root.querySelector(".swft-cube__scene");
    this.bodyEl = root.querySelector(".swft-cube__body");
    this.visible = true;
    this.scale = 1;
    this.frameMs = 16;
    this.lastKey = "";
    this.start = performance.now();

    var gapAttr = parseFloat(root.getAttribute("data-hover-gap"));
    this.hoverGap = (isNaN(gapAttr) ? HOVER_GAP : Math.max(0.05, gapAttr)) * CUBE_SIZE;

    this.pitch = CAM_PITCH;
    this.lift = 0;                       // buoyancy: raises the cube when a corner would sink too deep
    this.corners = [];                   // previous corner positions / depths, for splash detection
    this.ripples = [];
    this.contacts = [];
    this.foam = new Float32Array(32);

    this.canvas = root.querySelector(".swft-ocean__canvas");
    if (!this.canvas) {
      this.canvas = document.createElement("canvas");
      this.canvas.className = "swft-ocean__canvas";
      root.insertBefore(this.canvas, root.firstChild);
    }
    this.canvas.setAttribute("aria-hidden", "true");

    if (this.cubeEl) {
      this.spray = document.createElement("canvas");
      this.spray.className = "swft-ocean__spray";
      this.spray.setAttribute("aria-hidden", "true");
      root.appendChild(this.spray);
      this.sprayCtx = this.spray.getContext("2d");
    }

    try {
      this.initGL();
    } catch (err) {
      if (window.console) console.warn("[swft-ocean] WebGL unavailable, using static scene:", err.message);
      this.gl = null;
      root.classList.add("swft-ocean--static");
      setTimeout(this.announceReady.bind(this), 0);
    }

    this.layout();
    this.bind();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  Ocean.prototype.initGL = function () {
    var gl = this.canvas.getContext("webgl", { antialias: false, alpha: false, depth: false, powerPreference: "high-performance" });
    if (!gl) throw new Error("no webgl context");
    var prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || "link failed");
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    var u = {};
    ["uRes", "uTime", "uCam", "uFw", "uRight", "uUp", "uFocal", "uCube", "uHalf", "uHasCube",
     "uToLocal", "uFoam[0]"].forEach(function (n) { u[n] = gl.getUniformLocation(prog, n); });
    this.gl = gl;
    this.u = u;
    this.root.classList.add("swft-ocean--live");
  };

  // Solve the camera + cube placement so the WebGL world and the DOM cube line up.
  Ocean.prototype.layout = function () {
    var W = this.root.clientWidth, H = this.root.clientHeight;
    if (!W || !H) return;
    this.W = W; this.H = H;

    var cubePx = this.bodyEl ? this.bodyEl.offsetWidth : Math.min(W * 0.44, 250);
    var cy = CUBE_SIZE / 2 + this.hoverGap;
    // Depth at which a CUBE_SIZE object renders cubePx tall.
    var zc = CUBE_SIZE * FOCAL * H / cubePx;
    // Tilt the camera further up (horizon lower) when the stage is short for the cube,
    // so the spinning cube's corners stay clear of the top edge.
    var clearTop = H * 0.07 + cubePx * TILT_EXTENT;
    var pitch = CAM_PITCH, fw, up, dist, centerY;
    for (var i = 0; i <= 24; i++) {
      pitch = CAM_PITCH - i * PITCH_STEP;
      fw = [0, -Math.sin(pitch), Math.cos(pitch)];
      up = [0, Math.cos(pitch), Math.sin(pitch)];
      dist = (zc - (cy - CAM_HEIGHT) * fw[1]) / fw[2];
      var yc = (cy - CAM_HEIGHT) * up[1] + dist * up[2];
      centerY = (0.5 - FOCAL * yc / zc) * H;
      if (centerY >= clearTop) break;
    }
    this.pitch = pitch;
    this.fw = fw; this.up = up;
    this.cube = [0, cy, dist];
    this.pxPerWorld = FOCAL * H / zc;
    this.root.style.setProperty("--cube-y", centerY.toFixed(1) + "px");

    if (this.gl) {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var budget = Math.min(1, Math.sqrt(TARGET_PIXELS / (W * H * dpr * dpr)));
      this.scale = Math.min(this.scale, budget * dpr) || budget * dpr;
      this.resizeCanvas();
    }
    this.lastKey = "";
  };

  Ocean.prototype.resizeCanvas = function () {
    var w = Math.max(1, Math.round(this.W * this.scale));
    var h = Math.max(1, Math.round(this.H * this.scale));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.gl.viewport(0, 0, w, h);
    }
  };

  Ocean.prototype.bind = function () {
    var self = this;
    var relayout = function () { self.scale = 9; self.layout(); };
    if (window.ResizeObserver) new ResizeObserver(relayout).observe(this.root);
    else window.addEventListener("resize", relayout);
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (entries) {
        self.visible = entries[0].isIntersecting;
        if (self.visible) requestAnimationFrame(self.loop);
      }).observe(this.root);
    }
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) requestAnimationFrame(self.loop);
    });
  };

  Ocean.prototype.loop = function (now) {
    if (this.looping === now) return; // avoid double-scheduling from observers
    this.looping = now;
    if (!this.visible || document.hidden) { this.prevLoop = 0; return; }

    var still = reducedMotion();
    // Reduced motion slows the water instead of freezing it; the bob and the splash rings stop.
    var t = (now - this.start) / 1000 * (still ? CALM_SPEED : 1);
    var dt = this.prevLoop ? Math.min(0.05, (now - this.prevLoop) / 1000) : 1 / 60;
    this.prevLoop = now;

    var M = this.cubeMatrix();
    var bob = still ? 0 : Math.sin(t * BOB_SPEED) * BOB_WORLD + Math.sin(t * BOB_SPEED * 0.43 + 1.7) * BOB_WORLD * 0.35;

    // Buoyancy: if the cube's lowest corner would sink deeper than DIP_MAX, it bobs up.
    if (this.cube) {
      var half = CUBE_SIZE / 2;
      var ext = half * (Math.abs(M[1][0]) + Math.abs(M[1][1]) + Math.abs(M[1][2]));
      var lowest = this.cube[1] + bob - ext;
      var need = Math.max(0, -DIP_MAX - lowest);
      this.lift += (need - this.lift) * (1 - Math.exp(-dt * (need > this.lift ? 6 : 1.5)));
      bob += this.lift;
      if (this.gl) this.updateSplash(M, bob, t, dt, still);
    }

    // Bob the DOM cube and move its world twin by the same amount.
    if (this.sceneEl) this.sceneEl.style.setProperty("--cube-bob", (-bob * this.pxPerWorld).toFixed(2) + "px");

    if (this.gl) this.draw(t, bob, M, now);
    if (this.sprayCtx && this.gl) this.drawSpray();
    requestAnimationFrame(this.loop);
  };

  // The DOM cube's rotation as a world-space matrix (local -> world).
  Ocean.prototype.cubeMatrix = function () {
    var inst = this.cubeEl && this.cubeEl.__swftCube;
    var rot = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    if (inst) rot = mul(mul(rotX(inst.hx), rotY(inst.hy)), mul(rotX(inst.rx), rotY(inst.ry)));
    // CSS space (y down, z to viewer) -> world (y up, z away): M = F R F, F = diag(1,-1,-1)
    var F = [1, -1, -1];
    var M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) M[i][j] = F[i] * rot[i][j] * F[j];
    return M;
  };

  // Find the corners touching the water: foam where they sit in it, and a foam ring
  // plus a puff of mist when one cuts in (or a crest slaps up against it).
  Ocean.prototype.updateSplash = function (M, bob, t, dt, still) {
    var half = CUBE_SIZE / 2;
    var cx = this.cube[0], cy = this.cube[1] + bob, cz = this.cube[2];
    var contacts = [];
    var n = 0;
    for (var sx = -1; sx <= 1; sx += 2) for (var sy = -1; sy <= 1; sy += 2) for (var sz = -1; sz <= 1; sz += 2) {
      var lx = sx * half, ly = sy * half, lz = sz * half;
      var x = cx + M[0][0] * lx + M[0][1] * ly + M[0][2] * lz;
      var y = cy + M[1][0] * lx + M[1][1] * ly + M[1][2] * lz;
      var z = cz + M[2][0] * lx + M[2][1] * ly + M[2][2] * lz;
      var depth = y < 0.5 ? waterHeight(x, z, t) - y : -1; // > 0: under the surface
      var prev = this.corners[n];
      var vx = 0, vz = 0, dDepth = 0;
      if (prev) { vx = (x - prev.x) / dt; vz = (z - prev.z) / dt; dDepth = (depth - prev.depth) / dt; }
      if (depth > -0.015) contacts.push([x, z, depth, y + depth]);
      if (!still && prev) {
        var cool = (prev.cool || 0) - dt;
        var cutIn = prev.depth <= 0 && depth > 0;
        var slap = depth > -0.025 && dDepth > 0.18;   // a crest slapping up against a low corner
        if ((cutIn || slap) && cool <= 0) {
          cool = 0.7;
          // A corner meeting the water: a ring sized by how hard it hit
          var impact = Math.min(1, Math.max(0.25, dDepth / 1.2 + Math.hypot(vx, vz) / 3));
          this.ripples.push({ x: x, z: z, age: 0, str: 0.5 + 0.5 * impact });
        }
      }
      this.corners[n++] = { x: x, z: z, depth: depth, cool: prev ? cool : 0 };
    }

    // Ripples age out.
    for (var i = this.ripples.length - 1; i >= 0; i--) {
      this.ripples[i].age += dt;
      if (this.ripples[i].age > 2.4) this.ripples.splice(i, 1);
    }

    // Pack foam for the shader: live contacts (deepest first), then the newest rings.
    contacts.sort(function (p, q) { return q[2] - p[2]; });
    var f = this.foam, k = 0;
    f.fill(0);
    for (var c = 0; c < contacts.length && k < 4; c++, k++) {
      f[k * 4] = contacts[c][0]; f[k * 4 + 1] = contacts[c][1]; f[k * 4 + 2] = -1;
      f[k * 4 + 3] = Math.min(1, (contacts[c][2] + 0.015) * 9);
    }
    for (var r = this.ripples.length - 1; r >= 0 && k < 8; r--, k++) {
      var rp = this.ripples[r];
      f[k * 4] = rp.x; f[k * 4 + 1] = rp.z; f[k * 4 + 2] = rp.age; f[k * 4 + 3] = rp.str;
    }
    this.contacts = contacts;
  };

  // Project a world point to CSS pixels in the stage (same camera as the shader).
  Ocean.prototype.project = function (x, y, z) {
    var vy = y - CAM_HEIGHT;
    var zc = vy * this.fw[1] + z * this.fw[2];
    if (zc <= 0.05) return null;
    var yy = vy * this.up[1] + z * this.up[2];
    var s = FOCAL * this.H / zc;
    return [this.W / 2 + x * s, this.H / 2 - yy * s, s, zc];
  };

  Ocean.prototype.drawSpray = function () {
    var cv = this.spray, ctx = this.sprayCtx;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.round(this.W * dpr), h = Math.round(this.H * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    if (!this.ripples.length && !this.contacts.length) return;

    // Whitewater where a corner sits in the water, drawn over the corner's tip.
    for (var k = 0; k < this.contacts.length; k++) {
      var cp = this.contacts[k];
      var depth = cp[2] + 0.015;
      if (depth <= 0) continue;
      var p = this.project(cp[0], cp[3], cp[1]);
      if (!p) continue;
      var rx = p[2] * (0.07 + depth * 0.9), ry = rx * 0.34;
      var g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], rx);
      var a = Math.min(0.85, depth * 7);
      g.addColorStop(0, "rgba(225, 242, 255," + a + ")");
      g.addColorStop(0.5, "rgba(190, 225, 255," + (a * 0.45) + ")");
      g.addColorStop(1, "rgba(160, 210, 255, 0)");
      ctx.save();
      ctx.translate(p[0], p[1]);
      ctx.scale(1, ry / rx);
      ctx.translate(-p[0], -p[1]);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p[0], p[1], rx, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // Mist puff over each fresh splash: a soft cloud that swells and thins out.
    for (var m = 0; m < this.ripples.length; m++) {
      var rp = this.ripples[m];
      if (rp.age > 0.9) continue;
      var mp = this.project(rp.x, 0.05 + rp.age * 0.12, rp.z);
      if (!mp) continue;
      var mr = mp[2] * (0.08 + rp.age * 0.32);
      var ma = rp.str * 0.5 * (1 - rp.age / 0.9);
      var mg = ctx.createRadialGradient(mp[0], mp[1], 0, mp[0], mp[1], mr);
      mg.addColorStop(0, "rgba(220, 240, 255," + ma + ")");
      mg.addColorStop(1, "rgba(180, 220, 255, 0)");
      ctx.fillStyle = mg;
      ctx.beginPath(); ctx.arc(mp[0], mp[1], mr, 0, Math.PI * 2); ctx.fill();
    }
  };

  Ocean.prototype.draw = function (t, bob, M, now) {
    var gl = this.gl, u = this.u;

    var key = t.toFixed(3) + "|" + bob.toFixed(4) + "|" + M.join(",") + "|" + this.canvas.width;
    if (key === this.lastKey) return; // nothing moved (reduced motion, idle)
    this.lastKey = key;

    var cube = [this.cube[0], this.cube[1] + bob, this.cube[2]];
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.uTime, t);
    gl.uniform3f(u.uCam, 0, CAM_HEIGHT, 0);
    gl.uniform3fv(u.uFw, this.fw);
    gl.uniform3f(u.uRight, 1, 0, 0);
    gl.uniform3fv(u.uUp, this.up);
    gl.uniform1f(u.uFocal, FOCAL);
    gl.uniform3fv(u.uCube, cube);
    gl.uniform1f(u.uHalf, CUBE_SIZE / 2);
    gl.uniform1f(u.uHasCube, this.cubeEl ? 1 : 0);
    gl.uniform4fv(u["uFoam[0]"], this.foam);
    // Column-major upload: M's rows become the columns of M^T (world -> local).
    gl.uniformMatrix3fv(u.uToLocal, false, [].concat(M[0], M[1], M[2]));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.announceReady();

    // Adaptive resolution: back off when frames run long, recover slowly when they're cheap.
    if (this.prevDraw) {
      this.frameMs = this.frameMs * 0.9 + Math.min(100, now - this.prevDraw) * 0.1;
      if (this.frameMs > 24 && this.scale > 0.3) {
        this.scale *= 0.85; this.frameMs = 16; this.resizeCanvas();
      }
    }
    this.prevDraw = now;
  };

  // Fired once, after the first frame (or straight away on the static fallback),
  // so a page can hold its intro until the scene is actually painted.
  Ocean.prototype.announceReady = function () {
    if (this.ready) return;
    this.ready = true;
    try {
      this.root.dispatchEvent(new CustomEvent("swftocean:ready", { bubbles: true }));
    } catch (err) { /* very old browsers: nothing listens anyway */ }
  };

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-swft-ocean]"), function (el) {
      if (el.__swftOcean) return;
      el.__swftOcean = new Ocean(el);
    });
  }

  window.SwftOcean = { init: init };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
