// Patient side: a phone mock-up. Lock screen → WhatsApp message from the health centre with a secure link →
// sign-in (OTP + consent) → ScreenPath web app with 4 tabs: Result, Assistant, Book, My case.
// SMS and automated-call simulations sit above everything. Nothing is sent to real numbers.
// Steps are data; zone and deadline come from the rules table, never from AI.
(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]);
  const fill = (s, o) => String(s).replace(/\{(\w+)\}/g, (_, k) => (o[k] ?? ""));
  const L = () => I18N[Store.S.data.lang] || I18N.en;
  const fmtDate = (ms, lang) => new Date(ms).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Dubai" });
  const fmtTime = (ms) => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" });
  const GP = "GP · Dr. Hessa M.";
  // Insurance plans are neutral demo labels, not real programme names.
  const INS_AR = { "Government plan (demo)": "الخطة الحكومية (تجريبي)", Basic: "الخطة الأساسية", Enhanced: "الخطة المحسّنة" };
  const insName = (c, lang) => (lang === "ar" ? INS_AR[c.insurance] : null) || c.insurance;
  const CLINIC_LINE = "02 000 0000 (demo)", CLINIC_LINE_AR = "02 000 0000 (تجريبي)";
  // Same-day doctor call (urgent BP): by notification time + 4 h, rounded up to the hour, inside clinic cover (to 20:00).
  // Out of hours: tomorrow morning before 10:00 plus the on-call line (medical review 17 Nov).
  function callBy(c) {
    const h = c.history.find((x) => x.state === "notified"), base = h ? Date.parse(h.at) : Store.now();
    const hr = (new Date(base).getUTCHours() + 4) % 24;
    if (hr >= 16) return { late: true, ms: null, base };
    // Before 06:00 GST: same day, before 10:00 (medic M1).
    if (hr < 6) { const d = new Date(base + 4 * 3600000); return { late: false, early: true, ms: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 6), base }; }
    return { late: false, ms: Math.ceil((base + 4 * 3600000) / 3600000) * 3600000, base };
  }
  const callByText = (c, lang) => { const b = callBy(c); return b.late ? (lang === "ar" ? "صباح الغد قبل الساعة 10:00" : "tomorrow morning, before 10:00") : (lang === "ar" ? "اليوم، قبل الساعة " : "today, before ") + fmtTime(b.ms); };
  // Call windows = blocks inside the rule deadline that are free on the doctors' duty roster (data/roster.json).
  function callWindows(c) {
    const b = callBy(c); if (b.late) return [];
    return Store.callBlocks(Math.max(b.base, Store.now()), b.ms, /^GP/.test(c.owner || "") ? c.owner : null, c.id).slice(0, 3);
  }
  const winTime = (w, lang) => lang === "ar" ? `بين ${fmtTime(w.start)} و${fmtTime(w.end)}` : `between ${fmtTime(w.start)} and ${fmtTime(w.end)}`;
  const winLabel = (w, lang) => `${fmtTime(w.start)}–${fmtTime(w.end)} · ${w.short[lang === "ar" ? "ar" : "en"]}`;

  // Next steps per guideline next-step key (data, not AI). Arabic texts are a machine draft for a medical translator.
  const NEXT = {
    colonoscopy: null, // uses I18N steps
    remeasure_then_doctor_today: {
      en: ["A doctor from your health centre will call you from 02 000 0000", "Sit quietly and rest, and avoid heavy work until the doctor calls. Keep your phone with you and the sound on",
        "If you have a blood pressure monitor, measure again after 5 minutes of rest. No monitor? That's fine, you don't need to find one",
        "Even if the new reading is lower, keep the doctor's call. The doctor needs both numbers",
        "Do not take extra doses of your medicine, or anyone else's, unless a doctor tells you to"],
      ar: ["سيتصل بك طبيب من مركزك الصحي من الرقم 02 000 0000", "اجلس بهدوء واسترح، وتجنّب الأعمال المجهِدة حتى يتصل الطبيب. أبقِ هاتفك معك والصوت مفتوحًا",
        "إذا كان لديك جهاز لقياس الضغط، قِس مرة أخرى بعد 5 دقائق من الراحة. لا يوجد جهاز؟ لا بأس، لا داعي للبحث عن جهاز",
        "حتى لو كانت القراءة الجديدة أقل، انتظر اتصال الطبيب. يحتاج الطبيب إلى الرقمين",
        "لا تأخذ جرعات إضافية من دوائك، ولا دواء شخص آخر، إلا إذا طلب منك الطبيب ذلك"]
    },
    colposcopy: {
      // Medic draft 18 Nov (patient-content-hpv-hba1c.md), pending Anna's review.
      en: ["Book a colposcopy (a closer look at the cervix) with a gynaecologist. You can choose a female doctor", "Your family doctor sends the referral with your booking", "Have the colposcopy (about 15 minutes, similar to a smear test)", "The gynaecologist explains the result and the next steps (about 2 weeks later, if a sample was taken)"],
      ar: ["احجزي تنظير عنق الرحم (Colposcopy) مع طبيبة نسائية. يمكنكِ اختيار طبيبة", "ترسل طبيبة الأسرة التحويل مع حجزكِ", "إجراء الفحص (حوالي 15 دقيقة، يشبه مسحة عنق الرحم)", "تشرح لكِ الطبيبة النتيجة والخطوات التالية (بعد حوالي أسبوعين إذا أُخذت عيّنة)"]
    },
    gp_confirm: {
      en: ["See your family doctor for a second test", "The doctor confirms what the result means", "Agree a plan together"],
      ar: ["راجع طبيب الأسرة لإجراء فحص ثانٍ", "يؤكد الطبيب ما تعنيه النتيجة", "اتفقا معًا على خطة"]
    }
  };
  // Result meaning and "compared with" per result (medic draft 18 Nov, pending Anna's review). Every number says what it is compared with.
  const MEANING = {
    "HPV:positive_16_18": {
      en: "Your cervical screening test found HPV type 16 or 18. HPV is a very common virus, and most infections go away on their own. Types 16 and 18 are the ones most likely to cause cell changes over many years, so the next step is a closer look at the cervix. This result is not a diagnosis of cancer.",
      ar: "وجد فحص عنق الرحم فيروس الورم الحليمي (HPV) من النوع 16 أو 18. هذا الفيروس شائع جدًا، ومعظم الإصابات تزول من تلقاء نفسها. النوعان 16 و18 هما الأكثر احتمالًا لإحداث تغيّرات في الخلايا على مدى سنوات طويلة، لذلك الخطوة التالية هي نظرة أقرب إلى عنق الرحم. هذه النتيجة ليست تشخيصًا للسرطان.",
      c: { en: "Compared with: a negative HPV test, where no high-risk HPV is found and the next screening is in 5 years.", ar: "مقارنة بـ: فحص HPV سلبي، لا يوجد فيه فيروس عالي الخطورة، ويكون الفحص التالي بعد 5 سنوات." } },
    "HBA1C:diabetes_range": {
      en: "HbA1c shows your average blood sugar over the last 2 to 3 months. Your result is in the range where doctors check for diabetes. One test is not enough to say you have diabetes: your doctor will repeat a test to confirm and then agree a plan with you.",
      ar: "يُظهر فحص HbA1c متوسط السكر في دمك خلال الشهرين أو الثلاثة الماضية. نتيجتك في النطاق الذي يتحقق فيه الأطباء من وجود السكري. فحص واحد لا يكفي للقول إن لديك السكري: سيعيد طبيبك الفحص للتأكد، ثم يتفق معك على خطة.",
      c: { en: "Compared with: below 5.7% is the normal range; 5.7% to 6.4% is prediabetes; 6.5% or more is the diabetes range.", ar: "مقارنة بـ: أقل من 5.7% هو النطاق الطبيعي؛ من 5.7% إلى 6.4% هو ما قبل السكري؛ 6.5% أو أكثر هو نطاق السكري." } }
  };
  // Teach-back per pathway: option 0 is the right answer. Never blocks booking.
  const TEACH = {
    colonoscopy: null, // uses I18N teach texts
    colposcopy: {
      en: { q: "One quick check so nothing is missed: what is the next step?", o: ["A colposcopy with a gynaecologist", "Repeat the HPV test in 5 years", "Nothing for now"], ok: "Exactly. A colposcopy looks closely at the cervix.", fix: "Not quite. The next step is a colposcopy with a gynaecologist." },
      ar: { q: "سؤال سريع حتى لا يفوتنا شيء: ما هي الخطوة التالية؟", o: ["تنظير عنق الرحم مع طبيبة نسائية", "إعادة فحص HPV بعد 5 سنوات", "لا شيء الآن"], ok: "بالضبط. تنظير عنق الرحم ينظر عن قرب إلى عنق الرحم.", fix: "ليس تمامًا. الخطوة التالية هي تنظير عنق الرحم مع طبيبة نسائية." }
    },
    remeasure_then_doctor_today: null // no quiz on the urgent card (medic M2): the doctor's call is the check
  };
  // Synthetic slots per pathway. Urgent BP and "see your GP" results get no online booking.
  const SLOTS = {
    colonoscopy: {
      title: { en: "Colonoscopy slot", ar: "موعد تنظير القولون" }, sub: { en: "The clinic confirms the slot and checks your medicines first.", ar: "يؤكد المركز الموعد ويراجع أدويتكِ أولًا." }, why: "auto-referral for FIT+",
      list: [
        { id: "s1", doc: "Dr. Amna Al Mansoori", f: true, clinic: "Khalifa City GI Centre", km: 4, day: "2026-11-21", time: "10:00", wkd: true, pay: { "Government plan (demo)": 0, Basic: 150, Enhanced: 50 } },
        { id: "s2", doc: "Dr. Omar Khalil", f: false, clinic: "Khalifa City GI Centre", km: 4, day: "2026-11-19", time: "09:30", wkd: false, pay: { "Government plan (demo)": 0, Basic: 150, Enhanced: 50 } },
        { id: "s3", doc: "Dr. Leena Haddad", f: true, clinic: "Mussafah Day Clinic (demo)", km: 11, day: "2026-11-24", time: "18:30", wkd: true, pay: { "Government plan (demo)": 0, Basic: 100, Enhanced: 30 } },
        { id: "s4", doc: "Dr. Rami Saleh", f: false, clinic: "Al Reem GI Centre", km: 19, day: "2026-11-23", time: "19:00", wkd: true, pay: { "Government plan (demo)": 0, Basic: 200, Enhanced: 80 } },
        { id: "s5", doc: "Dr. Sara Nabil", f: true, clinic: "Al Reem GI Centre", km: 19, day: "2026-11-26", time: "11:00", wkd: false, pay: { "Government plan (demo)": 0, Basic: 200, Enhanced: 80 } }
      ]
    },
    colposcopy: {
      title: { en: "Gynaecology (colposcopy) slots in your network", ar: "مواعيد أمراض النساء (تنظير عنق الرحم) في شبكتك" }, why: "auto-referral for HPV 16/18",
      list: [
        { id: "g1", doc: "Dr. Rana Taha", f: true, clinic: "Gynae Clinic · Khalifa City", km: 3, day: "2026-11-20", time: "11:30", wkd: false, pay: { "Government plan (demo)": 0, Basic: 120, Enhanced: 40 } },
        { id: "g2", doc: "Dr. Mariam Saeed", f: true, clinic: "Bayside Women's Clinic (demo)", km: 15, day: "2026-11-22", time: "18:00", wkd: true, pay: { "Government plan (demo)": 0, Basic: 150, Enhanced: 50 } },
        { id: "g3", doc: "Dr. Huda Karim", f: true, clinic: "Mussafah Women's Health", km: 11, day: "2026-11-25", time: "09:00", wkd: false, pay: { "Government plan (demo)": 0, Basic: 100, Enhanced: 30 } }
      ]
    }
  };
  // gp_confirm: a family doctor visit with the repeat test (not a referral). Synthetic.
  SLOTS.gp_confirm = {
    title: { en: "Family doctor visit and repeat test", ar: "زيارة طبيب الأسرة وإعادة الفحص" }, why: "GP visit for a second HbA1c", gpVisit: true,
    list: [
      { id: "p1", doc: "Dr. Hessa M.", f: true, clinic: "Khalifa City Family Health Centre", km: 2, day: "2026-11-19", time: "16:30", wkd: false, pay: { "Government plan (demo)": 0, Basic: 50, Enhanced: 20 } },
      { id: "p2", doc: "Dr. Faisal R.", f: false, clinic: "Khalifa City Family Health Centre", km: 2, day: "2026-11-21", time: "10:00", wkd: true, pay: { "Government plan (demo)": 0, Basic: 50, Enhanced: 20 } },
      { id: "p3", doc: "Dr. Faisal R.", f: false, clinic: "Mussafah Family Health Centre", km: 7, day: "2026-11-23", time: "19:00", wkd: true, pay: { "Government plan (demo)": 0, Basic: 50, Enhanced: 20 } }
    ]
  };
  const TRY = {
    colonoscopy: { en: ["Is it cancer?", "Can I just repeat the test?", "What happens in a colonoscopy?", "Is it covered?"], ar: ["هل هو سرطان؟", "هل يمكنني إعادة الاختبار؟", "ماذا يحدث في تنظير القولون؟", "هل يغطيه التأمين؟"] },
    colposcopy: { en: ["Can I see a female doctor?", "Is it covered?", "Can I just wait?"], ar: ["هل يمكنني رؤية طبيبة؟", "هل يغطيه التأمين؟", "هل يمكنني الانتظار؟"] },
    remeasure_then_doctor_today: { en: ["When will the doctor call?", "Should I take a pill?", "Is it covered?"], ar: ["متى سيتصل الطبيب؟", "هل آخذ حبة دواء؟", "هل يغطيه التأمين؟"] },
    safety: { en: ["I'm scared", "I'm bleeding a lot", "chest pain"], ar: ["أنا خائفة", "ألم في الصدر"] }
  };
  // Material-style icons (inline SVG) so the phone has no emoji.
  const P = {
    video: "M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z",
    emoji: "M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z",
    clip: "M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z",
    more: "M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z",
    phone: "M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z",
    camera: "M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM9 2 7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z",
    chat: "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z",
    sms: "M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z",
    doc: "M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z",
    cal: "M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM7 12h5v5H7z",
    pin: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z",
    mic: "M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z",
    send: "M2.01 21 23 12 2.01 3 2 10l15 2-15 2z",
    back: "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z",
    lock: "M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM9 8V6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9z",
    person: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
    end: "M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 0 1-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28a11.27 11.27 0 0 0-2.67-1.85.996.996 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z",
    cross: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 11h-4v4h-4v-4H6v-4h4V6h4v4h4v4z",
    clock: "M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z",
    image: "M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z",
    folder: "M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z",
    gear: "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z",
    calc: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM6.25 7.72h5v1.5h-5v-1.5zM11.5 16h-2v2H8v-2H6v-1.5h2v-2h1.5v2h2V16zm6.5 1.25h-5v-1.5h5v1.5zm0-2.5h-5v-1.5h5v1.5zm-.03-6.69-1.41 1.41 1.41 1.41-1.06 1.06-1.41-1.4-1.41 1.41-1.06-1.06 1.41-1.41-1.41-1.42L14.09 6l1.41 1.41L16.91 6z",
    fp: "M17.81 4.47c-.08 0-.16-.02-.23-.06C15.66 3.42 14 3 12.01 3c-1.98 0-3.86.47-5.57 1.41-.24.13-.54.04-.68-.2a.506.506 0 0 1 .2-.68C7.82 2.52 9.86 2 12.01 2c2.13 0 3.99.47 6.03 1.52.25.13.34.43.21.67a.49.49 0 0 1-.44.28zM3.5 9.72a.499.499 0 0 1-.41-.79c.99-1.4 2.25-2.5 3.75-3.27C9.98 4.04 14 4.03 17.15 5.65c1.5.77 2.76 1.86 3.75 3.25a.5.5 0 0 1-.12.7c-.23.16-.54.11-.7-.12a9.388 9.388 0 0 0-3.39-2.94c-2.87-1.47-6.54-1.47-9.4.01-1.36.7-2.5 1.7-3.4 2.96-.08.14-.23.21-.39.21zm6.25 12.07a.47.47 0 0 1-.35-.15c-.87-.87-1.34-1.43-2.01-2.64-.69-1.23-1.05-2.73-1.05-4.34 0-2.97 2.54-5.39 5.66-5.39s5.66 2.42 5.66 5.39c0 .28-.22.5-.5.5s-.5-.22-.5-.5c0-2.42-2.09-4.39-4.66-4.39-2.57 0-4.66 1.97-4.66 4.39 0 1.44.32 2.77.93 3.85.64 1.15 1.08 1.64 1.85 2.42.19.2.19.51 0 .71-.11.1-.24.15-.37.15z"
  };
  const ic = (n, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${P[n]}"/></svg>`;
  // Demo patients. To add a story: one line here; `preset` (optional) prepares the case when it is picked.
  const PERSONAS = [
    { key: "C-1042", id: "C-1042", label: "Fatima · positive stool test (FIT)", cap: "Fatima, 52 · positive stool test (FIT)" },
    { key: "C-1043", id: "C-1043", label: "Rajesh · blood pressure 185/115 (urgent)", cap: "Rajesh, 45 · blood pressure 185/115 · a doctor must call today" },
    { key: "C-1045", id: "C-1045", label: "Ahmed · positive FIT, no reply yet", cap: "Ahmed, 61 · positive FIT · no reply for 6 days (channel ladder)" },
    { key: "C-1049", id: "C-1049", label: "Mariam · HPV positive", cap: "Mariam, 38 · HPV 16/18 positive" },
    { key: "C-1050", id: "C-1050", label: "Salem · HbA1c 7.2%", cap: "Salem, 55 · HbA1c 7.2% · family doctor visit" },
    { key: "C-1042:returned", id: "C-1042", label: "Fatima · referral sent back by the clinic", cap: "Fatima, 52 · the clinic sent her referral back", preset: async () => {
      const c = Store.byId("C-1042");
      if (!c.rejected) {
        tourGo("C-1042", { tab: "book" }); await tourBook();
        Team.rejectReferral(c, (c.slot ? c.slot.clinic : "Khalifa City GI Centre") + " · triage: Dr. Omar K.", "Outside catchment area");
      }
      c.pscreen = "app"; tab(c, "mycase");
    } }
  ];

  const chat = (c) => (Store.S.data.chats[c.id] = Store.S.data.chats[c.id] || []);
  const ui = () => (Store.S.data.ui = Store.S.data.ui || {});
  function push(c, m) { m.at = Store.now() + Math.min(59, chat(c).length + 1) * 60000; chat(c).push(m); }
  function clearQr(c) { const ch = chat(c); for (let i = ch.length - 1; i >= 0; i--) if (ch[i].t === "qr" || ch[i].t === "multi") ch.splice(i, 1); }
  const persona = () => Store.byId(Store.S.data.persona);
  const langOf = (c) => (Store.S.data.lang === "ar" && (c.lang === "ar" || Store.S.data.version === "ar") ? "ar" : "en");
  const pathway = (c) => c.result.next;
  const slotsFor = (c) => (c.result.level === "L3" || c.result.level === "L4" ? null : SLOTS[pathway(c)] || null);
  const NAMES_AR = { Mariam: "مريم", Salem: "سالم", Fatima: "فاطمة", Rajesh: "راجيش", Ahmed: "أحمد", Maria: "ماريا", Sara: "سارة", Khalid: "خالد", Priya: "بريا" };
  const first = (c) => { const n = c.name.split(" ")[0]; return langOf(c) === "ar" ? NAMES_AR[n] || n : n; };
  // Sender = the patient's own clinic; doctor = the case's GP, or for urgent calls the duty doctor from the roster (Anna 18 Nov).
  const isUrgent = (c) => c.result.level === "L3" || c.result.level === "L4";
  const clinicOf = (c, lang) => nm(c.clinic || "Khalifa City Family Health Centre", lang);
  const CLINIC_PHONE = "02 000 0000";
  function doctorOf(c, lang) {
    if (isUrgent(c)) {
      const doc = (c.callSlot && c.callSlot.doc) || ((callWindows(c)[0] || {}).doc) || (/^GP/.test(c.owner || "") ? c.owner : null);
      const r = doc && Store.S.R && Store.S.R.doctors[doc];
      if (r) return r.short[lang === "ar" ? "ar" : "en"];
    }
    if (c.gp) return nm(c.gp, lang);
    return lang === "ar" ? "طبيبك" : "your doctor";
  }
  // Arabic display names (machine draft, translator checks them).
  const AR_NAME = { "Dr. Amna Al Mansoori": "د. آمنة المنصوري", "Dr. Hessa M.": "د. حصة م.", "Dr. Huda Karim": "د. هدى كريم", "Dr. Huda F.": "د. هدى ف.",
    "Dr. Khalid S.": "د. خالد س.", "Dr. Leena Haddad": "د. لينا حداد", "Dr. Leena H.": "د. لينا ح.", "Dr. Mariam Saeed": "د. مريم سعيد", "Dr. Omar Khalil": "د. عمر خليل",
    "Dr. Omar K.": "د. عمر ك.", "Dr. Rami Saleh": "د. رامي صالح", "Dr. Rana Taha": "د. رنا طه", "Dr. Rana T.": "د. رنا ط.", "Dr. Sara Nabil": "د. سارة نبيل",
    "Dr. Faisal R.": "د. فيصل ر.", "Nurse Layla": "الممرضة ليلى", "Khalifa City Family Health Centre": "مركز مدينة خليفة لصحة الأسرة", "Al Ain Family Health Centre": "مركز العين لصحة الأسرة", "Dr. Yousef T.": "د. يوسف ت.",
    "Family Health Centre": "مركز صحة الأسرة", "Khalifa City GI Centre": "مركز مدينة خليفة لأمراض الجهاز الهضمي", "Al Reem GI Centre": "مركز الريم لأمراض الجهاز الهضمي",
    "GI Clinic": "عيادة الجهاز الهضمي", "Gynae Clinic": "عيادة أمراض النساء", "Mussafah Day Clinic (demo)": "عيادة مصفح النهارية", "Coordinator": "المنسقة", "Noura A.": "نورة أ.",
    "GP": "طبيبة الأسرة", "Gynae Clinic · Khalifa City": "عيادة أمراض النساء · مدينة خليفة", "Bayside Women's Clinic (demo)": "عيادة بيسايد للنساء", "Mussafah Women's Health": "صحة المرأة في مصفح", "Patient": "أنت" };
  const nm = (s, lang) => lang !== "ar" ? s : String(s || "").split(" · ").map((x) => AR_NAME[x.trim()] || x).join(" · ");
  const docLine = (s, lang) => `<bdi>${esc(nm(s.doc, lang))}</bdi>${lang === "ar" ? (s.f ? " · طبيبة" : " · طبيب") : s.f ? " (female doctor)" : ""}`;
  // Arabic texts are written to a woman by default; for a man, switch the common verb forms (machine draft).
  const MASC = [["افتحي", "افتح"], ["احجزي", "احجز"], ["اختاري", "اختر"], ["اسألي", "اسأل"], ["اضغطي", "اضغط"], ["ابدئي", "ابدأ"], ["رتّبي", "رتّب"], ["أحضري", "أحضر"],
    ["اتبعي", "اتبع"], ["اذهبي", "اذهب"], ["انتظري", "انتظر"], ["اقرئي", "اقرأ"], ["تحدثي", "تحدث"], ["توافقين", "توافق"], ["أرسلي", "أرسل"], ["تدفعينه", "تدفعه"],
    ["فهمتِ", "فهمت"], ["قلقة", "قلق"], ["خائفة", "خائف"], ["تحتاجين", "تحتاج"], ["اكتبي", "اكتب"], ["شعرتِ", "شعرت"], ["افتحيها", "افتحها"], ["اتّبعي", "اتّبع"], ["تناولي", "تناول"], ["تأكدي", "تأكد"],
    ["أخبريها", "أخبرها"], ["كنتِ", "كنت"], ["تتناولين", "تتناول"], ["توقفي", "توقف"], ["تغيّريه", "تغيّره"], ["ستحصلين", "ستحصل"], ["تقودي", "تقُد"], ["تحدّثي", "تحدّث"], ["تشعرين", "تشعر"], ["تريدين", "تريد"], ["كِ", "ك"]];
  const gx = (html, c, lang) => lang === "ar" && c.sex === "male" ? MASC.reduce((h, [f, m]) => h.split(f).join(m), html) : html;
  // Patient sees one plain sentence. Exact guideline names stay on the staff case page and the How it works page.
  const PLAIN_SRC_ONE = { en: "Based on your clinic's screening rules, which follow international medical guidelines.", ar: "بناءً على قواعد الفحص في عيادتك، وهي تتبع الإرشادات الطبية الدولية." };
  const PLAIN_SRC = { FIT: PLAIN_SRC_ONE, BP: PLAIN_SRC_ONE, HPV: PLAIN_SRC_ONE, HBA1C: PLAIN_SRC_ONE };
  const zoneIcon = { green: "✓", yellow: "◷", red: "!" }; // same icons as the zone chips
  const OPEN = ["issued", "assigned", "notified"];

  // Which phone screen the patient is on. The lock screen is a screen, not an overlay, so SMS/call overlays always show above it.
  function screen(c) {
    if (!c.pscreen) c.pscreen = chat(c).length ? "app" : "lock";
    return c.pscreen;
  }
  function tab(c, name) { c.ptab = name; }

  function signIn(c, how) {
    const T = L();
    c.pscreen = "app"; tab(c, "result");
    c.consent = { at: new Date(Store.now()).toISOString(), how };
    Store.log(c.id, "Patient", `Consent given. Identity confirmed (${how}). Result shown in app.`, "info");
    push(c, { t: "sys", key: "aiNote" });
    push(c, { t: "in", text: fill(T.idOk, { name: first(c) }), tag: "prepared" });
    push(c, { t: "qr", opts: [["tab", T === I18N.ar ? "اعرض النتيجة" : "See result", "result"]] }); // BA F14
    if (c.result.level === "L3" && c.track !== "urgent") {
      c.track = "urgent";
      Store.log(c.id, "Rules engine", "Urgent track: clinician call today. Task created for " + GP + ".", "urgent");
    }
  }

  async function act(a, arg) {
    const c = persona(), T = L(), t = T.app, lang = langOf(c), u = ui();
    if (a === "lock") {
      c.pscreen = "wa";
      if (!c.waRead) {
        c.waRead = true;
        Store.log(c.id, "System", "WhatsApp message delivered ✓✓ and read (simulated)", "channel");
        c.attempts = (c.attempts || []).concat([{ day: Store.S.data.clockDays, channel: "WhatsApp", ok: true }]);
        if (c.state === "assigned") Store.move(c, "notified", "Agent (WhatsApp)");
      }
    }
    if (a === "openapp") {
      // The link opens our web app in the phone's browser: show the browser loading screenpath.demo.
      c.pscreen = "loading"; Store.save();
      setTimeout(() => { if (c.pscreen === "loading") { c.pscreen = "signin"; Store.save(); } }, 1100);
      return;
    }
    if (a === "ics" && c.slot) {
      const st = new Date(Date.parse(c.slot.day + "T" + c.slot.time + ":00+04:00")), en = new Date(+st + 3600000), f = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
      const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Kafila demo//EN", "BEGIN:VEVENT", "UID:" + c.id + "@kafila.demo", "DTSTAMP:" + f(new Date()), "DTSTART:" + f(st), "DTEND:" + f(en), "SUMMARY:Appointment · " + c.slot.clinic, "LOCATION:" + c.slot.clinic, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
      const el = document.createElement("a"); el.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" })); el.download = "appointment.ics"; el.click();
      Store.log(c.id, "Patient", "Added appointment to phone calendar", "info"); return;
    }
    if (a === "change") { if (!c.callback || c.humanDone) { c.callback = new Date(Store.now()).toISOString(); c.humanDone = false; } Store.log(c.id, "Patient", "Asked to change or cancel the appointment. Task for coordinator, SLA 1 working day.", "human"); toast(lang === "ar" ? "طلبك أُرسل. ستتصل بك المنسقة." : "Request sent. The coordinator will call you."); }
    if (a === "waCallNow" && !c.waReply) {
      c.waReply = "callnow"; c.callNow = true; c.callback = new Date(Store.now()).toISOString(); c.humanDone = false;
      Store.log(c.id, "Patient", `Tapped "Call me now" in WhatsApp. Call-back task for the duty doctor (${doctorOf(c, "en")}), before ${callByText(c, "en").replace(/^today, before /, "")}.`, "urgent");
    }
    if (a === "waCantTalk" && !c.waReply) {
      c.waReply = "canttalk"; c.cantTalk = true; c.callback = new Date(Store.now()).toISOString(); c.humanDone = false;
      Store.log(c.id, "Patient", `Tapped "I can't talk today" in WhatsApp. Case stays urgent; duty doctor (${doctorOf(c, "en")}) told to try again today. 998 line shown.`, "urgent");
    }
    if (a === "waNurse") { if (!c.callback) { c.callback = new Date(Store.now()).toISOString(); Store.log(c.id, "Patient", "Asked for a nurse from the first WhatsApp message. Call-back task, SLA 2 h.", "human"); } }
    if (a === "key") {
      if (arg === 2) { act("callEnd"); if (!c.callback) { c.callback = new Date(Store.now()).toISOString(); } Store.log(c.id, "Patient", "Pressed 2 on the automated call: nurse call-back, SLA 2 h.", "human"); toast(lang === "ar" ? "ستتصل بك ممرضة خلال ساعتين." : "A nurse will call you within 2 hours."); return; }
      if (arg === 1) { Agent.speak(lang === "ar" ? "يرجى إدخال تاريخ ميلادك. بعد ذلك ستسمع أن لديك نتيجة تحتاج زيارة متابعة، وكيف تحجز." : "Please enter your date of birth. Then you will hear that your result needs a follow-up visit, and how to book.", lang); Store.log(c.id, "Patient", "Pressed 1 on the automated call: identity check, then result summary.", "channel"); return; }
    }
    if (a === "home") { u.sheet = null; c.pscreen = "home"; }
    if (a === "phonepref") {
      c.pscreen = "phonepref"; u.consentTick = false;
      if (!c.phonePref) { c.phonePref = true; c.callback = new Date(Store.now()).toISOString(); c.humanDone = false; Store.log(c.id, "Patient", "Did not give consent for the app and asked for a phone call. No result shown. Coordinator call task, SLA 1 working day.", "human"); }
    }
    if (a === "backSignin") c.pscreen = "signin";
    if (a === "seeTask") { Store.S.data.role = "coordinator"; Store.save(); location.hash = "#/case/" + c.id; return; }
    if (a === "undoNotme") {
      // Demo only: undo "This is not me" so the story can go on.
      c.notMe = false; c.stopped = false; c.contactChecked = false; c.pscreen = "signin";
      Store.log(c.id, "Demo", "Demo reset: “This is not me” undone, messages on again.", "info");
    }
    if (a === "notme") {
      c.pscreen = "notme";
      if (!c.notMe) { c.notMe = true; c.stopped = true; Store.log(c.id, "Patient", "Said “This is not me”. Nothing shown, messages stopped. Contact-check task for coordinator, SLA 1 working day.", "urgent"); }
    }
    if (a === "stopmsg") {
      if (!c.stopped) { c.stopped = true; if (!c.callback || c.humanDone) { c.callback = new Date(Store.now()).toISOString(); c.humanDone = false; } Store.log(c.id, "Patient", "Stopped messages. Reminders paused. Coordinator call task to confirm the decision and offer a nurse.", "human"); toast(lang === "ar" ? "أوقفنا الرسائل. ستتصل بك المنسقة مرة واحدة للتأكد." : "Messages stopped. The coordinator will call once to check."); }
    }
    if (a === "launch") { c.pscreen = c.consent ? "app" : "signin"; }
    if (a === "launchChat") { c.pscreen = "wa"; }
    if (a === "consent") u.consentTick = !u.consentTick;
    if (a === "signin" || a === "natid") {
      // The hint shows only after a tap without the tick (BA F13).
      if (!u.consentTick) { u.consentTried = true; toast(lang === "ar" ? "يرجى الموافقة أولًا" : "Please tick “I agree” first"); Store.save(); return; }
      u.consentTick = false; u.consentTried = false;
      signIn(c, a === "natid" ? "national ID, pilot" : "one-time code");
    }
    if (a === "tab") tab(c, arg);
    if (a === "understood") {
      tab(c, "assistant"); clearQr(c); push(c, { t: "me", text: T.understood });
      if (pathway(c) === "remeasure_then_doctor_today") {
        // Urgent: no quiz. Confirm the patient can take the doctor's call today.
        push(c, { t: "in", text: lang === "ar" ? `سيتصل بك طبيب ${callByText(c, lang)}. هل يمكنك الرد؟` : `A doctor will call you ${callByText(c, lang)}. Can you answer?`, tag: "prepared" });
        const opts = [["callok", lang === "ar" ? "نعم، هاتفي معي" : "Yes, my phone is with me"]];
        if (callWindows(c).length) opts.push(["callat", lang === "ar" ? "أنا في العمل: اتصلوا في وقت محدد" : "I'm at work: call me at a set time"]);
        else if (!callBy(c).late && !c.noRoster) {
          // Nobody is free on the roster before the rule deadline: no windows to offer, the clinical lead arranges the call.
          c.noRoster = true; c.owner = "Clinical lead · Dr. Mona S. (duty)"; c.callback = new Date(Store.now()).toISOString(); c.humanDone = false;
          Store.log(c.id, "System", "No doctor free on the duty roster before " + fmtTime(callBy(c).ms) + " (rule deadline). Task for the clinical lead: arrange the call in time.", "urgent");
        }
        opts.push(["callother", lang === "ar" ? "اتصلوا برقم آخر" : "Call another number"]);
        push(c, { t: "qr", opts });
      } else askTeach(c, lang);
    }
    if (a === "callok" || a === "callwin" || a === "callother") {
      clearQr(c);
      const W = callWindows(c), w = a === "callwin" ? W[arg] : null;
      if (a === "callwin" && !w) a = "callok"; // window no longer free: treat as "phone with me"
      const me = a === "callok" ? (lang === "ar" ? "نعم، هاتفي معي" : "Yes, my phone is with me") : a === "callwin" ? winLabel(w, lang) : (lang === "ar" ? "اتصلوا برقم آخر" : "Call another number");
      push(c, { t: "me", text: me });
      const reply = a === "callok" ? (lang === "ar" ? "شكرًا. أبقِ هاتفك قريبًا. إذا شعرت بأنك أسوأ قبل الاتصال، اتصل بالرقم 998." : "Thank you. Keep your phone near you. If you feel worse before the call, call 998.")
        : a === "callwin" ? (lang === "ar" ? `تم. موعد اتصال ${w.short.ar}: اليوم ${winTime(w, lang)}. إذا شعرت بأنك أسوأ قبل ذلك، اتصل بالرقم 998.` : `Done. ${w.short.en} will call you today ${winTime(w, lang)}. If you feel worse before then, call 998.`)
        : (lang === "ar" ? "ستتصل بك المنسقة خلال 15 دقيقة لتأكيد الرقم." : "The coordinator will call you within 15 minutes to confirm the number.");
      push(c, { t: "in", text: reply, tag: "prepared" });
      Store.log(c.id, "Patient", a === "callok" ? "Confirmed available for the doctor's call today." : a === "callwin" ? "Booked the doctor's call: " + w.doc + ", " + fmtTime(w.start) + "–" + fmtTime(w.end) + " today (duty roster, inside the rule deadline " + fmtTime(callBy(c).ms) + ")." : "Asked to be called on another number. Coordinator task, SLA 15 min.", a === "callok" ? "info" : "human");
      if (a === "callwin") Store.bookCall(c, w);
      if (a === "callother") { c.callback = new Date(Store.now()).toISOString(); c.humanDone = false; }
      if (OPEN.includes(c.state)) Store.move(c, "acknowledged", "Patient", "call availability confirmed");
    }
    if (a === "callat") { clearQr(c); push(c, { t: "qr", opts: callWindows(c).map((w, i) => ["callwin", winLabel(w, lang), i]) }); }
    if (a === "teach") {
      const tb = teachFor(c, lang);
      clearQr(c); push(c, { t: "me", text: tb.o[arg] });
      // One reply per wrong option (BA F6). After a wrong answer: offer the nurse and flag a nurse call on the worklist.
      const fix = Array.isArray(tb.fix) ? tb.fix[arg - 1] || tb.fix[0] : tb.fix;
      push(c, { t: "in", text: arg === 0 ? tb.ok : fix, tag: "prepared" });
      c.teachBack = arg === 0 ? "correct" : "corrected";
      if (OPEN.includes(c.state)) Store.move(c, "acknowledged", "Patient", "teach-back " + c.teachBack);
      if (arg !== 0) {
        c.teachFlag = true; if (!c.callback || c.humanDone) { c.callback = new Date(Store.now()).toISOString(); c.humanDone = false; }
        Store.log(c.id, "System", "Teach-back corrected (answered “" + tb.o[arg] + "”). Nurse call task to check understanding, due within 1 working day.", "human");
        push(c, { t: "qr", opts: [["nurse", lang === "ar" ? "التحدث مع الممرضة ليلى" : "Talk to Nurse Layla"], ["teachgo", slotsFor(c) ? (lang === "ar" ? "فهمت، لنحجز" : "I understand, let's book") : (lang === "ar" ? "متابعة" : "Continue")]] });
      } else if (slotsFor(c)) askBarriers(c);
      else push(c, { t: "in", text: t.urgentText, tag: "prepared" });
    }
    if (a === "teachgo") {
      clearQr(c);
      if (slotsFor(c)) askBarriers(c); else push(c, { t: "in", text: t.urgentText, tag: "prepared" });
    }
    if (a === "book") {
      tab(c, "book");
      if (OPEN.includes(c.state)) { c.teachBack = c.teachBack || "skipped"; Store.move(c, "acknowledged", "Patient", "acknowledged, teach-back skipped"); }
    }
    if (a === "bar") {
      const q = chat(c).find((m) => m.t === "multi");
      if (!q) return;
      if (arg === "none") { q.sel = []; return act("barDone"); }
      q.sel = q.sel.includes(arg) ? q.sel.filter((x) => x !== arg) : q.sel.concat(arg);
    }
    if (a === "barDone") {
      const ch = chat(c), i = ch.findIndex((m) => m.t === "multi"); if (i < 0) return;
      const sel = ch[i].sel; ch.splice(i, 1);
      push(c, { t: "me", text: sel.length ? sel.map((k) => T.barriers[k]).join(" · ") : T.barriers.none });
      sel.forEach((k) => push(c, { t: "in", text: fill(T.barrierReply[k], { ins: insName(c, lang) }), tag: "prepared" }));
      c.barriers = sel; u.filters = { female: sel.includes("gender"), weekend: sel.includes("time"), near: sel.includes("transport") };
      Store.log(c.id, "Patient", "Barriers: " + (sel.join(", ") || "none"), "info");
      if (sel.includes("notnow")) {
        if (!c.callback || c.humanDone) { c.callback = new Date(Store.now()).toISOString(); c.humanDone = false; }
        Store.log(c.id, "System", "Patient does not want the test now. Nurse/GP call task to talk it through (informed decision). Nothing booked.", "human");
        push(c, { t: "qr", opts: [["nurse", T.nurse], ["tab", t.tryBook, "book"]] });
      } else push(c, { t: "qr", opts: [...(sel.includes("fear") ? [["fearcall", lang === "ar" ? "نعم، اتصلوا بي" : "Yes, call me"]] : []), ["tab", t.tryBook, "book"]] });
    }
    if (a === "fearcall") {
      // Worried or scared: a real nurse call-back task with an owner and a 1-working-day deadline (BA F7).
      clearQr(c); push(c, { t: "me", text: lang === "ar" ? "نعم، اتصلوا بي" : "Yes, call me" });
      c.fearCall = true; if (!c.callback || c.humanDone) { c.callback = new Date(Store.now()).toISOString(); c.humanDone = false; }
      push(c, { t: "in", text: lang === "ar" ? "ستتصل بك الممرضة ليلى خلال يوم عمل واحد. يمكنك الحجز الآن أو بعد المكالمة." : "Nurse Layla will call you within 1 working day. You can book now or after the call.", tag: "prepared" });
      Store.log(c.id, "Patient", "Asked for a nurse call (worried or scared). Task: Nurse Layla, due within 1 working day.", "human");
      push(c, { t: "qr", opts: [["tab", t.tryBook, "book"]] });
    }
    if (a === "filter") { const f = (u.filters = u.filters || {}); f[arg] = !f[arg]; }
    if (a === "pick") u.sheet = arg;
    if (a === "sheetClose") u.sheet = null;
    if (a === "confirm") {
      const P = slotsFor(c), s = P && P.list.find((x) => x.id === u.sheet);
      if (!s) { u.sheet = null; Store.save(); return; }
      const ms = Date.parse(s.day + "T" + s.time + ":00+04:00");
      c.slot = { ...s, label: fmtDate(ms, lang) + " " + s.time + " · " + s.doc, labelEn: fmtDate(ms, "en") + " " + s.time + " · " + s.doc };
      if (P.gpVisit) {
        // A GP visit with the repeat test is booked directly: no referral, confirmed at once.
        if (OPEN.includes(c.state)) { c.teachBack = c.teachBack || "skipped"; Store.move(c, "acknowledged", "Patient", "acknowledged"); }
        Store.move(c, "confirmation", "Patient", "GP visit and repeat test booked: " + c.slot.labelEn);
        push(c, { t: "in", text: lang === "ar" ? `تم الحجز. سيراك ${s.doc} ويعيد الفحص.` : `Booked. ${s.doc} will see you and repeat the test.`, tag: "prepared" });
        tab(c, "mycase"); u.justBooked = true; u.sheet = u.a2hsSeen || c.installed ? null : "a2hs";
        Store.save(); return;
      }
      c.referralFrom = GP;
      if (OPEN.includes(c.state)) { c.teachBack = c.teachBack || "skipped"; Store.move(c, "acknowledged", "Patient", "acknowledged, teach-back skipped"); }
      if (!["referral", "booked", "attended", "closed"].includes(c.state)) {
        // Auto-referral carries the SBAR packet and the result; the GP gets a notice (BA L5).
        c.referral = { to: s.clinic + " · " + s.doc, note: window.Team ? Team.sbar(c) : "", auto: true };
        Store.move(c, "referral", `${GP} (${P.why})`, "slot held: " + c.slot.labelEn);
        Store.log(c.id, "System", "Referral packet (SBAR + lab result) attached for " + c.referral.to + ". Notice to " + GP + ": auto-referral sent, packet attached.", "state");
      } else if (c.state === "referral" && c.accepted) Store.move(c, "booked", "Patient", "slot picked after acceptance: " + c.slot.labelEn);
      push(c, { t: "in", text: lang === "ar" ? "أرسلت طبيبة الأسرة التحويل. ستؤكد العيادة موعدك قريبًا." : "Your family doctor sent the referral. The clinic will confirm your slot shortly.", tag: "prepared" });
      tab(c, "mycase"); u.justBooked = true;
      u.sheet = u.a2hsSeen || c.installed ? null : "a2hs";
    }
    if (a === "a2hs") { u.a2hsSeen = true; u.sheet = null; c.installed = true; c.pscreen = "home"; Store.log(c.id, "Patient", "Added app to home screen (demo)", "info"); }
    if (a === "a2hsLater") { u.a2hsSeen = true; u.sheet = null; }
    if (a === "nurse") {
      tab(c, "assistant");
      if (!c.human) {
        clearQr(c); push(c, { t: "sys", key: "nurseJoin" }); push(c, { t: "nurse", text: fill(T.nurseMsg, { name: first(c) }) });
        Store.log(c.id, "Patient", "Asked for a nurse → handed to Nurse Layla (human). AI paused; red-topic rules stay on. Nurse task, SLA 2 h.", "human");
        c.human = true; c.humanDone = false; c.humanAt = new Date(Store.now()).toISOString();
      }
    }
    if (a === "callme") {
      if (!c.callback || c.humanDone) { c.callback = new Date(Store.now()).toISOString(); c.humanDone = false; push(c, { t: "sys", key: "callbackOk" }); Store.log(c.id, "Patient", "Call-back requested. Task for nurse, SLA 2 h.", "human"); }
      tab(c, "assistant");
    }
    if (a === "e998") { u.overlay = "emerg"; u.emergText = (Store.S.F.L4.answer || {})[lang] || ""; Store.log(c.id, "Patient", "Tapped the 998 button in the app", "urgent"); }
    if (a === "face") { const q = String(arg)[0], v = +String(arg)[1]; c.feedback = { ...(c.feedback || {}), [q]: v }; Store.log(c.id, "Patient", `Feedback ${q === "a" ? "clear explanation" : "felt guided"}: ${v} of 3`, "info"); }
    if (a === "emergClose") u.overlay = null;
    if (a === "callEnd") { if ("speechSynthesis" in window) speechSynthesis.cancel(); u.overlay = null; }
    if (a === "callAnswer") { u.callAnswered = true; Agent.speak(gx(fill(T.callScript, { name: first(c) }), c, lang), lang); Store.log(c.id, "System", "Automated call answered (simulated). Script read aloud.", "channel");
      const last = (c.attempts || []).filter((x) => x.channel === "Automated call").pop();
      if (last) last.ok = true; else c.attempts = (c.attempts || []).concat([{ day: Store.S.data.clockDays, channel: "Automated call", ok: true }]); }
    if (a === "smsClose") u.overlay = null;
    Store.save();
  }
  function teachFor(c, lang) {
    const T = I18N[lang], p = TEACH[pathway(c)];
    if (p === null && pathway(c) !== "colonoscopy") return null;
    if (p) return p[lang] || p.en;
    return { q: T.teach, o: T.teachOpts, ok: T.teachOk, fix: T.teachFix };
  }
  function askTeach(c, lang) { const tb = teachFor(c, lang); if (!tb) { push(c, { t: "in", text: I18N[lang].urgentText, tag: "prepared" }); return; } push(c, { t: "in", text: tb.q, tag: "prepared" }); push(c, { t: "qr", opts: tb.o.map((o, i) => ["teach", o, i]) }); }
  function askBarriers(c) { push(c, { t: "in", key: "barrierAsk" }); push(c, { t: "multi", sel: [] }); }

  function handleFlag(c, r) {
    const k = r.flag.kind, u = ui();
    Store.log(c.id, "Safety rule", `Red topic "${r.flag.phrase}" (${k}). Fixed answer, no AI call.${c.human ? " Nurse mode was on." : ""}`, k === "HUMAN" ? "human" : "urgent");
    if (k === "HUMAN") { push(c, { t: "in", text: r.text, tag: "fixed" }); return act("nurse"); }
    const B = Store.S.F.L4.bleeding;
    if (k === "L4" && B && B.phrases.includes(r.flag.phrase)) r.text = r.text + " " + ((lang === "ar" && c.sex === "female" && B.line.ar_f) || B.line[lang] || B.line.en);
    push(c, { t: "in", text: r.text, tag: "fixed", flag: k });
    c.redFlag = { kind: k, phrase: r.flag.phrase, at: Store.now() }; c.track = "urgent";
    Store.log(c.id, "System", "Urgent task created for on-call clinician (SLA 2 h). Case moved to the top of the worklist.", "urgent");
    if (k === "L4" || k === "MH") { u.overlay = "emerg"; u.emergText = r.text; }
  }

  async function send(text) {
    const c = persona(), lang = langOf(c);
    text = String(text || "").trim(); if (!text) return;
    if (screen(c) !== "app") { toast(lang === "ar" ? "افتحي النتيجة أولًا: اضغطي على الإشعار" : "Open the result first: tap the notification"); return; }
    tab(c, "assistant");
    push(c, { t: "me", text }); Store.save();
    // Red topics are checked first, also after a nurse has taken over the chat.
    const flag = Rules.redFlag(Store.S.F, text, lang);
    if (flag) { const A = Store.S.F[flag.kind] && Store.S.F[flag.kind].answer; handleFlag(c, { flag, text: (lang === "ar" && c.sex === "female" && A && A.ar_f) || flag.answer }); Store.save(); return; }
    if (c.human) { setTimeout(() => { push(c, { t: "nurse", text: lang === "ar" ? "شكرًا، سأرد عليك خلال دقائق." : "Thank you, I'll reply in a few minutes." }); Store.save(); }, 700); return; }
    // Fixed intents that create a task for a person (not AI): "already done elsewhere" and "I don't want the test".
    const ELSE = /\b(already (had|did|done|have had)|other hospital|another hospital|another clinic|elsewhere|private (clinic|hospital)|abroad)\b|في مستشفى آخر|في مكان آخر|أجريت|عملت الفحص|سويت/i;
    const NO = /\b(i don'?t want|i do not want|not going|won'?t go|will not go|refuse|not interested|no thanks)\b|لا أريد|لا اريد|لن أذهب|لن اذهب|أرفض|ارفض|ما أبي|مش عايز/i;
    if (ELSE.test(text)) {
      push(c, { t: "in", tag: "prepared", text: lang === "ar" ? "شكرًا لإخبارنا. سنطلب تقريرك حتى يكون ملفك كاملًا. ستتواصل معك المنسقة خلال يوم عمل واحد. إذا كان التقرير معك، يمكنك إرساله إلى العيادة." : "Thank you for telling us. We'll ask for your report so your record is complete. The coordinator will contact you within 1 working day. If you have the report, you can send it to the clinic." });
      c.elsewhere = { at: Store.now(), text: text.slice(0, 80) }; if (!c.callback || c.humanDone) { c.callback = new Date(Store.now()).toISOString(); c.humanDone = false; }
      Store.log(c.id, "Assistant (fixed intent)", "Patient says the test was done elsewhere. Coordinator task: request the report (SLA 1 working day).", "human"); Store.save(); return;
    }
    if (NO.test(text)) {
      push(c, { t: "in", tag: "prepared", text: lang === "ar" ? "هذا قرارك، ومن الطبيعي أن تكون لديك أسئلة أو مخاوف. كثير من الناس يشعرون بالتردد. هل تودّين التحدث مع ممرضة أو مع طبيبتك أولًا؟ لا نحجز شيئًا من دونك." : "That's your choice, and it's normal to have questions or worries. Many people feel unsure. Would you like to talk it through with a nurse or your doctor first? Nothing is booked without you." });
      push(c, { t: "qr", opts: [["nurse", I18N[lang].nurse], ["callme", I18N[lang].callMe]] });
      c.hesitant = { at: Store.now(), text: text.slice(0, 80) }; if (!c.callback || c.humanDone) { c.callback = new Date(Store.now()).toISOString(); c.humanDone = false; }
      Store.log(c.id, "Assistant (fixed intent)", "Patient said they don't want the test. Offered a nurse or a doctor call; no AI answer. Flag for coordinator.", "human"); Store.save(); return;
    }
    // "When is my appointment?" after booking: answer from the booked slot, not from the library.
    if (c.slot && /\b(appointment|booking|my slot)\b|موعدي|حجزي/i.test(text)) {
      const conf = ["booked", "attended", "closed"].includes(c.state);
      const label = lang === "ar" ? c.slot.label : c.slot.labelEn;
      push(c, { t: "in", text: lang === "ar" ? `موعدك: ${label}، ${c.slot.clinic}. ${conf ? "مؤكد." : "بانتظار تأكيد العيادة."}` : `Your appointment: ${label}, ${c.slot.clinic}. ${conf ? "Confirmed." : "Waiting for the clinic to confirm."}`, tag: "prepared" });
      Store.log(c.id, "Assistant (prepared)", "Answered from booked slot: " + text.slice(0, 60), "ai"); Store.save(); return;
    }
    push(c, { t: "typing" }); Store.save();
    const r = await Agent.ask(text, c, lang);
    const ch = chat(c), i = ch.findIndex((m) => m.t === "typing"); if (i >= 0) ch.splice(i, 1);
    if (r.kind === "flag") handleFlag(c, r);
    else {
      push(c, { t: "in", text: r.text, c: r.c, src: r.src, tag: r.via });
      Store.log(c.id, r.via === "ai" ? "AI assistant" : "Assistant (prepared)", "Answered: " + text.slice(0, 60), "ai");
      // AI may flag a concern for review; only the rules table and a clinician set urgency (architecture v0.7 audit).
      if (r.raise && !c.aiConcern) { c.aiConcern = { at: Store.now(), text: text.slice(0, 80) }; if (!c.callback || c.humanDone) { c.callback = new Date(Store.now()).toISOString(); c.humanDone = false; } Store.log(c.id, "AI assistant", "AI flagged a concern for review. Review task for a clinician; level and zone unchanged (set by the rules table).", "human"); }
    }
    Store.save();
  }

  // Channel ladder (simulation): WhatsApp → SMS day 2 → SMS day 4 → automated call day 5 → coordinator call → letter.
  function ladder(step) {
    const c = persona(), d = Store.S.data, u = ui();
    const plan = { sms2: [2, "SMS"], sms4: [4, "SMS"], call5: [5, "Automated call"], coord: [5, "Coordinator call"] }[step];
    if (!plan) return;
    d.clockDays = Math.max(d.clockDays, plan[0]);
    c.attempts = (c.attempts || []).concat([{ day: plan[0], channel: plan[1], ok: false }]);
    Store.log(c.id, step === "coord" ? "Coordinator · Noura A." : "System", `${plan[1]} on day ${plan[0]} (simulated, no real number)`, "channel");
    u.overlay = step.startsWith("sms") ? "sms" : step === "call5" ? "call" : null;
    u.callAnswered = false;
    if (step === "coord") {
      Store.log(c.id, "Coordinator · Noura A.", "Called patient: no answer. Letter sent to home address. Escalation per overdue ladder.", "channel");
      c.attempts = c.attempts.concat([{ day: plan[0], channel: "Letter", ok: false }]);
    }
    Store.save();
  }

  // Reminders appear when the demo clock reaches them.
  function reminders(c, lang) {
    if (!c.slot) return [];
    const appt = Date.parse(c.slot.day + "T" + c.slot.time + ":00+04:00"), gi = pathway(c) === "colonoscopy";
    return [
      // Colonoscopy (medic F8): diet 3 days before, prep drink the day before, always "as your clinic told you". No foods, times or doses.
      gi ? [appt - 3 * Store.DAY, "r3", lang === "ar" ? "تذكير: موعد تنظير القولون بعد 3 أيام. ابدئي اليوم تعليمات النظام الغذائي من المركز، كما أخبركِ المركز." : "Reminder: your colonoscopy is in 3 days. Start the clinic's diet instructions today, as your clinic told you."]
        : [appt - 2 * Store.DAY, "r2", lang === "ar" ? "تذكير: موعدك بعد يومين." : "Reminder: your appointment is in 2 days."],
      [appt - 1 * Store.DAY, "r1", gi ? (lang === "ar" ? "غدًا موعد تنظير القولون. اليوم، ابدئي شراب التحضير في الوقت الذي حدده المركز، كما أخبركِ المركز. تأكدي أن شخصًا بالغًا سيرافقكِ إلى المنزل." : "Tomorrow is your colonoscopy. Today, start the prep drink at the time the clinic gave you, as your clinic told you. Make sure an adult can take you home.") : (lang === "ar" ? "موعدك غدًا. أحضري الهوية." : "Your appointment is tomorrow. Bring your ID.")],
      [appt - 3 * 3600000, "r0", lang === "ar" ? "موعدك اليوم الساعة " + c.slot.time + ". هل تحتاجين مساعدة في الوصول؟" : "Your appointment is today at " + c.slot.time + ". Need help getting there?"]
    ].map(([at, k, text]) => ({ at, k, text }));
  }
  function deliverDue(c) {
    if (!c.slot || !(["booked", "attended", "closed"].includes(c.state) || (c.state === "confirmation" && pathway(c) === "gp_confirm"))) return;
    c.sent = c.sent || [];
    for (const r of reminders(c, langOf(c))) if (Store.now() >= r.at && !c.sent.includes(r.k)) { c.sent.push(r.k); Store.log(c.id, "System", "Reminder sent on WhatsApp ✓✓ and in the app (" + r.k + ")", "channel"); }
  }

  function nextSteps(c, lang) {
    const t = I18N[lang], n = NEXT[pathway(c)];
    if (pathway(c) === "colonoscopy") return t.steps;
    return (n && (n[lang] || n.en)) || (lang === "ar" ? ["راجع طبيب الأسرة", "اتفقا معًا على الخطوة التالية"] : ["See your family doctor", "Agree the next step together"]);
  }
  const stripCmp = (s) => String(s || "").replace(/^\s*(Compared with|مقارنة\s*بـ?)\s*:\s*/i, "").replace(/^[\s—–-]*$/, "");

  // ---------- app tabs ----------
  function resultTab(c, lang) {
    const T = I18N[lang], t = T.app, r = c.result, issued = Date.parse(c.history[0].at);
    const fc = Store.fitClocks(c), by = fc ? fc.refBy : r.windowDays ? issued + r.windowDays * Store.DAY : null;
    const testName = r.test === "FIT" ? T.resultTitle : (Store.S.T.tests[r.test].name[lang] || Store.S.T.tests[r.test].name.en);
    const callToday = r.next === "remeasure_then_doctor_today";
    const M = MEANING[r.test + ":" + r.category];
    const meaning = r.test === "FIT" && r.category === "positive" ? T.fitPosMeaning : M ? M[lang] || M.en : (lang === "ar" ? r.compareAr || r.compare : r.compare);
    const value = r.test === "BP" ? `${c.test.sys}/${c.test.dia} mmHg` : r.test === "HBA1C" ? `${c.test.value}%` : "";
    const steps = nextSteps(c, lang), canBook = !!slotsFor(c) && !c.rejected;
    const done = { referral: 1, booked: 1, attended: 3, closed: 4 }[c.state] ?? 0;
    const zoneWord = callToday ? (lang === "ar" ? "يحتاج رعاية اليوم" : "Needs care today") : T.zone[r.zone] || r.zone;
    // Urgent BP card is written so it does not frighten (BA rewrite, wording waits for Anna's check).
    const body = callToday
      ? `<div class="lead">${lang === "ar" ? `سيتصل بك طبيب ${callByText(c, lang)}.` : `A doctor will call you ${callByText(c, lang)}.`}</div>
         <div class="cmpline">${lang === "ar" ? `ضغط دمك مرتفع: <bdi>${c.test.sys}/${c.test.dia}</bdi>. الطبيعي أقل من <bdi>120/80</bdi>. عندما يكون الرقم الأعلى 180 أو أكثر، أو الرقم الأدنى 120 أو أكثر، يجب أن يتحدث معك طبيب في اليوم نفسه.` : `Your blood pressure is high: ${c.test.sys}/${c.test.dia}. Normal is below 120/80. When the top number is 180 or more, or the bottom number is 120 or more, a doctor should talk to you the same day.`}</div>
         <div style="margin-top:4px">${lang === "ar" ? "ارتفاع ضغط الدم شائع ويمكن علاجه. غالبًا لا يسبب أعراضًا، لذلك هذا الاتصال مهم حتى لو كنت تشعر أنك بخير." : "High blood pressure is common and can be treated. It often causes no symptoms, so this call matters even if you feel well."}</div>`
      : `${value ? `<div><b style="font-size:17px"><bdi>${esc(value)}</bdi></b></div>` : ""}<div style="margin-top:4px">${esc(meaning)}</div>${M ? `<div class="cmpline small" style="margin-top:4px">${esc(M.c[lang] || M.c.en)}</div>` : ""}`;
    const speakText = [testName, zoneWord, callToday ? "" : meaning, T.nextTitle, ...steps].join(". ");
    return `${outcomeCard(c, lang)}
      <div class="hero z-${r.zone}${callToday ? " calm" : ""}" style="background:var(--${r.zone}-soft)"><div class="hic" aria-hidden="true">${callToday ? ic("phone") : zoneIcon[r.zone] || "!"}</div>
        <div><div class="small">${esc(testName)}</div><b>${esc(zoneWord)}</b>${body}
        <div class="why-row">${lang === "ar" ? "حُدِّد وفق قواعد برنامج الفحص، وليس بالذكاء الاصطناعي." : "Decided by the screening programme's rules, not by AI."}</div></div></div>
      <div class="acard"><b>${esc(T.nextTitle)}</b>
        <ol class="steps">${steps.map((s, i) => `<li><span class="d ${i < done ? "on" : ""}">${i < done ? "✓" : i + 1}</span><span>${esc(s)}</span>${whenFor(c, lang, i, by)}</li>`).join("")}</ol>
        ${callToday ? `<details class="srcs howto"><summary>${lang === "ar" ? "كيف أقيس؟" : "How to measure"}</summary>
          <ol class="small" style="margin:4px 0 0;padding-inline-start:18px">${(lang === "ar" ? ["ادخل الحمّام أولًا إذا احتجت. اجلس 5 دقائق، الظهر مسنود، القدمان على الأرض، الساقان غير متقاطعتين.", "ضع الكُمّ على أعلى ذراعك مباشرة على الجلد، فوق المرفق بإصبعين تقريبًا. أرح ذراعك على طاولة بحيث يكون الكُمّ بمستوى القلب (منتصف الصدر).", "ابقَ ساكنًا، دون كلام أو استخدام الهاتف. خذ قراءتين بفارق دقيقة، على الذراع نفسها.", "اكتب القراءتين والوقت لتخبر الطبيب بهما.", "إذا شربت قهوة أو شايًا ثقيلًا أو دخّنت أو مارست رياضة خلال آخر 30 دقيقة، قِس على أي حال وأخبر الطبيب.", "حتى لو كانت الأرقام أقل، انتظر اتصال الطبيب."] : ["Use the toilet first if you need to. Sit for 5 minutes, back supported, feet flat on the floor, legs uncrossed.", "Put the cuff on your bare upper arm, about 2 fingers above the elbow. Rest your arm on a table so the cuff is at heart level (middle of your chest).", "Stay still, no talking or using your phone. Take two readings, one minute apart, on the same arm.", "Write down both readings and the time, to tell the doctor.", "If you had coffee, strong tea, a cigarette or exercise in the last 30 minutes, measure anyway and tell the doctor.", "Even if the numbers are lower, keep the doctor's call."]).map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
          <div class="small" style="margin-top:4px">${lang === "ar" ? "لا يوجد جهاز؟ لا داعي للبحث عن جهاز. سيقرر الطبيب إن كان يلزم القياس مرة أخرى وأين." : "No monitor? You don't need to find one. The doctor will decide if and where to measure again."}</div></details>
        <div class="fallback">${lang === "ar" ? `إذا لم يتصل بك طبيب ${callBy(c).late ? "حتى الساعة 10:00 صباح الغد" : "حتى الساعة " + fmtTime(callBy(c).ms)}: اتصل بمركزك الصحي على <a href="tel:020000000"><bdi class="nw">${CLINIC_LINE_AR}</bdi></a>.` : `If no doctor has called by ${callBy(c).late ? "10:00 tomorrow" : fmtTime(callBy(c).ms)}: call your health centre on <a href="tel:020000000" class="nw">${CLINIC_LINE}</a>.`}</div>
        <div class="greybox"><b>${lang === "ar" ? "اتصل بالرقم 998 الآن إذا لاحظت أيًّا مما يلي:" : "Call 998 now if you notice any of these:"}</b>
          <ul class="sym">${(lang === "ar" ? ["ألم أو ضغط في الصدر", "ضيق في التنفس", "صداع شديد مفاجئ", "تشوش الرؤية أو فقدانها", "ضعف أو تنميل أو ارتخاء في جانب واحد من الوجه أو الجسم", "صعوبة في الكلام أو الفهم", "ارتباك أو إغماء", "أو إذا شعرت فجأة أنك أسوأ بكثير"] : ["Chest pain or pressure", "Shortness of breath", "A sudden, severe headache", "Blurred vision or loss of vision", "Weakness, numbness or drooping on one side of the face or body", "Trouble speaking or understanding", "Confusion or fainting", "Or if you suddenly feel much worse"]).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
          <button class="btn danger block call998" data-act="e998">${ic("phone")} ${lang === "ar" ? "اتصل بالرقم 998" : "Call 998"}</button></div>` : ""}
        <details class="srcs"><summary>${callToday ? (lang === "ar" ? "لماذا اليوم؟" : "Why today?") : lang === "ar" ? "كيف قررنا" : "How we decided"}</summary>
          <div class="small">${esc((PLAIN_SRC[r.test] || PLAIN_SRC.FIT)[lang] || "")}</div>
          <div class="tiny" style="margin-top:4px">${esc(T.disclaimer)}</div></details>
        <button class="btn sm" style="margin-top:8px" data-speak="${esc(speakText)}" data-ai="1">${esc(T.listen)}</button></div>
      ${OPEN.includes(c.state) ? `<button class="btn primary block" data-act="understood">${esc(t.understood)}</button>${canBook ? `<button class="btn block" data-act="book">${esc(t.bookMain)}</button>` : ""}`
        : canBook && !c.slot ? `<button class="btn primary block" data-act="tab" data-arg="book">${esc(t.bookMain)}</button>` : ""}`;
  }
  function whenFor(c, lang, i, by) {
    const T = I18N[lang], w = (x) => `<span class="when">${esc(x)}</span>`;
    if (c.result.next === "remeasure_then_doctor_today") return i === 0 ? w(callByText(c, lang)) : i === 1 ? w(lang === "ar" ? "الآن" : "now") : "<span></span>";
    const fc = Store.fitClocks(c);
    if (fc) return i === 0 ? w(fill(T.refBy, { date: fmtDate(fc.refBy, lang) })) : i === 2 ? w(fill(T.colBy, { date: fmtDate(fc.careBy, lang) })) : "<span></span>";
    return i === 0 && by ? w(fill(T.byDate, { date: fmtDate(by, lang) })) : "<span></span>";
  }
  // "Why this zone" names the rule row the number was compared with, not the advice again.
  function whyLine(c, lang, value) {
    const r = c.result;
    if (!value || !r.ruleText) {
      const cat = { positive: lang === "ar" ? "إيجابي" : "positive", positive_16_18: lang === "ar" ? "16/18 إيجابي" : "16/18 positive", negative: lang === "ar" ? "سلبي" : "negative" }[r.category] || r.category;
      const nx = { colonoscopy: lang === "ar" ? "تنظير القولون" : "colonoscopy", colposcopy: lang === "ar" ? "تنظير عنق الرحم" : "colposcopy" }[r.next];
      const win = r.referralWorkdays ? (lang === "ar" ? ` · تحويل خلال ${r.referralWorkdays} يوم عمل، والتنظير خلال ${r.careWorkdays} يوم عمل من التحويل` : ` · referral within ${r.referralWorkdays} working days, colonoscopy within ${r.careWorkdays} working days of it`) : r.windowDays ? (lang === "ar" ? ` خلال ${r.windowDays} يومًا` : ` within ${r.windowDays} days`) : "";
      return `${r.test} ${cat} ${lang === "ar" ? "←" : "→"} ${r.level}${nx ? " · " + nx + win : ""} (${lang === "ar" ? "القواعد" : "rules"} v${r.rulesVersion})`;
    }
    let rule = r.ruleText;
    if (lang === "ar") rule = rule.replace(/systolic/g, "الانقباضي").replace(/diastolic/g, "الانبساطي").replace(/\bor\b/g, "أو").replace(/\band\b/g, "و");
    const act = r.next === "remeasure_then_doctor_today" ? (lang === "ar" ? "يتصل الطبيب اليوم" : "doctor calls today") : I18N[lang].zone[r.zone];
    return `${value}: ${rule} ${lang === "ar" ? "←" : "→"} ${r.level}, ${act} (${r.source.split(";")[0]}, ${lang === "ar" ? "القواعد" : "rules"} v${r.rulesVersion})`;
  }
  function outcomeCard(c, lang) {
    const t = I18N[lang].app;
    if (c.state === "attended") return `<div class="acard" style="border-color:var(--brand)"><b>${ic("doc")} ${esc(t.reportTitle)}</b><div class="small">${esc(t.reportText)}</div></div>`;
    if (c.state === "closed") {
      const fb = c.feedback || {}, faces = (q) => `<div class="faces">${["😞", "😐", "🙂"].map((f, i) => `<button class="${fb[q] === i + 1 ? "on" : ""}" data-act="face" data-arg="${q}${i + 1}" aria-label="${i + 1} of 3">${f}</button>`).join("")}</div>`;
      return `<div class="acard" style="border-color:var(--green)"><b>✓ ${esc(t.doneTitle)}</b><div class="small">${esc(t.doneText)}</div>
        <div class="small" style="margin-top:10px">${esc(t.q1)}</div>${faces("a")}<div class="small" style="margin-top:10px">${esc(t.q2)}</div>${faces("b")}
        ${fb.a && fb.b ? `<div class="tiny" style="margin-top:6px">${esc(t.thanks)}</div>` : ""}</div>`;
    }
    return "";
  }
  function assistantTab(c, lang) {
    const T = I18N[lang];
    return `<div class="chatlist">${chat(c).map((m) => bubble(m, c, lang)).join("") || `<div class="sys">${esc(T.aiNote)}</div>`}</div>`;
  }
  function bookTab(c, lang) {
    const T = I18N[lang], t = T.app, P = slotsFor(c), u = ui(), f = u.filters || {};
    if (!P) return `<div class="acard" ${c.result.level === "L3" ? `style="border-color:var(--red)"` : ""}><b>${esc(c.result.level === "L3" ? t.urgentTitle : t.noBook)}</b>${c.result.level === "L3" ? `<div class="small">${esc(t.urgentText)}</div>` : ""}</div>`;
    if (c.slot) return apptCard(c, lang);
    if (c.rejected) return returnedCard(c, lang);
    const fcb = Store.fitClocks(c), by = fcb ? fcb.careBy : c.result.windowDays ? Date.parse(c.history[0].at) + c.result.windowDays * Store.DAY : null;
    let list = P.list.filter((s) => (!f.female || s.f) && (!f.weekend || s.wkd)).sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time));
    if (f.near) list = list.slice().sort((a, b) => a.km - b.km);
    return `<div class="acard"><b>${esc(P.title[lang] || P.title.en)}</b>${P.sub ? `<div class="small">${esc(P.sub[lang] || P.sub.en)}</div>` : ""}${by ? `<div class="small">${esc(fill(fcb ? T.colBy : t.bookBy, { date: fmtDate(by, lang) }))}</div>` : ""}
        <div class="row" style="margin-top:8px">${Object.entries(T.filters).map(([k, v]) => `<button class="chip ${f[k] ? "z-green" : "c-grey"}" data-act="filter" data-arg="${k}" aria-pressed="${!!f[k]}">${f[k] ? "✓ " : ""}${esc(v)}</button>`).join("")}</div></div>
      ${list.map((s) => `<button class="acard slot" data-act="pick" data-arg="${s.id}" style="text-align:start;cursor:pointer;width:100%;font:inherit;color:inherit">
        <b>${esc(fmtDate(Date.parse(s.day + "T" + s.time + ":00+04:00"), lang))} · ${s.time}</b>
        <div>${docLine(s, lang)}</div><div class="tiny">${esc(nm(s.clinic, lang))} · ${s.km} ${lang === "ar" ? "كم" : "km"}</div>
        <div class="tiny">✓ ${esc(fill(T.covered, { ins: insName(c, lang) }))} · ${esc(fill(T.pay, { n: s.pay[c.insurance] ?? 0 }))}</div></button>`).join("")}
      <button class="acard slot nofit" data-act="callme"><b>${lang === "ar" ? "لا يناسبني أي موعد" : "None of these fit"}</b><div class="small">${lang === "ar" ? "اطلب اتصالًا، وستجد المنسقة موعدًا معك." : "Ask for a call. The coordinator finds a time with you."}</div></button>
      <div class="tiny">${esc(T.slotsNote)}</div>`;
  }
  // Referral returned by the clinic: nothing to book until the doctor picks another clinic (BA F1).
  function returnedCard(c, lang) {
    const by = c.rejected.until ? fmtDate(c.rejected.until, lang) : null;
    return `<div class="acard" style="border-color:var(--amber, #b26a00)"><b>${lang === "ar" ? "لم تتمكن العيادة من قبول هذا التحويل" : "The clinic could not take this referral"}</b>
      <div class="small">${lang === "ar" ? "يختار طبيبك عيادة أخرى." + (by ? ` سنراسلك بحلول ${esc(by)}.` : "") : "Your doctor is choosing another clinic." + (by ? ` We will message you by ${esc(by)}.` : "")}</div>
      ${c.releasedSlot ? `<div class="tiny" style="margin-top:4px">${lang === "ar" ? "أُلغي الموعد المحجوز والتذكيرات." : "The held time and its reminders are cancelled."}</div>` : ""}</div>`;
  }
  function apptCard(c, lang) {
    const t = I18N[lang].app, confirmed = ["booked", "attended", "closed"].includes(c.state) || (c.state === "confirmation" && pathway(c) === "gp_confirm");
    return `<div class="acard"><div class="small">${esc(t.apptCard)}</div><b>${esc(fmtDate(Date.parse(c.slot.day + "T" + c.slot.time + ":00+04:00"), lang))} · <bdi>${esc(c.slot.time)}</bdi></b><div>${docLine(c.slot, lang)}</div>
      <div class="tiny">${esc(nm(c.slot.clinic, lang))} · ${c.slot.km} ${lang === "ar" ? "كم" : "km"}</div>
      <div class="small" style="margin-top:4px">${confirmed ? "✓ " + (lang === "ar" ? "مؤكد" : "Confirmed") : ic("clock") + " " + (lang === "ar" ? "تؤكد العيادة عادةً خلال يوم عمل واحد. سنراسلك." : "The clinic usually confirms within 1 working day. We'll message you.")}</div>
      <div class="row" style="margin-top:8px"><button class="btn sm" data-act="ics">${ic("cal")} ${lang === "ar" ? "أضف إلى التقويم" : "Add to calendar"}</button><button class="btn sm" data-act="change">${lang === "ar" ? "تغيير أو إلغاء" : "Change or cancel"}</button></div>
      ${pathway(c) === "colonoscopy" ? `<div class="small" style="margin-top:8px"><b>${esc(t.prepTitle)}</b></div><ol class="small" style="margin:4px 0 0;padding-inline-start:18px">${t.prepSteps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol><div class="small" style="margin-top:4px">${esc(t.prepAsk)} <button class="btn sm" data-act="nurse">${lang === "ar" ? "التحدث مع الممرضة ليلى" : "Talk to Nurse Layla"}</button></div>` : ""}</div>`;
  }
  function mycaseTab(c, lang) {
    const T = I18N[lang], t = T.app;
    const map = { issued: 0, assigned: 0, notified: 0, acknowledged: 1, confirmation: 1, referral: 2, booked: 3, attended: 4, closed: 5 }, cur = map[c.state];
    const todoKey = c.state === "confirmation" ? "acknowledged" : OPEN.includes(c.state) ? "notified" : c.state;
    const todo = c.rejected && !c.slot ? (lang === "ar" ? "لا شيء الآن. يختار طبيبك عيادة أخرى وسنراسلك." : "Nothing for now. Your doctor is choosing another clinic; we will message you.") : !slotsFor(c) && todoKey === "acknowledged" ? t.urgentTitle : t.todo[todoKey];
    const all = reminders(c, lang), sent = all.filter((r) => (c.sent || []).includes(r.k)), planned = all.filter((r) => !(c.sent || []).includes(r.k));
    const isDone = (i) => i < cur || c.state === "closed";
    // Before the clinic accepts, the time is only held: no green tick yet (BA F9).
    const held = c.slot && c.state === "referral";
    const booked = c.slot && (["referral", "booked"].includes(c.state) || (c.state === "confirmation" && pathway(c) === "gp_confirm")) ? `<div class="acard ${held ? "" : "booked-banner"}"><b>${held ? ic("clock") + " " + (lang === "ar" ? "الموعد محجوز مؤقتًا" : "Time held") : "✓ " + (lang === "ar" ? "تم حجز موعدك" : "Booked")}: <bdi>${esc(fmtDate(Date.parse(c.slot.day + "T" + c.slot.time + ":00+04:00"), lang))} · ${esc(c.slot.time)}</bdi></b><div class="small"><bdi>${esc(c.slot.doc)}</bdi> · ${esc(c.slot.clinic)}</div><div class="small">${c.state === "booked" || c.state === "confirmation" ? (lang === "ar" ? "أكدت العيادة الموعد." : "The clinic confirmed it.") : (lang === "ar" ? "بانتظار تأكيد العيادة (عادةً خلال يوم عمل واحد). سنراسلك." : "Waiting for the clinic to confirm (usually 1 working day). We'll message you.")}</div></div>` : "";
    return `${booked}${c.rejected && !c.slot ? returnedCard(c, lang) : ""}${outcomeCard(c, lang)}<div class="acard"><div class="small">${esc(fill(t.stepOf, { n: cur + 1 }))}</div>
        <div class="track" style="margin:6px 0">${T.trackSteps.map((_, i) => `<span class="${isDone(i) ? "on" : i === cur ? "cur" : ""}"></span>`).join("")}</div>
        <div class="small"><b>${esc(t.nowWith)}:</b> ${c.slot && ["referral", "booked", "attended"].includes(c.state) ? `${docLine(c.slot, lang)} · ${esc(nm(c.slot.clinic, lang))}` : esc(nm(c.owner || "—", lang))}</div>
        <div class="small"><b>${esc(t.youDo)}:</b> ${esc(todo)}</div></div>
      <div class="acard"><b>${esc(T.trackTitle)}</b><p class="tiny muted">${esc(T.trackSame || "")}</p><ol class="timeline">${T.trackSteps.map((st, i) => `<li><span class="dot ${isDone(i) ? "done" : i === cur ? "now" : ""}">${isDone(i) ? "✓" : i + 1}</span><div>${esc(st)}</div></li>`).join("")}</ol></div>
      ${c.slot ? apptCard(c, lang) : ""}
      <div class="acard"><b>${esc(t.reminders)}</b>${sent.length || planned.length ? sent.map((r) => `<div class="small" style="margin-top:6px">${ic("clock")} ${esc(r.text)}</div>`).join("") + planned.map((r) => `<div class="small muted" style="margin-top:6px">${ic("clock")} ${esc(fmtDate(r.at, lang))} ${fmtTime(r.at)} · ${lang === "ar" ? "مخطط" : "planned"}</div>`).join("") : `<div class="small muted">${c.slot ? (pathway(c) === "colonoscopy" ? (lang === "ar" ? "لا توجد تذكيرات بعد. تبدأ قبل موعدكِ بثلاثة أيام." : "No reminders yet. They start 3 days before your appointment.") : lang === "ar" ? "لا توجد تذكيرات بعد. ستصلك قبل موعدك بيومين." : "No reminders yet. They start 2 days before your appointment.") : (lang === "ar" ? "لا توجد تذكيرات بعد. سنضيفها عند الحجز." : "No reminders yet. We'll add them when you book.")}</div>`}</div>
      <div class="row"><button class="btn sm" data-act="nurse">${esc(T.nurse)}</button><button class="btn sm" data-act="callme">${esc(T.callMe)}</button></div>
      <div style="margin-top:10px">${c.stopped ? `<span class="tiny">${lang === "ar" ? "الرسائل متوقفة. ستتصل بك المنسقة مرة واحدة." : "Messages stopped. The coordinator will call you once."}</span>` : `<button class="linkbtn" data-act="stopmsg">${lang === "ar" ? "إيقاف الرسائل" : "Stop messages"}</button>`}</div>`;
  }
  function bubble(m, c, lang) {
    const T = I18N[lang], time = `<span>${fmtTime(m.at)}</span>`;
    if (m.t === "me") return `<div class="bub me">${esc(m.text)}<div class="meta">${time}</div></div>`;
    if (m.t === "sys") return `<div class="sys">${esc(T[m.key] || m.text)}</div>`;
    if (m.t === "typing") return `<div class="bub"><span class="muted">…</span></div>`;
    if (m.t === "card" || m.t === "slots" || m.t === "track") return ""; // items from the earlier chat-only version
    if (m.t === "qr") return `<div class="qr">${m.opts.map(([a, label, arg]) => `<button data-act="${a}" data-arg="${arg ?? ""}">${esc(label)}</button>`).join("")}</div>`;
    if (m.t === "multi") return `<div class="qr">${Object.entries(T.barriers).map(([k, v]) => `<button data-act="bar" data-arg="${k}" aria-pressed="${m.sel.includes(k)}" style="${m.sel.includes(k) ? "background:var(--brand-soft)" : ""}">${m.sel.includes(k) ? "✓ " : ""}${esc(v)}</button>`).join("")}<button data-act="barDone" style="background:var(--brand);color:#fff">${esc(T.barrierDone)}</button></div>`;
    const body = m.key ? fill(T[m.key], { clinic: clinicOf(c, lang), gp: nm(c.gp || "Dr. Hessa M.", lang), name: first(c) }) : (lang === "ar" && m.textAr) || m.text;
    const who = m.t === "nurse" ? nm("Nurse Layla", lang) + " · " + clinicOf(c, lang) : clinicOf(c, lang);
    const tag = m.tag === "ai" ? T.ai : m.tag === "prepared" ? (lang === "ar" ? "إجابة جاهزة من مركزك" : "Prepared answer from your centre") : m.tag === "fixed" ? (lang === "ar" ? "قاعدة سلامة · بدون ذكاء اصطناعي" : "Safety rule · no AI") : "";
    const cmp = stripCmp(m.c);
    return `<div class="bub"><div class="who">${esc(who)}</div>${esc(body)}
      ${cmp ? `<div class="cmp">${esc(T.compared)}: ${esc(cmp)}</div>` : ""}
      ${m.src && m.src.length ? `<div class="src">${esc(T.source)}: ${m.src.map(esc).join("; ")}</div>` : ""}
      <div class="meta">${tag ? `<span class="${m.tag === "ai" ? "ai-tag" : "ok-tag"}">${esc(tag)}</span>` : ""}${time}</div><button class="listen lbl" data-speak="${esc(body)}" ${m.tag === "prepared" || m.tag === "ai" ? `data-ai="1"` : ""}>${esc(T.listen)}</button></div>`;
  }
  function sheet(c, lang) {
    const T = I18N[lang], t = T.app, u = ui();
    if (!u.sheet) return "";
    if (u.sheet === "a2hs") return `<div class="scrim" data-act="a2hsLater"></div><div class="sheet" role="dialog" aria-labelledby="sh-t"><div class="grab"></div>
      <div class="appicon"><img src="img/kafila-mark.svg" alt=""></div><b id="sh-t" style="display:block;text-align:center">${esc(t.a2hsTitle)}</b><p class="small" style="text-align:center">${esc(t.a2hsText)}</p>
      <button class="btn primary block" data-act="a2hs">${esc(t.a2hsBtn)}</button><button class="btn block" style="margin-top:6px" data-act="a2hsLater">${esc(t.later)}</button></div>`;
    const P = slotsFor(c), s = P && P.list.find((x) => x.id === u.sheet); if (!s) return "";
    return `<div class="scrim" data-act="sheetClose"></div><div class="sheet" role="dialog" aria-labelledby="sh-t"><div class="grab"></div>
      <b id="sh-t" style="display:block;font-size:18px">${esc(t.confirmTitle)}</b>
      <div style="margin:8px 0"><b>${esc(fmtDate(Date.parse(s.day + "T" + s.time + ":00+04:00"), lang))} · ${s.time}</b><div>${docLine(s, lang)}</div><div class="tiny">${esc(nm(s.clinic, lang))} · ${s.km} ${lang === "ar" ? "كم" : "km"}</div>
      <div class="tiny">✓ ${esc(fill(T.covered, { ins: insName(c, lang) }))} · ${esc(fill(T.pay, { n: s.pay[c.insurance] ?? 0 }))}</div></div>
      <button class="btn primary block" data-act="confirm">${esc(t.confirm)}</button><button class="btn block" style="margin-top:6px" data-act="sheetClose">${esc(t.cancel)}</button></div>`;
  }
  function overlay(c, lang) {
    const T = I18N[lang], o = ui().overlay;
    if (!o) return "";
    const pop = o !== lastOverlay ? " pop" : "";
    if (o === "sms") return `<div class="overlay lockscr${pop}"><div class="date">${esc(new Date(Store.now()).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Dubai" }))}</div><div class="time" dir="ltr">${fmtTime(phoneNow(c))}</div>
      <button class="notif slide-in" data-act="smsClose"><span class="n-ic sms">${ic("sms")}</span><span class="n-body"><span class="app"><span>Messages · ${esc(T.smsFrom)}</span><span>${lang === "ar" ? "الآن" : "now"}</span></span>${esc(fill(T.sms, { clinic: clinicOf(c, lang) }))}</span></button>
      <div class="lk-bottom"><span>${ic("phone")}</span><span class="lk-fp">${ic("fp")}</span><span>${ic("camera")}</span></div></div>`;
    if (o === "call") {
      const ans = ui().callAnswered;
      return `<div class="overlay call${pop}"><div class="c-sub" ${ans ? 'id="ctimer"' : ""}>${ans ? "00:00" : lang === "ar" ? "مكالمة واردة…" : "incoming call…"}</div><div class="who">${esc(T.callFrom)}</div><div class="c-av">${ic("cross")}</div>
      ${ans ? `<div class="tr">${esc(fill(T.callScript, { name: first(c) }))}</div>
      <div class="keys">${[["1", lang === "ar" ? "سماع النتيجة" : "Hear result"], ["2", lang === "ar" ? "ممرضة" : "Nurse"]].map(([k, l]) => `<button data-act="key" data-arg="${k}"><b>${k}</b><small>${l}</small></button>`).join("")}<button class="tgl" aria-pressed="false" onclick="this.setAttribute('aria-pressed', this.getAttribute('aria-pressed') !== 'true')"><b>🔈</b><small>${lang === "ar" ? "مكبر" : "Speaker"}</small></button></div>` : ""}
      <div class="btns"><span><button class="c-end" data-act="callEnd" aria-label="${esc(T.decline)}">${ic("end")}</button><small>${esc(ans ? (lang === "ar" ? "إنهاء المكالمة" : "End call") : T.decline)}</small></span>${ans ? "" : `<span><button class="c-ok" data-act="callAnswer" aria-label="${esc(T.accept)}">${ic("phone")}</button><small>${esc(T.accept)}</small></span>`}</div></div>`;
    }
    if (o === "emerg") return `<div class="overlay emerg${pop}" role="alertdialog" aria-labelledby="em-t"><div style="font-size:48px">⚠</div><h2 id="em-t">${esc(T.emergencyTitle)}</h2><p>${esc(ui().emergText || "")}</p>
      <a href="tel:998">${ic("phone")} 998</a><p class="small">${esc(T.emergNote)}</p><button class="btn" data-act="emergClose">${esc(T.emergencyClose)}</button></div>`;
    return "";
  }
  // Realistic phone shell: frame, side buttons, camera island, live status bar, home indicator.
  // Status-bar colour follows the screen (light text on lock/WhatsApp/overlays, dark text in the app).
  let lastScreen = null, lastTab = null, lastOverlay = null;
  const ICONS = `<svg width="17" height="11" viewBox="0 0 17 11" aria-hidden="true"><rect x="0" y="7" width="3" height="4" rx="1"/><rect x="4.5" y="5" width="3" height="6" rx="1"/><rect x="9" y="2.5" width="3" height="8.5" rx="1"/><rect x="13.5" y="0" width="3" height="11" rx="1"/></svg>
    <svg width="15" height="11" viewBox="0 0 15 11" aria-hidden="true"><path d="M7.5 2.2c2.2 0 4.2.8 5.7 2.2l1.1-1.2A9.9 9.9 0 0 0 7.5.5 9.9 9.9 0 0 0 .7 3.2l1.1 1.2a8.2 8.2 0 0 1 5.7-2.2Zm0 3.3c1.3 0 2.5.5 3.4 1.3l1.1-1.2a6.6 6.6 0 0 0-9 0l1.1 1.2c.9-.8 2.1-1.3 3.4-1.3Zm0 3.3c.5 0 .9.2 1.2.5L7.5 10.6 6.3 9.3c.3-.3.7-.5 1.2-.5Z"/></svg>
    <span class="batt"><i></i></span><span class="pct">82%</span>`;
  const phoneNow = (c) => Store.now() + Math.min(59, chat(c).length) * 60000;
  function sbar(c, tone) {
    const ms = phoneNow(c);
    return `<div class="sbar ${tone}" dir="ltr"><span class="sb-time">${fmtTime(ms)}</span><span class="sb-ic">${ICONS}</span></div>`;
  }
  function shell(c, lang, scr, tone, inner) {
    const T = I18N[lang], o = ui().overlay;
    const anim = lastScreen !== scr ? "enter" : "";
    const toneNow = o ? "light" : tone;
    return `<div class="phone real scr-${scr}" dir="${T.dir}" lang="${lang}">
      <span class="btn-side b1"></span><span class="btn-side b2"></span>
      <div class="punch" aria-hidden="true"></div>${sbar(c, toneNow)}
      <div class="screen ${anim}">${inner}</div>
      ${overlay(c, lang)}
      <button class="homebar ${toneNow}" data-act="home" aria-label="Home"></button></div>`;
  }
  function phone(c, lang) { return gx(phoneRaw(c, lang), c, lang); }
  function phoneRaw(c, lang) {
    const T = I18N[lang], t = T.app, sc = screen(c);
    if (sc === "lock") {
      const d = new Date(Store.now());
      return shell(c, lang, "lock", "light", `<div class="lockscr"><div class="wall" aria-hidden="true"></div>
        <div class="lk-lock">${ic("lock")}</div>
        <div class="date">${esc(d.toLocaleDateString(lang === "ar" ? "ar-AE" : "en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Dubai" }))}</div>
        <div class="time" dir="ltr">${fmtTime(Store.now())}</div>
        <button class="notif slide-in" data-act="lock"><span class="n-ic">${ic("chat")}</span><span class="n-body"><span class="app"><span>${lang === "ar" ? "الدردشة" : "Chat"}</span><span>${lang === "ar" ? "الآن" : "now"}</span></span><b>${esc(clinicOf(c, lang))} ✓</b>${esc(T.preview)}</span></button>
        <div class="lk-hint">${esc(T.lockTap)}</div>
        <div class="lk-bottom"><span>${ic("phone")}</span><span class="lk-fp">${ic("fp")}</span><span>${ic("camera")}</span></div></div>`);
    }
    if (sc === "wa") return shell(c, lang, "wa", "light", `
      <div class="wa-head"><span class="wa-back">${ic("back")}</span><div class="av">${ic("cross")}</div><div class="wa-title"><b>${esc(clinicOf(c, lang))}</b><small>✓ ${esc(T.verified)}</small></div>
        <span class="wa-tools" aria-hidden="true">${ic("video")}${ic("phone")}${ic("more")}</span></div>
      <div class="wa-body doodle"><div class="sys">${lang === "ar" ? "اليوم" : "Today"}</div>
        <div class="e2e">${ic("lock")} ${lang === "ar" ? "الرسائل في هذه المحادثة محمية بالتشفير التام بين الطرفين." : "Messages to this chat are secured with end-to-end encryption."}</div>
        <div class="unread">${lang === "ar" ? "رسالة واحدة غير مقروءة" : "1 unread message"}</div>
        <div class="bub tail"><div class="who">${esc(clinicOf(c, lang))}</div>${esc(isUrgent(c) ? fill(t.waUrgent, { name: first(c), clinic: clinicOf(c, lang), doctor: doctorOf(c, lang), deadline: callByText(c, lang), clinicPhone: CLINIC_PHONE + (lang === "ar" ? " (رقم تجريبي)" : " (demo number)") }) : fill(t.waHello, { name: first(c), doctor: doctorOf(c, lang) }))}
        <button class="linkcard" data-act="openapp"><span class="lc-ic"><img src="img/kafila-app-icon.svg" alt=""></span><span><b>${esc(t.openResult)}</b><br><span class="tiny">${esc(t.secureLink)}</span></span></button>
        <div class="meta"><span>${fmtTime(Store.now())}</span></div></div>
        ${isUrgent(c) ? `<div class="qr"><button data-act="waCallNow">${lang === "ar" ? "اتصلوا بي الآن" : "Call me now"}</button><button data-act="waCantTalk">${lang === "ar" ? "لا أستطيع التحدث اليوم" : "I can't talk today"}</button><button data-act="notme">${lang === "ar" ? "هذا ليس أنا" : "This is not me"}</button></div>
        ${c.waReply === "callnow" ? `<div class="bub me">${lang === "ar" ? "اتصلوا بي الآن" : "Call me now"}</div><div class="bub"><div class="who">${esc(clinicOf(c, lang))}</div>${esc(lang === "ar" ? `سيتصل بك ${doctorOf(c, lang)} في أقرب وقت، ${callByText(c, lang)}. إذا شعرت بأن حالتك تسوء، اتصل بالرقم 998.` : `${doctorOf(c, lang)} will call you as soon as possible, ${callByText(c, lang)}. If you feel worse, call 998.`)}</div>` : ""}
        ${c.waReply === "canttalk" ? `<div class="bub me">${lang === "ar" ? "لا أستطيع التحدث اليوم" : "I can't talk today"}</div><div class="bub"><div class="who">${esc(clinicOf(c, lang))}</div>${esc(lang === "ar" ? `شكرًا لإخبارنا. نتيجتك ما زالت تحتاج إلى طبيب اليوم، لذلك سيحاول ${doctorOf(c, lang)} الاتصال بك مرة أخرى. إذا شعرت بألم في الصدر أو صداع شديد جدًا أو ضعف أو صعوبة في الكلام أو الرؤية، اتصل بالرقم 998 الآن.` : `Thank you for telling us. Your result still needs a doctor today, so ${doctorOf(c, lang)} will try you again. If you have chest pain, a very bad headache, weakness, or trouble speaking or seeing, call 998 now.`)}</div>` : ""}`
        : `<div class="qr"><button data-act="waNurse">${lang === "ar" ? "أريد التحدث مع ممرضة" : "Talk to a nurse"}</button><button data-act="notme">${lang === "ar" ? "هذا ليس أنا" : "This is not me"}</button></div>
        ${c.callback ? `<div class="bub me">${lang === "ar" ? "أريد التحدث مع ممرضة" : "Talk to a nurse"}</div><div class="bub"><div class="who">${esc(clinicOf(c, lang))}</div>${lang === "ar" ? "ستتصل بك الممرضة ليلى خلال ساعتين." : "Nurse Layla will call you within 2 hours."}</div>` : ""}`}</div>
      <div class="wa-input wa-deco"><div class="wa-field"><span aria-hidden="true">${ic("emoji")}</span><input disabled placeholder="${esc(lang === "ar" ? "رسالة" : "Message")}" aria-label="${esc(T.placeholder)}"><span aria-hidden="true">${ic("clip")}</span><span aria-hidden="true">${ic("camera")}</span></div><button type="button" disabled aria-label="Voice">${ic("mic")}</button></div>`);
    const browserBar = (pct) => `<div class="chrome" dir="ltr"><span class="ch-home">${ic("lock")}</span><span class="ch-url">kafila.demo/r/${esc(c.id.slice(-4))}</span><span class="ch-tabs">1</span><span class="ch-more">⋮</span>${pct ? `<i class="ch-prog"></i>` : ""}</div>`;
    if (sc === "loading") return shell(c, lang, "signin", "dark", `${browserBar(true)}<div class="splash"><div class="appicon"><img src="img/kafila-mark.svg" alt=""></div><b>${lang === "ar" ? "قافلة" : "Kafila"}</b><span class="tiny">${esc(clinicOf(c, lang))}</span></div>`);
    if (sc === "home") {
      const apps = [["phone", lang === "ar" ? "الهاتف" : "Phone", "#2e7d5b", ""], ["chat", lang === "ar" ? "الدردشة" : "Chat", "#1b8a72", "launchChat"], ["sms", lang === "ar" ? "الرسائل" : "Messages", "#4a6fa5", ""], ["camera", lang === "ar" ? "الكاميرا" : "Camera", "#5f6b69", ""]];
      const d = new Date(Store.now());
      return shell(c, lang, "lock", "light", `<div class="lockscr homescr"><div class="wall" aria-hidden="true"></div>
        <div class="hs-widget"><b><span dir="ltr">${fmtTime(phoneNow(c))}</span></b><span>${esc(d.toLocaleDateString(lang === "ar" ? "ar-AE" : "en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Dubai" }))}</span></div>
        <div class="hs-grid">${[["clock", "Clock", "الساعة", "#3c6e8f"], ["cal", "Calendar", "التقويم", "#2f6fb0"], ["image", "Gallery", "المعرض", "#a0527a"], ["pin", "Maps", "الخرائط", "#3f8a4f"], ["folder", "Files", "الملفات", "#b7832f"], ["person", "Contacts", "جهات الاتصال", "#4a6fa5"], ["calc", "Calculator", "الآلة الحاسبة", "#5f6b69"], ["gear", "Settings", "الإعدادات", "#56606b"]].map(([i, en, ar, col]) => `<button class="hs-app" disabled><span class="hs-ic" style="background:${col}">${ic(i)}</span><span>${esc(lang === "ar" ? ar : en)}</span></button>`).join("")}
          ${c.installed || c.consent ? `<button class="hs-app" data-act="launch"><span class="hs-ic sp"><img src="img/kafila-app-icon.svg" alt="">${c.state !== "closed" ? `<i class="badge">1</i>` : ""}</span><span>${lang === "ar" ? "قافلة" : "Kafila"}</span></button>` : ""}</div>
        <div class="hs-dock">${apps.map(([i, l, col, a]) => `<button class="hs-app" ${a ? `data-act="${a}"` : "disabled"}><span class="hs-ic" style="background:${col}">${ic(i)}</span><span>${esc(l)}</span></button>`).join("")}</div></div>`);
    }
    if (sc === "signin") return shell(c, lang, "signin", "dark", `${browserBar(false)}
      <div class="ascroll"><div class="appicon"><img src="img/kafila-mark.svg" alt=""></div><b style="text-align:center;font-size:20px">${esc(t.signinTitle)}</b>
        <p class="small" style="text-align:center;margin:0">${esc(t.otpSent)}</p><div class="otps">${"4719".split("").map((d) => `<span class="otp">${d}</span>`).join("")}</div>
        <label class="consent"><input type="checkbox" id="consent" data-act="consent" ${ui().consentTick ? "checked" : ""}><span><b>${esc(t.consentLabel)}.</b> ${esc(T.consent)}</span></label>
        <div class="why-row">${esc(T.aiNote)}</div>
        ${ui().consentTick || !ui().consentTried ? "" : `<div class="hint">${lang === "ar" ? "يرجى وضع علامة للموافقة للمتابعة." : "Please tick to agree before you continue."}</div>`}
        <button class="btn primary block" data-act="signin" aria-disabled="${!ui().consentTick}">${esc(t.continue)}</button>
        <button class="btn block" data-act="natid" aria-disabled="${!ui().consentTick}">${esc(t.nationalId)}</button>
        <div class="alt-row"><button class="linkbtn" data-act="phonepref">${lang === "ar" ? "أفضّل مكالمة هاتفية" : "I'd rather get a phone call"}</button><button class="linkbtn" data-act="notme">${lang === "ar" ? "هذا ليس أنا" : "This is not me"}</button></div></div>`);
    // No consent or wrong person: no result is shown, a person follows up (negative scenarios, BA 17 Nov).
    if (sc === "phonepref" || sc === "notme") {
      const pp = sc === "phonepref";
      return shell(c, lang, "signin", "dark", `${browserBar(false)}<div class="ascroll"><div class="appicon"><img src="img/kafila-mark.svg" alt=""></div>
        <b style="text-align:center;font-size:20px">${pp ? (lang === "ar" ? "سنتصل بك" : "We'll call you") : (lang === "ar" ? "شكرًا لإخبارنا" : "Thank you for telling us")}</b>
        <p style="text-align:center">${pp ? (lang === "ar" ? "لن نعرض أي نتيجة هنا. ستتصل بك المنسقة من مركزك الصحي خلال يوم عمل واحد لتشرح لك الخطوات التالية." : "No result is shown here. A coordinator from your health centre will call you within 1 working day to explain the next steps.")
          : (lang === "ar" ? "أوقفنا الرسائل إلى هذا الرقم، وسنتحقق من بيانات الاتصال. لا تظهر هنا أي معلومات صحية عن أي شخص." : "We have stopped messages to this number and will check the contact details. No health information about anyone is shown here.")}</p>
        ${pp ? "" : `<div class="demo-note">${lang === "ar" ? "عرض تجريبي: هكذا تحمي قافلة الرقم الخاطئ. لدى المنسقة الآن مهمة للتحقق من بيانات الاتصال." : "Demo: this is how Kafila protects a wrong number. The coordinator now has a contact-check task."}
          <button class="btn block" data-act="seeTask">${lang === "ar" ? "اعرض مهمة المنسقة" : "See the coordinator's task"}</button>
          <button class="btn block" data-act="undoNotme">${lang === "ar" ? "العودة إلى رسالة المركز" : "Back to the clinic's message"}</button></div>`}
        ${pp ? `<p class="small" style="text-align:center">${lang === "ar" ? "إذا شعرت بأعراض شديدة، اتصل بالرقم 998." : "If you have severe symptoms, call 998."}</p><button class="btn block" data-act="backSignin">${lang === "ar" ? "أريد فتح النتيجة الآن" : "Open my result now instead"}</button>` : ""}</div>`);
    }
    const tb = c.ptab || "result";
    const title = { result: fill(t.hello, { name: first(c) }), assistant: t.askTitle, book: c.slot ? t.apptCard : t.bookTitle, mycase: t.mycaseTitle }[tb];
    const body = { result: resultTab, assistant: assistantTab, book: bookTab, mycase: mycaseTab }[tb](c, lang);
    const icons = { result: ic("doc"), assistant: ic("chat"), book: ic("cal"), mycase: ic("pin") };
    const fade = lastTab !== tb && lastScreen === "app" ? "fade" : "";
    return shell(c, lang, "app", "dark", `${c.installed ? "" : `<div class="chrome" dir="ltr"><span class="ch-home">${ic("lock")}</span><span class="ch-url">kafila.demo</span><span class="ch-tabs">1</span><span class="ch-more">⋮</span></div>`}
      <div class="ah"><div><span class="tiny">${esc(tb === "assistant" ? t.askSub : clinicOf(c, lang))}</span><b>${esc(title)}</b></div>
        <div class="ah-act"><button class="pill-n" data-act="nurse">${ic("person")}${esc(t.nursePill)}</button><button class="pill-e ${c.result.zone === "red" || c.redFlag ? "solid" : ""}" data-act="e998">${ic("phone")}${esc(t.emergPill)}</button></div></div>
      <div class="ascroll ${fade}" id="wa">${body}</div>
      ${tb === "assistant" ? `<form class="wa-input" id="f"><input id="msg" autocomplete="off" placeholder="${esc(T.placeholder)}" aria-label="${esc(T.placeholder)}"><button type="button" id="mic" aria-label="Voice">${ic("mic")}</button><button type="submit" aria-label="Send">${ic("send")}</button></form>` : ""}
      <nav class="tabbar" role="tablist">${Object.keys(icons).map((k) => `<button role="tab" class="${tb === k ? "on" : ""}" aria-selected="${tb === k}" data-act="tab" data-arg="${k}"><i>${icons[k]}</i>${esc(t.tabs[k])}</button>`).join("")}</nav>
      ${sheet(c, lang)}`);
  }

  function render(root) {
    const d = Store.S.data, c = persona(); deliverDue(c);
    const lang = langOf(c), T = I18N[lang];
    const tryQ = [...((TRY[pathway(c)] || TRY.colonoscopy)[lang] || []), ...TRY.safety[lang]];
    root.innerHTML = `<div class="cols pcols">
      <div class="stage">
        ${(() => { const pk = PERSONAS.find((x) => x.key === (d.personaKey || d.persona)) || PERSONAS.find((x) => x.id === c.id); const he = c.sex === "female" ? ["Her", "her"] : ["His", "him"];
          return `<div class="p-cap" dir="ltr" lang="en"><span>${esc(pk ? pk.cap : c.name)}${c.lang === "ar" ? ` · ${lang === "ar" ? `Shown in Arabic, as ${he[1] === "her" ? "her" : "his"} clinic writes it.` : `${he[0]} clinic writes to ${he[1]} in Arabic. Tap العربية to see it.`}` : d.version === "ar" ? ` · ${he[0]} clinic writes to ${he[1]} in English.` : " · English"}</span>
            ${c.lang === "ar" || d.version === "ar" ? `<span class="p-lang" role="group" aria-label="Phone language"><button data-plang="en" aria-pressed="${lang !== "ar"}">English</button><button data-plang="ar" lang="ar" aria-pressed="${lang === "ar"}">العربية</button></span>` : ""}</div>`; })()}
        ${phone(c, lang)}
        <p class="sim-note">${lang === "ar" ? "محاكاة. لا تُرسل أي رسائل إلى أرقام حقيقية. بيانات اصطناعية." : "Simulation. Nothing is sent to real numbers. Synthetic data."}</p>
      </div>
      <div class="demo-side">
        <div class="card"><h2>Demo controls</h2>
          <div class="row" style="margin-bottom:8px"><label class="tiny" for="persona">Patient</label>
          <select id="persona" class="btn sm">${PERSONAS.map((x) => `<option value="${x.key}" ${x.key === (d.personaKey || d.persona) ? "selected" : ""}>${esc(x.label)}</option>`).join("")}</select></div>
          <p class="muted small">The health centre sends a WhatsApp message with a secure link. The patient signs in with a one-time code and gives consent, then uses the Kafila web app (no download). The AI assistant says it is AI. A nurse and 998 are one tap away. Nothing is sent to real numbers.</p>
          <h3>Try</h3>
          <div class="row">${tryQ.map((q) => `<button class="btn sm" data-try="${esc(q)}">${esc(q)}</button>`).join("")}</div>
          <h3>Channel ladder if no reply</h3>
          <p class="tiny">WhatsApp → SMS day 2 → SMS day 4 → automated call day 5 → coordinator call → letter. Each attempt appears on the case timeline.</p>
          <div class="row"><button class="btn sm" data-lad="sms2">SMS · day 2</button><button class="btn sm" data-lad="sms4">SMS · day 4</button><button class="btn sm" data-lad="call5">Automated call · day 5</button><button class="btn sm" data-lad="coord">Coordinator call</button></div>
          <h3>AI</h3>
          <p class="tiny">${d.aiUrl ? "AI on: " + esc(d.aiUrl) : "AI off: prepared answers from the approved library. Add ?ai=https://&lt;worker&gt;.workers.dev to the address to switch AI on."}</p>
        </div>
        <div class="card"><h2>Case ${esc(c.id)}</h2>
          <div class="row"><span class="chip z-${c.result.zone}">${esc(c.result.level)} · ${esc(I18N.en.zone[c.result.zone])}</span><span class="chip c-grey">${esc(Store.STATE_NAMES[c.state])}</span>${c.redFlag ? `<span class="chip z-red">Red flag: ${esc(c.redFlag.phrase)}</span>` : ""}</div>
          <p class="small muted">Open the care-team view in another tab to see every step appear live.</p>
          <a class="btn sm" href="#/case/${esc(c.id)}">Open case in care-team view</a>
        </div>
      </div></div>`;
    const sc = root.querySelector("#wa"); if (sc && c.ptab === "assistant") sc.scrollTop = sc.scrollHeight;
    lastScreen = screen(c); lastTab = c.ptab || "result"; lastOverlay = ui().overlay || null;
    const tm = root.querySelector("#ctimer");
    if (tm) { const t0 = (ui().callT0 = ui().callT0 || Date.now()); clearInterval(window.__ct); window.__ct = setInterval(() => { const el = document.querySelector("#ctimer"); if (!el) return clearInterval(window.__ct); const sec = Math.floor((Date.now() - t0) / 1000); el.textContent = String(Math.floor(sec / 60)).padStart(2, "0") + ":" + String(sec % 60).padStart(2, "0"); }, 1000); }
    else ui().callT0 = null;
    root.querySelector("#persona").onchange = async (e) => {
      const x = PERSONAS.find((p) => p.key === e.target.value) || PERSONAS[0];
      d.persona = x.id; d.personaKey = x.key; const p = persona(); ui().overlay = null; ui().sheet = null;
      // Open the patient's own chat at once, so switching patient visibly changes the phone (Anna: "не все работают").
      if (screen(p) === "lock") p.pscreen = "wa";
      if (x.preset) await x.preset();
      Store.save();
    };
    const f = root.querySelector("#f");
    if (f) {
      f.onsubmit = (e) => { e.preventDefault(); const v = root.querySelector("#msg").value; root.querySelector("#msg").value = ""; send(v); };
      root.querySelector("#mic").onclick = (e) => {
        const b = e.currentTarget; b.classList.add("rec");
        const r = Agent.listen(lang, (txt) => send(txt), () => b.classList.remove("rec"));
        if (!r) { b.classList.remove("rec"); toast(T.voiceNo); }
      };
    }
    root.querySelectorAll("[data-act]").forEach((b) => (b.onclick = () => { const v = b.dataset.arg; act(b.dataset.act, v === undefined || v === "" || isNaN(+v) ? v : +v); }));
    root.querySelectorAll("[data-plang]").forEach((b) => (b.onclick = () => { d.lang = b.dataset.plang; Store.save(); }));
    root.querySelectorAll("[data-try]").forEach((b) => (b.onclick = () => send(b.dataset.try)));
    root.querySelectorAll("[data-lad]").forEach((b) => (b.onclick = () => ladder(b.dataset.lad)));
    // AI voice gets only approved texts with the patient's name taken out; the 998 and nurse texts use the browser voice.
    const noName = (t) => [c.name.split(" ")[0], NAMES_AR[c.name.split(" ")[0]]].filter(Boolean).reduce((x, n) => x.split(n).join(""), t).replace(/\s+([,.،])/g, "$1");
    root.querySelectorAll("[data-speak]").forEach((b) => (b.onclick = () => {
      const ai = b.dataset.ai === "1";
      const ok = Agent.speak(ai ? noName(b.dataset.speak) : b.dataset.speak, lang, null, { ai, onAI: () => toast(lang === "ar" ? "صوت مُولَّد بالذكاء الاصطناعي" : "AI-generated voice") });
      if (!ok) toast("No voice in this browser");
    }));
  }
  function toast(s) { const el = document.createElement("div"); el.className = "toast"; el.textContent = s; document.body.appendChild(el); setTimeout(() => el.remove(), 2600); }
  // Judge's tour: open a persona on a given screen, signed in, as a real patient would get there.
  function tourGo(id, o) {
    const d = Store.S.data, u = ui(); d.persona = id; const c = persona();
    u.overlay = null; u.sheet = null;
    if (o.lock) { c.pscreen = "lock"; Store.save(); return; }
    if (!c.waRead) { c.waRead = true; c.attempts = (c.attempts || []).concat([{ day: d.clockDays, channel: "WhatsApp", ok: true }]); if (c.state === "assigned") Store.move(c, "notified", "Agent (WhatsApp)"); }
    if (!c.consent) signIn(c, "one-time code");
    c.pscreen = "app"; tab(c, o.tab || "result");
    if (o.filters) u.filters = o.filters;
    Store.save();
  }
  async function tourBook() { const c = persona(); if (c.slot) return; const P = slotsFor(c); if (!P) return; ui().sheet = P.list[0].id; await act("confirm"); ui().sheet = null; Store.save(); }
  window.Patient = { callBy, callByText, render, toast, esc, fill, fmtDate, SLOTS, tourGo, tourBook, send };
})();
