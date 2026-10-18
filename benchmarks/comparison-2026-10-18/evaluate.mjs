import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const engine=pathToFileURL(resolve(process.argv[2])+'/'),dir=new URL('./',import.meta.url);
const {frontendModule}=await import(new URL('benchmarks/search-quality-2026-10-18/frontend-module.mjs',engine));
const before=await frontendModule(new URL('../../src/',dir),new URL('frontend-baseline/',dir),path=>execFileSync('git',['show','2639875:src/'+path]));
const after=await frontendModule(new URL('../../src/',dir),new URL('frontend-candidate/',dir));
const {applyEnrichment}=await import(new URL('src/offers/enrich.js',engine));
const rows=JSON.parse(gunzipSync(readFileSync(new URL('benchmarks/search-quality-2026-10-18/catalog.json.gz',engine)))).results;
const byId=new Map(rows.map(r=>[r.id,r]));
const fixture=JSON.parse(gunzipSync(readFileSync(new URL('../dedupe-2026-10-18/responses.json.gz',dir))));
const results=[];
for(const {q,offers} of fixture.results){
 const revised=offers.map(o=>{const row=byId.get(o.id);if(!row)return {...o};const next={...o};applyEnrichment(next,row);return next;});
 const a=before.compare.computeComparison(q,[],offers,null),b=after.compare.computeComparison(q,[],revised,null);
 const brief=c=>c?{headlineId:c.headline.listing.offer?.id,name:c.headline.listing.name,price:c.headline.listing.price,kind:c.headline.kind,up:c.headline.listing.up,size:c.headline.listing.size,offers:c.offers,shared:c.sharedWith}:null;
 results.push({q,before:brief(a),after:brief(b),admittedBefore:offers.map(o=>before.compare.flyerListing(o,q)).filter(Boolean).map(l=>l.offer.id),admittedAfter:revised.map(o=>after.compare.flyerListing(o,q)).filter(Boolean).map(l=>l.offer.id)});
}
const losses=results.flatMap(r=>r.admittedBefore.filter(id=>!r.admittedAfter.includes(id)).map(id=>({q:r.q,id})));assert.equal(losses.length,0);
const changes=JSON.parse(readFileSync(new URL('catalogue-changes.json',dir)));
assert.equal(changes.unitChanges.length,6);assert.equal(changes.shelfChanges,0);
const truth={'99146022':.5,'99050418':2.25,'99146175':2.25,'99146169':3.6,'98686281':3.6,'99146442':7.5};
for(const row of changes.unitChanges){const total=truth[row.id.split(':').at(-1)];assert.ok(total);assert.ok(Math.abs(row.after.value-row.price/total)<1e-9);}
const hashes={};for(const file of ['src/match.js','src/compare.js','src/viewer/insights.js','index.html'])hashes[file]=createHash('sha256').update(readFileSync(new URL('../../'+file,dir),'utf8').replaceAll('\r\n','\n')).digest('hex');
hashes['engine/src/matching.js']=createHash('sha256').update(readFileSync(new URL('src/matching.js',engine),'utf8').replaceAll('\r\n','\n')).digest('hex');
const summary={checkedAt:new Date().toISOString(),baselineEngine:'69684af',baselineFrontend:'2639875',catalogueRows:rows.length,unitChanges:changes.unitChanges,shelfPriceChanges:changes.shelfChanges,packageProjectionChanges:changes.sizeChanges.length,packageProjectionWithheld:changes.sizeChanges.filter(r=>r.after===null).length,queries:results.length,admissionLosses:losses,headlineChanges:results.filter(r=>JSON.stringify(r.before)!==JSON.stringify(r.after)),hashes,limitation:'Development checks and assistant crop inspection; not independent, blind or catalogue-wide accuracy annotation. Package projections are compared exhaustively but not all individually image-labelled.'};
writeFileSync(new URL('summary.json',dir),JSON.stringify(summary,null,2));writeFileSync(new URL('query-results.json',dir),JSON.stringify(results,null,2));
console.log(JSON.stringify({queries:results.length,unitChanges:6,shelfPriceChanges:0,admissionLosses:losses,packageProjectionChanges:summary.packageProjectionChanges,withheld:summary.packageProjectionWithheld,headlines:summary.headlineChanges.map(r=>({q:r.q,before:r.before?.name,after:r.after?.name,beforeUp:r.before?.up,afterUp:r.after?.up}))},null,2));
