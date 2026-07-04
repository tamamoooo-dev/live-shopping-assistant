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
  tokens,
  expandToken,
  productFamily,
  queryFamily,
  offerFamily,
  productType,
  queryType,
  freshProduceIntent,
  isProcessedProduce,
  producePresence,
  normalizeText,
  matchStage,
} from './match.js';

const REL_FLOOR = 30; // ignore weak/look-alike matches when picking the best
const VALUE_MARGIN = 0.9; // best-value must beat the cheapest's unit price by >10%
const OUTLIER_FACTOR = 6; // unit prices >6× off the family median are parse noise

// A listing may only COMPETE when it matches (nearly) every query token: a
// 2-token query demands both ("كيري مربعات" matching only "مربعات" is puff
// pastry, not Kiri); longer queries tolerate one unmatched descriptor token.
function coversQuery(item, query) {
  const n = tokens(query).length;
  if (n < 2) return true;
  const cov = tokenCoverage(item, query);
  return n === 2 ? cov >= 1 : cov >= (n - 1) / n;
}

// The full text a listing was matched over — the SAME text that admitted it to
// the pool, so the identity lock never contradicts the relevance gate. Flyer
// OCR is bilingual and the product word often lands in only one language (the
// EN display name may be a flavour line while the AR name carries "بيض"), so a
// flyer is judged over BOTH derived names, exactly as flyerListing's probe does;
// online listings use their name + brand.
function listingMatchText(l) {
  if (l.source === 'flyer' && l.offer) return `${l.offer.name || ''} ${l.offer.nameAr || ''}`;
  return `${l.name || ''} ${l.brand || ''}`;
}

// WHICH query tokens a text actually matches (as a Set of token indices), with
// the same primitives match.js uses (whole word, long word-start prefix, long
// substring, bilingual synonyms). This is the basis of the product-identity
// lock: two listings are the SAME product only when they match the same
// discriminating query tokens (the brand "herfy", the cut "breast"). Pure — it
// only reuses match.js's exported helpers.
function coveredQueryTokens(text, query) {
  const qTokens = tokens(query);
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
    size: it._size,
    up: unitPrice(it),
    rel: it._rel,
    stage: matchStage(it, query),
    family: productFamily(it.name),
    type: productType(it.name),
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

  // STAGE GATE (Search Roadmap, HANDOFF rule 9) — the summary must reason over
  // the SAME products the grid ranks first: only listings in the BEST match
  // band present may compete or be recommended. Single word: the exact stage —
  // a trailing-token match ("كلوروكس ليمون") must never drive a ليمون
  // comparison while true lemon products (stage 5) exist. Multi word: every
  // FULL-coverage stage (5..2 — phrase/whole-word/strong/substring are layout
  // refinements of "every term matched") is ONE band, so a genuine product
  // whose name merely orders the words differently still competes on price;
  // the relaxation stages (1, 0 — missing terms) stay below and never enter a
  // comparison a full match exists for. Excluded listings still render in the
  // grid; the count is surfaced, never silent.
  const multiWord = tokens(query).length > 1;
  const stageBand = (l) => {
    const s = l.stage || 0;
    return multiWord && s >= 2 ? 2 : s;
  };
  const maxBand = all.reduce((m, l) => Math.max(m, stageBand(l)), 0);
  const staged = all.filter((l) => stageBand(l) === maxBand);
  const stageExcluded = all.length - staged.length;

  // FAMILY GATE — products from different families must not compete, however
  // similar their names ("نادك منزوع الدسم" must never offer yogurt as the
  // cheaper alternative to milk). The target family is the one the query names
  // ("حليب" -> milk); a family-less query (brand-only, "كيري") falls back to
  // the dominant family across the matches. Listings of a KNOWN different
  // family are excluded from the comparison (they still render in the results
  // list — they are real matches, just not comparable); family-less listings
  // stay (we refuse to guess a mismatch).
  const targetFamily = (() => {
    const qf = queryFamily(query);
    if (qf) return qf;
    const counts = new Map();
    let familied = 0;
    for (const l of staged) {
      if (!l.family) continue;
      familied += 1;
      counts.set(l.family, (counts.get(l.family) || 0) + 1);
    }
    let top = null;
    for (const [f, c] of counts) if (!top || c > top.c) top = { f, c };
    return top && top.c >= 2 && top.c / familied > 0.5 ? top.f : null;
  })();
  let listings = targetFamily ? staged.filter((l) => !l.family || l.family === targetFamily) : staged;
  if (!listings.length) listings = staged; // never let the gate empty the comparison
  const familyExcluded = staged.length - listings.length;

  // TYPE GATE — the second product attribute. When the query names a product
  // FORM ("chicken nuggets" -> nuggets), listings of a KNOWN different form
  // ("chicken roll" -> roll) share the family but are not the same product, so
  // they must not drive the comparison. Type-less listings stay (we never guess
  // a mismatch); they still render in the results grid — just not the summary.
  const targetType = queryType(query);
  let typeExcluded = 0;
  if (targetType) {
    const typed = listings.filter((l) => {
      const t = l.type !== undefined ? l.type : productType(l.name);
      return !t || t === targetType;
    });
    if (typed.length) {
      typeExcluded = listings.length - typed.length;
      listings = typed;
    }
  }

  // FRESH-PRODUCE GATE — a bare produce query ("فراولة") names the FRESH
  // product, so the "lowest price" claim must be for fresh strawberries: a
  // listing that carries a FORM word ("رول فراولة" is a cake roll the family
  // lexicon can't see), a processing marker (frozen/canned/peeled), or that
  // mentions the produce only as a FLAVOUR ("مصاصات بالفراولة" — the بال
  // prefix means "with", i.e. flavoured by construction, even when the head
  // noun escaped the lexicon) must not drive the comparison. Naming the
  // form/processing in the query ("فراولة مجمدة") disables the gate; excluded
  // listings still render in the grid — real matches, just not the fresh
  // product. This also keeps the flavoured junk out of the per-unit value
  // pool, where its high SAR/kg prices made the outlier guard reject genuine
  // fresh-produce bargains as "implausible".
  const freshFam = freshProduceIntent(query);
  let freshExcluded = 0;
  if (freshFam && (!targetFamily || targetFamily === freshFam)) {
    const fresh = listings.filter((l) => {
      const text = listingMatchText(l);
      const t = l.type !== undefined ? l.type : productType(text);
      if (t || isProcessedProduce(text)) return false;
      return producePresence(text, freshFam) !== 'flavored';
    });
    if (fresh.length) {
      freshExcluded = listings.length - fresh.length;
      listings = fresh;
    }
  }

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
  if (listings.length > 1 && tokens(query).length) {
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

  // Confidence in the headline claim.
  let confidence = 'low';
  if (equivalent && headIt && equivalent.sorted.some((i) => i.it === headIt)) confidence = 'high';
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
    if (!chosen) {
      for (const v of variants) {
        const tb = todaysBestFor(v);
        if (tb != null) {
          chosen = v;
          chosenToday = tb;
          break;
        }
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
    } else if (prices.lowest && prices.lowest.price != null) {
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
