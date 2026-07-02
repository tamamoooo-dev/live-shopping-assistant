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
//   GET /prices?product=<id>              -> { product, lowest, latest: [PricePoint] }

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
  { id: 'manuel', label: 'Manuel', color: '#9333ea', search: null },
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

// --- current brochures (one per store, the engine's is_current view) --------
// Fetched once and cached for the page session (they change weekly, so a single
// fetch per visit keeps the engine polled gently). Never throws.
let brochuresPromise = null;
export function loadBrochures() {
  if (!brochuresPromise) {
    brochuresPromise = fetch(`${ENGINE_BASE}/brochures`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const byStore = {};
        for (const b of (j && j.brochures) || []) byStore[`${b.store}:${b.region}`] = b;
        return byStore;
      })
      .catch(() => ({}));
  }
  return brochuresPromise;
}

// The current brochure for a SEARCH store id, or null if that store has none.
export async function brochureForStore(searchStoreId) {
  const map = BROCHURE_STORE[searchStoreId];
  if (!map) return null;
  const byStore = await loadBrochures();
  return byStore[`${map.store}:${map.region}`] || null;
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
          const pages = (meta.pages || [])
            .slice()
            .sort((a, z) => a.index - z.index)
            .map((p) => assetUrl(p.imageUrl));
          if (!pages.length) return null;
          return { pages, title: meta.title, validFrom: meta.validFrom, validTo: meta.validTo };
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
    return { lowest: j.lowest, latest: Array.isArray(j.latest) ? j.latest : [] };
  } catch {
    return null;
  }
}
