import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const dir=new URL('./',import.meta.url),phase=process.argv[2]||'before';
const probes=[['ramez','بوك','99146022'],['tamimi','مشروبات','99050418'],['ramez','نادك','99146175'],['ramez','لونا','99146169'],['danube','حليب','98686281'],['ramez','كنزا','99146442'],['prime','revony','99136101'],['hyperpanda','noor','99119655'],['danube','abu zahra','98683452']];
const results=[];for(const [store,q,target] of probes){
 const r=await fetch(`https://brochure-engine.tamamoooo.workers.dev/offers?limit=200&store=${store}&q=${encodeURIComponent(q)}`,{signal:AbortSignal.timeout(60000)});assert.equal(r.status,200);
 const data=await r.json();const offer=data.offers.find(o=>o.offerId===target);assert.ok(offer,'missing target '+target);results.push({store,q,target,status:r.status,offer});
 console.log(JSON.stringify({phase,target,price:offer.price,unitPrice:offer.unitPrice}));
}
const assets=[];if(phase==='after')for(const path of ['index.html','src/match.js','src/compare.js','src/marketplace.js','src/viewer/insights.js']){
 const r=await fetch('https://tamamoooo-dev.github.io/live-shopping-assistant/'+path+'?verify='+Date.now());assert.equal(r.status,200);const source=await r.text();const sha=x=>createHash('sha256').update(x.replaceAll('\r\n','\n')).digest('hex');assert.equal(sha(source),sha(readFileSync(path,'utf8')),path);assets.push({path,sha256:sha(source)});
}
writeFileSync(new URL('live-'+phase+'.json',dir),JSON.stringify({capturedAt:new Date().toISOString(),results,assets},null,2));
