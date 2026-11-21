// The cart's shared text, in the language the app is in. i18n.js reads the
// language once at load, so Arabic runs in a child process of this file.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const lang = process.env.CART_SHARE_LANG || 'en';
globalThis.localStorage = { getItem: () => lang, setItem() {} };
const { cartShareText } = await import('./cartShare.js');

const items = [
  { id: 'a', store: 'panda', storeName: 'Panda', name: 'Almarai Fresh Milk', nameAr: 'حليب المراعي طازج', size: '1 L', price: 6.95, qty: 1, currency: 'SAR' },
  { id: 'b', store: 'panda', storeName: 'Panda', name: 'Sunbulah Bread 600 g', nameAr: 'خبز السنبلة 600 غ', size: '600 g', price: 4.5, qty: 2, currency: 'SAR' },
  { id: 'c', store: 'carrefour', storeName: 'Carrefour', name: 'Eggs 30 pcs', nameAr: 'بيض 30 حبة', size: '30 pcs', price: 15, qty: 1, currency: 'SAR', purchased: true },
  { id: 'd', store: 'carrefour', storeName: 'Carrefour', name: null, nameAr: 'أرز بسمتي', size: '5 kg', price: 39, qty: 1, currency: 'SAR' },
];

const text = cartShareText(items);

if (lang === 'en') {
  assert.equal(
    text,
    [
      '🛒 Shopping list',
      '',
      'Panda',
      '• Almarai Fresh Milk · 1 L — 6.95 SAR',
      '• Sunbulah Bread 600 g — 2 × 4.50 = 9 SAR',
      '',
      'Carrefour',
      '• أرز بسمتي · 5 kg — 39 SAR',
      '✓ Eggs 30 pcs — 15 SAR',
      '',
      '5 items',
      'Total: 69.95 SAR',
      'To buy: 54.95 SAR',
    ].join('\n'),
    'English: grouped by store, size once, quantity line, ticked last, count + totals',
  );
  assert.ok(cartShareText([items[0]]).includes('\n1 item\n'), 'one item is singular');
  assert.ok(!cartShareText([items[0]]).includes('To buy'), 'no "to buy" line when nothing is ticked');
  assert.ok(
    cartShareText([{ ...items[0], name: 'Tide 2.5 kg', size: '3 kg' }]).includes('• Tide 2.5 kg · 3 kg — '),
    'a different size than the name says is still shown',
  );
  assert.ok(
    cartShareText([{ ...items[0], name: 'Tide 13 kg', size: '3 kg' }]).includes('• Tide 13 kg · 3 kg — '),
    '"3 kg" is not the "13 kg" in the name',
  );
  assert.ok(
    cartShareText([{ ...items[0], storeName: undefined }], { storeName: (it) => `Store:${it.store}` }).includes('\nStore:panda\n'),
    'the store label comes from the page',
  );

  // Quick-add lines: no store, no price — a "My list" group, left out of the
  // total and counted beside it.
  const list = [
    { id: 'list:bread', store: null, name: 'Bread', nameAr: 'خبز', price: null, qty: 2 },
    { id: 'list:x', store: null, name: 'Almarai laban', nameAr: null, price: null, qty: 1 },
    items[0],
  ];
  assert.equal(
    cartShareText(list),
    ['🛒 Shopping list', '', 'My list', '• Bread × 2', '• Almarai laban', '', 'Panda',
      '• Almarai Fresh Milk · 1 L — 6.95 SAR', '', '4 items', 'Total: 6.95 SAR (3 without a price)'].join('\n'),
    'unpriced lines: own group, no price, counted beside the total',
  );
  assert.equal(
    cartShareText(list.slice(0, 2)),
    ['🛒 Shopping list', '', 'My list', '• Bread × 2', '• Almarai laban', '', '3 items'].join('\n'),
    'a list with no prices has no total line',
  );

  const ar = execFileSync(process.execPath, [fileURLToPath(import.meta.url)], {
    env: { ...process.env, CART_SHARE_LANG: 'ar' },
    encoding: 'utf8',
  });
  assert.match(ar, /cart share ar ok/);
  console.log('cart share tests passed');
} else {
  assert.equal(
    text,
    [
      '🛒 قائمة المشتريات',
      '',
      'Panda',
      '• حليب المراعي طازج · 1 L — 6.95 ريال',
      '• خبز السنبلة 600 غ — 2 × 4.50 = 9 ريال',
      '',
      'Carrefour',
      '• أرز بسمتي · 5 kg — 39 ريال',
      '✓ بيض 30 حبة — 15 ريال',
      '',
      'عدد المنتجات: 5',
      'الإجمالي: 69.95 ريال',
      'للشراء: 54.95 ريال',
    ].join('\n'),
    'Arabic: Arabic names first, Arabic labels and currency',
  );
  assert.equal(
    cartShareText([
      { id: 'list:bread', store: null, name: 'Bread', nameAr: 'خبز', price: null, qty: 1 },
      items[0],
    ]),
    ['🛒 قائمة المشتريات', '', 'قائمتي', '• خبز', '', 'Panda', '• حليب المراعي طازج · 1 L — 6.95 ريال',
      '', 'عدد المنتجات: 2', 'الإجمالي: 6.95 ريال (منتج واحد بدون سعر)'].join('\n'),
    'Arabic: My list group and the unpriced count',
  );
  console.log('cart share ar ok');
}
