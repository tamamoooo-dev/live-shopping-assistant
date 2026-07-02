// compare.js — the Price Comparison Engine (pure logic, no DOM/network).
//
// One question, answered honestly: "what is the genuinely best buying
// opportunity for this query, across EVERY source we can see?" — the live
// online stores AND the physical stores' flyer offers, compared in one model
// (the user should never have to think about where a result comes from).
//
// THE CORE FIX this module exists for: the best buy is decided by VALUE, not
// by the smallest number on the page. A 30-egg tray at 18 SAR (0.60/egg) beats
// a 6-pack at 5 SAR (0.83/egg) even though 5 < 18 — so when sizes are known,
// the recommendation is the best PER-UNIT price, with the lowest total price
// still shown as its own honest option ("if you need less").
//
// TRUST RULES (why the output can be believed):
//   • Only relevant results compete (match.js relevance + isRelevant).
//   • Unit prices are compared only within the same unit family (SAR/L never
//     races SAR/kg), and a median-based outlier guard drops per-unit values
//     that are implausible (>6× off the family median) — those are almost
//     always size-parse errors, and one bad parse must never become the
//     headline recommendation.
//   • A strong "same product at N stores" claim still requires a confident
//     equivalence group (same brand + size, ≥2 stores) — flyer offers never
//     join those groups (OCR names carry no reliable brand).
//   • Flyer-sourced listings stay clearly labelled: prices are machine-
//     extracted from flyer images, so the model marks them and the UI keeps
//     the "verify on the flyer" framing.
//
// computeComparison() returns a plain model; summary.js renders it.

import { unitPrice, sizeLabel, parseSize, groupEquivalents, isRelevant, relevance } from './match.js';

const REL_FLOOR = 30; // ignore weak/look-alike matches when picking the best
const VALUE_MARGIN = 0.9; // best-value must beat the cheapest's unit price by >10%
const OUTLIER_FACTOR = 6; // unit prices >6× off the family median are parse noise

// --- listings: one normalized shape for both worlds ----------------------------
// online tagged: [{ store: {id,label,color}, it: NormalizedResult }]
// flyer offers:  engine Offer docs (name/nameAr/price/oldPrice/sourceUrl/…)
export function onlineListing(t, query) {
  const it = t.it;
  if (!it || it.price == null) return null;
  if (!isRelevant(it, query)) return null;
  it._size = it._size || parseSize(it.name, it.size);
  it._rel = it._rel != null ? it._rel : relevance(it, query);
  if (it._rel < REL_FLOOR) return null;
  return {
    source: 'online',
    store: t.store,
    name: it.name,
    brand: it.brand || '',
    price: it.price,
    oldPrice: it.oldPrice ?? null,
    currency: it.currency || 'SAR',
    link: it.link || null,
    size: it._size,
    up: unitPrice(it),
    rel: it._rel,
    it,
  };
}

export function flyerListing(offer, query, storeLabelFn = (x) => x) {
  if (!offer || offer.price == null) return null;
  const name = offer.name || offer.nameAr;
  if (!name) return null; // no display name -> not comparable material
  const probe = { name, brand: '', size: '' };
  if (!isRelevant(probe, query)) return null;
  const rel = relevance(probe, query);
  if (rel < REL_FLOOR) return null;
  const size = parseSize(`${offer.name || ''} ${offer.nameAr || ''}`, '');
  const item = { name, price: offer.price, _size: size };
  return {
    source: 'flyer',
    store: { id: offer.store, label: storeLabelFn(offer.store) },
    name,
    brand: '',
    price: offer.price,
    oldPrice: offer.oldPrice ?? null,
    currency: offer.currency || 'SAR',
    link: offer.sourceUrl || null,
    size,
    up: unitPrice(item),
    rel,
    offer,
  };
}

// --- unit-value analysis ---------------------------------------------------------
// The best per-unit listing within the DOMINANT unit family, with the outlier
// guard applied. Returns { best, family, unit, dropped } or null when fewer
// than two sized listings share a family (no fair value comparison exists).
export function bestValueAnalysis(listings) {
  const sized = listings.filter((l) => l.up);
  if (sized.length < 2) return null;
  const byUnit = new Map();
  for (const l of sized) {
    const arr = byUnit.get(l.up.unit) || [];
    arr.push(l);
    byUnit.set(l.up.unit, arr);
  }
  let family = null;
  for (const arr of byUnit.values()) {
    if (!family || arr.length > family.length) family = arr;
  }
  if (!family || family.length < 2) return null;

  // Median-based outlier guard: implausible per-unit values are size-parse
  // errors (the "0.19 SAR/L" class of bug), not bargains.
  const values = family.map((l) => l.up.value).sort((a, b) => a - b);
  const median = values[Math.floor(values.length / 2)];
  const kept = family.filter(
    (l) => l.up.value <= median * OUTLIER_FACTOR && l.up.value >= median / OUTLIER_FACTOR,
  );
  const pool = kept.length >= 2 ? kept : family;
  const best = pool.reduce((a, b) => (b.up.value < a.up.value ? b : a));
  return { best, family: pool, unit: best.up.unit, dropped: family.length - pool.length };
}

// --- the comparison model ---------------------------------------------------------
// tagged: online results; offers: engine flyer offers; prices: price history
// ({lowest, latest}) or null; storeLabelFn resolves flyer store ids for display.
export function computeComparison(query, tagged, offers, prices, storeLabelFn) {
  const listings = [];
  for (const t of tagged || []) {
    const l = onlineListing(t, query);
    if (l) listings.push(l);
  }
  for (const o of offers || []) {
    const l = flyerListing(o, query, storeLabelFn);
    if (l) listings.push(l);
  }
  if (!listings.length) return null;

  const storeIds = new Set(listings.map((l) => `${l.source}:${l.store.id}`));
  const min = Math.min(...listings.map((l) => l.price));
  const max = Math.max(...listings.map((l) => l.price));
  const cheapest = listings.reduce((a, b) => (b.price < a.price ? b : a));
  const value = bestValueAnalysis(listings);

  // Headline decision — value first, price as the tiebreak:
  //   • best value ≡ cheapest        -> one unambiguous "Best buy".
  //   • best value beats cheapest's unit price by >10% (or cheapest's size is
  //     unknown)                     -> "Best buy" = the value pick, and the
  //     cheapest keeps its own line ("lowest price, if you need less").
  //   • value ~ price (within 10%)   -> cheapest wins (equal value, less money).
  //   • no unit information          -> cheapest, flagged low-confidence.
  let headline = { listing: cheapest, kind: 'cheapest' };
  let secondary = null;
  if (value) {
    const bv = value.best;
    // The cheapest's unit price is only comparable when it lives in the SAME
    // unit family as the value pick (SAR/L never races SAR/pc).
    const cheapUV = cheapest.up && cheapest.up.unit === value.unit ? cheapest.up.value : null;
    if (bv === cheapest) {
      headline = { listing: cheapest, kind: 'best-buy' };
    } else if (cheapUV == null || bv.up.value <= cheapUV * VALUE_MARGIN) {
      headline = { listing: bv, kind: 'best-value' };
      secondary = { listing: cheapest, kind: 'cheapest' };
    } else {
      // Equal value for less money -> the cheapest IS the best buy.
      headline = { listing: cheapest, kind: 'best-buy' };
    }
  }

  // Equivalence (online only): does a confidently-same product span ≥2 stores?
  const onlineListings = listings.filter((l) => l.source === 'online');
  const groups = groupEquivalents(onlineListings.map((l) => ({ it: l.it, store: l.store, _l: l })));
  let equivalent = null;
  const headIt = headline.listing.it;
  for (const g of groups) {
    const stores = new Set(g.items.map((i) => i.store.id));
    if (stores.size >= 2 && headIt && g.items.some((i) => i.it === headIt)) {
      equivalent = { sorted: g.items.slice().sort((a, b) => a.it.price - b.it.price), stores: stores.size, size: g.size };
      break;
    }
  }
  if (!equivalent) {
    const multi = groups
      .map((g) => ({ g, stores: new Set(g.items.map((i) => i.store.id)).size }))
      .filter((x) => x.stores >= 2 && x.g.size && x.g.size.unit)
      .sort((a, b) => b.stores - a.stores)[0];
    if (multi) {
      equivalent = {
        sorted: multi.g.items.slice().sort((a, b) => a.it.price - b.it.price),
        stores: multi.stores,
        size: multi.g.size,
      };
    }
  }

  // Confidence in the headline claim.
  let confidence = 'low';
  if (equivalent && headIt && equivalent.sorted.some((i) => i.it === headIt)) confidence = 'high';
  else if (value) confidence = 'medium';

  // Price History verdict (tracked products), vs today's best total price.
  let history = null;
  if (prices && prices.lowest && prices.lowest.price != null) {
    const low = prices.lowest;
    const todaysBest = cheapest.price;
    const delta = todaysBest - low.price;
    let verdict;
    if (todaysBest <= low.price + 1e-9) verdict = 'at-low';
    else if (delta / low.price <= 0.1) verdict = 'near-low';
    else verdict = 'above-low';
    const latest = (prices.latest || [])
      .filter((p) => p && p.price != null)
      .sort((a, b) => a.price - b.price);
    history = { low, todaysBest, delta, verdict, latest };
  }

  return {
    query,
    offers: listings.length,
    stores: storeIds.size,
    flyerCount: listings.filter((l) => l.source === 'flyer').length,
    range: { min, max },
    headline,
    secondary,
    bestValue: value ? value.best : null,
    unitFamily: value ? value.unit : null,
    cheapest,
    equivalent,
    confidence,
    history,
    listings,
  };
}

// Human "6.25 SAR/L" label for a listing's unit price (or '').
export function unitPriceLabel(l) {
  const up = l && l.up;
  if (!up) return '';
  const v = up.value >= 100 ? Math.round(up.value) : Number(up.value.toFixed(2));
  return `${v} SAR/${up.unit}`;
}

export { sizeLabel };
