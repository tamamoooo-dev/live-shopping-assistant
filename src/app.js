// app.js — the app shell (hash router + navigation) and the Live Search page.
//
// Souq has two primary experiences, each a full page under one shell:
//   #/search     — Live Search (this file): parallel live search across stores,
//                  price intelligence for tracked products, weekly-flyer chips.
//   #/brochures  — Brochures (src/brochures.js): every store's active flyers.
//
// The search itself is built on the SAME Core (adaptiveSearch), the SAME
// providers, and the SAME normalized result contract as before — nothing below
// this file changed. One search model: the store chips are the scope; selecting
// one store or six is the same flow (the old All/Single mode toggle is gone).

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
  isExternalBrochure,
  isActiveBrochure,
  productForQuery,
  trackedProducts,
  pricesForProduct,
  storeLabel,
} from './brochure.js';
import { openBrochureViewer } from './viewer.js';
import { initBrochuresPage } from './brochures.js';

const memory = createMemory('app');

// Ordered store list — drives the chips and grouped results.
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
const status = $('status');
const results = $('results');
const home = $('home');
const chipsWrap = $('store-chips');
const chipAll = $('chip-all');
const pageSearch = $('page-search');
const pageBrochures = $('page-brochures');

let inFlight = null; // token so a newer search cancels an older one's rendering

// --- router ----------------------------------------------------------------
// Two routes, hash-based (works on GitHub Pages, deep-linkable, back-button
// friendly): #/search and #/brochures. Both navs (top + bottom tab bar) are
// plain links; this just toggles pages and active states.
function route() {
  const name = (location.hash || '').startsWith('#/brochures') ? 'brochures' : 'search';
  pageSearch.hidden = name !== 'search';
  pageBrochures.hidden = name !== 'brochures';
  document.title = name === 'brochures' ? 'Souq — Weekly brochures' : 'Souq — Live shopping search';
  for (const link of document.querySelectorAll('[data-nav]')) {
    const active = link.dataset.nav === name;
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  window.scrollTo(0, 0);
  if (name === 'brochures') initBrochuresPage(); // idempotent, lazy first render
}
window.addEventListener('hashchange', route);

// --- store chips (the single scope control) --------------------------------
// Selection is remembered across visits — this is a daily-use tool.
const chipButtons = [];
function renderChips() {
  const saved = (memory.get('stores') || '').split(',').filter((id) => STORE_BY_ID[id]);
  const selected = new Set(saved.length ? saved : STORES.map((s) => s.id));
  for (const s of STORES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.store = s.id;
    b.setAttribute('aria-pressed', String(selected.has(s.id)));
    const dot = document.createElement('span');
    dot.className = 'chip-dot';
    dot.style.background = s.color;
    const label = document.createElement('span');
    label.textContent = s.label;
    b.append(dot, label);
    b.addEventListener('click', () => {
      b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
      syncChips();
    });
    chipsWrap.appendChild(b);
    chipButtons.push(b);
  }
  chipAll.addEventListener('click', () => {
    const allOn = chipButtons.every((c) => c.getAttribute('aria-pressed') === 'true');
    for (const c of chipButtons) c.setAttribute('aria-pressed', String(!allOn));
    syncChips();
  });
  syncChips();
}

function syncChips() {
  const on = chipButtons.filter((c) => c.getAttribute('aria-pressed') === 'true');
  chipAll.setAttribute('aria-pressed', String(on.length === chipButtons.length));
  memory.set('stores', on.map((c) => c.dataset.store).join(','));
}

function selectedStores() {
  return chipButtons
    .filter((c) => c.getAttribute('aria-pressed') === 'true')
    .map((c) => STORE_BY_ID[c.dataset.store]);
}

function selectOnlyStore(storeId) {
  for (const c of chipButtons) c.setAttribute('aria-pressed', String(c.dataset.store === storeId));
  syncChips();
}

// The Brochures page can ask "search this store": switch scope + focus input.
window.addEventListener('souq:search-store', (e) => {
  const id = e.detail && e.detail.store;
  if (id && STORE_BY_ID[id]) selectOnlyStore(id);
  location.hash = '#/search';
  route(); // apply immediately (hashchange also fires; route is idempotent)
  input.focus();
});

// --- recent searches ---------------------------------------------------------
const RECENT_MAX = 8;
function recentSearches() {
  try {
    const list = JSON.parse(memory.get('recent') || '[]');
    return Array.isArray(list) ? list.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}
function saveRecent(q) {
  const list = [q, ...recentSearches().filter((s) => s.toLowerCase() !== q.toLowerCase())];
  memory.set('recent', JSON.stringify(list.slice(0, RECENT_MAX)));
}
function renderHomeChips() {
  // Recent searches (if any)
  const recent = recentSearches();
  const recentBlock = $('home-recent');
  const recentWrap = $('recent-chips');
  recentWrap.innerHTML = '';
  recentBlock.hidden = !recent.length;
  for (const q of recent) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'quick-chip';
    b.dir = 'auto';
    b.textContent = q;
    b.addEventListener('click', () => {
      input.value = q;
      runSearch(q);
    });
    recentWrap.appendChild(b);
  }
  // Tracked products (price history is available for these — the cue that was
  // missing in the first integration pass, HANDOFF §14.D.a)
  const trackedWrap = $('tracked-chips');
  trackedWrap.innerHTML = '';
  for (const p of trackedProducts()) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'quick-chip';
    const label = document.createElement('span');
    label.textContent = p.label;
    const tag = document.createElement('span');
    tag.className = 'qc-tag';
    tag.textContent = 'history';
    b.append(label, tag);
    b.addEventListener('click', () => {
      input.value = p.label.toLowerCase();
      runSearch(p.label.toLowerCase());
    });
    trackedWrap.appendChild(b);
  }
}

// --- dispatch ----------------------------------------------------------------
form.addEventListener('submit', (e) => {
  e.preventDefault();
  runSearch(input.value);
});

function setBusy(busy) {
  button.disabled = busy;
  input.setAttribute('aria-busy', String(busy));
}

// --- the search (one flow for 1..N stores) ------------------------------------
async function runSearch(query) {
  const q = (query || '').trim();
  if (!q) return input.focus();
  const stores = selectedStores();
  if (!stores.length) {
    status.textContent = 'Select at least one store to search.';
    return;
  }

  const token = {};
  inFlight = token;
  home.hidden = true;
  setBusy(true);
  status.textContent = `Searching ${stores.length} store${stores.length > 1 ? 's' : ''}…`;
  results.innerHTML = '';
  saveRecent(q);

  // Lay out a section per store immediately (with skeleton cards); fill each
  // as its search resolves. The same layout serves 1 store or 6.
  const sections = new Map();
  for (const s of stores) {
    const sec = storeSection(s);
    results.appendChild(sec.el);
    sections.set(s.id, sec);
    fillFlyer(sec.flyer, s.id, token); // weekly-flyer chip, best-effort
  }
  prependPricePanel(q, token); // price intelligence, best-effort

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
        if (inFlight === token && finished === stores.length) {
          setBusy(false);
          status.textContent = `${total} result${total === 1 ? '' : 's'} across ${stores.length} store${stores.length > 1 ? 's' : ''} for “${q}”`;
        }
      }
    }),
  );
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

function skeletonGrid(n = 4) {
  const g = document.createElement('div');
  g.className = 'results-grid';
  for (let i = 0; i < n; i++) {
    const c = document.createElement('div');
    c.className = 'skeleton-card';
    c.innerHTML = '<div class="sk-img sk"></div><div class="sk-line sk"></div><div class="sk-line sk"></div>';
    g.appendChild(c);
  }
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
  // Flyer slot: filled asynchronously with a "weekly flyer" chip if this store
  // has a brochure. Pushed to the right so it never crowds the name.
  const flyer = document.createElement('span');
  flyer.className = 'store-flyer-slot';
  head.append(dot, name, count, flyer);

  const body = document.createElement('div');
  body.className = 'store-body';
  body.appendChild(skeletonGrid());

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

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateShort(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// --- Brochure Engine + Price History integration -------------------------
// These decorate the search results with two read-only capabilities from the
// Brochure Engine: price intelligence for tracked products, and each store's
// weekly flyer. All fetches are best-effort and token-guarded — if the engine
// is unreachable, or a newer search has started, they add nothing.

// A "flyer" chip for one search store, appended to `slot` if that store has a
// brochure. The chip carries the flyer's validity date, and is visibly marked
// stale when the newest flyer the engine holds has already expired (the
// "invisible staleness" gap, HANDOFF §14.D.c). A viewable page set opens
// INSIDE the app (shared viewer); an external link brochure (the store's
// official offers page) opens in a new tab.
async function fillFlyer(slot, storeId, token) {
  if (!slot) return;
  const b = await brochureForStore(storeId);
  if (inFlight !== token || !b) return;
  const label = (STORE_BY_ID[storeId] || {}).label || storeLabel(b.store);
  const active = isActiveBrochure(b);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'store-flyer';
  const text = document.createElement('span');
  text.textContent = '📖 Flyer';
  btn.appendChild(text);
  const date = document.createElement('span');
  date.className = 'flyer-date';
  if (active) {
    date.textContent = b.validTo ? `· until ${fmtDateShort(b.validTo)}` : '· this week';
  } else {
    btn.classList.add('is-stale');
    date.textContent = b.validTo ? `· expired ${fmtDateShort(b.validTo)}` : '· may be outdated';
  }
  btn.appendChild(date);
  if (isExternalBrochure(b)) {
    btn.title = "View this store's official offers page";
    btn.addEventListener('click', () =>
      window.open(b.sourceUrl, '_blank', 'noopener,noreferrer'),
    );
  } else {
    btn.title = b.title ? `${b.title} — view this flyer` : 'View this flyer';
    btn.addEventListener('click', () => openBrochureViewer(b, label));
  }
  slot.replaceChildren(btn);
}

// If the query maps to a tracked product, prepend the price-intelligence panel:
// the lowest recorded price (price + where + when) PLUS the latest captured
// price per store with its distance from that low — so "is today a good deal?"
// is answerable at a glance (HANDOFF §14.D.d). Also carries the (disabled)
// price-alert affordance where Personal Alerts will live once built.
async function prependPricePanel(query, token) {
  const productId = productForQuery(query);
  if (!productId) return;
  const data = await pricesForProduct(productId);
  if (inFlight !== token || !data || !data.lowest || data.lowest.price == null) return;
  const { lowest, latest } = data;

  const el = document.createElement('div');
  el.className = 'price-panel';

  const head = document.createElement('div');
  head.className = 'pp-head';
  const badge = document.createElement('span');
  badge.className = 'pp-badge';
  badge.textContent = 'Lowest recorded';
  head.appendChild(badge);
  // Alerts-ready: this is where a target-price control will slot in.
  const alert = document.createElement('button');
  alert.type = 'button';
  alert.className = 'pp-alert';
  alert.disabled = true;
  alert.title = 'Personal price alerts are coming soon';
  alert.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg> Alerts soon';
  head.appendChild(alert);
  el.appendChild(head);

  const hero = document.createElement('div');
  hero.className = 'pp-hero';
  const price = document.createElement('span');
  price.className = 'pp-price';
  price.textContent = money(lowest.price, lowest.currency || 'SAR');
  const where = document.createElement('span');
  where.className = 'pp-where';
  const when = fmtDate(lowest.observedAt) || lowest.edition || '';
  where.textContent = `at ${storeLabel(lowest.store)}${when ? ` · ${when}` : ''}`;
  hero.append(price, where);
  el.appendChild(hero);

  if (lowest.name) {
    const name = lowest.link ? document.createElement('a') : document.createElement('span');
    name.className = 'pp-name';
    name.dir = 'auto';
    name.textContent = lowest.name;
    if (lowest.link) {
      name.href = lowest.link;
      name.target = '_blank';
      name.rel = 'noopener';
    }
    el.appendChild(name);
  }

  // Latest captured price per store, cheapest first, each with its distance
  // from the recorded low.
  const rows = latest
    .filter((p) => p && p.price != null)
    .sort((a, b) => a.price - b.price);
  if (rows.length) {
    const box = document.createElement('div');
    box.className = 'pp-latest';
    const title = document.createElement('p');
    title.className = 'pp-latest-title';
    title.textContent = 'Latest weekly capture, by store';
    box.appendChild(title);
    for (const p of rows) {
      const row = document.createElement('div');
      row.className = 'pp-row';
      const st = document.createElement('span');
      st.className = 'pp-store';
      st.textContent = storeLabel(p.store);
      const pr = document.createElement('span');
      pr.className = 'pp-row-price';
      pr.textContent = money(p.price, p.currency || 'SAR');
      const delta = document.createElement('span');
      delta.className = 'pp-delta';
      if (p.price <= lowest.price) {
        delta.classList.add('is-best');
        delta.textContent = 'lowest ever';
      } else {
        delta.classList.add('is-above');
        delta.textContent = `+${(p.price - lowest.price).toFixed(2)}`;
      }
      const nm = document.createElement('span');
      nm.className = 'pp-row-name';
      nm.dir = 'auto';
      nm.textContent = p.name || '';
      const wh = document.createElement('span');
      wh.className = 'pp-when';
      wh.textContent = fmtDate(p.observedAt) || p.edition || '';
      row.append(st, pr, delta, nm, wh);
      box.appendChild(row);
    }
    el.appendChild(box);
  }

  if (inFlight !== token) return;
  results.prepend(el);
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
  name.dir = 'auto';
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

// --- boot ---------------------------------------------------------------------
renderChips();
renderHomeChips();
route();
if (!pageSearch.hidden) input.focus();
loadBrochures(); // warm the weekly-flyer cache so chips appear instantly
