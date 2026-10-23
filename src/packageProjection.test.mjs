import assert from 'node:assert/strict';
import {offerPackageSize,sizeLabel} from './match.js';
import {flyerListing} from './compare.js';
import {offerSize} from './viewer/insights.js';
for(const [offer,total,pack] of [
 [{name:'Revony Tomato Paste 8x135gm',nameAr:'ريفوني معجون طماطم ١٢٥×٨ جرام',size:'8X135GM'},1080,8],
 [{name:'Abu Zahra Oil 1.0x2 Ltr 2x1.5Ltr',size:'2x1.5Ltr'},3000,2],
 [{name:'Tiffany Nuttybites 72gm 6+2 Free',size:'72gm'},576,8],
 [{name:'Baby Diapers 7-14kg',size:'88 pcs'},88,88],
]){const size=offerPackageSize(offer);assert.equal(size.total,total);assert.equal(size.pack,pack);}
const oil={id:'oil',store:'panda',name:'Noor Sunflower Oil 2x1.5L + 500ml',size:'2x1.5L + 500ml',price:36.99,unitPrice:{value:36.99/3.5,unit:'l'}};
assert.equal(offerPackageSize(oil),null,'do not label only the first term of a compound package');
const listing=flyerListing(oil,'sunflower oil');assert.equal(listing.size,null);assert.ok(Math.abs(listing.up.value-36.99/3.5)<1e-9);
const sheet=offerSize(oil);assert.equal(sheet.label,'');assert.equal(sheet.unit.value,listing.up.value);
const legacy={...oil};delete legacy.unitPrice;assert.equal(flyerListing(legacy,'sunflower oil').up,null,'legacy compound quantity is not re-derived from its first term');
const milk={id:'milk',store:'danube',name:'Saudia Milk',nameAr:'حليب السعودية ١٨×٢٠٠ مل',size:'١٨×٢٠٠ مل',price:29.99,unitPrice:{value:29.99/3.6,unit:'l'}};
assert.equal(sizeLabel(flyerListing(milk,'milk').size),'18 × 200 ml');assert.equal(offerSize(milk).label,'18 × 200 ml');
for(const size of ['150 - 180 GRAMS','430 ML / 1100 ML','7-14kg','250g OR 500g'])assert.equal(offerPackageSize({name:'Product',size}),null,'no selected size for '+size);
console.log('Package projection: explicit fields, compatible name counts, compound withholding and sheet/summary consistency.');

const externalWater={id:'deal-water',store:'hyperpanda',name:'Water',price:12.5,size:'2 × (6x1.5L)',saleQuantity:{count:2,packageSize:'6x1.5L',packagePrice:6.25},packageContents:{unit:'ml',total:18000,each:1500,pack:12,src:'measure'},unitPrice:{value:12.5/18,unit:'l'}};
assert.equal(offerPackageSize(externalWater).total,18000);
assert.equal(offerSize(externalWater).label,'2 × (6x1.5L)');
assert.equal(flyerListing(externalWater,'water').up.value,12.5/18);
assert.equal(offerPackageSize({...externalWater,packageContents:null,unitPrice:null}),null,'A withheld backend quantity cannot be re-derived in the client');

// A rejected carton size must stay unknown in Search, comparison and details,
// even when an old caption still contains the other selling option's size.
const unboundMilk={id:'tamimi-milk',store:'tamimi',name:'Nadec Milk 12x1L',nameAr:'حليب نادك ١٢×١ لتر',
 price:16.99,size:null,sizeReading:null,packageContents:null,unitPrice:null,eachPrice:null,
 quantityReviewRequired:true,quantityReviewReason:'different_package_prices'};
assert.equal(offerPackageSize(unboundMilk),null);
assert.equal(flyerListing(unboundMilk,'milk').up,null);
assert.equal(offerSize(unboundMilk).label,'');
assert.equal(offerSize(unboundMilk).unit,null);
