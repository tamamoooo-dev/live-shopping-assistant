// Browser regression: npm install --no-save playwright, then run this script.
// PLAYWRIGHT_MODULE may name an existing Playwright installation.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium,webkit,devices}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
const html=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:20px system-ui;margin:16px}input{font:inherit;padding:12px;width:80%}ul{padding:0;max-height:180px;overflow:auto}li{list-style:none;padding:16px;border:1px solid #aaa}button{padding:10px}</style><form><input id="q" type="search"><button>بحث</button></form><ul id="search-suggestions" hidden></ul><button id="source" aria-pressed="false">Panda</button><script type="module">
import {initKnowledgeSearch} from './src/knowledgeUI.js';
const choices={'ح':['حليب','حمص'],'حليب':['حليب نادك','حليب المراعي'],'حليب نادك':['حليب نادك كامل الدسم'],'حليب نادك كامل الدسم':['حليب نادك كامل الدسم 200 مل']};
window.sourceClicks=0;window.submits=0;window.hold=false;
document.querySelector('#source').onclick=()=>window.sourceClicks++;
document.querySelector('form').onsubmit=e=>{e.preventDefault();window.submits++};
initKnowledgeSearch(document.querySelector('input'),document.querySelector('form'),async(_,{query})=>{
 if(window.hold)return new Promise(resolve=>window.resolveLookup=()=>resolve([{value:'حمص'},{value:'حليب'}]));
 return (choices[query]||[]).map(value=>({value}));
});window.ready=true;
</script>`;
const server=http.createServer((req,res)=>{
 const rel=new URL(req.url,'http://localhost').pathname.slice(1);
 if(rel==='test.html'){res.setHeader('content-type','text/html;charset=utf-8');res.end(html);return;}
 if(rel.includes('..')){res.writeHead(400).end();return;}
 const file=path.join(root,rel);if(!fs.existsSync(file)){res.writeHead(404).end();return;}
 res.setHeader('content-type','application/javascript');res.end(fs.readFileSync(file));
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const report=[];
 try{for(const [name,engine,device] of [['iPhone WebKit',webkit,'iPhone 13'],['Android Chromium',chromium,'Pixel 7']]){
  const browser=await engine.launch({headless:true,...(engine===chromium&&process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
  try{
   const page=await browser.newPage({...devices[device]});const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(`http://127.0.0.1:${server.address().port}/test.html`);await page.waitForFunction(()=>window.ready);
   const input=page.locator('input');await input.tap();await input.fill('ح');
   for(const value of ['حليب','حليب نادك','حليب نادك كامل الدسم','حليب نادك كامل الدسم 200 مل']){
    const row=page.getByRole('option',{name:value,exact:true});await row.waitFor();await row.tap();
    assert.equal(await input.inputValue(),value);assert(await input.evaluate(n=>document.activeElement===n));
   }
   assert.equal(await page.evaluate(()=>window.sourceClicks),0);assert.equal(await page.evaluate(()=>window.submits),0);
   // Exercise a scroll/cancel sequence without converting the gesture to a selection.
   const gesture=async(type,x,y)=>page.evaluate(({type,x,y})=>{
    const row=document.querySelector('[role="option"]');
    const e=new Event(type,{bubbles:true,cancelable:true});const finger={identifier:7,clientX:x,clientY:y};
    Object.defineProperties(e,{touches:{value:['touchend','touchcancel'].includes(type)?[]:[finger]},changedTouches:{value:[finger]}});row.dispatchEvent(e);
   },{type,x,y});
   await input.fill('ح');await page.getByRole('option',{name:'حليب',exact:true}).waitFor();
   await gesture('touchstart',30,100);await gesture('touchmove',30,130);await gesture('touchend',30,130);
   assert.equal(await input.inputValue(),'ح','Scrolling never selects a row');
   await gesture('touchstart',30,100);await gesture('touchcancel',30,100);
   assert.equal(await input.inputValue(),'ح','Cancelled touches never select');
   await gesture('touchstart',30,100);await input.evaluate(n=>n.blur());
   await gesture('touchend',30,100);assert.equal(await input.inputValue(),'حليب','A mobile blur before touchend cannot discard the tap');
   assert(await input.evaluate(n=>document.activeElement===n));
   // Hold a finger on an immediate historical completion while the worker reorders rows.
   await page.evaluate(()=>{localStorage.setItem('lsa.app.recent',JSON.stringify(['حليب نادك']));window.hold=true;});
   // The preference cache already loaded in this page; use a fresh page for the cold/history race.
   await page.reload();await page.waitForFunction(()=>window.ready);await page.evaluate(()=>window.hold=true);
   await input.tap();await input.fill('ح');await page.getByRole('option',{name:'حليب',exact:true}).waitFor();
   await gesture('touchstart',30,100);await page.waitForFunction(()=>window.resolveLookup);await page.evaluate(()=>window.resolveLookup());
   await page.waitForTimeout(50);assert.equal(await page.getByRole('option').first().textContent(),'حليب');
   await gesture('touchend',30,100);assert.equal(await input.inputValue(),'حليب','A late lookup cannot change the pressed choice');
   await page.evaluate(()=>window.hold=false);await input.fill('ح');await page.getByRole('option',{name:'حليب',exact:true}).waitFor();
   await page.getByRole('option',{name:'حليب',exact:true}).click();assert.equal(await input.inputValue(),'حليب','Mouse selection still works');
   await input.fill('ح');await page.getByRole('option').first().waitFor();await input.press('ArrowDown');await input.press('Enter');
   assert.equal(await input.inputValue(),'حليب');assert.equal(await page.evaluate(()=>window.submits),0);
   await input.fill('بحث مكتوب بالكامل');await input.press('Enter');assert.equal(await page.evaluate(()=>window.submits),1);
   assert.equal(await page.evaluate(()=>window.sourceClicks),0);assert.deepEqual(errors,[]);
   report.push({engine:name,stages:4,scroll:true,cancel:true,blurDuringTap:true,lateLookup:true,mouse:true,keyboard:true,freeText:true,sourceScope:true,errors});
  }finally{await browser.close();}
 }}finally{server.close();}
 if(process.env.MOBILE_TEST_REPORT)fs.writeFileSync(process.env.MOBILE_TEST_REPORT,JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
