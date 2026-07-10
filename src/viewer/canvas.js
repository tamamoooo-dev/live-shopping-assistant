// viewer/canvas.js — the viewer's render core: a horizontally-swiping window
// of pages where ONLY compositor transforms move (translate3d/scale — never
// layout), so pan, pinch and page turns stay smooth on long flyers and old
// phones alike.
//
// Model: a full-width `track` holds one absolutely-positioned slot per page
// (only the current ±1 slots are actually MOUNTED with an <img>; ±2 are
// prefetched). The track translates for paging; each slot's `content` element
// (sized to the page's contain-fit) translates/scales for zoom + pan. All the
// math lives in transform.js (pure, tested); all the gesture arbitration in
// gestures.js. This file owns state + rAF animation only.
//
// Gesture policy (the Photos-app contract):
//   zoom == 1  → horizontal pan drags the TRACK (follow-your-finger paging,
//                rubber-banded at both ends); vertical pan does nothing.
//   zoom > 1   → pan moves the PAGE with momentum and rubber-band edges.
//   pinch      → zooms the current page about the fingers' midpoint,
//                over-zoom resisted, snapped back on release.
//   double-tap → 1× ↔ 2.5× about the tap point.
//   tap        → reported upward with page fractions (hotspots / chrome).

import { attachGestures } from './gestures.js';
import {
  MIN_ZOOM, MAX_ZOOM, fitSize, centered, clamp, zoomAt, pinchZoom,
  pointToFraction, centerOnRect,
} from './transform.js';

const easeOut = (p) => 1 - Math.pow(1 - p, 3);
// Respect prefers-reduced-motion: every animation collapses to ~a frame.
const REDUCED =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const ms = (n) => (REDUCED ? 1 : n);
const PAGE_ANIM_MS = ms(280);
const ZOOM_ANIM_MS = ms(240);
const SNAP_MS = ms(220);
const FLICK_V = 0.45; // px/ms of horizontal velocity that turns a page

export function createPageCanvas(stage, opts) {
  const {
    pages, // [{ src }] — one per page, in order
    onPageChange = () => {},
    onTap = () => {}, // (i, {fx, fy, x, y}) -> handled? (true = consumed)
    onPress = () => {}, // pressed-feedback probe, same signature
    onPressCancel = () => {},
    onMountPage = () => {}, // (i, contentEl, fit) — attach overlays here
    onZoomChange = () => {},
    onPullDown = () => {}, // (dy) — vertical drag at 1×: dismiss preview
    onPullDownEnd = () => {}, // (dy, vy) — release: close or spring back
    startPage = 0,
    startZoom = 1,
  } = opts;

  const track = document.createElement('div');
  track.className = 'vv-track';
  stage.appendChild(track);
  stage.style.touchAction = 'none';

  let stageW = 1;
  let stageH = 1;
  let idx = Math.min(pages.length - 1, Math.max(0, startPage));
  const slots = new Map(); // i -> { el, content, img, fit, nat }
  const transforms = new Map(); // i -> { z, tx, ty } (zoom memory per page)
  let trackX = 0; // current track translation
  let raf = null; // the single animation frame handle
  let momentum = null; // live momentum state
  let dragAxis = null; // 'page' | 'pan' | 'dismiss' | 'none' while a pan is live
  let pullY = 0; // accumulated pull-down distance while dismissing
  let pinchBase = null; // transform at pinch start
  let destroyed = false;

  const t = () => transforms.get(idx) || { z: 1, tx: 0, ty: 0 };
  const setT = (i, v) => transforms.set(i, v);

  /* --- geometry ------------------------------------------------------------- */
  function measure() {
    stageW = Math.max(1, stage.clientWidth);
    stageH = Math.max(1, stage.clientHeight);
  }

  function slotFit(s) {
    if (!s || !s.nat) return null;
    return fitSize(s.nat.w, s.nat.h, stageW, stageH);
  }

  function applyPage(i) {
    const s = slots.get(i);
    if (!s) return;
    const fit = slotFit(s);
    if (!fit) return;
    s.fit = fit;
    s.content.style.width = `${fit.w}px`;
    s.content.style.height = `${fit.h}px`;
    const tr = i === idx ? t() : centered(fit.w, fit.h, stageW, stageH, 1);
    if (i === idx && (!transforms.has(i) || tr.z <= 1)) {
      // At rest (or first sight) the page sits centered.
      const c = centered(fit.w, fit.h, stageW, stageH, tr.z || 1);
      setT(i, c);
      paintContent(s, c);
    } else {
      paintContent(s, tr);
    }
  }

  const paintContent = (s, tr) => {
    s.content.style.transform = `translate3d(${tr.tx}px, ${tr.ty}px, 0) scale(${tr.z})`;
  };
  const paintTrack = () => {
    track.style.transform = `translate3d(${trackX}px, 0, 0)`;
  };

  /* --- mounting -------------------------------------------------------------- */
  function mount(i) {
    if (i < 0 || i >= pages.length || slots.has(i)) return;
    const el = document.createElement('div');
    el.className = 'vv-slot';
    el.style.transform = `translate3d(${i * 100}%, 0, 0)`;
    const content = document.createElement('div');
    content.className = 'vv-content';
    const img = document.createElement('img');
    img.className = 'vv-page';
    img.alt = `Page ${i + 1}`;
    img.decoding = 'async';
    img.fetchPriority = i === idx ? 'high' : 'low'; // current page wins the network
    img.draggable = false;
    content.appendChild(img);
    el.appendChild(content);
    track.appendChild(el);
    const s = { el, content, img, fit: null, nat: null };
    slots.set(i, s);
    img.src = pages[i].src;
    const ready = () => {
      if (destroyed || !slots.has(i)) return;
      s.nat = { w: img.naturalWidth || 1000, h: img.naturalHeight || 1400 };
      applyPage(i);
      img.classList.add('is-ready');
      onMountPage(i, content, slotFit(s));
    };
    // decode() paints in one hop (no half-decoded pop-in); load is the fallback.
    if (img.decode) img.decode().then(ready, () => img.addEventListener('load', ready, { once: true }));
    else img.addEventListener('load', ready, { once: true });
  }

  function unmount(i) {
    const s = slots.get(i);
    if (!s) return;
    s.el.remove();
    slots.delete(i);
  }

  const prefetched = new Set();
  function prefetch(i) {
    if (i < 0 || i >= pages.length || prefetched.has(i) || slots.has(i)) return;
    prefetched.add(i);
    const im = new Image();
    im.decoding = 'async';
    im.src = pages[i].src;
  }

  function syncWindow() {
    for (const i of [...slots.keys()]) if (Math.abs(i - idx) > 1) unmount(i);
    for (const i of [idx, idx - 1, idx + 1]) mount(i);
    prefetch(idx + 2);
    prefetch(idx - 2);
  }

  /* --- animation ------------------------------------------------------------- */
  function stopAnim() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    momentum = null;
  }

  function animate(step, done) {
    stopAnim();
    const t0 = performance.now();
    const tick = (now) => {
      if (destroyed) return;
      const more = step(now - t0);
      if (more) raf = requestAnimationFrame(tick);
      else {
        raf = null;
        done && done();
      }
    };
    raf = requestAnimationFrame(tick);
  }

  function animateTransform(to, ms = ZOOM_ANIM_MS, done) {
    const from = t();
    animate((el) => {
      const p = easeOut(Math.min(1, el / ms));
      const cur = {
        z: from.z + (to.z - from.z) * p,
        tx: from.tx + (to.tx - from.tx) * p,
        ty: from.ty + (to.ty - from.ty) * p,
      };
      setT(idx, cur);
      const s = slots.get(idx);
      if (s) paintContent(s, cur);
      if (p >= 1) {
        onZoomChange(to.z);
        return false;
      }
      return true;
    }, done);
  }

  function animateTrack(toX, ms = PAGE_ANIM_MS, done) {
    const from = trackX;
    animate((el) => {
      const p = easeOut(Math.min(1, el / ms));
      trackX = from + (toX - from) * p;
      paintTrack();
      return p < 1;
    }, done);
  }

  function startMomentum(vx, vy) {
    const s = slots.get(idx);
    if (!s || !s.fit) return;
    momentum = { vx, vy, last: performance.now() };
    animate((/* elapsed */) => {
      if (!momentum) return false;
      const now = performance.now();
      const dt = Math.min(48, now - momentum.last);
      momentum.last = now;
      const decay = Math.exp(-dt / 325); // iOS-flavoured friction
      const cur = t();
      let next = { z: cur.z, tx: cur.tx + momentum.vx * dt, ty: cur.ty + momentum.vy * dt };
      momentum.vx *= decay;
      momentum.vy *= decay;
      const hard = clamp(next, s.fit.w, s.fit.h, stageW, stageH);
      // Kill velocity on the axes that hit a wall.
      if (hard.tx !== next.tx) momentum.vx = 0;
      if (hard.ty !== next.ty) momentum.vy = 0;
      next = hard;
      setT(idx, next);
      paintContent(s, next);
      if (Math.abs(momentum.vx) < 0.02 && Math.abs(momentum.vy) < 0.02) {
        momentum = null;
        return false;
      }
      return true;
    });
  }

  /* --- paging ----------------------------------------------------------------- */
  function goTo(n, { animate: anim = true } = {}) {
    const target = Math.min(pages.length - 1, Math.max(0, n));
    if (target === idx && trackX === -idx * stageW) return;
    stopAnim();
    idx = target;
    syncWindow();
    const toX = -idx * stageW;
    const settle = () => {
      // A page you left comes back at rest; its remembered zoom is applied
      // only through explicit restore (centerOn/setZoom), keeping turns calm.
      const s = slots.get(idx);
      if (s && s.fit) {
        const c = centered(s.fit.w, s.fit.h, stageW, stageH, 1);
        setT(idx, c);
        paintContent(s, c);
      }
      onZoomChange(1);
      onPageChange(idx);
    };
    if (anim) animateTrack(toX, PAGE_ANIM_MS, settle);
    else {
      trackX = toX;
      paintTrack();
      settle();
    }
  }

  /* --- gestures ---------------------------------------------------------------- */
  const stageXY = (x, y) => {
    const r = stage.getBoundingClientRect();
    return { x: x - r.left, y: y - r.top };
  };

  const { gestures, detach } = attachGestures(stage, {
    onPress(x, y) {
      stopAnim();
      const s = slots.get(idx);
      if (!s || !s.fit) return;
      const p = stageXY(x, y);
      const f = pointToFraction(t(), s.fit.w, s.fit.h, p.x, p.y);
      onPress(idx, { ...f, x, y });
    },
    onPressCancel,
    onTap(x, y) {
      const s = slots.get(idx);
      if (!s || !s.fit) return;
      const p = stageXY(x, y);
      const f = pointToFraction(t(), s.fit.w, s.fit.h, p.x, p.y);
      onTap(idx, { ...f, x, y });
    },
    onDoubleTap(x, y) {
      const s = slots.get(idx);
      if (!s || !s.fit) return;
      const p = stageXY(x, y);
      const cur = t();
      const to = cur.z > 1.05
        ? centered(s.fit.w, s.fit.h, stageW, stageH, 1)
        : clamp(zoomAt(cur, 2.5, p.x, p.y), s.fit.w, s.fit.h, stageW, stageH);
      animateTransform(to);
    },
    onPanStart() {
      dragAxis = null;
      pullY = 0;
    },
    onPan(dx, dy) {
      const s = slots.get(idx);
      if (!s || !s.fit) return;
      if (dragAxis == null) {
        // At 1×: horizontal drags page, DOWNWARD drag arms dismiss (Photos).
        dragAxis = t().z > 1.02 ? 'pan' : Math.abs(dx) >= Math.abs(dy) ? 'page' : dy > 0 ? 'dismiss' : 'none';
      }
      if (dragAxis === 'dismiss') {
        pullY = Math.max(0, pullY + dy);
        onPullDown(pullY);
        return;
      }
      if (dragAxis === 'pan') {
        const cur = t();
        const next = clamp(
          { z: cur.z, tx: cur.tx + dx, ty: cur.ty + dy },
          s.fit.w, s.fit.h, stageW, stageH, { soft: true },
        );
        setT(idx, next);
        paintContent(s, next);
      } else if (dragAxis === 'page') {
        let x = trackX + dx;
        const min = -(pages.length - 1) * stageW;
        if (x > 0) x *= 0.35; // rubber at the first page
        if (x < min) x = min + (x - min) * 0.35; // …and the last
        trackX = x;
        paintTrack();
      }
    },
    onPanEnd(vx, vy) {
      const s = slots.get(idx);
      if (!s || !s.fit) return;
      if (dragAxis === 'dismiss') {
        onPullDownEnd(pullY, vy);
        dragAxis = null;
        return;
      }
      if (dragAxis === 'pan') {
        // Settle out-of-bounds overshoot, then coast.
        const hard = clamp(t(), s.fit.w, s.fit.h, stageW, stageH);
        const cur = t();
        if (hard.tx !== cur.tx || hard.ty !== cur.ty) animateTransform(hard, SNAP_MS);
        else startMomentum(vx, vy);
      } else if (dragAxis === 'page') {
        const from = idx;
        const drag = trackX + from * stageW; // displacement from rest
        let target = from;
        if (drag < -stageW * 0.3 || vx < -FLICK_V) target = from + 1;
        else if (drag > stageW * 0.3 || vx > FLICK_V) target = from - 1;
        target = Math.min(pages.length - 1, Math.max(0, target));
        if (target !== from) goTo(target);
        else animateTrack(-from * stageW, SNAP_MS); // not enough drag: spring back
      }
      dragAxis = null;
    },
    onPinchStart() {
      stopAnim();
      pinchBase = t();
    },
    onPinch(scale, cx, cy) {
      const s = slots.get(idx);
      if (!s || !s.fit || !pinchBase) return;
      const p = stageXY(cx, cy);
      const z = pinchZoom(pinchBase.z, scale);
      const next = clamp(
        zoomAt(pinchBase, z, p.x, p.y),
        s.fit.w, s.fit.h, stageW, stageH, { soft: true },
      );
      // zoomAt must move with the fingers' CURRENT midpoint relative to the
      // pinch-start transform, so recompute from the base each event.
      setT(idx, next);
      paintContent(s, next);
      onZoomChange(next.z);
    },
    onPinchEnd() {
      const s = slots.get(idx);
      if (!s || !s.fit) return;
      const cur = t();
      const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cur.z));
      const to = clamp({ ...cur, z: z }, s.fit.w, s.fit.h, stageW, stageH);
      const fixed = z === cur.z ? to : clamp(zoomAt(cur, z, stageW / 2, stageH / 2), s.fit.w, s.fit.h, stageW, stageH);
      animateTransform(fixed, SNAP_MS);
      pinchBase = null;
    },
  });

  // Desktop nicety: ctrl/cmd+wheel zooms, plain wheel pans when zoomed.
  const onWheel = (e) => {
    const s = slots.get(idx);
    if (!s || !s.fit) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const p = stageXY(e.clientX, e.clientY);
      const cur = t();
      const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cur.z * (e.deltaY < 0 ? 1.12 : 0.9)));
      const next = clamp(zoomAt(cur, z, p.x, p.y), s.fit.w, s.fit.h, stageW, stageH);
      setT(idx, next);
      paintContent(s, next);
      onZoomChange(next.z);
    } else if (t().z > 1.02) {
      e.preventDefault();
      const cur = t();
      const next = clamp(
        { z: cur.z, tx: cur.tx - e.deltaX, ty: cur.ty - e.deltaY },
        s.fit.w, s.fit.h, stageW, stageH,
      );
      setT(idx, next);
      paintContent(s, next);
    }
  };
  stage.addEventListener('wheel', onWheel, { passive: false });

  const onResize = () => {
    measure();
    trackX = -idx * stageW;
    paintTrack();
    for (const i of slots.keys()) applyPage(i);
  };
  window.addEventListener('resize', onResize);

  /* --- boot ---------------------------------------------------------------------- */
  measure();
  trackX = -idx * stageW;
  paintTrack();
  syncWindow();
  if (startZoom > 1) setT(idx, { z: startZoom, tx: 0, ty: 0 }); // re-clamped on decode

  return {
    goTo,
    index: () => idx,
    zoom: () => t().z,
    pageCount: () => pages.length,
    // Animate zoom to a level about the stage center (the ± buttons/keys).
    zoomTo(z) {
      const s = slots.get(idx);
      if (!s || !s.fit) return;
      const cur = t();
      const zz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
      animateTransform(clamp(zoomAt(cur, zz, stageW / 2, stageH / 2), s.fit.w, s.fit.h, stageW, stageH));
    },
    // Fly the view to a fractional page rect (the search landing).
    centerOn(rect, o = {}) {
      const s = slots.get(idx);
      if (!s || !s.fit) return;
      animateTransform(centerOnRect(rect, s.fit.w, s.fit.h, stageW, stageH, o), o.ms || 420, o.done);
    },
    contentEl: (i) => (slots.get(i) ? slots.get(i).content : null),
    fitOf: (i) => slotFit(slots.get(i)),
    destroy() {
      destroyed = true;
      stopAnim();
      detach();
      stage.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
      track.remove();
    },
    _gestures: gestures, // exposed for tests
  };
}
