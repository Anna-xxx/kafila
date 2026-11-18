const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1280,height:900}});const e=[];p.on('pageerror',x=>e.push(x.message));
await p.goto('http://localhost:8765/#/team');await p.waitForTimeout(800);await p.evaluate(()=>{Store.reset();});await p.goto('http://localhost:8765/#/team');await p.reload();await p.waitForTimeout(800);
await p.screenshot({path:'wl.png'});const t=await p.locator('#view').innerText();console.log(t.slice(0,1500));console.log('errors',e);
await p.setViewportSize({width:390,height:800});await p.waitForTimeout(300);await p.screenshot({path:'wl-m.png'});console.log('overflow',await p.evaluate(()=>document.documentElement.scrollWidth));await b.close()})();
