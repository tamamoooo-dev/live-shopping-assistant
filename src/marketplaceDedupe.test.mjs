import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeText,parseSize} from './match.js';

// Execute the actual pure function without starting the DOM application.
const source=readFileSync(new URL('./marketplace.js',import.meta.url),'utf8');
const body=source.slice(source.indexOf('function dedupeFlyers('),source.indexOf('// --- cards'));
const dedupeFlyers=new Function('normalizeText','parseSize',body+'\nreturn dedupeFlyers;')(normalizeText,parseSize);
const listing=(name,extra={})=>({name,store:{id:'same'},price:5,size:parseSize(name,''),...extra});
for(const [a,b] of [
 ['AL SUMAN INSTANT ARABIC COFFEE SAFFRON 30GM','AL SUMAN INSTANT ARABIC COFFEE CARDAMOM 30GM'],
 ['ALISA BLACK SLICED OLIVES JAR 230 GRAMS','ALISA SLICED GREEN OLIVES JAR 230 GRAMS'],
 ['SALOUMI PLASTIC STICKS COTTON BUDS 500 PCS','SALOUMI BAMBOO STICKS COTTON BUDS 500 PCS'],
 ['Tiffany Nutty Bites Cashew 8X72 GM','Tiffany Nutty Bites Almond 8X72 GM'],
 ['DETO CLEAN DISHWASH LIQUID LEMON 1 LTR','DETO CLEAN DISHWASH LIQUID LEMON 1.5 LTR'],
 ['SALIMA PRE COOKED MINCED BAKED TURKEY MINI BURGERS 800GM','SALIMA PRE COOKED MINCED BAKED TURKEY MEATBALLS 800GM'],
])assert.equal(dedupeFlyers([listing(a),listing(b)]).length,2,a);
for(const [a,b] of [
 [listing('Same Rice',{size:parseSize('','5kg')}),listing('Same Rice',{size:parseSize('','10kg')})],
 [listing('Same Milk',{size:parseSize('','4x250ml')}),listing('Same Milk',{size:parseSize('','1L')})],
 [listing('Same Name',{brandSlug:'nova'}),listing('Same Name',{brandSlug:'tania'})],
 [listing('Same Name'),listing('Same Name',{store:{id:'other'}})],
 [listing('Same Name'),listing('Same Name',{price:6})],
])assert.equal(dedupeFlyers([a,b]).length,2);
for(const [a,b] of [
 ["Oks Stainless Steel Scrubber 6 ' S","Oks Stainless Steel Scrubber 6 ’ S"],
 ["Men's BK Slipper Asstd","Men's BK Slipper Asstd"],
 ['Parachute Amla Hair Oil 390Ml','Parachute Amla Hair Oil 390Ml Promo'],
])assert.equal(dedupeFlyers([listing(a),listing(b)]).length,1,a);
const equalA=listing('Same Water',{size:{unit:'ml',each:1000,pack:1,src:'measure'}});
const equalB=listing('Same Water',{size:{unit:'ml',each:1000,pack:1,src:'stored'}});
assert.deepEqual(dedupeFlyers([equalA,equalB]),[equalA],'parser source alone is not a different product');
assert.equal(dedupeFlyers([listing("Men's BK Slipper Asstd",{productId:'one'}),listing("Men's BK Slipper Asstd",{productId:'two'})]).length,1,'verified copies can have fragmented Registry IDs');
assert.equal(dedupeFlyers([listing('Same Milk',{offer:{size:'4x1L'},size:parseSize('','1L')}),listing('Same Milk',{offer:{size:'4x1L'},size:parseSize('','4x1L')})]).length,1,'identical explicit packs override inconsistent name parsing');
console.log('Marketplace dedupe: verified variants survive; true copies and compatible abbreviations collapse.');
