// viewer/sameProduct.js — the brochure card's store comparison ("Available
// elsewhere"), made exact (owner, 2026-11-20: "same product, should be exactly
// the same … the size does not matter, the value matters … it compares 200 ml
// with 500 ml and cites the 200 as cheaper").
//
// Two questions, answered separately:
//   1. Is the other listing THE SAME PRODUCT? Same brand, same product, same
//      variant (full fat ≠ low fat, fresh ≠ long-life, milk ≠ laban, plain ≠
//      strawberry). Any size, any pack. The conflict rules are the engine's
//      Value Watch rules (brochure-engine src/watchValue.js, measured on 2,505
//      live candidates 2026-11-03), but there is no AI judge here: whatever the
//      rules cannot settle is LEFT OUT. A missing row costs nothing; a wrong
//      "cheaper at" sends the shopper to the wrong store.
//   2. Which is the better VALUE? The engine's own price per kg / L / piece
//      (`offer.unitPrice`, already corrected for "2 PCS" deals and packs). A
//      listing without one is not ranked; nothing is divided client-side.
//
// Pure functions, no I/O.

import { normalizeText, offerPackageSize } from '../match.js';

// --- text -------------------------------------------------------------------------

// Same-meaning spellings folded to one, so "UHT FF" and "long life full fat"
// are the same words. Applied to normalized text padded with spaces.
const FOLDS = [
  [/ uht /g, ' long life '],
  [/ long ?life /g, ' long life '],
  [/ ff /g, ' full fat '],
  [/ full cream /g, ' full fat '],
  [/ whole milk /g, ' full fat milk '],
  [/ lf /g, ' low fat '],
  [/ analog /g, ' analogue '],
  [/ طويله الاجل /g, ' طويل الاجل '],
];

// Words that say nothing about WHICH product it is: packaging, units, flyer
// filler. Sizes and counts go with the digits.
const NOISE = new Set([
  'pack', 'pk', 'pcs', 'pc', 'piece', 'pieces', 'x', 'carton', 'ctn', 'bottle', 'bottles', 'jar', 'can', 'cans',
  'tin', 'tins', 'box', 'bag', 'pouch', 'tub', 'cup', 'promo', 'promotion', 'offer', 'special', 'price', 'free',
  'value', 'saver', 'economy', 'family', 'size', 'new', 'each', 'per', 'with', 'and', 'the', 'of', 'in', 'for',
  'g', 'gm', 'gms', 'gr', 'grm', 'gram', 'grams', 'kg', 'kgs', 'kilo', 'ml', 'l', 'lt', 'ltr', 'ltrs', 'litre',
  'liter', 'litres', 'liters', 'oz', 'approx',
  'حبه', 'حبات', 'حبتين', 'قطعه', 'قطع', 'كرتون', 'كرتونه', 'علبه', 'علب', 'عبوه', 'عبوات', 'كيس', 'اكياس',
  'برطمان', 'قاروره', 'كوب', 'عرض', 'خاص', 'مجانا', 'مجاني', 'جديد', 'سعر', 'توفير', 'ترويجيه', 'جم', 'جرام',
  'غرام', 'غم', 'كجم', 'كغ', 'كيلو', 'كيلوجرام', 'مل', 'ملي', 'لتر', 'لترات', 'من', 'مع', 'في', 'و',
]);

// A light English stem so "creamy"/"cream", "spreadable"/"spread" and plurals
// meet. Applied to both sides, so it can only join spellings, never split one.
function stem(token) {
  if (!/^[a-z]+$/.test(token) || token.length <= 4) return token;
  return token
    .replace(/ies$/, 'y')
    .replace(/able$/, '')
    .replace(/(?<=[a-z]{3})(es|s)$/, '')
    .replace(/(?<=[a-z]{3})y$/, '');
}

function folded(text) {
  let s = ` ${normalizeText(text)} `;
  for (const [re, to] of FOLDS) s = s.replace(re, to);
  return s;
}

function brandWords(offer) {
  const words = new Set();
  for (const b of [offer.brandNameEn, offer.brandNameAr, String(offer.brandSlug || '').replace(/-/g, ' ')]) {
    for (const w of normalizeText(b).split(' ')) {
      if (!w) continue;
      words.add(stem(w));
      words.add(w.replace(/^(وال|ال)/, ''));
    }
  }
  return words;
}

// A size, count or pack written as one token: "500gr", "1ltr", "x18",
// "2x500g", "5+1", "24s", "١٢". A model code that mixes letters and digits
// ("EY855D40", "A54") is NOT a size: it names the product, and two models of
// one air fryer must never match (measured 2026-11-20, Tefal EY855D40 /
// EY130840).
const HAS_DIGIT = /[\d٠-٩۰-۹]/;
const SIZE_TOKEN = /^(?:x?[\d٠-٩۰-۹.,+×x]+(?:g|gm|gms|gr|grm|grams?|kg|kgs|kilo|ml|cl|l|lt|ltr|ltrs|litres?|liters?|oz|pcs?|s|in1|n1|gb|tb)?|(?:pcs?|pk|pack|x|in)[\d٠-٩۰-۹]+)$/;

// The words that name the product, without brand, size, count or packaging.
export function coreWords(text, brand = new Set()) {
  const out = new Set();
  for (const raw of folded(text).split(' ')) {
    if (!raw || (HAS_DIGIT.test(raw) && SIZE_TOKEN.test(raw))) continue;
    const w = stem(raw.replace(/^(وال|ال)/, '').length >= 2 ? raw.replace(/^(وال|ال)/, '') : raw);
    if (w.length < 2 || NOISE.has(w) || NOISE.has(raw) || brand.has(w) || brand.has(raw)) continue;
    out.add(w);
  }
  return out;
}

// --- conflicts (ported from the engine's Value Watch) ------------------------------

const foldPhrase = (text) => ` ${String(text || '').normalize('NFKC').toLowerCase()
  .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim()} `;

const CONFLICT_GROUPS = {
  fat: {
    'full fat': ['كامل الدسم', 'full fat', 'full cream', 'whole milk'],
    'low fat': ['قليل الدسم', 'ق الدسم', 'low fat', 'semi skimmed', 'light', 'lite'],
    skimmed: ['خالي الدسم', 'منزوع الدسم', 'skimmed', 'skim', 'fat free', 'non fat'],
  },
  freshness: {
    fresh: ['طازج', 'fresh'],
    'long-life': ['طويل الاجل', 'long life', 'uht'],
  },
  dairy: {
    milk: ['حليب', 'milk'],
    laban: ['لبن', 'laban'],
    yogurt: ['زبادي', 'روب', 'yogurt', 'yoghurt'],
  },
  medium: {
    oil: ['زيت', 'oil'],
    water: ['بالماء', 'ماء وملح', 'الماء والملح', 'محلول ملحي', 'محلول مالح', 'brine', 'in water', 'spring water'],
  },
  oil: {
    sunflower: ['دوار الشمس', 'دوار شمس', 'sunflower'],
    olive: ['زيت الزيتون', 'زيت زيتون', 'olive oil'],
    corn: ['زيت الذره', 'زيت ذره', 'corn oil'],
    soy: ['صويا', 'soybean oil', 'soya'],
  },
  sugar: {
    regular: [],
    zero: ['zero', 'diet', 'sugar free', 'no sugar', 'no added sugar', 'بدون سكر', 'خالي من السكر', 'دايت', 'زيرو'],
  },
};
const FOLDED_GROUPS = Object.entries(CONFLICT_GROUPS).map(([group, values]) => [
  group, Object.entries(values).map(([value, phrases]) => [value, phrases.map(foldPhrase)]),
]);
const statedValues = (text, values) =>
  values.filter(([, phrases]) => phrases.some((p) => text.includes(p))).map(([value]) => value);

// Flavours as whole words (with Arabic clitics: و / ف, then ب / ل / ك, then ال).
const FLAVOURS = {
  lemon: ['ليمون', 'lemon'], lime: ['لايم', 'lime'], pepper: ['فلفل', 'pepper'],
  chili: ['حار', 'شطه', 'هالبينو', 'chili', 'chilli', 'spicy', 'jalapeno', 'hot'],
  garlic: ['ثوم', 'garlic'], strawberry: ['فراوله', 'strawberry'],
  chocolate: ['شوكولاته', 'شوكولا', 'كاكاو', 'chocolate', 'choco', 'cocoa'],
  banana: ['موز', 'banana'], vanilla: ['فانيليا', 'فانيلا', 'vanilla'], mango: ['مانجو', 'mango'],
  dates: ['تمر', 'dates'], cherry: ['كرز', 'cherry'], orange: ['برتقال', 'orange'],
  mint: ['نعناع', 'mint'], tomato: ['طماطم', 'tomato'], herbs: ['اعشاب', 'herbs'],
  smoked: ['مدخن', 'smoked'], curry: ['كاري', 'curry'], bbq: ['باربكيو', 'bbq', 'barbecue'],
  saffron: ['زعفران', 'saffron'], cardamom: ['هيل', 'cardamom'], honey: ['عسل', 'honey'],
  coffee: ['قهوه', 'coffee'], caramel: ['كراميل', 'caramel'], apple: ['تفاح', 'apple'],
  berry: ['توت', 'berry', 'blueberry', 'raspberry'], peach: ['خوخ', 'peach'], pineapple: ['اناناس', 'pineapple'],
  grape: ['عنب', 'grape'], cheese: ['بالجبن', 'بالجبنه'], salt: ['بالملح', 'salted'],
};
const wordPattern = (w) => new RegExp(String.raw`\s(?:[وف]?[بلك]?(?:ال)?)` + foldPhrase(w).trim() + String.raw`(?=\s)`, 'u');
const FLAVOUR_WORDS = Object.entries(FLAVOURS).map(([flavour, words]) => [flavour, words.map(wordPattern)]);
const flavoursOf = (text) => FLAVOUR_WORDS.filter(([, words]) => words.some((w) => w.test(text))).map(([f]) => f);

// An assortment price covers several products and cannot prove this one is
// among them ("ASSORTED", "COCO POPS OR FROSTIES", "SKIMMED/LOW FAT").
const ASSORTMENT = [
  'assorted', 'assortment', 'selected', 'all types', 'all flavours', 'all flavors', 'various', 'varieties',
  'variety pack', 'combo', 'or', 'متنوع', 'متنوعه', 'منوع', 'منوعه', 'تشكيله', 'اصناف', 'مختاره', 'بانواعها',
  'بانواعه', 'جميع الانواع', 'كل الانواع', 'او',
].map(wordPattern);
const CHOICE_SLASH = /\p{L}\s*\/\s*\p{L}/u;
const isAssortment = (offer) => [offer.name, offer.nameAr].some((t) =>
  typeof t === 'string' && (ASSORTMENT.some((p) => p.test(foldPhrase(t))) || CHOICE_SLASH.test(t.normalize('NFKC'))));

// --- the decision ------------------------------------------------------------------

const textOf = (o) => [o.name, o.nameAr].filter(Boolean).join(' · ');
const subset = (a, b) => [...a].every((w) => b.has(w));

// Is `other` the same product as `anchor`, in any size? { same, why }.
export function sameProduct(anchor, other) {
  if (!anchor || !other) return { same: false, why: 'missing' };
  // Brand: both known and equal. One side unknown is not proof either way, so
  // it stays out; two unbranded listings must then agree word for word.
  const a = anchor.brandSlug || null;
  const b = other.brandSlug || null;
  if (a || b) {
    if (!a || !b) return { same: false, why: 'brand unknown on one side' };
    if (a !== b) return { same: false, why: `another brand: ${b}` };
  }
  if (isAssortment(anchor) || isAssortment(other)) return { same: false, why: 'assortment price' };
  const at = foldPhrase(folded(textOf(anchor)));
  const ot = foldPhrase(folded(textOf(other)));
  for (const [group, values] of FOLDED_GROUPS) {
    const x = statedValues(at, values);
    const y = statedValues(ot, values);
    if (group === 'sugar' ? x.length !== y.length : x.length === 1 && y.length === 1 && x[0] !== y[0]) {
      return { same: false, why: `${group} differs` };
    }
  }
  const fa = flavoursOf(at);
  const fo = flavoursOf(ot);
  if (fa.join() !== fo.join()) return { same: false, why: `flavour: ${fa.join('+') || 'plain'} ≠ ${fo.join('+') || 'plain'}` };
  // (No family/type check: the product words below must be identical anyway,
  // and the family reader goes by word order — "Kiri Analogue Spread Cream
  // Cheese" read as cream, "Kiri Spread Creamy Cheese" as cheese.)
  // The words that name the product must be THE SAME words. English is the
  // Vision reading on both sides when it exists; Arabic only when one side has
  // no English. Allowing one extra word was measured on this week's 15,214
  // brochure offers (2026-11-20) and refused: of 943 such pairs most were
  // another product ("Doux Chicken" / "Doux Chicken Franks", "Almarai Cream" /
  // "Almarai Cooking Cream", "Puck Cream Cheese" / "Puck Analogue Cream
  // Cheese"), and no word list could tell the harmless ones apart.
  const brand = new Set([...brandWords(anchor), ...brandWords(other)]);
  const pick = (o) => (o.name && /[a-z]/i.test(o.name) ? o.name : o.nameAr || o.name || '');
  const bothEn = /[a-z]/i.test(anchor.name || '') && /[a-z]/i.test(other.name || '');
  const wa = coreWords(bothEn ? anchor.name : pick(anchor), brand);
  const wo = coreWords(bothEn ? other.name : pick(other), brand);
  if (!wa.size || !wo.size) return { same: false, why: 'no product words' };
  if (wa.size !== wo.size || !subset(wa, wo)) {
    const extra = [...wa, ...wo].filter((w) => !(wa.has(w) && wo.has(w)));
    return { same: false, why: `different product words: ${extra.join(' ')}` };
  }
  // One word beside the brand ("Pantene Shampoo", "Goody Mayonnaise") names a
  // whole range, not a product: measured 2026-11-20, those pairs swung ±40-60%
  // because each store's flyer meant another variant.
  if (wa.size < 2) return { same: false, why: 'one product word: a range, not a product' };
  return { same: true, why: 'same words' };
}


// The engine's value figure, or null. A listing whose size the engine could
// not tie to its price (review flag) is not a value.
export function valueOf(offer) {
  const up = offer && offer.unitPrice;
  if (!up || !(Number(up.value) > 0) || offer.quantityReviewRequired || offer.sizeUnbound) return null;
  const unit = String(up.unit || '').toLowerCase();
  return { value: Number(up.value), unit: unit === 'pc' || unit === 'each' ? 'piece' : unit };
}

// Other stores' listings of the same product, best value first. Each row is
// { offer, value, pct, by }: `pct` is the difference against the card's own
// product (−20 = 20% cheaper), `by` says what was compared:
//   'value' — the engine's price per kg / L / piece, any size;
//   'price' — only when the card's product has no value figure: then only the
//             SAME size can be compared, by shelf price.
// A value 2.5× apart is a misread size on one side, not a deal (this week's
// "66% cheaper per kg" Lurpak and Aloha rows were both misreads), and is left
// out. One row per store and price.
export function sameProductRows(anchor, offers, { limit = Infinity } = {}) {
  const mine = valueOf(anchor);
  const mySize = mine ? null : offerPackageSize(anchor);
  if (!mine && !(mySize && mySize.total > 0)) return [];
  const rows = [];
  const seen = new Set();
  for (const o of offers || []) {
    if (!o || o.id === anchor.id || o.store === anchor.store || !(o.price > 0)) continue;
    if (!sameProduct(anchor, o).same) continue;
    let row;
    if (mine) {
      const v = valueOf(o);
      if (!v || v.unit !== mine.unit) continue;
      const ratio = v.value / mine.value;
      if (ratio > 2.5 || ratio < 1 / 2.5) continue;
      row = { offer: o, value: v, by: 'value', pct: Math.round(((v.value - mine.value) / mine.value) * 100) };
    } else {
      const sz = offerPackageSize(o);
      if (!sz || sz.unit !== mySize.unit || Math.abs(sz.total - mySize.total) / mySize.total > 0.03) continue;
      row = { offer: o, value: null, by: 'price', pct: Math.round(((o.price - anchor.price) / anchor.price) * 100) };
    }
    const key = `${o.store}|${o.price}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }
  rows.sort((x, y) => (x.by === 'value' ? x.value.value - y.value.value : x.offer.price - y.offer.price));
  return rows.slice(0, limit);
}
