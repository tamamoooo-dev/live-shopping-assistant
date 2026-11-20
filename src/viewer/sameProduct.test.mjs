// viewer/sameProduct.test.mjs — the brochure card's store comparison must be
// the SAME product, compared by VALUE. Pairs are from this week's brochures
// (2026-11-20). Run with:  node src/viewer/sameProduct.test.mjs

import { sameProduct, sameProductRows, valueOf } from './sameProduct.js';

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) pass += 1;
  else {
    fail += 1;
    console.error('FAIL:', name);
  }
};

const o = (id, store, brandSlug, name, price, unitPrice, extra = {}) =>
  ({ id, store, brandSlug, name, price, unitPrice, ...extra });
const same = (a, b) => sameProduct(a, b).same;

// --- same product -----------------------------------------------------------------
const kiri = o('farm:1', 'farm', 'kiri', 'KIRI SPREAD CREAMY CHEESE ANALOGUE 500GR', 7.99, { value: 15.98, unit: 'kg' });
ok('word order, creamy/cream and spreadable/spread are one product',
  same(kiri, o('danube:1', 'danube', 'kiri', 'Kiri Analogue Spread Cream Cheese 2x500g', 25.99, { value: 25.99, unit: 'kg' })) &&
  same(kiri, o('jaz:1', 'aljazera', 'kiri', 'KIRI ANALOGUE SPREADABLE CHEESE CREAM JAR 500G', 11.5, { value: 23, unit: 'kg' })));
ok('another brand is never the same product',
  !same(kiri, o('x:1', 'lulu', 'puck', 'Puck Spread Creamy Cheese Analogue 500g', 9, { value: 18, unit: 'kg' })));
ok('a brand missing on one side is left out (not proof)',
  !same(kiri, o('x:2', 'lulu', null, 'Kiri Spread Creamy Cheese Analogue 500g', 9, { value: 18, unit: 'kg' })));

const nadec = o('makkah:1', 'makkah', 'nadec', 'Nadec Long Life Milk Full Fat 1L', 4.5, { value: 4.5, unit: 'l' });
ok('UHT FF is long life full fat',
  same(nadec, o('c:1', 'carrefour', 'nadec', 'NADEC UHT FF MILK 200ML X18', 30.99, { value: 8.61, unit: 'l' })));
ok('full fat ≠ low fat',
  !same(nadec, o('c:2', 'carrefour', 'nadec', 'Nadec Long Life Milk Low Fat 1L', 4, { value: 4, unit: 'l' })));
ok('long life ≠ fresh',
  !same(nadec, o('c:3', 'carrefour', 'nadec', 'Nadec Fresh Milk Full Fat 1L', 6, { value: 6, unit: 'l' })));
ok('milk ≠ laban',
  !same(nadec, o('c:4', 'carrefour', 'nadec', 'Nadec Long Life Laban Full Fat 1L', 4, { value: 4, unit: 'l' })));
ok('plain ≠ strawberry, both ways',
  !same(nadec, o('c:5', 'carrefour', 'nadec', 'Nadec Long Life Strawberry Milk Full Fat 1L', 4, { value: 4, unit: 'l' })) &&
  !same(o('c:6', 'lulu', 'nadec', 'Nadec Strawberry Milk Long Life', 2, { value: 10, unit: 'l' }),
    o('c:7', 'tamimi', 'nadec', 'Nadec Milk Long Life', 2, { value: 10, unit: 'l' })));
ok('an assortment price is not this product',
  !same(nadec, o('c:8', 'carrefour', 'nadec', 'Nadec Long Life Milk Full Fat / Low Fat 1L', 4, { value: 4, unit: 'l' })));

// Measured 2026-11-20: one extra word was most often another product.
ok('Doux Chicken ≠ Doux Chicken Franks',
  !same(o('a', 'farm', 'doux', 'Doux Chicken Griller', 10, { value: 10, unit: 'kg' }),
    o('b', 'lulu', 'doux', 'Doux Chicken Griller Franks', 10, { value: 10, unit: 'kg' })));
ok('Almarai Cream ≠ Almarai Cooking Cream',
  !same(o('a', 'farm', 'almarai', 'Almarai Whipping Cream 500ml', 10, { value: 20, unit: 'l' }),
    o('b', 'lulu', 'almarai', 'Almarai Cooking Whipping Cream 500ml', 10, { value: 20, unit: 'l' })));
ok('one word beside the brand is a range, not a product',
  !same(o('a', 'farm', 'pantene', 'Pantene Shampoo 400ml', 20, { value: 50, unit: 'l' }),
    o('b', 'lulu', 'pantene', 'PANTENE SHAMPOO 190ML', 10, { value: 52, unit: 'l' })));

ok('two models of one appliance are two products (model codes are not sizes)',
  !same(o('a', 'lulu', 'tefal', 'Tefal Air Fryer EY855D40', 399, { value: 399, unit: 'piece' }),
    o('b', 'hyperpanda', 'tefal', 'Tefal Air Fryer, EY130840', 299, { value: 299, unit: 'piece' })));
ok('sizes and counts in any digits are not product words',
  same(o('a', 'lulu', 'almarai', 'Almarai Long Life Milk Full Fat 12×1L ١٢', 50, { value: 4.2, unit: 'l' }),
    o('b', 'danube', 'almarai', 'ALMARAI UHT FF MILK 4X1LTR', 18, { value: 4.5, unit: 'l' })));

// Measured 2026-11-20 on the pairs the engine's Product Registry joins and the
// word rule refused (owner's case: Tamimi / Prime / Farm Kiri jars).
const kiriTamimi = o('t:k', 'tamimi', 'kiri', 'KIRI CREAM CHEESE, 500 GRAMS', 22.99, { value: 45.98, unit: 'kg' });
ok('Kiri Cream Cheese = Kiri Spread Creamy Cheese Analogue = Kiri Cheese Creamy Jar',
  same(kiriTamimi, kiri) &&
  same(kiriTamimi, o('p:k', 'prime', 'kiri', 'KIRI CHEESE CREAMY JAR 500GM', 21, { value: 42, unit: 'kg' })));
ok('"spread" only on CREAM cheese: a cheddar tin is not the cheddar spread jar',
  !same(o('a', 'lulu', 'kraft', 'Kraft Cheddar Cheese 6x100g', 40, { value: 66, unit: 'kg' }),
    o('b', 'prime', 'kraft', 'Kraft Cheddar Cheese Spread 480 GM', 25, { value: 52, unit: 'kg' })));
ok('"analogue" only on cheese: Analogue Cream is not a one-word "Cream" range',
  same(o('a', 'amarket', 'almarai', 'ALMARAI ANALOGUE CREAM CAN', 4, { value: 23, unit: 'kg' }),
    o('b', 'tamimi', 'almarai', 'ALMARAI ANALOGUE CREAM, 170 GRAMS', 4, { value: 23, unit: 'kg' })));
ok('butter is not spreadable butter',
  !same(o('a', 'lulu', 'lurpak', 'Lurpak Butter Unsalted 400g', 30, { value: 75, unit: 'kg' }),
    o('b', 'farm', 'lurpak', 'Lurpak Spreadable Butter Unsalted 400g', 30, { value: 75, unit: 'kg' })));
ok('plurals meet: Squares / Square, Tomatoes / Tomato, Tissues / Tissue',
  same(o('a', 'prime', 'puck', 'Puck Cream Cheese Squares 432GM', 20, { value: 46, unit: 'kg' }),
    o('b', 'carrefour', 'puck', 'PUCK SQUARE CREAM CHEESE 432G', 20, { value: 46, unit: 'kg' })) &&
  same(o('a', 'danube', 'goody', 'Goody Sieved Tomato', 5, { value: 10, unit: 'kg' }),
    o('b', 'farm', 'goody', 'GOODY SIEVED TOMATOES', 5, { value: 10, unit: 'kg' })));
ok('EV is extra virgin', same(o('a', 'carrefour', 'afia', 'AFIA ORGANIC EV OLIVE OIL 500ML', 30, { value: 60, unit: 'l' }),
  o('b', 'farm', 'afia', 'AFIA ORGANIC OLIVE OIL EXTRA VIRGIN', 30, { value: 60, unit: 'l' })));
ok('light cooking cream is still not cooking cream',
  !same(o('a', 'lulu', 'puck', 'Puck Cooking Cream 500ml', 9, { value: 18, unit: 'l' }),
    o('b', 'danube', 'puck', 'Puck Light Cooking Cream 500ml', 9, { value: 18, unit: 'l' })));

// --- value, not shelf price ---------------------------------------------------------
// The owner's case: a 200 ml at a lower SHELF price is not cheaper when its
// price per litre is higher.
const juice500 = o('farm:j', 'farm', 'rani', 'Rani Float Orange Juice Drink 500ml', 4, { value: 8, unit: 'l' });
const juice200 = o('lulu:j', 'lulu', 'rani', 'Rani Float Orange Juice Drink 200ml', 2, { value: 10, unit: 'l' });
const juice1l = o('nesto:j', 'nesto', 'rani', 'Rani Float Orange Juice Drink 1L', 7, { value: 7, unit: 'l' });
const rows = sameProductRows(juice500, [juice200, juice1l]);
ok('ranked by price per litre, not shelf price', rows.map((r) => r.offer.store).join() === 'nesto,lulu');
ok('the 200 ml at 2.00 is 25% DEARER per litre', rows[1].pct === 25 && rows[1].by === 'value');
ok('the 1 L at 7.00 is 12.5% cheaper per litre', rows[0].pct === -12);
ok('a value 3× apart is a misread size, left out',
  sameProductRows(juice500, [o('m:j', 'makkah', 'rani', 'Rani Float Orange Juice Drink 500ml', 1, { value: 2, unit: 'l' })]).length === 0);
ok('a listing without a value is not ranked against one with it',
  sameProductRows(juice500, [o('m:k', 'makkah', 'rani', 'Rani Float Orange Juice Drink 500ml', 3, null)]).length === 0);
ok('the same store is not "elsewhere"', sameProductRows(juice500, [{ ...juice1l, store: 'farm' }]).length === 0);
ok('a size the engine could not tie to the price is not a value', valueOf({ ...juice1l, quantityReviewRequired: true }) === null);

// Without a value of its own, only the SAME size is compared, by price.
const noValue = { ...juice500, unitPrice: null };
const sizeRows = sameProductRows(noValue, [juice200, { ...juice500, id: 'x:j', store: 'tamimi', price: 3.5 }]);
ok('no value: the 200 ml is not compared with the 500 ml at all',
  sizeRows.length === 1 && sizeRows[0].offer.store === 'tamimi' && sizeRows[0].by === 'price' && sizeRows[0].pct === -12);

if (fail) {
  console.error(`\n${fail} test(s) failed (${pass} passed).`);
  process.exit(1);
}
console.log(`All same-product tests passed (${pass}).`);
