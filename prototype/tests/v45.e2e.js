const {chromium}=require('playwright');const U='http://localhost:8765/';
(async()=>{const b=await chromium.launch();const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);const errs=[];
const p=await b.newPage({viewport:{width:1280,height:1000}});p.on('pageerror',e=>errs.push(e.message));
await p.goto(U+'?lang=en#/patient');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(600);
await p.click('[data-pick="C-1045"]');await p.waitForTimeout(400);
await p.click('[data-lad=call5]');await p.waitForTimeout(300);let t=await p.locator('.phone').innerText();
ok('auto call: Incoming call + clinic + Automated call',/Incoming call/.test(t)&&/Family Health Centre/.test(t)&&/Automated call/.test(t)&&/demo number/.test(t));
const bb=await p.evaluate(()=>{const ph=document.querySelector('.phone').getBoundingClientRect();return [...document.querySelectorAll('.call .btns small')].every(s=>s.getBoundingClientRect().bottom<=ph.bottom)});ok('call buttons inside frame',bb);
await p.screenshot({path:'v45-call.png',clip:await p.locator('.phone').boundingBox()});
await p.click('[data-act=callAnswer]');await p.waitForTimeout(300);t=await p.locator('.phone').innerText();ok('auto script neutral',/important message for you/.test(t)&&!/screening result|follow-up visit/.test(t));
await p.click('[data-act=callEnd]');await p.waitForTimeout(200);
await p.click('[data-lad=coord]');await p.waitForTimeout(300);t=await p.locator('.phone').innerText();ok('coordinator call rings',/Noura · care coordinator/.test(t)&&await p.locator('.overlay.call').count()===1);
await p.click('[data-act=callAnswer]');await p.waitForTimeout(300);t=await p.locator('.phone').innerText();ok('Noura script + buttons',/this is Noura from/.test(t)&&await p.locator('[data-act=coordBook]').count()===1&&!/\.\./.test(t));
await p.screenshot({path:'v45-coord.png',clip:await p.locator('.phone').boundingBox()});
await p.click('[data-act=coordBook]');await p.waitForTimeout(400);ok('Book with Noura opens Book',await p.evaluate(()=>Store.byId('C-1045').ptab==='book'&&Store.byId('C-1045').pscreen==='app'));
await p.click('[data-lad=coord]');await p.waitForTimeout(200);await p.click('[data-act=callEnd]');await p.waitForTimeout(200);ok('declined coord call logs letter',await p.evaluate(()=>Store.S.data.log.some(l=>l.caseId==='C-1045'&&/no answer. Letter sent/.test(l.what))));
// toast inside phone
await p.evaluate(()=>{Patient.tourGo('C-1042',{tab:'book'})});await p.waitForTimeout(300);await p.evaluate(()=>Patient.tourBook());await p.waitForTimeout(300);
await p.evaluate(()=>{Store.byId('C-1042').ptab='mycase';Store.save()});await p.waitForTimeout(300);
const ch=p.locator('.phone [data-act=change]');if(await ch.count()){await ch.click();await p.waitForTimeout(200);ok('toast inside phone',await p.locator('.phone .toast.in-phone').count()===1&&await p.locator('body > .toast').count()===0);
 await p.waitForTimeout(300);ok('lasting change line',/Change requested/.test(await p.locator('.phone').innerText()));} else ok('change button present',false);
// AR coord masc
await p.goto(U+'?lang=ar#/patient');await p.waitForTimeout(600);await p.evaluate(()=>{Store.S.data.persona='C-1045';Store.save()});await p.waitForTimeout(300);
await p.click('[data-lad=coord]');await p.waitForTimeout(300);await p.click('[data-act=callAnswer]');await p.waitForTimeout(300);t=await p.locator('.phone').innerText();ok('AR coord masc',/معك نورة/.test(t)&&!/معكِ/.test(t));
console.log('errors',errs);await b.close()})();
