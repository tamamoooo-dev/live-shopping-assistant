import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {rowToOffer as oldRow} from './baseline-engine/offers/contract.js';
import {applyEnrichment as oldApply} from './baseline-engine/offers/enrich.js';
import {offerPackageSize,parseSize} from '../../src/match.js';
const engine=pathToFileURL(resolve(process.argv[2])+'/'),dir=new URL('./',import.meta.url);
const {rowToOffer}=await import(new URL('src/offers/contract.js',engine));
const {applyEnrichment}=await import(new URL('src/offers/enrich.js',engine));
const bytes=gunzipSync(readFileSync(new URL('benchmarks/search-quality-2026-10-18/catalog.json.gz',engine)));
const rows=JSON.parse(bytes).results;const unitChanges=[],sizeChanges=[];let shelfChanges=0;
for(const row of rows){
 const before=oldRow(row),after=rowToOffer(row);oldApply(before,row);applyEnrichment(after,row);
 if(before.price!==after.price||before.oldPrice!==after.oldPrice)shelfChanges++;
 if(JSON.stringify(before.unitPrice)!==JSON.stringify(after.unitPrice)||JSON.stringify(before.eachPrice)!==JSON.stringify(after.eachPrice))unitChanges.push({id:row.id,name:after.name,nameAr:after.nameAr,price:after.price,size:after.size,before:before.unitPrice,after:after.unitPrice,eachBefore:before.eachPrice,eachAfter:after.eachPrice,image:after.imageUrl});
 const oldSize=parseSize(`${before.name||''} ${before.nameAr||''}`,before.size||''),newSize=offerPackageSize(after);
 if(JSON.stringify(oldSize)!==JSON.stringify(newSize))sizeChanges.push({id:row.id,name:after.name,size:after.size,before:oldSize,after:newSize});
}
writeFileSync(new URL('catalogue-changes.json',dir),JSON.stringify({rows:rows.length,fixtureSha256:createHash('sha256').update(bytes).digest('hex'),unitChanges,sizeChanges,shelfChanges},null,2));
console.log(JSON.stringify({rows:rows.length,shelfChanges,unitChanges:unitChanges.length,sizeChanges:sizeChanges.length,unitExamples:unitChanges.slice(0,20)},null,2));
