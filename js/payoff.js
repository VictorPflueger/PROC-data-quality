// What an approval changes on screen. In the demo nothing changes the data, so an approved fix path
// shows the closure it would bring as "projected after re-scan", never as closed: only a re-scan that
// no longer finds an exception closes it. The projections themselves come from the engine:
//   - a mass correction (A, C) applies its suggestions to a copy of the world, scans the copy and
//     reconciles it with the log, as a re-scan would (js/history.js project);
//   - an owner follow-up (B, D) changes no data the engine can know of; its projected closures,
//     floor(n × c / e), are spread over the case's entries in proportion, so the projected rate is the
//     expected one: the cohort's closed entries plus closures × (case entries in the cohort) / n.

import { project, closureRate } from "./history.js";
import { isLive } from "./engine.js";

const LIST = { po_line: "po_lines" };

/** The data changes a mass correction makes: one per exception with a suggestion. */
export function changesOf(exceptions) {
  const out = [];
  for (const e of exceptions) {
    const s = e.suggestion;
    if (!s || !e.record || e.record.product !== "po_line") continue;
    out.push({ product: "po_line", id: e.record.id, field: s.field, value: s.value });
  }
  return out;
}

/**
 * The projected closure rate of a path. caseExceptions: the case's exceptions (with approved AI
 * suggestions merged in); closedB: B's projected closures. Returns a share, or null when the path
 * changes nothing.
 */
export function projectedRate(world, log, pathId, { caseExceptions, closed, day = 0, params }) {
  if (pathId === "nothing") return closureRate(log, day).value;
  if (pathId === "A" || pathId === "C") {
    const changes = changesOf(caseExceptions.filter((e) => e.suggestion)).filter((c) => LIST[c.product]);
    if (!changes.length) return closureRate(log, day).value;
    return project(world, log, changes, { day, params }).closure_rate.value;
  }
  // B and D: the expected rate if the projected closures fall on the case's entries in proportion.
  const base = closureRate(log, day);
  if (!base.eligible) return base.value;
  const ids = new Set(caseExceptions.map((e) => e.id));
  const inCohort = log.filter((x) => isLive(x.status) && ids.has(`${x.rule}|${x.record}`) && day - x.detected_day >= 14 && day - x.detected_day <= 69).length;
  const n = caseExceptions.length;
  const expected = n ? (closed * inCohort) / n : 0;
  return (base.closed + expected) / base.eligible;
}

/** Which of a case's exceptions an approved path covers, and so shows as "approved, re-scan pending". */
export function coveredBy(pathId, caseExceptions) {
  if (pathId === "A" || pathId === "C") return caseExceptions.filter((e) => e.suggestion).map((e) => e.id);
  if (pathId === "B" || pathId === "D") return caseExceptions.map((e) => e.id);
  return [];
}
