const {chromium}=require('playwright');const B='http://localhost:8765/';
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1280,height:900}});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
await p.goto(B+'#/patient');await p.evaluate(()=>{localStorage.clear();localStorage.setItem('kafila-entry','1');localStorage.setItem('screenpath-tour','{"open":false}')});
await p.goto(B+'?lang=ar#/patient');await p.waitForTimeout(600);ok('ar version lang ar',await p.evaluate(()=>Store.S.data.lang)==='ar');
let t=await p.locator('.phone').innerText();ok('Fatima lock in Arabic',/[؀-ۿ]/.test(t));
await p.selectOption('#persona','C-1043').catch(async()=>{await p.click('#demoBtn');await p.selectOption('#persona','C-1043')});await p.waitForTimeout(300);t=await p.locator('.phone').innerText();ok('Rajesh Arabic in AR version',/مرحبًا/.test(t));
await p.click('[data-plang=en]');await p.waitForTimeout(300);t=await p.locator('.phone').innerText();ok('toggle to English',/Hello Rajesh/.test(t));
await p.evaluate(()=>document.querySelector('#reset').click());await p.waitForTimeout(500);ok('reset keeps AR',await p.evaluate(()=>Store.S.data.lang)==='ar');
await p.goto(B+'#/team');await p.waitForTimeout(400);t=await p.locator('#view').innerText();ok('staff English',/Actionable results/.test(t));
// lang param wins over saved state
await p.evaluate(()=>{Store.S.data.lang='ar';Store.save()});await p.goto(B+'?lang=en#/patient');await p.waitForTimeout(500);ok('?lang=en wins',await p.evaluate(()=>Store.S.data.lang)==='en');
// hash form
await p.goto(B+'#/patient?lang=ar');await p.reload();await p.waitForTimeout(500);ok('hash form ar',await p.evaluate(()=>Store.S.data.lang)==='ar'&&await p.isVisible('.phone'));
// start panel links
await p.goto(B+'?lang=en#/patient');await p.waitForTimeout(400);await p.click('#startBtn');await p.waitForTimeout(200);ok('Also in Arabic link',await p.isVisible('text=Also in Arabic'));
await p.click('text=Also in Arabic');await p.waitForTimeout(600);ok('link opens AR',await p.evaluate(()=>Store.S.data.lang)==='ar');
await p.click('#startBtn');await p.waitForTimeout(200);ok('English version link',await p.isVisible('text=English version'));
// fresh visitor bare link = English
const c2=await b.newContext();const q=await c2.newPage();await q.goto(B+'#/patient');await q.waitForTimeout(500);ok('bare link English',await q.evaluate(()=>Store.S.data.lang)==='en');
console.log('errors',errs);await b.close()})();
