// viewer/sheet.js — the product bottom sheet: the viewer's central shopping
// panel. Opens on a hotspot tap at HALF height, drags between three detents
// (peek / half / full) with velocity snapping, hands scrolling to the body at
// full height, and dismisses on a downward fling — the native bottom-sheet
// contract.
//
// Content (all from existing systems — the sheet is presentation only):
//   hero crop (self-hosted, cropFromPage) · bilingual name · price/was/−%
//   package size + per-unit price (match.js) · validity · intelligence lines +
//   price-history block (insights.js over /prices) · Add to Cart · Watch
//   (alertsPage dialog → engine watches) · similar-offers strip (/offers).
//   "Available elsewhere" comparison lands in Phase 4 via renderCompare.

import { searchOffers, storeLabel, storeColor, cleanOfferName, pricesForQuery } from '../brochure.js';
import { addToCart, inCart } from '../cart.js';
import { openWatchDialog } from '../alertsPage.js';
import { buildInsights, historyQuery, offerSize, fmtMoney } from './insights.js';

/* --- self-hosted product crop --------------------------------------------------- */
// Hero + cart thumbnails are cropped FROM THE STORED PAGE IMAGE (engine /asset,
// CORS-open) using the tapped hotspot's bbox — exactly what the stored flyer
// shows, independent of the aggregator's CDN. Resolves a data-URL or null.
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

const PEEK_PX = 330; // enough for hero + price + actions, one-handed
const DISMISS_V = 0.55; // px/ms downward fling that closes from any detent

// createSheet(host, ctx) — ctx: { brochure, currentSourceIndex(), onOpen(),
// onClose() }. host is the viewer overlay.
export function createSheet(host, ctx) {
  let sheet = null;
  let scrim = null;
  let body = null;
  let detent = 'half'; // 'peek' | 'half' | 'full'
  const stack = []; // { offer, spot?, pageSrc?, cropUrl?, cartThumb? }

  const H = () => sheet ? sheet.getBoundingClientRect().height : 0;
  const visibleFor = (d) =>
    d === 'full' ? H() : d === 'half' ? Math.min(H(), Math.max(PEEK_PX + 60, H() * 0.58)) : Math.min(H(), PEEK_PX);
  const offsetFor = (d) => H() - visibleFor(d);

  function setDetent(d, { animate = true } = {}) {
    detent = d;
    if (!sheet) return;
    sheet.style.transition = animate ? 'transform 0.26s cubic-bezier(0.2, 0.9, 0.25, 1)' : 'none';
    sheet.style.transform = `translateY(${offsetFor(d)}px)`;
    sheet.dataset.detent = d;
    if (body) body.style.overflowY = d === 'full' ? 'auto' : 'hidden';
    scrim && scrim.classList.toggle('is-deep', d === 'full');
  }

  function isOpen() {
    return !!sheet;
  }

  function open(entry, { push = true, detent: startDetent = 'half' } = {}) {
    if (entry && !entry.offer) entry = { offer: entry };
    if (push) stack.push(entry);
    const first = !sheet;
    if (first) {
      scrim = document.createElement('div');
      scrim.className = 'ps-scrim';
      scrim.addEventListener('click', close);
      host.appendChild(scrim);
      sheet = document.createElement('div');
      sheet.className = 'ps-sheet ps-sheet-v2';
      sheet.setAttribute('role', 'dialog');
      sheet.setAttribute('aria-label', 'Product details');
      host.appendChild(sheet);
      wireDrag(sheet);
    }
    render(entry);
    if (first) {
      // Enter from off-screen to the requested detent.
      sheet.style.transition = 'none';
      sheet.style.transform = `translateY(${H()}px)`;
      requestAnimationFrame(() => sheet && setDetent(startDetent));
      ctx.onOpen && ctx.onOpen();
    }
    const closeBtn = sheet.querySelector('.ps-close');
    if (closeBtn) closeBtn.focus({ preventScroll: true });
  }

  function close() {
    if (!sheet) return;
    const el = sheet;
    const sc = scrim;
    sheet = null;
    scrim = null;
    body = null;
    stack.length = 0;
    el.style.transition = 'transform 0.2s ease-in';
    el.style.transform = `translateY(${el.getBoundingClientRect().height + 24}px)`;
    sc && sc.classList.add('is-closing');
    setTimeout(() => {
      el.remove();
      sc && sc.remove();
    }, 200);
    ctx.onClose && ctx.onClose();
  }

  /* --- detent dragging (pointer events, arms on handle / collapsed / top) ------- */
  function wireDrag(el) {
    let startY = null;
    let startOffset = 0;
    let armed = false;
    let dragging = false;
    let lastY = 0;
    let lastT = 0;
    let vy = 0;
    const release = (e) => {
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    };
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const onHandle = e.target.closest('.ps-grab, .ps-head');
      const bodyEl = el.querySelector('.ps-body');
      // Arm when: on the handle/header, or the sheet isn't full (body doesn't
      // scroll), or the body is scrolled to its very top (pull-down begins).
      armed = !!onHandle || detent !== 'full' || (bodyEl && bodyEl.scrollTop <= 0);
      if (!armed) return;
      // Capture NOW (the pattern the stage proves out): once the sheet starts
      // following the finger, hit-testing must never steal the stream.
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* capture is an optimization, not a requirement */
      }
      startY = e.clientY;
      lastY = e.clientY;
      lastT = e.timeStamp;
      startOffset = offsetFor(detent);
      dragging = false;
    });
    el.addEventListener('pointermove', (e) => {
      if (startY == null || !armed) return;
      const dy = e.clientY - startY;
      if (!dragging) {
        if (Math.abs(dy) < 8) return;
        // Upward drag while full belongs to the body's scroll, not the sheet.
        if (dy < 0 && detent === 'full') {
          startY = null;
          release(e);
          return;
        }
        dragging = true;
      }
      const dt = Math.max(1, e.timeStamp - lastT);
      vy = (e.clientY - lastY) / dt;
      lastY = e.clientY;
      lastT = e.timeStamp;
      const next = Math.max(0, startOffset + dy);
      el.style.transition = 'none';
      el.style.transform = `translateY(${next}px)`;
      if (dy > 0) e.preventDefault && e.preventDefault();
    });
    const settle = (e) => {
      if (startY == null) return;
      const wasDragging = dragging;
      startY = null;
      dragging = false;
      release(e);
      if (!wasDragging) return;
      justDragged = true; // the trailing click of a drag must not press a button
      setTimeout(() => {
        justDragged = false;
      }, 0);
      // Project the release with a dash of velocity, then snap.
      const projected = currentOffset(el) + vy * 160;
      const h = H();
      if (vy > DISMISS_V || h - projected < PEEK_PX * 0.55) return close();
      let best = 'half';
      let bestDist = Infinity;
      for (const d of ['full', 'half', 'peek']) {
        const dist = Math.abs(offsetFor(d) - projected);
        if (dist < bestDist) {
          bestDist = dist;
          best = d;
        }
      }
      setDetent(best);
    };
    el.addEventListener('pointerup', settle);
    el.addEventListener('pointercancel', () => {
      if (dragging) setDetent(detent);
      startY = null;
      dragging = false;
    });
    // Pointer capture retargets the synthesized `click` to the CAPTURE element
    // (this sheet), so taps on the sheet's buttons never reach them. Forward a
    // non-drag click to the real control under the release point. Browsers
    // that don't retarget still hit `e.target !== el` and pass through — no
    // double activation either way.
    el.addEventListener('click', (e) => {
      if (e.target !== el || justDragged) return;
      const real = document.elementFromPoint(e.clientX, e.clientY);
      const control = real && real.closest('button, a');
      if (control && control !== el && el.contains(control)) control.click();
    });
  }
  let justDragged = false;
  const currentOffset = (el) => {
    const m = /translateY\((-?[\d.]+)px\)/.exec(el.style.transform || '');
    return m ? parseFloat(m[1]) : 0;
  };

  /* --- rendering -------------------------------------------------------------------- */
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
    const { label: sizeText, unit } = offerSize(offer);
    const meta = [
      sizeText,
      unit ? `${fmt(Math.round(unit.value * 100) / 100)} SAR/${unit.unit}` : '',
    ].filter(Boolean).join(' · ');

    sheet.innerHTML = `
      <div class="ps-grab" aria-hidden="true"></div>
      <header class="ps-head">
        <button type="button" class="ps-back" ${stack.length > 1 ? '' : 'hidden'} aria-label="Back to previous product">‹</button>
        <span class="ps-store" style="--chip:${storeColor(offer.store)}">${esc(storeLabel(offer.store))}</span>
        ${until ? `<span class="ps-until${ended ? ' is-ended' : ''}">${esc(until)}</span>` : ''}
        <button type="button" class="ps-close" aria-label="Back to brochure">✕</button>
      </header>
      <div class="ps-body">
        <div class="ps-hero">
          <div class="ps-imgbox">${
            offer.imageUrl
              ? `<img class="ps-img" src="${esc(offer.imageUrl)}" alt="${esc(title)}">`
              : '<div class="ps-noimg" aria-hidden="true">🛒</div>'
          }</div>
          <div class="ps-headline">
            <h3 class="ps-name" dir="auto">${esc(title)}</h3>
            ${name && nameAr ? `<p class="ps-name-ar" dir="rtl">${esc(nameAr)}</p>` : ''}
            ${meta ? `<p class="ps-meta">${esc(meta)}</p>` : ''}
            <div class="ps-pricerow">
              <span class="ps-price">${fmt(offer.price)} <small>${esc(offer.currency || 'SAR')}</small></span>
              ${offer.oldPrice ? `<span class="ps-old">${fmt(offer.oldPrice)}</span>` : ''}
              ${discount ? `<span class="ps-off">−${discount}%</span>` : ''}
            </div>
          </div>
        </div>
        <div class="ps-actions">
          <button type="button" class="ps-add">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="20" r="1.6"/><circle cx="17" cy="20" r="1.6"/><path d="M3 4h2.2l2.4 11.2a1.6 1.6 0 0 0 1.6 1.3h7.9a1.6 1.6 0 0 0 1.6-1.3L20.5 8H6"/></svg>
            <span>${inCart(offer.id) ? 'Add again' : 'Add to list'}</span>
          </button>
          <button type="button" class="ps-watch" aria-label="Watch this price">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M13.7 20a2 2 0 0 1-3.4 0"/></svg>
            <span>Watch</span>
          </button>
          <button type="button" class="ps-similar-btn" aria-label="Similar products">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
            <span>Similar</span>
          </button>
        </div>
        <div class="ps-insights" hidden></div>
        <div class="ps-history" hidden>
          <h4>Price history</h4>
          <div class="ps-history-body"></div>
        </div>
        <div class="ps-compare" hidden>
          <h4>Available elsewhere</h4>
          <div class="ps-compare-body"></div>
        </div>
        <p class="ps-note">Flyer price, machine-extracted — the printed flyer prevails.
          ${offer.sourceUrl ? `<a href="${esc(offer.sourceUrl)}" target="_blank" rel="noopener">Verify ↗</a>` : ''}</p>
        <div class="ps-related" hidden>
          <h4>Similar offers this week</h4>
          <div class="ps-rel-strip"></div>
        </div>
      </div>`;
    body = sheet.querySelector('.ps-body');
    setDetent(detent, { animate: false });

    // Self-hosted hero swap (cached per entry).
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

    /* Add to list */
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
      addBtn.querySelector('span').textContent = 'Added ✓';
      setTimeout(() => {
        if (!addBtn.isConnected) return;
        addBtn.classList.remove('is-added');
        const span = addBtn.querySelector('span');
        if (span) span.textContent = 'Add again';
      }, 1300);
    });

    /* Watch — the engine's Price Monitoring, via the existing dialog. */
    const seed = historyQuery(offer);
    sheet.querySelector('.ps-watch').addEventListener('click', () => {
      openWatchDialog({
        kind: 'grocery',
        query: seed || title,
        label: title,
        sizeText: `${offer.name || ''} ${offer.nameAr || ''}`,
        suggestedPrice: offer.price,
        currentPrice: offer.price,
        link: offer.sourceUrl || null,
      });
    });

    /* Similar — scroll to the strip (opens full height so it's visible). */
    sheet.querySelector('.ps-similar-btn').addEventListener('click', () => {
      setDetent('full');
      const rel = sheet.querySelector('.ps-related');
      setTimeout(() => rel && !rel.hidden && rel.scrollIntoView({ behavior: 'smooth', block: 'start' }), 280);
    });

    loadIntelligence(offer, seed);
    loadRelated(offer);
  }

  /* --- intelligence + history (insights.js over /prices) ---------------------------- */
  async function loadIntelligence(offer, seed) {
    if (!seed || !sheet) return;
    const prices = await pricesForQuery(seed).catch(() => null);
    if (!sheet) return;
    const { lines, history } = buildInsights({ offer, prices, storeLabel });
    const box = sheet.querySelector('.ps-insights');
    if (box && lines.length) {
      box.replaceChildren(
        ...lines.map((l) => {
          const row = document.createElement('div');
          row.className = `ps-insight is-${l.tone}`;
          row.innerHTML = `<span class="ps-insight-ic" aria-hidden="true">${l.icon}</span><span dir="auto">${esc(l.text)}</span>`;
          return row;
        }),
      );
      box.hidden = false;
    }
    const hist = sheet.querySelector('.ps-history');
    const histBody = sheet.querySelector('.ps-history-body');
    if (hist && histBody && history && prices) {
      const trendGlyph = history.trend === 'down' ? '↘' : history.trend === 'up' ? '↗' : '→';
      const vs = history.atLowest
        ? '<span class="ps-h-badge is-good">at the historical low</span>'
        : `<span class="ps-h-badge">${history.pct > 0 ? `+${history.pct}%` : `${history.pct}%`} vs low</span>`;
      histBody.innerHTML = `
        <div class="ps-h-row"><span>Lowest recorded</span><b>${esc(fmtMoney(history.lowest.price))}${
          history.lowest.store ? ` <small>at ${esc(storeLabel(history.lowest.store))}</small>` : ''
        }</b></div>
        <div class="ps-h-row"><span>This offer</span><b>${esc(fmtMoney(offer.price))} ${vs}</b></div>
        <div class="ps-h-row"><span>Recorded over</span><b>${history.weeks || prices.weeks || 0} week${
          (history.weeks || prices.weeks) === 1 ? '' : 's'
        } <small class="ps-h-trend">${trendGlyph} ${esc(history.trend || 'steady')}</small></b></div>`;
      hist.hidden = false;
    }
  }

  /* --- similar offers strip ------------------------------------------------------------ */
  async function loadRelated(offer) {
    const seed = historyQuery(offer);
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

  return { open, close, isOpen, setDetent };
}
