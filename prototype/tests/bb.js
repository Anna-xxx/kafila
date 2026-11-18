const {chromium}=require('playwright');const U='http://localhost:8765/';
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1280,height:1000}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
await p.goto(U+'#/team');await p.evaluate(()=>{localStorage.clear();localStorage.setItem('kafila-entry','1');localStorage.setItem('screenpath-tour','{"open":false}');localStorage.setItem('screenpath-demo-ui','1')});await p.reload();await p.waitForTimeout(600);
const role=async r=>{await p.selectOption('#role',r);await p.waitForTimeout(300)};
// B1 dashboard
await role('lead');await p.goto(U+'#/dashboard');await p.waitForTimeout(500);let t=await p.locator('#view').innerText();
ok('B1 headline',/Follow-up completed in time/.test(t));ok('B1 closed without care card',/Closed without care/.test(t));ok('B1 funnel ends Follow-up completed',/Follow-up completed/.test(t));
// B2 declined -> pending second signature
const id=await p.evaluate(()=>{const c=Store.S.data.cases.find(c=>!['closed'].includes(c.state)&&c.state!=='issued'&&c.owner);c.humanDone=true;Store.save();return c.id});
await role('gp');await p.goto(U+'#/case/'+id);await p.waitForTimeout(400);
t=await p.locator('#view').innerText();ok('B4 three clocks',/Contact by/.test(t)&&/Referral by/.test(t)&&/Colonoscopy by/.test(t));
await p.click('[data-do=close]');await p.waitForTimeout(200);
await p.selectOption('#rc','declined');await p.fill('#ev','Patient said no on call');await p.check('#sig');await p.click('[data-ok]');await p.waitForTimeout(300);
let c=await p.evaluate(i=>{const c=Store.byId(i);return {st:c.state,pc:!!c.pendingClose}},id);ok('B2 declined not closed, pending: '+c.st,c.st!=='closed'&&c.pc);
t=await p.locator('#view').innerText();ok('B2 GP cannot give 2nd sig',await p.locator('[data-do=sign2]').isDisabled());
await role('clinlead');await p.goto(U+'#/team');await p.waitForTimeout(400);t=await p.locator('#view').innerText();ok('B2 clinlead worklist shows 2nd signature',/2nd signature needed|second signature/i.test(t)&&t.includes(id));
await p.goto(U+'#/case/'+id);await p.waitForTimeout(400);await p.click('[data-do=sign2]');await p.selectOption('#d2','ok');await p.check('#sig2');await p.click('[data-ok]');await p.waitForTimeout(300);
c=await p.evaluate(i=>{const c=Store.byId(i);return {st:c.state,by2:c.closure&&c.closure.by2}},id);ok('B2 closed with two signatures',c.st==='closed'&&!!c.by2);
// B3 hand-over
const id2=await p.evaluate(()=>{const c=Store.S.data.cases.find(c=>c.state==='referral'&&c.owner);return c.id});
await role('coordinator');await p.goto(U+'#/case/'+id2);await p.waitForTimeout(400);const own0=await p.evaluate(i=>Store.byId(i).owner,id2);
await p.click('[data-do=reassign]');await p.selectOption('#ow','GP · Dr. Faisal R.');await p.selectOption('#why','Workload balance');await p.click('[data-ok]');await p.waitForTimeout(300);
c=await p.evaluate(i=>{const c=Store.byId(i);return {o:c.owner,h:!!c.handover}},id2);ok('B3 owner kept until accept',c.o===own0&&c.h);
t=await p.locator('#view').innerText();ok('B3 Accept case button',/Accept case/.test(t));
await p.evaluate(()=>{const c=Store.S.data.cases;});
await p.click('[data-do=takeover]').catch(()=>{});await p.waitForTimeout(300);
c=await p.evaluate(i=>{const c=Store.byId(i);return {o:c.owner,h:!!c.handover}},id2);ok('B3 accepted -> new owner '+c.o,c.o==='GP · Dr. Faisal R.'&&!c.h);
// B4 late wording
await p.goto(U+'#/team');await p.waitForTimeout(400);t=await p.locator('#view').innerText();ok('B4 no "case overdue" wording',!/case overdue/i.test(t));
// B5 patient
await p.goto(U+'#/patient');await p.waitForTimeout(400);await p.evaluate(()=>Patient.tourGo('C-1042',{tab:'mycase'}));await p.waitForTimeout(400);t=await p.locator('.phone').innerText();ok('B5 line',/same steps your care team sees|نفس الخطوات/.test(t));
console.log('errors',errs);await b.close()})();
