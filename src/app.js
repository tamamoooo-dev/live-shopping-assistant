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
    // Smart ranking: reorder by relevance to the query, then show the top few.
    const items = rankItems(found, q).slice(0, DEFAULT_LIMIT);
    status.textContent =
      found.length > items.length
        ? `Top ${items.length} of ${found.length} for “${q}” in ${store.label}`
        : `${items.length} result${items.length > 1 ? 's' : ''} for “${q}” in ${store.label}`;
    results.appendChild(grid(items));
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
  }

  let total = 0;
  let finished = 0;
  await Promise.all(
    stores.map(async (s) => {
      try {
        const { results: found } = await adaptiveSearch(s.provider, q, memory);
        if (inFlight !== token) return;
        // Smart ranking: top few most-relevant per store, grouped.
        const items = rankItems(found, q).slice(0, DEFAULT_LIMIT);
        total += items.length;
        fillSection(sections.get(s.id), items, found.length);
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
function grid(items) {
  const g = document.createElement('div');
  g.className = 'results-grid';
  for (const item of items) g.appendChild(card(item));
  return g;
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
  head.append(dot, name, count);

  const body = document.createElement('div');
  body.className = 'store-body';
  const note = document.createElement('div');
  note.className = 'store-note';
  note.innerHTML = '<span class="spinner spinner-sm" aria-hidden="true"></span> Searching…';
  body.appendChild(note);

  el.append(head, body);
  return { el, body, count };
}

function fillSection(sec, items, foundCount = items.length) {
  // Badge shows how many we display; a trailing "+" means more were found.
  sec.count.textContent = foundCount > items.length ? `${items.length}+` : String(items.length);
  sec.body.innerHTML = '';
  if (!items.length) {
    const note = document.createElement('div');
    note.className = 'store-note';
    note.textContent = 'No results.';
    sec.body.appendChild(note);
    return;
  }
  sec.body.appendChild(grid(items));
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
