const {chromium}=require('playwright');const U='http://localhost:8765/?lang=ar';
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1280,height:1000}});const errs=[];p.on('pageerror',e=>errs.push(e.message));const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
await p.goto(U+'#/patient');await p.evaluate(()=>{localStorage.clear();localStorage.setItem('kafila-entry','1');localStorage.setItem('screenpath-tour','{"open":false}');localStorage.setItem('screenpath-demo-ui','1')});await p.reload();await p.waitForTimeout(600);
const ph=()=>p.locator('.phone').innerText();
await p.evaluate(()=>Patient.tourGo('C-1042',{tab:'assistant'}));await p.waitForTimeout(300);
await p.evaluate(()=>Patient.send('ما هو تنظير القولون، هل يؤلم؟'));await p.waitForTimeout(600);let t=await ph();ok('sedation wording neutral',/خيارات الراحة والتهدئة/.test(t)&&!/مسترخيًا/.test(t));
await p.evaluate(()=>Patient.send('متى يجب أن أحجز؟ هل أنتظر؟'));await p.waitForTimeout(600);t=await ph();ok('FIT wait: 15 + 31 working days AR',/15 يوم عمل/.test(t)&&/31 يوم عمل/.test(t)&&!/14 يومًا/.test(t));
await p.evaluate(()=>Patient.send('عندي ألم في الصدر'));await p.waitForTimeout(600);t=await ph();ok('L4 neutral 998 + feminine',/ما تصفينه/.test(t)&&/يُرجى الاتصال بالرقم 998 فورًا/.test(t));
await p.evaluate(()=>{const c=Store.byId('C-1042');c.redFlag=null;Store.save()});
// male Rajesh in AR version: masculine
await p.evaluate(()=>Patient.tourGo('C-1043',{tab:'assistant'}));await p.waitForTimeout(300);t=await ph();ok('Rajesh masc title',/هل لديك أسئلة عن نتيجتك/.test(t)&&!/لديكِ/.test(t));
// EN check
await p.evaluate(()=>{Store.S.data.lang='en';Store.save()});await p.evaluate(()=>Patient.tourGo('C-1042',{tab:'assistant'}));await p.waitForTimeout(300);
await p.evaluate(()=>Patient.send('How soon should I book? Can I wait?'));await p.waitForTimeout(600);t=await ph();ok('FIT wait EN',/15 working days/.test(t)&&/31 working days/.test(t)&&!/14 days/.test(t));ok('askTitle EN',/Questions about your result\?/.test(t));
// empty compared-with
await p.evaluate(()=>Patient.tourGo('C-1049',{tab:'assistant'}));await p.evaluate(()=>Patient.send('Who will see my result? privacy'));await p.waitForTimeout(600);t=await ph();ok('no "Compared with: —"',!/Compared with: —|مقارنة بـ: —/.test(t));
console.log('errors',errs);await b.close()})();
