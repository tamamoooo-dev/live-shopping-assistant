// minimartsSection.js — Mini marts, one provider on the Brochures page.
//
// Small shops post their offers on their public Snapchat story; the engine
// reads each followed shop's story every 2 hours, keeps only snaps with a
// printed price (an ad leaves nothing), and serves the offers with the picture
// each price was read from (GET /minimarts). A deal a shop posts again on a
// later day is ONE offer ("posted again"), never a second one.
//
// One provider on the page (owner, 2026-11-04: "treated as if it was Panda"),
// its shops drawn like Browse's brands (owner, 2026-11-05: "not a flyer
// style ... similar to the brand offers in browse"): a tile per shop, and
// tapping one opens that shop's offers under Browse's brand header
// (#/brochures/minimarts/<username>).
//
// The shop list is managed only in OWNER MODE, a per-browser switch turned on
// by opening #/brochures?minimarts=manage once (and off from the panel):
// other users never see the Shops panel. "New" is per browser and per shop:
// offers first seen after this browser last opened that shop, also shown as a
// badge on the Brochures tab.

import { t } from './i18n.js';

const ENGINE_BASE = 'https://brochure-engine.tamamoooo.workers.dev';
const SEEN_KEY = 'lsa.minimarts.seen.v2'; // { since, shops: { <username>: iso } }
const OWNER_KEY = 'lsa.minimarts.owner.v1';
const SHOP_ROUTE = /^#\/brochures\/minimarts\/([a-z0-9._-]+)/i;

let cache = null; // { shops, offers, generatedAt }
let openedFromList = false; // Back returns through history when the list opened the shop

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// A line of UI text whose direction follows its own words (the app's pattern).
function line(tag, className, text) {
  const node = el(tag, className, text);
  node.dir = 'auto';
  return node;
}

function readLocal(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode: "new" simply stays on, owner mode stays off */
  }
}

async function loadMinimarts() {
  const res = await fetch(`${ENGINE_BASE}/minimarts`);
  if (!res.ok) throw new Error(`minimarts ${res.status}`);
  cache = await res.json();
  return cache;
}

// Counted phrases with Arabic's own forms: 1, 2, 3–10 ("few") and 11+
// ("other"). A form a language does not define falls through to "other".
function plural(key, count, params = {}) {
  const forms = count === 1 ? ['one', 'other'] : count === 2 ? ['two', 'other'] : count >= 3 && count <= 10 ? ['few', 'other'] : ['other'];
  for (const form of forms) {
    const variant = `${key}.${form}`;
    const text = t(variant, { ...params, count });
    if (text !== variant) return text;
  }
  return t(key, { ...params, count });
}

function money(value) {
  if (value == null) return '';
  const n = Number(value);
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, '');
}

function ago(iso) {
  const ms = Date.now() - Date.parse(iso || '');
  if (!Number.isFinite(ms) || ms < 0) return '';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return plural('minimarts.minutesAgo', Math.max(1, minutes));
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return plural('minimarts.hoursAgo', hours);
  return plural('minimarts.daysAgo', Math.floor(hours / 24));
}

const shopName = (shop, username) => shop?.title || username;

// A shop's tile image: its Snapchat profile picture, else a monogram in a hue
// fixed by the username (the same scheme as Browse's brand monograms).
function shopMonogram(shop) {
  let hue = 0;
  for (const ch of shop.username) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
  const m = el('span', 'browse-brand-monogram', shopName(shop, shop.username).trim().charAt(0));
  m.style.background = `hsl(${hue} 62% 42%)`;
  m.setAttribute('aria-hidden', 'true');
  return m;
}

function shopIcon(shop) {
  if (!shop.picture) return shopMonogram(shop);
  const img = el('img', 'browse-brand-logo mm-shop-logo');
  img.src = shop.picture;
  img.alt = '';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';
  img.addEventListener('error', () => img.replaceWith(shopMonogram(shop)), { once: true });
  return img;
}

// --- routes + owner mode -------------------------------------------------------------
export function minimartShopFromHash(hash = location.hash) {
  const match = SHOP_ROUTE.exec(String(hash || '').split('?')[0]);
  return match ? match[1].toLowerCase() : null;
}

function ownerMode() {
  const [path, query] = String(location.hash || '').split('?');
  const flag = new URLSearchParams(query || '').get('minimarts');
  if (flag === 'manage' || flag === 'off') {
    writeLocal(OWNER_KEY, flag === 'manage' ? '1' : null);
    // The switch is remembered; the address drops it (no hashchange fires).
    history.replaceState(null, '', path || '#/brochures');
  }
  return readLocal(OWNER_KEY) === '1';
}

// --- "new": per browser, per shop ------------------------------------------------------
function readSeen() {
  try {
    const seen = JSON.parse(readLocal(SEEN_KEY) || 'null');
    if (seen && seen.since) return { since: seen.since, shops: seen.shops || {} };
  } catch {
    /* unreadable: start over below */
  }
  return null;
}

// A first-ever visit counts nothing as new (no badge flood).
function ensureSeen(nowIso) {
  const seen = readSeen();
  if (seen) return seen;
  const fresh = { since: nowIso, shops: {} };
  writeLocal(SEEN_KEY, JSON.stringify(fresh));
  return fresh;
}

function isNew(offer, seen) {
  const at = seen ? seen.shops[offer.username] || seen.since : null;
  return at ? offer.createdAt > at : false;
}

function markShopSeen(username, iso) {
  const seen = ensureSeen(iso);
  seen.shops[username] = iso;
  writeLocal(SEEN_KEY, JSON.stringify(seen));
}

// --- the badge on the Brochures tab ------------------------------------------------
function setBadge(n) {
  for (const link of document.querySelectorAll('[data-nav="brochures"]')) {
    let dot = link.querySelector('.nav-badge');
    if (n > 0) {
      if (!dot) {
        dot = el('span', 'nav-badge');
        link.appendChild(dot);
      }
      dot.textContent = n > 9 ? '9+' : String(n);
    } else if (dot) {
      dot.remove();
    }
  }
}

function paintBadge(data) {
  const seen = ensureSeen(data.generatedAt);
  setBadge(data.offers.filter((o) => isNew(o, seen)).length);
}

// Once at boot, so new mini mart offers show without opening the page.
export async function refreshMinimartsBadge() {
  try {
    paintBadge(await loadMinimarts());
  } catch {
    /* the badge is a nicety; the page shows its own error */
  }
}

// --- the provider section: one brand tile per shop -------------------------------------
function skeletonTiles() {
  return [1, 2, 3].map(() => el('div', 'mm-pill-sk sk'));
}

// Shops with offers first (newest posting first), then the quiet ones.
function orderShops(data) {
  const byShop = new Map(data.shops.map((s) => [s.username, []]));
  for (const offer of data.offers) byShop.get(offer.username)?.push(offer);
  const newest = (offers, shop) => offers.map((o) => o.lastPostedAt || o.postedAt).sort().pop() || shop.lastPostAt || '';
  return data.shops
    .map((shop) => ({ shop, offers: byShop.get(shop.username) || [] }))
    .sort((a, b) => (b.offers.length > 0) - (a.offers.length > 0) || newest(b.offers, b.shop).localeCompare(newest(a.offers, a.shop)));
}

export function createMinimartsSection() {
  const section = el('section', 'bstore mm');
  section.setAttribute('aria-label', t('minimarts.title'));

  const head = el('div', 'bstore-head');
  const icon = el('span', 'mm-icon');
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 4.5 4h15L21 9.5"/><path d="M3 9.5h18v1a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z"/><path d="M5 13v7h14v-7"/><path d="M10 20v-4h4v4"/></svg>';
  const name = el('span', 'bstore-name', t('minimarts.title'));
  const tag = line('span', 'bstore-tag');
  head.append(icon, name, tag);

  const manager = el('div', 'mm-manager');
  manager.hidden = true;
  const body = el('div', 'browse-brand-row');
  body.append(...skeletonTiles());
  section.append(head, manager, body);

  let shopsBtn = null;
  const setOpen = (open) => {
    manager.hidden = !open;
    shopsBtn?.setAttribute('aria-expanded', String(open));
  };

  const render = (data) => {
    const owner = ownerMode();
    // Nothing to show anyone but the owner: the provider stays off the page.
    section.hidden = !owner && !data.shops.length;
    const live = data.offers.length;
    tag.textContent = live ? plural('minimarts.offerCount', live) : t('minimarts.noOffersTag');
    tag.className = `bstore-tag ${live ? 'is-live' : 'is-off'}`;

    if (owner && !shopsBtn) {
      shopsBtn = el('button', 'bstore-search mm-shops-btn', t('minimarts.shops'));
      shopsBtn.type = 'button';
      shopsBtn.setAttribute('aria-expanded', 'false');
      shopsBtn.addEventListener('click', () => setOpen(manager.hidden));
      head.append(shopsBtn);
    } else if (!owner && shopsBtn) {
      shopsBtn.remove();
      shopsBtn = null;
      setOpen(false);
    }
    if (owner) renderManager(manager, data, refresh);
    if (owner && !data.shops.length) setOpen(true);

    if (!data.shops.length) {
      body.replaceChildren(line('div', 'bstore-empty', t('minimarts.noShops')));
      return;
    }
    const seen = ensureSeen(data.generatedAt);
    body.replaceChildren(...orderShops(data).map(({ shop, offers }) => shopTile(shop, offers, seen)));
    paintBadge(data);
  };

  const refresh = async () => {
    try {
      render(await loadMinimarts());
    } catch {
      body.replaceChildren(line('div', 'bstore-empty', t('minimarts.error')));
    }
  };

  if (cache) render(cache);
  refresh();
  section.refreshMinimarts = refresh; // every later visit to the page
  return section;
}

// A shop's tile, Browse's brand tile as is: the shop's picture with its offer
// count in the corner (accent when some are new to this browser), the name
// under it. A shop with nothing live stays, dimmed and without a count.
function shopTile(shop, offers, seen) {
  const name = shopName(shop, shop.username);
  const tile = el('a', 'browse-brand-pill mm-shop-pill');
  tile.href = `#/brochures/minimarts/${encodeURIComponent(shop.username)}`;
  tile.title = name;
  tile.addEventListener('click', () => {
    openedFromList = true;
  });
  const icon = el('span', 'browse-brand-icon');
  icon.append(shopIcon(shop));
  if (offers.length) {
    const fresh = offers.filter((o) => isNew(o, seen)).length;
    const count = el('span', `browse-brand-count${fresh ? ' is-new' : ''}`, `📄 ${offers.length}`);
    count.title = fresh ? t('minimarts.newCount', { count: fresh }) : plural('minimarts.offerCount', offers.length);
    count.setAttribute('aria-label', count.title);
    icon.append(count);
  } else {
    tile.classList.add('is-quiet');
    tile.title = `${name} · ${t('minimarts.noOffersTag')}`;
  }
  tile.append(icon, line('span', 'browse-brand-name', name));
  return tile;
}

// --- a shop's page: Browse's brand header, then all its current offers ----------------
export async function renderMinimartShop(container, username) {
  const head = el('div', 'browse-list-head');
  const back = el('a', 'browse-back', `‹ ${t('minimarts.back')}`);
  back.href = '#/brochures';
  back.addEventListener('click', (e) => {
    if (openedFromList) {
      e.preventDefault();
      openedFromList = false;
      history.back();
    }
  });
  head.append(back);
  const view = el('div', 'mm-shop-body');
  container.replaceChildren(head, view);
  if (!cache) view.append(el('div', 'mm-loading', t('minimarts.loading')));

  let data = cache;
  try {
    data = await loadMinimarts();
  } catch {
    if (!data) {
      view.replaceChildren(line('div', 'bstore-empty', t('minimarts.error')));
      return;
    }
  }
  if (minimartShopFromHash() !== username) return; // the owner moved on meanwhile
  const shop = data.shops.find((s) => s.username === username);
  if (!shop) {
    view.replaceChildren(line('div', 'bstore-empty', t('minimarts.shopGone')));
    return;
  }
  const offers = data.offers.filter((o) => o.username === username);
  const seen = ensureSeen(data.generatedAt);

  // The shop's name over its cards (owner, 2026-11-05: "the card should be
  // presented as they are .. no flyer style no categorization .. nothing").
  const hero = el('div', 'browse-brand-hero');
  const meta = el('div', 'browse-brand-meta');
  meta.append(line('h1', null, shopName(shop, username)));
  const facts = [offers.length ? plural('minimarts.offerCount', offers.length) : t('minimarts.noOffersTag')];
  if (shop.address) facts.push(shop.address);
  meta.append(line('p', 'browse-brand-stats', facts.join(' · ')));
  hero.append(shopIcon(shop), meta);

  const grid = el('div', 'mm-cards');
  for (const offer of offers) grid.append(offerCard(offer, isNew(offer, seen)));
  view.replaceChildren(hero, offers.length ? grid : line('div', 'bstore-empty', t('minimarts.shopEmpty')));

  // Opened: this shop's offers are no longer new (the cards keep their mark
  // until the next visit), and the tab badge drops them.
  markShopSeen(username, data.generatedAt);
  paintBadge(data);
}

function offerCard(offer, fresh) {
  const card = el('article', 'mm-card');
  const pic = el('button', 'mm-pic');
  pic.type = 'button';
  pic.setAttribute('aria-label', t('minimarts.openPicture'));
  if (offer.image) {
    const img = el('img');
    img.src = `${ENGINE_BASE}${offer.image}`;
    img.alt = offer.name || '';
    img.loading = 'lazy';
    img.decoding = 'async';
    pic.append(img);
    pic.addEventListener('click', () => openPicture(`${ENGINE_BASE}${offer.image}`, offer.name));
  } else {
    pic.disabled = true;
  }
  if (fresh) pic.append(el('span', 'mm-new', t('minimarts.new')));
  if (offer.reposts > 0) pic.append(el('span', 'mm-again', t('minimarts.postedAgain')));

  const info = el('div', 'mm-info');
  const priceRow = el('div', 'mm-price-row');
  const price = el('span', 'mm-price');
  price.append(el('b', null, money(offer.price)), el('small', null, ` ${t('minimarts.sar')}`));
  priceRow.append(price);
  if (offer.wasPrice) priceRow.append(el('s', 'mm-was', money(offer.wasPrice)));
  info.append(priceRow);
  if (offer.count > 1) {
    // "3 حبات" is the shop's own words: isolated, so an English line around
    // it keeps its order.
    const deal = line('div', 'mm-deal');
    const [before, after] = t('minimarts.deal', { qty: '\u0000', each: money(offer.perUnit) }).split('\u0000');
    deal.append(before || '', el('bdi', null, `${offer.count} ${offer.unit || plural('minimarts.piece', offer.count)}`), after || '');
    info.append(deal);
  }
  info.append(el('div', 'mm-name', [offer.name, offer.size].filter(Boolean).join(' · ') || t('minimarts.unnamed')));
  const when = ago(offer.lastPostedAt || offer.postedAt);
  if (when) info.append(line('div', 'mm-meta', when));
  card.append(pic, info);
  return card;
}

function openPicture(src, alt) {
  const dialog = el('dialog', 'mm-viewer');
  const img = el('img');
  img.src = src;
  img.alt = alt || '';
  const close = el('button', 'mm-viewer-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', t('minimarts.close'));
  dialog.append(img, close);
  const done = () => dialog.close();
  close.addEventListener('click', done);
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) done();
  });
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

// --- the shop list (owner mode only) ---------------------------------------------------
const STATUS_KEYS = new Set(['ok', 'blocked', 'not_public', 'not_found', 'error']);

function renderManager(manager, data, refresh) {
  manager.replaceChildren();
  const list = el('ul', 'mm-shop-list');
  for (const shop of data.shops) {
    const row = el('li', 'mm-shop-row');
    if (shop.picture) {
      const avatar = el('img', 'mm-avatar');
      avatar.src = shop.picture;
      avatar.alt = '';
      avatar.loading = 'lazy';
      avatar.referrerPolicy = 'no-referrer';
      row.append(avatar);
    } else {
      row.append(el('span', 'mm-avatar mm-avatar-empty', shopName(shop, shop.username).slice(0, 1)));
    }
    const text = el('div', 'mm-shop-text');
    const title = el('div', 'mm-shop-title');
    title.append(el('bdi', null, shopName(shop, shop.username)));
    text.append(title);
    const status = STATUS_KEYS.has(shop.status) ? shop.status : 'pending';
    const parts = [t(`minimarts.status.${status}`)];
    if (shop.lastPostAt) parts.push(t('minimarts.lastPost', { when: ago(shop.lastPostAt) }));
    text.append(line('div', `mm-shop-status is-${status}`, parts.join(' · ')));
    const remove = el('button', 'mm-remove', t('minimarts.remove'));
    remove.type = 'button';
    remove.setAttribute('aria-label', t('minimarts.removeShop', { shop: shopName(shop, shop.username) }));
    remove.addEventListener('click', async () => {
      remove.disabled = true;
      try {
        const res = await fetch(`${ENGINE_BASE}/minimarts/shops?username=${encodeURIComponent(shop.username)}`, { method: 'DELETE' });
        if (!res.ok && res.status !== 404) throw new Error(String(res.status));
        await refresh();
      } catch {
        remove.disabled = false;
      }
    });
    row.append(text, remove);
    list.append(row);
  }
  if (data.shops.length) manager.append(list);

  const form = el('form', 'mm-add');
  const input = el('input', 'mm-add-input');
  input.type = 'text';
  input.inputMode = 'url';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.dir = 'ltr';
  input.placeholder = t('minimarts.addPlaceholder');
  input.setAttribute('aria-label', t('minimarts.addLabel'));
  const add = el('button', 'mm-add-btn', t('minimarts.add'));
  add.type = 'submit';
  const note = line('p', 'mm-add-note', t('minimarts.addHelp'));
  note.setAttribute('aria-live', 'polite');
  form.append(input, add);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const link = input.value.trim();
    if (!link) return;
    add.disabled = true;
    note.className = 'mm-add-note';
    note.textContent = t('minimarts.adding');
    try {
      const res = await fetch(`${ENGINE_BASE}/minimarts/shops`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        const key = ['bad_link', 'not_found', 'not_public', 'too_many_shops'].includes(out.error) ? out.error : 'failed';
        note.className = 'mm-add-note is-error';
        note.textContent = t(`minimarts.addError.${key}`, { max: out.max ?? '' });
        return;
      }
      input.value = '';
      await refresh();
      // refresh() rebuilt this panel; say what happened in the new one.
      const fresh = document.querySelector('.mm-add-note');
      if (fresh) {
        const shop = out.shop?.title || out.shop?.username || link;
        fresh.textContent = out.status === 'blocked'
          ? t('minimarts.addedBlocked', { shop })
          : plural('minimarts.added', out.queued || 0, { shop });
      }
    } catch {
      note.className = 'mm-add-note is-error';
      note.textContent = t('minimarts.addError.failed');
    } finally {
      add.disabled = false;
    }
  });

  const off = el('button', 'mm-owner-off', t('minimarts.ownerOff'));
  off.type = 'button';
  off.addEventListener('click', () => {
    writeLocal(OWNER_KEY, null);
    if (cache) refresh();
  });
  manager.append(form, note, off);
}
