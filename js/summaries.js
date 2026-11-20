// One-line summaries of tool results for the console, under the plain sentence of each call
// ("30 exceptions; clean spend 75.2%"). Figures come from the result itself, formatted for display.

import { euro, pct1, int, dec1, shareOrNone } from "./format.js";

const plural = (n, word, many = `${word}s`) => `${int(n)} ${n === 1 ? word : many}`;

/** The summary line of one tool result. */
export function summarizeToolResult(name, r) {
  if (!r) return "No result";
  if (r.error) return r.refused === "schema" ? "Input refused: it does not match the tool's schema" : r.refused === "figures" ? "Refused by the figure audit" : r.refused === "guard" ? "Refused by a guardrail" : "Error";
  switch (name) {
    case "erp_get_overview": return `${(r.data_products || []).length} data products, ${(r.rules || []).length} rules, ${(r.material_groups || []).length} material groups`;
    case "erp_query": return `${plural(r.total, "row")}${r.truncated ? `, first ${int(r.returned)} shown` : ""}`;
    case "erp_get_record": return `${r.product} ${r.id}`;
    case "dq_scan": return `${plural(r.exceptions, "exception")}; ${plural(r.reconciliation.new, "new entry", "new entries")}, ${int(r.reconciliation.closed)} closed by re-scan; clean spend ${shareOrNone(r.kpi.clean_share)}`;
    case "dq_group": {
      const top = r.groups[0];
      return top ? `${plural(r.base.exceptions, "exception")} in ${plural(r.groups_total, "group")}; "${top.group}" holds ${int(top.exceptions)} (${pct1(top.share)})` : "No exceptions to group";
    }
    case "dq_suggest": return `${int(r.with_suggestion)} of ${plural(r.exceptions, "exception")} with a suggestion${r.needs_ai.length ? `; ${int(r.needs_ai.length)} need an AI suggestion` : ""}`;
    case "dq_classify": return `${plural(r.accepted.length, "suggestion")} recorded for review${r.refused.length ? `, ${int(r.refused.length)} refused` : ""}`;
    case "dq_history": return `Closure rate ${shareOrNone(r.closure_rate.value)}; 14-day share ${shareOrNone(r.closure_14d.share)}; inflow ${dec1(r.inflow_per_month)} a month`;
    case "dq_fix_paths": {
      const ok = ["A", "B", "C", "D"].filter((p) => r.paths[p].applicable);
      return `${plural(r.case.n, "exception")}, spend ${euro(r.case.spend_eur)}; paths ${ok.join(", ")} applicable`;
    }
    case "ui_mark_board": return "Board updated";
    case "ui_request_review": return `${int(r.approved.length)} approved, ${int(r.rejected.length)} rejected`;
    case "ui_report_alert": return "Verified case shown";
    case "ui_propose_options": return `${plural(r.paths.length, "fix path")} on screen`;
    case "ui_await_decision": return r.decision === "approved" ? (r.path === "nothing" ? "Risk accepted" : `Path ${r.path} approved, re-scan pending`) : `Path ${r.path} rejected`;
    case "ui_draft_action": return "Draft queued; nothing is sent";
    case "ui_await_approvals": return `${int(r.approved)} approved, ${int(r.rejected)} rejected`;
    case "ui_final_report": return `Report published (${r.outcome.replace(/_/g, " ")})`;
    default: return "Done";
  }
}
