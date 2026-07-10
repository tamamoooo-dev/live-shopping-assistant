// viewer/sheet.js — the product bottom sheet (tap a hotspot -> product panel).
//
// Phase 1: a faithful port of the previous viewer's sheet (self-hosted crop
// hero, bilingual name, price/was/discount, Add to Cart, similar-offers strip,
// swipe-down dismiss, back-stack for strip navigation) behind a controller
// API, so the new canvas ships without changing the shopping behaviour.
// Phase 2 rebuilds the content and adds detents on this same controller.

import { searchOffers, storeLabel, storeColor, cleanOfferName } from '../brochure.js';
import { addToCart, inCart } from '../cart.js';

// --- self-hosted product crop ---------------------------------------------------
// Hero + cart thumbnails are cropped FROM THE STORED PAGE IMAGE (engine /asset,
// CORS-open) using the tapped hotspot's bbox — what the user sees is exactly
// what the stored flyer shows, independent of the aggregator's CDN. Resolves a
// data-URL or null; never throws.
export function cropFromPage(pageSrc, spot, maxPx) {
  return new Promise((resolve) => {
    if (!pageSrc || !spot || !spot.w || !spot.h) return resolve(null);
    let settled = false;
    const done = (v) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(v);
      }
    };
    const timer = setTimeout(() => done(null), 2500);
    const src = new Image();
    src.crossOrigin = 'anonymous';
    src.onerror = () => done(null);
    src.onload = () => {
      try {
        const W = src.naturalWidth;
        const H = src.naturalHeight;
        const pad = 0.02;
        const x0 = Math.max(0, spot.x - pad);
        const y0 = Math.max(0, spot.y - pad);
        const w = Math.min(1 - x0, spot.w + 2 * pad) * W;
        const h = Math.min(1 - y0, spot.h + 2 * pad) * H;
        const scale = Math.min(1, maxPx / Math.max(w, h));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        canvas.getContext('2d').drawImage(src, x0 * W, y0 * H, w, h, 0, 0, canvas.width, canvas.height);
        done(canvas.toDataURL('image/jpeg', 0.82));
      } catch {
        done(null);
      }
    };
    src.src = pageSrc;
  });
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// createSheet(host, ctx) — ctx: { brochure, currentSourceIndex(), onOpen(),
// onClose() } (the host is the viewer overlay; onOpen/onClose drive the
// history layer + focus hand-off in index.js).
export function createSheet(host, ctx) {
  let sheet = null;
  let scrim = null;
  const stack = []; // { offer, spot?, pageSrc?, cropUrl?, cartThumb? }

  function isOpen() {
    return !!sheet;
  }

  function open(entry, { push = true } = {}) {
    if (entry && !entry.offer) entry = { offer: entry };
    if (push) stack.push(entry);
    const first = !sheet;
    if (first) {
      scrim = document.createElement('div');
      scrim.className = 'ps-scrim';
      scrim.addEventListener('click', close);
      host.appendChild(scrim);
      sheet = document.createElement('div');
      sheet.className = 'ps-sheet';
      sheet.setAttribute('role', 'dialog');
      sheet.setAttribute('aria-label', 'Product details');
      host.appendChild(sheet);
      wireDrag(sheet);
    }
    render(entry);
    if (first) ctx.onOpen && ctx.onOpen();
    const closeBtn = sheet.querySelector('.ps-close');
    if (closeBtn) closeBtn.focus({ preventScroll: true });
  }

  function close() {
    if (!sheet) return;
    sheet.remove();
    scrim && scrim.remove();
    sheet = null;
    scrim = null;
    stack.length = 0;
    ctx.onClose && ctx.onClose();
  }

  function wireDrag(el) {
    let startY = null;
    let dragging = false;
    el.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      const body = el.querySelector('.ps-body');
      const onHandle = e.target.closest('.ps-grab, .ps-head');
      if (!onHandle && !(body && body.scrollTop <= 0)) return;
      startY = e.touches[0].clientY;
      dragging = false;
    }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      if (startY == null) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0 && !dragging) {
        startY = null;
        return;
      }
      dragging = true;
      el.style.transition = 'none';
      el.style.transform = `translateY(${Math.max(0, dy)}px)`;
      if (dy > 0) e.preventDefault();
    }, { passive: false });
    el.addEventListener('touchend', (e) => {
      if (startY == null) return;
      const dy = e.changedTouches[0].clientY - startY;
      startY = null;
      if (!dragging) return;
      el.style.transition = '';
      if (dy > 90) close();
      else el.style.transform = '';
    }, { passive: true });
  }

  function render(entry) {
    const offer = entry.offer;
    const discount =
      offer.oldPrice && offer.oldPrice > offer.price
        ? Math.round(((offer.oldPrice - offer.price) / offer.oldPrice) * 100)
        : null;
    const fmt = (n) => (Number.isInteger(n) ? String(n) : Number(n).toFixed(2));
    const todayYMD = new Date().toISOString().slice(0, 10);
    const ended = !!(offer.validTo && offer.validTo < todayYMD);
    const until = offer.validTo ? `${ended ? 'ended' : 'until'} ${fmtDate(offer.validTo)}` : '';
    const name = cleanOfferName(offer.name);
    const nameAr = cleanOfferName(offer.nameAr);
    const title = name || nameAr || 'Flyer product';
    sheet.innerHTML = `
      <div class="ps-grab" aria-hidden="true"></div>
      <header class="ps-head">
        <button type="button" class="ps-back" ${stack.length > 1 ? '' : 'hidden'} aria-label="Back to previous product">‹</button>
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

    if (entry.spot && entry.pageSrc) {
      const box = sheet.querySelector('.ps-imgbox');
      (entry.cropUrl ? Promise.resolve(entry.cropUrl) : cropFromPage(entry.pageSrc, entry.spot, 640)).then(
        (url) => {
          if (!url || !box || !box.isConnected) return;
          entry.cropUrl = url;
          box.innerHTML = `<img class="ps-img" src="${url}" alt="${esc(title)}">`;
        },
      );
    }

    sheet.querySelector('.ps-close').addEventListener('click', close);
    const backBtn = sheet.querySelector('.ps-back');
    if (backBtn && !backBtn.hidden) {
      backBtn.addEventListener('click', () => {
        stack.pop();
        const prev = stack[stack.length - 1];
        if (prev) open(prev, { push: false });
        else close();
      });
    }

    const addBtn = sheet.querySelector('.ps-add');
    addBtn.addEventListener('click', async () => {
      let thumb = entry.cartThumb || null;
      if (!thumb && entry.spot && entry.pageSrc) {
        thumb = await cropFromPage(entry.pageSrc, entry.spot, 220);
        if (thumb) entry.cartThumb = thumb;
      }
      addToCart({
        id: offer.id,
        store: offer.store,
        name,
        nameAr,
        price: offer.price,
        oldPrice: offer.oldPrice,
        currency: offer.currency || 'SAR',
        image: thumb || offer.imageUrl,
        sourceUrl: offer.sourceUrl,
        brochureId: ctx.brochure.id,
        pageIndex: ctx.currentSourceIndex(),
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

    loadRelated(offer);
  }

  // Similar products via the engine's own offers search, seeded with the most
  // name-like tokens. Best-effort; the strip stays hidden without results.
  async function loadRelated(offer) {
    const seed = relatedQuery(offer);
    if (!seed || !sheet) return;
    const data = await searchOffers(seed, 12);
    if (!sheet) return;
    const box = sheet.querySelector('.ps-related');
    const strip = sheet.querySelector('.ps-rel-strip');
    if (!data || !box || !strip) return;
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
        card.addEventListener('click', () => open({ offer: o }));
        return card;
      }),
    );
    box.hidden = false;
  }

  function relatedQuery(offer) {
    const base = cleanOfferName(offer.name) || cleanOfferName(offer.nameAr) || '';
    const tokens = base
      .split(/\s+/)
      .filter((t) => t && !/^\d/.test(t) && t.length > 2)
      .slice(0, 3);
    if (tokens.length) return tokens.join(' ');
    return offer.category ? offer.category.replace(/-/g, ' ') : null;
  }

  return { open, close, isOpen };
}
