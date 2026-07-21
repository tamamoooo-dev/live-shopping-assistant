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
import { unitPrice, productFamily, productType, queryFamily, freshProduceIntent, isProcessedProduce, producePresence, normalizeText, matchStage, queryTokens, stageBand } from './match.js';
import { featuredScore, featuredContext, recordChoice, isPrimaryPriceTier } from './featured.js';
import { unitPriceLabel } from './compare.js';
import { openWatchDialog } from './alertsPage.js';
import { addToCart } from './cart.js';
import { t, tn } from './i18n.js';

const DEFAULT_VISIBLE = 12;

// The card-building primitives (el/money/cardImage/priceRow/storeBadge) and
// the flyer-offer tap-through are EXPORTED: the Browse page composes its cards
// from these same pieces, so there is exactly one card idiom and one "open an
// offer" behaviour in the app (BROWSE-DESIGN.md §8 — reuse, never reimplement).
export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function money(value, currency = 'SAR') {
  return value == null ? '' : `${Number(value).toFixed(2)} ${currency}`;
}

export function fmtDateShort(iso) {
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
// The view-filter also has one cross-store selector: this week's flyer offers.
// It reuses the exact same activeStore/toggle/render path as the store chips,
// keyed by this sentinel instead of a store id.
const FLYERS_FILTER = '__flyers__';
function entryMatchesFilter(e, filter) {
  return filter === FLYERS_FILTER ? e.kind === 'flyer' : entryStoreId(e) === filter;
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
// Part of the search engine's ranking (makeComparator) — every perspective
// keeps these bands (Lowest price collapses only the STAGE key, never these).
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
// Three ranking perspectives the user can switch between:
//   • 'price'    — PRICE-FIRST, **LOCKED** (user directive 2026-07-16, see
//     featured.js isPrimaryPriceTier): exactly TWO tiers. Genuine matches of
//     the queried product are ordered by PRICE ALONE — "milk 1 riyal comes
//     before milk 3 riyals no matter how identical the 3-riyal milk is to the
//     search criteria" — and the related tail (weak/flavour/known-different-
//     family matches) follows. Never split the genuine tier by any exactness
//     signal again unless the user explicitly asks.
//   • 'value'    — best price per comparable unit first (what the comparison
//     engine already reasons about). Value is only fair WITHIN one unit family,
//     so the ranking compares per-unit prices only among entries in the pool's
//     dominant unit (the one shared by the most sized entries); everything else
//     falls back to price, after the unit-ranked block.
//   • 'featured' — the INTELLIGENT perspective (featured.js): within each
//     quality group, products carrying meaningful category-aware signals
//     (organic/local/known produce brands/…), priced where the market expects,
//     and matching learned user preferences rise first. An intelligence layer
//     above the engine — it can never promote past a better stage or band.
// Match quality always comes first (stage → family band), so strong matches
// stay together and a cheap look-alike never outranks the real product in ANY
// perspective — the transition to related products is driven by match quality,
// never by an arbitrary numeric window.
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
// The entry's advertised discount fraction (0..1), or 0 when there is no real
// strike-through price. Honest by construction: only a "was" price HIGHER than
// the current price counts — the same gate the engine's Offer contract applies.
function entryDiscount(e) {
  if (e._disc === undefined) {
    const p = entryPrice(e);
    const old = e.kind === 'online' ? e.it.oldPrice : e.listing.oldPrice;
    e._disc = p != null && old != null && old > p ? (old - p) / old : 0;
  }
  return e._disc;
}
// The entry's Featured score (featured.js) — computed against a per-render
// context (expected price + learned preferences) and cached on the entry until
// the next Featured render (learning can change between renders).
function entryFeatured(e, ctx) {
  if (e._feat === undefined || e._featCtx !== ctx) {
    e._featCtx = ctx;
    e._feat = featuredScore(
      {
        text: entryText(e),
        brand: e.kind === 'online' ? e.it.brand : '',
        family: entryFamily(e),
        price: entryPrice(e),
        discount: entryDiscount(e),
      },
      ctx,
    );
  }
  return e._feat;
}
// makeComparator — the SEARCH ENGINE's ordering. Relevance backbone first
// (Search-Roadmap stage → family band) in EVERY perspective — strong matches
// stay together and related products only begin where match quality genuinely
// drops. Within a quality group the chosen perspective orders: price ascending
// (Lowest price — its stage key compares at the 'primary' band so price leads
// among genuine matches), per-unit value (Best value), or the Featured score.
function makeComparator(query, qFam, freshFam, sort, domUnit, featCtx) {
  const multiWord = queryTokens(query).length > 1;
  return (a, b) => {
    if (sort === 'price') {
      // THE LOCKED CONTRACT (featured.js isPrimaryPriceTier): genuine matches
      // by price alone, then the related tail (which keeps the quality
      // backbone so a known look-alike still sits at the very bottom).
      const ga = isPrimaryPriceTier(entryStage(a, query), multiWord, entryBand(a, qFam, freshFam), qFam);
      const gb = isPrimaryPriceTier(entryStage(b, query), multiWord, entryBand(b, qFam, freshFam), qFam);
      if (ga !== gb) return ga ? -1 : 1;
      if (ga) return priceKey(a, b); // tier 1: PRICE ALONE — never split further
      const stage =
        stageBand(entryStage(b, query), multiWord, 'primary') -
        stageBand(entryStage(a, query), multiWord, 'primary');
      if (stage) return stage;
      const tailBand = entryBand(b, qFam, freshFam) - entryBand(a, qFam, freshFam);
      if (tailBand) return tailBand;
      return priceKey(a, b);
    }
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
    if (sort === 'featured' && featCtx) {
      const f = entryFeatured(b, featCtx) - entryFeatured(a, featCtx);
      if (f) return f;
      return priceKey(a, b); // equal intelligence: cheapest first
    }
    return priceKey(a, b); // 'price' and value's fallback: lowest total first
  };
}

// The per-card match-tier badge (UX layer — explains WHY a card sits where it
// does, without touching ranking). It reads the SAME keys the comparator sorts
// on: a product of a different identity than the query family (chocolate milk
// for a "milk" search, ketchup for "tomato") reads "Related" — this is exactly
// why a cheaper look-alike sits below a pricier exact product in every sort.
// Otherwise the Search-Roadmap stage decides: all query terms present →
// "Best match", strong-but-partial → "Close match", weaker → "Related".
function matchBadge(e, query, qFam, freshFam) {
  if (qFam && entryBand(e, qFam, freshFam) <= 0) return { cls: 'related', text: t('market.badge.related') };
  const stage = entryStage(e, query);
  if (stage >= 4) return { cls: 'best', text: t('market.badge.best') };
  if (stage === 3) return { cls: 'close', text: t('market.badge.close') };
  return { cls: 'related', text: t('market.badge.related') };
}

// Entries whose per-unit price is implausible against their unit family's pool
// median (>6× off, the same OUTLIER_FACTOR the comparison engine uses) — those
// are size-parse errors, not bargains, and their unit-price label must not be
// displayed. Needs ≥3 sized entries in a family to judge; below that we can't
// tell the outlier from the median, so nothing is suppressed.
function unitOutliers(pool) {
  const byUnit = new Map();
  for (const e of pool) {
    const u = entryUnit(e);
    if (!u) continue;
    const arr = byUnit.get(u.unit) || [];
    arr.push(e);
    byUnit.set(u.unit, arr);
  }
  const bad = new Set();
  for (const arr of byUnit.values()) {
    if (arr.length < 3) continue;
    const values = arr.map((e) => entryUnit(e).value).sort((a, b) => a - b);
    const median = values[Math.floor(values.length / 2)];
    for (const e of arr) {
      const v = entryUnit(e).value;
      if (v > median * 6 || v < median / 6) bad.add(e);
    }
  }
  return bad;
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
export function storeBadge(label, color, flyerTag) {
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

export function cardImage(src, alt) {
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

export function priceRow(price, oldPrice, currency, discountLabel, up) {
  const prices = el('div', 'card-prices');
  if (price != null) {
    prices.appendChild(el('span', 'price', money(price, currency)));
    if (oldPrice != null) prices.appendChild(el('span', 'old-price', money(oldPrice, currency)));
    if (discountLabel) prices.appendChild(el('span', 'discount', discountLabel));
    const upLabel = unitPriceLabel({ up });
    if (upLabel) prices.appendChild(el('span', 'unit-price', upLabel));
  } else {
    prices.appendChild(el('span', 'no-price', t('market.tapForPrice')));
  }
  return prices;
}

function onlineCard(store, item, badge, up) {
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

  // Add to Cart: one tap puts THIS product on the local shopping list (same
  // list the flyer viewer's sheet feeds), no page-leaving detour required.
  if (item.id != null && item.price != null) {
    const cartBtn = el('button', 'card-watch card-cart', '🛒');
    cartBtn.type = 'button';
    cartBtn.title = t('market.addCart');
    cartBtn.setAttribute('aria-label', t('market.addCartAria', { name: item.name }));
    cartBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      addToCart({
        id: `${store.id}:${item.id}`,
        store: store.id,
        name: item.name,
        nameAr: null,
        price: item.price,
        oldPrice: item.oldPrice ?? null,
        currency: item.currency || 'SAR',
        image: item.image || null,
        sourceUrl: href,
        validTo: null,
      });
      cartBtn.textContent = '✓';
      cartBtn.classList.add('is-added');
      setTimeout(() => {
        if (!cartBtn.isConnected) return;
        cartBtn.textContent = '🛒';
        cartBtn.classList.remove('is-added');
      }, 1200);
    });
    a.appendChild(cartBtn);
  }

  // Watch bell: one tap sets a target-price watch on THIS product.
  //   • Amazon — an exact-product watch: the engine re-finds THAT listing daily
  //     by its stable id (Keepa-style). Marketplace SKUs have no cross-store
  //     equivalent, so this behaviour is preserved exactly.
  //   • every other store — a cross-store watch: we keep the product identity
  //     (query + name + size) but let the engine super-search ALL stores and
  //     this week's flyers daily and take the lowest trustworthy price, exactly
  //     like the summary's "Watch price". One bell, best price everywhere.
  if (item.id != null && item.price != null) {
    const bell = el('button', 'card-watch', '🔔');
    bell.type = 'button';
    const exact = store.id === 'amazon';
    bell.title = exact ? t('market.watchExact') : t('market.watchCross');
    bell.setAttribute('aria-label', t('market.watchAria', { name: item.name }));
    bell.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openWatchDialog(
        exact
          ? {
              kind: 'product',
              provider: store.id,
              productId: String(item.id),
              query: watchQueryFor(item),
              label: item.name,
              suggestedPrice: item.price,
              currentPrice: item.price,
              link: item.link,
              image: item.image,
            }
          : {
              kind: 'grocery',
              query: watchQueryFor(item),
              label: item.name,
              // Reference size for the engine's size gate — name usually carries
              // it (e.g. "…1kg"); fold in the explicit size field when present.
              sizeText: [item.name, item.size].filter(Boolean).join(' '),
              suggestedPrice: item.price,
              currentPrice: item.price,
              link: item.link,
              image: item.image,
            },
      );
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
  body.appendChild(priceRow(item.price, item.oldPrice, item.currency, item.discountLabel, up));
  a.appendChild(body);
  return a;
}

function flyerCard(listing, badge, up) {
  const offer = listing.offer;
  // A div with button semantics, NOT a <button>: the card carries its own
  // Add-to-Cart <button> and buttons cannot nest. Same keyboard contract.
  const card = el('div', 'card card-flyer');
  card.setAttribute('role', 'button');
  card.tabIndex = 0;
  const displayName = listing.name;
  card.title = t('market.flyerCardTitle', { name: displayName });

  // Add to Cart — the same one-tap gesture online cards have (consistent
  // regardless of source). Same id as the viewer sheet's add (offer.id), so
  // quantities merge whichever path added the product.
  const cartBtn = el('button', 'card-watch card-cart', '🛒');
  cartBtn.type = 'button';
  cartBtn.title = t('market.addCart');
  cartBtn.setAttribute('aria-label', t('market.addCartAria', { name: displayName }));
  cartBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    addToCart({
      id: offer.id,
      store: offer.store,
      name: offer.name || null,
      nameAr: offer.nameAr || null,
      price: offer.price,
      oldPrice: offer.oldPrice ?? null,
      currency: offer.currency || 'SAR',
      image: offer.imageUrl || null,
      sourceUrl: offer.sourceUrl || null,
      validTo: offer.validTo || null,
    });
    cartBtn.textContent = '✓';
    cartBtn.classList.add('is-added');
    setTimeout(() => {
      if (!cartBtn.isConnected) return;
      cartBtn.textContent = '🛒';
      cartBtn.classList.remove('is-added');
    }, 1200);
  });
  card.appendChild(cartBtn);

  card.appendChild(cardImage(offer.imageUrl, displayName));

  const body = el('div', 'card-body');
  if (badge) body.appendChild(matchChip(badge));
  const until = offer.validTo ? t('market.flyerUntil', { date: fmtDateShort(offer.validTo) }) : t('market.flyerTag');
  body.appendChild(storeBadge(storeLabel(offer.store), storeColor(offer.store), until));
  const name = el('div', 'card-name', displayName);
  name.dir = 'auto';
  body.appendChild(name);
  body.appendChild(priceRow(offer.price, offer.oldPrice, offer.currency, '', up));
  card.appendChild(body);

  card.addEventListener('click', () => openFlyerOffer(offer));
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openFlyerOffer(offer);
    }
  });
  return card;
}

// The ONE "open a flyer offer" behaviour (search grid + Browse share it).
// Prefer the in-app viewer when the engine holds this offer's edition — the
// user never leaves Super Search (the viewer handles page images AND stored
// PDFs); it lands on the offer's page (pageRef), flies to the hotspot carrying
// this offerId, pulses it and opens the product sheet — degrading level by
// level (page-only -> page 1) when an older edition lacks the data. Otherwise
// the offer's own flyer page opens externally.
export async function openFlyerOffer(offer) {
  const b = await brochureForOffer(offer).catch(() => null);
  if (b && (b.sourceType === 'images' || b.sourceType === 'pdf')) {
    openBrochureViewer(b, storeLabel(offer.store), {
      targetPageId: offer.pageRef,
      targetOfferId: offer.offerId,
    });
  } else if (offer.sourceUrl) {
    window.open(offer.sourceUrl, '_blank', 'noopener,noreferrer');
  }
}

// --- the factory -----------------------------------------------------------------
// createMarketplace(root, stores, query) renders the strip + grid into `root`
// and returns handles the search flow feeds as sources answer.
export function createMarketplace(root, stores, query = '', opts = {}) {
  const qFam = queryFamily(query);
  const freshFam = freshProduceIntent(query);
  const includeFlyers = opts.includeFlyers !== false;
  let sort = opts.sort === 'value' || opts.sort === 'featured' ? opts.sort : 'price';
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
  let flyerChip = null;
  let flyerState = null;
  if (includeFlyers) {
    flyerChip = el('span', 'src-chip src-chip-flyers is-loading');
    flyerChip.appendChild(el('span', null, '📄'));
    flyerChip.appendChild(el('span', 'src-name', t('market.weeklyFlyers')));
    flyerState = el('span', 'src-state', '…');
    flyerChip.appendChild(flyerState);
    // Interactive filter, consistent with the store chips: toggles the view to
    // this week's flyer offers only. Reachable by keyboard.
    flyerChip.setAttribute('role', 'button');
    flyerChip.tabIndex = 0;
    flyerChip.setAttribute('aria-pressed', 'false');
    flyerChip.addEventListener('click', () => toggleStoreFilter(FLYERS_FILTER));
    flyerChip.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        toggleStoreFilter(FLYERS_FILTER);
      }
    });
    strip.appendChild(flyerChip);
  }
  root.appendChild(strip);

  // The grid.
  const section = el('section', 'market');
  const head = el('div', 'market-head');
  head.appendChild(el('span', 'market-title', t('market.allOffers')));
  const count = el('span', 'market-count', '…');
  head.appendChild(count);

  // Ranking control (milestone objective 1): switch the grid between "Lowest
  // price" (default) and "Best value" (price per comparable unit). A11y: a radio
  // group so it reads as one control with two mutually-exclusive options.
  const sortWrap = el('div', 'sort-toggle');
  sortWrap.setAttribute('role', 'radiogroup');
  sortWrap.setAttribute('aria-label', t('market.rankBy'));
  const sortButtons = {};
  const SORTS = [
    ['price', t('market.lowestPrice')],
    ['value', t('market.bestValue')],
    ['featured', t('market.featured')],
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
    if (activeStore !== id && !pool.some((e) => entryMatchesFilter(e, id))) return;
    activeStore = activeStore === id ? null : id;
    expanded = false; // a freshly-scoped list starts collapsed
    render();
  }

  // Featured's per-render context: the expected market price comes from the
  // PRIMARY matches only (a look-alike's price must not skew what "a banana
  // costs"), learned preferences are re-read so a tap refines the next render.
  function buildFeaturedContext() {
    const multiWord = queryTokens(query).length > 1;
    const primary = pool.filter(
      (e) => stageBand(entryStage(e, query), multiWord, 'primary') >= (multiWord ? 2 : 4),
    );
    return featuredContext(query, primary.map(entryPrice));
  }

  function render() {
    // The search engine produces the ranked list (makeComparator) — quality
    // groups first, the chosen perspective within them. The retailer filter
    // only reduces which entries are shown.
    const ordered = [...pool].sort(
      makeComparator(
        query,
        qFam,
        freshFam,
        sort,
        sort === 'value' ? dominantUnit(pool) : null,
        sort === 'featured' ? buildFeaturedContext() : null,
      ),
    );
    // Unit-price display guard (never show a misleading unit price): per-unit
    // values implausibly far off their unit family's pool median are almost
    // always size-parse errors — suppress the LABEL only (ranking, which uses
    // the same guard logic in compare.js for the headline, is unaffected here;
    // a wrongly-parsed card can rank oddly but never advertises a false rate).
    const upSuppressed = unitOutliers(pool);
    for (const [sid, c] of chips) {
      const has = pool.some((e) => entryStoreId(e) === sid);
      const on = activeStore === sid;
      c.chip.classList.toggle('is-filterable', has);
      c.chip.classList.toggle('is-active', on);
      c.chip.setAttribute('aria-pressed', String(on));
    }
    if (flyerChip) {
      const hasFlyers = pool.some((e) => e.kind === 'flyer');
      const flyersOn = activeStore === FLYERS_FILTER;
      flyerChip.classList.toggle('is-filterable', hasFlyers);
      flyerChip.classList.toggle('is-active', flyersOn);
      flyerChip.setAttribute('aria-pressed', String(flyersOn));
    }
    const view = activeStore ? ordered.filter((e) => entryMatchesFilter(e, activeStore)) : ordered;
    count.textContent = String(view.length);
    subnote.textContent =
      sort === 'value'
        ? t('market.sortedValue')
        : sort === 'featured'
        ? t('market.sortedFeatured')
        : t('market.sortedPrice');
    subnote.hidden = finished && !view.length;
    body.innerHTML = '';
    if (!view.length) {
      if (finished) {
        body.appendChild(
          el(
            'div',
            'store-note',
            activeStore ? t('market.noneFromStore') : t('market.noneAnywhere'),
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
      const badge = matchBadge(e, query, qFam, freshFam);
      const up = upSuppressed.has(e) ? null : entryUnit(e);
      const card = e.kind === 'online' ? onlineCard(e.store, e.it, badge, up) : flyerCard(e.listing, badge, up);
      // Featured LEARNING (featured.js): every real engagement with a card —
      // open, add-to-cart, watch — strengthens this query's relationship with
      // the chosen product's signals/brand. Capture-phase so inner buttons
      // count too; ranking-only, never touches the entry or product data.
      card.addEventListener(
        'click',
        () => recordChoice(query, entryText(e), e.kind === 'online' ? e.it.brand : ''),
        { capture: true },
      );
      grid.appendChild(card);
    }
    body.appendChild(grid);
    if (view.length > DEFAULT_VISIBLE) {
      const btn = el('button', 'show-all', expanded ? t('market.showFewer') : t('market.showAll', { count: view.length }));
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
        c.state.textContent = items.length ? String(items.length) : t('market.state.noMatches');
        if (!items.length) c.chip.classList.add('is-empty');
        if (hidden > 0) c.chip.title = tn('market.hidden', hidden);
      }
      render();
    },
    failStore(store, bestEffort) {
      const c = chips.get(store.id);
      if (c) {
        c.chip.classList.remove('is-loading');
        c.chip.classList.add('is-failed');
        c.state.textContent = bestEffort ? t('market.state.tempUnavailable') : t('market.state.unreachable');
      }
      render();
    },
    // This week's flyer offers (compare.js flyerListings — already gated);
    // branch/language duplicates of the same offer collapse to one card.
    addFlyers(listings) {
      if (!includeFlyers) return 0;
      const unique = dedupeFlyers(listings);
      for (const l of unique) pool.push({ kind: 'flyer', listing: l });
      flyerChip.classList.remove('is-loading');
      flyerState.textContent = unique.length ? t('market.state.offers', { count: unique.length }) : t('market.state.noMatches');
      if (!unique.length) flyerChip.classList.add('is-empty');
      render();
      return unique.length;
    },
    flyersUnavailable() {
      if (!includeFlyers) return 0;
      flyerChip.classList.remove('is-loading');
      flyerChip.classList.add('is-empty');
      flyerState.textContent = t('market.state.unavailable');
      render();
      return 0;
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
