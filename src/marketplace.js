import { salePresentation, saleCompact, offerSizeLabel } from './salePresentation.js';
import { storeIcon } from './storeIdentity.js';
// marketplace.js — the ONE unified results experience (the "intelligent
// marketplace"). Every result is simply an OFFER: live online results and this
// week's flyer offers render in a single ranked grid, and the SOURCE is
// metadata — the store's logo plus a "+N days" validity tag on flyer-sourced
// cards — never a separate browsing experience (milestone directive:
// brochures and online stores must not feel like separate systems).
//
// Two pieces, one factory:
//   • the SOURCES STRIP — one line of per-store chips (store logo + count;
//     "no matches" / unavailable detail in the tooltip), so store-level state
//     stays honest without per-store result sections;
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

import { openBrochureViewer } from './viewer.js?v=20260924.2';
import { localLandingForOffer, storeLabel } from './brochure.js';
import { unitPrice, eachPriceLabel, productFamily, productType, queryFamily, freshProduceIntent, isProcessedProduce, producePresence, normalizeText, parseSize, matchStage, offerMatchItem, queryTokens, stageBand } from './match.js';
import { featuredScore, featuredContext, recordChoice, isPrimaryPriceTier } from './featured.js';
import { unitPriceLabel } from './compare.js';
import { openWatchDialog } from './alertsPage.v2.js';
import { addToCart } from './cart.js';
import { t, tn, getLang } from './i18n.js';
import { discountDot, discountPercent } from './discountStatus.js';
import { BRAND_ASSETS } from './identityAssets.js';

// Render both source languages with the same emphasis, regardless of query.
export function productNameLines(offer, fallback = '') {
  const ar = String(offer.nameAr || '').trim();
  const en = String(offer.name || '').trim();
  const lines = [{text:ar,lang:'ar',dir:'rtl'},{text:en,lang:'en',dir:'ltr'}].filter(x=>x.text);
  if (document.documentElement.lang !== 'ar') lines.reverse();
  if (!lines.length && fallback) lines.push({text:fallback,lang:'',dir:'auto'});
  return lines.map(({text,lang,dir})=>{
    const node=el('div','card-name',text);node.dir=dir;if(lang)node.lang=lang;return node;
  });
}

const DEFAULT_VISIBLE = 12;

// The card-building primitives (el/money/cardTop/cardImage/cardBody/…) and
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

// The fallback query for the 07:00/19:00 monitoring rounds.
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
        : matchStage(e.listing.offer ? offerMatchItem(e.listing.offer) : { name: entryText(e), brand: '' }, query);
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
// listing's by ≥70% is a duplicate only when identity evidence is compatible.
// Replacing a word can name a real variant (saffron/cardamom, black/green);
// overlap alone must not hide it. Extra/missing OCR words can still collapse.
function dedupeFlyers(listings) {
  const kept = [];
  const buckets = new Map(); // store|price -> [{listing, tokens}]
  for (const l of listings) {
    const key = `${l.store.id}|${l.price}`;
    const toks = new Set(normalizeText(l.name).split(' ').filter(Boolean));
    // Use the explicit stored size when an engine offer is available. Noisy
    // Arabic name parsing must not contradict the same stored pack on copies.
    const size = l.offer ? parseSize('', l.offer.size || '') : l.size;
    const seen = buckets.get(key) || [];
    let dup = false;
    for (const prior of seen) {
      const other = prior.listing;
      // Different Registry IDs alone do not prove different products: a
      // visually identical slipper offer currently has two canonical IDs.
      if (l.brandSlug && other.brandSlug && l.brandSlug !== other.brandSlug) continue;
      // Parsed sizes already share base units. Ignore parser provenance, but
      // protect both the item size and the pack count, even at equal totals.
      if (size?.unit && prior.size?.unit) {
        if (size.unit !== prior.size.unit) continue;
        if (['each', 'pack'].some(field => size[field] > 0 && prior.size[field] > 0 &&
          Math.abs(size[field] - prior.size[field]) > 1e-8)) continue;
      }
      let inter = 0;
      for (const t of toks) if (prior.tokens.has(t)) inter += 1;
      // A subset may be abbreviated OCR; words replaced on BOTH sides are
      // unresolved identity evidence. Keep both rather than guess a variant.
      if (inter < toks.size && inter < prior.tokens.size) continue;
      const union = prior.tokens.size + toks.size - inter;
      if (union > 0 && inter / union >= 0.7) {
        dup = true;
        break;
      }
    }
    if (!dup) {
      kept.push(l);
      seen.push({ listing: l, tokens: toks, size });
      buckets.set(key, seen);
    }
  }
  return kept;
}

// --- cards ---------------------------------------------------------------------
// ONE compact card for every source (search grid + Browse), top to bottom:
//   • over the image, one line: the discount dot with its percentage ("23%"),
//     and the watch bell + Add-to-Cart;
//   • info: the store's logo, the flyer's remaining days ("+6 days"), and the
//     brand's logo (its name when no logo is held and the name lacks it);
//   • the product name, bold, on one line — ▸ opens whatever doesn't fit (the
//     full name, the other language, the multi-buy terms, review notes);
//   • the price (70%) and the struck old price (30%), on one line;
//   • size / count, then the unit and per-item prices, on the last line.
// Store and brand names live in the logos' tooltips and accessible names.

// The top row over the image. `fallbackDiscount` is a store's own discount
// text, shown only when the prices alone can't place a dot.
export function cardTop(product, actions = [], fallbackDiscount = '') {
  const top = el('div', 'card-top');
  const dot = discountDot(product);
  if (dot) {
    const state = dot.className.match(/is-(low|mid|high)/)?.[1] || '';
    const pill = el('span', `card-discount is-${state}`);
    const pct = el('span', 'card-discount-pct', `${Math.max(1, Math.round(discountPercent(product)))}%`);
    pct.setAttribute('aria-hidden', 'true');
    pill.append(dot, pct);
    top.appendChild(pill);
  } else if (fallbackDiscount) {
    top.appendChild(el('span', 'card-discount', fallbackDiscount));
  }
  const acts = el('div', 'card-actions');
  for (const b of actions) if (b) acts.appendChild(b);
  top.appendChild(acts);
  return top;
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

// The store's logo, named by tooltip + accessible name; its name as text when
// no logo is held or the image fails.
function storeMark(id, label) {
  const mark = el('span', 'card-store');
  mark.title = label;
  const icon = storeIcon(id || label);
  if (icon.tagName !== 'IMG') {
    mark.textContent = label;
    mark.classList.add('is-text');
    return mark;
  }
  mark.setAttribute('role', 'img');
  mark.setAttribute('aria-label', label);
  icon.addEventListener('error', () => {
    mark.textContent = label;
    mark.classList.add('is-text');
    mark.removeAttribute('role');
    mark.removeAttribute('aria-label');
  }, { once: true });
  mark.appendChild(icon);
  return mark;
}

// Whole days a flyer offer has left (0 = its last day, negative = ended), or
// null without a validity date. Calendar days, local time.
export function daysLeft(validTo) {
  if (!validTo) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(validTo));
  const end = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(validTo);
  if (Number.isNaN(end.getTime())) return null;
  end.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((end - today) / 86400000);
}

function daysTag(validTo) {
  const n = daysLeft(validTo);
  if (n == null) return null;
  const text = n < 0 ? t('market.ended')
    : n === 0 ? t('market.lastDay')
      : t(`market.daysLeft.${n === 1 ? 'one' : getLang() === 'ar' && n > 10 ? 'many' : 'other'}`, { count: n });
  const tag = el('span', `card-days${n < 0 ? ' is-ended' : n <= 1 ? ' is-urgent' : ''}`, text);
  tag.title = t('market.flyerUntil', { date: fmtDateShort(validTo) });
  return tag;
}

// Brand logo from the identity registry: the engine's brand slug, else the
// online listing's brand name slugged the same way (archived marks included).
// The name as text only where `allowText`: flyer names no longer carry the
// brand, while an online store's brand field can hold its own slogan.
const slugify = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
function brandMark(slug, brand, name, allowText = true) {
  const key = slug || slugify(brand);
  const asset = key ? BRAND_ASSETS[key] || BRAND_ASSETS[`archive-${key}`] : null;
  const label = brand || slug || '';
  const textMark = () => {
    if (!allowText || !brand || normalizeText(name).includes(normalizeText(brand))) return null;
    const span = el('span', 'card-brand-name', brand);
    span.dir = 'auto';
    return span;
  };
  if (!asset) return textMark();
  const img = el('img', 'card-brand-logo');
  img.src = new URL('../' + asset.file, import.meta.url).href;
  if (asset.background) img.style.backgroundColor = asset.background;
  img.alt = label;
  img.title = label;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.addEventListener('error', () => {
    const text = textMark();
    if (text) img.replaceWith(text);
    else img.remove();
  }, { once: true });
  return img;
}

// The name row (bold, one line) and its ▸ panel. The triangle shows at once
// when the panel has lines; a name cut short is found in one batched pass
// (all widths read, then all toggles written) after the cards are attached,
// and again on resize and when the web fonts land.
let pendingTitles = [];
let titleTimer = 0;
function syncTitles(titles) {
  const closed = titles.filter((t) => !t.classList.contains('is-open'));
  const show = closed.map((t) => {
    const name = t.querySelector('.card-name');
    return t.dataset.more === '1' || name.scrollWidth > name.clientWidth + 1;
  });
  closed.forEach((t, i) => { t.querySelector('.card-more-toggle').hidden = !show[i]; });
}
function flushTitleSync() {
  titleTimer = 0;
  const ready = pendingTitles.filter((t) => t.isConnected);
  // Not attached yet: one more pass shortly; after that, resize covers it.
  const later = pendingTitles.filter((t) => !t.isConnected && !t.dataset.retried);
  later.forEach((t) => { t.dataset.retried = '1'; });
  pendingTitles = later;
  if (later.length) titleTimer = setTimeout(flushTitleSync, 100);
  syncTitles(ready);
}
function queueTitleSync(title) {
  pendingTitles.push(title);
  if (!titleTimer) titleTimer = setTimeout(flushTitleSync, 0);
}
const syncAllTitles = () => syncTitles([...document.querySelectorAll('.card-title')]);
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(syncAllTitles, 150);
});
document.fonts?.ready.then(syncAllTitles);

// Whether a name reads right-to-left (its first strong letter is Arabic), so
// the ▸ follows the name in its own reading order.
const FIRST_STRONG = /[A-Za-z\u00C0-\u024F]|[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const readsRtl = (s) => {
  const m = FIRST_STRONG.exec(s || '');
  return !!m && !/[A-Za-z\u00C0-\u024F]/.test(m[0]);
};

function cardTitle(name, more) {
  const frag = document.createDocumentFragment();
  const title = el('div', 'card-title');
  title.dir = readsRtl(name) ? 'rtl' : 'ltr';
  const nameEl = el('div', 'card-name', name);
  nameEl.dir = 'auto';
  const toggle = el('button', 'card-more-toggle');
  toggle.type = 'button';
  toggle.hidden = !more.length;
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', t('market.moreDetails'));
  const panel = el('div', 'card-more');
  panel.hidden = true;
  for (const line of more) {
    const row = el('div', null, line);
    row.dir = 'auto';
    panel.appendChild(row);
  }
  title.dataset.more = more.length ? '1' : '0';
  toggle.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const open = !title.classList.contains('is-open');
    title.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
  });
  title.append(nameEl, toggle);
  frag.append(title, panel);
  queueTitleSync(title);
  return frag;
}

function priceNumber(value) {
  return Number(value).toFixed(2);
}

// Current price (70%) and the struck old price (30%), on one line. The old
// price drops the currency the current price already states.
function cardPrice(price, oldPrice, currency = 'SAR') {
  const row = el('div', 'card-prices');
  if (price == null) {
    row.appendChild(el('span', 'no-price', t('market.tapForPrice')));
    return row;
  }
  const now = el('span', 'price');
  now.append(el('span', 'price-value', priceNumber(price)), el('span', 'price-cur', currency || 'SAR'));
  row.appendChild(now);
  if (oldPrice != null) {
    row.classList.add('has-old');
    const old = el('span', 'old-price', priceNumber(oldPrice));
    old.title = money(oldPrice, currency || 'SAR');
    row.appendChild(old);
  }
  return row;
}

// The last line: size / count first, then the unit and per-item prices. `each`
// is the engine's per-item price (`offer.eachPrice`) — it renders wherever the
// unit price renders, since the two answer different questions.
function cardFoot({ size, up, each, sale, currency }) {
  const what = [];
  const cost = [];
  if (size) what.push(size);
  if (sale?.count > 1) {
    const [count, perItem] = saleCompact(sale, money(sale.packagePrice, currency || 'SAR'));
    what.push(count);
    cost.push(perItem);
  }
  const upLabel = unitPriceLabel({ up });
  if (upLabel) cost.push(upLabel);
  const eachLabel = sale?.count > 1 && each?.pack === sale.count ? '' : eachPriceLabel(each);
  if (eachLabel) cost.push(eachLabel);
  if (!what.length && !cost.length) return null;
  const foot = el('div', 'card-foot');
  if (what.length) {
    const w = el('span', 'card-foot-size', what.join(' · '));
    w.dir = 'auto';
    foot.appendChild(w);
  }
  if (cost.length) foot.appendChild(el('span', 'card-foot-cost', cost.join(' · ')));
  return foot;
}

// The card body every source shares.
//   spec: { store:{id,label}, validTo, brandSlug, brand, brandText, name,
//           altName, price, oldPrice, currency, size, up, each, sale, review,
//           more:[lines] }
export function cardBody(spec) {
  const body = el('div', 'card-body');
  const info = el('div', 'card-info');
  info.appendChild(storeMark(spec.store.id, spec.store.label));
  const days = daysTag(spec.validTo);
  if (days) info.appendChild(days);
  const brand = brandMark(spec.brandSlug, spec.brand, spec.name, spec.brandText !== false);
  if (brand) info.appendChild(brand);
  body.appendChild(info);

  const more = [];
  if (spec.altName && spec.altName !== spec.name) more.push(spec.altName);
  if (spec.sale?.count > 1) more.push(...salePresentation(spec.sale, money(spec.sale.packagePrice, spec.currency || 'SAR')));
  if (spec.review) more.push(t('market.saleReview'));
  more.push(...(spec.more || []));
  body.appendChild(cardTitle(spec.name, more));

  body.appendChild(cardPrice(spec.price, spec.oldPrice, spec.currency));
  const foot = cardFoot(spec);
  if (foot) body.appendChild(foot);
  return body;
}

// A flyer offer's body (search grid + Browse): the size line follows the same
// rule as before — a reading or a stored package, never a sale's pack.
export function flyerCardBody(offer, name, { brand = '', up = null, more = [] } = {}) {
  const altName = name === offer.nameAr ? offer.name : offer.nameAr;
  const showSize = offer.sizeReading || (offer.size && !offer.saleQuantity && Object.hasOwn(offer, 'packageContents'));
  return cardBody({
    store: { id: offer.store, label: storeLabel(offer.store) },
    validTo: offer.validTo,
    brandSlug: offer.brandSlug || null,
    brand,
    name,
    altName: altName ? String(altName).trim() : '',
    price: offer.price,
    oldPrice: offer.oldPrice ?? null,
    currency: offer.currency || 'SAR',
    size: showSize ? offerSizeLabel(offer) : '',
    up,
    each: offer.eachPrice || null,
    sale: offer.saleQuantity || null,
    review: offer.quantityReviewRequired === true,
    more,
  });
}

// The card's Add-to-Cart button; `entry` is what addToCart stores.
export function cartButton(name, entry) {
  const cartBtn = el('button', 'card-watch card-cart', '🛒');
  cartBtn.type = 'button';
  cartBtn.title = t('market.addCart');
  cartBtn.setAttribute('aria-label', t('market.addCartAria', { name }));
  cartBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    addToCart(entry);
    cartBtn.textContent = '✓';
    cartBtn.classList.add('is-added');
    setTimeout(() => {
      if (!cartBtn.isConnected) return;
      cartBtn.textContent = '🛒';
      cartBtn.classList.remove('is-added');
    }, 1200);
  });
  return cartBtn;
}

// The flyer offer as a cart line — the same id as the viewer sheet's add
// (offer.id), so quantities merge whichever path added the product.
export function flyerCartEntry(offer) {
  return {
    id: offer.id,
    store: offer.store,
    name: offer.name || null,
    nameAr: offer.nameAr || null,
    price: offer.price,
    oldPrice: offer.oldPrice ?? null,
    currency: offer.currency || 'SAR',
    image: offer.imageUrl || null,
    sourceUrl: offer.sourceUrl || null,
    brochureId: offer.brochureId || null,
    pageIndex: Number.isInteger(offer.pageIndex) ? offer.pageIndex : null,
    validTo: offer.validTo || null,
  };
}

function onlineCard(store, item, up) {
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

  const actions = [];
  if (item.id != null && item.price != null) {
    // Watch bell: one tap sets a target-price watch on THIS product.
    //   • Amazon — an exact-product watch: the engine looks up THAT ASIN only
    //     by its stable id (Keepa-style). Marketplace SKUs have no cross-store
    //     equivalent, so this behaviour is preserved exactly.
    //   • every other store — a cross-source watch: the engine generalizes it to
    //     product + brand and includes Amazon in the sweep
    //     (query + name + size) but let the engine super-search ALL stores and
    //     this week's flyers daily and take the lowest trustworthy price.
    //     One bell, best price everywhere.
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
              brand: item.brand,
            }
          : {
              kind: 'grocery',
              provider: store.id,
              productId: String(item.id),
              query: watchQueryFor(item),
              label: item.name,
              // Reference size for the engine's size gate — name usually carries
              // it (e.g. "…1kg"); fold in the explicit size field when present.
              sizeText: [item.name, item.size].filter(Boolean).join(' '),
              suggestedPrice: item.price,
              currentPrice: item.price,
              link: item.link,
              image: item.image,
              brand: item.brand,
            },
      );
    });
    actions.push(bell);
    // Add to Cart: one tap puts THIS product on the local shopping list (same
    // list the flyer viewer's sheet feeds), no page-leaving detour required.
    actions.push(cartButton(item.name, {
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
    }));
  }
  a.appendChild(cardTop(item, actions, item.discountLabel));
  a.appendChild(cardImage(item.image, item.name));
  // No per-item price for an ONLINE listing, ever: it never passed through the
  // engine, so nothing computed one, and this module must not derive it (see
  // match.js eachPriceLabel).
  a.appendChild(cardBody({
    store: { id: store.id, label: store.label },
    brand: item.brand || '',
    brandText: false,
    name: item.name,
    price: item.price,
    oldPrice: item.oldPrice ?? null,
    currency: item.currency || 'SAR',
    size: item.size || '',
    up,
  }));
  return a;
}

function flyerCard(listing, up) {
  const offer = listing.offer;
  // A div with button semantics, NOT a <button>: the card carries its own
  // Add-to-Cart <button> and buttons cannot nest. Same keyboard contract.
  const card = el('div', 'card card-flyer');
  card.setAttribute('role', 'button');
  card.tabIndex = 0;
  const displayName = listing.name;
  card.title = t('market.flyerCardTitle', { name: displayName });

  card.appendChild(cardTop(offer, [cartButton(displayName, flyerCartEntry(offer))]));
  card.appendChild(cardImage(offer.imageUrl, displayName));
  card.appendChild(flyerCardBody(offer, displayName, { brand: listing.brand, up }));

  card.addEventListener('click', () => openFlyerOffer(offer));
  card.addEventListener('keydown', (e) => {
    if (e.target !== card) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openFlyerOffer(offer);
    }
  });
  return card;
}

// The ONE "open a flyer offer" behaviour (search grid + Browse share it).
// Open only a verified LOCAL offer landing. D4D's sourceUrl is provenance for
// ingestion and explicit verification tooling; it is never a storefront
// navigation fallback. Requiring a page-level resolution also prevents the old
// "some brochure from this store, page 1" substitution.
export async function openFlyerOffer(offer) {
  const landing = await localLandingForOffer(offer).catch(() => null);
  if (landing) {
    openBrochureViewer(landing.brochure, storeLabel(offer.store), {
      targetPageId: landing.targetPageId,
      targetPageIndex: landing.targetPageIndex,
      targetOfferId: landing.targetOfferId,
    });
    return true;
  }
  return false;
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
  // Sources strip: ONE line of chips — each store's logo and its count, plus
  // one chip for this week's flyer offers. The store name and any detail (no
  // matches, unavailable, related/hidden counts) live in the tooltip and the
  // accessible name, so the visible chip stays logo + number.
  const strip = el('div', 'sources-strip');
  const chips = new Map();
  const setChipState = (c, text, detail = text, notes = []) => {
    c.state.textContent = text;
    const label = [c.label, detail, ...notes].filter(Boolean).join(' · ');
    c.chip.title = label;
    c.chip.setAttribute('aria-label', label);
  };
  for (const s of stores) {
    const chip = el('span', 'src-chip is-loading');
    chip.appendChild(storeIcon(s.id));
    const state = el('span', 'src-state');
    chip.appendChild(state);
    // Interactive retailer filter: the chip toggles this store as the sole
    // view. Reachable by keyboard.
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
    strip.appendChild(chip);
    const c = { chip, state, label: s.label };
    setChipState(c, '…', '');
    chips.set(s.id, c);
  }
  let flyerChip = null;
  let flyers = null;
  if (includeFlyers) {
    flyerChip = el('span', 'src-chip src-chip-flyers is-loading');
    flyerChip.appendChild(storeIcon('brochures'));
    const flyerState = el('span', 'src-state');
    flyerChip.appendChild(flyerState);
    flyers = { chip: flyerChip, state: flyerState, label: t('market.weeklyFlyers') };
    setChipState(flyers, '…', '');
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
  head.appendChild(el('span', 'market-title', opts.title || t('market.allOffers')));
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
    const primaryView = [];
    const relatedView = [];
    for (const e of view) {
      const badge = matchBadge(e, query, qFam, freshFam);
      (e.related || badge.cls === 'related' ? relatedView : primaryView).push({ e, badge });
    }
    count.textContent = String(primaryView.length);
    subnote.textContent =
      sort === 'value'
        ? t('market.sortedValue')
        : sort === 'featured'
        ? t('market.sortedFeatured')
        : t('market.sortedPrice');
    subnote.hidden = finished && !primaryView.length;
    body.innerHTML = '';
    if (!primaryView.length && !relatedView.length) {
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
    const renderGrid = (entries) => {
      const grid = el('div', 'results-grid');
      for (const { e, badge } of entries) {
      const up = upSuppressed.has(e) ? null : entryUnit(e);
      const card = e.kind === 'online' ? onlineCard(e.store, e.it, up) : flyerCard(e.listing, up);
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
      return grid;
    };
    if (primaryView.length) {
      const visible = expanded ? primaryView : primaryView.slice(0, DEFAULT_VISIBLE);
      body.appendChild(renderGrid(visible));
    } else if (finished) {
      body.appendChild(el('div', 'store-note', t('market.nonePrimary')));
    }
    if (primaryView.length > DEFAULT_VISIBLE) {
      const btn = el('button', 'show-all', expanded ? t('market.showFewer') : t('market.showAll', { count: primaryView.length }));
      btn.type = 'button';
      btn.setAttribute('aria-expanded', String(expanded));
      btn.addEventListener('click', () => {
        expanded = !expanded;
        render();
      });
      body.appendChild(btn);
    }
    if (relatedView.length) {
      const details = el('details', 'related-results');
      details.appendChild(el('summary', 'related-summary', t('market.relatedResults', { count: relatedView.length })));
      details.appendChild(el('p', 'related-note', t('market.relatedNote')));
      details.appendChild(renderGrid(relatedView));
      body.appendChild(details);
    }
  }

  return {
    // A store answered with its RELEVANT (ranked) items; `hidden` counts the
    // unrelated results that were filtered out — surfaced, never dumped.
    addOnline(store, items, hidden = 0, related = []) {
      for (const it of items) pool.push({ kind: 'online', store, it });
      for (const it of related) pool.push({ kind: 'online', store, it, related: true });
      const c = chips.get(store.id);
      if (c) {
        c.chip.classList.remove('is-loading');
        if (!items.length) c.chip.classList.add('is-empty');
        const notes = [];
        if (related.length) notes.push(t('market.relatedSource', { count: related.length }));
        if (hidden > 0) notes.push(tn('market.hidden', hidden));
        setChipState(c, String(items.length), items.length ? String(items.length) : t('market.state.noMatches'), notes);
      }
      render();
    },
    failStore(store, bestEffort) {
      const c = chips.get(store.id);
      if (c) {
        c.chip.classList.remove('is-loading');
        c.chip.classList.add('is-failed');
        setChipState(c, '–', bestEffort ? t('market.state.tempUnavailable') : t('market.state.unreachable'));
      }
      render();
    },
    // This week's flyer offers (compare.js flyerListings — already gated);
    // branch/language duplicates of the same offer collapse to one card.
    addFlyers(listings) {
      if (!includeFlyers) return 0;
      const unique = dedupeFlyers(listings);
      let primaryCount = 0;
      for (const l of unique) {
        const entry = { kind: 'flyer', listing: l };
        const related = matchBadge(entry, query, qFam, freshFam).cls === 'related';
        entry.related = related;
        if (!related) primaryCount += 1;
        pool.push(entry);
      }
      flyerChip.classList.remove('is-loading');
      if (!primaryCount) flyerChip.classList.add('is-empty');
      setChipState(
        flyers,
        String(primaryCount),
        primaryCount ? t('market.state.offers', { count: primaryCount }) : t('market.state.noMatches'),
        unique.length > primaryCount ? [t('market.relatedSource', { count: unique.length - primaryCount })] : [],
      );
      render();
      return primaryCount;
    },
    flyersUnavailable() {
      if (!includeFlyers) return 0;
      flyerChip.classList.remove('is-loading');
      flyerChip.classList.add('is-empty');
      setChipState(flyers, '–', t('market.state.unavailable'));
      render();
      return 0;
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
