// viewer/index.js — the Brochure Viewer shell: public API, chrome, data
// loading, and the wiring between the gesture-driven canvas (canvas.js), the
// product tap layer (hotspots.js), navigation (nav.js), the product sheet
// (sheet.js) and reading-position memory (state.js).
//
// Public API (unchanged from the old viewer, so no call site churns):
//   openBrochureViewer(b, storeName, opts)
//     opts.targetPageId     aggregator page id to open on (marketplace cards)
//     opts.targetPageIndex  source page index to open on (cart items)
//     opts.targetOfferId    offer to land on: page + fly-to + pulse + sheet
//   brochureDateLabel(b)
//
// Native-feel contract: the system BACK gesture closes the top layer (grid →
// sheet → viewer) instead of leaving the app — each layer is one history
// entry (layerHistory below). Reading position (page + zoom) persists per
// brochure for the session, so reopening lands where the user left.

import {
  loadBrochurePages,
  isPdfBrochure,
  pdfAssetUrl,
  loadHotspots,
  cleanOfferName,
} from '../brochure.js';
import { createPageCanvas } from './canvas.js';
import { createSpotLayer, spotForOffer } from './hotspots.js';
import { createNav } from './nav.js';
import { createSheet } from './sheet.js';
import { rememberPosition, recallPosition } from './state.js';

let viewerOpen = false;

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// A human date label for a brochure: its validity window if known, else edition.
export function brochureDateLabel(b) {
  const from = fmtDate(b.validFrom);
  const to = fmtDate(b.validTo);
  if (from && to) return `${from} – ${to}`;
  return from || to || b.edition || '';
}

// --- system-back integration -----------------------------------------------------
// One history entry per open layer. UI closes go THROUGH history.back() so the
// entry count always matches the layer count; popstate closes the top layer.
function createLayerHistory(onEmpty) {
  const layers = []; // close functions, bottom -> top
  let closingAll = false;
  const onPop = () => {
    const top = layers.pop();
    if (top) top();
    if (!layers.length) {
      window.removeEventListener('popstate', onPop);
      if (!closingAll) onEmpty && onEmpty();
    }
  };
  return {
    push(close) {
      if (!layers.length) window.addEventListener('popstate', onPop);
      layers.push(close);
      history.pushState({ vv: layers.length }, '');
    },
    // Close the top layer via the back stack (keeps history balanced).
    back() {
      if (layers.length) history.back();
    },
    // Close everything (the ✕ button): unwind every entry in one go.
    closeAll() {
      if (!layers.length) return;
      closingAll = true;
      window.removeEventListener('popstate', onPop);
      const depth = layers.length;
      while (layers.length) layers.pop()();
      history.go(-depth);
    },
    depth: () => layers.length,
  };
}

export function openBrochureViewer(b, storeName, opts = {}) {
  if (viewerOpen) return;
  viewerOpen = true;
  const restoreFocus = document.activeElement;
  const isPdf = isPdfBrochure(b);
  const targetPageId = opts.targetPageId != null ? String(opts.targetPageId) : null;
  const targetPageIndex = Number.isInteger(opts.targetPageIndex) ? opts.targetPageIndex : null;

  /* --- shell ----------------------------------------------------------------- */
  const overlay = document.createElement('div');
  overlay.className = 'vv-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', `${storeName} brochure`);
  overlay.innerHTML = `
    <header class="vv-head">
      <div class="vv-title">
        <span class="vv-store"></span>
        <span class="vv-date"></span>
      </div>
      <span class="vv-zoomctl">
        <button type="button" class="vv-zoom-out" aria-label="Zoom out">−</button>
        <button type="button" class="vv-zoom-in" aria-label="Zoom in">+</button>
      </span>
      <button type="button" class="vv-close" aria-label="Close brochure">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </header>
    <div class="vv-stage" tabindex="0" aria-label="Brochure pages">
      <div class="vv-loading"><span class="spinner" aria-hidden="true"></span> Loading brochure…</div>
    </div>
    <div class="vv-bottom"></div>`;
  const $$ = (sel) => overlay.querySelector(sel);
  $$('.vv-store').textContent = storeName;
  $$('.vv-date').textContent = [b.title, brochureDateLabel(b)].filter(Boolean).join(' · ');
  const stage = $$('.vv-stage');
  const bottom = $$('.vv-bottom');
  const closeBtn = $$('.vv-close');
  const zoomIn = $$('.vv-zoom-in');
  const zoomOut = $$('.vv-zoom-out');

  let canvas = null;
  let nav = null;
  let sheet = null;
  let hotspots = null; // { spotsByIndex, offers, note }
  let pageIndices = []; // per rendered page: its source index
  let pageSrcs = [];
  const spotLayers = new Map(); // rendered page i -> layer
  let hinted = false;
  const cleanups = [];

  const hist = createLayerHistory();

  const destroy = () => {
    viewerOpen = false;
    document.removeEventListener('keydown', onKey, true);
    for (const fn of cleanups) fn();
    if (canvas) {
      rememberPosition(b.id, { page: canvas.index(), zoom: Math.round(canvas.zoom() * 100) / 100 });
      canvas.destroy();
    }
    nav && nav.destroy();
    document.body.style.overflow = '';
    overlay.remove();
    if (restoreFocus && typeof restoreFocus.focus === 'function') restoreFocus.focus();
  };

  hist.push(destroy); // the viewer itself is the bottom history layer
  closeBtn.addEventListener('click', () => hist.closeAll());

  /* --- keyboard ----------------------------------------------------------------- */
  function trapTab(e) {
    const focusables = [...overlay.querySelectorAll('button, a[href], [tabindex="0"]')].filter(
      (el) => !el.disabled && !el.hidden && el.offsetParent !== null,
    );
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
  function onKey(e) {
    if (e.key === 'Escape') {
      // A native <dialog> (e.g. the watch-price dialog) owns Escape — it
      // closes itself; peeling a viewer layer too would double-close.
      if (document.querySelector('dialog[open]')) return;
      hist.back(); // peel the top layer, like system back
    }
    else if (e.key === 'Tab') trapTab(e);
    else if (!canvas) return;
    else if (e.key === 'ArrowLeft') canvas.goTo(canvas.index() - 1);
    else if (e.key === 'ArrowRight') canvas.goTo(canvas.index() + 1);
    else if (e.key === '+' || e.key === '=') zoomIn.click();
    else if (e.key === '-' || e.key === '_') zoomOut.click();
  }
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(overlay);
  closeBtn.focus();

  /* --- PDF branch ------------------------------------------------------------- */
  if (isPdf) {
    const url = pdfAssetUrl(b);
    $$('.vv-zoomctl').hidden = true;
    if (!url) {
      stage.innerHTML = '<div class="vv-msg">Sorry — this brochure could not be loaded.</div>';
      return;
    }
    const frame = document.createElement('iframe');
    frame.className = 'vv-pdf';
    frame.title = `${storeName} brochure PDF`;
    frame.src = url;
    stage.replaceChildren(frame);
    const open = document.createElement('a');
    open.className = 'vv-open-pdf';
    open.href = url;
    open.target = '_blank';
    open.rel = 'noopener';
    open.textContent = 'Open PDF ↗';
    bottom.appendChild(open);
    return;
  }

  /* --- chrome auto-hide --------------------------------------------------------- */
  const setChrome = (visible) => overlay.classList.toggle('is-chrome-hidden', !visible);
  const chromeVisible = () => !overlay.classList.contains('is-chrome-hidden');

  /* --- spot layers ---------------------------------------------------------------- */
  const spotLabel = (offer) =>
    `${cleanOfferName(offer.name) || cleanOfferName(offer.nameAr) || 'flyer product'} — ${offer.price} ${offer.currency || 'SAR'}`;

  function attachSpots(i, contentEl) {
    if (!hotspots || spotLayers.has(i)) return;
    const spots = hotspots.spotsByIndex.get(pageIndices[i]) || [];
    if (!spots.length) return;
    const layer = createSpotLayer(contentEl, spots, hotspots.offers, {
      labelOf: spotLabel,
      onActivate: (offer, spot) => openSheet({ offer, spot, pageSrc: pageSrcs[i] }),
    });
    spotLayers.set(i, layer);
    if (i === (canvas ? canvas.index() : 0) && !hinted) hintSpots(i);
  }

  function hintSpots(i) {
    const layer = spotLayers.get(i);
    if (!layer || hinted) return;
    hinted = true;
    layer.flash();
    const hint = document.createElement('div');
    hint.className = 'vv-hint';
    const n = layer.spots.length;
    hint.textContent = n === 1
      ? '1 product on this page — tap it for price & cart'
      : `${n} products on this page — tap one for price & cart`;
    stage.appendChild(hint);
    setTimeout(() => hint.remove(), 3500);
  }

  function openSheet(entry, opts = {}) {
    if (!sheet) return;
    const wasOpen = sheet.isOpen();
    sheet.open(entry, { detent: opts.detent || 'half' });
    if (!wasOpen) hist.push(() => sheet.close());
  }

  /* --- data ------------------------------------------------------------------------ */
  loadBrochurePages(b).then((data) => {
    if (!viewerOpen) return;
    if (!data || !data.pages.length) {
      stage.innerHTML = '<div class="vv-msg">Sorry — this brochure could not be loaded.</div>';
      return;
    }
    pageSrcs = data.pages;
    pageIndices = Array.isArray(data.indices) ? data.indices : data.pages.map((_, i) => i);

    // Opening page: explicit target (marketplace/cart deep-link) beats the
    // remembered reading position, which beats page 1.
    let startPage = 0;
    const remembered = recallPosition(b.id);
    if (remembered && remembered.page < data.pages.length) startPage = remembered.page;
    if (targetPageId && Array.isArray(data.pageIds)) {
      const found = data.pageIds.indexOf(targetPageId);
      if (found >= 0) startPage = found;
    }
    if (targetPageIndex != null) {
      const found = pageIndices.indexOf(targetPageIndex);
      if (found >= 0) startPage = found;
    }

    stage.querySelector('.vv-loading')?.remove();

    nav = createNav(bottom, data.pages.map((src) => ({ src })), {
      onJump: (i) => canvas && canvas.goTo(i),
    });
    bottom.append(nav.strip);
    overlay.insertBefore(nav.indicator, bottom);

    // The sheet controller (its own history layer via onOpen/onClose).
    let sheetLayerLive = false;
    sheet = createSheet(overlay, {
      brochure: b,
      currentSourceIndex: () => pageIndices[canvas ? canvas.index() : 0],
      onOpen: () => {
        sheetLayerLive = true;
      },
      onClose: () => {
        if (sheetLayerLive) {
          sheetLayerLive = false;
          stage.focus({ preventScroll: true });
        }
      },
    });

    canvas = createPageCanvas(stage, {
      pages: data.pages.map((src) => ({ src })),
      startPage,
      onPageChange: (i) => {
        nav.setPage(i);
        rememberPosition(b.id, { page: i, zoom: 1 });
        const layer = spotLayers.get(i);
        if (layer && !hinted) hintSpots(i);
      },
      onMountPage: (i, contentEl) => attachSpots(i, contentEl),
      onPress: (i, { fx, fy }) => {
        const layer = spotLayers.get(i);
        if (!layer) return;
        const s = layer.hit(fx, fy);
        if (s) layer.press(s);
      },
      onPressCancel: () => {
        const layer = spotLayers.get(canvas ? canvas.index() : 0);
        layer && layer.release();
      },
      onTap: (i, { fx, fy }) => {
        const layer = spotLayers.get(i);
        const s = layer && layer.hit(fx, fy);
        if (s && hotspots) {
          const offer = hotspots.offers[s.offerId];
          if (offer) {
            openSheet({ offer, spot: s, pageSrc: pageSrcs[i] });
            return;
          }
        }
        setChrome(!chromeVisible()); // empty tap: immersive toggle
      },
      onZoomChange: (z) => {
        zoomOut.disabled = z <= 1.01;
        zoomIn.disabled = z >= 3.99;
      },
    });
    nav.setPage(startPage);

    zoomIn.addEventListener('click', () => canvas.zoomTo(canvas.zoom() + 0.75));
    zoomOut.addEventListener('click', () => canvas.zoomTo(canvas.zoom() - 0.75));

    // Deep-linked product (Phase 3 orchestration entry point): land, fly, pulse.
    if (opts.targetOfferId != null) landOnOffer(String(opts.targetOfferId));
  });

  loadHotspots(b).then((data) => {
    if (!viewerOpen || !data) return;
    hotspots = data;
    if (canvas) {
      for (const i of [canvas.index(), canvas.index() - 1, canvas.index() + 1]) {
        const contentEl = canvas.contentEl(i);
        if (contentEl) attachSpots(i, contentEl);
      }
    }
    if (pendingOffer) landOnOffer(pendingOffer);
  });

  /* --- deep-linked product landing (the search hand-off) --------------------------- */
  // A search result taps straight through to ITS product: land on the page,
  // fly the view to the hotspot (biased above the incoming sheet), pulse it,
  // then open the product sheet at peek — the user never hunts the flyer.
  // Every step degrades gracefully: unknown offer -> stay on the page the
  // page-level deep-link chose; missing geometry -> no fly-to, no pulse.
  const SHEET_PEEK = 330; // keep in sync with sheet.js PEEK_PX
  let pendingOffer = null;
  function landOnOffer(offerId) {
    if (!canvas || !hotspots) {
      pendingOffer = offerId; // runs when the missing half arrives
      return;
    }
    pendingOffer = null;
    const found = spotForOffer(hotspots, offerId);
    if (!found) return;
    const rendered = pageIndices.indexOf(found.pageIndex);
    if (rendered < 0) return;
    canvas.goTo(rendered, { animate: false });
    nav.setPage(rendered);
    // The spot layer appears when the page image decodes — wait briefly for it
    // (bounded; the sequence still runs without the pulse if decoding stalls).
    let tries = 0;
    const tick = setInterval(() => {
      const layer = spotLayers.get(rendered);
      tries += 1;
      if (!viewerOpen) return clearInterval(tick);
      if (!layer && tries < 25) return;
      clearInterval(tick);
      canvas.centerOn(found.spot, { ms: 460, insetBottom: SHEET_PEEK });
      layer && layer.pulse(found.spot.offerId);
      const offer = hotspots.offers[found.spot.offerId];
      setTimeout(() => {
        if (!viewerOpen || !offer) return;
        openSheet({ offer, spot: found.spot, pageSrc: pageSrcs[rendered] }, { detent: 'peek' });
      }, 620);
    }, 90);
  }
}
