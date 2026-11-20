// The run as the presenter sees it: every event a producer emits (the simulation player or the live
// agent, through js/events.js) is sorted into the step it belongs to, so each step can be shown at
// once and revisited. Pure: no DOM, so the tests run it in Node on the same events.
//
// Steps: 0 the tip, 1 Spot, 2 Check, 3 Calculate, 4 Propose, 5 Prepare.

import { labelKind } from "./labels.js";

export const STEPS = Object.freeze([
  { n: 0, id: "tip", name: "The tip" },
  { n: 1, id: "spot", name: "Spot" },
  { n: 2, id: "check", name: "Check" },
  { n: 3, id: "calculate", name: "Calculate" },
  { n: 4, id: "propose", name: "Propose" },
  { n: 5, id: "prepare", name: "Prepare" }
]);

// The agent's phase as the step it shows (js/phase.js never moves a phase back).
const PHASE_STEP = { scanning: 1, diagnosing: 1, verifying: 2, simulating: 3, options: 4, executing: 5 };
// Where each tool belongs; a tool used later than its step shows in the step the run has reached.
const TOOL_STEP = {
  erp_get_overview: 1, dq_scan: 1,
  dq_group: 2, erp_query: 2, erp_get_record: 2, dq_suggest: 2, dq_classify: 2, ui_request_review: 2, ui_mark_board: 2, ui_report_alert: 2,
  dq_history: 3, dq_fix_paths: 3,
  ui_propose_options: 4, ui_await_decision: 4,
  ui_draft_action: 5, ui_await_approvals: 5, ui_final_report: 5
};
const END = { done: "done", no_findings: "done", incomplete: "stopped", aborted: "aborted", error: "error" };

export function emptyRun() {
  return {
    runId: null, mode: null, scenarioId: null, tip: null, model: null,
    status: "idle",           // idle | running | done | stopped | aborted | error
    phaseStep: 0,             // the step of the agent's current phase
    reached: 0,               // the furthest step with something to show
    waiting: null,            // null | "review" | "decision" | "approvals": the person's turn
    items: [],                // narration, reasoning and tool calls in order: { kind, step, ... }
    scans: [],                // board_update scans: { id, rules, exceptions }
    alert: null,              // the verified case
    review: null,             // { request, decision }
    options: null,            // the latest options on screen
    decisions: [],            // option decisions, in order
    drafts: [],               // action drafts with their status
    report: null,
    cost: null,               // the live cost meter (cost_update)
    notices: [],
    end: null,
    scannedAt: null,          // envelope time (ms since the run's start) of the first scan
    decidedAt: null           // envelope time of the approved decision
  };
}

/** Applies one event envelope ({ type, payload, t }) to the run; returns the run. */
export function applyEvent(run, ev) {
  const p = ev.payload || {};
  switch (ev.type) {
    case "run_start": {
      Object.assign(run, emptyRun(), {
        runId: p.run_id, mode: p.mode, scenarioId: p.scenario_id || null, tip: p.tip || null,
        model: p.model_label || null, status: "running", phaseStep: 1, reached: 1
      });
      break;
    }
    case "state_change": {
      const step = PHASE_STEP[p.state];
      if (step) { run.phaseStep = Math.max(run.phaseStep, step); run.reached = Math.max(run.reached, step); }
      if (END[p.state] || p.state === "stopped") run.status = END[p.state] || "stopped";
      break;
    }
    case "reasoning":
    case "narration": {
      const kind = ev.type === "reasoning" ? "reasoning" : (p.kind || labelKind(p.text) || "say");
      const step = kind === "hypothesis" || kind === "revised" || kind === "revision" ? Math.max(2, run.phaseStep) : run.phaseStep || 1;
      const found = run.items.find((x) => x.msgId === p.msg_id);
      if (found) { found.text = p.text; found.done = !!p.done; }
      else run.items.push({ kind: kind === "revision" ? "revised" : kind, msgId: p.msg_id, step, text: p.text, done: !!p.done });
      break;
    }
    case "tool_call": {
      const step = Math.max(TOOL_STEP[p.name] || run.phaseStep || 1, run.phaseStep || 1);
      run.items.push({ kind: "tool", callId: p.call_id, step, name: p.name, input: p.input, result: null, ok: null, summary: null });
      run.reached = Math.max(run.reached, step);
      break;
    }
    case "tool_result": {
      const call = run.items.find((x) => x.kind === "tool" && x.callId === p.call_id);
      if (call) { call.ok = p.ok; call.summary = p.summary; call.result = p.result; }
      break;
    }
    case "board_update": {
      if (p.scan) {
        run.scans.push({ id: p.scan.id, rules: p.scan.rules || [], exceptions: p.scan.exceptions || [] });
        if (run.scannedAt === null) run.scannedAt = ev.t ?? 0;
      }
      break;
    }
    case "alert":
      run.alert = p;
      run.reached = Math.max(run.reached, 2);
      break;
    case "confirmation_request":
      run.review = { request: p, decision: null };
      run.waiting = "review";
      run.reached = Math.max(run.reached, 2);
      break;
    case "confirmation_decision":
      if (run.review && run.review.request.review_id === p.review_id) run.review.decision = p;
      if (run.waiting === "review") run.waiting = null;
      break;
    case "options":
      run.options = p;
      run.waiting = "decision";
      run.reached = Math.max(run.reached, 4);
      break;
    case "option_decision": {
      run.decisions.push(p);
      if (p.decision === "approved") {
        run.waiting = null;
        if (run.decidedAt === null) run.decidedAt = ev.t ?? 0;
      }
      break;
    }
    case "action_draft":
      run.drafts.push({ ...p, status: p.status || "pending" });
      run.waiting = "approvals";
      run.reached = Math.max(run.reached, 5);
      break;
    case "action_decision": {
      const d = run.drafts.find((x) => x.action_id === p.action_id);
      if (d) d.status = p.decision;
      if (!run.drafts.some((x) => x.status === "pending") && run.waiting === "approvals") run.waiting = null;
      break;
    }
    case "report":
      run.report = p;
      run.reached = Math.max(run.reached, 5);
      break;
    case "cost_update":
      run.cost = p;
      break;
    case "notice":
      run.notices.push(p);
      break;
    case "attempt_discarded": {
      const msgs = new Set(p.msg_ids || []);
      const calls = new Set(p.call_ids || []);
      run.items = run.items.filter((x) => !msgs.has(x.msgId) && !calls.has(x.callId));
      break;
    }
    case "run_end":
      run.end = p;
      run.status = END[p.status] || "stopped";
      run.waiting = null;
      break;
    default:
      break;
  }
  return run;
}

/** The items of one step, in order. */
export const itemsOf = (run, step) => run.items.filter((x) => x.step === step);

/** The latest result of a tool, or null. */
export function lastResult(run, name) {
  for (let i = run.items.length - 1; i >= 0; i -= 1) {
    const x = run.items[i];
    if (x.kind === "tool" && x.name === name && x.ok && x.result) return x.result;
  }
  return null;
}

/** The approved option decision and the option it approved, or null. */
export function approved(run) {
  const d = [...run.decisions].reverse().find((x) => x.decision === "approved");
  if (!d) return null;
  if (d.option_id === "nothing") return { decision: d, option: null, nothing: true };
  const option = run.options?.options?.find((o) => o.id === d.option_id) || null;
  return { decision: d, option, nothing: false };
}

/** Options rejected since the latest options went on screen. */
export function rejectedIds(run) {
  const seq = run.options?.options_seq;
  return new Set(run.decisions.filter((d) => d.decision === "rejected" && d.options_seq === seq).map((d) => d.option_id));
}
