// match.test.mjs — offline, dependency-free tests for the search-intelligence
// module. Run with:  node src/match.test.mjs   (from the frontend repo root).
//
// Guards the rules that matter for honesty (HANDOFF "Search Intelligence"):
//  • sizes parse in Arabic + English, decimals survive ("2.85 L" ≠ 85 L),
//  • per-unit price is sane, look-alikes are demoted, off-topic is dropped,
//  • equivalent products group by brand+size and never merge different sizes.

import {
  parseSize, sizeLabel, unitPrice, isRelevant, relevance, groupEquivalents, normalizeText,
  productFamily, queryFamily, tokenCoverage, categoryFamily, offerFamily,
  productType, queryType,
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
ok('arabic count-word pack: 24 قطعة × 125مل', (() => { const s = parseSize('حليب كامل الدسم، 24 قطعة × 125مل'); return s.pack === 24 && s.each === 125 && s.total === 3000; })());
ok('size × digits never doubles as multiplier', (() => { const s = parseSize('حليب × 125مل'); return s.pack === 1 && s.total === 125; })());
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
ok('eggs drops eggplant (short-stem prefix guard)', !isRelevant({ name: 'Round Eggplant' }, 'eggs'));
ok('eggs still keeps real eggs', isRelevant({ name: 'White Eggs Tray 30 pcs' }, 'eggs'));
ok('بيض drops بيضاء (white)', !isRelevant({ name: 'بصل ابيض طازج' }, 'بيض'));
ok('بيض keeps real eggs', isRelevant({ name: 'بيض ابيض ٣٠ حبه' }, 'بيض'));
ok('EN query matches AR staple via synonyms', isRelevant({ name: 'حليب المراعي 2 لتر' }, 'milk'));
ok('colloquial مويه matches water products', isRelevant({ name: 'مياه نوفا 330 مل' }, 'مويه'));
ok('مويه bridges to English water', isRelevant({ name: 'Nova Water 40x330ml' }, 'مويه'));
ok('tissue bridges to مناديل', isRelevant({ name: 'فاين مناديل للجيب' }, 'tissue'));
ok('شامبو bridges to shampoo', isRelevant({ name: 'Pantene Shampoo 400ml' }, 'شامبو'));
ok('brand transliteration: تايد matches Tide', isRelevant({ name: 'Tide Detergent 5kg' }, 'تايد'));
ok('brand transliteration: pepsi matches بيبسي', isRelevant({ name: 'بيبسي كولا 320 مل' }, 'pepsi'));

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

// --- product families ---
ok('milk name -> milk family', productFamily('حليب نادك منزوع الدسم 1 لتر') === 'milk');
ok('yogurt name -> yogurt family', productFamily('زبادي نادك منزوع الدسم') === 'yogurt');
ok('cheese (Kiri squares) -> cheese', productFamily('جبنة كيري مربعات ٨ قطع') === 'cheese');
ok('puff pastry -> pastry', productFamily('عجينة بف باستري مربعات') === 'pastry');
ok('derived beats base: milk chocolate -> chocolate', productFamily('Milk Chocolate Bar 90g') === 'chocolate');
ok('derived beats base: egg spring roll pastry -> pastry', productFamily('egg spring roll pastry 550g') === 'pastry');
ok('definite article strips: الحليب -> milk', productFamily('الحليب الطازج كامل الدسم') === 'milk');
ok('ingredient marker بال does NOT classify: بالبيض stays non-eggs', productFamily('رقايق بالبيض') !== 'eggs');
ok('no family keyword -> null', productFamily('كرسي مكتب دوار') === null);
ok('query family: حليب -> milk', queryFamily('حليب نادك') === 'milk');
ok('query family: brand-only query -> null', queryFamily('كيري مربعات') === null);

// --- product types (the FORM attribute: brand+family shared, still different) ---
ok('type: nuggets classified', productType('Herfy Chicken Nuggets 750g') === 'nuggets');
ok('type: minced-roll classifies (earliest form wins)', productType('Herfy Minced Chicken Roll') === 'mince');
ok('type: نجتس arabic nuggets', productType('هرفي دجاج ناجتس') === 'nuggets');
ok('type: plain chicken has no type', productType('Fresh Whole Chicken 1kg') === null);
ok('type: milk has no type', productType('Almarai Fresh Milk 2 L') === null);
ok('queryType: "chicken nuggets" -> nuggets', queryType('chicken nuggets') === 'nuggets');
ok('queryType: bare "chicken" -> null', queryType('chicken') === null);
// The milestone case: same brand + family, different form -> NOT the same product.
{
  const grp = groupEquivalents([
    { store: { id: 'a' }, it: { name: 'Herfy Chicken Nuggets 400 g', brand: 'Herfy', price: 12 } },
    { store: { id: 'b' }, it: { name: 'Herfy Minced Chicken Roll 400 g', brand: 'Herfy', price: 11 } },
  ]);
  ok('type: nuggets and chicken-roll never group as same product', !grp.some((g) => g.items.length === 2));
}
// A plain-chicken listing with no form is not split from a typed one (no guessing).
{
  const grp = groupEquivalents([
    { store: { id: 'a' }, it: { name: 'Sadia Chicken Nuggets 400 g', brand: 'Sadia', price: 12 } },
    { store: { id: 'b' }, it: { name: 'Sadia Chicken Nuggets 400 g', brand: 'Sadia', price: 13 } },
  ]);
  ok('type: identical nuggets still group', grp.some((g) => g.items.length === 2));
}

// --- category-as-family (retailer-taxonomy signal; mirrors the engine) ---
ok('category eggs -> eggs family', categoryFamily('eggs') === 'eggs');
ok('category chocolates-candies -> chocolate', categoryFamily('chocolates-candies') === 'chocolate');
ok('ambiguous category milk-laban unmapped', categoryFamily('milk-laban') === null);
ok('offerFamily: name wins over category', offerFamily({ name: 'Milk Chocolate Bar', category: 'chocolates-candies' }) === 'chocolate');
ok('offerFamily: category recovers a debris name', offerFamily({ name: 'casc 18 200ml', category: 'eggs' }) === 'eggs');
ok('offerFamily: ambiguous category not used', offerFamily({ name: 'weekly promo', category: 'tea-coffee' }) === null);

// --- token coverage ---
ok('full coverage on a real match', tokenCoverage({ name: 'جبنة كيري مربعات 8 قطع' }, 'كيري مربعات') === 1);
ok('half coverage on the pastry look-alike', tokenCoverage({ name: 'عجينة بف باستري مربعات' }, 'كيري مربعات') === 0.5);
ok('skimmed synonym bridges منزوع/خالي', tokenCoverage({ name: 'حليب نادك خالي الدسم' }, 'نادك منزوع الدسم') === 1);

console.log(`\nmatch.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
