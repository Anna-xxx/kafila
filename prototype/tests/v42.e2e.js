const {chromium}=require('playwright');const U='http://localhost:8765/';
(async()=>{const b=await chromium.launch();const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);const errs=[];
for(const w of [1280,1366,1920,390]){const p=await b.newPage({viewport:{width:w,height:900}});p.on('pageerror',e=>errs.push(e.message));
await p.goto(U+'#/patient');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(600);
ok(w+' no Demo tools btn, no banner',!(await p.locator('#demoBtn,.scr-banner,.scr-line').count()));
ok(w+' panel visible',await p.isVisible('.demo-side')&&await p.isVisible('.pick-list')&&/Today in the demo:/.test(await p.locator('.demo-side').innerText()));
// chips fit
const over=await p.evaluate(()=>[...document.querySelectorAll('.demo-side button')].filter(b=>b.getBoundingClientRect().right>innerWidth+1).length);ok(w+' panel buttons inside viewport',over===0);
ok(w+' no h-scroll',!(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)));
// chip from lock screen works
await p.locator('.demo-side [data-try]').first().click();await p.waitForTimeout(700);const t=await p.locator('.phone').innerText();ok(w+' try chip from lock opens chat',/with your health centre/.test(t)&&!/Open the result first/.test(t));
await p.screenshot({path:`v42-chat-${w}.png`,fullPage:w===390});
if(w===1280){
 // result screen buttons
 await p.evaluate(()=>{Store.reset();Patient.tourGo('C-1042',{tab:'result'})});await p.waitForTimeout(400);
 const prim=await p.locator('.phone .btn.primary.block').allInnerTexts();ok('one green button = Book my colonoscopy '+prim,prim.length===1&&/Book my colonoscopy/.test(prim[0]));
 ok('secondary I have a question + Not now',/I have a question/.test(await p.locator('.phone [data-act=askq]').innerText())&&await p.locator('.phone [data-act=notnow]').count()===1);
 await p.click('.steps .st-a');await p.waitForTimeout(300);ok('Book word opens Book tab',await p.evaluate(()=>Store.byId('C-1042').ptab==='book'));
 // nurse in hours
 await p.evaluate(()=>{Store.reset();Patient.tourGo('C-1042',{tab:'assistant'})});await p.waitForTimeout(300);
 await p.click('.phone [data-act=nurse]');await p.waitForTimeout(300);let n=await p.locator('.phone').innerText();ok('nurse joins + sim note',/Nurse Layla/.test(n)&&/replies are simulated/.test(n));
 await p.evaluate(()=>Patient.send('can you call me'));await p.waitForTimeout(1000);n=await p.locator('.phone').innerText();ok('nurse call offer',/When suits you/.test(n)&&await p.locator('[data-act=ncall]').count()===1);
 await p.click('[data-act=nlater]');await p.waitForTimeout(300);n=await p.locator('.phone').innerText();ok('call me later confirm + log',/A nurse will call you back on this number/.test(n)&&!/17:00|2 hours/.test(n)&&await p.evaluate(()=>Store.S.data.log.some(l=>/Call me later/.test(l.what))));
 await p.evaluate(()=>Patient.send('I am worried'));await p.waitForTimeout(1000);n=await p.locator('.phone').innerText();ok('nurse other text',/I've read your message/.test(n)&&!/few minutes/.test(n));
 // night
 await p.evaluate(()=>{Store.reset();Store.S.data.clockDays=0.5;Store.save();Patient.tourGo('C-1042',{tab:'assistant'})});await p.waitForTimeout(300);
 await p.click('.phone [data-act=nurse]');await p.waitForTimeout(300);n=await p.locator('.phone').innerText();ok('night: no nurse joins',/line is closed now/.test(n)&&!/08:00/.test(n)&&!/Nurse Layla joined/.test(n)&&await p.locator('[data-act=nightcall]').count()===1);
 await p.click('[data-act=nightcall]');await p.waitForTimeout(300);ok('night callback logged',await p.evaluate(()=>Store.S.data.log.some(l=>/after 08:00/.test(l.what))));
 await p.screenshot({path:'v42-night.png'});
 // AR male nurse text
 await p.goto(U+'?lang=ar#/patient');await p.waitForTimeout(600);await p.evaluate(()=>{Store.reset();Store.S.data.lang='ar';Store.save();Patient.tourGo('C-1045',{tab:'assistant'})});await p.waitForTimeout(300);
 await p.click('.phone [data-act=nurse]');await p.waitForTimeout(300);await p.evaluate(()=>Patient.send('مرحبا'));await p.waitForTimeout(1000);n=await p.locator('.phone').innerText();ok('AR male nurse reply',/قرأت رسالتك\. هل تفضل أن أتصل بك/.test(n));
 // staff demo time
 await p.goto(U+'?lang=en#/team');await p.waitForTimeout(700);ok('staff demo time line',/Today in the demo:/.test(await p.locator('#view').innerText()));
}
await p.close();}
console.log('errors',errs);await b.close()})();
