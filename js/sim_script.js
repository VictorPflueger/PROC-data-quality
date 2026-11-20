// Runs one simulation script through a toolbox: the steps of data/sim_runs.js, every tool call executed
// by js/tools.js exactly as in a live run, every {{placeholder}} filled from the named figures of the
// results before it. Shared by the player in the browser (js/simulation.js, with the run-event bus and
// the replay speed) and by the script checker under Node (js/sim_check.js, with a scripted person), so
// what the checker passes is what the presenter sees. Pure apart from the hooks it is given.

import { varsOf, fillTemplate, fillDeep, unresolvedKeys } from "./sim_vars.js";
import { indexOf, roleLabel } from "./erp.js";

export class ScriptError extends Error {}

/** The template variables a run starts with: the central roles' user ids. */
export function initialVars(world) {
  const role = (r) => (world.users || []).find((u) => u.role === r)?.id || "";
  return { "role.lead": role("procurement lead"), "role.supplier_steward": role("supplier master steward"), "role.material_steward": role("material master steward") };
}

/**
 * hooks: {
 *   think(text), say(text, kind), toolCall(callId, name, input), toolResult(callId, name, out),
 *   problem(message) (a script fault: unresolved placeholder, figures in narration; default throws)
 * } — each may return a promise (the player waits on screen); all optional.
 * Returns { vars, calls, decisionCalls: number of tool calls before the first ui_await_decision }.
 */
export async function runScript(script, { world, toolbox, hooks = {} }) {
  const vars = initialVars(world);
  const users = indexOf(world).users;
  let call = 0;
  let beforeDecision = null;
  const problem = hooks.problem || ((m) => { throw new ScriptError(m); });
  const fill = (text) => {
    const missing = unresolvedKeys(vars, text);
    if (missing.length) problem(`unresolved placeholder${missing.length > 1 ? "s" : ""} ${missing.map((k) => `{{${k}}}`).join(", ")}`);
    return fillTemplate(vars, text);
  };

  async function tool(name, rawInput = {}) {
    const missing = unresolvedKeys(vars, rawInput);
    if (missing.length) problem(`${name}: unresolved placeholder${missing.length > 1 ? "s" : ""} ${missing.map((k) => `{{${k}}}`).join(", ")}`);
    const input = fillDeep(vars, rawInput);
    const callId = `sim-c${++call}`;
    if (name === "ui_await_decision" && beforeDecision === null) beforeDecision = call - 1;
    await hooks.toolCall?.(callId, name, input);
    const out = await toolbox.execute(name, input);
    await hooks.toolResult?.(callId, name, out);
    if (out.isError) throw new ScriptError(`${name} was refused: ${out.result.error}`);
    Object.assign(vars, varsOf(out.figures || []));
    return out.result;
  }

  async function decide(d) {
    for (;;) {
      const r = await tool("ui_await_decision", {});
      if (r.decision === "rejected") {
        vars["rejected.path"] = r.path;
        const said = d.paths?.[r.path]?.rejected || (d.rejected && (d.rejected[r.path] || d.rejected.default)) || `Path ${r.path} is off the table.`;
        await hooks.say?.(fill(said), null);
        if (r.remaining.length) continue;
        await hooks.say?.(fill(d.allRejected || "Every fix path was rejected and the risk was not accepted, so nothing is drafted."), null);
        await tool("ui_final_report", { outcome: "stopped", markdown: d.report.stopped });
        return;
      }
      const path = r.path;
      vars["approved.path"] = path === "nothing" ? "do nothing" : path;
      vars["approved.title"] = r.title;
      vars["decision.note"] = r.note || "none given";
      if (path !== "nothing") for (const [k, v] of Object.entries(vars)) if (k.startsWith(`path.${path}.`)) vars[`approved.${k.slice(path.length + 6)}`] = v;
      // A recorded script keeps what the live run said, drafted and reported for the path it took
      // (d.paths[path]); every other path uses the script's general texts.
      const own = d.paths?.[path] || {};
      await hooks.say?.(fill(own.approved || (path === "nothing" ? d.approved.nothing : d.approved.default)), null);
      for (const kind of r.draft_kinds) {
        const t = own.drafts?.[kind] || d.drafts[kind];
        if (!t) throw new ScriptError(`no ${kind} draft in the script, but path ${path} allows one`);
        if (kind === "follow_up") {
          for (const p of r.follow_up_recipients) {
            const u = users.get(p.person);
            vars["person.id"] = p.person;
            vars["person.name"] = u && u.name ? u.name : roleLabel(world, p.person);
            vars["person.count"] = String(p.count);
            await tool("ui_draft_action", { kind, recipient: p.person, subject: t.subject, body: t.body });
          }
        } else {
          await tool("ui_draft_action", { kind, recipient: t.recipient || d.drafts[kind]?.recipient, subject: t.subject, body: t.body });
        }
      }
      await tool("ui_await_approvals", {});
      const outcome = path === "nothing" ? "risk_accepted" : "fix_approved";
      await tool("ui_final_report", { outcome, markdown: own.report || d.report[outcome] });
      return;
    }
  }

  for (const step of script.steps || []) {
    if (step.think) await hooks.think?.(fill(step.think));
    else if (step.say) await hooks.say?.(fill(step.say), step.kind || null);
    else if (step.tool) await tool(step.tool, step.input || {});
    else if (step.decide) await decide(step.decide);
    else throw new ScriptError(`unknown step ${JSON.stringify(step).slice(0, 80)}`);
  }
  return { vars, calls: call, decisionCalls: beforeDecision };
}
