const { chromium } = require('playwright');
const U='http://localhost:8765/';
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport:{width:1300,height:900}});
const errs=[]; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d=>d.dismiss());
const ok=(n,v)=>console.log((v?'PASS ':'FAIL ')+n);
await p.goto(U+'#/team'); await p.evaluate(()=>{localStorage.clear();localStorage.setItem('screenpath-demo-ui','1')}); await p.reload(); await p.waitForTimeout(600);
const st=(id)=>p.evaluate(id=>{const c=Store.byId(id);return {state:c.state,owner:c.owner,s:Store.status(c),ref:c.referral,acc:c.accepted}},id);
// L3 escalation day 70 for FIT+
await p.evaluate(()=>{Store.S.data.clockDays=70;Store.save()});
let x=await st('C-1045'); ok('L3 FIT+ escalated at 75% of the working-day clock ('+x.s.rawPct+'%)', x.s.escalated && !!x.s.fit && !x.s.hardLimit);
await p.evaluate(()=>{Store.S.data.clockDays=136;Store.save()});
x=await st('C-1043'); ok('L9 urgent pct capped', x.s.clockPct===100 && x.s.overBy>0);
await p.goto(U+'#/case/C-1043'); await p.waitForTimeout(300);
ok('L9 no % over 100 on page', !/\d{4}%/.test(await p.locator('#view').innerText()));
await p.evaluate(()=>{Store.reset()}); await p.evaluate(()=>{localStorage.setItem('screenpath-demo-ui','1')});
// Patient: Rajesh card
await p.goto(U+'#/patient'); await p.waitForTimeout(500);
await p.evaluate(()=>{Store.S.data.persona='C-1043';Store.S.data.lang='en';Store.save()}); await p.waitForTimeout(200);
await p.click('[data-act="lock"]').catch(()=>{}); await p.waitForTimeout(200);
await p.click('[data-act="openapp"]'); await p.waitForTimeout(1400);
await p.click('[data-act="consent"]'); await p.click('[data-act="signin"]'); await p.waitForTimeout(400);
const card=await p.locator('.phone').innerText();
ok('BP card computed time', /before 13:00/.test(card) && !/17:00/.test(card));
ok('BP card or-wording', /top number is 180 or more, or the bottom number is 120 or more/.test(card));
ok('BP lower reading keeps call', /keep the doctor's call/.test(card));
ok('BP no extra pills', /anyone else's/.test(card));
ok('BP 998 full list + feel worse', /shortness of breath/i.test(card) && /much worse/.test(card) && !/only if/i.test(card));
ok('BP fallback clinic number', /If no doctor has called by 13:00/.test(card));
await p.locator('.phone').screenshot({path:'bp-en.png'});
ok('no Thiqa anywhere', !/Thiqa/.test(await p.content()));
await p.click('[data-act="understood"]'); await p.waitForTimeout(300);
await p.click('[data-act="callat"]'); await p.waitForTimeout(300);
const wins=await p.locator('[data-act="callwin"]').allInnerTexts(); ok('call windows today, ≤ call-by: '+wins.join(','), wins.length>0 && wins.every(w=>w<'13:01'));
// L1 GP same-day call
await p.goto(U+'#/case/C-1043'); await p.waitForTimeout(300);
await p.evaluate(r=>{Store.S.data.role=r;Store.save()},'gp'); await p.waitForTimeout(300);
await p.click('[data-do="samecall"]'); await p.selectOption('#ans','yes'); await p.selectOption('#o','0'); await p.fill('#note','185/112 twice, no symptoms. Started amlodipine plan per GP.'); await p.dispatchEvent('#note','input'); await p.click('[data-ok]'); await p.waitForTimeout(300);
x=await st('C-1043'); ok('L1 answered → confirmation', x.state==='confirmation');
await p.click('[data-do="close"]'); await p.waitForTimeout(200);
ok('L7 reason preselected', await p.locator('#rc').inputValue()==='treatment_started');
await p.check('#sig'); await p.waitForTimeout(100);
ok('L1 close possible', !(await p.locator('[data-ok]').isDisabled()));
await p.click('[data-ok]'); x=await st('C-1043'); ok('L1 closed', x.state==='closed');
// L1 no answer ladder on C-1047
await p.goto(U+'#/case/C-1047'); await p.waitForTimeout(300);
for (let i=0;i<3;i++){ await p.click('[data-do="samecall"]'); await p.selectOption('#ans','no'); await p.click('[data-ok]'); await p.waitForTimeout(200);}
x=await st('C-1047'); ok('L1 3 no-answers → clinical lead', /Clinical lead/.test(x.owner));
// L2 GP visit on an HbA1c case
const hb=await p.evaluate(()=>Store.S.data.cases.find(c=>c.result.next==='gp_confirm'&&['assigned','notified'].includes(c.state)).id);
await p.goto(U+'#/case/'+hb); await p.waitForTimeout(300);
await p.click('[data-do="gpvisit"]'); await p.selectOption('#o','1'); await p.fill('#ev','repeat HbA1c 5.6%'); await p.dispatchEvent('#ev','input'); await p.click('[data-ok]'); await p.waitForTimeout(200);
x=await st(hb); ok('L2 → confirmation', x.state==='confirmation');
await p.click('[data-do="close"]'); ok('L2 normal on repeat preselected', await p.locator('#rc').inputValue()==='confirmed_normal_repeat');
// L8 declined blocked without a call
const dis=await p.locator('#rc option[value="declined"]').getAttribute('disabled'); ok('L8 declined needs call', dis!==null);
await p.click('[data-x]');
// L4/L5 Fatima books Dr. Amna
await p.goto(U+'#/patient'); await p.waitForTimeout(300);
await p.evaluate(()=>{Store.S.data.persona='C-1042';Store.save()}); await p.waitForTimeout(200);
await p.click('[data-act="lock"]').catch(()=>{}); await p.click('[data-act="openapp"]'); await p.waitForTimeout(1400);
await p.click('[data-act="consent"]'); await p.click('[data-act="signin"]'); await p.waitForTimeout(300);
await p.click('[data-act="book"]'); await p.waitForTimeout(300);
await p.click('[data-act="pick"][data-arg="s1"]'); await p.waitForTimeout(200); await p.click('[data-act="confirm"]'); await p.waitForTimeout(300);
x=await st('C-1042'); ok('L4 owner = booked doctor: '+x.owner, /Amna/.test(x.owner)); ok('L5 SBAR packet', x.ref && x.ref.auto && /S: /.test(x.ref.note));
// L6 accept without slot: C-1044?
const r6=await p.evaluate(()=>{const c=Store.S.data.cases.find(c=>c.state==='referral'&&!c.slot&&!c.rejected&&c.result.test==='HPV');return c&&c.id});
await p.goto(U+'#/case/'+r6); await p.waitForTimeout(300); await p.evaluate(r=>{Store.S.data.role=r;Store.save()},'specialist'); await p.waitForTimeout(300);
await p.click('[data-do="accept"]'); await p.waitForTimeout(200);
x=await st(r6); ok('L6 accepted, not booked', x.state==='referral' && x.acc);
await p.evaluate(r=>{Store.S.data.role=r;Store.save()},'coordinator'); await p.waitForTimeout(200);
await p.click('[data-do="bookfor"]'); await p.selectOption('#sl','g1'); await p.click('[data-ok]'); await p.waitForTimeout(200);
x=await st(r6); ok('L6 booked with date, owner '+x.owner, x.state==='booked' && /Rana/.test(x.owner));
// Arabic BP card
await p.goto(U+'#/patient'); await p.evaluate(()=>{Store.reset();localStorage.setItem('screenpath-demo-ui','1');Store.S.data.persona='C-1043';Store.S.data.lang='ar';Store.S.data.cases.find(c=>c.id==='C-1043').lang='ar';Store.save()}); await p.waitForTimeout(300);
await p.click('[data-act="lock"]').catch(()=>{}); await p.click('[data-act="openapp"]'); await p.waitForTimeout(1400); await p.click('[data-act="consent"]'); await p.click('[data-act="signin"]'); await p.waitForTimeout(300);
const ar=await p.locator('.phone').innerText(); ok('AR BP card', /قبل الساعة 13:00/.test(ar) && /ضيق في التنفس/.test(ar));
await p.locator('.phone').screenshot({path:'bp-ar.png'});
console.log('errors', errs); await b.close(); })();
