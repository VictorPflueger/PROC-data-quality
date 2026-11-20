// Run facts: a short, factual summary of a finished run, on the console's last line and in the audit
// export: time, visible tool calls, records read, engine calls, hypothesis and revisions, the decision,
// the drafts and the cost.

import { splitParagraphs, labelKind } from "./labels.js";
import { euroCents, int, clock } from "./format.js";

/** rows: audit rows of the run (events and model_call rows); end: the run_end envelope. */
export function computeRunFacts(rows, end = null) {
  const events = rows.filter((r) => r.type !== "model_call");
  const start = events.find((e) => e.type === "run_start");
  const finish = end || [...events].reverse().find((e) => e.type === "run_end") || null;
  const totalMs = Math.max(0, finish?.t ?? events[events.length - 1]?.t ?? 0);
  const calls = events.filter((e) => e.type === "tool_call" && !String(e.payload?.name || "").startsWith("ui_"));
  const results = events.filter((e) => e.type === "tool_result");
  const okCall = (id) => results.some((r) => r.payload?.call_id === id && r.payload?.ok !== false);
  const recordsRead = calls.filter((c) => c.payload.name === "erp_get_record" && okCall(c.payload.call_id)).length;
  const engine = calls.filter((c) => String(c.payload.name).startsWith("dq_")).length;
  const finalText = new Map();
  for (const e of events) if (e.type === "narration" && e.payload?.done) finalText.set(e.payload.msg_id || e.id, String(e.payload.text || ""));
  const kinds = [...finalText.values()].flatMap((t) => splitParagraphs(t)).map(labelKind);
  const decision = [...events].reverse().find((e) => e.type === "option_decision" && e.payload?.decision === "approved");
  const drafts = events.filter((e) => e.type === "action_draft").length;
  const approved = events.filter((e) => e.type === "action_decision" && e.payload?.decision === "approved").length;
  const cost = [...events].reverse().find((e) => e.type === "cost_update")?.payload || null;
  const modelCalls = rows.filter((r) => r.type === "model_call").length;
  // As the console shows them: every step code refused (a screen tool, or any tool's refusal by a
  // guard, the schema or the figure audit) and every decision a guardrail ignored.
  const guardrails = results.filter((r) => r.payload?.ok === false && (String(r.payload?.name || "").startsWith("ui_") || r.payload?.result?.refused)).length
    + events.filter((e) => e.type === "notice" && e.payload?.guardrail).length;
  return {
    mode: start?.payload?.mode || null, duration_ms: totalMs, tool_calls: calls.length, records_read: recordsRead, engine_calls: engine,
    hypotheses: kinds.filter((k) => k === "hypothesis").length, revisions: kinds.filter((k) => k === "revised").length,
    decision: decision ? decision.payload.option_label || decision.payload.option_id : null, drafts, drafts_approved: approved,
    guardrail_refusals: guardrails, model_calls: modelCalls, cost_eur: cost?.simulated ? 0 : cost?.eur ?? 0, outcome: [...events].reverse().find((e) => e.type === "report")?.payload?.outcome || null
  };
}

/** One line for the console: "02:41 · 15 tool calls (4 records read, 6 engine) · …". */
export function describeRunFacts(f) {
  const parts = [
    clock(f.duration_ms),
    `${int(f.tool_calls)} tool calls (${int(f.records_read)} records read, ${int(f.engine_calls)} engine)`,
    f.revisions ? `${int(f.hypotheses)} hypothesis, ${int(f.revisions)} revised` : null,
    f.guardrail_refusals ? `${int(f.guardrail_refusals)} guardrail refusal${f.guardrail_refusals === 1 ? "" : "s"}` : null,
    f.decision ? `decision: ${f.decision}` : null,
    f.drafts ? `${int(f.drafts_approved)} of ${int(f.drafts)} drafts approved` : null,
    f.mode === "live" ? `${int(f.model_calls)} model calls, ${euroCents(f.cost_eur)}` : "no model calls, no cost"
  ];
  return parts.filter(Boolean).join(" · ");
}
