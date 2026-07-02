// match.test.mjs — offline, dependency-free tests for the search-intelligence
// module. Run with:  node src/match.test.mjs   (from the frontend repo root).
//
// Guards the rules that matter for honesty (HANDOFF "Search Intelligence"):
//  • sizes parse in Arabic + English, decimals survive ("2.85 L" ≠ 85 L),
//  • per-unit price is sane, look-alikes are demoted, off-topic is dropped,
//  • equivalent products group by brand+size and never merge different sizes.

import {
  parseSize, sizeLabel, unitPrice, isRelevant, relevance, groupEquivalents, normalizeText,
} from './match.js';

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('FAIL:', name); } };
const near = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;

// --- size parsing (EN + AR, decimals, packs) ---
ok('2 L -> 2000 ml', parseSize('Almarai Milk 2 L').total === 2000);
ok('decimal 2.85 L survives', parseSize('Nadec Milk Full Fat 2.85L', '2.85 ML').total === 2850);
ok('500 g -> 500', parseSize('Cheese 500 g').total === 500);
ok('5kg -> 5000', parseSize('Rice 5kg').total === 5000);
ok('pack 6 x 200 ml -> 1200', parseSize('Nadec 6 x 200 ml').total === 1200);
ok('pack 12x1l -> 12000', (() => { const s = parseSize('Nadec Multi Pack 12x1l', '1 L'); return s.total === 12000 && s.pack === 12; })());
ok('arabic 2 لتر -> 2000', parseSize('المراعي حليب 2 لتر').total === 2000);
ok('arabic كجم', parseSize('رز بسمتي 5 كجم').total === 5000);
ok('arabic-indic digits', parseSize('حليب ٢ لتر').total === 2000);
ok('count 30 pcs', (() => { const s = parseSize('Eggs 30 pcs'); return s.unit === 'pcs' && s.total === 30; })());
ok('sizeLabel', sizeLabel(parseSize('Milk 2 L')) === '2 L');

// --- unit price ---
ok('unit price 2L @12.5 = 6.25/L', near(unitPrice({ name: 'Milk 2 L', price: 12.5 }).value, 6.25));
ok('unit price 6x200ml @9 = 7.5/L', near(unitPrice({ name: 'Milk 6 x 200 ml', price: 9 }).value, 7.5));
ok('no size -> no unit price', unitPrice({ name: 'Milk', price: 5 }) === null);

// --- relevance / irrelevance ---
ok('plain milk kept + high', isRelevant({ name: 'Almarai Fresh Milk 1 L' }, 'milk') && relevance({ name: 'Almarai Fresh Milk 1 L' }, 'milk') >= 90);
ok('milk chocolate demoted below plain', relevance({ name: 'Milk Chocolate Bar 90g' }, 'milk') < relevance({ name: 'Fresh Milk 1 L' }, 'milk'));
ok('coffee dropped for milk', !isRelevant({ name: 'Nescafe Coffee Jar' }, 'milk'));
ok('arabic query matches arabic name', isRelevant({ name: 'حليب المراعي طازج 1 لتر' }, 'حليب'));
ok('arabic query drops juice', !isRelevant({ name: 'عصير برتقال' }, 'حليب'));

// --- equivalence grouping ---
const tagged = [
  { store: { id: 'lulu' }, it: { name: 'Almarai Fresh Milk Full Fat 1 L', brand: 'Almarai', price: 7 } },
  { store: { id: 'panda' }, it: { name: 'Almarai Full Fat Fresh Milk 1L', brand: 'Almarai', price: 7.5 } },
  { store: { id: 'ninja' }, it: { name: 'Almarai Fresh Milk Full Fat 2 L', brand: 'Almarai', price: 12.5 } },
  { store: { id: 'danube' }, it: { name: 'Nadec Fresh Milk 1 L', brand: 'Nadec', price: 6.5 } },
];
const groups = groupEquivalents(tagged.map((t) => ({ ...t })));
const almarai1L = groups.find((g) => g.items.length === 2);
ok('same brand+size groups across stores', !!almarai1L);
ok('different size NOT merged', !groups.some((g) => g.items.length === 2 && g.items.some((i) => i.it.price === 12.5)));
ok('different brand NOT merged', !groups.some((g) => g.items.some((i) => i.it.brand === 'Almarai') && g.items.some((i) => i.it.brand === 'Nadec')));

// --- normalization ---
ok('normalize folds alef/diacritics', normalizeText('أَلبان') === normalizeText('البان'));

console.log(`\nmatch.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
