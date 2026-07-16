// featured.js — the FEATURED ranking perspective (Search Intelligence
// milestone): a lightweight intelligence layer ABOVE the existing search
// engine, never a replacement for it. The matching mirrors still decide WHAT
// matches (stage → family band, HANDOFF rules 9/2); Featured only reorders
// WITHIN a quality group toward what a shopper naturally expects to see first.
//
// Three signal sources, all additive and bounded:
//   1. POSITIVE SIGNALS — a curated, category-aware knowledge base of
//      attributes that add confidence (organic/local/imported, well-known
//      produce brands, explicit fat content on dairy, …). Generic products
//      already rank highly via the stage/band backbone; signals only reward
//      extra meaningful information, they never demote the generic product
//      below a different quality group.
//   2. EXPECTED MARKET BEHAVIOUR — a soft penalty for prices implausibly far
//      from the pool's typical price for the queried product. A 0.5 SAR or a
//      99 SAR "banana" stays searchable; it just shouldn't headline Featured.
//      A ranking signal, never a filter.
//   3. LEARNING — real user choices (card taps, add-to-cart, watch) gradually
//      strengthen query→signal and query→brand relationships in localStorage.
//      Learning affects RANKING ONLY and never touches canonical product data.
//
// PURE except the learning store (injectable for tests). Frontend-only — this
// is a grid ranking perspective, not matching; the matching mirrors (match.js
// ↔ engine matching.js) are untouched, so there is nothing to mirror.

import { normalizeText, queryFamily, queryTokens, isProduceFamily, stageBand } from './match.js';

// --- THE LOWEST-PRICE CONTRACT (LOCKED — user directive 2026-07-16) -----------
// "Lowest price should always prioritize lowest price that match the basic
// ranking: milk 1 riyal should come before milk 3 riyals no matter how
// identical the 3-riyal milk is to the search criteria."
// The perspective has exactly TWO tiers:
//   1. GENUINE matches — entries that pass the basic matching gate (all query
//      terms matched / the primary product, and not a KNOWN different family
//      or flavour-only look-alike) — ordered by PRICE ALONE. No exactness
//      refinement (phrase order, headedness, family-confirmation strength)
//      may ever split this tier.
//   2. everything else (the related tail), below.
// DO NOT change this behaviour again unless the user explicitly asks.
// isPrimaryPriceTier answers "is this entry in tier 1?": stage at the
// 'primary' band top (single-word ≥4, multi-word = all terms matched) and,
// when the query names a family, a family band ≥2 (family-confirmed,
// processed-produce variant, or strong family-less) — band 1/0 (weak
// family-less, known different family, typed/flavoured look-alike) is tail.
export function isPrimaryPriceTier(stage, multiWord, famBand, qFam) {
  if (stageBand(stage, multiWord, 'primary') < (multiWord ? 2 : 4)) return false;
  return qFam ? famBand >= 2 : true;
}

// --- category intelligence ---------------------------------------------------
// Different categories value different attributes (milestone §3). Families come
// from the matching layer's classifier; categories are OUR coarse grouping of
// them so the signal table stays small and maintenance-free.
const FAMILY_CATEGORY = {
  milk: 'dairy', laban: 'dairy', yogurt: 'dairy', cheese: 'dairy',
  cream: 'dairy', butter: 'dairy', eggs: 'dairy',
  chicken: 'meat', meat: 'meat', fish: 'meat',
  water: 'beverage', juice: 'beverage', tea: 'beverage', coffee: 'beverage',
  soda: 'beverage', syrup: 'beverage',
  rice: 'pantry', pasta: 'pantry', bread: 'pantry', oil: 'pantry',
  sugar: 'pantry', flour: 'pantry', dates: 'pantry', honey: 'pantry',
  vinegar: 'pantry',
  chocolate: 'snacks', biscuit: 'snacks', cake: 'snacks', candy: 'snacks',
  chips: 'snacks', icecream: 'snacks', dessert: 'snacks', cereal: 'snacks',
  jam: 'snacks',
};

// The category a product family ranks within ('general' when the family is
// unknown/uncategorized — general signals still apply there).
export function familyCategory(family) {
  if (!family) return 'general';
  if (isProduceFamily(family)) return 'produce';
  return FAMILY_CATEGORY[family] || 'general';
}

// --- the curated signal knowledge base ----------------------------------------
// Each signal: bilingual words/phrases (whole-word matched on normalized text)
// + per-category weights. A category absent from `cats` means the signal is
// meaningless there and contributes nothing ("organic chips" is noise, organic
// strawberries are a real signal). Weights are small on purpose — signals
// refine an already-correct order, they must never overpower it.
// Arabic words are written in normalizeText's canonical form (ه for ة, ا for
// hamza forms) — same convention as match.js lexicons.
const SIGNALS = [
  { id: 'organic', words: ['organic', 'عضوي', 'عضويه', 'اورجانيك'],
    cats: { produce: 1.0, dairy: 0.7, meat: 0.7, pantry: 0.6, beverage: 0.5, general: 0.5 } },
  { id: 'local', words: ['local', 'محلي', 'محليه', 'بلدي', 'بلديه', 'سعودي', 'سعوديه'],
    cats: { produce: 0.9, meat: 0.8, dairy: 0.4, general: 0.3 } },
  { id: 'imported', words: ['imported', 'مستورد', 'مستورده'],
    cats: { produce: 0.7 } },
  { id: 'fresh', words: ['fresh', 'طازج', 'طازجه'],
    cats: { meat: 0.9, dairy: 0.8, produce: 0.4, beverage: 0.4 } },
  { id: 'premium', words: ['premium', 'فاخر', 'فاخره', 'ممتاز', 'ممتازه'],
    cats: { produce: 0.5, pantry: 0.6, snacks: 0.4, general: 0.4 } },
  { id: 'natural', words: ['natural', 'طبيعي', 'طبيعيه'],
    cats: { beverage: 0.6, pantry: 0.4 } },
  // explicit fat content is meaningful information on dairy, nowhere else
  { id: 'fat-spec',
    words: ['كامل الدسم', 'قليل الدسم', 'خالي الدسم', 'منزوع الدسم',
            'full fat', 'full cream', 'low fat', 'skimmed', 'skim'],
    cats: { dairy: 0.6 } },
  { id: 'sugar-free', words: ['بدون سكر', 'sugar free', 'دايت', 'diet', 'زيرو', 'zero'],
    cats: { beverage: 0.6, snacks: 0.4 } },
  // premium named varieties buyers recognize on Saudi shelves
  { id: 'variety', words: ['هاس', 'hass', 'فالنسيا', 'valencia', 'بسمتي', 'basmati', 'سكري', 'خلاص', 'سيفوي'],
    cats: { produce: 0.5, pantry: 0.6 } },
  // origin words — produce shoppers read these as quality/variety information
  { id: 'origin',
    words: ['مصري', 'مصريه', 'egyptian', 'هندي', 'هنديه', 'indian', 'تركي',
            'تركيه', 'turkish', 'اسباني', 'اسبانيه', 'spanish', 'امريكي',
            'american', 'استرالي', 'australian', 'اكوادور', 'ecuador',
            'ecuadorian', 'فلبيني', 'philippines', 'filipino', 'لبناني',
            'lebanese', 'هولندي', 'dutch', 'مغربي', 'moroccan', 'يمني',
            'yemeni', 'باكستاني', 'pakistani', 'صيني', 'chinese', 'افريقي', 'african'],
    cats: { produce: 0.5, pantry: 0.3 } },
  // well-known produce brands (milestone §1 examples) — brand names outside
  // this list still participate via LEARNING (the b:<brand> dynamic id below)
  { id: 'brand:sharbatly', words: ['شربتلي', 'sharbatly'], cats: { produce: 0.8 } },
  { id: 'brand:delmonte', words: ['دل مونتي', 'del monte', 'delmonte', 'ديل مونتي'],
    cats: { produce: 0.8, beverage: 0.5, pantry: 0.5 } },
  { id: 'brand:driscolls', words: ['دريسكول', 'driscoll', 'driscolls'], cats: { produce: 0.8 } },
  { id: 'brand:chiquita', words: ['شيكيتا', 'تشيكيتا', 'chiquita'], cats: { produce: 0.8 } },
  { id: 'brand:dole', words: ['dole'], cats: { produce: 0.8 } },
];

// Fold the Arabic definite article off every word of an already-normalized
// text, so "الفراولة المحلية" matches 'محليه' and the phrase signal "كامل
// الدسم" matches the folded text. Applied identically to signal words and to
// the scanned text — both sides always speak the same folded form.
function foldArticles(norm) {
  return norm.replace(/(^| )(وال|ال)(?=\S\S)/g, '$1');
}

// Whole-word/phrase matchers, built once. Space-delimited on normalized text —
// normalizeText already turned punctuation into spaces, so `(^| )…( |$)` is a
// true word boundary in both scripts (JS \b is ASCII-only, HANDOFF §10).
const SIGNAL_MATCHERS = SIGNALS.map((s) => ({
  id: s.id,
  cats: s.cats,
  re: new RegExp(
    `(^| )(${s.words.map((w) => foldArticles(normalizeText(w))).join('|')})( |$)`,
  ),
}));

// The curated signal ids present in a text (normalized internally, definite
// article folded on both sides).
// محلى (sweetened, alif maqsura) normalizes to محلي (local, ya) — the ONE
// collision normalizeText's ى→ي fold creates here. Drop the RAW alif-maqsura
// spelling before normalizing: a sweetened product must never earn 'local'
// (found live: "موز محلى" — sweetened banana snack). Failure mode stays
// conservative — a local product WRITTEN with ى just goes un-boosted.
export function detectSignals(text) {
  const raw = (text || '').toString().replace(/محلى/g, ' ');
  const norm = ` ${foldArticles(normalizeText(raw))} `;
  const ids = [];
  for (const m of SIGNAL_MATCHERS) if (m.re.test(norm)) ids.push(m.id);
  return ids;
}

// The dynamic learning id for an explicit brand field (online results carry
// one) — lets learning strengthen ANY brand users keep choosing, not just the
// curated produce brands.
export function brandId(brand) {
  const b = normalizeText(brand);
  return b ? `b:${b.split(' ').slice(0, 3).join(' ')}` : null;
}

// --- expected market behaviour -------------------------------------------------
// The typical price of the queried product = median over the PRIMARY matches'
// prices (the caller picks that group — it owns stage/band knowledge). Needs a
// handful of observations to mean anything.
export function medianPrice(prices) {
  const v = prices.filter((p) => typeof p === 'number' && p > 0).sort((a, b) => a - b);
  if (v.length < 4) return null;
  return v[Math.floor(v.length / 2)];
}

// Soft penalty for a price implausibly far from the expected one. Free zone
// 0.5×–2× (normal market spread); beyond it the penalty grows with the log
// distance and caps — a ranking nudge, never a hard filter (milestone §2).
export function pricePenalty(price, median) {
  if (median == null || typeof price !== 'number' || price <= 0) return 0;
  const d = Math.abs(Math.log2(price / median));
  if (d <= 1) return 0;
  return Math.min(2.5, (d - 1) * 1.6);
}

// --- learning (ranking-only, localStorage) --------------------------------------
// { <queryKey>: { <signalId>: count, … }, … } under lsa.featured.learn.v1.
// queryKey is the query's family when it names one (so "strawberry" and
// "فراولة" learn together via the family), else its first token. Counts are
// capped, keys and ids pruned — bounded by construction, no maintenance.
const LEARN_KEY = 'lsa.featured.learn.v1';
const COUNT_CAP = 40; // a count stops growing here (boost saturates earlier)
const IDS_PER_KEY = 24;
const MAX_KEYS = 48;

let storage = typeof localStorage !== 'undefined' ? localStorage : null;
// Test hook: inject an in-memory Storage-like object ({getItem,setItem}).
export function _setLearnStorage(s) {
  storage = s;
}

function readLearn() {
  try {
    const raw = storage && storage.getItem(LEARN_KEY);
    const data = raw ? JSON.parse(raw) : null;
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function writeLearn(data) {
  try {
    if (storage) storage.setItem(LEARN_KEY, JSON.stringify(data));
  } catch {
    /* quota/private mode — learning silently off */
  }
}

// The learning key a query files under, or null (no query, no learning).
export function learnKeyFor(query) {
  const fam = queryFamily(query);
  if (fam) return `f:${fam}`;
  const toks = queryTokens(query);
  return toks.length ? `t:${toks[0]}` : null;
}

// Record a real user choice: the user searched `query` and engaged with a
// product (`text` = its full name(s), `brand` = explicit brand field if any).
// Strengthens the curated signals + the brand present on the chosen product.
export function recordChoice(query, text, brand) {
  const key = learnKeyFor(query);
  if (!key) return;
  const ids = detectSignals(`${text || ''} ${brand || ''}`);
  const bid = brandId(brand);
  if (bid) ids.push(bid);
  if (!ids.length) return;
  const data = readLearn();
  const entry = data[key] || {};
  for (const id of ids) entry[id] = Math.min(COUNT_CAP, (entry[id] || 0) + 1);
  // prune: keep the strongest ids per key, and the newest keys overall
  const kept = Object.entries(entry).sort((a, b) => b[1] - a[1]).slice(0, IDS_PER_KEY);
  delete data[key]; // re-insert so the key moves to the newest position
  data[key] = Object.fromEntries(kept);
  const keys = Object.keys(data);
  for (let i = 0; i < keys.length - MAX_KEYS; i++) delete data[keys[i]];
  writeLearn(data);
}

// The learned counts for a query (read once per render, not per entry).
export function learnedCounts(query) {
  const key = learnKeyFor(query);
  return (key && readLearn()[key]) || {};
}

// The learned boost for a set of signal ids: each repeatedly-confirmed id adds
// up to 0.75 (saturating at 20 sightings — "gradually strengthen"), total
// capped so learning can refine but never dominate the curated order.
export function learnBoost(counts, ids) {
  let boost = 0;
  for (const id of ids) {
    const c = counts[id];
    if (c) boost += (Math.min(c, 20) / 20) * 0.75;
  }
  return Math.min(1.5, boost);
}

// --- the score -------------------------------------------------------------------
// featuredScore(info, ctx) — the perspective key Featured sorts by (descending)
// WITHIN a stage/band quality group. info: { text, brand, family, price,
// discount }; ctx: { median, learn } (build once per render via featuredContext).
// Bounded: curated ≤2 + deal ≤0.6 + learned ≤1.5 − penalty ≤2.5.
export function featuredScore(info, ctx) {
  const cat = familyCategory(info.family);
  const ids = detectSignals(`${info.text || ''} ${info.brand || ''}`);
  let curated = 0;
  for (const id of ids) {
    const sig = SIGNAL_MATCHERS.find((m) => m.id === id);
    const w = sig && sig.cats[cat];
    if (w) curated += w;
  }
  curated = Math.min(2, curated);
  // a genuine advertised discount is expected market behaviour a deals
  // assistant should surface — small weight, honest-by-construction upstream
  const deal = Math.min(info.discount || 0, 0.5) * 1.2;
  const bid = brandId(info.brand);
  const learn = learnBoost(ctx.learn || {}, bid ? [...ids, bid] : ids);
  return curated + deal + learn - pricePenalty(info.price, ctx.median);
}

// Build the per-search Featured context: the expected price comes from the
// PRIMARY matches the caller passes in (grid quality-group knowledge stays in
// the grid), learned counts are read once.
export function featuredContext(query, primaryPrices) {
  return { median: medianPrice(primaryPrices || []), learn: learnedCounts(query) };
}
