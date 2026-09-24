// Read-only D4D raw-payload probe: is the current price truly absent from
// unpriced items, or present somewhere the ingest does not read?
// GETs the store page (CSRF), POSTs /products/search exactly as the engine's
// d4dOffers.js does, and GETs flyer leaflet HTML. Writes only into ./d4d-probe-out/.
import { mkdirSync, writeFileSync } from 'node:fs';

const HOST = 'https://d4donline.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const OUT = new URL('./d4d-probe-out/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const save = (name, data) => writeFileSync(new URL(name, OUT), typeof data === 'string' ? data : JSON.stringify(data, null, 2));
const STORES = [[63, 'lulu-hypermarket-63'], [62, 'carrefour-62'], [72, 'othaim-markets-72'], [556, 'city-flower-556'], [471, 'prime-supermarket-471'], [68, 'tamimi-market-68']];
const PRICE_KEY = /price|prc|cost|amount|amt|sar|riyal|offer|promo|discount|was|old|before|now|value|rate|special|deal|sale/i;
const num = (v) => { const n = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : null; };

async function search(company, slug) {
  const pageUrl = `${HOST}/en/saudi-arabia/riyadh/offers/${slug}`;
  const pr = await fetch(pageUrl, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
  const html = await pr.text();
  const csrf = (/name="_csrf-frontend" value="([^"]+)"/.exec(html) || [])[1];
  const cookie = (pr.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
  const res = await fetch(`${HOST}/products/search`, {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', Referer: pageUrl, Cookie: cookie },
    body: new URLSearchParams({ search: '', offset: '0', limit: '500', company: String(company), country: 'SACR', '_csrf-frontend': csrf }),
  });
  const text = await res.text();
  return { status: res.status, text, storeHtml: html };
}

// Every leaf path in a value: [path, value].
function leaves(v, path = '$', out = []) {
  if (v && typeof v === 'object') {
    const entries = Array.isArray(v) ? v.map((x, i) => [i, x]) : Object.entries(v);
    if (!entries.length) out.push([path, v]);
    for (const [k, x] of entries) leaves(x, Array.isArray(v) ? `${path}[${k}]` : `${path}.${k}`, out);
  } else out.push([path, v]);
  return out;
}
// Collapse array indices so paths can be compared across items.
const shape = (p) => p.replace(/\[\d+\]/g, '[]');
// A leaf string may itself be JSON (D4D embeds JSON in attributes).
function deepLeaves(item) {
  const out = [];
  for (const [p, v] of leaves(item)) {
    out.push([p, v]);
    if (typeof v === 'string' && /^\s*[[{]/.test(v)) {
      try { for (const [q, w] of leaves(JSON.parse(v), `${p}<json>`)) out.push([q, w]); } catch {}
    }
  }
  return out;
}

const report = { at: new Date().toISOString(), stores: [] };
const priced = [];
const unpriced = [];
for (const [company, slug] of STORES) {
  let r;
  try { r = await search(company, slug); } catch (e) { report.stores.push({ slug, error: e.message }); continue; }
  save(`${slug}.products-search.json`, r.text);
  let data;
  try { data = JSON.parse(r.text); } catch { report.stores.push({ slug, status: r.status, error: 'non-JSON response', head: r.text.slice(0, 300) }); continue; }
  const items = Array.isArray(data.items) ? data.items : [];
  const top = Object.fromEntries(Object.entries(data).filter(([k]) => k !== 'items').map(([k, v]) => [k, JSON.stringify(v).slice(0, 600)]));
  const byFlyer = {};
  for (const it of items) {
    const f = String(it.idoffer_company);
    const b = (byFlyer[f] ||= { n: 0, pricePos: 0, wasPos: 0, created: new Set() });
    b.n++;
    if (num(it.price) > 0) b.pricePos++;
    if (num(it.was_price) > 0) b.wasPos++;
    b.created.add(String(it.CreationDate ?? it.creation_date ?? '').slice(0, 10));
    (num(it.price) > 0 ? priced : unpriced).push({ slug, item: it });
  }
  for (const b of Object.values(byFlyer)) b.created = [...b.created].sort().join(',');
  report.stores.push({ slug, status: r.status, items: items.length, topLevelKeys: Object.keys(data), topLevel: top, byFlyer });
}

// 1-3. Key census: every leaf path in priced vs unpriced items, and what each holds.
function census(list) {
  const m = new Map();
  for (const { item } of list) {
    for (const [p, v] of deepLeaves(item)) {
      const k = shape(p);
      const c = m.get(k) || { n: 0, nonEmpty: 0, positiveNumbers: 0, samples: new Set() };
      c.n++;
      if (v !== null && v !== '' && v !== undefined) c.nonEmpty++;
      if (num(v) > 0) c.positiveNumbers++;
      if (c.samples.size < 4 && v !== null && v !== '') c.samples.add(JSON.stringify(v).slice(0, 80));
      m.set(k, c);
    }
  }
  return m;
}
const cp = census(priced);
const cu = census(unpriced);
const paths = [...new Set([...cp.keys(), ...cu.keys()])].sort();
const table = paths.map((p) => {
  const a = cp.get(p);
  const b = cu.get(p);
  return {
    path: p,
    priceLikeName: PRICE_KEY.test(p),
    priced: a ? `${a.nonEmpty}/${priced.length} set, ${a.positiveNumbers} >0, e.g. ${[...a.samples].join(' | ')}` : 'ABSENT',
    unpriced: b ? `${b.nonEmpty}/${unpriced.length} set, ${b.positiveNumbers} >0, e.g. ${[...b.samples].join(' | ')}` : 'ABSENT',
  };
});
report.census = { pricedItems: priced.length, unpricedItems: unpriced.length, onlyInUnpriced: table.filter((t) => t.priced === 'ABSENT').map((t) => t.path), onlyInPriced: table.filter((t) => t.unpriced === 'ABSENT').map((t) => t.path), priceLike: table.filter((t) => t.priceLikeName) };
save('census.json', table);

// 6/7. Does any leaf of an unpriced item hold a plausible price? Candidates:
// numbers in (0, 10000) anywhere except ids/dates/geometry; plus any price-named key.
const IGNORE = /(^|\.)id|_id|idoffer|idproduct|date|time|valid|lat|lng|lon|branch|phone|x$|y$|width|height|sort|order|count|page|index/i;
const hits = {};
for (const { slug, item } of unpriced) {
  for (const [p, v] of deepLeaves(item)) {
    const n = num(v);
    if (!(PRICE_KEY.test(p) || (n != null && n > 0 && n < 10000 && !IGNORE.test(p)))) continue;
    const k = shape(p);
    (hits[k] ||= { count: 0, examples: [] }).count++;
    if (hits[k].examples.length < 5) hits[k].examples.push({ slug, id: item.idoffer_special, value: v });
  }
}
report.unpricedCandidateFields = hits;

// Side by side: one priced and one unpriced item from the same store (prefer same category).
const pairs = [];
for (const [, slug] of STORES) {
  const u = unpriced.find((x) => x.slug === slug);
  if (!u) continue;
  const p = priced.find((x) => x.slug === slug && x.item.idproduct_category === u.item.idproduct_category) || priced.find((x) => x.slug === slug) || priced[0];
  pairs.push({ store: slug, pricedItem: p?.item ?? null, unpricedItem: u.item });
  if (pairs.length >= 3) break;
}
save('pairs.json', pairs);
report.pairs = pairs.map((x) => ({ store: x.store, priced: x.pricedItem && { id: x.pricedItem.idoffer_special, flyer: x.pricedItem.idoffer_company, price: x.pricedItem.price, was: x.pricedItem.was_price, url: x.pricedItem.url }, unpriced: { id: x.unpricedItem.idoffer_special, flyer: x.unpricedItem.idoffer_company, price: x.unpricedItem.price, was: x.unpricedItem.was_price, url: x.unpricedItem.url } }));

// 5. Flyer leaflet HTML: full data-coords-json product objects, unpriced vs priced flyer.
async function leaflet(url) {
  const html = await (await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } })).text();
  const blocks = [...html.matchAll(/data-coords-json='(\[[^']*\])'/g)].map((m) => { try { return JSON.parse(m[1].replace(/&quot;/g, '"')); } catch { return null; } }).filter(Boolean);
  const products = blocks.flat();
  const keys = [...new Set(products.flatMap((o) => (o && typeof o === 'object' ? leaves(o).map(([p]) => shape(p)) : [])))].sort();
  return { url, bytes: html.length, blocks: blocks.length, products: products.length, keys, sample: products.slice(0, 3), html };
}
const flyerUrl = (x) => x?.item?.url || null;
const lu = unpriced.find((x) => flyerUrl(x));
const lp = priced.find((x) => flyerUrl(x) && (!lu || x.slug === lu.slug)) || priced.find((x) => flyerUrl(x));
report.leaflets = {};
for (const [k, x] of [['unpriced', lu], ['priced', lp]]) {
  if (!x) continue;
  try {
    const l = await leaflet(flyerUrl(x));
    save(`leaflet-${k}.html`, l.html);
    delete l.html;
    report.leaflets[k] = { store: x.slug, flyer: x.item.idoffer_company, ...l };
  } catch (e) { report.leaflets[k] = { error: e.message }; }
}

save('report.json', report);
console.log(JSON.stringify(report, null, 2).slice(0, 20000));
