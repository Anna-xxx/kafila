const {chromium}=require('playwright');const U='http://localhost:8765/';
(async()=>{const b=await chromium.launch();const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
for(const [lang,K] of [['en','C-1042'],['en','C-1049'],['en','C-1043'],['ar','C-1042'],['ar','C-1049'],['ar','C-1043']]){
const p=await b.newPage({viewport:{width:1280,height:900}});await p.goto(U+'?lang='+lang+'#/patient');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(500);
await p.evaluate(k=>Patient.tourGo(k,{tab:'result'}),K);await p.waitForTimeout(400);
// open any glossary word inside steps
const g=p.locator('.steps li .gloss-w').first();if(await g.count()){await g.click().catch(()=>{});await p.waitForTimeout(200);}
const r=await p.evaluate(()=>[...document.querySelectorAll('.steps li')].map(li=>{const t=li.children[1].getBoundingClientRect(),w=li.querySelector('.when');return {tw:Math.round(t.width),lw:Math.round(li.getBoundingClientRect().width),wb:w?Math.round(w.getBoundingClientRect().top-t.bottom):null}}));
ok(lang+' '+K+' text uses full width, date below '+JSON.stringify(r.slice(0,3)),r.length&&r.every(x=>x.tw>=x.lw-40&&(x.wb===null||x.wb>=-6)));
const s=p.locator('.steps').first();await s.screenshot({path:`steps-${lang}-${K}.png`});await p.close();}
await b.close()})();
