// featured.test.mjs — offline, dependency-free tests for the Featured
// intelligence layer. Run with:  node src/featured.test.mjs  (repo root).
//
// Guards the milestone's promises (Search Intelligence):
//  • curated signals are category-aware (organic strawberries yes, organic
//    chips no) and bilingual (article-folded Arabic included),
//  • expected market behaviour is a soft, bounded penalty — never a filter,
//  • learning strengthens query→signal/brand relationships gradually, is
//    ranking-only, bounded, and survives a storage roundtrip,
//  • the score rewards signals WITHOUT demoting a generic product below a
//    sane-priced look-alike ordering (bounded boosts).

import {
  familyCategory, detectSignals, brandId, medianPrice, pricePenalty,
  learnKeyFor, recordChoice, learnedCounts, learnBoost, featuredScore,
  featuredContext, _setLearnStorage, isPrimaryPriceTier,
} from './featured.js';

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('FAIL:', name); } };
const near = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;

// In-memory Storage stand-in so the learning tests are hermetic.
const mem = new Map();
_setLearnStorage({
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
});

// --- category intelligence ---
ok('strawberry is produce', familyCategory('strawberry') === 'produce');
ok('milk is dairy', familyCategory('milk') === 'dairy');
ok('water is beverage', familyCategory('water') === 'beverage');
ok('chicken is meat', familyCategory('chicken') === 'meat');
ok('rice is pantry', familyCategory('rice') === 'pantry');
ok('no family -> general', familyCategory(null) === 'general');
ok('unknown family -> general', familyCategory('prepared') === 'general');

// --- curated signals (bilingual, whole-word, article-folded) ---
ok('organic EN', detectSignals('Organic Strawberries 250g').includes('organic'));
ok('organic AR w/ article', detectSignals('الفراولة العضوية').includes('organic'));
ok('local AR (بلدي)', detectSignals('ليمون بلدي').includes('local'));
ok('imported AR', detectSignals('فراولة مستوردة').includes('imported'));
ok('sharbatly brand AR', detectSignals('موز شربتلي').includes('brand:sharbatly'));
ok('del monte phrase EN', detectSignals('Del Monte Bananas').includes('brand:delmonte'));
ok('fat-spec phrase w/ article', detectSignals('حليب المراعي كامل الدسم').includes('fat-spec'));
ok('whole-word guard: اورجانيك not inside اورجانيكس', !detectSignals('اورجانيكس شامبو للاطفال').includes('organic'));
ok('chiquita transliteration تشيكيتا', detectSignals('موز تشيكيتا إكوادور').includes('brand:chiquita'));
ok('sweetened محلى never reads as local', !detectSignals('موز محلى من ماكاتي').includes('local'));
ok('local محلي (ya) still detected', detectSignals('موز محلي طازج').includes('local'));
ok('whole-word guard: fresh not in refreshing', !detectSignals('Refreshing drink').includes('fresh'));
ok('no signals in plain name', detectSignals('موز').length === 0);

// --- category-aware weighting via featuredScore ---
const noCtx = { median: null, learn: {} };
const scoreOf = (text, family, extra = {}) =>
  featuredScore({ text, brand: '', family, price: null, discount: 0, ...extra }, extra.ctx || noCtx);
ok('organic rewards produce', scoreOf('فراولة عضوية', 'strawberry') > scoreOf('فراولة', 'strawberry'));
ok('organic meaningless for chips category', near(scoreOf('Organic Chips', 'chips'), 0));
ok('fat-spec rewards dairy only', scoreOf('حليب كامل الدسم', 'milk') > 0 && near(scoreOf('عصير كامل الدسم', 'juice'), 0));
ok('generic produce not penalized (score 0, never negative w/o outlier)', scoreOf('موز', 'banana') === 0);
ok('curated boost bounded at 2', scoreOf('فراولة عضوية محلية طازجة فاخرة مستوردة شربتلي دريسكول', 'strawberry') <= 2);

// --- expected market behaviour (soft, bounded) ---
ok('median needs >=4 prices', medianPrice([1, 2, 3]) === null);
ok('median of pool', medianPrice([1, 2, 3, 4, 100]) === 3);
ok('free zone: 2x median unpenalized', pricePenalty(6, 3) === 0);
ok('free zone: half median unpenalized', pricePenalty(1.5, 3) === 0);
ok('4x median penalized', pricePenalty(12, 3) > 0);
ok('extreme outlier capped at 2.5', pricePenalty(1000, 3) === 2.5 && pricePenalty(0.01, 3) === 2.5);
ok('no price -> no penalty', pricePenalty(null, 3) === 0 && pricePenalty(5, null) === 0);
// as a ranking signal: an absurdly-priced signal product sinks below generic
const ctxMed = { median: 3, learn: {} };
ok('outlier signal product below sane generic',
  scoreOf('موز عضوي', 'banana', { price: 99, ctx: ctxMed }) < scoreOf('موز', 'banana', { price: 3.5, ctx: ctxMed }));

// --- learning (gradual, bounded, ranking-only) ---
ok('learn key: family beats token (bilingual convergence)',
  learnKeyFor('strawberry') === 'f:strawberry' && learnKeyFor('فراولة') === 'f:strawberry');
ok('learn key: brand-only query keys by token', learnKeyFor('المراعي') === 't:المراعي');
ok('no query -> no key', learnKeyFor('') === null);

recordChoice('فراولة', 'فراولة محلية طازجة', '');
let counts = learnedCounts('strawberry');
ok('choice recorded under the family across languages', counts.local === 1 && counts.fresh === 1);
for (let i = 0; i < 30; i++) recordChoice('strawberry', 'فراولة محلية', '');
counts = learnedCounts('فراولة');
ok('counts capped', counts.local <= 40);
ok('boost saturates and is bounded', learnBoost(counts, ['local']) === 0.75 && learnBoost({ a: 40, b: 40, c: 40 }, ['a', 'b', 'c']) === 1.5);
ok('gradual: 1 sighting < 10 sightings',
  learnBoost({ local: 1 }, ['local']) < learnBoost({ local: 10 }, ['local']));
// learned preference reorders equals: local strawberries now outrank imported
const learnedCtx = featuredContext('فراولة', []);
ok('learned local > imported for strawberry',
  featuredScore({ text: 'فراولة محلية', brand: '', family: 'strawberry', price: null, discount: 0 }, learnedCtx) >
  featuredScore({ text: 'فراولة مستوردة', brand: '', family: 'strawberry', price: null, discount: 0 }, learnedCtx));
// arbitrary brands learn through the explicit brand field
recordChoice('milk', 'Fresh Milk 2L', 'Almarai');
ok('brand id derived', brandId('Almarai') === 'b:almarai');
ok('brand choice recorded', learnedCounts('حليب')['b:almarai'] === 1);
ok('brand boost applies via brand field',
  featuredScore({ text: 'حليب', brand: 'Almarai', family: 'milk', price: null, discount: 0 }, featuredContext('milk', [])) >
  featuredScore({ text: 'حليب', brand: 'Nadec', family: 'milk', price: null, discount: 0 }, featuredContext('milk', [])));
// storage roundtrip really persisted
ok('persisted to storage', JSON.parse(mem.get('lsa.featured.learn.v1'))['f:milk']['b:almarai'] === 1);

// --- deal signal is small and honest ---
ok('discount adds a small boost', near(scoreOf('موز', 'banana', { discount: 0.3 }), 0.36));
ok('deal boost capped at 50% discount', near(scoreOf('موز', 'banana', { discount: 0.9 }), 0.6));

// --- THE LOWEST-PRICE CONTRACT (LOCKED — user directive 2026-07-16) ---
// Genuine matches form ONE price-only tier: no exactness signal (stage 5 vs 4,
// phrase vs whole-word, family-confirmation strength 3 vs 2) may split it.
// Do NOT weaken these assertions unless the user explicitly asks.
ok('single-word: headed (5) and trailing (4) primary are ONE tier',
  isPrimaryPriceTier(5, false, 3, 'milk') && isPrimaryPriceTier(4, false, 3, 'milk'));
ok('single-word: weak substring (2) is tail', !isPrimaryPriceTier(2, false, 3, 'milk'));
ok('single-word: flavour/secondary (1) is tail', !isPrimaryPriceTier(1, false, 3, 'milk'));
ok('multi-word: all full-coverage stages (5..2) are ONE tier',
  isPrimaryPriceTier(5, true, 3, 'milk') && isPrimaryPriceTier(2, true, 3, 'milk'));
ok('multi-word: a missing term (1) is tail', !isPrimaryPriceTier(1, true, 3, 'milk'));
ok('family bands 3 and 2 are ONE tier (confirmation strength never splits)',
  isPrimaryPriceTier(4, false, 3, 'strawberry') && isPrimaryPriceTier(4, false, 2, 'strawberry'));
ok('known different family / look-alike (band 0) is tail', !isPrimaryPriceTier(5, false, 0, 'milk'));
ok('weak family-less (band 1) is tail under a family query', !isPrimaryPriceTier(4, false, 1, 'milk'));
ok('family-less query: stage alone decides the tier',
  isPrimaryPriceTier(4, false, 0, null) && !isPrimaryPriceTier(2, false, 3, null));

// --- storage failure is silent (learning off, never a crash) ---
_setLearnStorage({ getItem: () => { throw new Error('boom'); }, setItem: () => { throw new Error('boom'); } });
recordChoice('فراولة', 'فراولة محلية', '');
ok('broken storage never throws', learnBoost(learnedCounts('فراولة'), ['local']) === 0);

console.log(`featured.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
