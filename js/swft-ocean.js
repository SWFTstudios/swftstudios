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
  var INTRO_BIRDSEYE_DIST = 70;  // camera distance above the cube in the load intro's opening shot
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
    "uniform vec4 uRings[8];",
    "uniform float uIntro;",
    "uniform float uShowCube;",
    "uniform float uLetterCount;",
    "uniform vec3 uLPos[4];",
    "uniform float uLHalf[4];",
    "uniform mat3 uLMat[4];",
    "uniform float uLIdx[4];",
    "uniform float uFlash;",
    "uniform sampler2D uAtlas;",

    "const float DEPTH = 0.3;",
    "const vec3 ICE = vec3(0.55, 0.8, 1.0);",
    "const vec3 WHITE = vec3(1.0, 0.98, 0.95);",

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

    // Bloom around one glowing cube centre.
    "vec3 glowAt(vec3 ro, vec3 rd, float tMax, vec3 cPos, float halfSz, vec3 tint) {",
    "  vec3 oc = cPos - ro;",
    "  float t = dot(oc, rd);",
    "  if (t < 0.0 || t > tMax) return vec3(0.0);",
    "  float d = length(ro + rd * t - cPos) / max(halfSz, 0.05);",
    "  return tint * (0.016 / (d * d * 0.9 + 0.15) + 0.75 * exp(-d * 2.2));",
    "}",

    "vec3 glow(vec3 ro, vec3 rd, float tMax) {",
    "  vec3 c = mix(ICE, WHITE, uIntro) * (1.0 + 0.8 * uIntro);",
    "  vec3 g = vec3(0.0);",
    "  if (uLetterCount > 0.5) {",
    "    for (int i = 0; i < 4; i++) {",
    "      if (float(i) >= uLetterCount) break;",
    "      if (uLHalf[i] < 0.02) continue;",
    "      g += glowAt(ro, rd, tMax, uLPos[i], uLHalf[i], WHITE * 1.7);",
    "    }",
    "    return g;",
    "  }",
    "  if (uHasCube < 0.5) return vec3(0.0);",
    "  return glowAt(ro, rd, tMax, uCube, uHalf, c);",
    "}",

    // Low mist lying on the water, lit by the cube and spread sideways.
    "vec3 mistAt(vec3 ro, vec3 rd, float tMax, vec3 cPos, float halfSz) {",
    "  vec2 dxz = rd.xz;",
    "  float den = dot(dxz, dxz);",
    "  if (den < 1e-6) return vec3(0.0);",
    "  float t = dot(cPos.xz - ro.xz, dxz) / den;",
    "  if (t < 0.0 || t > tMax) return vec3(0.0);",
    "  vec3 p = ro + rd * t;",
    "  float side = (p.x - cPos.x) / halfSz;",
    "  float h = max(p.y, 0.0) / halfSz;",
    "  return ICE * 0.07 * exp(-side * side * 0.35) * exp(-h * 3.5);",
    "}",

    "vec3 mist(vec3 ro, vec3 rd, float tMax) {",
    "  if (uLetterCount > 0.5) {",
    "    vec3 m = vec3(0.0);",
    "    for (int i = 0; i < 4; i++) {",
    "      if (float(i) >= uLetterCount) break;",
    "      if (uLHalf[i] < 0.02) continue;",
    "      m += mistAt(ro, rd, tMax, uLPos[i], uLHalf[i]);",
    "    }",
    "    return m;",
    "  }",
    "  if (uHasCube < 0.5) return vec3(0.0);",
    "  return mistAt(ro, rd, tMax, uCube, uHalf);",
    "}",

    // Ray vs an AABB in a rotated local frame. Returns hit distance or -1.
    // halfExt lets letter prisms be flattened table-cut gems (wide XZ, short Y).
    "float hitBox(vec3 ro, vec3 rd, vec3 cPos, vec3 halfExt, mat3 toLocal, out vec3 lp, out vec3 nl) {",
    "  vec3 o = toLocal * (ro - cPos);",
    "  vec3 d = toLocal * rd;",
    "  vec3 m = 1.0 / d;",
    "  vec3 n = m * o;",
    "  vec3 k = abs(m) * halfExt;",
    "  vec3 t1 = -n - k, t2 = -n + k;",
    "  float tN = max(max(t1.x, t1.y), t1.z);",
    "  float tF = min(min(t2.x, t2.y), t2.z);",
    "  if (tN > tF || tF < 0.0) return -1.0;",
    "  nl = -sign(d) * step(t1.yzx, t1.xyz) * step(t1.zxy, t1.xyz);",
    "  lp = o + d * tN;",
    "  return tN;",
    "}",

    // Flattened gem extents: larger faces on XZ, shallow Y (table-cut).
    "vec3 gemHalf(float halfSz) { return halfSz * vec3(1.32, 0.36, 1.32); }",

    "float hitCube(vec3 ro, vec3 rd, out vec3 lp, out vec3 nl) {",
    "  if (uHasCube < 0.5) return -1.0;",
    "  return hitBox(ro, rd, uCube, vec3(uHalf), uToLocal, lp, nl);",
    "}",

    "vec2 faceUV(vec3 lp, vec3 nl, vec3 halfExt) {",
    "  vec3 q = lp / halfExt;",
    "  vec3 an = abs(nl);",
    "  vec2 uv;",
    "  if (an.x > 0.5) uv = vec2(nl.x < 0.0 ? -q.z : q.z, -q.y);",
    "  else if (an.y > 0.5) uv = vec2(q.x, nl.y > 0.0 ? -q.z : q.z);",
    "  else uv = vec2(nl.z > 0.0 ? -q.x : q.x, -q.y);",
    "  return clamp(uv * 0.5 + 0.5, 0.0, 1.0);",
    "}",

    // The cube as seen in the water: dim glassy faces with bright glowing edges.
    "vec3 cubeEmission(vec3 lp, vec3 nl) {",
    "  vec3 q = abs(lp) / uHalf;",
    "  vec3 an = abs(nl);",
    "  float edge = max(q.x * (1.0 - an.x), max(q.y * (1.0 - an.y), q.z * (1.0 - an.z)));",
    "  float rim = smoothstep(0.84, 0.985, edge);",
    // Glowing glass: lit panes with bright, sharp edges.
    // During the load intro the cube is a solid white light source.
    "  return mix(ICE * (0.16 + 2.4 * rim), WHITE * (1.6 + 1.2 * rim), uIntro);",
    "}",

    "vec3 letterEmission(vec3 lp, vec3 nl, float halfSz, float idx) {",
    "  vec3 halfExt = gemHalf(halfSz);",
    "  vec3 q = abs(lp) / halfExt;",
    "  vec3 an = abs(nl);",
    "  float edge = max(q.x * (1.0 - an.x), max(q.y * (1.0 - an.y), q.z * (1.0 - an.z)));",
    "  float rim = smoothstep(0.62, 0.995, edge);",
    "  vec2 uv = faceUV(lp, nl, halfExt);",
    "  float cell = floor(idx + 0.5);",
    "  vec2 auv = vec2((uv.x + cell) * 0.25, uv.y);",
    "  float glyph = texture2D(uAtlas, auv).a;",
    // Cut-crystal facets: diamond lattice on each face + sharp edge fire.
    "  vec2 fu = (uv - 0.5) * 2.0;",
    "  float facetA = abs(fract(fu.x * 2.4 + fu.y * 1.7) - 0.5);",
    "  float facetB = abs(fract(fu.x * -1.6 + fu.y * 2.8) - 0.5);",
    "  float facets = smoothstep(0.42, 0.08, min(facetA, facetB));",
    "  float facetEdge = smoothstep(0.12, 0.02, abs(facetA - facetB));",
    // Fresnel glass body — cool ice with soft internal glow (not flat metal).
    "  float fres = pow(1.0 - clamp(abs(dot(nl, normalize(vec3(0.15, 0.55, 0.85)))), 0.0, 1.0), 2.2);",
    "  float core = pow(max(0.0, 1.0 - length(fu) * 0.72), 2.8);",
    "  vec3 iceBody = vec3(0.55, 0.72, 0.92) * (0.22 + 0.55 * core)",
    "              + vec3(0.85, 0.95, 1.0) * (0.35 * fres + 1.1 * pow(rim, 0.7))",
    "              + vec3(0.65, 0.85, 1.0) * facets * 0.45",
    "              + WHITE * facetEdge * 0.55;",
    // Prismatic RGB split along the Fresnel / facet highlights.
    "  float prism = fres * 0.55 + facets * 0.35 + pow(rim, 1.2) * 0.4;",
    "  float ph = uTime * 0.7 + cell * 1.3 + fu.x * 2.0;",
    "  vec3 chroma = vec3(",
    "    0.55 + 0.45 * sin(ph),",
    "    0.55 + 0.45 * sin(ph + 2.094),",
    "    0.55 + 0.45 * sin(ph + 4.189)",
    "  );",
    "  vec3 crystal = iceBody + chroma * prism * 0.85 + WHITE * core * 0.25;",
    // Carved glyph: recessed trough + lit lip so SWFT stays legible in glass.
    "  float trough = smoothstep(0.08, 0.55, glyph);",
    "  float lip = smoothstep(0.08, 0.42, glyph) * (1.0 - smoothstep(0.42, 0.88, glyph));",
    "  vec3 carved = crystal * (1.0 - trough * 0.72)",
    "              + vec3(0.02, 0.04, 0.07) * trough",
    "              + WHITE * lip * 1.35",
    "              + chroma * lip * 0.55;",
    "  return mix(crystal, carved, clamp(glyph * 1.2, 0.0, 1.0));",
    "}",

    "float hitLetters(vec3 ro, vec3 rd, out vec3 lp, out vec3 nl, out float idx, out float halfSz) {",
    "  float best = -1.0;",
    "  lp = vec3(0.0); nl = vec3(0.0); idx = 0.0; halfSz = 0.0;",
    "  for (int i = 0; i < 4; i++) {",
    "    if (float(i) >= uLetterCount) break;",
    "    if (uLHalf[i] < 0.02) continue;",
    "    vec3 tlp, tnl;",
    "    float t = hitBox(ro, rd, uLPos[i], gemHalf(uLHalf[i]), uLMat[i], tlp, tnl);",
    "    if (t > 0.0 && (best < 0.0 || t < best)) {",
    "      best = t; lp = tlp; nl = tnl; idx = uLIdx[i]; halfSz = uLHalf[i];",
    "    }",
    "  }",
    "  return best;",
    "}",

    "vec3 waterLightAt(vec3 p, vec3 N, vec3 rd, vec3 cPos) {",
    "  vec3 toL = cPos - p;",
    "  float dl = length(toL);",
    "  toL /= max(dl, 1e-4);",
    "  float nh = max(dot(N, normalize(toL - rd)), 0.0);",
    "  float atten = 6.0 / (1.0 + dl * dl);",
    "  float sparkle = step(0.82, hash(floor(p.xz * 40.0) + floor(uTime * 6.0)));",
    "  vec3 lit = WHITE * atten * (pow(nh, 180.0) * 3.5 + pow(nh, 60.0) * sparkle * 1.4 + pow(nh, 24.0) * 0.12)",
    "           + vec3(0.03, 0.075, 0.14) * atten * max(dot(N, toL), 0.0);",
    "  float crest = smoothstep(-0.28, 0.16, p.y);",
    "  float back = pow(max(dot(rd, toL), 0.0), 3.0);",
    "  vec3 sss = vec3(0.04, 0.3, 0.55) * atten * crest * crest * (0.2 + 1.6 * back) * 0.45;",
    "  return lit + sss + vec3(0.0, 0.006, 0.012) * atten * 0.3;",
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
    // Detail and haze go by distance across the water (not ray length), so the
    // waves stay crisp seen from straight above in the intro's birdseye shot.
    "    float hd = length(p.xz - ro.xz);",
    "    float near = exp(-hd * 0.09);",
    "    N = normalize(N + vec3(ripple(p.xz), 0.0).xzy * vec3(1.0, 0.0, 1.0) * 0.045 * near);",
    "    N = normalize(mix(N, vec3(0.0, 1.0, 0.0), 0.55 * min(1.0, sqrt(hd * 0.012) * 1.1)));",
    // Rings where the cube's corners touch the water (x, z, age or -1 for a live contact,
    // strength). Each ring is a travelling ripple that tilts the surface, so it shows up the
    // way real ripples do: as bending lines in the glow and reflections.
    "    float ringLine = 0.0;",
    "    for (int i = 0; i < 8; i++) {",
    "      vec4 f = uRings[i];",
    "      if (f.w <= 0.0) continue;",
    "      vec2 dv = p.xz - f.xy;",
    "      float d = length(dv) + 1e-4;",
    "      float age = f.z < 0.0 ? fract(uTime * 0.9) : f.z;",
    "      float r = 0.03 + age * 0.55;",
    "      float env = exp(-(d - r) * (d - r) / (0.004 + 0.02 * age)) * exp(-age * 1.5) * f.w;",
    "      if (f.z < 0.0) env *= 0.45;",
    "      float ph = (d - r) * 70.0;",
    "      N = normalize(N + vec3(dv.x / d, 0.0, dv.y / d) * sin(ph) * env * 0.5);",
    "      ringLine += env * max(cos(ph), 0.0);",
    "    }",
    "    float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, -rd), 0.0), 5.0);",
    "    vec3 R = reflect(rd, N);",
    "    R.y = abs(R.y);",
    "    vec3 Rs = reflect(rd, Ns);",
    "    Rs.y = abs(Rs.y);",
    // Mirror image: the cube itself where the reflected ray meets it, its bloom everywhere else.
    "    vec3 lp, nl;",
    "    vec3 refl = sky(R) + glow(p, R, 80.0);",
    "    if (uLetterCount > 0.5) {",
    "      float lidx, lhalf;",
    "      if (hitLetters(p, Rs, lp, nl, lidx, lhalf) > 0.0)",
    "        refl += letterEmission(lp, nl, lhalf, lidx) * (0.75 + 0.5 * crestShade(p.y));",
    "    } else if (hitCube(p, Rs, lp, nl) > 0.0) {",
    "      refl += cubeEmission(lp, nl) * (0.75 + 0.5 * crestShade(p.y));",
    "    }",
    // Cube(s) light the ripples: sharp glints plus a faint cool sheen.
    "    vec3 lit = vec3(0.0);",
    "    float crest = smoothstep(-0.28, 0.16, p.y);",
    "    if (uLetterCount > 0.5) {",
    "      for (int i = 0; i < 4; i++) {",
    "        if (float(i) >= uLetterCount) break;",
    "        if (uLHalf[i] < 0.02) continue;",
    "        lit += waterLightAt(p, N, rd, uLPos[i]);",
    "      }",
    "    } else {",
    "      lit = waterLightAt(p, N, rd, uCube);",
    "    }",
    "    vec3 deep = vec3(0.0002, 0.0012, 0.0026) * (0.4 + crest);",
    "    col = mix(deep, refl, fres) + lit;",
    // Ring crests catch the cube's light.
    "    float attenRing = 0.0;",
    "    if (uLetterCount > 0.5) {",
    "      for (int i = 0; i < 4; i++) {",
    "        if (float(i) >= uLetterCount) break;",
    "        float dl = length(uLPos[i] - p);",
    "        attenRing += 6.0 / (1.0 + dl * dl);",
    "      }",
    "    } else {",
    "      float dl = length(uCube - p);",
    "      attenRing = 6.0 / (1.0 + dl * dl);",
    "    }",
    "    col += ICE * attenRing * min(ringLine, 1.0) * 0.35;",
    "    col = mix(col, sky(vec3(rd.x, 0.02, rd.z)), 1.0 - exp(-hd * 0.015));",
    "  } else {",
    "    col = sky(rd);",
    "  }",
    // During the intro the cube(s) are drawn here (the DOM cube can't be seen from above).
    "  if (uShowCube > 0.0) {",
    "    if (uLetterCount > 0.5) {",
    "      vec3 clp, cnl; float cidx, chalf;",
    "      float tc = hitLetters(ro, rd, clp, cnl, cidx, chalf);",
    "      if (tc > 0.0 && tc < tHit) {",
    "        col = mix(col, letterEmission(clp, cnl, chalf, cidx) * 1.4, uShowCube);",
    "        tHit = tc;",
    "      }",
    "    } else {",
    "      vec3 clp, cnl;",
    "      float tc = hitCube(ro, rd, clp, cnl);",
    "      if (tc > 0.0 && tc < tHit) {",
    "        col = mix(col, cubeEmission(clp, cnl) * 1.4, uShowCube);",
    "        tHit = tc;",
    "      }",
    "    }",
    "  }",
    "  col += glow(ro, rd, tHit) + mist(ro, rd, tHit);",
    "  col += WHITE * uFlash * 0.28;",
    "  col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);",
    "  col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));",
    // Dither so the dark gradients don't band.
    "  col += (hash(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5) / 255.0;",
    "  vec2 s = gl_FragCoord.xy / uRes;",
    "  col *= 0.45 + 0.55 * pow(16.0 * s.x * s.y * (1.0 - s.x) * (1.0 - s.y), 0.22);",
    "  col = mix(col, vec3(0.85, 0.92, 1.0), clamp(uFlash * 0.22, 0.0, 1.0));",
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
  function rotZ(deg) {
    var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return [[c, -s, 0], [s, c, 0], [0, 0, 1]];
  }
  function mul(A, B) {
    var R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) {
      R[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
    }
    return R;
  }
  // Local->world rotation from euler degrees (rx, ry, rz), returned as world->local
  // column-major floats for uniformMatrix3fv.
  function eulerToLocalMat(rx, ry, rz) {
    var R = mul(mul(rotX(rx), rotY(ry)), rotZ(rz));
    // world->local = R^T; column-major of R^T = rows of R concatenated.
    return [
      R[0][0], R[0][1], R[0][2],
      R[1][0], R[1][1], R[1][2],
      R[2][0], R[2][1], R[2][2]
    ];
  }

  // 4-letter atlas (S W F T) — alpha mask for carved crystal glyphs in the shader.
  function makeLetterAtlas(gl) {
    var W = 512, H = 128, cell = 128;
    var c = document.createElement("canvas");
    c.width = W; c.height = H;
    var ctx = c.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    var letters = ["S", "W", "F", "T"];
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 96px system-ui, -apple-system, Segoe UI, sans-serif";
    for (var i = 0; i < 4; i++) {
      var cx = i * cell + cell / 2;
      var cy = H / 2;
      // Crisp core for the carved trough; soft outer for the lit lip.
      ctx.shadowColor = "rgba(255,255,255,0.35)";
      ctx.shadowBlur = 6;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(letters[i], cx, cy + 3);
      ctx.shadowBlur = 0;
      ctx.fillText(letters[i], cx, cy + 3);
    }
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
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
    this.cubeEl = root.querySelector("[data-swft-crystal]") || root.querySelector("[data-swft-cube]");
    this.sceneEl = root.querySelector(".swft-crystal__scene") || root.querySelector(".swft-cube__scene");
    this.bodyEl = this.sceneEl || root.querySelector(".swft-cube__body");
    this.visible = true;
    this.scale = 1;
    this.frameMs = 16;
    this.lastKey = "";
    this.start = performance.now();

    var gapAttr = parseFloat(root.getAttribute("data-hover-gap"));
    this.hoverGap = (isNaN(gapAttr) ? HOVER_GAP : Math.max(0.05, gapAttr)) * CUBE_SIZE;

    this.pitch = CAM_PITCH;
    this.lift = 0;                       // buoyancy: raises the cube when a corner would sink too deep
    // 0..1 white "light source" look for the homepage load intro (js/hero-intro.js drives it).
    this.intro = document.documentElement.classList.contains("swft-intro") ? 1 : 0;
    this.introCam = this.intro ? 0 : null;     // see introCamera()
    this.introShowCube = this.intro ? 1 : 0;
    this.introLetters = null;                // set by setIntroLetters() during load swirl
    this.introFlash = 0;
    this.corners = [];                   // previous corner positions / depths, for splash detection
    this.ripples = [];
    this.rings = new Float32Array(32);

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
     "uToLocal", "uRings[0]", "uIntro", "uShowCube", "uLetterCount", "uFlash", "uAtlas"].forEach(function (n) {
      u[n] = gl.getUniformLocation(prog, n);
    });
    for (var i = 0; i < 4; i++) {
      u["uLPos" + i] = gl.getUniformLocation(prog, "uLPos[" + i + "]");
      u["uLHalf" + i] = gl.getUniformLocation(prog, "uLHalf[" + i + "]");
      u["uLMat" + i] = gl.getUniformLocation(prog, "uLMat[" + i + "]");
      u["uLIdx" + i] = gl.getUniformLocation(prog, "uLIdx[" + i + "]");
    }
    this.gl = gl;
    this.u = u;
    this.letterAtlas = makeLetterAtlas(gl);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.letterAtlas);
    if (u.uAtlas) gl.uniform1i(u.uAtlas, 0);
    this.root.classList.add("swft-ocean--live");
  };

  // Drive the four letter cubes during the homepage load intro.
  // state: { cubes:[{x,y,z,half,rx,ry,rz,letter}], flash } or null to clear.
  Ocean.prototype.setIntroLetters = function (state) {
    if (!state || !state.cubes || !state.cubes.length) {
      this.introLetters = null;
      this.introFlash = 0;
      this.lastKey = "";
      return;
    }
    var cubes = state.cubes.slice(0, 4);
    this.introLetters = cubes;
    this.introFlash = state.flash || 0;
    this.lastKey = "";
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
    // Optional horizontal bias (fraction of stage width from centre). Homepage
    // uses 0.25 so the cube sits in the right half of a full-bleed ocean.
    var bias = parseFloat(this.root.getAttribute("data-cube-bias-x"));
    if (!isNaN(bias) && bias !== 0 && this.pxPerWorld) {
      this.cube[0] = bias * W / this.pxPerWorld;
    }
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
    var relayout = function () { self.scale = 9; self.layout(); self.redraw(); };
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

    this.lastArgs = [t, bob, M, now];
    if (this.gl) this.draw(t, bob, M, now);
    requestAnimationFrame(this.loop);
  };

  // The DOM cube / crystal rotation as a world-space matrix (local -> world).
  Ocean.prototype.cubeMatrix = function () {
    var inst = this.cubeEl && (this.cubeEl.__swftCrystal || this.cubeEl.__swftCube);
    var rot = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    if (inst) {
      // Free tumble: pitch / yaw / roll (rz so splash follows vertex rolls).
      var body = mul(mul(rotX(inst.rx || 0), rotY(inst.ry || 0)), rotZ(inst.rz || 0));
      rot = mul(mul(rotX(inst.hx || 0), rotY(inst.hy || 0)), body);
    }
    // CSS space (y down, z to viewer) -> world (y up, z away): M = F R F, F = diag(1,-1,-1)
    var F = [1, -1, -1];
    var M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) M[i][j] = F[i] * rot[i][j] * F[j];
    return M;
  };

  // Find the corners touching the water: small standing rings where they sit in it,
  // and a ring that spreads out when one cuts in (or a crest slaps up against it).
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

    // Pack rings for the shader: live contacts (deepest first), then the newest spreading rings.
    contacts.sort(function (p, q) { return q[2] - p[2]; });
    var f = this.rings, k = 0;
    f.fill(0);
    for (var c = 0; c < contacts.length && k < 4; c++, k++) {
      f[k * 4] = contacts[c][0]; f[k * 4 + 1] = contacts[c][1]; f[k * 4 + 2] = -1;
      f[k * 4 + 3] = Math.min(1, (contacts[c][2] + 0.015) * 9);
    }
    for (var r = this.ripples.length - 1; r >= 0 && k < 8; r--, k++) {
      var rp = this.ripples[r];
      f[k * 4] = rp.x; f[k * 4 + 1] = rp.z; f[k * 4 + 2] = rp.age; f[k * 4 + 3] = rp.str;
    }
  };

  // Camera for this frame. Normally the hero camera from layout(). During the load
  // intro, this.introCam (0..1) flies it in: 0 = high above the cube looking
  // straight down (birdseye), 1 = the hero camera. It swings along an arc
  // around the cube, descending and tilting up toward the horizon.
  Ocean.prototype.introCamera = function (bob) {
    var cx = this.cube ? this.cube[0] : 0;
    var hero = { pos: [0, CAM_HEIGHT, 0], fw: this.fw, up: this.up, showCube: 0, key: "h" };
    var k = this.introCam;
    if (k === null || k === undefined || !this.cube) return hero;
    k = Math.max(0, Math.min(1, k));
    var cy = this.cube[1] + bob, cz = this.cube[2];
    var dy = CAM_HEIGHT - cy;                       // hero camera relative to the cube
    var elF = Math.atan2(dy, cz);                   // elevation of the camera seen from the cube
    var rF = Math.hypot(dy, cz);
    var r0 = INTRO_BIRDSEYE_DIST;
    var el = Math.PI / 2 + (elF - Math.PI / 2) * k; // straight overhead -> hero
    var r = Math.exp(Math.log(r0) + (Math.log(rF) - Math.log(r0)) * k);
    var pitch = el + (this.pitch - elF) * k;        // look at the cube, then settle into the hero framing
    // Birdseye sits over the (possibly biased) cube; as we land, cam X eases to 0
    // so the cube settles into the right half of the full-bleed hero.
    var pos = [cx * (1 - k), cy + r * Math.sin(el), cz - r * Math.cos(el)];
    var fw = [0, -Math.sin(pitch), Math.cos(pitch)];
    var up = [0, Math.cos(pitch), Math.sin(pitch)];
    return { pos: pos, fw: fw, up: up, showCube: this.introShowCube || 0, key: k.toFixed(4) + "/" + (this.introShowCube || 0).toFixed(3) + "/" + cx.toFixed(3) };
  };

  // Repaint straight away with the last frame's motion, e.g. after a layout()
  // that resized the canvas (which clears it) outside the render loop.
  Ocean.prototype.redraw = function () {
    if (!this.gl || !this.lastArgs) return;
    this.lastKey = "";
    this.draw(this.lastArgs[0], this.lastArgs[1], this.lastArgs[2], this.lastArgs[3]);
  };

  Ocean.prototype.draw = function (t, bob, M, now) {
    var gl = this.gl, u = this.u;

    var intro = this.intro || 0;
    var cam = this.introCamera(bob);
    var letters = this.introLetters;
    var letterCount = letters ? letters.length : 0;
    var flash = this.introFlash || 0;
    var key = t.toFixed(3) + "|" + bob.toFixed(4) + "|" + M.join(",") + "|" + this.canvas.width + "|" + intro.toFixed(3) +
      "|" + cam.key + "|" + letterCount + "|" + flash.toFixed(3);
    if (letters) {
      for (var li = 0; li < letters.length; li++) {
        var L = letters[li];
        key += "|" + L.x.toFixed(2) + "," + L.y.toFixed(2) + "," + L.z.toFixed(2) + "," +
          (L.half || 0).toFixed(3) + "," + (L.rx || 0).toFixed(1) + "," + (L.ry || 0).toFixed(1) + "," + (L.rz || 0).toFixed(1);
      }
    }
    if (key === this.lastKey) return; // nothing moved (reduced motion, idle)
    this.lastKey = key;

    var cube = [this.cube[0], this.cube[1] + bob, this.cube[2]];
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.uTime, t);
    gl.uniform3fv(u.uCam, cam.pos);
    gl.uniform3fv(u.uFw, cam.fw);
    gl.uniform3f(u.uRight, 1, 0, 0);
    gl.uniform3fv(u.uUp, cam.up);
    gl.uniform1f(u.uShowCube, cam.showCube);
    gl.uniform1f(u.uFocal, FOCAL);
    gl.uniform3fv(u.uCube, cube);
    gl.uniform1f(u.uHalf, CUBE_SIZE / 2);
    // While letter cubes are active they are the light source; keep hasCube for splash/rings.
    gl.uniform1f(u.uHasCube, this.cubeEl ? 1 : 0);
    gl.uniform4fv(u["uRings[0]"], this.rings);
    gl.uniform1f(u.uIntro, intro);
    // Column-major upload: M's rows become the columns of M^T (world -> local).
    gl.uniformMatrix3fv(u.uToLocal, false, [].concat(M[0], M[1], M[2]));
    gl.uniform1f(u.uLetterCount, letterCount);
    gl.uniform1f(u.uFlash, flash);
    if (this.letterAtlas) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.letterAtlas);
      if (u.uAtlas) gl.uniform1i(u.uAtlas, 0);
    }
    for (var i = 0; i < 4; i++) {
      var cubeL = letters && letters[i];
      if (cubeL) {
        gl.uniform3f(u["uLPos" + i], cubeL.x, cubeL.y, cubeL.z);
        gl.uniform1f(u["uLHalf" + i], cubeL.half != null ? cubeL.half : 0.4);
        gl.uniformMatrix3fv(u["uLMat" + i], false, eulerToLocalMat(cubeL.rx || 0, cubeL.ry || 0, cubeL.rz || 0));
        gl.uniform1f(u["uLIdx" + i], cubeL.letter != null ? cubeL.letter : i);
      } else {
        gl.uniform3f(u["uLPos" + i], 0, 0, 0);
        gl.uniform1f(u["uLHalf" + i], 0);
        gl.uniformMatrix3fv(u["uLMat" + i], false, [1, 0, 0, 0, 1, 0, 0, 0, 1]);
        gl.uniform1f(u["uLIdx" + i], i);
      }
    }
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

  window.SwftOcean = { init: init, CUBE_SIZE: CUBE_SIZE, eulerToLocalMat: eulerToLocalMat };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
