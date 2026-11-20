// The agent's 17 tools in Node: the names and schemas the model sees (within the strict-tool limits,
// though strict mode stays off), every input validated against its schema, the executors returning the
// engine's figures (the six cases equal the frozen references of data/reference_cases.js), the stable
// figure names, the plain sentences and summaries, and each guardrail refusing the fault it guards
// against (AC-09 and AC-10 at the level of the tools; the browser suites check the screen).
// Usage: node tests/tools.mjs
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { APP_ROOT } from "./lib/harness.mjs";
import { createToolbox, toolDefinitions, TOOL_NAMES, inputError } from "../js/tools.js";
import { createHumanQueue } from "../js/human.js";
import { toolPlain } from "../js/tool_plain.js";
import { summarizeToolResult } from "../js/summaries.js";
import { SCENARIO_SPECS } from "../js/world_check.js";
import { DRAFT_FOOTER, MOCK_LINE } from "../js/drafts.js";
import { closureRate } from "../js/history.js";
import { isLive } from "../js/engine.js";
import { projectedRate } from "../js/payoff.js";
import { PARAMS } from "../js/params.js";
import { dayLabel } from "../js/format.js";

const load = (f) => { const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(APP_ROOT, f), "utf8"), ctx); return ctx.window; };
const { WORLD } = load("data/world.js");
const { REFERENCE_CASES: REF } = load("data/reference_cases.js");
const passes = [];
const failures = [];
const check = (ok, what) => { (ok ? passes : failures).push(what); return ok; };
const near = (a, b) => (a === null || b === null ? a === b : Math.abs(a - b) <= 1e-9);

const BRIEF_TOOLS = ["erp_get_overview", "erp_query", "erp_get_record", "dq_scan", "dq_group", "dq_suggest", "dq_classify", "dq_history", "dq_fix_paths",
  "ui_mark_board", "ui_request_review", "ui_report_alert", "ui_propose_options", "ui_await_decision", "ui_draft_action", "ui_await_approvals", "ui_final_report"];

/** A toolbox with a scripted person and the events it emitted. */
function session({ review = "approve", decisions = null, drafts = "approve", today = undefined } = {}) {
  const human = createHumanQueue();
  const events = [];
  const tb = createToolbox({
    world: WORLD, mode: "live", today, onPhase: () => {}, waitFor: (k, t) => human.waitFor(k, t),
    emit: (type, payload) => {
      events.push({ type, payload });
      if (type === "options" && decisions) queueMicrotask(() => decisions(payload).forEach((d) => human.push({ type: "option_decision", payload: d })));
      if (type === "confirmation_request") queueMicrotask(() => human.push({ type: "confirmation_decision", payload: { review_id: payload.review_id, decisions: payload.items.map((i) => ({ line_id: i.line_id, decision: review === "approve" ? "approved" : "rejected" })) } }));
      if (type === "action_draft" && drafts === "approve") queueMicrotask(() => human.push({ type: "action_decision", payload: { action_id: payload.action_id, decision: "approved" } }));
    }
  });
  const run = async (name, input = {}) => (await tb.execute(name, input));
  return { tb, run, human, events };
}

// ---- 1. names, schemas, strict limits -------------------------------------------------------------
check(JSON.stringify(TOOL_NAMES) === JSON.stringify(BRIEF_TOOLS), `the 17 tools of the method, in its order (${TOOL_NAMES.length})`);
const defs = toolDefinitions();
const NOT_STRICT = ["minimum", "maximum", "minLength", "maxLength", "maxItems", "exclusiveMinimum", "exclusiveMaximum"];
let optional = 0;
let unions = 0;
let notStrict = [];
const walk = (schema, where) => {
  if (!schema || typeof schema !== "object") return;
  for (const k of Object.keys(schema)) if (NOT_STRICT.includes(k) || (k === "minItems" && schema[k] > 1)) notStrict.push(`${where}.${k}`);
  if (Array.isArray(schema.type) || schema.anyOf) unions += 1;
  if (schema.properties) {
    const req = new Set(schema.required || []);
    for (const [p, s] of Object.entries(schema.properties)) { if (!req.has(p)) optional += 1; walk(s, `${where}.${p}`); }
  }
  if (schema.items) walk(schema.items, `${where}[]`);
};
for (const d of defs) walk(d.input_schema, d.name);
check(defs.length <= 20 && !notStrict.length, `the schemas the model sees carry no keyword strict tools reject (${notStrict.slice(0, 3).join(", ") || "none"})`);
check(optional <= 24 && unions <= 16, `within the strict-tool limits, should strict mode be switched on: ${optional} optional parameters (at most 24), ${unions} union-typed (at most 16)`);
check(defs.every((d) => d.description && d.description.length > 30 && d.input_schema.type === "object"), "every tool has a description and an object schema");
console.log(`INFO  ${defs.length} tools, ${optional} optional parameters, ${unions} union-typed parameters (strict mode stays off)`);

// ---- 2. every input is validated ---------------------------------------------------------------------
const bad = [
  ["erp_query", { product: "orders" }, /product/],
  ["erp_query", { product: "po_line", limit: 500 }, /limit/],
  ["erp_get_record", { product: "po_line" }, /id/],
  ["dq_scan", { rules: ["DQ-99"] }, /rules/],
  ["dq_scan", { filters: [{ key: "colour", values: ["red"] }] }, /filters/],
  ["dq_group", { rules: ["DQ-01"], by: ["plant", "buyer", "channel"] }, /by/],
  ["dq_classify", { items: [{ line_id: "x", group_code: "MRO-PPE", words: [], confidence: "high" }] }, /words/],
  ["ui_propose_options", { fix_paths_id: "fp-1", options: [{ path: "A", title: "t", description: "d", residual_risk: "r" }], recommended: "A", nothing_note: "n" }, /options/],
  ["ui_draft_action", { kind: "email", recipient: "U101", subject: "s", body: "b" }, /kind/],
  ["ui_final_report", { outcome: "closed", markdown: "x" }, /outcome/],
  ["ui_mark_board", { view: "map" }, /view/],
  ["ui_await_decision", { now: true }, /now/]
];
for (const [name, input, field] of bad) {
  const e = inputError(name, input);
  check(e && field.test(e) && /does not match its schema/.test(e), `${name}: an input that breaks the schema is refused, naming the field (${String(e).split("\n")[1] || e})`);
}
{
  const { run } = session();
  const out = await run("dq_scan", { rules: "DQ-01" });
  check(out.isError && out.result.refused === "schema", "an invalid input returns is_error, refused by the schema");
}

// ---- 3. the engine's figures through the tools ----------------------------------------------------------
{
  const { run, events } = session();
  const s = (await run("dq_scan", {})).result;
  check(s.exceptions === REF.world.exceptions && near(s.kpi.clean_share, REF.world.clean_share), `a full dq_scan finds ${s.exceptions} exceptions and the clean share of the references (${(s.kpi.clean_share * 100).toFixed(1)} %)`);
  check(s.reconciliation.still === REF.first_scan.still && s.reconciliation.closed === REF.first_scan.closed.length && s.reconciliation.new === REF.first_scan.fresh,
    `the first scan reconciles as the references say: ${s.reconciliation.still} still, ${s.reconciliation.closed} closed, ${s.reconciliation.new} new`);
  check(near(s.kpi.closure_rate, REF.world.closure_rate_after.value) && s.kpi.open_exceptions === REF.first_scan.open_after, `the closure rate after the scan is the references' (${(s.kpi.closure_rate * 100).toFixed(1)} %)`);
  check(JSON.stringify(s.by_rule) === JSON.stringify(Object.fromEntries(Object.keys(s.by_rule).map((r) => [r, REF.world.by_rule[r] || 0]))), "exceptions by rule equal the references");
  check(events.some((e) => e.type === "kpi_update" && e.payload.stage === "measured") && events.some((e) => e.type === "board_update" && e.payload.scan?.exceptions?.length === s.exceptions), "the scan updates the header and hands the board every exception");
}
for (const spec of SCENARIO_SPECS) {
  const { run } = session();
  await run("dq_scan", { rules: spec.rules, ...(spec.filters ? { filters: Object.entries(spec.filters).map(([key, v]) => ({ key, values: [].concat(v) })) } : {}) });
  const g = (await run("dq_group", { rules: spec.rules, by: [spec.key], ...(spec.filters ? { filters: Object.entries(spec.filters).map(([key, v]) => ({ key, values: [].concat(v) })) } : {}) })).result;
  const ref = REF.cases[spec.id];
  const grp = g.groups.find((x) => x.group === String(spec.value));
  check(g.base.exceptions === ref.base && grp && grp.exceptions === ref.group.count && near(grp.share, ref.group.share) && near(grp.spend_eur, ref.group.spend_eur),
    `${spec.id}: dq_group gives the case's group as the references (${grp?.exceptions} of ${g.base.exceptions})`);
  const fp = (await run("dq_fix_paths", { grouping: g.grouping_id, group: String(spec.value) })).result;
  const same = ["A", "B", "C", "D", "nothing"].every((p) => Object.entries(ref.paths[p]).every(([k, v]) => (typeof v === "number" || v === null ? near(fp.paths[p][k], v) : fp.paths[p][k] === v)));
  check(same && fp.case.n === ref.n && near(fp.case.spend_eur, ref.spend_eur) && near(fp.case.E, ref.financing_cost_eur), `${spec.id}: dq_fix_paths equals the frozen paths A to D and doing nothing`);
}

// ---- 4. stable figure names, plain sentences, summaries ------------------------------------------------
{
  const { run } = session();
  const s = await run("dq_scan", {});
  const names = s.figures.map((f) => f.name);
  check(["scan.clean_share", "scan.exceptions", "scan.closure_rate", "scan.rule.DQ-01", "scan.open_spend"].every((n) => names.includes(n)), "dq_scan's figures carry stable names (scan.clean_share …)");
  check(s.figures.find((f) => f.name === "scan.clean_share").display === "75.2%", "a share displays with one decimal (75.2%)");
  check(BRIEF_TOOLS.every((n) => typeof toolPlain(n, {}) === "string" && toolPlain(n, {}).length > 8), "every tool has a plain sentence written by code");
  check(toolPlain("dq_scan", { rules: ["DQ-01"], filters: [{ key: "plant", values: ["3010"] }] }) === "Runs DQ-01 over the data at plant 3010 and reconciles with the exception log", "the plain sentence names the rules and the filter");
  check(summarizeToolResult("dq_scan", s.result).startsWith("164 exceptions"), `summaries read the result (${summarizeToolResult("dq_scan", s.result)})`);
}

// ---- 5. guardrails -------------------------------------------------------------------------------------
const refused = (out, pattern) => out.isError && pattern.test(out.result.error || "");
{
  const { run } = session();
  check(refused(await run("dq_group", { rules: ["DQ-01"], by: ["channel"] }), /Only exceptions a dq_scan of this run returned/), "grouping without a scan in this run is refused");
  await run("dq_scan", { filters: [{ key: "plant", values: ["3010"] }] });
  check(refused(await run("dq_group", { rules: ["DQ-07"], by: ["channel"], filters: [{ key: "company_code", values: ["2000"] }] }), /Only exceptions/), "grouping outside the scanned filters is refused");
  const g = (await run("dq_group", { rules: ["DQ-01"], by: ["channel"], filters: [{ key: "plant", values: ["3010"] }] })).result;
  const alert = { title: "t", grouping: g.grouping_id, group: "punch-out", root_cause: "r", fix_at_source: "f", summary: "s" };
  const a1 = await run("ui_report_alert", alert);
  check(refused(a1, /0 of the case's records read/) && /covering contract/.test(a1.result.error), "an alert before three records and the covering contract were read is refused, saying what is missing");
  for (const rec of g.groups[0].sample_records.slice(0, 2)) await run("erp_get_record", { product: "po_line", id: rec });
  check(refused(await run("ui_report_alert", alert), /2 of the case's records read with erp_get_record, 3 needed/), "two records read are not enough");
  await run("erp_get_record", { product: "po_line", id: g.groups[0].sample_records[2] });
  check(refused(await run("ui_report_alert", alert), /covering contract of the DQ-01 exceptions not read: 4600000101/), "a DQ-01 alert needs its covering contract read");
  await run("erp_get_record", { product: "contract", id: "4600000101" });
  check(refused(await run("ui_report_alert", { ...alert, group: "catalog" }), /has no group "catalog"/), "an alert must name a group of the dq_group result");
  check(refused(await run("ui_propose_options", { fix_paths_id: "fp-1", options: [{ path: "A", title: "a", description: "d", residual_risk: "r" }, { path: "B", title: "b", description: "d", residual_risk: "r" }], recommended: "A", nothing_note: "n" }), /No verified case/), "options before a verified alert are refused");
  check(!(await run("ui_report_alert", alert)).isError, "the alert passes once the records and the contract were read");
  const fp1 = (await run("dq_fix_paths", { grouping: g.grouping_id, group: "punch-out" })).result;
  const fp2 = (await run("dq_fix_paths", { grouping: g.grouping_id, group: "punch-out" })).result;
  const opts = (fp, extra = {}) => ({ fix_paths_id: fp, options: [{ path: "A", title: "Mass correction", description: "Correct them.", residual_risk: "New ones." }, { path: "C", title: "Correct and fix", description: "Correct and fix the mapping.", residual_risk: "Needs the catalog team." }], recommended: "C", nothing_note: "More lines lose the reference.", ...extra });
  check(refused(await run("ui_propose_options", opts(fp1.fix_paths_id)), /not the latest dq_fix_paths result/), "options from an earlier dq_fix_paths call are refused");
  check(refused(await run("ui_propose_options", opts(fp2.fix_paths_id, { recommended: "B" })), /recommendation "B" is not one of the options/), "a recommendation outside the options is refused");
  check(refused(await run("ui_propose_options", { ...opts(fp2.fix_paths_id), options: [opts("x").options[0], opts("x").options[0]] }), /only once/), "the same path twice is refused");
  check(refused(await run("ui_draft_action", { kind: "change_request", recipient: "U101", subject: "s", body: "b" }), /Drafts follow a decision/), "a draft before a decision is refused");
  check(!(await run("ui_propose_options", opts(fp2.fix_paths_id))).isError, "valid options from the latest result are shown");
  check(refused(await run("ui_final_report", { outcome: "nothing_found", markdown: "A report that comes before the decision is taken, long enough." }), /waiting for a decision/), "a report while the decision is open is refused");
}
{
  // A stale decision, the allowed drafts, the outbox and the report.
  let first = true;
  const { run, human, events } = session({ drafts: "manual", decisions: (o) => {
    if (!first) return [];
    first = false;
    return [{ options_seq: o.options_seq + 7, option_id: "A", decision: "approved" }, { options_seq: o.options_seq, option_id: "C", decision: "approved" }];
  } });
  await run("dq_scan", { filters: [{ key: "plant", values: ["3010"] }] });
  const g = (await run("dq_group", { rules: ["DQ-01"], by: ["channel"], filters: [{ key: "plant", values: ["3010"] }] })).result;
  for (const rec of g.groups[0].sample_records.slice(0, 3)) await run("erp_get_record", { product: "po_line", id: rec });
  await run("erp_get_record", { product: "contract", id: "4600000101" });
  await run("ui_report_alert", { title: "t", grouping: g.grouping_id, group: "punch-out", root_cause: "r", fix_at_source: "f", summary: "s" });
  const fp = (await run("dq_fix_paths", { grouping: g.grouping_id, group: "punch-out" })).result;
  // A mass correction's projection counts only what the corrections close: the re-scan keeps to the
  // scope of the scan that found the case (plant 3010), so the rate rises by the case's own entries in
  // the eight weekly cohorts and by nothing a wider re-scan would close anyway (review finding R1).
  {
    const caseIds = new Set(events.find((e) => e.type === "board_update" && e.payload.case)?.payload.case.exceptions || []);
    const base = closureRate(WORLD.exception_log, 0);
    const inCohort = WORLD.exception_log.filter((x) => isLive(x.status) && caseIds.has(`${x.rule}|${x.record}`) && -x.detected_day >= 14 && -x.detected_day <= 69).length;
    const want = (base.closed + inCohort) / base.eligible;
    check(caseIds.size === 30 && inCohort > 0 && near(fp.measured_closure_rate, base.value) && near(fp.paths.A.projected_closure_rate, want) && near(fp.paths.C.projected_closure_rate, want),
      `a mass correction is projected within the case's scan: (${base.closed} + ${inCohort} of the case's entries) / ${base.eligible} = ${(want * 100).toFixed(1)} % (got ${(fp.paths.C.projected_closure_rate * 100).toFixed(1)} %)`);
    const wide = projectedRate(WORLD, WORLD.exception_log, "C", { caseExceptions: [...caseIds].map((id) => ({ id, rule: "DQ-01", record: { product: "po_line", id: id.split("|")[1] }, suggestion: { field: "contract", value: "4600000101" } })), day: 0, params: PARAMS });
    check(wide > want, `control: an unscoped re-scan would also close entries outside the case (${(wide * 100).toFixed(1)} %)`);
  }
  await run("ui_propose_options", { fix_paths_id: fp.fix_paths_id, options: [{ path: "A", title: "a", description: "d", residual_risk: "r" }, { path: "C", title: "c", description: "d", residual_risk: "r" }], recommended: "C", nothing_note: "n" });
  const d = (await run("ui_await_decision", {})).result;
  check(d.decision === "approved" && d.path === "C" && events.some((e) => e.type === "notice" && e.payload.guardrail && /no longer on screen/.test(e.payload.text)), "a stale decision is ignored with a Guardrail line; the decision on screen counts");
  check(d.status === "approved, re-scan pending" && d.projected_closure_rate > fp.measured_closure_rate, `an approved path reads "approved, re-scan pending" with its projection (${(d.projected_closure_rate * 100).toFixed(1)} %)`);
  check(refused(await run("ui_propose_options", { fix_paths_id: fp.fix_paths_id, options: [{ path: "A", title: "a", description: "d", residual_risk: "r" }, { path: "C", title: "c", description: "d", residual_risk: "r" }], recommended: "C", nothing_note: "n" }), /already taken/), "options after an approval are refused");
  check(refused(await run("ui_draft_action", { kind: "follow_up", recipient: "U126", subject: "s", body: "b" }), /allows mock change request and prevention request, not an owner follow-up/), "a draft the approved path does not allow is refused");
  const cr = await run("ui_draft_action", { kind: "change_request", recipient: "U101", subject: "Set the contract reference", body: "Please set the reference on the lines below." });
  const draft = events.filter((e) => e.type === "action_draft").pop().payload;
  check(!cr.isError && /4600000101/.test(draft.body) && draft.body.includes(MOCK_LINE) && draft.body.endsWith(DRAFT_FOOTER) && /Record \| Field \| Old value \| New value/.test(draft.body), "code adds the change table, the mock line and the footer to a change request");
  check(refused(await run("ui_draft_action", { kind: "change_request", recipient: "U101", subject: "again", body: "again" }), /already in the outbox/), "a second change request for the case is refused");
  check(refused(await run("ui_draft_action", { kind: "prevention", recipient: "U101", subject: "Contract total", body: "The scan found 164 exceptions in all." }), /Figure audit/), "a draft quoting a figure outside its fix path's result is refused by the figure audit");
  check(refused(await run("ui_final_report", { outcome: "fix_approved", markdown: "## Report\nThe drafts are still waiting, so this is early." }), /still waiting for approval/), "a report before the outbox is decided is refused");
  const ap = run("ui_await_approvals", {});
  setTimeout(() => human.push({ type: "action_decision", payload: { action_id: draft.action_id, decision: "approved" } }), 5);
  check(!(await ap).isError, "ui_await_approvals waits for every draft");
  check(refused(await run("ui_final_report", { outcome: "risk_accepted", markdown: "## Report\nThe risk was accepted, which is not what happened here." }), /The outcome is fix_approved/), "a report whose outcome does not follow the decision is refused");
  check(refused(await run("ui_final_report", { outcome: "fix_approved", markdown: "## Report\nThe punch-out exceptions are now closed for good." }), /claims a closure/), "a report that calls an approved fix closed is refused");
  check(refused(await run("ui_final_report", { outcome: "fix_approved", markdown: "## Report\nAll 30 exceptions are closed. A re-scan next week will confirm it." }), /Honesty: "All 30 exceptions are closed\." claims a closure/), "a report is read sentence by sentence: a re-scan in the next sentence does not excuse a closed one");
  check(!(await run("ui_final_report", { outcome: "fix_approved", markdown: "## Report\nPath C is approved, re-scan pending; nothing was sent." })).isError, "the report follows the decision");
}
{
  // Honesty in every text the agent writes, not only the report (review finding R5): the alert, the
  // options and a draft that claim a closure no re-scan has shown are refused; the same texts that say
  // what a re-scan would close pass (the controls).
  const { run, human, events } = session({ drafts: "manual", decisions: (o) => [{ options_seq: o.options_seq, option_id: "C", decision: "approved" }] });
  await run("dq_scan", { filters: [{ key: "plant", values: ["3010"] }] });
  const g = (await run("dq_group", { rules: ["DQ-01"], by: ["channel"], filters: [{ key: "plant", values: ["3010"] }] })).result;
  for (const rec of g.groups[0].sample_records.slice(0, 3)) await run("erp_get_record", { product: "po_line", id: rec });
  await run("erp_get_record", { product: "contract", id: "4600000101" });
  const alert = { title: "Contract references lost in punch-out", grouping: g.grouping_id, group: "punch-out", root_cause: "The catalog drops the reference.", fix_at_source: "Map the contract in the catalog." };
  check(refused(await run("ui_report_alert", { ...alert, summary: "These exceptions are already closed in practice." }), /Honesty: "These exceptions are already closed in practice\." claims a closure/), "an alert that calls the exceptions closed is refused");
  check(!(await run("ui_report_alert", { ...alert, summary: "A correction of the lines would close them once a re-scan no longer finds them." })).isError, "control: an alert that names the re-scan passes");
  const fp = (await run("dq_fix_paths", { grouping: g.grouping_id, group: "punch-out" })).result;
  const option = (title, risk) => ({ fix_paths_id: fp.fix_paths_id, options: [{ path: "A", title: "Correct the references", description: "d", residual_risk: "r" }, { path: "C", title, description: "d", residual_risk: risk }], recommended: "C", nothing_note: "n" });
  check(refused(await run("ui_propose_options", option("Close all 30 now", "r")), /Honesty: "Close all 30 now" claims a closure/), "an option that closes everything now is refused");
  check(refused(await run("ui_propose_options", option("Correct and fix at source", "None: the exceptions are closed")), /claims a closure/), "an option whose residual risk calls the exceptions closed is refused");
  check(!(await run("ui_propose_options", option("Correct and fix at source", "A re-scan shows what the correction closed."))).isError, "control: options that name the re-scan pass");
  const d = (await run("ui_await_decision", {})).result;
  check(refused(await run("ui_draft_action", { kind: "change_request", recipient: "U101", subject: "Contract reference on punch-out lines: closed", body: "Please set the reference." }), /claims a closure/), "a draft whose subject calls the case closed is refused");
  check(!(await run("ui_draft_action", { kind: "change_request", recipient: "U101", subject: "Set the contract reference on the punch-out lines", body: "Please set the reference; a re-scan then shows what is closed." })).isError && d.path === "C", "control: a draft that names the re-scan passes");
}
{
  // Dates and weekly cohorts in the agent's texts (review finding R9): a date must be one a tool
  // returned (here the run's day, written as the app writes it in September: "Tue 15 Sept"), and
  // "Week N" must be a cohort the history tool returned. Each refusal has its control.
  const today = new Date(2026, 8, 15);
  const { run } = session({ today, decisions: (o) => [{ options_seq: o.options_seq, option_id: "C", decision: "approved" }] });
  const ov = (await run("erp_get_overview", {})).result;
  check(ov.as_of.date === "Tue 15 Sept", `the tools write September as the app does (${ov.as_of.date})`);
  await run("dq_scan", { filters: [{ key: "plant", values: ["3010"] }] });
  const g = (await run("dq_group", { rules: ["DQ-01"], by: ["channel"], filters: [{ key: "plant", values: ["3010"] }] })).result;
  for (const rec of g.groups[0].sample_records.slice(0, 3)) await run("erp_get_record", { product: "po_line", id: rec });
  await run("erp_get_record", { product: "contract", id: "4600000101" });
  const alert = { title: "Contract references lost in punch-out", grouping: g.grouping_id, group: "punch-out", root_cause: "The catalog drops the reference.", fix_at_source: "Map the contract in the catalog." };
  check(refused(await run("ui_report_alert", { ...alert, summary: "Since Wed 16 Sept the lines lack the reference." }), /"Wed 16 Sept" \(a date no tool returned\)/), "an alert naming a date no tool returned is refused");
  check(refused(await run("ui_report_alert", { ...alert, summary: "Week 8 shows the same gap." }), /"Week 8" \(a week no tool returned\)/), "an alert naming a weekly cohort before the history tool returned one is refused");
  check(!(await run("ui_report_alert", { ...alert, summary: "As of Tue 15 Sept the punch-out lines lack the reference." })).isError, "control: an alert naming the run's day as the app writes it (\"Sept\") passes");
  const hist = (await run("dq_history", { grouping: g.grouping_id, group: "punch-out" })).result;
  const w8 = hist.cohorts.find((c) => c.week === 8);
  const fp = (await run("dq_fix_paths", { grouping: g.grouping_id, group: "punch-out" })).result;
  const options = (text) => ({ fix_paths_id: fp.fix_paths_id, options: [{ path: "A", title: "Correct the references", description: text, residual_risk: "r" }, { path: "C", title: "Correct and fix at source", description: "d", residual_risk: "r" }], recommended: "C", nothing_note: "n" });
  check(refused(await run("ui_propose_options", options("Week 9 shows the same gap.")), /"Week 9" \(a week no tool returned\)/), "an option naming a cohort the history tool did not return is refused");
  check(!(await run("ui_propose_options", options(`Week 8, from ${dayLabel(w8.from, today)} to ${dayLabel(w8.to, today)}, shows the same gap.`))).isError, `control: an option naming a cohort and its days the history tool returned passes (${dayLabel(w8.from, today)})`);
}
{
  // Routing (review finding R16): an approved draft routes the open log entries of its records that
  // are routed to its recipient (brief: "when a person approves a draft to its routed-to person"); a
  // change request to one owner leaves the entries routed to another owner open. The case: DQ-07 at
  // plant 2010, whose new entries are routed to U124 (six) and U125 (one).
  const { tb, run, human, events } = session({ drafts: "manual", decisions: (o) => [{ options_seq: o.options_seq, option_id: "C", decision: "approved" }] });
  const f = [{ key: "plant", values: ["2010"] }];
  await run("dq_scan", { rules: ["DQ-07"], filters: f });
  const g = (await run("dq_group", { rules: ["DQ-07"], by: ["plant"], filters: f })).result;
  const grp = g.groups[0].group;
  for (const rec of g.groups[0].sample_records.slice(0, 3)) await run("erp_get_record", { product: "po_line", id: rec });
  const alert = await run("ui_report_alert", { title: "Payment terms shorter than agreed at plant 2010", grouping: g.grouping_id, group: grp, summary: "The order lines at plant 2010 carry shorter terms than the supplier master.", root_cause: "The terms are typed on the order instead of taken from the master.", fix_at_source: "Take the terms from the supplier master." });
  const fp = (await run("dq_fix_paths", { grouping: g.grouping_id, group: grp })).result;
  await run("ui_propose_options", { fix_paths_id: fp.fix_paths_id, options: [{ path: "A", title: "Correct the terms", description: "d", residual_risk: "r" }, { path: "C", title: "Correct and take terms from the master", description: "d", residual_risk: "r" }], recommended: "C", nothing_note: "n" });
  await run("ui_await_decision", {});
  const before = new Map(tb.log().map((x) => [x.id, { ...x }]));
  const cr = await run("ui_draft_action", { kind: "change_request", recipient: "U124", subject: "Set the agreed payment terms on the plant 2010 lines", body: "Please set the agreed terms on the lines below." });
  const draft = events.filter((e) => e.type === "action_draft").pop()?.payload;
  const recs = new Set(draft?.records || []);
  const open = [...before.values()].filter((x) => x.status === "open" && x.rule === "DQ-07" && recs.has(x.record));
  const mine = open.filter((x) => x.routed_to === "U124");
  const others = open.filter((x) => x.routed_to !== "U124");
  const ap = run("ui_await_approvals", {});
  setTimeout(() => human.push({ type: "action_decision", payload: { action_id: draft.action_id, decision: "approved" } }), 5);
  await ap;
  const after = new Map(tb.log().map((x) => [x.id, x]));
  check(!alert.isError && !cr.isError && mine.length > 0 && others.length > 0, `the change request's records hold open entries routed to its recipient (${mine.length}) and to another owner (${others.length})`);
  check(mine.length > 0 && mine.every((x) => after.get(x.id).status === "routed" && after.get(x.id).routed_day === 0), "an approved change request routes the open entries routed to its recipient");
  check(others.length > 0 && others.every((x) => after.get(x.id).status === "open" && after.get(x.id).routed_day === null), `an approved change request leaves the entries routed to another owner open (${others.map((x) => `${x.id} ${after.get(x.id).status}`).join(", ")})`);
}
{
  // Refusals count per text (review finding R10): after two refusals a text shows with an "Unchecked"
  // tag; the next text of the same kind (the follow-up to the next owner) gets its own two refusals.
  const { run, events } = session({ drafts: "manual", decisions: (o) => [{ options_seq: o.options_seq, option_id: "B", decision: "approved" }] });
  const f = [{ key: "plant", values: ["2010"] }];
  await run("dq_scan", { rules: ["DQ-07"], filters: f });
  const g = (await run("dq_group", { rules: ["DQ-07"], by: ["plant"], filters: f })).result;
  const grp = g.groups[0].group;
  for (const rec of g.groups[0].sample_records.slice(0, 3)) await run("erp_get_record", { product: "po_line", id: rec });
  await run("ui_report_alert", { title: "Payment terms shorter than agreed at plant 2010", grouping: g.grouping_id, group: grp, summary: "The order lines at plant 2010 carry shorter terms than the supplier master.", root_cause: "The terms are typed on the order instead of taken from the master.", fix_at_source: "Take the terms from the supplier master." });
  const fp = (await run("dq_fix_paths", { grouping: g.grouping_id, group: grp })).result;
  await run("ui_propose_options", { fix_paths_id: fp.fix_paths_id, options: [{ path: "A", title: "Correct the terms", description: "d", residual_risk: "r" }, { path: "B", title: "Ask the owners", description: "d", residual_risk: "r" }], recommended: "B", nothing_note: "n" });
  await run("ui_await_decision", {});
  const people = fp.case.routed_to.map((p) => p.person);
  const bad = (who) => run("ui_draft_action", { kind: "follow_up", recipient: who, subject: "Payment terms on your lines", body: "The scan found 164 exceptions in all; please check the terms on your lines." });
  const first = [await bad(people[0]), await bad(people[0]), await bad(people[0])];
  const flagged = events.filter((e) => e.type === "action_draft").pop()?.payload;
  check(people.length >= 2 && first[0].isError && first[1].isError && !first[2].isError && flagged?.unchecked, `a follow-up refused twice shows with an "Unchecked" tag on the third attempt (${people.join(", ")})`);
  const next = await bad(people[1]);
  check(refused(next, /Figure audit: "164"/), "the next owner's follow-up gets its own refusal, not an Unchecked tag at once");
  check(!(await run("ui_draft_action", { kind: "follow_up", recipient: people[1], subject: "Payment terms on your lines", body: "Please check the payment terms on the lines below." })).isError, "control: the corrected follow-up passes");
}
{
  // The review: AI suggestions are refused when unknown, count only once approved.
  for (const mode of ["approve", "reject"]) {
    const { run, events } = session({ review: mode });
    await run("dq_scan", { rules: ["DQ-02"], filters: [{ key: "plant", values: ["1020"] }] });
    const g = (await run("dq_group", { rules: ["DQ-02"], by: ["channel"], filters: [{ key: "plant", values: ["1020"] }] })).result;
    const before = (await run("dq_fix_paths", { grouping: g.grouping_id, group: "free-text requisition" })).result.case.s;
    const cls = (await run("dq_classify", { items: [
      { line_id: "4500101059/10", group_code: "MRO-TOOLS", words: ["cordless drill"], confidence: "high" },
      { line_id: "4500101062/10", group_code: "MRO-BEARINGS", words: ["ball bearing"], confidence: "high" },
      { line_id: "4500101065/10", group_code: "OFFICE", words: ["laser printer"], confidence: "high" },
      { line_id: "4500101115/10", group_code: "MRO-SPARES", words: ["ball bearing"], confidence: "high" },
      { line_id: "4500100001/10", group_code: "MRO-SPARES", words: ["vehicle"], confidence: "low" }
    ] })).result;
    if (mode === "approve") {
      check(cls.accepted.length === 1 && cls.refused.length === 4, "dq_classify refuses an unknown code, words not in the short text, a line with a material and a line outside the scan");
      check(/unknown material group "MRO-BEARINGS"/.test(cls.refused.find((r) => r.line_id === "4500101062/10").reason) && /not in the short text/.test(cls.refused.find((r) => r.line_id === "4500101065/10").reason), "each refusal says why");
    }
    const unreviewed = (await run("dq_fix_paths", { grouping: g.grouping_id, group: "free-text requisition" })).result.case.s;
    check(unreviewed === before, `an unreviewed suggestion does not count (s stays ${before})`);
    check((await run("ui_request_review", { line_ids: ["4500101062/10"], note: "n" })).isError, "a review of a line without a pending suggestion is refused");
    const rv = (await run("ui_request_review", { line_ids: ["4500101059/10"], note: "Please review the proposed group." })).result;
    const after = (await run("dq_fix_paths", { grouping: g.grouping_id, group: "free-text requisition" })).result.case.s;
    check(events.some((e) => e.type === "confirmation_request"), "the review opens through a confirmation request");
    if (mode === "approve") check(rv.approved.length === 1 && after === before + 1, `an approved suggestion counts in the fix paths (s ${before} → ${after})`);
    else check(rv.rejected.length === 1 && after === before, `a rejected suggestion counts as none (s stays ${after})`);
  }
}
{
  // A review after the alert (review finding R6): the suggestions approved then count in the fix paths,
  // in what the approval covers and in the change request alike.
  const { run, events } = session({ decisions: (o) => [{ options_seq: o.options_seq, option_id: "A", decision: "approved" }] });
  await run("dq_scan", { rules: ["DQ-02", "DQ-03"], filters: [{ key: "plant", values: ["1020"] }] });
  const g = (await run("dq_group", { rules: ["DQ-02"], by: ["channel"], filters: [{ key: "plant", values: ["1020"] }] })).result;
  const label = g.groups[0].group;
  for (const id of g.groups[0].sample_records.slice(0, 3)) await run("erp_get_record", { product: "po_line", id });
  check(!(await run("ui_report_alert", { title: "Unclassified spend", grouping: g.grouping_id, group: label, root_cause: "The free-text form lets the group stay empty.", fix_at_source: "Make the group mandatory.", summary: "Free-text lines without a material group." })).isError, "the alert passes before the review");
  const script = load("data/sim_runs.js").SIM_RUNS["SC-UNCLASSIFIED"].steps.find((x) => x.tool === "dq_classify");
  const cls = (await run("dq_classify", script.input)).result;
  const rv = (await run("ui_request_review", { line_ids: cls.accepted.map((a) => a.line_id), note: "Please check these groups." })).result;
  const fp = (await run("dq_fix_paths", { grouping: g.grouping_id, group: label })).result;
  await run("ui_propose_options", { fix_paths_id: fp.fix_paths_id, options: [{ path: "A", title: "Mass correction", description: "Set the groups.", residual_risk: "None noted." }, { path: "B", title: "Follow-up", description: "Ask the buyers.", residual_risk: "Slow." }], recommended: "A", nothing_note: "Unclassified spend keeps growing." });
  await run("ui_await_decision", {});
  const covered = events.filter((e) => e.type === "board_update" && e.payload.approved).pop()?.payload.approved.exceptions.length;
  await run("ui_draft_action", { kind: "change_request", recipient: "U103", subject: "Mock change request: material groups", body: "Please set the material groups below." });
  const rows = events.filter((e) => e.type === "action_draft").pop()?.payload.records.length;
  check(rv.approved.length > 0 && fp.paths.A.closed === fp.case.n && covered === fp.paths.A.closed && rows === fp.paths.A.closed,
    `suggestions approved after the alert count everywhere: the fix path closes ${fp.paths.A.closed}, the approval covers ${covered}, the change request lists ${rows}`);
}
{
  // The figure audit: two refusals, then the text shows with an Unchecked tag, never silently.
  const { run, events } = session();
  await run("dq_scan", { rules: ["DQ-04", "DQ-05"] });
  const g = (await run("dq_group", { rules: ["DQ-04", "DQ-05"], by: ["plant"] })).result;
  for (const rec of g.groups[0].sample_records.slice(0, 3)) await run("erp_get_record", { product: "po_line", id: rec });
  const alert = { title: "Requesters", grouping: g.grouping_id, group: "1010", root_cause: "r", fix_at_source: "f", summary: "The case covers €999,999 of spend." };
  const r1 = await run("ui_report_alert", alert);
  const r2 = await run("ui_report_alert", alert);
  const r3 = await run("ui_report_alert", alert);
  const shown = events.filter((e) => e.type === "alert").pop();
  check(refused(r1, /Figure audit: "€999,999"/) && refused(r2, /Figure audit/) && !r3.isError && shown?.payload.unchecked?.includes("€999,999") && events.some((e) => e.type === "notice" && /Unchecked/.test(e.payload.text)),
    "a figure no tool returned is refused twice, then shown with an Unchecked tag and a notice");
}

// ---- Save run as simulation: a live run becomes a recorded script that passes the script check ----
{
  const { SIM_RUNS } = load("data/sim_runs.js");
  const { SCENARIOS } = load("data/scenarios.js");
  const { buildRecordedRun, templatize } = await import("../js/recorder.js");
  const { checkScript } = await import("../js/sim_check.js");
  const { runScript } = await import("../js/sim_script.js");
  /** Plays a script as a live run would: the events the audit keeps, texts with the engine's figures typed out. */
  async function liveEvents(script, path) {
    const events = [];
    const human = createHumanQueue();
    const push = (type, payload) => events.push({ type, payload });
    const tb = createToolbox({
      world: WORLD, mode: "live", onPhase: () => {}, waitFor: (k, t) => human.waitFor(k, t),
      emit: (type, payload) => {
        push(type, payload);
        if (type === "options") queueMicrotask(() => human.push({ type: "option_decision", payload: { options_seq: payload.options_seq, option_id: path === "recommended" ? payload.recommended : payload.options.find((o) => o.id !== payload.recommended).id, decision: "approved" } }));
        if (type === "confirmation_request") queueMicrotask(() => human.push({ type: "confirmation_decision", payload: { review_id: payload.review_id, decisions: payload.items.map((i) => ({ line_id: i.line_id, decision: "approved" })) } }));
        if (type === "action_draft") queueMicrotask(() => human.push({ type: "action_decision", payload: { action_id: payload.action_id, decision: "approved" } }));
      }
    });
    let m = 0;
    await runScript(script, { world: WORLD, toolbox: tb, hooks: {
      think: (t) => push("reasoning", { msg_id: `m${++m}`, text: t, done: true }),
      say: (t) => push("narration", { msg_id: `m${++m}`, text: t, done: true }),
      toolCall: (id, name, input) => push("tool_call", { call_id: id, name, input: JSON.parse(JSON.stringify(input)) }),
      toolResult: (id, name, out) => push("tool_result", { call_id: id, name, ok: !out.isError, summary: out.summary, result: out.result })
    } });
    return events;
  }
  for (const [id, script] of Object.entries(SIM_RUNS)) {
    for (const path of ["recommended", "another"]) {
      const events = await liveEvents(script, path);
      const run = { scenario_id: id, mode: "live", entry: "scenario", status: "done", title: script.title, started_at: "2026-11-20T10:00:00.000Z", model: "claude-sonnet-5-5", run_id: "run-test" };
      const rec = buildRecordedRun({ events, run, world: WORLD, base: script });
      const res = rec.error ? null : await checkScript(WORLD, rec.def, { scenarios: SCENARIOS });
      const typed = (rec.literal || []).filter((x) => !/^\d+ days?$/.test(x));
      check(!rec.error && res.ok && rec.def.source === "recorded" && Object.keys(rec.def.steps.at(-1).decide.paths).length === 1 && !typed.length,
        `${id}, ${path} path: the recorded run passes the script check, with placeholders for the engine's figures${rec.error ? ` (${rec.error})` : res.ok ? "" : ` (${res.problems[0] || res.runs.find((r) => !r.ok)?.problems[0]})`}${typed.length ? ` (typed: ${typed.join(", ")})` : ""}`);
    }
  }
  const named = new Map([["case.spend", { type: "amount", value: 29281.04 }], ["case.n", { type: "count", value: 30 }], ["path.C.projected", { type: "share", value: 0.6974 }]]);
  const t = templatize("All 30 lines, worth €29,281, would bring the rate to 69.7% projected; 31 stays typed.", named);
  check(t.text === "All {{case.n}} lines, worth {{case.spend}}, would bring the rate to {{path.C.projected}} projected; 31 stays typed." && JSON.stringify(t.literal) === '["31"]',
    `the recorder turns the figures a tool returned into placeholders and keeps the others as typed (${t.text})`);
  // A recording whose narration types a figure no tool returned needs curation.
  const events = await liveEvents(SIM_RUNS["SC-PUNCHOUT"], "recommended");
  const k = events.findIndex((e) => e.type === "narration");
  events[k] = { type: "narration", payload: { ...events[k].payload, text: `${events[k].payload.text} About 4,321 lines are affected.` } };
  const bad = buildRecordedRun({ events, run: { scenario_id: "SC-PUNCHOUT", mode: "live", entry: "scenario", status: "done", title: "t", started_at: "2026-11-20T10:00:00.000Z", model: "m", run_id: "r" }, world: WORLD, base: SIM_RUNS["SC-PUNCHOUT"] });
  const badRes = await checkScript(WORLD, bad.def, { scenarios: SCENARIOS });
  check(!badRes.ok && badRes.problems.some((x) => /narration types figures no tool returned \(4,321\)/.test(x)), "a recording whose narration types a figure no tool returned is held for curation");
}

for (const p of passes) console.log(`PASS  ${p}`);
for (const f of failures) console.log(`FAIL  ${f}`);
console.log(`${passes.length}/${passes.length + failures.length} tool checks passed.`);
if (failures.length) process.exit(1);
console.log("TOOLS OK");
