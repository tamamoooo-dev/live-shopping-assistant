import { BRAND_ASSETS } from './identityAssets.js';
// browsePage.js — the Browse pillar's UI (BROWSE-DESIGN.md §8): "walk this
// week's market". Three views under one hash namespace, all thin compositions
// over the engine's canonical Browse API (brochure.js — rule 7) and the
// marketplace's exported card primitives (ONE card idiom, ONE tap-through):
//
//   #/browse                → the market floor: department tiles, brand row,
//                             Biggest Drops + Lowest Ever rails (V1.1 keeps
//                             only the rails that earn their place)
//   #/browse/dept/<id>      → a department (aisle chips + listing)
//   #/browse/aisle/<id>     → one aisle's listing
//   #/browse/brands         → every brand with live offers (A–Z of the market)
//   #/browse/brand/<slug>   → a BRAND PAGE: identity hero, product families
//                             (canonical aisles inside the brand), listing
//   #/browse/rail/<id>      → a rail's full "see all" listing
//
// Every engine read is best-effort: an unreachable engine renders a calm
// empty state and never breaks the rest of the app. Flyer prices are
// machine-extracted — every card opens the flyer itself (openFlyerOffer).

import { loadBrowseSummary, browseOffers, cleanOfferName, ENGINE_STORES } from './brochure.js';
import { createMemory, adaptiveSearch } from './core.js';
import {
  el, cardTop, cardImage, flyerCardBody, cartButton, flyerCartEntry, openFlyerOffer, createMarketplace,
} from './marketplace.js?v=20260924.2';
import {
  ONLINE_STORES, BEST_EFFORT_ONLINE_STORES, rankOnlineResults,
} from './onlineStores.js';
import { openWatchDialog } from './alertsPage.v2.js';
import { historyQuery } from './viewer/insights.js';
import { t, getLang } from './i18n.js';

const RAILS = ['drops', 'lowest-ever'];
const SORTS = ['discount', 'price'];
const PAGE_SIZE = 24;
const BRAND_BATCH = 60; // brands added per "More brands" tap on the home page
// The brands page lists the same brands three ways: the most popular (sold in
// the most stores), every brand A–Z (the original page), and the most offers.
const BRAND_ORDERS = ['popular', 'az', 'offers'];
const BRAND_TOP = 100; // the two ranked lists stop at the top 100
const onlineMemory = createMemory('app');

// Department tile icons — presentation only (the taxonomy stays pure data).
const DEPT_ICONS = {
  fresh: '🥬',
  'dairy-eggs': '🥛',
  beverages: '🧃',
  pantry: '🍚',
  'snacks-sweets': '🍫',
  bakery: '🥖',
  frozen: '🧊',
  baby: '🍼',
  'beauty-health': '🧴',
  household: '🧺',
  'home-electronics': '📺',
  more: '🛒',
};

const root = () => document.getElementById('browse-root');

// Canonical nodes carry their own bilingual names (OUR knowledge, not
// retailer content) — pick by the active UI language.
const nodeName = (node) => (getLang() === 'ar' ? node.ar || node.en : node.en || node.ar);

const railTitle = (id) => t(`browse.rail.${id}`);

// --- routing ------------------------------------------------------------------
// app.js routes every #/browse* hash here; this parses the sub-path.
function parseHash() {
  const parts = (location.hash || '').replace(/^#\/browse\/?/, '').split('/').filter(Boolean);
  if (!parts.length) return { view: 'home' };
  const [kind, id] = parts;
  if (kind === 'dept' && id) return { view: 'dept', id };
  if (kind === 'aisle' && id) return { view: 'aisle', id };
  // The old #/browse/brands/all links open A–Z, the original page.
  if (kind === 'brands') return { view: 'brands', order: BRAND_ORDERS.includes(id) ? id : 'az' };
  if (kind === 'brand' && id) return { view: 'brand', id };
  if (kind === 'rail' && id && RAILS.includes(id)) return { view: 'rail', id };
  return { view: 'home' };
}

let renderToken = null; // a newer render cancels an older one's async fills

export function initBrowsePage() {
  const host = root();
  if (!host) return;
  const token = {};
  renderToken = token;
  const route = parseHash();
  host.innerHTML = '';
  if (route.view === 'home') renderHome(host, token);
  else if (route.view === 'brands') renderBrandsIndex(host, token, route.order);
  else renderListing(host, route, token);
}

/* --- shared bits -------------------------------------------------------------- */

function loadingBlock() {
  const d = el('div', 'browse-loading');
  d.innerHTML = `<span class="spinner" aria-hidden="true"></span> ${t('browse.loading')}`;
  return d;
}

function emptyBlock(text) {
  return el('p', 'browse-empty', text);
}

// The Browse offer card: the marketplace's compact card, plus Browse's
// history-backed notes (lowest ever, rare, multi-buy) behind the name's ▸ —
// the dot's percentage is the price drop and "+N days" says when it ends.
function browseCard(offer) {
  const lang = getLang();
  const name =
    (lang === 'ar'
      ? cleanOfferName(offer.nameAr) || cleanOfferName(offer.name)
      : cleanOfferName(offer.name) || cleanOfferName(offer.nameAr)) || t('browse.flyerProduct');
  // A div with button semantics, NOT a <button>: the card carries its own
  // Add-to-Cart/Watch <button>s and buttons cannot nest (same contract as the
  // marketplace's flyerCard). Same keyboard behaviour.
  const card = el('div', 'card card-flyer browse-card');
  card.setAttribute('role', 'button');
  card.tabIndex = 0;
  card.title = t('market.flyerCardTitle', { name });

  // Watch bell — the cross-store grocery watch, exactly the search idiom:
  // keep the product identity (query + name + size) and let the engine
  // super-search all stores and this week's flyers daily.
  const bell = el('button', 'card-watch', '🔔');
  bell.type = 'button';
  bell.title = t('market.watchCross');
  bell.setAttribute('aria-label', t('market.watchAria', { name }));
  bell.addEventListener('click', (e) => {
    e.stopPropagation();
    openWatchDialog({
      kind: 'grocery',
      provider: offer.store,
      productId: offer.id,
      registryProductId: offer.productId || null,
      query: historyQuery(offer) || name,
      label: name,
      sizeText: `${offer.name || ''} ${offer.nameAr || ''}`,
      suggestedPrice: offer.price,
      currentPrice: offer.price,
      link: null,
      image: offer.imageUrl || null,
      listing: {
        id: offer.id,
        provider: offer.store,
        name: offer.name || name,
        nameAr: offer.nameAr || null,
        image: offer.imageUrl || null,
        link: offer.sourceUrl || null,
        registryProductId: offer.productId || null,
      },
    });
  });

  // Add to Cart — the same one-tap gesture search cards have.
  card.appendChild(cardTop(offer, [bell, cartButton(name, flyerCartEntry(offer))]));
  card.appendChild(cardImage(offer.imageUrl, name));

  // Browse's notes, most trustworthy first: the history-backed claim beats
  // the advertised one.
  const notes = [];
  const b = offer.badges || {};
  if (b.lowestEver) notes.push(t('browse.badge.lowestEver', { weeks: b.lowestEver.weeks }));
  if (b.rare) notes.push(t('browse.badge.rare'));
  if (b.multibuy) notes.push(t('browse.badge.multibuy'));
  const brand = (lang === 'ar' ? offer.brandNameAr || offer.brandNameEn : offer.brandNameEn || offer.brandNameAr) || '';
  // No unit price on a Browse card — that is unchanged, and deliberate: the
  // /browse projection omits `search_text` for cost, which would make its unit
  // price disagree with Search on 1,488 offers (browse/api.js cardDoc). The
  // PER-ITEM price is unaffected by that omission on all 74,173 live offers, so
  // it is safe to show and it is the one a browsing shopper can act on.
  card.appendChild(flyerCardBody(offer, name, { brand, up: null, more: notes }));

  card.addEventListener('click', () => openFlyerOffer(offer));
  card.addEventListener('keydown', (e) => {
    if (e.target !== card) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openFlyerOffer(offer);
    }
  });
  return card;
}

function railBlock(rail) {
  const section = el('section', 'browse-rail');
  const head = el('div', 'browse-rail-head');
  head.appendChild(el('h2', null, railTitle(rail.id)));
  const seeAll = el('a', 'browse-seeall', t('browse.seeAll'));
  seeAll.href = `#/browse/rail/${rail.id}`;
  head.appendChild(seeAll);
  section.appendChild(head);
  const scroller = el('div', 'browse-rail-scroll');
  for (const offer of rail.items) scroller.appendChild(browseCard(offer));
  section.appendChild(scroller);
  return section;
}

/* --- the market floor ------------------------------------------------------------ */

async function renderHome(host, token) {
  const hero = el('div', 'browse-hero');
  hero.appendChild(el('h1', null, t('browse.title')));
  const lead = el('p', 'browse-lead', t('browse.lead'));
  hero.appendChild(lead);
  host.appendChild(hero);
  const slot = el('div', 'browse-slot');
  slot.appendChild(loadingBlock());
  host.appendChild(slot);

  // The offer endpoints are much cheaper than the complete market summary.
  // Fill the rails independently so a cold summary never hides ready offers.
  const railSlots = new Map();
  const fillRail = rail => {
    const target = railSlots.get(rail.id);
    if (renderToken !== token || !target || target.dataset.ready || !rail.items?.length) return;
    target.replaceChildren(railBlock(rail));
    target.dataset.ready = 'true';
  };
  for (const id of RAILS) {
    const target = el('div');
    railSlots.set(id, target);
    host.append(target);
    browseOffers({rail:id, limit:12, offset:0}).then(data => {
      if (data) fillRail({id, items:data.offers});
    });
  }

  const summary = await loadBrowseSummary();
  if (renderToken !== token) return;
  slot.innerHTML = '';
  if (!summary) {
    slot.appendChild(emptyBlock(t('browse.unavailable')));
    return;
  }
  if (summary.totals) {
    lead.textContent = t('browse.totals', {
      offers: summary.totals.offers,
      stores: summary.totals.stores,
    });
  }

  const rails = new Map((summary.rails || []).map((r) => [r.id, r]));

  // 1. Departments — the walk-the-market entry point.
  const deptSection = el('section', 'browse-depts');
  deptSection.appendChild(el('h2', null, t('browse.departments')));
  const grid = el('div', 'browse-dept-grid');
  for (const dept of summary.departments || []) {
    const tile = el('a', 'browse-dept-tile');
    tile.href = `#/browse/dept/${dept.id}`;
    tile.appendChild(el('span', 'browse-dept-icon', DEPT_ICONS[dept.id] || '🛒'));
    const nameEl = el('span', 'browse-dept-name', nodeName(dept));
    nameEl.dir = 'auto';
    tile.appendChild(nameEl);
    tile.appendChild(el('span', 'browse-dept-count', String(dept.offers)));
    grid.appendChild(tile);
  }
  deptSection.appendChild(grid);
  slot.appendChild(deptSection);

  // 2. Brands — the EQUAL entry point (design §4): a peer section right beside
  //    departments, never a filter hidden inside them.
  const brands = summary.brands || [];
  if (brands.length) {
    const brandSection = el('section', 'browse-depts browse-brands');
    const bHead = el('div', 'browse-rail-head');
    bHead.appendChild(el('h2', null, t('browse.brands')));
    const all = el('a', 'browse-seeall', t('browse.allBrands', { count: brands.length }));
    all.href = '#/browse/brands';
    bHead.appendChild(all);
    brandSection.appendChild(bHead);
    const row = el('div', 'browse-brand-row');
    // 10, not 14: two clean rows of the 5-across icon grid (the phone layout).
    for (const brand of brands.slice(0, 10)) row.appendChild(brandPill(brand));
    brandSection.appendChild(row);
    // The rest of the list grows in place under the same tiles, in the same
    // most-offers-first order, one batch per tap until every brand is shown.
    if (brands.length > 10) {
      let shown = 10;
      const more = el('button', 'browse-more browse-brands-more');
      more.type = 'button';
      const label = () => { more.textContent = t('browse.moreBrands', { count: brands.length - shown }); };
      more.addEventListener('click', () => {
        for (const brand of brands.slice(shown, shown + BRAND_BATCH)) row.appendChild(brandPill(brand));
        shown += BRAND_BATCH;
        if (shown >= brands.length) more.remove();
        else label();
      });
      label();
      brandSection.appendChild(more);
    }
    slot.appendChild(brandSection);
  }

  // 3. The rails: Biggest Drops, then Lowest Ever.
  for (const id of RAILS) {
    const rail = rails.get(id);
    if (rail) fillRail(rail);
  }
}

// A brand's visual identity without hosting any assets: a monogram avatar in
// a deterministic hue derived from the slug (stable across sessions/pages).
function brandHue(slug) {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) % 360;
  return h;
}

function brandMonogram(slug, name, small = false) {
  const m = el('span', 'browse-brand-monogram' + (small ? ' is-small' : ''));
  m.textContent = (name || slug).trim().charAt(0).toUpperCase();
  m.style.background = `hsl(${brandHue(slug)} 62% 42%)`;
  m.setAttribute('aria-hidden', 'true');
  return m;
}

// The generated catalogue includes sourced logos, reconstructed marks and name marks.
function brandIcon(slug, name, small = false) {
  const asset = BRAND_ASSETS[slug];
  if (!asset) return brandMonogram(slug, name, small);
  const img = el('img', 'browse-brand-logo' + (small ? ' is-small' : ''));
  img.src = new URL('../' + asset.file, import.meta.url).href;
  if (asset.background) img.style.backgroundColor = asset.background;
  if (asset.kind === 'packaging') img.classList.add('is-packaging');
  img.alt = name || slug;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.addEventListener('error', () => img.replaceWith(brandMonogram(slug, name, small)), { once: true });
  return img;
}

// The corner badge shows what the list is ranked by: flyer offers, or (on the
// most-popular list) how many stores carry the brand this week.
function brandPill(brand, badge = 'offers') {
  const pill = el('a', 'browse-brand-pill');
  pill.href = `#/browse/brand/${brand.slug}`;
  const icon = el('span', 'browse-brand-icon');
  icon.appendChild(brandIcon(brand.slug, nodeName(brand)));
  const byStores = badge === 'stores';
  const count = el('span', 'browse-brand-count', byStores ? `🏪 ${brand.stores}` : `📄 ${brand.offers}`);
  count.title = byStores
    ? t('browse.brandStoreCount', { count: brand.stores })
    : t('browse.brandFlyerCount', { count: brand.offers });
  count.setAttribute('aria-label', count.title);
  icon.appendChild(count);
  pill.appendChild(icon);
  const name = el('span', 'browse-brand-name', nodeName(brand));
  name.dir = 'auto';
  pill.appendChild(name);
  return pill;
}

// A–Z by the name the shopper actually sees (locale-aware: Arabic collates in
// Arabic, English in English) — a copy, never a sort of the cached summary.
function brandsAtoZ(brands) {
  const lang = getLang();
  return brands.slice().sort((a, b) => nodeName(a).localeCompare(nodeName(b), lang, { sensitivity: 'base' }));
}

// One of the three brand lists (BRAND_ORDERS). Ties keep the summary's own
// most-offers-first order (a stable sort of a copy).
function brandsInOrder(brands, order) {
  if (order === 'az') return brandsAtoZ(brands);
  const [first, second] = order === 'popular' ? ['stores', 'offers'] : ['offers', 'stores'];
  return brands
    .slice()
    .sort((a, b) => b[first] - a[first] || b[second] - a[second])
    .slice(0, BRAND_TOP);
}

/* --- the all-brands index ------------------------------------------------------------ */

async function renderBrandsIndex(host, token, order = 'az') {
  const head = el('div', 'browse-list-head');
  const back = el('a', 'browse-back', `‹ ${t('browse.back')}`);
  back.href = '#/browse';
  head.appendChild(back);
  head.appendChild(el('h1', null, t('browse.brands')));
  host.appendChild(head);
  const chips = el('div', 'browse-chiprow');
  for (const id of BRAND_ORDERS) {
    const chip = el('a', 'quick-chip' + (id === order ? ' is-active' : ''), t(`browse.brandOrder.${id}`));
    chip.href = id === 'az' ? '#/browse/brands' : `#/browse/brands/${id}`;
    chip.dir = 'auto';
    if (id === order) chip.setAttribute('aria-current', 'page');
    chips.appendChild(chip);
  }
  host.appendChild(chips);
  const slot = el('div', 'browse-slot');
  slot.appendChild(loadingBlock());
  host.appendChild(slot);

  const summary = await loadBrowseSummary();
  if (renderToken !== token) return;
  slot.innerHTML = '';
  const brands = (summary && summary.brands) || [];
  if (!brands.length) {
    slot.appendChild(emptyBlock(t('browse.unavailable')));
    return;
  }
  const lead = el('p', 'browse-brand-order-lead', t(`browse.brandOrderLead.${order}`, { count: brands.length, top: BRAND_TOP }));
  lead.dir = 'auto';
  slot.appendChild(lead);
  const row = el('div', 'browse-brand-row browse-brand-grid');
  const badge = order === 'popular' ? 'stores' : 'offers';
  for (const brand of brandsInOrder(brands, order)) row.appendChild(brandPill(brand, badge));
  slot.appendChild(row);
}

/* --- listings (dept / aisle / brand / rail) ------------------------------------------- */

async function renderListing(host, route, token) {
  // Titles/facets must not hold the offers request behind a slower summary.
  const summaryPromise = loadBrowseSummary();
  const title = route.view === 'rail' ? railTitle(route.id) : route.id;
  let brandInfo = null; // the summary's { slug, en, ar, offers, stores } entry

  const head = el('div', 'browse-list-head');
  const back = el('a', 'browse-back', `‹ ${t('browse.back')}`);
  back.href = '#/browse';
  head.appendChild(back);
  if (route.view !== 'brand') {
    const h1 = el('h1', null, title);
    h1.dir = 'auto';
    head.appendChild(h1);
  }
  host.appendChild(head);

  // A brand page opens on the brand, not on a filter: identity hero (monogram
  // + bilingual name + live footprint), then its product families below.
  if (route.view === 'brand') {
    const hero = el('div', 'browse-brand-hero');
    hero.appendChild(brandIcon(route.id, title));
    const meta = el('div', 'browse-brand-meta');
    const h1 = el('h1', null, title);
    h1.dir = 'auto';
    meta.appendChild(h1);
    if (brandInfo) {
      meta.appendChild(
        el('p', 'browse-brand-stats', t('browse.brandStats', { offers: brandInfo.offers, stores: brandInfo.stores })),
      );
    }
    hero.appendChild(meta);
    host.appendChild(hero);
  }

  // Aisle chips: a department page offers its aisles as one-tap refinements;
  // an aisle page shows its siblings (with itself active) for lateral moves.
  const aisleSlot = el('div');
  host.appendChild(aisleSlot);
  function renderAisles(dept) {
    if (!dept || dept.aisles.length < 2) return;
    const chipRow = el('div', 'browse-chiprow');
    const allChip = el('a', 'quick-chip' + (route.view === 'dept' ? ' is-active' : ''), t('browse.allAisle'));
    allChip.href = `#/browse/dept/${dept.id}`;
    chipRow.appendChild(allChip);
    for (const aisle of dept.aisles) {
      const chip = el('a', 'quick-chip' + (route.view === 'aisle' && aisle.id === route.id ? ' is-active' : ''));
      chip.href = `#/browse/aisle/${aisle.id}`;
      chip.textContent = `${nodeName(aisle)} · ${aisle.offers}`;
      chip.dir = 'auto';
      chipRow.appendChild(chip);
    }
    aisleSlot.replaceChildren(chipRow);
  }

  // Controls: sort (not for rails — a rail IS an ordering) + store filter.
  const controls = el('div', 'browse-controls');
  let sort = 'discount';
  let storeFilter = '';
  const sortChips = [];
  if (route.view !== 'rail') {
    for (const s of SORTS) {
      const chip = el('button', 'quick-chip' + (s === sort ? ' is-active' : ''), t(`browse.sort.${s}`));
      chip.type = 'button';
      chip.addEventListener('click', () => {
        sort = s;
        for (const c of sortChips) c.classList.toggle('is-active', c === chip);
        reload();
      });
      sortChips.push(chip);
      controls.appendChild(chip);
    }
  }
  const storeSel = el('select', 'browse-store-select');
  const optAll = el('option', null, t('browse.allStores'));
  optAll.value = '';
  storeSel.appendChild(optAll);
  for (const s of ENGINE_STORES) {
    const opt = el('option', null, s.label);
    opt.value = s.id;
    storeSel.appendChild(opt);
  }
  storeSel.addEventListener('change', () => {
    storeFilter = storeSel.value;
    reload();
  });
  controls.appendChild(storeSel);
  host.appendChild(controls);

  // Product families inside a brand (canonical aisles with live-offer counts,
  // engine-provided on the first page): tap a family to focus the grid on it.
  // Rendered once — the facet is brand-wide and does not change with filters.
  let aisleFilter = '';
  let familySlot = null;
  if (route.view === 'brand') {
    familySlot = el('div', 'browse-brand-families');
    host.insertBefore(familySlot, controls);
  }
  function renderFamilies(families) {
    if (!familySlot || familySlot.childNodes.length || !families || families.length < 2) return;
    familySlot.appendChild(el('h2', 'browse-family-label', t('browse.brandFamilies')));
    const chipRow = el('div', 'browse-chiprow');
    const chips = [];
    const select = (chip, id) => {
      aisleFilter = id;
      for (const c of chips) c.classList.toggle('is-active', c === chip);
      reload();
    };
    const allChip = el('button', 'quick-chip is-active', t('browse.allAisle'));
    allChip.type = 'button';
    allChip.addEventListener('click', () => select(allChip, ''));
    chips.push(allChip);
    chipRow.appendChild(allChip);
    for (const fam of families) {
      const chip = el('button', 'quick-chip');
      chip.type = 'button';
      chip.textContent = `${nodeName(fam)} · ${fam.offers}`;
      chip.dir = 'auto';
      chip.addEventListener('click', () => select(chip, fam.id));
      chips.push(chip);
      chipRow.appendChild(chip);
    }
    familySlot.appendChild(chipRow);
  }

  const gridSlot = el('div', 'browse-slot');
  if (route.view === 'brand') {
    const flyerHead = el('div', 'browse-section-head');
    flyerHead.appendChild(el('h2', null, t('browse.flyerOffers')));
    flyerHead.appendChild(el('p', null, t('browse.flyerLead')));
    host.appendChild(flyerHead);
  }
  host.appendChild(gridSlot);

  let offset = 0;
  const params = () => ({
    ...(route.view === 'dept' ? { dept: route.id } : {}),
    ...(route.view === 'aisle' ? { aisle: route.id } : {}),
    ...(route.view === 'brand' ? { brand: route.id } : {}),
    ...(route.view === 'brand' && aisleFilter ? { aisle: aisleFilter } : {}),
    ...(route.view === 'rail' ? { rail: route.id } : {}),
    ...(route.view !== 'rail' ? { sort } : {}),
    ...(storeFilter ? { store: storeFilter } : {}),
    limit: PAGE_SIZE,
    offset,
  });

  let listingRevision = 0;
  async function fill(grid, moreBtn, revision) {
    const requestOffset = offset;
    moreBtn.disabled = true;
    const data = await browseOffers(params());
    if (renderToken !== token || revision !== listingRevision) return;
    moreBtn.disabled = false;
    if (data && data.families) renderFamilies(data.families);
    if (!data && requestOffset === 0) {
      gridSlot.innerHTML = '';
      gridSlot.appendChild(emptyBlock(t('browse.unavailable')));
      return;
    }
    const offers = (data && data.offers) || [];
    if (requestOffset === 0 && !offers.length) {
      gridSlot.innerHTML = '';
      gridSlot.appendChild(emptyBlock(t('browse.empty')));
      return;
    }
    for (const offer of offers) grid.appendChild(browseCard(offer));
    moreBtn.hidden = offers.length < PAGE_SIZE;
  }

  function reload() {
    const revision = ++listingRevision;
    offset = 0;
    gridSlot.innerHTML = '';
    gridSlot.appendChild(loadingBlock());
    const grid = el('div', 'results-grid browse-grid');
    const moreBtn = el('button', 'browse-more', t('browse.loadMore'));
    moreBtn.type = 'button';
    moreBtn.hidden = true;
    moreBtn.addEventListener('click', () => {
      offset += PAGE_SIZE;
      fill(grid, moreBtn, revision);
    });
    fill(grid, moreBtn, revision).then(() => {
      if (renderToken !== token || revision !== listingRevision) return;
      const spinner = gridSlot.querySelector('.browse-loading');
      if (spinner) spinner.remove();
      if (grid.childNodes.length) {
        gridSlot.appendChild(grid);
        gridSlot.appendChild(moreBtn);
      }
    });
  }

  reload();
  summaryPromise.then(data => {
    if (renderToken !== token || !data) return;
    if (route.view === 'brand') {
      brandInfo = (data.brands || []).find(b => b.slug === route.id);
      if (brandInfo) {
        host.querySelector('h1').textContent = nodeName(brandInfo);
        const meta = host.querySelector('.browse-brand-meta');
        meta.append(el('p', 'browse-brand-stats', t('browse.brandStats', {offers:brandInfo.offers, stores:brandInfo.stores})));
      }
    } else if (['dept','aisle'].includes(route.view)) {
      for (const d of data.departments || []) {
        const node = route.view === 'dept' ? (d.id === route.id ? d : null) : d.aisles.find(a => a.id === route.id);
        if (node) { host.querySelector('h1').textContent = nodeName(node); renderAisles(d); break; }
      }
    }
  });
  if (route.view === 'brand') summaryPromise.then(data => {
    if (renderToken !== token) return;
    const brand = data?.brands?.find(b => b.slug === route.id);
    renderOnlineBrand(host, brand?.en || route.id, token);
  });
}

// A brand page is the only Browse route that has a safe, canonical query.
// Search every online provider here and feed the results into the SAME
// marketplace component as Live Search. This deliberately stays separate from
// the flyer grid: online prices are live catalogue results, while the first
// grid is the structured set from this week's flyers.
async function renderOnlineBrand(host, query, token) {
  const section = el('section', 'browse-online-section');
  section.appendChild(el('p', 'browse-online-lead', t('browse.onlineLead')));
  host.appendChild(section);

  const market = createMarketplace(section, ONLINE_STORES, query, {
    includeFlyers: false,
    title: t('browse.onlineOffers'),
  });

  await Promise.all(
    ONLINE_STORES.map(async (store) => {
      try {
        const { results } = await adaptiveSearch(store.provider, query, onlineMemory);
        if (renderToken !== token) return;
        const { primary, related, hidden } = rankOnlineResults(results, query);
        market.addOnline(store, primary, hidden, related);
      } catch (err) {
        if (renderToken !== token) return;
        market.failStore(store, BEST_EFFORT_ONLINE_STORES.has(store.id));
        console.warn(`${store.label} Browse search failed:`, (err && err.details) || err);
      }
    }),
  );
  if (renderToken === token) market.finish();
}
