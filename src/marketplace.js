// marketplace.js — the ONE unified results experience (the "intelligent
// marketplace"). Every result is simply an OFFER: live online results and this
// week's flyer offers render in a single ranked grid, and the SOURCE is
// metadata — a lightweight store badge (colored dot + name) plus a small
// "flyer · until <date>" tag on flyer-sourced cards — never a separate
// browsing experience (milestone directive: brochures and online stores must
// not feel like separate systems).
//
// Two pieces, one factory:
//   • the SOURCES STRIP — a compact per-store status row (searching → count /
//     unavailable / no matches) with each store's weekly-flyer chip, so
//     store-level state stays honest without per-store result sections;
//   • the OFFERS GRID — all relevant offers from every source, ranked by
//     relevance band then price, top N with "Show all".
//
// Honesty rules carried over:
//   • Flyer prices are machine-extracted — every flyer card carries the tag
//     and clicks through to the flyer itself (in-app viewer when held).
//   • A store whose results were ALL irrelevant shows "no matches" (with the
//     hidden count) — never a grid full of unrelated products (the "48 chairs
//     from Amazon" failure mode).

import { openBrochureViewer } from './viewer.js';
import { brochureForOffer, storeLabel, storeColor } from './brochure.js';
import { unitPrice, productFamily, queryFamily, normalizeText } from './match.js';
import { unitPriceLabel } from './compare.js';
import { openWatchDialog } from './alertsPage.js';

const DEFAULT_VISIBLE = 12;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function money(value, currency = 'SAR') {
  return value == null ? '' : `${Number(value).toFixed(2)} ${currency}`;
}

function fmtDateShort(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// The search query a product watch uses to re-find this product daily.
function watchQueryFor(item) {
  return (item.name || '').split(/\s+/).slice(0, 6).join(' ').slice(0, 80);
}

// --- entry helpers (one comparable shape over both worlds) --------------------
// online entry: { kind:'online', store:{id,label,color}, it: NormalizedResult }
// flyer entry:  { kind:'flyer', listing: compare.js flyerListing }
function entryRel(e) {
  return e.kind === 'online' ? e.it._rel || 0 : e.listing.rel || 0;
}
function entryPrice(e) {
  return e.kind === 'online' ? e.it.price : e.listing.price;
}
// The entry's per-unit price ({ value, unit }) or null — the basis of the
// "Best value" ranking. Cached per entry (parseSize is not free).
function entryUnit(e) {
  if (e._unit === undefined) {
    e._unit = e.kind === 'online' ? unitPrice(e.it) : e.listing.up || null;
  }
  return e._unit;
}
function entryFamily(e) {
  if (e._family === undefined) {
    e._family =
      e.kind === 'online'
        ? productFamily(e.it.name)
        : e.listing.family !== undefined
          ? e.listing.family
          : productFamily(e.listing.name);
  }
  return e._family;
}
// Relevance bands keep ranking stable across sources with different name
// quality (store catalogues vs flyer OCR): strong (whole-word tier) > good >
// weak; price orders within a band, so the best deals surface naturally.
// When the QUERY names a product family ("بيض" -> eggs, "طماطم" -> tomato),
// entries CONFIRMED to be that family take the top band (fresh tomatoes above
// every tomato-paste/ketchup look-alike, however cheap), entries of a KNOWN
// different family drop to the bottom band, and family-less entries rank by
// lexical strength in between — mirrors the engine /offers famRank tiering.
function entryBand(e, qFam) {
  if (qFam) {
    const f = entryFamily(e);
    if (f === qFam) return 3;
    if (f) return 0;
  }
  const r = entryRel(e);
  return r >= 75 ? 2 : r >= 45 ? 1 : 0;
}
// Two ranking perspectives the user can switch between (milestone objective 1):
//   • 'price' — lowest total price first (the original behaviour).
//   • 'value' — best price per comparable unit first (what the comparison engine
//     already reasons about). Value is only fair WITHIN one unit family, so the
//     ranking compares per-unit prices only among entries in the pool's dominant
//     unit (the one shared by the most sized entries); everything else falls back
//     to price, after the unit-ranked block. Relevance bands still come first, so
//     a cheap look-alike never outranks the real product either way.
function priceKey(a, b) {
  const pa = entryPrice(a);
  const pb = entryPrice(b);
  if (pa == null && pb == null) return entryRel(b) - entryRel(a);
  if (pa == null) return 1;
  if (pb == null) return -1;
  return pa - pb || entryRel(b) - entryRel(a);
}
// The unit family shared by the most sized entries in a pool (or null).
function dominantUnit(pool) {
  const counts = new Map();
  for (const e of pool) {
    const u = entryUnit(e);
    if (u) counts.set(u.unit, (counts.get(u.unit) || 0) + 1);
  }
  let top = null;
  for (const [unit, c] of counts) if (!top || c > top.c) top = { unit, c };
  return top ? top.unit : null;
}
function makeComparator(qFam, sort, domUnit) {
  return (a, b) => {
    const band = entryBand(b, qFam) - entryBand(a, qFam);
    if (band) return band;
    if (sort === 'value' && domUnit) {
      const ua = entryUnit(a);
      const ub = entryUnit(b);
      const aIn = ua && ua.unit === domUnit;
      const bIn = ub && ub.unit === domUnit;
      if (aIn && bIn) return ua.value - ub.value || priceKey(a, b);
      if (aIn) return -1; // a has a comparable unit price, b doesn't
      if (bIn) return 1;
      // neither is in the dominant unit family -> fall back to price
    }
    return priceKey(a, b);
  };
}

// D4D lists branch/language variants of the SAME flyer offer (same store, same
// price, near-identical OCR name). Collapse them for the grid: within one
// store+price bucket, a listing whose name tokens overlap an already-kept
// listing's by ≥70% is a duplicate.
function dedupeFlyers(listings) {
  const kept = [];
  const buckets = new Map(); // store|price -> [tokenSet]
  for (const l of listings) {
    const key = `${l.store.id}|${l.price}`;
    const toks = new Set(normalizeText(l.name).split(' ').filter(Boolean));
    const seen = buckets.get(key) || [];
    let dup = false;
    for (const prior of seen) {
      let inter = 0;
      for (const t of toks) if (prior.has(t)) inter += 1;
      const union = prior.size + toks.size - inter;
      if (union > 0 && inter / union >= 0.7) {
        dup = true;
        break;
      }
    }
    if (!dup) {
      kept.push(l);
      seen.push(toks);
      buckets.set(key, seen);
    }
  }
  return kept;
}

// --- cards ---------------------------------------------------------------------
// The store badge every card carries — the source is metadata, shown the same
// lightweight way for both worlds.
function storeBadge(label, color, flyerTag) {
  const row = el('div', 'card-store');
  const dot = el('span', 'chip-dot');
  dot.style.background = color;
  row.appendChild(dot);
  row.appendChild(el('span', 'card-store-name', label));
  if (flyerTag) row.appendChild(el('span', 'card-src-flyer', flyerTag));
  return row;
}

function cardImage(src, alt) {
  const imgWrap = el('div', 'card-img');
  if (src) {
    const img = new Image();
    img.loading = 'lazy';
    img.alt = alt || '';
    img.src = src;
    img.addEventListener('error', () => imgWrap.classList.add('no-img'));
    imgWrap.appendChild(img);
  } else {
    imgWrap.classList.add('no-img');
  }
  return imgWrap;
}

function priceRow(price, oldPrice, currency, discountLabel, up) {
  const prices = el('div', 'card-prices');
  if (price != null) {
    prices.appendChild(el('span', 'price', money(price, currency)));
    if (oldPrice != null) prices.appendChild(el('span', 'old-price', money(oldPrice, currency)));
    if (discountLabel) prices.appendChild(el('span', 'discount', discountLabel));
    const upLabel = unitPriceLabel({ up });
    if (upLabel) prices.appendChild(el('span', 'unit-price', upLabel));
  } else {
    prices.appendChild(el('span', 'no-price', 'Tap to see price'));
  }
  return prices;
}

function onlineCard(store, item) {
  const a = el('a', 'card');
  // Only navigate when the result carries a real absolute product URL — never
  // send the user to a broken/relative href (a card should always lead exactly
  // where it says, or stay put).
  const href = typeof item.link === 'string' && /^https?:\/\//.test(item.link) ? item.link : null;
  if (href) {
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
  }

  // Watch bell: one tap sets a target-price watch on THIS product (the engine
  // re-finds it daily by its stable result id — Keepa-style monitoring).
  if (item.id != null && item.price != null) {
    const bell = el('button', 'card-watch', '🔔');
    bell.type = 'button';
    bell.title = 'Watch this product’s price';
    bell.setAttribute('aria-label', `Watch the price of ${item.name}`);
    bell.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openWatchDialog({
        kind: 'product',
        provider: store.id,
        productId: String(item.id),
        query: watchQueryFor(item),
        label: item.name,
        suggestedPrice: item.price,
        currentPrice: item.price,
        link: item.link,
        image: item.image,
      });
    });
    a.appendChild(bell);
  }

  a.appendChild(cardImage(item.image, item.name));

  const body = el('div', 'card-body');
  body.appendChild(storeBadge(store.label, store.color));
  const name = el('div', 'card-name', item.name);
  name.dir = 'auto';
  body.appendChild(name);
  const meta = [item.brand, item.size].filter(Boolean).join(' · ');
  if (meta) body.appendChild(el('div', 'card-meta', meta));
  body.appendChild(priceRow(item.price, item.oldPrice, item.currency, item.discountLabel, unitPrice(item)));
  a.appendChild(body);
  return a;
}

function flyerCard(listing) {
  const offer = listing.offer;
  const card = el('button', 'card card-flyer');
  card.type = 'button';
  const displayName = listing.name;
  card.title = `${displayName} — flyer price, tap to verify on the flyer`;

  card.appendChild(cardImage(offer.imageUrl, displayName));

  const body = el('div', 'card-body');
  const until = offer.validTo ? `flyer · until ${fmtDateShort(offer.validTo)}` : 'flyer';
  body.appendChild(storeBadge(storeLabel(offer.store), storeColor(offer.store), until));
  const name = el('div', 'card-name', displayName);
  name.dir = 'auto';
  body.appendChild(name);
  body.appendChild(priceRow(offer.price, offer.oldPrice, offer.currency, '', listing.up));
  card.appendChild(body);

  card.addEventListener('click', async () => {
    // Prefer the in-app viewer when the engine holds this offer's edition —
    // the user never leaves Super Search (the viewer handles page images AND
    // stored PDFs); otherwise the offer's flyer page.
    const b = await brochureForOffer(offer).catch(() => null);
    if (b && (b.sourceType === 'images' || b.sourceType === 'pdf')) {
      // Open the in-app viewer ON this offer's own flyer page (pageRef is the
      // aggregator page id); the viewer falls back to page 1 if it's unknown.
      openBrochureViewer(b, storeLabel(offer.store), { targetPageId: offer.pageRef });
    } else if (offer.sourceUrl) {
      window.open(offer.sourceUrl, '_blank', 'noopener,noreferrer');
    }
  });
  return card;
}

// --- the factory -----------------------------------------------------------------
// createMarketplace(root, stores, query) renders the strip + grid into `root`
// and returns handles the search flow feeds as sources answer.
export function createMarketplace(root, stores, query = '', opts = {}) {
  const qFam = queryFamily(query);
  let sort = opts.sort === 'value' ? 'value' : 'price';
  const onSort = typeof opts.onSort === 'function' ? opts.onSort : () => {};
  // Sources strip: one status chip per selected store (+ its flyer chip slot),
  // plus one chip for this week's flyer offers.
  const strip = el('div', 'sources-strip');
  const chips = new Map();
  for (const s of stores) {
    const chip = el('span', 'src-chip is-loading');
    const dot = el('span', 'chip-dot');
    dot.style.background = s.color;
    chip.appendChild(dot);
    chip.appendChild(el('span', 'src-name', s.label));
    const state = el('span', 'src-state', '…');
    chip.appendChild(state);
    const flyerSlot = el('span', 'store-flyer-slot');
    chip.appendChild(flyerSlot);
    strip.appendChild(chip);
    chips.set(s.id, { chip, state, flyerSlot });
  }
  const flyerChip = el('span', 'src-chip src-chip-flyers is-loading');
  flyerChip.appendChild(el('span', null, '📄'));
  flyerChip.appendChild(el('span', 'src-name', "This week's flyers"));
  const flyerState = el('span', 'src-state', '…');
  flyerChip.appendChild(flyerState);
  strip.appendChild(flyerChip);
  root.appendChild(strip);

  // The grid.
  const section = el('section', 'market');
  const head = el('div', 'market-head');
  head.appendChild(el('span', 'market-title', 'All offers'));
  const count = el('span', 'market-count', '…');
  head.appendChild(count);

  // Ranking control (milestone objective 1): switch the grid between "Lowest
  // price" (default) and "Best value" (price per comparable unit). A11y: a radio
  // group so it reads as one control with two mutually-exclusive options.
  const sortWrap = el('div', 'sort-toggle');
  sortWrap.setAttribute('role', 'radiogroup');
  sortWrap.setAttribute('aria-label', 'Rank results by');
  const sortButtons = {};
  const SORTS = [
    ['price', 'Lowest price'],
    ['value', 'Best value'],
  ];
  for (const [mode, label] of SORTS) {
    const b = el('button', 'sort-opt', label);
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.sort = mode;
    b.setAttribute('aria-checked', String(sort === mode));
    b.classList.toggle('is-active', sort === mode);
    b.addEventListener('click', () => {
      if (sort === mode) return;
      sort = mode;
      for (const [m, btn] of Object.entries(sortButtons)) {
        const on = m === mode;
        btn.setAttribute('aria-checked', String(on));
        btn.classList.toggle('is-active', on);
      }
      onSort(mode);
      render();
    });
    sortButtons[mode] = b;
    sortWrap.appendChild(b);
  }
  head.appendChild(sortWrap);
  section.appendChild(head);
  const body = el('div', 'market-body');
  const skeleton = el('div', 'results-grid');
  for (let i = 0; i < 4; i++) {
    const c = el('div', 'skeleton-card');
    c.innerHTML = '<div class="sk-img sk"></div><div class="sk-line sk"></div><div class="sk-line sk"></div>';
    skeleton.appendChild(c);
  }
  body.appendChild(skeleton);
  section.appendChild(body);
  root.appendChild(section);

  const pool = [];
  let expanded = false;
  let finished = false;

  function render() {
    pool.sort(makeComparator(qFam, sort, sort === 'value' ? dominantUnit(pool) : null));
    count.textContent = String(pool.length);
    body.innerHTML = '';
    if (!pool.length) {
      if (finished) {
        body.appendChild(el('div', 'store-note', 'No matching offers found in any source.'));
      } else {
        body.appendChild(skeleton);
      }
      return;
    }
    const grid = el('div', 'results-grid');
    const visible = expanded ? pool : pool.slice(0, DEFAULT_VISIBLE);
    for (const e of visible) {
      grid.appendChild(e.kind === 'online' ? onlineCard(e.store, e.it) : flyerCard(e.listing));
    }
    body.appendChild(grid);
    if (pool.length > DEFAULT_VISIBLE) {
      const btn = el('button', 'show-all', expanded ? 'Show fewer' : `Show all ${pool.length} offers`);
      btn.type = 'button';
      btn.setAttribute('aria-expanded', String(expanded));
      btn.addEventListener('click', () => {
        expanded = !expanded;
        render();
      });
      body.appendChild(btn);
    }
  }

  return {
    // A store answered with its RELEVANT (ranked) items; `hidden` counts the
    // unrelated results that were filtered out — surfaced, never dumped.
    addOnline(store, items, hidden = 0) {
      for (const it of items) pool.push({ kind: 'online', store, it });
      const c = chips.get(store.id);
      if (c) {
        c.chip.classList.remove('is-loading');
        c.state.textContent = items.length ? String(items.length) : 'no matches';
        if (!items.length) c.chip.classList.add('is-empty');
        if (hidden > 0) c.chip.title = `${hidden} unrelated result${hidden === 1 ? '' : 's'} hidden`;
      }
      render();
    },
    failStore(store, bestEffort) {
      const c = chips.get(store.id);
      if (c) {
        c.chip.classList.remove('is-loading');
        c.chip.classList.add('is-failed');
        c.state.textContent = bestEffort ? 'temporarily unavailable' : 'unreachable';
      }
      render();
    },
    // This week's flyer offers (compare.js flyerListings — already gated);
    // branch/language duplicates of the same offer collapse to one card.
    addFlyers(listings) {
      const unique = dedupeFlyers(listings);
      for (const l of unique) pool.push({ kind: 'flyer', listing: l });
      flyerChip.classList.remove('is-loading');
      flyerState.textContent = unique.length ? `${unique.length} offers` : 'no matches';
      if (!unique.length) flyerChip.classList.add('is-empty');
      render();
    },
    flyersUnavailable() {
      flyerChip.classList.remove('is-loading');
      flyerChip.classList.add('is-empty');
      flyerState.textContent = 'unavailable';
      render();
    },
    flyerSlot(storeId) {
      const c = chips.get(storeId);
      return c ? c.flyerSlot : null;
    },
    finish() {
      finished = true;
      render();
    },
    get size() {
      return pool.length;
    },
  };
}
