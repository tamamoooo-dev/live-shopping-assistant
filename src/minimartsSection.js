// minimartsSection.js — the Mini marts block at the top of the Brochures page.
//
// Small shops post their offers on their public Snapchat story; the engine
// reads each followed shop's story every 2 hours, keeps only snaps with a
// printed price (an ad leaves nothing), and serves the offers here with the
// picture each price was read from (GET /minimarts). A deal a shop posts again
// on a later day is ONE card ("posted again"), never a second one.
//
// The owner manages the shop list here: add by Snapchat link or username,
// remove. "New" is per browser: offers first seen after this browser last
// looked at the Brochures page (localStorage), also shown as a badge on the
// Brochures tab.

import { t } from './i18n.js';

const ENGINE_BASE = 'https://brochure-engine.tamamoooo.workers.dev';
const SEEN_KEY = 'lsa.minimarts.seenAt.v1';
const OPEN_KEY = 'lsa.minimarts.shopsOpen.v1';

let cache = null; // { shops, offers, generatedAt }

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
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
    localStorage.setItem(key, value);
  } catch {
    /* private mode: "new" simply stays on */
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

// A line of UI text whose direction follows its own words (the app's pattern).
function line(tag, className, text) {
  const node = el(tag, className, text);
  node.dir = 'auto';
  return node;
}

function isNew(offer, seenAt) {
  return Boolean(seenAt) ? offer.createdAt > seenAt : false;
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

// Once at boot, so new mini mart offers show without opening the page. A
// first-ever visit counts nothing as new (no badge flood).
export async function refreshMinimartsBadge() {
  try {
    const data = await loadMinimarts();
    const seenAt = readLocal(SEEN_KEY);
    if (!seenAt) {
      writeLocal(SEEN_KEY, data.generatedAt);
      return;
    }
    setBadge(data.offers.filter((o) => isNew(o, seenAt)).length);
  } catch {
    /* the badge is a nicety; the page shows its own error */
  }
}

// --- the section ---------------------------------------------------------------------
export function createMinimartsSection() {
  const section = el('section', 'bstore mm');
  section.setAttribute('aria-label', t('minimarts.title'));

  const head = el('div', 'bstore-head');
  const icon = el('span', 'mm-icon');
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 4.5 4h15L21 9.5"/><path d="M3 9.5h18v1a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z"/><path d="M5 13v7h14v-7"/><path d="M10 20v-4h4v4"/></svg>';
  const name = el('span', 'bstore-name', t('minimarts.title'));
  const tag = line('span', 'bstore-tag');
  const shopsBtn = el('button', 'bstore-search mm-shops-btn', t('minimarts.shops'));
  shopsBtn.type = 'button';
  shopsBtn.setAttribute('aria-expanded', 'false');
  head.append(icon, name, tag, shopsBtn);

  const lead = line('p', 'mm-lead', t('minimarts.lead'));
  const manager = el('div', 'mm-manager');
  manager.hidden = true;
  const body = el('div', 'mm-body');
  body.append(el('div', 'mm-loading', t('minimarts.loading')));
  section.append(head, lead, manager, body);

  const setOpen = (open) => {
    manager.hidden = !open;
    shopsBtn.setAttribute('aria-expanded', String(open));
    writeLocal(OPEN_KEY, open ? '1' : '0');
  };
  shopsBtn.addEventListener('click', () => setOpen(manager.hidden));

  const render = (data) => {
    const seenAt = readLocal(SEEN_KEY);
    tag.textContent = data.offers.length ? plural('minimarts.offerCount', data.offers.length) : t('minimarts.noOffersTag');
    tag.className = `bstore-tag ${data.offers.length ? 'is-live' : 'is-off'}`;
    renderManager(manager, data, refresh);
    renderOffers(body, data, seenAt);
    // Looked at: the badge clears; the cards keep their "new" mark until the
    // next visit.
    writeLocal(SEEN_KEY, data.generatedAt);
    setBadge(0);
    if (!data.shops.length) setOpen(true);
    else if (readLocal(OPEN_KEY) === '1') setOpen(true);
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

function renderOffers(body, data, seenAt) {
  if (!data.offers.length) {
    body.replaceChildren(line('div', 'bstore-empty', data.shops.length ? t('minimarts.empty') : t('minimarts.noShops')));
    return;
  }
  const shops = new Map(data.shops.map((s) => [s.username, s]));
  const grid = el('div', 'mm-cards');
  for (const offer of data.offers) grid.append(offerCard(offer, shops.get(offer.username), isNew(offer, seenAt)));
  body.replaceChildren(grid);
}

function offerCard(offer, shop, fresh) {
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
    const [before, after] = t('minimarts.deal', { qty: ' ', each: money(offer.perUnit) }).split(' ');
    deal.append(before || '', el('bdi', null, `${offer.count} ${offer.unit || plural('minimarts.piece', offer.count)}`), after || '');
    info.append(deal);
  }
  const title = el('div', 'mm-name', [offer.name, offer.size].filter(Boolean).join(' · ') || t('minimarts.unnamed'));
  info.append(title);
  const meta = line('div', 'mm-meta');
  meta.append(el('bdi', 'mm-shop', shop?.title || offer.username));
  const when = ago(offer.lastPostedAt || offer.postedAt);
  if (when) meta.append(' · ', el('span', 'mm-when', when));
  info.append(meta);
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

// --- the shop list ------------------------------------------------------------------------
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
      row.append(el('span', 'mm-avatar mm-avatar-empty', (shop.title || shop.username).slice(0, 1)));
    }
    const text = el('div', 'mm-shop-text');
    const title = el('div', 'mm-shop-title');
    title.append(el('bdi', null, shop.title || shop.username));
    text.append(title);
    const status = STATUS_KEYS.has(shop.status) ? shop.status : 'pending';
    const parts = [t(`minimarts.status.${status}`)];
    if (shop.lastPostAt) parts.push(t('minimarts.lastPost', { when: ago(shop.lastPostAt) }));
    text.append(line('div', `mm-shop-status is-${status}`, parts.join(' · ')));
    const remove = el('button', 'mm-remove', t('minimarts.remove'));
    remove.type = 'button';
    remove.setAttribute('aria-label', t('minimarts.removeShop', { shop: shop.title || shop.username }));
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
        fresh.textContent = out.status === 'blocked'
          ? t('minimarts.addedBlocked', { shop: out.shop?.title || out.shop?.username || link })
          : plural('minimarts.added', out.queued || 0, { shop: out.shop?.title || out.shop?.username || link });
      }
    } catch {
      note.className = 'mm-add-note is-error';
      note.textContent = t('minimarts.addError.failed');
    } finally {
      add.disabled = false;
    }
  });
  manager.append(form, note);
}
