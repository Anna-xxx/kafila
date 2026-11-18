// Makes synthetic cases for the demo. Run: node tools/make-cases.js > data/cases.json
// All people, results and clinics are invented. Seeded random, so the file is the same each run.
const R = require("../js/rules.js"), T = require("../data/thresholds.json");
let seed = 20261117; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const STATES = ["issued", "assigned", "notified", "acknowledged", "confirmation", "referral", "booked", "attended", "closed"];
const SLA_DAYS = { issued: 0, assigned: 1, notified: 2, acknowledged: 5, confirmation: 14, referral: 3, booked: 7, attended: 30, closed: null };
const OWNER = { issued: "Lab · Central Lab (demo)", assigned: "Coordinator · Noura A.", notified: "Coordinator · Noura A.", acknowledged: "Coordinator · Noura A.", confirmation: "GP · Dr. Hessa M.", referral: "GI Clinic · Dr. Omar K.", booked: "GI Clinic · Dr. Omar K.", attended: "GI Clinic · Dr. Omar K.", closed: "GP · Dr. Hessa M." };
const NOW = Date.parse("2026-11-17T09:00:00+04:00"), DAY = 86400000;
const demo = [
  { id: "C-1042", name: "Fatima A.", age: 52, sex: "female", lang: "ar", nationality: "Emirati", insurance: "Government plan (demo)", area: "Khalifa City", test: { test: "FIT", result: "positive" }, state: "notified", daysInState: 0, gp: "Dr. Hessa M.", clinic: "Khalifa City Family Health Centre", channel: "WhatsApp", booking: { day: "Saturday", time: "10:00", clinicianGender: "female", specialty: "Gastroenterology" }, demo: "hero" },
  { id: "C-1043", name: "Rajesh K.", age: 45, sex: "male", lang: "en", nationality: "Indian", insurance: "Basic", area: "Mussafah", test: { test: "BP", sys: 185, dia: 115, second: true }, state: "assigned", daysInState: 0, gp: "Dr. Hessa M.", clinic: "Khalifa City Family Health Centre", channel: "WhatsApp", demo: "urgent" },
  { id: "C-1044", name: "Maria S.", age: 38, sex: "female", lang: "en", nationality: "Filipino", insurance: "Enhanced", area: "Al Reem", test: { test: "HPV", result: "positive_16_18" }, state: "referral", daysInState: 1, rejected: { by: "Gynae Clinic · Dr. Rana T.", reason: "Not our service", rerouteWithinWorkingDays: 2 }, demo: "rejected" },
  { id: "C-1045", name: "Ahmed H.", age: 61, sex: "male", lang: "ar", nationality: "Emirati", insurance: "Government plan (demo)", area: "Al Ain", test: { test: "FIT", result: "positive" }, state: "notified", daysInState: 6, gp: "Dr. Yousef T.", clinic: "Al Ain Family Health Centre", channel: "WhatsApp", retries: [{ day: 2, channel: "WhatsApp", ok: false }, { day: 4, channel: "SMS", ok: false }, { day: 5, channel: "Coordinator call", ok: false }], demo: "overdue" },
  { id: "C-1046", name: "Sara M.", age: 34, sex: "female", lang: "en", nationality: "Egyptian", insurance: "Enhanced", area: "Al Bateen", test: { test: "HPV", result: "positive_16_18" }, state: "booked", daysInState: 5 },
  { id: "C-1047", name: "Khalid R.", age: 55, sex: "male", lang: "ar", nationality: "Emirati", insurance: "Government plan (demo)", area: "Yas", test: { test: "BP", sys: 186, dia: 112, second: true }, state: "assigned", daysInState: 0 },
  { id: "C-1048", name: "Priya N.", age: 44, sex: "female", lang: "en", nationality: "Indian", insurance: "Basic", area: "Mussafah", test: { test: "HBA1C", value: 6.8, unit: "%" }, state: "confirmation", daysInState: 3 },
];
const first = { female: ["Aisha", "Mariam", "Noor", "Latifa", "Anjali", "Grace", "Fatma", "Reem", "Joy", "Huda"], male: ["Saeed", "Ali", "Omar", "Ravi", "Jose", "Hamad", "Imran", "Yousef", "Arjun", "Mark"] };
const nat = [["Emirati", "ar", "Government plan (demo)"], ["Indian", "en", "Basic"], ["Pakistani", "en", "Basic"], ["Filipino", "en", "Basic"], ["Egyptian", "ar", "Enhanced"], ["British", "en", "Enhanced"], ["Jordanian", "ar", "Enhanced"]];
const tests = [{ test: "FIT", result: "positive" }, { test: "FIT", result: "positive" }, { test: "FIT", result: "positive" }, { test: "HPV", result: "positive_16_18" }, { test: "HPV", result: "positive_other" }, { test: "HBA1C", value: 6.7, unit: "%" }, { test: "BP", sys: 164, dia: 102 }];
const reasons = ["fear", "cost", "time off work", "prep worries", "transport", "no reason given"];
const people = [...demo];
for (let i = 0; i < 213; i++) {
  const sex = rnd() < 0.5 ? "female" : "male", [n, lang, ins] = pick(nat);
  let t = pick(tests); if (t.test === "HPV" && sex === "male") t = tests[0];
  const st = STATES[Math.min(8, Math.floor(rnd() * 10))];
  people.push({ id: "C-" + (2000 + i), name: pick(first[sex]) + " " + String.fromCharCode(65 + Math.floor(rnd() * 26)) + ".", age: 40 + Math.floor(rnd() * 35), sex, lang, nationality: n, insurance: ins, area: pick(["Khalifa City", "Mussafah", "Al Reem", "Al Ain", "Yas", "Al Bateen", "Shakhbout"]), test: t, state: st, daysInState: Math.floor(rnd() * 5), barrier: rnd() < 0.6 ? pick(reasons) : null, lost: st !== "closed" && rnd() < 0.08 });
}
// Demo stories added 18 Nov (HPV, HbA1c). Appended after the random cases so those stay the same.
people.push(
  { id: "C-1049", name: "Mariam S.", age: 38, sex: "female", lang: "ar", nationality: "Emirati", insurance: "Government plan (demo)", area: "Khalifa City", test: { test: "HPV", result: "positive_16_18" }, state: "assigned", daysInState: 0, gp: "Dr. Hessa M.", clinic: "Khalifa City Family Health Centre", channel: "WhatsApp", demo: "hpv" },
  { id: "C-1050", name: "Salem K.", age: 55, sex: "male", lang: "en", nationality: "Jordanian", insurance: "Enhanced", area: "Al Reem", test: { test: "HBA1C", value: 7.2, unit: "%" }, state: "assigned", daysInState: 0, gp: "Dr. Hessa M.", clinic: "Khalifa City Family Health Centre", channel: "WhatsApp", demo: "hba1c" }
);
const cases = people.map((p) => {
  const c = R.classify(T, p.test, p);
  const idx = STATES.indexOf(p.state);
  let t = NOW - p.daysInState * DAY;
  const history = [];
  const skip5 = (p.test.test === "FIT" && p.test.result === "positive") || (p.test.test === "HPV" && p.test.result === "positive_16_18");
  const urgent = c.level === "L3" || c.level === "L4";
  // The owner is always a named person, never "Patient". Urgent results are owned by a doctor while waiting for the patient.
  const own = (st) => { const o = OWNER[st]; if (urgent && ["assigned", "notified", "acknowledged"].includes(st)) return "GP · Dr. Hessa M."; if (p.test.test === "HPV") return o.replace("GI Clinic · Dr. Omar K.", "Gynae Clinic · Dr. Rana T."); if (["BP", "HBA1C"].includes(p.test.test) && /GI Clinic/.test(o)) return "GP · Dr. Hessa M."; return o; };
  for (let k = idx; k >= 0; k--) { if (skip5 && STATES[k] === "confirmation") continue; history.unshift({ state: STATES[k], at: new Date(t).toISOString(), by: own(STATES[k]) }); const gap = (1 + Math.floor(rnd() * 3)) * DAY; t -= urgent ? 30 * 60000 : gap; } // urgent steps are minutes apart, not days
  const sla = SLA_DAYS[p.state], overdue = sla !== null && sla > 0 && p.daysInState > sla;
  const issued = Date.parse(history[0].at);
  const track = c.level === "L3" || c.level === "L4" ? "urgent" : "routine";
  const windowDays = c.trackUntil ? 180 : (c.windowDays || 30), clockPct = Math.round(((NOW - issued) / DAY) / windowDays * 100);
  const escalated = p.state !== "closed" && p.state !== "attended" && clockPct >= 75;
  return { ...p, track, clockPct, escalated, result: c, owner: p.state === "issued" ? null : p.rejected ? "GP · Dr. Hessa M." : own(p.state), history, slaDays: sla, overdue, daysSinceResult: Math.round((NOW - issued) / DAY), synthetic: true };
});
// Seeded outcome fields for the R6 measures (treatment initiation, understanding, confidence). A separate random
// stream, so the cases above stay the same. Synthetic, not measured.
let seed2 = 1117; const rnd2 = () => ((seed2 = (seed2 * 1103515245 + 12345) % 2147483648) / 2147483648);
const pickW = (opts) => { let r = rnd2(); for (const [v, w] of opts) { if ((r -= w) < 0) return v; } return opts[opts.length - 1][0]; };
const REASON_LABEL = { completed_normal: "Completed: normal / benign", completed_surveillance: "Completed with surveillance plan", treatment_started: "Treatment started (primary care, specialist or oncology)", confirmed_normal_repeat: "Confirmed normal on repeat test", declined: "Declined (informed refusal documented)", treated_elsewhere: "Treated elsewhere (report or Malaffi record)" };
for (const c of cases) {
  if (c.demo) continue;
  const i = STATES.indexOf(c.state), t = c.result.test;
  if (i >= STATES.indexOf("acknowledged")) c.teachBack = pickW([["correct", 0.62], ["corrected", 0.26], ["skipped", 0.12]]);
  if (c.state === "closed") {
    const r = ["BP", "HBA1C"].includes(t) ? pickW([["treatment_started", 0.55], ["confirmed_normal_repeat", 0.4], ["declined", 0.05]])
      : pickW([["completed_normal", 0.45], ["completed_surveillance", 0.3], ["treatment_started", 0.1], ["treated_elsewhere", 0.1], ["declined", 0.05]]);
    c.closure = { reason: r, reasonLabel: REASON_LABEL[r], evidence: "synthetic report", by: "GP · Dr. Hessa M." };
    if (rnd2() < 0.7) c.feedback = { a: pickW([[3, 0.7], [2, 0.22], [1, 0.08]]), b: pickW([[3, 0.6], [2, 0.3], [1, 0.1]]) };
  }
}
console.log(JSON.stringify({ _about: "Synthetic demo data. No real people. Generated by tools/make-cases.js. SLAs per BA v1.3 §4.5 (assumptions [A]).", now: new Date(NOW).toISOString(), states: STATES, slaDays: SLA_DAYS, cases }, null, 1));
