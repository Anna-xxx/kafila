const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
await p.goto('http://localhost:8765/#/patient');await p.evaluate(()=>{localStorage.clear();localStorage.setItem('kafila-entry','1');localStorage.setItem('screenpath-tour','{"open":false}')});await p.reload();await p.waitForTimeout(600);
const r=await p.evaluate(async()=>{const c=Store.byId('C-1042');const lv=c.result.level,z=c.result.zone,tr=c.track;Agent.ask=async()=>({kind:'answer',text:'ok',c:'',src:[],via:'ai',raise:true});c.pscreen='app';await Patient.send('my tummy feels odd');const c2=Store.byId('C-1042');return {same:c2.result.level===lv&&c2.result.zone===z&&c2.track===tr,concern:!!c2.aiConcern,cb:!!c2.callback}});
ok('level/zone/track unchanged',r.same);ok('review task',r.concern&&r.cb);
await p.goto('http://localhost:8765/#/team');await p.evaluate(()=>{Store.S.data.role='gp';Store.S.data.ui.tab='all';Store.save()});await p.waitForTimeout(400);ok('worklist tag',/AI concern: clinician review/.test(await p.locator('#view').innerText()));
await p.goto('http://localhost:8765/#/about');await p.waitForTimeout(300);ok('about wording',/Minimised, not anonymous/.test(await p.locator('#view').innerText()));
console.log(errs);await b.close()})();
