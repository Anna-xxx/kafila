// Care-team side: worklist with exception queues, case timeline with owner/SLA per step, referral accept/reject,
// outcome and closure with evidence. AI never closes a case and never proposes "lost to follow-up".
(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]);
  const ROLES = { coordinator: "Coordinator · Noura A.", gp: "GP · Dr. Hessa M.", specialist: "Specialist · Dr. Omar K. / Dr. Rana T.", lead: "Programme lead · Dr. Khalid S.", clinlead: "Clinical lead · Dr. Mona S. (duty)" };
  // Urgent clinical escalation goes to the clinical (duty) lead; the programme lead sees it on the dashboard (BA F11).
  const CLIN_LEAD = ROLES.clinlead;
  // The specialist role acts for the receiving clinic's triage doctor (BA F10).
  const triageOf = (c) => c.result.test === "HPV" ? "Dr. Rana T." : c.result.test === "FIT" ? "Dr. Omar K." : null;
  const recvClinic = (c) => c.slot ? c.slot.clinic : c.referral && c.referral.to ? c.referral.to.split(" · ")[0] : null;
  const ORDER = ["issued", "assigned", "notified", "acknowledged", "confirmation", "referral", "booked", "attended", "closed"];
  const TESTN = { FIT: "FIT", HPV: "HPV", HBA1C: "HbA1c", BP: "BP" };
  const ZW = { green: "Routine", yellow: "See a doctor", red: "Urgent" };
  const fmt = (ms) => new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" });
  const dd = (d) => (d < 1 ? Math.round(d * 24) + " h" : d.toFixed(1) + " d");
  const ui = () => (Store.S.data.ui = Store.S.data.ui || {});

  // Time left on the current clock. FIT+: national-guideline clocks in working days. Never a % above 100 (BA L9).
  function left(c, s) {
    const u = urgentDue(c); if (u) return u.text;
    return winText(s);
  }
  const dShort = (ms) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Dubai" });
  const winText = (s) => { if (s.fit) { const f = s.fit; return f.wdOver ? `${f.label} overdue by ${f.wdOver} working day${f.wdOver === 1 ? "" : "s"} (deadline ${dShort(f.end)})` : `${f.label} by ${dShort(f.end)} · ${f.wdLeft} working day${f.wdLeft === 1 ? "" : "s"} left`; }
    const l = s.win - s.age; return l >= 0 ? `${Math.floor(l)} of ${s.win} days left` : `overdue by ${s.overBy} days (window ${s.win} days)${s.hardLimit ? " · past the 180-day hard limit" : ""}`; };
  const NEXT_W = { colonoscopy: "Colonoscopy", colposcopy: "Colposcopy", gp_confirm: "Family doctor confirms with a repeat test", gp_visit: "Family doctor visit", gyn_review: "Gynaecology review", remeasure_then_doctor_today: "Repeat reading and a doctor's call today" };
  const nextW = (c) => NEXT_W[c.result.next] || String(c.result.next).replace(/_/g, " ");
  // Urgent same-day call: the deadline is in hours, from the rules (call within 4 h of notification).
  function urgentDue(c) {
    if (c.result.next !== "remeasure_then_doctor_today" || c.state === "closed" || c.callOutcome || !window.Patient) return null;
    const b = Patient.callBy(c); if (b.late) return { text: "call by 10:00 tomorrow", late: false };
    const h = (b.ms - Store.now()) / 3600000, t = new Date(b.ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" });
    return h >= 0 ? { text: `call by ${t} today · ${h >= 1 ? Math.floor(h) + " h" : Math.round(h * 60) + " min"} left`, late: false } : { text: `call was due ${t} · ${Math.ceil(-h)} h late`, late: true };
  }
  // Same-day call outcomes (urgent BP) and GP visit outcomes, each mapped to the closure reason it allows (BA L1, L2, L7).
  const CALL_OUT = [
    ["BP confirmed high: treatment started in primary care", "treatment_started"],
    ["Repeat reading normal: recheck date set", "confirmed_normal_repeat"],
    ["Sent to the emergency department", "treated_elsewhere"]
  ];
  const GP_OUT = [
    ["Confirmed: plan started in primary care", "treatment_started"],
    ["Normal on repeat test", "confirmed_normal_repeat"],
    ["Needs a specialist: send referral", ""]
  ];
  const ATT_OUT = {
    FIT: [["Colonoscopy normal: next in 10 years", "completed_normal"], ["Polyps removed: surveillance per pathology", "completed_surveillance"], ["Referred to oncology", "treatment_started"]],
    HPV: [["Colposcopy normal: back to routine screening", "completed_normal"], ["Low-grade change: surveillance in 12 months", "completed_surveillance"], ["High-grade change: treatment planned", "treatment_started"]],
    other: [["Specialist review: plan agreed", "treatment_started"], ["Specialist review: no change needed", "completed_normal"]]
  };
  const REFER_TO = {
    HPV: ["Al Reem Women's Clinic · Colposcopy · Dr. Huda F.", "Khalifa City Women's Clinic · Dr. Rana T."],
    FIT: ["Khalifa City GI Centre · Dr. Omar K.", "Mussafah Day Clinic (demo) · GI · Dr. Leena H."],
    BP: ["Internal Medicine Clinic (demo) · Dr. Sami N.", "Cardiology Clinic (demo) · Dr. Yara K."],
    HBA1C: ["Internal Medicine Clinic (demo) · Dr. Sami N.", "Diabetes Clinic (demo) · Dr. Nadia F."]
  };
  const CLINIC_LINE = "02 000 0000 (demo)";
  const x_reason = (c) => c.noRoster && !c.callOutcome ? "No doctor free: lead" : c.aiConcern ? "AI concern: clinician review" : c.fearCall ? "Nurse call: worried" : c.teachFlag ? "Nurse call: teach-back" : c.phonePref ? "Prefers phone call" : c.elsewhere ? "Report from elsewhere" : c.hesitant ? "Unsure about test" : (c.barriers || []).includes("notnow") ? "Unsure about test" : "Nurse callback";
  // Current step in words; the referral step says whether the clinic has accepted yet.
  const tGST = (ms) => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" });
  const callNote = (c) => c.state !== "closed" && c.callSlot && !c.callOutcome ? ` · ${c.callSlot.doc.replace(/^GP · /, "")} calls ${tGST(c.callSlot.start)}–${tGST(c.callSlot.end)}` : c.state !== "closed" && c.noRoster && !c.callOutcome ? " · no doctor free on roster: lead arranges call" : "";
  const stepNow = (c) => (c.state !== "referral" ? Store.STATE_NAMES[c.state] + callNote(c) : c.rejected ? "Referral rejected, re-route" : c.accepted ? "Referral accepted, waiting for booking" : "Referral sent, awaiting acceptance");
  const isUrgentBP = (c) => c.result.next === "remeasure_then_doctor_today";
  // Colonoscopy pre-assessment + prep (medic F8): owner the receiving GI centre, due 5 days before; at risk from 2 days before.
  const preDue = (c) => { if (c.state !== "booked" || c.result.next !== "colonoscopy" || !c.slot || c.prepIssued) return null; const appt = Date.parse(c.slot.day + "T" + c.slot.time + ":00+04:00"); return { by: appt - 5 * Store.DAY, risk: appt - 2 * Store.DAY, appt }; };
  const isGpPath = (c) => ["gp_confirm", "gp_visit"].includes(c.result.next);
  const talked = (c) => !!(c.humanDone || (c.callOutcome && c.callOutcome.answered) || [...(c.attempts || []), ...(c.retries || [])].some((x) => x.ok && /doctor|nurse|coordinator/i.test(x.channel)));
  // Worklist in plain words (BA part B): rows grouped under headings, 5 columns, one "Due" sentence, coloured row edge.
  const RESULT_WORDS = (c) => {
    const r = c.result, t = c.test || {};
    if (r.test === "FIT") return "Stool test positive";
    if (r.test === "HPV") return /16_18/.test(r.category || t.result || "") ? "HPV 16/18 positive" : "HPV positive (other types)";
    if (r.test === "HBA1C") return `Blood sugar high (HbA1c ${t.value ?? ""}%)`;
    if (r.test === "BP") return `Blood pressure ${r.level === "L3" ? "very high" : "high"} (${t.sys ?? ""}/${t.dia ?? ""})`;
    return r.test;
  };
  function waitingFor(c) {
    if (c.state === "closed") return "Closed";
    if (Store.openConsult(c)) return "Specialist's e-consult answer (" + Store.openConsult(c).urgency.toLowerCase() + ")";
    if (isUrgentBP(c) && !c.callOutcome && ["assigned", "notified", "acknowledged", "issued"].includes(c.state)) return c.state === "assigned" || c.state === "issued" ? "Message to patient, then doctor's call" : c.callSlot ? `Doctor's call at ${tGST(c.callSlot.start)}–${tGST(c.callSlot.end)}` : c.noRoster ? "Doctor's call: no doctor free, lead arranges" : "Doctor's call";
    return ({ issued: "Someone to take the case", assigned: "Message to patient", notified: "Patient to open the result",
      acknowledged: isGpPath(c) ? "GP visit or repeat test" : isUrgentBP(c) ? "Doctor's call" : "Patient to book",
      confirmation: c.outcome ? "Doctor to close the case" : isUrgentBP(c) ? "Doctor's call outcome" : "Doctor's visit or call",
      referral: c.rejected ? "Doctor to pick another clinic" : c.accepted ? "Booking" : "Clinic to accept referral",
      booked: c.slot ? "Appointment " + (c.slot.labelEn || "").split(" · ")[0] : "Appointment", attended: "Report, then closing" })[c.state] || Store.STATE_NAMES[c.state];
  }
  const who = (c) => c.owner ? c.owner.replace(/^(Coordinator|GP|Programme lead|Clinical lead|GI Clinic|Gynae Clinic|Specialist|Lab) · (.*)$/, "$2 · $1") : null;
  const STEP_W = { issued: "assignment", assigned: "contact", notified: "contact", acknowledged: "booking", confirmation: "doctor's", referral: "referral", booked: "visit", attended: "report" };
  function due(c, s) {
    if (c.state === "closed") return { text: "—" };
    const q = Store.openConsult(c);
    if (q) { const h = (q.dueAt - Store.now()) / 3600000; return h >= 0 ? { text: `e-consult answer in ${h >= 1 ? Math.floor(h) + " h" : Math.round(h * 60) + " min"}`, soon: h < 4 } : { text: `e-consult ${Math.ceil(-h)} h late`, late: true }; }
    const u = urgentDue(c); if (u) return { text: u.text, late: u.late };
    const pd = preDue(c), dd = (ms) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Dubai" });
    if (pd) return Store.now() >= pd.risk ? { text: "procedure at risk: pre-assessment + prep not done", late: true } : Store.now() >= pd.by ? { text: "pre-assessment + prep due now (procedure " + dd(pd.appt) + ")", soon: true } : { text: "pre-assessment + prep by " + dd(pd.by) };
    if (s.sla === null || !(s.sla > 0)) return { text: "no deadline for this step" };
    const left = s.sla - s.days, n = (x) => { const d = Math.round(Math.abs(x)); return d < 1 ? Math.max(1, Math.round(Math.abs(x) * 24)) + " h" : d + (d === 1 ? " day" : " days"); };
    return left < 0 ? { text: (STEP_W[c.state] || "step") + " step " + n(left) + " late", late: true } : left < 1 ? { text: "due today", soon: true } : { text: "in " + n(left) };
  }
  const GROUPS = [
    ["urgent", "Urgent: call today", (x) => x.s.urgent],
    ["late", "Late", (x) => x.s.overdue || x.s.hardLimit || x.s.escalated || (!!preDue(x.c) && Store.now() >= preDue(x.c).risk)],
    ["returned", "Referral returned", (x) => x.s.rejected],
    ["noowner", "No owner yet", (x) => x.s.unassigned],
    ["sign2", "Waiting for a second signature", (x) => !!x.c.pendingClose],
    ["consult", "E-consult waiting for the specialist", (x) => !!Store.openConsult(x.c)],
    ["call", "Patient needs a call or a contact check", (x) => x.s.human || x.s.contact],
    ["answer", "E-consult answers back", (x) => { const e = x.c.econsult || []; return e.length && e[e.length - 1].reply && !x.c.consultSeen; }],
    ["incoming", "New referrals to accept or reject", (x) => x.c.state === "referral" && !x.c.accepted],
    ["booking", "Accepted, waiting for booking", (x) => x.c.state === "referral" && x.c.accepted && !x.c.slot],
    ["close", "Outcome ready: close the case", (x) => x.c.state === "attended" || (x.c.state === "confirmation" && !!x.c.outcome)],
    ["preassess", "Pre-assessment + prep issued (GI centre)", (x) => !!preDue(x.c)],
    ["visit", "Visits to record the outcome", (x) => x.c.state === "booked"],
    ["waiting", "Waiting for patient", (x) => ["notified", "acknowledged"].includes(x.c.state)],
    ["track", "On track", () => true]
  ];
  const groupOf = (x) => GROUPS.find(([, , f]) => f(x))[0];
  function filtered(tab) {
    const cs = Store.S.data.cases.map((c) => ({ c, s: Store.status(c) })).map((x) => ({ ...x, g: x.c.state === "closed" ? "closed" : groupOf(x) }));
    const f = {
      mine: (x) => x.g !== "closed" && MINE[Store.S.data.role](x),
      action: (x) => !["waiting", "track", "closed", "visit"].includes(x.g), all: (x) => x.c.state !== "closed", closed: (x) => x.c.state === "closed", unassigned: (x) => x.s.unassigned,
      urgent: (x) => x.s.urgent, overdue: (x) => x.s.overdue, rejected: (x) => x.s.rejected, escalated: (x) => x.s.escalated
    }[tab] || ((x) => x.g !== "closed");
    const order = GROUPS.map((g) => g[0]).concat("closed");
    return cs.filter(f).sort((a, b) => order.indexOf(a.g) - order.indexOf(b.g) || (b.c.demo ? 1 : 0) - (a.c.demo ? 1 : 0) || ((b.s.sla ? b.s.days / b.s.sla : 0) - (a.s.sla ? a.s.days / a.s.sla : 0)));
  }
  // "My work" per role (Anna, 18 Nov: each role is a real view). Same groups and columns, filtered to what this person acts on.
  const MINE = {
    coordinator: (x) => x.s.unassigned || x.s.human || x.s.contact || x.s.rejected || /^Coordinator/.test(x.c.owner || "") || ["noowner", "call", "returned", "booking"].includes(x.g) || waitingFor(x.c) === "Patient to book",
    gp: (x) => (/Dr\. Hessa/.test(x.c.owner || "") && !(x.c.state === "referral" && !x.c.rejected) && x.c.state !== "booked") || (isUrgentBP(x.c) && !x.c.callOutcome) || x.s.rejected || ["answer", "close"].includes(x.g) || (isGpPath(x.c) && ["acknowledged", "confirmation"].includes(x.c.state)),
    specialist: (x) => !!preDue(x.c) || (["incoming", "visit"].includes(x.g) && ["FIT", "HPV"].includes(x.c.result.test)) || !!Store.openConsult(x.c) || /^(GI|Gynae) Clinic/.test(x.c.owner || ""),
    clinlead: (x) => !!x.c.pendingClose || /^Clinical lead/.test(x.c.owner || "") || (x.c.handover && /^Clinical lead/.test(x.c.handover.to)) || (x.s.urgent && (due(x.c, x.s).late || x.c.noRoster)),
    lead: (x) => x.s.escalated || x.s.hardLimit || /^Clinical lead/.test(x.c.owner || "") || (x.s.urgent && due(x.c, x.s).late)
  };
  const ROLE_INTRO = {
    coordinator: ["My work", "You are Noura, coordinator. These are the cases you need to act on: no owner yet, patient not reached or not booked, call-backs, and referrals returned to re-route with the GP."],
    gp: ["My work", "You are Dr. Hessa, family doctor. Your urgent calls today, referrals to sign or re-route, e-consult answers back, and outcomes ready to close."],
    specialist: ["Incoming", "You are the receiving clinic's triage (GI: Dr. Omar K., gynaecology: Dr. Rana T.). New referrals to accept or reject, e-consult questions with their deadline, and visits to record."],
    clinlead: ["My work", "You are Dr. Mona, clinical lead on duty. Second signatures for closing without care (declined, lost), urgent cases that are late or have no doctor free, and cases handed to you."],
    lead: ["Escalations", "You are Dr. Khalid, programme lead. Your main view is the Dashboard. Here are only the escalations: cases past 75% of their window, past the hard limit, or urgent and late."]
  };
  // Dr. Hessa's same-day calls from the duty roster, shown on top of her work list.
  function gpCalls() {
    const R = Store.rosterDay(Store.now()).find((d) => /Hessa/.test(d.doc)), booked = R ? R.booked.slice().sort((a, b) => a.start - b.start) : [];
    const waiting = Store.S.data.cases.filter((c) => isUrgentBP(c) && c.state !== "closed" && !c.callOutcome && !c.callSlot && /Hessa/.test(c.owner || ""));
    const line = (c, t) => `<li><a href="#/case/${esc(c.id)}"><b>${esc(t)}</b> · ${esc(c.name)}</a> · ${esc(RESULT_WORDS(c))}</li>`;
    return `<div class="card calls"><h3 style="margin:0 0 6px">Dr. Hessa's calls today</h3><ul class="small" style="margin:0;padding-inline-start:18px">
      ${booked.map((b) => { const c = Store.byId(b.caseId); return c ? line(c, tGST(b.start) + "–" + tGST(b.start + 3600000)) : ""; }).join("")}
      ${waiting.map((c) => line(c, urgentDue(c) ? urgentDue(c).text : "today")).join("")}
      ${booked.length || waiting.length ? "" : `<li class="muted">No calls booked yet.</li>`}</ul>
      <p class="tiny" style="margin:6px 0 0">Times come from the duty roster; the patient picked the block.</p></div>`;
  }
  function tagOf(c, s) {
    if (c.pendingClose) return "2nd signature needed";
    if (s.rejected) return "Returned";
    if (s.contact) return "Contact check";
    if (s.human) return x_reason(c);
    if (s.hardLimit) return "Past 180-day limit";
    if (preDue(c)) return Store.now() >= preDue(c).risk ? "Procedure at risk" : "Pre-assessment due";
    if (c.stopped && c.state !== "closed") return "Messages stopped";
    return "";
  }
  function worklist(root) {
    const role = Store.S.data.role, [mineLabel, intro] = ROLE_INTRO[role] || ROLE_INTRO.coordinator;
    let tab = ui().tab || "mine"; if (tab === "exceptions") tab = "mine";
    const MAIN = [["mine", mineLabel], ["action", "Needs action (everyone)"], ["all", "All cases"], ["closed", "Closed"]];
    const MORE = [["unassigned", "Unassigned"], ["urgent", "Urgent only"], ["overdue", "Late only"], ["rejected", "Returned referrals"], ["escalated", "≥75% of the guideline clock"]];
    // Each group shows its first 6 rows; "Show all" opens one group, so later groups are never pushed out of sight.
    const rows = filtered(tab), PER = 6, open = (ui().openG = ui().openG || {}), seen = {};
    const shown = rows.filter((r) => { seen[r.g] = (seen[r.g] || 0) + 1; return open[r.g] || seen[r.g] <= PER; });
    const lim = Infinity;
    let lastG = null;
    const body = shown.map(({ c, s, g }, i) => {
      const n = rows.filter((r) => r.g === g).length, nextG = (shown[i + 1] || {}).g;
      const head = g !== lastG ? `<tr class="grp"><th colspan="5">${esc((GROUPS.find((x) => x[0] === g) || [, "Closed"])[1])} <span class="n">${n}</span></th></tr>` : ""; lastG = g;
      const more = nextG !== g && n > PER ? `<tr class="grp-more"><td colspan="5"><button class="linkbtn" data-og="${g}">${open[g] ? "Show fewer" : "Show all " + n}</button></td></tr>` : "";
      const d = due(c, s), t = tagOf(c, s), edge = g === "urgent" ? "edge-red" : g === "late" || d.late ? "edge-amber" : "";
      const tip = c.state === "closed" ? "" : s.fit ? `Guideline clock: ${winText(s)}` : `Guideline window: ${Math.max(0, Math.floor(s.win - s.age))} of ${s.win} days left`;
      return head + `<tr class="click ${edge}" data-case="${esc(c.id)}" tabindex="0">
        <td><b>${esc(c.name)}</b>${c.demo ? ` <span class="chip c-grey">demo</span>` : ""}<div class="tiny">${esc(c.age)} · ${c.lang === "ar" ? "Arabic" : "English"} · ${esc(c.id)}</div></td>
        <td>${esc(RESULT_WORDS(c))}</td>
        <td>${esc(waitingFor(c))}${t ? ` <span class="chip ${t === "Returned" || t === "Contact check" ? "z-yellow" : "c-grey"}">${esc(t)}</span>` : ""}</td>
        <td>${who(c) ? esc(who(c)) : `<span class="chip z-red">No owner</span>`}${c.handover ? `<div class="tiny">Handing over to ${esc(c.handover.to.replace(/^.*· /, ""))}, not accepted yet</div>` : ""}</td>
        <td class="due ${d.late ? "late" : d.soon ? "soon" : ""}" title="${esc(tip)}">${esc(d.text)}</td></tr>` + more;
    }).join("");
    root.innerHTML = `<div class="card wl"><div class="row" style="justify-content:space-between;align-items:baseline"><h2 style="margin:0">Actionable results</h2>
      <span class="tiny">Abu Dhabi screening programme · synthetic data · ${Store.S.data.cases.length} cases</span></div>
      <p class="small" style="margin:6px 0 4px"><b>${esc(intro)}</b>${role === "lead" ? ` <a href="#/dashboard">Open the Dashboard →</a>` : ""}</p>
      <p class="muted tiny" style="margin:0 0 10px">Switch person with the “Viewing” button at the top. “All cases” shows everything.</p>
      ${role === "gp" && tab === "mine" ? gpCalls() : ""}
      <div class="tabs" role="tablist">${MAIN.map(([k, l]) => `<button role="tab" aria-selected="${k === tab}" class="${k === tab ? "on" : ""}" data-tab="${k}">${l}<span class="n">${filtered(k).length}</span></button>`).join("")}
        <label class="tiny" style="margin-inline-start:auto;display:flex;align-items:center;gap:6px">More <select id="more"><option value="">—</option>${MORE.map(([k, l]) => `<option value="${k}" ${k === tab ? "selected" : ""}>${l} (${filtered(k).length})</option>`).join("")}</select></label></div>
      <div class="tbl-wrap"><table class="wl-t"><thead><tr><th>Patient</th><th>Result</th><th>Waiting for</th><th>Who</th><th>Due</th></tr></thead><tbody>
      ${body || `<tr><td colspan="5" class="muted">Nothing here. Good.</td></tr>`}
      </tbody></table></div><p class="tiny">Red edge: urgent. Amber edge: late. “Due” is the deadline of the current step; urgent calls are in hours, from the rules table. Hover “Due” to see the guideline clock (FIT+: referral within 15 working days of the result, colonoscopy within 31 working days of the referral; national guideline). </p></div>`;
    root.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => { ui().tab = b.dataset.tab; ui().showAll = false; Store.save(); }));
    const more = root.querySelector("#more"); more.onchange = () => { ui().tab = more.value || "mine"; ui().showAll = false; Store.save(); };
    root.querySelectorAll("[data-og]").forEach((b) => (b.onclick = () => { open[b.dataset.og] = !open[b.dataset.og]; Store.save(); }));
    root.querySelectorAll("[data-case]").forEach((r) => { r.onclick = () => (location.hash = "#/case/" + r.dataset.case); r.onkeydown = (e) => { if (e.key === "Enter") r.click(); }; });
  }

  function actions(c, s) {
    const role = Store.S.data.role, a = [];
    if (c.state === "closed") return `<p class="muted small">Closed by ${esc(c.closure?.by)} · ${esc(c.closure?.reasonLabel)}. Evidence: ${esc(c.closure?.evidence)}</p>`;
    if (!c.owner || c.state === "issued") a.push(["assign", "Assign to me", role === "coordinator"]);
    const early = ["assigned", "notified", "acknowledged"].includes(c.state);
    if (isUrgentBP(c) && (early || c.state === "issued")) a.push(["samecall", "Record same-day call", role === "gp"]);
    if (isGpPath(c) && early) a.push(["gpvisit", "Record GP visit / repeat test", role === "gp"]);
    const canRefer = (isUrgentBP(c) || isGpPath(c) ? c.state === "confirmation" && !c.outcome : ["notified", "acknowledged", "confirmation"].includes(c.state)) || (c.state === "referral" && !c.accepted && s.ladder === 2);
    if (canRefer || (c.state === "referral" && c.rejected)) a.push(["refer", c.rejected ? "Re-route referral" : "Send referral", role === "gp" || role === "coordinator"]);
    if (c.state === "referral" && !c.rejected && !c.accepted) { a.push(["accept", "Accept referral", role === "specialist"]); a.push(["reject", "Reject with reason", role === "specialist"]); }
    if (c.state === "referral" && c.accepted && !c.slot) a.push(["bookfor", "Book a slot for the patient", role === "coordinator"]);
    if (preDue(c)) a.push(["prepdone", "Pre-assessment done + prep issued", role === "specialist" || role === "coordinator"]);
    if (c.state === "booked") a.push(["attended", "Record attendance and outcome", role === "specialist"]);
    if (c.pendingClose) a.push(["sign2", "Second signature: " + c.pendingClose.reasonLabel.split(" (")[0], role === "clinlead"]);
    else a.push(["close", "Close case", role === "gp" || role === "lead" || role === "clinlead"]);
    if (c.handover) a.push(["takeover", "Accept case (" + c.handover.to + ")", ROLES[role] === c.handover.to || !Object.values(ROLES).includes(c.handover.to)]);
    if (s.human) a.push(["nursedone", (x_reason(c) === "Nurse callback" ? "Nurse call-back" : x_reason(c) + ": call") + " done", true]);
    if (s.contact) a.push(["contactok", "Contact details checked", role === "coordinator"]);
    if (c.elsewhere && !c.reportRequested && c.state !== "closed") a.push(["reqreport", "Request report from other provider", role === "coordinator" || role === "gp"]);
    if (c.state === "referral" && !c.accepted && !c.rejected && s.overdue) a.push(["chase", s.ladder === 2 ? "Chase clinic again or re-route" : "Chase clinic", role === "coordinator"]);
    if (c.owner && !c.handover) a.push(["reassign", "Hand over to someone else", role === "coordinator" || role === "lead" || role === "clinlead"]);
    if (c.state === "booked") a.push(["noshow", "Mark no-show", role === "specialist" || role === "coordinator"]);
    a.push(["econsult", "E-consult (clinician to clinician)", role === "gp" || role === "specialist"]);
    a.push(["fhir", "Export FHIR (JSON)", true]);
    return `<div class="row">${a.map(([k, l, ok]) => `<button class="btn sm ${k === "accept" || k === "assign" ? "primary" : ""}" data-do="${k}" ${ok ? "" : "disabled title=\"Switch role to do this\""}>${esc(l)}</button>`).join("")}</div>
      <p class="tiny">Acting as: ${esc(ROLES[role].replace(/\.$/, ""))}. The AI assistant cannot assign, accept, reject or close.</p>`;
  }
  const NEXT_ACTIONS = ["Assign an owner", "Doctor calls patient today and records the call (urgent track)", "Re-route referral within 2 working days", "Try the next channel (SMS / automated call)", "Coordinator call, then letter", "Send referral", "Chase referral acceptance", "Check prep and reminders", "Review report and close with evidence", "Programme lead review (≥75% of window)", "No action: case closed", "Book the slot: referral accepted", "GP visit or repeat test, then record it", "Close with the recorded outcome"];
  function suggest(c, s) {
    const n = (c.attempts || c.retries || []).length;
    if (c.state === "closed") return 10;
    if (s.unassigned) return 0;
    if (s.urgent && ["assigned", "notified", "acknowledged"].includes(c.state)) return 1;
    if (s.rejected) return 2;
    if (s.escalated) return 9;
    if (c.state === "notified" && s.overdue) return n >= 3 ? 4 : 3;
    if (isGpPath(c) && ["assigned", "notified", "acknowledged"].includes(c.state)) return 12;
    if (["notified", "acknowledged", "confirmation"].includes(c.state)) return 5;
    if (c.state === "referral") return c.accepted ? 11 : 6;
    if (c.state === "confirmation") return c.outcome ? 13 : 5;
    if (c.state === "booked") return 7;
    if (c.state === "attended") return 8;
    return 3;
  }
  function summary(c, s) {
    const T = { FIT: "positive stool test (FIT)", HPV: "HPV " + (c.result.category || ""), HBA1C: "HbA1c " + (c.test?.value ?? "") + "%", BP: "BP " + (c.test?.sys ?? "") + "/" + (c.test?.dia ?? "") };
    const b = c.barriers && c.barriers.length ? c.barriers.join(", ") : c.barrier || "none reported";
    return [
      `${c.name}, ${c.age}, ${c.lang.toUpperCase()}-speaking, ${c.insurance}: ${T[c.result.test]} → next step: ${nextW(c).toLowerCase()}.`,
      `Now: ${stepNow(c)}, owner ${c.owner || "none"}, ${dd(s.days)} in step${s.overdue ? " (overdue)" : ""}; ${urgentDue(c) ? urgentDue(c).text : "guideline window: " + winText(s)}.`,
      `Patient: teach-back ${c.teachBack || "not done"}; barriers ${b}${c.redFlag ? "; RED FLAG “" + c.redFlag.phrase + "”" : ""}.`
    ];
  }
  // Today's duty roster for same-day calls (synthetic). Busy blocks come from data/roster.json, booked calls from patients' choices.
  function rosterCard(c) {
    const R = Store.rosterDay(Store.now()), hrs = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
    const hm = (t) => +t.split(":")[0];
    const cell = (d, h) => {
      if (h < hm(d.shift[0]) || h >= hm(d.shift[1])) return `<td class="tiny" style="color:var(--ink-3)">off</td>`;
      const b = d.busy.find(([f, t]) => h >= hm(f) && h < hm(t)); if (b) return `<td class="tiny" style="background:var(--surface-2)">${esc(b[2])}</td>`;
      const k = d.booked.find((x) => +tGST(x.start).slice(0, 2) === h);
      return k ? `<td class="tiny" style="background:var(--brand-soft);white-space:nowrap"><b>${esc(k.caseId)}</b>${k.caseId === c.id ? " ★" : ""}</td>` : `<td class="tiny" style="color:var(--ok, #1a7f37)">free</td>`;
    };
    return `<div class="card"><h2>Duty roster today: same-day calls</h2><div class="tbl-wrap"><table><thead><tr><th>Doctor</th>${hrs.map((h) => `<th class="tiny">${String(h).padStart(2, "0")}</th>`).join("")}</tr></thead><tbody>
      ${R.map((d) => `<tr><td style="white-space:nowrap">${esc(d.short.en)}</td>${hrs.map((h) => cell(d, h)).join("")}</tr>`).join("")}</tbody></table></div>
      <p class="tiny">The patient is offered only free blocks before the rule deadline. A booked block is not offered again. Synthetic roster v${esc(Store.S.R.version)}.</p></div>`;
  }
  // "What has been done so far", built from case fields only (Anna, 18 Nov: idea from the competitor review).
  const BAR_W = { fear: "worried or scared", cost: "cost", time: "time off work", prep: "the preparation", gender: "prefers a female doctor", transport: "getting there", privacy: "privacy", notnow: "does not want the test now" };
  function doneSoFar(c) {
    const H = Object.fromEntries(c.history.map((h) => [h.state, h])), d = (iso) => new Date(typeof iso === "number" ? iso : Date.parse(iso)).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Dubai" });
    const out = [];
    out.push(c.consent ? "Result explained " + d(c.consent.at) : H.acknowledged ? "Result explained " + d(H.acknowledged.at) : H.notified ? "Patient notified " + d(H.notified.at) + ", result not yet opened" : "Patient not yet notified");
    if (c.teachBack) out.push("teach-back " + c.teachBack);
    const bars = c.barriers && c.barriers.length ? c.barriers : c.barrier ? [c.barrier] : [];
    out.push(bars.length ? "barriers: " + bars.map((b) => BAR_W[b] || b).join(", ") : "no barriers reported");
    if (c.fearCall || c.teachFlag || c.callback) out.push("nurse call " + (c.humanDone ? "done" : "requested, not yet done"));
    const tries = (c.attempts || c.retries || []).length; if (tries) out.push(tries + " contact attempt" + (tries > 1 ? "s" : ""));
    if (c.redFlag) out.push("red-flag message “" + c.redFlag.phrase + "” (fixed answer, no AI)");
    if (c.callOutcome) out.push("same-day call: " + (c.callOutcome.answered ? c.callOutcome.text : "no answer"));
    if (c.slot) out.push("slot held " + (c.slot.labelEn || c.slot.label));
    else if (c.releasedSlot) out.push("earlier slot released after rejection");
    if (c.result.next === "colonoscopy") out.push(c.prepIssued ? "pre-assessment done, prep given" : "pre-assessment and prep not yet done");
    const q = (c.econsult || []).filter((e) => e.urgency); if (q.length) out.push("e-consult " + (q[q.length - 1].answered ? "answered" : "waiting for answer"));
    return out.join("; ") + ".";
  }
  // The three clocks of a case, each with its own date (concept review, 18 Nov). Dates from the rules table.
  function clocks(c, s) {
    const iss = Date.parse(c.history[0].at), has = (st) => c.history.some((h) => h.state === st) || ORDER.indexOf(c.state) > ORDER.indexOf(st);
    const d = (ms) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Dubai" });
    const u = urgentDue(c), row = (label, ms, done, extra) => `<div>${label}: <b>${typeof ms === "string" ? esc(ms) : d(ms)}</b>${done ? " ✓" : ms !== null && typeof ms === "number" && Store.now() > ms ? ` <span class="sla late">late</span>` : ""}${extra ? ` <span class="tiny">${extra}</span>` : ""}</div>`;
    if (s.fit) { const f = s.fit;
      return [row("First message by", iss + 2 * Store.DAY, has("notified"), "(2 days from result; ✓ = message sent)"),
        row("Referral by", f.refBy, !!f.refAt, "(15 working days from result, national guideline)"),
        row("Colonoscopy by", f.careBy, !!f.careAt || c.state === "closed", f.projected ? "(31 working days from referral; date shown if the referral is sent on its last day)" : "(31 working days from referral; a returned referral does not restart it)")].join(""); }
    return [row("Contact by", u ? u.text.replace(/ ·.*/, "") : iss + 2 * Store.DAY, has("notified") && (!u || c.callOutcome), u ? "(doctor's call, rules)" : "(2 days from result)"),
      c.result.windowDays ? row("Booked by", iss + c.result.windowDays * Store.DAY, has("booked") || !!c.slot, `(${c.result.windowDays} ${c.result.windowDays === 1 ? "day" : "days"}, rules table)`) : "",
      row("Care by (pilot target)", iss + s.win * Store.DAY, ["attended", "closed"].includes(c.state), `(${s.win} ${s.win === 1 ? "day" : "days"}${s.hard ? "; hard limit " + s.hard : ""})`)].join("");
  }
  function sbar(c) {
    return `S: ${c.name}, ${c.age} ${c.sex}, ${c.result.test} ${c.result.category || ""} on ${new Date(Date.parse(c.history[0].at)).toLocaleDateString("en-GB")}. Rules level ${c.result.level}.
B: Screened via Abu Dhabi programme. ${c.insurance} cover. Language ${c.lang.toUpperCase()}.${c.barriers && c.barriers.length ? " Barriers: " + c.barriers.join(", ") + "." : ""}
A: Guideline next step: ${c.result.referralWorkdays ? `${c.result.next}: referral within ${c.result.referralWorkdays} working days of the result, colonoscopy within ${c.result.careWorkdays} working days of the referral` : `${c.result.next} within ${c.result.windowDays} days`} (${c.result.source}).
D: What has been done so far: ${doneSoFar(c)}
R: Please accept for ${c.result.next}.${c.barriers && c.barriers.includes("gender") ? " Patient prefers a female clinician." : ""}${c.slot ? " Slot held: " + (c.slot.labelEn || c.slot.label) + "." : ""}`;
  }
  function caseView(root, id) {
    const c = Store.byId(id); if (!c) { root.innerHTML = `<div class="card">Case not found. <a href="#/team">Back</a></div>`; return; }
    const s = Store.status(c), idx = ORDER.indexOf(c.state);
    if (Store.S.data.role === "gp" && (c.econsult || []).some((e) => e.reply)) c.consultSeen = true;
    const skip5 = (c.result.test === "FIT" && c.result.category === "positive") || (c.result.test === "HPV" && c.result.category === "positive_16_18");
    const hist = Object.fromEntries(c.history.map((h) => [h.state, h]));
    const log = Store.S.data.log.filter((l) => l.caseId === c.id).slice().reverse();
    const chat = (Store.S.data.chats[c.id] || []).filter((m) => m.t === "me" || (m.t === "in" && m.text) || m.t === "nurse");
    root.innerHTML = `<p><a href="#/team">← Worklist</a></p>
    <div class="grid2 wide-l">
      <div>
        <div class="card"><div class="row" style="justify-content:space-between"><h2 style="margin:0">${esc(c.id)} · ${esc(c.name)}</h2>
          <span class="chip z-${esc(c.result.zone)}">${esc(RESULT_WORDS(c))} · ${esc(ZW[c.result.zone])}</span></div>
          <dl class="kv" style="margin-top:12px">
            <dt>Patient</dt><dd>${esc(c.age)} · ${esc(c.sex)} · ${esc(c.nationality)} · language ${esc(c.lang.toUpperCase())} · ${esc(c.area)}</dd>
            <dt>Insurance</dt><dd>${esc(c.insurance)}</dd>
            <dt>Track</dt><dd>${c.track === "urgent" || s.urgent ? `<span class="chip z-red">Urgent track</span>` : "Standard track"}${c.redFlag ? ` · red flag “${esc(c.redFlag.phrase)}” (no AI)` : ""}</dd>
            <dt>Waiting for</dt><dd>${esc(waitingFor(c))}</dd>
            <dt>Due</dt><dd class="sla ${due(c, s).late ? "late" : ""}">${esc(due(c, s).text)}${urgentDue(c) ? " (rules: call within 4 h of notification)" : ""}</dd>
            <dt>Next step</dt><dd>${esc(nextW(c))}</dd>
            <dt>Three clocks</dt><dd>${clocks(c, s)}</dd>
            <dt>Time left on this clock</dt><dd class="sla ${s.clockPct >= 75 ? "late" : ""}">${c.state === "closed" ? "closed" : winText(s)}${s.escalated ? (s.urgent ? " → escalated to the clinical lead (programme lead sees it on the dashboard)" : " → escalated to programme lead") : ""}</dd>
            <dt>Rule</dt><dd class="tiny">${esc(c.result.ruleRow || "")} · rules v${esc(c.result.rulesVersion)} · level ${esc(c.result.level)} · ${esc(c.result.ruleText || "")}</dd>
            <dt>Barriers</dt><dd>${(c.barriers && c.barriers.length ? c.barriers : c.barrier ? [c.barrier] : ["—"]).map(esc).join(", ")}</dd>
            <dt>Teach-back</dt><dd>${esc(c.teachBack || "—")}</dd>
            <dt>Contact attempts</dt><dd>${(c.attempts || c.retries || []).map((x) => `${esc(x.channel)} d${x.day} ${x.ok ? "✓✓" : "✗"}`).join(" · ") || "—"}</dd>
            ${isUrgentBP(c) && c.state !== "closed" ? `<dt>Doctor call</dt><dd>${c.callSlot ? `Booked: <b>${esc(c.callSlot.doc)}</b>, ${tGST(c.callSlot.start)}–${tGST(c.callSlot.end)} (duty roster)` : c.noRoster ? `<span class="chip z-red">No doctor free before the deadline</span> Clinical lead arranges the call.` : "Any free doctor on the roster"}${window.Patient && !Patient.callBy(c).late ? ` · rule deadline ${tGST(Patient.callBy(c).ms)}` : " · rule deadline: tomorrow before 10:00"}</dd>` : ""}
            ${c.callOutcome ? `<dt>Same-day call</dt><dd>${c.callOutcome.answered ? "Answered · " + esc(c.callOutcome.text) : "No answer × " + esc(c.callTries || 1)}</dd>` : ""}
            ${c.outcome ? `<dt>Outcome</dt><dd>${esc(c.outcome.text)} · evidence: ${esc(c.outcome.report)}</dd>` : ""}
            ${c.referral && recvClinic(c) && c.state !== "closed" ? `<dt>Receiving clinic</dt><dd>${esc(recvClinic(c))}${triageOf(c) ? " · triage: " + esc(triageOf(c)) : ""}${c.slot ? " · seen by " + esc(c.slot.doc) : ""}</dd>` : ""}
            ${c.accepted && !c.slot ? `<dt>Referral</dt><dd><span class="chip z-yellow">Accepted, waiting for booking</span> by ${esc(c.accepted.by)}. Booking within 7 days.</dd>` : ""}
            ${c.slot ? `<dt>Slot</dt><dd>${esc(c.slot.labelEn || c.slot.label)} · ${esc(c.slot.clinic)}</dd>` : ""}
            ${c.rejected ? `<dt>Referral</dt><dd><span class="chip z-yellow">Rejected</span> by ${esc(c.rejected.by)}: “${esc(c.rejected.reason)}”. Returned to sender, re-route within 2 working days.</dd>` : ""}
          </dl>
          ${c.referral ? `<p class="small" style="margin:8px 0 0"><b>What has been done so far:</b> ${esc(doneSoFar(c))}</p>` : ""}
          ${c.referral && c.referral.note ? `<details class="srcs"><summary>Referral packet (SBAR + result)${c.referral.auto ? " · sent automatically at booking" : ""}</summary><pre class="small" style="white-space:pre-wrap;margin:6px 0">${esc(c.referral.note)}</pre></details>` : ""}
          <h3>Actions</h3>${actions(c, s)}
        </div>
        <div class="card"><h2>Case timeline</h2><ol class="timeline">
        ${ORDER.map((st, i) => {
          const h = hist[st], done = !!h && i < idx || st === c.state && st === "closed", now = st === c.state && st !== "closed", skipped = st === "confirmation" && skip5;
          const late = now && s.overdue;
          return `<li><span class="dot ${done ? "done" : late ? "late" : now ? "now" : ""}">${done ? "✓" : i + 1}</span><div>
            <b>${esc(Store.STATE_NAMES[st])}</b>${skipped ? ` <span class="tiny">skipped for this result (guideline: go straight to referral)</span>` : ""}
            <div class="tiny">${h ? esc(fmt(Date.parse(h.at))) + " · " + esc(h.by || "") + (h.note ? " · " + esc(h.note) : "") : ""}</div>
            ${now ? `<div class="small ${late ? "sla late" : "muted"}">Owner: ${esc(c.owner || "unassigned")} · ${dd(s.days)} in step${s.sla !== null ? " / SLA " + dd(s.sla) : ""}${late ? " · " + (STEP_W[c.state] || "this") + " step late" + (s.ladder === 2 ? " (2× → team lead)" : " (owner notified)") : ""}</div>` : ""}
          </div></li>`;
        }).join("")}</ol></div>
      </div>
      <div>
        <div class="card"><h2>Case summary</h2>
          <div class="aidraft"><div class="aih">Draft summary · check before use</div>${summary(c, s).map((l, i) => `<div class="small" style="margin:3px 0">${i + 1}. ${esc(l)}</div>`).join("")}
            <div class="small" style="margin-top:6px"><b>Suggested action:</b> ${esc(NEXT_ACTIONS[suggest(c, s)])}</div>
            ${c.summaryAck ? `<div class="tiny" style="margin-top:6px">${esc(c.summaryAck)}</div>` : `<div class="row" style="margin-top:8px"><button class="btn sm primary" data-sum="Accepted">Accept</button><button class="btn sm" data-sum="Ignored">Ignore</button></div>`}</div>
          <p class="tiny">Built from case fields only; the action comes from a fixed list of ${NEXT_ACTIONS.length}. In the pilot an LLM rewrites it in plain words from the same fields. Staff decide.</p></div>
        <div class="card"><h2>Audit log</h2><div class="log">${log.map((l) => `<div><span class="tiny">${esc(fmt(Date.parse(l.at)))}</span> · <b>${esc(l.who)}</b>: ${esc(l.what)}</div>`).join("") || `<div class="muted">Seeded history only. Actions in this demo appear here.</div>`}</div></div>
        ${isUrgentBP(c) ? rosterCard(c) : ""}
        ${c.econsult && c.econsult.length ? `<div class="card"><h2>E-consult</h2>${c.econsult.map((e) => `<p class="small"><b>${esc(e.by)}</b>${e.urgency ? ` <span class="chip ${e.answered ? "c-grey" : Store.now() > e.dueAt ? "z-red" : "z-yellow"}">${esc(e.urgency)} · ${e.answered ? "answered" : (Store.now() > e.dueAt ? "late, was due " : "answer by ") + esc(fmt(e.dueAt))}</span>` : e.reply ? " (answer)" : ""}: ${esc(e.text)}</p>`).join("")}</div>` : ""}
        <div class="card"><h2>Conversation summary</h2>${chat.length ? `<div class="log">${chat.slice(-12).map((m) => `<div><b>${m.t === "me" ? "Patient" : m.t === "nurse" ? "Nurse" : "Assistant"}</b>${m.tag === "ai" ? " (AI)" : m.tag === "fixed" ? " (safety rule)" : ""}: ${esc(m.text)}</div>`).join("")}</div>` : `<p class="muted small">No chat yet.</p>`}
          <p class="tiny">Summary is for coordination, not for clinical decisions. The original lab report is the source of truth.</p></div>
      </div></div>`;
    root.querySelectorAll("[data-do]").forEach((b) => (b.onclick = () => doAction(c, b.dataset.do)));
    root.querySelectorAll("[data-sum]").forEach((b) => (b.onclick = () => { c.summaryAck = b.dataset.sum + " by " + ROLES[Store.S.data.role]; Store.log(c.id, ROLES[Store.S.data.role], "Summary " + b.dataset.sum.toLowerCase(), "info"); Store.save(); }));
  }

  function modal(html, onOk) {
    const bg = document.createElement("div"); bg.className = "modal-bg";
    bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}<div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn sm" data-x>Cancel</button><button class="btn sm primary" data-ok>Confirm</button></div></div>`;
    document.body.appendChild(bg);
    const close = () => bg.remove();
    bg.querySelector("[data-x]").onclick = close;
    bg.onkeydown = (e) => { if (e.key === "Escape") close(); };
    const ok = bg.querySelector("[data-ok]");
    const validate = () => { const v = onOk.valid ? onOk.valid(bg) : true; ok.disabled = !v; };
    bg.querySelectorAll("input,select,textarea").forEach((el) => (el.oninput = el.onchange = validate)); validate();
    ok.onclick = () => { if (ok.disabled) return; onOk(bg); close(); };
    (bg.querySelector("select,input,textarea") || ok).focus();
  }
  const s_ladder2 = (c) => Store.status(c).ladder === 2;
  // Mon–Fri working days (UAE), used for "we will message you by".
  function workdays(ms, n) { let t = ms; while (n > 0) { t += Store.DAY; const d = new Date(t + 4 * 3600000).getUTCDay(); if (d !== 0 && d !== 6) n--; } return t; }
  // A prepared message to the patient's chat, logged on the case. Both languages are stored; the phone shows the patient's.
  function tellPatient(c, en, ar) {
    const ch = (Store.S.data.chats[c.id] = Store.S.data.chats[c.id] || []);
    ch.push({ t: "in", text: en, textAr: ar, tag: "prepared", at: Store.now() });
    Store.log(c.id, "System", "Message to patient (WhatsApp ✓✓ and app): " + en, "channel");
  }
  // Rejection: back to the GP, held time released, reminders and prep stopped, patient told. The guideline clock is not reset.
  function rejectReferral(c, who, reason) {
    c.rejected = { by: who, reason }; c.owner = "GP · Dr. Hessa M."; c.accepted = null;
    Store.log(c.id, who, "Rejected referral: " + reason + ". Returned to GP.", "state");
    if (c.slot) { c.releasedSlot = c.slot; c.slot = null; Store.log(c.id, "System", "Held time released (" + c.releasedSlot.labelEn + "). Reminders and prep instructions cancelled.", "state"); }
    const by = workdays(Store.now(), 2); c.rejected.until = by;
    tellPatient(c, `The clinic could not take this referral. Your doctor is choosing another clinic. We will message you by ${Patient.fmtDate(by, "en")}.`,
      `لم تتمكن العيادة من قبول هذا التحويل. يختار طبيبك عيادة أخرى. سنراسلك بحلول ${Patient.fmtDate(by, "ar")}.`);
  }
  function doAction(c, k) {
    const who = Store.S.data.role === "specialist" && recvClinic(c) && triageOf(c) ? recvClinic(c) + " · triage: " + triageOf(c) : ROLES[Store.S.data.role];
    if (k === "contactok") { c.contactChecked = true; Store.log(c.id, who, "Contact details checked and corrected. Messages stay stopped until the right person is reached by phone.", "state"); Store.save(); return; }
    if (k === "reqreport") { c.reportRequested = true; Store.log(c.id, who, "Report requested from the other provider (and Malaffi checked). Close as “treated elsewhere” when it arrives.", "state"); Store.save(); return; }
    if (k === "chase") { c.chased = (c.chased || 0) + 1; Store.log(c.id, who, `Chased ${c.referral?.to || c.owner} for referral acceptance (${c.chased}×). ${s_ladder2(c) ? "Over 2× SLA: re-route is now allowed." : "Escalates to re-route at 2× SLA."}`, "state"); Store.save(); return; }
    if (k === "prepdone") { c.prepIssued = { at: Store.now(), by: who }; Store.log(c.id, who, "Pre-assessment done (medicines and health checked by a clinician) and bowel-prep drink with written instructions issued by the GI centre.", "state"); Store.save(); return; }
    if (k === "nursedone") { c.humanDone = true; c.human = false; Store.log(c.id, who, "Nurse call-back done. Chat handed back to the assistant (red-topic rules always on).", "human"); Store.save(); return; }
    if (k === "assign") { c.owner = "Coordinator · Noura A."; if (c.state === "issued") Store.move(c, "assigned", who); else Store.log(c.id, who, "Took ownership", "state"); Store.save(); }
    if (k === "refer") {
      const re = !!c.rejected;
      modal(`<h2>${re ? "Re-route referral" : "Send referral"}</h2><label for="to">To</label><select id="to">
        ${(REFER_TO[c.result.test] || REFER_TO.BP).map((o) => `<option>${esc(o)}</option>`).join("")}</select>
        <div class="aidraft" style="margin-top:10px"><div class="aih">Draft referral (SBAR) · the doctor edits and sends</div><label for="note" class="tiny">Referral letter</label><textarea id="note" rows="7">${esc(sbar(c))}</textarea></div><p class="tiny">Draft built from case fields. The sending clinician is responsible for the content.</p>`, (bg) => {
        const to = bg.querySelector("#to").value; c.referral = { to, note: bg.querySelector("#note").value }; c.accepted = null;
        if (re) { Store.log(c.id, who, "Re-routed referral after rejection → " + to, "state");
          tellPatient(c, `Your doctor sent your referral to ${to.split(" · ")[0]}. Please choose a new time in the app.`, `أرسل طبيبك التحويل إلى ${to.split(" · ")[0]}. يرجى اختيار موعد جديد في التطبيق.`); c.rejected = null; c.history.push({ state: "referral", at: new Date(Store.now()).toISOString(), by: who, note: "re-routed to " + to }); c.owner = to.split(" · ").slice(-1)[0]; }
        else Store.move(c, "referral", who, "sent to " + to);
        Store.save();
      });
    }
    if (k === "accept" && !c.slot) {
      // No slot yet: accepted is not booked (BA L6). Booking task for the coordinator, SLA 7 days; slots go to the patient.
      c.accepted = { by: who, at: Store.now() };
      c.history.push({ state: "referral", at: new Date(Store.now()).toISOString(), by: who, note: "accepted, waiting for booking" });
      c.owner = "Coordinator · Noura A.";
      Store.log(c.id, who, "Referral accepted, waiting for booking. Booking task for coordinator (SLA 7 d).", "state");
      const ch = Store.S.data.chats[c.id];
      if (ch) { const ar = c.lang === "ar" && Store.S.data.lang === "ar"; ch.push({ t: "in", at: Store.now(), tag: "prepared", text: ar ? "قبلت العيادة التحويل. اختاري موعدًا من تبويب الحجز، أو ستتصل بك المنسقة." : "The clinic accepted your referral. Pick a time in the Book tab, or the coordinator will call you." }); }
      Store.save(); return;
    }
    if (k === "bookfor") {
      const P = Patient.SLOTS[c.result.next] || (c.result.test === "HPV" ? Patient.SLOTS.colposcopy : c.result.test === "FIT" ? Patient.SLOTS.colonoscopy : null);
      const list = P ? P.list : [{ id: "m1", doc: "Dr. Sami N.", f: false, clinic: "Internal Medicine Clinic (demo)", day: "2026-11-20", time: "10:00" }, { id: "m2", doc: "Dr. Nadia F.", f: true, clinic: "Diabetes Clinic (demo)", day: "2026-11-23", time: "17:30" }];
      modal(`<h2>Book a slot for the patient</h2><label for="sl">Slot</label><select id="sl"><option value="">Choose…</option>${list.map((x) => `<option value="${esc(x.id)}">${esc(x.day + " " + x.time + " · " + x.doc + " · " + x.clinic)}</option>`).join("")}</select>
        <p class="tiny">Agreed with the patient by phone. The patient gets the confirmation and reminders.</p>`, Object.assign((bg) => {
        const x = list.find((y) => y.id === bg.querySelector("#sl").value); const ms = Date.parse(x.day + "T" + x.time + ":00+04:00");
        c.slot = { ...x, label: Patient.fmtDate(ms, c.lang) + " " + x.time + " · " + x.doc, labelEn: Patient.fmtDate(ms, "en") + " " + x.time + " · " + x.doc };
        Store.move(c, "booked", who, "booked by coordinator: " + c.slot.labelEn); Store.save();
      }, { valid: (bg) => !!bg.querySelector("#sl").value }));
      return;
    }
    if (k === "accept") {
      Store.move(c, "booked", who, "referral accepted" + (c.slot ? "; slot confirmed " + (c.slot.labelEn || c.slot.label) : ""));
      const ch = Store.S.data.chats[c.id];
      if (ch && c.slot) {
        const ar = c.lang === "ar" && Store.S.data.lang === "ar";
        ch.push({ t: "in", at: Store.now(), tag: "prepared", text: ar ? `تم تأكيد موعدك: ${c.slot.label}. الرقم المرجعي SP-${c.id.slice(2)}. سنرسل تعليمات التحضير والتذكيرات.` : `Your slot is confirmed: ${c.slot.label}. Reference SP-${c.id.slice(2)}. We will send prep instructions and reminders.` });
        Store.log(c.id, "System", "Confirmation sent to patient on WhatsApp ✓✓", "channel");
      }
      Store.save();
    }
    if (k === "reject") {
      modal(`<h2>Reject referral</h2><label for="r">Reason (required)</label><select id="r"><option value="">Choose…</option><option>Not our service</option><option>Outside catchment area</option><option>Missing information</option><option>Needs different specialty</option></select>
        <p class="tiny">The case returns to the sender, who must re-route within 2 working days. Rejection is never a closure reason.</p>`, Object.assign((bg) => {
        rejectReferral(c, who, bg.querySelector("#r").value); Store.save();
      }, { valid: (bg) => !!bg.querySelector("#r").value }));
    }
    if (k === "samecall") {
      modal(`<h2>Record same-day call</h2><p class="small muted">${esc(c.name)} · ${esc(c.test?.sys)}/${esc(c.test?.dia)} · call window today.</p>
        <label for="ans">Did the patient answer?</label><select id="ans"><option value="">Choose…</option><option value="yes">Answered</option><option value="no">No answer</option></select>
        <label for="o">Outcome (if answered)</label><select id="o"><option value="">Choose…</option>${CALL_OUT.map(([l], i) => `<option value="${i}">${esc(l)}</option>`).join("")}</select>
        <label for="note">Call note (if answered)</label><textarea id="note" rows="3" placeholder="Readings, symptoms asked, plan"></textarea>
        <p class="tiny">No answer: retry within 30 minutes, then an SMS with the clinic number, then the clinical lead before the end of the window.</p>`, Object.assign((bg) => {
        const ans = bg.querySelector("#ans").value;
        if (ans === "yes") {
          const [text, reason] = CALL_OUT[+bg.querySelector("#o").value], note = bg.querySelector("#note").value.trim();
          c.callOutcome = { answered: true, text, by: who, at: Store.now() };
          c.outcome = { text, report: "Signed call note, " + who + ": " + note, reason };
          c.attempts = (c.attempts || []).concat([{ day: Store.S.data.clockDays, channel: "Doctor call", ok: true }]);
          Store.move(c, "confirmation", who, "same-day call: " + text);
          Store.log(c.id, who, "Call note signed: " + note, "state");
        } else {
          c.callTries = (c.callTries || 0) + 1; c.callOutcome = { answered: false, by: who, at: Store.now() };
          c.attempts = (c.attempts || []).concat([{ day: Store.S.data.clockDays, channel: "Doctor call", ok: false }]);
          if (c.callTries === 1) Store.log(c.id, who, "Doctor call: no answer. Retry within 30 min (task for GP).", "urgent");
          else if (c.callTries === 2) {
            c.attempts = c.attempts.concat([{ day: Store.S.data.clockDays, channel: "SMS", ok: true }]);
            Store.log(c.id, who, "Doctor call: no answer again. SMS sent with the clinic number " + CLINIC_LINE + " (simulated).", "urgent");
            const ch = Store.S.data.chats[c.id]; if (ch) { const ar = c.lang === "ar" && Store.S.data.lang === "ar"; ch.push({ t: "in", at: Store.now(), tag: "prepared", text: ar ? `حاول طبيبك الاتصال بك. يرجى الاتصال بمركزك الصحي على ${CLINIC_LINE} اليوم. إذا شعرت بأنك أسوأ، اتصل بالرقم 998.` : `Your doctor tried to call you. Please call your health centre on ${CLINIC_LINE} today. If you feel worse, call 998.` }); }
          } else { c.owner = CLIN_LEAD; Store.log(c.id, who, "No contact after 3 tries. Handed to the clinical lead today: " + CLIN_LEAD + ". Programme lead sees it on the dashboard.", "urgent"); }
        }
        Store.save();
      }, { valid: (bg) => { const a = bg.querySelector("#ans").value; return a === "no" || (a === "yes" && bg.querySelector("#o").value !== "" && bg.querySelector("#note").value.trim().length >= 3); } }));
      return;
    }
    if (k === "gpvisit") {
      modal(`<h2>Record GP visit / repeat test</h2><label for="o">Outcome</label><select id="o"><option value="">Choose…</option>${GP_OUT.map(([l], i) => `<option value="${i}">${esc(l)}</option>`).join("")}</select>
        <label for="ev">Evidence (repeat test result or visit note)</label><input id="ev" value="" placeholder="e.g. repeat HbA1c 6.1% on 20 Nov (synthetic)">`, Object.assign((bg) => {
        const [text, reason] = GP_OUT[+bg.querySelector("#o").value], ev = bg.querySelector("#ev").value.trim();
        if (reason) c.outcome = { text, report: ev, reason };
        Store.move(c, "confirmation", who, text + " · " + ev); Store.save();
      }, { valid: (bg) => bg.querySelector("#o").value !== "" && bg.querySelector("#ev").value.trim().length >= 3 }));
      return;
    }
    if (k === "attended") {
      modal(`<h2>Record attendance and outcome</h2><label for="o">Outcome</label><select id="o">${(ATT_OUT[c.result.test] || ATT_OUT.other).map(([l], i) => `<option value="${i}">${esc(l)}</option>`).join("")}</select>
        <label for="rep">Report (evidence)</label><input id="rep" value="${esc(({ FIT: "colonoscopy", HPV: "colposcopy" })[c.result.test] || "specialist")}-report-${esc(c.id)}.pdf (synthetic)">`, (bg) => {
        const [text, reason] = (ATT_OUT[c.result.test] || ATT_OUT.other)[+bg.querySelector("#o").value];
        c.outcome = { text, report: bg.querySelector("#rep").value, reason };
        Store.move(c, "attended", who, c.outcome.text); Store.log(c.id, who, "Report attached: " + c.outcome.report + ". Sent to referring GP.", "state"); Store.save();
      });
    }
    if (k === "close") {
      // "Completed…" reasons need an attended visit with a report. "Lost to follow-up" needs ≥3 attempts on ≥2 channels
      // over ≥30 days, including a call and a letter (BA v1.3).
      const att = [...(c.retries || []), ...(c.attempts || [])], chans = new Set(att.map((x) => x.channel));
      const daysOpen = (Store.now() - Date.parse(c.history[0].at)) / Store.DAY;
      const lostMissing = [att.length < 3 && "≥3 attempts", chans.size < 2 && "≥2 channels", daysOpen < 30 && "≥30 days", ![...chans].some((x) => /call/i.test(x)) && "a call", !chans.has("Letter") && "a letter"].filter(Boolean);
      const hasReport = ["attended", "confirmation"].includes(c.state) && !!(c.outcome && c.outcome.report);
      const sug = c.outcome && c.outcome.reason || "";
      const NEEDS_REPORT = ["completed_normal", "completed_surveillance", "treatment_started"];
      const blocked = (k) => (NEEDS_REPORT.includes(k) && !hasReport ? "needs attended visit with report" : k === "confirmed_normal_repeat" && !hasReport && c.state !== "confirmation" ? "needs a repeat test result" : k === "lost" && lostMissing.length ? "needs " + lostMissing.join(", ") : k === "declined" && !talked(c) ? "needs a logged nurse or GP call" : "");
      modal(`<h2>Close case</h2><p class="small muted">Closing needs evidence or a signed clinician decision with a reason code. The AI cannot close a case.</p>
        <label for="rc">Reason code</label><select id="rc"><option value="">Choose…</option>${Store.CLOSE_REASONS.map(([k, l]) => `<option value="${k}" ${blocked(k) ? "disabled" : ""} ${k === sug && !blocked(k) ? "selected" : ""}>${esc(l)}${blocked(k) ? " (" + esc(blocked(k)) + ")" : ""}</option>`).join("")}</select>
        <label for="ev">Evidence (report, Malaffi record or signed note)</label><input id="ev" value="${esc(c.outcome?.report || "")}" placeholder="Required">
        ${sug ? `<p class="tiny">Preselected from the recorded outcome “${esc(c.outcome.text)}”. A different reason needs a short note.</p><label for="dn">Why a different reason</label><input id="dn" placeholder="Only if you change the reason">` : ""}
        <label><input type="checkbox" id="sig" style="width:auto;min-height:0"> I, ${esc(who)}, confirm this decision.</label>`, Object.assign((bg) => {
        const rc = bg.querySelector("#rc").value;
        const dn = bg.querySelector("#dn");
        const cl = { reason: rc, reasonLabel: Store.CLOSE_REASONS.find((x) => x[0] === rc)[1], evidence: bg.querySelector("#ev").value + (sug && rc !== sug ? " · reason changed: " + dn.value.trim() : ""), by: who, at: Store.now() };
        // Closing without care (declined, lost) needs a second signature from the clinical lead (concept review, 18 Nov).
        if (["declined", "lost"].includes(rc)) { c.pendingClose = cl; Store.log(c.id, who, `First signature to close as “${cl.reasonLabel}”. Waiting for the clinical lead's second signature; the case stays open.`, "state"); Store.save(); return; }
        c.closure = cl; Store.move(c, "closed", who, c.closure.reasonLabel); Store.log(c.id, who, "Signed closure. Evidence: " + c.closure.evidence, "state"); Store.save();
      }, { valid: (bg) => { const rc = bg.querySelector("#rc").value, dn = bg.querySelector("#dn"); return rc && !blocked(rc) && (!sug || rc === sug || (dn && dn.value.trim().length >= 3)) && bg.querySelector("#ev").value.trim().length >= 3 && bg.querySelector("#sig").checked; } }));
    }
    if (k === "sign2" && c.pendingClose) {
      modal(`<h2>Second signature</h2><p class="small">${esc(c.pendingClose.by)} wants to close this case as <b>${esc(c.pendingClose.reasonLabel)}</b>. Evidence: ${esc(c.pendingClose.evidence)}</p>
        <label for="d2">Your decision</label><select id="d2"><option value="">Choose…</option><option value="ok">Agree: close the case</option><option value="no">Do not close: one more try to reach the patient</option></select>
        <label><input type="checkbox" id="sig2" style="width:auto;min-height:0"> I, ${esc(who)}, confirm this decision.</label>`, Object.assign((bg) => {
        const ok = bg.querySelector("#d2").value === "ok", pc = c.pendingClose; c.pendingClose = null;
        if (ok) { c.closure = { ...pc, by2: who }; Store.move(c, "closed", who, pc.reasonLabel + " (two signatures)"); Store.log(c.id, who, "Second signature given. Closed as " + pc.reasonLabel + ". Signed by " + pc.by + " and " + who + ".", "state"); }
        else Store.log(c.id, who, "Second signature refused: case stays open for one more attempt.", "state");
        Store.save();
      }, { valid: (bg) => bg.querySelector("#d2").value && bg.querySelector("#sig2").checked }));
    }
    if (k === "takeover" && c.handover) { const h = c.handover; c.owner = h.to; c.handover = null; Store.log(c.id, who, `Accepted the case. Owner: ${h.from} → ${h.to}.`, "state"); Store.save(); }
    if (k === "reassign") {
      const OWN = ["Coordinator · Noura A.", "Coordinator · Salem B.", "GP · Dr. Hessa M.", "GP · Dr. Faisal R.", "GI Clinic · Dr. Omar K.", "Gynae Clinic · Dr. Rana T.", "Clinical lead · Dr. Mona S. (duty)", "Programme lead · Dr. Khalid S."];
      modal(`<h2>Hand over the case</h2><p class="small muted">Now: ${esc(c.owner)}</p><label for="ow">New owner</label><select id="ow"><option value="">Choose…</option>${OWN.filter((o) => o !== c.owner).map((o) => `<option>${esc(o)}</option>`).join("")}</select>
        <label for="why">Reason (required)</label><select id="why"><option value="">Choose…</option><option>Leave / absence</option><option>Workload balance</option><option>Language match</option><option>Wrong team</option><option>Escalation</option></select>`, Object.assign((bg) => {
        // Hand-over: the current owner stays owner until the new person taps "Accept case" (concept review, 18 Nov).
        c.handover = { from: c.owner, to: bg.querySelector("#ow").value, why: bg.querySelector("#why").value, at: Store.now() };
        Store.log(c.id, who, `Handing over: ${c.handover.from} → ${c.handover.to} (${c.handover.why}). ${c.handover.from} stays owner until it is accepted.`, "state"); Store.save();
      }, { valid: (bg) => bg.querySelector("#ow").value && bg.querySelector("#why").value }));
    }
    if (k === "noshow") {
      c.noShow = (c.noShow || 0) + 1; c.slot = null;
      Store.move(c, "referral", who, "no-show; rebook within 24 h");
      Store.log(c.id, "System", "No-show recorded. Rebooking task for coordinator, SLA 24 h. Patient offered new slots on WhatsApp.", "urgent");
      if (c.noShow >= 2) { c.owner = "GP · Dr. Hessa M."; c.callback = new Date(Store.now()).toISOString(); c.humanDone = false; Store.log(c.id, "System", "Second no-show: owner → family doctor, who calls the patient before any new booking.", "urgent"); }
      const ch = Store.S.data.chats[c.id];
      if (ch) { const ar = c.lang === "ar" && Store.S.data.lang === "ar"; ch.push({ t: "in", at: Store.now(), tag: "prepared", text: ar ? "فاتك موعدك، لا بأس. اختاري موعدًا جديدًا:" : "You missed your appointment, that's OK. Please pick a new slot:" }); ch.push({ t: "slots", at: Store.now() }); }
      Store.save();
    }
    if (k === "fhir") {
      const ref = (t, id) => ({ reference: `${t}/${id}` });
      const bundle = { resourceType: "Bundle", type: "collection", meta: { tag: [{ code: "synthetic" }] }, entry: [
        { resource: { resourceType: "Patient", id: c.id, gender: c.sex, extension: [{ url: "language", valueCode: c.lang }] } },
        { resource: { resourceType: "Observation", id: c.id + "-obs", status: "final", code: { text: c.result.test }, subject: ref("Patient", c.id), valueString: c.result.category, interpretation: [{ text: c.result.level + " " + c.result.zone }] } },
        { resource: { resourceType: "ServiceRequest", id: c.id + "-sr", status: c.state === "closed" ? "completed" : "active", intent: "order", code: { text: c.result.next }, subject: ref("Patient", c.id), reasonReference: [ref("Observation", c.id + "-obs")], performer: c.referral ? [{ display: c.referral.to }] : [] } },
        { resource: { resourceType: "Task", id: c.id + "-task", status: c.state === "closed" ? "completed" : "in-progress", businessStatus: { text: Store.STATE_NAMES[c.state] }, intent: "order", focus: ref("ServiceRequest", c.id + "-sr"), owner: { display: c.owner || "unassigned" },
          restriction: { period: { end: new Date(Store.fitClocks(c) ? Store.fitClocks(c).careBy : Date.parse(c.history[0].at) + (c.result.windowDays || 30) * Store.DAY).toISOString() } }, note: c.closure ? [{ text: "Closed: " + c.closure.reasonLabel + "; evidence " + c.closure.evidence }] : [] } }
      ] };
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/fhir+json" })); a.download = c.id + "-fhir.json"; a.click();
      Store.log(c.id, who, "Exported FHIR R4 bundle (Patient, Observation, ServiceRequest, Task)", "info"); Store.save();
    }
    if (k === "econsult") {
      // Ask the specialist with an urgency; the answer deadline becomes a step deadline and can go late. The specialist answers here.
      const open = Store.openConsult(c), answering = open && Store.S.data.role === "specialist";
      modal(answering ? `<h2>Answer e-consult</h2><p class="small"><b>${esc(open.by)}</b> (${esc(open.urgency)}, answer by ${esc(fmt(open.dueAt))}): ${esc(open.text)}</p><label for="q">Your answer</label><textarea id="q" rows="3">No contraindication from the referral. Standard prep is fine; we can offer a female endoscopist on Saturdays.</textarea>`
        : `<h2>Ask the specialist</h2><label for="q">Question</label><textarea id="q" rows="3">Patient anxious about sedation; prefers female clinician. Any reason not to proceed with standard prep?</textarea>
        <label for="urg">How soon do you need an answer?</label><select id="urg"><option value="Urgent">Urgent: within 4 hours</option><option value="Soon">Soon: within 24 hours</option><option value="Routine" selected>Routine: within 48 hours</option></select>`, (bg) => {
        const text = bg.querySelector("#q").value;
        if (answering) { open.answered = { by: who, text, at: Store.now() }; c.consultSeen = false; c.econsult.push({ by: who, text, at: Store.now(), reply: true }); Store.log(c.id, who, "Answered e-consult (" + open.urgency + ")" + (Store.now() > open.dueAt ? ", late" : ", in time"), "state"); }
        else {
          const urgency = bg.querySelector("#urg").value, hrs = { Urgent: 4, Soon: 24, Routine: 48 }[urgency];
          c.econsult = (c.econsult || []).concat([{ by: who, text, at: Store.now(), urgency, dueAt: Store.now() + hrs * 3600000 }]);
          Store.log(c.id, who, `E-consult to the specialist (${urgency}: answer within ${hrs} h, by ${fmt(Store.now() + hrs * 3600000)})`, "state");
        }
        Store.save();
      });
    }
  }

  function dashboard(root) {
    const cs = Store.S.data.cases, n = cs.length;
    const reached = (st) => st === "done" ? cs.filter((c) => c.state === "closed" && c.closure && ["completed_normal", "completed_surveillance", "treatment_started", "confirmed_normal_repeat", "treated_elsewhere"].includes(c.closure.reason)).length : cs.filter((c) => Store.S.data && ORDER.indexOf(c.state) >= ORDER.indexOf(st) || c.history.some((h) => h.state === st)).length;
    const funnel = [["issued", "Result issued"], ["notified", "Patient notified"], ["acknowledged", "Acknowledged"], ["referral", "Referral sent"], ["booked", "Booked"], ["attended", "Attended"], ["done", "Follow-up completed"]];
    // Headline (concept review, 18 Nov): only closures where care happened count as success, and only inside the window.
    const GOOD = ["completed_normal", "completed_surveillance", "treatment_started", "confirmed_normal_repeat", "treated_elsewhere"], NOCARE = ["declined", "lost", "moved_abroad", "deceased"];
    const closedAt = (c) => { const h = c.history.find((x) => x.state === "closed"); return h ? Date.parse(h.at) : null; };
    const goodC = cs.filter((c) => c.state === "closed" && c.closure && GOOD.includes(c.closure.reason));
    const inTime = goodC.filter((c) => Store.inTime(c, closedAt(c))).length;
    const noCare = cs.filter((c) => c.state === "closed" && c.closure && NOCARE.includes(c.closure.reason)).length;
    const daysTo = (st) => { const v = cs.map((c) => { const a = c.history.find((h) => h.state === st); return a ? (Date.parse(a.at) - Date.parse(c.history[0].at)) / Store.DAY : null; }).filter((x) => x !== null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)].toFixed(1) : "—"; };
    const open = cs.filter((c) => c.state !== "closed"), over = open.filter((c) => Store.status(c).overdue).length;
    const reasons = {}; cs.forEach((c) => { const b = (c.barriers && c.barriers.length ? c.barriers : c.barrier ? [c.barrier] : []); b.forEach((x) => { const RN = { gender: "Prefers female doctor", time: "Time off work", prep: "Prep worries" }; const k = RN[x] || x.charAt(0).toUpperCase() + x.slice(1); reasons[k] = (reasons[k] || 0) + 1; }); });
    const by = (key) => { const g = {}, NM = { en: "English", ar: "Arabic" }; cs.forEach((c) => { const k = key === "lang" ? NM[c.lang] || c.lang : c[key]; g[k] = g[k] || { n: 0, done: 0 }; g[k].n++; if (["attended", "closed"].includes(c.state)) g[k].done++; }); return g; };
    const bars = (obj, total, pct) => Object.entries(obj).sort((a, b) => (pct ? b[1].n - a[1].n : b[1] - a[1])).map(([k, v]) => { const val = pct ? Math.round(v.done / v.n * 100) : v; const w = pct ? val : Math.round(v / total * 100); return `<div class="bar"><span>${esc(k)}${pct ? ` <span class="tiny">n=${v.n}</span>` : ""}</span><span class="tr"><span class="fl" style="width:${w}%"></span></span><span class="num">${val}${pct ? "%" : ""}</span></div>`; }).join("");
    const sim = ui().sim, lift = 13;
    const att = reached("attended"), attSim = Math.min(n, Math.round(att + n * lift / 100));
    const age = (c) => c.age < 50 ? "40–49" : c.age < 60 ? "50–59" : c.age < 70 ? "60–69" : "70+";
    cs.forEach((c) => (c.ageBand = age(c)));
    const L = by("lang"), gap = Math.abs(Math.round(L.English.done / L.English.n * 100) - Math.round(L.Arabic.done / L.Arabic.n * 100));
    const topR = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0] || ["—", 0];
    const insight = [`${over} of ${open.length} open cases (${open.length ? Math.round(over / open.length * 100) : 0}%) are past the deadline for their current step.`,
      `The most common barrier is “${topR[0]}” (${topR[1]} patients).`,
      `Completion differs by ${gap} percentage points between English and Arabic speakers.`];
    const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);
    const closed = cs.filter((c) => c.state === "closed" && c.closure), tx = closed.filter((c) => c.closure.reason === "treatment_started").length;
    const RL = { completed_normal: "Completed: normal", completed_surveillance: "Surveillance plan", treatment_started: "Treatment started", confirmed_normal_repeat: "Normal on repeat test", treated_elsewhere: "Treated elsewhere", declined: "Declined after a talk", lost: "Lost to follow-up", moved_abroad: "Moved abroad", deceased: "Deceased" };
    const closeR = {}; closed.forEach((c) => { const k = RL[c.closure.reason] || c.closure.reason; closeR[k] = (closeR[k] || 0) + 1; });
    const tbc = cs.filter((c) => c.teachBack), tbN = tbc.length, tb = { correct: 0, corrected: 0, skipped: 0 }; tbc.forEach((c) => { tb[c.teachBack] = (tb[c.teachBack] || 0) + 1; });
    const fbc = cs.filter((c) => c.feedback && c.feedback.a && c.feedback.b), fbN = fbc.length, fbA = fbc.filter((c) => c.feedback.a === 3).length, fbB = fbc.filter((c) => c.feedback.b === 3).length;
    root.innerHTML = `${Store.S.data.role === "lead" ? `<p class="small" style="margin:0 0 10px"><b>You are Dr. Khalid, programme lead.</b> The whole programme: the loop, time to care, escalations and equity. <a href="#/team">All cases →</a></p>` : ""}<div class="row" style="justify-content:space-between;margin-bottom:12px"><div class="tabs" style="margin:0"><button class="${sim ? "" : "on"}" data-sim="0">Now</button><button class="${sim ? "on" : ""}" data-sim="1">Simulation: with navigation</button></div>
      <span class="tiny">${sim ? `Simulation: +${lift} percentage points completion, the effect size of patient navigation in the PRECISE RCT. Not measured data.` : "Synthetic cohort, current demo clock."}</span></div>
    <div class="aidraft" style="margin-bottom:16px"><div class="aih">Weekly insight · draft · numbers only from this page</div>${insight.map((l) => `<div class="small">${esc(l)}</div>`).join("")}</div>
    <div class="card headline" style="margin-bottom:16px"><div class="row" style="align-items:baseline;gap:12px;flex-wrap:wrap"><span class="small"><b>Follow-up completed in time</b></span>
      <b style="font-size:32px">${pct(inTime, n)}%</b><span class="small">${inTime} of ${n} actionable results: care done and the case closed with evidence inside its guideline window</span></div>
      <div class="row" style="gap:16px;margin-top:6px;flex-wrap:wrap"><span class="tiny">Completed later than the window: ${goodC.length - inTime}</span><span class="tiny" style="color:var(--red)">Closed without care (declined, lost, moved abroad, deceased): ${noCare}. Never counted as success.</span></div></div>
    <div class="grid4">
      <div class="card stat"><span class="tiny">Open actionable results</span><b>${open.length}</b><span class="tiny">of ${n} in cohort</span></div>
      <div class="card stat"><span class="tiny">Overdue now</span><b style="color:var(--red)">${over}</b><span class="tiny">of ${open.length} open (${open.length ? Math.round(over / open.length * 100) : 0}%) · step over SLA</span></div>
      <div class="card stat"><span class="tiny">Median days to notification</span><b style="${+daysTo("notified") > 2 ? "color:var(--red)" : ""}">${daysTo("notified")}</b><span class="tiny">target ≤ 2 days</span></div>
      <div class="card stat"><span class="tiny">Median days to attended</span><b>${daysTo("attended")}</b><span class="tiny">FIT+: referral ≤15 working days, colonoscopy ≤31 working days after it</span></div></div>
    <div class="grid2" style="margin-top:16px">
      <div class="card"><h2>Loop funnel${sim ? " (simulation)" : ""}</h2>${(() => { let prev = n; return funnel.map(([st, l]) => { let v = reached(st); if (sim && ["booked", "attended", "closed", "done"].includes(st)) v = Math.min(prev, Math.round(v + n * lift / 100)); prev = v; return `<div class="bar"><span>${l}</span><span class="tr"><span class="fl" style="width:${Math.round(v / n * 100)}%"></span></span><span class="num">${v}</span></div>`; }).join(""); })()}
        <p class="tiny">Count of cases that reached each step. Synthetic cohort of ${n}.</p></div>
      <div class="card"><h2>Closed without care</h2><div class="row" style="align-items:baseline;gap:8px"><b style="font-size:28px;color:var(--red)">${noCare}</b><span class="small">of ${closed.length} closed cases</span></div>
        ${bars(Object.fromEntries(Object.entries(closeR).filter(([k]) => ["Declined after a talk", "Lost to follow-up", "Moved abroad", "Deceased"].includes(k))), closed.length || 1)}
        <p class="tiny">Shown on its own and never in the success number. Declined and lost need a second signature from the clinical lead.</p></div>
      <div class="card"><h2>Treatment initiation</h2>
        <div class="row" style="align-items:baseline;gap:8px"><b style="font-size:28px">${tx}</b><span class="small">of ${closed.length} closed cases started treatment (${pct(tx, closed.length)}%)</span></div>
        ${bars(closeR, closed.length || 1)}
        <p class="tiny">From the signed closure reason code. Each closure needs a report, Malaffi record or signed note. Synthetic cohort.</p></div>
      <div class="card"><h2>Patient understanding and confidence</h2>
        <div class="bar"><span>Understood first time (teach-back)</span><span class="tr"><span class="fl" style="width:${pct(tb.correct, tbN)}%"></span></span><span class="num">${pct(tb.correct, tbN)}%</span></div>
        <div class="bar"><span>Understood after a short correction</span><span class="tr"><span class="fl" style="width:${pct(tb.corrected, tbN)}%"></span></span><span class="num">${pct(tb.corrected, tbN)}%</span></div>
        <div class="bar"><span>Skipped the check</span><span class="tr"><span class="fl" style="width:${pct(tb.skipped, tbN)}%"></span></span><span class="num">${pct(tb.skipped, tbN)}%</span></div>
        <div class="bar"><span>“Explained clearly” (top face)</span><span class="tr"><span class="fl" style="width:${pct(fbA, fbN)}%"></span></span><span class="num">${pct(fbA, fbN)}%</span></div>
        <div class="bar"><span>“Felt guided at each step” (top face)</span><span class="tr"><span class="fl" style="width:${pct(fbB, fbN)}%"></span></span><span class="num">${pct(fbB, fbN)}%</span></div>
        <p class="tiny">Teach-back: n=${tbN} patients who acknowledged the result. Faces: n=${fbN} closed cases that answered the 2 questions (3-face scale). Synthetic, not measured.</p></div>
      <div class="card"><h2>Reasons for delay or drop-off</h2>${bars(reasons, Object.values(reasons).reduce((a, b) => a + b, 0) || 1)}<p class="tiny">From the barrier check in the patient chat.</p></div>
      <div class="card"><h2>Completion by language</h2>${bars(by("lang"), 0, true)}<p class="tiny">Share of cases attended or closed. Equity check: gaps between groups show where to act.</p></div>
      <div class="card"><h2>Completion by insurance</h2>${bars(by("insurance"), 0, true)}<p class="tiny">Basic plans have co-pays in this synthetic model.</p></div>
      <div class="card"><h2>Completion by nationality group</h2>${bars(by("nationality"), 0, true)}<p class="tiny">Small groups (n&lt;40): differences may be chance.</p></div>
      <div class="card"><h2>Completion by age band</h2>${bars(by("ageBand"), 0, true)}<p class="tiny">Small groups (n&lt;70): differences may be chance.</p></div>
    </div>`;
    root.querySelectorAll("[data-sim]").forEach((b) => (b.onclick = () => { ui().sim = b.dataset.sim === "1"; Store.save(); }));
  }
  window.Team = { rejectReferral,  worklist, caseView, dashboard, ROLES, sbar, CLINIC_LINE };
})();
