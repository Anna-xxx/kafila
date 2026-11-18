const {chromium}=require('playwright');const U='http://localhost:8765/';
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1280,height:1000}});const errs=[];p.on('pageerror',e=>errs.push(e.message));const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
await p.goto(U+'#/patient');await p.evaluate(()=>{localStorage.clear();localStorage.setItem('kafila-entry','1');localStorage.setItem('screenpath-tour','{"open":false}');localStorage.setItem('screenpath-demo-ui','1')});await p.reload();await p.waitForTimeout(600);
const wd=await p.evaluate(()=>{const c=Store.byId('C-1042');const f=Store.fitClocks(c);return {iss:new Date(f.iss).toISOString(),refBy:new Date(f.refBy).toISOString(),careBy:new Date(f.careBy).toISOString(),n:Store.workdaysBetween(f.iss,f.refBy)}});console.log(wd);ok('15 working days',wd.n===15);
await p.goto(U+'#/case/C-1042');await p.waitForTimeout(400);let t=await p.locator('#view').innerText();
ok('case Referral by',/Referral by: /.test(t)&&/Colonoscopy by: /.test(t)&&/15 working days from result/.test(t));ok('no 90 on case page',!/\b90\b/.test(t));
console.log((t.match(/Time left on this clock\s*\n?.*/)||[''])[0]);
await p.goto(U+'#/dashboard');await p.waitForTimeout(400);t=await p.locator('#view').innerText();ok('dashboard no 90/180',!/target 90|hard limit 180/.test(t)&&/15 working days/.test(t));
await p.goto(U+'#/team');await p.evaluate(()=>{Store.S.data.role='lead';Store.S.data.ui.tab='all';Store.save()});await p.waitForTimeout(400);t=await p.locator('#view').innerText();ok('worklist no 90',!/90 days|180-day/.test(t));
const esc=await p.evaluate(()=>Store.S.data.cases.filter(c=>Store.status(c).escalated).length);console.log('escalated cases',esc);
// patient texts
await p.goto(U+'#/patient');await p.evaluate(()=>Patient.tourGo('C-1042',{tab:'result'}));await p.waitForTimeout(400);t=await p.locator('.phone').innerText();ok('patient Referral by / Colonoscopy by',/Referral by/.test(t)&&/Colonoscopy by/.test(t));await p.locator('.phone').screenshot({path:'fit-res.png'});
await p.evaluate(()=>{Store.S.data.lang='ar';Store.save()});await p.waitForTimeout(300);t=await p.locator('.phone').innerText();ok('AR texts',/التحويل قبل/.test(t)&&/تنظير القولون قبل/.test(t));
// returned referral: clock 2 not restarted
const r=await p.evaluate(async()=>{Store.S.data.lang='en';const c=Store.byId('C-1042');Patient.tourGo('C-1042',{tab:'book'});await Patient.tourBook();const f1=Store.fitClocks(c).careBy;Team.rejectReferral(c,'Khalifa City GI Centre · triage: Dr. Omar K.','Outside catchment area');Store.S.data.clockDays+=3;Store.move(c,'referral','GP · Dr. Hessa M.','re-routed');const f2=Store.fitClocks(c).careBy;Store.save();return {same:f1===f2,f1:new Date(f1).toISOString()}});ok('clock 2 does not restart',r.same);
console.log('errors',errs);await b.close()})();
