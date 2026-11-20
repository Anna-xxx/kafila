const {chromium}=require('playwright');const U='http://localhost:8765/';
(async()=>{const b=await chromium.launch();const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);const errs=[];
for(const [lang,K,re] of [['en','C-1042',/We want to be sure we explained it clearly\. What will you do next\?/],['ar','C-1042',/ستقومين بها/],['ar','C-1045',/ستقوم بها؟/],['en','C-1049',/What will you do next/]]){
const p=await b.newPage({viewport:{width:1280,height:900}});p.on('pageerror',e=>errs.push(e.message));await p.goto(U+'?lang='+lang+'#/patient');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(400);
await p.evaluate(([k,l])=>{Store.S.data.persona=k;Store.S.data.lang=l;Store.save()},[K,lang]);await p.waitForTimeout(300);await p.click('[data-act=lock]');await p.click('[data-act=openapp]');await p.waitForTimeout(1400);await p.click('[data-act=consent]');await p.click('[data-act=signin]');await p.waitForTimeout(300);
const has=await p.evaluate(()=>{const c=Store.S.data;return 1});
// find teach question by triggering ack quick reply if present
let t=await p.locator('.phone').innerText();
const u=p.locator('[data-act=understood]').first();if(await u.count()){await u.click();await p.waitForTimeout(300);}t=await p.locator('.phone').innerText();
ok(`${lang} ${K} question text`,re.test(t));
ok(`${lang} ${K} label centre`,lang==='en'?/Your health centre/.test(t):/مركزك الصحي/.test(t));
const skip=p.locator('[data-act=teachskip]');ok(`${lang} ${K} skip shown`,await skip.count()>0);
if(await skip.count()){await skip.first().click();await p.waitForTimeout(300);ok(`${lang} ${K} skip recorded`,await p.evaluate(k=>Store.S.data.cases.find(c=>c.id===k.split(':')[0]).teachBack==='skipped',K));}
await p.screenshot({path:`tb-${lang}-${K}.png`});await p.close();}
console.log('errors',errs);await b.close()})();
