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
    // Farsi glyphs D4D flyer OCR emits inside Arabic names: yeh U+06CC, kaf U+06A9
    .replace(/ی/g, 'ي')
    .replace(/ک/g, 'ك')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // punctuation -> space (keeps AR + Latin letters/digits)
    .replace(/\s+/g, ' ')
    .trim();
}

// Matching-only Arabic clitic canonicalization. The definite article carries
// no product identity, so الدجاج / والدجاج and دجاج must be the SAME token.
// Deliberately do not strip attached prepositions (بال / لل): they encode an
// ingredient or purpose and are interpreted separately by the role detectors.
export function canonicalToken(token) {
  const t = normalizeText(token);
  if (!t || /\s/.test(t)) return t;
  const bare = t.replace(/^(وال|ال)/, '');
  return bare.length >= 2 ? bare : t;
}

export function canonicalMatchText(text) {
  return normalizeText(text)
    .split(' ')
    .filter(Boolean)
    .map(canonicalToken)
    .join(' ');
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
  // water brands shoppers search in either script (found via "Arwa Water
  // 1.5L" — the Arabic flyer names could never match the Latin brand token)
  ['arwa', 'اروي', 'اروا'],
  ['nova', 'نوفا'],
  ['berain', 'بيرين'],
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
    const norm = [...new Set(group.map(canonicalToken))];
    for (const t of norm) m.set(t, norm);
  }
  return m;
})();

// Expand a query token to its bilingual synonyms (normalized), including itself.
export function expandToken(tok) {
  const canonical = canonicalToken(tok);
  return SYN_INDEX.get(canonical) || [canonical];
}

export function tokens(s) {
  const n = canonicalMatchText(s);
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
  fish: ['fish', 'tuna', 'سمك', 'تونه', 'سلمون', 'salmon', 'سردين', 'sardine', 'sardines'],
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
  // incl. confectionery brands that ARE the product name on shelves ("جالكسي
  // الفراولة" carries no word for chocolate) — same precedent as نسكافيه/coffee
  chocolate: ['chocolate', 'cocoa', 'شوكولاته', 'شيكولاته', 'شوكلاته', 'شكولاته', 'شوكلت', 'شوكولا', 'كاكاو', 'جالكسي', 'كيندر', 'kinder', 'اوريو', 'oreo', 'سنيكرز', 'snickers', 'تويكس', 'twix', 'كيتكات', 'kitkat'],
  biscuit: ['biscuit', 'biscuits', 'cookie', 'cookies', 'wafer', 'cracker', 'crackers', 'بسكويت', 'كوكيز', 'ويفر'],
  cake: ['cake', 'cakes', 'muffin', 'croissant', 'كيك', 'كيكه', 'كعك', 'مافن', 'كرواسون'],
  pastry: ['pastry', 'pastries', 'puff', 'dough', 'عجينه', 'عجين', 'فطاير', 'فطيره', 'سمبوسه', 'سمبوسك', 'بف', 'باف', 'donut', 'donuts', 'دونات'],
  icecream: ['icecream', 'gelato', 'ايس', 'بوظه'],
  powder: ['powder', 'بودره', 'مسحوق', 'مجفف', 'مجففه'],
  cereal: ['cereal', 'cereals', 'flakes', 'oats', 'granola', 'muesli', 'كورن', 'فليكس', 'شوفان', 'جرانولا'],
  candy: ['candy', 'gum', 'marshmallow', 'lollipop', 'chupa', 'chups', 'حلوى', 'حلاوه', 'جيلي', 'علكه', 'لولي', 'مصاص', 'مصاصه', 'مصاصات', 'شوبا', 'شوبس'],
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
  // 'drink(s)' mirrors the Arabic مشروب already here: "Lemon Lime Drink" is a
  // beverage, never fresh produce (found live 2026-07-16 — it was the lowest
  // "lemon" in every feature at once).
  syrup: ['syrup', 'nectar', 'cocktail', 'mojito', 'smoothie', 'shake', 'milkshake', 'drink', 'drinks', 'سيرب', 'شراب', 'مشروب', 'مشروبات', 'نكتار', 'كوكتيل', 'موهيتو', 'سموذي', 'شيك', 'ميلكشيك', 'تانج', 'tang'],
  soda: ['soda', 'cola', 'pepsi', 'fanta', 'mirinda', 'sprite', '7up', 'cocacola', 'صودا', 'كولا', 'بيبسي', 'فانتا', 'ميرندا', 'سبرايت', 'سفن', 'كوكاكولا', 'غازي', 'غازيه', 'malt', 'شعير', 'هولستن', 'holsten', 'بربيكان', 'barbican', 'موسي', 'moussy'],
  pickle: ['pickle', 'pickles', 'مخلل', 'مخللات', 'طرشي'],
  // produce-shaped non-food ("لعبة على شكل فراولة" squeeze toys from Amazon;
  // keychains — "سلسلة مفاتيح … موز", found live 2026-07-16 — مفاتيح/keychain
  // are unambiguous in a grocery catalogue)
  toy: ['toy', 'toys', 'لعبه', 'العاب', 'keychain', 'keyring', 'مفاتيح', 'ميداليه'],
  // personal/household care: strawberry SOAP and lemon DISHWASHING liquid are
  // care products, not produce (scented look-alikes under produce queries).
  // مشابك/مشبك: hair clips and clothes pins — produce-shaped accessory names
  // ("مشابك شعر موز" banana hair clips, found live 2026-07-16) must never
  // rank in a produce band.
  care: ['shampoo', 'soap', 'lotion', 'conditioner', 'detergent', 'dishwashing', 'شامبو', 'صابون', 'لوشن', 'بلسم', 'معطر', 'منظف', 'مطهر', 'غسول', 'ملمع', 'مشبك', 'مشابك'],
  // housewares/appliances: vessels and machines are the PRODUCT; the food or
  // drink word next to them names their PURPOSE ("ابريق ماء" is a jug,
  // "غلاية ماء" a kettle, "جهاز طهي بالبخار مع خزان ماء" a food steamer —
  // found live 2026-07-16 ranking in the water family band for "ماء أروى").
  // Derived tier so the head noun beats the base ماء/شاي/قهوة keyword.
  // Curated to words that never name a consumable. Deliberately EXCLUDED:
  // زجاجه/كوب/bottle (genuine bottled water is sold as "زجاجة مياه من اروى"),
  // kettle ("Kettle Chips" the crisps brand), فلتر/filter ("قهوة فلتر"),
  // mixer (cocktail mixers), microwave (microwave popcorn) — for these the
  // derived tier would wrongly EXCLUDE consumables. ترمس IS included despite
  // also meaning lupin beans: water-thermos flyer offers pollute real water
  // results (found live 2026-07-16), and the ambiguity is self-neutralizing —
  // a lupin query containing ترمس classifies to the SAME family as the lupin
  // products, and same-family never gates.
  houseware: ['steamer', 'blender', 'thermos', 'flask', 'jug', 'pitcher', 'teapot', 'غلايه', 'قلايه', 'ابريق', 'اباريق', 'قربه', 'جهاز', 'اجهزه', 'ماكينه', 'مكواه', 'سخان', 'قدر', 'مقلاه', 'طنجره', 'مضخه', 'مضخات', 'ترمس'],
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
// بديل/substitute: "بديل الليمون" / "lemon substitute" names what the product
// REPLACES, not the produce itself (found live 2026-07-16 — a lemon-substitute
// dressing was the recorded "lowest lemon").
const FLAVOR_MARKERS = new Set(
  ['بنكهه', 'نكهه', 'نكهات', 'بطعم', 'طعم', 'برائحه', 'رائحه', 'بديل',
   'flavor', 'flavour', 'flavored', 'flavoured', 'flavors', 'flavours', 'scented', 'substitute'].map(normalizeText),
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
// بال/لل are left attached on purpose — they mark ingredients/purpose — and so
// is a bare conjunction waw: "سردين وصلصة الطماطم" is sardines WITH sauce, an
// accompaniment; stripping و would let the derived keyword hijack the family.
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

// --- fresh-produce intent --------------------------------------------------
// A bare produce query ("فراولة", "طماطم") names the FRESH product: if the
// shopper wanted the frozen/canned/formed variant they would have said so
// ("فراولة مجمدة", "طماطم مقشرة"). These helpers let consumers (grid bands,
// comparison gate, engine /offers ranking) demote same-family listings that
// are processed or carry a FORM word — produce has no forms, so a typed
// same-family name ("رول فراولة") is really a different product the family
// lexicon couldn't see. Naming the processing/form in the query disables it.
const PROCESSED_MARKERS = new Set(
  [
    'مجمد', 'مجمده', 'مجمدات', 'frozen',
    'معلب', 'معلبه', 'معلبات', 'canned', 'tinned',
    'مقشر', 'مقشره', 'peeled',
    'مجروش', 'مجروشه', 'crushed',
    'مطبوخ', 'مطبوخه', 'cooked',
    'chopped', 'diced', 'sliced',
    'مغطي', 'مغطاه', 'coated', // chocolate-COATED strawberries etc.
    'dried', // freeze-dried fruit (Arabic مجفف already classifies as powder)
    // frozen-food BRANDS whose produce bags never say "frozen" on the name
    // line ("مونتانا فراولة 1 كجم" is a frozen kilo bag). Only consulted for
    // fresh-produce-intent demotion, so "صدور ساديا" etc. are unaffected.
    'مونتانا', 'montana', 'داري', 'dari', 'الكبير', 'alkabeer', 'kabeer', 'ساديا', 'sadia', 'سيارا', 'seara', 'سنبله', 'sunbulah', 'sunbula',
  ].map(normalizeText),
);

// Does a name carry a processing marker (frozen/canned/peeled/…)? Article and
// conjunction-waw prefixes are stripped like family keywords ("المجمدة").
export function isProcessedProduce(text) {
  for (const w of normalizeText(text).split(' ')) {
    if (PROCESSED_MARKERS.has(w)) return true;
    const stripped = w.replace(/^(وال|ال|و)/, '');
    if (stripped !== w && PROCESSED_MARKERS.has(stripped)) return true;
  }
  return false;
}

// Is this family one of the fresh-produce (lowest-tier) families?
export function isProduceFamily(family) {
  return !!family && Object.prototype.hasOwnProperty.call(PRODUCE_FAMILIES, family);
}

// The produce family a query names with FRESH intent, or null: the query must
// resolve to a produce family and itself carry no form/processing words.
export function freshProduceIntent(query) {
  const fam = queryFamily(query);
  if (!isProduceFamily(fam)) return null;
  if (queryType(query) || isProcessedProduce(query)) return null;
  return fam;
}

const PRODUCE_KEYWORDS = (() => {
  const m = new Map(); // family -> Set of normalized keywords
  for (const [family, words] of Object.entries(PRODUCE_FAMILIES)) {
    m.set(family, new Set(words.map(normalizeText)));
  }
  return m;
})();

// How a produce family appears in a text: as the PRODUCT itself ('product' —
// a standalone word, definite article allowed), as a FLAVOUR/ingredient only
// ('flavored' — بال/لل attached, or next to a flavour marker), or not at all
// (null). "مصاصات بالفراولة" is a flavoured product even though no candy
// keyword survived OCR; "فراولة طازجة" is the product. A standalone mention
// anywhere wins over a flavoured one.
export function producePresence(text, family) {
  const keys = PRODUCE_KEYWORDS.get(family);
  if (!keys) return null;
  const words = normalizeText(text).split(' ');
  let flavored = false;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const plain = w.replace(/^(وال|ال)/, '');
    if (keys.has(plain)) {
      if (FLAVOR_MARKERS.has(words[i - 1]) || FLAVOR_MARKERS.has(words[i + 1])) {
        flavored = true;
        continue;
      }
      return 'product';
    }
    const attached = w.replace(/^(بال|لل)/, '');
    if (attached !== w && keys.has(attached)) flavored = true;
  }
  return flavored ? 'flavored' : null;
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
  const qTokens = queryTokens(query);
  if (!qTokens.length) return 1;
  const f = canonicalMatchText(`${item.name || ''} ${item.brand || ''}`);
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
// Packaging count words: a number followed by one of these IS the unit count of
// the package ("12 rolls", "30 pcs", "50 قرص"). Curated to container/count
// nouns that name the WHOLE sellable unit; per-sheet/inner counts (ورقة،
// منديل, sheets, wipes) stay out — two stores count those differently, and a
// wrong count is worse than no parse. Longest-first within a shared prefix so
// the regex alternation never truncates a word (علبه before علب).
const COUNT_WORDS = 'pcs|pc|pieces|piece|rolls|roll|bags|bag|cans|bottles|tablets|tabs|capsules|sachets|sachet|diapers'
  + '|قطعه|قطعة|قطع|حبه|حبة|حبات|عبوات|عبوه|عبوة|اكياس|كيس'
  + '|رولات|رول|لفات|لفه|علبه|علب|قوارير|قاروره|اقراص|قرص|كبسولات|كبسوله|اظرف|ظرف|حفاضات|حفاضه|حفاض';
const PACK_RE = [
  // "6 x 200 ml" and "24 قطعة × 125مل" (an optional count word between the
  // pack number and the ×) — pack first, size second.
  new RegExp(`(\\d+)\\s*(?:${COUNT_WORDS})?\\s*[x×*]\\s*(\\d+(?:[.,]\\d+)?)\\s*(${UNITS})${B}`, 'u'),
  new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${UNITS})${B}\\s*[x×*]\\s*(\\d+)`, 'u'), // 200 ml x 6
];
// Bonus pack WITH a per-item size ("9+3 × 200 مل" = 12 × 200 ml). Must be
// tried before PACK_RE, which would otherwise read only the free part
// ("3 × 200 مل"). Same plausibility rule as bonusPack below.
const PACK_BONUS_RE = new RegExp(
  `(\\d+)\\s*(?:(?:${COUNT_WORDS})\\s*)?\\+\\s*(\\d+)\\s*(?:${COUNT_WORDS})?\\s*[x×*]\\s*(\\d+(?:[.,]\\d+)?)\\s*(${UNITS})${B}`,
  'u',
);
const COUNT_RE = new RegExp(`(\\d+)\\s*(${COUNT_WORDS}|ct|count|s|x)${B}`, 'u');

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
    // Farsi yeh/kaf from flyer OCR — unit/count words (كيلو، كيس، ليتر…) must match
    .replace(/ی/g, 'ي')
    .replace(/ک/g, 'ك')
    // hamza/taa-marbuta fold so count words match all spellings ("أكياس" ->
    // "اكياس", "قطعة" -> "قطعه") — no unit token contains either letter
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    // Keep '+' too: grocery packs use bonus notation ("10+2", "8+2" = buy 10
    // get 2 free), whose TRUE unit count is the sum. parseSize reads it below.
    .replace(/[^\p{L}\p{N}\s.,x×*+]/gu, ' ')
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

// Bonus-pack notation "a+b" (buy a, get b free) — the TRUE quantity is a+b, and
// per-unit pricing must divide by that total, never by `a` alone or by a stray
// OCR count elsewhere in the name ("…10+2 مجانًا 12 قطعة" is 12, not 28). Only
// accept a plausible bonus (the free part never exceeds the paid part, small
// integers), so product-name digits like "Omega 3+6+9" are left untouched.
// The paid and free counts may sit adjacent ("10+2") or be separated by one
// packaging word ("8 رول +2 مجانا" = 8 rolls + 2 free). One interposed word
// only, so distant numbers ("40 ورقة (8 رول +2…") can't pair by accident.
const BONUS_RE = /(\d+)\s*(?:[\p{L}]+\s*)?\+\s*(\d+)/u;
function bonusPack(hay) {
  const m = BONUS_RE.exec(hay);
  if (!m) return null;
  const a = parseInt(m[1], 10);
  const b = parseInt(m[2], 10);
  if (!(a >= 1 && b >= 1 && b <= a && a + b <= 99)) return null;
  return a + b;
}

export function parseSize(name, sizeField) {
  const hay = normSize(`${name || ''} ${sizeField || ''}`);
  const bonus = bonusPack(hay); // total units of a "buy a get b free" pack, or null

  // Bonus pack with an explicit per-item size ("9+3 × 200 مل" = 12 × 200 ml)
  // — before the plain pack forms, which would only see "3 × 200 مل".
  const bm = PACK_BONUS_RE.exec(hay);
  if (bm) {
    const base = unitFor(bm[4]);
    const a = parseInt(bm[1], 10);
    const b = parseInt(bm[2], 10);
    if (base && a >= 1 && b >= 1 && b <= a && a + b <= 99) {
      const each = num(bm[3]) * base.factor;
      return { unit: base.unit, each, pack: a + b, total: each * (a + b), src: 'measure' };
    }
  }

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
        return { unit: base.unit, each, pack, total: each * pack, src: 'measure' };
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
      // A bonus pack ("9+3" beside "1 لتر" = 12 × 1 L) wins over both.
      const pm =
        new RegExp(`[x×*]\\s*(\\d+)(?!\\s*(?:${UNITS}))${B}`, 'u').exec(hay) ||
        /\b(\d+)\s*(?:pcs|pc|pack|s)\b/.exec(hay);
      const pack = bonus || (pm ? Math.max(1, parseInt(pm[1], 10)) : 1);
      return { unit: u.base, each, pack, total: each * pack, src: 'measure' };
    }
  }

  // A unitless bonus pack ("3+1 مجانًا 4 قطع") is a piece count of a+b — the
  // true total, ahead of any stray count word ("28 عبوة") the OCR left behind.
  if (bonus) return { unit: 'pcs', each: 1, pack: bonus, total: bonus, src: 'count' };

  // Pure count ("30 eggs", "12 pcs"). `src` records how trustworthy the count
  // is: a real packaging count word ("30 حبة", "12 rolls") is a package count
  // a shopper recognises; a bare "6's" / "12x" / "30 ct" suffix is a weaker
  // signal — good enough for size comparability, NOT good enough to advertise
  // a per-piece price on (Task: never display misleading unit prices).
  const cm = COUNT_RE.exec(hay);
  if (cm) {
    const n = parseInt(cm[1], 10);
    if (n > 0 && n <= 500) {
      const weak = cm[2] === 's' || cm[2] === 'x' || cm[2] === 'ct' || cm[2] === 'count';
      return { unit: 'pcs', each: 1, pack: n, total: n, src: weak ? 'count-weak' : 'count' };
    }
  }

  return { unit: null, each: null, pack: 1, total: null, src: null };
}

// --- query size intent ----------------------------------------------------------
// "Arwa Water 1.5L" names a product AND a package size. The size expression is
// not a lexical token — normalization shreds it ("1.5l" -> "1 5l") and every
// store spells it differently ("1.5L", "1.5 Ltr", "١٫٥ لتر"), so treating its
// fragments as mandatory words silently killed history/offers/summary matches
// for any size-carrying query (the "Water works, Arwa Water 1.5L doesn't" bug).
// Instead the size is read as a STRUCTURED filter: querySize() returns the size
// the query names (or null), queryTokens() tokenizes the query with the size
// expression removed, and matchStage() demotes results whose parsed size
// contradicts the query's — results with no parseable size are never demoted
// (refuse to guess). Mirrors engine matching.js — keep in sync (rule 2).
const SIZE_STRIP_RES = [PACK_BONUS_RE, PACK_RE[0], PACK_RE[1], ...UNIT_TO_BASE.map((u) => u.re), COUNT_RE];

function stripSizeExpressions(hay) {
  let out = hay;
  // A plausible bonus pack ("8+2", "8 رول +2") is a size expression too.
  if (bonusPack(out)) {
    const m = BONUS_RE.exec(out);
    if (m) out = out.slice(0, m.index) + ' ' + out.slice(m.index + m[0].length);
  }
  for (const re of SIZE_STRIP_RES) {
    let m;
    while ((m = re.exec(out))) out = out.slice(0, m.index) + ' ' + out.slice(m.index + m[0].length);
  }
  return out.replace(/\s+/g, ' ').trim();
}

// The package size a query explicitly names, or null.
export function querySize(query) {
  const sz = parseSize(query, '');
  return sz && sz.unit ? sz : null;
}

// The query's LEXICAL tokens: the size expression (when present) is removed
// before tokenizing, so matching sees only the product words. A query that is
// ONLY a size keeps its raw tokens (never return an empty interpretation).
export function queryTokens(query) {
  if (!querySize(query)) return tokens(query);
  const lex = tokens(stripSizeExpressions(normSize(query)));
  return lex.length ? lex : tokens(query);
}

// Does a parsed size CONTRADICT the query's named size? Only a confident "no":
// both parsed, and either a different unit family or totals >3% apart (the
// same tolerance product equivalence uses). Unknown sizes never contradict.
export function sizeContradicts(itemSize, qSize) {
  if (!qSize || !qSize.unit || !itemSize || !itemSize.unit) return false;
  if (itemSize.unit !== qSize.unit) return true;
  if (itemSize.total == null || qSize.total == null) return false;
  const hi = Math.max(itemSize.total, qSize.total);
  return hi > 0 && (hi - Math.min(itemSize.total, qSize.total)) / hi > 0.03;
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
// Returns { value, unit } or null when the size is unknown. TRUST LADDER
// (never display a misleading unit price): a measured weight/volume is always
// trustworthy; a per-piece price is shown only when the count came from an
// explicit packaging count word or bonus notation ("30 حبة", "12 rolls",
// "10+2") — a bare "6's"/"12x" suffix is too weak to advertise a price on.
export function unitPrice(item) {
  const sz = item._size || parseSize(item.name, item.size);
  if (!sz.unit || !sz.total || item.price == null) return null;
  if (sz.unit === 'ml') return { value: item.price / (sz.total / 1000), unit: 'L' };
  if (sz.unit === 'g') return { value: item.price / (sz.total / 1000), unit: 'kg' };
  if (sz.unit === 'pcs' && sz.src !== 'count-weak') return { value: item.price / sz.total, unit: 'pc' };
  return null;
}

// --- relevance + irrelevance -------------------------------------------------
// Score how well an item matches the query. Name dominates; brand counts less.
// Uses normalized tokens + bilingual synonym expansion so Arabic and English
// queries both rank sensibly.
function fieldScore(field, qTokens) {
  const f = canonicalMatchText(field);
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
  const words = canonicalMatchText(item.name).split(' ');
  for (const qt of qTokens) {
    const variants = expandToken(qt);
    for (let i = 0; i < words.length - 1; i++) {
      if (variants.includes(words[i]) && COMPOUND_SHIFTERS.has(words[i + 1])) return 0.45;
    }
  }
  return 1;
}

export function relevance(item, query) {
  const qOriginal = queryTokens(query);
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
  const qOriginal = queryTokens(query);
  if (!qOriginal.length) return true;
  const f = canonicalMatchText(item.name);
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

// Primary-result admission. A two-token product query expresses one compound
// intent, so both canonical tokens are mandatory. Longer queries may contain
// one optional descriptor (the same recall-preserving rule the comparison
// layer already uses). Partial matches remain useful discovery material, but
// belong in the explicitly separated Related section rather than the primary
// result count or Shopping Summary.
export function isPrimaryMatch(item, query) {
  const qTokens = queryTokens(query);
  if (qTokens.length < 2) return isRelevant(item, query);
  const coverage = tokenCoverage(item, query);
  return qTokens.length === 2 ? coverage >= 1 : coverage >= (qTokens.length - 1) / qTokens.length;
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

// --- Search Roadmap: deterministic match stages -------------------------------
// This is a price COMPARISON engine, not a discovery engine — the first results
// must be the products the user most likely wants to compare prices for. The
// stage is the grid's FIRST ranking key (marketplace.js sorts stage → family
// band → price), so no other signal (family, price, relevance score) may ever
// promote a result past a better stage. Deterministic and predictable:
//   Single word  — 5 primary match whose name is HEADED by the token ("ليمون
//                  أصفر", "ليمون كيلو", "Fresh Lemon 1kg" — weight/size/
//                  origin/color variants stay primary; generic lead-ins like
//                  fresh/طازج and numbers are skipped) · 4 other primary
//                  matches (the token trails a different head word —
//                  "كلوروكس ليمون" — or matched in the brand field only) ·
//                  2 weak substring-only match · 1 secondary — the word is
//                  only a flavour/ingredient/scent ("حليب بنكهة الليمون") or
//                  modifies a KNOWN different family ("عصير ليمون" for
//                  ليمون) — after ALL primary matches · 0 no match.
//                  NOTE: family agreement must never promote to 5 — the
//                  classifier keys off the query token itself, so "كلوروكس
//                  ليمون" is circularly "lemon family"; only the head word is
//                  independent evidence the product IS the token.
//   Multi word   — every query term is mandatory before any relaxation:
//                  5 exact phrase in the name · 4 all terms whole-word ·
//                  3 all terms strong (word-start tier) · 2 all terms matched
//                  (some substring-tier) · then gradually relax — 1 exactly one
//                  term missing · 0 more missing. A term may match in the brand
//                  field ("حليب المراعي" ⊃ name "حليب كامل الدسم" + brand
//                  "المراعي"), but the exact-phrase stage lives in the name.
// Mirrors the engine matching.js — keep in sync (HANDOFF rule 2).
//
// Flavour markers are DIRECTIONAL, unlike the produce-only FLAVOR_MARKERS:
// Arabic markers precede the flavour word ("بنكهة الفراولة" — فراولة is the
// flavour, the حليب before the marker is the product), English markers follow
// it ("strawberry flavoured milk" — strawberry is the flavour). A symmetric
// check would wrongly demote the head noun of "حليب بنكهة الفراولة" for حليب.
const FLAVOR_BEFORE = new Set(
  ['بنكهه', 'نكهه', 'نكهات', 'بطعم', 'طعم', 'برائحه', 'رائحه', 'بديل'].map(normalizeText),
);
const FLAVOR_AFTER = new Set(
  ['flavor', 'flavour', 'flavored', 'flavoured', 'flavors', 'flavours', 'scented', 'substitute'].map(normalizeText),
);

// How ONE query token appears in a name: as the PRODUCT itself ('primary' — a
// standalone word, definite article allowed), only as a flavour/ingredient/
// scent ('secondary' — بال/لل attached, next to a directional flavour marker,
// or followed by a compound shifter: "milk chocolate"), or not at all (null).
// producePresence generalized to any query token; a standalone primary mention
// anywhere wins over a secondary one. Conservative by design (§10): when in
// doubt the answer is 'primary' — the failure mode must stay "not demoted".
export function queryTokenPresence(text, tok) {
  const variants = new Set(expandToken(canonicalToken(tok)));
  const words = canonicalMatchText(text).split(' ');
  let secondary = false;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const plain = w.replace(/^(وال|ال)/, '');
    if (variants.has(w) || variants.has(plain)) {
      if (
        FLAVOR_BEFORE.has(words[i - 1]) ||
        FLAVOR_AFTER.has(words[i + 1]) ||
        COMPOUND_SHIFTERS.has(words[i + 1])
      ) {
        secondary = true;
        continue;
      }
      return 'primary';
    }
    const attached = w.replace(/^(بال|لل)/, '');
    if (attached !== w && (variants.has(attached) || variants.has(attached.replace(/^ال/, '')))) {
      secondary = true;
    }
  }
  return secondary ? 'secondary' : null;
}

// Per-variant match tier in a normalized text: 3 whole word · 2 word-start
// prefix (≥4 chars — the eggs/eggplant guard) · 1 long substring · 0 none.
function matchTier(v, text, wordSet) {
  if (!v || !text) return 0;
  if (wordSet.has(v)) return 3;
  if (v.length >= 4 && new RegExp(`(^| )${escapeRegex(v)}`).test(text)) return 2;
  if (v.length >= 5 && text.includes(v)) return 1;
  return 0;
}

// Generic lead-in words that never carry the product identity — skipped (along
// with pure numbers) when locating a name's HEAD word, so "Fresh Lemon 1kg"
// and "ليمون طازج" are both lemon-headed. Deliberately tiny: anything else in
// front of the token ("كلوروكس", a brand, another noun) IS a different head.
const HEAD_SKIP = new Set(
  ['fresh', 'new', 'organic', 'طازج', 'طازجه', 'جديد', 'جديده', 'عضوي', 'عضويه'].map(normalizeText),
);

// The first meaningful (ال-stripped) word of a normalized name, or ''.
function headWord(nameWords) {
  for (const w of nameWords) {
    const plain = w.replace(/^(وال|ال)/, '');
    if (!plain || /^\d+$/.test(plain) || HEAD_SKIP.has(plain)) continue;
    return plain;
  }
  return '';
}

// Do the query tokens appear as a contiguous in-order phrase in the name words
// (synonym variants allowed, definite article stripped on the name side)?
function phraseInName(qTokens, nameWords) {
  if (qTokens.length > nameWords.length) return false;
  const variantSets = qTokens.map((qt) => new Set(expandToken(qt)));
  outer: for (let i = 0; i + variantSets.length <= nameWords.length; i++) {
    for (let k = 0; k < variantSets.length; k++) {
      const w = nameWords[i + k];
      if (!variantSets[k].has(w) && !variantSets[k].has(w.replace(/^(وال|ال)/, ''))) continue outer;
    }
    return true;
  }
  return false;
}

export function matchStage(item, query) {
  const qTokens = queryTokens(query);
  if (!qTokens.length) return 0;
  // SIZE CAP: a query-named size ("Arwa Water 1.5L") is a mandatory term in
  // structured form — a result whose parsed size CONTRADICTS it can never sit
  // in a primary/full-coverage stage, exactly as a missing word couldn't.
  // Results with no parseable size are never demoted (refuse to guess).
  const qSize = querySize(query);
  if (qSize) {
    const sz = item._size || parseSize(item.name, item.size);
    if (sizeContradicts(sz, qSize)) {
      return rawMatchStage(item, qTokens, query) > 0 ? 1 : 0;
    }
  }
  return rawMatchStage(item, qTokens, query);
}

function rawMatchStage(item, qTokens, query) {
  const name = canonicalMatchText(item.name);
  const nameWords = name ? name.split(' ') : [];
  const nameSet = new Set(nameWords);
  const brand = canonicalMatchText(item.brand);
  const brandSet = new Set(brand ? brand.split(' ') : []);
  const tokTier = (qt) => {
    let best = 0;
    for (const v of expandToken(qt)) {
      best = Math.max(best, matchTier(v, name, nameSet), matchTier(v, brand, brandSet));
      if (best === 3) break;
    }
    return best;
  };

  if (qTokens.length === 1) {
    const qt = qTokens[0];
    // The role detector strips ال properly ("الليمون" IS the word), so a
    // 'primary' role is a word-level hit even when the raw tiers miss the
    // ال-attached form.
    const role = queryTokenPresence(item.name || '', qt);
    if (role === 'secondary') return 1;
    const t = tokTier(qt);
    if (!t && !role) return 0;
    // The word names a family but the product is a KNOWN different family —
    // the word is an ingredient/modifier there ("عصير ليمون" is juice, so
    // ليمون is a flavour in it). Unknown family never demotes (§10).
    const qFam = queryFamily(query);
    if (qFam) {
      const fam = productFamily(item.name || '');
      if (fam && fam !== qFam) return 1;
    }
    if (role !== 'primary' && t < 2) return 2;
    // Head-first: a primary match whose product name is HEADED by the token
    // ("ليمون أصفر") outranks one where the token trails a different head
    // word ("كلوروكس ليمون") or that matched only in the brand field.
    const variants = new Set(expandToken(qt));
    if (variants.has(headWord(nameWords))) return 5;
    return 4;
  }

  let whole = 0;
  let strong = 0;
  let matched = 0;
  for (const qt of qTokens) {
    const t = tokTier(qt);
    if (t >= 1) matched += 1;
    if (t >= 2) strong += 1;
    if (t === 3) whole += 1;
  }
  const n = qTokens.length;
  if (matched < n) return matched >= n - 1 ? 1 : 0;
  // KNOWN-DIFFERENT-FAMILY cap — the multi-word twin of the single-word rule
  // above. Full token coverage can be accidental: "ماء أروى 1.5" fully
  // matches a food steamer ("… ارويك … خزان ماء … 1.5 لتر" — brand prefix +
  // purpose word + capacity digits), yet the product is a KNOWN different
  // family (houseware vs water) — it may never outrank genuine matches.
  // Unknown family never demotes (§10: failure mode stays "not demoted").
  const qFam = queryFamily(query);
  if (qFam) {
    const fam = productFamily(item.name || '');
    if (fam && fam !== qFam) return 1;
  }
  if (phraseInName(qTokens, nameWords)) return 5;
  if (whole === n) return 4;
  if (strong === n) return 3;
  return 2;
}

// --- THE JOURNEY POLICY TABLE — one interpretation, declared per-feature policy
// (HISTORY §34). Every comparison-shaped feature (the Shopping Summary, the
// engine's price alerts, the engine's price-history statistics) answers the
// same interpretive question — "which of these candidates ARE the queried
// product?" — through ONE shared gate ladder: stage band → family → type →
// fresh-produce. Features may differ in PURPOSE, and only in what this table
// declares; any other behavioral difference between them is accidental
// divergence — fix it, never fork it.
//
//   singleWordBand 'exact'   — single-word queries gate on the exact best
//                              stage present (5 beats 4: a ليمون comparison
//                              is never driven by "كلوروكس ليمون" while true
//                              lemons exist).
//                  'primary' — stages 5 and 4 are ONE band. For statistics,
//                              word position ("حليب المراعي" vs "المراعي
//                              حليب") is the same product and must never
//                              split a price series.
//   familyFallback 'dominant' — a family-less (brand-only) query infers the
//                              target family from the pool's dominant one.
//                  'none'    — only a query-NAMED family gates: statistics
//                              never infer a family the user didn't name (a
//                              300-identity historical pool is far weaker
//                              evidence than today's grid).
//   neverEmpty     true      — a gate that would empty the pool un-applies
//                              (a comparison must compare something).
//                  false     — an emptied pool IS the answer: an unattended
//                              alert prefers silence over a wrong product.
//
// The alert tier matches the summary tier everywhere except neverEmpty — a
// watch may only ever act on a SUBSET of what the Summary would recommend
// from the same candidates (its extra strictness — relevance floor 50,
// reference-size ±25%, flyer NAME-tier only — is declared in the engine's
// monitor.js and only ever narrows). Mirrors engine matching.js — keep in
// sync (HANDOFF rule 2).
export const JOURNEY_POLICY = {
  summary: { singleWordBand: 'exact', familyFallback: 'dominant', neverEmpty: true },
  alert: { singleWordBand: 'exact', familyFallback: 'dominant', neverEmpty: false },
  history: { singleWordBand: 'primary', familyFallback: 'none', neverEmpty: true },
};

// Collapse a raw match stage into a tier's comparison band. Multi-word queries
// treat all full-coverage stages (5..2 — phrase/whole-word/strong/substring
// are layout refinements of "every term matched") as ONE band in every tier,
// so word order never hides a cheaper genuine product; single-word banding is
// the tier's declared policy.
export function stageBand(stage, multiWord, singleWordBand) {
  if (multiWord) return stage >= 2 ? 2 : stage;
  if (singleWordBand === 'primary') return stage >= 4 ? 4 : stage;
  return stage;
}

// resolveJourneyPool — the shared gate ladder. Each candidate carries the
// interpretation of one listing over the SAME text that admitted it to the
// pool: { stage, family, type, text } (plus whatever the caller needs back —
// candidates pass through untouched). Returns { kept, targetFamily,
// stageExcluded, familyExcluded, typeExcluded, freshExcluded }: excluded
// candidates are COUNTED, never silently dropped (honesty rule 6 — callers
// surface the counts).
export function resolveJourneyPool(candidates, query, tierName) {
  const policy = JOURNEY_POLICY[tierName] || JOURNEY_POLICY.summary;
  const multiWord = queryTokens(query).length > 1;
  const out = {
    kept: candidates.slice(),
    targetFamily: null,
    stageExcluded: 0,
    familyExcluded: 0,
    typeExcluded: 0,
    freshExcluded: 0,
  };
  if (!out.kept.length) return out;

  // STAGE GATE (Search Roadmap, HANDOFF rule 9) — only candidates in the
  // pool's BEST match band may compete or be recommended.
  const band = (c) => stageBand(c.stage || 0, multiWord, policy.singleWordBand);
  const maxBand = out.kept.reduce((m, c) => Math.max(m, band(c)), 0);
  const staged = out.kept.filter((c) => band(c) === maxBand);
  out.stageExcluded = out.kept.length - staged.length;
  out.kept = staged;

  // FAMILY GATE — candidates of a KNOWN different family never compete
  // ("نادك منزوع الدسم" must never offer yogurt as the cheaper milk).
  // Family-less candidates stay: we refuse to guess a mismatch.
  let targetFamily = queryFamily(query);
  if (!targetFamily && policy.familyFallback === 'dominant') {
    const counts = new Map();
    let familied = 0;
    for (const c of out.kept) {
      if (!c.family) continue;
      familied += 1;
      counts.set(c.family, (counts.get(c.family) || 0) + 1);
    }
    let top = null;
    for (const [f, n] of counts) if (!top || n > top.n) top = { f, n };
    targetFamily = top && top.n >= 2 && top.n / familied > 0.5 ? top.f : null;
  }
  out.targetFamily = targetFamily;
  if (targetFamily) {
    const famKept = out.kept.filter((c) => !c.family || c.family === targetFamily);
    if (famKept.length || !policy.neverEmpty) {
      out.familyExcluded = out.kept.length - famKept.length;
      out.kept = famKept;
    }
  }
  if (!out.kept.length) return out;

  // TYPE GATE (the FORM attribute) — a query-named form ("chicken nuggets")
  // excludes KNOWN different forms ("chicken roll"); form-less candidates stay.
  const targetType = queryType(query);
  if (targetType) {
    const typed = out.kept.filter((c) => {
      const t = c.type !== undefined ? c.type : productType(c.text || '');
      return !t || t === targetType;
    });
    if (typed.length || !policy.neverEmpty) {
      out.typeExcluded = out.kept.length - typed.length;
      out.kept = typed;
    }
  }
  if (!out.kept.length) return out;

  // FRESH-PRODUCE GATE — a bare produce query ("فراولة") names the FRESH
  // product: candidates that carry a FORM word, a processing marker
  // (frozen/canned/…), or that mention the produce only as a flavour must not
  // compete. Naming the form/processing in the query disables the gate.
  const freshFam = freshProduceIntent(query);
  if (freshFam && (!targetFamily || targetFamily === freshFam)) {
    const fresh = out.kept.filter((c) => {
      const text = c.text || '';
      const t = c.type !== undefined ? c.type : productType(text);
      if (t || isProcessedProduce(text)) return false;
      return producePresence(text, freshFam) !== 'flavored';
    });
    if (fresh.length || !policy.neverEmpty) {
      out.freshExcluded = out.kept.length - fresh.length;
      out.kept = fresh;
    }
  }
  return out;
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
