// app.js — the app shell (hash router + navigation) and the Live Search page.
//
// Super Search has two primary experiences, each a full page under one shell:
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
import { ninjaProvider } from './providers/ninja.js';
import {
  loadBrochures,
  brochureForStore,
  isExternalBrochure,
  isActiveBrochure,
  pricesForQuery,
  searchOffers,
  storeLabel,
} from './brochure.js';
import { openBrochureViewer } from './viewer.js';
import { initBrochuresPage } from './brochures.js';
import { rankItems as smartRank, relevance as matchRelevance, isRelevant, sizeLabel } from './match.js';
import { computeComparison, flyerListing } from './compare.js';
import { summaryElement } from './summary.js';
import { createMarketplace } from './marketplace.js';
import { initAlertsPage, refreshAlertsBadge, openWatchDialog } from './alertsPage.js';
import { initCartPage } from './cartPage.js';
import { cartCount, CART_EVENT } from './cart.js';

const memory = createMemory('app');

// Ordered store list — drives the chips and grouped results.
const STORES = [
  { id: 'panda', label: 'Panda', color: '#16a34a', provider: pandaProvider },
  { id: 'amazon', label: 'Amazon', color: '#f59e0b', provider: amazonProvider },
  { id: 'tamimi', label: 'Tamimi', color: '#0ea5e9', provider: tamimiProvider },
  { id: 'danube', label: 'Danube', color: '#ef4444', provider: danubeProvider },
  { id: 'lulu', label: 'Lulu', color: '#6366f1', provider: luluProvider },
  { id: 'noon', label: 'Noon', color: '#eab308', provider: noonProvider },
  { id: 'ninja', label: 'Ninja', color: '#ec4899', provider: ninjaProvider },
];
const STORE_BY_ID = Object.fromEntries(STORES.map((s) => [s.id, s]));
// Best-effort stores get a friendlier "temporarily unavailable" message.
const BEST_EFFORT = new Set(['amazon', 'noon']);

// How many flyer offers to pull from the engine per query. The engine holds
// 200+ genuinely-relevant offers for staple queries across 18 stores; 40 was
// starving the marketplace and the comparison of most of the flyer coverage.
// One request either way — the grid banding and "Show all" absorb the volume.
const OFFERS_FETCH_LIMIT = 120;

// --- smart ranking -------------------------------------------------------
// Ranking, relevance, size parsing and equivalence live in match.js (the
// search-intelligence module) so the same logic drives both the marketplace
// grid and the shopping summary. Each store's results are ranked and the ones
// that don't match the query at all are DROPPED — honestly counted, never
// shown. (The old "fall back to everything when nothing matches" behaviour is
// gone on purpose: when Amazon fuzz-matches a query to 48 unrelated products,
// dumping them made Amazon look broken and fed garbage into the comparison.)
function rankAndFilter(items, query) {
  const ranked = smartRank(items, query); // attaches _size and _rel
  const relevant = ranked.filter((it) => isRelevant(it, query) && matchRelevance(it, query) > 0);
  return { relevant, hidden: ranked.length - relevant.length };
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
const pageAlerts = $('page-alerts');
const pageCart = $('page-cart');

let inFlight = null; // token so a newer search cancels an older one's rendering

// --- router ----------------------------------------------------------------
// Two routes, hash-based (works on GitHub Pages, deep-linkable, back-button
// friendly): #/search and #/brochures. Both navs (top + bottom tab bar) are
// plain links; this just toggles pages and active states.
function route() {
  const hash = location.hash || '';
  const name = hash.startsWith('#/brochures')
    ? 'brochures'
    : hash.startsWith('#/alerts')
    ? 'alerts'
    : hash.startsWith('#/cart')
    ? 'cart'
    : 'search';
  pageSearch.hidden = name !== 'search';
  pageBrochures.hidden = name !== 'brochures';
  pageAlerts.hidden = name !== 'alerts';
  pageCart.hidden = name !== 'cart';
  document.title =
    name === 'brochures'
      ? 'Super Search — Weekly brochures'
      : name === 'alerts'
      ? 'Super Search — Price alerts'
      : name === 'cart'
      ? 'Super Search — Cart'
      : 'Super Search — Live shopping search';
  for (const link of document.querySelectorAll('[data-nav]')) {
    const active = link.dataset.nav === name;
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  window.scrollTo(0, 0);
  if (name === 'brochures') initBrochuresPage(); // idempotent, lazy first render
  if (name === 'alerts') initAlertsPage(true); // fresh state on every visit
  if (name === 'cart') initCartPage(); // local data, re-rendered per visit
}
window.addEventListener('hashchange', route);

// --- cart badge (topbar + tabbar) -------------------------------------------
// Kept live by the cart module's CustomEvent; painted once at boot so a
// returning user sees their saved cart count immediately.
function paintCartBadge(count) {
  for (const badge of document.querySelectorAll('[data-cart-badge]')) {
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.hidden = count === 0;
  }
}
window.addEventListener(CART_EVENT, (e) => paintCartBadge(e.detail.count));
paintCartBadge(cartCount());

// --- store chips (the single scope control) --------------------------------
// Selection is remembered across visits — this is a daily-use tool.
const chipButtons = [];
function renderChips() {
  const saved = (memory.get('stores') || '').split(',').filter((id) => STORE_BY_ID[id]);
  // A newly-added store (one the user has never seen) defaults ON, so new
  // providers are discoverable without wiping the user's saved scope. Stores the
  // user has explicitly toggled off stay off. `known` records the stores the
  // user has seen; if that key predates this feature, we assume they already
  // knew about whatever they had saved.
  const knownRaw = memory.get('known-stores');
  const known = knownRaw != null ? new Set(knownRaw.split(',').filter(Boolean)) : new Set(saved);
  const newStores = STORES.map((s) => s.id).filter((id) => !known.has(id));
  const selected = saved.length
    ? new Set([...saved, ...newStores])
    : new Set(STORES.map((s) => s.id));
  memory.set('known-stores', STORES.map((s) => s.id).join(','));
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
window.addEventListener('supersearch:search-store', (e) => {
  const id = e.detail && e.detail.store;
  if (id && STORE_BY_ID[id]) selectOnlyStore(id);
  location.hash = '#/search';
  route(); // apply immediately (hashchange also fires; route is idempotent)
  input.focus();
});

// The viewer's product sheet can ask for a full comparison: land on the
// search page with the product's query already running.
window.addEventListener('supersearch:search-query', (e) => {
  const q = e.detail && e.detail.query;
  if (!q) return;
  location.hash = '#/search';
  route();
  input.value = q;
  runSearch(q);
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

  // The shopping summary sits ABOVE the results and is filled once every store
  // has answered (it needs all offers to compare). Show a placeholder now so its
  // slot is reserved at the top.
  const summarySlot = document.createElement('div');
  summarySlot.className = 'summary-slot';
  summarySlot.appendChild(summarySkeleton());
  results.appendChild(summarySlot);

  // ONE unified marketplace below the summary: every result is an offer —
  // live online results and this week's flyer offers in a single ranked grid,
  // the source shown as a lightweight badge. Per-store status (and the weekly
  // flyer chips) live in the compact sources strip above the grid. The ranking
  // perspective (lowest price vs best value) is a remembered daily-use preference.
  const market = createMarketplace(results, stores, q, {
    sort: memory.get('rank') === 'value' ? 'value' : 'price',
    onSort: (mode) => memory.set('rank', mode),
  });
  for (const s of stores) fillFlyer(market.flyerSlot(s.id), s.id, token); // best-effort

  // Physical-store flyer offers (the Brochure Engine's structured offers) join
  // the same grid as soon as the engine answers — including stores that have
  // no live search at all. The SAME relevance pipeline the comparison uses
  // (flyerListing) decides what qualifies, so grid and summary always agree.
  searchOffers(q, OFFERS_FETCH_LIMIT)
    .then((data) => {
      if (inFlight !== token) return;
      if (!data) {
        market.flyersUnavailable();
        return;
      }
      const listings = (data.offers || [])
        .map((o) => flyerListing(o, q, storeLabel))
        .filter(Boolean);
      market.addFlyers(listings);
    })
    .catch(() => {
      if (inFlight === token) market.flyersUnavailable();
    });

  const tagged = []; // { store, it } across all stores — feeds the comparison
  let total = 0;
  let finished = 0;
  await Promise.all(
    stores.map(async (s) => {
      try {
        const { results: found } = await adaptiveSearch(s.provider, q, memory);
        if (inFlight !== token) return;
        // Smart ranking + irrelevance filtering per store; only genuinely
        // matching results enter the marketplace and the comparison.
        const { relevant, hidden } = rankAndFilter(found, q);
        total += relevant.length;
        for (const it of relevant) tagged.push({ store: s, it });
        market.addOnline(s, relevant, hidden);
      } catch (err) {
        if (inFlight !== token) return;
        market.failStore(s, BEST_EFFORT.has(s.id));
        console.warn(`${s.label} search failed:`, (err && err.details) || err);
      } finally {
        finished += 1;
        if (inFlight === token && finished === stores.length) {
          setBusy(false);
          market.finish();
          status.textContent = `${total} result${total === 1 ? '' : 's'} across ${stores.length} store${stores.length > 1 ? 's' : ''} for “${q}”`;
          fillSummary(summarySlot, q, tagged, token);
        }
      }
    }),
  );
}

// Build and render the shopping summary once all stores have answered. The
// comparison engine (compare.js) weighs BOTH worlds — the live online results
// AND this week's flyer offers — so the recommendation is source-agnostic.
// Best-effort: flyer offers and Price History are each optional inputs; if
// there's nothing to compare at all the slot is removed.
async function fillSummary(slot, query, tagged, token) {
  // Price History is catalog-wide and query-driven: ask the engine for ANY
  // query (session-cached, best-effort — null when nothing is recorded yet).
  const [prices, offersData] = await Promise.all([
    pricesForQuery(query).catch(() => null),
    // The same session-cached call the flyer panel makes — no extra request.
    searchOffers(query, OFFERS_FETCH_LIMIT).catch(() => null),
  ]);
  if (inFlight !== token) return;
  const comparison = computeComparison(query, tagged, (offersData && offersData.offers) || [], prices, storeLabel);
  if (!comparison) {
    slot.remove();
    return;
  }
  slot.replaceChildren(
    summaryElement(comparison, storeLabel, {
      onWatch: (model) => {
        const h = model.headline.listing;
        openWatchDialog({
          kind: 'grocery',
          query,
          label: `${query}${sizeLabel(h.size) ? ` · ${sizeLabel(h.size)}` : ''}`,
          sizeText: h.name, // the reference size for the engine's size gate
          suggestedPrice: h.price,
          currentPrice: h.price,
          link: h.link,
        });
      },
    }),
  );
}

// --- rendering -----------------------------------------------------------
// Result cards, the unified grid, and the sources strip live in
// marketplace.js; this file keeps only the summary skeleton and the
// weekly-flyer chip that decorates the strip.

function summarySkeleton() {
  const c = document.createElement('div');
  c.className = 'summary skeleton-summary';
  c.innerHTML =
    '<div class="sk-line sk" style="width:40%"></div>' +
    '<div class="sk-line sk" style="width:65%;height:22px"></div>' +
    '<div class="sk-line sk" style="width:55%"></div>';
  return c;
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

// --- boot ---------------------------------------------------------------------
renderChips();
renderHomeChips();
route();
if (!pageSearch.hidden) input.focus();
loadBrochures(); // warm the weekly-flyer cache so chips appear instantly
refreshAlertsBadge(); // unseen price alerts -> badge on the Alerts tab
