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

// item: { id, store, name, nameAr, price, oldPrice, currency, image,
//         sourceUrl, brochureId, pageIndex, validTo }
// Same id twice = bump quantity (the natural "add again" gesture).
export function addToCart(item) {
  if (!item || !item.id) return;
  const items = read();
  const held = items.find((it) => it.id === item.id);
  if (held) held.qty = (held.qty || 1) + 1;
  else items.push({ ...item, qty: 1, addedAt: new Date().toISOString() });
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

export function clearCart() {
  write([]);
}
