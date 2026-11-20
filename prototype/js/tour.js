// Judge's 3-minute tour: a small card on top of the existing page (not a new page). Each step loads the right
// persona and screen. Text in English and Arabic. State is a per-viewer convenience in localStorage.
(function () {
  const KEY = "screenpath-tour";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]);
  // One way in (Anna, 20 Nov): the card shows only after "▶ 3-minute tour" or ?tour=1. Open or closed, nothing in between.
  let st = { open: false, step: 0, lang: "en" };
  try { const o = JSON.parse(localStorage.getItem(KEY) || "{}"); if (o.step >= 0 && o.step < 6) st.step = o.step; if (o.lang) st.lang = o.lang; } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ step: st.step, lang: st.lang })); } catch (e) {} };
  const go = (hash, role) => { if (role) Store.S.data.role = role; Store.save(); if (location.hash === hash) window.dispatchEvent(new HashChangeEvent("hashchange")); else location.hash = hash; };
  const setLang = () => { Store.S.data.lang = st.lang; };

  const STEPS = [
    { en: ["Fatima gets a message", "Fatima, 52, had a stool test for bowel cancer. It found blood. Her clinic sends her a short message. Tap the message on her phone and open the link.", "R3 · the right channel, the clinic's name, a nurse one tap away"],
      ar: ["تصل رسالة إلى فاطمة", "فاطمة، 52 عامًا، أجرت فحص براز للكشف عن سرطان الأمعاء، ووجد الفحص دمًا. ترسل لها عيادتها رسالة قصيرة. اضغط على الرسالة في هاتفها وافتح الرابط.", "R3 · القناة المناسبة، اسم العيادة، الممرضة على بعد ضغطة"],
      btn: [["Show me", "أرني"]], run: [() => { Store.reset(); setLang(); Patient.tourGo("C-1042", { lock: true }); go("#/patient"); }] },
    { en: ["She reads her result", "Plain words: what was found, that it is not a diagnosis, and what to do next by which date. Ask the assistant a question, for example “Is it cancer?”.", "R3 · clear result, urgency and next steps"],
      ar: ["تقرأ نتيجتها", "كلمات بسيطة: ماذا وُجد، وأن النتيجة ليست تشخيصًا، وما الخطوة التالية وموعدها. اسأل المساعد سؤالًا، مثلًا «هل هو سرطان؟».", "R3 · نتيجة واضحة، ومدى الأهمية، والخطوات التالية"],
      btn: [["Show me", "أرني"]], run: [() => { setLang(); Patient.tourGo("C-1042", { tab: "result" }); go("#/patient"); }] },
    { en: ["She books a colonoscopy", "She chooses a female doctor and a time that suits her. Each time shows what her insurance pays. Pick a time: the clinic gets her referral with it.", "R3, R4 · fewer barriers; referral sent with the booking"],
      ar: ["تحجز تنظير القولون", "تختار طبيبة ووقتًا يناسبها. يُظهر كل موعد ما يدفعه تأمينها. اختر موعدًا: يصل تحويلها إلى العيادة مع الحجز.", "R3، R4 · عوائق أقل؛ يُرسل التحويل مع الحجز"],
      btn: [["Show me", "أرني"]], run: [() => { setLang(); Patient.tourGo("C-1042", { tab: "book", filters: { female: true } }); go("#/patient"); }] },
    { en: ["The clinic sees her case", "This is the care team's screen. One page shows who is responsible for each step and by when. Dr. Omar, the specialist, accepts her referral here.", "R1, R2, R4 · one view of the case, deadlines, referral accepted"],
      ar: ["العيادة ترى حالتها", "هذه شاشة فريق الرعاية. صفحة واحدة تُظهر من المسؤول عن كل خطوة وموعدها. يقبل د. عمر، الطبيب المختص، تحويلها هنا.", "R1، R2، R4 · رؤية واحدة للحالة، المواعيد النهائية، قبول التحويل"],
      btn: [["Show me", "أرني"]], run: [async () => { setLang(); Patient.tourGo("C-1042", { tab: "book" }); await Patient.tourBook(); go("#/case/C-1042", "specialist"); }] },
    { en: ["Rajesh needs help now", "Another patient, Rajesh, writes “I have chest pain”. Kafila does not ask the AI: it shows “Call 998” at once and alerts a doctor. Press “I am safe now” to continue.", "R5 · urgent cases reach staff fast"],
      ar: ["راجيش يحتاج إلى مساعدة الآن", "مريض آخر، راجيش، يكتب «عندي ألم في الصدر». لا تسأل قافلة الذكاء الاصطناعي: تُظهر «اتصل بالرقم 998» فورًا وتنبّه طبيبًا. اضغط «أنا بأمان الآن» للمتابعة.", "R5 · الحالات العاجلة تصل بسرعة إلى الكادر الطبي"],
      btn: [["Show me", "أرني"]], run: [async () => { setLang(); Patient.tourGo("C-1043", { tab: "assistant" }); go("#/patient"); await Patient.send(st.lang === "ar" ? "عندي ألم في الصدر" : "I have chest pain"); }] },
    { en: ["The doctor closes the case", "Dr. Hessa, the family doctor, records the outcome of her call and Rajesh's plan (follow-up visit booked), then closes the urgent step with that reason. Then open the dashboard to see how many patients reached care. Ahmed has not answered any message: see who follows up.", "R5, R6 · case closed with a reason; results measured"],
      ar: ["الطبيبة تغلق الحالة", "تسجّل د. حصة، طبيبة الأسرة، نتيجة اتصالها وخطة راجيش (موعد متابعة محجوز)، ثم تغلق الخطوة العاجلة مع ذكر السبب. ثم افتح لوحة المؤشرات لترى كم مريضًا وصل إلى الرعاية. أحمد لم يرد على أي رسالة: شاهد من يتابع حالته.", "R5، R6 · إغلاق الحالة مع السبب؛ قياس النتائج"],
      btn: [["Rajesh's case", "حالة راجيش"], ["Dashboard", "لوحة المؤشرات"], ["Ahmed's case", "حالة أحمد"]], run: [() => go("#/case/C-1043", "gp"), () => go("#/dashboard"), () => go("#/case/C-1045", "coordinator")] }
  ];

  // Each step shows its own screen as soon as it becomes active (BA, 20 Nov: Next moved only the card, not the screen).
  async function show() { const s = STEPS[st.step]; if (s.btn.length !== 1) return; const en = document.getElementById("entry"); if (en) en.remove(); await s.run[0](); }
  function render() {
    let el = document.getElementById("tour");
    const btn = document.getElementById("tourBtn");
    if (btn) { btn.setAttribute("aria-pressed", st.open); btn.textContent = st.open ? "■ Close tour" : "▶ 3-minute tour"; btn.title = st.open ? "Close the tour" : "Open the 3-minute tour"; }
    if (!st.open) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement("aside"); el.id = "tour"; el.setAttribute("aria-label", "Judge's tour"); document.body.appendChild(el); }
    const L = st.lang, ar = L === "ar", s = STEPS[st.step], [title, body, req] = s[L];
    el.dir = ar ? "rtl" : "ltr"; el.lang = L; 
    el.innerHTML = `<div class="t-head"><b>${ar ? "ابدأ هنا · جولة في 3 دقائق" : "Start here · 3-minute tour"}</b>
        <span class="t-sp"></span>
        <button class="t-lang" data-t="lang" aria-label="${ar ? "English" : "العربية"}">${ar ? "EN" : "عربي"}</button>
        <button class="t-x" data-t="close" aria-label="${ar ? "إغلاق الجولة" : "Close tour"}">×</button></div>
      <ol class="t-dots">${STEPS.map((x, i) => `<li><button data-t="step" data-i="${i}" class="${i === st.step ? "on" : i < st.step ? "done" : ""}" aria-label="${ar ? "الخطوة" : "Step"} ${i + 1}" aria-current="${i === st.step}">${i + 1}</button></li>`).join("")}</ol>
      <div class="t-body"><b>${st.step + 1}. ${esc(title)}</b><p>${esc(body)}</p><p class="t-req">${esc(req)}</p>
        ${s.btn.length < 2 ? "" : `<div class="t-acts">${s.btn.map((b, i) => `<button class="btn sm ${i === 0 ? "primary" : ""}" data-t="run" data-i="${i}">${esc(b[ar ? 1 : 0])}</button>`).join("")}</div>`}</div>
      <div class="t-nav"><button class="btn sm" data-t="prev" ${st.step === 0 ? "disabled" : ""}>${ar ? "السابق" : "Back"}</button>
        <span class="tiny">${ar ? "بيانات اصطناعية · محاكاة" : "Synthetic data · simulation"}</span>
        <button class="btn sm" data-t="next" ${st.step === STEPS.length - 1 ? "disabled" : ""}>${ar ? "التالي" : "Next"}</button></div>`;
    el.querySelectorAll("[data-t]").forEach((b) => (b.onclick = async () => {
      const t = b.dataset.t, i = +b.dataset.i;
      if (t === "close") st.open = false;
      if (t === "lang") { st.lang = ar ? "en" : "ar"; Store.S.data.lang = st.lang; Store.save(); }
      if (t === "step") st.step = i;
      if (t === "prev") st.step = Math.max(0, st.step - 1);
      if (t === "next") st.step = Math.min(STEPS.length - 1, st.step + 1);
      save(); render();
      if (["step", "prev", "next"].includes(t)) await show();
      if (t === "run") { const en = document.getElementById("entry"); if (en) en.remove(); try { localStorage.setItem("kafila-entry", "1"); } catch (e) {} await s.run[i](); }
    }));
  }
  const open = (step) => { st.open = true; if (step != null) st.step = step; if (Store.S.data.version) st.lang = Store.S.data.version; save(); render(); return show(); };
  window.Tour = { render, close: () => { st.open = false; render(); }, start: () => open(0), open: () => open(), toggle: () => (st.open ? (st.open = false, render()) : open()), isOpen: () => st.open };
})();
