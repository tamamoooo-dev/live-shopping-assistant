import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=new URL('./',import.meta.url),engine=pathToFileURL(resolve(process.argv[2])+'/');
const {frontendModule}=await import(new URL('benchmarks/search-quality-2026-10-18/frontend-module.mjs',engine));
const source=new URL('../../src/',import.meta.url);
const before=await frontendModule(source,new URL('baseline/',dir),path=>execFileSync('git',['show','4c8eee6:src/'+path]));
const after=await frontendModule(source,new URL('candidate/',dir));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const bytes=readFileSync(new URL('responses.json.gz',dir));
const fixture=JSON.parse(gunzipSync(bytes));const rows=[];
for(const {q,offers} of fixture.results){
 const row={q};
 for(const [side,front] of [['before',before],['after',after]]){
  const admitted=offers.map(o=>front.compare.flyerListing(o,q)).filter(Boolean);
  const listings=front.rank.dedupeFlyers(admitted);
  row[side]={admitted:admitted.length,price:[],featured:[]};
  for(const mode of ['price','featured']){
   const entries=listings.map(listing=>({kind:'flyer',listing}));
   const context=mode==='featured'?front.featured.featuredContext(q,listings.map(l=>l.price)):null;
   entries.sort(front.rank.makeComparator(q,front.match.queryFamily(q),front.match.freshProduceIntent(q),mode,null,context));
   row[side][mode]=entries.map(e=>({id:e.listing.offer.id,name:e.listing.name,price:e.listing.price}));
  }
 }
 rows.push(row);
}
const manifest=JSON.parse(readFileSync(new URL('verified-pairs.json',dir)));
const checks=manifest.pairs.map(p=>{
 const row=rows.find(r=>r.q===p.q);assert.ok(row,p.q);
 const counts={};for(const side of ['before','after'])counts[side]=row[side].price.filter(o=>p.ids.includes(o.id)).length;
 assert.equal(counts.after,p.expectedAfter,p.q);
 return {...p,...counts};
});
const losses=rows.flatMap(r=>r.before.price.filter(o=>!r.after.price.some(n=>n.id===o.id)).map(o=>({q:r.q,...o})));
// Targets outside these 71 captured queries are not rescored by this replay.
const hashes={};for(const file of ['src/marketplace.js','index.html'])hashes[file]=hash(readFileSync(new URL('../../'+file,dir),'utf8').replaceAll('\r\n','\n'));
const summary={checkedAt:new Date().toISOString(),baselineFrontend:'4c8eee6',engineUnchanged:'69684af',fixtureSha256:hash(bytes),queries:rows.length,verifiedChecks:checks,losses,counts:rows.map(r=>({q:r.q,before:r.before.price.length,after:r.after.price.length,admitted:r.after.admitted})),hashes,limitations:'Development replay of captured engine responses, not a blind or catalogue-wide accuracy benchmark. Inspected pairs include development cases. Conservative identity handling may retain extra OCR duplicates.'};
writeFileSync(new URL('summary.json',dir),JSON.stringify(summary,null,2));writeFileSync(new URL('results.json',dir),JSON.stringify({rows},null,2));
console.log(JSON.stringify({...summary,counts:summary.counts.filter(r=>r.before!==r.after)},null,2));
