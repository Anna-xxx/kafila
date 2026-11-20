const {chromium}=require('playwright');const U='http://localhost:8765/';
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1280,height:1000}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
await p.goto(U);await p.evaluate(()=>{localStorage.clear();localStorage.setItem('screenpath-tour','{"open":true,"step":0}')});await p.goto(U+'?x=1');await p.waitForTimeout(700);
ok('no entry popup first',await p.locator('#entry').count()===0);await p.click('#tourBtn');await p.waitForTimeout(200);let tt=await p.locator('#tour').innerText();ok('tour step 1 plain',/Fatima gets a message/.test(tt)&&/Tap the message on her phone/.test(tt));
await p.waitForTimeout(600);ok('step 1 shows lock screen',await p.locator('.lockscr').count()>0);
await p.click('#tour [data-t=step][data-i="5"]');tt=await p.locator('#tour').innerText();ok('step 6 buttons',/Rajesh's case/.test(tt)&&/Dashboard/.test(tt)&&/Ahmed's case/.test(tt));
await p.click('#tour [data-t=lang]');await p.waitForTimeout(200);tt=await p.locator('#tour').innerText();ok('AR tour no "you are now"',/الطبيبة تغلق الحالة/.test(tt)&&!/أنت الآن|أنتِ/.test(tt));
await p.click('#tour [data-t=lang]');await p.click('#tour [data-t=close]');
// patient result: gloss
await p.evaluate(()=>{Store.reset();Store.S.data.lang='en';Store.save();location.hash='#/patient'});await p.waitForTimeout(500);
await p.click('[data-act="lock"]').catch(()=>{});await p.click('[data-act="openapp"]');await p.waitForTimeout(1400);await p.click('[data-act="consent"]');await p.click('[data-act="signin"]');await p.waitForTimeout(300);
await p.click('[data-act="tab"][data-arg="result"]');await p.waitForTimeout(200);
ok('gloss words present',await p.locator('.steps .gloss-w').count()>=2);
await p.locator('.steps .gloss-w',{hasText:/gastroenterologist/i}).first().click();await p.waitForTimeout(200);
ok('gloss opens',/specialises in the stomach and bowel/.test(await p.locator('.steps').innerText()));
await p.locator('.steps .gloss-w',{hasText:/gastroenterologist/i}).first().click();await p.waitForTimeout(200);
ok('gloss closes',!/specialises in the stomach/.test(await p.locator('.steps').innerText()));
let st=await p.locator('.steps').innerText();ok('projected date says at the latest',/at the latest/.test(st));
// greeting
await p.click('[data-act="tab"][data-arg="assistant"]');await p.waitForTimeout(200);
for(const [q,re] of [['hi',/Hello Fatima\. I can explain your result/],['Hello!',/Hello Fatima\./],['what is this weather',/checked answer to that.*colonoscopy/]]){await p.fill('#msg',q);await p.press('#msg','Enter');await p.waitForTimeout(500);const last=await p.locator('.bub').last().innerText();ok('assistant "'+q+'"',re.test(last.replace(/\n/g,' ')));}
// who is talking
await p.goto(U+'#/patient');await p.waitForTimeout(400);
let hd=await p.locator('.phone').innerText();ok('tab Chat + header',/Chat with your health centre/.test(hd)&&/Automatic answer · prepared by your centre/.test(hd)&&!/AI assistant of/.test(hd));
await p.click('.pill-n');await p.waitForTimeout(300);hd=await p.locator('.phone').innerText();
ok('nurse joined line + header',/You are now talking to a person; automatic answers are off/.test(hd)&&/Chat with Nurse Layla/.test(hd)&&/Nurse Layla · a person at your centre/.test(hd));
await p.fill('#msg','Is it cancer?');await p.press('#msg','Enter');await p.waitForTimeout(1200);const lb=await p.locator('.bub').last().innerText();ok('no automatic answer in nurse mode',/Nurse Layla/.test(lb)&&!/Automatic answer/.test(lb));
// book tab + my case + demo panel
await p.goto(U+'#/patient');await p.evaluate(()=>{localStorage.setItem('screenpath-demo-ui','1');Patient.tourGo('C-1042',{tab:'book'})});await p.reload();await p.waitForTimeout(600);
let bt=await p.locator('.phone').innerText();ok('book tab plain',/Choose a time for your colonoscopy/.test(bt)&&/Choose this time/.test(bt));
const side=await p.locator('.demo-side').innerText();ok('demo panel plain',/Demo tools: try it yourself/.test(side)&&/If the patient doesn.t answer/.test(side)&&!/workers\.dev/.test(side)&&/What the care team sees now/.test(side));
await p.evaluate(()=>Patient.tourGo('C-1043',{tab:'result'}));await p.waitForTimeout(400);
ok('no scenario select',!(await p.locator('#persona').count()));
ok('strip has no screen/lang selects',!(await p.isVisible('#role'))&&!(await p.isVisible('#lang')));
// team fixes
await p.goto(U+'#/case/C-1045');await p.evaluate(()=>{Store.S.data.role='gp';Store.save()});await p.waitForTimeout(400);let cv=await p.locator('#view').innerText();
ok('first message label',/First message by/.test(cv)&&!/Contact by/.test(cv));ok('no double dot',!/M\.\./.test(cv));ok('no "1 days"',!/\b1 days/.test(cv));
console.log('errors',errs);await b.close()})();
