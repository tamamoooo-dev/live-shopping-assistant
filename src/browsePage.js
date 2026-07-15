// browsePage.js — the Browse pillar's UI (BROWSE-DESIGN.md §8): "walk this
// week's market". Three views under one hash namespace, all thin compositions
// over the engine's canonical Browse API (brochure.js — rule 7) and the
// marketplace's exported card primitives (ONE card idiom, ONE tap-through):
//
//   #/browse                → the market floor: Exceptional Deals, department
//                             tiles, brand row, rails
//   #/browse/dept/<id>      → a department (aisle chips + listing)
//   #/browse/aisle/<id>     → one aisle's listing
//   #/browse/brands         → every brand with live offers (A–Z of the market)
//   #/browse/brand/<slug>   → one brand's listing (canonical, bilingual)
//   #/browse/rail/<id>      → a rail's full "see all" listing
//
// Every engine read is best-effort: an unreachable engine renders a calm
// empty state and never breaks the rest of the app. Flyer prices are
// machine-extracted — every card opens the flyer itself (openFlyerOffer).

import { loadBrowseSummary, browseOffers, storeLabel, storeColor, cleanOfferName, ENGINE_STORES } from './brochure.js';
import { el, cardImage, priceRow, storeBadge, openFlyerOffer, fmtDateShort } from './marketplace.js';
import { t, getLang } from './i18n.js';

const RAILS = ['exceptional', 'drops', 'lowest-ever', 'ending-soon', 'new-this-week'];
const SORTS = ['discount', 'price', 'newest', 'ending'];
const PAGE_SIZE = 24;

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
  if (kind === 'brands') return { view: 'brands' };
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
  else if (route.view === 'brands') renderBrandsIndex(host, token);
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

// The Browse offer card: marketplace primitives + honest Browse badges.
function browseCard(offer) {
  const lang = getLang();
  const name =
    (lang === 'ar'
      ? cleanOfferName(offer.nameAr) || cleanOfferName(offer.name)
      : cleanOfferName(offer.name) || cleanOfferName(offer.nameAr)) || t('browse.flyerProduct');
  const card = el('button', 'card card-flyer browse-card');
  card.type = 'button';
  card.title = t('market.flyerCardTitle', { name });

  card.appendChild(cardImage(offer.imageUrl, name));

  // Badge chips (top of the body, most trustworthy first, max two): the
  // history-backed claim beats the advertised one, urgency comes last.
  const chips = [];
  const b = offer.badges || {};
  if (b.lowestEver) chips.push(el('span', 'bb bb-low', t('browse.badge.lowestEver', { weeks: b.lowestEver.weeks })));
  if (b.drop) chips.push(el('span', 'bb bb-drop', `−${b.drop}%`));
  if (b.rare && chips.length < 2) chips.push(el('span', 'bb bb-rare', t('browse.badge.rare')));
  if (b.multibuy && chips.length < 2) chips.push(el('span', 'bb bb-multi', t('browse.badge.multibuy')));
  if (b.endsInDays != null && chips.length < 2) {
    chips.push(el('span', 'bb bb-ends', b.endsInDays === 0 ? t('browse.badge.endsToday') : t('browse.badge.endsTomorrow')));
  }

  const body = el('div', 'card-body');
  if (chips.length) {
    const row = el('div', 'browse-badges');
    for (const c of chips.slice(0, 2)) row.appendChild(c);
    body.appendChild(row);
  }
  const until = offer.validTo ? t('market.flyerUntil', { date: fmtDateShort(offer.validTo) }) : t('market.flyerTag');
  body.appendChild(storeBadge(storeLabel(offer.store), storeColor(offer.store), until));
  const nameEl = el('div', 'card-name', name);
  nameEl.dir = 'auto';
  body.appendChild(nameEl);
  body.appendChild(priceRow(offer.price, offer.oldPrice, offer.currency, '', null));
  card.appendChild(body);

  card.addEventListener('click', () => openFlyerOffer(offer));
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

  // 1. The flagship: Exceptional Deals, first thing under the header.
  const exceptional = rails.get('exceptional');
  if (exceptional) slot.appendChild(railBlock(exceptional));

  // 2. Departments — the walk-the-market entry point (brands join in M3 as a
  //    peer row, per the design's equal-entry-points rule).
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

  // 3. Brands — the EQUAL entry point (design §4): a peer section right beside
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
    for (const brand of brands.slice(0, 14)) row.appendChild(brandPill(brand));
    brandSection.appendChild(row);
    slot.appendChild(brandSection);
  }

  // 4. The remaining rails, in the design's order.
  for (const id of RAILS) {
    if (id === 'exceptional') continue;
    const rail = rails.get(id);
    if (rail) slot.appendChild(railBlock(rail));
  }
}

function brandPill(brand) {
  const pill = el('a', 'browse-brand-pill');
  pill.href = `#/browse/brand/${brand.slug}`;
  const name = el('span', 'browse-brand-name', nodeName(brand));
  name.dir = 'auto';
  pill.appendChild(name);
  pill.appendChild(el('span', 'browse-brand-count', String(brand.offers)));
  return pill;
}

/* --- the all-brands index ------------------------------------------------------------ */

async function renderBrandsIndex(host, token) {
  const head = el('div', 'browse-list-head');
  const back = el('a', 'browse-back', `‹ ${t('browse.back')}`);
  back.href = '#/browse';
  head.appendChild(back);
  head.appendChild(el('h1', null, t('browse.brands')));
  host.appendChild(head);
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
  const row = el('div', 'browse-brand-row browse-brand-grid');
  for (const brand of brands) row.appendChild(brandPill(brand));
  slot.appendChild(row);
}

/* --- listings (dept / aisle / brand / rail) ------------------------------------------- */

async function renderListing(host, route, token) {
  // Resolve the page title (and the aisle chips for a department) from the
  // cached summary — no extra request; fall back to the raw id gracefully.
  const summary = await loadBrowseSummary();
  if (renderToken !== token) return;

  let title = railTitle(route.id);
  let dept = null;
  if (route.view === 'brand') {
    const brand = ((summary && summary.brands) || []).find((b) => b.slug === route.id);
    title = brand ? nodeName(brand) : route.id;
  }
  if (route.view === 'dept' || route.view === 'aisle') {
    for (const d of (summary && summary.departments) || []) {
      if (route.view === 'dept' && d.id === route.id) {
        dept = d;
        title = nodeName(d);
      }
      const aisle = d.aisles.find((a) => a.id === route.id);
      if (route.view === 'aisle' && aisle) {
        dept = d;
        title = nodeName(aisle);
      }
    }
    if (!dept) title = route.id;
  }

  const head = el('div', 'browse-list-head');
  const back = el('a', 'browse-back', `‹ ${t('browse.back')}`);
  back.href = '#/browse';
  head.appendChild(back);
  const h1 = el('h1', null, title);
  h1.dir = 'auto';
  head.appendChild(h1);
  host.appendChild(head);

  // Aisle chips: a department page offers its aisles as one-tap refinements;
  // an aisle page shows its siblings (with itself active) for lateral moves.
  if (dept && dept.aisles.length > 1) {
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
    host.appendChild(chipRow);
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

  const gridSlot = el('div', 'browse-slot');
  host.appendChild(gridSlot);

  let offset = 0;
  const params = () => ({
    ...(route.view === 'dept' ? { dept: route.id } : {}),
    ...(route.view === 'aisle' ? { aisle: route.id } : {}),
    ...(route.view === 'brand' ? { brand: route.id } : {}),
    ...(route.view === 'rail' ? { rail: route.id } : {}),
    ...(route.view !== 'rail' ? { sort } : {}),
    ...(storeFilter ? { store: storeFilter } : {}),
    limit: PAGE_SIZE,
    offset,
  });

  async function fill(grid, moreBtn) {
    const data = await browseOffers(params());
    if (renderToken !== token) return;
    if (!data && offset === 0) {
      gridSlot.innerHTML = '';
      gridSlot.appendChild(emptyBlock(t('browse.unavailable')));
      return;
    }
    const offers = (data && data.offers) || [];
    if (offset === 0 && !offers.length) {
      gridSlot.innerHTML = '';
      gridSlot.appendChild(emptyBlock(t('browse.empty')));
      return;
    }
    for (const offer of offers) grid.appendChild(browseCard(offer));
    moreBtn.hidden = offers.length < PAGE_SIZE;
  }

  function reload() {
    offset = 0;
    gridSlot.innerHTML = '';
    gridSlot.appendChild(loadingBlock());
    const grid = el('div', 'results-grid browse-grid');
    const moreBtn = el('button', 'browse-more', t('browse.loadMore'));
    moreBtn.type = 'button';
    moreBtn.hidden = true;
    moreBtn.addEventListener('click', () => {
      offset += PAGE_SIZE;
      fill(grid, moreBtn);
    });
    fill(grid, moreBtn).then(() => {
      if (renderToken !== token) return;
      const spinner = gridSlot.querySelector('.browse-loading');
      if (spinner) spinner.remove();
      if (grid.childNodes.length) {
        gridSlot.appendChild(grid);
        gridSlot.appendChild(moreBtn);
      }
    });
  }

  reload();
}
