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

import { loadBrowseSummary, browseOffers, storeLabel, storeColor, cleanOfferName, ENGINE_STORES } from './brochure.js';
import { el, cardImage, priceRow, storeBadge, openFlyerOffer, fmtDateShort } from './marketplace.js';
import { addToCart } from './cart.js';
import { openWatchDialog } from './alertsPage.js';
import { historyQuery } from './viewer/insights.js';
import { t, getLang } from './i18n.js';

const RAILS = ['drops', 'lowest-ever'];
const SORTS = ['discount', 'price'];
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
  // A div with button semantics, NOT a <button>: the card carries its own
  // Add-to-Cart/Watch <button>s and buttons cannot nest (same contract as the
  // marketplace's flyerCard). Same keyboard behaviour.
  const card = el('div', 'card card-flyer browse-card');
  card.setAttribute('role', 'button');
  card.tabIndex = 0;
  card.title = t('market.flyerCardTitle', { name });

  // Add to Cart — the same one-tap gesture search cards have (consistent
  // regardless of source). Same id as the viewer sheet's add (offer.id), so
  // quantities merge whichever path added the product.
  const cartBtn = el('button', 'card-watch card-cart', '🛒');
  cartBtn.type = 'button';
  cartBtn.title = t('market.addCart');
  cartBtn.setAttribute('aria-label', t('market.addCartAria', { name }));
  cartBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    addToCart({
      id: offer.id,
      store: offer.store,
      name: offer.name || null,
      nameAr: offer.nameAr || null,
      price: offer.price,
      oldPrice: offer.oldPrice ?? null,
      currency: offer.currency || 'SAR',
      image: offer.imageUrl || null,
      sourceUrl: offer.sourceUrl || null,
      validTo: offer.validTo || null,
    });
    cartBtn.textContent = '✓';
    cartBtn.classList.add('is-added');
    setTimeout(() => {
      if (!cartBtn.isConnected) return;
      cartBtn.textContent = '🛒';
      cartBtn.classList.remove('is-added');
    }, 1200);
  });
  card.appendChild(cartBtn);

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
      query: historyQuery(offer) || name,
      label: name,
      sizeText: `${offer.name || ''} ${offer.nameAr || ''}`,
      suggestedPrice: offer.price,
      currentPrice: offer.price,
      link: offer.sourceUrl || null,
      image: offer.imageUrl || null,
    });
  });
  card.appendChild(bell);

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
  card.addEventListener('keydown', (e) => {
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
    for (const brand of brands.slice(0, 14)) row.appendChild(brandPill(brand));
    brandSection.appendChild(row);
    slot.appendChild(brandSection);
  }

  // 3. The rails: Biggest Drops, then Lowest Ever.
  for (const id of RAILS) {
    const rail = rails.get(id);
    if (rail) slot.appendChild(railBlock(rail));
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

function brandPill(brand) {
  const pill = el('a', 'browse-brand-pill');
  pill.href = `#/browse/brand/${brand.slug}`;
  pill.appendChild(brandMonogram(brand.slug, nodeName(brand), true));
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
  let brandInfo = null; // the summary's { slug, en, ar, offers, stores } entry
  if (route.view === 'brand') {
    brandInfo = ((summary && summary.brands) || []).find((b) => b.slug === route.id) || null;
    title = brandInfo ? nodeName(brandInfo) : route.id;
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
    hero.appendChild(brandMonogram(route.id, title));
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

  async function fill(grid, moreBtn) {
    const data = await browseOffers(params());
    if (renderToken !== token) return;
    if (data && data.families) renderFamilies(data.families);
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
