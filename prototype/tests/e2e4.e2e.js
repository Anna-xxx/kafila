const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  const U = 'http://localhost:8765/?lang=ar'; const shot = (n) => p.screenshot({ path: n + '.png' });
  await p.goto(U + '#/patient'); await p.evaluate(() => { localStorage.clear(); localStorage.setItem("screenpath-demo-ui","1"); }); await p.reload(); await p.waitForTimeout(500);
  const ok = (name, cond) => console.log((cond ? 'PASS ' : 'FAIL ') + name);
  const ph = () => p.locator('.phone');
  // Fatima AR flow
  await shot('n1-lock');
  await p.click('[data-act=lock]'); await p.waitForTimeout(150); await shot('n2-wa');
  await p.click('[data-act=openapp]'); await p.waitForTimeout(1300); await p.waitForTimeout(150);
  ok('consent required', await ph().locator('[data-act=signin]').isDisabled());
  await p.click('#consent'); await p.click('[data-act=signin]'); await p.waitForTimeout(200); await shot('n3-result');
  ok('app with tabbar', (await ph().locator('.tabbar button').count()) === 4);
  await p.click('[data-act=understood]'); await p.waitForTimeout(150);
  await ph().locator('[data-act=teach]').first().click(); await p.waitForTimeout(150);
  await ph().locator('[data-act=bar][data-arg=gender]').click(); await ph().locator('[data-act=bar][data-arg=transport]').click(); await ph().locator('[data-act=barDone]').click(); await p.waitForTimeout(150);
  await shot('n4-assistant');
  await ph().locator('.qr [data-act=tab]').click(); await p.waitForTimeout(150); await shot('n5-book');
  ok('female filter applied', (await ph().locator('.slot:not(.nofit)').allInnerTexts()).every(t => t.includes('طبيبة')));
  await ph().locator('.slot').first().click(); await p.waitForTimeout(150); await shot('n6-sheet');
  await ph().locator('[data-act=confirm]').click(); await p.waitForTimeout(150); await shot('n7-a2hs');
  ok('a2hs sheet', (await ph().locator('.sheet .appicon').count()) === 1);
  await ph().locator('.sheet [data-act=a2hsLater]').click();
  await ph().locator('.tabbar [data-arg=mycase]').click(); await p.waitForTimeout(150); await shot('n8-mycase');
  // BUG-01: nurse then chest pain
  await ph().locator('.pill-n').click(); await p.waitForTimeout(100);
  await p.fill('#msg', 'chest pain'); await p.press('#msg', 'Enter'); await p.waitForTimeout(400);
  ok('BUG-01 998 in nurse mode', (await ph().locator('.overlay.emerg').count()) === 1); await shot('n9-emerg-nurse');
  await ph().locator('[data-act=emergClose]').click();
  // BUG-05/06
  await p.fill('#msg', 'هل يمكنني إعادة الاختبار؟'); await p.press('#msg', 'Enter'); await p.waitForTimeout(400);
  // (nurse mode: no AI answer expected) - switch to Rajesh
  await p.selectOption('#persona', 'C-1043'); await p.waitForTimeout(200);
  if (await p.locator('[data-act=lock]').count()) await p.click('[data-act=lock]'); await p.click('[data-act=openapp]'); await p.waitForTimeout(1300); await p.click('#consent'); await p.click('[data-act=signin]'); await p.waitForTimeout(200);
  await shot('n10-rajesh');
  ok('BUG-04 Rajesh no book button', (await ph().locator('[data-act=book]').count()) === 0);
  await ph().locator('.tabbar [data-arg=book]').click(); await p.waitForTimeout(100);
  ok('BUG-04 Rajesh no slots', (await ph().locator('.slot').count()) === 0);
  await ph().locator('.tabbar [data-arg=assistant]').click();
  await p.fill('#msg', 'what is the weather'); await p.press('#msg', 'Enter'); await p.waitForTimeout(400);
  const last = await ph().locator('.bub').last().innerText(); ok('BUG-05 weather → fallback', /can.t answer|لا أستطيع الإجابة/i.test(last));
  // BUG-09 Rajesh Arabic
  await p.selectOption('#lang', 'ar').catch(()=>{}); await p.waitForTimeout(200);
  await ph().locator('.tabbar button').first().click(); await p.waitForTimeout(150); await shot('n11-rajesh-ar');
  ok('BUG-09 AR steps', /استرح/.test(await ph().innerText()));
  await p.selectOption('#lang', 'en').catch(()=>{});
  // BUG-02 Ahmed ladder
  await p.selectOption('#persona', 'C-1045'); await p.waitForTimeout(200);
  await p.click('[data-lad=sms2]'); await p.waitForTimeout(200); await shot('n12-sms');
  ok('BUG-02 SMS shows', (await ph().innerText()).includes('AD-HEALTH'));
  await p.click('[data-lad=call5]'); await p.waitForTimeout(200); await shot('n13-call');
  ok('BUG-02 call shows', (await ph().locator('.overlay.call').count()) === 1);
  await ph().locator('[data-act=callEnd]').click();
  await p.click('[data-lad=coord]'); await p.waitForTimeout(100);
  // BUG-03 / BUG-07
  await p.goto(U + '#/team'); await p.waitForTimeout(300);
  const ids = await p.evaluate(() => Store.S.data.cases.map(c => c.id)); ok('BUG-03 unique ids', new Set(ids).size === ids.length);
  const txt = await p.locator('#view').innerText(); ok('BUG-07 nurse callback in exceptions', txt.includes('Nurse callback'));
  // BUG-10 close
  await p.evaluate(() => { Store.S.data.role = 'gp'; Store.save(); });
  await p.goto(U + '#/case/C-1045'); await p.waitForTimeout(300);
  await p.locator('[data-a=close], button:has-text("Close case")').first().click(); await p.waitForTimeout(200);
  const dis = await p.$$eval('#rc option', os => os.map(o => o.value + ':' + o.disabled));
  ok('BUG-10 completed disabled', dis.includes('completed_normal:true')); ok('BUG-16 lost disabled (<30 days)', dis.includes('lost:true'));
  await shot('n14-close');
  // mobile case page
  await p.setViewportSize({ width: 390, height: 844 }); await p.goto(U + '#/case/C-1042'); await p.waitForTimeout(300);
  ok('BUG-11 no side scroll', (await p.evaluate(() => document.documentElement.scrollWidth)) <= 392);
  await p.goto(U + '#/patient'); await p.waitForTimeout(300); await p.screenshot({ path: 'n15-mobile.png', fullPage: false });
  console.log('errors:', errs);
  await b.close();
})();
