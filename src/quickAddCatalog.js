// quickAddCatalog.js — the cart's quick-add vocabulary: everyday products a
// shopper writes on a list, grouped under the Browse departments (same ids,
// names and icons as the Browse page). Pure data — like the Browse taxonomy,
// these are OUR bilingual names, not retailer content, so each node carries
// its own `en` / `ar` and the UI picks by language.
//
// A quick-add item is a plain list line: no store, no price. Adding the same
// item again (from a chip or by typing its name) is one more of it.

export const QUICK_DEPARTMENTS = [
  { id: 'fresh', icon: '🥬', en: 'Fresh Food', ar: 'الطازج', items: [
    ['tomatoes', 'Tomatoes', 'طماطم'], ['cucumbers', 'Cucumbers', 'خيار'], ['onions', 'Onions', 'بصل'],
    ['potatoes', 'Potatoes', 'بطاطس'], ['garlic', 'Garlic', 'ثوم'], ['lemons', 'Lemons', 'ليمون'],
    ['lettuce', 'Lettuce', 'خس'], ['carrots', 'Carrots', 'جزر'], ['bananas', 'Bananas', 'موز'],
    ['apples', 'Apples', 'تفاح'], ['oranges', 'Oranges', 'برتقال'], ['grapes', 'Grapes', 'عنب'],
    ['watermelon', 'Watermelon', 'بطيخ'], ['whole-chicken', 'Whole chicken', 'دجاج كامل'],
    ['chicken-breast', 'Chicken breast', 'صدور دجاج'], ['minced-meat', 'Minced meat', 'لحم مفروم'],
    ['lamb', 'Lamb', 'لحم غنم'], ['fish', 'Fish', 'سمك'], ['shrimp', 'Shrimp', 'روبيان'],
  ] },
  { id: 'dairy-eggs', icon: '🥛', en: 'Dairy & Eggs', ar: 'الألبان والبيض', items: [
    ['fresh-milk', 'Fresh milk', 'حليب طازج'], ['long-life-milk', 'Long-life milk', 'حليب طويل الأجل'],
    ['laban', 'Laban', 'لبن'], ['yogurt', 'Yogurt', 'زبادي'], ['labneh', 'Labneh', 'لبنة'],
    ['cheese', 'Cheese', 'جبن'], ['cream-cheese', 'Cream cheese', 'جبن كريمي'], ['cream', 'Cream', 'قشطة'],
    ['butter', 'Butter', 'زبدة'], ['eggs', 'Eggs', 'بيض'], ['milk-powder', 'Milk powder', 'حليب بودرة'],
  ] },
  { id: 'beverages', icon: '🧃', en: 'Beverages', ar: 'المشروبات', items: [
    ['water', 'Water', 'مياه'], ['juice', 'Juice', 'عصير'], ['soft-drinks', 'Soft drinks', 'مشروبات غازية'],
    ['tea', 'Tea', 'شاي'], ['coffee', 'Coffee', 'قهوة'], ['arabic-coffee', 'Arabic coffee', 'قهوة عربية'],
    ['malt-drink', 'Malt drink', 'مشروب شعير'],
  ] },
  { id: 'pantry', icon: '🍚', en: 'Food Cupboard', ar: 'البقالة', items: [
    ['rice', 'Rice', 'أرز'], ['sugar', 'Sugar', 'سكر'], ['flour', 'Flour', 'دقيق'],
    ['cooking-oil', 'Cooking oil', 'زيت طبخ'], ['olive-oil', 'Olive oil', 'زيت زيتون'], ['ghee', 'Ghee', 'سمن'],
    ['pasta', 'Pasta', 'معكرونة'], ['tuna', 'Tuna', 'تونة'], ['tomato-paste', 'Tomato paste', 'معجون طماطم'],
    ['salt', 'Salt', 'ملح'], ['spices', 'Spices', 'بهارات'], ['lentils', 'Lentils', 'عدس'],
    ['fava-beans', 'Fava beans', 'فول'], ['honey', 'Honey', 'عسل'], ['jam', 'Jam', 'مربى'],
    ['ketchup', 'Ketchup', 'كاتشب'], ['mayonnaise', 'Mayonnaise', 'مايونيز'],
  ] },
  { id: 'snacks-sweets', icon: '🍫', en: 'Snacks & Sweets', ar: 'الحلويات والتسالي', items: [
    ['chocolate', 'Chocolate', 'شوكولاتة'], ['biscuits', 'Biscuits', 'بسكويت'], ['chips', 'Chips', 'شيبس'],
    ['dates', 'Dates', 'تمر'], ['nuts', 'Nuts', 'مكسرات'], ['cereal', 'Breakfast cereal', 'حبوب إفطار'],
    ['ice-cream', 'Ice cream', 'آيس كريم'],
  ] },
  { id: 'bakery', icon: '🥖', en: 'Bakery', ar: 'المخبوزات', items: [
    ['bread', 'Bread', 'خبز'], ['toast-bread', 'Toast bread', 'خبز توست'], ['samoli', 'Samoli', 'صامولي'],
    ['croissant', 'Croissant', 'كرواسون'], ['cake', 'Cake', 'كيك'], ['tortilla', 'Tortilla', 'تورتيلا'],
  ] },
  { id: 'frozen', icon: '🧊', en: 'Frozen', ar: 'المجمدات', items: [
    ['frozen-vegetables', 'Frozen vegetables', 'خضار مجمدة'], ['frozen-fries', 'Frozen fries', 'بطاطس مجمدة'],
    ['nuggets', 'Chicken nuggets', 'ناجتس دجاج'], ['burgers', 'Burgers', 'برجر'],
    ['frozen-chicken', 'Frozen chicken', 'دجاج مجمد'], ['paratha', 'Paratha', 'براتا'],
  ] },
  { id: 'baby', icon: '🍼', en: 'Baby', ar: 'الطفل', items: [
    ['diapers', 'Diapers', 'حفاضات'], ['baby-wipes', 'Baby wipes', 'مناديل مبللة'],
    ['baby-formula', 'Baby formula', 'حليب أطفال'], ['baby-food', 'Baby food', 'أغذية أطفال'],
  ] },
  { id: 'beauty-health', icon: '🧴', en: 'Beauty & Health', ar: 'الجمال والصحة', items: [
    ['shampoo', 'Shampoo', 'شامبو'], ['soap', 'Soap', 'صابون'], ['body-wash', 'Body wash', 'غسول الجسم'],
    ['toothpaste', 'Toothpaste', 'معجون أسنان'], ['toothbrush', 'Toothbrush', 'فرشاة أسنان'],
    ['deodorant', 'Deodorant', 'مزيل عرق'], ['sanitary-pads', 'Sanitary pads', 'فوط صحية'],
    ['razors', 'Razors', 'شفرات حلاقة'],
  ] },
  { id: 'household', icon: '🧺', en: 'Household', ar: 'المنزل والتنظيف', items: [
    ['tissues', 'Tissues', 'مناديل'], ['toilet-paper', 'Toilet paper', 'ورق تواليت'],
    ['kitchen-towels', 'Kitchen towels', 'مناديل مطبخ'], ['dish-soap', 'Dish soap', 'سائل غسيل الصحون'],
    ['laundry-detergent', 'Laundry detergent', 'مسحوق غسيل'], ['fabric-softener', 'Fabric softener', 'منعم ملابس'],
    ['bleach', 'Bleach', 'مبيض'], ['floor-cleaner', 'Floor cleaner', 'منظف أرضيات'],
    ['trash-bags', 'Trash bags', 'أكياس قمامة'], ['aluminium-foil', 'Aluminium foil', 'ورق قصدير'],
  ] },
].map((d) => ({ ...d, items: d.items.map(([id, en, ar]) => ({ id, en, ar, icon: d.icon })) }));

export const QUICK_ITEMS = QUICK_DEPARTMENTS.flatMap((d) => d.items);
