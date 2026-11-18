const {chromium}=require('playwright');const U='http://localhost:8765/';
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1280,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
await p.goto(U);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(700);
ok('entry panel on first bare open',await p.locator('#entry').isVisible());await p.screenshot({path:'entry.png'});
await p.click('.entry-b[data-e="1"]');await p.waitForTimeout(500);
const ph=await p.locator('#view').innerText();ok('Rajesh phone opens',location=undefined||/#\/patient/.test(p.url())&&await p.evaluate(()=>Store.S.data.persona==='C-1043'&&Store.S.data.lang==='en'));
await p.goto(U+'#/team');await p.reload();await p.waitForTimeout(500);ok('deep link no panel',!(await p.locator('#entry').count()));
await p.evaluate(()=>localStorage.removeItem('kafila-entry'));await p.goto(U+'#/case/C-1042');await p.reload();await p.waitForTimeout(500);ok('deep link case no panel even first time',!(await p.locator('#entry').count()));
await p.click('#startBtn');await p.waitForTimeout(200);ok('Start reopens',await p.locator('#entry').isVisible());
await p.click('.entry-b[data-e="3"]');await p.waitForTimeout(400);ok('GP lands on Rajesh case',/#\/case\/C-1043/.test(p.url())&&await p.evaluate(()=>Store.S.data.role==='gp'));
// e-consult urgency
await p.goto(U+'#/case/C-1042');await p.waitForTimeout(300);
await p.click('[data-do="econsult"]');await p.selectOption('#urg','Urgent');await p.click('[data-ok]');await p.waitForTimeout(300);
let c=await p.evaluate(()=>{const c=Store.byId('C-1042');return {q:Store.openConsult(c),s:Store.status(c)}});ok('e-consult due in 4 h',c.q&&Math.round((c.q.dueAt-c.q.at)/3600000)===4&&!c.s.overdue);
let cv=await p.locator('#view').innerText();ok('case page shows urgency',/Urgent · answer by/.test(cv));
await p.goto(U+'#/team');await p.waitForTimeout(300);let wl=await p.locator('#view').innerText();ok('worklist e-consult group',/E-consult waiting for the specialist/.test(wl)&&/e-consult answer in 4 h/.test(wl));
await p.evaluate(()=>{Store.S.data.clockDays+=1;Store.save()});await p.waitForTimeout(300);wl=await p.locator('#view').innerText();
c=await p.evaluate(()=>Store.status(Store.byId('C-1042')));ok('e-consult goes late',c.overdue&&/e-consult 20 h late/.test(wl));
await p.goto(U+'#/case/C-1042');await p.selectOption('#role','specialist');await p.waitForTimeout(200);await p.click('[data-do="econsult"]');await p.click('[data-ok]');await p.waitForTimeout(300);
c=await p.evaluate(()=>Store.openConsult(Store.byId('C-1042')));ok('specialist answers, closes it',!c);
// done so far
await p.evaluate(()=>{Store.reset();Store.S.data.lang='en';Store.save()});await p.goto(U+'#/patient');await p.waitForTimeout(300);await p.evaluate(()=>Patient.tourBook());await p.waitForTimeout(300);
await p.goto(U+'#/case/C-1042');await p.waitForTimeout(300);cv=await p.locator('#view').innerText();
ok('done so far line',/What has been done so far:.*slot held .*prep not yet given/.test(cv));
const note=await p.evaluate(()=>Store.byId('C-1042').referral.note);ok('in SBAR packet',/D: What has been done so far/.test(note));
console.log('errors',errs);await b.close()})();
