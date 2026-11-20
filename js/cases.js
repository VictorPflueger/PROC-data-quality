// Cases: the exceptions that share one root cause. dq_group groups the exceptions of some rules by
// one or two keys; a case is the members of one named group of such a result. This module computes
// the groups and, for a case, the figures the fix paths need: its spend over distinct lines, its
// financing cost, who it is routed to, its pooled 14-day history and its inflow from the log, and the
// fix paths themselves. Pure functions over the engine's results.

import { valuesOf, spendOf, matchesFilters } from "./engine.js";
import { share14, inflow, recordAsException } from "./history.js";
import { fixPaths } from "./fixpaths.js";
import { PARAMS } from "./params.js";

const byId = (a, b) => String(a).localeCompare(String(b), "en", { numeric: true });

/**
 * Groups the exceptions of `rules` (within `filters`) of a scan by one or two keys. An exception with
 * several values counts once in each group. Returns { base: { count, spend_eur }, by, groups:
 * [{ values: { key: value }, count, share, spend_eur, exceptions: [ids] }] }, largest groups first.
 */
export function groupExceptions(scanResult, { rules, by, filters = null }) {
  const c = scanResult.context;
  const wanted = new Set(rules);
  const keys = Array.isArray(by) ? by : [by];
  const base = scanResult.exceptions.filter((e) => wanted.has(e.rule) && (!filters || matchesFilters(c, e, filters)));
  const groups = new Map();
  for (const e of base) {
    const lists = keys.map((k) => { const v = valuesOf(c, e, k); return v.length ? v : ["(none)"]; });
    const combos = lists.reduce((acc, list) => acc.flatMap((a) => list.map((v) => [...a, v])), [[]]);
    for (const combo of combos) {
      const id = JSON.stringify(combo);
      if (!groups.has(id)) groups.set(id, { values: Object.fromEntries(keys.map((k, i) => [k, combo[i]])), list: [] });
      groups.get(id).list.push(e);
    }
  }
  const out = [...groups.values()].map((g) => ({
    values: g.values, count: g.list.length, share: base.length ? g.list.length / base.length : 0,
    spend_eur: spendOf(c, g.list), exceptions: g.list.map((e) => e.id)
  })).sort((a, b) => b.count - a.count || b.spend_eur - a.spend_eur || byId(JSON.stringify(a.values), JSON.stringify(b.values)));
  return { base: { count: base.length, spend_eur: spendOf(c, base) }, by: keys, groups: out };
}

/** The members of one group (key and value) among the exceptions of `rules` within `filters`. */
export function caseExceptions(scanResult, { rules, filters = null, key, value }) {
  const c = scanResult.context;
  const wanted = new Set(rules);
  return scanResult.exceptions.filter((e) => wanted.has(e.rule) && (!filters || matchesFilters(c, e, filters))
    && valuesOf(c, e, key).map(String).includes(String(value)));
}

/**
 * Everything the fix paths need for a case, and the fix paths. `log` is the exception log as it stood
 * before this run's scan; `suggestions` (optional) maps exception ids to approved AI suggestions,
 * which count like deterministic ones. Returns { exceptions, n, spend_eur, financing_cost_eur,
 * unpaid_cost_eur, routed_to, history, inflow_per_month, suggestions, fix }.
 */
export function caseFigures(scanResult, log, spec, { params = PARAMS, suggestions = null } = {}) {
  const c = scanResult.context;
  const members = caseExceptions(scanResult, spec);
  const withAi = members.map((e) => (e.suggestion || !suggestions?.has(e.id) ? e : { ...e, suggestion: suggestions.get(e.id) }));
  const routed = {};
  for (const e of members) routed[e.routed_to] = (routed[e.routed_to] || 0) + 1;
  const history = share14(log, spec.rules, c.day);
  // The case's inflow: entries of its rules whose records fall in its root-cause group (within the filters).
  const inGroup = (rule, record) => {
    const entry = log.find((x) => x.rule === rule && x.record === record);
    const e = recordAsException(c, entry || { rule, record, detected_day: null });
    if (!e) return false;
    if (spec.filters && !matchesFilters(c, e, spec.filters)) return false;
    return valuesOf(c, e, spec.key).map(String).includes(String(spec.value));
  };
  const f = inflow(log, spec.rules, c.day, inGroup);
  const fix = fixPaths({
    exceptions: withAi,
    lineValue: (id) => { const l = c.lineById.get(id); return l ? c.eur(l) : 0; },
    history: { closed: history.closed, eligible: history.eligible },
    inflow_per_month: f
  }, params);
  return {
    exceptions: members.map((e) => e.id), n: members.length, spend_eur: spendOf(c, members),
    financing_cost_eur: members.reduce((t, e) => t + e.financing_cost_eur, 0),
    unpaid_cost_eur: members.filter((e) => e.unpaid).reduce((t, e) => t + e.financing_cost_eur, 0),
    routed_to: Object.fromEntries(Object.entries(routed).sort((a, b) => b[1] - a[1] || byId(a[0], b[0]))),
    history, inflow_per_month: f, suggestions: withAi.filter((e) => e.suggestion).length, fix
  };
}
