// What a run should show, worked out in Node with the same engine, tools and scripts the page uses:
// a case's script runs through the live toolbox with a scripted person, so the browser suites can hold
// the page's figures to the engine's without typing a number. Also the session-cost estimate of the
// same run (js/estimate.js) and how long the case's oldest exception has waited (js/facts.js).

import path from "node:path";
import { APP_ROOT } from "./harness.mjs";
import { loadData } from "./turns.mjs";

const mod = (p) => import(path.join(APP_ROOT, p));

/**
 * Runs the case's script once. decide(options) → [option decisions]; review(items) → [{ line_id, decision }].
 * Returns { options, decisions, alert, drafts, report, scan, fixPaths, estimate, age }.
 */
export async function expectedRun(scenarioId, {
  decide = (o) => [{ options_seq: o.options_seq, option_id: o.recommended, decision: "approved" }],
  review = (items) => items.map((it) => ({ line_id: it.line_id, decision: "approved" }))
} = {}) {
  const data = await loadData();
  const { createToolbox, toolDefinitions } = await mod("js/tools.js");
  const { createHumanQueue } = await mod("js/human.js");
  const { runScript } = await mod("js/sim_script.js");
  const { createEstimator } = await mod("js/estimate.js");
  const { buildSystemPrompt, buildOpeningMessage } = await mod("js/prompt.js");
  const { ageOf } = await mod("js/facts.js");
  const { appToday } = await mod("js/clock.js");
  const sc = data.SCENARIOS.find((s) => s.id === scenarioId);
  const today = appToday().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const est = createEstimator({ system: buildSystemPrompt({ today }), tools: toolDefinitions(), opening: buildOpeningMessage({ entry: "scenario", tip: sc.tip }) });
  const human = createHumanQueue();
  const out = { options: null, decisions: [], alert: null, drafts: [], report: null, scan: null, fixPaths: null };
  const toolbox = createToolbox({
    world: data.WORLD, mode: "simulation", today: appToday(), onPhase: () => {},
    waitFor: (k, t) => human.waitFor(k, t),
    emit: (type, p) => {
      if (type === "alert") out.alert = p;
      if (type === "board_update" && p.scan) out.scan = p.scan;
      if (type === "options") {
        out.options = p;
        const ds = decide(p);
        out.decisions.push(...ds);
        queueMicrotask(() => ds.forEach((d) => human.push({ type: "option_decision", payload: { ...d, by: "user" } })));
      }
      if (type === "confirmation_request") queueMicrotask(() => human.push({ type: "confirmation_decision", payload: { review_id: p.review_id, by: "user", decisions: review(p.items) } }));
      if (type === "action_draft") {
        out.drafts.push(p);
        queueMicrotask(() => human.push({ type: "action_decision", payload: { action_id: p.action_id, decision: "approved", by: "user" } }));
      }
      if (type === "report") out.report = p;
    }
  });
  await runScript(data.SIM_RUNS[scenarioId], {
    world: data.WORLD, toolbox,
    hooks: {
      think: (t) => est.text(t), say: (t) => est.text(t),
      toolCall: (id, name, input) => est.toolCall(name, input),
      toolResult: (id, name, o) => { est.toolResult(o.result); if (name === "dq_fix_paths" && o.result?.ok !== false) out.fixPaths = o.result; }
    }
  });
  est.finish();
  out.estimate = est.snapshot();
  out.age = out.alert ? ageOf(data.WORLD, out.alert.exception_ids || []) : null;
  return out;
}

/** The approved option's figures of an expected run, or null. */
export function approvedFigures(run) {
  const d = [...run.decisions].reverse().find((x) => x.decision === "approved");
  if (!d || d.option_id === "nothing") return null;
  return run.options.options.find((o) => o.id === d.option_id)?.figures || null;
}
