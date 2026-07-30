// brochure.js — the frontend's thin, read-only client for the Brochure Engine
// (Pillar 2) and its Price History feature (Pillar 3). This is the ONE place the
// frontend learns about the Brochure Engine: its URL and its store ids. Price
// History is catalog-wide and QUERY-driven — any search query may have history.
//
// It mirrors the provider discipline (HANDOFF §7.2): all Brochure-Engine-specific
// knowledge lives here, so the Core, the generic UI, and the search providers
// stay untouched. It only READS the engine's public API — no new backend, no
// change to the existing architecture. Every function is best-effort and never
// throws: an unreachable engine simply means "no data".
//
//   Engine base:  https://brochure-engine.tamamoooo.workers.dev
//   GET /brochures                        -> { count, brochures: [BrochureDoc] }
//   GET /brochures/history?store=&region= -> all editions, newest first
//   GET /asset/<key>                      -> stored bytes (page images, meta.json, PDFs)
//   GET /prices?q=<query>                 -> { lowest, latest[], variants[], observations,
//                                             weeks, firstSeen, trend } (derived, stage-gated)

import { t } from './i18n.js';
import { getProfile } from './profile.js';

const ENGINE_BASE = 'https://brochure-engine.tamamoooo.workers.dev';

// Every store the Brochure Engine covers, in display order for the Brochures
// page. `search` is the corresponding live-search store id where one exists
// (the brochure provider "hyperpanda" ≡ the search provider "panda").
export const ENGINE_STORES = [
  { id: 'hyperpanda', label: 'Panda', color: '#16a34a', search: 'panda' },
  { id: 'lulu', label: 'Lulu', color: '#6366f1', search: 'lulu' },
  { id: 'tamimi', label: 'Tamimi', color: '#0ea5e9', search: 'tamimi' },
  { id: 'danube', label: 'Danube', color: '#ef4444', search: 'danube' },
  { id: 'othaim', label: 'Othaim', color: '#0d9488', search: null },
  { id: 'carrefour', label: 'Carrefour', color: '#2563eb', search: null },
  { id: 'nesto', label: 'Nesto', color: '#d97706', search: null },
  { id: 'farm', label: 'Farm', color: '#65a30d', search: null },
  { id: 'almadina', label: 'Al Madina', color: '#dc2626', search: null },
  { id: 'ramez', label: 'Ramez', color: '#7c3aed', search: null },
  { id: 'cityflower', label: 'City Flower', color: '#db2777', search: null },
  { id: 'marksave', label: 'Mark & Save', color: '#0891b2', search: null },
  { id: 'amarket', label: 'A Market', color: '#4f46e5', search: null },
  { id: 'grandhyper', label: 'Grand Hyper', color: '#ca8a04', search: null },
  { id: 'makkah', label: 'Makkah', color: '#059669', search: null },
  { id: 'prime', label: 'Prime', color: '#e11d48', search: null },
  { id: 'alwafa', label: 'Hyper Al Wafa', color: '#9333ea', search: null },
  { id: 'aljazera', label: 'AlJazera', color: '#b45309', search: null },
  // Manuel was RETIRED (2026-07-03): dead on D4D since Sep 2025 with no
  // official offers page — an uncurrentable store is removed, never shown
  // stale (milestone rule). Its engine history rows remain in D1.
];
const ENGINE_STORE_BY_ID = Object.fromEntries(ENGINE_STORES.map((s) => [s.id, s]));
const REGION = 'central'; // the personal tool is Riyadh-scoped (HANDOFF §10)

// Search-store id -> the brochure provider { store, region } it corresponds to.
// Only stores that exist in BOTH engines map; amazon and noon have no brochure
// provider, so they simply get no flyer link.
const BROCHURE_STORE = {};
for (const s of ENGINE_STORES) {
  if (s.search) BROCHURE_STORE[s.search] = { store: s.id, region: REGION };
}

export function storeLabel(id) {
  if (!id) return '';
  const s = ENGINE_STORE_BY_ID[id];
  return s ? s.label : id[0].toUpperCase() + id.slice(1);
}

// The engine store's chip color (for the unified marketplace's store badges);
// a neutral slate for stores without one.
export function storeColor(id) {
  const s = ENGINE_STORE_BY_ID[id];
  return s ? s.color : '#64748b';
}

// --- current brochures (the engine's is_current view) ------------------------
// A store may hold SEVERAL current brochures at once (the main weekly flyer
// plus smaller concurrent promos), so the cache keeps a LIST per store.
// Fetched once and cached for the page session (they change weekly, so a single
// fetch per visit keeps the engine polled gently). Never throws.
let brochuresPromise = null;
export function loadBrochures() {
  if (!brochuresPromise) {
    brochuresPromise = fetch(`${ENGINE_BASE}/brochures`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const byStore = {};
        for (const b of (j && j.brochures) || []) {
          const key = `${b.store}:${b.region}`;
          (byStore[key] = byStore[key] || []).push(b);
        }
        return byStore;
      })
      .catch(() => ({}));
  }
  return brochuresPromise;
}

// Order brochures for display, MAIN WEEKLY FLYER FIRST — never prefer a 1-page
// promo over the main brochure: active before inactive, in-app viewable before
// external links, then most pages (from the cached meta.json, which the covers
// and viewer need anyway), then the latest validTo. Never throws.
export async function orderBrochures(brochures) {
  const scored = await Promise.all(
    (brochures || []).map(async (b) => {
      let pages = 0;
      if (!isExternalBrochure(b)) {
        const data = await loadBrochurePages(b);
        pages = data ? data.pages.length : 0;
      }
      return { b, pages };
    }),
  );
  scored.sort(
    (a, z) =>
      (isActiveBrochure(z.b) ? 1 : 0) - (isActiveBrochure(a.b) ? 1 : 0) ||
      (isExternalBrochure(a.b) ? 1 : 0) - (isExternalBrochure(z.b) ? 1 : 0) ||
      z.pages - a.pages ||
      (z.b.validTo || '').localeCompare(a.b.validTo || ''),
  );
  return scored.map((s) => s.b);
}

// The BEST current brochure for a SEARCH store id (the one the search page's
// flyer chip shows), or null if that store has none.
export async function brochureForStore(searchStoreId) {
  const map = BROCHURE_STORE[searchStoreId];
  if (!map) return null;
  const byStore = await loadBrochures();
  const list = byStore[`${map.store}:${map.region}`] || [];
  if (!list.length) return null;
  return (await orderBrochures(list))[0];
}

// --- edition history (the Brochures page's substrate) ------------------------
// All editions the engine holds for one store, newest first. Cached per store
// per page session. Never throws.
const historyCache = new Map();
export function loadStoreEditions(storeId, region = REGION) {
  const key = `${storeId}:${region}`;
  if (!historyCache.has(key)) {
    historyCache.set(
      key,
      fetch(`${ENGINE_BASE}/brochures/history?store=${storeId}&region=${region}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => ((j && j.brochures) || []))
        .catch(() => []),
    );
  }
  return historyCache.get(key);
}

// --- validity ---------------------------------------------------------------
// A brochure is ACTIVE when its validity window includes today. Undated
// brochures (e.g. Othaim's PDF carries no dates) count as active while the
// engine marks them current. Dates are plain YYYY-MM-DD strings, so string
// comparison against today's local date is exact.
function todayYMD() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function isActiveBrochure(b) {
  if (!b) return false;
  const today = todayYMD();
  if (b.validTo) return b.validTo >= today && (!b.validFrom || b.validFrom <= today);
  return !!b.isCurrent;
}

// Whole days until a brochure expires: 0 = ends today, null = undated.
export function daysLeft(b) {
  if (!b || !b.validTo) return null;
  const ms = new Date(`${b.validTo}T23:59:59`) - new Date();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.floor(ms / 86400000));
}

// Is this brochure an EXTERNAL link rather than an in-app viewable page set?
// The engine serves two kinds of current brochure, and the frontend stays
// source-agnostic: it never learns which aggregator or official source produced
// a brochure, only whether it is viewable inline (page images / a stored PDF)
// or a pointer to the store's official offers page (sourceType "link").
export function isExternalBrochure(b) {
  return !!(b && b.sourceType === 'link' && b.sourceUrl);
}

export function isPdfBrochure(b) {
  return !!(b && b.sourceType === 'pdf');
}

// --- assets (always served THROUGH the engine) -------------------------------
// The user never touches the original aggregator/store site. `key` is an object
// key like "brochures/lulu/central/2026-W27/page00.webp".
export function assetUrl(key) {
  return `${ENGINE_BASE}/asset/${key}`;
}

// The engine-served copy of a PDF brochure (stored during ingest, §11).
export function pdfAssetUrl(b) {
  if (!b || !b.storageKey) return null;
  return assetUrl(`brochures/${b.storageKey}/original.pdf`);
}

// The brochure's page images, served through the engine, for the in-app viewer.
// Reads the stored meta.json (which lists pages[]; the /brochures row omits
// them, HANDOFF §12.D.2). Returns { pages, title, validFrom, validTo } or null.
// Cached per brochure. Never throws.
const pagesCache = new Map();
export function loadBrochurePages(b) {
  if (!b || !b.storageKey) return Promise.resolve(null);
  if (!pagesCache.has(b.storageKey)) {
    pagesCache.set(
      b.storageKey,
      fetch(assetUrl(`brochures/${b.storageKey}/meta.json`))
        .then((r) => (r.ok ? r.json() : null))
        .then((meta) => {
          if (!meta) return null;
          const ordered = (meta.pages || []).slice().sort((a, z) => a.index - z.index);
          const pages = ordered.map((p) => assetUrl(p.imageUrl));
          if (!pages.length) return null;
          // Aligned with pages[]: the aggregator page id an offer deep-links to
          // (null when the edition predates page-id capture), so the viewer can
          // open on the offer's own page. See openBrochureViewer.
          const pageIds = ordered.map((p) => (p.pageId != null ? String(p.pageId) : null));
          // Also aligned with pages[]: each page's ORIGINAL source index — the
          // key hotspot pages join on (ordinal position shifts when a source
          // page had no image, the index never does).
          const indices = ordered.map((p) => p.index);
          return { pages, pageIds, indices, title: meta.title, validFrom: meta.validFrom, validTo: meta.validTo };
        })
        .catch(() => null),
    );
  }
  return pagesCache.get(b.storageKey);
}

// --- offer display-name cleanup -----------------------------------------------
// Engine offer names are OCR-derived and sometimes lead with flyer banner
// debris ("يوليو july ايام فقط days only برتقال…"). For DISPLAY (and for
// seeding the similar-products search) we trim leading banner/month/number
// tokens until a product-like token appears. Trim-from-the-front only — never
// drop words from inside a name — and fall back to the original when the trim
// would consume everything.
const NAME_DEBRIS = new Set([
  'offer', 'offers', 'deal', 'deals', 'only', 'day', 'days', 'till', 'until', 'weekly',
  'special', 'promo', 'promotion', 'price', 'prices', 'amazing', 'exciting', 'super',
  'mega', 'best', 'buy', 'save', 'free', 'now', 'new', 'sale', 'to', 'from', 'valid',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
  'عرض', 'عروض', 'فقط', 'ايام', 'أيام', 'يوم', 'حتى', 'حتي', 'خصم', 'وفر', 'توفير',
  'مجانا', 'سعر', 'اسعار', 'أسعار', 'جديد', 'الان', 'الآن', 'تخفيضات',
  'يناير', 'فبراير', 'مارس', 'ابريل', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'اغسطس',
  'أغسطس', 'سبتمبر', 'اكتوبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]);
export function cleanOfferName(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  let start = 0;
  while (start < words.length) {
    const w = words[start].toLowerCase();
    if (NAME_DEBRIS.has(w) || /^\d/.test(w)) start += 1;
    else break;
  }
  const cleaned = words.slice(start).join(' ');
  return cleaned || words.join(' ');
}

// --- per-product tap targets (the ClickFlyer-style brochure experience) ------
// GET /brochures/hotspots?id= — for a held aggregator brochure, the engine
// serves each page's product tap-boxes (fractions of the page image) plus ALL
// of that flyer's structured offers keyed by offerId, in one response. The
// viewer overlays the boxes on its pages; tapping one opens the product sheet.
// Geometry is edition-immutable, so a per-brochure session cache is safe.
// Best-effort like every engine read: null just means "not tappable".
const hotspotsCache = new Map();
export function loadHotspots(b) {
  if (!b || !b.id || b.sourceType !== 'images') return Promise.resolve(null);
  if (!hotspotsCache.has(b.id)) {
    hotspotsCache.set(
      b.id,
      fetch(`${ENGINE_BASE}/brochures/hotspots?id=${encodeURIComponent(b.id)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!j || !Array.isArray(j.pages) || !j.pages.length) return null;
          // index -> spots[], plus the offers join the product sheet renders.
          const spotsByIndex = new Map(j.pages.map((p) => [p.index, p.spots || []]));
          return { spotsByIndex, offers: j.offers || {}, note: j.note || '' };
        })
        .catch(() => null),
    );
  }
  return hotspotsCache.get(b.id);
}

// The first page image (the brochure "cover") for card thumbnails, or null
// (PDF and link brochures have no page images).
export async function loadBrochureCover(b) {
  const data = await loadBrochurePages(b);
  return data && data.pages.length ? data.pages[0] : null;
}

// --- structured flyer offers (the price-comparison substrate) -----------------
// GET /offers?q= — per-product deals machine-extracted from the physical
// stores' current flyers (price, was-price, validity, product image crop,
// flyer deep-link). This is how the search page compares ONLINE prices with
// PHYSICAL-store flyer prices. Prices are aggregator-AI-extracted from flyer
// images (the engine's `note` repeats this), so the UI must keep the "from the
// flyer" framing and the click-through to the flyer itself. Cached per query
// for the page session. Never throws.
const offersCache = new Map();
export function searchOffers(query, limit = 50) {
  const q = (query || '').trim();
  if (!q) return Promise.resolve(null);
  const key = `${q}:${limit}`;
  if (!offersCache.has(key)) {
    if (offersCache.size > 20) offersCache.clear(); // tiny session cache
    offersCache.set(
      key,
      fetch(`${ENGINE_BASE}/offers?q=${encodeURIComponent(q)}&limit=${limit}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => (j && Array.isArray(j.offers) && j.offers.length ? j : null))
        .catch(() => null),
    );
  }
  return offersCache.get(key);
}

// The D4D flyer id embedded in a held brochure's provenance URL. This is data
// lineage only: the URL is never returned as a browsing destination.
export function brochureFlyerRef(b) {
  const m = /\/offers\/[^/]+\/(\d+)(?:\/|$)/.exec(String((b && b.sourceUrl) || ''));
  return m ? m[1] : null;
}

// The held brochure a flyer offer belongs to, so a click can open the in-app
// viewer. A store may publish several concurrent flyers, and the /offers feed
// carries a mix of edition strings — some exact, some null. Resolve only with
// offer-level evidence. A different brochure from the same store is NOT a
// fallback: that was the page-1 bug, because store identity does not prove that
// the selected product is present in that brochure.
export async function brochureForOffer(offer) {
  if (!offer || !offer.store) return null;
  const byStore = await loadBrochures();
  const list = byStore[`${offer.store}:${offer.region || REGION}`] || [];
  if (!list.length) return null;

  // 1. Strong database linkage — the exact downloaded brochure id stamped
  //    only after ingest verified the offer's stored page.
  if (offer.brochureId) {
    const exactId = list.find((b) => b.id === offer.brochureId);
    if (exactId) return exactId;
  }

  // 2. Legacy exact edition — retained during the schema rollout.
  if (offer.edition) {
    const exact = list.find((b) => b.edition === offer.edition);
    if (exact) return exact;
  }

  // 3. Same aggregator flyer by provenance. Primary brochures use a plain
  //    weekly edition (e.g. "2026-W30"), so checking only an edition suffix
  //    misses them when an older offer row has no edition stamp.
  if (offer.flyerRef) {
    const ref = String(offer.flyerRef);
    const suffix = `-${ref}`;
    const byFlyer = list.find(
      (b) => brochureFlyerRef(b) === ref || (b.edition && b.edition.endsWith(suffix)),
    );
    if (byFlyer) return byFlyer;
  }

  // 4. The brochure whose page set actually contains the offer's page — the
  //    authoritative page↔brochure link, robust to a null/stale edition.
  if (offer.pageRef != null) {
    const ref = String(offer.pageRef);
    for (const b of list) {
      const data = await loadBrochurePages(b).catch(() => null);
      if (data && Array.isArray(data.pageIds) && data.pageIds.includes(ref)) return b;
    }
  }

  // No exact held flyer. Do not substitute an unrelated local brochure and do
  // not expose the aggregator URL as a browsing fallback.
  return null;
}

// Resolve an offer all the way to a VERIFIED local page before navigation.
// pageRef is the first path; hotspot geometry is the recovery path for held
// editions whose meta.json predates page-id capture. Null means the exact local
// flyer/page is unavailable, so callers must not open page 1 or D4D.
export async function localLandingForOffer(offer) {
  const brochure = await brochureForOffer(offer);
  if (!brochure || brochure.sourceType !== 'images') return null;

  const [pages, hotspots] = await Promise.all([
    loadBrochurePages(brochure).catch(() => null),
    loadHotspots(brochure).catch(() => null),
  ]);
  if (!pages || !pages.pages.length) return null;

  const targetPageId = offer.pageRef != null ? String(offer.pageRef) : null;
  if (Number.isInteger(offer.pageIndex) && pages.indices.includes(offer.pageIndex)) {
    return {
      brochure,
      targetPageId,
      targetPageIndex: offer.pageIndex,
      targetOfferId: offer.offerId,
    };
  }
  if (targetPageId && Array.isArray(pages.pageIds)) {
    const rendered = pages.pageIds.indexOf(targetPageId);
    if (rendered >= 0) {
      return {
        brochure,
        targetPageId,
        targetPageIndex: pages.indices[rendered],
        targetOfferId: offer.offerId,
      };
    }
  }

  if (hotspots && offer.offerId != null) {
    const id = String(offer.offerId);
    for (const [pageIndex, spots] of hotspots.spotsByIndex) {
      if ((spots || []).some((spot) => String(spot.offerId) === id)) {
        return {
          brochure,
          targetPageId,
          targetPageIndex: pageIndex,
          targetOfferId: offer.offerId,
        };
      }
    }
  }

  return null;
}

// --- Browse (the product-discovery pillar, BROWSE-DESIGN.md) -------------------
// GET /browse — the market floor in one payload: canonical departments/aisles
// with live-offer counts plus the rails (Biggest Drops, Lowest Ever). Cached
// for the page session (the substrate changes 3×/week; the engine edge-caches
// it too). GET /browse/offers — the universal listing behind every Browse node.
// Both best-effort like every engine read: null just means "Browse is resting".
let browseSummaryPromise = null;
export function loadBrowseSummary() {
  if (!browseSummaryPromise) {
    browseSummaryPromise = fetch(`${ENGINE_BASE}/browse`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j && Array.isArray(j.departments) ? j : null))
      .catch(() => null);
  }
  return browseSummaryPromise;
}

// params: { dept?, aisle?, brand?, rail?, store?, sort?, limit?, offset? } —
// canonical ids only (the engine owns the provider-category mapping).
// ⚠️ `brand` MUST stay in the whitelist below: its omission was the Browse V1
// bug where every brand page silently showed the GLOBAL listing (V1.1 audit).
const browseOffersCache = new Map();
export function browseOffers(params = {}) {
  const qs = new URLSearchParams();
  for (const k of ['dept', 'aisle', 'brand', 'rail', 'store', 'sort', 'limit', 'offset']) {
    if (params[k] != null && params[k] !== '') qs.set(k, params[k]);
  }
  const key = qs.toString();
  if (!browseOffersCache.has(key)) {
    if (browseOffersCache.size > 30) browseOffersCache.clear(); // tiny session cache
    browseOffersCache.set(
      key,
      fetch(`${ENGINE_BASE}/browse/offers?${key}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => (j && Array.isArray(j.offers) ? j : null))
        .catch(() => null),
    );
  }
  return browseOffersCache.get(key);
}

// --- Price Monitoring (watches + alerts) --------------------------------------
// The engine's Keepa-inspired monitoring: the user sets a target price on a
// specific product (kind 'product': provider + stable product id) or a grocery
// query (kind 'grocery': checked across ALL sources — online stores + flyer
// offers) and the engine's daily cron writes an alert when the price crosses
// down to the target. These are thin, never-throwing clients for that API.
//
// PROFILE-SCOPED (Local Profile milestone): every call carries this browser's
// local profile id, so each browser only ever sees — and can only ever delete —
// its own watches and alerts. The engine enforces the scope and the per-profile
// watch limit; this client just always sends the id.

const profileId = () => getProfile().id;

export async function listWatches() {
  try {
    const r = await fetch(`${ENGINE_BASE}/watches?profile=${encodeURIComponent(profileId())}`);
    if (!r.ok) return null;
    const j = await r.json();
    return j && Array.isArray(j.watches) ? j : null;
  } catch {
    return null;
  }
}

// body: { kind, query, targetPrice, label?, provider?, productId?, link?,
// image?, sizeText? }. Returns { watch } or { error }.
export async function createWatch(body) {
  try {
    const r = await fetch(`${ENGINE_BASE}/watches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, profileId: profileId() }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { error: j.error || `HTTP ${r.status}` };
    return j;
  } catch {
    return { error: t('watch.createError') };
  }
}

export async function updateWatch(id, settings) {
  try {
    const r = await fetch(
      `${ENGINE_BASE}/watches?id=${encodeURIComponent(id)}&profile=${encodeURIComponent(profileId())}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      },
    );
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { error: j.error || `HTTP ${r.status}` };
    return { watch: j.watch };
  } catch {
    return { error: t('watch.updateError') };
  }
}

// The products this watch could be, for the confirmation picker. Only ever
// called for a watch the engine put in 'needs-confirmation'.
export async function watchCandidates(id) {
  try {
    const r = await fetch(
      `${ENGINE_BASE}/watches/candidates?id=${encodeURIComponent(id)}&profile=${encodeURIComponent(profileId())}`,
    );
    const j = await r.json().catch(() => ({}));
    return r.ok && Array.isArray(j.candidates)
      ? { version: j.version || null, reason: j.reason || null, candidates: j.candidates }
      : { version: null, reason: null, candidates: [] };
  } catch {
    return { version: null, reason: null, candidates: [] };
  }
}

// "Why is this watch quiet?" — the real retrieval and the real identity
// decision, per candidate. Read-only; the engine writes nothing.
export async function diagnoseWatch(id) {
  try {
    const r = await fetch(
      `${ENGINE_BASE}/watches/diagnose?id=${encodeURIComponent(id)}&profile=${encodeURIComponent(profileId())}`,
    );
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : null;
  } catch {
    return null;
  }
}

// The user's answer: bind this watch to that product. Reuses the PATCH route.
export const confirmWatchProduct = (id, registryProductId, candidateVersion) =>
  updateWatch(id, { registryProductId, candidateVersion });

export const confirmWatchSource = (id, sourceProvider, sourceProductId, candidateVersion) =>
  updateWatch(id, { sourceProvider, sourceProductId, candidateVersion });

export const declineWatchCandidates = (id, candidateVersion) =>
  updateWatch(id, { confirmationAction: 'none', candidateVersion });

export async function repairWatch(id) {
  try {
    const r = await fetch(
      `${ENGINE_BASE}/watches/repair?id=${encodeURIComponent(id)}&profile=${encodeURIComponent(profileId())}`,
      { method: 'POST' },
    );
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : { error: j.error || `HTTP ${r.status}` };
  } catch {
    return { error: t('watch.updateError') };
  }
}

export async function refreshWatch(id) {
  try {
    const r = await fetch(
      `${ENGINE_BASE}/watches/refresh?id=${encodeURIComponent(id)}&profile=${encodeURIComponent(profileId())}`,
      { method: 'POST' },
    );
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : { error: j.error || `HTTP ${r.status}` };
  } catch {
    return { error: t('watch.updateError') };
  }
}

export async function deleteWatch(id) {
  try {
    const r = await fetch(
      `${ENGINE_BASE}/watches?id=${encodeURIComponent(id)}&profile=${encodeURIComponent(profileId())}`,
      { method: 'DELETE' },
    );
    return r.ok;
  } catch {
    return false;
  }
}

export async function listAlerts(limit = 50) {
  try {
    const r = await fetch(`${ENGINE_BASE}/alerts?limit=${limit}&profile=${encodeURIComponent(profileId())}`);
    if (!r.ok) return null;
    const j = await r.json();
    return j && Array.isArray(j.alerts) ? j : null;
  } catch {
    return null;
  }
}

export async function markAlertsSeen() {
  try {
    await fetch(`${ENGINE_BASE}/alerts/seen?profile=${encodeURIComponent(profileId())}`, { method: 'POST' });
  } catch {
    /* best-effort */
  }
}

// --- price history (Pillar 3, read-only) -------------------------------------
// The full price picture for ANY query — the engine derives it from the
// catalog-wide, offers-harvested history (stage-gated to the query's best
// match band, grouped per size/variant). Null when nothing is recorded yet or
// the engine is unreachable (missing history must never break the search).
// Session-cached per query: the summary is the only consumer, one GET per
// distinct search.
const pricesCache = new Map();
export async function pricesForQuery(query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return null;
  if (!pricesCache.has(q)) {
    pricesCache.set(
      q,
      fetch(`${ENGINE_BASE}/prices?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!j || !(j.observations > 0)) return null;
          return {
            lowest: j.lowest || null,
            latest: Array.isArray(j.latest) ? j.latest : [],
            variants: Array.isArray(j.variants) ? j.variants : [],
            observations: j.observations,
            weeks: j.weeks || 0,
            firstSeen: j.firstSeen || null,
            trend: j.trend || null,
          };
        })
        .catch(() => null),
    );
  }
  return pricesCache.get(q);
}
