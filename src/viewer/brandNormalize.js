// viewer/brandNormalize.js — the OCR NORMALIZATION LAYER for brand detection.
//
// One job: repair a noisy flyer-OCR token into a canonical brand name from the
// Brand Knowledge (brandKnowledge.js). The knowledge base holds the TRUTH; this
// layer REPAIRS the input so a mangled token can reach that truth. The two are
// deliberately separate — misspellings and OCR errors never pollute the clean
// brand list; they are absorbed here as repair rules instead.
//
// Repairs applied, cheapest first and all bounded/conservative:
//   • folding      — match.js Arabic folding (alef/hamza/taa-marbuta, Farsi
//                    glyphs) + Latin diacritic stripping ("Ülker" → "ulker").
//   • article      — drop a leading Arabic definite article ("الوطنية" ⇄ "وطنية").
//   • doubled      — collapse OCR letter-doubling / broken ligatures ("sadiaa",
//                    "ulkker") by comparing fully de-duplicated forms.
//   • trailing junk — a canonical name plus 1–2 stray appended letters
//                    ("ساديات" → "ساديا").
//
// If none match, matchBrand returns null and the caller keeps using the generic
// parser. An unknown brand NEVER fails and NEVER needs a dictionary entry — the
// dictionary only improves quality when a KNOWN brand is recognized.
//
// Pure (no DOM, no network) — tested offline in viewer.test.mjs.

import { normalizeText } from '../match.js';
import { BRANDS } from './brandKnowledge.js';

// Fold to a matching key: match.js's Arabic-aware normalizeText, then strip
// Latin combining diacritics so "Ülker" and "ulker" collapse to one form.
function fold(s) {
  return normalizeText(s).normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

// Drop a leading Arabic definite article (ال / وال) for an alternate key.
const stripArticle = (w) => w.replace(/^(وال|ال)/, '');

// Collapse every run of a repeated letter to one, so OCR doubling / broken
// ligatures ("goody"→"good"? no — "gooody", "ulkker") reduce to a stable form.
const dedupe = (s) => s.replace(/(.)\1+/g, '$1');

// Words that are a brand's canonical form but ALSO ordinary language, so a bare
// occurrence must never be read as the brand ("الكبير"/"كبير" = "the big";
// English "fine"). These are guarded here — not omitted from the truthful
// knowledge base — and are also skipped when building the index.
const AMBIGUOUS = new Set(['الكبير', 'كبير', 'fine'].map(fold));

// Sub-words too generic to identify a brand on their own, dropped when a
// MULTI-word brand name is broken into per-word keys ("California Garden" must
// not make every "garden" a brand). The full and concatenated forms still index.
const GENERIC = new Set(
  ['al', 'the', 'garden', 'gold', 'golden', 'family', 'farm', 'fresh', 'food', 'house', 'home', 'star', 'royal', 'classic'].map(fold),
);

// --- canonical index (DERIVED from the clean knowledge base) -------------------
// folded key -> canonical English display name. The per-word, article-stripped
// and concatenated keys are computed HERE (the normalization layer's job); the
// knowledge base stores none of them.
const INDEX = new Map();
const DEDUPE_INDEX = new Map(); // dedupe(key) -> display, for doubled-letter repair
const FUZZY_KEYS = []; // keys of length >= 4, eligible for trailing-junk repair

function addKey(rawKey, display) {
  const k = fold(rawKey);
  if (!k || k.length < 2 || AMBIGUOUS.has(k)) return;
  if (!INDEX.has(k)) {
    INDEX.set(k, display);
    if (k.length >= 4) FUZZY_KEYS.push(k);
  }
  const d = dedupe(k);
  if (!DEDUPE_INDEX.has(d)) DEDUPE_INDEX.set(d, display);
}

for (const { en, ar } of BRANDS) {
  const display = en;
  for (const name of [en, ar]) {
    if (!name) continue;
    const words = fold(name).split(' ').filter(Boolean);
    for (const w of words) {
      if (GENERIC.has(w)) continue;
      addKey(w, display);
      const s = stripArticle(w);
      if (s !== w) addKey(s, display); // article-attached Arabic form
    }
    if (words.length > 1) addKey(words.join(''), display); // OCR-joined form
  }
}

// The number of brands known — for tests / sanity, never for logic.
export const brandCount = BRANDS.length;

// matchBrand(rawToken) -> canonical display name, or null.
// Layered repair, cheapest first; every step is bounded so an unknown word
// simply returns null.
export function matchBrand(raw) {
  const n = fold(raw);
  if (!n) return null;
  const s = stripArticle(n);

  // A bare ambiguous word is never a brand (banner copy like "التوفير الكبير").
  if (AMBIGUOUS.has(n) || AMBIGUOUS.has(s)) return null;

  // 1. exact canonical hit (after folding, and after article strip).
  if (INDEX.has(n)) return INDEX.get(n);
  if (s !== n && INDEX.has(s)) return INDEX.get(s);

  // Below here is genuine repair; keep it off very short tokens where a fuzzy
  // hit would be noise rather than a fix.
  if (n.length < 4) return null;

  // 2. OCR letter-doubling / broken ligatures: compare de-duplicated forms.
  const hit = DEDUPE_INDEX.get(dedupe(n));
  if (hit) return hit;

  // 3. trailing OCR junk: the token is a canonical key plus 1–2 stray letters
  //    ("ساديات" = "ساديا" + "ت"). Only appended junk (token longer than the
  //    key) — never dropped letters, which would over-match shorter words.
  for (const k of FUZZY_KEYS) {
    if (n.length > k.length && n.length - k.length <= 2 && n.startsWith(k)) {
      return INDEX.get(k);
    }
  }

  return null;
}
