// cartPage.js — the #/cart page: the flyer products picked while browsing
// brochures, grouped by store (that's how you actually shop them), with
// quantity steppers, per-store subtotals and a grand total. Purely local
// (src/cart.js is localStorage) — renders instantly, works offline.
//
// "View flyer" re-opens the in-app viewer ON THE PRODUCT'S OWN PAGE when the
// brochure is still held (brochureId + pageIndex snapshotted at add time);
// once an edition expires out of the engine the link simply hides.

import { cartItems, setQty, removeFromCart, clearCart, CART_EVENT } from './cart.js';
import { loadBrochures, storeLabel, storeColor } from './brochure.js';
import { openBrochureViewer } from './viewer.js';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
const fmt = (n) => (Number.isInteger(n) ? String(n) : Number(n).toFixed(2));

let wired = false;

export function initCartPage() {
  const root = document.getElementById('cart-root');
  if (!root) return;
  if (!wired) {
    wired = true;
    // Re-render on any cart change while the page is visible (badge and page
    // share the one event; re-rendering a hidden page is harmless but skipped).
    window.addEventListener(CART_EVENT, () => {
      if (!document.getElementById('page-cart').hidden) render(root);
    });
  }
  render(root);
}

function render(root) {
  const items = cartItems();
  if (!items.length) {
    root.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty-icon" aria-hidden="true">🛒</div>
        <h2>Your cart is empty</h2>
        <p>Open a brochure and tap any product to add it here.</p>
        <a class="cart-browse" href="#/brochures">Browse brochures</a>
      </div>`;
    return;
  }

  // Group by store, keeping each group's items in recency order.
  const groups = new Map();
  for (const it of items) {
    if (!groups.has(it.store)) groups.set(it.store, []);
    groups.get(it.store).push(it);
  }

  let grand = 0;
  const sections = [];
  for (const [store, list] of groups) {
    const subtotal = list.reduce((n, it) => n + it.price * (it.qty || 1), 0);
    grand += subtotal;
    sections.push(`
      <section class="cart-store">
        <header class="cart-store-head">
          <span class="cart-store-chip" style="--chip:${storeColor(store)}">${esc(storeLabel(store))}</span>
          <span class="cart-store-sub">${fmt(subtotal)} SAR</span>
        </header>
        ${list.map((it) => itemRow(it)).join('')}
      </section>`);
  }

  root.innerHTML = `
    <div class="cart-toolbar">
      <span class="cart-total">Total <strong>${fmt(grand)} SAR</strong></span>
      <button type="button" class="cart-clear">Clear cart</button>
    </div>
    ${sections.join('')}
    <p class="cart-note">Flyer prices are machine-extracted from this week's brochures — the printed flyer prevails at the till.</p>`;

  root.querySelector('.cart-clear').addEventListener('click', () => {
    if (window.confirm('Remove everything from the cart?')) clearCart();
  });

  for (const row of root.querySelectorAll('.cart-item')) {
    const id = row.dataset.id;
    const item = items.find((it) => it.id === id);
    row.querySelector('.cart-minus').addEventListener('click', () => setQty(id, (item.qty || 1) - 1));
    row.querySelector('.cart-plus').addEventListener('click', () => setQty(id, (item.qty || 1) + 1));
    row.querySelector('.cart-remove').addEventListener('click', () => removeFromCart(id));
    const flyerBtn = row.querySelector('.cart-flyer');
    if (flyerBtn) flyerBtn.addEventListener('click', () => openFlyer(item, flyerBtn));
  }
}

function itemRow(it) {
  const qty = it.qty || 1;
  const line = it.price * qty;
  const name = it.name || it.nameAr || 'Flyer product';
  return `
    <article class="cart-item" data-id="${esc(it.id)}">
      <div class="cart-thumb">${
        it.image ? `<img src="${esc(it.image)}" alt="" loading="lazy">` : '<span aria-hidden="true">🛒</span>'
      }</div>
      <div class="cart-info">
        <p class="cart-name" dir="auto">${esc(name)}</p>
        <p class="cart-price">
          <strong>${fmt(it.price)} ${esc(it.currency || 'SAR')}</strong>
          ${it.oldPrice ? `<s>${fmt(it.oldPrice)}</s>` : ''}
          ${qty > 1 ? `<span class="cart-line">× ${qty} = ${fmt(line)}</span>` : ''}
        </p>
        <p class="cart-actions">
          ${it.brochureId ? '<button type="button" class="cart-flyer">View flyer</button>' : ''}
          <button type="button" class="cart-remove">Remove</button>
        </p>
      </div>
      <div class="cart-qty" aria-label="Quantity">
        <button type="button" class="cart-minus" aria-label="Decrease quantity">−</button>
        <span>${qty}</span>
        <button type="button" class="cart-plus" aria-label="Increase quantity">+</button>
      </div>
    </article>`;
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
    } else if (item.sourceUrl) {
      window.open(item.sourceUrl, '_blank', 'noopener');
    } else {
      btn.textContent = 'Flyer expired';
    }
  } finally {
    btn.disabled = false;
  }
}
