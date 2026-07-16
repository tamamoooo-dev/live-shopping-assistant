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
  productType, queryType, freshProduceIntent, isProcessedProduce, isProduceFamily, producePresence,
  matchStage, queryTokenPresence,
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
ok('OCR Farsi kaf in unit: 5 کجم', parseSize('رز بسمتي 5 کجم').total === 5000);
ok('OCR Farsi yeh in unit: 2 لیتر', parseSize('حليب 2 لیتر').total === 2000);
ok('count 30 pcs', (() => { const s = parseSize('Eggs 30 pcs'); return s.unit === 'pcs' && s.total === 30; })());
ok('arabic count-word pack: 24 قطعة × 125مل', (() => { const s = parseSize('حليب كامل الدسم، 24 قطعة × 125مل'); return s.pack === 24 && s.each === 125 && s.total === 3000; })());
ok('size × digits never doubles as multiplier', (() => { const s = parseSize('حليب × 125مل'); return s.pack === 1 && s.total === 125; })());
// --- bonus packs ("buy a, get b free": true count is a+b, prefer over OCR debris) ---
ok('bonus 8+2 -> 10 pcs', (() => { const s = parseSize('فاين مناديل سوبر 8+2 مجاناً 10 قطع', '10 حبة'); return s.unit === 'pcs' && s.total === 10; })());
ok('bonus 3+1 -> 4 pcs (over placeholder size)', (() => { const s = parseSize('كلينكس 3+1 مجانًا 4 قطع', '1 حبة'); return s.total === 4; })());
ok('bonus beats OCR count debris: 10+2 -> 12 not 28', (() => { const s = parseSize('أونو مناديل 12×28 عبوة 10+2 مجانًا 12 قطعة', '12 حبة'); return s.total === 12; })());
ok('bonus with unit 9+3 × 1L -> 12000 ml', (() => { const s = parseSize('عصير برتقال 9+3', '1 لتر'); return s.unit === 'ml' && s.pack === 12 && s.total === 12000; })());
ok('bonus 6+2 free 250 ml -> 2000 ml', (() => { const s = parseSize('Cola 6+2 free 250 ml'); return s.total === 2000; })());
ok('bonus with word between: 8 رول +2 -> 10 pcs', (() => { const s = parseSize('مناديل فاين 40 ورقة (8 رول +2 مجانا)'); return s.unit === 'pcs' && s.total === 10; })());
ok('non-bonus digits not read as a pack: Omega 3+6+9', (() => { const s = parseSize('Omega 3+6+9 Fish Oil'); return s.total !== 9 && s.total !== 15; })());
ok('bonus with size adjacent: 9+3 × 200 مل -> 2400 ml', (() => { const s = parseSize('عصير 9+3 × 200 مل'); return s.unit === 'ml' && s.pack === 12 && s.total === 2400; })());
ok('implausible bonus×size falls back to plain pack: 1+2 x 200ml', (() => { const s = parseSize('Promo 1+2 x 200ml'); return s.total === 400; })());
// --- packaging count words (rolls/boxes/tablets/…): the package's TRUE unit
// count, so "10+2 Free" and "12 Rolls" reach ONE interpretation (12 pcs).
ok('rolls count: 12 Rolls -> 12 pcs', (() => { const s = parseSize('Uno Kitchen Towels 12 Rolls'); return s.unit === 'pcs' && s.total === 12; })());
ok('arabic rolls count: ١٢ رول', (() => { const s = parseSize('أونو مناديل مطبخ ١٢ رول'); return s.unit === 'pcs' && s.total === 12; })());
ok('arabic لفه count: 12 لفة', (() => { const s = parseSize('مناديل تواليت 12 لفة'); return s.unit === 'pcs' && s.total === 12; })());
ok('tea sachets: 100 ظرف', (() => { const s = parseSize('شاي ليبتون 100 ظرف'); return s.unit === 'pcs' && s.total === 100; })());
ok('dishwasher tablets: 50 قرص', (() => { const s = parseSize('فيري بلاتينم 50 قرص'); return s.unit === 'pcs' && s.total === 50; })());
ok('EN tablets: 30 tablets', (() => { const s = parseSize('Finish Powerball 30 Tablets'); return s.unit === 'pcs' && s.total === 30; })());
ok('cans pack multiplies: 6 cans x 330ml -> 1980', (() => { const s = parseSize('Pepsi 6 cans x 330ml'); return s.unit === 'ml' && s.total === 1980; })());
ok('hamza count word folds: 10 أكياس', (() => { const s = parseSize('شاي 10 أكياس'); return s.unit === 'pcs' && s.total === 10; })());
ok('tea bags EN: 100 bags', (() => { const s = parseSize('Lipton Tea 100 Bags'); return s.unit === 'pcs' && s.total === 100; })());
ok('boxes AR: 6 علب', (() => { const s = parseSize('تونة ريو ماري 6 علب'); return s.unit === 'pcs' && s.total === 6; })());
ok('inner sheet counts stay unparsed (no wrong count)', parseSize('مناديل ورقية 500 منديل').unit === null);
// The milestone example: two stores, one package interpretation.
ok('ONE interpretation: 10+2 Free ≡ 12 Rolls', (() => {
  const a = parseSize('Uno Kitchen Towels 10+2 Free');
  const b = parseSize('Uno Kitchen Towels 12 Rolls');
  return a.unit === b.unit && a.total === b.total && a.total === 12;
})());
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
// Packaging Intelligence milestone: "10+2 Free" and "12 Rolls" are the SAME
// package — they must group as equivalents and carry the same unit price.
{
  const uno = groupEquivalents([
    { store: { id: 'a' }, it: { name: 'Uno Kitchen Towels 10+2 Free', brand: 'Uno', price: 39.95 } },
    { store: { id: 'b' }, it: { name: 'Uno Kitchen Towels 12 Rolls', brand: 'Uno', price: 39.95 } },
  ]);
  ok('bonus pack and explicit count group as one product', uno.some((g) => g.items.length === 2));
  const upA = unitPrice({ name: 'Uno Kitchen Towels 10+2 Free', price: 39.95 });
  const upB = unitPrice({ name: 'Uno Kitchen Towels 12 Rolls', price: 39.95 });
  ok('identical unit price across notations', upA && upB && near(upA.value, upB.value) && upA.unit === upB.unit);
}

// --- normalization ---
ok('normalize folds alef/diacritics', normalizeText('أَلبان') === normalizeText('البان'));
// D4D flyer OCR emits Farsi glyphs inside Arabic names — they must fold to the
// Arabic codepoints or lexicon keywords silently miss ("مربی" jam, "داری" brand).
ok('normalize folds Farsi yeh U+06CC', normalizeText('مربی') === normalizeText('مربي'));
ok('normalize folds Farsi kaf U+06A9', normalizeText('کیک') === normalizeText('كيك'));

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

// --- produce tier (fresh produce must outrank its derived/flavoured look-alikes) ---
ok('fresh tomatoes -> tomato family', productFamily('طماطم طازجه 1 كجم') === 'tomato');
ok('EN fresh tomatoes -> tomato family', productFamily('Fresh Tomatoes 1kg') === 'tomato');
ok('tomato paste -> sauce (derived beats produce)', productFamily('معجون طماطم 135 جم') === 'sauce');
ok('EN tomato paste -> sauce', productFamily('Tomato Paste 400g') === 'sauce');
ok('tomato ketchup -> sauce', productFamily('كاتشب طماطم هاينز') === 'sauce');
ok('tomato soup -> soup', productFamily('شوربة طماطم') === 'soup');
ok('fresh strawberry -> strawberry family', productFamily('فراولة طازجة 250 جم') === 'strawberry');
ok('strawberry milk -> milk (base beats produce, AR order)', productFamily('حليب فراولة 200 مل') === 'milk');
ok('strawberry milk -> milk (EN order too)', productFamily('Strawberry Milk 180ml') === 'milk');
ok('strawberry jam -> jam', productFamily('مربى الفراولة 450 جم') === 'jam');
ok('OCR Farsi yeh: مربی فراولة -> jam', productFamily('مربی بوني ماما فراولة 450 جم') === 'jam');
ok('OCR Farsi kaf+yeh: کیکة -> cake', productFamily('کیکة الفراولة') === 'cake');
ok('OCR Farsi yeh: داری is a frozen brand', isProcessedProduce('داری فراولة 1 كجم'));
ok('strawberry cake -> cake', productFamily('كيكة الفراولة') === 'cake');
ok('flavour marker never classifies as produce', productFamily('بنكهة الفراولة') === null);
ok('orange juice -> juice', productFamily('عصير برتقال 1 لتر') === 'juice');
ok('apple vinegar -> vinegar', productFamily('خل التفاح العضوي') === 'vinegar');
ok('strawberry soap -> care', productFamily('صابون فراولة') === 'care');
ok('cherry tomatoes stay tomato (EN cherry unmapped)', productFamily('Cherry Tomatoes 250g') === 'tomato');
ok('pickled cucumber -> pickle', productFamily('مخلل خيار') === 'pickle');
ok('orange soda -> soda', productFamily('فانتا برتقال 330 مل') === 'soda');
ok('query family: طماطم -> tomato', queryFamily('طماطم') === 'tomato');
ok('query family: فراولة -> strawberry', queryFamily('فراولة') === 'strawberry');
ok('produce synonym bridge: طماطم matches EN tomatoes', isRelevant({ name: 'Fresh Tomatoes 1kg' }, 'طماطم'));
ok('produce synonym bridge: فراولة matches EN strawberries', isRelevant({ name: 'Strawberries Punnet 250g' }, 'فراولة'));
ok('galaxy strawberry -> chocolate (brand keyword)', productFamily('جالكسي الفراولة 30غ') === 'chocolate');
ok('lollipop -> candy', productFamily('نونين لولي فراولة') === 'candy');
ok('malt drink -> soda', productFamily('هولستن فراولة 330 مل') === 'soda');
ok('strawberry-shaped toy -> toy', productFamily('لعبة اسفنجية على شكل فراولة') === 'toy');
ok('sardines in tomato sauce -> fish (accompaniment وصلصة stays attached)', productFamily('سردين بالفلفل الحار وصلصة الطماطم') === 'fish');
ok('tuna in tomato sauce stays fish', productFamily('تونة وصلصة طماطم') === 'fish');

// --- fresh-produce intent (bare produce query = the FRESH product) ---
ok('فراولة -> fresh strawberry intent', freshProduceIntent('فراولة') === 'strawberry');
ok('طماطم -> fresh tomato intent', freshProduceIntent('طماطم') === 'tomato');
ok('فراولة مجمدة -> intent OFF (processing named)', freshProduceIntent('فراولة مجمدة') === null);
ok('طماطم مقشرة -> intent OFF', freshProduceIntent('طماطم مقشرة') === null);
ok('حليب -> no produce intent (staple, not produce)', freshProduceIntent('حليب') === null);
ok('دجاج -> no produce intent (frozen chicken is normal)', freshProduceIntent('دجاج') === null);
ok('processed: فراولة مجمدة detected', isProcessedProduce('فراولة مجمدة 400 جم'));
ok('processed: definite article المجمدة detected', isProcessedProduce('الفراولة المجمدة'));
ok('processed: EN frozen detected', isProcessedProduce('Happy Farm Frozen Strawberry'));
ok('processed: canned peeled detected', isProcessedProduce('طماطم مقشرة معلبة 400 جم'));
ok('fresh punnet NOT processed', !isProcessedProduce('فراولة طازجة 250 جم'));
ok('frozen brand bag detected (مونتانا)', isProcessedProduce('مونتانا فراولة 1 كجم'));
ok('frozen brand bag detected (الكبير)', isProcessedProduce('الكبير فراوله 900 جم'));
ok('frozen brand detected in flyer OCR (sunbulah)', isProcessedProduce('السنبله sunbulah فراوله strawberry'));
ok('chocolate-coated strawberries are processed', isProcessedProduce('باسيتو فراولة مغطى بالشوكولاتة 80 جم'));
ok('chupa chups lollipop -> candy', productFamily('شوبا شوبس فراولة 29 جم') === 'candy');
ok('capri-sun مشروب -> syrup', productFamily('كابري صن مشروب الفراولة 200 مل') === 'syrup');
ok('freeze-dried fruit is processed', isProcessedProduce('AYUM Strawberry Freeze Dried Fruit 20g'));
ok('spelling شكولاته -> chocolate', productFamily('الفانيلا والشكولاته والفراوله ايس') === 'icecream' || productFamily('شكولاته بالفراوله') === 'chocolate');
ok('fresh intent survives a frozen-brand QUERY guard: ساديا is not produce', freshProduceIntent('صدور ساديا') === null);
ok('isProduceFamily: strawberry yes, milk no', isProduceFamily('strawberry') && !isProduceFamily('milk'));
ok('form on produce: رول فراولة carries a type', productType('أمريكانا رول فراولة صغيرة') === 'roll');
ok('lollipop plural مصاصات -> candy', productFamily('كيس مصاصات موو بالفراولة والشيكولاتة من لوليز') === 'candy');
ok('spelling variant شيكولاتة -> chocolate', productFamily('شيكولاتة بالفراولة') === 'chocolate');
ok('food colouring مسحوق -> powder', productFamily('مسحوق لون فراولة') === 'powder');
ok('presence: بالفراولة is a flavour, not the product', producePresence('كيس حلا بالفراولة', 'strawberry') === 'flavored');
ok('presence: بنكهة الفراولة is a flavour', producePresence('مشروب غريب بنكهة الفراولة', 'strawberry') === 'flavored');
ok('presence: فراولة طازجة is the product', producePresence('فراولة طازجة 250 جم', 'strawberry') === 'product');
ok('presence: standalone mention wins over flavoured', producePresence('فراولة مغطاة بالشوكولاتة الفراولة', 'strawberry') === 'product');
ok('presence: no mention -> null', producePresence('حليب المراعي 2 لتر', 'strawberry') === null);

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

// --- Search Roadmap: deterministic match stages (mirrors the engine) ---
// Rule 2 — single word: primary product-name matches come first; products where
// the word is only a flavour/ingredient/scent rank after ALL primary matches.
ok('stage: token-headed milk is primary (5)', matchStage({ name: 'Fresh Milk Full Fat 1 L' }, 'milk') === 5);
ok('stage: brand-led milk is primary but not head (4)', matchStage({ name: 'Almarai Fresh Milk 1 L' }, 'milk') === 4);
ok('stage: milk chocolate is secondary (1)', matchStage({ name: 'Milk Chocolate Bar 90g' }, 'milk') === 1);
// بال-attached SHORT tokens (حليب, 4 chars) never lexically match at all —
// stage 0 (dropped) is even stricter than the roadmap's "after all primary".
ok('stage: شوكولاته بالحليب ranks after every primary milk', matchStage({ name: 'شوكولاته بالحليب 90 جم' }, 'حليب') <= 1);
ok('stage: مصاصات بالفراولة is secondary (long token substring)', matchStage({ name: 'مصاصات بالفراولة' }, 'فراولة') === 1);
ok('stage: flavoured milk stays primary for حليب (directional marker)', matchStage({ name: 'حليب بنكهة الفراولة 200 مل' }, 'حليب') === 5);
ok('stage: same name is secondary for the flavour word فراولة', matchStage({ name: 'حليب بنكهة الفراولة 200 مل' }, 'فراولة') === 1);
ok('stage: strawberry milk secondary for فراولة (known different family)', matchStage({ name: 'حليب فراولة 200 مل' }, 'فراولة') === 1);
ok('stage: fresh strawberries primary for فراولة', matchStage({ name: 'فراولة طازجة 250 جم' }, 'فراولة') === 5);
ok('stage: EN scent match is secondary', matchStage({ name: 'Fairy Lemon Scented Dish Soap 1L' }, 'lemon') === 1);
ok('stage: substring-only single word is weak (2)', matchStage({ name: 'Kellogg Cornflakes 500g' }, 'flakes') === 2);
ok('stage: no match is 0', matchStage({ name: 'عصير برتقال 1 لتر' }, 'حليب') === 0);
ok('roadmap 2: every primary match outranks every flavour match', matchStage({ name: 'حليب نادك 1 لتر' }, 'حليب') > matchStage({ name: 'Milk Chocolate Bar 90g' }, 'milk'));
// Rule 3 — multi word: exact phrase first, every term mandatory before relaxing.
ok('stage: exact phrase is 5', matchStage({ name: 'حليب المراعي كامل الدسم 2 لتر' }, 'حليب المراعي') === 5);
ok('stage: brand field completes coverage (4)', matchStage({ name: 'حليب كامل الدسم 2 لتر', brand: 'المراعي' }, 'حليب المراعي') === 4);
ok('stage: EN phrase via synonym bridge', matchStage({ name: 'Almarai Fresh Milk 2L' }, 'fresh milk') === 5);
ok('stage: one term missing relaxes to 1', matchStage({ name: 'حليب نادك كامل الدسم 2 لتر' }, 'حليب المراعي') === 1);
ok('stage: unrelated product is 0', matchStage({ name: 'عصير برتقال 1 لتر' }, 'حليب المراعي') === 0);
ok('roadmap 3: a full match always beats a same-family partial match', matchStage({ name: 'حليب كامل الدسم', brand: 'المراعي' }, 'حليب المراعي') > matchStage({ name: 'حليب نادك كامل الدسم' }, 'حليب المراعي'));
// Head-first single-word rule (the ليمون example, as a general rule): products
// whose primary product name is HEADED by the token rank first; a token that
// trails a different head word, or a flavour/scent/different-family usage,
// never appears before the head matches are exhausted.
ok('head: bare ليمون is 5', matchStage({ name: 'ليمون' }, 'ليمون') === 5);
ok('head: ليمون اصفر is 5', matchStage({ name: 'ليمون اصفر' }, 'ليمون') === 5);
ok('head: ليمون كيلو is 5', matchStage({ name: 'ليمون كيلو' }, 'ليمون') === 5);
ok('head: الليمون الاخضر strips ال (5)', matchStage({ name: 'الليمون الاخضر' }, 'ليمون') === 5);
ok('head: Fresh Lemon 1kg skips the generic lead-in (5)', matchStage({ name: 'Fresh Lemon 1kg' }, 'ليمون') === 5);
ok('head: كلوروكس ليمون trails a different head (4)', matchStage({ name: 'كلوروكس ليمون' }, 'ليمون') === 4);
ok('head: عصير ليمون is a different family (1)', matchStage({ name: 'عصير ليمون 1 لتر' }, 'ليمون') === 1);
ok('head: حليب بنكهة الليمون is a flavour (1)', matchStage({ name: 'حليب بنكهة الليمون' }, 'ليمون') === 1);
ok('head: معطر برائحة الليمون is a scent (1)', matchStage({ name: 'معطر جو برائحة الليمون' }, 'ليمون') === 1);
ok('roadmap: trailing-token match never precedes head matches', matchStage({ name: 'كلوروكس ليمون' }, 'ليمون') < matchStage({ name: 'ليمون سعودي' }, 'ليمون'));
// queryTokenPresence — the generalized primary/secondary role detector.
ok('presence: standalone word is primary', queryTokenPresence('فراولة طازجة 250 جم', 'فراولة') === 'primary');
ok('presence: بال-attached is secondary', queryTokenPresence('مصاصات بالفراولة', 'فراولة') === 'secondary');
ok('presence: absent token is null', queryTokenPresence('حليب المراعي 2 لتر', 'فراولة') === null);
ok('presence: primary mention anywhere beats a secondary one', queryTokenPresence('فراولة مع شوكولاتة بالفراولة', 'فراولة') === 'primary');

console.log(`\nmatch.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
