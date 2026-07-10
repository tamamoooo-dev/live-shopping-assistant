// viewer/gestures.js — the viewer's gesture arbiter: ONE pure state machine
// that owns every pointer on the stage and decides, unambiguously, whether a
// contact is a tap, a double-tap, a pan, or a pinch. Hotspot taps, page
// swipes and zoom all flow from here, so a tap can never fire mid-pan and a
// pinch can never turn a page — the disambiguation bugs of the old viewer's
// per-listener heuristics are structurally impossible.
//
// DOM-free and dependency-free (fed normalized pointer samples), so the
// classification rules are unit-testable (viewer.test.mjs).
//
//   const g = createGestures(handlers, opts?)
//   g.down(id, x, y, t)  g.move(id, x, y, t)  g.up(id, x, y, t)  g.cancel()
//
// Handlers (all optional):
//   onPress(x, y)            finger down, may become a tap (pressed feedback)
//   onPressCancel()          the contact became a pan/pinch or was cancelled
//   onTap(x, y)              a clean single tap (fired after the double-tap
//                            window so it never races onDoubleTap)
//   onDoubleTap(x, y)        two quick taps in place
//   onPanStart(x, y) / onPan(dx, dy) / onPanEnd(vx, vy)   vx/vy in px per ms
//   onPinchStart(cx, cy) / onPinch(scale, cx, cy) / onPinchEnd()
//                            scale is RELATIVE to the pinch start

export const TAP_SLOP = 10; // px of movement that still counts as a tap
export const DOUBLE_TAP_MS = 260; // window between taps
export const DOUBLE_TAP_RADIUS = 48; // px between the two taps

export function createGestures(handlers = {}, opts = {}) {
  const h = handlers;
  const slop = opts.tapSlop ?? TAP_SLOP;
  const dblMs = opts.doubleTapMs ?? DOUBLE_TAP_MS;
  const dblR = opts.doubleTapRadius ?? DOUBLE_TAP_RADIUS;
  const setT = opts.setTimeout || ((fn, ms) => setTimeout(fn, ms));
  const clearT = opts.clearTimeout || ((id) => clearTimeout(id));

  const pointers = new Map(); // id -> { x, y }
  let state = 'idle'; // idle | pressed | pan | pinch | settled
  let start = null; // { x, y, t } of the first contact
  let last = null; // previous single-pointer sample
  let samples = []; // recent samples for the velocity estimate
  let pinch0 = 0; // pinch baseline distance
  let lastTap = null; // { x, y, t } of the previous completed tap
  let tapTimer = null; // pending single-tap emit

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const two = () => {
    const [a, b] = [...pointers.values()];
    return { d: dist(a, b), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  };

  function flushTapTimer() {
    if (tapTimer != null) {
      clearT(tapTimer);
      tapTimer = null;
    }
  }

  function velocity(t) {
    // Regression over the samples of the last ~100ms — the momentum seed.
    const recent = samples.filter((s) => t - s.t <= 100);
    if (recent.length < 2) return { vx: 0, vy: 0 };
    const a = recent[0];
    const b = recent[recent.length - 1];
    const dt = Math.max(1, b.t - a.t);
    return { vx: (b.x - a.x) / dt, vy: (b.y - a.y) / dt };
  }

  function down(id, x, y, t) {
    pointers.set(id, { x, y });
    if (pointers.size === 1) {
      state = 'pressed';
      start = { x, y, t };
      last = { x, y, t };
      samples = [{ x, y, t }];
      h.onPress && h.onPress(x, y);
    } else if (pointers.size === 2) {
      // A second finger always means pinch — cancel any tap/pan in flight.
      if (state === 'pressed') h.onPressCancel && h.onPressCancel();
      if (state === 'pan') h.onPanEnd && h.onPanEnd(0, 0);
      flushTapTimer();
      lastTap = null;
      state = 'pinch';
      const { d, cx, cy } = two();
      pinch0 = Math.max(1, d);
      h.onPinchStart && h.onPinchStart(cx, cy);
    }
    // 3+ pointers: ignore extras, the pinch continues on whichever two remain.
  }

  function move(id, x, y, t) {
    const p = pointers.get(id);
    if (!p) return;
    p.x = x;
    p.y = y;
    if (state === 'pinch') {
      if (pointers.size >= 2) {
        const { d, cx, cy } = two();
        h.onPinch && h.onPinch(d / pinch0, cx, cy);
      }
      return;
    }
    if (pointers.size !== 1) return;
    if (state === 'pressed') {
      if (Math.hypot(x - start.x, y - start.y) > slop) {
        state = 'pan';
        h.onPressCancel && h.onPressCancel();
        h.onPanStart && h.onPanStart(start.x, start.y);
        // The distance consumed by the slop is delivered as the first delta,
        // so the content never jumps when the pan engages.
        h.onPan && h.onPan(x - start.x, y - start.y);
      }
    } else if (state === 'pan') {
      h.onPan && h.onPan(x - last.x, y - last.y);
    }
    last = { x, y, t };
    samples.push({ x, y, t });
    if (samples.length > 12) samples.shift();
  }

  function up(id, x, y, t) {
    const existed = pointers.delete(id);
    if (!existed) return;
    if (state === 'pinch') {
      if (pointers.size < 2) {
        h.onPinchEnd && h.onPinchEnd();
        // The remaining finger (if any) settles — it must not become a tap or
        // a surprise pan; the user lifts it in their own time.
        state = pointers.size === 1 ? 'settled' : 'idle';
      }
      return;
    }
    if (state === 'pan') {
      const { vx, vy } = velocity(t);
      state = 'idle';
      h.onPanEnd && h.onPanEnd(vx, vy);
      return;
    }
    if (state === 'pressed') {
      state = 'idle';
      h.onPressCancel && h.onPressCancel();
      // Tap: double-tap wins instantly; a single tap is emitted only after
      // the double-tap window passes (Photos-style — pressed feedback already
      // made the touch feel instant).
      if (lastTap && t - lastTap.t <= dblMs && Math.hypot(x - lastTap.x, y - lastTap.y) <= dblR) {
        flushTapTimer();
        lastTap = null;
        h.onDoubleTap && h.onDoubleTap(x, y);
      } else {
        lastTap = { x, y, t };
        flushTapTimer();
        tapTimer = setT(() => {
          tapTimer = null;
          h.onTap && h.onTap(x, y);
        }, dblMs);
      }
      return;
    }
    if (state === 'settled' && pointers.size === 0) state = 'idle';
  }

  function cancel() {
    pointers.clear();
    if (state === 'pressed') h.onPressCancel && h.onPressCancel();
    if (state === 'pan') h.onPanEnd && h.onPanEnd(0, 0);
    if (state === 'pinch') h.onPinchEnd && h.onPinchEnd();
    flushTapTimer();
    state = 'idle';
  }

  return { down, move, up, cancel, getState: () => state };
}

// Bind the arbiter to a DOM element via Pointer Events (mouse + touch + pen in
// one path). touch-action is the caller's job (the stage sets `none`).
export function attachGestures(el, handlers, opts) {
  const g = createGestures(handlers, opts);
  const down = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    el.setPointerCapture && el.setPointerCapture(e.pointerId);
    g.down(e.pointerId, e.clientX, e.clientY, e.timeStamp);
  };
  const move = (e) => g.move(e.pointerId, e.clientX, e.clientY, e.timeStamp);
  const up = (e) => g.up(e.pointerId, e.clientX, e.clientY, e.timeStamp);
  const cancel = () => g.cancel();
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);
  return {
    gestures: g,
    detach() {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
    },
  };
}
