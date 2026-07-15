// viewer/brandKnowledge.js — BRAND KNOWLEDGE: a small, curated set of the major
// supermarket brands that recur in Saudi grocery flyers. This module is the
// TRUTH: each entry is a brand's CANONICAL name only, in English and Arabic.
//
// It deliberately does NOT store OCR mistakes, misspellings, broken ligatures
// or spelling variants. Repairing noisy flyer text into a canonical name is a
// separate concern that lives in the OCR normalization layer
// (brandNormalize.js) — this file only says "these are the real brands and
// this is how each is spelled." Keeping the two apart is what lets the knowledge
// stay clean and tiny while the repair rules evolve independently.
//
// SCOPE — intentionally small (target ~50–100 brands). This is not a database
// and must never become one. Add a brand ONLY when it recurs across Saudi
// grocery flyers and normalizing it meaningfully improves display or matching.
// The generic parser works with or without any given entry — an unknown brand
// simply falls through to generic parsing, it never fails.
//
// HOW TO ADD A BRAND (seconds):
//   1. Append `{ en: 'CanonicalEnglish', ar: 'الاسم العربي' }` in the right
//      group below. Use the brand's real, correctly-spelled names.
//   2. That's it — do NOT add OCR variants or misspellings here. If OCR mangles
//      the name, teach the repair layer (brandNormalize.js), not this file.
//   3. Avoid names that are ordinary words in either language (e.g. Arabic
//      "الكبير" = "the big"); those are handled/guarded in the normalize layer.
//
// `ar` may be '' when a brand has no established Arabic spelling on flyers.

export const BRANDS = [
  // --- dairy, cheese, milk, juice ---
  { en: 'Almarai', ar: 'المراعي' },
  { en: 'Nadec', ar: 'نادك' },
  { en: 'Al Safi', ar: 'الصافي' },
  { en: 'Nada', ar: 'ندى' },
  { en: 'Puck', ar: 'بوك' },
  { en: 'Kiri', ar: 'كيري' },
  { en: 'Luna', ar: 'لونا' },
  { en: 'Lurpak', ar: 'لورباك' },
  { en: 'President', ar: 'بريزيدنت' },
  { en: 'Nestle', ar: 'نستله' },
  { en: 'Anchor', ar: 'أنكور' },
  { en: 'Rainbow', ar: 'راينبو' },
  { en: 'Nido', ar: 'نيدو' },

  // --- poultry, frozen, meat ---
  { en: 'Sadia', ar: 'ساديا' },
  { en: 'Seara', ar: 'سيارا' },
  { en: 'Doux', ar: 'دوكس' },
  { en: 'Al Watania', ar: 'الوطنية' },
  { en: 'Tanmiah', ar: 'التنمية' },
  { en: 'Americana', ar: 'أمريكانا' },
  { en: 'Sunbulah', ar: 'سنبلة' },
  { en: 'Al Kabeer', ar: 'الكبير' },
  { en: 'Herfy', ar: 'هرفي' },

  // --- pantry: oil, grains, canned, bakery ---
  { en: 'Goody', ar: 'قودي' },
  { en: 'Afia', ar: 'عافية' },
  { en: 'Al Alali', ar: 'العلالي' },
  { en: 'California Garden', ar: 'كاليفورنيا' },
  { en: 'Halwani', ar: 'حلواني' },
  { en: 'Deemah', ar: 'ديمة' },
  { en: 'Quaker', ar: 'كواكر' },
  { en: 'Maggi', ar: 'ماجي' },
  { en: 'Knorr', ar: 'كنور' },
  { en: 'Heinz', ar: 'هاينز' },
  { en: "Foster Clark's", ar: 'فوستر كلاركس' },

  // --- beverages, coffee, tea ---
  { en: 'Pepsi', ar: 'بيبسي' },
  { en: 'Nescafe', ar: 'نسكافيه' },
  { en: 'Lipton', ar: 'ليبتون' },
  { en: 'Rani', ar: 'راني' },
  { en: 'Vimto', ar: 'فيمتو' },
  { en: 'Tang', ar: 'تانج' },
  { en: 'Barbican', ar: 'باربيكان' },
  { en: 'Moussy', ar: 'موسي' },
  { en: 'Aquafina', ar: 'أكوافينا' },
  { en: 'Nova', ar: 'نوفا' },

  // --- snacks, chocolate, biscuits ---
  { en: 'Nutella', ar: 'نوتيلا' },
  { en: 'Galaxy', ar: 'جالكسي' },
  { en: 'Kinder', ar: 'كيندر' },
  { en: 'Oreo', ar: 'أوريو' },
  { en: 'KitKat', ar: 'كيتكات' },
  { en: 'Ulker', ar: 'أولكر' },
  { en: 'Loacker', ar: 'لواكر' },
  { en: 'Lays', ar: 'ليز' },
  { en: 'Snickers', ar: 'سنيكرز' },
  { en: 'Twix', ar: 'تويكس' },

  // --- household & personal care ---
  { en: 'Tide', ar: 'تايد' },
  { en: 'Ariel', ar: 'أريال' },
  { en: 'Persil', ar: 'برسيل' },
  { en: 'Clorox', ar: 'كلوروكس' },
  { en: 'Fairy', ar: 'فيري' },
  { en: 'Comfort', ar: 'كمفورت' },
  { en: 'Downy', ar: 'داوني' },
  { en: 'Dettol', ar: 'ديتول' },
  { en: 'Lifebuoy', ar: 'لايفبوي' },
  { en: 'Fine', ar: 'فاين' },
  { en: 'Sanita', ar: 'سانيتا' },
  { en: 'Pampers', ar: 'بامبرز' },
  { en: 'Huggies', ar: 'هجيز' },
  { en: 'Lux', ar: 'لكس' },
  { en: 'Dove', ar: 'دوف' },
  { en: 'Sunsilk', ar: 'سنسيلك' },
  { en: 'Colgate', ar: 'كولجيت' },
];
