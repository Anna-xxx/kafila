// Golden test set for the rules engine. Run: node tests/rules.test.js
const assert = require("assert");
const R = require("../js/rules.js");
const T = require("../data/thresholds.json"), F = require("../data/red-flags.json");
const fatima = { age: 52, sex: "female" };
const cases = [
  [{ test: "FIT", result: "positive" }, fatima, "L2", "yellow"],
  [{ test: "FIT", result: "negative" }, fatima, "L1", "green"],
  [{ test: "FIT", result: "inadequate" }, fatima, "L1", "green"],
  [{ test: "HPV", result: "negative" }, fatima, "L1", "green"],
  [{ test: "HPV", result: "positive_16_18" }, fatima, "L2", "yellow"],
  [{ test: "HPV", result: "suspicious" }, fatima, "L3", "red"],
  [{ test: "HPV", result: "negative" }, { age: 40, sex: "male" }, "L2", "yellow"],
  [{ test: "HBA1C", value: 5.4, unit: "%" }, fatima, "L1", "green"],
  [{ test: "HBA1C", value: 6.1, unit: "%" }, fatima, "L1", "green"],
  [{ test: "HBA1C", value: 6.5, unit: "%" }, fatima, "L2", "yellow"],
  [{ test: "HBA1C", value: 48, unit: "mmol/mol" }, fatima, "L2", "yellow"],
  [{ test: "BP", sys: 118, dia: 76 }, fatima, "L1", "green"],
  [{ test: "BP", sys: 125, dia: 78 }, fatima, "L1", "green"],
  [{ test: "BP", sys: 135, dia: 85 }, fatima, "L1", "green"],
  [{ test: "BP", sys: 145, dia: 85 }, fatima, "L2", "yellow"],
  [{ test: "BP", sys: 165, dia: 95 }, fatima, "L2", "yellow"],
  [{ test: "BP", sys: 150, dia: 121 }, fatima, "L3", "red"],
  [{ test: "BP", sys: 185, dia: 100 }, fatima, "L3", "red"],
  [{ test: "FIT", result: "positive" }, { age: 16 }, "L2", "yellow"],
  [{ test: "FIT", result: "negative" }, { age: 50, pregnant: true }, "L2", "yellow"],
  [{ test: "PSA", value: 5 }, fatima, "L2", "yellow"],
];
let n = 0;
for (const [r, p, level, zone] of cases) {
  const c = R.classify(T, r, p);
  assert.strictEqual(c.level, level, JSON.stringify(r) + " level " + c.level);
  assert.strictEqual(c.zone, zone, JSON.stringify(r) + " zone " + c.zone);
  n++;
}
assert.ok(R.classify(T, { test: "BP", sys: 145, dia: 85 }, fatima).note, "single BP reading note");
const flags = [
  ["I'm bleeding a lot", "L4"], ["I have heavy bleeding", "L4"], ["chest pain since morning", "L4"],
  ["أعاني من نزيف شديد", "L4"], ["I noticed black stools", "L3"], ["I want to die", "MH"],
  ["I'm scared", "HUMAN"], ["أنا خائفة", "HUMAN"], ["Is it cancer?", null], ["Is it covered by my insurance?", null],
  ["What is a FIT test?", null],
];
for (const [q, k] of flags) {
  const f = R.redFlag(F, q, "en");
  assert.strictEqual(f ? f.kind : null, k, q);
  n++;
}
assert.strictEqual(R.caseLevel("L2", { kind: "L4" }), "L4");
assert.strictEqual(R.caseLevel("L2", null, "L1"), "L2", "AI cannot lower");
assert.strictEqual(R.caseLevel("L2", null, "L3"), "L3", "AI can raise");
console.log("OK", n + 3, "checks passed");
