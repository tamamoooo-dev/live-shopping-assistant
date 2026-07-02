// app.js — wires the UI to the Core + providers.
//
// Two search modes, both built on the SAME Core (adaptiveSearch) and the SAME
// providers and normalized result contract — nothing below this file changes:
//   • All stores  — search every selected store in parallel, grouped by store.
//   • Single store — search one store (the dropdown), flat grid.

import { createMemory, adaptiveSearch } from './core.js';
import { pandaProvider } from './providers/panda.js';
import { amazonProvider } from './providers/amazon.js';
import { tamimiProvider } from './providers/tamimi.js';
import { danubeProvider } from './providers/danube.js';
import { luluProvider } from './providers/lulu.js';
import { noonProvider } from './providers/noon.js';
import {
  loadBrochures,
  brochureForStore,
  loadBrochurePages,
  isExternalBrochure,
  productForQuery,
  lowestForProduct,
  storeLabel,
} from './brochure.js';

const memory = createMemory('app');

// Ordered store list — drives the dropdown, the chips, and grouped results.
const STORES = [
  { id: 'panda', label: 'Panda', color: '#16a34a', provider: pandaProvider },
  { id: 'amazon', label: 'Amazon', color: '#f59e0b', provider: amazonProvider },
  { id: 'tamimi', label: 'Tamimi', color: '#0ea5e9', provider: tamimiProvider },
  { id: 'danube', label: 'Danube', color: '#ef4444', provider: danubeProvider },
  { id: 'lulu', label: 'Lulu', color: '#6366f1', provider: luluProvider },
  { id: 'noon', label: 'Noon', color: '#eab308', provider: noonProvider },
];
const STORE_BY_ID = Object.fromEntries(STORES.map((s) => [s.id, s]));
// Best-effort stores get a friendlier "temporarily unavailable" message.
const BEST_EFFORT = new Set(['amazon', 'noon']);

// --- smart ranking -------------------------------------------------------
// Client-side re-ranking of the store's results by relevance to the query.
// The result objects are untouched — only their order and how many we show.
const DEFAULT_LIMIT = 4;

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Tier a single field against the query: exact > prefix > whole-word > partial.
function tierScore(field, query) {
  const f = (field || '').toLowerCase().trim();
  if (!f || !query) return 0;
  if (f === query) return 100; // exact
  if (f.startsWith(query)) return 80; // prefix
  if (new RegExp(`(^|\\s)${escapeRegex(query)}(\\s|$)`).test(f)) return 70; // whole word
  if (f.includes(query)) return 60; // partial substring
  const tokens = query.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    const hits = tokens.filter((t) => f.includes(t)).length;
    if (hits === tokens.length) return 45; // all words present
    if (hits > 0) return 20 + hits; // some words present
  }
  return 0;
}

// Name match dominates; a brand match counts a little less.
function relevance(item, query) {
  return Math.max(tierScore(item.name, query), Math.round(tierScore(item.brand, query) * 0.7));
}

// Stable sort by relevance (ties keep the store's original order).
function rankItems(items, q) {
  const query = (q || '').toLowerCase().trim();
  return items
    .map((it, i) => ({ it, i, s: relevance(it, query) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.it);
}

const $ = (id) => document.getElementById(id);
const form = $('search-form');
const input = $('search-input');
const button = $('search-button');
const loading = $('loading');
const loadingText = $('loading-text');
const status = $('status');
const results = $('results');
const empty = $('empty');
const modeAllBtn = $('mode-all');
const modeSingleBtn = $('mode-single');
const singleControls = $('single-controls');
const multiControls = $('multi-controls');
const storeSelect = $('store-select');
const chkAll = $('chk-all');
const storeChks = [...document.querySelectorAll('.store-chk')];

let mode = 'all'; // 'all' | 'single'
let inFlight = null; // token so a newer search cancels an older one's rendering

// --- mode toggle ---------------------------------------------------------
function setMode(next) {
  mode = next;
  const isAll = next === 'all';
  modeAllBtn.classList.toggle('is-active', isAll);
  modeSingleBtn.classList.toggle('is-active', !isAll);
  modeAllBtn.setAttribute('aria-selected', String(isAll));
  modeSingleBtn.setAttribute('aria-selected', String(!isAll));
  multiControls.hidden = !isAll;
  singleControls.hidden = isAll;
}
modeAllBtn.addEventListener('click', () => setMode('all'));
modeSingleBtn.addEventListener('click', () => setMode('single'));

// --- checkbox chips ------------------------------------------------------
function syncChip(cb) {
  const chip = cb.closest('.chip');
  if (chip) chip.classList.toggle('is-checked', cb.checked);
}
chkAll.addEventListener('change', () => {
  storeChks.forEach((c) => {
    c.checked = chkAll.checked;
    syncChip(c);
  });
});
storeChks.forEach((c) =>
  c.addEventListener('change', () => {
    chkAll.checked = storeChks.every((x) => x.checked);
    syncChip(c);
    syncChip(chkAll);
  }),
);
[chkAll, ...storeChks].forEach(syncChip);

function selectedStores() {
  return STORES.filter((s) => storeChks.find((c) => c.value === s.id)?.checked);
}

// --- dispatch ------------------------------------------------------------
form.addEventListener('submit', (e) => {
  e.preventDefault();
  (mode === 'all' ? runMulti : runSingle)(input.value);
});

function setBusy(busy) {
  loading.hidden = !busy;
  button.disabled = busy;
  input.setAttribute('aria-busy', String(busy));
}

// --- single-store mode ---------------------------------------------------
async function runSingle(query) {
  const q = (query || '').trim();
  if (!q) return input.focus();
  const store = STORE_BY_ID[storeSelect.value] || STORES[0];

  const token = {};
  inFlight = token;
  empty.hidden = true;
  loadingText.textContent = `Searching ${store.label}…`;
  setBusy(true);
  status.textContent = '';
  results.innerHTML = '';

  try {
    const { results: found } = await adaptiveSearch(store.provider, q, memory);
    if (inFlight !== token) return;
    if (!found.length) {
      status.textContent = `No results for “${q}” in ${store.label}.`;
      return;
    }
    // Smart ranking: reorder by relevance; the block shows the top few and a
    // "Show all" toggle for the rest (already fetched — no new search).
    const ranked = rankItems(found, q);
    status.textContent = `${ranked.length} result${ranked.length > 1 ? 's' : ''} for “${q}” in ${store.label}`;
    results.appendChild(resultsBlock(ranked));

    // A flyer bar for this store (if it has a current brochure), then the
    // price-history banner above it — both best-effort and token-guarded.
    const meta = document.createElement('div');
    meta.className = 'store-meta';
    const slot = document.createElement('span');
    meta.appendChild(slot);
    results.prepend(meta);
    fillFlyer(slot, store.id, token).then(() => {
      if (inFlight === token && !slot.hasChildNodes()) meta.remove();
    });
    prependLowestBanner(q, token);
  } catch (err) {
    if (inFlight !== token) return;
    status.textContent = BEST_EFFORT.has(store.id)
      ? `${store.label} is temporarily unavailable. Please try again, or pick another store.`
      : `Could not reach ${store.label} right now. Please check your connection and try again.`;
    console.warn(`${store.label} search failed:`, (err && err.details) || err);
  } finally {
    if (inFlight === token) setBusy(false);
  }
}

// --- all-stores mode (parallel, grouped) ---------------------------------
async function runMulti(query) {
  const q = (query || '').trim();
  if (!q) return input.focus();
  const stores = selectedStores();
  if (!stores.length) {
    status.textContent = 'Select at least one store to search.';
    return;
  }

  const token = {};
  inFlight = token;
  empty.hidden = true;
  loadingText.textContent = `Searching ${stores.length} store${stores.length > 1 ? 's' : ''}…`;
  setBusy(true);
  status.textContent = '';
  results.innerHTML = '';

  // Lay out a section per store immediately; fill each as its search resolves.
  const sections = new Map();
  for (const s of stores) {
    const sec = storeSection(s);
    results.appendChild(sec.el);
    sections.set(s.id, sec);
    fillFlyer(sec.flyer, s.id, token); // brochure link, best-effort
  }
  prependLowestBanner(q, token); // price-history headline, best-effort

  let total = 0;
  let finished = 0;
  await Promise.all(
    stores.map(async (s) => {
      try {
        const { results: found } = await adaptiveSearch(s.provider, q, memory);
        if (inFlight !== token) return;
        // Smart ranking per store; the section shows the top few + "Show all".
        const ranked = rankItems(found, q);
        total += ranked.length;
        fillSection(sections.get(s.id), ranked);
      } catch (err) {
        if (inFlight !== token) return;
        failSection(sections.get(s.id), s);
        console.warn(`${s.label} search failed:`, (err && err.details) || err);
      } finally {
        finished += 1;
        if (inFlight === token && finished === stores.length) setBusy(false);
      }
    }),
  );

  if (inFlight !== token) return;
  setBusy(false);
  status.textContent = `${total} result${total === 1 ? '' : 's'} across ${stores.length} store${stores.length > 1 ? 's' : ''} for “${q}”`;
}

// --- rendering -----------------------------------------------------------
// Render a ranked result list: the top `limit` up front, plus a "Show all"
// toggle that reveals the rest. Everything is already fetched, so expanding
// never triggers a new search — it just renders more of the same list.
function resultsBlock(items, limit = DEFAULT_LIMIT) {
  const wrap = document.createElement('div');
  const g = document.createElement('div');
  g.className = 'results-grid';
  wrap.appendChild(g);

  const render = (n) => {
    g.innerHTML = '';
    for (const item of items.slice(0, n)) g.appendChild(card(item));
  };

  if (items.length <= limit) {
    render(items.length);
    return wrap;
  }

  let expanded = false;
  render(limit);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'show-all';
  const sync = () => {
    btn.textContent = expanded ? 'Show fewer' : `Show all ${items.length}`;
    btn.setAttribute('aria-expanded', String(expanded));
  };
  btn.addEventListener('click', () => {
    expanded = !expanded;
    render(expanded ? items.length : limit);
    sync();
  });
  sync();
  wrap.appendChild(btn);
  return wrap;
}

function storeSection(store) {
  const el = document.createElement('section');
  el.className = 'store-group';

  const head = document.createElement('div');
  head.className = 'store-head';
  const dot = document.createElement('span');
  dot.className = 'store-dot';
  dot.style.background = store.color;
  const name = document.createElement('span');
  name.className = 'store-name';
  name.textContent = store.label;
  const count = document.createElement('span');
  count.className = 'store-count';
  count.textContent = '…';
  // Flyer slot: filled asynchronously with a "weekly flyer" link if this store
  // has a current brochure. Pushed to the right so it never crowds the name.
  const flyer = document.createElement('span');
  flyer.className = 'store-flyer-slot';
  head.append(dot, name, count, flyer);

  const body = document.createElement('div');
  body.className = 'store-body';
  const note = document.createElement('div');
  note.className = 'store-note';
  note.innerHTML = '<span class="spinner spinner-sm" aria-hidden="true"></span> Searching…';
  body.appendChild(note);

  el.append(head, body);
  return { el, body, count, flyer };
}

function fillSection(sec, items) {
  // Badge shows the full count found; the body shows the top few + "Show all".
  sec.count.textContent = String(items.length);
  sec.body.innerHTML = '';
  if (!items.length) {
    const note = document.createElement('div');
    note.className = 'store-note';
    note.textContent = 'No results.';
    sec.body.appendChild(note);
    return;
  }
  sec.body.appendChild(resultsBlock(items));
}

function failSection(sec, store) {
  sec.count.textContent = '—';
  sec.body.innerHTML = '';
  const note = document.createElement('div');
  note.className = 'store-note';
  note.textContent = BEST_EFFORT.has(store.id)
    ? `${store.label} is temporarily unavailable.`
    : `Could not reach ${store.label}.`;
  sec.body.appendChild(note);
}

function money(value, currency) {
  if (value == null) return '';
  return `${value.toFixed(2)} ${currency}`;
}

// --- Brochure Engine + Price History integration -------------------------
// These decorate the existing results with two read-only capabilities from the
// Brochure Engine: the historical lowest price for a tracked product, and each
// store's current weekly flyer. All fetches are best-effort and token-guarded —
// if the engine is unreachable, or a newer search has started, they add nothing.

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// A "flyer" button for one search store, appended to `slot` if that store has a
// current brochure. If the brochure is a viewable page set it opens INSIDE the
// app (§14 viewer) — the user never leaves; if it is an external link (the
// store's official offers page, exposed when no current flyer is available) it
// opens that page in a new tab. The frontend stays source-agnostic — it only
// distinguishes inline-viewable from external-link, never which source produced
// the brochure. No-op for stores with no brochure (amazon/noon) or if a newer
// search has begun.
async function fillFlyer(slot, storeId, token) {
  if (!slot) return;
  const b = await brochureForStore(storeId);
  if (inFlight !== token || !b) return;
  const label = (STORE_BY_ID[storeId] || {}).label || storeLabel(b.store);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'store-flyer';
  btn.textContent = '📖 Weekly flyer';
  if (isExternalBrochure(b)) {
    btn.title = "View this store's official offers page";
    btn.addEventListener('click', () =>
      window.open(b.sourceUrl, '_blank', 'noopener,noreferrer'),
    );
  } else {
    btn.title = b.title ? `${b.title} — view this week's brochure` : "View this week's brochure";
    btn.addEventListener('click', () => openBrochureViewer(b, label));
  }
  slot.replaceChildren(btn);
}

// If the query maps to a tracked product, prepend a "lowest recorded price"
// banner (price + where + when) to the results. This is the Price History
// headline (/lowest) surfaced inline. No-op for untracked queries.
async function prependLowestBanner(query, token) {
  const productId = productForQuery(query);
  if (!productId) return;
  const lowest = await lowestForProduct(productId);
  if (inFlight !== token || !lowest || lowest.price == null) return;

  const el = document.createElement('div');
  el.className = 'price-history';

  const head = document.createElement('div');
  head.className = 'ph-head';
  const badge = document.createElement('span');
  badge.className = 'ph-badge';
  badge.textContent = 'Lowest recorded';
  const price = document.createElement('span');
  price.className = 'ph-price';
  price.textContent = money(lowest.price, lowest.currency || 'SAR');
  const meta = document.createElement('span');
  meta.className = 'ph-meta';
  const when = fmtDate(lowest.observedAt) || lowest.edition || '';
  meta.textContent = `at ${storeLabel(lowest.store)}${when ? ` · ${when}` : ''}`;
  head.append(badge, price, meta);
  el.appendChild(head);

  if (lowest.name) {
    const name = lowest.link ? document.createElement('a') : document.createElement('span');
    name.className = 'ph-name';
    name.textContent = lowest.name;
    if (lowest.link) {
      name.href = lowest.link;
      name.target = '_blank';
      name.rel = 'noopener';
    }
    el.appendChild(name);
  }

  if (inFlight !== token) return;
  results.prepend(el);
}

// A human date label for a brochure: its validity window if known, else edition.
function brochureDateLabel(b) {
  const from = fmtDate(b.validFrom);
  const to = fmtDate(b.validTo);
  if (from && to) return `${from} – ${to}`;
  return from || to || b.edition || '';
}

// --- in-app brochure viewer ----------------------------------------------
// A simple full-screen modal that pages through the brochure's images (served
// THROUGH the Brochure Engine's /asset). The user never leaves the app. v1:
// prev/next, page counter, zoom, store name, brochure date. No OCR, no product
// detection — just a page flipper.
let viewerOpen = false;

async function openBrochureViewer(b, storeName) {
  if (viewerOpen) return;
  viewerOpen = true;

  const overlay = document.createElement('div');
  overlay.className = 'bv-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', `${storeName} weekly brochure`);
  overlay.innerHTML = `
    <div class="bv-panel">
      <header class="bv-head">
        <div class="bv-title">
          <span class="bv-store"></span>
          <span class="bv-date"></span>
        </div>
        <button type="button" class="bv-close" aria-label="Close brochure">✕</button>
      </header>
      <div class="bv-stage"><div class="bv-msg">Loading brochure…</div></div>
      <footer class="bv-controls">
        <button type="button" class="bv-prev" aria-label="Previous page">‹ Prev</button>
        <span class="bv-counter" aria-live="polite">—</span>
        <button type="button" class="bv-next" aria-label="Next page">Next ›</button>
        <span class="bv-zoom">
          <button type="button" class="bv-zoom-out" aria-label="Zoom out">−</button>
          <button type="button" class="bv-zoom-in" aria-label="Zoom in">+</button>
        </span>
      </footer>
    </div>`;

  const $$ = (sel) => overlay.querySelector(sel);
  $$('.bv-store').textContent = storeName;
  $$('.bv-date').textContent = brochureDateLabel(b);
  const stage = $$('.bv-stage');
  const counter = $$('.bv-counter');
  const prevBtn = $$('.bv-prev');
  const nextBtn = $$('.bv-next');
  const zoomInBtn = $$('.bv-zoom-in');
  const zoomOutBtn = $$('.bv-zoom-out');

  const close = () => {
    viewerOpen = false;
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = '';
    overlay.remove();
  };
  $$('.bv-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close(); // click the backdrop to dismiss
  });

  document.body.style.overflow = 'hidden'; // lock background scroll
  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);

  // Fetch the page images (through the engine). Best-effort.
  const data = await loadBrochurePages(b);
  if (!viewerOpen) return; // closed while loading
  if (!data || !data.pages.length) {
    stage.innerHTML = '<div class="bv-msg">Sorry — this brochure could not be loaded.</div>';
    return;
  }
  const pages = data.pages;

  const img = document.createElement('img');
  img.className = 'bv-img';
  img.alt = `${storeName} brochure page`;
  stage.replaceChildren(img);

  let idx = 0;
  let zoom = 1;
  const MAX_ZOOM = 3;

  const applyZoom = () => {
    if (zoom <= 1) {
      img.style.maxWidth = '100%';
      img.style.maxHeight = '100%';
      img.style.width = '';
      img.style.height = '';
    } else {
      img.style.maxWidth = 'none';
      img.style.maxHeight = 'none';
      img.style.height = `${zoom * 100}%`;
      img.style.width = 'auto';
    }
    zoomOutBtn.disabled = zoom <= 1;
    zoomInBtn.disabled = zoom >= MAX_ZOOM;
  };

  const render = () => {
    img.src = pages[idx];
    zoom = 1;
    applyZoom();
    stage.scrollTop = 0;
    stage.scrollLeft = 0;
    counter.textContent = `${idx + 1} / ${pages.length}`;
    prevBtn.disabled = idx === 0;
    nextBtn.disabled = idx === pages.length - 1;
  };

  const go = (n) => {
    const next = Math.min(pages.length - 1, Math.max(0, n));
    if (next !== idx) {
      idx = next;
      render();
    }
  };

  prevBtn.addEventListener('click', () => go(idx - 1));
  nextBtn.addEventListener('click', () => go(idx + 1));
  zoomInBtn.addEventListener('click', () => {
    zoom = Math.min(MAX_ZOOM, zoom + 0.5);
    applyZoom();
  });
  zoomOutBtn.addEventListener('click', () => {
    zoom = Math.max(1, zoom - 0.5);
    applyZoom();
  });

  function onKey(e) {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') go(idx - 1);
    else if (e.key === 'ArrowRight') go(idx + 1);
    else if (e.key === '+' || e.key === '=') zoomInBtn.click();
    else if (e.key === '-' || e.key === '_') zoomOutBtn.click();
  }

  render();
}

function card(item) {
  const a = document.createElement('a');
  a.className = 'card';
  a.href = item.link;
  a.target = '_blank';
  a.rel = 'noopener';

  const imgWrap = document.createElement('div');
  imgWrap.className = 'card-img';
  if (item.image) {
    const img = new Image();
    img.loading = 'lazy';
    img.alt = item.name;
    img.src = item.image;
    img.addEventListener('error', () => imgWrap.classList.add('no-img'));
    imgWrap.appendChild(img);
  } else {
    imgWrap.classList.add('no-img');
  }

  const body = document.createElement('div');
  body.className = 'card-body';

  const name = document.createElement('div');
  name.className = 'card-name';
  name.textContent = item.name;
  body.appendChild(name);

  const meta = [item.brand, item.size].filter(Boolean).join(' · ');
  if (meta) {
    const m = document.createElement('div');
    m.className = 'card-meta';
    m.textContent = meta;
    body.appendChild(m);
  }

  const prices = document.createElement('div');
  prices.className = 'card-prices';
  if (item.price != null) {
    const price = document.createElement('span');
    price.className = 'price';
    price.textContent = money(item.price, item.currency);
    prices.appendChild(price);
    if (item.oldPrice != null) {
      const old = document.createElement('span');
      old.className = 'old-price';
      old.textContent = money(item.oldPrice, item.currency);
      prices.appendChild(old);
    }
    if (item.discountLabel) {
      const tag = document.createElement('span');
      tag.className = 'discount';
      tag.textContent = item.discountLabel;
      prices.appendChild(tag);
    }
  } else {
    const noPrice = document.createElement('span');
    noPrice.className = 'no-price';
    noPrice.textContent = 'Tap to see price';
    prices.appendChild(noPrice);
  }
  body.appendChild(prices);

  a.append(imgWrap, body);
  return a;
}

setMode('all');
input.focus();
loadBrochures(); // warm the weekly-flyer cache so links appear instantly
