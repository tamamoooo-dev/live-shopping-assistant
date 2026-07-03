// brochure.js — the frontend's thin, read-only client for the Brochure Engine
// (Pillar 2) and its Price History feature (Pillar 3). This is the ONE place the
// frontend learns about the Brochure Engine: its URL, its store ids, and which
// search queries correspond to a tracked price-history product.
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
//   GET /lowest?product=<id>              -> { product, lowest: PricePoint|null }
//   GET /prices?product=<id>              -> { product, lowest, latest: [PricePoint], variants: [VariantRecord] }

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

// Tracked price-history products (HANDOFF §13 watchlist). A search query maps to
// a product id when it matches one of these patterns — that's when price
// intelligence is available. Kept tiny, mirroring the engine's products.js.
const PRODUCTS = [
  { id: 'milk', label: 'Milk', match: /\bmilk\b|حليب|لبن/i },
  { id: 'eggs', label: 'Eggs', match: /\beggs?\b|بيض/i },
];

export function trackedProducts() {
  return PRODUCTS.map((p) => ({ id: p.id, label: p.label }));
}

// The tracked product id a query corresponds to, or null.
export function productForQuery(query) {
  const q = (query || '').trim();
  if (!q) return null;
  const hit = PRODUCTS.find((p) => p.match.test(q));
  return hit ? hit.id : null;
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
          return { pages, pageIds, title: meta.title, validFrom: meta.validFrom, validTo: meta.validTo };
        })
        .catch(() => null),
    );
  }
  return pagesCache.get(b.storageKey);
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
export function searchOffers(query, limit = 24) {
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

// The held brochure a flyer offer belongs to (same engine store + edition), so
// a click can open the in-app viewer instead of leaving the app. Null when the
// edition isn't held/current — the caller falls back to the offer's sourceUrl.
export async function brochureForOffer(offer) {
  if (!offer || !offer.store || !offer.edition) return null;
  const byStore = await loadBrochures();
  const list = byStore[`${offer.store}:${offer.region || REGION}`] || [];
  return list.find((b) => b.edition === offer.edition) || null;
}

// --- Price Monitoring (watches + alerts) --------------------------------------
// The engine's Keepa-inspired monitoring: the user sets a target price on a
// specific product (kind 'product': provider + stable product id) or a grocery
// query (kind 'grocery': checked across ALL sources — online stores + flyer
// offers) and the engine's daily cron writes an alert when the price crosses
// down to the target. These are thin, never-throwing clients for that API.

export async function listWatches() {
  try {
    const r = await fetch(`${ENGINE_BASE}/watches`);
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
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { error: j.error || `HTTP ${r.status}` };
    return { watch: j.watch };
  } catch {
    return { error: 'The alerts service is unreachable right now.' };
  }
}

export async function deleteWatch(id) {
  try {
    const r = await fetch(`${ENGINE_BASE}/watches?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    return r.ok;
  } catch {
    return false;
  }
}

export async function listAlerts(limit = 50) {
  try {
    const r = await fetch(`${ENGINE_BASE}/alerts?limit=${limit}`);
    if (!r.ok) return null;
    const j = await r.json();
    return j && Array.isArray(j.alerts) ? j : null;
  } catch {
    return null;
  }
}

export async function markAlertsSeen() {
  try {
    await fetch(`${ENGINE_BASE}/alerts/seen`, { method: 'POST' });
  } catch {
    /* best-effort */
  }
}

// --- price history (Pillar 3, read-only) -------------------------------------
// The full price picture for a tracked product: the lowest-ever point plus the
// latest captured point per store — what the search page's price-intelligence
// panel renders ("is today a good deal?"). Returns { lowest, latest: [] }|null.
export async function pricesForProduct(productId) {
  try {
    const r = await fetch(`${ENGINE_BASE}/prices?product=${encodeURIComponent(productId)}`);
    if (!r.ok) return null;
    const j = await r.json();
    if (!j || !j.lowest) return null;
    // `variants` (per size/variant history) is optional — an older engine
    // deployment omits it, so the summary falls back to the product-wide low.
    return {
      lowest: j.lowest,
      latest: Array.isArray(j.latest) ? j.latest : [],
      variants: Array.isArray(j.variants) ? j.variants : [],
    };
  } catch {
    return null;
  }
}
