import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {normalizeText,parseSize,offerFamily,productType} from '../../src/match.js';
const engine=resolve(process.argv[2]),base=pathToFileURL(engine+'/');
const {rowToOffer}=await import(new URL('src/offers/contract.js',base));
const {applyEnrichment}=await import(new URL('src/offers/enrich.js',base));
const rows=JSON.parse(gunzipSync(readFileSync(new URL('benchmarks/search-quality-2026-10-18/catalog.json.gz',base)))).results;
const pairs=[];
for(const script of ['en','ar']){
 const buckets=new Map();
 for(const row of rows){
  const offer=rowToOffer(row);applyEnrichment(offer,row);
  const name=script==='ar'?offer.nameAr||offer.name:offer.name||offer.nameAr;
  if(!name||offer.price==null)continue;
  // Global collision discovery before query admission. Relevance is checked
  // separately by replaying actual captured search responses.
  const listing={offer,name,store:{id:offer.store},price:offer.price,brandSlug:offer.brandSlug,size:parseSize(`${offer.name||''} ${offer.nameAr||''}`,offer.size||''),family:offerFamily(offer),type:productType(`${offer.name||''} ${offer.nameAr||''}`),image:offer.imageUrl};
  const key=listing.store.id+'|'+listing.price,tokens=new Set(normalizeText(listing.name).split(' ').filter(Boolean));
  const seen=buckets.get(key)||[];let duplicate=null;
  for(const prior of seen){const intersection=[...tokens].filter(t=>prior.tokens.has(t)).length;const union=tokens.size+prior.tokens.size-intersection;if(union&&intersection/union>=.7){duplicate=prior;break;}}
  if(!duplicate){seen.push({listing,tokens});buckets.set(key,seen);continue;}
  const brief=l=>({id:l.offer.id,name:l.name,nameEn:l.offer.name,nameAr:l.offer.nameAr,brand:l.brandSlug,size:l.size,storedSize:l.offer.size,family:l.family,type:l.type,image:l.image,price:l.price});
  const a=duplicate.listing,b=listing;
  const conflicts=[];
  if(a.brandSlug&&b.brandSlug&&a.brandSlug!==b.brandSlug)conflicts.push('brand');
  if(a.size?.unit&&b.size?.unit&&JSON.stringify(a.size)!==JSON.stringify(b.size))conflicts.push('size');
  if(a.family&&b.family&&a.family!==b.family)conflicts.push('family');
  if(a.type&&b.type&&a.type!==b.type)conflicts.push('type');
  pairs.push({script,conflicts,kept:brief(a),hidden:brief(b)});
 }
}
writeFileSync(new URL('pairs.json',import.meta.url),JSON.stringify(pairs,null,2));
console.log(JSON.stringify({rows:rows.length,pairs:pairs.length,conflicting:pairs.filter(p=>p.conflicts.length).length,examples:pairs.filter(p=>p.conflicts.length).slice(0,24)},null,2));
