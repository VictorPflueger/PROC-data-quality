// Run recorder: turns a completed live run (its audit event stream) into a simulation script in the
// data/sim_runs.js format, marked "source": "recorded", for curation (decision D6).
//
// What is kept: the agent's reasoning summaries and narration (one step per paragraph, its Hypothesis
// and Revised paragraphs marked), every tool call that succeeded, in order and with its input, and at
// the decision what the agent said and drafted for the path the person took and the report it wrote.
// Every figure in those texts that an engine tool returned becomes the placeholder of its named figure
// (js/sim_vars.js), so the replay shows the engine's figures, recomputed, as an authored script does.
// Refused calls are dropped (a replay must not trip a guardrail), and so are lookups after the
// decision. Paths and outcomes the live run did not take keep the texts of the scenario's current
// script, so a replay works for every decision the presenter makes; the person's decisions are not
// baked in, the replay waits for new ones. The key never enters a recording: no event carries it, and
// the file is redacted again before it is offered for download.

import { auditEvents, auditRunInfo } from "./audit.js";
import { redactSecrets } from "./keystore.js";
import { APP } from "./config.js";
import { ENGINE_VERSION } from "./engine.js";
import { RULE_SET_VERSION } from "./rules.js";
import { figuresOf } from "./sim_vars.js";
import { extractFigures } from "./figures.js";
import { splitParagraphs, labelKind } from "./labels.js";
import { indexOf } from "./erp.js";
import { checkScript } from "./sim_check.js";
import { downloadText } from "./dom.js";

const DECISION_TOOLS = new Set(["ui_await_decision", "ui_draft_action", "ui_await_approvals", "ui_final_report"]);
const FIGURE_TYPES = new Set(["amount", "share", "count", "days"]);

/** Can the current run be saved as a simulation? → { ok, reason } */
export function canRecord() {
  const run = auditRunInfo();
  if (!run) return { ok: false, reason: "No run yet. Complete a live run of a preset scenario first." };
  if (run.mode !== "live") return { ok: false, reason: "Only live runs can be saved as a simulation." };
  if (run.entry !== "scenario" || !run.scenario_id) return { ok: false, reason: "Only runs of a preset scenario can replace its simulation." };
  if (run.status !== "done") return { ok: false, reason: run.status === "running" ? "Available when the run has completed." : "Only completed runs can be saved as a simulation." };
  if (!auditEvents().some((e) => e.type === "report")) return { ok: false, reason: "The run ended without a report." };
  return { ok: true, reason: "" };
}

/**
 * Builds the script of the last run. Returns { key, def, literal: [raw figures left as typed] } or
 * { error } when the run cannot become a script.
 */
export function buildRecordedRun({ events = auditEvents(), run = auditRunInfo(), world = globalThis.WORLD, base = null } = {}) {
  const baseScript = base || globalThis.SIM_RUNS?.[run?.scenario_id] || null;
  const baseDecide = baseScript?.steps?.find((s) => s.decide)?.decide;
  if (!baseDecide) return { error: `there is no script for ${run?.scenario_id || "this scenario"} to take the texts of the paths the live run did not take from` };
  const users = indexOf(world).users;
  const named = new Map();        // name → typed figure, most recent last
  const steps = [];
  const literal = [];
  const byMsg = new Map();        // "n:id" / "r:id" → steps of that message
  const byCall = new Map();       // call_id → step
  const calls = new Map();        // call_id → { name, input }
  const paths = {};
  let phase = "before";           // "before" the first ui_await_decision, then "deciding"
  let current = null;             // { path, mode: "approved" | "rejected" } after a decision
  let recipients = [];
  let stopped = null;
  let options = false;

  const learn = (name, result) => {
    for (const f of figuresOf(name, result)) {
      if (f.type === "text" || f.value === null || f.value === undefined) continue;
      named.delete(f.name);
      named.set(f.name, f);
    }
  };
  const templ = (text, prefer, extra) => {
    const r = templatize(text, extra ? new Map([...named, ...extra]) : named, prefer);
    literal.push(...r.literal);
    return r.text;
  };
  const register = (key, step) => { if (!byMsg.has(key)) byMsg.set(key, []); byMsg.get(key).push(step); };
  const remove = (step) => { const k = steps.indexOf(step); if (k >= 0) steps.splice(k, 1); };
  const target = (path) => (paths[path] ||= {});
  const append = (prev, text) => (prev ? `${prev}\n\n${text}` : text);

  for (const ev of events) {
    const p = ev.payload || {};
    switch (ev.type) {
      case "reasoning": {
        const text = String(p.text || "").trim();
        if (!p.done || !text || phase !== "before") break;
        const step = { think: templ(text) };
        steps.push(step);
        register(`r:${p.msg_id}`, step);
        break;
      }
      case "narration": {
        const text = String(p.text || "").trim();
        if (!p.done || !text) break;
        if (phase === "before") {
          for (const par of splitParagraphs(text)) {
            const k = labelKind(par);
            const step = { say: templ(par), ...(k === "hypothesis" ? { kind: "hypothesis" } : k === "revised" ? { kind: "revision" } : {}) };
            steps.push(step);
            register(`n:${p.msg_id}`, step);
          }
        } else if (current) {
          const t = target(current.path);
          const prefer = preferPath(current.path);
          if (current.mode === "rejected") t.rejected = append(t.rejected, templ(text, prefer));
          else if (!t.drafts) t.approved = append(t.approved, templ(text, prefer));
        }
        break;
      }
      case "attempt_discarded":
        for (const id of p.msg_ids || []) for (const key of [`n:${id}`, `r:${id}`]) for (const s of byMsg.get(key) || []) remove(s);
        for (const id of p.call_ids || []) { const s = byCall.get(id); if (s) remove(s); }
        break;
      case "tool_call":
        calls.set(p.call_id, { name: p.name, input: p.input || {} });
        if (p.name === "ui_await_decision" && options) phase = "deciding";
        break;
      case "tool_result": {
        const call = calls.get(p.call_id) || { name: p.name, input: {} };
        const name = p.name || call.name;
        const input = call.input || {};
        if (p.ok === false) break;  // a refused call leaves no step
        if (phase === "before" && !DECISION_TOOLS.has(name)) {
          const step = { tool: name, input: templateInput(name, input, templ) };
          steps.push(step);
          byCall.set(p.call_id, step);
          if (name === "ui_propose_options") options = true;
          learn(name, p.result);
          break;
        }
        if (name === "ui_await_decision" && p.result?.decision) {
          current = { path: p.result.path, mode: p.result.decision === "approved" ? "approved" : "rejected" };
          if (current.mode === "approved") recipients = p.result.follow_up_recipients || [];
          break;
        }
        if (name === "ui_draft_action" && current?.mode === "approved") {
          const t = target(current.path);
          t.drafts ||= {};
          const kind = input.kind;
          if (t.drafts[kind]) break;  // one text per kind: follow-ups repeat theirs for every person
          if (kind === "follow_up") {
            const who = recipients.find((x) => x.person === input.recipient);
            const extra = new Map(who ? [["person.count", { name: "person.count", type: "count", value: who.count }]] : []);
            const prefer = (n) => (n === "person.count" ? 3 : preferPath(current.path)(n));
            const personal = (s) => personalise(String(s || ""), users.get(input.recipient)?.name);
            t.drafts[kind] = { subject: templ(personal(input.subject), prefer, extra), body: templ(personal(input.body), prefer, extra) };
          } else {
            t.drafts[kind] = { recipient: input.recipient, subject: templ(input.subject, preferPath(current.path)), body: templ(input.body, preferPath(current.path)) };
          }
          break;
        }
        if (name === "ui_await_approvals") { learn(name, p.result); break; }
        if (name === "ui_final_report") {
          const md = templ(input.markdown, current ? preferPath(current.path) : null);
          if (input.outcome === "stopped") stopped = md;
          else if (current?.mode === "approved") target(current.path).report = md;
        }
        break;
      }
      default:
        break;  // run_start, alerts, board and tile updates, decisions, drafts, costs: re-created at playback
    }
  }

  if (!options) return { error: "the live run proposed no fix paths, so there is no decision to replay" };
  const { paths: _previous, ...rest } = baseDecide;
  const decide = JSON.parse(JSON.stringify(rest));
  decide.paths = paths;
  if (stopped) decide.report = { ...decide.report, stopped };
  steps.push({ decide });

  const cost = [...events].reverse().find((e) => e.type === "cost_update")?.payload || null;
  const def = {
    id: run.scenario_id,
    source: "recorded",
    title: run.title,
    recorded: {
      at: run.started_at,
      model: run.model,
      app_version: APP.version,
      world_version: world?.meta?.world_version || null,
      rule_set_version: RULE_SET_VERSION,
      engine_version: ENGINE_VERSION,
      run_id: run.run_id,
      cost_eur: cost && !cost.simulated ? Math.round(Number(cost.eur || 0) * 100) / 100 : null,
      paths_recorded: Object.keys(paths),
      other_paths: "texts of the scenario's previous script"
    },
    steps
  };
  return { key: run.scenario_id, def, literal: [...new Set(literal)] };
}

/**
 * Builds and checks the script of the last run and offers it for download. Returns { ok, ready,
 * message }: ready when it passes the script check and can be appended to data/sim_runs.js as is.
 */
export async function saveRunAsSimulation() {
  const can = canRecord();
  if (!can.ok) return { ok: false, ready: false, message: can.reason };
  const rec = buildRecordedRun();
  if (rec.error) return { ok: false, ready: false, message: `This run cannot become a simulation: ${rec.error}.` };
  const check = await checkScript(globalThis.WORLD, rec.def, { scenarios: globalThis.SCENARIOS || [] });
  const problem = check.problems[0] || check.runs.find((r) => !r.ok)?.problems[0] || null;
  const verdict = check.ok ? null : `${problem}${check.runs.some((r) => !r.ok) ? ` (${check.runs.find((r) => !r.ok).plan})` : ""}`;
  const name = recordedRunFileName(rec);
  downloadText(name, recordedRunScript(rec, verdict), "text/javascript");
  return check.ok
    ? { ok: true, ready: true, message: `Saved ${name}. It passes the script check: append it to data/sim_runs.js to replay this run in Simulation mode.` }
    : { ok: true, ready: false, message: `Saved ${name} for curation. Do not append it yet: the script check found "${verdict}".` };
}

/** The downloadable script: append it to data/sim_runs.js to replace the scenario's current script. */
export function recordedRunScript({ key, def }, verdict = null) {
  const when = def.recorded.at ? `${def.recorded.at.replace("T", " ").slice(0, 16)} UTC` : "unknown time";
  const clean = (s) => String(s || "").replace(/\*\//g, "* /");
  const header = [
    "/*",
    " * DATA QUALITY AGENT: recorded live run, exported with \"Save run as simulation\".",
    ` * Scenario: ${key} (${clean(def.title)})`,
    ` * Recorded: ${when} on ${clean(def.recorded.model) || "unknown model"}, ${APP.name} ${def.recorded.app_version}`,
    ` * Recorded path${def.recorded.paths_recorded.length === 1 ? "" : "s"}: ${def.recorded.paths_recorded.join(", ") || "none"}; the other paths keep the previous script's texts.`,
    verdict ? ` * SCRIPT CHECK: needs curation before use: ${clean(verdict)}` : " * SCRIPT CHECK: passed along every decision path.",
    " * To use it, append this file's content to the end of data/sim_runs.js. It then replaces the",
    " * scenario's current script; delete it again to restore that one.",
    " */"
  ].join("\n");
  const body = `window.SIM_RUNS = window.SIM_RUNS || {};\nwindow.SIM_RUNS[${JSON.stringify(key)}] = ${JSON.stringify(def, null, 2)};\n`;
  return redactSecrets(`${header}\n${body}`);
}

export function recordedRunFileName({ key, def }) {
  const t = new Date(def.recorded.at || Date.now());
  const d = Number.isNaN(t.getTime()) ? new Date() : t;
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `sim-run-${key}-recorded-${ymd}.js`;
}

// ---- texts to templates -------------------------------------------------------------------------

/** The texts a tool input carries, as templates; ids and filters stay as they are. */
function templateInput(name, input, templ) {
  const copy = JSON.parse(JSON.stringify(input || {}));
  if (name === "ui_report_alert") for (const k of ["title", "root_cause", "fix_at_source", "summary"]) copy[k] = templ(copy[k]);
  if (name === "ui_request_review" && copy.note) copy.note = templ(copy.note);
  if (name === "ui_propose_options") {
    copy.options = (copy.options || []).map((o) => {
      const prefer = preferPath(o.path);
      return { ...o, title: templ(o.title, prefer), description: templ(o.description, prefer), residual_risk: templ(o.residual_risk, prefer) };
    });
    copy.nothing_note = templ(copy.nothing_note, preferPath("nothing"));
  }
  return copy;
}

const preferPath = (path) => (n) => (n.startsWith(`path.${path}.`) ? 2 : n.startsWith("case.") ? 1 : 0);

/** The recipient's name (and first name) as the {{person.name}} placeholder. */
function personalise(text, name) {
  if (!name) return text;
  const first = String(name).split(/\s+/)[0];
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let out = text.split(name).join("{{person.name}}");
  if (first && first.length > 2) out = out.replace(new RegExp(`\\b${esc(first)}\\b`, "g"), "{{person.name}}");
  return out;
}

/**
 * Replaces each figure written in `text` by the placeholder of the named figure it matches (same
 * type, same value at the precision written; the most recent and most relevant name wins). Returns
 * { text, literal: [raw figures that matched no name] }.
 */
export function templatize(text, named, prefer = null) {
  const s = String(text ?? "");
  const tokens = extractFigures(s).filter((t) => FIGURE_TYPES.has(t.type)).sort((a, b) => a.index - b.index);
  let out = "";
  let pos = 0;
  const literal = [];
  for (const t of tokens) {
    const at = s.indexOf(t.raw, Math.max(t.index, pos));
    if (at < 0) continue;
    const name = bestName(t, named, prefer);
    if (!name) { literal.push(t.raw); continue; }
    out += `${s.slice(pos, at)}{{${name}}}`;
    pos = at + t.raw.length;
  }
  return { text: out + s.slice(pos), literal };
}

function bestName(t, named, prefer) {
  let best = null;
  let bestScore = -1;
  let i = 0;
  for (const [name, f] of named) {
    i += 1;
    if (!fits(t, f)) continue;
    const score = (prefer ? prefer(name) : 0) * 1e6 + i;
    if (score > bestScore) { best = name; bestScore = score; }
  }
  return best;
}

function fits(t, f) {
  const v = Number(f.value);
  if (!Number.isFinite(v)) return false;
  const tol = (decimals, scale = 1) => 0.5 * 10 ** -decimals * scale + 1e-9;
  if (t.type === "amount") {
    if (f.type !== "amount" || (t.currency && t.currency !== "EUR")) return false;
    const a = Math.abs(v);
    if (t.decimals === 0 && (t.scale || 1) === 1 && Math.floor(a + 1e-9) === t.value) return true;  // whole euros (B8)
    return Math.abs(a - t.value) <= tol(t.decimals, t.scale || 1);
  }
  if (t.type === "share") return f.type === "share" && Math.abs(v * 100 - t.value) <= tol(t.decimals);
  if (t.type === "count") return f.type === "count" && Math.abs(v - t.value) <= tol(t.decimals);
  if (t.type === "days") return f.type === "days" && Math.abs(v - t.value) <= tol(t.decimals);
  return false;
}
