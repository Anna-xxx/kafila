const {chromium}=require('playwright');const U='http://localhost:8765/?lang=ar';
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1280,height:1000}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
await p.goto(U+'#/patient');await p.evaluate(()=>{localStorage.clear();localStorage.setItem('kafila-entry','1');localStorage.setItem('screenpath-tour','{"open":false}');localStorage.setItem('screenpath-demo-ui','1')});await p.reload();await p.waitForTimeout(600);
const ph=()=>p.locator('.phone').innerText();
// Mariam
await p.selectOption('#persona','C-1049');await p.waitForTimeout(300);
let t=await ph();ok('Mariam lock screen hides result',!/HPV|فيروس/.test(t));
await p.click('[data-act=lock]').catch(()=>{});await p.click('[data-act=openapp]');await p.waitForTimeout(1400);await p.click('[data-act=consent]');await p.click('[data-act=signin]');await p.waitForTimeout(400);
t=await ph();ok('Mariam AR meaning + compared',/فيروس الورم الحليمي/.test(t)&&/مقارنة بـ: فحص HPV سلبي/.test(t));await p.locator('.phone').screenshot({path:'mariam.png'});
await p.evaluate(()=>Patient.send('هل يمكنني رؤية طبيبة؟'));await p.waitForTimeout(600);t=await ph();ok('Mariam FAQ female doctor (HPV-specific)',/4 أسابيع/.test(t));
await p.evaluate(()=>Patient.send('من زوجي؟'));await p.waitForTimeout(600);t=await ph();ok('Mariam partner FAQ',/لا تعني أن أحدًا كان غير مخلص/.test(t));
await p.evaluate(()=>Patient.tourGo('C-1049',{tab:'book',filters:{female:true}}));await p.waitForTimeout(300);t=await ph();ok('colposcopy slots female',/المنظار المهبلي/.test(t));
// Salem
await p.selectOption('#persona','C-1050');await p.waitForTimeout(300);await p.click('[data-plang=en]');await p.waitForTimeout(200);
await p.click('[data-act=lock]').catch(()=>{});await p.click('[data-act=openapp]');await p.waitForTimeout(1400);await p.click('[data-act=consent]');await p.click('[data-act=signin]');await p.waitForTimeout(400);
t=await ph();ok('Salem EN meaning + compared',/7.2%/.test(t)&&/average blood sugar/.test(t)&&/below 5.7% is the normal range/.test(t));await p.locator('.phone').screenshot({path:'salem.png'});
await p.evaluate(()=>Patient.send('Do I have diabetes?'));await p.waitForTimeout(600);t=await ph();ok('Salem FAQ',/Not necessarily yet/.test(t));
await p.evaluate(()=>Patient.send('I am very thirsty all the time'));await p.waitForTimeout(600);t=await ph();ok('red flag very thirsty fixed',/contact a doctor today/i.test(t));
await p.evaluate(()=>{const c=Store.byId('C-1050');c.redFlag=null;Store.save()});
await p.evaluate(()=>Patient.tourGo('C-1050',{tab:'book'}));await p.waitForTimeout(300);t=await ph();ok('GP visit slots',/Family doctor visit and repeat test/.test(t));
await p.evaluate(()=>Patient.tourBook());await p.waitForTimeout(400);
let c=await p.evaluate(()=>{const c=Store.byId('C-1050');return {st:c.state,slot:!!c.slot,ref:!!c.referral}});ok('GP visit booked, no referral: '+c.st,c.st==='confirmation'&&c.slot&&!c.ref);
t=await ph();ok('My case shows Booked',/Booked/.test(t));
console.log('errors',errs);await b.close()})();
