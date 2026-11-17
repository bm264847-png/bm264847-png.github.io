// main.js - everything that moves in the DOM, and the scroll script that
// tells the particle scene which form to take.
//
// Order of the file: helpers · loader · smooth scroll · cursor · header & menu ·
// text effects · generic reveals · the sections in page order · footer mark ·
// instruments · boot. See ../PLAN.md section 5 for the motion inventory.

// scene.js and deck.js (and with them three.js) are loaded on demand: inner pages never need them.

const { gsap, ScrollTrigger, Lenis } = window;
gsap.registerPlugin(ScrollTrigger);
window.__tt = true;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const root = document.documentElement;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches || /[?&]reduce(?:[=&]|$)/.test(location.search); // ?reduce = preview switch
if (REDUCED) document.documentElement.classList.add('rm');
const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
const DESK = '(min-width: 900px)';
const INNER = document.body.classList.contains('inner');
const SEEN = (() => { try { return sessionStorage.getItem('tt-seen') === '1'; } catch (err) { return false; } })();
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const T = (s) => (window.__i18n && window.__i18n[s]) || s; // translated wording for what the script prints
const RTL = root.dir === 'rtl';
const LOCALE = root.lang || 'en';

const S = { intro: REDUCED ? 0 : 1, parts: [0, 0, 0, 0, 0, 0], menu: false };
let lenis = null;
let scene = null;

/* ───────────────────────────── loader ───────────────────────────── */

const load = { fonts: 0, data: 0, images: 0, scene: 0, shown: 0, done: null };
const LOAD_W = { fonts: 0.2, data: 0.25, images: 0.2, scene: 0.35 };
const LOAD_LABELS = ['Filing flight plan', 'Checking weather', 'Awaiting clearance', 'Cleared for departure'].map(T);

function initLoader() {
  const ticks = $('.loader__ticks');
  if (ticks) {
    let h = '';
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2, maj = i % 6 === 0;
      const r1 = maj ? 168 : 176, r2 = 188;
      h += `<line${maj ? ' class="maj"' : ''} x1="${(200 + Math.sin(a) * r1).toFixed(1)}" y1="${(200 - Math.cos(a) * r1).toFixed(1)}" x2="${(200 + Math.sin(a) * r2).toFixed(1)}" y2="${(200 - Math.cos(a) * r2).toFixed(1)}"/>`;
    }
    ticks.innerHTML = h;
  }
  if (REDUCED) return Promise.resolve();
  gsap.to('.loader__ticks', { rotation: -360, svgOrigin: '200 200', duration: 50, ease: 'none', repeat: -1 });
  const num = $('#loaderNum'), lab = $('#loaderLab'), prog = $('.loader__prog'), needle = $('.loader__needle'), items = $$('.loader__list li');
  let lastN = -1, lastL = -1;
  return new Promise((res) => {
    const tick = () => {
      const tgt = (load.fonts * LOAD_W.fonts + load.data * LOAD_W.data + load.images * LOAD_W.images + load.scene * LOAD_W.scene) * 100;
      load.shown += SEEN ? clamp((tgt - load.shown) * 0.2, 0, 6) : clamp((tgt - load.shown) * 0.075, 0, 1.5); // quicker when coming back from an inner page
      if (tgt >= 100 && load.shown > 99.4) load.shown = 100;
      const n = Math.round(load.shown);
      if (n !== lastN) {
        lastN = n;
        num.textContent = String(n).padStart(3, '0');
        prog.style.strokeDashoffset = String(100 - load.shown);
        needle.style.transform = `rotate(${(load.shown * 3.6).toFixed(1)}deg)`;
        const l = n >= 100 ? 3 : n >= 67 ? 2 : n >= 34 ? 1 : 0;
        if (l !== lastL) { lastL = l; lab.textContent = LOAD_LABELS[l]; items.forEach((it, i) => it.classList.toggle('is-done', i < l)); }
      }
      if (load.shown >= 100) { gsap.ticker.remove(tick); gsap.delayedCall(0.35, res); }
    };
    gsap.ticker.add(tick);
  });
}

function exitLoader() {
  const el = $('#loader');
  return new Promise((res) => {
    if (!el || REDUCED) { root.classList.add('loader-gone'); res(); return; }
    gsap.timeline({ onComplete() { root.classList.add('loader-gone'); gsap.killTweensOf('.loader__ticks'); } })
      .to('.loader__read, .loader__list', { autoAlpha: 0, y: -14, duration: 0.45, ease: 'power2.in' })
      .to('.loader__ring', { scale: 7, duration: 1.5, ease: 'power3.inOut', transformOrigin: '50% 50%' }, '<0.1')
      .to(el, { backgroundColor: 'rgba(7,20,38,0)', duration: 0.9, ease: 'power2.inOut' }, '<0.35')
      .add(res, '<')
      .to('.loader__ring', { autoAlpha: 0, duration: 0.6, ease: 'power2.in' }, '<0.25');
  });
}

/* ───────────────────────── smooth scroll ───────────────────────── */

function initLenis() {
  if (REDUCED || !Lenis) return;
  lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.stop();
}

function scrollToEl(el) {
  if (lenis) lenis.scrollTo(el, { duration: 1.9, easing: (t) => 1 - Math.pow(1 - t, 4), force: true, lock: false });
  else el.scrollIntoView({ behavior: 'auto', block: 'start' });
}

function initAnchors() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href');
    const el = id.length > 1 && document.querySelector(id);
    if (!el) return;
    e.preventDefault();
    const go = () => {
      scrollToEl(el);
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
      el.focus({ preventScroll: true });
    };
    if (S.menu) closeMenu(go); else go();
  });
}

/* ───────────────────────────── cursor ───────────────────────────── */

function initCursor() {
  if (!FINE || REDUCED) return;
  const c = $('.cursor'), ring = $('.cursor__ring'), dot = $('.cursor__dot'), text = $('.cursor__text');
  root.classList.add('has-cursor');
  const q = (el, d) => [gsap.quickTo(el, 'x', { duration: d, ease: 'power3' }), gsap.quickTo(el, 'y', { duration: d, ease: 'power3' })];
  const [rx, ry] = q(ring, 0.45), [dx, dy] = q(dot, 0.08), [tx, ty] = q(text, 0.45);
  c.classList.add('is-out');
  window.addEventListener('mousemove', (e) => {
    c.classList.remove('is-out');
    rx(e.clientX); ry(e.clientY); dx(e.clientX); dy(e.clientY); tx(e.clientX); ty(e.clientY);
  }, { passive: true });
  document.addEventListener('mouseover', (e) => {
    const lab = e.target.closest('[data-cursor]');
    const link = e.target.closest('a, button');
    c.classList.toggle('is-label', !!lab);
    c.classList.toggle('is-link', !lab && !!link);
    if (lab) text.textContent = lab.dataset.cursor;
  });
  window.addEventListener('mousedown', () => c.classList.add('is-down'));
  window.addEventListener('mouseup', () => c.classList.remove('is-down'));
  document.addEventListener('mouseleave', () => c.classList.add('is-out'));
}

function initMagnetic() {
  if (!FINE || REDUCED) return;
  $$('[data-magnetic]').forEach((el) => {
    const x = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3' }), y = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3' });
    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect();
      x((e.clientX - r.left - r.width / 2) * 0.28); y((e.clientY - r.top - r.height / 2) * 0.36);
    });
    el.addEventListener('mouseleave', () => gsap.to(el, { x: 0, y: 0, duration: 1, ease: 'elastic.out(1, 0.4)', overwrite: true }));
  });
}

/* ───────────────────── header, ticker and menu ───────────────────── */

function initHeader() {
  const top = $('.top');
  const setMin = () => top.classList.toggle('is-min', window.scrollY > 90);
  window.addEventListener('scroll', setMin, { passive: true });
  setMin();

  const tick = $('.ticker'), track = $('.ticker__track');
  track.innerHTML += track.innerHTML;
  $$(':scope > *', track).slice(track.children.length / 2).forEach((n) => n.setAttribute('aria-hidden', 'true'));
  const setDur = () => tick.style.setProperty('--dur', `${Math.max(20, track.scrollWidth / 2 / 70)}s`);
  setDur();
  window.addEventListener('resize', setDur);
  if (!REDUCED) tick.classList.add('is-run');
}

const menu = $('#menu'), menuBtn = $('.menu-btn'), menuBtnT = $('.menu-btn__t');
const circle = (r) => {
  const b = menuBtn.getBoundingClientRect();
  return `circle(${r}px at ${(b.left + b.width / 2).toFixed(0)}px ${(b.top + b.height / 2).toFixed(0)}px)`;
};

function openMenu() {
  if (S.menu) return;
  S.menu = true;
  menu.hidden = false;
  root.classList.add('menu-open');
  menuBtn.setAttribute('aria-expanded', 'true');
  menuBtnT.textContent = T('Close');
  lenis?.stop();
  if (!REDUCED) {
    gsap.killTweensOf(menu);
    gsap.fromTo(menu, { clipPath: circle(0) }, { clipPath: circle(Math.hypot(innerWidth, innerHeight)), duration: 1.1, ease: 'power3.inOut' });
    gsap.fromTo('.menu__nav a > *', { yPercent: 125 }, { yPercent: 0, duration: 1.1, ease: 'expo.out', stagger: 0.035, delay: 0.3, overwrite: true });
    gsap.fromTo('.menu__side > *', { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.9, ease: 'expo.out', stagger: 0.07, delay: 0.55, overwrite: true });
  }
  $('.menu__nav a').focus({ preventScroll: true });
}

function closeMenu(then) {
  if (!S.menu) { then?.(); return; }
  S.menu = false;
  root.classList.remove('menu-open');
  menuBtn.setAttribute('aria-expanded', 'false');
  menuBtnT.textContent = T('Menu');
  const done = () => { menu.hidden = true; lenis?.start(); then?.(); };
  if (REDUCED) done();
  else { gsap.killTweensOf(menu); gsap.to(menu, { clipPath: circle(0), duration: 0.75, ease: 'power3.inOut', onComplete: done }); }
  if (!then) menuBtn.focus({ preventScroll: true });
}

function initMenu() {
  menuBtn.addEventListener('click', () => (S.menu ? closeMenu() : openMenu()));
  window.addEventListener('keydown', (e) => {
    if (!S.menu) return;
    if (e.key === 'Escape') closeMenu();
    if (e.key === 'Tab') { // keep focus inside the overlay and the header controls
      const f = [...$$('.bar a, .bar button').filter((n) => n.offsetParent), ...$$('a', menu)];
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  });
}

/* ─────────────────────────── text effects ─────────────────────────── */

/** Wrap every character of every .ln in a span. Headings keep their name for assistive tech. */
function splitChars(el) {
  el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
  const walk = (node) => {
    [...node.childNodes].forEach((n) => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach((w) => {
          if (!w) return;
          if (/^\s+$/.test(w)) { frag.append(' '); return; }
          const wd = document.createElement('span');
          wd.className = 'wd';
          if (RTL) { wd.className = 'wd ch'; wd.textContent = w; frag.append(wd); return; }
          for (const c of w) { const ch = document.createElement('span'); ch.className = 'ch'; ch.textContent = c; wd.append(ch); }
          frag.append(wd);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1) walk(n);
    });
  };
  $$('.ln', el).forEach((ln) => { ln.setAttribute('aria-hidden', 'true'); walk(ln); });
  return $$('.ch', el);
}

/** Split a paragraph into its rendered lines, slide them up, then put the plain text back. */
function revealLines(el, delay = 0) {
  const html = el.innerHTML;
  const words = el.textContent.trim().split(/\s+/);
  el.innerHTML = words.map((w) => `<span class="wd">${w}</span>`).join(' ');
  const rows = [];
  let top = null;
  $$('.wd', el).forEach((w) => {
    if (top === null || Math.abs(w.offsetTop - top) > 4) { rows.push([]); top = w.offsetTop; }
    rows[rows.length - 1].push(w.textContent);
  });
  el.innerHTML = rows.map((r) => `<span class="l"><span class="li">${r.join(' ')}</span></span>`).join(' ');
  gsap.set(el, { autoAlpha: 1 });
  gsap.fromTo($$('.li', el), { yPercent: 105 }, { yPercent: 0, duration: 1.15, ease: 'expo.out', stagger: 0.08, delay, onComplete() { el.innerHTML = html; } });
}

const SCR = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/#';
function decode(el, delay = 0) {
  if (RTL) { gsap.fromTo(el, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.8, delay, ease: 'expo.out' }); return; }
  const text = el.dataset.text || (el.dataset.text = el.textContent);
  const o = { p: 0 };
  gsap.set(el, { autoAlpha: 1 });
  gsap.to(o, {
    p: 1, duration: 0.5 + text.length * 0.022, delay, ease: 'none',
    onUpdate() {
      const k = Math.floor(o.p * text.length);
      let s = text.slice(0, k);
      for (let i = k; i < text.length; i++) s += text[i] === ' ' ? ' ' : SCR[(Math.random() * SCR.length) | 0];
      el.textContent = s;
    },
    onComplete() { el.textContent = text; },
  });
}

/* ─────────────────────────── generic reveals ─────────────────────────── */

const once = (trigger, fn, start = 'top 86%') => ScrollTrigger.create({ trigger, start, once: true, onEnter: fn });
const inHero = (el) => !!el.closest('.hero');

function initReveals() {
  // buttons: wrap the label so it can roll
  $$('.btn__l').forEach((l) => { const t = l.textContent; l.innerHTML = `<span data-t="${t.replace(/"/g, '&quot;')}">${t}</span>`; });
  if (REDUCED) return;

  $$('[data-chars]').forEach((el) => {
    const chars = splitChars(el);
    if (inHero(el)) return;
    if (el.hasAttribute('data-fill')) {
      gsap.fromTo(chars, { opacity: 0.12 }, { opacity: 1, ease: 'none', stagger: 0.06, scrollTrigger: { trigger: el, start: 'top 84%', end: 'top 36%', scrub: 0.5 } });
    } else {
      gsap.set(chars, { yPercent: 118 });
      once(el, () => gsap.to(chars, { yPercent: 0, duration: 1.15, ease: 'expo.out', stagger: 0.018 }));
    }
  });
  $$('[data-lines]').forEach((el) => { gsap.set(el, { autoAlpha: 0 }); once(el, () => revealLines(el, 0.1), 'top 88%'); });
  $$('[data-decode]').forEach((el) => { if (inHero(el)) return; gsap.set(el, { autoAlpha: 0 }); once(el, () => decode(el), 'top 90%'); });
  $$('[data-rise]').forEach((el) => { if (inHero(el)) return; gsap.set(el, { autoAlpha: 0, y: 40 }); once(el, () => gsap.to(el, { autoAlpha: 1, y: 0, duration: 1.1, ease: 'expo.out' })); });
  $$('[data-draw]').forEach((el) => { gsap.set(el, { scaleX: 0 }); once(el, () => gsap.to(el, { scaleX: 1, duration: 1.4, ease: 'expo.out' }), 'top 92%'); });
  $$('[data-unmask]').forEach((el) => {
    const img = $('img', el);
    gsap.set(el, { clipPath: 'inset(100% 0% 0% 0%)' });
    gsap.set(img, { scale: 1.5 });
    once(el, () => {
      gsap.to(el, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.4, ease: 'expo.out' });
      gsap.to(img, { scale: 1.14, duration: 1.8, ease: 'expo.out' });
    }, 'top 90%');
    gsap.fromTo(img, { yPercent: -5 }, { yPercent: 5, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } });
  });
  $$('[data-count]').forEach((el) => {
    const n = +el.dataset.count, suf = el.dataset.suffix || '', o = { v: 0 };
    el.textContent = '0' + suf;
    once(el, () => gsap.to(o, { v: n, duration: 2, ease: 'expo.out', onUpdate() { el.textContent = Math.round(o.v) + suf; } }), 'top 92%');
  });
  // groups that arrive one after another
  [['.stats li', '.stats'], ['.ways__grid > li', '.ways__grid'], ['.person', null], ['.films__grid > li', null], ['.foot__cols > div', '.foot__cols'], ['.facts > div', '.facts'], ['.arr__cta > *', '.arr__cta'], ['.avi2__row > *', '.avi2__row'], ['.wp__cta > *', null], ['.foot__off > *', '.foot__off'], ['.crew__foot > *', '.crew__foot'], ['.foot__top > *', '.foot__top']].forEach(([sel, group]) => {
    const items = $$(sel);
    if (!items.length) return;
    gsap.set(items, { autoAlpha: 0, y: 46 });
    if (group) once(group, () => gsap.to(items, { autoAlpha: 1, y: 0, duration: 1.1, ease: 'expo.out', stagger: 0.09 }), 'top 90%');
    else items.forEach((it) => once(it, () => gsap.to(it, { autoAlpha: 1, y: 0, duration: 1.1, ease: 'expo.out' }), 'top 92%'));
  });
  // photographs that drift at different speeds
  $$('[data-strip] > *').forEach((f, i) => gsap.fromTo(f, { y: 40 + i * 50 }, { y: -40 - i * 50, ease: 'none', scrollTrigger: { trigger: f.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } }));
}

/* ───────────────────────────── 01 hero ───────────────────────────── */

function prepHero() {
  if (REDUCED) return;
  gsap.set('.hero__title .ch', { yPercent: 118 });
  gsap.set('.hero [data-decode], .hero [data-rise]', { autoAlpha: 0 });
  gsap.set('.door', { autoAlpha: 0, y: 70 });
  gsap.set('.top', { yPercent: -110 });
  gsap.set('.hud, .rail, .wa', { autoAlpha: 0 });
}

function intro() {
  root.classList.remove('is-loading');
  lenis?.start();
  if (REDUCED) return;
  gsap.timeline({ defaults: { ease: 'expo.out' } })
    .to(S, { intro: 0, duration: 2.8, ease: 'power2.inOut' }, 0)
    .to('.top', { yPercent: 0, duration: 1.3 }, 0.7)
    .add(() => decode($('.hero [data-decode]')), 0.8)
    .to('.hero__title .ch', { yPercent: 0, duration: 1.3, stagger: 0.022 }, 0.8)
    .fromTo('.hero [data-rise]', { autoAlpha: 0, y: 34 }, { autoAlpha: 1, y: 0, duration: 1.2, stagger: 0.12 }, 1.45)
    .to('.door', { autoAlpha: 1, y: 0, duration: 1.3, stagger: 0.13 }, 1.6)
    .to('.hud, .rail, .wa', { autoAlpha: 1, duration: 1, stagger: 0.1 }, 2.1);
}

function initHero(mm) {
  if (REDUCED) return;
  gsap.to('.hero__globe', { autoAlpha: 0, scale: 1.25, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom 35%', scrub: true } });
  mm.add(DESK, () => {
    gsap.timeline({ scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom 35%', scrub: true } })
      .to('.hero__copy', { y: -140, autoAlpha: 0, ease: 'none' }, 0)
      .to('.doors, .hero__meta', { y: -60, autoAlpha: 0, ease: 'none' }, 0.15);
  });
}

/* ───────────────────── particle phases (scroll script) ───────────────────── */

function initPhases(mm) {
  const part = (i, trigger, start, end) => ScrollTrigger.create({ trigger, start, end, onUpdate: (s) => { S.parts[i] = s.progress; }, onRefresh: (s) => { S.parts[i] = s.progress; } });
  part(0, '#departure', 'top top', 'bottom 25%');   // globe  → drift
  part(5, '#arrival', 'top 130%', 'top 35%');       // drift  → radar rings
  mm.add(DESK, () => {
    part(1, '#aviation', 'top 150%', 'top 12%');    // drift  → aircraft
    part(2, '.avi2', 'top 88%', 'top 18%');         // aircraft → drift
    part(3, '#ground', 'top 150%', 'top 12%');      // drift  → Türkiye
    part(4, '.reel', 'top 78%', 'top 8%');          // Türkiye → drift
  });
  mm.add('(max-width: 899px)', () => {
    part(1, '.avi__stage', 'top 125%', 'top 48%');
    part(2, '.avi__stage', 'bottom 42%', 'bottom -8%');
    part(3, '.ground__map', 'top 125%', 'top 45%');
    part(4, '.ground__map', 'bottom 40%', 'bottom -8%');
  });
}

function initSceneLoop() {
  if (!scene) return;
  const st = scene.state;
  // only draw while a night section is on screen
  const seen = new Set();
  const io = new IntersectionObserver((es) => {
    es.forEach((e) => (e.isIntersecting ? seen.add(e.target) : seen.delete(e.target)));
    scene.setActive(seen.size > 0);
  });
  $$('.hero, .band, .avi, .avi2, .ground, .reel, .arr').forEach((n) => io.observe(n));

  let tx = 0, ty = 0;
  if (FINE) window.addEventListener('mousemove', (e) => {
    st.mouse.x = e.clientX - innerWidth / 2; st.mouse.y = innerHeight / 2 - e.clientY;
    tx = (e.clientX / innerWidth) * 2 - 1; ty = (e.clientY / innerHeight) * 2 - 1;
  }, { passive: true });
  window.addEventListener('resize', () => scene.resize());
  gsap.ticker.add((time) => {
    const p = S.parts;
    st.phase = Math.max(S.intro, p[0]) + p[1] + p[2] + p[3] + p[4] + p[5];
    st.scroll = (window.scrollY / innerHeight) * 0.6;
    st.mouse.nx += (tx - st.mouse.nx) * 0.05; st.mouse.ny += (ty - st.mouse.ny) * 0.05;
    scene.update(time);
  });
}

/* ───────────────────────────── 03 route ───────────────────────────── */

function initRoute(mm) {
  const route = $('.route'), pin = $('.route__pin'), view = $('.route__view'), track = $('.route__track');
  const wps = $$('.wp:not(.wp--intro)', track), craft = $('.route__craft'), done = $('.route__done'), ghost = $('.route__ghost'), line = $('.route__line');
  if (REDUCED) { wps.forEach((w) => w.classList.add('is-on')); return; }

  mm.add(DESK, () => {
    route.classList.add('is-pin');
    const dist = () => Math.max(0, track.scrollWidth - innerWidth);
    const placeLine = () => { // the route line runs through the waypoint dots
      const y = track.getBoundingClientRect().top - view.getBoundingClientRect().top;
      line.style.top = `${y}px`; craft.style.top = `${y}px`;
    };
    placeLine();
    const mark = () => {
      const x = craft.getBoundingClientRect().left + 17;
      wps.forEach((w) => w.classList.toggle('is-on', w.getBoundingClientRect().left <= x));
    };
    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: { trigger: pin, pin: true, refreshPriority: 3, start: 'top top', end: () => `+=${dist() + innerHeight * 0.25}`, scrub: 0.7, invalidateOnRefresh: true, anticipatePin: 1, onRefresh: placeLine },
      onUpdate: mark,
    });
    tl.to(track, { x: () => -dist(), duration: 1 }, 0)
      .to(done, { scaleX: 1, duration: 1 }, 0)
      .to(craft, { x: () => innerWidth - 60, duration: 1 }, 0)
      .to(ghost, { x: () => -innerWidth * 0.55, duration: 1 }, 0);
    gsap.to(craft, { y: -5, rotation: -3, duration: 1.6, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    return () => { route.classList.remove('is-pin'); gsap.set([track, done, craft, ghost], { clearProps: 'all' }); gsap.killTweensOf(craft); };
  });
  mm.add('(max-width: 899px)', () => {
    const sts = wps.map((w) => ScrollTrigger.create({ trigger: w, start: 'top 72%', onEnter: () => w.classList.add('is-on'), onLeaveBack: () => w.classList.remove('is-on') }));
    gsap.set(wps, { autoAlpha: 0, x: -24 });
    wps.forEach((w) => once(w, () => gsap.to(w, { autoAlpha: 1, x: 0, duration: 1, ease: 'expo.out' }), 'top 88%'));
    return () => sts.forEach((s) => s.kill());
  });
}

/* ───────────────────────────── 04 aviation ───────────────────────────── */

function initAviation(mm) {
  const cards = $$('.avc'), tags = $$('.avi__tag');
  const setCards = (p) => cards.forEach((c, i) => {
    const q = clamp(p * cards.length - i);
    c.style.setProperty('--p', q.toFixed(3));
    c.classList.toggle('is-on', q > 0 && (q < 1 || i === cards.length - 1));
  });
  if (REDUCED) { cards.forEach((c) => c.classList.add('is-on')); return; }
  gsap.set(cards, { y: 50, autoAlpha: 0 });
  once('.avi__list', () => gsap.to(cards, { y: 0, autoAlpha: 1, duration: 1.1, ease: 'expo.out', stagger: 0.09, clearProps: 'opacity,visibility' }), 'top 96%');

  mm.add(DESK, () => {
    gsap.set(tags, { autoAlpha: 0, x: 24 });
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: '.avi__pin', pin: true, refreshPriority: 2, start: 'top top', end: '+=260%', scrub: 0.6, anticipatePin: 1,
        onUpdate: (s) => { if (scene) scene.state.planeProg = s.progress; setCards(clamp((s.progress - 0.06) / 0.86)); },
      },
    });
    tl.to({}, { duration: 1 }, 0);
    tags.forEach((t, i) => tl.to(t, { autoAlpha: 1, x: 0, duration: 0.08, ease: 'power2.out' }, 0.12 + i * 0.24));
    return () => { gsap.set(tags, { clearProps: 'all' }); };
  });
  mm.add('(max-width: 899px)', () => {
    cards.forEach((c) => { c.classList.add('is-on'); c.style.setProperty('--p', '1'); });
    const st = ScrollTrigger.create({ trigger: '.avi__stage', start: 'top bottom', end: 'bottom top', onUpdate: (s) => { if (scene) scene.state.planeProg = 0.1 + s.progress * 0.55; } });
    return () => st.kill();
  });
}

/* ───────────────────────────── 05 programmes ───────────────────────────── */

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789&';
function buildFlap(el) {
  const text = el.textContent.trim().toLocaleUpperCase(LOCALE);
  el.textContent = '';
  const sr = document.createElement('span');
  sr.className = 'sr'; sr.textContent = text + ' ';
  el.append(sr);
  // words stay whole so a long field name can wrap on a phone
  const cells = [];
  const cell = (c, host) => {
    const s = document.createElement('span');
    s.className = 'fc' + (c === ' ' ? ' fc--sp' : '');
    s.setAttribute('aria-hidden', 'true');
    s.textContent = REDUCED && c !== ' ' ? c : ' ';
    host.append(s);
    cells.push({ s, c, k: -1, n: 0 });
  };
  text.split(' ').forEach((word, i, all) => {
    const fw = document.createElement('span');
    fw.className = 'fw';
    if (RTL) { cell(word, fw); fw.lastChild.classList.add('fc--word'); } else for (const c of word) cell(c, fw);
    el.append(fw);
    if (i < all.length - 1) cell(' ', el);
  });
  el._cells = cells;
}
function flap(el, delay = 0) {
  const cells = el._cells;
  if (!cells || REDUCED) return;
  const t0 = performance.now() + delay;
  cells.forEach((cell, i) => { cell.k = -1; cell.n = 4 + ((i * 7) % 6); });
  const flip = (s) => s.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(.12)' }, { transform: 'scaleY(1)' }], { duration: 90 });
  const tick = (now) => {
    let busy = false;
    cells.forEach((cell, i) => {
      if (cell.c === ' ') return;
      const k = Math.floor((now - t0 - i * 24) / 46);
      if (k < 0) { busy = true; return; }
      if (k >= cell.n) { if (cell.k !== cell.n) { cell.k = cell.n; cell.s.textContent = cell.c; flip(cell.s); } return; }
      busy = true;
      if (k !== cell.k) { cell.k = k; cell.s.textContent = GLYPHS[(Math.random() * GLYPHS.length) | 0]; flip(cell.s); }
    });
    if (busy) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function initBoard() {
  const rows = $$('.row');
  $$('[data-flap]').forEach(buildFlap);
  if (REDUCED) return;
  rows.forEach((row, i) => {
    const cells = $$('[data-flap]', row);
    once(row, () => cells.forEach((c, j) => flap(c, (i % 4) * 70 + j * 90)), 'top 94%');
    if (FINE) row.addEventListener('mouseenter', () => { flap($('.row__f', row)); flap($('.row__s', row), 120); });
    row.addEventListener('focus', () => flap($('.row__f', row)));
  });
  gsap.fromTo('.board', { y: 80, rotateX: 8, transformPerspective: 1400, transformOrigin: '50% 0%' }, { y: 0, rotateX: 0, ease: 'none', scrollTrigger: { trigger: '.board', start: 'top 100%', end: 'top 55%', scrub: 0.6 } });

  if (FINE) $$('[data-tilt]').forEach((el) => {
    const rx = gsap.quickTo(el, 'rotationX', { duration: 0.6, ease: 'power3' }), ry = gsap.quickTo(el, 'rotationY', { duration: 0.6, ease: 'power3' });
    gsap.set(el, { transformPerspective: 900 });
    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect();
      ry(((e.clientX - r.left) / r.width - 0.5) * 9); rx(((e.clientY - r.top) / r.height - 0.5) * -9);
    });
    el.addEventListener('mouseleave', () => { rx(0); ry(0); });
  });
}

/* ───────────────────────────── 06 ground ───────────────────────────── */

function initGround(mm) {
  if (REDUCED) return;
  mm.add(DESK, () => {
    if (scene) scene.state.mapProg = 0;
    const st = ScrollTrigger.create({ trigger: '.ground__pin', pin: true, refreshPriority: 1, start: 'top top', end: '+=110%', anticipatePin: 1, onUpdate: (s) => { if (scene) scene.state.mapProg = s.progress; } });
    return () => { st.kill(); if (scene) scene.state.mapProg = 1; };
  });
}

/** Draggable, self-drifting photo reel that speeds up with the scroll. */
function initReel() {
  const track = $('[data-marquee]');
  if (!track) return;
  const originals = [...track.children];
  originals.forEach((n) => { const c = n.cloneNode(true); c.setAttribute('aria-hidden', 'true'); track.append(c); });
  let half = 1, x = 0, v = 0, drag = false, lastX = 0, moved = 0, visible = false;
  const measure = () => { half = track.scrollWidth / 2 + 8; };
  measure();
  $$('img', track).forEach((img) => img.addEventListener('load', measure, { once: true }));
  window.addEventListener('resize', measure);
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) measure(); }).observe(track);
  const apply = () => { x = ((x % half) - half) % half; track.style.transform = `translate3d(${x.toFixed(1)}px,0,0) skewX(${clamp(v * 0.12, -5, 5).toFixed(2)}deg)`; };
  apply();
  track.addEventListener('pointerdown', (e) => { drag = true; lastX = e.clientX; moved = 0; track.setPointerCapture(e.pointerId); track.style.cursor = 'grabbing'; });
  track.addEventListener('pointermove', (e) => { if (!drag) return; const d = e.clientX - lastX; lastX = e.clientX; x += d; v = d; moved += Math.abs(d); });
  const up = () => { drag = false; track.style.cursor = ''; };
  track.addEventListener('pointerup', up);
  track.addEventListener('pointercancel', up);
  if (REDUCED) return;
  gsap.ticker.add(() => {
    if (!visible) return;
    if (!drag) { const sv = lenis ? Math.abs(lenis.velocity) : 0; x += v - 0.7 - sv * 0.12; v *= 0.94; }
    apply();
  });
}

/* ───────────────────────────── 07 films ───────────────────────────── */

function initFilms() {
  const box = $('#box'), video = $('#boxVideo'), title = $('#boxTitle');
  let opener = null;
  const close = () => { if (box.open) box.close(); };
  $$('[data-film]').forEach((b) => b.addEventListener('click', () => {
    opener = b;
    title.textContent = b.dataset.title;
    video.poster = $('img', b).currentSrc || $('img', b).src;
    video.src = b.dataset.film;
    box.showModal();
    lenis?.stop();
    if (!REDUCED) gsap.fromTo('.box__in', { autoAlpha: 0, y: 40, scale: 0.94 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.9, ease: 'expo.out' });
    video.play().catch(() => {});
  }));
  $('#boxX').addEventListener('click', close);
  box.addEventListener('click', (e) => { if (e.target === box) close(); });
  box.addEventListener('close', () => {
    video.pause(); video.removeAttribute('src'); video.load();
    lenis?.start();
    opener?.focus({ preventScroll: true });
  });
}

/* ───────────────────────────── footer mark ───────────────────────────── */

/** "TURKEY TRAININGS" as a field of dots on springs. They assemble on arrival and scatter under the pointer. */
function initMark() {
  const cv = $('#mark');
  if (!cv) return;
  const wrap = cv.parentElement, ctx = cv.getContext('2d');
  let dots = [], W = 0, H = 0, dpr = 1, raf = 0, visible = false, idle = 0;
  const mouse = { x: -9999, y: -9999 };

  function build() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = wrap.clientWidth;
    const lines = W < 900 ? ['TURKEY', 'TRAININGS'] : ['TURKEY TRAININGS'];
    const off = document.createElement('canvas'), o = off.getContext('2d');
    const font = (fs) => { o.font = `700 ${fs}px Archivo, Arial, sans-serif`; if ('fontStretch' in o) o.fontStretch = 'expanded'; if ('letterSpacing' in o) o.letterSpacing = `${(-0.012 * fs).toFixed(1)}px`; };
    font(100);
    const widest = Math.max(...lines.map((l) => o.measureText(l).width));
    const fs = (100 * W * 0.955) / widest;
    const lh = fs * 0.86;
    H = Math.ceil(lh * lines.length + fs * 0.16);
    wrap.style.height = `${H}px`;
    off.width = W; off.height = H;
    font(fs);
    o.fillStyle = '#fff'; o.textAlign = 'center'; o.textBaseline = 'alphabetic';
    lines.forEach((l, i) => o.fillText(l, W / 2, fs * 0.8 + i * lh));
    const data = o.getImageData(0, 0, W, H).data;
    const step = W < 520 ? 4 : W < 900 ? 6 : Math.max(5, Math.round(W / 250));
    const old = dots;
    dots = [];
    for (let y = step / 2; y < H; y += step) for (let x = step / 2; x < W; x += step) {
      if (data[((y | 0) * W + (x | 0)) * 4 + 3] > 120) {
        const p = old[dots.length];
        dots.push({ hx: x, hy: y, x: p ? p.x : Math.random() * W, y: p ? p.y : H + Math.random() * H * 1.5, vx: 0, vy: 0, k: 0.035 + Math.random() * 0.05 });
      }
    }
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv._r = step * 0.36;
    root.classList.add('mark-live');
    idle = 0;
  }

  function draw() {
    raf = 0;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const R = Math.max(90, W * 0.085), R2 = R * R, r = cv._r, t = performance.now() / 1000;
    let energy = 0;
    const hot = [];
    ctx.fillStyle = '#eef2f8';
    ctx.beginPath();
    for (const d of dots) {
      const hy = d.hy + (REDUCED ? 0 : Math.sin(t * 1.3 + d.hx * 0.012) * 1.2);
      let ax = (d.hx - d.x) * d.k, ay = (hy - d.y) * d.k;
      const dx = d.x - mouse.x, dy = d.y - mouse.y, dd = dx * dx + dy * dy;
      if (dd < R2) { const m = Math.sqrt(dd) || 1, f = (1 - m / R) ** 2 * 9; ax += (dx / m) * f; ay += (dy / m) * f; }
      d.vx = (d.vx + ax) * 0.84; d.vy = (d.vy + ay) * 0.84;
      d.x += d.vx; d.y += d.vy;
      const off = Math.abs(d.x - d.hx) + Math.abs(d.y - d.hy);
      energy += Math.abs(d.vx) + Math.abs(d.vy);
      if (off > 7) { hot.push(d); continue; }
      ctx.moveTo(d.x + r, d.y); ctx.arc(d.x, d.y, r, 0, 6.2832);
    }
    ctx.fill();
    ctx.fillStyle = '#E01F2B';
    ctx.beginPath();
    for (const d of hot) { ctx.moveTo(d.x + r, d.y); ctx.arc(d.x, d.y, r * 1.15, 0, 6.2832); }
    ctx.fill();
    idle = energy < dots.length * 0.02 && REDUCED ? idle + 1 : 0;
    if (visible && idle < 30) raf = requestAnimationFrame(draw);
  }
  const kick = () => { idle = 0; if (!raf && visible) raf = requestAnimationFrame(draw); };

  build();
  if (REDUCED) dots.forEach((d) => { d.x = d.hx; d.y = d.hy; });
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; kick(); }, { rootMargin: '0px 0px -8% 0px' }).observe(wrap);
  const move = (e) => { const r = cv.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; kick(); };
  window.addEventListener('pointermove', move, { passive: true });
  window.addEventListener('pointerdown', move, { passive: true });
  wrap.addEventListener('pointerleave', () => { mouse.x = mouse.y = -9999; });
  let rw = W;
  window.addEventListener('resize', () => { if (wrap.clientWidth !== rw) { rw = wrap.clientWidth; build(); kick(); } });
}

/* ───────────────────────── instruments and rail ───────────────────────── */

function initInstruments() {
  const hud = $('.hud'), rail = $('.rail');
  hud.children[1]?.classList.add('hud__row--gs');
  const chRow = document.createElement('div');
  chRow.className = 'hud__row hud__row--ch';
  chRow.innerHTML = '<span>WPT</span><b id="hudCh">DEPARTURE</b>';
  hud.append(chRow);
  const alt = $('#hudAlt'), altU = $('#hudAltU'), gs = $('#hudGs'), ch = $('#hudCh');
  const secs = $$('[data-chapter]');
  const links = secs.map((s, i) => {
    const a = document.createElement('a');
    a.href = `#${s.id}`;
    a.innerHTML = `<i></i><span>${String(i + 1).padStart(2, '0')} ${s.dataset.chapter}</span>`;
    a.setAttribute('aria-label', s.dataset.chapter);
    rail.append(a);
    return a;
  });
  let cur = -1, tops = [];
  const setCh = (i) => { if (i === cur) return; cur = i; ch.textContent = secs[i].dataset.chapter.toUpperCase(); links.forEach((l, j) => l.classList.toggle('is-on', j === i)); };
  setCh(0);

  const arrival = $('#arrival');
  let lastA = '', lastG = '', v = 0, ly = window.scrollY, endY = 1;
  const measure = () => {
    endY = Math.max(1, arrival.getBoundingClientRect().top + window.scrollY - innerHeight * 0.2);
    tops = secs.map((s) => s.getBoundingClientRect().top + window.scrollY);
  };
  ScrollTrigger.addEventListener('refresh', measure);
  measure();
  gsap.ticker.add(() => {
    const y = window.scrollY;
    const line = y + innerHeight * 0.55;
    let ci = 0;
    for (let i = 0; i < tops.length; i++) if (tops[i] <= line) ci = i;
    setCh(ci);
    const a = Math.round((38000 * (1 - clamp(y / endY))) / 100) * 100;
    const as = a <= 0 ? 'ARRIVED' : a.toLocaleString('en-US');
    if (as !== lastA) { lastA = as; alt.textContent = as; altU.textContent = a <= 0 ? '' : 'FT'; }
    v += (Math.abs(y - ly) - v) * 0.12; ly = y;
    const g = String(Math.min(480, Math.round(v * 9))).padStart(3, '0');
    if (g !== lastG) { lastG = g; gs.textContent = g; }
  });
}

/* ───────────────────── inner pages and page transitions ───────────────────── */

const LOGO = '<svg viewBox="0 0 96 74"><path d="M12 6 H42 a16 16 0 0 1 16 16 V52 a16 16 0 0 1 -16 16 H34 V28 H12 Z"/><path class="r" d="M64 6 H94 L79 34 Z"/></svg>';

/** A navy curtain rises over the page before the browser leaves for another page of the site. */
function initTransit() {
  let cur = $('.curtain');
  if (!cur) {
    cur = document.createElement('div');
    cur.className = 'curtain';
    cur.setAttribute('aria-hidden', 'true');
    cur.innerHTML = LOGO;
    document.body.appendChild(cur);
  }
  let leaving = false;
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href]');
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
    let u;
    try { u = new URL(a.href, location.href); } catch (err) { return; }
    if (u.origin !== location.origin || !/^https?:$/.test(u.protocol)) return;
    if (u.pathname === location.pathname && u.search === location.search) {
      // same page: glide to the section instead of jumping
      const t = u.hash.length > 1 && document.getElementById(decodeURIComponent(u.hash.slice(1)));
      if (t) { e.preventDefault(); if (S.menu) closeMenu(); scrollToEl(t); history.replaceState(null, '', u.hash); }
      return;
    }
    e.preventDefault();
    if (leaving) return;
    leaving = true;
    try { sessionStorage.setItem('tt-seen', '1'); } catch (err) { /* private mode */ }
    if (REDUCED) { location.href = u.href; return; }
    lenis?.stop();
    gsap.set(cur, { visibility: 'visible' });
    gsap.fromTo(cur, { yPercent: 101 }, { yPercent: 0, duration: 0.7, ease: 'expo.inOut', onComplete() { location.href = u.href; } });
    gsap.fromTo($('svg', cur), { autoAlpha: 0, scale: 0.7 }, { autoAlpha: 1, scale: 1, duration: 0.6, delay: 0.2, ease: 'expo.out' });
  });
  // coming back with the browser's Back button: the page is restored as it was left, curtain down
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    leaving = false;
    gsap.set(cur, { visibility: 'hidden', yPercent: -101 });
    lenis?.start();
  });
}

/** Small drifting field of points behind an inner-page headline. The pointer pushes them aside. */
function initHeroDots() {
  const cv = $('.phero__dots');
  if (!cv || REDUCED) return;
  const ctx = cv.getContext('2d'), wrap = cv.parentElement;
  let W = 0, H = 0, dpr = 1, dots = [], raf = 0, on = false;
  const m = { x: -9999, y: -9999 };
  function build() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = wrap.clientWidth; H = wrap.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const n = Math.round(Math.min(150, W * H / 9000));
    dots = Array.from({ length: n }, (_, i) => ({
      x: Math.random() * W, y: Math.random() * H, r: 0.7 + Math.random() * 1.5,
      vx: 0.05 + Math.random() * 0.22, vy: -0.03 - Math.random() * 0.1, ox: 0, oy: 0,
      c: i % 13 === 0 ? '#E01F2B' : i % 9 === 0 ? '#F6B62B' : '#A8B8D0', a: 0.25 + Math.random() * 0.55,
    }));
  }
  function frame() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (const d of dots) {
      d.x += d.vx; d.y += d.vy;
      if (d.x > W + 6) d.x = -6;
      if (d.y < -6) d.y = H + 6;
      const dx = d.x - m.x, dy = d.y - m.y, q = dx * dx + dy * dy;
      if (q < 16900) { const f = (1 - q / 16900) * 26, l = Math.sqrt(q) || 1; d.ox += (dx / l * f - d.ox) * 0.12; d.oy += (dy / l * f - d.oy) * 0.12; }
      else { d.ox *= 0.94; d.oy *= 0.94; }
      ctx.globalAlpha = d.a;
      ctx.fillStyle = d.c;
      ctx.beginPath();
      ctx.arc(d.x + d.ox, d.y + d.oy, d.r, 0, 6.2832);
      ctx.fill();
    }
    if (on) raf = requestAnimationFrame(frame);
  }
  build();
  window.addEventListener('resize', build);
  wrap.addEventListener('pointermove', (e) => { const r = wrap.getBoundingClientRect(); m.x = e.clientX - r.left; m.y = e.clientY - r.top; }, { passive: true });
  wrap.addEventListener('pointerleave', () => { m.x = m.y = -9999; });
  new IntersectionObserver(([en]) => {
    on = en.isIntersecting;
    cancelAnimationFrame(raf);
    if (on) raf = requestAnimationFrame(frame);
  }).observe(wrap);
}

/** Everything that only exists on inner pages: grouped arrivals, tilting cards, FAQ, progress line. */
function initInner() {
  // reading progress under the header
  const bar = document.createElement('div');
  bar.className = 'pbar';
  bar.setAttribute('aria-hidden', 'true');
  document.body.appendChild(bar);
  const setBar = () => { const max = document.documentElement.scrollHeight - innerHeight; bar.style.transform = `scaleX(${max > 0 ? clamp(window.scrollY / max) : 0})`; };
  window.addEventListener('scroll', setBar, { passive: true });
  setBar();

  // FAQ: one tap opens, the answer slides
  $$('details.faq').forEach((d) => {
    const sum = $('summary', d), body = $('.faq__a', d);
    if (!sum || !body || REDUCED) return;
    sum.addEventListener('click', (e) => {
      e.preventDefault();
      if (d.open) {
        gsap.to(body, { height: 0, autoAlpha: 0, duration: 0.5, ease: 'expo.out', onComplete() { d.open = false; gsap.set(body, { clearProps: 'all' }); ScrollTrigger.refresh(); } });
        d.classList.remove('is-open');
      } else {
        d.open = true;
        d.classList.add('is-open');
        gsap.fromTo(body, { height: 0, autoAlpha: 0 }, { height: 'auto', autoAlpha: 1, duration: 0.7, ease: 'expo.out', onComplete() { gsap.set(body, { clearProps: 'height' }); ScrollTrigger.refresh(); } });
      }
    });
  });

  if (REDUCED) return;

  $$('[data-stagger]').forEach((g) => {
    const items = [...g.children];
    if (!items.length) return;
    gsap.set(items, { autoAlpha: 0, y: 44 });
    once(g, () => gsap.to(items, { autoAlpha: 1, y: 0, duration: 1.05, ease: 'expo.out', stagger: Math.min(0.09, 0.9 / items.length), clearProps: 'transform' }), 'top 90%');
  });
  // long lists arrive row by row as they are reached
  $$('[data-stagger-rows]').forEach((g) => {
    const items = [...g.children];
    gsap.set(items, { autoAlpha: 0, y: 26 });
    ScrollTrigger.batch(items, { start: 'top 94%', once: true, onEnter: (b) => gsap.to(b, { autoAlpha: 1, y: 0, duration: 0.8, ease: 'expo.out', stagger: 0.035, clearProps: 'transform' }) });
  });

  const img = $('.phero__img img');
  if (img) {
    gsap.fromTo(img, { scale: 1.22 }, { scale: 1.06, duration: 2.4, ease: 'expo.out' });
    gsap.to(img, { yPercent: 16, ease: 'none', scrollTrigger: { trigger: '.phero', start: 'top top', end: 'bottom top', scrub: true } });
    gsap.to('.phero__in', { yPercent: -10, autoAlpha: 0.25, ease: 'none', scrollTrigger: { trigger: '.phero', start: 'top top', end: 'bottom top', scrub: true } });
  }
  initHeroDots();

  if (FINE) {
    $$('[data-tilt]').forEach((c) => {
      const ph = $('.card__ph img', c);
      c.addEventListener('pointermove', (e) => {
        const r = c.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
        gsap.to(c, { rotationY: px * 7, rotationX: -py * 7, transformPerspective: 900, duration: 0.5, ease: 'power3.out', overwrite: 'auto' });
        if (ph) gsap.to(ph, { x: -px * 14, y: -py * 14, duration: 0.6, ease: 'power3.out', overwrite: 'auto' });
      });
      c.addEventListener('pointerleave', () => {
        gsap.to(c, { rotationY: 0, rotationX: 0, duration: 1, ease: 'elastic.out(1, 0.5)', overwrite: 'auto' });
        if (ph) gsap.to(ph, { x: 0, y: 0, duration: 0.8, ease: 'expo.out', overwrite: 'auto' });
      });
    });
  }
}

async function bootInner() {
  const cur = $('.curtain');
  const safe = (fn) => { try { fn(); } catch (err) { console.warn('[inner]', fn.name, err); } };
  initLenis();
  initCursor();
  initMenu();
  initAnchors();
  initTransit();
  initLang();

  await withTimeout(Promise.all([document.fonts.load('700 1em Archivo'), document.fonts.load('500 1em "Plex Mono"')]), 3000);
  [initHeader, initFilms, initMagnetic, initMark].forEach(safe);
  const hero = $('.phero__img img');
  if (hero && hero.decode) await withTimeout(hero.decode().catch(() => {}), 2500);

  const start = () => {
    safe(initReveals);
    safe(initInner);
    ScrollTrigger.sort();
    ScrollTrigger.refresh();
    const t = location.hash.length > 1 && document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (t) { if (lenis) lenis.scrollTo(t, { immediate: true, force: true }); else t.scrollIntoView(); }
  };
  window.addEventListener('load', () => ScrollTrigger.refresh());
  root.classList.add('loader-gone');

  if (REDUCED || !cur) {
    start();
    root.classList.add('curtain-up');
    lenis?.start();
    return;
  }
  gsap.set('.top', { yPercent: -110 });
  gsap.timeline()
    .to($('svg', cur), { scale: 1.25, autoAlpha: 0, duration: 0.5, ease: 'power2.in' }, 0)
    .to(cur, { yPercent: -101, duration: 1.05, ease: 'expo.inOut' }, 0.15)
    .add(start, 0.5)
    .to('.top', { yPercent: 0, duration: 1.1, ease: 'expo.out' }, 0.65)
    .add(() => { gsap.set(cur, { visibility: 'hidden' }); root.classList.add('curtain-up'); lenis?.start(); }, 1.25);
}

/** Language menu in the header: opens on click, closes on Escape or a click elsewhere. */
function initLang() {
  const box = $('.lang'), btn = $('.lang__btn'), list = $('.lang__list');
  if (!box || !btn || !list) return;
  const items = $$('li', list);
  const set = (open) => {
    btn.setAttribute('aria-expanded', String(open));
    box.classList.toggle('is-open', open);
    if (open && !REDUCED) gsap.fromTo(items, { autoAlpha: 0, y: -8 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: 'expo.out', stagger: 0.05 });
  };
  btn.addEventListener('click', (e) => { e.stopPropagation(); set(btn.getAttribute('aria-expanded') !== 'true'); });
  document.addEventListener('click', (e) => { if (!box.contains(e.target)) set(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') { set(false); btn.focus(); } });
}

/* ───────────────────────────── boot ───────────────────────────── */

const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);

async function boot() {
  root.classList.add('is-loading');
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  const loaderDone = initLoader();
  initLenis();
  initCursor();
  initMenu();
  initAnchors();
  initTransit();
  initLang();

  const fontsP = withTimeout(Promise.all([document.fonts.load('700 1em Archivo'), document.fonts.load('500 1em "Plex Mono"'), document.fonts.ready]), 5000).then(() => { load.fonts = 1; });
  const imgsP = withTimeout(Promise.all($$('.hero img').map((i) => (i.decode ? i.decode().catch(() => {}) : Promise.resolve()))), 5000).then(() => { load.images = 1; });
  const geoP = fetch('/assets/data/geo.json').then((r) => r.json()).then((g) => { load.data = 1; return g; });

  try {
    const geo = await geoP;
    await new Promise((r) => requestAnimationFrame(r));
    const { createScene } = await import('./scene.js');
    scene = createScene({
      canvas: $('#scene'), labelsEl: $('#labels'), geo, reduced: REDUCED, small: innerWidth < 900,
      anchors: { avoid: $('.hero__meta'), globe: $('.hero__globe'), plane: $('.avi__stage'), map: $('.ground__map'), rings: $('.arr__radar') },
    });
  } catch (err) {
    console.warn('[scene] falling back to a static background:', err);
    root.classList.add('no-gl');
    load.data = 1;
  }
  load.scene = 1;
  window.__scene = scene; // handy when tuning from the console

  await fontsP;
  const mm = gsap.matchMedia();
  initHeader();
  initReveals();
  prepHero();
  initInstruments();
  initHero(mm);
  initRoute(mm);
  initAviation(mm);
  initBoard();
  try { (await import('./deck.js')).initDeck({ reduced: REDUCED, fine: FINE }); } catch (err) { console.warn('[deck]', err); }
  initGround(mm);
  initReel();
  initFilms();
  initMagnetic();
  initPhases(mm);
  initSceneLoop();
  initMark();
  ScrollTrigger.sort();
  ScrollTrigger.refresh();

  await imgsP;
  await loaderDone;
  await exitLoader();
  intro();
  window.addEventListener('load', () => ScrollTrigger.refresh());
  // arriving from an inner page with a section in the address: fly there once the intro has started
  const to = location.hash.length > 1 && document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (to) setTimeout(() => scrollToEl(to), REDUCED ? 0 : 900);
}

(INNER ? bootInner() : boot()).catch((err) => {
  console.error('[boot]', err);
  root.classList.add('loader-gone', 'curtain-up');
  root.classList.remove('is-loading');
  lenis?.start();
});
