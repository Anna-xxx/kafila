// Demo state: cases, audit log, patient chats, demo clock. Kept in localStorage so two tabs (patient + care team) stay in sync.
// Nothing is sent to real phone numbers. All data is synthetic.
(function () {
  const KEY = "screenpath-demo-v6", DAY = 86400000;
  const S = { data: null, T: null, F: null, C: null, base: null, listeners: [] };
  const STATE_NAMES = {
    issued: "Result issued", assigned: "Assigned", notified: "Patient notified", acknowledged: "Acknowledged and understood",
    confirmation: "Confirmation / consultation", referral: "Referral sent → accepted", booked: "Appointment booked",
    attended: "Attended, outcome recorded", closed: "Closed"
  };
  const CLOSE_REASONS = [
    ["completed_normal", "Completed: normal / benign", true],
    ["completed_surveillance", "Completed with surveillance plan", true],
    ["treatment_started", "Treatment started (primary care, specialist or oncology)", true],
    ["confirmed_normal_repeat", "Confirmed normal on repeat test", true],
    ["declined", "Declined (informed refusal documented)", true],
    ["treated_elsewhere", "Treated elsewhere (report or Malaffi record)", true],
    ["moved_abroad", "Moved abroad", true],
    ["lost", "Lost to follow-up (≥3 attempts, ≥2 channels, ≥30 days, incl. call and letter)", true],
    ["deceased", "Deceased", true]
  ];
  async function load() {
    const get = (p) => fetch(p, { cache: "no-store" }).then((r) => r.json());
    const [T, F, C, cases, R] = await Promise.all([get("data/thresholds.json"), get("data/red-flags.json"), get("data/content.json"), get("data/cases.json"), get("data/roster.json")]);
    S.T = T; S.F = F; S.C = C; S.R = R; S.base = Date.parse(cases.now); S.seed = cases;
    let saved = null; try { saved = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}
    S.data = saved && saved.v === 1 ? saved : fresh();
    // Two versions, one build (Anna 18 Nov): no parameter = patient phones in English; ?lang=ar = in Arabic. Staff stay English.
    const ver = version(); if (S.data.version !== ver) { S.data.version = ver; S.data.lang = ver; }
    const q = new URLSearchParams(location.search).get("ai"); if (q) S.data.aiUrl = q; else if (!S.data.aiUrl && window.SCREENPATH_AI) S.data.aiUrl = window.SCREENPATH_AI;
    window.addEventListener("storage", (e) => { if (e.key === KEY) { try { S.data = JSON.parse(e.newValue); emit(); } catch (x) {} } });
  }
  function urlLang() { const q = new URLSearchParams(location.search).get("lang") || ((location.hash.match(/[?&]lang=(ar|en)\b/) || [])[1]); return q === "ar" || q === "en" ? q : null; }
  function version() {
    const u = urlLang(); let v = u;
    if (!v) { try { v = sessionStorage.getItem("kafila-ver"); } catch (e) {} }
    v = v === "ar" ? "ar" : "en"; try { sessionStorage.setItem("kafila-ver", v); } catch (e) {}
    return v;
  }
  function fresh() {
    const ver = version();
    return { v: 1, lang: ver, version: ver, persona: "C-1042", clockDays: 0, aiUrl: new URLSearchParams(location.search).get("ai") || window.SCREENPATH_AI || "", role: "coordinator",
      cases: JSON.parse(JSON.stringify(S.seed.cases)), log: [], chats: {}, ui: {} };
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S.data)); } catch (e) {} emit(); }
  function emit() { S.listeners.forEach((f) => f()); }
  const now = () => S.base + S.data.clockDays * DAY;
  const byId = (id) => S.data.cases.find((c) => c.id === id);
  function log(caseId, who, what, kind) {
    // One clock for the phone and the log: an entry is never earlier than the latest chat message of that case (BA F12).
    const ch = (S.data.chats && S.data.chats[caseId]) || [], last = ch.length ? Math.max(...ch.map((m) => m.at || 0)) : 0;
    S.data.log.push({ at: new Date(Math.max(now(), last)).toISOString(), caseId, who, what, kind: kind || "info" });
  }
  // Duty roster: which doctor is free for a same-day call, in whole blocks (GST). The deadline is passed in from the rules.
  const GST = 4 * 3600000, H = 3600000;
  const dayStart = (ms) => Math.floor((ms + GST) / DAY) * DAY - GST;
  const hm = (t) => { const [h, m] = t.split(":").map(Number); return (h * 60 + m) * 60000; };
  const bookings = () => (S.data.callBook = S.data.callBook || {});
  function docFree(doc, start, caseId) {
    const d = S.R.doctors[doc], d0 = dayStart(start), end = start + S.R.blockMinutes * 60000;
    if (start < d0 + hm(d.shift[0]) || end > d0 + hm(d.shift[1])) return false;
    if (d.busy.some(([f, t]) => start < d0 + hm(t) && end > d0 + hm(f))) return false;
    const who = bookings()[start + "|" + doc];
    return !who || who === caseId;
  }
  // Free call blocks between `from` and `deadline`. Preferred doctor first, then the roster order, one doctor per block.
  function callBlocks(from, deadline, prefer, caseId) {
    const order = [prefer, ...S.R.callbackOrder].filter((d, i, a) => d && S.R.doctors[d] && a.indexOf(d) === i), out = [];
    // The current hour counts if at least 30 min of it are left. The last window ends at least 30 min before the
    // deadline, so a missed call can still be retried in time.
    const M = 60000, five = 5 * M;
    for (let t = Math.floor(from / H) * H; t + S.R.blockMinutes * M <= deadline - 30 * M; t += H) {
      const end = t + S.R.blockMinutes * M; if (end - from < 30 * M) continue;
      const doc = order.find((d) => docFree(d, t, caseId));
      if (doc) out.push({ start: Math.max(t, Math.ceil(from / five) * five), block: t, end, doc, short: S.R.doctors[doc].short });
    }
    return out;
  }
  function bookCall(c, b) {
    const B = bookings(); Object.keys(B).forEach((k) => { if (B[k] === c.id) delete B[k]; });
    B[(b.block || b.start) + "|" + b.doc] = c.id; c.callSlot = { start: b.start, end: b.end, doc: b.doc };
    if (c.state !== "closed") c.owner = b.doc;
  }
  function rosterDay(ms) {
    const d0 = dayStart(ms), B = bookings();
    return Object.entries(S.R.doctors).map(([doc, d]) => ({ doc, short: d.short, shift: d.shift, busy: d.busy,
      booked: Object.entries(B).filter(([k]) => k.endsWith("|" + doc) && dayStart(+k.split("|")[0]) === d0).map(([k, id]) => ({ start: +k.split("|")[0], caseId: id })) }));
  }
  function current(c) { return c.history[c.history.length - 1]; }
  function daysInState(c) { return (now() - Date.parse(current(c).at)) / DAY; }
  function slaFor(c) {
    const urgent = c.track === "urgent";
    if (c.state === "referral" && c.accepted) return urgent ? 3 : 7;
    if (urgent) return ({ assigned: 2 / 24, notified: 1, acknowledged: 1, confirmation: 1, referral: 1, booked: 3 })[c.state] ?? null;
    return S.seed.slaDays[c.state] ?? null;
  }
  // FIT+ uses two national-guideline clocks in working days (MOHAP 2022, 12.5.2 / App. 2; Anna 18 Nov):
  // referral within 15 working days of the result, colonoscopy within 31 working days of the referral.
  // Mon-Fri are working days (UAE weekend Sat-Sun); public holidays are ignored in the demo. A returned referral
  // does not restart clock 2: it runs from the first referral. Other results use the rules-table window in days.
  const isWorkday = (ms) => { const d = new Date(ms + GST).getUTCDay(); return d !== 0 && d !== 6; };
  function addWorkdays(ms, n) { let t = ms, k = 0; while (k < n) { t += DAY; if (isWorkday(t)) k++; } return t; }
  function workdaysBetween(a, b) { let n = 0, t = a; while (t + DAY <= b) { t += DAY; if (isWorkday(t)) n++; } return n; }
  function fitClocks(c) {
    if (!c.result.referralWorkdays) return null;
    const iss = Date.parse(c.history[0].at), at = (st) => { const h = c.history.find((x) => x.state === st); return h ? Date.parse(h.at) : null; };
    const refAt = at("referral"), refBy = addWorkdays(iss, c.result.referralWorkdays);
    return { iss, refBy, refAt, careBy: addWorkdays(refAt ?? refBy, c.result.careWorkdays), careAt: at("attended"), projected: !refAt };
  }
  // "In time" for the dashboard: FIT+ = both clocks met; others = inside the rules-table window.
  function inTime(c, doneAt) {
    const f = fitClocks(c);
    if (f) return !!f.refAt && f.refAt <= f.refBy && (f.careAt || doneAt) <= f.careBy;
    return (doneAt - Date.parse(c.history[0].at)) / DAY <= windowOf(c);
  }
  function windowOf(c) { return c.result.windowDays || 30; }
  const openConsult = (c) => (c.econsult || []).find((e) => e.urgency && !e.answered) || null;
  function status(c) {
    const sla = slaFor(c), d = daysInState(c), q = c.state !== "closed" && openConsult(c);
    const open = c.state !== "closed", notDone = open && !["attended", "closed"].includes(c.state);
    const f = fitClocks(c), hard = null;
    let issued = Date.parse(c.history[0].at), win = windowOf(c), fit = null;
    if (f) {
      const phase = f.refAt ? 2 : 1, start = phase === 1 ? f.iss : f.refAt, end = phase === 1 ? f.refBy : f.careBy;
      issued = start; win = (end - start) / DAY;
      fit = { phase, end, label: phase === 1 ? "Referral" : "Colonoscopy", wdLeft: workdaysBetween(now(), end), wdOver: now() > end ? workdaysBetween(end, now()) : 0, ...f };
    }
    const age = (now() - issued) / DAY, rawPct = Math.round(age / win * 100);
    return {
      sla, days: d, overdue: open && ((sla !== null && sla > 0 && d > sla) || (!!q && now() > q.dueAt)), consultLate: !!q && now() > q.dueAt, ladder: open && sla ? (d > 2 * sla ? 2 : d > sla ? 1 : 0) : 0,
      win, hard, age, rawPct, fit, clockPct: Math.min(100, rawPct), overBy: Math.max(0, Math.ceil(age - win)),
      escalated: notDone && rawPct >= 75, hardLimit: notDone && !!hard && age >= hard,
      unassigned: open && !c.owner, contact: open && !!c.notMe && !c.contactChecked, human: open && !!(c.human || c.callback) && !c.humanDone, rejected: open && !!c.rejected, urgent: open && (c.track === "urgent" || c.result.level === "L3" || c.result.level === "L4" || !!c.redFlag)
    };
  }
  // Owner per state. After the patient books, the owner is the clinic and doctor of the held slot (BA L4).
  function specialistOf(c) {
    if (c.slot) return c.slot.clinic + " · " + c.slot.doc;
    if (c.referral && c.referral.to) return c.referral.to;
    return c.result.test === "HPV" ? "Gynae Clinic · Dr. Rana T." : c.result.test === "FIT" ? "GI Clinic · Dr. Omar K." : "GP · Dr. Hessa M.";
  }
  // Urgent results are owned by a named doctor while we wait for the patient: the booked call doctor, else the family doctor.
  function urgentDoc(c) {
    if (!(c.track === "urgent" || c.result.level === "L3" || c.result.level === "L4")) return "Coordinator · Noura A.";
    return c.callSlot ? c.callSlot.doc : "GP · Dr. Hessa M.";
  }
  function move(c, state, who, note) {
    c.state = state;
    c.history.push({ state, at: new Date(now()).toISOString(), by: who, note: note || "" });
    const urg = c.track === "urgent" || c.result.level === "L3" || c.result.level === "L4";
    const OWNER = { assigned: urg ? urgentDoc(c) : "Coordinator · Noura A.", notified: urg ? urgentDoc(c) : "Coordinator · Noura A.", acknowledged: urgentDoc(c), confirmation: "GP · Dr. Hessa M.",
      referral: specialistOf(c), booked: specialistOf(c), attended: specialistOf(c), closed: "GP · Dr. Hessa M." };
    c.owner = OWNER[state] || c.owner;
    log(c.id, who, "State → " + STATE_NAMES[state] + (note ? " (" + note + ")" : ""), "state");
  }
  function reset() { S.data = fresh(); save(); }
  // One patient back to the start (BA, 20 Nov: choosing "Fatima" after "Fatima, later" must start her from the beginning).
  function resetCase(id) {
    const i = S.data.cases.findIndex((c) => c.id === id), seed = S.seed.cases.find((c) => c.id === id); if (i < 0 || !seed) return;
    S.data.cases[i] = JSON.parse(JSON.stringify(seed)); S.data.log = S.data.log.filter((l) => l.caseId !== id); if (S.data.chats) delete S.data.chats[id];
  }
  window.Store = { S, fitClocks, inTime, addWorkdays, workdaysBetween, openConsult, callBlocks, bookCall, rosterDay, windowOf, specialistOf, load, save, log, now, byId, status, move, reset, resetCase, current, daysInState, STATE_NAMES, CLOSE_REASONS, DAY, on: (f) => S.listeners.push(f) };
})();
