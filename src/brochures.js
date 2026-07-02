// brochures.js — the Brochures page (#/brochures).
//
// A dedicated, full-page experience — not attached to search results. Every
// store the Brochure Engine covers gets its own section, and every currently
// ACTIVE brochure the engine holds for that store is displayed under it (a
// store may run several at once). Active means the validity window includes
// today; a store whose newest flyer has already expired is clearly marked
// unavailable (the expired flyer stays visible, greyed, so "why is there
// nothing?" is answerable). Opening a brochure stays inside the app via the
// shared viewer; external "official offers page" brochures are marked and open
// in a new tab.
//
// Read-only over the existing engine APIs: /brochures/history per store (all
// editions + validity), meta.json + /asset for covers and pages. No backend
// change.

import {
  ENGINE_STORES,
  loadStoreEditions,
  isActiveBrochure,
  isExternalBrochure,
  isPdfBrochure,
  loadBrochurePages,
  orderBrochures,
  daysLeft,
} from './brochure.js';
import { openBrochureViewer, brochureDateLabel } from './viewer.js';

let initialized = false;

export function initBrochuresPage() {
  if (initialized) return;
  initialized = true;
  const root = document.getElementById('brochure-stores');
  root.innerHTML = '';
  for (const store of ENGINE_STORES) {
    const section = storeSection(store);
    root.appendChild(section.el);
    renderStore(store, section); // each store loads independently
  }
}

function storeSection(store) {
  const el = document.createElement('section');
  el.className = 'bstore';
  el.setAttribute('aria-label', `${store.label} brochures`);

  const head = document.createElement('div');
  head.className = 'bstore-head';
  const dot = document.createElement('span');
  dot.className = 'store-dot';
  dot.style.background = store.color;
  const name = document.createElement('span');
  name.className = 'bstore-name';
  name.textContent = store.label;
  const tag = document.createElement('span');
  tag.className = 'bstore-tag';
  head.append(dot, name, tag);

  // Stores that are also live-search stores get a shortcut into Search,
  // pre-scoped to that store.
  if (store.search) {
    const link = document.createElement('a');
    link.className = 'bstore-search';
    link.href = '#/search';
    link.textContent = 'Search this store';
    link.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('souq:search-store', { detail: { store: store.search } }));
    });
    head.appendChild(link);
  }

  const body = document.createElement('div');
  body.className = 'bcards';
  body.appendChild(skeletonCard());

  el.append(head, body);
  return { el, body, tag };
}

function skeletonCard() {
  const c = document.createElement('div');
  c.className = 'bsk';
  c.innerHTML = '<div class="sk-cover sk"></div><div class="sk-line sk"></div>';
  return c;
}

async function renderStore(store, section) {
  const editions = await loadStoreEditions(store.id);
  // ALL active brochures for this store (a store may run several at once),
  // ordered main-weekly-flyer-first — never a 1-page promo above the main one.
  const active = await orderBrochures(editions.filter(isActiveBrochure));

  section.body.innerHTML = '';

  if (active.length) {
    section.tag.className = 'bstore-tag is-live';
    section.tag.textContent = active.length === 1 ? 'Current flyer' : `${active.length} current flyers`;
    for (const b of active) section.body.appendChild(brochureCard(b, store, false));
    return;
  }

  // No active brochure — say so clearly, and show the most recently expired
  // flyer (greyed + badged) so the state is legible rather than just empty.
  section.tag.className = 'bstore-tag is-off';
  section.tag.textContent = 'No current flyer';

  const expired = editions
    .filter((b) => !isExternalBrochure(b))
    .sort((a, z) => (z.validTo || '').localeCompare(a.validTo || ''))[0];
  if (!expired) {
    const empty = document.createElement('div');
    empty.className = 'bstore-empty';
    empty.textContent = editions.length
      ? 'No current brochure right now — check back after the weekly refresh.'
      : 'No brochures held for this store yet.';
    section.body.replaceWith(empty);
    return;
  }
  section.body.appendChild(brochureCard(expired, store, true));
}

// One brochure card: cover (first page image, served through the engine),
// title, validity dates, and a status badge. Clicking opens the shared in-app
// viewer — except external link brochures, which are <a> to the official page.
function brochureCard(b, store, expired) {
  const external = isExternalBrochure(b);
  const el = document.createElement(external ? 'a' : 'button');
  el.className = 'bcard';
  if (expired) el.classList.add('is-expired');
  if (external) {
    el.href = b.sourceUrl;
    el.target = '_blank';
    el.rel = 'noopener noreferrer';
  } else {
    el.type = 'button';
    el.addEventListener('click', () => openBrochureViewer(b, store.label));
  }

  const cover = document.createElement('div');
  cover.className = 'bcard-cover';
  const badge = document.createElement('span');
  badge.className = 'bcard-badge';
  if (expired) {
    badge.classList.add('is-expired');
    badge.textContent = 'Expired';
  } else {
    const left = daysLeft(b);
    if (left != null && left <= 1) {
      badge.classList.add('is-ending');
      badge.textContent = left === 0 ? 'Ends today' : 'Ends tomorrow';
    } else {
      badge.classList.add('is-current');
      badge.textContent = 'Current';
    }
  }

  if (external) {
    cover.innerHTML = '<span class="bcover-glyph" aria-hidden="true">↗</span>';
  } else if (isPdfBrochure(b)) {
    cover.innerHTML = '<span class="bcover-glyph" aria-hidden="true">📄</span>';
    loadCoverInto(cover, b); // PDFs have no page images; the glyph stays
  } else {
    const sk = document.createElement('div');
    sk.className = 'sk';
    sk.style.position = 'absolute';
    sk.style.inset = '0';
    cover.appendChild(sk);
    loadCoverInto(cover, b);
  }
  cover.appendChild(badge);

  const body = document.createElement('div');
  body.className = 'bcard-body';
  const title = document.createElement('span');
  title.className = 'bcard-title';
  title.dir = 'auto';
  title.textContent = b.title || `${store.label} weekly flyer`;
  const dates = document.createElement('span');
  dates.className = 'bcard-dates';
  dates.textContent = brochureDateLabel(b);
  body.append(title, dates);
  const kind = document.createElement('span');
  kind.className = 'bcard-kind';
  if (external) kind.textContent = 'Official offers page ↗';
  else if (isPdfBrochure(b)) kind.textContent = 'PDF brochure';
  if (kind.textContent) body.appendChild(kind);

  el.append(cover, body);
  return el;
}

// Fill a card cover with the brochure's first page image + a page-count pill.
// Best-effort: on failure the placeholder simply remains.
async function loadCoverInto(cover, b) {
  const data = await loadBrochurePages(b);
  if (!data || !data.pages.length) return;
  // Note: no loading="lazy" here — the image is detached until it loads, and
  // lazy detached images never load at all.
  const img = new Image();
  img.alt = '';
  img.addEventListener('load', () => {
    cover.querySelectorAll('.sk, .bcover-glyph').forEach((n) => n.remove());
    cover.prepend(img);
  });
  img.src = data.pages[0];
  if (data.pages.length > 1) {
    const pages = document.createElement('span');
    pages.className = 'bcard-pages';
    pages.textContent = `${data.pages.length} pages`;
    cover.appendChild(pages);
  }
}
