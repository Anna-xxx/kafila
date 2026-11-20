const {chromium}=require('playwright');const U='http://localhost:8765/';
(async()=>{const b=await chromium.launch();const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);const errs=[];
for(const w of [1366,390]){const p=await b.newPage({viewport:{width:w,height:860}});p.on('pageerror',e=>errs.push(e.message));
await p.goto(U+'#/patient');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(600);
ok(w+' one lang switch, none above phone',await p.locator('[data-glang]').count()===2&&!(await p.locator('[data-plang]').count()));
await p.click('[data-glang=ar]');await p.waitForTimeout(400);let t=await p.locator('.phone').innerText();ok(w+' AR phone',/مرحبًا|فاطمة|العين|خليفة/.test(t)&&await p.getAttribute('[data-glang=ar]','aria-pressed')==='true'&&/lang=ar/.test(p.url()));
await p.click('#tourBtn');await p.waitForTimeout(600);ok(w+' AR tour, no عربي button',(await p.locator('#tour').getAttribute('dir'))==='rtl'&&!(await p.locator('#tour [data-t=lang]').count()));
await p.click('[data-glang=en]');await p.waitForTimeout(400);ok(w+' EN tour follows',(await p.locator('#tour').getAttribute('dir'))==='ltr');
await p.click('#tour [data-t=step][data-i="6"]');await p.waitForTimeout(600);ok(w+' step 7 dashboard + Finish',/dashboard/.test(p.url())&&await p.locator('#tour [data-t=close].primary').count()===1);
await p.screenshot({path:`v44-step7-${w}.png`});
await p.click('#tour [data-t=close].primary');ok(w+' Finish closes, dashboard stays',!(await p.locator('#tour').count())&&/dashboard/.test(p.url()));
await p.reload();await p.waitForTimeout(500);ok(w+' reload keeps EN',await p.getAttribute('[data-glang=en]','aria-pressed')==='true');
ok(w+' no h-scroll',!(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)));
await p.screenshot({path:`v44-bar-${w}.png`,clip:{x:0,y:0,width:w,height:w>500?110:160}});
await p.close();}
// AR gender fixes
const p=await b.newPage();await p.goto(U+'?lang=ar#/patient');await p.waitForTimeout(600);
await p.evaluate(()=>{Store.reset();Store.S.data.lang='ar';Store.S.data.version='ar';Store.save();});await p.waitForTimeout(200);
await p.evaluate(()=>Patient.pickPersona('C-1042'));await p.waitForTimeout(400);let t=await p.locator('.phone').innerText();ok('waHello AR fem, no double dot',/اضغطي/.test(t)&&!/\.\./.test(t));
await p.evaluate(()=>Patient.pickPersona('C-1045'));await p.waitForTimeout(400);t=await p.locator('.phone').innerText();ok('waHello AR masc',/اضغط "/.test(t)||/اضغط /.test(t)&&!/اضغطي/.test(t));
await p.evaluate(()=>{Store.S.data.clockDays=0.5;Store.save();Patient.tourGo('C-1042',{tab:'assistant'})});await p.waitForTimeout(300);await p.click('.phone [data-act=nurse]');await p.waitForTimeout(300);t=await p.locator('.phone').innerText();ok('night AR fem اتصلي',/اتصلي بالرقم 998/.test(t));
await p.evaluate(()=>Patient.tourGo('C-1045',{tab:'assistant'}));await p.waitForTimeout(300);await p.click('.phone [data-act=nurse]');await p.waitForTimeout(300);t=await p.locator('.phone').innerText();ok('night AR masc',/رسالتك محفوظة/.test(t)&&/اتصل بالرقم 998/.test(t)&&!/رسالتكِ/.test(t));
console.log('errors',errs);await b.close()})();
