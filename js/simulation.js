// Simulation player: replays a script of data/sim_runs.js through the run-event bus, executing every
// tool call with the live toolbox (js/tools.js) against the world, so the board, the tiles, the case
// card, the options and the drafts show the engine's figures exactly as a live run on the same inputs
// would, and the same guardrails apply. Only the narration comes from the script. The presenter
// decides, reviews and approves on screen as in Live mode; the replay speed (×1, ×2, ×4) sets the
// pace. Scripts are authored by hand or recorded from a live run (js/recorder.js).

import { bus } from "./events.js";
import { createToolbox } from "./tools.js";
import { createHumanQueue, HUMAN_EVENTS } from "./human.js";
import { runScript } from "./sim_script.js";
import { appToday } from "./clock.js";
import { createPhaseGate } from "./phase.js";

const ABORT = Symbol("abort");

export function createSimulationPlayer({ getSpeed }) {
  let current = null;

  async function play(script, { scenario }) {
    const human = createHumanQueue();
    const run = { cancelled: false, ended: false, waiters: new Set(), msg: 0, human };
    current = run;
    const offs = HUMAN_EVENTS.map((type) => bus.on(type, (ev) => { if (!run.ended) human.push(ev); }));
    const wait = (ms) => {
      if (run.cancelled) return Promise.reject(ABORT);
      const speed = Math.max(0.25, Number(getSpeed()) || 1);
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => { run.waiters.delete(cancel); resolve(); }, ms / speed);
        const cancel = () => { clearTimeout(t); reject(ABORT); };
        run.waiters.add(cancel);
      });
    };
    const gate = createPhaseGate((state) => { if (!run.ended) bus.emit("state_change", { state }); });
    const setPhase = (state) => gate.set(state);
    const toolbox = createToolbox({
      world: window.WORLD, mode: "simulation", today: appToday(),
      emit: (type, payload) => { if (!run.ended) bus.emit(type, payload); },
      onPhase: setPhase,
      waitFor: (kind, test) => human.waitFor(kind, test)
    });
    try {
      bus.emit("cost_update", { simulated: true, eur: 0, usd: 0, input_tokens: 0, output_tokens: 0 });
      setPhase("scanning");
      await runScript(script, {
        world: window.WORLD, toolbox,
        hooks: {
          think: async (text) => { bus.emit("reasoning", { msg_id: `sim-r${++run.msg}`, text, done: true }); await wait(400); },
          say: (text, kind) => say(run, text, kind, wait),
          toolCall: async (callId, name, input) => { if (run.cancelled) throw ABORT; bus.emit("tool_call", { call_id: callId, name, input }); await wait(name.startsWith("ui_await") ? 150 : 650); },
          toolResult: async (callId, name, out) => { bus.emit("tool_result", { call_id: callId, name, ok: !out.isError, summary: out.summary, result: out.result }); await wait(300); }
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

  async function say(run, text, kind, wait) {
    const id = `sim-n${++run.msg}`;
    await wait(300);
    const words = text.split(/(\s+)/);
    let out = "";
    for (let i = 0; i < words.length; i += 6) {
      out += words.slice(i, i + 6).join("");
      bus.emit("narration", { msg_id: id, text: out, done: false, ...(kind ? { kind } : {}) });
      await wait(Math.max(40, (words.slice(i, i + 6).join("").length / 70) * 1000));
    }
    bus.emit("narration", { msg_id: id, text, done: true, ...(kind ? { kind } : {}) });
    await wait(250);
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
    for (const w of run.waiters) w();
    run.waiters.clear();
    run.human.cancel(ABORT);
    end(run, "aborted", reason);
  }

  return { play, abort, isActive: () => !!current && !current.ended };
}
