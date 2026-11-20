// Figure audit (build plan, section 4.6; AC-04): the golden cases F01 to F15 and adversarial texts.
// The run's known figures are the expected values of D1 to D3 and the method's parameters (what
// erp_get_overview returns); the known ids are the fixture world's. Each text must pass or fail as
// expected, naming exactly the expected offending tokens.
// Usage: node tests/audit.mjs
import { readFileSync } from "node:fs";
import path from "node:path";
import { APP_ROOT } from "./lib/harness.mjs";
import { KnownFigures, auditText, extractFigures } from "../js/figures.js";
import { PARAMS, PARAM_TYPES } from "../js/params.js";
import { RULES } from "../js/rules.js";

const load = (f) => JSON.parse(readFileSync(path.join(APP_ROOT, "tests", "fixtures", f), "utf8"));
const WORLD = load("world.json");
const EXPECTED = load("expected.json");
const frac = (s) => {
  const t = String(s).trim();
  if (/^none$/i.test(t)) return null;
  const m = /^(-?\d+(?:\.\d+)?)\/(\d+)$/.exec(t);
  return m ? Number(m[1]) / Number(m[2]) : Number(t.replace(/,/g, ""));
};

/** The run's known figures and ids for the F cases (section 11: D1 to D3 plus the parameters). */
function fixtureRun() {
  const k = new KnownFigures();
  for (const e of EXPECTED.D1.exceptions) {
    k.amount(e.spend_eur, "EUR");
    k.amount(frac(e.financing_cost_eur), "EUR");
    k.id(`${e.rule}|${e.record}`);
  }
  const d2 = EXPECTED.D2;
  k.count(frac(d2.Exceptions.exact));
  for (const n of d2["By severity: high, medium, low"].exact.split(",")) k.count(Number(n));
  for (const part of d2["By routed-to person"].exact.split(",")) k.count(Number(part.trim().split(/\s+/)[1]));
  for (const label of ["Spend in the window (€)", "Clean spend (€), lines L11 and L12", "Spend with an open exception (€)", "Financing cost of paying early, last 365 days (€)", "Of which on unpaid lines (€)"]) k.amount(frac(d2[label].exact), "EUR");
  k.share(frac(d2["Clean spend share"].exact));
  for (const [label, v] of Object.entries(EXPECTED.D3)) {
    if (/^Closure rate|^Projected closure|14-day closure share/.test(label)) { if (frac(v.exact) !== null) k.share(frac(v.exact)); }
    else if (/^Monthly inflow/.test(label)) k.count(frac(v.exact));
    else if (/still found/.test(label)) k.count(v.exact.split(",").length);
    else k.count(frac(v.exact));
  }
  for (const [name, value] of Object.entries(PARAMS)) k.add(PARAM_TYPES[name], value, "EUR");
  // Ids: every fixture record, the log's entries, the rules, the order numbers and company codes.
  for (const product of ["users", "suppliers", "materials", "contracts", "po_lines", "exception_log", "company_codes"]) for (const r of WORLD[product]) k.id(r.id);
  for (const l of WORLD.po_lines) { k.id(l.po); k.id(`${l.po}/${l.item}`); }
  for (const r of RULES) k.id(r.id);
  return k;
}

const failures = [];
let checks = 0;
const run = fixtureRun();
const show = (r) => (r.ok ? "Pass" : `Fail: ${r.offending.map((o) => o.token).join(", ")}`);
function expect(id, text, pass, offending, known = run, opts = {}) {
  checks += 1;
  const r = auditText(text, known, opts);
  const got = r.offending.map((o) => o.token);
  const ok = r.ok === pass && JSON.stringify(got) === JSON.stringify(offending);
  if (!ok) failures.push(`${id} "${text}": got ${show(r)} (${r.offending.map((o) => `${o.token}: ${o.reason}`).join("; ") || "nothing flagged"}), expected ${pass ? "Pass" : `Fail: ${offending.join(", ")}`}`);
  return r;
}

// The golden cases F01 to F15.
for (const f of EXPECTED.F) {
  const r = expect(f.id, f.text, f.pass, f.offending);
  console.log(`${failures.some((x) => x.startsWith(f.id + " ")) ? "FAIL" : "PASS"}  ${f.id} ${f.text.padEnd(64)} ${show(r)}`);
}
const fFailed = failures.length;

// Adversarial texts on the same run (risk R2 of the plan): ids that look like numbers, codes after
// their words, units, precision, dates.
const A = [
  ["A01", "Order 4500000102/10 has no contract reference.", true, []],
  ["A02", "Order 4500000199/10 has no contract reference.", false, ["4500000199/10"]],
  ["A03", "The lines of company code 1000 and company code 3000 are affected.", true, []],
  ["A04", "Company code 4000 has no lines.", false, ["Company code 4000"]],
  ["A05", "DQ-07 fires on L03 and L10; DQ-07|L03 is still open.", true, []],
  ["A06", "DQ-16 fires on L03.", false, ["DQ-16"]],
  ["A07", "DQ-07|L04 is open.", false, ["DQ-07|L04"]],
  ["A08", "The follow-up window is 14 days, the analysis window 365 days.", true, []],
  ["A09", "The follow-up window is 15 days.", false, ["15 days"]],
  ["A10", "€1,725 of spend sits on L07.", true, []],
  ["A11", "€58.725 of spend has an open exception.", false, ["€58.725"]],
  ["A12", "71.4% were closed, about 71% of the cohort; clean spend is 6.38% of the spend.", true, []],
  ["A13", "Paying early cost €72.66, not €72.6.", false, ["€72.6"]],
  ["A14", "The unpaid lines cost €18.41.", true, []],
  ["A15", "Eighteen exceptions are open; three owners will hear from us.", true, []],
  ["A16", "DQ-01 gains 1.3 exceptions a month and DQ-02 0.7.", true, []],
  ["A17", "Line L1 has no requester.", false, ["L1"]],
  ["A18", "Supplier S5 duplicates supplier S1.", true, []],
  ["A19", "Supplier 30008 duplicates S1.", false, ["Supplier 30008"]],
  ["A20", "Ordered on Thu 19 Nov 2026 and on 2026-11-12.", true, []],
  ["A21", "Ordered on Fri 19 Nov 2026.", false, ["Fri 19 Nov 2026"]],
  ["A22", "Ordered on 2026-02-30.", false, ["2026-02-30"]],
  ["A23", "A day costs €1,200 and a mass change takes 2 minutes per record.", true, []],
  ["A24", "The cost of capital is 6% a year.", true, []],
  ["A25", "That is €0 for the other rules.", true, []],
  ["A26", "Spend with an open exception: EUR 58,725, or 58,725 euros.", true, []],
  ["A27", "It is 2026 and 19 exceptions are open.", false, ["2026", "19"]]
];
for (const [id, text, pass, offending] of A) expect(id, text, pass, offending);

// Amounts follow the brief's rule: within half a unit of the last digit and within 2 % of the
// figure, with no €0.50 floor (correction B8 in TECH_NOTES proposes a floor for whole euros).
const small = new KnownFigures();
small.amount(1344 / 73, "EUR");
expect("B01", "The unpaid lines cost €18.41.", true, [], small);
expect("B02", "The unpaid lines cost €18.", false, ["€18"], small);
expect("B03", "The unpaid lines cost €18.", true, [], small, { wholeEuroFloor: true });
expect("B04", "The unpaid lines cost €19.", false, ["€19"], small, { wholeEuroFloor: true });
// The proposed floor leaves the golden cases as they are: F01 to F15 give the same results with it.
for (const f of EXPECTED.F) expect(`${f.id}+floor`, f.text, f.pass, f.offending, run, { wholeEuroFloor: true });
// Currency: a pound figure is not a euro figure.
const gbp = new KnownFigures();
gbp.amount(1500, "GBP");
expect("C01", "The order was for £1,500.", true, [], gbp);
expect("C02", "The order was for €1,500.", false, ["€1,500"], gbp);
// What the reader extracts, with its type.
const types = extractFigures("€58.7k, 6.4%, 14 days, 18 exceptions, 4500000101/10, plant 1010").map((f) => `${f.type}:${f.raw}`);
checks += 1;
const wantTypes = ["amount:€58.7k", "share:6.4%", "days:14 days", "count:18", "id:4500000101/10", "code:plant 1010"];
if (JSON.stringify(types) !== JSON.stringify(wantTypes)) failures.push(`reader: got ${JSON.stringify(types)}, expected ${JSON.stringify(wantTypes)}`);

for (const f of failures.slice(fFailed)) console.log(`FAIL  ${f}`);
if (fFailed) for (const f of failures.slice(0, fFailed)) console.log(`FAIL  ${f}`);
console.log(`${checks - failures.length}/${checks} audit checks passed (F01 to F15: ${EXPECTED.F.length - fFailed}/${EXPECTED.F.length}).`);
if (failures.length) process.exit(1);
console.log("AUDIT OK");
