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
//     Search-Roadmap stage, then relevance band, then price, top N with
//     "Show all".
//
// Honesty rules carried over:
//   • Flyer prices are machine-extracted — every flyer card carries the tag
//     and clicks through to the flyer itself (in-app viewer when held).
//   • A store whose results were ALL irrelevant shows "no matches" (with the
//     hidden count) — never a grid full of unrelated products (the "48 chairs
//     from Amazon" failure mode).

import { openBrochureViewer } from './viewer.js';
import { brochureForOffer, storeLabel, storeColor } from './brochure.js';
import { unitPrice, productFamily, productType, queryFamily, freshProduceIntent, isProcessedProduce, producePresence, normalizeText, matchStage } from './match.js';
import { unitPriceLabel } from './compare.js';
import { openWatchDialog } from './alertsPage.js';

const DEFAULT_VISIBLE = 12;
// Lowest price is a presentation transform: only the first PRICE_SORT_WINDOW of
// the engine's ranked list are reordered by price; the rest stay as ranked.
// Single tunable knob — nothing else about Lowest price depends on the value.
const PRICE_SORT_WINDOW = 20;

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
// The store id an entry belongs to — the only key the retailer view-filter
// needs. Both worlds already carry it (online store, flyer listing.store).
function entryStoreId(e) {
  return e.kind === 'online' ? e.store.id : e.listing.store && e.listing.store.id;
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
// The full text an entry is classified over (flyer OCR names are bilingual —
// the form/processing word often lands in only one language).
function entryText(e) {
  if (e.kind === 'online') return e.it.name || '';
  const o = e.listing.offer;
  return o ? `${o.name || ''} ${o.nameAr || ''}` : e.listing.name || '';
}
// The Search Roadmap stage (match.js matchStage) — the FIRST ranking key.
// Deterministic: respect the user's words before any other signal. Single word:
// primary product-name matches before flavour/ingredient/scent look-alikes.
// Multi word: every query term is mandatory (exact phrase > all whole-word >
// all matched) before the engine gradually relaxes to partial matches — a
// cheap same-family product missing a term ("حليب نادك" for "حليب المراعي")
// can never outrank a full match, however good its family band or price.
// Family bands and price order only WITHIN a stage.
function entryStage(e, query) {
  if (e._stage === undefined) {
    e._stage =
      e.kind === 'online'
        ? matchStage(e.it, query)
        : matchStage({ name: entryText(e), brand: '' }, query);
  }
  return e._stage;
}
// Relevance bands keep ranking stable across sources with different name
// quality (store catalogues vs flyer OCR): strong (whole-word tier) > good >
// weak; price orders within a band, so the best deals surface naturally.
// When the QUERY names a product family ("بيض" -> eggs, "طماطم" -> tomato),
// entries CONFIRMED to be that family take the top band (fresh tomatoes above
// every tomato-paste/ketchup look-alike, however cheap), entries of a KNOWN
// different family drop to the bottom band, and family-less entries rank by
// lexical strength in between — mirrors the engine /offers famRank tiering.
// A bare produce query additionally means FRESH (freshFam): a same-family
// entry with a FORM word ("رول فراولة" — a cake roll the lexicon can't see)
// drops to the bottom, a processed one (frozen/canned/peeled) to the middle;
// "فراولة مجمدة" as the query switches this off.
// Part of the search engine's ranking (makeComparator). Lowest price never
// calls this — it only reorders the ranked list's OUTPUT by price. The taxonomy
// family/identity bands are left exactly as-is.
function entryBand(e, qFam, freshFam) {
  if (qFam) {
    const f = entryFamily(e);
    if (f === qFam) {
      if (freshFam === qFam) {
        if (e._ptype === undefined) e._ptype = productType(entryText(e));
        if (e._ptype) return 0;
        if (e._proc === undefined) e._proc = isProcessedProduce(entryText(e));
        if (e._proc) return 2;
      }
      return 3;
    }
    if (f) return 0;
    // family-less but the produce appears only as a FLAVOUR ("مصاصات
    // بالفراولة" whose head noun escaped the lexicon) -> bottom band
    if (freshFam) {
      if (e._flav === undefined) e._flav = producePresence(entryText(e), freshFam) === 'flavored';
      if (e._flav) return 0;
    }
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
// makeComparator — the SEARCH ENGINE's ordering, the ranked list both views
// build on. Relevance backbone first (Search-Roadmap stage → family band). In
// Best value it then orders by best price per comparable unit; otherwise it is
// pure relevance (… → score). Price is NOT a ranking key here — Lowest price
// applies it separately as a presentation transform (transformTopPriceWindow).
function makeComparator(query, qFam, freshFam, sort, domUnit) {
  return (a, b) => {
    const stage = entryStage(b, query) - entryStage(a, query);
    if (stage) return stage;
    const band = entryBand(b, qFam, freshFam) - entryBand(a, qFam, freshFam);
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
    // Best value's tiebreak is price; the relevance ranking ends on score.
    return sort === 'value' ? priceKey(a, b) : entryRel(b) - entryRel(a);
  };
}

// transformTopPriceWindow — presentation-only. Given the engine's ranked array,
// stable-sort ONLY its first `window` entries by current price ascending and
// append the remainder untouched. It knows nothing about HOW the ranking was
// produced (no stage, band, family, taxonomy or query parsing) — it operates
// solely on the ranked list and each entry's price. Array.prototype.sort is
// stable, so equal or missing prices keep the engine's order.
function priceAscending(a, b) {
  const pa = entryPrice(a);
  const pb = entryPrice(b);
  if (pa == null && pb == null) return 0;
  if (pa == null) return 1; // no price -> after priced entries
  if (pb == null) return -1;
  return pa - pb;
}
function transformTopPriceWindow(ranked, window) {
  const head = ranked.slice(0, window).sort(priceAscending);
  return head.concat(ranked.slice(window));
}

// The per-card match-tier badge (UX layer — explains WHY a card sits where it
// does, without touching ranking). It reads the SAME keys the comparator sorts
// on: a product of a different identity than the query family (chocolate milk
// for a "milk" search, ketchup for "tomato") reads "Related" — this is exactly
// why a cheaper look-alike can appear below a pricier exact product in Lowest
// price. Otherwise the Search-Roadmap stage decides: all query terms present →
// "Best match", strong-but-partial → "Close match", weaker → "Related".
function matchBadge(e, query, qFam, freshFam, priceMode) {
  // Reflects the grouping the current sort uses, so the badge never contradicts
  // the order. Lowest price groups by stage only, so the badge is purely
  // stage-based; Best value still groups by family band, so a different-identity
  // product reads "Related".
  if (!priceMode && qFam && entryBand(e, qFam, freshFam) <= 0) return { cls: 'related', text: 'Related' };
  const stage = entryStage(e, query);
  if (stage >= 4) return { cls: 'best', text: 'Best match' };
  if (stage === 3) return { cls: 'close', text: 'Close match' };
  return { cls: 'related', text: 'Related' };
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

// The compact match-tier chip (B) — sits at the top of the card body.
function matchChip(badge) {
  return el('span', `card-match ${badge.cls}`, badge.text);
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

function onlineCard(store, item, badge) {
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
  if (badge) body.appendChild(matchChip(badge));
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

function flyerCard(listing, badge) {
  const offer = listing.offer;
  const card = el('button', 'card card-flyer');
  card.type = 'button';
  const displayName = listing.name;
  card.title = `${displayName} — flyer price, tap to verify on the flyer`;

  card.appendChild(cardImage(offer.imageUrl, displayName));

  const body = el('div', 'card-body');
  if (badge) body.appendChild(matchChip(badge));
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
  const freshFam = freshProduceIntent(query);
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
    // Interactive retailer filter: the chip toggles this store as the sole
    // view. Reachable by keyboard; the flyer chip inside it stops propagation
    // so opening a flyer never also flips the filter.
    chip.setAttribute('role', 'button');
    chip.tabIndex = 0;
    chip.setAttribute('aria-pressed', 'false');
    chip.addEventListener('click', () => toggleStoreFilter(s.id));
    chip.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        toggleStoreFilter(s.id);
      }
    });
    flyerSlot.addEventListener('click', (ev) => ev.stopPropagation());
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
  // Ranking explainer (A): one honest line that the grid is grouped by match
  // quality first, then priced within — so a pricier exact product above a
  // cheaper look-alike reads as intended, not as a broken price sort.
  const subnote = el('div', 'market-subnote');
  section.appendChild(subnote);
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
  // Retailer view-filter (Feature 1): a single selected store id, or null for
  // all. Purely a view reducer over the already-ranked+deduped pool — it never
  // triggers a search, re-ranks, or mutates any entry.
  let activeStore = null;

  // Toggle the retailer view-filter. Selecting the already-active store clears
  // it (back to all). Stores that contributed no entries aren't selectable.
  function toggleStoreFilter(id) {
    if (activeStore !== id && !pool.some((e) => entryStoreId(e) === id)) return;
    activeStore = activeStore === id ? null : id;
    expanded = false; // a freshly-scoped list starts collapsed
    render();
  }

  function render() {
    // The search engine produces the ranked list (makeComparator); Best value
    // uses it directly, Lowest price is a presentation transform over it. The
    // retailer filter only reduces which entries are shown.
    const ranked = [...pool].sort(
      makeComparator(query, qFam, freshFam, sort, sort === 'value' ? dominantUnit(pool) : null),
    );
    const ordered = sort === 'value' ? ranked : transformTopPriceWindow(ranked, PRICE_SORT_WINDOW);
    for (const [sid, c] of chips) {
      const has = pool.some((e) => entryStoreId(e) === sid);
      const on = activeStore === sid;
      c.chip.classList.toggle('is-filterable', has);
      c.chip.classList.toggle('is-active', on);
      c.chip.setAttribute('aria-pressed', String(on));
    }
    const view = activeStore ? ordered.filter((e) => entryStoreId(e) === activeStore) : ordered;
    count.textContent = String(view.length);
    subnote.textContent =
      sort === 'value' ? 'Best matches • sorted by best value' : 'Best matches • sorted by lowest price';
    subnote.hidden = finished && !view.length;
    body.innerHTML = '';
    if (!view.length) {
      if (finished) {
        body.appendChild(
          el(
            'div',
            'store-note',
            activeStore ? 'No matching offers from this store.' : 'No matching offers found in any source.',
          ),
        );
      } else {
        body.appendChild(skeleton);
      }
      return;
    }
    const grid = el('div', 'results-grid');
    const visible = expanded ? view : view.slice(0, DEFAULT_VISIBLE);
    for (const e of visible) {
      const badge = matchBadge(e, query, qFam, freshFam, sort === 'price');
      grid.appendChild(e.kind === 'online' ? onlineCard(e.store, e.it, badge) : flyerCard(e.listing, badge));
    }
    body.appendChild(grid);
    if (view.length > DEFAULT_VISIBLE) {
      const btn = el('button', 'show-all', expanded ? 'Show fewer' : `Show all ${view.length} offers`);
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
