// cartPage.js — the #/cart page: the flyer products picked while browsing
// brochures, grouped by store (that's how you actually shop them), with
// quantity steppers, per-store subtotals and a grand total. Purely local
// (src/cart.js is localStorage) — renders instantly, works offline.
//
// "View flyer" re-opens the in-app viewer ON THE PRODUCT'S OWN PAGE when the
// brochure is still held (brochureId + pageIndex snapshotted at add time);
// once an edition expires out of the engine the link simply hides.

import { cartItems, setQty, removeFromCart, clearCart, togglePurchased, importItems, CART_EVENT } from './cart.js';
import { loadBrochures, storeLabel, storeColor } from './brochure.js';
import { openBrochureViewer } from './viewer.js?v=20260924.2';
import { t, tn, getLang } from './i18n.js';
import { cartSummary, shareLink } from './cartShare.js';
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

const storeNameOf = (it) => it.storeName || storeLabel(it.store);

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

// --- a shared list, opened from a link (#/cart?l=…) ------------------------------
// Shown above the cart until the visitor adds it or closes it; nothing is
// added without their tap.
let sharedRevision = 0;
async function showShared(box, packed) {
  const current = ++sharedRevision;
  if (!packed) return box.replaceChildren();
  let items = null;
  try {
    items = await unpackList(packed);
  } catch {
    /* a cut or edited link: say so below */
  }
  if (current !== sharedRevision) return;
  const done = () => {
    box.replaceChildren();
    // Back to the plain cart address, so a reload does not offer it again.
    history.replaceState(null, '', `${location.pathname}${location.search}#/cart`);
  };
  if (!items) {
    box.innerHTML = `
      <section class="cart-shared is-bad" role="alert">
        <p>${esc(t('cart.shared.bad'))}</p>
        <div class="cart-shared-actions"><button type="button" class="cart-shared-close">${esc(t('cart.shared.close'))}</button></div>
      </section>`;
    box.querySelector('.cart-shared-close').addEventListener('click', done);
    return;
  }
  const summary = cartSummary(items, { storeName: storeNameOf });
  box.innerHTML = `
    <section class="cart-shared" aria-labelledby="cart-shared-title">
      <h2 id="cart-shared-title" class="cart-shared-title">📩 ${esc(t('cart.shared.title'))}</h2>
      ${summary.groups.map((g) => `
        <div class="cart-shared-group">
          <h3 dir="auto">${esc(g.label)}</h3>
          <ul>${g.lines.map((line) => `<li dir="auto">${esc(line)}</li>`).join('')}</ul>
        </div>`).join('')}
      <p class="cart-shared-sum">${summary.footer.map(esc).join('<br>')}</p>
      <p class="cart-shared-note">${esc(t('cart.shared.note'))}</p>
      <div class="cart-shared-actions">
        <button type="button" class="cart-shared-add">${esc(t('cart.shared.addAll'))}</button>
        <button type="button" class="cart-shared-close">${esc(t('cart.shared.close'))}</button>
      </div>
    </section>`;
  box.querySelector('.cart-shared-close').addEventListener('click', done);
  box.querySelector('.cart-shared-add').addEventListener('click', () => {
    importItems(items);
    done();
    box.innerHTML = `<p class="cart-shared-added" role="status">${esc(t('cart.shared.added'))}</p>`;
    setTimeout(() => { if (box.firstElementChild?.classList.contains('cart-shared-added')) box.replaceChildren(); }, 2500);
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
        ${list.map((it) => itemRow(it)).join('')}
      </section>`);
  }

  const total = pricedOpen
    ? `${esc(t('cart.toBuy'))} <strong>${fmt(grand)} SAR</strong>`
    : `<strong>${esc(tn('cart.shareText.count', openCount))}</strong>`;
  root.innerHTML = `
    <div class="cart-toolbar">
      <span class="cart-total">${total}${
        pricedOpen && unpriced ? `<small class="cart-bought">· ${esc(tn('cart.unpriced', unpriced))}</small>` : ''
      }${
        boughtCount ? `<small class="cart-bought">· ${esc(tn('cart.inTrolley', boughtCount))}</small>` : ''
      }</span>
      <span class="cart-toolbar-actions">
        <button type="button" class="cart-share" aria-label="${esc(t('cart.shareAria'))}">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3"/><path d="M7.5 7.5L12 3l4.5 4.5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>
          <span class="cart-share-label">${esc(t('cart.share'))}</span>
        </button>
        <button type="button" class="cart-clear">${esc(t('cart.clear'))}</button>
      </span>
    </div>
    ${sections.join('')}
    ${items.some(hasPrice) ? `<p class="cart-note">${esc(t('cart.note'))}</p>` : ''}`;

  root.querySelector('.cart-clear').addEventListener('click', () => {
    if (window.confirm(t('cart.confirmClear'))) clearCart();
  });
  // Packed now, so a tap goes straight to the share sheet (Safari wants the
  // share call close to the tap).
  const link = cartLink(items).catch(() => null);
  const shareBtn = root.querySelector('.cart-share');
  shareBtn.addEventListener('click', () => share(shareBtn, link, items));

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
}

function itemRow(it) {
  const qty = it.qty || 1;
  const name = itemName(it);
  const price = hasPrice(it)
    ? `<strong>${fmt(it.price)} ${esc(it.currency || 'SAR')}</strong>
          ${it.oldPrice ? `<s>${fmt(it.oldPrice)}</s>` : ''}
          ${qty > 1 ? `<span class="cart-line">× ${qty} = ${fmt(it.price * qty)}</span>` : ''}`
    : `<span class="cart-noprice">${esc(t('cart.noPrice'))}</span>`;
  return `
    <article class="cart-item${it.purchased ? ' is-purchased' : ''}" data-id="${esc(it.id)}">
      <button type="button" class="cart-check" role="checkbox" aria-checked="${!!it.purchased}"
        aria-label="${it.purchased ? 'Purchased — tap to un-tick' : 'Mark as purchased'}">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12.5l5 5L19.5 7"/></svg>
      </button>
      <div class="cart-thumb">${
        it.image ? `<img src="${esc(it.image)}" alt="" loading="lazy">` : `<span aria-hidden="true">${esc(it.icon || '🛒')}</span>`
      }</div>
      <div class="cart-info">
        <p class="cart-name" dir="auto">${esc(name)}</p>
        <p class="cart-price">
          ${price}
        </p>
        <p class="cart-actions">
          ${it.brochureId ? `<button type="button" class="cart-flyer">${esc(t('cart.viewFlyer'))}</button>` : ''}
          <button type="button" class="cart-remove">${esc(t('cart.remove'))}</button>
        </p>
      </div>
      <div class="cart-qty" aria-label="${esc(t('cart.quantity'))}">
        <button type="button" class="cart-minus" aria-label="${esc(t('cart.decrease'))}">−</button>
        <span>${qty}</span>
        <button type="button" class="cart-plus" aria-label="${esc(t('cart.increase'))}">+</button>
      </div>
    </article>`;
}

// Share the cart as a link (cartLink.js): the phone's share sheet, else the
// link is copied, with a short "Link copied" on the button (the list root is
// aria-live, so it is announced).
async function share(btn, link, items) {
  btn.disabled = true;
  const url = await link;
  const count = items.reduce((n, it) => n + (it.qty || 1), 0);
  const title = t('cart.shareText.title');
  const result = url
    ? await shareLink({ title, text: `🛒 ${title} — ${tn('cart.shareText.count', count)}`, url })
    : 'failed';
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
