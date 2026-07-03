// compare.test.mjs — offline, dependency-free tests for the Price Comparison
// Engine. Run with:  node src/compare.test.mjs   (from the frontend repo root).
//
// Guards the rules the milestone is about:
//  • the best buy is decided by per-unit VALUE, not the smallest total price
//    (the "6-pack vs 30-pack of eggs" bug),
//  • flyer offers compete as first-class candidates and can win the headline,
//  • irrelevant flyer offers never enter the comparison,
//  • the outlier guard keeps size-parse errors out of the recommendation,
//  • the honest-confidence ladder (equivalence > unit price > low) survives.

import { computeComparison, bestValueAnalysis, flyerListing, unitPriceLabel } from './compare.js';

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('FAIL:', name); } };
const near = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;

const S = (id) => ({ id, label: id[0].toUpperCase() + id.slice(1) });
const T = (store, name, price, extra = {}) => ({ store: S(store), it: { name, price, currency: 'SAR', link: `https://${store}/x`, ...extra } });
const label = (id) => id;

// --- THE core case: eggs — 30-pack (better value) must beat 6-pack (cheaper) ---
{
  const tagged = [
    T('panda', 'White Eggs 6 pcs', 5),
    T('lulu', 'White Eggs Tray 30 pcs', 18),
    T('danube', 'Brown Eggs 15 pcs', 11),
  ];
  const c = computeComparison('eggs', tagged, [], null, label);
  ok('eggs: headline is the 30-pack (0.60/pc beats 0.83/pc)', c.headline.listing.name.includes('30'));
  ok('eggs: headline kind is best-value', c.headline.kind === 'best-value');
  ok('eggs: cheapest 6-pack kept as the secondary option', c.secondary && c.secondary.listing.price === 5);
  ok('eggs: unit family is pc', c.unitFamily === 'pc');
  ok('eggs: confidence medium (unit-price comparison)', c.confidence === 'medium');
}

// --- when the cheapest IS the best value, one unambiguous "best buy" -----------
{
  const tagged = [
    T('panda', 'Almarai Milk 2 L', 11), // 5.50/L
    T('lulu', 'Almarai Milk 2 L', 12.5), // 6.25/L
    T('danube', 'Nadec Milk 1 L', 5.4), // 5.40/L AND the lowest total
  ];
  const c = computeComparison('milk', tagged, [], null, label);
  ok('best-buy: cheapest+best-value collapse into one headline', c.headline.kind === 'best-buy' && c.headline.listing.price === 5.4);
  ok('best-buy: no secondary needed', !c.secondary);
}

// --- high confidence when the headline is a verified same-product group ---------
{
  const tagged = [
    T('panda', 'Almarai Milk 2 L', 11, { brand: 'Almarai' }),
    T('lulu', 'Almarai Milk 2 L', 12.5, { brand: 'Almarai' }),
  ];
  const c = computeComparison('milk', tagged, [], null, label);
  ok('equivalence: headline is the cheaper of the same product', c.headline.listing.price === 11);
  ok('equivalence: group spans 2 stores', c.equivalent && c.equivalent.stores === 2);
  ok('equivalence: confidence high (same product compared)', c.confidence === 'high');
}

// --- equal value, less money -> cheapest wins ----------------------------------
{
  const tagged = [
    T('panda', 'Rice 5 kg', 25), // 5.00/kg
    T('lulu', 'Rice 10 kg', 48), // 4.80/kg — only ~4% better than 5.00
  ];
  const c = computeComparison('rice', tagged, [], null, label);
  ok('margin: <10% value edge does not displace the cheaper option', c.headline.listing.price === 25 && c.headline.kind === 'best-buy');
}

// --- flyer offers are first-class candidates ------------------------------------
{
  const tagged = [T('panda', 'Almarai Fresh Milk 2 L', 12)];
  const offers = [
    { store: 'othaim', name: 'nadec fresh milk 2l', price: 8, currency: 'SAR', sourceUrl: 'https://agg/f/1' },
    { store: 'ramez', name: 'white onions', nameAr: 'بصل ابيض', price: 2, currency: 'SAR' }, // irrelevant
  ];
  const c = computeComparison('milk', tagged, offers, null, label);
  ok('flyer: relevant flyer offer wins the headline', c.headline.listing.source === 'flyer' && c.headline.listing.price === 8);
  ok('flyer: irrelevant offer (onions) never entered', !c.listings.some((l) => /onion/i.test(l.name)));
  ok('flyer: flyerCount reflects only relevant offers', c.flyerCount === 1);
  ok('flyer: flyer listing keeps its click-through link', c.headline.listing.link === 'https://agg/f/1');
}

// --- flyer listings never claim high-confidence equivalence ---------------------
{
  const tagged = [
    T('panda', 'Almarai Milk 2 L', 12, { brand: 'Almarai' }),
    T('lulu', 'Almarai Milk 2 L', 12.5, { brand: 'Almarai' }),
  ];
  const offers = [{ store: 'othaim', name: 'almarai milk 2l', price: 8, currency: 'SAR' }];
  const c = computeComparison('milk', tagged, offers, null, label);
  ok('flyer headline caps confidence at medium', c.headline.listing.source === 'flyer' && c.confidence !== 'high');
}

// --- the outlier guard: a parse error must not become the recommendation --------
{
  const listings = [
    { up: { value: 6.0, unit: 'L' }, price: 12, name: 'a' },
    { up: { value: 5.5, unit: 'L' }, price: 11, name: 'b' },
    { up: { value: 0.19, unit: 'L' }, price: 9, name: 'parse-error' }, // 29× off median
  ];
  const v = bestValueAnalysis(listings);
  ok('outlier: implausible unit price dropped', v.best.name === 'b' && v.dropped === 1);
}

// --- no sizes at all -> honest low-confidence cheapest ---------------------------
{
  const tagged = [T('panda', 'Shampoo', 15), T('lulu', 'Shampoo Extra', 12)];
  const c = computeComparison('shampoo', tagged, [], null, label);
  ok('no sizes: cheapest with low confidence', c.headline.kind === 'cheapest' && c.confidence === 'low');
}

// --- history verdict is computed against today's best total price ---------------
{
  const tagged = [T('panda', 'Milk 2 L', 12)];
  const prices = { lowest: { price: 12, store: 'lulu' }, latest: [{ store: 'lulu', price: 13 }] };
  const c = computeComparison('milk', tagged, [], prices, label);
  ok('history: at-low verdict when today matches the record', c.history && c.history.verdict === 'at-low');
}

// --- listing helpers -------------------------------------------------------------
{
  const l = flyerListing({ store: 'othaim', name: 'white eggs 30 pcs', price: 18, currency: 'SAR' }, 'eggs', label);
  ok('flyerListing parses size from OCR name', l && l.size.unit === 'pcs' && l.size.total === 30);
  ok('unitPriceLabel renders', unitPriceLabel(l) === '0.6 SAR/pc');
  ok('flyerListing rejects nameless offers', flyerListing({ store: 'x', price: 5 }, 'eggs', label) === null);

  // Bilingual gate: the product-type word often lands in only ONE derived
  // name (EN name is the flavour line, AR name says عصير). The listing must
  // qualify over BOTH names — dropping these starved the flyer coverage.
  const bi = flyerListing(
    { store: 'farm', name: 'guava raspberry pomegranate 3ltr', nameAr: 'ندي عصير كوكتيل فواكه', price: 9 },
    'juice',
    label,
  );
  ok('flyerListing matches via the OTHER language name', !!bi);
  ok('flyerListing shows EN name for an EN query', bi && bi.name === 'guava raspberry pomegranate 3ltr');
  const biAr = flyerListing(
    { store: 'farm', name: 'guava raspberry pomegranate 3ltr', nameAr: 'ندي عصير كوكتيل فواكه', price: 9 },
    'عصير',
    label,
  );
  ok('flyerListing prefers the AR name for an AR query', biAr && biAr.name === 'ندي عصير كوكتيل فواكه');
  ok(
    'flyerListing still rejects offers relevant in NEITHER name',
    flyerListing({ store: 'farm', name: 'office chair', nameAr: 'كرسي مكتب', price: 99 }, 'juice', label) === null,
  );

  // Category-as-family: a debris-named eggs offer whose name yields no family
  // gets its family from the aggregator category (offerFamily fallback), so the
  // family gate can still reason about it. Name still wins when present.
  const debris = flyerListing({ store: 'makkah', name: 'fresh eggs 30', category: 'eggs', price: 9 }, 'eggs', label);
  ok('flyerListing sets family from category when name is thin', debris && debris.family === 'eggs');
  const namedChoc = flyerListing({ store: 'makkah', name: 'milk chocolate bar 90g', category: 'chocolates-candies', price: 4 }, 'chocolate', label);
  ok('flyerListing name family wins over category', namedChoc && namedChoc.family === 'chocolate');
}

// --- PRODUCT FAMILIES: different families never compete --------------------------
// The real-world bug: "نادك منزوع الدسم" suggested a yogurt as the cheapest
// alternative to milk. All tokens match the yogurt too — only the family
// layer can separate them.
{
  const tagged = [
    T('panda', 'حليب نادك طويل الاجل منزوع الدسم 1 لتر', 6.5),
    T('lulu', 'حليب نادك منزوع الدسم 1 لتر', 6.75),
    T('danube', 'زبادي نادك منزوع الدسم 170 جم', 2.5), // yogurt — different family
  ];
  const c = computeComparison('نادك منزوع الدسم', tagged, [], null, label);
  ok('family: yogurt excluded from a milk-dominant comparison', !c.listings.some((l) => l.name.includes('زبادي')));
  ok('family: headline is a milk', c.headline.listing.name.includes('حليب'));
  ok('family: exclusion is counted', c.familyExcluded === 1);
}

// --- COVERAGE: a look-alike matching only one of two tokens never competes -------
// The real-world bug: "كيري مربعات" recommended puff pastry (matches only
// "مربعات"/squares, never the brand).
{
  const tagged = [
    T('panda', 'جبنة كيري مربعات 8 قطع 108 جم', 12.5),
    T('lulu', 'كيري جبنة مربعات ٨ قطع', 13),
    T('danube', 'عجينة بف باستري مربعات 400 جم', 7.95), // puff pastry look-alike
  ];
  const c = computeComparison('كيري مربعات', tagged, [], null, label);
  ok('coverage: puff pastry never enters the comparison', !c.listings.some((l) => l.name.includes('عجينه') || l.name.includes('عجينة')));
  ok('coverage: headline is a Kiri cheese', c.headline.listing.name.includes('كيري'));
}

// --- family classification handles derived products -------------------------------
{
  const tagged = [
    T('panda', 'Almarai Fresh Milk 2 L', 12),
    T('lulu', 'Nadec Milk 2 L', 11.5),
    T('danube', 'Milk Chocolate Bar 100 g', 3), // derived family: chocolate
  ];
  const c = computeComparison('milk', tagged, [], null, label);
  ok('family: milk chocolate never competes with milk', !c.listings.some((l) => /chocolate/i.test(l.name)));
}

// --- flyer offers respect the family gate too --------------------------------------
{
  const tagged = [T('panda', 'White Eggs Tray 30 pcs', 11.95)];
  const offers = [
    { store: 'nesto', name: 'egg spring roll pastry 550g', price: 3.49, currency: 'SAR' }, // pastry
    { store: 'prime', name: 'egg tray 30 pcs', price: 9.95, currency: 'SAR' },
  ];
  const c = computeComparison('eggs', tagged, offers, null, label);
  ok('family: egg pastry flyer offer excluded', !c.listings.some((l) => /pastry/i.test(l.name)));
  ok('family: real egg tray flyer offer competes and wins', c.headline.listing.price === 9.95 && c.headline.listing.source === 'flyer');
}

// --- SHARED BEST PRICE: same product, same price, several stores --------------------
{
  const tagged = [
    T('panda', 'Almarai Milk 2 L', 11, { brand: 'Almarai' }),
    T('lulu', 'Almarai Milk 2 L', 11, { brand: 'Almarai' }),
    T('danube', 'Almarai Milk 2 L', 12, { brand: 'Almarai' }),
  ];
  const c = computeComparison('milk', tagged, [], null, label);
  ok('shared: best price attributed to both stores', c.sharedWith.length === 1 && ['panda', 'lulu'].includes(c.sharedWith[0].id));
  ok('shared: pricier store not in the shared set', !c.sharedWith.some((s) => s.id === 'danube'));
}

// --- shared best price requires the same product, not just the same number ----------
{
  const tagged = [
    T('panda', 'Almarai Milk 2 L', 11),
    T('lulu', 'Dishwashing Liquid 1 L', 11), // same price, different thing
  ];
  const c = computeComparison('milk', tagged, [], null, label);
  ok('shared: a coincidental equal price on a different product does not share', c.sharedWith.length === 0);
}

console.log(`\ncompare.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
