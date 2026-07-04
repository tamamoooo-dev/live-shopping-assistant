// viewer.js — the in-app brochure viewer, shared by the Search and Brochures
// pages. A full-screen modal that pages through a brochure's images (served
// THROUGH the Brochure Engine's /asset) or embeds a stored PDF. The user never
// leaves the app, and nothing ever loads from the external aggregator.
//
// Features: prev/next (buttons, ◀/▶ keys, swipe), page counter, zoom (1×–3×,
// buttons + +/- keys; pans when zoomed), next/prev page preloading, store name
// + validity dates in the header, focus trap + focus restore, Esc/backdrop/✕
// close, background scroll lock. PDF brochures (e.g. Othaim) render in an
// embedded frame with an open-in-tab fallback.
//
// TAPPABLE PRODUCTS (the ClickFlyer-style experience): for aggregator
// brochures the engine serves per-product tap boxes (loadHotspots) aligned to
// each page by its source index. The viewer overlays them on the page image;
// tapping one opens a PRODUCT SHEET — the product's own flyer crop zoomed in,
// bilingual name, price/was-price, validity, Add to Cart, and a strip of
// similar current flyer offers (reusing the /offers search). Closing the sheet
// lands back on the exact page & zoom the user left — the viewer never resets.

import {
  loadBrochurePages,
  isPdfBrochure,
  pdfAssetUrl,
  loadHotspots,
  searchOffers,
  storeLabel,
  storeColor,
  cleanOfferName,
} from './brochure.js';
import { addToCart, inCart } from './cart.js';

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

// opts.targetPageId — the aggregator page id a flyer offer deep-links to. When
// the loaded brochure has a page carrying that id, the viewer OPENS on it (so a
// tapped flyer offer lands on its own page, not page 1). Falls back to page 1
// when the id is unknown (e.g. an edition ingested before page-id capture).
// opts.targetPageIndex — same idea keyed by the page's SOURCE index (what the
// cart snapshots), used by "View flyer" on a cart item.
export function openBrochureViewer(b, storeName, opts = {}) {
  if (viewerOpen) return;
  viewerOpen = true;
  const restoreFocus = document.activeElement;
  const isPdf = isPdfBrochure(b);
  const targetPageId = opts && opts.targetPageId != null ? String(opts.targetPageId) : null;
  const targetPageIndex = opts && Number.isInteger(opts.targetPageIndex) ? opts.targetPageIndex : null;

  const overlay = document.createElement('div');
  overlay.className = 'bv-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', `${storeName} brochure`);
  overlay.innerHTML = `
    <div class="bv-panel">
      <header class="bv-head">
        <div class="bv-title">
          <span class="bv-store"></span>
          <span class="bv-date"></span>
        </div>
        <button type="button" class="bv-close" aria-label="Close brochure">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </header>
      <div class="bv-stage" tabindex="0"><div class="bv-msg"><span class="spinner" aria-hidden="true"></span> Loading brochure…</div></div>
      <footer class="bv-controls">
        <button type="button" class="bv-prev" aria-label="Previous page">‹ Prev</button>
        <span class="bv-counter" aria-live="polite">—</span>
        <button type="button" class="bv-next" aria-label="Next page">Next ›</button>
        <span class="bv-zoom">
          <button type="button" class="bv-zoom-out" aria-label="Zoom out">−</button>
          <button type="button" class="bv-zoom-in" aria-label="Zoom in">+</button>
        </span>
      </footer>
    </div>`;

  const $$ = (sel) => overlay.querySelector(sel);
  $$('.bv-store').textContent = storeName;
  $$('.bv-date').textContent = [b.title, brochureDateLabel(b)].filter(Boolean).join(' · ');
  const stage = $$('.bv-stage');
  const counter = $$('.bv-counter');
  const prevBtn = $$('.bv-prev');
  const nextBtn = $$('.bv-next');
  const zoomInBtn = $$('.bv-zoom-in');
  const zoomOutBtn = $$('.bv-zoom-out');
  const closeBtn = $$('.bv-close');

  let idx = 0;
  let zoom = 1;
  let pages = [];
  let pageIndices = []; // aligned with pages[]: each page's source index
  let hotspots = null; // { spotsByIndex, offers, note } | null
  let sheetCloser = null; // set while the product sheet is open
  const MAX_ZOOM = 3;

  const cleanups = []; // listeners registered later (e.g. window resize)
  const close = () => {
    viewerOpen = false;
    document.removeEventListener('keydown', onKey, true);
    for (const fn of cleanups) fn();
    document.body.style.overflow = '';
    overlay.remove();
    if (restoreFocus && typeof restoreFocus.focus === 'function') restoreFocus.focus();
  };
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close(); // click the backdrop to dismiss
  });

  // Keep Tab inside the dialog (simple focus trap over the visible controls).
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
    // The product sheet is a layer above the pages: Esc peels it first.
    if (e.key === 'Escape') {
      if (sheetCloser) sheetCloser();
      else close();
    }
    else if (e.key === 'Tab') trapTab(e);
    else if (isPdf) return; // paging/zoom keys only apply to image brochures
    else if (e.key === 'ArrowLeft') go(idx - 1);
    else if (e.key === 'ArrowRight') go(idx + 1);
    else if (e.key === '+' || e.key === '=') zoomInBtn.click();
    else if (e.key === '-' || e.key === '_') zoomOutBtn.click();
  }

  document.body.style.overflow = 'hidden'; // lock background scroll
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(overlay);
  closeBtn.focus();

  // --- PDF branch (e.g. Othaim's official weekly PDF, stored by the engine) --
  if (isPdf) {
    const url = pdfAssetUrl(b);
    prevBtn.hidden = true;
    nextBtn.hidden = true;
    zoomInBtn.parentElement.hidden = true;
    if (!url) {
      counter.textContent = '';
      stage.innerHTML = '<div class="bv-msg">Sorry — this brochure could not be loaded.</div>';
      return;
    }
    const frame = document.createElement('iframe');
    frame.className = 'bv-pdf';
    frame.title = `${storeName} brochure PDF`;
    frame.src = url;
    stage.replaceChildren(frame);
    const open = document.createElement('a');
    open.className = 'bv-open-pdf';
    open.href = url;
    open.target = '_blank';
    open.rel = 'noopener';
    open.textContent = 'Open PDF ↗';
    counter.replaceWith(open);
    return;
  }

  // --- image branch ----------------------------------------------------------
  // The page image lives inside a positioned wrapper the exact size of the
  // rendered image, so hotspot boxes (percent-of-page fractions) stay glued to
  // their products at ANY zoom level. The wrapper is sized in JS from the
  // image's natural dimensions (fit-to-stage × zoom) — deterministic, and the
  // one source of truth for both the image and its overlay.
  const wrap = document.createElement('div');
  wrap.className = 'bv-imgwrap';
  const img = document.createElement('img');
  img.className = 'bv-img';
  img.alt = `${storeName} brochure page`;
  const spotLayer = document.createElement('div');
  spotLayer.className = 'bv-spots';
  wrap.append(img, spotLayer);

  const layout = () => {
    if (!img.naturalWidth || !img.naturalHeight) return;
    const availW = Math.max(1, stage.clientWidth - 24); // stage padding 12px×2
    const availH = Math.max(1, stage.clientHeight - 24);
    let scale = Math.min(availW / img.naturalWidth, availH / img.naturalHeight);
    if (zoom <= 1) scale = Math.min(scale, 1); // never upscale past natural at 1×
    else scale *= zoom;
    wrap.style.width = `${Math.round(img.naturalWidth * scale)}px`;
    wrap.style.height = `${Math.round(img.naturalHeight * scale)}px`;
  };
  img.addEventListener('load', layout);
  window.addEventListener('resize', layout);
  cleanups.push(() => window.removeEventListener('resize', layout));

  const applyZoom = () => {
    layout();
    zoomOutBtn.disabled = zoom <= 1;
    zoomInBtn.disabled = zoom >= MAX_ZOOM;
  };

  // The current page's product tap targets. Percent-positioned inside the
  // wrapper, so they cost nothing on zoom/resize. Pages without hotspot data
  // (older editions, non-aggregator flyers) simply render no overlay.
  const renderSpots = () => {
    spotLayer.replaceChildren();
    if (!hotspots) return;
    const spots = hotspots.spotsByIndex.get(pageIndices[idx]) || [];
    for (const s of spots) {
      const offer = hotspots.offers[s.offerId];
      if (!offer) continue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bv-spot';
      btn.style.left = `${s.x * 100}%`;
      btn.style.top = `${s.y * 100}%`;
      btn.style.width = `${s.w * 100}%`;
      btn.style.height = `${s.h * 100}%`;
      const label = cleanOfferName(offer.name) || cleanOfferName(offer.nameAr) || 'flyer product';
      btn.setAttribute('aria-label', `${label} — ${offer.price} ${offer.currency || 'SAR'}`);
      btn.addEventListener('click', () => openProductSheet(offer));
      spotLayer.appendChild(btn);
    }
    // A first-page flash so the tappability is discoverable without cluttering
    // the flyer art; afterwards the subtle dots alone carry the affordance.
    if (spots.length && !overlay.dataset.spotsHinted) {
      overlay.dataset.spotsHinted = '1';
      spotLayer.classList.add('bv-spots-flash');
      setTimeout(() => spotLayer.classList.remove('bv-spots-flash'), 1600);
      showHint(`${spots.length} products on this page — tap one for price & cart`);
    }
  };

  let hintTimer = null;
  const showHint = (text) => {
    const hint = document.createElement('div');
    hint.className = 'bv-hint';
    hint.textContent = text;
    stage.appendChild(hint);
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hint.remove(), 3500);
  };

  const preload = (n) => {
    if (n >= 0 && n < pages.length) {
      const pre = new Image();
      pre.src = pages[n];
    }
  };

  const render = () => {
    img.src = pages[idx];
    zoom = 1;
    applyZoom();
    stage.scrollTop = 0;
    stage.scrollLeft = 0;
    counter.textContent = `${idx + 1} / ${pages.length}`;
    prevBtn.disabled = idx === 0;
    nextBtn.disabled = idx === pages.length - 1;
    renderSpots();
    preload(idx + 1); // keep paging instant
    preload(idx - 1);
  };

  // --- product sheet (tap a hotspot -> zoomed detail + Add to Cart) ----------
  // A layer INSIDE the viewer overlay: closing it restores the flyer exactly
  // as left (page, zoom, scroll — none of them are touched). Tapping a similar
  // product re-renders the sheet for THAT offer, with ‹ back retracing steps.
  const sheetStack = [];
  function openProductSheet(offer, { push = true } = {}) {
    if (push) sheetStack.push(offer);
    let sheet = overlay.querySelector('.ps-sheet');
    if (!sheet) {
      // Scrim under the sheet: dims the flyer, absorbs stray taps (no
      // accidental hotspot hits behind the sheet), and tap-to-close.
      const scrim = document.createElement('div');
      scrim.className = 'ps-scrim';
      scrim.addEventListener('click', closeSheet);
      overlay.appendChild(scrim);
      sheet = document.createElement('div');
      sheet.className = 'ps-sheet';
      sheet.setAttribute('role', 'dialog');
      sheet.setAttribute('aria-label', 'Product details');
      overlay.appendChild(sheet);
      wireSheetDrag(sheet);
      sheetCloser = closeSheet;
    }
    renderSheet(sheet, offer);
    const closeBtnEl = sheet.querySelector('.ps-close');
    if (closeBtnEl) closeBtnEl.focus({ preventScroll: true });
  }

  function closeSheet() {
    const sheet = overlay.querySelector('.ps-sheet');
    if (sheet) sheet.remove();
    const scrim = overlay.querySelector('.ps-scrim');
    if (scrim) scrim.remove();
    sheetStack.length = 0;
    sheetCloser = null;
    stage.focus({ preventScroll: true });
  }

  // Swipe-down-to-dismiss, phone bottom-sheet style. The drag lives on the
  // sheet but only ARMS when it starts on the grab handle / header, or when
  // the body is scrolled to the top — so it never fights the body's scroll.
  function wireSheetDrag(sheet) {
    let startY = null;
    let dragging = false;
    sheet.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      const body = sheet.querySelector('.ps-body');
      const onHandle = e.target.closest('.ps-grab, .ps-head');
      if (!onHandle && !(body && body.scrollTop <= 0)) return;
      startY = e.touches[0].clientY;
      dragging = false;
    }, { passive: true });
    sheet.addEventListener('touchmove', (e) => {
      if (startY == null) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0 && !dragging) { startY = null; return; } // scrolling up: not a dismiss
      dragging = true;
      sheet.style.transition = 'none';
      sheet.style.transform = `translateY(${Math.max(0, dy)}px)`;
      if (dy > 0) e.preventDefault();
    }, { passive: false });
    sheet.addEventListener('touchend', (e) => {
      if (startY == null) return;
      const dy = e.changedTouches[0].clientY - startY;
      startY = null;
      if (!dragging) return;
      sheet.style.transition = '';
      if (dy > 90) closeSheet();
      else sheet.style.transform = ''; // snap back
    }, { passive: true });
  }

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) =>
      c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
    );

  function renderSheet(sheet, offer) {
    const discount =
      offer.oldPrice && offer.oldPrice > offer.price
        ? Math.round(((offer.oldPrice - offer.price) / offer.oldPrice) * 100)
        : null;
    const fmt = (n) => (Number.isInteger(n) ? String(n) : Number(n).toFixed(2));
    // Honest validity: some in-flyer promos end before the flyer does.
    const todayYMD = new Date().toISOString().slice(0, 10);
    const ended = !!(offer.validTo && offer.validTo < todayYMD);
    const until = offer.validTo ? `${ended ? 'ended' : 'until'} ${fmtDate(offer.validTo)}` : '';
    const name = cleanOfferName(offer.name);
    const nameAr = cleanOfferName(offer.nameAr);
    const title = name || nameAr || 'Flyer product';
    sheet.innerHTML = `
      <div class="ps-grab" aria-hidden="true"></div>
      <header class="ps-head">
        <button type="button" class="ps-back" ${sheetStack.length > 1 ? '' : 'hidden'} aria-label="Back to previous product">‹</button>
        <span class="ps-store" style="--chip:${storeColor(offer.store)}">${esc(storeLabel(offer.store))}</span>
        ${until ? `<span class="ps-until${ended ? ' is-ended' : ''}">${esc(until)}</span>` : ''}
        <button type="button" class="ps-close" aria-label="Back to brochure">✕</button>
      </header>
      <div class="ps-body">
        <div class="ps-imgbox">${
          offer.imageUrl
            ? `<img class="ps-img" src="${esc(offer.imageUrl)}" alt="${esc(title)}">`
            : '<div class="ps-noimg" aria-hidden="true">🛒</div>'
        }</div>
        <h3 class="ps-name" dir="auto">${esc(title)}</h3>
        ${name && nameAr ? `<p class="ps-name-ar" dir="rtl">${esc(nameAr)}</p>` : ''}
        <div class="ps-pricerow">
          <span class="ps-price">${fmt(offer.price)} <small>${esc(offer.currency || 'SAR')}</small></span>
          ${offer.oldPrice ? `<span class="ps-old">${fmt(offer.oldPrice)}</span>` : ''}
          ${discount ? `<span class="ps-off">−${discount}%</span>` : ''}
        </div>
        <button type="button" class="ps-add">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="20" r="1.6"/><circle cx="17" cy="20" r="1.6"/><path d="M3 4h2.2l2.4 11.2a1.6 1.6 0 0 0 1.6 1.3h7.9a1.6 1.6 0 0 0 1.6-1.3L20.5 8H6"/></svg>
          <span>${inCart(offer.id) ? 'Add again' : 'Add to Cart'}</span>
        </button>
        <p class="ps-note">Flyer price, machine-extracted — the printed flyer prevails.
          ${offer.sourceUrl ? `<a href="${esc(offer.sourceUrl)}" target="_blank" rel="noopener">Verify ↗</a>` : ''}</p>
        <div class="ps-related" hidden>
          <h4>Similar offers this week</h4>
          <div class="ps-rel-strip"></div>
        </div>
      </div>`;

    sheet.querySelector('.ps-close').addEventListener('click', closeSheet);
    const backBtn = sheet.querySelector('.ps-back');
    if (backBtn && !backBtn.hidden) {
      backBtn.addEventListener('click', () => {
        sheetStack.pop();
        const prev = sheetStack[sheetStack.length - 1];
        if (prev) openProductSheet(prev, { push: false });
        else closeSheet();
      });
    }

    const addBtn = sheet.querySelector('.ps-add');
    addBtn.addEventListener('click', () => {
      addToCart({
        id: offer.id,
        store: offer.store,
        name,
        nameAr,
        price: offer.price,
        oldPrice: offer.oldPrice,
        currency: offer.currency || 'SAR',
        image: offer.imageUrl,
        sourceUrl: offer.sourceUrl,
        brochureId: b.id,
        pageIndex: pageIndices[idx],
        validTo: offer.validTo,
      });
      addBtn.classList.add('is-added');
      addBtn.querySelector('span').textContent = 'Added to cart ✓';
      setTimeout(() => {
        if (!addBtn.isConnected) return;
        addBtn.classList.remove('is-added');
        const span = addBtn.querySelector('span');
        if (span) span.textContent = 'Add again';
      }, 1300);
    });

    loadRelated(sheet, offer);
  }

  // Similar products = the engine's own bilingual offers search, seeded with
  // the product's derived name (cross-store by design: the same product on
  // offer elsewhere this week, possibly cheaper). Best-effort — no results
  // just leaves the strip hidden. The tapped offer itself is excluded.
  async function loadRelated(sheet, offer) {
    const seed = relatedQuery(offer);
    if (!seed) return;
    const data = await searchOffers(seed, 12);
    const box = sheet.querySelector('.ps-related');
    const strip = sheet.querySelector('.ps-rel-strip');
    if (!data || !box || !strip || !sheet.isConnected) return;
    const rel = (data.offers || []).filter((o) => o.id !== offer.id).slice(0, 10);
    if (!rel.length) return;
    strip.replaceChildren(
      ...rel.map((o) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'ps-rel-card';
        card.innerHTML = `
          ${o.imageUrl ? `<img src="${esc(o.imageUrl)}" alt="" loading="lazy">` : '<div class="ps-rel-noimg" aria-hidden="true">🛒</div>'}
          <span class="ps-rel-price">${o.price} <small>${esc(o.currency || 'SAR')}</small></span>
          <span class="ps-rel-store" style="--chip:${storeColor(o.store)}">${esc(storeLabel(o.store))}</span>
          <span class="ps-rel-name" dir="auto">${esc(cleanOfferName(o.name) || cleanOfferName(o.nameAr) || '')}</span>`;
        card.addEventListener('click', () => openProductSheet(o));
        return card;
      }),
    );
    box.hidden = false;
  }

  // Seed for the similar-products search: the most name-like tokens we hold.
  // Prefer the English derived name, fall back to Arabic, then the category
  // slug. Sizes/numbers are dropped so "abu zahra sunflower oil 1.5l" seeds
  // "abu zahra sunflower" — wide enough to catch other sizes and brands' rows.
  function relatedQuery(offer) {
    const base = cleanOfferName(offer.name) || cleanOfferName(offer.nameAr) || '';
    const tokens = base
      .split(/\s+/)
      .filter((t) => t && !/^\d/.test(t) && t.length > 2)
      .slice(0, 3);
    if (tokens.length) return tokens.join(' ');
    return offer.category ? offer.category.replace(/-/g, ' ') : null;
  }

  function go(n) {
    const next = Math.min(pages.length - 1, Math.max(0, n));
    if (next !== idx) {
      idx = next;
      render();
    }
  }

  prevBtn.addEventListener('click', () => go(idx - 1));
  nextBtn.addEventListener('click', () => go(idx + 1));
  zoomInBtn.addEventListener('click', () => {
    zoom = Math.min(MAX_ZOOM, zoom + 0.5);
    applyZoom();
  });
  zoomOutBtn.addEventListener('click', () => {
    zoom = Math.max(1, zoom - 0.5);
    applyZoom();
  });

  // --- touch gestures ---------------------------------------------------------
  // Swipe pages when not zoomed; PINCH to zoom continuously; DOUBLE-TAP to
  // toggle 1×↔2× at the tap point. Zoom re-sizes the wrapper (layout()), so
  // after each zoom step the stage scroll is adjusted to keep the gesture's
  // focal point stationary — the phone-native brochure feel. The stage's CSS
  // touch-action (pan-x pan-y) leaves pinch + double-tap to us while native
  // panning keeps working.
  let touchX = null;
  let touchY = null;
  let pinchDist = 0; // >0 while a pinch is in progress
  let pinchZoom = 1;
  let pinched = false; // suppress the page-swipe after a pinch ends
  let lastTap = { t: 0, x: 0, y: 0 };

  // Zoom to `z` keeping the stage point under (cx, cy) — client coords — fixed.
  const zoomAt = (z, cx, cy) => {
    const rect = stage.getBoundingClientRect();
    const px = (stage.scrollLeft + (cx - rect.left)) / Math.max(1, wrap.offsetWidth);
    const py = (stage.scrollTop + (cy - rect.top)) / Math.max(1, wrap.offsetHeight);
    zoom = Math.min(MAX_ZOOM, Math.max(1, z));
    applyZoom();
    stage.scrollLeft = px * wrap.offsetWidth - (cx - rect.left);
    stage.scrollTop = py * wrap.offsetHeight - (cy - rect.top);
  };

  stage.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      const [a, b2] = e.touches;
      pinchDist = Math.hypot(a.clientX - b2.clientX, a.clientY - b2.clientY);
      pinchZoom = zoom;
      pinched = true;
      touchX = touchY = null;
      return;
    }
    if (e.touches.length !== 1) return;
    pinched = false;
    touchX = e.touches[0].clientX;
    touchY = e.touches[0].clientY;
  }, { passive: true });

  stage.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 2 || !pinchDist) return;
    e.preventDefault(); // keep the browser from zooming the whole page
    const [a, b2] = e.touches;
    const dist = Math.hypot(a.clientX - b2.clientX, a.clientY - b2.clientY);
    zoomAt(
      pinchZoom * (dist / pinchDist),
      (a.clientX + b2.clientX) / 2,
      (a.clientY + b2.clientY) / 2,
    );
  }, { passive: false });

  stage.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) pinchDist = 0;
    if (pinched || touchX == null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchX;
    const dy = t.clientY - touchY;
    const moved = Math.hypot(dx, dy);
    // Double-tap: two quick, close, movement-free taps toggle the zoom.
    if (moved < 12) {
      const now = Date.now();
      if (now - lastTap.t < 320 && Math.hypot(t.clientX - lastTap.x, t.clientY - lastTap.y) < 40) {
        zoomAt(zoom > 1 ? 1 : 2, t.clientX, t.clientY);
        lastTap.t = 0;
      } else {
        lastTap = { t: now, x: t.clientX, y: t.clientY };
      }
    } else if (zoom <= 1 && Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      go(idx + (dx < 0 ? 1 : -1));
    }
    touchX = touchY = null;
  }, { passive: true });

  // Fetch the page images (through the engine). Best-effort. Hotspots load in
  // parallel and attach when ready — the flyer never waits for them.
  loadBrochurePages(b).then((data) => {
    if (!viewerOpen) return; // closed while loading
    if (!data || !data.pages.length) {
      stage.innerHTML = '<div class="bv-msg">Sorry — this brochure could not be loaded.</div>';
      return;
    }
    pages = data.pages;
    pageIndices = Array.isArray(data.indices) ? data.indices : pages.map((_, i) => i);
    // Open on the offer's own page when we know which one carries it.
    if (targetPageId && Array.isArray(data.pageIds)) {
      const found = data.pageIds.indexOf(targetPageId);
      if (found >= 0) idx = found;
    }
    if (targetPageIndex != null) {
      const found = pageIndices.indexOf(targetPageIndex);
      if (found >= 0) idx = found;
    }
    stage.replaceChildren(wrap);
    render();
  });
  loadHotspots(b).then((data) => {
    if (!viewerOpen || !data) return;
    hotspots = data;
    if (pages.length) renderSpots(); // pages already on screen -> overlay now
  });
}
