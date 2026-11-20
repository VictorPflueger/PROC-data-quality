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
function session({ review = "approve", decisions = null, drafts = "approve" } = {}) {
  const human = createHumanQueue();
  const events = [];
  const tb = createToolbox({
    world: WORLD, mode: "live", onPhase: () => {}, waitFor: (k, t) => human.waitFor(k, t),
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
  check(refused(await run("ui_final_report", { outcome: "fix_approved", markdown: "## Report\nThe punch-out exceptions are now closed for good." }), /says closed/), "a report that calls an approved fix closed is refused");
  check(!(await run("ui_final_report", { outcome: "fix_approved", markdown: "## Report\nPath C is approved, re-scan pending; nothing was sent." })).isError, "the report follows the decision");
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
