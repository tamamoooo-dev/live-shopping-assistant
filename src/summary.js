// summary.js — renders the Price Comparison Engine's model (compare.js) as the
// shopping summary shown ABOVE the results.
//
// The decision logic lives in compare.js (pure, unit-tested); this module is
// rendering only. What the panel answers, honestly:
//   • What is the genuinely BEST BUY right now — by per-unit value when sizes
//     are known, across BOTH online stores and this week's flyers?
//   • If a smaller pack costs less in total, where is it? (shown as its own
//     line — never silently hidden, never confused with the best value)
//   • Is the claim apples-to-apples? The confidence chip + "same product
//     elsewhere" say exactly how comparable the comparison is.
//   • Is today a good deal historically? (Price History verdict for tracked
//     products)
//
// LAYOUT PRINCIPLES (Search Experience Refinement, Tasks 3–6):
//   • The card speaks to a SHOPPER: one dense, scannable recommendation line
//     (price · unit price · store · size) beside the product's image, with
//     one-tap actions (Add to cart, Watch price) in the header.
//   • Diagnostic detail (offer/store counts, price range, exclusion counts)
//     lives in ONE muted footer line; the exclusion breakdown is a tooltip —
//     honesty stays (nothing is silently dropped), clutter goes.
//   • Flyer-sourced picks stay clearly labelled with the machine-extraction
//     caveat — the user never mistakes an OCR price for a shelf price.

import { sizeLabel } from './match.js';
import { unitPriceLabel } from './compare.js';
import { addToCart } from './cart.js';
import { t, tn } from './i18n.js';

// --- rendering helpers ---------------------------------------------------------
function money(v, c = 'SAR') {
  return v == null ? '' : `${Number(v).toFixed(2)} ${c}`;
}
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
// "Jul 9" — for inline record dates (Other sizes), where the year is noise.
function fmtDateShort(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const CONF_LABEL = {
  high: t('summary.conf.high'),
  medium: t('summary.conf.medium'),
  low: t('summary.conf.low'),
};

const KICKER = {
  'best-buy': t('summary.kicker.bestBuy'),
  'best-value': t('summary.kicker.bestValue'),
  cheapest: t('summary.kicker.cheapest'),
};

function nameLink(l) {
  const a = l.link ? document.createElement('a') : document.createElement('span');
  a.className = 'summary-name';
  a.dir = 'auto';
  a.textContent = l.name;
  if (l.link) {
    a.href = l.link;
    a.target = '_blank';
    a.rel = 'noopener';
  }
  return a;
}

// The recommendation's product image (Task 5: a Best Buy should be recognizable
// at a glance) — online results carry the store's catalogue image, flyer offers
// their D4D crop. No image -> no placeholder box (nothing fake).
function listingThumb(l) {
  if (!l.image) return null;
  const wrap = el('div', 'summary-thumb');
  const img = new Image();
  img.loading = 'lazy';
  img.alt = '';
  img.src = l.image;
  img.addEventListener('error', () => wrap.remove());
  wrap.appendChild(img);
  return wrap;
}

// One dense price line: 9.95 SAR · 0.33 SAR/L · Tamimi · 5 × 6L  [flyer]
// (price first, then how good it is per unit, then where, then the package —
// the scan order a shopper actually uses). `shared` lists other stores selling
// the same thing at the same price — the best price is theirs too, never
// attributed to a single store.
function priceLine(l, { big = true, shared = null } = {}) {
  const line = el('div', 'summary-line');
  line.appendChild(el('span', big ? 'summary-price' : 'summary-price-sm', money(l.price, l.currency)));
  const up = unitPriceLabel(l);
  if (up) line.appendChild(el('span', 'summary-unit', up));
  const stores =
    shared && shared.length
      ? [l.store.label, ...shared.map((s) => s.label)].join(' · ')
      : l.store.label;
  line.appendChild(el('span', 'summary-at', t('summary.atStores', { stores })));
  const sz = sizeLabel(l.size);
  if (sz) line.appendChild(el('span', 'summary-size', sz));
  if (l.source === 'flyer') line.appendChild(el('span', 'summary-flyer-badge', t('summary.flyerBadge')));
  return line;
}

// The local-cart snapshot for a summary listing — the SAME id scheme the grid
// cards and the flyer viewer's sheet use, so repeated adds of one product merge
// into one cart row with a quantity.
function cartItemFor(l) {
  return {
    id: l.source === 'online' ? `${l.store.id}:${l.it.id}` : l.offer.id,
    store: l.store.id,
    name: l.source === 'flyer' ? l.offer.name || l.name : l.name,
    nameAr: l.source === 'flyer' ? l.offer.nameAr || null : null,
    price: l.price,
    oldPrice: l.oldPrice ?? null,
    currency: l.currency || 'SAR',
    image: l.image || null,
    sourceUrl: l.link || null,
    validTo: l.source === 'flyer' ? l.offer.validTo || null : null,
  };
}

// The one-line exclusion tooltip: what the comparison set aside, and why —
// full honesty for whoever hovers, zero card noise for everyone else.
function exclusionBreakdown(s) {
  const bits = [];
  if (s.stageExcluded > 0) bits.push(`${t('summary.excl.short.stage')} ×${s.stageExcluded}`);
  if (s.familyExcluded > 0) bits.push(`${t('summary.excl.short.family')} ×${s.familyExcluded}`);
  if (s.typeExcluded > 0) bits.push(`${t('summary.excl.short.type')} ×${s.typeExcluded}`);
  if (s.freshExcluded > 0) bits.push(`${t('summary.excl.short.fresh')} ×${s.freshExcluded}`);
  if (s.identityExcluded > 0) bits.push(`${t('summary.excl.short.identity')} ×${s.identityExcluded}`);
  return bits.join(' · ');
}

// `s` is the compare.js model. `opts.onWatch(model)` (optional) adds the
// "Watch price" action that creates a Price Monitoring watch.
export function summaryElement(s, storeLabelFn = (x) => x, opts = {}) {
  const wrap = el('div', `summary conf-${s.confidence}`);
  const h = s.headline.listing;

  // Header: title + confidence chip + the actions (Add to cart, Watch price)
  const head = el('div', 'summary-head');
  head.appendChild(el('span', 'summary-title', t('summary.title')));
  const conf = el('span', `summary-conf conf-${s.confidence}`);
  conf.appendChild(el('span', 'conf-dot'));
  conf.appendChild(el('span', null, CONF_LABEL[s.confidence]));
  head.appendChild(conf);
  const cartBtn = el('button', 'summary-watch summary-cart');
  cartBtn.type = 'button';
  cartBtn.textContent = t('summary.addCart');
  cartBtn.title = t('summary.addCartTitle');
  cartBtn.addEventListener('click', () => {
    addToCart(cartItemFor(h));
    cartBtn.textContent = t('summary.addedCart');
    cartBtn.classList.add('is-added');
    setTimeout(() => {
      if (!cartBtn.isConnected) return;
      cartBtn.textContent = t('summary.addCart');
      cartBtn.classList.remove('is-added');
    }, 1300);
  });
  head.appendChild(cartBtn);
  if (opts.onWatch) {
    const btn = el('button', 'summary-watch');
    btn.type = 'button';
    btn.textContent = t('summary.watch');
    btn.title = t('summary.watchTitle');
    btn.addEventListener('click', () => opts.onWatch(s));
    head.appendChild(btn);
  }
  wrap.appendChild(head);

  // Headline — the recommendation: kicker, then image + dense line + name.
  const hero = el('div', 'summary-hero');
  hero.appendChild(el('span', 'summary-kicker', KICKER[s.headline.kind] || t('summary.kicker.bestBuy')));
  const row = el('div', 'summary-hero-row');
  const thumb = listingThumb(h);
  if (thumb) row.appendChild(thumb);
  const main = el('div', 'summary-hero-main');
  main.appendChild(priceLine(h, { shared: s.sharedWith }));
  if (s.sharedWith && s.sharedWith.length) {
    main.appendChild(
      el('div', 'summary-shared-note', t('summary.sharedBy', { count: s.sharedWith.length + 1 })),
    );
  }
  main.appendChild(nameLink(h));
  if (h.source === 'flyer') {
    main.appendChild(el('div', 'summary-note', t('summary.flyerNote')));
  }
  // Same product elsewhere (only when the headline itself is the verified group)
  if (s.equivalent && h.it && s.equivalent.sorted.some((i) => i.it === h.it)) {
    const others = s.equivalent.sorted
      .filter((i) => i.it !== h.it)
      .slice(0, 3)
      .map((i) => `${i.store.label} ${money(i.it.price)}`)
      .join(' · ');
    if (others) main.appendChild(el('div', 'summary-others', t('summary.sameElsewhere', { others })));
  }
  if (s.confidence === 'low') {
    main.appendChild(el('div', 'summary-note', t('summary.lowConfNote')));
  }
  row.appendChild(main);
  hero.appendChild(row);
  wrap.appendChild(hero);

  // The lowest TOTAL price, when it is a different (smaller) item than the
  // best buy — never hidden, honestly framed.
  if (s.secondary) {
    const sec = el('div', 'summary-secondary');
    sec.appendChild(el('span', 'summary-sec-tag', t('summary.secondaryTag')));
    sec.appendChild(priceLine(s.secondary.listing, { big: false }));
    const nm = el('span', 'summary-sec-name');
    nm.dir = 'auto';
    nm.textContent = s.secondary.listing.name;
    sec.appendChild(nm);
    wrap.appendChild(sec);
  }

  // A verified same-product group that ISN'T the headline still helps ("the
  // exact same 2L milk is at these stores"), shown compactly.
  if (s.equivalent && !(h.it && s.equivalent.sorted.some((i) => i.it === h.it))) {
    const g = s.equivalent;
    const row2 = el('div', 'summary-value');
    row2.appendChild(el('span', 'summary-value-tag', t('summary.sameProductTag', { stores: g.stores })));
    const best = g.sorted[0];
    const nm = el('span', 'summary-value-name');
    nm.dir = 'auto';
    nm.textContent = `${best.it.name} — ${g.sorted.map((i) => `${i.store.label} ${money(i.it.price)}`).slice(0, 3).join(' · ')}`;
    row2.appendChild(nm);
    wrap.appendChild(row2);
  }

  // Price History verdict
  if (s.history) {
    const hh = s.history;
    const box = el('div', `summary-history verdict-${hh.verdict}`);
    const title = el('div', 'sh-title');
    title.appendChild(el('span', 'sh-badge', t('summary.history.badge')));
    const delta = hh.delta != null ? hh.delta.toFixed(2) : '';
    const vlabel =
      hh.verdict === 'building'
        ? t('summary.history.building')
        : hh.verdict === 'at-low'
        ? t('summary.history.atLow')
        : hh.verdict === 'near-low'
        ? t('summary.history.nearLow', { delta })
        : t('summary.history.aboveLow', { delta });
    title.appendChild(el('span', 'sh-verdict', vlabel));
    if (hh.trend && hh.verdict !== 'building') {
      title.appendChild(
        el(
          'span',
          `sh-trend trend-${hh.trend}`,
          hh.trend === 'down'
            ? t('summary.history.trendDown')
            : hh.trend === 'up'
            ? t('summary.history.trendUp')
            : t('summary.history.trendSteady'),
        ),
      );
    }
    box.appendChild(title);
    const low = hh.low;
    const sizeTag = hh.variant && hh.variant.label ? ` (${hh.variant.label})` : '';
    const lowLabel = hh.verdict === 'building' ? t('summary.history.lowestSoFar') : t('summary.history.lowestRecorded');
    box.appendChild(
      el(
        'div',
        'sh-detail',
        `${lowLabel}${sizeTag}: ${money(low.price)} ${t('alerts.atStore', { store: storeLabelFn(low.store) })}${
          low.observedAt ? ` · ${fmtDate(low.observedAt)}` : low.edition ? ` · ${low.edition}` : ''
        }${hh.verdict === 'building' && hh.firstSeen ? ` · ${t('summary.history.recordingSince', { date: fmtDate(hh.firstSeen) })}` : ''}`,
      ),
    );
    if (hh.latest && hh.latest.length) {
      const list = el('div', 'sh-latest');
      for (const p of hh.latest) {
        const prow = el('div', 'sh-row');
        prow.appendChild(el('span', 'sh-store', storeLabelFn(p.store)));
        prow.appendChild(el('span', 'sh-price', money(p.price)));
        const d = el('span', 'sh-delta');
        if (p.price <= low.price + 1e-9) {
          d.classList.add('is-best');
          d.textContent = hh.verdict === 'building' ? t('summary.history.lowestSoFarTag') : t('summary.history.recordLow');
        } else {
          d.classList.add('is-above');
          d.textContent = `+${(p.price - low.price).toFixed(2)}`;
        }
        prow.appendChild(d);
        list.appendChild(prow);
      }
      box.appendChild(list);
    }
    // Other tracked sizes — each with its own independent lowest-ever record,
    // and the date it was recorded ("6 × 1.5L 26.99 SAR · Jul 9").
    if (hh.otherVariants && hh.otherVariants.length) {
      const ov = el('div', 'sh-variants');
      ov.appendChild(el('span', 'sh-variants-label', t('summary.history.otherSizes')));
      ov.appendChild(
        el(
          'span',
          'sh-variants-list',
          hh.otherVariants
            .slice(0, 4)
            .map((v) => {
              const when = v.low && v.low.observedAt ? ` · ${fmtDateShort(v.low.observedAt)}` : '';
              return `${v.label} ${money(v.low.price)}${when}`;
            })
            .join('  ·  '),
        ),
      );
      box.appendChild(ov);
    }
    wrap.appendChild(box);
  }

  // Footer meta — the diagnostic context, in one muted line: coverage, the
  // full price range, and what was excluded (breakdown in the tooltip).
  const meta = el('div', 'summary-meta');
  const parts = [tn('summary.overview', s.offers, { offers: s.offers, stores: tn('summary.overviewStores', s.stores) })];
  if (s.flyerCount) parts.push(t('summary.fromFlyers', { count: s.flyerCount }));
  parts.push(t('summary.rangeLabel', { range: `${money(s.range.min)} – ${money(s.range.max)}` }));
  meta.appendChild(el('span', null, parts.join(' · ')));
  const excludedTotal =
    (s.stageExcluded || 0) + (s.familyExcluded || 0) + (s.typeExcluded || 0) +
    (s.freshExcluded || 0) + (s.identityExcluded || 0);
  if (excludedTotal > 0) {
    const ex = el('span', 'summary-excluded', tn('summary.excluded', excludedTotal));
    ex.title = exclusionBreakdown(s);
    meta.appendChild(ex);
  }
  wrap.appendChild(meta);

  return wrap;
}
