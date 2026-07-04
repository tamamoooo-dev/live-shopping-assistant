// match.js — search intelligence: text normalization, size/quantity parsing,
// relevance scoring, irrelevance filtering, and equivalent-product grouping.
//
// This module is PURE (no DOM, no network) so it is easy to reason about and
// test. It is the single home for "what does the query mean and which results
// actually match it" — the Core, providers, and the 10-key result contract are
// untouched. app.js and summary.js consume these helpers.
//
// Two hard rules it exists to serve (HANDOFF milestone "Search Intelligence"):
//  1. Reduce irrelevant results and rank the relevant ones well, in Arabic and
//     English alike.
//  2. Never treat different pack sizes / quantities / variants as the same
//     product — so a "lowest price" is only ever claimed for equivalents.

// --- Arabic + English text normalization ------------------------------------
// Fold Arabic orthographic variants so "حليب" matches regardless of diacritics,
// alef/hamza/taa-marbuta forms, or tatweel; lowercase Latin; strip punctuation.
// Used for MATCHING only — display always uses the original name.
const AR_DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g; // harakat + tatweel

export function normalizeText(s) {
  return (s || '')
    .toString()
    .toLowerCase()
    .replace(AR_DIACRITICS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // punctuation -> space (keeps AR + Latin letters/digits)
    .replace(/\s+/g, ' ')
    .trim();
}

// A tiny bilingual synonym bridge so an Arabic query still recognises an English
// product name (and vice versa) for the tracked staples and a few common words.
// Deliberately small — it only needs to cover the equivalence/summary layer, not
// translate the whole catalogue.
const SYNONYMS = [
  ['milk', 'حليب', 'لبن'],
  ['eggs', 'egg', 'بيض', 'بيضه'],
  ['chicken', 'دجاج', 'فراخ'],
  ['rice', 'رز', 'ارز'],
  ['sugar', 'سكر'],
  ['water', 'ماء', 'مياه', 'مويه'],
  ['oil', 'زيت'],
  ['bread', 'خبز', 'عيش'],
  ['cheese', 'جبن', 'جبنه'],
  ['tea', 'شاي'],
  ['coffee', 'قهوه', 'قهوة'],
  ['yogurt', 'yoghurt', 'زبادي', 'روب'],
  ['juice', 'عصير'],
  ['butter', 'زبده', 'زبدة'],
  // fat-content descriptors: "منزوع الدسم" and "خالي الدسم" both mean skimmed
  ['skimmed', 'skim', 'منزوع', 'خالي'],
  ['squares', 'مربعات'],
  // household + personal-care staples that flyer shoppers actually search
  ['tuna', 'تونه', 'تن'],
  ['shampoo', 'شامبو'],
  ['tissue', 'tissues', 'مناديل', 'محارم'],
  ['chocolate', 'شوكولاته', 'شوكولا'],
  ['diapers', 'حفاضات', 'حفايض'],
  // common brand transliterations (Saudi shoppers search brands in Arabic;
  // flyer OCR often carries only the English brand line, and vice versa)
  ['pepsi', 'بيبسي'],
  ['cola', 'كولا'],
  ['tide', 'تايد'],
  ['nutella', 'نوتيلا'],
  // fresh produce (bilingual bridges so an Arabic produce query reaches
  // English-named catalogue items and flyer OCR, and vice versa). English
  // words that double as colours/scents ("orange") are deliberately left out.
  ['tomato', 'tomatoes', 'طماطم'],
  ['potato', 'potatoes', 'بطاطس', 'بطاطا'],
  ['onion', 'onions', 'بصل'],
  ['garlic', 'ثوم'],
  ['cucumber', 'خيار'],
  ['carrot', 'carrots', 'جزر'],
  ['lemon', 'ليمون'],
  ['strawberry', 'strawberries', 'فراوله'],
  ['banana', 'bananas', 'موز'],
  ['apple', 'apples', 'تفاح'],
  ['grape', 'grapes', 'عنب'],
  ['mango', 'مانجو', 'مانجا'],
  ['watermelon', 'بطيخ', 'حبحب'],
  ['pineapple', 'اناناس'],
  ['pomegranate', 'رمان'],
  ['avocado', 'افوكادو'],
  ['peach', 'خوخ'],
  ['apricot', 'مشمش'],
  ['kiwi', 'كيوي'],
  ['guava', 'جوافه'],
  ['eggplant', 'aubergine', 'باذنجان'],
  ['zucchini', 'courgette', 'كوسه'],
  ['cabbage', 'ملفوف'],
  ['cauliflower', 'قرنبيط'],
  ['broccoli', 'بروكلي'],
  ['spinach', 'سبانخ'],
  ['okra', 'باميه'],
];
const SYN_INDEX = (() => {
  const m = new Map();
  for (const group of SYNONYMS) {
    const norm = group.map(normalizeText);
    for (const t of norm) m.set(t, norm);
  }
  return m;
})();

// Expand a query token to its bilingual synonyms (normalized), including itself.
export function expandToken(tok) {
  return SYN_INDEX.get(tok) || [tok];
}

export function tokens(s) {
  const n = normalizeText(s);
  return n ? n.split(' ').filter((t) => t.length > 1 || /\p{N}/u.test(t)) : [];
}

// --- product families ---------------------------------------------------------
// A coarse, bilingual product-family classifier so products from DIFFERENT
// families never compete in a recommendation, however similar their names are
// ("كيري مربعات" must never be answered with puff-pastry squares; a milk search
// must never offer yogurt as the cheaper alternative).
//
// Three tiers, because compound products belong to the DERIVED family, not the
// ingredient's: "milk chocolate" is chocolate, "egg spring roll pastry" is
// pastry. Any derived-family keyword in a name outranks every base-family
// keyword; within a tier the EARLIEST keyword wins (retail names lead with the
// head noun in both Arabic and English).
//
// PRODUCE is the third, LOWEST tier: fresh fruit/vegetable nouns are the
// prototypical flavour/ingredient modifiers in BOTH word orders ("حليب فراولة"
// and "Strawberry Milk" are milk; "معجون طماطم" and "tomato paste" are sauce),
// so any base- or derived-family keyword anywhere in the name outranks a
// produce keyword regardless of position. A name whose ONLY family signal is
// the produce noun ("طماطم طازجة", "Fresh Tomatoes 1kg") IS the produce — which
// is what lets a bare produce query rank the real thing above its derivatives.
//
// Classification matches whole words only, with the Arabic definite article
// (ال / وال) stripped — but NOT the attached prepositions بال/لل ("بالبيض" =
// "with egg" marks an ingredient, and must not classify the product as eggs).
const BASE_FAMILIES = {
  milk: ['milk', 'حليب'],
  laban: ['laban', 'لبن'],
  yogurt: ['yogurt', 'yoghurt', 'زبادي', 'روب'],
  cheese: ['cheese', 'جبن', 'جبنه', 'موزاريلا', 'mozzarella', 'شيدر', 'cheddar', 'حلوم', 'halloumi', 'فيتا', 'feta', 'قشقوان'],
  cream: ['cream', 'قشطه', 'قشده', 'كريمه'],
  butter: ['butter', 'زبده'],
  eggs: ['egg', 'eggs', 'بيض'],
  chicken: ['chicken', 'دجاج', 'فراخ'],
  meat: ['meat', 'beef', 'لحم', 'لحوم', 'بقري', 'غنم', 'mutton'],
  fish: ['fish', 'tuna', 'سمك', 'تونه', 'سلمون', 'salmon'],
  rice: ['rice', 'رز', 'ارز'],
  pasta: ['pasta', 'spaghetti', 'مكرونه', 'معكرونه', 'سباغيتي', 'نودلز', 'noodles', 'شعيريه'],
  bread: ['bread', 'toast', 'خبز', 'توست', 'صامولي'],
  oil: ['oil', 'زيت', 'زيوت'],
  water: ['water', 'ماء', 'مياه', 'مويه'],
  juice: ['juice', 'عصير'],
  tea: ['tea', 'شاي'],
  coffee: ['coffee', 'قهوه', 'نسكافيه', 'nescafe'],
  sugar: ['sugar', 'سكر'],
  flour: ['flour', 'دقيق', 'طحين'],
  dates: ['dates', 'تمر', 'تمور'],
  honey: ['honey', 'عسل'],
  vinegar: ['vinegar', 'خل'],
};
const DERIVED_FAMILIES = {
  chocolate: ['chocolate', 'cocoa', 'شوكولاته', 'شوكولا', 'كاكاو'],
  biscuit: ['biscuit', 'biscuits', 'cookie', 'cookies', 'wafer', 'cracker', 'crackers', 'بسكويت', 'كوكيز', 'ويفر'],
  cake: ['cake', 'cakes', 'muffin', 'croissant', 'كيك', 'كيكه', 'كعك', 'مافن', 'كرواسون'],
  pastry: ['pastry', 'pastries', 'puff', 'dough', 'عجينه', 'عجين', 'فطاير', 'فطيره', 'سمبوسه', 'سمبوسك', 'بف', 'باف', 'donut', 'donuts', 'دونات'],
  icecream: ['icecream', 'gelato', 'ايس', 'بوظه'],
  powder: ['powder', 'بودره', 'مجفف', 'مجففه'],
  cereal: ['cereal', 'cereals', 'flakes', 'oats', 'granola', 'muesli', 'كورن', 'فليكس', 'شوفان', 'جرانولا'],
  candy: ['candy', 'gum', 'marshmallow', 'حلوى', 'حلاوه', 'جيلي', 'علكه'],
  chips: ['chips', 'crisps', 'شيبس'],
  sauce: ['sauce', 'ketchup', 'mayonnaise', 'paste', 'puree', 'صوص', 'صلصه', 'كاتشب', 'مايونيز', 'مسطرده', 'معجون', 'بيوريه'],
  dessert: ['dessert', 'custard', 'pudding', 'حلا', 'مهلبيه', 'كاسترد', 'بودينج'],
  // prepared dishes: an "egg curry chappati" or "egg dosa" is a meal, not eggs
  prepared: ['curry', 'كاري', 'chappati', 'شاباتي', 'dosa', 'دوسا', 'sandwich', 'ساندويتش', 'burger', 'برجر', 'pizza', 'بيتزا', 'شاورما', 'shawarma', 'combo', 'كومبو', 'وجبه', 'meal'],
  // produce-derived shelf products: what turns "طماطم"/"فراولة" into paste,
  // jam, syrup drinks, soda, soup, pickles — the very look-alikes that were
  // drowning fresh produce in the grid.
  soup: ['soup', 'شوربه', 'شوربات'],
  jam: ['jam', 'marmalade', 'مربي'],
  syrup: ['syrup', 'nectar', 'cocktail', 'mojito', 'smoothie', 'shake', 'milkshake', 'سيرب', 'شراب', 'نكتار', 'كوكتيل', 'موهيتو', 'سموذي', 'شيك', 'ميلكشيك', 'تانج', 'tang'],
  soda: ['soda', 'cola', 'pepsi', 'fanta', 'mirinda', 'sprite', '7up', 'cocacola', 'صودا', 'كولا', 'بيبسي', 'فانتا', 'ميرندا', 'سبرايت', 'سفن', 'كوكاكولا', 'غازي', 'غازيه'],
  pickle: ['pickle', 'pickles', 'مخلل', 'مخللات', 'طرشي'],
  // personal/household care: strawberry SOAP and lemon DISHWASHING liquid are
  // care products, not produce (scented look-alikes under produce queries).
  care: ['shampoo', 'soap', 'lotion', 'conditioner', 'detergent', 'dishwashing', 'شامبو', 'صابون', 'لوشن', 'بلسم', 'معطر', 'منظف', 'مطهر', 'غسول', 'ملمع'],
};
// Fresh fruit & vegetables — the LOWEST family tier (see the tier note above).
// Curated to common Saudi grocery produce with unambiguous words; ambiguous
// English colour/flavour words ("orange", "cherry") are deliberately Arabic-only
// so "Tide Orange" and "Cherry Tomatoes" never classify as fruit.
const PRODUCE_FAMILIES = {
  tomato: ['tomato', 'tomatoes', 'طماطم', 'طماط', 'بندوره'],
  potato: ['potato', 'potatoes', 'بطاطس', 'بطاطا'],
  onion: ['onion', 'onions', 'بصل'],
  garlic: ['garlic', 'ثوم'],
  cucumber: ['cucumber', 'cucumbers', 'خيار'],
  carrot: ['carrot', 'carrots', 'جزر'],
  lettuce: ['lettuce', 'خس'],
  zucchini: ['zucchini', 'courgette', 'كوسه'],
  eggplant: ['eggplant', 'aubergine', 'باذنجان'],
  cabbage: ['cabbage', 'ملفوف', 'كرنب'],
  cauliflower: ['cauliflower', 'broccoli', 'قرنبيط', 'بروكلي'],
  spinach: ['spinach', 'سبانخ'],
  okra: ['okra', 'باميه'],
  corn: ['corn', 'ذره'],
  lemon: ['lemon', 'lemons', 'ليمون'],
  ginger: ['ginger', 'زنجبيل'],
  mint: ['mint', 'نعناع'],
  coriander: ['coriander', 'cilantro', 'كزبره'],
  parsley: ['parsley', 'بقدونس'],
  strawberry: ['strawberry', 'strawberries', 'فراوله'],
  banana: ['banana', 'bananas', 'موز'],
  apple: ['apple', 'apples', 'تفاح', 'تفاحه'],
  orange: ['برتقال'],
  grapes: ['grape', 'grapes', 'عنب'],
  mango: ['mango', 'مانجو', 'مانجا'],
  watermelon: ['watermelon', 'بطيخ', 'حبحب'],
  melon: ['melon', 'cantaloupe', 'شمام'],
  pineapple: ['pineapple', 'اناناس'],
  peach: ['peach', 'خوخ'],
  apricot: ['apricot', 'مشمش'],
  plum: ['plum', 'برقوق'],
  pear: ['pear', 'pears', 'كمثري', 'اجاص'],
  kiwi: ['kiwi', 'كيوي'],
  pomegranate: ['pomegranate', 'رمان'],
  guava: ['guava', 'جوافه'],
  cherry: ['كرز'],
  berries: ['blueberry', 'blueberries', 'raspberry', 'raspberries', 'blackberry', 'توت', 'بلوبيري'],
  fig: ['fig', 'figs', 'تين'],
};
// A produce word right next to one of these names a FLAVOUR/SCENT, not the
// produce itself ("حليب بنكهة الفراولة", "strawberry flavoured", "برائحة
// الليمون") — such a hit must not classify the product as produce.
const FLAVOR_MARKERS = new Set(
  ['بنكهه', 'نكهه', 'نكهات', 'بطعم', 'طعم', 'برائحه', 'رائحه',
   'flavor', 'flavour', 'flavored', 'flavoured', 'flavors', 'flavours', 'scented'].map(normalizeText),
);
const FAMILY_INDEX = (() => {
  const m = new Map(); // keyword -> { family, derived, produce }
  for (const [family, words] of Object.entries(DERIVED_FAMILIES)) {
    for (const w of words) m.set(normalizeText(w), { family, derived: true });
  }
  for (const [family, words] of Object.entries(BASE_FAMILIES)) {
    const k = (w) => normalizeText(w);
    for (const w of words) if (!m.has(k(w))) m.set(k(w), { family, derived: false });
  }
  for (const [family, words] of Object.entries(PRODUCE_FAMILIES)) {
    const k = (w) => normalizeText(w);
    for (const w of words) if (!m.has(k(w))) m.set(k(w), { family, derived: false, produce: true });
  }
  return m;
})();

// Strip the Arabic definite article for family lookup ("الحليب" -> "حليب").
// بال/لل are left attached on purpose — they mark ingredients/purpose.
function familyKey(word) {
  if (FAMILY_INDEX.has(word)) return word;
  const stripped = word.replace(/^(وال|ال)/, '');
  return stripped !== word && FAMILY_INDEX.has(stripped) ? stripped : null;
}

// The product family of a name, or null when no family keyword appears.
// Tier order: derived > base > produce (see the tier note above).
export function productFamily(name) {
  const words = normalizeText(name).split(' ');
  let base = null;
  let produce = null;
  for (let i = 0; i < words.length; i++) {
    const key = familyKey(words[i]);
    if (!key) continue;
    const hit = FAMILY_INDEX.get(key);
    if (hit.derived) return hit.family; // earliest derived keyword wins outright
    if (hit.produce) {
      // a produce word next to a flavour/scent marker names a flavour, not the
      // product ("بنكهة الفراولة", "strawberry flavoured")
      if (!produce && !FLAVOR_MARKERS.has(words[i - 1]) && !FLAVOR_MARKERS.has(words[i + 1])) {
        produce = hit.family;
      }
    } else if (!base) {
      base = hit.family; // earliest base keyword, kept unless derived appears
    }
  }
  return base || produce;
}

// The family the QUERY itself names (e.g. "حليب نادك" -> milk), or null when
// the query carries no family keyword (e.g. a brand-only query like "كيري").
export function queryFamily(query) {
  return productFamily(query);
}

// --- product types (a FORM attribute, orthogonal to family) ---------------------
// A product has three attributes that decide whether two listings are the SAME
// product: its BRAND, its FAMILY ("what is it / which aisle" — chicken), and its
// TYPE ("what form is it" — nuggets vs roll vs breast). Family alone is too
// coarse: "Herfy chicken nuggets" and "Herfy minced chicken roll" share a brand
// AND a family (chicken) yet are clearly different products. This coarse,
// bilingual TYPE classifier is that third attribute — so a match on only some
// attributes never earns a high-confidence "same product" claim, and a query
// that names a type ("chicken nuggets") is not driven by a different-type
// look-alike ("chicken roll").
//
// Deliberately narrow: only well-known forms/cuts that make two SAME-family
// products genuinely different. When a name carries no type keyword its type is
// null and nothing is gated — a bare "chicken" query still sees every form.
// Whole-word matches only (Arabic definite article stripped); earliest wins.
const PRODUCT_TYPES = {
  nuggets: ['nugget', 'nuggets', 'ناجتس', 'ناغتس', 'نجتس', 'نجت'],
  burger: ['burger', 'burgers', 'hamburger', 'برجر', 'برغر', 'همبرجر', 'هامبرجر', 'همبرغر'],
  sausage: ['sausage', 'sausages', 'frankfurter', 'hotdog', 'سجق', 'سوسيس', 'نقانق'],
  roll: ['roll', 'rolls', 'رول', 'رولات'],
  mince: ['mince', 'minced', 'مفروم', 'مفرومه'],
  fillet: ['fillet', 'fillets', 'filet', 'فيليه', 'فيليت'],
  breast: ['breast', 'breasts', 'صدر', 'صدور'],
  strips: ['strip', 'strips', 'ستربس', 'شرائح'],
  wings: ['wing', 'wings', 'جناح', 'اجنحه', 'جوانح'],
  kofta: ['kofta', 'kufta', 'kabab', 'kebab', 'كفته', 'كباب'],
  luncheon: ['luncheon', 'mortadella', 'لانشون', 'مرتديلا'],
};
const TYPE_INDEX = (() => {
  const m = new Map();
  for (const [type, words] of Object.entries(PRODUCT_TYPES)) {
    for (const w of words) m.set(normalizeText(w), type);
  }
  return m;
})();

function typeKey(word) {
  if (TYPE_INDEX.has(word)) return word;
  const stripped = word.replace(/^(وال|ال)/, '');
  return stripped !== word && TYPE_INDEX.has(stripped) ? stripped : null;
}

// The product type/form named by a text, or null when none appears.
export function productType(name) {
  const words = normalizeText(name).split(' ');
  for (const w of words) {
    const key = typeKey(w);
    if (key) return TYPE_INDEX.get(key);
  }
  return null;
}

// The type the QUERY itself names ("chicken nuggets" -> nuggets), or null.
export function queryType(query) {
  return productType(query);
}

// --- category-as-family (a retailer-taxonomy semantic signal) -------------------
// Flyer offers carry the aggregator's OWN product category (D4D's global
// taxonomy). That is a structured, human-curated signal we get for free — a
// semantic COMPLEMENT to the keyword classifier, used only as a FALLBACK when an
// offer's OCR name yields no family (recovering a debris-named offer into its
// true family). Only categories that resolve to exactly ONE of our families are
// mapped (ambiguous ones like "milk-laban", "tea-coffee", "cheese-creame" are
// left out); a name keyword always wins, so precision is unchanged. Mirrors the
// engine's matching.js CATEGORY_FAMILY — keep the two in sync.
const CATEGORY_FAMILY = {
  eggs: 'eggs',
  rice: 'rice',
  water: 'water',
  'juices-drinks': 'juice',
  'oil-ghee': 'oil',
  'sugar-sweetener': 'sugar',
  'pasta-noodles': 'pasta',
  'bread-buns': 'bread',
  biscuits: 'biscuit',
  'chocolates-candies': 'chocolate',
  'yogurt-labneh': 'yogurt',
  'butter-margarine': 'butter',
  'fresh-chicken-poultry': 'chicken',
  'frozen-chicken-poultry': 'chicken',
  'meat-fresh-chilled': 'meat',
  'fresh-fish': 'fish',
  'frozen-fish': 'fish',
  'cereals-bars': 'cereal',
};

// The family implied by an aggregator category slug, or null (unmapped/ambiguous).
export function categoryFamily(slug) {
  if (!slug) return null;
  return CATEGORY_FAMILY[String(slug).toLowerCase()] || null;
}

// The family of a flyer OFFER: its name-derived family (most specific), falling
// back to its aggregator category. Name always wins — "milk chocolate" in the
// chocolates category stays chocolate; the category only fills a name gap.
export function offerFamily(offer) {
  if (!offer) return null;
  const nameFam = productFamily(`${offer.name || ''} ${offer.nameAr || ''}`);
  if (nameFam) return nameFam;
  return categoryFamily(offer.category);
}

// What fraction of the query's tokens actually appear in the item (name+brand,
// any tier, synonyms included)? The comparison layer requires (near-)full
// coverage before an item may compete: "كيري مربعات" matching only "مربعات"
// (squares) is a look-alike, not a candidate.
export function tokenCoverage(item, query) {
  const qTokens = tokens(query);
  if (!qTokens.length) return 1;
  const f = normalizeText(`${item.name || ''} ${item.brand || ''}`);
  const fWords = new Set(f.split(' '));
  let matched = 0;
  for (const qt of qTokens) {
    for (const v of expandToken(qt)) {
      if (
        fWords.has(v) ||
        (v.length >= 4 && new RegExp(`(^| )${escapeRegex(v)}`).test(f)) ||
        (v.length >= 5 && f.includes(v))
      ) {
        matched += 1;
        break;
      }
    }
  }
  return matched / qTokens.length;
}

// --- size / quantity parsing -------------------------------------------------
// Extract a comparable quantity from a product name (and the size field). The
// point is fair comparison: 2 L vs 1 L vs a 6×200 ml pack are NOT the same
// product, and their per-litre price is what makes them comparable.
//
// Returns { unit: 'ml'|'g'|'pcs'|null, each, pack, total } where `each` is the
// single-item size in the base unit (ml/g) or 1 for counts, `pack` the pack
// multiplier, and `total` = each × pack in the base unit (or total pieces).
// A unit token must be followed by a boundary. JS `\b` is ASCII-only, so it
// fails after Arabic letters ("2 لتر"); a unicode lookahead handles both scripts.
const B = '(?![\\p{L}\\p{N}])';
const UNIT_TO_BASE = [
  // volume -> ml
  { re: new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(l|lt|ltr|liter|litre|litres|لتر|ليتر)${B}`, 'u'), base: 'ml', factor: 1000 },
  { re: new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(ml|مل|ميلي|مليلتر)${B}`, 'u'), base: 'ml', factor: 1 },
  // weight -> g
  { re: new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(kg|kgs|kilo|kilos|كجم|كيلو|كغ|كيلوجرام)${B}`, 'u'), base: 'g', factor: 1000 },
  { re: new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(g|gm|gr|grm|gram|grams|جم|جرام|غرام|غ)${B}`, 'u'), base: 'g', factor: 1 },
];
const UNITS = 'l|lt|ltr|liter|litre|ml|kg|g|gm|gr|gram|لتر|مل|كجم|جم|جرام';
const COUNT_WORDS = 'pcs|pc|pieces|piece|قطعه|قطعة|قطع|حبه|حبة|حبات|عبوات|عبوه|عبوة|اكياس|كيس';
const PACK_RE = [
  // "6 x 200 ml" and "24 قطعة × 125مل" (an optional count word between the
  // pack number and the ×) — pack first, size second.
  new RegExp(`(\\d+)\\s*(?:${COUNT_WORDS})?\\s*[x×*]\\s*(\\d+(?:[.,]\\d+)?)\\s*(${UNITS})${B}`, 'u'),
  new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${UNITS})${B}\\s*[x×*]\\s*(\\d+)`, 'u'), // 200 ml x 6
];
const COUNT_RE = new RegExp(`(\\d+)\\s*(pcs|pc|pieces|piece|ct|count|s|x|حبه|حبة|حبات|قطعه|قطعة|عبوات|عبوه|عبوة|اكياس|كيس)${B}`, 'u');

function num(x) {
  return parseFloat(String(x).replace(',', '.'));
}

// Size-specific normalization. Unlike normalizeText (which strips punctuation for
// matching), this MUST preserve the decimal point inside numbers — otherwise
// "2.85L" becomes "2 85 l" and parses as 85 litres. It lowercases, folds
// Arabic-Indic digits to ASCII, drops diacritics, and keeps only what size
// parsing needs (letters, digits, ., pack separators).
const AR_INDIC = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9', '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };
function normSize(s) {
  return (s || '')
    .toString()
    .toLowerCase()
    .replace(/[٠-٩۰-۹]/g, (d) => AR_INDIC[d] || d)
    .replace(AR_DIACRITICS, '')
    .replace(/٫/g, '.') // arabic decimal separator
    .replace(/[^\p{L}\p{N}\s.,x×*]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// The base unit ({unit,factor}) a single unit token maps to, or null.
function unitFor(tok) {
  const t = normalizeText(tok);
  if (/^(l|lt|ltr|liter|litre|litres|لتر|ليتر)$/u.test(t)) return { unit: 'ml', factor: 1000 };
  if (/^(ml|مل|ميلي|مليلتر)$/u.test(t)) return { unit: 'ml', factor: 1 };
  if (/^(kg|kgs|kilo|kilos|كجم|كيلو|كغ|كيلوجرام)$/u.test(t)) return { unit: 'g', factor: 1000 };
  if (/^(g|gm|gr|grm|gram|grams|جم|جرام|غرام|غ)$/u.test(t)) return { unit: 'g', factor: 1 };
  return null;
}

export function parseSize(name, sizeField) {
  const hay = normSize(`${name || ''} ${sizeField || ''}`);

  // Pack forms first (they carry both count and unit).
  // PACK_RE[0] = "6 x 200 ml": [1]=pack, [2]=size, [3]=unit
  // PACK_RE[1] = "200 ml x 6": [1]=size, [2]=unit, [3]=pack
  const forms = [
    { re: PACK_RE[0], pack: 1, size: 2, unit: 3 },
    { re: PACK_RE[1], pack: 3, size: 1, unit: 2 },
  ];
  for (const f of forms) {
    const m = f.re.exec(hay);
    if (m) {
      const unitTok = m[f.unit];
      const base = unitFor(unitTok);
      if (base) {
        const each = num(m[f.size]) * base.factor;
        const pack = Math.max(1, Math.round(num(m[f.pack])) || 1);
        return { unit: base.unit, each, pack, total: each * pack };
      }
    }
  }

  // Single size: "2 L", "500 g".
  for (const u of UNIT_TO_BASE) {
    const m = u.re.exec(hay);
    if (m) {
      const each = num(m[1]) * u.factor;
      // A trailing "x6" / "6's" pack multiplier if present — but never the
      // size's own "× 125ml" digits (a unit right after the number means the
      // × introduced the SIZE, not a multiplier; the pack forms above own that).
      const pm =
        new RegExp(`[x×*]\\s*(\\d+)(?!\\s*(?:${UNITS}))${B}`, 'u').exec(hay) ||
        /\b(\d+)\s*(?:pcs|pc|pack|s)\b/.exec(hay);
      const pack = pm ? Math.max(1, parseInt(pm[1], 10)) : 1;
      return { unit: u.base, each, pack, total: each * pack };
    }
  }

  // Pure count ("30 eggs", "12 pcs").
  const cm = COUNT_RE.exec(hay);
  if (cm) {
    const n = parseInt(cm[1], 10);
    if (n > 0 && n <= 500) return { unit: 'pcs', each: 1, pack: n, total: n };
  }

  return { unit: null, each: null, pack: 1, total: null };
}

// Human label for a parsed size, for display in the summary.
export function sizeLabel(sz) {
  if (!sz || !sz.unit || sz.total == null) return '';
  if (sz.unit === 'pcs') return `${sz.total} pcs`;
  const base = sz.unit; // ml or g
  const big = base === 'ml' ? 1000 : 1000;
  const bigUnit = base === 'ml' ? 'L' : 'kg';
  const totalBig = sz.total / big;
  const prettyEach =
    sz.each >= big ? `${trimNum(sz.each / big)} ${bigUnit}` : `${trimNum(sz.each)} ${base}`;
  return sz.pack > 1 ? `${sz.pack} × ${prettyEach}` : sz.total >= big ? `${trimNum(totalBig)} ${bigUnit}` : `${trimNum(sz.total)} ${base}`;
}
function trimNum(n) {
  return Number(n.toFixed(2)).toString();
}

// Per-unit price for fair comparison: SAR per litre / per kg / per piece.
// Returns { value, unit } or null when the size is unknown.
export function unitPrice(item) {
  const sz = item._size || parseSize(item.name, item.size);
  if (!sz.unit || !sz.total || item.price == null) return null;
  if (sz.unit === 'ml') return { value: item.price / (sz.total / 1000), unit: 'L' };
  if (sz.unit === 'g') return { value: item.price / (sz.total / 1000), unit: 'kg' };
  if (sz.unit === 'pcs') return { value: item.price / sz.total, unit: 'pc' };
  return null;
}

// --- relevance + irrelevance -------------------------------------------------
// Score how well an item matches the query. Name dominates; brand counts less.
// Uses normalized tokens + bilingual synonym expansion so Arabic and English
// queries both rank sensibly.
function fieldScore(field, qTokens) {
  const f = normalizeText(field);
  if (!f) return 0;
  const fWords = new Set(f.split(' '));
  let score = 0;
  let matched = 0;
  for (const qt of qTokens) {
    const variants = expandToken(qt);
    let best = 0;
    // Prefix/substring tiers need a minimum token length: a 3-char stem
    // prefix-matches unrelated words ("egg" -> "eggplant", "بيض" (eggs) ->
    // "بيضاء" (white)) — the "eggs recommends eggplant" class of bug.
    for (const v of variants) {
      if (!v) continue;
      if (fWords.has(v)) best = Math.max(best, 100); // whole-word
      else if (v.length >= 4 && f.startsWith(v)) best = Math.max(best, 80); // prefix
      else if (v.length >= 4 && new RegExp(`(^| )${escapeRegex(v)}`).test(f)) best = Math.max(best, 75); // word-start
      else if (v.length >= 5 && f.includes(v)) best = Math.max(best, 45); // substring
    }
    if (best) matched += 1;
    score += best;
  }
  // Reward covering ALL query tokens; average keeps long names from inflating.
  const coverage = qTokens.length ? matched / qTokens.length : 0;
  return (score / Math.max(1, qTokens.length)) * (0.5 + 0.5 * coverage);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Words that, when they FOLLOW the query token, usually change the product into
// a different category ("milk" vs "milk chocolate/powder/biscuit"). Matching
// items are kept but demoted, so genuine staples rank above look-alikes.
const COMPOUND_SHIFTERS = new Set(
  [
    'chocolate', 'biscuit', 'biscuits', 'cookie', 'cookies', 'powder', 'bar', 'candy',
    'cereal', 'cake', 'shake', 'flavour', 'flavoured', 'flavored', 'drink', 'jam',
    'شوكولاته', 'شوكولا', 'بسكويت', 'بودره', 'حلوى', 'كيك',
  ].map(normalizeText),
);

function compoundPenalty(item, qTokens) {
  const words = normalizeText(item.name).split(' ');
  for (const qt of qTokens) {
    const variants = expandToken(qt);
    for (let i = 0; i < words.length - 1; i++) {
      if (variants.includes(words[i]) && COMPOUND_SHIFTERS.has(words[i + 1])) return 0.45;
    }
  }
  return 1;
}

export function relevance(item, query) {
  const qOriginal = tokens(query);
  const name = fieldScore(item.name, qOriginal);
  const brand = fieldScore(item.brand, qOriginal) * 0.6;
  return Math.max(name, brand) * compoundPenalty(item, qOriginal);
}

// Is an item relevant enough to keep? Drops the "milk -> milk chocolate biscuit"
// class of noise: require at least one query token (or its synonym) to appear as
// a whole word or strong prefix in the NAME (brand-only matches aren't enough to
// keep an otherwise-unrelated product). Single-token queries are strict; multi-
// token queries keep items matching the head token.
export function isRelevant(item, query) {
  const qOriginal = tokens(query);
  if (!qOriginal.length) return true;
  const f = normalizeText(item.name);
  const fWords = new Set(f.split(' '));
  const head = qOriginal[0];
  for (const qt of qOriginal) {
    for (const v of expandToken(qt)) {
      if (fWords.has(v)) return true;
      // ≥4 chars for a word-start match: "egg" must not keep "eggplant",
      // "بيض" (eggs) must not keep "بيضاء" (white).
      if (v.length >= 4 && new RegExp(`(^| )${escapeRegex(v)}`).test(f)) return true;
    }
  }
  // last resort: strong head-token substring for compound words (e.g. "cornflakes")
  for (const v of expandToken(head)) {
    if (v.length >= 5 && f.includes(v)) return true;
  }
  return false;
}

// Rank a store's items by relevance (stable; ties keep source order). Attaches
// a cached parsed size (item._size) and _rel score for reuse downstream.
export function rankItems(items, query) {
  return items
    .map((it, i) => {
      it._size = it._size || parseSize(it.name, it.size);
      it._rel = relevance(it, query);
      return { it, i, s: it._rel };
    })
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.it);
}

// --- equivalent-product grouping --------------------------------------------
// Group results (across stores) that are the SAME product for a fair "lowest
// price". Equivalence requires the same size (unit family + total within 3%) AND
// either the same brand or a strong overlap of descriptive name tokens. Items
// with no parseable size are never merged — we refuse to guess equivalence.
const STOPWORDS = new Set(
  [
    'the', 'a', 'of', 'with', 'and', 'fresh', 'new', 'pack', 'value', 'pcs', 'piece',
    'من', 'مع', 'و', 'ال', 'طازج', 'جديد', 'عبوه', 'حبه',
  ].map(normalizeText),
);

function contentTokens(name) {
  return tokens(name).filter((t) => !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

function sizeClose(a, b) {
  if (!a.unit || !b.unit || a.unit !== b.unit) return false;
  if (a.total == null || b.total == null) return false;
  const hi = Math.max(a.total, b.total);
  const lo = Math.min(a.total, b.total);
  return hi > 0 && (hi - lo) / hi <= 0.03;
}

function sameProduct(x, y) {
  const sx = x.it._size, sy = y.it._size;
  if (!sizeClose(sx, sy)) return false;
  // Different known FORMS are different products, even at the same brand+size:
  // "chicken nuggets" is not "chicken roll". A missing type never blocks a match
  // (we refuse to guess a difference we can't see).
  const typeX = productType(x.it.name), typeY = productType(y.it.name);
  if (typeX && typeY && typeX !== typeY) return false;
  const bx = normalizeText(x.it.brand), by = normalizeText(y.it.brand);
  if (bx && by) return bx === by;
  // no reliable brand -> require strong name-token overlap
  const tx = new Set(contentTokens(x.it.name));
  const ty = contentTokens(y.it.name);
  if (!tx.size || !ty.length) return false;
  const overlap = ty.filter((t) => tx.has(t)).length;
  return overlap / Math.max(tx.size, ty.length) >= 0.6;
}

// Build equivalence groups from tagged results [{ it, store }].
// Returns [{ items: [{ it, store }], size, brand, name }], largest/priciest-
// spread first. Only groups with a parseable size participate; singletons are
// still returned (so callers can see per-store offers), flagged by items.length.
export function groupEquivalents(tagged) {
  const withSize = tagged.map((t) => {
    t.it._size = t.it._size || parseSize(t.it.name, t.it.size);
    return t;
  });
  const groups = [];
  for (const t of withSize) {
    let placed = false;
    for (const g of groups) {
      if (sameProduct(g._rep, t)) {
        g.items.push(t);
        placed = true;
        break;
      }
    }
    if (!placed) groups.push({ _rep: t, items: [t], size: t.it._size, brand: t.it.brand, name: t.it.name });
  }
  for (const g of groups) delete g._rep;
  return groups;
}
