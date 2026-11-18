// AI assistant. Order is fixed: 1) red-flag check (no AI), 2) approved content match, 3) AI via our Worker (optional),
// 4) prepared answer if AI is off, fails or is blocked by the guard. AI never changes zone, level or deadline.
(function () {
  const norm = (s) => String(s || "").toLowerCase();
  function matchFaq(C, test, q) {
    const s = norm(q);
    const list = C.faq.filter((f) => f.test === test || f.test === "*");
    // Latin keywords must start a word ("eat" matches "eating", not "weather" or "treatment"). Arabic keywords may carry
    // a prefix such as ال or و, so they match inside a word.
    const hit = (m) => {
      const k = norm(m);
      if (!/[a-z]/.test(k)) return s.includes(k);
      return new RegExp("(^|[^\\p{L}])" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u").test(s);
    };
    return list.find((f) => f.match.some(hit)) || C.faq.find((f) => f.id === "fallback");
  }
  async function ask(q, c, lang) {
    const { T, F, C, data } = Store.S;
    const flag = Rules.redFlag(F, q, lang);
    const fem = lang === "ar" && c.sex === "female";
    if (flag) { const A = F[flag.kind] && F[flag.kind].answer; return { kind: "flag", flag, text: (fem && A && A.ar_f) || flag.answer, noAI: true }; }
    const faq = matchFaq(C, c.result.test, q);
    const prepared = { kind: "answer", text: (fem && faq.ar_f) || faq[lang] || faq.en, c: (faq.c && (faq.c[lang] || faq.c.en)) || "", src: faq.src.map((s) => C.sources[s]).filter(Boolean), via: "prepared", faqId: faq.id };
    if (!data.aiUrl) return prepared;
    try {
      const ctx = { result: { test: c.result.test, zone: c.result.zone, level: c.result.level, next: c.result.next, windowDays: c.result.windowDays, compare: c.result.compare, source: c.result.source },
        content: C.faq.filter((f) => f.test === c.result.test || f.test === "*").map((f) => ({ id: f.id, text: (fem && f.ar_f) || f[lang] || f.en, src: f.src })) };
      const r = await fetch(data.aiUrl.replace(/\/$/, "") + "/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q, lang, ctx }), signal: AbortSignal.timeout(9000) });
      const j = await r.json();
      if (j.error === "red_flag") { const f2 = Rules.redFlag(F, "heavy bleeding", lang); return { kind: "flag", flag: f2, text: f2.answer, noAI: true }; }
      if (!r.ok || j.error || !j.a) return { ...prepared, why: j.error || r.status };
      const ids = Array.isArray(j.src) ? j.src : [];
      const srcs = ids.flatMap((id) => (C.faq.find((f) => f.id === id) || { src: [] }).src).map((s) => C.sources[s]).filter(Boolean);
      return { kind: "answer", text: j.a, c: (j.c || "").replace(/^Compared with:\s*/i, ""), src: [...new Set(srcs)], via: "ai", raise: !!j.raise };
    } catch (e) { return { ...prepared, why: "network" }; }
  }
  // Voice: read aloud with the browser voice; voice input with the browser speech recognition (Chrome, Edge, Safari).
  // Pick the most natural voice the device has for the language: neural/online voices first, then the preferred
  // region (ar-AE, ar-SA; en-GB, en-US), then any voice of that language. Voices load late in some browsers.
  let voices = [];
  const loadVoices = () => { try { voices = speechSynthesis.getVoices() || []; } catch (e) { voices = []; } return voices; };
  if ("speechSynthesis" in window) { loadVoices(); speechSynthesis.addEventListener && speechSynthesis.addEventListener("voiceschanged", loadVoices); }
  function bestVoice(lang) {
    const base = lang === "ar" ? "ar" : "en", regions = lang === "ar" ? ["ar-ae", "ar-sa"] : ["en-gb", "en-us"];
    const list = (voices.length ? voices : loadVoices()).filter((v) => v.lang && v.lang.toLowerCase().replace("_", "-").startsWith(base));
    const score = (v) => {
      const n = v.name || "", l = v.lang.toLowerCase().replace("_", "-");
      let s = 0;
      if (/natural|neural|online/i.test(n)) s += 40;
      if (/premium|enhanced/i.test(n)) s += 30;
      if (/google|siri/i.test(n)) s += 20;
      if (regions.includes(l)) s += 10 - regions.indexOf(l);
      if (/compact|espeak|robot/i.test(n)) s -= 30;
      return s;
    };
    return list.sort((a, b) => score(b) - score(a))[0] || null;
  }
  // Gemini voice through our Worker (opts.ai = text is an approved card text or assistant answer, never a red flag
  // or a name). 6 s timeout; on any failure the browser voice reads it. The page labels it "AI-generated voice".
  let audio = null;
  async function aiVoice(text, lang) {
    const url = Store.S.data.aiUrl; if (!url) return false;
    try {
      const r = await fetch(url.replace(/\/$/, "") + "/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: String(text).slice(0, 600), lang }), signal: AbortSignal.timeout(6000) });
      if (!r.ok || !/audio/.test(r.headers.get("content-type") || "")) return false;
      const blob = await r.blob(); if (audio) { audio.pause(); URL.revokeObjectURL(audio.src); }
      audio = new Audio(URL.createObjectURL(blob)); await audio.play(); return true;
    } catch (e) { return false; }
  }
  function speak(text, lang, onend, opts) {
    if (opts && opts.ai && Store.S.data.aiUrl) {
      if ("speechSynthesis" in window) speechSynthesis.cancel();
      aiVoice(text, lang).then((ok) => { if (ok) { if (opts.onAI) opts.onAI(); } else speak(text, lang, onend); });
      return true;
    }
    if (audio) { audio.pause(); }
    if (!("speechSynthesis" in window)) return false;
    speechSynthesis.cancel();
    const go = () => {
      const u = new SpeechSynthesisUtterance(String(text).replace(/<[^>]+>/g, " "));
      const v = bestVoice(lang);
      u.lang = v ? v.lang : lang === "ar" ? "ar-SA" : "en-GB"; if (v) u.voice = v;
      u.rate = 0.97; u.pitch = 1;
      u.onend = onend || null;
      speechSynthesis.speak(u);
    };
    // First use: wait briefly for the voice list, then speak with whatever is there.
    if (!loadVoices().length) { let done = false; const once = () => { if (done) return; done = true; go(); }; speechSynthesis.addEventListener && speechSynthesis.addEventListener("voiceschanged", once, { once: true }); setTimeout(once, 600); }
    else go();
    return true;
  }

  function listen(lang, onText, onEnd) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    const r = new SR(); r.lang = lang === "ar" ? "ar-AE" : "en-US"; r.interimResults = false; r.maxAlternatives = 1;
    r.onresult = (e) => onText(e.results[0][0].transcript);
    r.onend = onEnd; r.onerror = onEnd;
    r.start();
    return r;
  }
  window.Agent = { ask, speak, listen, matchFaq };
})();
