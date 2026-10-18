import {writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,dirname,posix} from 'node:path';
const engine=resolve(process.argv[2]),dir=new URL('./',import.meta.url),seen=new Set();
function save(path){
 if(seen.has(path))return;seen.add(path);
 const bytes=execFileSync('git',['show','69684af:brochure-engine/src/'+path],{cwd:engine});
 const target=new URL('baseline-engine/'+path,dir);mkdirSync(dirname(target.pathname.replace(/^\/(.:)/,'$1')),{recursive:true});writeFileSync(target,bytes);
 for(const m of bytes.toString().matchAll(/(?:from\s*|import\s*)['"]([.][^'"]+)['"]/g))save(posix.normalize(posix.join(posix.dirname(path),m[1])));
}
save('offers/contract.js');save('offers/enrich.js');
console.log('Prepared pinned engine 69684af; no credential required.');
