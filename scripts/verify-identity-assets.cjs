const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const os=require('node:os');
function devModule(name){try{return require(name);}catch(error){const fallback=path.join(os.homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','node','node_modules',name);if(!fs.existsSync(fallback))throw error;return require(fallback);}}
const sharp=devModule('sharp'),{chromium}=devModule('playwright');
const root=path.resolve(__dirname,'..'),outFlag=process.argv.indexOf('--out');
const out=outFlag>=0?path.resolve(process.argv[outFlag+1]):path.resolve(root,'../identity-assets-review-2026-10-29');
fs.mkdirSync(out,{recursive:true});
const m=JSON.parse(fs.readFileSync(path.join(root,'data/identity-assets.json'))),summary=JSON.parse(fs.readFileSync(path.join(root,'data/logo-browse-snapshot.json')));
async function main(){
 const all=[...Object.entries(m.stores).map(([k,a])=>['store-'+k,a]),...Object.entries(m.brands).filter(([,a])=>a.kind==='logo')];
 if(!process.argv.includes('--no-contact')) for(let page=0;page<Math.ceil(all.length/100);page++){
   const entries=all.slice(page*100,(page+1)*100),tiles=[];
   for(let i=0;i<entries.length;i++){
     const [slug,a]=entries[i];const x=(i%10)*115,y=Math.floor(i/10)*105;
     tiles.push({input:await sharp(path.join(root,a.file)).resize(86,70,{fit:'contain',background:'#fff'}).png().toBuffer(),left:x+14,top:y});
     const label=slug.replace('archive-','').replace('store-','S:').replace(/&/g,'&amp;');
     tiles.push({input:Buffer.from(`<svg width="115" height="28"><text x="57" y="14" font-size="10" text-anchor="middle" font-family="Arial">${label}</text></svg>`),left:x,top:y+73});
   }
   await sharp({create:{width:1150,height:Math.ceil(entries.length/10)*105,channels:4,background:'#fff'}}).composite(tiles).png().toFile(path.join(out,`logos-${page+1}.png`));
 }
 for(const a of [...Object.values(m.stores),...Object.values(m.brands)]){assert(fs.existsSync(path.join(root,a.file)),a.file);await sharp(path.join(root,a.file)).metadata();}
 if(process.argv.includes('--logo-only'))assert.equal(Object.values(m.brands).filter(a=>a.kind==='packaging').length,0,'Every brand has a standalone mark');
 const missing=summary.brands.filter(b=>!m.brands[b.slug]);assert.equal(missing.length,0,'Every live brand has a local image: '+missing.map(b=>b.en));
 const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
 const server=http.createServer((req,res)=>{const p=new URL(req.url,'http://localhost').pathname;const file=path.join(root,p==='/'?'index.html':decodeURIComponent(p));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
 const errors=[],failed=[],runs=[];
 try{for(const width of [320,390,1280]){
  const ctx=await browser.newContext({viewport:{width,height:844}});await ctx.addInitScript(()=>localStorage.setItem('lsa.lang','ar'));
  await ctx.route('https://**/*',async route=>{const u=new URL(route.request().url());let j={brochures:[],offers:[],alerts:[],watches:[],results:[]};if(u.pathname==='/browse')j=summary;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(j),headers:{'access-control-allow-origin':'*'}});});
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&/icons\//.test(r.url()))failed.push(r.url());});
  const base=`http://127.0.0.1:${server.address().port}/index.html`;
  await page.goto(base+'#/search');await page.locator('#store-chips .store-logo').first().waitFor();
  assert.equal(await page.locator('#store-chips .store-logo').count(),7);
  assert.equal(await page.locator('.chip-dot').count(),0);
  await page.locator('#store-chips button[data-store="panda"]').click();assert.equal(await page.locator('#store-chips button[data-store="panda"]').getAttribute('aria-pressed'),'false');
  await page.screenshot({path:path.join(out,`search-${width}.png`),fullPage:true});
  await page.goto(base+'#/brochures');await page.locator('.bstore .store-logo').first().waitFor();assert.equal(await page.locator('.bstore .store-logo').count(),18);
  await page.screenshot({path:path.join(out,`stores-${width}.png`),fullPage:true});
  await page.goto(base+'#/browse/brands/all');await page.locator('.browse-brand-pill').first().waitFor();
  const more=page.locator('.browse-more');for(let batch=0;batch<Math.ceil(summary.brands.length/60);batch++){if(!await more.isVisible())break;await more.click();}
  assert.equal(await more.isVisible(),false,'Load more disappears when the catalogue is complete');
  assert.equal(await page.locator('.browse-brand-pill').count(),summary.brands.length);
  // Force loading every lazy tile so coverage includes the entire catalogue.
  await page.locator('.browse-brand-logo').evaluateAll(imgs=>imgs.forEach(img=>img.loading='eager'));
  await page.waitForFunction(()=>[...document.querySelectorAll('.browse-brand-logo')].every(i=>i.complete&&i.naturalWidth>0));
  assert.equal(await page.locator('.browse-brand-monogram').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No horizontal overflow');
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(out,`brands-${width}.png`)});
  runs.push({width,brands:await page.locator('.browse-brand-logo').count()});await ctx.close();
 }}finally{await browser.close();server.close();}
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
 const report={at:new Date().toISOString(),stores:Object.keys(m.stores).length,brands:summary.brands.length,kinds:Object.values(m.brands).reduce((a,b)=>(a[b.kind]=(a[b.kind]||0)+1,a),{}),missing:[],errors,failed,runs};
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
