// shapes.js - every form the particle field can take, as plain Float32Arrays.
// Nothing here touches WebGL. Each builder returns exactly N points so that
// particle i has a seat in every shape and can fly between them.
//
// Local conventions (all shapes fit roughly inside a unit sphere):
//   globe  : unit sphere, +y north, lon 0 / lat 0 faces +z
//   plane  : +x nose, +y up, +z right wing
//   map    : x east, y north, +z "up" out of the map (pins stand along +z)
//   rings  : flat disc in the x/y plane

const D2R = Math.PI / 180;

/** Small seeded PRNG so every load draws the same aircraft. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ll2v = (lon, lat) => {
  const a = lon * D2R, b = lat * D2R;
  return [Math.cos(b) * Math.sin(a), Math.sin(b), Math.cos(b) * Math.cos(a)];
};

function shuffle(a, rand) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0;
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

/* ───────────────────────────── GLOBE ───────────────────────────── */

// Places the live site itself names. Nothing else is labelled.
export const PLACES = [
  { name: 'ANKARA', sub: 'TÜRKİYE', lon: 32.86, lat: 39.93, red: true },
  { name: 'NIGERIA', lon: 7.49, lat: 9.06, left: true },
  { name: 'GHANA', lon: -0.19, lat: 5.6, left: true },
  { name: 'UGANDA', lon: 32.58, lat: 0.35 },
  { name: 'AZERBAIJAN', lon: 49.87, lat: 40.41 },
  { name: 'ITALY', lon: 12.5, lat: 41.9, left: true },
];

function fillRings(ctx, rings, W, H) {
  for (const r of rings) {
    // unwrap longitudes so a ring that crosses the antimeridian stays one shape
    const pts = [];
    let prev = r[0], off = 0;
    for (let i = 0; i < r.length; i += 2) {
      const lon = r[i], d = lon - prev;
      if (d > 180) off -= 360; else if (d < -180) off += 360;
      prev = lon;
      pts.push(lon + off, r[i + 1]);
    }
    for (const shift of [-360, 0, 360]) {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i += 2) {
        const x = ((pts[i] + shift + 180) / 360) * W;
        const y = ((90 - pts[i + 1]) / 180) * H;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
}

/** Land dots on a Fibonacci lattice. acc: 0 land, 1 partner country, 2 Türkiye. */
export function buildGlobe(geo, N, rand) {
  const W = 1024, H = 512;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#0000ff'; fillRings(ctx, geo.land, W, H);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = '#00ff00';
  for (const k of ['NG', 'GH', 'UG', 'AZ', 'IT']) fillRings(ctx, geo.named[k], W, H);
  ctx.fillStyle = '#ff0000'; fillRings(ctx, geo.named.TR, W, H);
  const px = ctx.getImageData(0, 0, W, H).data;

  const GA = Math.PI * (3 - Math.sqrt(5));
  const collect = (K) => {
    const out = [];
    for (let i = 0; i < K; i++) {
      const y = 1 - (2 * (i + 0.5)) / K;
      const r = Math.sqrt(1 - y * y);
      const th = i * GA;
      const x = Math.cos(th) * r, z = Math.sin(th) * r;
      const lat = Math.asin(y) / D2R;
      if (lat < -58) continue; // Antarctica is never in view; spend the dots elsewhere
      const lon = Math.atan2(x, z) / D2R;
      const u = Math.min(W - 1, Math.max(0, (((lon + 180) / 360) * W) | 0));
      const v = Math.min(H - 1, Math.max(0, (((90 - lat) / 180) * H) | 0));
      const o = (v * W + u) * 4;
      if (px[o + 2] > 100) out.push(x, y, z, px[o] > 100 ? 2 : px[o + 1] > 100 ? 1 : 0);
    }
    return out;
  };
  let K = Math.round(N / 0.26);
  let c = collect(K);
  K = Math.round((K * N) / Math.max(1, c.length / 4) * 1.003);
  c = collect(K);
  const n = c.length / 4;
  const order = shuffle(Array.from({ length: n }, (_, i) => i), rand);
  const pos = new Float32Array(N * 3), acc = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const s = order[i % n] * 4;
    pos[i * 3] = c[s]; pos[i * 3 + 1] = c[s + 1]; pos[i * 3 + 2] = c[s + 2];
    acc[i] = c[s + 3];
  }
  return { pos, acc };
}

/** Flight arcs from each named country to Ankara: points on a lifted great circle. */
export function buildArcs(per = 120) {
  const dest = PLACES[0];
  const B = ll2v(dest.lon, dest.lat);
  const from = PLACES.slice(1);
  const n = from.length * per;
  const pos = new Float32Array(n * 3), t = new Float32Array(n), seed = new Float32Array(n);
  from.forEach((p, k) => {
    const A = ll2v(p.lon, p.lat);
    const dot = Math.min(1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2]);
    const om = Math.acos(dot), so = Math.sin(om) || 1;
    for (let i = 0; i < per; i++) {
      const u = i / (per - 1);
      const a = Math.sin((1 - u) * om) / so, b = Math.sin(u * om) / so;
      const lift = 1.012 + Math.sin(u * Math.PI) * (0.06 + om * 0.16);
      const j = (k * per + i) * 3;
      pos[j] = (A[0] * a + B[0] * b) * lift;
      pos[j + 1] = (A[1] * a + B[1] * b) * lift;
      pos[j + 2] = (A[2] * a + B[2] * b) * lift;
      t[k * per + i] = u;
      seed[k * per + i] = k * 0.211;
    }
  });
  return { pos, t, seed, count: n };
}

/* ──────────────────────────── AIRCRAFT ───────────────────────────── */
// A high-wing, strut-braced, single-engine trainer, drawn in metres around the
// wing leading edge and then normalised. acc: 0 airframe, 1 amber light,
// 2 red light, 3 propeller (spun in the shader around HUB).

const PL = { ox: 1.52, oy: 0.2, s: 1 / 5.5 };
const nx = (x) => (x + PL.ox) * PL.s, ny = (y) => (y - PL.oy) * PL.s, nz = (z) => z * PL.s;
export const HUB = [nx(2.34), ny(-0.1), 0];

export function buildPlane(N, rand) {
  const pos = new Float32Array(N * 3), acc = new Float32Array(N);
  let w = 0;
  const put = (x, y, z, a = 0) => {
    if (w >= N) return;
    pos[w * 3] = nx(x); pos[w * 3 + 1] = ny(y); pos[w * 3 + 2] = nz(z);
    acc[w++] = a;
  };
  const jit = (s) => (rand() - 0.5) * s;
  const lerp = (a, b, t) => a + (b - a) * t;
  const count = (f) => Math.round(N * f);

  // fuselage stations: x, half-width, y bottom, y top, superellipse power
  const ST = [
    [2.34, 0.03, -0.15, -0.05, 2], [2.14, 0.2, -0.36, 0.12, 2], [1.96, 0.42, -0.58, 0.26, 2.6],
    [1.15, 0.54, -0.68, 0.36, 3], [0.8, 0.58, -0.72, 0.5, 3], [0.3, 0.6, -0.74, 0.8, 3.2],
    [-0.95, 0.56, -0.72, 0.76, 3.2], [-1.75, 0.44, -0.52, 0.54, 2.8], [-2.9, 0.26, -0.24, 0.4, 2.4],
    [-4.2, 0.13, -0.02, 0.33, 2.2], [-5.35, 0.04, 0.17, 0.3, 2],
  ];
  const segW = [];
  let segT = 0;
  for (let i = 0; i < ST.length - 1; i++) {
    const a = ST[i], b = ST[i + 1];
    const per = (a[1] + (a[3] - a[2]) / 2 + b[1] + (b[3] - b[2]) / 2);
    segT += Math.abs(a[0] - b[0]) * per + 0.04;
    segW.push(segT);
  }
  const fuselage = (n) => {
    for (let i = 0; i < n; i++) {
      const r = rand() * segT;
      let k = 0;
      while (segW[k] < r) k++;
      const a = ST[k], b = ST[k + 1], u = rand();
      const hw = lerp(a[1], b[1], u), yb = lerp(a[2], b[2], u), yt = lerp(a[3], b[3], u), p = 2 / lerp(a[4], b[4], u);
      const th = rand() * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th);
      put(lerp(a[0], b[0], u), (yb + yt) / 2 + ((yt - yb) / 2) * Math.sign(sn) * Math.abs(sn) ** p, hw * Math.sign(cs) * Math.abs(cs) ** p);
    }
  };

  // a tapered lifting surface in the x/z plane (wing, tailplane)
  const foil = (c) => 5 * (0.2969 * Math.sqrt(c) - 0.126 * c - 0.3516 * c * c + 0.2843 * c ** 3 - 0.1015 * c ** 4);
  const surface = (n, o) => {
    const edge = Math.round(n * 0.2);
    for (let i = 0; i < n; i++) {
      const sgn = rand() < 0.5 ? -1 : 1;
      let s = rand(), c = rand() ** 1.5;
      if (i < edge) { // outline: leading edge, trailing edge, tip
        const e = i % 5;
        if (e < 2) c = 0.002; else if (e < 4) c = 1; else s = 1;
      }
      const z = s * o.half;
      const tt = Math.max(0, (z - o.taperFrom) / (o.half - o.taperFrom));
      const chord = lerp(o.rootChord, o.tipChord, tt);
      const le = lerp(o.rootLE, o.tipLE, tt);
      const th = o.thick * chord * foil(c) * (rand() < 0.5 ? -1 : 1);
      put(le - c * chord + jit(0.01), o.y + z * o.dihedral + th, sgn * z);
    }
  };

  // vertical fin + rudder in the x/y plane
  const fin = (n) => {
    const edge = Math.round(n * 0.25);
    for (let i = 0; i < n; i++) {
      let s = rand(), c = rand();
      if (i < edge) { const e = i % 3; if (e === 0) c = 0; else if (e === 1) c = 1; else s = 1; }
      const le = lerp(-3.5, -4.78, s), te = lerp(-5.42, -5.5, s);
      put(lerp(le, te, c), lerp(0.32, 2.08, s), jit(0.09) * (1 - c * 0.6));
    }
  };
  const line = (n, a, b, j = 0.03, ac = 0) => {
    for (let i = 0; i < n; i++) { const u = rand(); put(lerp(a[0], b[0], u) + jit(j), lerp(a[1], b[1], u) + jit(j), lerp(a[2], b[2], u) + jit(j), ac); }
  };
  const wheel = (n, c, r) => {
    for (let i = 0; i < n; i++) { const th = rand() * Math.PI * 2, rr = r * (0.45 + 0.55 * Math.sqrt(rand())); put(c[0] + Math.cos(th) * rr, c[1] + Math.sin(th) * rr, c[2] + jit(0.12)); }
  };
  const blob = (n, c, r, ac) => { for (let i = 0; i < n; i++) put(c[0] + jit(r), c[1] + jit(r), c[2] + jit(r), ac); };

  const wingY = 0.82;
  surface(count(0.37), { half: 5.5, taperFrom: 2.3, rootChord: 1.63, tipChord: 1.12, rootLE: 0.62, tipLE: 0.48, y: wingY, dihedral: 0.03, thick: 0.12 });
  surface(count(0.085), { half: 1.78, taperFrom: 0, rootChord: 1.3, tipChord: 0.78, rootLE: -4.02, tipLE: -4.4, y: 0.3, dihedral: 0, thick: 0.07 });
  fin(count(0.07));
  // dorsal fillet
  line(count(0.008), [-2.5, 0.46, 0], [-3.6, 0.62, 0], 0.03);
  // wing struts
  line(count(0.013), [0.35, -0.62, 0.56], [0.28, wingY - 0.08, 2.35], 0.035);
  line(count(0.013), [0.35, -0.62, -0.56], [0.28, wingY - 0.08, -2.35], 0.035);
  // landing gear
  line(count(0.006), [1.5, -0.6, 0], [1.6, -1.3, 0], 0.03);
  wheel(count(0.012), [1.6, -1.42, 0], 0.2);
  for (const s of [-1, 1]) {
    line(count(0.009), [-0.25, -0.7, 0.5 * s], [-0.35, -1.36, 1.3 * s], 0.035);
    wheel(count(0.014), [-0.35, -1.44, 1.3 * s], 0.22);
  }
  // propeller: two blades and the tip circle, spun in the shader
  const pn = count(0.03);
  for (let i = 0; i < pn; i++) {
    if (i % 3 === 2) { const th = rand() * Math.PI * 2; put(2.34, -0.1 + Math.sin(th) * 0.96, Math.cos(th) * 0.96, 3); }
    else { const r = (0.1 + 0.86 * rand()) * (i % 2 ? 1 : -1); put(2.34 + jit(0.02), -0.1 + r, jit(0.16) * (1 - Math.abs(r) * 0.55), 3); }
  }
  // navigation lights (port red, starboard amber - brand palette, not ICAO green) and beacon
  blob(12, [-0.2, wingY + 0.17, -5.5], 0.07, 2);
  blob(12, [-0.2, wingY + 0.17, 5.5], 0.07, 1);
  blob(10, [-5.2, 2.12, 0], 0.07, 2);
  fuselage(N - w);
  return { pos, acc };
}

/* ──────────────────────────── TÜRKİYE ───────────────────────────── */

const TR = { lon0: 35.3, lat0: 39.0, k: Math.cos(39 * D2R), s: 1 / 7.5 };
export const projTR = (lon, lat) => [(lon - TR.lon0) * TR.k * TR.s, (lat - TR.lat0) * TR.s];

// Each pin is a place and a fact that the live site states.
export const PINS = [
  { name: 'ANKARA', sub: 'HEAD OFFICE', lon: 32.86, lat: 39.93, h: 0.3, acc: 2, red: true },
  { name: 'ISTANBUL', sub: 'GLC 2026', lon: 28.98, lat: 41.01, h: 0.2, acc: 1, left: true },
  { name: 'ADANA', sub: 'AQUACULTURE PROGRAMME', lon: 35.33, lat: 37.0, h: 0.2, acc: 1 },
].map((p) => { const [x, y] = projTR(p.lon, p.lat); return { ...p, p: [x, y, p.h] }; });

function inRing(r, x, y) {
  let c = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Dot-matrix map on a hex grid, a denser border, and three pins. acc: 0 land, 1/2 pins. */
export function buildMap(geo, N, rand) {
  const rings = geo.turkiye;
  const inside = (lon, lat) => rings.some((r) => inRing(r, lon, lat));
  const nPin = Math.round(N * 0.022);
  const nBorder = Math.round(N * 0.13);
  const target = N - nBorder - nPin * PINS.length;

  const grid = (d) => {
    const out = [];
    let row = 0;
    for (let lat = 35.7; lat <= 42.3; lat += d * 0.866, row++) {
      for (let lon = 25.4 + (row % 2 ? d / TR.k / 2 : 0); lon <= 45.1; lon += d / TR.k) {
        if (inside(lon, lat)) out.push(lon, lat);
      }
    }
    return out;
  };
  let d = 0.085, g = grid(d);
  for (let i = 0; i < 4; i++) { d *= Math.sqrt(g.length / 2 / target); g = grid(d); }

  const pos = new Float32Array(N * 3), acc = new Float32Array(N);
  let w = 0;
  const put = (x, y, z, a = 0) => { if (w < N) { pos[w * 3] = x; pos[w * 3 + 1] = y; pos[w * 3 + 2] = z; acc[w++] = a; } };

  // border, evenly spaced along the outline
  let total = 0;
  const segs = [];
  for (const r of rings) for (let i = 0; i < r.length - 2; i += 2) {
    const a = projTR(r[i], r[i + 1]), b = projTR(r[i + 2], r[i + 3]);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    segs.push([a, b, len]); total += len;
  }
  let carry = 0;
  const step = total / nBorder;
  for (const [a, b, len] of segs) {
    let s = carry;
    while (s < len) { const u = s / len; put(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, 0.004); s += step; }
    carry = s - len;
  }
  // pins: a stem, a head, and a ring on the ground
  for (const p of PINS) {
    const [x, y, h] = p.p;
    for (let i = 0; i < nPin; i++) {
      const k = i % 5;
      if (k < 2) put(x + (rand() - 0.5) * 0.006, y + (rand() - 0.5) * 0.006, rand() * h, p.acc);
      else if (k < 4) { const th = rand() * Math.PI * 2, r = 0.022 * Math.sqrt(rand()); put(x + Math.cos(th) * r, y + Math.sin(th) * r * 0.6, h + (rand() - 0.5) * 0.03, p.acc); }
      else { const th = rand() * Math.PI * 2; put(x + Math.cos(th) * 0.045, y + Math.sin(th) * 0.045, 0.002, p.acc); }
    }
  }
  // interior
  const n = g.length / 2;
  const order = shuffle(Array.from({ length: n }, (_, i) => i), rand);
  for (let i = 0; w < N; i++) {
    const s = order[i % n] * 2;
    const q = projTR(g[s], g[s + 1]);
    put(q[0], q[1], 0);
  }
  return { pos, acc };
}

/* ───────────────────────────── RINGS ───────────────────────────── */

/** Radar rings for the arrival. acc: 0 ring, 1 cross-hair, 2 centre. */
export function buildRings(N, rand) {
  const pos = new Float32Array(N * 3), acc = new Float32Array(N);
  const radii = [0.18, 0.32, 0.46, 0.6, 0.74, 0.88, 1.0];
  const sum = radii.reduce((a, b) => a + b, 0);
  const nCross = Math.round(N * 0.05), nCentre = Math.round(N * 0.012);
  const nRing = N - nCross - nCentre;
  let w = 0;
  const put = (x, y, a) => { if (w < N) { pos[w * 3] = x; pos[w * 3 + 1] = y; pos[w * 3 + 2] = 0; acc[w++] = a; } };
  radii.forEach((r, k) => {
    const n = k === radii.length - 1 ? nRing - w : Math.round((nRing * r) / sum);
    for (let i = 0; i < n; i++) { const th = (i / n) * Math.PI * 2; put(Math.cos(th) * r, Math.sin(th) * r, 0); }
  });
  for (let i = 0; i < nCross; i++) { const u = (rand() * 2 - 1) * 1.06; if (i % 2) put(u, 0, 1); else put(0, u, 1); }
  while (w < N) { const th = rand() * Math.PI * 2, r = 0.035 * Math.sqrt(rand()); put(Math.cos(th) * r, Math.sin(th) * r, 2); }
  // shuffle so that neighbours in one shape are strangers in the next
  const order = shuffle(Array.from({ length: N }, (_, i) => i), rand);
  const p2 = new Float32Array(N * 3), a2 = new Float32Array(N);
  order.forEach((s, i) => { p2[i * 3] = pos[s * 3]; p2[i * 3 + 1] = pos[s * 3 + 1]; p2[i * 3 + 2] = pos[s * 3 + 2]; a2[i] = acc[s]; });
  return { pos: p2, acc: a2 };
}

/* ───────────────────────────── DRIFT ───────────────────────────── */

export function buildDrift(N, rand) {
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N * 3; i++) pos[i] = rand() * 2 - 1;
  return { pos };
}

/** Shuffle a built shape in place so morphs cross the whole form, not one corner. */
export function scramble(shape, rand) {
  const N = shape.acc.length;
  const order = shuffle(Array.from({ length: N }, (_, i) => i), rand);
  const p = new Float32Array(N * 3), a = new Float32Array(N);
  order.forEach((s, i) => { p[i * 3] = shape.pos[s * 3]; p[i * 3 + 1] = shape.pos[s * 3 + 1]; p[i * 3 + 2] = shape.pos[s * 3 + 2]; a[i] = shape.acc[s]; });
  shape.pos = p; shape.acc = a;
  return shape;
}
