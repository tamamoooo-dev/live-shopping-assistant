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

import {
  unitPrice,
  sizeLabel,
  parseSize,
  groupEquivalents,
  isRelevant,
  relevance,
  tokenCoverage,
  queryTokens,
  expandToken,
  productFamily,
  offerFamily,
  productType,
  normalizeText,
  matchStage,
  resolveJourneyPool,
} from './match.js';

const REL_FLOOR = 30; // ignore weak/look-alike matches when picking the best
const VALUE_MARGIN = 0.9; // best-value must beat the cheapest's unit price by >10%
const OUTLIER_FACTOR = 6; // unit prices >6× off the family median are parse noise

// A listing may only COMPETE when it matches (nearly) every query token: a
// 2-token query demands both ("كيري مربعات" matching only "مربعات" is puff
// pastry, not Kiri); longer queries tolerate one unmatched descriptor token.
// Lexical tokens only — a query-named size is a structured filter (match.js
// querySize), never a word requirement.
function coversQuery(item, query) {
  const n = queryTokens(query).length;
  if (n < 2) return true;
  const cov = tokenCoverage(item, query);
  return n === 2 ? cov >= 1 : cov >= (n - 1) / n;
}

// The full text a listing was matched over — the SAME text that admitted it to
// the pool, so the gate ladder and the identity lock never contradict the
// relevance gate. Set by the listing builders (`text`): flyer OCR is bilingual
// and the product word often lands in only one language, so a flyer is judged
// over BOTH derived names, exactly as flyerListing's probe does; online
// listings use their name + brand.
function listingMatchText(l) {
  return l.text || '';
}

// WHICH query tokens a text actually matches (as a Set of token indices), with
// the same primitives match.js uses (whole word, long word-start prefix, long
// substring, bilingual synonyms). This is the basis of the product-identity
// lock: two listings are the SAME product only when they match the same
// discriminating query tokens (the brand "herfy", the cut "breast"). Pure — it
// only reuses match.js's exported helpers.
function coveredQueryTokens(text, query) {
  const qTokens = queryTokens(query);
  const f = normalizeText(text || '');
  const words = f.split(' ').filter(Boolean);
  const wordSet = new Set(words);
  const covered = new Set();
  qTokens.forEach((qt, i) => {
    for (const v of expandToken(qt)) {
      if (!v) continue;
      if (
        wordSet.has(v) ||
        (v.length >= 4 && words.some((w) => w.startsWith(v))) ||
        (v.length >= 5 && f.includes(v))
      ) {
        covered.add(i);
        break;
      }
    }
  });
  return covered;
}

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
  if (!coversQuery(it, query)) return null;
  return {
    source: 'online',
    store: t.store,
    name: it.name,
    brand: it.brand || '',
    price: it.price,
    oldPrice: it.oldPrice ?? null,
    currency: it.currency || 'SAR',
    link: it.link || null,
    image: it.image || null,
    size: it._size,
    up: unitPrice(it),
    rel: it._rel,
    stage: matchStage(it, query),
    family: productFamily(it.name),
    type: productType(it.name),
    text: `${it.name || ''} ${it.brand || ''}`,
    productId: null, // canonical Registry identity is a flyer-offer concept
    it,
  };
}

export function flyerListing(offer, query, storeLabelFn = (x) => x) {
  if (!offer || offer.price == null) return null;
  // Display name: prefer the query's script when both languages were derived
  // (an Arabic search should read Arabic cards); fall back across languages.
  const arQuery = /[؀-ۿ]/.test(query || '');
  const name = arQuery ? offer.nameAr || offer.name : offer.name || offer.nameAr;
  if (!name) return null; // no display name -> not comparable material
  // Relevance is judged over BOTH derived names: flyer OCR names are bilingual
  // and the product-type word often lands in only one language ("guava
  // raspberry pomegranate 3ltr" / "ندى عصير فراولة") — gating on a single name
  // silently dropped a third of the engine's genuinely-relevant offers.
  const probe = { name: `${offer.name || ''} ${offer.nameAr || ''}`.trim(), brand: '', size: '' };
  if (!isRelevant(probe, query)) return null;
  const rel = relevance(probe, query);
  if (rel < REL_FLOOR) return null;
  if (!coversQuery(probe, query)) return null;
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
    image: offer.imageUrl || null,
    size,
    up: unitPrice(item),
    rel,
    // Stage over the SAME bilingual text that admitted the offer to the pool.
    stage: matchStage(probe, query),
    // OCR names span both languages — classify over both so the family gate
    // sees whatever script the family keyword landed in; and when the name
    // yields nothing, fall back to the aggregator's own category (offerFamily).
    family: offerFamily(offer),
    type: productType(`${offer.name || ''} ${offer.nameAr || ''}`),
    text: `${offer.name || ''} ${offer.nameAr || ''}`,
    // The engine's canonical Registry identity (Vision-canonical, one per real
    // product). When two offers share it, they ARE the same product — no
    // lexical re-derivation may overrule it.
    productId: offer.productId || null,
    brandSlug: offer.brandSlug || null,
    offer,
  };
}

// A flyer offer admitted on Registry identity alone (canonical pull-in): it
// shares a productId with a listing the query DID admit, so it IS the same
// product — its generic extracted name ("Milk" on a tile whose brand lives
// only in the artwork) must not hide its price. No lexical gates here, by
// design; identity was already proven upstream.
function canonicalFlyerListing(offer, query, storeLabelFn = (x) => x) {
  if (!offer || offer.price == null) return null;
  const arQuery = /[؀-ۿ]/.test(query || '');
  const name = arQuery ? offer.nameAr || offer.name : offer.name || offer.nameAr;
  if (!name) return null;
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
    image: offer.imageUrl || null,
    size,
    up: unitPrice(item),
    rel: REL_FLOOR,
    stage: 0,
    family: offerFamily(offer),
    type: productType(`${offer.name || ''} ${offer.nameAr || ''}`),
    text: `${offer.name || ''} ${offer.nameAr || ''}`,
    productId: offer.productId,
    brandSlug: offer.brandSlug || null,
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
  const all = [];
  for (const t of tagged || []) {
    const l = onlineListing(t, query);
    if (l) all.push(l);
  }
  for (const o of offers || []) {
    const l = flyerListing(o, query, storeLabelFn);
    if (l) all.push(l);
  }
  if (!all.length) return null;

  // THE SHARED GATE LADDER (match.js resolveJourneyPool, HISTORY §34) — the
  // summary must reason over the SAME products the grid ranks first: stage
  // band → family → type → fresh-produce, at the 'summary' tier of the
  // declared JOURNEY_POLICY table. The engine's price alerts and price-history
  // statistics run the SAME ladder through the matching mirror, so every
  // comparison-shaped feature interprets the pool identically; the per-gate
  // WHYs live on the ladder itself. Excluded listings still render in the
  // grid — the counts are surfaced, never silent.
  const pool = resolveJourneyPool(all, query, 'summary');
  let listings = pool.kept;
  const { targetFamily, stageExcluded, familyExcluded, typeExcluded, freshExcluded } = pool;

  // PRODUCT-IDENTITY LOCK — the Shopping Summary must compare prices for the
  // SAME product the Grid identifies, never re-pick a cheaper look-alike. The
  // Grid ranks the intended product to the top by relevance, so we take the
  // highest-relevance listing as the identity ANCHOR and keep only listings
  // that match every query token the anchor matches (its brand + descriptors).
  // A cheaper different-brand ("Sadia" under a "Herfy" query) or different-cut
  // ("liver" under a "chicken breast" query) look-alike matches FEWER of the
  // query's tokens, so it can no longer displace the headline — while a bare
  // family query ("chicken"), whose anchor matches only the one shared token,
  // still keeps every form (no over-gating).
  let identityExcluded = 0;
  if (listings.length > 1 && queryTokens(query).length) {
    const anchor = listings.reduce((best, l) => {
      if (!best) return l;
      if ((l.rel || 0) !== (best.rel || 0)) return (l.rel || 0) > (best.rel || 0) ? l : best;
      // Tie: prefer an online result (cleaner identity than flyer OCR), then
      // the lower price — mirrors how the Grid orders the top band.
      const bOnline = best.source === 'online';
      const lOnline = l.source === 'online';
      if (bOnline !== lOnline) return lOnline ? l : best;
      return l.price < best.price ? l : best;
    }, null);
    const anchorSet = coveredQueryTokens(listingMatchText(anchor), query);
    if (anchorSet.size) {
      const locked = listings.filter((l) => {
        // Canonical override: a listing resolved to the SAME Registry product
        // as the anchor is the same product by definition — token spelling in
        // its OCR/Vision name can never exclude it (the "Nadec Skimmed Milk"
        // disappearing-comparison bug).
        if (anchor.productId && l.productId === anchor.productId) return true;
        const s = coveredQueryTokens(listingMatchText(l), query);
        for (const t of anchorSet) if (!s.has(t)) return false; // must cover ≥ the anchor
        return true;
      });
      if (locked.length) {
        identityExcluded = listings.length - locked.length;
        listings = locked;
      }
    }
  }

  // CANONICAL PULL-IN — an offer the lexical gates rejected but whose
  // productId matches a listing that survived every gate is the SAME product
  // (Registry identity is authoritative). Admit it now, so the true best
  // price can never be hidden by a generic Vision name ("the Othaim 18.99
  // Nadec milk" bug, 2026-07-21).
  {
    // Brand guard mirrors the engine's: a 'review'-band sighting can wrongly
    // co-locate brands under one productId, so a pulled-in offer must ALSO
    // carry the same ingest-stamped brand as an admitted listing of that
    // product. Identity expands reach, never brand.
    const brandsByPid = new Map();
    for (const l of listings) {
      if (!l.productId || !l.brandSlug) continue;
      const set = brandsByPid.get(l.productId) || new Set();
      set.add(l.brandSlug);
      brandsByPid.set(l.productId, set);
    }
    if (brandsByPid.size) {
      const seenOffers = new Set(listings.map((l) => l.offer).filter(Boolean));
      const seenIds = new Set([...seenOffers].map((o) => o.id).filter((id) => id != null));
      for (const o of offers || []) {
        if (!o || !o.productId) continue;
        const okBrands = brandsByPid.get(o.productId);
        if (!okBrands || !o.brandSlug || !okBrands.has(o.brandSlug)) continue;
        if (seenOffers.has(o) || (o.id != null && seenIds.has(o.id))) continue;
        const l = canonicalFlyerListing(o, query, storeLabelFn);
        if (l) listings.push(l);
      }
    }
  }

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

  // Equivalence: does a confidently-same product span ≥2 stores?
  //
  // CANONICAL FIRST (Vision-canonical directive): flyer offers the engine has
  // resolved to one Registry productId ARE the same product — across any
  // retailers, however the query is phrased. Those groups are authoritative
  // and take precedence over lexical re-derivation. Lexical grouping
  // (groupEquivalents: brand + size over catalogue names) remains for online
  // results, which carry no Registry identity.
  let equivalent = null;
  const headIt = headline.listing.it;
  {
    const byProduct = new Map();
    for (const l of listings) {
      if (!l.productId) continue;
      // Brand-scoped key: a polluted productId must never merge brands.
      const key = `${l.productId}|${l.brandSlug || ''}`;
      const arr = byProduct.get(key) || [];
      arr.push(l);
      byProduct.set(key, arr);
    }
    let bestG = null;
    for (const arr of byProduct.values()) {
      const stores = new Set(arr.map((l) => l.store.id));
      if (stores.size < 2) continue;
      const hasHead = arr.includes(headline.listing);
      if (!bestG || (hasHead && !bestG.hasHead) || (hasHead === bestG.hasHead && stores.size > bestG.stores)) {
        bestG = { arr, stores: stores.size, hasHead };
      }
    }
    if (bestG) {
      // One row per store (its cheapest) — duplicate ingest rows never repeat.
      const cheapestByStore = new Map();
      for (const l of bestG.arr) {
        const cur = cheapestByStore.get(l.store.id);
        if (!cur || l.price < cur.price) cheapestByStore.set(l.store.id, l);
      }
      const sorted = [...cheapestByStore.values()]
        .map((l) => ({ it: l.it || { name: l.name, price: l.price, link: l.link }, store: l.store, _l: l }))
        .sort((a, b) => a.it.price - b.it.price);
      equivalent = { sorted, stores: bestG.stores, size: bestG.arr[0].size, canonical: true, hasHeadline: bestG.hasHead };
    }
  }
  const onlineListings = listings.filter((l) => l.source === 'online');
  const groups = equivalent ? [] : groupEquivalents(onlineListings.map((l) => ({ it: l.it, store: l.store, _l: l })));
  for (const g of groups) {
    const stores = new Set(g.items.map((i) => i.store.id));
    if (stores.size >= 2 && headIt && g.items.some((i) => i.it === headIt)) {
      equivalent = { sorted: g.items.slice().sort((a, b) => a.it.price - b.it.price), stores: stores.size, size: g.size, hasHeadline: true };
      break;
    }
  }
  if (!equivalent && groups.length) {
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

  // SHARED BEST PRICE — when other stores sell the same thing at the same
  // headline price, the best price belongs to all of them, not to whichever
  // store happened to sort first. "Same thing" is conservative: identical
  // price AND (size within 3% in the same unit family, or an identical
  // normalized name when sizes are unparseable).
  const h0 = headline.listing;
  const sameName = (a, b) => normalizeText(a.name) === normalizeText(b.name);
  const sameSize = (a, b) =>
    a.size && b.size && a.size.unit && a.size.unit === b.size.unit &&
    a.size.total != null && b.size.total != null &&
    Math.abs(a.size.total - b.size.total) / Math.max(a.size.total, b.size.total) <= 0.03;
  const sharedWith = [];
  for (const l of listings) {
    if (l === h0 || l.store.id === h0.store.id) continue;
    if (Math.abs(l.price - h0.price) > 0.005) continue;
    if (!(sameSize(l, h0) || sameName(l, h0))) continue;
    if (!sharedWith.some((s) => s.id === l.store.id)) {
      sharedWith.push({ id: l.store.id, label: l.store.label, source: l.source });
    }
  }

  // Confidence in the headline claim. A canonical (Registry-verified) group
  // containing the headline is as strong as a lexical online one.
  let confidence = 'low';
  if (equivalent && (equivalent.hasHeadline || (headIt && equivalent.sorted.some((i) => i.it === headIt)))) confidence = 'high';
  else if (value) confidence = 'medium';

  // Price History verdict (catalog-wide: the engine derives history for ANY
  // query from the weekly flyer offers). Each SIZE/VARIANT keeps its own
  // independent lowest-ever record (§ engine getPricesDoc.variants), so the
  // verdict is always apples-to-apples: today's best price for ONE size vs that
  // SAME size's own record low — a 30-egg tray is never measured against a
  // 6-egg pack's low. We lock to a size we have BOTH a historical record AND a
  // live price for today, preferring the recommended product's own size and
  // otherwise the best-tracked size present in today's results. Only when no
  // per-size record is comparable do we fall back to the product-wide low
  // against today's cheapest (the original behaviour), so nothing regresses.
  let history = null;
  if (prices && (prices.lowest || (Array.isArray(prices.variants) && prices.variants.length))) {
    const sizeMatch = (sz, v) =>
      sz && sz.unit === v.sizeUnit && sz.total != null && v.sizeTotal != null &&
      Math.abs(sz.total - v.sizeTotal) / Math.max(sz.total, v.sizeTotal) <= 0.03;
    // Engine order is most-observed-first, unsized last; keep only real sizes
    // with a record.
    const variants = (Array.isArray(prices.variants) ? prices.variants : []).filter(
      (v) => v.sizeUnit && v.sizeTotal != null && v.lowest && v.lowest.price != null,
    );
    const todaysBestFor = (v) => {
      const same = listings.filter((l) => sizeMatch(l.size, v));
      return same.length ? Math.min(...same.map((l) => l.price)) : null;
    };
    // The chosen variant: the headline's own size when today's results carry it,
    // else the first tracked size (most observed) present in today's results.
    const headSize = headline.listing.size;
    let chosen = null;
    let chosenToday = null;
    const headVariant = headSize ? variants.find((v) => sizeMatch(headSize, v)) : null;
    if (headVariant) {
      const tb = todaysBestFor(headVariant);
      if (tb != null) {
        chosen = headVariant;
        chosenToday = tb;
      }
    }
    let low = null;
    let todaysBest = null;
    let variantInfo = null;
    let latestSource = [];
    let otherVariants = [];
    if (chosen && chosenToday != null) {
      low = chosen.lowest;
      todaysBest = chosenToday;
      variantInfo = { label: chosen.label, sizeUnit: chosen.sizeUnit, sizeTotal: chosen.sizeTotal };
      latestSource = chosen.latest || [];
      // The OTHER tracked sizes' lows — context that makes the per-size record
      // legible ("180g 13 · 500g 30", each its own independent history).
      otherVariants = variants
        .filter((v) => v.key !== chosen.key)
        .map((v) => ({ label: v.label, low: v.lowest }));
    } else if (!variants.length && prices.lowest && prices.lowest.price != null) {
      // Legacy engines only (no per-size records): product-wide low vs today's
      // cheapest. When per-size records EXIST but none matches the recommended
      // product's own size, we show NOTHING — a 4×1L pick must never sit next
      // to a 170g record ("this is a disaster" bug, 2026-07-21). Same-size or
      // silent.
      low = prices.lowest;
      todaysBest = cheapest.price;
      latestSource = prices.latest || [];
    }

    if (low && low.price != null && todaysBest != null) {
      const delta = todaysBest - low.price;
      // Observation depth in WEEKS (derived by the engine from the recorded
      // series). With under two weeks of history "matches the lowest ever" is
      // technically true but meaningless — say the history is still building
      // instead of implying a record (missing history never breaks, it talks).
      const weeks = (chosen ? chosen.weeks : prices.weeks) || 0;
      let verdict;
      if (weeks < 2) verdict = 'building';
      else if (todaysBest <= low.price + 1e-9) verdict = 'at-low';
      else if (delta / low.price <= 0.1) verdict = 'near-low';
      else verdict = 'above-low';
      const latest = latestSource.filter((p) => p && p.price != null).sort((a, b) => a.price - b.price);
      history = {
        low,
        todaysBest,
        delta,
        verdict,
        latest,
        variant: variantInfo,
        otherVariants,
        weeks,
        firstSeen: prices.firstSeen || null,
        trend: (chosen ? chosen.trend : prices.trend) || null,
      };
    }
  }

  return {
    query,
    offers: listings.length,
    stores: storeIds.size,
    flyerCount: listings.filter((l) => l.source === 'flyer').length,
    range: { min, max },
    family: targetFamily,
    stageExcluded,
    familyExcluded,
    typeExcluded,
    freshExcluded,
    identityExcluded,
    sharedWith,
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
