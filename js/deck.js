/* Flight deck: a clickable 3D emblem that changes the panel's course (colour,
   headline, link), and an endless list of every programme with a live preview.
   Markup is written by tools/build_deck.py. Works without WebGL (the SVG mark
   stays) and without motion (instant switches, a plain scrolling list). */
import * as THREE from 'three';

const { gsap } = window;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* reflections for the emblem, one set per theme: [vertical bands], highlight, triangle */
const METAL = {
  night: { bands: [[0, '#ffffff'], [0.34, '#9fb0c8'], [0.5, '#16233b'], [0.53, '#060b14'], [0.78, '#51627c'], [1, '#e3eaf4']], hi: 'rgba(255,255,255,.95)', tri: ['#ff6a5e', '#E01F2B', '#6d0910'] },
  paper: { bands: [[0, '#8c95a3'], [0.3, '#2a3444'], [0.5, '#05080e'], [0.55, '#000000'], [0.8, '#1c2533'], [1, '#77818f']], hi: 'rgba(255,255,255,.8)', tri: ['#ff6a5e', '#E01F2B', '#6d0910'] },
  sky: { bands: [[0, '#ffffff'], [0.36, '#bcd3f5'], [0.5, '#1c4a94'], [0.54, '#082352'], [0.8, '#6f97d6'], [1, '#f3f8ff']], hi: 'rgba(255,255,255,.95)', tri: ['#ffe39a', '#F6B62B', '#7a5406'] },
  mist: { bands: [[0, '#ffffff'], [0.4, '#d5dbe4'], [0.52, '#7f8a9a'], [0.56, '#4c5666'], [0.8, '#b6bfcc'], [1, '#ffffff']], hi: 'rgba(255,255,255,1)', tri: ['#5b78a8', '#0B1F3A', '#030912'] },
  red: { bands: [[0, '#ffffff'], [0.38, '#f3d9da'], [0.5, '#8d1118'], [0.54, '#4d060b'], [0.8, '#e9a9ac'], [1, '#ffffff']], hi: 'rgba(255,255,255,1)', tri: ['#ffe39a', '#F6B62B', '#7a5406'] },
  amber: { bands: [[0, '#6f7785'], [0.3, '#1f2836'], [0.5, '#04070c'], [0.55, '#000000'], [0.8, '#182130'], [1, '#5f6877']], hi: 'rgba(255,255,255,.75)', tri: ['#ff6a5e', '#E01F2B', '#6d0910'] },
};

function matcap(bands, hi) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const lg = g.createLinearGradient(0, 0, 0, 256);
  bands.forEach(([o, col]) => lg.addColorStop(o, col));
  g.fillStyle = lg; g.fillRect(0, 0, 256, 256);
  const rg = g.createRadialGradient(84, 64, 2, 84, 64, 118);
  rg.addColorStop(0, hi); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 256, 256);
  const rim = g.createRadialGradient(128, 128, 84, 128, 128, 130);
  rim.addColorStop(0, 'rgba(0,0,0,0)'); rim.addColorStop(1, 'rgba(0,0,0,.5)');
  g.fillStyle = rim; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const triCap = ([a, b, c]) => matcap([[0, a], [0.45, b], [1, c]], 'rgba(255,255,255,.7)');

/* the Turkey Trainings mark as two extruded solids (y is flipped from the SVG) */
function buildEmblem() {
  const t = new THREE.Shape();
  t.moveTo(12, -6); t.lineTo(42, -6);
  t.absarc(42, -22, 16, Math.PI / 2, 0, true);
  t.lineTo(58, -52);
  t.absarc(42, -52, 16, 0, -Math.PI / 2, true);
  t.lineTo(34, -68); t.lineTo(34, -28); t.lineTo(12, -28); t.closePath();
  const r = new THREE.Shape();
  r.moveTo(64, -6); r.lineTo(94, -6); r.lineTo(79, -34); r.closePath();
  const opt = { depth: 15, bevelEnabled: true, bevelThickness: 2.4, bevelSize: 1.9, bevelSegments: 5, curveSegments: 20 };
  const gt = new THREE.ExtrudeGeometry(t, opt), gr = new THREE.ExtrudeGeometry(r, opt);
  [gt, gr].forEach((g) => g.translate(-53, 37, -7.5));
  const mt = new THREE.MeshMatcapMaterial(), mr = new THREE.MeshMatcapMaterial();
  const group = new THREE.Group();
  group.add(new THREE.Mesh(gt, mt), new THREE.Mesh(gr, mr));
  return { group, mt, mr };
}

export function initDeck({ reduced = false, fine = true } = {}) {
  const deck = $('.deck');
  if (!deck) return;
  const courses = JSON.parse($('#deckData').textContent);
  const btn = $('.deck__emblem', deck), cv = $('canvas', btn), wipe = $('.deck__wipe', deck);
  const el = { no: $('#deckNo'), label: $('#deckLabel'), h: $('#deckH'), lede: $('#deckLede'), go: $('#deckGo') };
  const pv = { field: $('#pvField'), img: $('#pvImg'), title: $('#pvTitle'), facts: $('#pvFacts'), desc: $('#pvDesc'), go: $('#pvGo'), box: $('.deck__pv-in', deck), frame: $('.deck__pv-img', deck) };
  let idx = 0, busy = false, visible = false;

  /* ── emblem ── */
  const rot = { x: 0, y: 0, tx: 0, ty: 0, spin: 0, s: 1 };
  let three = null;
  try {
    const renderer = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(26, 1, 1, 1000);
    camera.position.set(0, 0, 265);
    const em = buildEmblem();
    scene.add(em.group);
    const caps = {};
    const setCap = (theme) => {
      caps[theme] = caps[theme] || { a: matcap(METAL[theme].bands, METAL[theme].hi), b: triCap(METAL[theme].tri) };
      em.mt.matcap = caps[theme].a; em.mr.matcap = caps[theme].b;
      em.mt.needsUpdate = em.mr.needsUpdate = true;
    };
    setCap(deck.dataset.theme);
    const size = () => {
      const w = btn.clientWidth, h = btn.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    size();
    new ResizeObserver(size).observe(btn);
    three = { renderer, scene, camera, em, setCap };
    btn.classList.add('is-3d');
  } catch (err) {
    console.warn('[deck] emblem falls back to the flat mark:', err);
  }

  if (fine && !reduced) {
    window.addEventListener('pointermove', (e) => {
      const r = btn.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / window.innerWidth, dy = (e.clientY - (r.top + r.height / 2)) / window.innerHeight;
      rot.ty = Math.max(-0.75, Math.min(0.75, dx * 2.1));
      rot.tx = Math.max(-0.5, Math.min(0.5, dy * 1.5));
    }, { passive: true });
  }

  /* ── change course ── */
  function setCourse(c) {
    el.no.textContent = String(idx + 1).padStart(2, '0');
    el.label.textContent = c.label;
    el.h.textContent = c.h;
    el.lede.textContent = c.lede;
    el.go.href = c.route;
    const l = $('.btn__l', el.go);
    const inner = l.querySelector('span');
    if (inner) { inner.textContent = c.btn; inner.dataset.t = c.btn; } else l.textContent = c.btn;
    highlight(c.field);
  }
  function go(n) {
    if (busy) return;
    idx = (n + courses.length) % courses.length;
    const c = courses[idx];
    if (reduced) { deck.dataset.theme = c.theme; three?.setCap(c.theme); setCourse(c); return; }
    busy = true;
    const b = btn.getBoundingClientRect(), d = deck.getBoundingClientRect();
    const x = b.left + b.width / 2 - d.left, y = b.top + b.height / 2 - d.top;
    const R = Math.hypot(Math.max(x, d.width - x), Math.max(y, d.height - y)) + 20;
    deck.style.backgroundColor = getComputedStyle(deck).backgroundColor;
    wipe.dataset.theme = c.theme;
    gsap.fromTo(wipe, { clipPath: `circle(0px at ${x}px ${y}px)`, autoAlpha: 1 }, {
      clipPath: `circle(${R}px at ${x}px ${y}px)`, duration: 1.05, ease: 'expo.inOut',
      onComplete() { deck.style.backgroundColor = ''; gsap.set(wipe, { autoAlpha: 0 }); busy = false; },
    });
    gsap.to(rot, { spin: rot.spin + Math.PI * 2, duration: 1.3, ease: 'expo.inOut' });
    gsap.timeline().to(rot, { s: 0.8, duration: 0.32, ease: 'power2.in' }).to(rot, { s: 1, duration: 0.9, ease: 'elastic.out(1,0.5)' });
    const parts = [$('.deck__count', deck), $('.deck__h', deck), el.lede, el.go];
    gsap.to(parts, {
      y: -16, autoAlpha: 0, duration: 0.28, stagger: 0.03, ease: 'power2.in',
      onComplete() {
        deck.dataset.theme = c.theme;
        three?.setCap(c.theme);
        setCourse(c);
        gsap.fromTo(parts, { y: 30, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.85, stagger: 0.07, ease: 'expo.out' });
      },
    });
  }
  btn.addEventListener('click', () => go(idx + 1));

  /* ── programme list ── */
  const scroll = $('.deck__scroll', deck), list = $('.deck__list', deck);
  const track = document.createElement('div');
  track.className = 'deck__track';
  scroll.append(track);
  track.append(list);
  let items = $$('.deck__it', list);
  if (!reduced) {
    const clone = list.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    $$('a', clone).forEach((a) => { a.tabIndex = -1; });
    track.append(clone);
    items = $$('.deck__it', track);
  } else scroll.classList.add('is-plain');
  let H = 1, tops = [], vh = 1, pos = 0, speed = 0, hover = false, my = 0, hold = 0, active = null, bulged = false, lastAuto = 0, jump = null;
  const measure = () => {
    H = list.offsetHeight || 1;
    vh = scroll.clientHeight || 1;
    tops = items.map((it) => it.offsetTop + it.offsetHeight / 2); // relative to the track
  };
  function highlight(field) {
    items.forEach((it) => it.classList.toggle('is-hl', !!field && field !== '*' && it.dataset.fid === field));
    if (field && field !== '*' && !reduced) {
      const first = items.find((it) => it.dataset.fid === field);
      if (first) { jump = { v: pos }; gsap.to(jump, { v: nearest(tops[items.indexOf(first)] - vh * 0.3), duration: 1.4, ease: 'expo.inOut', onUpdate() { pos = jump.v; }, onComplete() { jump = null; } }); }
    }
  }
  const nearest = (target) => { let t = target; while (t < pos - H / 2) t += H; while (t > pos + H / 2) t -= H; return t; };
  let token = 0;
  function show(it) {
    if (!it || it === active) return;
    active?.classList.remove('is-on');
    active = it; it.classList.add('is-on');
    const d = it.dataset, mine = ++token;
    const apply = () => {
      if (mine !== token) return;
      pv.field.textContent = d.field; pv.title.textContent = it.textContent.trim();
      pv.facts.textContent = d.facts; pv.desc.textContent = d.desc; pv.go.href = it.href;
      if (pv.img.getAttribute('src') !== d.img) pv.img.src = d.img;
      if (reduced) return;
      gsap.fromTo(pv.box.children, { y: 18, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.6, stagger: 0.05, ease: 'expo.out', overwrite: true });
      gsap.fromTo(pv.img, { scale: 1.14 }, { scale: 1, duration: 1.1, ease: 'expo.out', overwrite: true });
      gsap.fromTo(pv.frame, { clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)', duration: 0.7, ease: 'expo.out', overwrite: true });
    };
    if (pv.img.getAttribute('src') === d.img) apply();
    else { const im = new Image(); im.onload = im.onerror = apply; im.src = d.img; }
  }
  scroll.addEventListener('pointerenter', () => { hover = true; });
  scroll.addEventListener('pointerleave', () => { hover = false; });
  scroll.addEventListener('pointermove', (e) => { my = e.clientY - scroll.getBoundingClientRect().top; }, { passive: true });
  track.addEventListener('focusin', (e) => { const it = e.target.closest('.deck__it'); if (it) { show(it); hold = performance.now() + 6000; } });
  track.addEventListener('click', (e) => {
    const it = e.target.closest('.deck__it');
    if (!it || fine) return;
    if (it !== active) { e.preventDefault(); show(it); hold = performance.now() + 8000; }
  });
  measure();
  new ResizeObserver(measure).observe(scroll);
  if (document.fonts?.ready) document.fonts.ready.then(measure);

  new IntersectionObserver(([en]) => { visible = en.isIntersecting; }, { rootMargin: '120px' }).observe(deck);

  let last = performance.now();
  gsap.ticker.add(() => {
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!visible) return;
    if (three) {
      rot.x += (rot.tx - rot.x) * 0.07; rot.y += (rot.ty - rot.y) * 0.07;
      const t = now / 1000, g = three.em.group;
      g.rotation.x = rot.x + (reduced ? 0 : Math.sin(t * 0.9) * 0.05);
      g.rotation.y = rot.y + rot.spin + (reduced ? -0.3 : Math.sin(t * 0.6) * 0.12);
      g.position.y = reduced ? 0 : Math.sin(t * 1.1) * 2.2;
      g.scale.setScalar(rot.s);
      three.renderer.render(three.scene, three.camera);
    }
    if (reduced) return;
    const paused = hover || now < hold || jump;
    speed += ((paused ? 0 : 24) - speed) * 0.08;
    if (!jump) pos += speed * dt;
    const p = ((pos % H) + H) % H;
    track.style.transform = `translate3d(0,${(-p).toFixed(2)}px,0)`;
    if (hover && fine) {
      let best = null, bd = 1e9;
      for (let i = 0; i < items.length; i++) {
        const dy = tops[i] - p - my, g = Math.exp(-(dy * dy) / 5200);
        const st = items[i].style;
        st.transform = `translate3d(${(-g * 30).toFixed(1)}px,0,0)`;
        st.opacity = (0.36 + 0.64 * g).toFixed(3);
        if (Math.abs(dy) < bd) { bd = Math.abs(dy); best = items[i]; }
      }
      bulged = true;
      show(best);
    } else {
      if (bulged) { items.forEach((it) => { it.style.transform = ''; it.style.opacity = ''; }); bulged = false; }
      if (now - lastAuto > 3600 && now > hold && !jump) {
        lastAuto = now;
        let best = null, bd = 1e9;
        for (let i = 0; i < items.length; i++) { const dy = Math.abs(tops[i] - p - vh * 0.42); if (dy < bd) { bd = dy; best = items[i]; } }
        show(best);
      }
    }
  });
  show(items[0]);
}
