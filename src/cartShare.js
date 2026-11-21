// cartShare.js — sharing the cart. The Share button sends a LINK that carries
// the list (cartLink.js; owner, 2026-11-21: "I want it to be a link"), through
// the phone's share sheet (Web Share API: WhatsApp, SMS, mail …), or copies
// the link where there is none.
//
// cartSummary() is the list in words — grouped by store the way the cart page
// groups it, one line per item (name · size — price), then the item count and
// the total — in the app's language. The cart page shows it to whoever opens
// a shared link, before they add the items to their own cart.

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

// A quick-add line (cartQuickAdd.js) has no price.
const hasPrice = (it) => typeof it.price === 'number' && Number.isFinite(it.price);

function itemLine(it, ar) {
  const qty = it.qty || 1;
  const name = (ar ? it.nameAr || it.name : it.name || it.nameAr) || t('cart.flyerProduct');
  // The size snapshotted at add time; skipped when the name already says it.
  const size = it.size && !nameHasSize(name, it.size) ? it.size : '';
  const mark = it.purchased ? '✓' : '•';
  if (!hasPrice(it)) return `${mark} ${name}${size ? ` · ${size}` : ''}${qty > 1 ? ` × ${qty}` : ''}`;
  const price =
    qty > 1 ? `${qty} × ${fmt(it.price)} = ${money(it.price * qty, it.currency)}` : money(it.price, it.currency);
  return `${mark} ${name}${size ? ` · ${size}` : ''} — ${price}`;
}

// items: cart items; storeName(item) → the store's label.
// → { count, groups: [{ label, lines: [string] }], footer: [string] }
export function cartSummary(items, { storeName = (it) => it.storeName || it.store } = {}) {
  const ar = getLang() === 'ar';
  const byStore = new Map();
  for (const it of items) {
    const key = it.store || '';
    if (!byStore.has(key)) byStore.set(key, []);
    byStore.get(key).push(it);
  }

  let count = 0;
  let total = 0;
  let toBuy = 0;
  let unpriced = 0;
  let bought = false;
  const groups = [];
  for (const list of byStore.values()) {
    // Same order as the page: still-to-buy first, ticked items last.
    const sorted = list.slice().sort((a, b) => (a.purchased ? 1 : 0) - (b.purchased ? 1 : 0));
    const lines = [];
    for (const it of sorted) {
      const qty = it.qty || 1;
      count += qty;
      if (hasPrice(it)) {
        total += it.price * qty;
        if (it.purchased) bought = true;
        else toBuy += it.price * qty;
      } else unpriced += qty;
      lines.push(itemLine(it, ar));
    }
    groups.push({ label: sorted[0].store ? storeName(sorted[0]) : t('cart.myList'), lines });
  }
  const footer = [tn('cart.shareText.count', count)];
  // The total covers priced lines only, and says how many it leaves out.
  if (items.some(hasPrice)) {
    const currency = items.find(hasPrice).currency;
    footer.push(`${t('cart.total')}: ${money(total, currency)}${unpriced ? ` (${tn('cart.unpriced', unpriced)})` : ''}`);
    // Ticked items are already in the trolley; say what is left to spend.
    if (bought) footer.push(`${t('cart.toBuy')}: ${money(toBuy, currency)}`);
  }
  return { count, groups, footer };
}

// Share a link: the phone's share sheet, else copy the link.
// → 'shared' | 'copied' | 'cancelled' | 'failed'
export async function shareLink({ title, text, url }) {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    const data = { title, text, url };
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
  return (await copyText(url)) ? 'copied' : 'failed';
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
