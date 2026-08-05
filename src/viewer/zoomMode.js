// viewer/zoomMode.js — "Zoom": an OPTIONAL phone reading layout for the
// brochure viewer. Normal mode is untouched; this is a layer the user turns on
// when a page's print is too small, and off the moment they want the whole
// page back.
//
// The layout: ONE product per screen, cropped and sized exactly like the
// enlarged image the product sheet already shows — because that is the
// readability the reader asked for. Swiping (or the edge chevrons) advances to
// the next product, continuing seamlessly into the next page at the end of a
// page. Products appear in the brochure's own order; nothing is re-sorted.
//
// Entering and leaving are symmetric: a press-and-hold on a product in the
// normal view opens Zoom AT that product, and a press-and-hold in here leaves.
//
// Crops are free: the frame holds the SAME page <img> the viewer already
// fetched, sized and offset by paneFit() so the hotspot exactly fills it. No
// canvas, no second download, compositor-only movement — the same discipline
// as canvas.js. The frame is sized to the CROP, never to the screen, so no
// part of a neighbouring product can appear at the edges.
//
// What a screen shows is the flyer itself. Tapping it opens the existing
// product sheet (price, cart, comparison), so nothing downstream changes.

import { attachGestures } from './gestures.js';
import { paneFit } from './transform.js';
import { discountDot } from '../discountStatus.js';

const PER_SCREEN = 1;
const FLICK_V = 0.45; // px/ms — matches the canvas page-turn threshold
const REDUCED =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const SLIDE_MS = REDUCED ? 1 : 260;
const easeOut = (p) => 1 - Math.pow(1 - p, 3);

// The flat product sequence Zoom reads through: every hotspot that has an
// offer, in page order and — within a page — in the order the aggregator
// listed it. Deliberately NOT re-sorted: the brochure's own order is the one
// the shopper sees in normal mode.
export function buildSequence({ pageIndices, pageSrcs, spotsByIndex, offers }) {
  const out = [];
  if (!Array.isArray(pageIndices) || !spotsByIndex) return out;
  pageIndices.forEach((sourceIndex, page) => {
    for (const spot of spotsByIndex.get(sourceIndex) || []) {
      const offer = offers && offers[spot.offerId];
      if (offer) out.push({ page, spot, offer, src: pageSrcs[page] });
    }
  });
  return out;
}

// Where Zoom should open. `targetSpot` is the product a press-and-hold landed
// on: reading starts THERE, which is the entire point of the hold. Without one
// (the Zoom button) reading starts at the top of the current page. Returns -1
// when the page has no products at all, which is the caller's cue not to open.
export function startIndexFor(entries, page, targetSpot) {
  if (!Array.isArray(entries)) return -1;
  const pageStart = entries.findIndex((e) => e.page === page);
  if (!targetSpot || targetSpot.offerId == null) return pageStart;
  const at = entries.findIndex(
    (e) => e.page === page && String(e.spot.offerId) === String(targetSpot.offerId),
  );
  return at >= 0 ? at : pageStart; // an unknown product falls back to the page
}

export function createZoomMode(host, opts = {}) {
  const {
    entries = [],
    startIndex = 0,
    labelOf = () => '',
    onOpenProduct = () => {},
    onPageChange = () => {},
    onIndexChange = () => {},
    onExitRequest = () => {},
  } = opts;
  if (!entries.length) return null;

  const pairCount = Math.ceil(entries.length / PER_SCREEN);
  let pair = Math.max(0, Math.min(pairCount - 1, Math.floor(startIndex / PER_SCREEN)));
  let hostW = 1;
  let trackX = 0;
  let raf = null;
  let destroyed = false;
  let lastPage = -1;

  const el = document.createElement('div');
  el.className = 'vz';
  el.style.touchAction = 'none';
  const track = document.createElement('div');
  track.className = 'vz-track';
  el.appendChild(track);

  const slots = new Map(); // pair index -> { el, panes: [{ el, img, entry, aspect }] }
  const aspects = new Map(); // page src -> natural w/h

  /* --- layout ------------------------------------------------------------------ */
  const measure = () => {
    hostW = Math.max(1, el.clientWidth);
  };

  function layoutPane(p) {
    const aspect = aspects.get(p.entry.src);
    if (!aspect) return;
    const w = p.el.clientWidth;
    const h = p.el.clientHeight;
    if (!w || !h) return;
    const box = paneFit(p.entry.spot, w, h, aspect);
    p.frame.style.width = `${box.frameW}px`;
    p.frame.style.height = `${box.frameH}px`;
    p.img.style.width = `${box.imgW}px`;
    p.img.style.height = `${box.imgH}px`;
    p.img.style.transform = `translate3d(${box.imgLeft}px, ${box.imgTop}px, 0)`;
    p.img.classList.add('is-ready');
  }

  const layoutAll = () => {
    for (const slot of slots.values()) for (const p of slot.panes) layoutPane(p);
  };

  /* --- mounting ------------------------------------------------------------------ */
  function mount(k) {
    if (k < 0 || k >= pairCount || slots.has(k)) return;
    const slotEl = document.createElement('div');
    slotEl.className = 'vz-slot';
    slotEl.style.transform = `translate3d(${k * 100}%, 0, 0)`;
    const panes = [];
    for (let n = 0; n < PER_SCREEN; n += 1) {
      const entry = entries[k * PER_SCREEN + n];
      if (!entry) break;
      // A real <button> for keyboard/screen-reader users; pointer-events stay
      // off so the gesture arbiter alone decides what a touch means (the same
      // split hotspots.js uses — a swipe can never be mistaken for a tap).
      const paneEl = document.createElement('button');
      paneEl.type = 'button';
      paneEl.className = 'vz-pane';
      paneEl.setAttribute('aria-label', labelOf(entry.offer));
      const discountIndicator = discountDot(entry.offer);
      if (discountIndicator) paneEl.appendChild(discountIndicator);
      paneEl.addEventListener('click', () => onOpenProduct(entry)); // keyboard path
      // The frame is the crop's own window; the page image is offset inside it.
      const frame = document.createElement('span');
      frame.className = 'vz-frame';
      const img = document.createElement('img');
      img.className = 'vz-img';
      img.alt = '';
      img.decoding = 'async';
      img.draggable = false;
      frame.appendChild(img);
      paneEl.appendChild(frame);
      slotEl.appendChild(paneEl);
      const p = { el: paneEl, frame, img, entry };
      panes.push(p);
      const ready = () => {
        if (destroyed) return;
        if (!aspects.has(entry.src)) {
          aspects.set(entry.src, (img.naturalWidth || 1060) / (img.naturalHeight || 1500));
        }
        layoutPane(p);
      };
      img.src = entry.src;
      if (img.complete && img.naturalWidth) ready();
      else img.addEventListener('load', ready, { once: true });
    }
    track.appendChild(slotEl);
    slots.set(k, { el: slotEl, panes });
    for (const p of panes) layoutPane(p); // no-op until the pane has a box
  }

  function syncWindow() {
    for (const k of [...slots.keys()]) {
      if (Math.abs(k - pair) > 1) {
        slots.get(k).el.remove();
        slots.delete(k);
      }
    }
    for (const k of [pair, pair - 1, pair + 1]) mount(k);
  }

  /* --- paging ---------------------------------------------------------------------- */
  const paintTrack = () => {
    track.style.transform = `translate3d(${trackX}px, 0, 0)`;
  };

  function stopAnim() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }

  function animateTrack(toX, ms, done) {
    stopAnim();
    const from = trackX;
    const t0 = performance.now();
    const tick = (now) => {
      if (destroyed) return;
      const p = easeOut(Math.min(1, (now - t0) / ms));
      trackX = from + (toX - from) * p;
      paintTrack();
      if (p < 1) raf = requestAnimationFrame(tick);
      else {
        raf = null;
        done && done();
      }
    };
    raf = requestAnimationFrame(tick);
  }

  // The page the top pane of the current pair belongs to — Zoom crossing a page
  // boundary keeps the viewer underneath (and its page indicator) in step.
  function reportPage() {
    const first = entries[pair * PER_SCREEN];
    if (first && first.page !== lastPage) {
      lastPage = first.page;
      onPageChange(first.page);
    }
    onIndexChange(pair * PER_SCREEN);
  }

  function goToPair(k, { animate = true } = {}) {
    const target = Math.max(0, Math.min(pairCount - 1, k));
    pair = target;
    syncWindow();
    updateChevrons();
    // Report on COMMIT, not when the slide finishes: the page indicator and
    // the viewer underneath should track the move immediately, and they must
    // not depend on an animation frame ever arriving.
    reportPage();
    const toX = -pair * hostW;
    if (animate) animateTrack(toX, SLIDE_MS);
    else {
      stopAnim();
      trackX = toX;
      paintTrack();
    }
  }

  /* --- chevrons -------------------------------------------------------------------- */
  const chev = (dir, label) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `vz-chev vz-chev-${dir}`;
    b.setAttribute('aria-label', label);
    b.innerHTML =
      `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${
        dir === 'prev' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'
      }"/></svg>`;
    b.addEventListener('click', () => goToPair(pair + (dir === 'prev' ? -1 : 1)));
    // The arbiter is bound to the whole layer, so a chevron press would ALSO
    // read as a tap and open a product sheet. Keep its pointers to itself.
    for (const type of ['pointerdown', 'pointerup', 'pointermove']) {
      b.addEventListener(type, (e) => e.stopPropagation());
    }
    return b;
  };
  const prevBtn = chev('prev', opts.prevLabel || 'Previous products');
  const nextBtn = chev('next', opts.nextLabel || 'Next products');
  el.append(prevBtn, nextBtn);
  function updateChevrons() {
    prevBtn.disabled = pair <= 0;
    nextBtn.disabled = pair >= pairCount - 1;
  }

  /* --- gestures ---------------------------------------------------------------------- */
  // Horizontal only: a swipe moves through products, a tap opens the sheet.
  // Vertical drags do nothing — the two panes are the whole screen, so there is
  // nowhere to scroll and pull-to-dismiss would fight the pane taps.
  let axis = null;
  const { detach } = attachGestures(el, {
    onPress() {
      stopAnim();
    },
    onTap() {
      const entry = entries[pair * PER_SCREEN];
      if (entry) onOpenProduct(entry);
    },
    // Hold got you in; hold gets you out. The same gesture reverses itself, so
    // the reader never has to find the button again to leave.
    onLongPress() {
      onExitRequest();
    },
    onPanStart() {
      axis = null;
    },
    onPan(dx, dy) {
      if (axis == null) axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
      if (axis !== 'x') return;
      let x = trackX + dx;
      const min = -(pairCount - 1) * hostW;
      if (x > 0) x *= 0.35; // rubber at the first pair…
      if (x < min) x = min + (x - min) * 0.35; // …and the last
      trackX = x;
      paintTrack();
    },
    onPanEnd(vx) {
      if (axis !== 'x') {
        axis = null;
        return;
      }
      axis = null;
      const drag = trackX + pair * hostW;
      let target = pair;
      if (drag < -hostW * 0.3 || vx < -FLICK_V) target = pair + 1;
      else if (drag > hostW * 0.3 || vx > FLICK_V) target = pair - 1;
      target = Math.max(0, Math.min(pairCount - 1, target));
      if (target !== pair) goToPair(target);
      else animateTrack(-pair * hostW, SLIDE_MS);
    },
  });

  const onResize = () => {
    measure();
    trackX = -pair * hostW;
    paintTrack();
    layoutAll();
  };
  // Panes are laid out when their BOX is known, not on a guessed frame: a
  // freshly mounted pane has no size yet, and a cached page image resolves
  // synchronously — so neither the load event nor a single rAF is a reliable
  // moment to measure. The observer fires once on attach and again on every
  // rotation or chrome change, which covers all of it.
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null;
  if (ro) ro.observe(el);
  window.addEventListener('resize', onResize); // fallback where RO is missing

  /* --- boot ------------------------------------------------------------------------- */
  host.appendChild(el);
  measure();
  trackX = -pair * hostW;
  paintTrack();
  syncWindow();
  updateChevrons();
  reportPage();

  return {
    el,
    next: () => goToPair(pair + 1),
    prev: () => goToPair(pair - 1),
    // Jump to the first product of a rendered page (the overview grid's
    // "go to page N" while Zoom is on). No-op for a page with no products.
    goToPage(page) {
      const at = entries.findIndex((e) => e.page === page);
      if (at >= 0) goToPair(Math.floor(at / PER_SCREEN), { animate: false });
    },
    currentEntry: () => entries[pair * PER_SCREEN] || null,
    destroy() {
      destroyed = true;
      el.remove(); // first: nothing below may stay covered if a later step throws
      stopAnim();
      detach();
      if (ro) ro.disconnect();
      window.removeEventListener('resize', onResize);
    },
  };
}
