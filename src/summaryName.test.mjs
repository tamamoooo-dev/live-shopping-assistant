import assert from 'node:assert/strict';
import { nameWithBrand } from './summary.js';

// The summary names the brand beside an Arabic name that does not carry it,
// and never twice (one-word names and English names already include it).
assert.equal(nameWithBrand({ name: 'بطاطس شيبس', brand: 'البطل' }), 'بطاطس شيبس · البطل');
assert.equal(nameWithBrand({ name: 'مياه أكوافينا', brand: 'أكوافينا' }), 'مياه أكوافينا');
assert.equal(nameWithBrand({ name: 'Al Batal Potato Chips', brand: 'Al Batal' }), 'Al Batal Potato Chips');
assert.equal(nameWithBrand({ name: 'حليب طويل الأجل', brand: '' }), 'حليب طويل الأجل');
assert.equal(nameWithBrand({ name: 'شاي اخضر ربيع', brand: 'ربيع' }), 'شاي اخضر ربيع');
console.log('Summary name shows the brand once.');
