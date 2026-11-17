// scene.js - one fixed canvas, one cloud of points that takes six forms.
//
// phase 0 globe · 1 drift · 2 aircraft · 3 drift · 4 Türkiye · 5 drift · 6 radar rings
//
// The page owns the phase (main.js sets state.phase from scroll). Each solid
// shape is pinned to a DOM "anchor" element, so layout decides where the globe,
// the aircraft and the map sit at every breakpoint - the scene just follows.
// Units are CSS pixels measured from the centre of the viewport, y up.

import * as THREE from 'three';
import { rng, ll2v, buildGlobe, buildArcs, buildPlane, buildMap, buildRings, buildDrift, scramble, PLACES, PINS, HUB } from './shapes.js';

const PERSP = 3.4; // shared by the shader and the label projection below

const VERT = /* glsl */ `
uniform float uPhase, uTime, uScroll, uDpr, uSize, uPush;
uniform vec2 uView, uMouse;
uniform vec2 uCg, uCp, uCm, uCr;
uniform float uSg, uSp, uSm, uSr;
uniform mat3 uRg, uRp, uRm, uRr;
uniform vec3 uHub;
uniform vec3 uCol0, uCol1, uCol2;
attribute vec3 aPlane, aMap, aRing, aDrift;
attribute vec4 aAcc;   // accent code in each solid shape: globe, plane, map, rings
attribute vec2 aRand;  // x: order in the morph, y: size
varying vec3 vCol;
varying float vA;

vec3 accCol(float c){ return c < 0.5 ? uCol0 : (c < 1.5 ? uCol1 : uCol2); }
vec3 place(vec3 q, vec2 c, float s){ float k = ${PERSP.toFixed(1)} / (${PERSP.toFixed(1)} - q.z); return vec3(c + q.xy * s * k, q.z); }

void shape(float id, out vec3 p, out vec3 col, out vec2 as){
  if (id < 0.5) {                                   // globe
    vec3 q = uRg * position;
    p = place(q, uCg, uSg);
    float f = smoothstep(-0.2, 0.3, q.z);
    float hot = aAcc.x > 0.5 ? 1.0 : 0.0;
    col = accCol(aAcc.x);
    as = vec2(mix(0.06, 0.8, f) * (1.0 + 0.3 * hot), mix(0.7, 1.05, f) * (1.0 + 0.3 * hot));
  } else if (id > 1.5 && id < 2.5) {                // aircraft
    vec3 l = aPlane;
    float prop = aAcc.y > 2.5 ? 1.0 : 0.0;
    float lamp = (aAcc.y > 0.5 && aAcc.y < 2.5) ? 1.0 : 0.0;
    if (prop > 0.5) {
      vec2 d = l.yz - uHub.yz; float a = uTime * 7.0; float cs = cos(a), sn = sin(a);
      l.yz = uHub.yz + vec2(d.x * cs - d.y * sn, d.x * sn + d.y * cs);
    }
    vec3 q = uRp * l;
    p = place(q, uCp, uSp);
    float blink = mix(1.0, 0.45 + 0.55 * step(0.0, sin(uTime * 4.0 + aAcc.y * 2.4)), lamp);
    col = accCol(prop > 0.5 ? 0.0 : aAcc.y);
    as = vec2((0.5 + 0.45 * smoothstep(-0.7, 0.7, q.z)) * blink * (1.0 + 1.4 * lamp), (0.92 + 0.3 * q.z) * (1.0 + 1.6 * lamp));
  } else if (id > 3.5 && id < 4.5) {                // Türkiye
    vec3 l = aMap;
    float pin = aAcc.z > 0.5 ? 1.0 : 0.0;
    l.z += (1.0 - pin) * (sin(l.x * 7.0 + uTime * 0.9) * 0.014 + sin(l.y * 11.0 - uTime * 0.7) * 0.009);
    vec3 q = uRm * l;
    p = place(q, uCm, uSm);
    col = accCol(aAcc.z);
    as = vec2(mix(0.5, 1.0, pin), mix(0.92, 1.35, pin));
  } else if (id > 5.5) {                            // radar rings
    vec3 q = uRr * aRing;
    p = place(q, uCr, uSr);
    float sw = fract(atan(aRing.y, aRing.x) / 6.2831853 - uTime * 0.11);
    float beam = pow(sw, 7.0);
    col = mix(accCol(aAcc.w), uCol1, beam * 0.7);
    as = vec2(0.1 + 0.6 * beam + (aAcc.w > 1.5 ? 0.7 : 0.0), 0.8 + 0.55 * beam);
  } else {                                          // drift
    float dp = aDrift.z * 0.5 + 0.5;
    float y = mod(aDrift.y + uScroll * (0.12 + 0.5 * dp) + uTime * 0.006 * (0.4 + dp) + 1.0, 2.0) - 1.0;
    float x = aDrift.x + sin(uTime * 0.13 + aRand.x * 40.0) * 0.012;
    p = vec3(vec2(x, y) * uView * 0.56 - uMouse * (0.01 + 0.04 * dp), aDrift.z);
    col = uCol0;
    as = vec2(0.05 + 0.3 * dp * dp, 0.55 + 0.9 * dp);
  }
}

void main(){
  float ph = clamp(uPhase, 0.0, 6.0);
  float seg = min(floor(ph), 5.0);
  float t = ph - seg;
  float st = clamp(t * 1.5 - aRand.x * 0.5, 0.0, 1.0);
  st = st * st * (3.0 - 2.0 * st);

  vec3 p0, p1, c0, c1; vec2 a0, a1;
  shape(seg, p0, c0, a0);
  shape(seg + 1.0, p1, c1, a1);
  vec3 p = mix(p0, p1, st);
  vec2 as = mix(a0, a1, st);

  // a breath of turbulence at the middle of every transition
  float mid = sin(st * 3.14159265);
  float an = aRand.x * 62.83 + uTime * 0.2;
  p.xy += vec2(cos(an), sin(an)) * mid * (30.0 + 150.0 * aRand.y) * (uView.y / 900.0);

  // the dots step out of the cursor's way
  vec2 d = p.xy - uMouse;
  float f = exp(-dot(d, d) / (uPush * uPush));
  p.xy += normalize(d + vec2(0.0001)) * f * uPush * 0.36;

  gl_Position = vec4(p.xy / (uView * 0.5), 0.0, 1.0);
  gl_PointSize = uSize * uDpr * as.y * (0.7 + 0.6 * aRand.y) * (1.0 + f * 0.9);
  vCol = mix(mix(c0, c1, st), uCol1, f * 0.6);
  vA = as.x + f * 0.35;
}`;

const FRAG = /* glsl */ `
precision mediump float;
varying vec3 vCol;
varying float vA;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.1, d);
  gl_FragColor = vec4(vCol, vA * a);
  #include <colorspace_fragment>
}`;

const ARC_VERT = /* glsl */ `
uniform float uTime, uDpr, uSize, uArc;
uniform vec2 uView, uCg;
uniform float uSg;
uniform mat3 uRg;
uniform vec3 uCol1, uCol2;
attribute float aT, aSeed;
varying vec3 vCol;
varying float vA;
void main(){
  vec3 q = uRg * position;
  float k = ${PERSP.toFixed(1)} / (${PERSP.toFixed(1)} - q.z);
  vec2 xy = uCg + q.xy * uSg * k;
  float head = fract(uTime * 0.17 + aSeed);
  float d = fract(head - aT);
  float glow = exp(-d * 7.0);
  gl_Position = vec4(xy / (uView * 0.5), 0.0, 1.0);
  gl_PointSize = uSize * uDpr * (0.75 + 1.2 * exp(-d * 16.0));
  vCol = mix(uCol1, uCol2, aT);
  vA = (0.12 + 0.88 * glow) * smoothstep(-0.12, 0.22, q.z) * uArc;
}`;

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const sstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

export function createScene({ canvas, labelsEl, geo, anchors, small, reduced }) {
  const N = small ? 7000 : 16000;
  const rand = rng(20190401); // April 2019: the first cohort

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x071426, 1);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);

  const globe = buildGlobe(geo, N, rand);
  const plane = scramble(buildPlane(N, rand), rand);
  const map = scramble(buildMap(geo, N, rand), rand);
  const rings = buildRings(N, rand);
  const drift = buildDrift(N, rand);
  const arcs = buildArcs(small ? 80 : 130);

  const acc = new Float32Array(N * 4), rnd = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    acc[i * 4] = globe.acc[i]; acc[i * 4 + 1] = plane.acc[i]; acc[i * 4 + 2] = map.acc[i]; acc[i * 4 + 3] = rings.acc[i];
    rnd[i * 2] = rand(); rnd[i * 2 + 1] = rand();
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(globe.pos, 3));
  geom.setAttribute('aPlane', new THREE.BufferAttribute(plane.pos, 3));
  geom.setAttribute('aMap', new THREE.BufferAttribute(map.pos, 3));
  geom.setAttribute('aRing', new THREE.BufferAttribute(rings.pos, 3));
  geom.setAttribute('aDrift', new THREE.BufferAttribute(drift.pos, 3));
  geom.setAttribute('aAcc', new THREE.BufferAttribute(acc, 4));
  geom.setAttribute('aRand', new THREE.BufferAttribute(rnd, 2));

  const U = {
    uPhase: { value: 1 }, uTime: { value: 0 }, uScroll: { value: 0 }, uDpr: { value: dpr },
    uSize: { value: small ? 2.1 : 2.4 }, uPush: { value: 120 }, uArc: { value: 0 },
    uView: { value: new THREE.Vector2(1, 1) }, uMouse: { value: new THREE.Vector2(1e5, 1e5) },
    uCg: { value: new THREE.Vector2() }, uCp: { value: new THREE.Vector2() }, uCm: { value: new THREE.Vector2() }, uCr: { value: new THREE.Vector2() },
    uSg: { value: 300 }, uSp: { value: 300 }, uSm: { value: 300 }, uSr: { value: 300 },
    uRg: { value: new THREE.Matrix3() }, uRp: { value: new THREE.Matrix3() }, uRm: { value: new THREE.Matrix3() }, uRr: { value: new THREE.Matrix3() },
    uHub: { value: new THREE.Vector3(...HUB) },
    uCol0: { value: new THREE.Color('#b4c6e4') }, uCol1: { value: new THREE.Color('#ffc23d') }, uCol2: { value: new THREE.Color('#ff3140') },
  };
  const common = { uniforms: U, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending };
  const points = new THREE.Points(geom, new THREE.ShaderMaterial({ ...common, vertexShader: VERT, fragmentShader: FRAG }));
  points.frustumCulled = false;

  const arcGeom = new THREE.BufferGeometry();
  arcGeom.setAttribute('position', new THREE.BufferAttribute(arcs.pos, 3));
  arcGeom.setAttribute('aT', new THREE.BufferAttribute(arcs.t, 1));
  arcGeom.setAttribute('aSeed', new THREE.BufferAttribute(arcs.seed, 1));
  const arcPoints = new THREE.Points(arcGeom, new THREE.ShaderMaterial({ ...common, vertexShader: ARC_VERT, fragmentShader: FRAG }));
  arcPoints.frustumCulled = false;

  const scene = new THREE.Scene();
  scene.add(points, arcPoints);
  const camera = new THREE.Camera();

  /* labels: plain DOM, projected with the same maths as the shader */
  const mk = (o) => {
    const el = document.createElement('div');
    el.className = 'lb' + (o.red ? ' lb--red' : '') + (o.left ? ' lb--left' : '');
    const T = (t) => (window.__i18n && window.__i18n[t]) || t;
    el.innerHTML = `<i></i><span>${T(o.name)}</span>${o.sub ? `<em>${T(o.sub)}</em>` : ''}`;
    labelsEl.appendChild(el);
    return { el, o: 0 };
  };
  const placeLabels = PLACES.map((p) => ({ ...mk(p), v: new THREE.Vector3(...ll2v(p.lon, p.lat)) }));
  const pinLabels = PINS.map((p) => { const l = mk(p); l.el.classList.add('lb--pin'); return { ...l, v: new THREE.Vector3(...p.p) }; });

  const state = { phase: 1, planeProg: 0, mapProg: 1, scroll: 0, mouse: { x: 1e5, y: 1e5, nx: 0, ny: 0 } };
  let W = 1, H = 1, active = true;
  const e = new THREE.Euler(), m4 = new THREE.Matrix4(), tmp = new THREE.Vector3();
  const setRot = (m3, x, y, z) => { e.set(x, y, z, 'XYZ'); m4.makeRotationFromEuler(e); m3.setFromMatrix4(m4); };

  function resize() {
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    renderer.setSize(W, H, false);
    U.uView.value.set(W, H);
    U.uPush.value = Math.max(80, Math.min(150, W * 0.09));
  }
  resize();

  function anchor(el, c, fit) {
    const r = el.getBoundingClientRect();
    c.value.set(r.left + r.width / 2 - W / 2, H / 2 - (r.top + r.height / 2));
    return fit(r.width, r.height);
  }
  let avoid = null;
  function project(l, R, c, s, vis, av) {
    tmp.copy(l.v).applyMatrix3(R);
    const k = PERSP / (PERSP - tmp.z);
    const x = W / 2 + c.x + tmp.x * s * k, y = H / 2 - (c.y + tmp.y * s * k);
    let target = vis(tmp.z);
    if (av && x > av.left - 150 && x < av.right + 10 && y > av.top - 14 && y < av.bottom + 14) target = 0;
    l.o += (target - l.o) * 0.14;
    if (l.o < 0.01 && target === 0) { if (l.el.style.opacity !== '0') l.el.style.opacity = '0'; return; }
    l.el.style.opacity = l.o.toFixed(3);
    l.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translateY(-50%)`;
  }

  function update(time) {
    if (!active) return;
    const t = reduced ? 0 : time;
    const ph = state.phase, mx = state.mouse.nx, my = state.mouse.ny;
    U.uPhase.value = ph;
    U.uTime.value = t;
    U.uScroll.value = state.scroll;
    U.uMouse.value.set(state.mouse.x, state.mouse.y);

    // globe: Africa, Europe and the road to Ankara face the viewer
    U.uSg.value = anchor(anchors.globe, U.uCg, (w, h) => Math.min(w, h) * 0.5);
    setRot(U.uRg.value, 0.42 + my * 0.1, -0.36 + Math.sin(t * 0.13) * 0.2 + mx * 0.28 + clamp01(ph) * 0.9, 0);
    U.uArc.value = 1 - sstep(0.02, 0.4, ph);

    // aircraft: turns through three quarters of a circle while the section is pinned
    U.uSp.value = anchor(anchors.plane, U.uCp, (w, h) => Math.min(w * (w < 600 ? 0.43 : 0.52), h * 0.8));
    U.uCp.value.y += Math.sin(t * 0.8) * 7;
    const pp = state.planeProg;
    setRot(U.uRp.value, 0.24 + Math.sin(t * 0.6) * 0.03 - my * 0.12, -0.8 + pp * 3.5 + mx * 0.22, Math.sin(t * 0.45) * 0.05 + (pp - 0.5) * -0.22);

    // Türkiye: a map table, tipped back
    U.uSm.value = anchor(anchors.map, U.uCm, (w, h) => Math.min(w * 0.5, h * 1.05));
    setRot(U.uRm.value, -0.92 + my * 0.06, mx * 0.1, Math.sin(t * 0.2) * 0.04 + (state.mapProg - 0.5) * 0.16);

    // rings: a radar scope lying almost flat
    U.uSr.value = anchor(anchors.rings, U.uCr, (w, h) => Math.min(w, h) * 0.5);
    setRot(U.uRr.value, -1.12, 0, t * 0.05);

    const gVis = 1 - sstep(0.04, 0.3, ph);
    avoid = anchors.avoid && gVis > 0.01 ? anchors.avoid.getBoundingClientRect() : null;
    if (avoid && avoid.width === 0) avoid = null;
    for (const l of placeLabels) project(l, U.uRg.value, U.uCg.value, U.uSg.value, (z) => gVis * sstep(0.05, 0.3, z), avoid);
    const mVis = 1 - sstep(0.02, 0.3, Math.abs(ph - 4));
    pinLabels.forEach((l, i) => project(l, U.uRm.value, U.uCm.value, U.uSm.value, () => (state.mapProg >= i * 0.22 ? mVis : 0)));

    renderer.render(scene, camera);
  }

  return {
    state, update, resize, N,
    setActive(v) { active = v; },
    get active() { return active; },
  };
}
