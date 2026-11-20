// Golden cases D1 to D4 (build plan, section 11; AC-01 and AC-02): the rule engine, the totals,
// history and reconciliation, the projection and the fix paths, run on the fixture world of
// tests/fixtures/world.json and compared with tests/fixtures/expected.json. Raw values must lie
// within 1e-9 of the exact fractions; display strings must match character for character.
// Usage: node tests/engine.mjs              (D1 to D4)
//        node tests/engine.mjs D1 D2        (only the named cases)
import { readFileSync } from "node:fs";
import path from "node:path";
import { APP_ROOT } from "./lib/harness.mjs";
import { scan, totals, ruleSeverity, normaliseName } from "../js/engine.js";
import { closureRate, share14, inflow, reconcile, project, cohorts } from "../js/history.js";
import { fixPaths } from "../js/fixpaths.js";
import { euro, pct1, dec1, int, shareOrNone } from "../js/format.js";
import { PARAMS } from "../js/params.js";

const load = (f) => JSON.parse(readFileSync(path.join(APP_ROOT, "tests", "fixtures", f), "utf8"));
const WORLD = load("world.json");
const EXPECTED = load("expected.json");
const CASES = ["D1", "D2", "D3", "D4"];
const only = process.argv.slice(2);
const bad = only.filter((c) => !CASES.includes(c));
if (bad.length) { console.error(`Unknown case(s) ${bad.join(", ")}; known: ${CASES.join(" ")}`); process.exit(1); }
const chosen = CASES.filter((c) => !only.length || only.includes(c));

/** "2160/73" → 2160/73, "1" → 1, "none" → null. */
const frac = (s) => {
  const t = String(s).trim();
  if (/^none$/i.test(t)) return null;
  const m = /^(-?\d+(?:\.\d+)?)\/(\d+)$/.exec(t);
  return m ? Number(m[1]) / Number(m[2]) : Number(t.replace(/,/g, ""));
};
const TOL = 1e-9;
let checks = 0;
const failures = [];
const near = (got, want) => (want === null ? got === null : typeof got === "number" && Math.abs(got - want) <= TOL);
function eq(label, got, want) {
  checks += 1;
  const ok = typeof want === "number" || want === null ? near(got, want) : JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures.push(`${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
  return ok;
}
const clone = (x) => JSON.parse(JSON.stringify(x));

// The first scan of the fixture world, as the engine runs it in the app.
const first = scan(WORLD, { day: 0 });

// Display strings of D1's values, derived from section 5's rules (euros without decimals); D1's
// table gives the exact values only.
const D1_DISPLAY = {
  8000: "€8,000", 5000: "€5,000", 1725: "€1,725", 3000: "€3,000", 4000: "€4,000", 2000: "€2,000",
  7000: "€7,000", 10000: "€10,000", 28000: "€28,000", "2160/73": "€30", "1800/73": "€25", "1344/73": "€18", 0: "€0"
};

function caseD1() {
  const rows = EXPECTED.D1.exceptions;
  eq("D1 number of exceptions", first.exceptions.length, rows.length);
  const extra = first.exceptions.filter((e) => !rows.some((r) => r.rule === e.rule && r.record === e.record.id)).map((e) => e.id);
  eq("D1 exceptions the brief does not list", extra, []);
  for (const r of rows) {
    const e = first.exceptions.find((x) => x.rule === r.rule && x.record.id === r.record);
    const tag = `D1 #${r.n} ${r.rule} ${r.record_as_written}`;
    checks += 1;
    if (!e) { failures.push(`${tag}: not found by the engine`); continue; }
    eq(`${tag} id`, e.id, `${r.rule}|${r.record}`);
    eq(`${tag} routed to`, e.routed_to, r.routed_to);
    eq(`${tag} spend affected`, e.spend_eur, r.spend_eur);
    eq(`${tag} financing cost`, e.financing_cost_eur, frac(r.financing_cost_eur));
    eq(`${tag} unpaid`, e.unpaid, r.unpaid);
    eq(`${tag} severity`, e.severity, ruleSeverity(r.rule));
    eq(`${tag} spend display`, euro(e.spend_eur), D1_DISPLAY[r.spend_eur]);
    eq(`${tag} financing cost display`, euro(e.financing_cost_eur), D1_DISPLAY[r.financing_cost_eur]);
    eq(`${tag} status before reconciliation`, e.status, "open");
    eq(`${tag} rule-set version`, typeof e.rule_set_version === "string" && /^\d+\.\d+\.\d+$/.test(e.rule_set_version), true);
  }
  // The engine's own order (section 6.5): severity, then spend affected (largest first, B6), then
  // rule id, then record id. Recomputed here from D1's rows.
  const SEV = { high: 0, medium: 1, low: 2 };
  const want = rows.slice().sort((a, b) => SEV[ruleSeverity(a.rule)] - SEV[ruleSeverity(b.rule)] || b.spend_eur - a.spend_eur
    || a.rule.localeCompare(b.rule) || a.record.localeCompare(b.record, "en", { numeric: true })).map((r) => `${r.rule}|${r.record}`);
  eq("D1 order of the engine's list", first.exceptions.map((e) => e.id), want);
  // The reasons the brief gives for some of them.
  const has = (id) => first.exceptions.some((e) => e.id === id);
  eq("D1 no DQ-01 on L03 (no material group to match a contract)", has("DQ-01|L03"), false);
  eq("D1 no DQ-01 on L04 (K1 belongs to S1, not S5)", has("DQ-01|L04"), false);
  eq("D1 no DQ-07 on L06 (S2 has no terms in 1000: DQ-09)", has("DQ-07|L06"), false);
  const pair = first.exceptions.find((e) => e.id === "DQ-12|S1+S5");
  eq("D1 S1 and S5 found by VAT ID and by normalised name", pair ? pair.match.slice().sort() : null, ["name", "vat"]);
  const dq01 = first.exceptions.find((e) => e.id === "DQ-01|L02");
  eq("D1 DQ-01 on L02 suggests K1", dq01?.suggestion?.value, "K1");
}

// Rule details beyond D1's rows, on small changes to a copy of the fixture world (they are part of
// the D1 gate because they test the same rules).
function rulesExtra() {
  const w = () => clone(WORLD);
  const ids = (world) => scan(world, { day: 0 }).exceptions.map((e) => e.id);
  const find = (world, id) => scan(world, { day: 0 }).exceptions.find((e) => e.id === id);
  const user = (world, id) => world.users.find((u) => u.id === id);
  const line = (world, id) => world.po_lines.find((l) => l.id === id);
  // Routing: responsible if active today, else the manager if active, else the procurement lead.
  let x = w(); user(x, "U03").active_until = -1;
  eq("rules: an inactive buyer's exception goes to the active manager", find(x, "DQ-01|L02")?.routed_to, "U04");
  x = w(); user(x, "U03").active_until = -1; user(x, "U04").active_until = -1;
  eq("rules: with buyer and manager inactive it goes to the procurement lead", find(x, "DQ-01|L02")?.routed_to, "U10");
  x = w(); user(x, "U03").active_until = 0;
  eq("rules: active until today counts as active", find(x, "DQ-01|L02")?.routed_to, "U03");
  // DQ-12 by one criterion only.
  x = w(); x.suppliers.find((s) => s.id === "S5").vat_id = "DE999999999";
  eq("rules: DQ-12 by normalised name alone", find(x, "DQ-12|S1+S5")?.match, ["name"]);
  x = w(); x.suppliers.find((s) => s.id === "S5").name = "Omega Werkzeuge GmbH";
  eq("rules: DQ-12 by VAT ID alone", find(x, "DQ-12|S1+S5")?.match, ["vat"]);
  x = w(); x.suppliers.find((s) => s.id === "S5").name = "Alpha Tools Ltd"; x.suppliers.find((s) => s.id === "S5").vat_id = "DE999999999"; x.suppliers.find((s) => s.id === "S5").country = "GB";
  eq("rules: the same normalised name in another country is no duplicate", ids(x).includes("DQ-12|S1+S5"), false);
  x = w(); x.suppliers.find((s) => s.id === "S5").name = "Alpha Tool GmbH"; x.suppliers.find((s) => s.id === "S5").vat_id = "DE999999999";
  eq("rules: a similar name alone is no duplicate", ids(x).includes("DQ-12|S1+S5"), false);
  eq("rules: normalised names drop dots and legal forms", [normaliseName("Beta Lab Supplies S.A.R.L."), normaliseName("ALPHA-TOOLS GmbH"), normaliseName("Inno IT-Services AG")], ["beta lab supplies", "alpha tools", "inno it services"]);
  // DQ-14 without an owner; DQ-15 with a contract that does not exist; DQ-04 with an unknown requester.
  x = w(); x.contracts.find((k) => k.id === "K2").owner = null;
  eq("rules: DQ-14 fires on a contract without an owner", find(x, "DQ-14|K2")?.owner_problem, "missing");
  x = w(); line(x, "L08").contract = "K9";
  eq("rules: DQ-15 fires on a reference to a contract that does not exist", find(x, "DQ-15|L08")?.contract_found, false);
  x = w(); line(x, "L01").requester = "U99";
  eq("rules: DQ-04 fires on a requester that matches no user", ids(x).includes("DQ-04|L01"), true);
  // DQ-08 on the block day, not before.
  x = w(); line(x, "L04").day = -20;
  eq("rules: DQ-08 fires on the day the block starts", ids(x).includes("DQ-08|L04"), true);
  x = w(); line(x, "L04").day = -21;
  eq("rules: DQ-08 does not fire the day before", ids(x).includes("DQ-08|L04"), false);
  // Unpaid: ordered fewer days ago than its own terms.
  x = w(); line(x, "L10").day = -13;
  eq("rules: L10 ordered 13 days ago on 14-day terms is unpaid", find(x, "DQ-07|L10")?.unpaid, true);
  x = w(); line(x, "L10").day = -14;
  eq("rules: L10 ordered 14 days ago on 14-day terms is paid", find(x, "DQ-07|L10")?.unpaid, false);
  // The analysis window: the last 365 days are days −364 to 0.
  x = w(); line(x, "L11").day = -364;
  eq("rules: a line 364 days ago is in the window", totals(x, scan(x, { day: 0 }).exceptions).spend_window_eur, frac(EXPECTED.D2["Spend in the window (€)"].exact));
  x = w(); line(x, "L11").day = -365;
  eq("rules: a line 365 days ago is outside the window", totals(x, scan(x, { day: 0 }).exceptions).spend_window_eur, frac(EXPECTED.D2["Spend in the window (€)"].exact) - 2500);
  // DQ-01 with two covering contracts: the one valid from the latest day.
  x = w(); x.contracts.push({ id: "K3", supplier: "S1", company_code: "1000", material_group: "MRO-TOOLS", valid_from: -100, valid_to: 100, payment_terms_days: 60, owner: "U03" });
  eq("rules: DQ-01 suggests the covering contract valid from the latest day", find(x, "DQ-01|L02")?.suggestion?.value, "K3");
  // DQ-06 without agreed terms has no financing cost but keeps its unpaid flag (paid on receipt).
  x = w(); line(x, "L05").contract = null; x.suppliers.find((s) => s.id === "S2").payment_terms = {};
  const dq06 = find(x, "DQ-06|L05");
  eq("rules: DQ-06 without agreed terms costs nothing and suggests nothing", [dq06?.financing_cost_eur, dq06?.unpaid, dq06?.suggestion], [0, false, null]);
  // A filtered scan keeps only the exceptions whose records match.
  const f = scan(WORLD, { day: 0, filters: { company_code: "3000" } }).exceptions.map((e) => e.id);
  eq("rules: a scan filtered to company code 3000", f, ["DQ-06|L05", "DQ-13|M3", "DQ-14|K2", "DQ-15|L05"]);
  // The world is never changed by a scan.
  const before = JSON.stringify(WORLD);
  scan(WORLD, { day: 0 });
  eq("rules: a scan leaves the world unchanged", JSON.stringify(WORLD) === before, true);
}

function caseD2() {
  const d2 = EXPECTED.D2;
  const t = totals(WORLD, first.exceptions, { day: 0 });
  eq("D2 exceptions", t.count, frac(d2.Exceptions.exact));
  eq("D2 exceptions display", int(t.count), d2.Exceptions.display);
  const [hi, me, lo] = d2["By severity: high, medium, low"].exact.split(",").map((x) => Number(x.trim()));
  eq("D2 by severity", [t.by_severity.high, t.by_severity.medium, t.by_severity.low], [hi, me, lo]);
  const routed = Object.fromEntries(d2["By routed-to person"].exact.split(",").map((x) => x.trim().split(/\s+/)).map(([u, n]) => [u, Number(n)]));
  eq("D2 by routed-to person", t.by_routed_to, routed);
  const pairs = [
    ["Spend in the window (€)", t.spend_window_eur, euro],
    ["Clean spend (€), lines L11 and L12", t.clean_spend_eur, euro],
    ["Clean spend share", t.clean_share, pct1],
    ["Spend with an open exception (€)", t.open_spend_eur, euro],
    ["Financing cost of paying early, last 365 days (€)", t.financing_cost_eur, euro],
    ["Of which on unpaid lines (€)", t.financing_cost_unpaid_eur, euro]
  ];
  for (const [label, got, fmt] of pairs) {
    eq(`D2 ${label}`, got, frac(d2[label].exact));
    eq(`D2 ${label} display`, fmt(got), d2[label].display);
  }
  eq("D2 the clean lines are L11 and L12", t.clean_lines, ["L11", "L12"]);
  eq("D2 open spend equals all spend less clean spend", near(t.open_spend_eur, t.spend_window_eur - t.clean_spend_eur), true);
}

function caseD3() {
  const d3 = EXPECTED.D3;
  const log = WORLD.exception_log;
  const before = closureRate(log, 0);
  eq("D3 closure rate before the first scan", before.value, frac(d3["Closure rate before the first scan"].exact));
  eq("D3 closure rate before display", pct1(before.value), d3["Closure rate before the first scan"].display);
  for (const rule of ["DQ-01", "DQ-02", "DQ-07", "DQ-10"]) {
    const s = share14(log, [rule], 0);
    const label = `14-day closure share ${rule}`;
    eq(`D3 ${label}`, s.value, frac(d3[label].exact));
    eq(`D3 ${label} display`, shareOrNone(s.value), d3[label].display);
    const f = inflow(log, [rule], 0);
    const il = `Monthly inflow ${rule}`;
    eq(`D3 ${il}`, f, frac(d3[il].exact));
    eq(`D3 ${il} display`, dec1(f), d3[il].display);
  }
  // The first scan reconciles with the log.
  const rec = reconcile(log, first.exceptions, { day: 0 });
  const still = d3["First scan: entries still found, still routed"];
  eq("D3 entries still found", rec.still, still.exact.split(",").map((x) => x.trim()));
  eq("D3 entries still found display", int(rec.still.length), still.display);
  eq("D3 they stay routed", rec.still.map((id) => rec.log.find((x) => x.id === id).status), rec.still.map(() => "routed"));
  const closed = d3["First scan: closed by re-scan"];
  eq("D3 closed by re-scan", rec.closed, closed.exact.split(",").map((x) => x.trim()));
  eq("D3 closed by re-scan display", int(rec.closed.length), closed.display);
  const h03 = rec.log.find((x) => x.id === "H03");
  eq("D3 H03 closes today, closed by re-scan", [h03?.status, h03?.closed_day, h03?.reason], ["closed", 0, "closed by re-scan"]);
  const fresh = d3["First scan: new entries detected today"];
  eq("D3 new entries detected today", rec.fresh.length, frac(fresh.exact));
  eq("D3 new entries display", int(rec.fresh.length), fresh.display);
  eq("D3 new entries are open and detected today", rec.fresh.every((id) => { const x = rec.log.find((y) => y.id === id); return x.status === "open" && x.detected_day === 0 && x.routed_day === null; }), true);
  const openAfter = rec.log.filter((x) => ["open", "routed", "accepted"].includes(x.status)).length;
  eq("D3 open exceptions after the first scan", openAfter, frac(d3["Open exceptions after the first scan"].exact));
  eq("D3 open exceptions after display", int(openAfter), d3["Open exceptions after the first scan"].display);
  const after = closureRate(rec.log, 0);
  eq("D3 closure rate after the first scan", after.value, frac(d3["Closure rate after the first scan"].exact));
  eq("D3 closure rate after display", pct1(after.value), d3["Closure rate after the first scan"].display);
  eq("D3 the input log is left unchanged", JSON.stringify(log), JSON.stringify(WORLD.exception_log));
  // The projection: a what-if on a copy of the data after the first scan.
  const label = "Projected closure rate after fixing L03's material group to MRO-TOOLS";
  const worldBefore = JSON.stringify(WORLD);
  const p = project(WORLD, rec.log, [{ product: "po_line", id: "L03", field: "material_group", value: "MRO-TOOLS" }], { day: 0 });
  eq(`D3 ${label}`, p.closure_rate.value, frac(d3[label].exact));
  eq(`D3 ${label} display`, pct1(p.closure_rate.value), d3[label].display);
  eq("D3 the projection closes H07", p.reconciliation.closed, ["H07"]);
  eq("D3 the projection's re-scan finds DQ-01 on L03, new and outside the cohort", p.scan.exceptions.some((e) => e.id === "DQ-01|L03") && p.reconciliation.fresh.length === 1, true);
  eq("D3 the projection leaves the world unchanged", JSON.stringify(WORLD) === worldBefore, true);
  // A dismissed exception is not raised again for the same rule and record.
  const dismissedLog = clone(rec.log);
  const x = dismissedLog.find((y) => y.rule === "DQ-13" && y.record === "M3");
  Object.assign(x, { status: "dismissed", closed_day: 0, reason: "test: not an error" });
  const again = scan(WORLD, { day: 0, log: dismissedLog });
  eq("D3 a dismissed exception is not raised again", again.exceptions.some((e) => e.id === "DQ-13|M3"), false);
  // A closed exception that reappears gets a new entry linked to the old one.
  const reopenLog = clone(log);
  reopenLog.push({ id: "H99", rule: "DQ-13", record: "M3", detected_day: -30, routed_day: -29, responsible: null, routed_to: null, status: "closed", closed_day: -20, reason: null, reopens: null });
  const re = reconcile(reopenLog, first.exceptions, { day: 0 });
  const reopened = re.log.find((y) => y.rule === "DQ-13" && y.record === "M3" && y.status === "open");
  eq("D3 a closed exception that reappears is reopened as a new entry", reopened?.reopens, "H99");
  // Scope: a scan of some rules reconciles only their entries.
  const part = scan(WORLD, { day: 0, rules: ["DQ-02"] });
  const recPart = reconcile(log, part.exceptions, { day: 0, rules: ["DQ-02"] });
  eq("D3 a scan of DQ-02 leaves DQ-01's entries alone", [recPart.closed, recPart.still], [[], ["H07"]]);
  // The eight weekly cohorts (section 6.6): H01 to H08 fall in weeks 1 to 6.
  const weeks = cohorts(log, 0);
  eq("D3 eight weekly cohorts", weeks.map((w) => [w.week, w.from, w.to]), [1, 2, 3, 4, 5, 6, 7, 8].map((k) => [k, -13 - 7 * k, -7 - 7 * k]));
  eq("D3 cohorts hold the cohort's entries", weeks.reduce((s, w) => s + w.detected, 0), 8);
  eq("D3 cohorts' closed and open add up to the closure rate", [weeks.reduce((s, w) => s + w.closed, 0), weeks.reduce((s, w) => s + w.open, 0), weeks.reduce((s, w) => s + w.dismissed, 0)], [before.closed, before.eligible - before.closed, 1]);
}

function caseD4() {
  const d4 = EXPECTED.D4;
  const c = d4.case;
  const exceptions = [];
  for (let i = 1; i <= c.n; i++) {
    const withSuggestion = i <= c.with_suggestion;
    const unpaid = withSuggestion ? i <= c.with_suggestion_unpaid : i - c.with_suggestion <= c.without_suggestion_unpaid;
    exceptions.push({ id: `X${i}`, lines: [`C1-L${String(i).padStart(2, "0")}`], financing_cost_eur: c.financing_cost_eur_each, unpaid, suggestion: withSuggestion ? { value: "fix" } : null });
  }
  const lineValue = (id) => (id.startsWith("C1-L") ? c.spend_eur_each : 0);
  const input = { exceptions, lineValue, history: c.history, inflow_per_month: c.inflow_per_month };
  const res = fixPaths(input, PARAMS);
  const KEY = { "A Mass correction": "A", "B Owner follow-up": "B", "C Mass correction and fix at source": "C", "D Owner follow-up and fix at source": "D", "Do nothing": "nothing" };
  for (const row of d4.paths) {
    const p = res.paths[KEY[row.path]];
    const tag = `D4 ${row.path}`;
    checks += 1;
    if (!p) { failures.push(`${tag}: missing`); continue; }
    eq(`${tag} exceptions closed`, p.closed, row.closed);
    eq(`${tag} spend covered`, p.spend_covered_eur, row.spend_covered_eur);
    eq(`${tag} financing cost avoided now`, p.avoided_now_eur, row.avoided_now_eur);
    eq(`${tag} exceptions prevented a year`, p.prevented_per_year, row.prevented_per_year);
    eq(`${tag} future financing cost avoided a year`, p.future_avoided_eur_per_year, row.future_avoided_eur_per_year);
    eq(`${tag} one-off effort`, p.effort_eur, row.effort_eur);
    eq(`${tag} days`, p.days, row.days);
  }
  // The sentences under the table.
  eq("D4 doing nothing: the case gains 24 exceptions a year", res.paths.nothing.gains_per_year, 12 * c.inflow_per_month);
  eq("D4 doing nothing: they cost about €4,800 a year", euro(res.paths.nothing.gains_cost_eur_per_year), "€4,800");
  eq("D4 the case cost €2,400 over the last 365 days", euro(res.E), "€2,400");
  eq("D4 C and D start preventing after 20 days", [res.paths.C.prevents_after_days, res.paths.D.prevents_after_days], [PARAMS.source_lead_days, PARAMS.source_lead_days]);
  eq("D4 A and B prevent nothing", [res.paths.A.prevents_after_days, res.paths.B.prevents_after_days], [null, null]);
  eq("D4 case figures n, s, c, e, f", [res.n, res.s, res.c, res.e, res.f], [c.n, c.with_suggestion, c.history.closed, c.history.eligible, c.inflow_per_month]);
  // With no history, B and D project 0 closures; with no suggestions, A and C are not applicable.
  const noHistory = fixPaths({ ...input, history: { closed: 0, eligible: 0 } }, PARAMS);
  eq("D4 no history: B and D close 0", [noHistory.paths.B.closed, noHistory.paths.D.closed, noHistory.paths.B.spend_covered_eur, noHistory.paths.B.avoided_now_eur], [0, 0, 0, 0]);
  eq("D4 no history: B and D still applicable with their effort", [noHistory.paths.B.applicable, noHistory.paths.D.applicable, noHistory.paths.B.effort_eur], [true, true, 600]);
  const noSuggestions = fixPaths({ ...input, exceptions: exceptions.map((x) => ({ ...x, suggestion: null })) }, PARAMS);
  eq("D4 no suggestions: A and C not applicable", [noSuggestions.paths.A.applicable, noSuggestions.paths.C.applicable], [false, false]);
  eq("D4 no suggestions: A and C carry no figures", [noSuggestions.paths.A.closed, noSuggestions.paths.C.effort_eur], [null, null]);
  // B's closures use the integer floor: 5 exceptions × 1 closed / 3 eligible → 1.
  const five = fixPaths({ ...input, exceptions: exceptions.slice(0, 5), history: { closed: 1, eligible: 3 } }, PARAMS);
  eq("D4 integer floor: 5 × 1 / 3 closes 1", five.paths.B.closed, 1);
  eq("D4 B's spend covered follows the floor", five.paths.B.spend_covered_eur, (5 * c.spend_eur_each * 1) / 5);
  // Spend covered counts each line once, even when two exceptions share a line.
  const shared = fixPaths({ ...input, exceptions: [{ ...exceptions[0] }, { ...exceptions[1], lines: exceptions[0].lines }] }, PARAMS);
  eq("D4 spend over distinct lines", shared.paths.A.spend_covered_eur, c.spend_eur_each);
}

const RUN = { D1: () => { caseD1(); rulesExtra(); }, D2: caseD2, D3: caseD3, D4: caseD4 };
for (const c of chosen) {
  const before = failures.length;
  try { RUN[c](); } catch (e) { failures.push(`${c}: ${e.stack || e}`); }
  console.log(`${failures.length === before ? "PASS" : "FAIL"}  ${c}`);
}
for (const f of failures) console.log(`FAIL  ${f}`);
console.log(`${checks - failures.length}/${checks} engine checks passed (${chosen.join(" ")}).`);
if (failures.length) process.exit(1);
console.log(`ENGINE OK: ${chosen.join(" ")}`);
