import assert from 'node:assert/strict';
import { flyerListing } from './compare.js';
import { offerSize } from './viewer/insights.js';
import { structureOfferName } from './viewer/productName.js';
const offer={name:'Nadec Milk',nameAr:'حليب',price:8,currency:'SAR',store:'hyperpanda',
  productTitleVersion:'dictionary-title-v1',brandNameAr:'نادك',brandNameEn:'Nadec',
  size:'1L',packageContents:{unit:'ml',total:1000,each:1000,pack:1},unitPrice:{value:8,unit:'l'}};
const listing=flyerListing(offer,'حليب نادك');
assert(listing,'Separating the brand must not hide relevant Arabic search results');
assert.equal(listing.name,'حليب');assert.equal(listing.brand,'نادك');
const sheet=structureOfferName(offer);
assert.equal(sheet.ar,'حليب');assert.equal(sheet.brand,'نادك');assert.doesNotMatch(sheet.ar,/نادك|1/);
console.log('Separate Arabic product/brand fields survive search admission and the product sheet.');

const assortment={...offer,name:'Instant Noodles',nameAr:'نودلز',brandNameAr:'اندومي',brandNameEn:'Indomie',size:'5x70/75/80g',
 packageContents:null,unitPrice:null,assortedSizes:true,sizeReading:{version:'offer-size-reading-v1'},
 sizeDisplayAr:'5 × 70 جم أو 5 × 75 جم أو 5 × 80 جم'};
const listing2=flyerListing(assortment,'noodles');assert(listing2);
assert.equal(listing2.up,null,'The client must not reconstruct one weight from an assortment title');
assert.equal(offerSize(assortment).size,null);
assert(offerSize(assortment).label.includes('70'),'The sheet must retain assortment sizes even without a single comparison weight');
