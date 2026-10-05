/* ============================================================
   Geometric crystal rock for the homepage hero ocean.
   Irregular multi-face polyhedron; each face crossfades project photos.
   Markup: .swft-crystal[data-swft-crystal] > .swft-crystal__scene > canvas
           + .swft-crystal__sources > img…
   Exposes root.__swftCrystal { hx,hy,rx,ry,spinDps } for ocean splash sync.
   ============================================================ */
(function () {
  "use strict";

  var FACE_COUNT = 20;
  var VERT = [
    "attribute vec3 aPos;",
    "attribute vec3 aNrm;",
    "attribute vec2 aUv;",
    "attribute float aFace;",
    "uniform mat4 uMVP;",
    "uniform mat3 uNMat;",
    "varying vec3 vN;",
    "varying vec3 vW;",
    "varying vec2 vUv;",
    "varying float vFace;",
    "void main(){",
    "  vN = normalize(uNMat * aNrm);",
    "  vW = aPos;",
    "  vUv = aUv;",
    "  vFace = aFace;",
    "  gl_Position = uMVP * vec4(aPos,1.0);",
    "}"
  ].join("\n");

  var FRAG = [
    "precision mediump float;",
    "uniform sampler2D uTex0;",
    "uniform sampler2D uTex1;",
    "uniform sampler2D uTex2;",
    "uniform sampler2D uTex3;",
    "uniform sampler2D uTex4;",
    "uniform sampler2D uTex5;",
    "uniform sampler2D uTex6;",
    "uniform sampler2D uTex7;",
    "uniform vec4 uFade[20];",
    "uniform float uWhite;",
    "uniform float uTime;",
    "varying vec3 vN;",
    "varying vec3 vW;",
    "varying vec2 vUv;",
    "varying float vFace;",
    "vec3 sampleSlot(float slot, vec2 uv){",
    "  if(slot < 0.5) return texture2D(uTex0, uv).rgb;",
    "  if(slot < 1.5) return texture2D(uTex1, uv).rgb;",
    "  if(slot < 2.5) return texture2D(uTex2, uv).rgb;",
    "  if(slot < 3.5) return texture2D(uTex3, uv).rgb;",
    "  if(slot < 4.5) return texture2D(uTex4, uv).rgb;",
    "  if(slot < 5.5) return texture2D(uTex5, uv).rgb;",
    "  if(slot < 6.5) return texture2D(uTex6, uv).rgb;",
    "  return texture2D(uTex7, uv).rgb;",
    "}",
    "void main(){",
    "  int fi = int(floor(vFace + 0.5));",
    "  vec4 fade = uFade[0];",
    "  if(fi==1) fade=uFade[1]; else if(fi==2) fade=uFade[2]; else if(fi==3) fade=uFade[3];",
    "  else if(fi==4) fade=uFade[4]; else if(fi==5) fade=uFade[5]; else if(fi==6) fade=uFade[6];",
    "  else if(fi==7) fade=uFade[7]; else if(fi==8) fade=uFade[8]; else if(fi==9) fade=uFade[9];",
    "  else if(fi==10) fade=uFade[10]; else if(fi==11) fade=uFade[11]; else if(fi==12) fade=uFade[12];",
    "  else if(fi==13) fade=uFade[13]; else if(fi==14) fade=uFade[14]; else if(fi==15) fade=uFade[15];",
    "  else if(fi==16) fade=uFade[16]; else if(fi==17) fade=uFade[17]; else if(fi==18) fade=uFade[18];",
    "  else if(fi==19) fade=uFade[19];",
    "  vec3 a = sampleSlot(fade.x, vUv);",
    "  vec3 b = sampleSlot(fade.y, vUv);",
    "  vec3 photo = mix(a, b, clamp(fade.z, 0.0, 1.0));",
    "  vec3 N = normalize(vN);",
    "  vec3 V = normalize(vec3(0.1, 0.35, 1.0) - vW);",
    "  float fres = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 2.4);",
    "  float rim = pow(fres, 0.65);",
    "  float facet = abs(fract(vUv.x * 3.2 + vUv.y * 2.1) - 0.5);",
    "  facet = smoothstep(0.38, 0.08, facet);",
    "  float ph = uTime * 0.55 + vFace * 0.7;",
    "  vec3 chroma = vec3(0.55+0.45*sin(ph), 0.55+0.45*sin(ph+2.1), 0.55+0.45*sin(ph+4.2));",
    "  vec3 ice = vec3(0.72, 0.86, 1.0);",
    "  vec3 crystal = mix(photo * 0.92, ice, 0.12 + 0.35 * fres);",
    "  crystal += chroma * (rim * 0.55 + facet * 0.25);",
    "  crystal += vec3(0.85, 0.95, 1.0) * rim * 0.85;",
    "  crystal = mix(crystal, vec3(1.0), clamp(uWhite, 0.0, 1.0));",
    "  float alpha = 0.88 + 0.12 * rim;",
    "  gl_FragColor = vec4(crystal, alpha);",
    "}"
  ].join("\n");

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(s) || "shader compile failed");
    }
    return s;
  }

  function icosahedron() {
    var t = (1 + Math.sqrt(5)) / 2;
    var raw = [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
    ];
    function norm(v) {
      var L = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
      return [v[0] / L, v[1] / L, v[2] / L];
    }
    var verts = raw.map(norm);
    // Uneven crystal: push some verts out, pull others in.
    var scales = [1.22, 0.78, 1.05, 0.88, 1.35, 0.72, 1.12, 0.95, 1.28, 0.82, 1.08, 0.9];
    for (var i = 0; i < verts.length; i++) {
      var s = scales[i % scales.length];
      verts[i] = [verts[i][0] * s, verts[i][1] * s, verts[i][2] * s];
    }
    var faces = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
    ];
    return { verts: verts, faces: faces };
  }

  function buildMesh(mesh) {
    var pos = [], nrm = [], uv = [], faceId = [];
    var areas = [];
    for (var f = 0; f < mesh.faces.length; f++) {
      var tri = mesh.faces[f];
      var a = mesh.verts[tri[0]], b = mesh.verts[tri[1]], c = mesh.verts[tri[2]];
      var e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      var e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      var nx = e1[1] * e2[2] - e1[2] * e2[1];
      var ny = e1[2] * e2[0] - e1[0] * e2[2];
      var nz = e1[0] * e2[1] - e1[1] * e2[0];
      var nL = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= nL; ny /= nL; nz /= nL;
      areas.push(nL * 0.5);
      // Planar UV from edge basis (uneven faces → big/small UV footprints).
      var tL = Math.sqrt(e1[0] * e1[0] + e1[1] * e1[1] + e1[2] * e1[2]) || 1;
      var tx = e1[0] / tL, ty = e1[1] / tL, tz = e1[2] / tL;
      var bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
      var pts = [a, b, c];
      var uvs = [];
      var minu = 1e9, minv = 1e9, maxu = -1e9, maxv = -1e9;
      for (var p = 0; p < 3; p++) {
        var d = [pts[p][0] - a[0], pts[p][1] - a[1], pts[p][2] - a[2]];
        var u = d[0] * tx + d[1] * ty + d[2] * tz;
        var v = d[0] * bx + d[1] * by + d[2] * bz;
        uvs.push([u, v]);
        if (u < minu) minu = u; if (v < minv) minv = v;
        if (u > maxu) maxu = u; if (v > maxv) maxv = v;
      }
      var du = Math.max(1e-4, maxu - minu);
      var dv = Math.max(1e-4, maxv - minv);
      var scale = 1 / Math.max(du, dv);
      for (var q = 0; q < 3; q++) {
        pos.push(pts[q][0], pts[q][1], pts[q][2]);
        nrm.push(nx, ny, nz);
        uv.push((uvs[q][0] - minu) * scale, (uvs[q][1] - minv) * scale);
        faceId.push(f);
      }
    }
    return {
      pos: new Float32Array(pos),
      nrm: new Float32Array(nrm),
      uv: new Float32Array(uv),
      faceId: new Float32Array(faceId),
      areas: areas,
      faceCount: mesh.faces.length
    };
  }

  function mat4Perspective(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2);
    var nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0
    ]);
  }

  function mat4Multiply(a, b) {
    var o = new Float32Array(16);
    for (var i = 0; i < 4; i++) {
      for (var j = 0; j < 4; j++) {
        o[i * 4 + j] =
          a[j] * b[i * 4] + a[4 + j] * b[i * 4 + 1] +
          a[8 + j] * b[i * 4 + 2] + a[12 + j] * b[i * 4 + 3];
      }
    }
    return o;
  }

  function mat4FromEuler(rx, ry, rz) {
    var cx = Math.cos(rx), sx = Math.sin(rx);
    var cy = Math.cos(ry), sy = Math.sin(ry);
    var cz = Math.cos(rz), sz = Math.sin(rz);
    // Y * X * Z
    return new Float32Array([
      cy * cz + sy * sx * sz, cx * sz, -sy * cz + cy * sx * sz, 0,
      -cy * sz + sy * sx * cz, cx * cz, sy * sz + cy * sx * cz, 0,
      sy * cx, -sx, cy * cx, 0,
      0, 0, 0, 1
    ]);
  }

  function mat3NormalFromMat4(m) {
    return new Float32Array([m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]);
  }

  function Crystal(root) {
    this.root = root;
    this.scene = root.querySelector(".swft-crystal__scene");
    this.canvas = root.querySelector(".swft-crystal__canvas");
    if (!this.canvas) {
      this.canvas = document.createElement("canvas");
      this.canvas.className = "swft-crystal__canvas";
      if (this.scene) this.scene.appendChild(this.canvas);
    }
    this.spinDps = parseFloat(root.getAttribute("data-spin")) || 10;
    this.fadeMs = parseFloat(root.getAttribute("data-fade-interval")) || 3200;
    this.hx = 0; this.hy = 0; this.rx = -12; this.ry = 18; this.rz = 8;
    this.white = 0;
    this.visible = true;
    this.dragging = false;
    this.lastX = 0; this.lastY = 0;
    this.reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

    var imgs = root.querySelectorAll(".swft-crystal__sources img");
    this.imageEls = Array.prototype.slice.call(imgs);
    if (!this.imageEls.length) {
      if (window.console) console.warn("[swft-crystal] no source images");
      return;
    }

    try {
      this.initGL();
    } catch (err) {
      if (window.console) console.warn("[swft-crystal] WebGL failed:", err.message);
      this.gl = null;
      return;
    }

    this.setupFades();
    this.bind();
    this.loop = this.loop.bind(this);
    this.root.__swftCrystal = this;
    requestAnimationFrame(this.loop);
  }

  Crystal.prototype.initGL = function () {
    var gl = this.canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: true });
    if (!gl) throw new Error("no webgl");
    var prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || "link");
    gl.useProgram(prog);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    var mesh = buildMesh(icosahedron());
    this.mesh = mesh;
    this.faceCount = mesh.faceCount;

    function buf(data, attr, size) {
      var b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      var loc = gl.getAttribLocation(prog, attr);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    }
    buf(mesh.pos, "aPos", 3);
    buf(mesh.nrm, "aNrm", 3);
    buf(mesh.uv, "aUv", 2);
    buf(mesh.faceId, "aFace", 1);

    this.gl = gl;
    this.prog = prog;
    this.uMVP = gl.getUniformLocation(prog, "uMVP");
    this.uNMat = gl.getUniformLocation(prog, "uNMat");
    this.uWhite = gl.getUniformLocation(prog, "uWhite");
    this.uTime = gl.getUniformLocation(prog, "uTime");
    this.uFade = [];
    for (var i = 0; i < FACE_COUNT; i++) {
      this.uFade[i] = gl.getUniformLocation(prog, "uFade[" + i + "]");
    }

    this.textures = [];
    var maxSlots = 8;
    for (var t = 0; t < maxSlots; t++) {
      var tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + t);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE,
        new Uint8Array([180, 210, 255, 255, 160, 190, 240, 255, 140, 180, 230, 255, 200, 220, 255, 255]));
      var loc = gl.getUniformLocation(prog, "uTex" + t);
      if (loc) gl.uniform1i(loc, t);
      this.textures.push(tex);
    }

    var self = this;
    this.imageEls.slice(0, maxSlots).forEach(function (img, idx) {
      function upload() {
        try {
          gl.activeTexture(gl.TEXTURE0 + idx);
          gl.bindTexture(gl.TEXTURE_2D, self.textures[idx]);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        } catch (e) { /* CORS / decode */ }
      }
      if (img.complete && img.naturalWidth) upload();
      else img.addEventListener("load", upload, { once: true });
    });

    this.slotCount = Math.min(maxSlots, this.imageEls.length);
  };

  Crystal.prototype.setupFades = function () {
    var n = this.faceCount;
    var slots = this.slotCount || 1;
    this.fades = [];
    for (var i = 0; i < n; i++) {
      var a = i % slots;
      var b = (i + 1 + (i % 3)) % slots;
      if (b === a) b = (a + 1) % slots;
      // Larger faces fade more slowly / start later so small faces change more often.
      var area = this.mesh.areas[i] || 1;
      var areaNorm = area / (Math.max.apply(null, this.mesh.areas) || 1);
      this.fades.push({
        a: a,
        b: b,
        t: Math.random(),
        speed: (0.55 + (1 - areaNorm) * 0.9) / (this.fadeMs / 1000),
        hold: 0.35 + areaNorm * 0.45,
        phase: Math.random() * Math.PI * 2
      });
    }
  };

  Crystal.prototype.bind = function () {
    var self = this;
    var el = this.root;
    function down(e) {
      self.dragging = true;
      el.classList.add("is-dragging");
      var p = e.touches ? e.touches[0] : e;
      self.lastX = p.clientX; self.lastY = p.clientY;
      e.preventDefault();
    }
    function move(e) {
      if (!self.dragging) return;
      var p = e.touches ? e.touches[0] : e;
      var dx = p.clientX - self.lastX, dy = p.clientY - self.lastY;
      self.lastX = p.clientX; self.lastY = p.clientY;
      self.ry += dx * 0.45;
      self.rx += dy * 0.45;
      self.hx = 0; self.hy = 0;
    }
    function up() {
      self.dragging = false;
      el.classList.remove("is-dragging");
    }
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    el.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") self.ry -= 18;
      if (e.key === "ArrowRight") self.ry += 18;
      if (e.key === "ArrowUp") self.rx -= 14;
      if (e.key === "ArrowDown") self.rx += 14;
    });
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (entries) {
        self.visible = entries[0].isIntersecting;
        if (self.visible) requestAnimationFrame(self.loop);
      }).observe(el);
    }
  };

  Crystal.prototype.resize = function () {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.round(this.root.clientWidth * dpr));
    var h = Math.max(1, Math.round(this.root.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.gl.viewport(0, 0, w, h);
    }
  };

  Crystal.prototype.loop = function (now) {
    if (!this.gl) return;
    if (!this.visible || document.hidden) { this.prev = 0; return; }
    var dt = this.prev ? Math.min(0.05, (now - this.prev) / 1000) : 1 / 60;
    this.prev = now;
    if (!this.dragging && !this.reduce && this.spinDps) {
      this.ry += this.spinDps * dt;
      this.rx += Math.sin(now / 1000 * 0.4) * 0.08;
    }
    // Per-face crossfade (skip tiny faces for readability: still fade but slower via speed).
    if (!this.reduce) {
      for (var i = 0; i < this.fades.length; i++) {
        var f = this.fades[i];
        f.t += f.speed * dt;
        if (f.t >= 1 + f.hold) {
          f.a = f.b;
          f.b = (f.a + 1 + (i % 2)) % (this.slotCount || 1);
          if (f.b === f.a) f.b = (f.a + 1) % (this.slotCount || 1);
          f.t = 0;
        }
      }
    }
    // Intro white amount from CSS var if present
    var cssWhite = getComputedStyle(document.documentElement).getPropertyValue("--intro-white").trim();
    if (cssWhite !== "") this.white = parseFloat(cssWhite) || 0;

    this.draw(now / 1000);
    requestAnimationFrame(this.loop);
  };

  Crystal.prototype.draw = function (t) {
    var gl = this.gl;
    this.resize();
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    var aspect = this.canvas.width / Math.max(1, this.canvas.height);
    var proj = mat4Perspective(38 * Math.PI / 180, aspect, 0.1, 20);
    var rot = mat4FromEuler(this.rx * Math.PI / 180, this.ry * Math.PI / 180, this.rz * Math.PI / 180);
    // Translate back so crystal fits view
    var model = new Float32Array(rot);
    model[14] = -3.15;
    var mvp = mat4Multiply(proj, model);
    gl.uniformMatrix4fv(this.uMVP, false, mvp);
    gl.uniformMatrix3fv(this.uNMat, false, mat3NormalFromMat4(model));
    gl.uniform1f(this.uWhite, this.white);
    gl.uniform1f(this.uTime, t);
    for (var i = 0; i < FACE_COUNT; i++) {
      var f = this.fades[i] || { a: 0, b: 0, t: 0, hold: 1 };
      var blend = f.t <= 1 ? f.t : 1;
      // smoothstep
      blend = blend * blend * (3 - 2 * blend);
      if (this.uFade[i]) gl.uniform4f(this.uFade[i], f.a, f.b, blend, 0);
    }
    gl.drawArrays(gl.TRIANGLES, 0, this.mesh.pos.length / 3);
  };

  function initAll() {
    var nodes = document.querySelectorAll("[data-swft-crystal]");
    for (var i = 0; i < nodes.length; i++) {
      if (!nodes[i].__swftCrystal) new Crystal(nodes[i]);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
  window.SwftCrystal = { init: initAll };
})();
