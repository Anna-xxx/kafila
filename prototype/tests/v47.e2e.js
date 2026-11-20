const { chromium } = require('playwright');
const U = 'http://localhost:8765/';
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); let fails = 0; const ok = (n, c) => { console.log((c ? 'ok ' : 'FAIL ') + n); if (!c) fails++; };
  const fresh = async (q) => { await p.goto(U + (q || '') + '#/patient'); await p.evaluate(() => localStorage.clear()); await p.goto(U + (q || '') + '#/patient'); await p.waitForTimeout(700); };
  await fresh(); await p.evaluate(() => Patient.tourGo('C-1042', { tab: 'result' })); await p.waitForTimeout(400);
  let st = await p.locator('.steps').innerText();
  ok('no underlined words', await p.locator('.steps .gloss-w, .steps .book-w').count() === 0);
  ok('step 1 plain + Referral by + Book now', /Book a colonoscopy with a gastroenterologist/.test(st) && /Referral by/.test(st) && /Book now →/.test(st));
  ok('two question lines', /Who is a gastroenterologist\? ▾/.test(st) && /What is a colonoscopy\? ▾/.test(st));
  ok('step 3 by deadline', /Colonoscopy by .* at the latest/.test(st));
  await p.screenshot({ path: 'v47-before.png', clip: { x: 0, y: 0, width: 1280, height: 900 } });
  await p.locator('.steps .gl-q', { hasText: 'What is a colonoscopy' }).click(); await p.waitForTimeout(200);
  st = await p.locator('.steps').innerText();
  ok('colonoscopy opens under step 3', /What is a colonoscopy\? ▴/.test(st) && /thin, flexible tube/.test(st) && (await p.locator('.steps li').nth(2).innerText()).includes('thin, flexible tube'));
  await p.locator('.steps .gl-q', { hasText: 'What is a colonoscopy' }).click(); await p.waitForTimeout(200);
  ok('closes', !/thin, flexible tube/.test(await p.locator('.steps').innerText()));
  await p.locator('.steps .gl-q', { hasText: 'gastroenterologist' }).click(); await p.waitForTimeout(200);
  ok('gi opens under step 1', (await p.locator('.steps li').nth(0).innerText()).includes('specialises in the stomach and bowel'));
  await p.locator('.steps .st-a', { hasText: 'Book now' }).click(); await p.waitForTimeout(300);
  ok('Book now opens Book', await p.evaluate(() => Store.byId('C-1042').ptab === 'book'));
  // chips
  let t = await p.locator('.phone').innerText();
  ok('chips single labels', /Evening/.test(t) && /Weekend/.test(t) && !/Evening \/ Saturday/.test(t));
  await p.click('[data-act="filter"][data-arg="evening"]'); await p.waitForTimeout(200);
  let slots = await p.locator('.phone [data-act="pick"]').allInnerTexts();
  ok('evening only 17:00+', slots.length > 0 && slots.every(x => /(1[7-9]|2\d):\d\d/.test(x)));
  await p.click('[data-act="filter"][data-arg="evening"]'); await p.click('[data-act="filter"][data-arg="weekend"]'); await p.waitForTimeout(200);
  slots = await p.locator('.phone [data-act="pick"]').allInnerTexts();
  ok('weekend only Sat/Sun', slots.length > 0 && slots.every(x => /Sat|Sun/.test(x)));
  await p.click('[data-act="filter"][data-arg="weekend"]'); await p.waitForTimeout(200);
  const chipRow = await p.locator('.filt-row').boundingBox(); const phone = await p.locator('.phone').boundingBox();
  ok('chip row inside phone', chipRow.x + chipRow.width <= phone.x + phone.width + 1);
  await p.screenshot({ path: 'v47-chips.png' });
  // book first slot
  await p.locator('.phone [data-act="pick"]').first().click(); await p.waitForTimeout(200);
  await p.locator('.phone [data-act="confirm"]').first().click(); await p.waitForTimeout(400);
  await p.click('[data-act="tab"][data-arg="result"]'); await p.waitForTimeout(300);
  st = await p.locator('.steps').innerText();
  console.log(st.replace(/\n/g, ' | '));
  ok('after booking step 1', /✓\s*\|?\s*Colonoscopy booked: Mon 23 Nov · 09:30, Dr\. Omar Khalil, Khalifa City GI Centre/.test(st.replace(/\n/g, ' | ')) || /Colonoscopy booked: Mon 23 Nov · 09:30, Dr\. Omar Khalil, Khalifa City GI Centre/.test(st));
  ok('waiting + change, no Book', /Waiting for the clinic to confirm/.test(st) && /Change or cancel/.test(st) && !/Book now/.test(st) && !/Referral by/.test(st));
  ok('step 3 on date', /Have the colonoscopy on Mon 23 Nov · 09:30/.test(st) && !/Colonoscopy by/.test(st));
  await p.screenshot({ path: 'v47-after.png' });
  await p.locator('.steps .st-a', { hasText: 'Change or cancel' }).click(); await p.waitForTimeout(300);
  ok('change logs request', await p.evaluate(() => !!Store.byId('C-1042').changeReq));
  // Arabic
  await fresh('?lang=ar'); await p.evaluate(() => Patient.tourGo('C-1042', { tab: 'result' })); await p.waitForTimeout(400);
  st = await p.locator('.steps').innerText();
  ok('AR questions + book', /من هو طبيب الجهاز الهضمي؟/.test(st) && /ما هو تنظير القولون؟/.test(st) && /احجزي الآن/.test(st));
  await p.screenshot({ path: 'v47-ar.png' });
  // colposcopy + gp visit
  for (const [id, re] of [['C-1049', /What is a colposcopy\?|ما هو تنظير عنق الرحم/], ['C-1050', null]]) {
    await fresh(); await p.evaluate((id) => Patient.tourGo(id, { tab: 'result' }), id); await p.waitForTimeout(400);
    st = await p.locator('.steps').innerText().catch(() => '');
    ok(id + ' before: Book now' + (re ? ' + question' : ''), /Book now|احجزي الآن|احجز الآن/.test(st) && (!re || re.test(st)));
    await p.evaluate(() => Patient.tourBook()); await p.evaluate((id) => Patient.tourGo(id, { tab: 'result' }), id); await p.waitForTimeout(400);
    st = await p.locator('.steps').innerText().catch(() => '');
    console.log(id, st.replace(/\n/g, ' | ').slice(0, 260));
    ok(id + ' after: booked + change', /(Colposcopy|Visit) booked: |تم حجز/.test(st) && /Change or cancel|تغيير أو إلغاء/.test(st) && !/Book now|احجز/.test(st));
  }
  console.log('errors', JSON.stringify(errs)); await b.close(); process.exit(fails ? 1 : 0);
})();
