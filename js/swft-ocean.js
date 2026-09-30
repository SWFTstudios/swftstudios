/* ============================================================
   SWFT Ocean stage — a WebGL night ocean under a spotlight, for the
   SWFT 3D cube (js/swft-cube.js) to hover over.

   Enhances every [data-swft-ocean] element:
     - raymarched wave heightfield with fresnel sky reflection
     - spotlight from above: volumetric beam, a lit pool of water,
       specular glints on the crests, and the cube's shadow in the pool
     - the cube (if one is inside) is reflected in the water and bobs
       gently; its on-screen position is solved from the same camera
       so it sits exactly over its shadow

   No libraries. Falls back to a static CSS scene without WebGL.
   Docs: docs/SWFT_CUBE.md
   ============================================================ */
(function () {
  "use strict";

  // World units. The cube is CUBE_SIZE wide; everything else is scaled from it.
  var CUBE_SIZE = 1.6;
  var HOVER_GAP = 0.55;          // water line to cube bottom
  var CAM_HEIGHT = 2.4;
  var CAM_PITCH = 11 * Math.PI / 180;
  var FOCAL = 1.6;               // vertical field of view ~ 34deg
  var LIGHT_HEIGHT = 9.0;
  var BOB_WORLD = 0.07;          // bob amplitude
  var BOB_SPEED = 1.3;           // radians per second
  var TARGET_PIXELS = 460000;    // render budget before adaptive scaling
  var STILL_TIME = 7.0;          // frozen wave time for reduced motion

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
    "uniform mat3 uToLocal, uToWorld;",
    "uniform float uYaw;",
    "uniform vec3 uLight;",

    "const float DEPTH = 0.9;",
    "const float COS_OUTER = 0.9659;", // 15deg cone edge
    "const float COS_INNER = 0.9945;", // 6deg full-strength core

    // Sum of directional waves with sharp exp(sin) crests; each wave drags
    // the sample point along its slope, which bunches the crests like real swell.
    "float waves(vec2 p, int it) {",
    "  float a = 0.0, f = 1.0, amp = 1.0, sum = 0.0, wsum = 0.0, tm = 1.0;",
    "  for (int i = 0; i < 30; i++) {",
    "    if (i >= it) break;",
    "    vec2 d = vec2(sin(a), cos(a));",
    "    float x = dot(d, p) * f + uTime * tm * 0.8;",
    "    float w = exp(sin(x) - 1.0);",
    "    p -= d * w * cos(x) * amp * 0.28;",
    "    sum += w * amp; wsum += amp;",
    "    f *= 1.18; amp *= 0.82; tm *= 1.07; a += 1232.399963;",
    "  }",
    "  return sum / wsum;",
    "}",
    "float hgt(vec2 p, int it) { return (waves(p * 1.1, it) - 1.0) * DEPTH; }",

    "float march(vec3 ro, vec3 rd) {",
    "  vec3 p = ro + rd * (-ro.y / rd.y);",
    "  for (int i = 0; i < 48; i++) {",
    "    float h = hgt(p.xz, 10);",
    "    if (h + 0.01 > p.y) break;",
    "    p += rd * (p.y - h);",
    "  }",
    "  return distance(p, ro);",
    "}",

    "vec3 waterNormal(vec2 p, float e) {",
    "  float h = hgt(p, 26);",
    "  vec3 a = vec3(p.x, h, p.y);",
    "  vec3 b = vec3(p.x - e, hgt(p - vec2(e, 0.0), 26), p.y);",
    "  vec3 c = vec3(p.x, hgt(p + vec2(0.0, e), 26), p.y + e);",
    "  return normalize(cross(a - b, a - c));",
    "}",

    "vec3 sky(vec3 d) {",
    "  float y = max(d.y, 0.0);",
    "  return mix(vec3(0.005, 0.014, 0.036), vec3(0.0008, 0.0018, 0.006), pow(y, 0.35));",
    "}",

    "float spot(vec3 p) {",
    "  vec3 v = normalize(p - uLight);",
    "  return smoothstep(COS_OUTER, COS_INNER, -v.y);",
    "}",

    "float sdBox2(vec2 p, vec2 b) {",
    "  vec2 d = abs(p) - b;",
    "  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);",
    "}",

    // Soft shadow of the cube, projected from the point light straight above it.
    "float cubeShadow(vec3 p) {",
    "  if (uHasCube < 0.5) return 1.0;",
    "  float bottom = uCube.y - uHalf;",
    "  if (p.y > bottom) return 1.0;",
    "  float s = (uLight.y - p.y) / (uLight.y - uCube.y);",
    "  vec2 q = (p.xz - uCube.xz) / s;",
    "  float c = cos(uYaw), sn = sin(uYaw);",
    "  q = mat2(c, -sn, sn, c) * q;",
    "  float d = sdBox2(q, vec2(uHalf * 0.98)) - uHalf * 0.1;",
    "  float soft = uHalf * (0.1 + 0.3 * clamp((bottom - p.y) / (bottom + DEPTH), 0.0, 1.0));",
    "  return mix(0.08, 1.0, smoothstep(-soft, soft, d));",
    "}",

    "bool hitCube(vec3 ro, vec3 rd, out vec3 nW, out vec3 wp) {",
    "  if (uHasCube < 0.5) return false;",
    "  vec3 o = uToLocal * (ro - uCube);",
    "  vec3 d = uToLocal * rd;",
    "  vec3 m = 1.0 / d;",
    "  vec3 n = m * o;",
    "  vec3 k = abs(m) * uHalf;",
    "  vec3 t1 = -n - k, t2 = -n + k;",
    "  float tN = max(max(t1.x, t1.y), t1.z);",
    "  float tF = min(min(t2.x, t2.y), t2.z);",
    "  if (tN > tF || tF < 0.0) return false;",
    "  vec3 nl = -sign(d) * step(t1.yzx, t1.xyz) * step(t1.zxy, t1.xyz);",
    "  nW = uToWorld * nl;",
    "  wp = ro + rd * tN;",
    "  return true;",
    "}",

    // How the cube looks in the reflection: lit top, sides fading into the dark.
    "vec3 cubeColor(vec3 nW, vec3 wp) {",
    "  float h = clamp((wp.y - (uCube.y - uHalf)) / (2.0 * uHalf), 0.0, 1.0);",
    "  vec3 side = mix(vec3(0.01, 0.025, 0.04), vec3(0.2, 0.3, 0.34), h * h);",
    "  vec3 top = vec3(0.8, 0.95, 1.0);",
    "  vec3 under = vec3(0.01, 0.05, 0.07);",
    "  vec3 col = mix(side, top, smoothstep(0.4, 0.9, nW.y));",
    "  return mix(col, under, smoothstep(-0.4, -0.9, nW.y));",
    "}",

    // Light scattered by the air inside the cone, only where the ray crosses the cone's cylinder.
    "vec3 beam(vec3 ro, vec3 rd, float tMax) {",
    "  float R = 2.8;",
    "  vec2 o = ro.xz - uLight.xz;",
    "  vec2 d = rd.xz;",
    "  float A = dot(d, d), B = dot(o, d), C = dot(o, o) - R * R;",
    "  float disc = B * B - A * C;",
    "  if (disc < 0.0 || A < 1e-6) return vec3(0.0);",
    "  float sq = sqrt(disc);",
    "  float t0 = max((-B - sq) / A, 0.0);",
    "  float t1 = min((-B + sq) / A, tMax);",
    "  if (t1 <= t0) return vec3(0.0);",
    "  float dt = (t1 - t0) / 18.0;",
    "  float j = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);",
    "  float acc = 0.0;",
    "  for (int i = 0; i < 18; i++) {",
    "    vec3 q = ro + rd * (t0 + (float(i) + j) * dt);",
    "    vec3 v = q - uLight;",
    "    float cone = smoothstep(COS_OUTER, COS_INNER, -normalize(v).y);",
    "    float dust = 0.85 + 0.15 * sin(q.y * 3.1 + uTime * 0.6) * sin(q.x * 2.3 - uTime * 0.4);",
    "    acc += cone * cone * dust * cubeShadow(q) / (1.0 + 0.02 * dot(v, v));",
    "  }",
    "  return vec3(0.55, 0.82, 1.0) * acc * dt * 0.022;",
    "}",

    "void main() {",
    "  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;",
    "  vec3 rd = normalize(uFw * uFocal + uRight * uv.x + uUp * uv.y);",
    "  vec3 ro = uCam;",
    "  vec3 col;",
    "  float tHit = 60.0;",
    "  if (rd.y < 0.0) {",
    "    tHit = march(ro, rd);",
    "    vec3 p = ro + rd * tHit;",
    "    vec3 N = waterNormal(p.xz, 0.01);",
    "    N = normalize(mix(N, vec3(0.0, 1.0, 0.0), 0.6 * min(1.0, sqrt(tHit * 0.01) * 1.1)));",
    "    float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, -rd), 0.0), 5.0);",
    "    vec3 R = reflect(rd, N);",
    "    R.y = abs(R.y);",
    "    vec3 refl = sky(R);",
    "    vec3 cn, cp;",
    "    if (hitCube(p, R, cn, cp)) { refl = cubeColor(cn, cp); fres = max(fres, 0.35); }",
    "    else refl += beam(p, R, 30.0) * 1.6;",   // the light shaft mirrored in the swell
    "    vec3 toL = uLight - p;",
    "    float dl = length(toL);",
    "    toL /= dl;",
    "    float lit = spot(p) * cubeShadow(p) * 75.0 / (dl * dl);",
    "    float crest = smoothstep(-0.78 * DEPTH, -0.3 * DEPTH, p.y);",
    "    float facing = max(dot(N, toL), 0.0);",
    "    vec3 scatter = vec3(0.015, 0.26, 0.36) * lit * pow(facing, 6.0) * (0.1 + 1.6 * crest * crest);",
    "    vec3 deep = vec3(0.001, 0.006, 0.022);",
    "    float nh = max(dot(N, normalize(toL - rd)), 0.0);",
    "    float spec = (pow(nh, 260.0) * 14.0 + pow(nh, 40.0) * 0.35) * lit;",
    "    col = mix(deep + scatter, refl, fres) + vec3(0.9, 0.97, 1.0) * spec;",
    "    col = mix(col, sky(vec3(rd.x, 0.03, rd.z)), 1.0 - exp(-tHit * 0.025));",
    "  } else {",
    "    col = sky(rd);",
    "  }",
    "  col += beam(ro, rd, tHit);",
    "  col *= 1.15;",
    "  col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);",
    "  col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));",
    "  vec2 s = gl_FragCoord.xy / uRes;",
    "  col *= 0.5 + 0.5 * pow(16.0 * s.x * s.y * (1.0 - s.x) * (1.0 - s.y), 0.18);",
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

    this.canvas = root.querySelector(".swft-ocean__canvas");
    if (!this.canvas) {
      this.canvas = document.createElement("canvas");
      this.canvas.className = "swft-ocean__canvas";
      root.insertBefore(this.canvas, root.firstChild);
    }
    this.canvas.setAttribute("aria-hidden", "true");

    try {
      this.initGL();
    } catch (err) {
      if (window.console) console.warn("[swft-ocean] WebGL unavailable, using static scene:", err.message);
      this.gl = null;
      root.classList.add("swft-ocean--static");
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
     "uToLocal", "uToWorld", "uYaw", "uLight"].forEach(function (n) { u[n] = gl.getUniformLocation(prog, n); });
    this.gl = gl;
    this.u = u;
    this.root.classList.add("swft-ocean--live");
  };

  // Solve the camera + cube placement so the WebGL world and the DOM cube line up.
  Ocean.prototype.layout = function () {
    var W = this.root.clientWidth, H = this.root.clientHeight;
    if (!W || !H) return;
    this.W = W; this.H = H;

    var fw = [0, -Math.sin(CAM_PITCH), Math.cos(CAM_PITCH)];
    var up = [0, Math.cos(CAM_PITCH), Math.sin(CAM_PITCH)];
    this.fw = fw; this.up = up;

    var cubePx = this.bodyEl ? this.bodyEl.offsetWidth : Math.min(W * 0.44, 250);
    var cy = CUBE_SIZE / 2 + HOVER_GAP;
    // Depth at which a CUBE_SIZE object renders cubePx tall, then back out the distance.
    var zc = CUBE_SIZE * FOCAL * H / cubePx;
    var dist = (zc - (cy - CAM_HEIGHT) * fw[1]) / fw[2];
    this.cube = [0, cy, dist];
    this.pxPerWorld = FOCAL * H / zc;

    var yc = (cy - CAM_HEIGHT) * up[1] + dist * up[2];
    var centerY = (0.5 - FOCAL * yc / zc) * H;
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
    if (!this.visible || document.hidden) return;

    var still = reducedMotion();
    var t = still ? STILL_TIME : (now - this.start) / 1000;

    // Bob the DOM cube and move its world twin by the same amount.
    var bob = still ? 0 : Math.sin(t * BOB_SPEED) * BOB_WORLD + Math.sin(t * BOB_SPEED * 0.43 + 1.7) * BOB_WORLD * 0.35;
    if (this.sceneEl) this.sceneEl.style.setProperty("--cube-bob", (-bob * this.pxPerWorld).toFixed(2) + "px");

    if (this.gl) this.draw(t, bob, now);
    requestAnimationFrame(this.loop);
  };

  Ocean.prototype.draw = function (t, bob, now) {
    var gl = this.gl, u = this.u;
    var inst = this.cubeEl && this.cubeEl.__swftCube;

    var rot = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    if (inst) rot = mul(mul(rotX(inst.hx), rotY(inst.hy)), mul(rotX(inst.rx), rotY(inst.ry)));
    // CSS space (y down, z to viewer) -> world (y up, z away): M = F R F, F = diag(1,-1,-1)
    var F = [1, -1, -1];
    var M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) M[i][j] = F[i] * rot[i][j] * F[j];

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
    // Column-major upload: M's rows become the columns of M^T (world -> local).
    gl.uniformMatrix3fv(u.uToLocal, false, [].concat(M[0], M[1], M[2]));
    gl.uniformMatrix3fv(u.uToWorld, false, [M[0][0], M[1][0], M[2][0], M[0][1], M[1][1], M[2][1], M[0][2], M[1][2], M[2][2]]);
    gl.uniform1f(u.uYaw, Math.atan2(M[2][0], M[0][0]));
    gl.uniform3f(u.uLight, 0, LIGHT_HEIGHT, this.cube[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Adaptive resolution: back off when frames run long, recover slowly when they're cheap.
    if (this.prevDraw) {
      this.frameMs = this.frameMs * 0.9 + Math.min(100, now - this.prevDraw) * 0.1;
      if (this.frameMs > 24 && this.scale > 0.3) {
        this.scale *= 0.85; this.frameMs = 16; this.resizeCanvas();
      }
    }
    this.prevDraw = now;
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
