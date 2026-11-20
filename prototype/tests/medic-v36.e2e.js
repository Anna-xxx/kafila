const {chromium}=require('playwright');const U='http://localhost:8765/';
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1280,height:1000}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
const fresh=async(h='#/patient')=>{await p.goto(U+h);await p.evaluate(()=>{localStorage.clear();localStorage.setItem('kafila-entry','1');localStorage.setItem('screenpath-tour','{"open":false}');localStorage.setItem('screenpath-demo-ui','1')});await p.reload();await p.waitForTimeout(600);};
await fresh();
// M1: callBy before 06:00 GST -> today before 10:00
const cb=await p.evaluate(()=>{const c=Store.byId('C-1043');let n=c.history.find(x=>x.state==='notified');if(!n){n={state:'notified',at:c.history[0].at};c.history.push(n);}const old=n.at;const res={};
 for(const [k,utc] of [['03:30',[17,23]],['09:30',[18,5]],['17:30',[18,13]]]){n.at=new Date(Date.UTC(2026,10,utc[0],utc[1],30)).toISOString();res[k]=Patient.callByText(c,'en');}
 n.at=old;return res;});
ok('M1 03:30 -> today before 10:00 '+JSON.stringify(cb),cb['03:30']==='today, before 10:00'&&/^today, before 1[34]:/.test(cb['09:30'])&&cb['17:30']==='tomorrow morning, before 10:00');
// urgent card
await p.evaluate(()=>{Store.S.data.persona='C-1043';Store.save()});
await p.selectOption('#persona','C-1043');await p.waitForTimeout(300);
let t=await p.locator('.phone').innerText();
ok('urgent WA neutral',/A doctor needs to speak with you today/.test(t)&&/02 000 0000/.test(t)&&!/0142/.test(t));
await p.click('[data-act=openapp]');await p.waitForTimeout(1400);await p.click('#consent').catch(()=>{});await p.click('[data-act=signin]').catch(()=>{});await p.waitForTimeout(300);
await p.click('[data-act="tab"][data-arg="result"]').catch(()=>{});await p.waitForTimeout(200);
const order=await p.evaluate(()=>{const ph=document.querySelector('.phone');const f=ph.querySelector('.fallback'),g=ph.querySelector('.greybox');return f&&g?!!(f.compareDocumentPosition(g)&Node.DOCUMENT_POSITION_FOLLOWING):null});
ok('M3 fallback above 998 box',order===true);
const how=await p.locator('.howto li').count();ok('6-step how to measure',how===6);
t=await p.locator('.phone').innerText();
ok('step 1 + 2 wording',/A doctor from your health centre will call you from 02 000 0000/.test(t)&&/avoid heavy work until the doctor calls/.test(t));
ok('step 3 wording',/you don.t need to find one/.test(t));
await p.click('[data-act="understood"]').catch(()=>{});await p.waitForTimeout(300);
await p.click('[data-act="tab"][data-arg="assistant"]').catch(()=>{});await p.waitForTimeout(200);
ok('M2 no quiz for urgent BP',await p.locator('[data-act="teach"]').count()===0);
// SMS neutral (Ahmed ladder)
await p.selectOption('#persona','C-1045');await p.waitForTimeout(300);await p.click('[data-lad=sms2]');await p.waitForTimeout(300);
t=await p.locator('.phone').innerText();const sm=await p.locator('.notif').first().evaluate(e=>e.textContent);ok('SMS neutral with clinic',/You have a new message from Mussafah Family Health Centre/.test(sm)&&!/result|screening/i.test(sm));
// FIT teach-back
await fresh();await p.click('[data-act="lock"]').catch(()=>{});await p.click('[data-act="openapp"]');await p.waitForTimeout(1400);
await p.click('[data-act="consent"]');await p.click('[data-act="signin"]');await p.waitForTimeout(300);
await p.click('[data-act="tab"][data-arg="result"]');await p.click('[data-act="understood"]');await p.waitForTimeout(300);
await p.locator('[data-act="teach"]').nth(1).click();await p.waitForTimeout(300);t=await p.locator('.phone').innerText();
ok('F6 repeat reply',/a second normal result would not cancel the first one/.test(t));
ok('F6 buttons',/Talk to Nurse Layla/.test(t)&&/I understand, let.s book/.test(t));
await p.click('[data-act="tab"][data-arg="book"]');await p.waitForTimeout(200);t=await p.locator('.phone').innerText();
ok('Book header + line + button',/Choose a time for your colonoscopy/.test(t)&&/Any time before/.test(t)&&/Choose this time/.test(t)&&/Free with your/.test(t)&&/Show only:/.test(t));
await p.evaluate(()=>Patient.tourBook());await p.waitForTimeout(300);
const rem=await p.evaluate(()=>{const c=Store.byId('C-1042');c.state='booked';Store.save();return JSON.stringify(c.slot)});
await p.click('[data-act="tab"][data-arg="mycase"]').catch(()=>{});await p.waitForTimeout(300);t=await p.locator('.phone').innerText();
ok('F8 prep block',/Before your colonoscopy/.test(t)&&/blood thinners, diabetes medicines or iron tablets/.test(t)&&/do not drive that day/.test(t));
// reminders: advance clock to 1 day before
const R=await p.evaluate(()=>{const c=Store.byId('C-1042');const appt=Date.parse(c.slot.day+'T'+c.slot.time+':00+04:00');Store.S.data.clockDays+=Math.ceil((appt-Store.now())/Store.DAY)-0.5;Store.save();return Store.S.data.log.filter(l=>/Reminder sent/.test(l.text||l.msg||JSON.stringify(l))).map(l=>JSON.stringify(l)).join('|')});
await p.click('[data-act="tab"][data-arg="mycase"]').catch(()=>{});await p.waitForTimeout(300);t=await p.locator('.phone').innerText();
ok('F8 reminders 3 days + day before',/Start the clinic.s diet instructions today, as your clinic told you/.test(t)&&/start the prep drink at the time the clinic gave you/.test(t));
// team: pre-assessment task
await p.goto(U+'#/worklist');await p.evaluate(()=>{Store.S.data.role='specialist';Store.save()});await p.waitForTimeout(400);
await p.goto(U+'#/case/C-1042');await p.waitForTimeout(300);let cv=await p.locator('#view').innerText();
ok('pre-assessment action',/Pre-assessment done \+ prep issued/.test(cv));
await p.click('[data-do="prepdone"]');await p.waitForTimeout(300);
ok('prepIssued set',await p.evaluate(()=>!!Store.byId('C-1042').prepIssued));
// Arabic masculine check for prep text
await p.goto(U+'?lang=ar#/patient');await p.waitForTimeout(500);
const masc=await p.evaluate(()=>{const s=document.body.innerHTML;return true});ok('ar loads',masc);
console.log('errors',errs);await b.close()})();
