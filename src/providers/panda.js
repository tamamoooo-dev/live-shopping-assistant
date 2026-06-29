// panda.js — the Panda Provider.
//
// This is the ONLY file that knows anything Panda-specific: its host, the
// headers its API wants, how to read its responses, and how to build links.
//
// It exposes one provider object with an ordered list of strategies. The Core
// drives them; this file just describes them. To add another store later,
// create a sibling file (e.g. providers/othmar.js) that exports the same shape
// and register it in app.js — no Core changes needed.

import { createMemory } from '../core.js';

const API_BASE = 'https://api.panda.sa/v3';
const WEB_BASE = 'https://panda.sa';
const IMG_BASE = 'https://images.todoorstep.com';

const memory = createMemory('panda');

// ---------------------------------------------------------------------------
// Session id
//
// Panda's API only returns a product catalogue when an X-SESSION-ID header is
// present — it binds a default delivery branch to that id. Any UUID works; an
// empty/missing one yields zero results. We generate one once and keep it so
// searches stay consistent on this device.
// ---------------------------------------------------------------------------
function sessionId() {
  let id = memory.get('session');
  if (!id) {
    id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : fallbackUuid();
    memory.set('session', id);
  }
  return id;
}

function fallbackUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function headers(lang) {
  return {
    Accept: 'application/json',
    'X-Panda-Source': 'PandaClick',
    'X-PandaClick-Agent': '4',
    'api-version': '2025-10-01',
    'X-Language': lang === 'ar' ? 'ar' : 'en',
    'X-SESSION-ID': sessionId(),
  };
}

// Arabic input -> Arabic catalogue, otherwise English.
function detectLang(query) {
  return /[؀-ۿ]/.test(query) ? 'ar' : 'en';
}

async function apiGet(path, lang) {
  const res = await fetch(`${API_BASE}${path}`, { headers: headers(lang) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Helpers for turning Panda data into a NormalizedResult
// ---------------------------------------------------------------------------
function toNumber(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function slugify(name) {
  return (name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function productLink(id, name, lang) {
  return `${WEB_BASE}/${lang}/p/${id}.${slugify(name)}`;
}

// Each variety carries `images: [[base, large, small], ...]`. Take the first
// usable image; fall back to the SKU-based path if the array is missing.
function pickImage(variety) {
  const sets = variety && variety.images;
  if (Array.isArray(sets) && sets.length && Array.isArray(sets[0]) && sets[0][0]) {
    return sets[0][0];
  }
  if (variety && variety.sku) return `${IMG_BASE}/product/${variety.sku}/En.jpg`;
  return '';
}

function normalizeProduct(product, lang) {
  const variety = (product.varieties && product.varieties[0]) || {};
  const price = toNumber(variety.price);
  const undiscounted = toNumber(variety.undiscounted_price);
  // Only treat it as a "previous price" when it is genuinely higher.
  const oldPrice = undiscounted && price && undiscounted > price ? undiscounted : null;

  return {
    id: product.id,
    name: (product.name || '').trim(),
    image: pickImage(variety),
    price,
    oldPrice,
    currency: 'SAR',
    link: productLink(product.id, product.name, lang),
    size: [variety.size, variety.unit].filter(Boolean).join(' ').trim(),
    brand: product.brand && product.brand.name ? product.brand.name.trim() : '',
    discountLabel: variety.discount_label || '',
  };
}

// ---------------------------------------------------------------------------
// Strategy 1 — rich products endpoint (primary, has prices + images)
// ---------------------------------------------------------------------------
const productsStrategy = {
  name: 'products-v3',
  async run(query) {
    const lang = detectLang(query);
    const path = `/products?search_key=${encodeURIComponent(query)}&page=1`;
    const json = await apiGet(path, lang);
    const list = json && json.data && json.data.products;
    if (!Array.isArray(list)) throw new Error('unexpected response shape');
    return list.map((p) => normalizeProduct(p, lang)).filter((r) => r.name);
  },
};

// ---------------------------------------------------------------------------
// Strategy 2 — search suggestions (fallback: names + links, prices unavailable)
//
// Used only if the rich endpoint ever changes shape. It still gives the user
// product names and working links so the tool degrades gracefully.
// ---------------------------------------------------------------------------
const suggestionsStrategy = {
  name: 'suggestions-v3',
  async run(query) {
    const lang = detectLang(query);
    const path = `/products/search_suggestions?search_key=${encodeURIComponent(query)}&page=1`;
    const json = await apiGet(path, lang);
    const groups = json && json.data && json.data.search_suggestions;
    if (!Array.isArray(groups)) throw new Error('unexpected response shape');

    const results = [];
    for (const group of groups) {
      for (const s of group.suggestions || []) {
        if (s.type !== 'product' || !s.id) continue;
        const name = (s.terms || '').trim();
        results.push({
          id: s.id,
          name,
          image: `${IMG_BASE}/product/${s.id}/En.jpg`,
          price: null,
          oldPrice: null,
          currency: 'SAR',
          link: productLink(s.id, name, lang),
          size: '',
          brand: '',
          discountLabel: '',
        });
      }
    }
    return results;
  },
};

export const pandaProvider = {
  id: 'panda',
  label: 'Panda',
  strategies: [productsStrategy, suggestionsStrategy],
};
