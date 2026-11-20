// Named figures. Every figure an engine tool returns carries a stable name ("scan.clean_share",
// "case.spend", "path.A.cost_now"), its type for the figure audit (amount, share, count, days) and
// its display string. Simulation scripts write {{name}} where a figure goes, and the player fills it
// from the engine at playback, so no authored text ever types a number the engine computes. The same
// list feeds the figure audit's known figures, so a placeholder and an audited figure cannot drift.
// Shared by the toolbox (js/tools.js), the player (js/simulation.js) and the script checker.

import { euro, pct1, int, dec1, days as daysText, shareOrNone } from "./format.js";

const show = { amount: euro, share: pct1, count: int, days: daysText };
const F = (name, type, value, extra = {}) => ({ name, type, value, display: value === null || value === undefined ? "—" : show[type](value), ...extra });
const T = (name, text) => ({ name, type: "text", value: text, display: String(text ?? "—") });
/** A yearly count: whole when it is one ("108"), else with one decimal ("68.4"). */
const wholeOr1 = (v) => (Number.isInteger(Math.round(Number(v) * 1e9) / 1e9) ? int(v) : dec1(v));

/** Named figures of one engine tool result (an empty list for a tool without figures or an error). */
export function figuresOf(tool, r) {
  if (!r || r.error) return [];
  const out = [];
  switch (tool) {
    case "dq_scan": {
      out.push(T("scan.id", r.scan_id), F("scan.exceptions", "count", r.exceptions), F("scan.people", "count", r.routed_to.length),
        F("scan.high", "count", r.by_severity.high), F("scan.medium", "count", r.by_severity.medium), F("scan.low", "count", r.by_severity.low),
        F("scan.spend_affected", "amount", r.spend_affected_eur), F("scan.financing", "amount", r.financing_cost_eur), F("scan.financing_unpaid", "amount", r.financing_cost_unpaid_eur),
        F("scan.new", "count", r.reconciliation.new), F("scan.closed", "count", r.reconciliation.closed), F("scan.still", "count", r.reconciliation.still), F("scan.reopened", "count", r.reconciliation.reopened),
        F("scan.closure_rate", "share", r.kpi.closure_rate), F("scan.clean_share", "share", r.kpi.clean_share), F("scan.clean_spend", "amount", r.kpi.clean_spend_eur),
        F("scan.spend_window", "amount", r.kpi.spend_window_eur), F("scan.open", "count", r.kpi.open_exceptions), F("scan.open_spend", "amount", r.kpi.open_spend_eur));
      for (const [rule, n] of Object.entries(r.by_rule)) out.push(F(`scan.rule.${rule}`, "count", n));
      for (const [p, n] of Object.entries(r.by_product)) out.push(F(`scan.product.${p}`, "count", n));
      r.routed_to.forEach((p, i) => out.push(F(`scan.person.${i + 1}.count`, "count", p.count), T(`scan.person.${i + 1}`, p.label)));
      r.top.forEach((x, i) => out.push(T(`scan.top.${i + 1}`, x.id), F(`scan.top.${i + 1}.spend`, "amount", x.spend_eur)));
      break;
    }
    case "dq_group": {
      out.push(T("grp.id", r.grouping_id), F("grp.base", "count", r.base.exceptions), F("grp.base_spend", "amount", r.base.spend_eur), F("grp.groups", "count", r.groups_total));
      r.groups.forEach((g, i) => {
        const k = i === 0 ? "grp.top" : `grp.${i + 1}`;
        out.push(T(k, g.group), F(`${k}.exceptions`, "count", g.exceptions), F(`${k}.share`, "share", g.share), F(`${k}.spend`, "amount", g.spend_eur));
        g.sample_records.forEach((rec, j) => out.push(T(`${k}.record.${j + 1}`, rec)));
      });
      break;
    }
    case "dq_suggest":
      out.push(F("sug.with", "count", r.with_suggestion), F("sug.without", "count", r.without_suggestion), F("sug.ai", "count", r.needs_ai.length), F("sug.exceptions", "count", r.exceptions));
      r.needs_ai.forEach((id, i) => out.push(T(`sug.ai.${i + 1}`, id)));
      break;
    case "dq_classify":
      out.push(F("cls.accepted", "count", r.accepted.length), F("cls.refused", "count", r.refused.length), F("cls.pending", "count", r.pending_review));
      break;
    case "ui_request_review":
      out.push(F("rev.approved", "count", r.approved.length), F("rev.rejected", "count", r.rejected.length));
      break;
    case "ui_await_approvals":
      out.push(F("actions.approved", "count", r.approved), F("actions.rejected", "count", r.rejected), F("actions.total", "count", r.approved + r.rejected));
      break;
    case "dq_history": {
      out.push(F("hist.closure_rate", "share", r.closure_rate.value), F("hist.closed", "count", r.closure_rate.closed), F("hist.eligible", "count", r.closure_rate.eligible),
        F("hist.c", "count", r.closure_14d.closed), F("hist.e", "count", r.closure_14d.eligible), F("hist.inflow", "count", r.inflow_per_month, { display: dec1(r.inflow_per_month) }));
      out.push(r.closure_14d.share === null ? T("hist.share14", "no history") : F("hist.share14", "share", r.closure_14d.share));
      for (const w of r.cohorts) out.push(F(`hist.week.${w.week}.detected`, "count", w.detected), F(`hist.week.${w.week}.closed`, "count", w.closed), F(`hist.week.${w.week}.open`, "count", w.open));
      break;
    }
    case "dq_fix_paths": {
      const c = r.case;
      out.push(T("fp.id", r.fix_paths_id), F("case.n", "count", c.n), F("case.s", "count", c.s), F("case.c", "count", c.c), F("case.e", "count", c.e),
        F("case.f", "count", c.f, { display: dec1(c.f) }), F("case.financing", "amount", c.E), F("case.spend", "amount", c.spend_eur), F("case.unpaid", "amount", c.unpaid_cost_eur),
        F("case.people", "count", c.routed_to.length), c.share14 === null ? T("case.share14", shareOrNone(null)) : F("case.share14", "share", c.share14));
      c.routed_to.forEach((p, i) => out.push(T(`case.person.${i + 1}`, p.label), F(`case.person.${i + 1}.count`, "count", p.count)));
      for (const id of ["A", "B", "C", "D"]) {
        const p = r.paths[id];
        out.push(T(`path.${id}.title`, p.title), T(`path.${id}.applicable`, p.applicable ? "yes" : "not applicable"));
        if (!p.applicable) continue;
        out.push(F(`path.${id}.closed`, "count", p.closed), F(`path.${id}.spend`, "amount", p.spend_covered_eur), F(`path.${id}.cost_now`, "amount", p.avoided_now_eur),
          F(`path.${id}.prevented`, "count", p.prevented_per_year, { display: wholeOr1(p.prevented_per_year) }), F(`path.${id}.future`, "amount", p.future_avoided_eur_per_year), F(`path.${id}.effort`, "amount", p.effort_eur),
          F(`path.${id}.days`, "days", p.days));
        if (p.prevents_after_days !== null) out.push(F(`path.${id}.prevents_after`, "days", p.prevents_after_days));
        if (p.projected_closure_rate !== null && p.projected_closure_rate !== undefined) out.push(F(`path.${id}.projected`, "share", p.projected_closure_rate, { projection: true }));
      }
      const n = r.paths.nothing;
      out.push(F("path.nothing.gains", "count", n.gains_per_year, { display: wholeOr1(n.gains_per_year) }), F("path.nothing.cost", "amount", n.gains_cost_eur_per_year), F("path.nothing.past", "amount", n.past_cost_eur));
      out.push(F("kpi.measured", "share", r.measured_closure_rate));
      break;
    }
    default:
      break;
  }
  return out;
}

/** The display strings of named figures, as template variables. */
export function varsOf(figures) {
  return Object.fromEntries(figures.map((f) => [f.name, f.display]));
}

const PLACEHOLDER = /\{\{\s*([^}]+?)\s*\}\}/g;

/** Replaces {{key}} with vars[key]; an unknown key stays as it is (the script checker reports it). */
export function fillTemplate(vars, text) {
  return String(text ?? "").replace(PLACEHOLDER, (m, key) => (key in vars ? vars[key] : m));
}

/** Fills every string inside a value (objects and lists included). */
export function fillDeep(vars, value) {
  if (typeof value === "string") return fillTemplate(vars, value);
  if (Array.isArray(value)) return value.map((x) => fillDeep(vars, x));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, fillDeep(vars, x)]));
  return value;
}

/** Placeholder keys in a text (or any value) that `vars` cannot resolve. */
export function unresolvedKeys(vars, value) {
  const out = [];
  const walk = (v) => {
    if (typeof v === "string") { for (const m of v.matchAll(PLACEHOLDER)) if (!(m[1] in vars)) out.push(m[1]); }
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(value);
  return out;
}
