import assert from 'node:assert/strict';
import { canonicalMatchText,queryTokens,matchStage,unitPrice,referenceQuantity } from './match.js';
import { flyerListing } from './compare.js';
import { offerSize } from './viewer/insights.js';
for(const [a,b] of [['cornflakes','corn flakes'],['sunflower','sun flower'],['dishwashing','dish washing'],['mouthwash','mouth wash'],['almonds','almond'],['diapers','diaper'],['ويفر لواكر','وافر لوكر']]){
 assert.deepEqual(queryTokens(a),queryTokens(b));
 assert.equal(canonicalMatchText(a),canonicalMatchText(b));
}
assert.ok(matchStage({name:'Fresh Salmon'},'salmon')>matchStage({name:'Salmon Cat Food'},'salmon'));
assert.ok(matchStage({name:'White Eggs'},'eggs')>matchStage({name:'Egg Slicer'},'eggs'));
assert.ok(matchStage({name:'White Eggs'},'eggs')>matchStage({name:'نستله كوفي ميت بيض القهوة 400جم'},'eggs'));
assert.equal(matchStage({name:'Eggkizhi بيض'},'eggs'),1);
assert.ok(matchStage({name:'Rice',size:'1kg'},'rice 1kg')>matchStage({name:'Rice',size:'5kg'},'rice 1kg'));
console.log('Resource matching: wording aliases and primary product/size ranking passed.');
const unsafe = { name:'Baby Life Diapers 7-14kg', size:'7-14kg', price:48.99, unitPrice:null, unitPriceResolved:true };
assert.equal(unitPrice(unsafe),null);
assert.equal(referenceQuantity(unsafe),null);
assert.equal(offerSize(unsafe).unit,null,'the product sheet also preserves withholding');
const listing=flyerListing({ name:'Rice', price:10, size:'5kg', unitPrice:null, store:'test' },'rice');
assert.equal(listing.up,null,'a withheld engine value must remain withheld in comparisons');
assert.equal(flyerListing({name:'Rice',price:10,size:'5kg',store:'test'},'rice').up.value,2,'legacy responses still derive a value');
assert.equal(flyerListing({name:'Rice',price:10,size:'5kg',unitPrice:null,store:'test'},'rice 1kg').stage,1);
