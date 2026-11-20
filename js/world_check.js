// The world's checks, in the browser (Diagnostics) and under Node (tools/check_world.mjs, the world
// suite): the data contracts, referential integrity, day windows, the fictional VAT IDs failing their
// check digits, the people, the Apex look-alikes, a log that agrees with the data, the six scenarios'
// cases as the method describes them, and the frozen reference figures (data/reference_cases.js),
// which tools/build_world.mjs --freeze writes with freezeReferences() below.

import { scan, totals, isLive } from "./engine.js";
import { closureRate, reconcile, cohorts } from "./history.js";
import { groupExceptions, caseFigures } from "./cases.js";
import { validate, describeErrors } from "./validate.js";
import { WORLD_SCHEMA, ALL_DEFS } from "./schemas.js";
import { passesCheckDigit } from "./vat_check.js";
import { RULE_IDS } from "./rules.js";

/**
 * The six scenarios: which rules the case is made of, within which filters, and the group (key and
 * value) of the dq_group result that names it; which fix paths apply; the root cause and its fix.
 */
export const SCENARIO_SPECS = Object.freeze([
  { id: "SC-PUNCHOUT", rules: ["DQ-01"], filters: { plant: "3010" }, key: "channel", value: "punch-out", paths: ["A", "B", "C", "D"],
    root_cause: "The punch-out catalog of Lumen Labware (supplier 80001) does not pass the framework contract's number back into the order lines.",
    fix_at_source: "Map the contract number in the punch-out catalog's interface." },
  { id: "SC-EARLY-PAY", rules: ["DQ-07", "DQ-06"], filters: { company_code: "2000" }, key: "created_by", value: "U190", paths: ["A", "B", "C", "D"],
    root_cause: "The indirect team in Birmingham orders through one shared buying profile whose default payment-terms key is 14 days.",
    fix_at_source: "Set the buying profile's default payment-terms key to the agreed terms." },
  { id: "SC-UNCLASSIFIED", rules: ["DQ-02"], filters: { plant: "1020" }, key: "channel", value: "free-text requisition", paths: ["A", "B", "C", "D"],
    root_cause: "Duisburg's free-text requisition form lets the material group stay empty.",
    fix_at_source: "Make the material group a mandatory field of the free-text form." },
  { id: "SC-REQUESTER", rules: ["DQ-04", "DQ-05"], filters: null, key: "plant", value: "1010", paths: ["B", "D"],
    root_cause: "After Frankfurt's reorganisation, requisition templates still name requesters who left, and a new form lets the requester stay empty.",
    fix_at_source: "Make the requester mandatory and check it against active users." },
  { id: "SC-ONBOARDING", rules: ["DQ-09", "DQ-10", "DQ-11"], filters: null, key: "onboarding_channel", value: "self-registration portal", paths: ["B", "D"],
    root_cause: "Suppliers onboarded through the self-registration portal arrive without payment terms, VAT ID or bank details checked.",
    fix_at_source: "Required fields and format checks in the portal's onboarding." },
  { id: "SC-DUPLICATE", rules: ["DQ-12", "DQ-08"], filters: null, key: "supplier", value: "80013", paths: ["B", "D"],
    root_cause: "An interface load created a duplicate of an existing account; it was blocked later, but the MRP interface still sends orders to it.",
    fix_at_source: "Check the purchasing block in the interface, and merge the duplicate into the original account." }
]);

const TOL = 1e-9;
const byId = (a, b) => String(a).localeCompare(String(b), "en", { numeric: true });
const pickPath = (p) => ({ applicable: p.applicable, closed: p.closed, spend_covered_eur: p.spend_covered_eur, avoided_now_eur: p.avoided_now_eur,
  prevented_per_year: p.prevented_per_year, future_avoided_eur_per_year: p.future_avoided_eur_per_year, effort_eur: p.effort_eur, days: p.days,
  prevents_after_days: p.prevents_after_days, ...(p.id === "nothing" ? { gains_per_year: p.gains_per_year, gains_cost_eur_per_year: p.gains_cost_eur_per_year, past_cost_eur: p.past_cost_eur } : {}) });

/** Everything the references hold, computed from the world: whole-world figures, first scan, cases. */
export function computeFigures(world) {
  const log = world.exception_log;
  const s = scan(world, { day: 0, log });
  const t = totals(world, s.exceptions, { day: 0, c: s.context });
  const before = closureRate(log, 0);
  const rec = reconcile(log, s.exceptions, { day: 0 });
  const after = closureRate(rec.log, 0);
  const out = {
    world: {
      lines: world.po_lines.length, suppliers: world.suppliers.length, suppliers_with_lines: new Set(world.po_lines.map((l) => l.supplier)).size,
      base_accounts_with_lines: new Set(world.po_lines.filter((l) => world.suppliers.find((x) => x.id === l.supplier)?.origin === "Rebate Hunter").map((l) => l.supplier)).size,
      materials: world.materials.length, contracts: world.contracts.length, users: world.users.length, log_entries: log.length,
      spend_window_eur: t.spend_window_eur, clean_spend_eur: t.clean_spend_eur, clean_share: t.clean_share, open_spend_eur: t.open_spend_eur,
      exceptions: t.count, by_rule: t.by_rule, by_severity: t.by_severity, financing_cost_eur: t.financing_cost_eur, financing_cost_unpaid_eur: t.financing_cost_unpaid_eur,
      closure_rate_before: { value: before.value, closed: before.closed, eligible: before.eligible },
      closure_rate_after: { value: after.value, closed: after.closed, eligible: after.eligible },
      cohorts: cohorts(log, 0).map((w) => ({ week: w.week, detected: w.detected, closed: w.closed, open: w.open, dismissed: w.dismissed }))
    },
    first_scan: { still: rec.still.length, closed: rec.closed.slice().sort(byId), fresh: rec.fresh.length, open_after: rec.log.filter((x) => isLive(x.status)).length },
    cases: {}
  };
  for (const spec of SCENARIO_SPECS) {
    const g = groupExceptions(s, { rules: spec.rules, by: spec.key, filters: spec.filters });
    const mine = g.groups.find((x) => String(x.values[spec.key]) === String(spec.value));
    const cf = caseFigures(s, log, spec);
    out.cases[spec.id] = {
      base: g.base.count, base_spend_eur: g.base.spend_eur, top_group: g.groups[0] ? String(g.groups[0].values[spec.key]) : null,
      group: { count: mine ? mine.count : 0, share: mine ? mine.share : 0, spend_eur: mine ? mine.spend_eur : 0 },
      n: cf.n, spend_eur: cf.spend_eur, financing_cost_eur: cf.financing_cost_eur, unpaid_cost_eur: cf.unpaid_cost_eur, suggestions: cf.suggestions,
      routed_to: cf.routed_to, history: { closed: cf.history.closed, eligible: cf.history.eligible }, inflow_per_month: cf.inflow_per_month,
      paths: Object.fromEntries(Object.entries(cf.fix.paths).map(([k, p]) => [k, pickPath(p)])),
      exceptions: cf.exceptions.slice().sort(byId)
    };
  }
  return { figures: out, scan: s, reconciliation: rec };
}

/** The reference file's content: the figures, with the versions they belong to. */
export function freezeReferences(world) {
  const { figures } = computeFigures(world);
  return { world_version: world.meta.world_version, seed: world.meta.seed, rule_set_version: world.meta.rule_set_version, ...figures };
}

/** Compares two values (numbers within 1e-9, everything else exactly); returns the paths that differ. */
function differences(a, b, path = "", out = []) {
  if (typeof a === "number" && typeof b === "number") { if (Math.abs(a - b) > TOL) out.push(`${path}: ${a} ≠ ${b}`); return out; }
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") { if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`${path}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); return out; }
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  for (const k of keys) differences(a[k], b[k], path ? `${path}.${k}` : k, out);
  return out;
}

/**
 * Runs every check. Returns { ok, checks: [{ name, ok, detail }] }. `references` is the frozen
 * data/reference_cases.js (window.REFERENCE_CASES); `scenarios` is data/scenarios.js.
 */
export function checkWorld(world, scenarios = [], references = null) {
  const checks = [];
  const add = (name, ok, detail = "") => checks.push({ name, ok: !!ok, detail });
  if (!world || !Array.isArray(world.po_lines)) { add("World data loaded", false, "window.WORLD is missing"); return { ok: false, checks }; }

  // 1. The data contracts.
  const v = validate(world, WORLD_SCHEMA, { defs: ALL_DEFS, maxErrors: 5 });
  add("Data contracts", v.ok, v.ok ? "the five data products and the log match their JSON Schemas" : describeErrors(v.errors, "world"));

  // 2. Ids and references.
  const problems = [];
  const ids = (list, what) => { const s = new Set(); for (const r of list) { if (s.has(r.id)) problems.push(`${what} ${r.id} twice`); s.add(r.id); } return s; };
  const U = ids(world.users, "user");
  const S = ids(world.suppliers, "supplier");
  const M = ids(world.materials, "material");
  const K = ids(world.contracts, "contract");
  const L = ids(world.po_lines, "line");
  const H = ids(world.exception_log, "log entry");
  const CC = new Set(world.company_codes.map((c) => c.id));
  const PL = new Map((world.plants || []).map((p) => [p.id, p.company_code]));
  const GR = new Set((world.taxonomy || []).map((t) => t.code));
  for (const u of world.users) if (u.manager && !U.has(u.manager)) problems.push(`user ${u.id}: manager ${u.manager} unknown`);
  for (const s of world.suppliers) for (const cc of Object.keys(s.payment_terms)) if (!CC.has(cc)) problems.push(`supplier ${s.id}: terms in unknown company code ${cc}`);
  for (const m of world.materials) if (m.material_group && !GR.has(m.material_group)) problems.push(`material ${m.id}: group ${m.material_group} not in the taxonomy`);
  for (const k of world.contracts) {
    if (!S.has(k.supplier)) problems.push(`contract ${k.id}: supplier ${k.supplier} unknown`);
    if (!CC.has(k.company_code)) problems.push(`contract ${k.id}: company code ${k.company_code} unknown`);
    if (k.owner && !U.has(k.owner)) problems.push(`contract ${k.id}: owner ${k.owner} unknown`);
    if (k.valid_from > k.valid_to) problems.push(`contract ${k.id}: valid from after valid to`);
  }
  for (const l of world.po_lines) {
    if (l.id !== `${l.po}/${l.item}`) problems.push(`line ${l.id}: id is not order/item`);
    if (!S.has(l.supplier)) problems.push(`line ${l.id}: supplier ${l.supplier} unknown`);
    if (l.material && !M.has(l.material)) problems.push(`line ${l.id}: material ${l.material} unknown`);
    if (l.contract && !K.has(l.contract)) problems.push(`line ${l.id}: contract ${l.contract} unknown`);
    if (!U.has(l.buyer)) problems.push(`line ${l.id}: buyer ${l.buyer} unknown`);
    if (l.created_by && !U.has(l.created_by)) problems.push(`line ${l.id}: created by ${l.created_by} unknown`);
    if (!CC.has(l.company_code)) problems.push(`line ${l.id}: company code ${l.company_code} unknown`);
    if (l.plant && PL.get(l.plant) !== l.company_code) problems.push(`line ${l.id}: plant ${l.plant} is not in company code ${l.company_code}`);
    if (l.material_group && !GR.has(l.material_group)) problems.push(`line ${l.id}: group ${l.material_group} not in the taxonomy`);
  }
  for (const x of world.exception_log) {
    if (!RULE_IDS.includes(x.rule)) problems.push(`log ${x.id}: rule ${x.rule} unknown`);
    if (x.reopens && !H.has(x.reopens)) problems.push(`log ${x.id}: reopens ${x.reopens}, which does not exist`);
  }
  add("Ids and references", !problems.length, problems.length ? problems.slice(0, 5).join("; ") : `${L.size} lines, ${S.size} suppliers, ${M.size} materials, ${K.size} contracts, ${U.size} users, ${H.size} log entries`);

  // 3. Day windows and the log's own order of events.
  const window = world.meta?.window_days ?? 365;
  const logFrom = world.meta?.log_from_day ?? -181;
  const dayProblems = [];
  for (const l of world.po_lines) if (l.day < -(window - 1) || l.day > 0) dayProblems.push(`line ${l.id} on day ${l.day}`);
  for (const x of world.exception_log) {
    if (x.detected_day < logFrom || x.detected_day > 0) dayProblems.push(`log ${x.id} detected on day ${x.detected_day}`);
    if (x.routed_day !== null && x.routed_day < x.detected_day) dayProblems.push(`log ${x.id} routed before detected`);
    if (x.closed_day !== null && x.closed_day < (x.routed_day ?? x.detected_day)) dayProblems.push(`log ${x.id} closed before routed`);
    if ((x.status === "closed" || x.status === "dismissed") !== (x.closed_day !== null)) dayProblems.push(`log ${x.id}: status ${x.status} with closed day ${x.closed_day}`);
    if (["routed", "accepted"].includes(x.status) && x.routed_day === null) dayProblems.push(`log ${x.id}: ${x.status} without a routed day`);
    if (x.status === "open" && x.routed_day !== null) dayProblems.push(`log ${x.id}: open but routed`);
    if ((x.status === "dismissed" || x.status === "accepted") && !x.reason) dayProblems.push(`log ${x.id}: ${x.status} without a reason`);
  }
  const weeks = new Set(world.exception_log.map((x) => Math.floor(-x.detected_day / 7)));
  add("Day windows", !dayProblems.length && weeks.size >= 26, dayProblems.length ? dayProblems.slice(0, 5).join("; ") : `lines within the last ${window} days; log entries in ${weeks.size} weeks from day ${logFrom}`);

  // 4. The shared accounts, the people and the VAT IDs.
  const base = world.suppliers.filter((s) => s.origin === "Rebate Hunter");
  add("Rebate Hunter's accounts", base.length === 124, `${base.length} accounts from the shared base (124 expected)`);
  const badNames = world.users.filter((u) => (u.role === "buying profile" || u.role === "interface") ? u.name !== null : !/^\p{Lu}\p{Ll}+ \p{Lu}\.$/u.test(u.name || ""));
  add("People: a given name and an initial", !badNames.length, badNames.length ? badNames.map((u) => u.id).join(", ") : `${world.users.length} users, technical accounts without a name`);
  const passing = world.suppliers.filter((s) => s.vat_id && passesCheckDigit(s.country, s.vat_id) === true);
  add("No VAT ID passes a check digit", !passing.length, passing.length ? passing.map((s) => `${s.id} ${s.vat_id}`).join(", ") : `${world.suppliers.filter((s) => s.vat_id).length} VAT IDs fail their country's published (or widely used) check digit`);

  // 5. A scan and the log.
  const plain = scan(world, { day: 0 });
  const withLog = scan(world, { day: 0, log: world.exception_log });
  const foundIds = new Set(plain.exceptions.map((e) => e.id));
  const planned = new Set(world.meta?.planned_corrections || []);
  const logProblems = [];
  const liveIds = new Set();
  for (const x of world.exception_log) {
    const id = `${x.rule}|${x.record}`;
    if (isLive(x.status)) {
      if (liveIds.has(id)) logProblems.push(`${id} has two live entries`);
      liveIds.add(id);
      if (planned.has(x.id) ? foundIds.has(id) : !foundIds.has(id)) logProblems.push(`${x.id} (${id}, ${x.status}) ${planned.has(x.id) ? "is a planned correction but is still found" : "is not found by a scan"}`);
    } else if (x.status === "closed" && foundIds.has(id)) {
      const later = world.exception_log.find((y) => `${y.rule}|${y.record}` === id && isLive(y.status) && y.reopens === x.id);
      if (!later) logProblems.push(`${x.id} (${id}) is closed but still found, without a reopened entry`);
    }
  }
  for (const x of world.exception_log.filter((y) => y.status === "dismissed")) if (withLog.exceptions.some((e) => e.id === `${x.rule}|${x.record}`)) logProblems.push(`${x.id} is dismissed but raised again`);
  for (const p of planned) if (!world.exception_log.some((x) => x.id === p)) logProblems.push(`planned correction ${p} is not in the log`);
  add("The log agrees with the data", !logProblems.length, logProblems.length ? logProblems.slice(0, 5).join("; ") : `${liveIds.size} live entries all found by a scan, ${planned.size} planned corrections no longer found, closed entries not found (or reopened)`);

  // 6. The Apex look-alikes are no duplicates.
  const apex = ["40001", "40002"].map((id) => world.suppliers.find((s) => s.id === id));
  const apexPairs = plain.exceptions.filter((e) => e.rule === "DQ-12" && (e.record.pair || []).some((x) => ["40001", "40002"].includes(x)));
  add("The Apex look-alikes are no duplicates", apex.every(Boolean) && !apexPairs.length && apex[0].country !== apex[1].country && apex[0].vat_id !== apex[1].vat_id,
    apex.every(Boolean) ? `40001 ${apex[0].country} ${apex[0].vat_id}, 40002 ${apex[1].country} ${apex[1].vat_id}: different countries and VAT IDs` : "an Apex account is missing");

  // 7. The six scenarios: the tips, the group that names each case, and the case as the method says.
  const { figures } = computeFigures(world);
  const tipIds = (scenarios || []).map((x) => x.id);
  add("Six scenario tips", tipIds.length === 6 && SCENARIO_SPECS.every((sp) => tipIds.includes(sp.id)), tipIds.join(", ") || "no scenarios loaded");
  const ctx = withLog.context;
  for (const spec of SCENARIO_SPECS) {
    const c = figures.cases[spec.id];
    const members = withLog.exceptions.filter((e) => c.exceptions.includes(e.id));
    const lineOf = (e) => ctx.lineById.get(e.lines[0]);
    const story = [];
    if (!(c.group.share >= 0.5 && c.top_group === String(spec.value))) story.push(`group ${spec.value} holds ${(c.group.share * 100).toFixed(1)} % of the base (largest: ${c.top_group})`);
    const applicable = Object.entries(c.paths).filter(([k, p]) => k !== "nothing" && p.applicable).map(([k]) => k);
    if (applicable.join() !== spec.paths.join()) story.push(`applicable paths ${applicable.join(", ")}, expected ${spec.paths.join(", ")}`);
    if (c.n < 5) story.push(`only ${c.n} exceptions`);
    if (spec.id === "SC-PUNCHOUT") {
      if (!members.every((e) => lineOf(e).supplier === "80001" && lineOf(e).channel === "punch-out")) story.push("not every line comes through the one supplier's punch-out");
      if (c.suggestions !== c.n) story.push("not every exception has its contract as a suggestion");
    }
    if (spec.id === "SC-EARLY-PAY") {
      if (!members.every((e) => lineOf(e).created_by === "U190" && (e.rule === "DQ-06" || lineOf(e).payment_terms_days === 14))) story.push("not every line carries the profile's 14-day key");
      if (!members.some((e) => e.rule === "DQ-06") || !members.some((e) => e.rule === "DQ-07")) story.push("DQ-06 and DQ-07 should both appear");
      if (members.filter((e) => e.unpaid).length < 2) story.push("fewer than two unpaid lines");
      if (c.suggestions !== c.n) story.push("not every exception has the agreed terms as a suggestion");
      if (!(c.paths.C.future_avoided_eur_per_year > 0)) story.push("no yearly run rate for a fix at source to stop");
    }
    if (spec.id === "SC-UNCLASSIFIED") {
      if (!members.every((e) => lineOf(e).channel === "free-text requisition")) story.push("not every line is a free-text requisition");
      if (!members.some((e) => !e.suggestion) || !members.some((e) => e.suggestion)) story.push("expected free-text lines that need an AI suggestion and a few with the master's group");
    }
    if (spec.id === "SC-REQUESTER") {
      if (!members.every((e) => lineOf(e).day > -120)) story.push("a line from before the reorganisation");
      if (c.suggestions !== 0) story.push("there should be no deterministic suggestion");
      const buyersRoute = members.filter((e) => e.rule === "DQ-04").every((e) => e.responsible === lineOf(e).buyer);
      const managersRoute = members.filter((e) => e.rule === "DQ-05").every((e) => e.responsible === ctx.users.get(lineOf(e).requester)?.manager);
      if (!buyersRoute || !managersRoute) story.push("missing requesters should go to the buyers, requesters who left to their managers");
    }
    if (spec.id === "SC-ONBOARDING") {
      for (const r of spec.rules) if (!members.some((e) => e.rule === r)) story.push(`no ${r} in the case`);
    }
    if (spec.id === "SC-DUPLICATE") {
      const pair = members.find((e) => e.rule === "DQ-12");
      if (!pair || !pair.match.includes("vat")) story.push("the pair should share one VAT ID");
      if (!members.some((e) => e.rule === "DQ-08")) story.push("orders should still have gone to the blocked account");
    }
    add(`Scenario ${spec.id}`, !story.length, story.length ? story.join("; ")
      : `${c.group.count} of ${c.base} exceptions in "${spec.key} = ${spec.value}" (${(c.group.share * 100).toFixed(1)} %); paths ${applicable.join(", ")}`);
  }

  // 8. The frozen reference figures.
  if (references) {
    const now = { world_version: world.meta.world_version, seed: world.meta.seed, rule_set_version: world.meta.rule_set_version, ...figures };
    const diff = differences(now, references);
    add("Frozen reference figures", !diff.length, diff.length ? `${diff.length} figure(s) moved: ${diff.slice(0, 4).join("; ")}` : `the world's figures, the first scan and the six cases equal data/reference_cases.js`);
  } else add("Frozen reference figures", false, "data/reference_cases.js is not loaded");

  // 9. The whole world's clean spend share, recorded.
  const share = figures.world.clean_share;
  add("Clean spend share recorded", references && Math.abs(references.world?.clean_share - share) <= TOL && share > 0.6 && share < 0.9,
    `${(share * 100).toFixed(1)} % of the spend of the last ${window} days is clean (calibrated near 75 %)`);

  // 10. Sizes, as the plan describes the world.
  const f = figures.world;
  const sizes = [["order lines", f.lines, 1800, 2300], ["base accounts with lines", f.base_accounts_with_lines, 50, 70], ["materials", f.materials, 250, 350],
    ["contracts", f.contracts, 20, 30], ["users", f.users, 35, 55]];
  const off = sizes.filter(([, n, a, b]) => n < a || n > b);
  add("Sizes", !off.length, sizes.map(([w, n]) => `${n} ${w}`).join(", "));

  return { ok: checks.every((c) => c.ok), checks };
}
