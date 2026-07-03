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

import { loadBrochurePages, isPdfBrochure, pdfAssetUrl } from './brochure.js';

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
export function openBrochureViewer(b, storeName, opts = {}) {
  if (viewerOpen) return;
  viewerOpen = true;
  const restoreFocus = document.activeElement;
  const isPdf = isPdfBrochure(b);
  const targetPageId = opts && opts.targetPageId != null ? String(opts.targetPageId) : null;

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
  const MAX_ZOOM = 3;

  const close = () => {
    viewerOpen = false;
    document.removeEventListener('keydown', onKey, true);
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
    if (e.key === 'Escape') close();
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
  const img = document.createElement('img');
  img.className = 'bv-img';
  img.alt = `${storeName} brochure page`;

  const applyZoom = () => {
    if (zoom <= 1) {
      img.style.maxWidth = '100%';
      img.style.maxHeight = '100%';
      img.style.width = '';
      img.style.height = '';
    } else {
      img.style.maxWidth = 'none';
      img.style.maxHeight = 'none';
      img.style.height = `${zoom * 100}%`;
      img.style.width = 'auto';
    }
    zoomOutBtn.disabled = zoom <= 1;
    zoomInBtn.disabled = zoom >= MAX_ZOOM;
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
    preload(idx + 1); // keep paging instant
    preload(idx - 1);
  };

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

  // Swipe to page on touch (only when not zoomed — zoomed drags pan the stage).
  let touchX = null;
  let touchY = null;
  stage.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    touchX = e.touches[0].clientX;
    touchY = e.touches[0].clientY;
  }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (touchX == null || zoom > 1) return;
    const dx = e.changedTouches[0].clientX - touchX;
    const dy = e.changedTouches[0].clientY - touchY;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) go(idx + (dx < 0 ? 1 : -1));
    touchX = touchY = null;
  }, { passive: true });

  // Fetch the page images (through the engine). Best-effort.
  loadBrochurePages(b).then((data) => {
    if (!viewerOpen) return; // closed while loading
    if (!data || !data.pages.length) {
      stage.innerHTML = '<div class="bv-msg">Sorry — this brochure could not be loaded.</div>';
      return;
    }
    pages = data.pages;
    // Open on the offer's own page when we know which one carries it.
    if (targetPageId && Array.isArray(data.pageIds)) {
      const found = data.pageIds.indexOf(targetPageId);
      if (found >= 0) idx = found;
    }
    stage.replaceChildren(img);
    render();
  });
}
