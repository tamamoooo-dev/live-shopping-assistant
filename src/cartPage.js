// cartPage.js — the #/cart page: the flyer products picked while browsing
// brochures, grouped by store (that's how you actually shop them), with
// quantity steppers, per-store subtotals and a grand total. Purely local
// (src/cart.js is localStorage) — renders instantly, works offline. A shared
// link (#/cart?l=…, cartLink.js) shows the sender's cart the same way.
//
// "View flyer" re-opens the in-app viewer ON THE PRODUCT'S OWN PAGE when the
// brochure is still held (brochureId + pageIndex snapshotted at add time);
// once an edition expires out of the engine the link simply hides.

import { cartItems, setQty, removeFromCart, clearCart, togglePurchased, importItems, updateItem, CART_EVENT } from './cart.js';
import { loadBrochures, loadBrochurePages, loadHotspots, assetUrl, storeLabel, storeColor } from './brochure.js';
import { openBrochureViewer } from './viewer.js?v=20260924.2';
import { cropFromPage } from './viewer/sheet.js?v=20260924.2';
import { t, tn, getLang } from './i18n.js';
import { shareLink } from './cartShare.js';
import { cartLink, linkPayload, unpackList } from './cartLink.js';
import { mountQuickAdd } from './cartQuickAdd.js';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
const fmt = (n) => (Number.isInteger(n) ? String(n) : Number(n).toFixed(2));

// A quick-add line (cartQuickAdd.js) has no store and no price.
const hasPrice = (it) => typeof it.price === 'number' && Number.isFinite(it.price);
const itemName = (it) =>
  (getLang() === 'ar' ? it.nameAr || it.name : it.name || it.nameAr) || t('cart.flyerProduct');

let listRoot = null;
let sharedRoot = null;

export function initCartPage() {
  const root = document.getElementById('cart-root');
  if (!root) return;
  if (!listRoot) {
    // The Quick add panel is built once and never re-rendered, so typing and
    // an open category survive cart changes; only the list below redraws.
    root.removeAttribute('aria-live');
    root.replaceChildren();
    sharedRoot = document.createElement('div');
    sharedRoot.className = 'cart-shared-root';
    root.append(sharedRoot);
    mountQuickAdd(root);
    listRoot = document.createElement('div');
    listRoot.className = 'cart-list';
    listRoot.setAttribute('aria-live', 'polite');
    root.append(listRoot);
    // Re-render on any cart change while the page is visible (badge and page
    // share the one event; re-rendering a hidden page is harmless but skipped).
    window.addEventListener(CART_EVENT, () => {
      if (!document.getElementById('page-cart').hidden) render(listRoot);
    });
  }
  showShared(sharedRoot, linkPayload());
  render(listRoot);
}

// --- a shared cart, opened from a link (#/cart?l=…) -------------------------------
// The sender's cart page as they see it — same store groups, cards, pictures
// and totals — in place of the visitor's own cart until they add it or close
// it. Nothing is added without their tap.
let sharedRevision = 0;
async function showShared(box, packed) {
  const current = ++sharedRevision;
  const root = box.parentElement;
  if (!packed) {
    root.classList.remove('is-shared');
    return box.replaceChildren();
  }
  let items = null;
  try {
    items = await unpackList(packed);
  } catch {
    /* a cut or edited link: say so below */
  }
  if (current !== sharedRevision) return;
  const done = () => {
    root.classList.remove('is-shared');
    box.replaceChildren();
    // Back to the plain cart address, so a reload does not offer it again.
    history.replaceState(null, '', `${location.pathname}${location.search}#/cart`);
  };
  if (!items) {
    root.classList.remove('is-shared');
    box.innerHTML = `
      <section class="cart-shared is-bad" role="alert">
        <p>${esc(t('cart.shared.bad'))}</p>
        <div class="cart-shared-actions"><button type="button" class="cart-shared-close">${esc(t('cart.shared.close'))}</button></div>
      </section>`;
    box.querySelector('.cart-shared-close').addEventListener('click', done);
    return;
  }
  // A crop names a page on this app's own engine (cartLink.js checked the key).
  for (const it of items) {
    if (it.crop) it.crop = { src: assetUrl(it.crop.key), x: it.crop.x, y: it.crop.y, w: it.crop.w, h: it.crop.h };
  }
  const { sections, total } = listParts(items, { readOnly: true });
  box.innerHTML = `
    <section class="cart-shared-head" aria-labelledby="cart-shared-title">
      <h2 id="cart-shared-title" class="cart-shared-title">📩 ${esc(t('cart.shared.title'))}</h2>
      <p class="cart-shared-note">${esc(t('cart.shared.note'))}</p>
    </section>
    <div class="cart-toolbar">
      <span class="cart-total">${total}</span>
      <span class="cart-toolbar-actions">
        <button type="button" class="cart-shared-add">${esc(t('cart.shared.addAll'))}</button>
        <button type="button" class="cart-shared-close">${esc(t('cart.shared.close'))}</button>
      </span>
    </div>
    ${sections}`;
  root.classList.add('is-shared');

  // Pictures cut from flyer pages: the same cut from the same page as on the
  // sender's phone.
  const pics = items.map((it) =>
    it.image || !it.crop
      ? null
      : cropFromPage(it.crop.src, it.crop, 220).then((url) => {
          if (!url) return;
          it.image = url;
          const row = [...box.querySelectorAll('.cart-item')].find((r) => r.dataset.id === it.id);
          if (row) row.querySelector('.cart-thumb').innerHTML = `<img src="${esc(url)}" alt="">`;
        }),
  );
  for (const row of box.querySelectorAll('.cart-item')) {
    const item = items.find((it) => it.id === row.dataset.id);
    const flyerBtn = row.querySelector('.cart-flyer');
    if (flyerBtn) flyerBtn.addEventListener('click', () => openFlyer(item, flyerBtn));
  }
  box.querySelector('.cart-shared-close').addEventListener('click', done);
  const addBtn = box.querySelector('.cart-shared-add');
  addBtn.addEventListener('click', async () => {
    addBtn.disabled = true;
    await Promise.all(pics); // each gives up after a few seconds
    importItems(items);
    done();
    box.innerHTML = `<p class="cart-shared-added" role="status">${esc(t('cart.shared.added'))}</p>`;
    setTimeout(() => {
      if (box.firstElementChild?.classList.contains('cart-shared-added')) box.replaceChildren();
    }, 2500);
  });
}

function render(root) {
  const items = cartItems();
  if (!items.length) {
    root.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty-icon" aria-hidden="true">🛒</div>
        <h2>${esc(t('cart.empty'))}</h2>
        <p>${esc(t('cart.emptyHint'))}</p>
        <a class="cart-browse" href="#/brochures">${esc(t('cart.browse'))}</a>
      </div>`;
    return;
  }

  const { sections, total } = listParts(items);
  root.innerHTML = `
    <div class="cart-toolbar">
      <span class="cart-total">${total}</span>
      <span class="cart-toolbar-actions">
        <button type="button" class="cart-share" aria-label="${esc(t('cart.shareAria'))}">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3"/><path d="M7.5 7.5L12 3l4.5 4.5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>
          <span class="cart-share-label">${esc(t('cart.share'))}</span>
        </button>
        <button type="button" class="cart-clear">${esc(t('cart.clear'))}</button>
      </span>
    </div>
    ${sections}
    ${items.some(hasPrice) ? `<p class="cart-note">${esc(t('cart.note'))}</p>` : ''}`;

  root.querySelector('.cart-clear').addEventListener('click', () => {
    if (window.confirm(t('cart.confirmClear'))) clearCart();
  });
  // Packed now, so a tap goes straight to the share sheet (Safari wants the
  // share call close to the tap).
  const link = cartLink(items).catch(() => null);
  const shareBtn = root.querySelector('.cart-share');
  shareBtn.addEventListener('click', () => share(shareBtn, link));

  for (const row of root.querySelectorAll('.cart-item')) {
    const id = row.dataset.id;
    const item = items.find((it) => it.id === id);
    row.querySelector('.cart-minus').addEventListener('click', () => setQty(id, (item.qty || 1) - 1));
    row.querySelector('.cart-plus').addEventListener('click', () => setQty(id, (item.qty || 1) + 1));
    row.querySelector('.cart-remove').addEventListener('click', () => removeFromCart(id));
    row.querySelector('.cart-check').addEventListener('click', () => togglePurchased(id));
    const flyerBtn = row.querySelector('.cart-flyer');
    if (flyerBtn) flyerBtn.addEventListener('click', () => openFlyer(item, flyerBtn));
  }
  backfillCrops(items);
}

// The store groups and the total line — one layout for the visitor's own cart
// and for a shared one (readOnly: no ticking, steppers or remove).
function listParts(items, { readOnly = false } = {}) {
  // Group by store, keeping each group's items in recency order but sinking
  // purchased ones to the bottom (the live shopping list stays on top).
  // Quick-add lines (no store) form their own "My list" group.
  const groups = new Map();
  for (const it of items) {
    const key = it.store || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }

  // Totals count only what's still TO BUY — ticked items are already in the
  // trolley; the number you see is the number left to spend. Lines with no
  // price are counted, never guessed into the total.
  let grand = 0;
  let boughtCount = 0;
  let openCount = 0;
  let pricedOpen = 0;
  let unpriced = 0;
  const sections = [];
  for (const [store, list] of groups) {
    list.sort((a, b) => (a.purchased ? 1 : 0) - (b.purchased ? 1 : 0));
    const open = list.filter((it) => !it.purchased);
    boughtCount += list.length - open.length;
    let subtotal = 0;
    let groupCount = 0;
    for (const it of open) {
      const qty = it.qty || 1;
      groupCount += qty;
      if (hasPrice(it)) { subtotal += it.price * qty; pricedOpen += 1; }
      else unpriced += qty;
    }
    openCount += groupCount;
    grand += subtotal;
    const head = store
      ? `<span class="cart-store-chip" style="--chip:${storeColor(store)}">${esc(list[0].storeName || storeLabel(store))}</span>
          <span class="cart-store-sub">${fmt(subtotal)} SAR</span>`
      : `<span class="cart-store-chip cart-list-chip">${esc(t('cart.myList'))}</span>
          <span class="cart-store-sub">${groupCount ? esc(tn('cart.shareText.count', groupCount)) : ''}</span>`;
    sections.push(`
      <section class="cart-store">
        <header class="cart-store-head">
          ${head}
        </header>
        ${list.map((it) => itemRow(it, readOnly)).join('')}
      </section>`);
  }

  const total =
    (pricedOpen
      ? `${esc(t('cart.toBuy'))} <strong>${fmt(grand)} SAR</strong>`
      : `<strong>${esc(tn('cart.shareText.count', openCount))}</strong>`) +
    (pricedOpen && unpriced ? `<small class="cart-bought">· ${esc(tn('cart.unpriced', unpriced))}</small>` : '') +
    (boughtCount ? `<small class="cart-bought">· ${esc(tn('cart.inTrolley', boughtCount))}</small>` : '');
  return { sections: sections.join(''), total };
}

function itemRow(it, readOnly = false) {
  const qty = it.qty || 1;
  const name = itemName(it);
  const price = hasPrice(it)
    ? `<strong>${fmt(it.price)} ${esc(it.currency || 'SAR')}</strong>
          ${it.oldPrice ? `<s>${fmt(it.oldPrice)}</s>` : ''}
          ${qty > 1 ? `<span class="cart-line">× ${qty} = ${fmt(it.price * qty)}</span>` : ''}`
    : `<span class="cart-noprice">${esc(t('cart.noPrice'))}</span>`;
  const tick =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12.5l5 5L19.5 7"/></svg>';
  const check = readOnly
    ? `<span class="cart-check" aria-hidden="true">${tick}</span>`
    : `<button type="button" class="cart-check" role="checkbox" aria-checked="${!!it.purchased}"
        aria-label="${it.purchased ? 'Purchased — tap to un-tick' : 'Mark as purchased'}">${tick}</button>`;
  const qtyBox = readOnly
    ? `<div class="cart-qty is-static" aria-label="${esc(t('cart.quantity'))}"><span>× ${qty}</span></div>`
    : `<div class="cart-qty" aria-label="${esc(t('cart.quantity'))}">
        <button type="button" class="cart-minus" aria-label="${esc(t('cart.decrease'))}">−</button>
        <span>${qty}</span>
        <button type="button" class="cart-plus" aria-label="${esc(t('cart.increase'))}">+</button>
      </div>`;
  return `
    <article class="cart-item${it.purchased ? ' is-purchased' : ''}" data-id="${esc(it.id)}">
      ${check}
      <div class="cart-thumb">${
        it.image
          ? `<img src="${esc(it.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
          : `<span aria-hidden="true">${esc(it.icon || '🛒')}</span>`
      }</div>
      <div class="cart-info">
        <p class="cart-name" dir="auto">${esc(name)}</p>
        <p class="cart-price">
          ${price}
        </p>
        <p class="cart-actions">
          ${it.brochureId ? `<button type="button" class="cart-flyer">${esc(t('cart.viewFlyer'))}</button>` : ''}
          ${readOnly ? '' : `<button type="button" class="cart-remove">${esc(t('cart.remove'))}</button>`}
        </p>
      </div>
      ${qtyBox}
    </article>`;
}

// Share the cart as a link (cartLink.js) — the link alone: the phone's share
// sheet, else the link is copied, with a short "Link copied" on the button
// (the list root is aria-live, so it is announced).
async function share(btn, link) {
  btn.disabled = true;
  const url = await link;
  const result = url ? await shareLink({ title: t('cart.shareText.title'), url }) : 'failed';
  btn.disabled = false;
  if (result !== 'copied' && result !== 'failed') return;
  const label = btn.querySelector('.cart-share-label');
  label.textContent = t(result === 'copied' ? 'cart.copied' : 'cart.copyFailed');
  btn.classList.add(result === 'copied' ? 'is-copied' : 'is-failed');
  setTimeout(() => {
    if (!btn.isConnected) return;
    label.textContent = t('cart.share');
    btn.classList.remove('is-copied', 'is-failed');
  }, 1800);
}

// Older flyer items hold only their cut picture (a data: URL — far too big for
// a link). Find once where it sits on its flyer page, so a shared link can
// carry it; the item re-renders and the link is packed again.
const cropTried = new Set();
async function backfillCrops(items) {
  const todo = items.filter(
    (it) => it.brochureId && !it.crop && /^data:/.test(it.image || '') && !cropTried.has(it.id),
  );
  if (!todo.length) return;
  for (const it of todo) cropTried.add(it.id);
  try {
    const all = Object.values((await loadBrochures()) || {}).flat();
    for (const it of todo) {
      const b = all.find((x) => x && x.id === it.brochureId);
      if (!b) continue; // the edition has expired: no page to cut from
      const [hot, pages] = await Promise.all([loadHotspots(b), loadBrochurePages(b)]);
      if (!hot || !pages) continue;
      const isIt = (s) => String(s.offerId) === it.id || String(hot.offers[s.offerId]?.id) === it.id;
      let index = it.pageIndex;
      let spot = (hot.spotsByIndex.get(index) || []).find(isIt);
      if (!spot) {
        for (const [i, spots] of hot.spotsByIndex) {
          spot = spots.find(isIt);
          if (spot) { index = i; break; }
        }
      }
      const at = (pages.indices || []).indexOf(index);
      const src = at >= 0 ? pages.pages[at] : null;
      if (spot && src) updateItem(it.id, { crop: { src, x: spot.x, y: spot.y, w: spot.w, h: spot.h } });
    }
  } catch {
    /* no picture in the link for these; the rest still travels */
  }
}

// Re-open the held brochure on the item's page. Held-ness is checked at click
// time against the engine's current list (best-effort — an expired edition
// falls back to the item's flyer deep-link when it has one).
async function openFlyer(item, btn) {
  btn.disabled = true;
  try {
    const byStore = await loadBrochures();
    let found = null;
    for (const list of Object.values(byStore)) {
      found = (list || []).find((b) => b.id === item.brochureId);
      if (found) break;
    }
    if (found) {
      openBrochureViewer(found, storeLabel(found.store), { targetPageIndex: item.pageIndex });
    } else {
      btn.textContent = t('cart.flyerExpired');
    }
  } finally {
    btn.disabled = false;
  }
}
