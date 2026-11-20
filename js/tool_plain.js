// What a tool call does, in one plain sentence for the console ("Reads order line 4500101060/10 and
// its supplier, buyer and contract"). The tool's name and input stay one click away; this line is for
// the audience, written by code, never by the model. Pure, so the tests can check it in Node.

import { GROUP_KEYS } from "./engine.js";

const KEY_WORDS = { plant: "plant", company_code: "company code", supplier: "supplier", channel: "channel", buyer: "buyer", requester: "requester", created_by: "creator", material_group: "material group", onboarding_channel: "onboarding channel", week_detected: "week detected" };
const PRODUCT_WORDS = { po_line: "order lines", contract: "contracts", supplier: "suppliers", material: "materials", user_org: "users", exception_log: "the exception log" };
const ONE = { po_line: "order line", contract: "contract", supplier: "supplier", material: "material", user_org: "user", exception_log: "log entry" };

const list = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
function filterText(f) {
  const parts = (Array.isArray(f) ? f : []).filter((x) => x && GROUP_KEYS.includes(x.key) && Array.isArray(x.values)).map((x) => `${KEY_WORDS[x.key]} ${x.values.join(" or ")}`);
  return parts.length ? ` at ${list(parts)}` : "";
}
const rules = (r) => (r && r.length ? (r.length > 4 ? `${r.length} rules` : list(r)) : "every rule");

/** The sentence for one tool call, or null when the tool has none. */
export function toolPlain(name, input = {}) {
  const i = input && typeof input === "object" ? input : {};
  switch (name) {
    case "erp_get_overview": return "Reads the company, the data products, the rule catalogue and the parameters";
    case "erp_query": return `Looks up ${PRODUCT_WORDS[i.product] || "records"}${(i.filters || []).length ? " with filters" : ""}`;
    case "erp_get_record": return `Reads ${ONE[i.product] || "record"} ${i.id || ""}${i.product === "po_line" ? " with its supplier, buyer and contract" : ""}`.trim();
    case "dq_scan": return `Runs ${rules(i.rules)} over the data${filterText(i.filters)} and reconciles with the exception log`;
    case "dq_group": return `Groups the ${rules(i.rules)} exceptions by ${list((i.by || []).map((k) => KEY_WORDS[k] || k))}${filterText(i.filters)}`;
    case "dq_suggest": return `Looks up the deterministic suggestion for each exception of the case "${i.group || ""}"`;
    case "dq_classify": return `Proposes material groups for ${(i.items || []).length} free-text line${(i.items || []).length === 1 ? "" : "s"} (AI-suggested, for review)`;
    case "dq_history": return i.grouping ? `Reads the history of the case "${i.group || ""}" from the exception log` : `Reads the closure history of ${rules(i.rules)} from the exception log`;
    case "dq_fix_paths": return `Costs the fix paths for the case "${i.group || ""}" with the engine`;
    case "ui_mark_board": return "Highlights what it reads on the board";
    case "ui_request_review": return `Asks you to review ${(i.line_ids || []).length} AI-suggested material group${(i.line_ids || []).length === 1 ? "" : "s"}`;
    case "ui_report_alert": return "Shows the verified case";
    case "ui_propose_options": return `Shows ${(i.options || []).length} fix paths and doing nothing, for your decision`;
    case "ui_await_decision": return "Waits for your decision";
    case "ui_draft_action": return `Drafts ${({ change_request: "a mock change request", follow_up: "a follow-up", prevention: "a prevention request", risk_memo: "a risk memo" })[i.kind] || "an action"} for the outbox`;
    case "ui_await_approvals": return "Waits for your approval of the drafts";
    case "ui_final_report": return "Publishes the report";
    default: return null;
  }
}
