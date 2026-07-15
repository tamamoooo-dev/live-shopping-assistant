// viewer/productName.js — PRESENTATION-layer product-title normalization for
// the product sheet. Engine offer names are machine-merged flyer OCR ("or
// chicken ساديا sadia frozen chicken breast 900 g x 10 …"): both languages,
// banner debris, repeated brand names and the package size all in one string.
// This module derives the sheet's structured display fields — an Arabic line,
// an English line and the brand — from that text. Display only: the stored
// offer, cart payload contract, search seeds and all matching logic keep
// reading the raw offer fields untouched.
//
// Pure (no DOM, no network) — tested offline in viewer.test.mjs.

import { normalizeText } from '../match.js';
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
    'or', 'al',
    'عرض', 'عروض', 'فقط', 'خصم', 'وفر', 'توفير', 'مجانا', 'تخفيضات', 'او', 'ايام', 'يوم',
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

  return { en: en.join(' '), ar: ar.join(' '), brand, fallback };
}
