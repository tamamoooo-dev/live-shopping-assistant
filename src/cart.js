// cart.js — the shopping cart, a PURELY LOCAL feature (localStorage, no
// backend): flyer products the user picks while browsing brochures, kept as a
// per-store shopping list with quantities and a running total. It never talks
// to the engine — a cart item snapshots everything the cart page needs at
// add-time, so the page renders instantly and offline.
//
// Cross-page coupling follows the app's one pattern: a CustomEvent
// ('supersearch:cart-changed') lets the nav badge and the cart page react to
// adds/removes without imports in either direction.

const KEY = 'lsa.cart.v1';
export const CART_EVENT = 'supersearch:cart-changed';

function read() {
  try {
    const items = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function write(items) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage full/blocked — the in-memory event still updates the UI */
  }
  window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: { count: countOf(items) } }));
}

const countOf = (items) => items.reduce((n, it) => n + (it.qty || 1), 0);

// Newest first for display.
export function cartItems() {
  return read().slice().sort((a, z) => (z.addedAt || '').localeCompare(a.addedAt || ''));
}

export function cartCount() {
  return countOf(read());
}

export function inCart(id) {
  return read().some((it) => it.id === id);
}

// item: { id, store, name, nameAr, size, price, oldPrice, currency, image,
//         sourceUrl, brochureId, pageIndex, validTo }
// (`size` is the label the card showed; older items and mini-mart items,
// whose name already carries it, have none. `crop` — { src, x, y, w, h }, the
// flyer page and box a data: picture was cut from — lets a shared link carry
// that picture as its place on the page; see cartLink.js.)
// Same id twice = bump quantity (the natural "add again" gesture).
export function addToCart(item) {
  if (!item || !item.id) return;
  const items = read();
  const held = items.find((it) => it.id === item.id);
  if (held) held.qty = (held.qty || 1) + 1;
  else items.push({ ...item, qty: 1, addedAt: new Date().toISOString() });
  write(items);
}

// A shared list (cartLink.js) added in one go: an item already in the cart
// gets the shared quantity on top; the rest are added as they came.
export function importItems(list) {
  const items = read();
  const now = Date.now();
  list.forEach((item, i) => {
    if (!item || !item.id) return;
    const qty = Math.max(1, Math.min(99, Math.round(item.qty) || 1));
    const held = items.find((it) => it.id === item.id);
    if (held) held.qty = Math.min(99, (held.qty || 1) + qty);
    // Newest first on the page: keep the shared order by stepping back in time.
    else items.push({ ...item, qty, addedAt: new Date(now - i).toISOString() });
  });
  write(items);
}

// Fill in fields on a held item (e.g. a picture's crop box found later).
export function updateItem(id, fields) {
  const items = read();
  const item = items.find((it) => it.id === id);
  if (!item) return;
  Object.assign(item, fields);
  write(items);
}

export function setQty(id, qty) {
  const items = read();
  const item = items.find((it) => it.id === id);
  if (!item) return;
  item.qty = Math.max(0, Math.min(99, Math.round(qty) || 0));
  write(item.qty === 0 ? items.filter((it) => it.id !== id) : items);
}

export function removeFromCart(id) {
  write(read().filter((it) => it.id !== id));
}

// Mark an item bought while shopping (strike-through on the cart page; the
// running total counts only what's still to buy). Toggling back un-buys.
export function togglePurchased(id) {
  const items = read();
  const item = items.find((it) => it.id === id);
  if (!item) return;
  item.purchased = !item.purchased;
  write(items);
}

export function clearCart() {
  write([]);
}
