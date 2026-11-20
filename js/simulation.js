// Simulation player: plays a script of data/sim_runs.js through the run-event bus, executing every tool
// call with the live toolbox (js/tools.js), so the steps show the engine's figures exactly as a live run
// on the same inputs would, and the same guardrails apply. Only the agent's words come from the script.
// There is no replay clock: the run goes as far as it can at once and waits where a person decides
// (the review, the fix paths, the drafts), so the presenter sets the pace by stepping through.

import { bus } from "./events.js";
import { createToolbox } from "./tools.js";
import { createHumanQueue, HUMAN_EVENTS } from "./human.js";
import { runScript } from "./sim_script.js";
import { appToday } from "./clock.js";
import { createPhaseGate } from "./phase.js";
import { PARAMS } from "./params.js";

const ABORT = Symbol("abort");

export function createSimulationPlayer() {
  let current = null;

  async function play(script) {
    const human = createHumanQueue();
    const run = { cancelled: false, ended: false, msg: 0, human };
    current = run;
    const offs = HUMAN_EVENTS.map((type) => bus.on(type, (ev) => { if (!run.ended) human.push(ev); }));
    const live = () => { if (run.cancelled) throw ABORT; };
    const gate = createPhaseGate((state) => { if (!run.ended) bus.emit("state_change", { state }); });
    // Simulation runs on the method's default parameters, so every scripted run stays valid.
    const toolbox = createToolbox({
      world: window.WORLD, mode: "simulation", today: appToday(), params: PARAMS,
      emit: (type, payload) => { if (!run.ended) bus.emit(type, payload); },
      onPhase: (state) => gate.set(state),
      waitFor: (kind, test) => human.waitFor(kind, test)
    });
    try {
      bus.emit("cost_update", { simulated: true, eur: 0, usd: 0, input_tokens: 0, output_tokens: 0 });
      gate.set("scanning");
      await runScript(script, {
        world: window.WORLD, toolbox,
        hooks: {
          think: (text) => { live(); bus.emit("reasoning", { msg_id: `sim-r${++run.msg}`, text, done: true }); },
          say: (text, kind) => { live(); bus.emit("narration", { msg_id: `sim-n${++run.msg}`, text, done: true, ...(kind ? { kind } : {}) }); },
          toolCall: (callId, name, input) => { live(); bus.emit("tool_call", { call_id: callId, name, input }); },
          toolResult: (callId, name, out) => { live(); bus.emit("tool_result", { call_id: callId, name, ok: !out.isError, summary: out.summary, result: out.result }); }
        }
      });
      if (!run.ended && !run.cancelled) end(run, "done");
    } catch (e) {
      if (e === ABORT || run.cancelled) return;
      console.error("[Data Quality Agent] simulation stopped:", e);
      bus.emit("notice", { level: "error", text: `Simulation stopped: ${e.message}` });
      end(run, "error", e.message);
    } finally {
      offs.forEach((off) => off());
      if (current === run) current = null;
    }
  }

  function end(run, status, reason) {
    if (run.ended) return;
    run.ended = true;
    bus.emit("state_change", { state: status === "done" ? "done" : status === "aborted" ? "aborted" : "error" });
    bus.emit("run_end", { status, ...(reason ? { reason } : {}) });
  }

  function abort(reason = "Stopped by the user.") {
    const run = current;
    if (!run || run.ended) return;
    run.cancelled = true;
    run.human.cancel(ABORT);
    end(run, "aborted", reason);
  }

  return { play, abort, isActive: () => !!current && !current.ended };
}
