// ScreenPath rules engine.
// The zone and level come from data/thresholds.json, never from AI. AI only explains.
// Uncertainty goes up, never down. Red flags beat results.
(function (root) {
  const LEVEL_ORDER = ["L1", "L2", "L3", "L4"];
  const maxLevel = (...ls) => ls.filter(Boolean).reduce((a, b) => (LEVEL_ORDER.indexOf(b) > LEVEL_ORDER.indexOf(a) ? b : a), "L1");

  // Context gates (clinical pack §2): under 18, pregnant, already diagnosed, on treatment, unknown unit → doctor, never a guess.
  function gate(T, person, test) {
    const p = person || {}, t = T.tests[test];
    if (!t) return "unsupported_test";
    if (p.age !== undefined && p.age < T.gates.minAge) return "under_18";
    if (p.pregnant) return "pregnant";
    if ((p.diagnosed || []).includes(test)) return "already_diagnosed";
    if ((p.onTreatment || []).includes(test)) return "on_treatment";
    if (t.sex && p.sex && p.sex !== t.sex) return "not_eligible";
    return null;
  }

  function band(T, test, r) {
    const t = T.tests[test];
    if (test === "HBA1C") {
      if (typeof r.value !== "number" || (r.unit && r.unit !== "%")) return null;
      return t.bands.find((b) => r.value < b.below) || null;
    }
    if (test === "BP") {
      if (typeof r.sys !== "number" || typeof r.dia !== "number") return null;
      return t.bands.find((b) => r.sys >= b.sysAtLeast || (b.diaAtLeast !== null && r.dia >= b.diaAtLeast)) || null;
    }
    return t.results[r.result] || null;
  }

  // classify({test, result|value|sys/dia, unit}, person) → what the screen shows
  function classify(T, r, person) {
    const g = gate(T, person, r.test);
    const t = T.tests[r.test];
    const b = g ? null : band(T, r.test, r);
    if (g || !b) {
      return { test: r.test, ok: false, reason: g || "unknown_value", level: "L2", zone: "yellow", next: "talk_to_doctor",
        windowDays: 14, compare: "This explanation may not apply to you. Please talk to your doctor. We can help you book.",
        source: t ? t.source : "", rulesVersion: T.version };
    }
    const lv = T.levels[b.level];
    const out = { test: r.test, ok: true, category: b.category || r.result, level: b.level, zone: lv.zone,
      next: b.next, windowDays: b.referralWorkdays ? null : b.windowDays ?? lv.windowDays, nextMonths: b.nextMonths || null,
      referralWorkdays: b.referralWorkdays || null, careWorkdays: b.careWorkdays || null, escalatePct: b.escalatePct || 75, clockSource: b.clockSource || null,
      compare: b.compare, compareAr: b.compare_ar || null, source: t.source, rulesVersion: T.version, trackUntil: b.trackUntil || null };
    out.ruleRow = r.test + " · " + (b.category || r.result);
    out.ruleText = r.test === "BP" ? (b.diaAtLeast === null ? `systolic ≥ ${b.sysAtLeast}` : b.sysAtLeast === 0 ? "below all higher rows" : `systolic ≥ ${b.sysAtLeast} or diastolic ≥ ${b.diaAtLeast}`)
      : r.test === "HBA1C" ? `HbA1c below ${b.below}% (first matching row)` : `result = ${r.result}`;
    if (r.test === "BP" && !r.second) out.note = t.singleReadingNote;
    if (r.test === "HBA1C" && person && person.hbVariant) out.note = t.caveat;
    return out;
  }

  // Red flags: plain phrase match, Arabic and English, checked BEFORE any AI call.
  // Normalise before matching: no apostrophes ("can't" = "cant"), Arabic letter variants (أ إ آ → ا, ة → ه, ى → ي),
  // no tashkeel or tatweel, single spaces. This only widens what is caught.
  const norm = (s) => String(s || "").toLowerCase().replace(/['’`]/g, "")
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
    .replace(/\s+/g, " ").trim();
  function redFlag(F, text, lang) {
    const s = norm(text);
    for (const k of ["L4", "MH", "L3", "HUMAN"]) {
      const words = [...(F[k].en || []), ...(F[k].ar || [])];
      const hit = words.find((w) => s.includes(norm(w)));
      if (hit) return { kind: k, phrase: hit, answer: F[k].answer[lang] || F[k].answer.en, noAI: true };
    }
    return null;
  }

  // The level on a case: result level, raised by red flags. AI may raise, never lower.
  function caseLevel(resultLevel, flag, aiSuggested) {
    const f = flag ? ({ L4: "L4", L3: "L3", MH: "L4" })[flag.kind] : null;
    return maxLevel(resultLevel, f, aiSuggested);
  }

  const api = { classify, redFlag, caseLevel, maxLevel, gate };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Rules = api;
})(this);
