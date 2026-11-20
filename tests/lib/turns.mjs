// Model turns for the scripted API stand-in, built from a simulation script: the script is run once in
// Node through the live toolbox with a scripted person, and every reasoning summary, narration and tool
// call it makes, with its literal input, becomes the stand-in's answer to the agent. The browser then
// runs the live agent against those turns and the test takes the same decisions on screen, so the live
// run must arrive at the same tool calls, ids and figures. Consecutive record reads go out together
// in one turn, as parallel tool calls.

import { readFile } from "node:fs/promises";
import vm from "node:vm";
import path from "node:path";
import { APP_ROOT } from "./harness.mjs";

/** The data files as the page loads them: { WORLD, SCENARIOS, REFERENCE_CASES, SIM_RUNS }. */
export async function loadData() {
  const ctx = {};
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ["data/world.js", "data/scenarios.js", "data/reference_cases.js", "data/sim_runs.js"]) vm.runInContext(await readFile(path.join(APP_ROOT, f), "utf8"), ctx);
  return ctx;
}

const mod = (p) => import(path.join(APP_ROOT, p));

/** Usage of one scripted turn (the cost test recomputes it from the same numbers). */
export const TURN_USAGE = { input_tokens: 600, cache_creation_input_tokens: 0, cache_read_input_tokens: 9000, output_tokens: 420 };

/**
 * Runs `script` through the toolbox and returns { turns, calls, options, outcome }.
 * decide(options payload) → [option_decision payloads]; review(items) → [{ line_id, decision }];
 * edit(steps) may change the script's steps first (a copy).
 */
export async function scriptTurns(data, script, { decide = (o) => [{ options_seq: o.options_seq, option_id: o.recommended, decision: "approved" }], review = (items) => items.map((it) => ({ line_id: it.line_id, decision: "approved" })), draftDecision = () => "approved" } = {}) {
  const { createToolbox } = await mod("js/tools.js");
  const { createHumanQueue } = await mod("js/human.js");
  const { runScript } = await mod("js/sim_script.js");
  const human = createHumanQueue();
  let options = null;
  let outcome = null;
  const toolbox = createToolbox({
    world: data.WORLD, mode: "live", today: new Date(), onPhase: () => {},
    waitFor: (kind, test) => human.waitFor(kind, test),
    emit: (type, payload) => {
      if (type === "options") {
        options = payload;
        const ds = decide(payload);
        queueMicrotask(() => ds.forEach((d) => human.push({ type: "option_decision", payload: { ...d, by: "user" } })));
      }
      if (type === "confirmation_request") queueMicrotask(() => human.push({ type: "confirmation_decision", payload: { review_id: payload.review_id, by: "user", decisions: review(payload.items) } }));
      if (type === "action_draft") queueMicrotask(() => human.push({ type: "action_decision", payload: { action_id: payload.action_id, decision: draftDecision(payload), by: "user" } }));
      if (type === "report") outcome = payload.outcome;
    }
  });
  const turns = [];
  const calls = [];
  let pending = { thinking: [], text: [] };
  let group = null;   // a turn of record reads still open
  let n = 0;
  const flushGroup = () => { if (group) { turns.push(group); group = null; } };
  const head = () => {
    const blocks = [];
    if (pending.thinking.length) blocks.push({ type: "thinking", thinking: pending.thinking.join("\n\n"), signature: `SIG-${turns.length + 1}==` });
    if (pending.text.length) blocks.push({ type: "text", text: pending.text.join("\n\n") });
    pending = { thinking: [], text: [] };
    return blocks;
  };
  await runScript(script, {
    world: data.WORLD, toolbox,
    hooks: {
      think: (t) => { flushGroup(); pending.thinking.push(t); },
      say: (t) => { flushGroup(); pending.text.push(t); },
      toolCall: (callId, name, raw) => {
        const id = `toolu_${String(++n).padStart(2, "0")}`;
        // As the API would send it: plain JSON (the script's arrays come from the data files' realm).
        const input = JSON.parse(JSON.stringify(raw));
        calls.push({ id, name, input });
        const block = { type: "tool_use", id, name, input };
        if (name === "erp_get_record" && group && !pending.thinking.length && !pending.text.length) { group.blocks.push(block); return; }
        flushGroup();
        const turn = { stop: "tool_use", usage: { ...TURN_USAGE }, blocks: [...head(), block] };
        if (name === "erp_get_record") group = turn;
        else turns.push(turn);
      }
    }
  });
  flushGroup();
  turns.push({ stop: "end_turn", usage: { ...TURN_USAGE }, blocks: [...head(), { type: "text", text: "The run is complete: the report is on screen." }].filter((b) => b.type !== "text" || b.text) });
  return { turns, calls, options, outcome };
}
