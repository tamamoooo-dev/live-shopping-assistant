// The cart as a link: what goes in comes back out, the link stays short and
// URL-safe, and anything odd in a link someone else wrote is dropped.
import assert from 'node:assert/strict';
import { packItems, unpackItems, packList, unpackList, cartLink, linkPayload } from './cartLink.js';

const flyer = {
  id: 'panda:123:4', store: 'panda', storeName: 'Panda', name: 'Almarai Fresh Milk', nameAr: 'حليب المراعي طازج',
  size: '1 L', price: 6.95, oldPrice: 8.5, qty: 2, purchased: false, brochureId: 'b-77', pageIndex: 0,
  currency: 'SAR', image: 'data:image/png;base64,AAAA', sourceUrl: 'https://x.test/p', validTo: '2026-11-30',
  addedAt: '2026-11-21T10:00:00Z',
};
const quick = { id: 'list:tomatoes', store: null, name: 'Tomatoes', nameAr: 'طماطم', price: null, qty: 3, icon: '🥬' };
const typed = { id: 'list:almarai laban', store: null, name: 'Almarai laban', nameAr: null, price: null, qty: 1, icon: '📝', purchased: true };

// Round trip through the link text.
const packed = await packList([flyer, quick, typed]);
assert.match(packed, /^[zj][A-Za-z0-9_-]+$/, 'URL-safe: letters, digits, - and _ only');
const back = await unpackList(packed);
assert.equal(back.length, 3);
assert.deepEqual(
  { ...back[0] },
  {
    id: 'panda:123:4', store: 'panda', storeName: 'Panda', name: 'Almarai Fresh Milk', nameAr: 'حليب المراعي طازج',
    size: '1 L', price: 6.95, oldPrice: 8.5, currency: 'SAR', qty: 2, purchased: false,
    brochureId: 'b-77', pageIndex: 0, icon: null, image: null, crop: null, sourceUrl: null, validTo: null,
  },
  'a flyer item keeps name, store, size, prices, qty and page 0; a data: picture with no crop box stays home',
);

// Pictures: a web picture travels as its address; a cut flyer picture as its
// place on the page (asset key + box).
const ENGINE = 'https://brochure-engine.tamamoooo.workers.dev';
const web = { ...flyer, id: 'w', image: 'https://cdn.test/offers/123.jpg', crop: null };
const cut = {
  ...flyer, id: 'c', image: 'data:image/jpeg;base64,/9j/AAAA',
  crop: { src: `${ENGINE}/asset/brochures/panda/central/2026-W47/page03.webp`, x: 0.123456, y: 0.5, w: 0.25, h: 0.2 },
};
const both = { ...cut, id: 'b', image: 'https://cdn.test/offers/9.jpg' };
const pics = await unpackList(await packList([web, cut, both]));
assert.equal(pics[0].image, 'https://cdn.test/offers/123.jpg', 'a web picture keeps its address');
assert.equal(pics[0].crop, null);
assert.equal(pics[1].image, null, 'the data: picture itself does not travel');
assert.deepEqual(pics[1].crop, { key: 'brochures/panda/central/2026-W47/page03.webp', x: 0.1235, y: 0.5, w: 0.25, h: 0.2 },
  'its place on the page does');
assert.deepEqual([pics[2].image, pics[2].crop], ['https://cdn.test/offers/9.jpg', null], 'a web picture is enough');
for (const [bad, why] of [
  ['http://cdn.test/a.jpg', 'http'], ['javascript:alert(1)', 'script'], ['data:image/png;base64,AA', 'data'],
  [`https://cdn.test/${'a'.repeat(700)}.jpg`, 'too long'],
]) {
  assert.equal((await unpackList(await packList([{ ...web, image: bad }])))[0].image, null, `no ${why} picture`);
  assert.equal(unpackItems([1, [['x', null, null, 'X', ...Array(10).fill(null), bad]]])[0].image, null, `refused on the way in: ${why}`);
}
for (const [crop, why] of [
  [['brochures/../secret', 0, 0, 0.5, 0.5], 'path climbing'],
  [['other/a.webp', 0, 0, 0.5, 0.5], 'outside brochures/'],
  [['brochures/a.webp', 0, 0, 0, 0.5], 'empty box'],
  [['brochures/a.webp', -1, 0, 0.5, 0.5], 'off the page'],
  [['brochures/a.webp', 0, 0, 0.5], 'short'],
  ['brochures/a.webp', 'not a box'],
]) {
  assert.equal(unpackItems([1, [['x', null, null, 'X', ...Array(11).fill(null), crop]]])[0].crop, null, `crop refused: ${why}`);
}
assert.equal(
  unpackItems([1, [['x', 'constructor', null, 'X']]])[0].store, null,
  'a store id that is a built-in object key is dropped',
);
assert.deepEqual(
  [back[1].name, back[1].nameAr, back[1].icon, back[1].qty, back[1].store, back[1].price],
  ['Tomatoes', 'طماطم', '🥬', 3, null, null],
  'a catalog item comes back from the catalog',
);
assert.deepEqual([back[2].name, back[2].icon, back[2].purchased], ['Almarai laban', '📝', true], 'a typed item');

// Catalog items travel as their id only.
const [, rows] = packItems([quick]);
assert.deepEqual(rows[0], ['list:tomatoes', null, null, null, null, null, null, null, 3], 'id + qty only');

// Short enough for a chat message: 30 everyday items in a few hundred characters.
const many = (await import('./quickAddCatalog.js')).QUICK_ITEMS.slice(0, 30)
  .map((it) => ({ id: `list:${it.id}`, store: null, name: it.en, nameAr: it.ar, price: null, qty: 1 }));
const short = await packList(many);
assert.ok(short.length < 400, `30 catalog items pack into ${short.length} characters`);
assert.equal((await unpackList(short)).length, 30);

// The link: the app's own address, the list after #.
const link = await cartLink([quick], 'https://tamamoooo-dev.github.io/live-shopping-assistant/');
assert.match(link, /^https:\/\/tamamoooo-dev\.github\.io\/live-shopping-assistant\/#\/cart\?l=[zj][A-Za-z0-9_-]+$/);
assert.equal(linkPayload(new URL(link).hash), link.split('?l=')[1]);
assert.equal(linkPayload('#/cart'), null);
assert.equal(linkPayload('#/search?l=zabc'), null);
assert.equal(linkPayload(''), null);

// Plain (uncompressed) links from browsers without CompressionStream still open.
const plain = `j${Buffer.from(JSON.stringify(packItems([quick]))).toString('base64url')}`;
assert.equal((await unpackList(plain))[0].name, 'Tomatoes');

// Links someone else wrote: bad shapes are refused, odd fields dropped.
await assert.rejects(unpackList('zz!'), 'bad characters');
await assert.rejects(unpackList('x' + 'A'.repeat(10)), 'unknown prefix');
await assert.rejects(unpackList(`j${'A'.repeat(40000)}`), 'too long');
await assert.rejects(unpackList('zAAAA'), 'not a deflate stream');
await assert.rejects(unpackList(`j${Buffer.from('[2,[]]').toString('base64url')}`), 'unknown version');
await assert.rejects(unpackList(`j${Buffer.from('[1,[]]').toString('base64url')}`), 'empty list');
assert.throws(() => unpackItems([1, [['no-name-at-all']]]), 'an item with no name is dropped → empty');
const odd = unpackItems([1, [
  ['x', 'panda"><script>', null, 'Odd', null, null, -5, 1e9, 500, 'yes', null, -1, null, '<b>'],
  ['y', 'tamimi', null, '  Rice  ', null, null, 12.5, null, 0],
]]);
assert.deepEqual(
  [odd[0].store, odd[0].price, odd[0].oldPrice, odd[0].qty, odd[0].purchased, odd[0].pageIndex, odd[0].icon],
  [null, null, null, 99, false, null, '<b>'],
  'a bad store, negative/huge prices, qty over 99, odd page are dropped or clamped',
);
assert.deepEqual([odd[1].name, odd[1].store, odd[1].price, odd[1].qty], ['Rice', 'tamimi', 12.5, 1], 'trimmed; qty 0 → 1');

// A link that unpacks to far more than any list (a "zip bomb") is stopped.
const { deflateRawSync } = await import('node:zlib');
const bomb = `z${deflateRawSync(Buffer.alloc(5_000_000, 32)).toString('base64url')}`;
assert.ok(bomb.length < 30000, 'the bomb fits in a link');
await assert.rejects(unpackList(bomb), /too large/, 'unpacking stops at the size cap');

console.log('cart link tests passed');
