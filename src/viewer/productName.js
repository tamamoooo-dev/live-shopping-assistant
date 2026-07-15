// viewer/productName.js — PRESENTATION-layer product-title normalization for
// the product sheet. Engine offer names are machine-merged flyer OCR ("or
// chicken ساديا sadia frozen chicken breast 900 g x 10 …"): both languages,
// banner debris, repeated brand names and the package size all in one string.
// This module derives the sheet's structured display fields — an Arabic line,
// an English line and the brand — from that text. Display only: the stored
// offer, cart payload contract, search seeds and all matching logic keep
// reading the raw offer fields untouched.
//
// CONFIDENCE GATE: OCR names are often banner / slogan / person-name garbage
// ("Frozen Imily Et", "محمد عجم عايلي افتتاح ملاعبه ..."). Rather than try to
// repair every word, each per-language line is SCORED; when a line reads as
// low-confidence garbage AND a clean canonical name can be built, the garbage
// is REJECTED and replaced by that canonical name — assembled ONLY from
// reliable classification the app already has (family + type + processing, via
// match.js), never fabricated. It is better to show "Frozen Chicken Breast"
// than "Frozen Imily Et". Nothing here touches search, OCR, matching or backend.
//
// Pure (no DOM, no network) — tested offline in viewer.test.mjs.

import { normalizeText, productFamily, productType, offerFamily } from '../match.js';
import { cleanOfferName } from '../brochure.js';
import { matchBrand } from './brandNormalize.js';

// Brand detection is delegated to the two-layer Brand Knowledge: the canonical
// truth (brandKnowledge.js) and the OCR normalization layer (brandNormalize.js,
// matchBrand). This file never hard-codes brands — an UNKNOWN brand simply
// isn't recognized, and the generic parsing below still cleans the name.

/* --- noise detection --------------------------------------------------------------- */
// Size/pack tokens are removed from the name lines because the size gets its
// own field (offerSize/sizeLabel over the RAW name — this module never feeds
// the parser). Number/unit vocabulary mirrors match.js parseSize.
const NUM = '[\\d٠-٩۰-۹]+(?:[.,٫][\\d٠-٩۰-۹]+)?';
const UNIT = '(?:l|lt|ltr|liter|litre|litres|ml|kg|kgs|kilo|kilos|g|gm|gr|grm|gram|grams|جم|جرام|غرام|غ|كجم|كغ|كيلو|كيلوجرام|مل|لتر|ليتر)';
const COUNT = '(?:pcs|pc|pieces|piece|ct|count|pack|قطعه|قطعة|قطع|حبه|حبة|حبات|عبوه|عبوة|عبوات|كيس|اكياس|أكياس)';
const SIZE_TOKEN = new RegExp(`^${NUM}\\s*${UNIT}?$`, 'iu'); // "900", "900g", "2.85l"
const UNIT_TOKEN = new RegExp(`^${UNIT}$`, 'iu');
const COUNT_TOKEN = new RegExp(`^(?:${NUM})?${COUNT}$`, 'iu'); // "pcs", "24pcs"
const PACK_TOKEN = new RegExp(`^(?:${NUM}${UNIT}?[x×*]${NUM}${UNIT}?|[x×*]${NUM}${UNIT}?|${NUM}${UNIT}?[x×*])$`, 'iu'); // "900gx10", "x10", "10x"

function isNoise(tok) {
  if (tok.length === 1) return true; // stray OCR characters
  if (/[%٪]/.test(tok)) return true; // discount fragments
  if (!/[\p{L}\p{N}]/u.test(tok)) return true; // punctuation-only
  const t = tok.toLowerCase();
  return SIZE_TOKEN.test(t) || UNIT_TOKEN.test(t) || COUNT_TOKEN.test(t) || PACK_TOKEN.test(t);
}

// Marketing words safe to drop from ANYWHERE in a name (cleanOfferName only
// trims the front). Kept small on purpose: anything that could be part of a
// real product name ("cookies AND cream") stays out.
const INLINE_DEBRIS = new Set(
  [
    'offer', 'offers', 'deal', 'deals', 'promo', 'promotion', 'special', 'amazing',
    'exciting', 'mega', 'sale', 'weekly', 'save', 'free', 'only', 'day', 'days',
    'or', 'al', 'week', 'weeks', 'price', 'prices', 'value',
    'this', 'that', 'these', 'those', // demonstratives are never a product name
    'عرض', 'عروض', 'فقط', 'خصم', 'وفر', 'توفير', 'مجانا', 'تخفيضات', 'او', 'ايام', 'يوم',
    // flyer price-tag / banner labels that pad OCR names with non-product words
    'سعر', 'السعر', 'اسعار', 'أسعار', 'قيمه', 'قيمة', 'اكثر', 'خاص', 'خاصه',
    // bare pronouns / prepositions left behind by OCR (never product identity)
    'هذا', 'هذه', 'ذلك', 'تلك', 'من', 'في', 'مع', 'على', 'الى',
    // campaign / banner / football-promo slogans that bleed into OCR names
    'الاسبوع', 'اسبوع', 'افتتاح', 'ملعب', 'ملاعب', 'ملاعبه', 'عيشها', 'اهداف', 'بطوله', 'مباراه',
    // month names are validity-banner debris wherever they appear in OCR text
    'january', 'february', 'march', 'april', 'june', 'july', 'august',
    'september', 'october', 'november', 'december',
    'يناير', 'فبراير', 'مارس', 'ابريل', 'مايو', 'يونيو', 'يوليو', 'اغسطس',
    'سبتمبر', 'اكتوبر', 'نوفمبر', 'ديسمبر',
  ].map(normalizeText),
);

const isArabic = (tok) => /[؀-ۿ]/.test(tok);

// The matching form of a word: normalizeText (Arabic folding) plus Latin
// diacritic folding ("Ülker" and "ulker" must deduplicate). Display always
// uses the original token.
const norml = (tok) =>
  normalizeText(tok)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');

// Is a word inline debris? Checked with the Arabic definite article stripped
// ("التوفير" is وفر-family banner copy just like "توفير").
const isDebris = (norm) =>
  INLINE_DEBRIS.has(norm) || INLINE_DEBRIS.has(norm.replace(/^(وال|ال)/, ''));

// English words arrive in flyer ALL-CAPS or lowercase; present them in Title
// Case, but leave deliberate mixed case ("LuLu") alone.
const presentCase = (w) =>
  /^[A-Z]/.test(w) && !/^[A-Z]+$/.test(w)
    ? w
    : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();

/* --- confidence gate: canonical fallback for low-quality OCR ----------------------- */
// Clean bilingual display for the FAMILY and TYPE that match.js already
// classifies, plus the PROCESSING adjective. These are "canonical product
// keywords" — small and curated (grocery staples), never a database. They are
// only ever used to REPLACE a rejected OCR line, never to enrich a good one.
const FAMILY_DISPLAY = {
  milk: { en: 'Milk', ar: 'حليب' }, laban: { en: 'Laban', ar: 'لبن' },
  yogurt: { en: 'Yogurt', ar: 'زبادي' }, cheese: { en: 'Cheese', ar: 'جبن' },
  cream: { en: 'Cream', ar: 'قشطة' }, butter: { en: 'Butter', ar: 'زبدة' },
  eggs: { en: 'Eggs', ar: 'بيض' }, chicken: { en: 'Chicken', ar: 'دجاج' },
  meat: { en: 'Meat', ar: 'لحم' }, fish: { en: 'Fish', ar: 'سمك' },
  rice: { en: 'Rice', ar: 'أرز' }, pasta: { en: 'Pasta', ar: 'معكرونة' },
  bread: { en: 'Bread', ar: 'خبز' }, oil: { en: 'Oil', ar: 'زيت' },
  water: { en: 'Water', ar: 'ماء' }, juice: { en: 'Juice', ar: 'عصير' },
  tea: { en: 'Tea', ar: 'شاي' }, coffee: { en: 'Coffee', ar: 'قهوة' },
  sugar: { en: 'Sugar', ar: 'سكر' }, flour: { en: 'Flour', ar: 'دقيق' },
  dates: { en: 'Dates', ar: 'تمر' }, honey: { en: 'Honey', ar: 'عسل' },
  vinegar: { en: 'Vinegar', ar: 'خل' }, chocolate: { en: 'Chocolate', ar: 'شوكولاتة' },
  biscuit: { en: 'Biscuits', ar: 'بسكويت' }, cake: { en: 'Cake', ar: 'كيك' },
  pastry: { en: 'Pastry', ar: 'معجنات' }, icecream: { en: 'Ice Cream', ar: 'آيس كريم' },
  cereal: { en: 'Cereal', ar: 'حبوب' }, chips: { en: 'Chips', ar: 'شيبس' },
  sauce: { en: 'Sauce', ar: 'صلصة' }, soup: { en: 'Soup', ar: 'شوربة' },
  soda: { en: 'Soft Drink', ar: 'مشروب غازي' }, candy: { en: 'Candy', ar: 'حلوى' },
  jam: { en: 'Jam', ar: 'مربى' }, tomato: { en: 'Tomato', ar: 'طماطم' },
  potato: { en: 'Potato', ar: 'بطاطس' }, onion: { en: 'Onion', ar: 'بصل' },
  cucumber: { en: 'Cucumber', ar: 'خيار' }, carrot: { en: 'Carrot', ar: 'جزر' },
  lemon: { en: 'Lemon', ar: 'ليمون' }, banana: { en: 'Banana', ar: 'موز' },
  apple: { en: 'Apple', ar: 'تفاح' }, orange: { en: 'Orange', ar: 'برتقال' },
  grapes: { en: 'Grapes', ar: 'عنب' }, mango: { en: 'Mango', ar: 'مانجو' },
  strawberry: { en: 'Strawberry', ar: 'فراولة' }, watermelon: { en: 'Watermelon', ar: 'بطيخ' },
};
// Plural-form types agree with a feminine processing adjective ("صدور … مجمدة").
const TYPE_DISPLAY = {
  nuggets: { en: 'Nuggets', ar: 'ناجتس' }, burger: { en: 'Burger', ar: 'برجر' },
  sausage: { en: 'Sausage', ar: 'سجق' }, roll: { en: 'Roll', ar: 'رول' },
  mince: { en: 'Mince', ar: 'مفروم' }, fillet: { en: 'Fillet', ar: 'فيليه' },
  breast: { en: 'Breast', ar: 'صدور', f: true }, strips: { en: 'Strips', ar: 'شرائح', f: true },
  wings: { en: 'Wings', ar: 'أجنحة', f: true }, kofta: { en: 'Kofta', ar: 'كفتة' },
  luncheon: { en: 'Luncheon', ar: 'لانشون' },
};
const PROCESSING_DISPLAY = {
  frozen: { en: 'Frozen', arM: 'مجمد', arF: 'مجمدة' },
  fresh: { en: 'Fresh', arM: 'طازج', arF: 'طازجة' },
  canned: { en: 'Canned', arM: 'معلب', arF: 'معلبة' },
};
const PROC_MARKERS = {
  frozen: ['frozen', 'مجمد'], canned: ['canned', 'tinned', 'معلب'], fresh: ['fresh', 'طازج'],
};
// Genuine product attributes (not covered by the family/type classifier) that
// keep an OCR line trustworthy. Deliberately EXCLUDES marketing words (value,
// mega, family, كبير) so a banner phrase never scores as trustworthy.
const DESCRIPTORS = new Set(
  [
    'fresh', 'natural', 'organic', 'original', 'classic', 'instant', 'premium', 'light',
    'diet', 'low', 'fat', 'full', 'skimmed', 'whole', 'smoked', 'roasted', 'ground',
    'salted', 'unsalted', 'sweet', 'plain', 'mixed', 'assorted', 'pure', 'creamy',
    'crunchy', 'spicy', 'hot', 'red', 'green', 'white', 'black', 'extra', 'boneless',
    'طازج', 'طبيعي', 'عضوي', 'اصلي', 'فوري', 'ممتاز', 'لايت', 'دايت', 'قليل', 'دسم', 'كامل',
    'منزوع', 'مبشور', 'مدخن', 'محمر', 'مطحون', 'مملح', 'حلو', 'سادة', 'مشكل', 'متنوع',
    'نقي', 'احمر', 'اخضر', 'ابيض', 'اسود', 'اضافي', 'حار', 'مقرمش', 'مقطع', 'اكسترا', 'فريش',
  ].map(normalizeText),
);
const PROC_WORDS = new Set(
  Object.values(PROCESSING_DISPLAY)
    .flatMap((p) => [p.en, p.arM, p.arF])
    .concat('tinned')
    .map(normalizeText),
);

// The reliable processing state (frozen / fresh / canned) from the offer's name
// AND its structured category slug — never guessed beyond these markers.
function detectProcessing(offer) {
  const hay = normalizeText(
    `${offer.name || ''} ${offer.nameAr || ''} ${String(offer.category || '').replace(/-/g, ' ')}`,
  );
  for (const proc of ['frozen', 'canned', 'fresh']) {
    for (const m of PROC_MARKERS[proc]) if (hay.includes(normalizeText(m))) return proc;
  }
  return null;
}

// A clean canonical name from reliable classification only. { en, ar } — either
// may be '' (and both are '' when nothing reliable is known, i.e. no fallback
// exists and the OCR line must stand). Order differs by language:
// EN "Frozen Chicken Breast" · AR "صدور دجاج مجمدة".
function canonicalName(offer) {
  const fam = FAMILY_DISPLAY[offerFamily(offer)];
  const typ = TYPE_DISPLAY[productType(`${offer.name || ''} ${offer.nameAr || ''}`)];
  const pr = PROCESSING_DISPLAY[detectProcessing(offer)];
  if (!fam && !typ) return { en: '', ar: '' };
  const en = [pr && pr.en, fam && fam.en, typ && typ.en].filter(Boolean).join(' ');
  const arProc = pr ? (typ && typ.f ? pr.arF : pr.arM) : null;
  const ar = [typ && typ.ar, fam && fam.ar, arProc].filter(Boolean).join(' ');
  return { en, ar };
}

// Is a normalized word genuine product vocabulary (vs OCR / banner garbage)?
function isTrustedWord(norm, canonSet, brandSet) {
  if (!norm) return false;
  return (
    canonSet.has(norm) ||
    brandSet.has(norm) ||
    DESCRIPTORS.has(norm) ||
    PROC_WORDS.has(norm) ||
    !!productFamily(norm) ||
    !!productType(norm)
  );
}

// A line is low-confidence (reject it) only when 2+ garbage words match or
// outnumber the product words. The "2+ garbage" guard is deliberate: a line
// with a single unknown word is KEPT, so a real name we simply don't recognize
// ("Sensodyne", "Pril Ultra Power", "Chicken Franks") is never swapped for a
// possibly-wrong canonical guess — better to show the true name than fabricate.
function lowConfidence(count, trusted) {
  if (count === 0) return true;
  const untrusted = count - trusted;
  return untrusted >= 2 && untrusted >= trusted;
}

/* --- the normalizer --------------------------------------------------------------- */
// structureOfferName(offer) -> { en, ar, brand, fallback }
//   en/ar     the cleaned per-language name lines ('' when nothing survives)
//   brand     extracted brand display name, or null
//   fallback  the old display string (cleanOfferName of the raw text) — for
//             callers to show ONLY when no structured line could be derived.
export function structureOfferName(offer) {
  const raw = [offer && offer.name, offer && offer.nameAr]
    .filter(Boolean)
    .join(' ')
    .trim();
  const fallback = cleanOfferName(raw);
  let brand = (offer && offer.brand && String(offer.brand).trim()) || null;
  const brandNorm = brand ? new Set(norml(brand).split(' ')) : null;

  // Tokenize (front debris already trimmed), drop noise, pull the brand out.
  // Survivors group into RUNS: consecutive same-script words with nothing
  // removed between them — i.e. the source text's real phrases.
  const runs = []; // { ar, words: [{ tok, norm, ar }] }
  let broke = true; // a removed token (or script switch) ends the current phrase
  const tokenized = cleanOfferName(raw)
    .split(/\s+/)
    // OCR glues punctuation onto words ("ميرندا…", "milk,") — trim the edges.
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}%٪]+$/gu, ''))
    .filter(Boolean);
  for (const tok of tokenized) {
    const norm = norml(tok);
    // Brand detection runs on the ORIGINAL token so the OCR layer can do its
    // own folding/repair; noise and debris tokens are never brands.
    const b = !isNoise(tok) && norm && !isDebris(norm) ? matchBrand(tok) : null;
    if (b && !brand) brand = b;
    if (
      isNoise(tok) ||
      !norm ||
      isDebris(norm) ||
      b || // every brand mention leaves the name lines
      (brandNorm && brandNorm.has(norm)) // offer.brand repeats too
    ) {
      broke = true;
      continue;
    }
    const w = { tok, norm, ar: isArabic(tok) };
    const last = runs[runs.length - 1];
    if (!broke && last && last.ar === w.ar) last.words.push(w);
    else runs.push({ ar: w.ar, words: [w] });
    broke = false;
  }

  // Duplicates keep the occurrence living in the LONGEST phrase of their
  // language: in "or chicken … frozen chicken breast" the lone leading
  // fragment loses to the real phrase, yielding "Frozen Chicken Breast" —
  // not "Chicken Frozen Breast".
  const bestRun = new Map(); // norm -> the run whose occurrence survives
  for (const r of runs) {
    for (const w of r.words) {
      const cur = bestRun.get(w.norm);
      if (!cur || r.words.length > cur.words.length) bestRun.set(w.norm, r);
    }
  }
  const seen = new Set();
  const ar = [];
  const en = [];
  for (const r of runs) {
    for (const w of r.words) {
      if (bestRun.get(w.norm) !== r || seen.has(w.norm)) continue;
      seen.add(w.norm);
      if (w.ar) ar.push(w.tok);
      else en.push(presentCase(w.tok));
    }
  }

  // --- confidence gate ---------------------------------------------------------
  // Score each language line; if it reads as OCR garbage AND a clean canonical
  // name is available, show the canonical name instead (priority: canonical
  // product keywords over low-confidence OCR words). A trustworthy OCR line is
  // always kept — the canonical name never overrides a good one.
  const canon = canonicalName(offer);
  const brandSet = new Set(brand ? norml(brand).split(' ').filter(Boolean) : []);
  const canonSet = new Set(`${canon.en} ${canon.ar}`.split(/\s+/).map(norml).filter(Boolean));
  const gate = (tokens, canonical) => {
    let trusted = 0;
    for (const w of tokens) if (isTrustedWord(norml(w), canonSet, brandSet)) trusted += 1;
    return lowConfidence(tokens.length, trusted) && canonical ? canonical : tokens.join(' ');
  };

  return { en: gate(en, canon.en), ar: gate(ar, canon.ar), brand, fallback };
}
