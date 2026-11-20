// History and reconciliation (section 6.5 and 6.6 of the method): the closure rate over the
// exceptions first detected 14 to 69 days ago, the eight weekly cohorts, the 14-day closure share and
// the monthly inflow, and the reconciliation of every scan with the exception log. Closure is
// measured, not claimed: an entry closes only when a scan no longer finds its exception. A
// projection runs the same scan and reconciliation on a copy of the data with approved changes, and
// is never written to the log. Pure functions; the log passed in is never changed.

import { scan, isLive, matchesFilters, context } from "./engine.js";

const COHORT_FROM = 69; // days ago, inclusive
const COHORT_TO = 14;   // days ago, inclusive

/**
 * Closure rate: among the entries first detected 14 to 69 days ago, the closed ones over those not
 * dismissed. Accepted entries stay open in this count. { value (null without entries), closed, eligible }.
 */
export function closureRate(log, day = 0) {
  const cohort = log.filter((x) => x.detected_day >= day - COHORT_FROM && x.detected_day <= day - COHORT_TO && x.status !== "dismissed");
  const closed = cohort.filter((x) => x.status === "closed").length;
  return { value: cohort.length ? closed / cohort.length : null, closed, eligible: cohort.length, from: day - COHORT_FROM, to: day - COHORT_TO };
}

/**
 * The eight weekly cohorts: week 1 is days −20 to −14, week 2 days −27 to −21, … week 8 days −69 to −63.
 * For each: entries detected, closed, still open (open, routed or accepted) and dismissed.
 */
export function cohorts(log, day = 0) {
  const out = [];
  for (let week = 1; week <= 8; week++) {
    const to = day - COHORT_TO - 7 * (week - 1);
    const from = to - 6;
    const xs = log.filter((x) => x.detected_day >= from && x.detected_day <= to);
    const closed = xs.filter((x) => x.status === "closed").length;
    const dismissed = xs.filter((x) => x.status === "dismissed").length;
    out.push({ week, from, to, detected: xs.length, closed, open: xs.length - closed - dismissed, dismissed, share: xs.length - dismissed > 0 ? closed / (xs.length - dismissed) : null });
  }
  return out;
}

/**
 * The 14-day closure share of a set of rules: among their entries routed at least 14 days ago and not
 * dismissed, the share closed within 14 days of routing. A case pools its rules. `record` (optional)
 * keeps only the entries whose (rule, record) it accepts. { value (null: no history), closed, eligible }.
 */
export function share14(log, rules, day = 0, record = null) {
  const set = new Set(rules);
  const eligible = log.filter((x) => set.has(x.rule) && x.routed_day !== null && x.routed_day !== undefined && x.routed_day <= day - 14
    && x.status !== "dismissed" && (!record || record(x.rule, x.record)));
  const closed = eligible.filter((x) => x.status === "closed" && x.closed_day !== null && x.closed_day - x.routed_day <= 14).length;
  return { value: eligible.length ? closed / eligible.length : null, closed, eligible: eligible.length };
}

/**
 * Monthly inflow of a set of rules: their entries detected in the last 90 days and not dismissed,
 * divided by three. `record` (optional) keeps only the entries in a case's root-cause group.
 */
export function inflow(log, rules, day = 0, record = null) {
  const set = new Set(rules);
  return log.filter((x) => set.has(x.rule) && x.detected_day >= day - 89 && x.detected_day <= day && x.status !== "dismissed"
    && (!record || record(x.rule, x.record))).length / 3;
}

/** The next entry ids after the log's own: same prefix, same width ("H10" → "H11", "H0042" → "H0043"). */
function idMaker(log) {
  let prefix = "H";
  let width = 4;
  let max = 0;
  for (const x of log) {
    const m = /^([A-Za-z-]*)(\d+)$/.exec(x.id || "");
    if (!m) continue;
    prefix = m[1];
    width = Math.max(m[2].length, 2);
    max = Math.max(max, Number(m[2]));
  }
  return () => `${prefix}${String(++max).padStart(width, "0")}`;
}

/**
 * Reconciles a scan with the log, within the rules and filters it ran (section 6.6):
 *  - an entry the log holds as open, routed or accepted that the scan still finds stays as it is;
 *  - an exception the scan finds for the first time becomes a new entry detected today, "open";
 *  - a live entry the scan no longer finds closes today, "closed by re-scan";
 *  - a closed exception that reappears gets a new entry, linked to the old one (reopens).
 * Dismissed exceptions are not raised again. Returns { log (a new array), still, closed, fresh, reopened }.
 * Options: day, rules (the rules the scan ran; default: the rules of all entries), filters with the
 * scan's context `c` (an entry whose record no longer matches the filters is out of scope).
 */
export function reconcile(log, exceptions, { day = 0, rules = null, filters = null, c = null } = {}) {
  const next = log.map((x) => ({ ...x }));
  const found = new Map(exceptions.map((e) => [e.id, e]));
  const inRules = rules && rules.length ? new Set(rules) : null;
  const inScope = (x) => {
    if (inRules && !inRules.has(x.rule)) return false;
    if (!filters || !Object.keys(filters).length) return true;
    if (!c) return false;
    // An entry is in a filtered scope only when its record still exists and matches the filters.
    const e = recordAsException(c, x);
    return !!e && matchesFilters(c, e, filters);
  };
  const still = [];
  const closed = [];
  for (const x of next) {
    if (!isLive(x.status) || !inScope(x)) continue;
    if (found.has(`${x.rule}|${x.record}`)) still.push(x.id);
    else Object.assign(x, { status: "closed", closed_day: day, reason: "closed by re-scan" }), closed.push(x.id);
  }
  const live = new Set(next.filter((x) => isLive(x.status)).map((x) => `${x.rule}|${x.record}`));
  const dismissed = new Set(next.filter((x) => x.status === "dismissed").map((x) => `${x.rule}|${x.record}`));
  const newId = idMaker(next);
  const fresh = [];
  const reopened = [];
  for (const e of exceptions) {
    if (live.has(e.id) || dismissed.has(e.id)) continue;
    const old = next.filter((x) => x.status === "closed" && `${x.rule}|${x.record}` === e.id).sort((a, b) => (b.closed_day ?? 0) - (a.closed_day ?? 0))[0];
    const entry = {
      id: newId(), rule: e.rule, record: e.record.id, detected_day: day, routed_day: null, responsible: e.responsible ?? null, routed_to: e.routed_to ?? null,
      status: "open", closed_day: null, reason: null, reopens: old ? old.id : null
    };
    next.push(entry);
    live.add(e.id);
    fresh.push(entry.id);
    if (old) reopened.push(entry.id);
  }
  return { log: next, still, closed, fresh, reopened };
}

/** An entry's record as a minimal exception, so that filters and groups can test it (null when it is gone). */
export function recordAsException(c, x) {
  const key = String(x.record);
  if (c.lineById.has(key)) return { rule: x.rule, record: { product: "po_line", id: key }, lines: [key], detected_day: x.detected_day };
  const supplierLines = (sid) => c.lines.filter((l) => l.supplier === sid).map((l) => l.id);
  let m = /^(.+)@(.+)$/.exec(key);
  if (m && c.suppliers.has(m[1])) return { rule: x.rule, record: { product: "supplier", id: key, supplier: m[1], company_code: m[2] }, lines: c.lines.filter((l) => l.supplier === m[1] && l.company_code === m[2]).map((l) => l.id), detected_day: x.detected_day };
  m = /^(.+)\+(.+)$/.exec(key);
  if (m && c.suppliers.has(m[1]) && c.suppliers.has(m[2])) return { rule: x.rule, record: { product: "supplier", id: key, pair: [m[1], m[2]] }, lines: [...supplierLines(m[1]), ...supplierLines(m[2])], detected_day: x.detected_day };
  if (c.suppliers.has(key)) return { rule: x.rule, record: { product: "supplier", id: key }, lines: supplierLines(key), detected_day: x.detected_day };
  if (c.materials.has(key)) return { rule: x.rule, record: { product: "material", id: key }, lines: c.lines.filter((l) => l.material === key).map((l) => l.id), detected_day: x.detected_day };
  if (c.contracts.has(key)) return { rule: x.rule, record: { product: "contract", id: key }, lines: c.lines.filter((l) => l.contract === key).map((l) => l.id), detected_day: x.detected_day };
  return null;
}

const LISTS = { po_line: "po_lines", supplier: "suppliers", material: "materials", contract: "contracts", user_org: "users" };

/**
 * A what-if: the same scan and reconciliation on a copy of the world with the changes applied
 * ({ product, id, field, value }), reconciled with a copy of the log. Shown as "projected after
 * re-scan", never written back. rules and filters give the re-scan its scope: a scan reconciles only
 * the entries within the rules and filters it ran, so a projection within the scope of the scan that
 * found the case counts only what the changes close, not what a wider re-scan would close anyway.
 * Returns { scan, reconciliation, closure_rate, world }.
 */
export function project(world, log, changes, { day = 0, params, rules = null, filters = null } = {}) {
  const copy = JSON.parse(JSON.stringify(world));
  for (const ch of changes || []) {
    const list = copy[LISTS[ch.product]];
    const rec = list && list.find((r) => r.id === ch.id);
    if (!rec) throw new Error(`projection: no ${ch.product} ${ch.id}`);
    if (!(ch.field in rec)) throw new Error(`projection: ${ch.product} ${ch.id} has no field ${ch.field}`);
    rec[ch.field] = ch.value;
  }
  const s = scan(copy, { day, params, rules, filters, log });
  const reconciliation = reconcile(log, s.exceptions, { day, rules, filters, c: s.context });
  return { scan: s, reconciliation, closure_rate: closureRate(reconciliation.log, day), world: copy };
}

/**
 * The data as the exception log stands, before this run's scan: the closure rate, the live entries
 * (open, routed or accepted) and the spend they touch. The header shows this until a run scans;
 * a scan then reconciles and the figures follow the scan. Lines count once, however many entries
 * touch them.
 */
export function logState(world, { day = 0, params } = {}) {
  const c = context(world, { day, params });
  const log = world.exception_log || [];
  const live = log.filter((x) => isLive(x.status));
  const flagged = new Set();
  for (const x of live) {
    const e = recordAsException(c, x);
    if (e) for (const id of e.lines) flagged.add(id);
  }
  const spend = c.lines.reduce((t, l) => t + c.eur(l), 0);
  const clean = c.lines.filter((l) => !flagged.has(l.id)).reduce((t, l) => t + c.eur(l), 0);
  return {
    closure_rate: closureRate(log, day), open: live.length, spend_window_eur: spend, clean_spend_eur: clean,
    clean_share: spend > 0 ? clean / spend : null, open_spend_eur: spend - clean, cohorts: cohorts(log, day)
  };
}
