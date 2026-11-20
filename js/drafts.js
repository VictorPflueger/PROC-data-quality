// Drafts in the outbox. The agent writes the subject and the message; code adds what must be right
// whatever the model wrote: the change request's table of records, fields, old and new values (from
// the suggestions, never from the model), each owner's list of records and what is missing, and the
// two footers of the method. Nothing is ever sent.

import { DRAFT_KINDS } from "./schemas.js";

export { DRAFT_KINDS };
export const DRAFT_FOOTER = "Prepared with the Data Quality Agent. Requires human approval before sending.";
export const MOCK_LINE = "Mock change request for demonstration; no ERP system is connected.";
export const KIND_LABELS = Object.freeze({ change_request: "Mock change request", follow_up: "Owner follow-up", prevention: "Prevention request", risk_memo: "Risk memo" });

/** The draft kinds each fix path allows (section 7, rule 6). */
export const KINDS_BY_PATH = Object.freeze({
  A: ["change_request"], B: ["follow_up"], C: ["change_request", "prevention"], D: ["follow_up", "prevention"], nothing: ["risk_memo"]
});

const cell = (v) => (v === null || v === undefined || v === "" ? "(empty)" : String(v));

/** The change request's table: one row per record and field. rows: [{ record, field, old, new, source }] */
export function changeTable(rows) {
  const lines = ["Record | Field | Old value | New value | Source", "--- | --- | --- | --- | ---"];
  for (const r of rows) lines.push(`${r.record} | ${r.field} | ${cell(r.old)} | ${cell(r.new)} | ${r.source || ""}`);
  return lines.join("\n");
}

/** An owner's records and what is missing on each. rows: [{ record, rule, missing }] */
export function recordList(rows) {
  return ["Your records:", ...rows.map((r) => `- ${r.record} (${r.rule}): ${r.missing}`)].join("\n");
}

/** The body as it goes into the outbox: the agent's text, code's table or list, the footers. */
export function finalizeDraft(kind, text, { table = null, list = null, unchecked = null } = {}) {
  const parts = [String(text || "").trim()];
  if (table) parts.push(table);
  if (list) parts.push(list);
  if (unchecked && unchecked.length) parts.push(`Unchecked figures (no tool returned them): ${unchecked.join(", ")}. Check them before approving.`);
  if (kind === "change_request") parts.push(MOCK_LINE);
  parts.push(DRAFT_FOOTER);
  return parts.filter(Boolean).join("\n\n");
}
