// Fix paths for a case (section 6.7 of the method): A mass correction, B owner follow-up, C mass
// correction and fix at source, D owner follow-up and fix at source, and doing nothing. Every figure
// comes from here, at full precision; the app rounds only for display.
//
// For a case with n exceptions, s of them with a deterministic (or approved AI) suggestion, a pooled
// 14-day history of c closed out of e eligible, an inflow of f a month and a financing cost over the
// last 365 days of E:
//   A  closes s; covers the spend of those s; avoids the cost of those s that are unpaid;
//      effort (setup + s × minutes per record / 60 / hours per day) × day rate; mass-change lead time.
//   B  closes floor(n × c / e) (0 without history); covers spend × closed / n; avoids the unpaid cost
//      × closed / n; effort preparation × day rate + n × owner minutes / 60 × day rate / hours; window.
//   C  as A, prevents 12 × f a year (future cost 12 × f × E / n a year), effort A + source-fix days ×
//      day rate, prevention after the source-fix lead time.  D  the same on top of B.
//   Doing nothing: the case gains 12 × f exceptions a year, costing about 12 × f × E / n a year.
// A and C are not applicable without suggestions. E is past: no fix path recovers it.

import { PARAMS } from "./params.js";

const PATHS = Object.freeze({
  A: { id: "A", title: "Mass correction", source: false, base: "mass" },
  B: { id: "B", title: "Owner follow-up", source: false, base: "followup" },
  C: { id: "C", title: "Mass correction and fix at source", source: true, base: "mass" },
  D: { id: "D", title: "Owner follow-up and fix at source", source: true, base: "followup" },
  nothing: { id: "nothing", title: "Do nothing", source: false, base: null }
});
export const PATH_TITLES = Object.freeze(Object.fromEntries(Object.entries(PATHS).map(([k, v]) => [k, v.title])));

/**
 * input: { exceptions: [{ id, lines: [line ids], financing_cost_eur, unpaid, suggestion }],
 *          lineValue: (lineId) → euros (or a Map), history: { closed, eligible }, inflow_per_month }
 * Returns { n, s, c, e, f, E, spend_eur, unpaid_cost_eur, paths: { A, B, C, D, nothing } }; a path that
 * is not applicable has applicable: false and null figures.
 */
export function fixPaths(input, params = PARAMS) {
  const p = params;
  const xs = input.exceptions || [];
  const value = typeof input.lineValue === "function" ? input.lineValue : (id) => input.lineValue?.get(id) ?? 0;
  const spendOf = (list) => {
    const ids = new Set(list.flatMap((x) => x.lines || []));
    let t = 0;
    for (const id of ids) t += value(id);
    return t;
  };
  const cost = (list) => list.reduce((t, x) => t + (Number(x.financing_cost_eur) || 0), 0);
  const n = xs.length;
  const withSuggestion = xs.filter((x) => !!x.suggestion);
  const s = withSuggestion.length;
  const c = Math.max(0, Number(input.history?.closed) || 0);
  const e = Math.max(0, Number(input.history?.eligible) || 0);
  const f = Math.max(0, Number(input.inflow_per_month) || 0);
  const spend = spendOf(xs);
  const E = cost(xs);
  const unpaidCost = cost(xs.filter((x) => x.unpaid));

  const prevented = 12 * f;
  const futureAvoided = n > 0 ? (12 * f * E) / n : 0;
  const sourceEffort = p.source_fix_days * p.day_rate_eur;

  const notApplicable = (id) => ({ id, title: PATHS[id].title, applicable: false, closed: null, spend_covered_eur: null, avoided_now_eur: null,
    prevented_per_year: null, future_avoided_eur_per_year: null, effort_eur: null, days: null, prevents_after_days: null });
  const mass = s === 0 ? null : {
    closed: s,
    spend_covered_eur: spendOf(withSuggestion),
    avoided_now_eur: cost(withSuggestion.filter((x) => x.unpaid)),
    effort_eur: (p.mass_setup_days + (s * p.mass_minutes_per_record) / 60 / p.hours_per_day) * p.day_rate_eur,
    days: p.mass_lead_days
  };
  // Integer arithmetic for B's closures: floor(n × c / e), 0 without history.
  const closedB = e > 0 ? Math.floor((n * c) / e) : 0;
  const followup = {
    closed: closedB,
    spend_covered_eur: n > 0 ? (spend * closedB) / n : 0,
    avoided_now_eur: n > 0 ? (unpaidCost * closedB) / n : 0,
    effort_eur: p.followup_prep_days * p.day_rate_eur + ((n * p.followup_owner_minutes) / 60) * (p.day_rate_eur / p.hours_per_day),
    days: p.followup_window_days
  };
  const build = (id) => {
    const def = PATHS[id];
    const base = def.base === "mass" ? mass : followup;
    if (!base) return notApplicable(id);
    return {
      id, title: def.title, applicable: true, closed: base.closed, spend_covered_eur: base.spend_covered_eur, avoided_now_eur: base.avoided_now_eur,
      prevented_per_year: def.source ? prevented : 0, future_avoided_eur_per_year: def.source ? futureAvoided : 0,
      effort_eur: base.effort_eur + (def.source ? sourceEffort : 0), days: base.days, prevents_after_days: def.source ? p.source_lead_days : null
    };
  };
  const nothing = {
    id: "nothing", title: PATHS.nothing.title, applicable: true, closed: 0, spend_covered_eur: 0, avoided_now_eur: 0, prevented_per_year: 0,
    future_avoided_eur_per_year: 0, effort_eur: 0, days: null, prevents_after_days: null,
    gains_per_year: prevented, gains_cost_eur_per_year: futureAvoided, past_cost_eur: E
  };
  return { n, s, c, e, f, E, spend_eur: spend, unpaid_cost_eur: unpaidCost, paths: { A: build("A"), B: build("B"), C: build("C"), D: build("D"), nothing } };
}
