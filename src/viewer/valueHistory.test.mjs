// viewer/valueHistory.test.mjs — the brochure card's lowest price per kg / L /
// piece for the exact product, any size, here and anywhere. Run with:
//   node src/viewer/valueHistory.test.mjs

import { valueHistory } from './valueHistory.js';
import { lineQuery } from './sameProduct.js';

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) pass += 1;
  else {
    fail += 1;
    console.error('FAIL:', name);
  }
};

const line = (id, store, validFrom, name, price, value, unit = 'l', extra = {}) =>
  ({ id, store, validFrom, brandSlug: 'nadec', name, price, unitPrice: { value, unit }, ...extra });
const card = line('farm:now', 'farm', '2026-11-18', 'Nadec Long Life Milk Full Fat 1L', 4.5, 4.5);

const lines = [
  line('farm:now', 'farm', '2026-11-18', 'Nadec Long Life Milk Full Fat 1L', 4.5, 4.5), // the card itself
  line('farm:a', 'farm', '2026-10-01', 'NADEC UHT FF MILK 12X1L', 48, 4), // lower here, another size
  line('lulu:a', 'lulu', '2026-09-14', 'Nadec Long Life Milk Full Fat 200ml x18', 25.2, 7), // dearer
  line('othaim:a', 'othaim', '2026-08-02', 'Nadec Milk Long Life Full Fat 4x1L', 14.4, 3.6), // lowest anywhere
  line('othaim:b', 'othaim', '2026-07-01', 'Nadec Long Life Milk Low Fat 1L', 3, 3), // other product
  line('carrefour:a', 'carrefour', '2026-06-25', 'Nadec Long Life Milk Full Fat 1L', 1, 1), // 4.5× lower: misread
  line('danube:a', 'danube', '2026-06-24', 'Nadec Long Life Milk Full Fat 1L', 4, null, 'l', { unitPrice: null }),
];
// Every low needs a second flyer within 10% (or this offer itself).
lines.push(line('tamimi:a', 'tamimi', '2026-08-09', 'Nadec Long Life Milk Full Fat 1L', 3.7, 3.7));
const h = valueHistory(card, lines);
ok('lowest at this store is the 12×1L, any size', h.here.line.id === 'farm:a' && h.here.value === 4);
ok('lowest anywhere is by value, not shelf price', h.anywhere.line.id === 'othaim:a' && h.anywhere.value === 3.6);
ok('another product (low fat) is never counted', h.count === 4);
ok('a value 4.5× below is a misread, left out', h.anywhere.line.store !== 'carrefour');
ok('since = the oldest line counted', h.since === '2026-08-02');
ok('the card itself is not a saved line', ![h.here.line, h.anywhere.line].some((l) => l && l.id === 'farm:now'));

const cheapNow = { ...card, price: 3, unitPrice: { value: 3, unit: 'l' } };
const h2 = valueHistory(cheapNow, lines);
ok('nothing lower: this offer is the lowest here and anywhere',
  h2.here.line === null && h2.anywhere.line === null && h2.anywhere.value === 3);

ok('no value on the card: no value history', valueHistory({ ...card, unitPrice: null }, lines) === null);
ok('no same-product line: nothing to say', valueHistory(card, [lines[4]]) === null);
ok('per litre is never compared with per kilo',
  valueHistory(card, [line('x', 'x', '2026-10-01', 'Nadec Long Life Milk Full Fat', 4, 4, 'kg')]) === null);

// The owner's Kiri lines (archive, 2026-11-20): one misread count beats every
// real price and no other flyer comes near it.
const jar = { id: 'farm:k', store: 'farm', brandSlug: 'kiri', name: 'KIRI SPREAD CREAMY CHEESE ANALOGUE 500GR', price: 7.99, unitPrice: { value: 15.98, unit: 'kg' } };
const kl = (id, store, d, name, price, value) => ({ id, store, validFrom: d, brandSlug: 'kiri', name, price, unitPrice: { value, unit: 'kg' } });
const kiri = valueHistory(jar, [
  kl('o', 'othaim', '2026-07-28', 'Kiri Cheese Cream 30x99g', 30.99, 10.43),
  kl('m', 'almadina', '2026-08-04', 'Kiri Cream Cheese 500g', 7.95, 15.9),
  kl('g', 'grandhyper', '2026-07-15', 'Kiri Cream Cheese Spread', 7.95, 15.9),
  kl('f', 'farm', '2026-08-04', 'KIRI SPREAD CREAMY CHEESE ANALOGUE 500GR', 12.99, 25.98),
]);
ok('an unconfirmed misread is never the lowest', kiri.anywhere.line.id === 'm' && kiri.anywhere.value === 15.9);
ok('nothing lower at this store: this offer', kiri.here.line === null);
ok('one flyer printed twice does not confirm itself',
  valueHistory(jar, [kl('a', 'danube', '2026-07-01', 'Kiri Creamy Cheese 200g', 2, 8),
    kl('b', 'danube', '2026-07-01', 'Kiri Creamy Cheese 200g', 2, 8)]).anywhere.line === null);

// The search that finds the lines: brand as printed + the longest product word
// that every same-product line must print.
ok('query: Kiri jar', lineQuery({ brandSlug: 'kiri', name: 'KIRI SPREAD CREAMY CHEESE ANALOGUE 500GR' }) === 'kiri cheese');
ok('query: never a word UHT was folded into', lineQuery({ brandSlug: 'nadec', name: 'NADEC UHT FF MILK 200ML X18' }) === 'nadec milk');
ok('query: Arabic-only', lineQuery({ brandSlug: 'nadec', nameAr: 'نادك حليب كامل الدسم طويل الأجل' }) === 'نادك حليب');

if (fail) {
  console.error(`\n${fail} test(s) failed (${pass} passed).`);
  process.exit(1);
}
console.log(`All value-history tests passed (${pass}).`);
