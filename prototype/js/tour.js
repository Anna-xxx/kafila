// Judge's 3-minute tour: a small card on top of the existing page (not a new page). Each step loads the right
// persona and screen. Text in English and Arabic. State is a per-viewer convenience in localStorage.
(function () {
  const KEY = "screenpath-tour";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]);
  let st = { open: true, step: 0, lang: "en", min: false };
  try { st = { ...st, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
  const go = (hash, role) => { if (role) Store.S.data.role = role; Store.save(); if (location.hash === hash) window.dispatchEvent(new HashChangeEvent("hashchange")); else location.hash = hash; };
  const setLang = () => { Store.S.data.lang = st.lang; };

  const STEPS = [
    { en: ["Fatima gets a message from her clinic", "Her stool test (FIT) is positive. Her health centre sends a discreet WhatsApp-style message with a secure link. Tap the notification, then sign in: the demo code is already filled in.", "R3 · suitable channel, the clinic is named, a nurse is one tap away"],
      ar: ["تصل رسالة إلى فاطمة من عيادتها", "نتيجة فحص البراز (FIT) إيجابية. يرسل مركزها الصحي رسالة سرية بأسلوب واتساب مع رابط آمن. اضغط على الإشعار، ثم سجّل الدخول: الرمز التجريبي مُدخل.", "R3 · قناة مناسبة، اسم العيادة ظاهر، الممرضة على بعد ضغطة"],
      btn: [["Show me", "أرني"]], run: [() => { Store.reset(); setLang(); Patient.tourGo("C-1042", { lock: true }); go("#/patient"); }] },
    { en: ["Her result and what happens next", "Plain words, a zone set by the rules table (not by AI), and dated next steps. Try the assistant: ask “Is it cancer?”.", "R3 · clear information, urgency and next steps; understanding is checked"],
      ar: ["نتيجتها وما سيحدث بعد ذلك", "كلمات بسيطة، ومستوى تحدده جداول القواعد (وليس الذكاء الاصطناعي)، وخطوات تالية بتواريخ. جرّب المساعد: اسأل «هل هو سرطان؟».", "R3 · معلومات واضحة عن الأهمية والخطوات التالية، مع التأكد من الفهم"],
      btn: [["Show me", "أرني"]], run: [() => { setLang(); Patient.tourGo("C-1042", { tab: "result" }); go("#/patient"); }] },
    { en: ["Booking that fits her life", "Filters for a female doctor, evening or Saturday, and the nearest site. Each slot shows what her plan covers. Pick a slot and confirm: the referral goes with the booking.", "R3, R4 · barriers removed; referral packet sent with the booking"],
      ar: ["حجز يناسب حياتها", "مرشحات لطبيبة، ومساءً أو يوم السبت، وأقرب موقع. كل موعد يُظهر ما تغطيه خطتها. اختر موعدًا وأكّده: يُرسل التحويل مع الحجز.", "R3، R4 · إزالة العوائق؛ يُرسل ملف التحويل مع الحجز"],
      btn: [["Show me", "أرني"]], run: [() => { setLang(); Patient.tourGo("C-1042", { tab: "book", filters: { female: true } }); go("#/patient"); }] },
    { en: ["The care team: one case, one owner", "Fatima's case: an owner and a deadline for every step, the timeline, the audit log and the referral packet. You are the specialist now: accept the referral.", "R1, R2, R4 · end-to-end view, SLAs, referral acceptance"],
      ar: ["فريق الرعاية: حالة واحدة، مسؤول واحد", "حالة فاطمة: مسؤول وموعد نهائي لكل خطوة، والخط الزمني، وسجل التدقيق، وملف التحويل. أنت الآن الطبيب المختص: اقبل التحويل.", "R1، R2، R4 · رؤية كاملة، مواعيد الخدمة، قبول التحويل"],
      btn: [["Show me", "أرني"]], run: [async () => { setLang(); Patient.tourGo("C-1042", { tab: "book" }); await Patient.tourBook(); go("#/case/C-1042", "specialist"); }] },
    { en: ["Rajesh: a red flag skips the AI", "Rajesh writes “I have chest pain”. A fixed 998 screen appears with no AI call, and an urgent task goes to the on-call clinician. Close it to see his urgent card: a doctor calls today.", "R5 · urgent cases reach qualified staff fast"],
      ar: ["راجيش: علامة خطر تتجاوز الذكاء الاصطناعي", "يكتب راجيش «عندي ألم في الصدر». تظهر شاشة 998 ثابتة دون استدعاء الذكاء الاصطناعي، وتُرسل مهمة عاجلة إلى الطبيب المناوب. أغلقها لترى بطاقته العاجلة: يتصل به طبيب اليوم.", "R5 · الحالات العاجلة تصل بسرعة إلى الكادر المؤهل"],
      btn: [["Show me", "أرني"]], run: [async () => { setLang(); Patient.tourGo("C-1043", { tab: "assistant" }); go("#/patient"); await Patient.send(st.lang === "ar" ? "عندي ألم في الصدر" : "I have chest pain"); }] },
    { en: ["Close with evidence, then measure", "You are the family doctor: record the same-day call, then close the case. The reason comes from the outcome and needs your signature. The dashboard shows the funnel, time to care, treatment started and patient understanding. Negative path: Ahmed never replied, so see the channel ladder and his overdue case.", "R5, R6 · documented closure and impact measures"],
      ar: ["الإغلاق بدليل، ثم القياس", "أنت طبيبة الأسرة: سجّل اتصال اليوم نفسه، ثم أغلق الحالة. يأتي السبب من النتيجة ويحتاج إلى توقيعك. تعرض لوحة المؤشرات مسار الحالات، والوقت حتى الرعاية، وبدء العلاج، وفهم المريض. مسار سلبي: أحمد لم يرد أبدًا، فشاهد سلّم القنوات وحالته المتأخرة.", "R5، R6 · إغلاق موثّق ومقاييس الأثر"],
      btn: [["Open the case", "افتح الحالة"], ["Open dashboard", "افتح لوحة المؤشرات"], ["Ahmed: no reply", "أحمد: لا رد"]], run: [() => go("#/case/C-1043", "gp"), () => go("#/dashboard"), () => go("#/case/C-1045", "coordinator")] }
  ];

  function render() {
    let el = document.getElementById("tour");
    const btn = document.getElementById("tourBtn"); if (btn) btn.setAttribute("aria-pressed", st.open);
    if (!st.open) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement("aside"); el.id = "tour"; el.setAttribute("aria-label", "Judge's tour"); document.body.appendChild(el); }
    const L = st.lang, ar = L === "ar", s = STEPS[st.step], [title, body, req] = s[L];
    el.dir = ar ? "rtl" : "ltr"; el.lang = L; el.className = st.min ? "min" : "";
    el.innerHTML = `<div class="t-head"><b>${ar ? "ابدأ هنا · جولة في 3 دقائق" : "Start here · 3-minute tour"}</b>
        <span class="t-sp"></span>
        <button class="t-lang" data-t="lang" aria-label="${ar ? "English" : "العربية"}">${ar ? "EN" : "عربي"}</button>
        <button class="t-x" data-t="min" aria-label="${st.min ? "Expand" : "Minimise"}">${st.min ? "▴" : "▾"}</button>
        <button class="t-x" data-t="close" aria-label="${ar ? "إغلاق الجولة" : "Close tour"}">×</button></div>
      ${st.min ? `<button class="t-minline" data-t="min">${ar ? "الخطوة" : "Step"} ${st.step + 1}/6 · ${esc(title)}</button>` : `
      <ol class="t-dots">${STEPS.map((x, i) => `<li><button data-t="step" data-i="${i}" class="${i === st.step ? "on" : i < st.step ? "done" : ""}" aria-label="${ar ? "الخطوة" : "Step"} ${i + 1}" aria-current="${i === st.step}">${i + 1}</button></li>`).join("")}</ol>
      <div class="t-body"><b>${st.step + 1}. ${esc(title)}</b><p>${esc(body)}</p><p class="t-req">${esc(req)}</p>
        <div class="t-acts">${s.btn.map((b, i) => `<button class="btn sm ${i === 0 ? "primary" : ""}" data-t="run" data-i="${i}">${esc(b[ar ? 1 : 0])}</button>`).join("")}</div></div>
      <div class="t-nav"><button class="btn sm" data-t="prev" ${st.step === 0 ? "disabled" : ""}>${ar ? "السابق" : "Back"}</button>
        <span class="tiny">${ar ? "بيانات اصطناعية · محاكاة" : "Synthetic data · simulation"}</span>
        <button class="btn sm" data-t="next" ${st.step === STEPS.length - 1 ? "disabled" : ""}>${ar ? "التالي" : "Next"}</button></div>`}`;
    el.querySelectorAll("[data-t]").forEach((b) => (b.onclick = async () => {
      const t = b.dataset.t, i = +b.dataset.i;
      if (t === "close") st.open = false;
      if (t === "min") st.min = !st.min;
      if (t === "lang") { st.lang = ar ? "en" : "ar"; Store.S.data.lang = st.lang; Store.save(); }
      if (t === "step") st.step = i;
      if (t === "prev") st.step = Math.max(0, st.step - 1);
      if (t === "next") st.step = Math.min(STEPS.length - 1, st.step + 1);
      save(); render();
      if (t === "run") { await s.run[i](); if (window.matchMedia("(max-width: 700px)").matches) { st.min = true; save(); render(); } }
    }));
  }
  // Staff screens opened directly start with the tour collapsed, so it doesn't cover the table (BA part B).
  window.Tour = { collapse: () => { st.min = true; }, render, open: () => { st.open = true; st.min = false; if (Store.S.data.version) st.lang = Store.S.data.version; save(); render(); } };
})();
