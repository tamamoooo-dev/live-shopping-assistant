// cartLink.js — the cart as a link (owner, 2026-11-21: "I want it to be a
// link"). The list itself travels inside the link, after the `#`:
//
//   https://…/live-shopping-assistant/#/cart?l=<packed list>
//
// Nothing is stored anywhere: the browser never sends the part after `#` to a
// server, and the engine is not involved. Opening the link shows the list on
// cart page exactly as the sender sees it — same cards, same pictures — with
// "Add all to my cart" (cartPage.js).
//
// Packing: each item is a short array (trailing empties dropped), the whole
// thing JSON → deflate-raw → base64url, prefixed "z". Browsers without
// CompressionStream write plain JSON bytes, prefixed "j". Everyday quick-add
// items carry only their id; names and icon come back from quickAddCatalog.js.
// Pictures: a web picture (https) travels as its address; a picture cropped
// from a flyer page (a data: URL, far too big for a link) travels as where it
// sits on that page — the page's engine asset key + its box — and the other
// phone cuts the same picture from the same page.

import { QUICK_ITEMS } from './quickAddCatalog.js';

const VERSION = 1;
const MAX_ITEMS = 200;
const MAX_PACKED = 30000; // characters in the link
const MAX_JSON = 300000; // bytes after unpacking

const FIELDS = ['id', 'store', 'storeName', 'name', 'nameAr', 'size', 'price', 'oldPrice', 'qty',
  'purchased', 'brochureId', 'pageIndex', 'currency', 'icon', 'pic', 'crop'];
const MAX_PIC = 600; // characters in a picture address

// A web picture worth carrying: https only (no data:, no http, no scripts).
function webPic(v) {
  if (typeof v !== 'string' || v.length > MAX_PIC || !/^https:\/\//i.test(v)) return null;
  try { return new URL(v).protocol === 'https:' ? v : null; } catch { return null; }
}

// A flyer crop: the page's asset key under the engine's /asset/brochures/, and
// the box as fractions of the page.
const ASSET_KEY = /^brochures\/[A-Za-z0-9._~%-]+(?:\/[A-Za-z0-9._~%-]+)*$/;
const frac = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? v : null);
const round4 = (v) => Math.round(v * 10000) / 10000;
function packCrop(crop) {
  if (!crop || typeof crop.src !== 'string') return null;
  const m = /\/asset\/(brochures\/[^?#]+)$/.exec(crop.src);
  const box = [crop.x, crop.y, crop.w, crop.h].map(frac);
  if (!m || !ASSET_KEY.test(m[1]) || m[1].includes('..') || box.includes(null) || !box[2] || !box[3]) return null;
  return [m[1], ...box.map(round4)];
}
function unpackCrop(v) {
  if (!Array.isArray(v) || v.length !== 5) return null;
  const [key, ...nums] = v;
  const box = nums.map(frac);
  if (typeof key !== 'string' || key.length > 300 || !ASSET_KEY.test(key) || key.includes('..')) return null;
  if (box.includes(null) || !box[2] || !box[3]) return null;
  const [x, y, w, h] = box;
  return { key, x, y, w, h };
}
const catalog = new Map(QUICK_ITEMS.map((it) => [`list:${it.id}`, it]));

// --- base64url ---------------------------------------------------------------
function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64(text) {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function pipe(bytes, transform, cap = Infinity) {
  const reader = new Blob([bytes]).stream().pipeThrough(transform).getReader();
  const parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > cap) { await reader.cancel(); throw Error('List too large'); }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

// --- items ⇄ compact arrays ---------------------------------------------------------
export function packItems(items) {
  return [VERSION, items.slice(0, MAX_ITEMS).map((it) => {
    const known = catalog.get(it.id);
    const row = FIELDS.map((f) => {
      if (known && (f === 'name' || f === 'nameAr' || f === 'icon')) return null;
      if (f === 'purchased') return it.purchased ? 1 : null;
      if (f === 'currency') return it.currency && it.currency !== 'SAR' ? it.currency : null;
      if (f === 'qty') return it.qty || 1;
      if (f === 'pic') return webPic(it.image);
      // A cropped picture travels as its place on the page.
      if (f === 'crop') return webPic(it.image) ? null : packCrop(it.crop);
      return it[f] ?? null;
    });
    while (row.length && row[row.length - 1] === null) row.pop();
    return row;
  })];
}

const text = (v, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const money = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e6 ? v : null);

// Untrusted input (anyone can write a link): keep only well-formed fields.
export function unpackItems(data) {
  if (!Array.isArray(data) || data[0] !== VERSION || !Array.isArray(data[1])) throw Error('Unknown list');
  const items = [];
  for (const row of data[1].slice(0, MAX_ITEMS)) {
    if (!Array.isArray(row)) continue;
    const raw = Object.fromEntries(FIELDS.map((f, i) => [f, row[i] ?? null]));
    const id = text(raw.id);
    if (!id) continue;
    const known = catalog.get(id);
    const name = known ? known.en : text(raw.name);
    const nameAr = known ? known.ar : text(raw.nameAr);
    if (!name && !nameAr) continue;
    // A store id is looked up in plain objects: never "constructor" and the like.
    const store = typeof raw.store === 'string' && /^[\w:.-]{1,80}$/.test(raw.store) && !(raw.store in Object.prototype)
      ? raw.store
      : null;
    const qty = Number.isInteger(raw.qty) ? Math.min(99, Math.max(1, raw.qty)) : 1;
    items.push({
      id, store, storeName: text(raw.storeName, 80), name, nameAr, size: text(raw.size, 60),
      price: money(raw.price), oldPrice: money(raw.oldPrice), currency: text(raw.currency, 8) || 'SAR',
      qty, purchased: raw.purchased === 1,
      brochureId: text(raw.brochureId), pageIndex: Number.isInteger(raw.pageIndex) && raw.pageIndex >= 0 ? raw.pageIndex : null,
      icon: known ? known.icon : store ? null : text(raw.icon, 8) || '📝',
      image: webPic(raw.pic), crop: unpackCrop(raw.crop), sourceUrl: null, validTo: null,
    });
  }
  if (!items.length) throw Error('Empty list');
  return items;
}

// --- the link -----------------------------------------------------------------
export async function packList(items) {
  const json = new TextEncoder().encode(JSON.stringify(packItems(items)));
  if (typeof CompressionStream === 'function') {
    try { return `z${toB64(await pipe(json, new CompressionStream('deflate-raw')))}`; } catch { /* plain below */ }
  }
  return `j${toB64(json)}`;
}

export async function unpackList(packed) {
  if (typeof packed !== 'string' || packed.length > MAX_PACKED || !/^[zj][A-Za-z0-9_-]+$/.test(packed)) {
    throw Error('Not a list link');
  }
  let bytes = fromB64(packed.slice(1));
  if (packed[0] === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'), MAX_JSON);
  else if (bytes.length > MAX_JSON) throw Error('List too large');
  return unpackItems(JSON.parse(new TextDecoder().decode(bytes)));
}

// The app's own address (any GitHub Pages subpath kept), without ?query.
export async function cartLink(items, base = new URL(location.pathname, location.origin).href) {
  return `${base}#/cart?l=${await packList(items)}`;
}

// The packed list in a cart link's hash, or null.
export function linkPayload(hash = location.hash) {
  const m = /^#\/cart\?l=([A-Za-z0-9_-]+)/.exec(hash || '');
  return m ? m[1] : null;
}
