// The simulation script checker: holds every script to the live guardrails by running it through the
// live toolbox (js/tools.js) with a scripted person, along every decision path the script offers:
// approving each option, rejecting the recommendation and approving another, accepting the risk, and
// rejecting every path; where a script asks for a review, also with every suggestion rejected. A tool
// refusal (a guardrail, the schema, the figure audit) is a fault, as is an unresolved placeholder, a
// figure in narration (in a recorded script: a figure typed rather than a placeholder), a missing
// hypothesis or revision, fewer than eight tool calls before the
// decision, or a report whose outcome does not follow the decision. Runs in Node (tools/check_world.mjs,
// tests) and in the browser (Diagnostics).

import { createToolbox } from "./tools.js";
import { createHumanQueue } from "./human.js";
import { runScript } from "./sim_script.js";
import { extractFigures } from "./figures.js";
import { labelKind } from "./labels.js";

const FIGURE_TYPES = new Set(["amount", "share", "count", "days"]);
const MIN_CALLS_BEFORE_DECISION = 8;

/** The decision plans for a run whose options are on screen: each a function of the options event. */
function plans(hasReview) {
  const out = [
    { name: "approve the recommendation", decide: (o) => [approve(o, o.recommended)] },
    { name: "reject the recommendation, approve another", decide: (o) => [reject(o, o.recommended), approve(o, o.options.find((x) => x.id !== o.recommended).id)] },
    { name: "accept the risk", decide: (o) => [{ options_seq: o.options_seq, option_id: "nothing", decision: "approved", note: "Lower priority this quarter; to be reviewed next quarter." }], outcome: "risk_accepted" },
    { name: "reject every path", decide: (o) => o.options.map((x) => reject(o, x.id)), outcome: "stopped" }
  ];
  // Every other option approved on its own, so each path's drafts are checked.
  out.push({ name: "approve each other option", each: true });
  if (hasReview) out.push({ name: "reject every AI suggestion, approve the recommendation", review: "reject", decide: (o) => [approve(o, o.recommended)] });
  return out;
}
const approve = (o, id) => ({ options_seq: o.options_seq, option_id: id, decision: "approved" });
const reject = (o, id) => ({ options_seq: o.options_seq, option_id: id, decision: "rejected" });

/**
 * Runs a script once with a scripted person. Returns { ok, problems: [text], outcome, calls,
 * decisionCalls, narration: [texts], options }.
 */
export async function runOnce(world, script, { decide, review = "approve", today = new Date() } = {}) {
  const human = createHumanQueue();
  const problems = [];
  let outcome = null;
  let options = null;
  const narration = [];
  const toolbox = createToolbox({
    world, mode: "simulation", today,
    onPhase: () => {},
    waitFor: (kind, test) => human.waitFor(kind, test),
    emit: (type, payload) => {
      if (type === "options") {
        options = payload;
        const decisions = decide(payload);
        queueMicrotask(() => decisions.forEach((d) => human.push({ type: "option_decision", payload: { ...d, by: "user" } })));
      }
      if (type === "confirmation_request") {
        queueMicrotask(() => human.push({ type: "confirmation_decision", payload: { review_id: payload.review_id, by: "user",
          decisions: payload.items.map((it) => ({ line_id: it.line_id, decision: review === "reject" ? "rejected" : "approved" })) } }));
      }
      if (type === "action_draft") queueMicrotask(() => human.push({ type: "action_decision", payload: { action_id: payload.action_id, decision: "approved", by: "user" } }));
      if (type === "report") outcome = payload.outcome;
    }
  });
  let result = { calls: 0, decisionCalls: null };
  try {
    result = await runScript(script, {
      world, toolbox,
      hooks: {
        say: (text) => { narration.push(text); },
        think: (text) => { narration.push(text); },
        problem: (m) => { problems.push(m); }
      }
    });
  } catch (e) {
    problems.push(e.message);
  }
  // An authored script's narration carries no figures at all; a recorded one may quote the engine's,
  // through placeholders only (checked on the templates in checkScript).
  if (script.source !== "recorded") {
    for (const text of narration) {
      const figs = extractFigures(text).filter((f) => FIGURE_TYPES.has(f.type));
      if (figs.length) problems.push(`narration quotes figures (${figs.map((f) => f.raw).join(", ")}): "${text.slice(0, 80)}"`);
    }
  }
  return { ok: !problems.length, problems, outcome, options, calls: result.calls, decisionCalls: result.decisionCalls };
}

/**
 * Checks one script along every decision path. Returns { id, ok, runs: [{ plan, ok, outcome,
 * problems }], problems: [text] (script-level) }.
 */
export async function checkScript(world, script, { scenarios = [], today = new Date() } = {}) {
  const problems = [];
  if (!["authored", "recorded"].includes(script.source)) problems.push(`source must be "authored" or "recorded" (is ${JSON.stringify(script.source)})`);
  if (scenarios.length && !scenarios.some((s) => s.id === script.id) && script.source !== "recorded") problems.push(`no scenario ${script.id}`);
  const steps = script.steps || [];
  if (!steps.some((s) => s.say && s.kind === "hypothesis")) problems.push("no hypothesis in the narration");
  if (!steps.some((s) => s.say && s.kind === "revision")) problems.push("no visible revision in the narration");
  // The console labels a paragraph by its words and the run facts count those labels, so a marked
  // step must also read as one ("Hypothesis: …", "Revised: …").
  for (const s of steps) {
    if (s.say && s.kind === "hypothesis" && labelKind(s.say) !== "hypothesis") problems.push(`a hypothesis step does not start with "Hypothesis:": "${s.say.slice(0, 60)}"`);
    if (s.say && s.kind === "revision" && labelKind(s.say) !== "revised") problems.push(`a revision step does not start with "Revised:": "${s.say.slice(0, 60)}"`);
  }
  if (!steps.some((s) => s.decide)) problems.push("no decision step");
  if (script.source === "recorded") {
    for (const s of steps) {
      const text = s.say || s.think;
      if (!text) continue;
      const figs = extractFigures(String(text).replace(/\{\{[^}]+\}\}/g, " ")).filter((f) => FIGURE_TYPES.has(f.type));
      if (figs.length) problems.push(`narration types figures no tool returned (${figs.map((f) => f.raw).join(", ")}): "${String(text).slice(0, 80)}"`);
    }
  }
  const hasReview = steps.some((s) => s.tool === "ui_request_review");
  const runs = [];
  for (const plan of plans(hasReview)) {
    if (plan.each) {
      // Approve every option that is not the recommendation, one run each.
      const probe = await runOnce(world, script, { decide: (o) => [approve(o, o.recommended)], today });
      const others = (probe.options?.options || []).filter((x) => x.id !== probe.options.recommended).map((x) => x.id);
      for (const id of others) {
        const r = await runOnce(world, script, { decide: (o) => [approve(o, id)], today });
        runs.push(finish(`approve path ${id}`, r, "fix_approved"));
      }
      continue;
    }
    const r = await runOnce(world, script, { decide: plan.decide, review: plan.review || "approve", today });
    runs.push(finish(plan.name, r, plan.outcome || "fix_approved"));
  }
  const first = runs[0];
  if (first && first.decisionCalls !== null && first.decisionCalls < MIN_CALLS_BEFORE_DECISION) {
    problems.push(`${first.decisionCalls} tool calls before the decision; at least ${MIN_CALLS_BEFORE_DECISION} required`);
  }
  return { id: script.id, ok: !problems.length && runs.every((r) => r.ok), runs, problems };
}

function finish(plan, r, expected) {
  const problems = r.problems.slice();
  if (r.ok && r.outcome !== expected) problems.push(`the report's outcome is ${r.outcome}, expected ${expected}`);
  return { plan, ok: !problems.length, outcome: r.outcome, problems, decisionCalls: r.decisionCalls, calls: r.calls };
}

/** Checks every script. Returns { ok, results: [checkScript results] }. */
export async function checkScripts(world, runs, { scenarios = [], today = new Date() } = {}) {
  const results = [];
  for (const script of Object.values(runs || {})) results.push(await checkScript(world, script, { scenarios, today }));
  return { ok: results.length > 0 && results.every((r) => r.ok), results };
}
