// Facts the steps and the key figures state, computed from the engine's results and the world: what a
// scan found (each order line counted once), how long the exceptions behind it have waited in the
// exception log, and the default case's figures for the guide's talk track. Pure, so the tests run it
// in Node and compare it with the engine.

import { indexOf, valueEur } from "./erp.js";
import { isLive } from "./engine.js";
import { ruleById } from "./rules.js";

const logIndex = new WeakMap();
function logOf(world) {
  let m = logIndex.get(world);
  if (!m) {
    m = new Map((world.exception_log || []).filter((x) => isLive(x.status)).map((x) => [`${x.rule}|${x.record}`, x]));
    logIndex.set(world, m);
  }
  return m;
}

/**
 * Exceptions as the log knew them before this run: how many were already there, how many are new
 * today, and how many days the oldest has waited (detected_day is negative: days ago).
 */
export function ageOf(world, exceptionIds) {
  const log = logOf(world);
  let before = 0;
  let oldest = 0;
  for (const id of exceptionIds) {
    const x = log.get(id);
    if (!x) continue;
    before += 1;
    oldest = Math.max(oldest, -Number(x.detected_day || 0));
  }
  return { before, fresh: exceptionIds.length - before, oldestDays: oldest };
}

/** What one scan found: counts by rule, the spend of its order lines (each line once) and their age. */
export function scanFacts(world, scan) {
  const ix = indexOf(world);
  const byRule = new Map();
  const lines = new Set();
  const products = new Set();
  for (const e of scan.exceptions || []) {
    if (!isLive(e.status || "open")) continue;
    byRule.set(e.rule, (byRule.get(e.rule) || 0) + 1);
    products.add(e.product);
    for (const l of e.lines || []) lines.add(l);
  }
  let spend = 0;
  for (const id of lines) { const l = ix.lines.get(id); if (l) spend += valueEur(world, l); }
  const ids = (scan.exceptions || []).filter((e) => isLive(e.status || "open")).map((e) => e.id);
  return { n: ids.length, byRule, rules: scan.rules || [], lines: lines.size, spend, onlyLines: products.size === 1 && products.has("po_line"), ...ageOf(world, ids) };
}

/** "order lines" when every exception sits on an order line, otherwise "records". */
export const recordsWord = (onlyLines, n) => (onlyLines ? (n === 1 ? "order line" : "order lines") : (n === 1 ? "record" : "records"));

/** The rule's severity tone on the board: danger for high, warning for medium and low. */
export const severityTone = (ruleId) => (ruleById(ruleId)?.severity === "high" ? "danger" : "warning");

/**
 * The default case's figures for the guide, from the frozen reference figures of the engine
 * (data/reference_cases.js), the script's recommendation (data/sim_runs.js) and the world.
 * ref: REFERENCE_CASES.cases[id]; script: SIM_RUNS[id].
 */
export function leadFacts(world, ref, script) {
  const p = ref.paths || {};
  const recommended = (script?.steps || []).find((s) => s.tool === "ui_propose_options")?.input?.recommended || null;
  const rec = recommended && p[recommended];
  return {
    n: ref.n,
    spend: ref.spend_eur,
    past: p.nothing?.past_cost_eur ?? ref.financing_cost_eur,
    yearly: p.nothing?.gains_cost_eur_per_year ?? 0,
    path: recommended,
    fixed: rec ? rec.closed : 0,
    effort: rec ? rec.effort_eur : 0,
    avoided: rec ? rec.future_avoided_eur_per_year : 0,
    ...ageOf(world, ref.exceptions || [])
  };
}
