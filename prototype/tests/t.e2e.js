const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch();
for (const [vw,name] of [[{width:1300,height:900},'d'],[{width:390,height:800},'m']]) {
const p=await b.newPage({viewport:vw});const e=[];p.on('pageerror',x=>e.push(x.message));
await p.goto('http://localhost:8765/');await p.evaluate(()=>{localStorage.clear();localStorage.setItem('kafila-entry','1')});await p.reload();await p.waitForTimeout(700);
const ok=(n,v)=>console.log(name,(v?'PASS ':'FAIL ')+n);
ok('no tour on bare open', !(await p.locator('#tour').count())); await p.click('#tourBtn'); await p.waitForTimeout(500); ok('tour opens from button', await p.locator('#tour').isVisible());
await p.screenshot({path:`tour-${name}0.png`});
const run=async(i,k=0)=>{ await p.click(`#tour [data-t=step][data-i="${i}"]`); await p.waitForTimeout(300); await p.waitForTimeout(500); };
ok('7 dots', (await p.locator('#tour [data-t=step]').count())===7); ok('no step has Show me', !(await p.locator('#tour [data-t=run]').count()));
const tops=[]; for(let i=0;i<5;i++){ await p.click('#tour [data-t=step][data-i="'+i+'"]'); await p.waitForTimeout(300); tops.push(Math.round((await p.locator('#tour').boundingBox()).y)); }
if(vw.width>700) ok('card stays in place '+tops, Math.max(...tops)-Math.min(...tops)<=4);
await p.click('#tour [data-t=step][data-i="0"]'); await p.waitForTimeout(400); await p.click('#tour [data-t=next]'); await p.waitForTimeout(500); ok('Next shows the result screen', await p.locator('[data-act=askq]').count()>0);
await p.click('#tour [data-t=next]'); await p.waitForTimeout(500); ok('Next shows booking', await p.locator('.slot').count()>0);
await p.click('#tour [data-t=next]'); await p.waitForTimeout(700); ok('Next shows care team case', /case\/C-1042/.test(p.url()));
await p.click('#tour [data-t=prev]'); await p.waitForTimeout(500); ok('Back shows booking again', /#\/patient/.test(p.url()));
await run(0); ok('1 lock screen', await p.locator('.lockscr').count()>0);
await run(1); ok('2 result tab', /Your result|result/i.test(await p.locator('.phone').innerText()) && await p.locator('[data-act=book]').count()>0);
await run(2); ok('3 book tab with female filter', await p.locator('.slot').count()>0);
await run(3); const st=await p.evaluate(()=>Store.byId('C-1042').state); ok('4 case page, referral, specialist ('+st+')', /case\/C-1042/.test(p.url()) && st==='referral' && await p.locator('[data-do=accept]').isEnabled());
await p.screenshot({path:`tour-${name}4.png`});
await run(4); ok('5 998 overlay', await p.evaluate(()=>Store.S.data.ui.overlay==='emerg'));
await p.screenshot({path:`tour-${name}5.png`});
await run(5); ok('6 case as GP', /case\/C-1043/.test(p.url()) && await p.locator('[data-do=samecall]').isEnabled());
await run(6); ok('7 dashboard + Finish', /dashboard/.test(p.url()) && await p.locator('#tour [data-t=close].primary').count()===1);
// AR toggle
await p.click('[data-glang=ar]'); await p.waitForTimeout(200); ok('AR tour', (await p.locator('#tour').getAttribute('dir'))==='rtl');
await p.screenshot({path:`tour-${name}ar.png`});
await p.click('#tour [data-t=close]'); ok('closed', await p.locator('#tour').count()===0);
await p.click('#tourBtn'); ok('reopened', await p.locator('#tour').isVisible());
console.log(name,'errors',e); await p.close(); }
await b.close()})();
