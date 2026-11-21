// cartShare.js — the cart as a plain-text message, for the cart page's Share
// button: one line per item (name · size — price), grouped by store the way
// the page groups them, then the item count and the total. The text follows
// the app's language (i18n.js); nothing leaves the device except through the
// user's own share sheet or clipboard.
//
// Sharing prefers the Web Share API (the phone's share sheet: WhatsApp, SMS,
// mail …) and falls back to copying the text to the clipboard where there is
// none. No share link is built: the list never goes into a URL.

import { t, tn, getLang } from './i18n.js';

const fmt = (n) => (Number.isInteger(n) ? String(n) : Number(n).toFixed(2));

// A size as a comparable key, so "1 L", "1l" and "1 لتر" — or "30 pcs" and
// "30 حبة" — count as the same size already printed in the name. Only a unit
// right after a number is rewritten (kg before g, ml before l).
const sizeKey = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/(\d)\s*(كيلوجرام|كيلوغرام|كجم|كغ|كيلو|kg)/g, '$1kg')
    .replace(/(\d)\s*(ملليلتر|مل|ml)/g, '$1ml')
    .replace(/(\d)\s*(جرام|غرام|جم|غ|gm|g)/g, '$1g')
    .replace(/(\d)\s*(لتر|ل|l)/g, '$1l')
    .replace(/(\d)\s*(حبات|حبة|حبه|قطعة|قطع|pcs|pc)/g, '$1pcs')
    .replace(/\s+/g, '');

// The name already says this size: "3kg" inside "tide13kg" does not count.
function nameHasSize(name, size) {
  const hay = sizeKey(name);
  const key = sizeKey(size);
  for (let i = hay.indexOf(key); i !== -1; i = hay.indexOf(key, i + 1)) {
    if (i === 0 || !/[\d.]/.test(hay[i - 1])) return true;
  }
  return false;
}

function money(n, currency) {
  return `${fmt(n)} ${!currency || currency === 'SAR' ? t('cart.shareText.sar') : currency}`;
}

function itemLine(it, ar) {
  const qty = it.qty || 1;
  const name = (ar ? it.nameAr || it.name : it.name || it.nameAr) || t('cart.flyerProduct');
  // The size snapshotted at add time; skipped when the name already says it.
  const size = it.size && !nameHasSize(name, it.size) ? it.size : '';
  const price =
    qty > 1 ? `${qty} × ${fmt(it.price)} = ${money(it.price * qty, it.currency)}` : money(it.price, it.currency);
  return `${it.purchased ? '✓' : '•'} ${name}${size ? ` · ${size}` : ''} — ${price}`;
}

// items: the cart (cart.js cartItems()); storeName(item) → the store's label.
export function cartShareText(items, { storeName = (it) => it.storeName || it.store } = {}) {
  const ar = getLang() === 'ar';
  const groups = new Map();
  for (const it of items) {
    if (!groups.has(it.store)) groups.set(it.store, []);
    groups.get(it.store).push(it);
  }

  let count = 0;
  let total = 0;
  let toBuy = 0;
  let bought = false;
  const lines = [`🛒 ${t('cart.shareText.title')}`];
  for (const list of groups.values()) {
    // Same order as the page: still-to-buy first, ticked items last.
    const sorted = list.slice().sort((a, b) => (a.purchased ? 1 : 0) - (b.purchased ? 1 : 0));
    lines.push('', storeName(sorted[0]));
    for (const it of sorted) {
      const qty = it.qty || 1;
      count += qty;
      total += it.price * qty;
      if (it.purchased) bought = true;
      else toBuy += it.price * qty;
      lines.push(itemLine(it, ar));
    }
  }
  const currency = items[0]?.currency;
  lines.push('', tn('cart.shareText.count', count), `${t('cart.total')}: ${money(total, currency)}`);
  // Ticked items are already in the trolley; say what is left to spend.
  if (bought) lines.push(`${t('cart.toBuy')}: ${money(toBuy, currency)}`);
  return lines.join('\n');
}

// → 'shared' | 'copied' | 'cancelled' | 'failed'
export async function shareText(text, title) {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    const data = { title, text };
    if (typeof navigator.canShare !== 'function' || navigator.canShare(data)) {
      try {
        await navigator.share(data);
        return 'shared';
      } catch (err) {
        // The user closed the share sheet: nothing to do. Any other refusal
        // (no share targets, blocked) falls through to the clipboard.
        if (err && err.name === 'AbortError') return 'cancelled';
      }
    }
  }
  return (await copyText(text)) ? 'copied' : 'failed';
}

async function copyText(text) {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* permission refused or no secure context — try the old route */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
