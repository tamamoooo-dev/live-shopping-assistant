// Quick add: a typed name or an everyday item becomes a plain list line (no
// store, no price) whose id merges repeats, in either language.
import assert from 'node:assert/strict';
import { listEntry, matchQuickItems, quickItemFor } from './cartQuickAdd.js';
import { QUICK_DEPARTMENTS, QUICK_ITEMS } from './quickAddCatalog.js';

// The catalog: unique ids, both languages, every department has items.
assert.equal(new Set(QUICK_ITEMS.map((it) => it.id)).size, QUICK_ITEMS.length, 'item ids are unique');
for (const d of QUICK_DEPARTMENTS) {
  assert.ok(d.en && d.ar && d.icon && d.items.length, `department ${d.id} is complete`);
  for (const it of d.items) assert.ok(it.en && it.ar && /[؀-ۿ]/.test(it.ar), `${it.id} has an Arabic name`);
}

// Fruits have their own tab, right after Fresh Food, and left Fresh Food.
const fruits = QUICK_DEPARTMENTS.find((d) => d.id === 'fruits');
assert.equal(QUICK_DEPARTMENTS[1], fruits, 'Fruits is the second tab');
assert.ok(['bananas', 'apples', 'mangoes', 'pomegranates'].every((id) => fruits.items.some((it) => it.id === id)));
assert.ok(!QUICK_DEPARTMENTS[0].items.some((it) => it.id === 'bananas'), 'no fruit left under Fresh Food');
assert.equal(listEntry('رمان').id, 'list:pomegranates', 'Arabic fruit name is the fruit');

// An everyday item, typed in either language (with or without ال), is that item.
const milkEn = listEntry('fresh milk');
const milkAr = listEntry('الحليب الطازج');
assert.equal(milkEn.id, 'list:fresh-milk');
assert.equal(milkAr.id, 'list:fresh-milk', 'Arabic with the article is the same item');
assert.equal(milkEn.name, 'Fresh milk');
assert.equal(milkEn.nameAr, 'حليب طازج');
assert.equal(milkEn.price, null, 'no price');
assert.equal(milkEn.store, null, 'no store');
assert.equal(quickItemFor('milk'), null, '"milk" alone is not "fresh milk"');

// Typed words are kept as typed, in the field of their script.
const typedEn = listEntry('  Almarai   laban 2 L ');
assert.equal(typedEn.name, 'Almarai laban 2 L');
assert.equal(typedEn.nameAr, null);
assert.equal(typedEn.id, listEntry('almarai laban 2 l').id, 'same words, same line');
const typedAr = listEntry('لبن المراعي');
assert.equal(typedAr.nameAr, 'لبن المراعي');
assert.equal(typedAr.name, null);
assert.equal(listEntry('   '), null, 'blank adds nothing');

// Search over the everyday list: prefix first, then contained, both languages.
const mil = matchQuickItems('mil').map((it) => it.id);
assert.equal(mil[0], 'milk-powder', 'a name starting with the words comes first');
assert.ok(mil.includes('fresh-milk') && mil.includes('long-life-milk'), 'names containing them follow');
assert.ok(matchQuickItems('حليب').some((it) => it.id === 'baby-formula'), 'Arabic word inside a name matches');
assert.ok(matchQuickItems('رز').some((it) => it.id === 'rice'), 'أرز found from رز');
assert.deepEqual(matchQuickItems(''), []);

console.log('cart quick add tests passed');
