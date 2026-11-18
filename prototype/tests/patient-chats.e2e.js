const {chromium}=require('playwright');const U='http://localhost:8765/';
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1280,height:1000}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
await p.goto(U+'#/patient');await p.evaluate(()=>{localStorage.clear();localStorage.setItem('kafila-entry','1');localStorage.setItem('screenpath-tour','{"open":false}');localStorage.setItem('screenpath-demo-ui','1')});await p.reload();await p.waitForTimeout(700);
ok('default English',await p.evaluate(()=>Store.S.data.lang)==='en');
const ph=()=>p.locator('.phone').innerText();
const labels=await p.locator('#persona option').allInnerTexts();ok('labels English only',labels.every(l=>!/[؀-ۿ]/.test(l)));
const seen={};
for(const k of ['C-1042','C-1043','C-1045','C-1049','C-1050']){await p.selectOption('#persona',k);await p.waitForTimeout(400);const t=await ph();const cap=await p.locator('.p-cap').innerText();seen[k]=t.replace(/\s+/g," ");
 ok(k+' opens chat with name',/Hello \w+/.test(t));ok(k+' no generic sender',!/^Family Health Centre/m.test(t)&&/Family Health Centre/.test(t));ok(k+' caption',cap.length>10);await p.locator('.stage').screenshot({path:'wa-'+k+'.png'});}
ok('Rajesh urgent text (neutral)',/A doctor needs to speak with you today/.test(seen['C-1043'])&&/If you feel very unwell, call 998 now/.test(seen['C-1043'])&&!/result|blood pressure|chest pain/i.test(seen['C-1043'].split('Open your result')[0]));
ok('Fatima routine text',/Dr. Hessa M.’s team has sent you a secure message/.test(seen['C-1042'])&&!/screening result/.test(seen['C-1042'].split('Open your result')[0])&&!/no medical details/.test(seen['C-1042']));
ok('Ahmed own doctor + clinic',/Dr. Yousef T./.test(seen['C-1045'])&&/Al Ain/.test(seen['C-1045']));
// Rajesh quick replies
await p.selectOption('#persona','C-1043');await p.waitForTimeout(300);let t=await ph();
ok('urgent QRs',/Call me now/.test(t)&&/I can't talk today/.test(t)&&!/Talk to a nurse/.test(t));
await p.click('[data-act=waCallNow]');await p.waitForTimeout(300);t=await ph();ok('call now reply',/will call you as soon as possible/.test(t));
const lg=await p.evaluate(()=>Store.S.data.log.filter(l=>l.caseId==='C-1043'||l.case==='C-1043'||JSON.stringify(l).includes('C-1043')).map(l=>JSON.stringify(l)).join('\n'));ok('call now logged',/Call me now/.test(lg));
// Mariam Arabic toggle
await p.selectOption('#persona','C-1049');await p.waitForTimeout(300);ok('toggle shown',await p.isVisible('[data-plang=ar]'));await p.click('[data-plang=ar]');await p.waitForTimeout(300);t=await ph();ok('Arabic after toggle',/مرحبًا مريم/.test(t)&&/مركز مدينة خليفة/.test(t));await p.locator('.stage').screenshot({path:'wa-mariam-ar.png'});
await p.click('[data-plang=en]');await p.waitForTimeout(200);
await p.selectOption('#persona','C-1050');await p.waitForTimeout(300);ok('no toggle for English patient',!(await p.isVisible('[data-plang]')));
console.log('errors',errs);await b.close()})();
