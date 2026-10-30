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
import { storeIcon } from './storeIdentity.js';
import { initKnowledgeSearch } from './knowledgeUI.js';
import { rememberSearch } from './searchPreferences.js';
import { loadBrochures, searchOffers, storeLabel } from './brochure.js';
import { initBrochuresPage } from './brochures.js?v=20260924.2';
import { initBrowsePage } from './browsePage.js?v=20260924.2';
import { flyerListing } from './compare.js';
import { createMarketplace } from './marketplace.js?v=20260924.2';
import { initAlertsPage, refreshAlertsBadge } from './alertsPage.v2.js?v=20260825.7';
import { initCartPage } from './cartPage.js?v=20260924.2';
import { cartCount, CART_EVENT } from './cart.js';
import { t, tn, applyI18n, initLangSwitch } from './i18n.js';
import { initProfile } from './profile.js';
import { BROCHURES_SOURCE_ID, splitSearchSources } from './searchSources.js';
import {
  ONLINE_STORES,
  ONLINE_STORE_BY_ID,
  BEST_EFFORT_ONLINE_STORES,
  rankOnlineResults,
} from './onlineStores.js';

const memory = createMemory('app');

// Online-store order comes from the shared catalogue; the flyer index is the
// one non-retailer source Search adds to its scope chips.
const BROCHURES_SOURCE = {
  id: BROCHURES_SOURCE_ID,
  kind: 'brochures',
  label: t('search.source.brochures'),
  color: '#8b5cf6',
};
const SEARCH_SOURCES = [...ONLINE_STORES, BROCHURES_SOURCE];
const STORE_BY_ID = ONLINE_STORE_BY_ID;
const SOURCE_BY_ID = Object.fromEntries(SEARCH_SOURCES.map((s) => [s.id, s]));

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
const pageBrowse = $('page-browse');
const pageBrochures = $('page-brochures');
const pageAlerts = $('page-alerts');
const pageCart = $('page-cart');

let inFlight = null; // token so a newer search cancels an older one's rendering
let activeSearchDeepLink = null;

// --- router ----------------------------------------------------------------
// Two routes, hash-based (works on GitHub Pages, deep-linkable, back-button
// friendly): #/search and #/brochures. Both navs (top + bottom tab bar) are
// plain links; this just toggles pages and active states.
function route() {
  const hash = location.hash || '';
  const name = hash.startsWith('#/browse')
    ? 'browse'
    : hash.startsWith('#/brochures')
    ? 'brochures'
    : hash.startsWith('#/alerts')
    ? 'alerts'
    : hash.startsWith('#/cart')
    ? 'cart'
    : 'search';
  pageSearch.hidden = name !== 'search';
  pageBrowse.hidden = name !== 'browse';
  pageBrochures.hidden = name !== 'brochures';
  pageAlerts.hidden = name !== 'alerts';
  pageCart.hidden = name !== 'cart';
  document.title =
    name === 'browse'
      ? t('title.browse')
      : name === 'brochures'
      ? t('title.brochures')
      : name === 'alerts'
      ? t('title.alerts')
      : name === 'cart'
      ? t('title.cart')
      : t('title.search');
  for (const link of document.querySelectorAll('[data-nav]')) {
    const active = link.dataset.nav === name;
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  window.scrollTo(0, 0);
  if (name === 'browse') initBrowsePage(); // re-renders per sub-route hash
  if (name === 'brochures') initBrochuresPage(); // idempotent, lazy first render
  if (name === 'alerts') initAlertsPage(true); // fresh state on every visit
  if (name === 'cart') initCartPage(); // local data, re-rendered per visit
  if (name !== 'search') {
    activeSearchDeepLink = null;
  } else {
    const query = new URLSearchParams(hash.split('?')[1] || '').get('q')?.trim();
    if (query && activeSearchDeepLink !== hash) {
      activeSearchDeepLink = hash;
      selectAllSources();
      input.value = query;
      runSearch(query);
    }
  }
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

// --- search-source chips (the single scope control) -------------------------
// Selection is remembered across visits — this is a daily-use tool.
const chipButtons = [];
function renderChips() {
  const saved = (memory.get('stores') || '').split(',').filter((id) => SOURCE_BY_ID[id]);
  // A newly-added store (one the user has never seen) defaults ON, so new
  // providers are discoverable without wiping the user's saved scope. Stores the
  // user has explicitly toggled off stay off. `known` records the stores the
  // user has seen; if that key predates this feature, we assume they already
  // knew about whatever they had saved.
  const knownRaw = memory.get('known-stores');
  const known = knownRaw != null ? new Set(knownRaw.split(',').filter(Boolean)) : new Set(saved);
  const newSources = SEARCH_SOURCES.map((s) => s.id).filter((id) => !known.has(id));
  const selected = saved.length
    ? new Set([...saved, ...newSources])
    : new Set(SEARCH_SOURCES.map((s) => s.id));
  memory.set('known-stores', SEARCH_SOURCES.map((s) => s.id).join(','));
  for (const s of SEARCH_SOURCES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.store = s.id;
    b.setAttribute('aria-pressed', String(selected.has(s.id)));
    const dot = storeIcon(s.id);
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

function selectedSources() {
  return chipButtons
    .filter((c) => c.getAttribute('aria-pressed') === 'true')
    .map((c) => SOURCE_BY_ID[c.dataset.store]);
}

function selectOnlyStore(storeId) {
  for (const c of chipButtons) c.setAttribute('aria-pressed', String(c.dataset.store === storeId));
  syncChips();
}

function selectAllSources() {
  for (const c of chipButtons) c.setAttribute('aria-pressed', 'true');
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
  const selected = selectedSources();
  if (!selected.length) {
    status.textContent = t('search.needOneSource');
    return;
  }
  const { stores, brochures } = splitSearchSources(selected);

  const token = {};
  inFlight = token;
  home.hidden = true;
  setBusy(true);
  status.textContent = tn('search.searching', selected.length);
  results.innerHTML = '';
  rememberSearch(q);
  saveRecent(q);

  // ONE unified marketplace: every result is an offer — live online results
  // and this week's flyer offers in a single ranked grid, the source shown as
  // a lightweight badge. Per-store counts live in the one-line sources strip
  // above the grid (logo + number). The shopping summary that used to sit
  // above it is hidden; store flyers stay on the Brochures tab. The ranking
  // perspective (lowest price vs best value) is a remembered daily-use preference.
  // 'discount' was replaced by 'featured' (Search Intelligence milestone) —
  // a remembered Most-discounted preference migrates to the tab that took its
  // place, never silently back to the default.
  const savedRank = memory.get('rank') === 'discount' ? 'featured' : memory.get('rank');
  const market = createMarketplace(results, stores, q, {
    sort: ['value', 'featured'].includes(savedRank) ? savedRank : 'price',
    onSort: (mode) => memory.set('rank', mode),
    includeFlyers: brochures,
  });

  // Physical-store flyer offers (the Brochure Engine's structured offers) join
  // the same grid as soon as the engine answers — including stores that have
  // no live search at all. flyerListing (compare.js) decides what qualifies.
  const brochureSearch = brochures
    ? searchOffers(q, OFFERS_FETCH_LIMIT)
    .then((data) => {
      if (inFlight !== token) return 0;
      if (!data) {
        market.flyersUnavailable();
        return 0;
      }
      const listings = (data.offers || [])
        .map((o) => flyerListing(o, q, storeLabel))
        .filter(Boolean);
      return market.addFlyers(listings);
    })
    .catch(() => {
      if (inFlight === token) market.flyersUnavailable();
      return 0;
    })
    : Promise.resolve(0);

  let total = 0;
  await Promise.all(
    stores.map(async (s) => {
      try {
        const { results: found } = await adaptiveSearch(s.provider, q, memory);
        if (inFlight !== token) return;
        // Smart ranking + irrelevance filtering per store; only genuinely
        // matching results enter the marketplace.
        const { primary, related, hidden } = rankOnlineResults(found, q);
        total += primary.length;
        market.addOnline(s, primary, hidden, related);
      } catch (err) {
        if (inFlight !== token) return;
        market.failStore(s, BEST_EFFORT_ONLINE_STORES.has(s.id));
        console.warn(`${s.label} search failed:`, (err && err.details) || err);
      }
    }),
  );
  const brochureTotal = await brochureSearch;
  if (inFlight !== token) return;
  total += brochureTotal;
  setBusy(false);
  market.finish();
  status.textContent = tn('search.results', total, {
    total,
    sources: tn('search.sourcesInline', selected.length),
    q,
  });
}

// --- boot ---------------------------------------------------------------------
initProfile(); // the local profile: created silently on first open, then reloaded
applyI18n(); // language metadata (lang; dir stays ltr in Phase 1) + static shell
initLangSwitch(); // the language chip beside the logo
initKnowledgeSearch(input, form);
renderChips();
renderHomeChips();
route();
if (!pageSearch.hidden) input.focus();
loadBrochures(); // warm the weekly-flyer cache (flyer cards open their brochure from it)
refreshAlertsBadge(); // unseen price alerts -> badge on the Alerts tab
