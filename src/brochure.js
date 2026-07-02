// brochure.js — the frontend's thin client for the Brochure Engine (Pillar 2)
// and its Price History feature (Pillar 3). This is the ONE place the search
// frontend learns about the Brochure Engine: its URL, its store ids, and which
// search queries correspond to a tracked price-history product.
//
// It mirrors the provider discipline (HANDOFF §7.2): all Brochure-Engine-specific
// knowledge lives here, so the Core, the generic UI, and the search providers
// stay untouched. It only READS the engine's public API — no new backend, no
// change to the existing architecture.
//
//   Engine base:  https://brochure-engine.tamamoooo.workers.dev
//   GET /brochures                 -> { count, brochures: [ BrochureDoc ] }
//   GET /lowest?product=<id>       -> { product, lowest: PricePoint|null }

const ENGINE_BASE = 'https://brochure-engine.tamamoooo.workers.dev';

// Search-store id  ->  the brochure provider { store, region } it corresponds to.
// Only stores that exist in BOTH engines map (HANDOFF §12.D.4: the brochure
// provider "hyperpanda" ≡ the search provider "panda"). amazon and noon have no
// brochure provider, so they simply get no flyer link.
const BROCHURE_STORE = {
  panda: { store: 'hyperpanda', region: 'central' },
  lulu: { store: 'lulu', region: 'central' },
  tamimi: { store: 'tamimi', region: 'central' },
  danube: { store: 'danube', region: 'central' },
};

// Display labels for brochure-engine store ids (the lowest-price "where" uses
// these ids, e.g. "hyperpanda"). Falls back to a capitalized id.
const STORE_LABELS = {
  hyperpanda: 'Panda',
  lulu: 'Lulu',
  tamimi: 'Tamimi',
  danube: 'Danube',
  othaim: 'Othaim',
  carrefour: 'Carrefour',
  manuel: 'Manuel',
  nesto: 'Nesto',
};

export function storeLabel(id) {
  if (!id) return '';
  return STORE_LABELS[id] || id[0].toUpperCase() + id.slice(1);
}

// Tracked price-history products (HANDOFF §13 watchlist). A search query maps to
// a product id when it matches one of these patterns — that's when a "lowest
// recorded" banner is available. Kept tiny, matching the personal-tool watchlist
// in the engine's products.js.
const PRODUCTS = [
  { id: 'milk', match: /\bmilk\b|حليب|لبن/i },
  { id: 'eggs', match: /\beggs?\b|بيض/i },
];

// The tracked product id a query corresponds to, or null.
export function productForQuery(query) {
  const q = (query || '').trim();
  if (!q) return null;
  const hit = PRODUCTS.find((p) => p.match.test(q));
  return hit ? hit.id : null;
}

// Current brochures, fetched once and cached for the page session (they change
// weekly, so a single fetch per visit is plenty and keeps the engine polled
// gently). Returns a map keyed "store:region" -> BrochureDoc. Never throws.
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

// A browsable link that opens a brochure: the original flyer page (works for
// both aggregator image-sets and the Othaim PDF).
export function brochureLink(b) {
  return b ? b.sourceUrl || b.pdfUrl : null;
}

// The lowest recorded price point for a tracked product id, or null. Never
// throws — an unreachable engine just means no banner.
export async function lowestForProduct(productId) {
  try {
    const r = await fetch(`${ENGINE_BASE}/lowest?product=${encodeURIComponent(productId)}`);
    if (!r.ok) return null;
    const j = await r.json();
    return (j && j.lowest) || null;
  } catch {
    return null;
  }
}
