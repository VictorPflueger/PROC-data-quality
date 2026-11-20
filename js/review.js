// The review of AI-suggested values (Your confirmation): a dialog through the shell's js/modal.js with
// each free-text line's short text, the material group the agent proposes, the words of the short text
// it rests on (marked in the text) and its confidence. The person approves or rejects each suggestion,
// or all of them, and confirms; only approved suggestions count as fixes, and none writes data. The
// dialog follows the run events, so live and simulated runs behave alike: it opens on
// confirmation_request and its confirmation goes out as confirmation_decision.

import { bus } from "./events.js";
import { h } from "./dom.js";
import { icon } from "./icons.js";
import { openModal } from "./modal.js";
import { aiLabel } from "./ai_label.js";
import { int } from "./format.js";

const CONFIDENCE = { high: "High", medium: "Medium", low: "Low" };

export function createReview({ onDecision } = {}) {
  let pending = null;   // { request, decisions: Map(line → "approved" | "rejected"), modal }

  bus.on("confirmation_request", (ev) => {
    pending = { request: ev.payload, decisions: new Map(), modal: null };
    open();
  });
  bus.on("confirmation_decision", (ev) => {
    if (pending && ev.payload.review_id === pending.request.review_id) close();
  });
  bus.on("run_end", () => close());

  function close() {
    const p = pending;
    pending = null;
    p?.modal?.close("done");
  }

  /** Opens the review of the pending request (again, when it was closed without a confirmation). */
  function open() {
    if (!pending || pending.modal) return;
    const p = pending;
    const items = p.request.items || [];
    const status = h("p", { class: "review-status", role: "status", "aria-live": "polite" });
    const confirmBtn = h("button", { class: "vc-button", type: "button", id: "btn-review-confirm" }, icon("check", 18), "Confirm review");
    const rows = items.map((it) => row(it));
    const tbody = h("tbody", {}, rows.map((r) => r.el));

    function refresh() {
      const approved = [...p.decisions.values()].filter((d) => d === "approved").length;
      const rejected = [...p.decisions.values()].filter((d) => d === "rejected").length;
      const open = items.length - approved - rejected;
      status.textContent = open
        ? `${int(approved)} approved, ${int(rejected)} rejected, ${int(open)} still to decide.`
        : `${int(approved)} approved, ${int(rejected)} rejected. Confirm to hand the review back to the agent.`;
      confirmBtn.setAttribute("aria-disabled", String(open > 0));
      for (const r of rows) r.sync();
    }

    function row(it) {
      const approveBtn = h("button", { class: "vc-button vc-button--secondary button-compact", type: "button", "aria-pressed": "false", dataset: { action: "approve" } }, icon("check", 16), "Approve");
      const rejectBtn = h("button", { class: "vc-button vc-button--outline button-compact", type: "button", "aria-pressed": "false", dataset: { action: "reject" } }, icon("x", 16), "Reject");
      const el = h("tr", { dataset: { line: it.line_id, decision: "" } },
        h("th", { scope: "row", class: "review-line" }, it.line_id),
        h("td", { class: "review-text" }, marked(it.short_text, it.words || [])),
        h("td", { class: "review-group" }, h("span", { class: "vc-tag vc-tag--feature review-code" }, it.group), h("span", { class: "review-group-name" }, it.group_name || "")),
        h("td", { class: "review-words" }, (it.words || []).map((w) => h("span", { class: "review-word" }, w))),
        h("td", { class: "review-confidence" }, h("span", { class: "vc-tag", dataset: { confidence: it.confidence } }, CONFIDENCE[it.confidence] || it.confidence)),
        h("td", { class: "review-actions" }, h("div", { class: "review-buttons", role: "group", "aria-label": `Decision on line ${it.line_id}` }, approveBtn, rejectBtn)));
      const set = (d) => { p.decisions.set(it.line_id, d); refresh(); };
      approveBtn.addEventListener("click", () => set("approved"));
      rejectBtn.addEventListener("click", () => set("rejected"));
      return {
        el,
        sync() {
          const d = p.decisions.get(it.line_id) || "";
          el.dataset.decision = d;
          approveBtn.setAttribute("aria-pressed", String(d === "approved"));
          rejectBtn.setAttribute("aria-pressed", String(d === "rejected"));
        }
      };
    }

    const all = (d) => { for (const it of items) p.decisions.set(it.line_id, d); refresh(); };
    confirmBtn.addEventListener("click", () => {
      if (confirmBtn.getAttribute("aria-disabled") === "true" || pending !== p) return;
      const decisions = items.map((it) => ({ line_id: it.line_id, decision: p.decisions.get(it.line_id) }));
      onDecision?.({ review_id: p.request.review_id, decisions });
    });

    p.modal = openModal({
      title: "Review the AI-suggested material groups",
      intro: "The agent proposes a material group for each free-text line, resting on words of its short text. Approved suggestions count as fixes and go into a mock change request; rejected ones count as no suggestion. Nothing is written to the data.",
      className: "review-modal",
      size: "wide",
      body: [
        p.request.note ? h("div", { class: "vc-alert vc-alert--feature review-note" }, icon("spark", 18), h("div", { class: "vc-alert__body" }, h("p", {}, p.request.note))) : null,
        h("div", { class: "review-bulk" },
          h("span", { class: "review-count" }, `${int(items.length)} AI-suggested ${items.length === 1 ? "value" : "values"}`),
          h("button", { class: "vc-button vc-button--secondary button-compact", type: "button", id: "btn-review-approve-all", on: { click: () => all("approved") } }, icon("check", 16), "Approve all"),
          h("button", { class: "vc-button vc-button--outline button-compact", type: "button", id: "btn-review-reject-all", on: { click: () => all("rejected") } }, icon("x", 16), "Reject all")),
        h("div", { class: "vc-table-wrap review-wrap" },
          h("table", { class: "vc-table vc-table--compact review-table" },
            h("caption", { class: "vc-visually-hidden" }, "AI-suggested material groups with the words they rest on and their confidence"),
            h("thead", {}, h("tr", {}, ["Line", "Short text", "Proposed group", "Words it rests on", "Confidence", "Your decision"].map((t) => h("th", { scope: "col" }, t)))),
            tbody))
      ],
      footer: [aiLabel("review"), status, confirmBtn],
      onClose: () => { if (pending === p) p.modal = null; }
    });
    refresh();
  }

  return { open, isPending: () => !!pending, reset: () => close() };
}

/** The short text with the words the suggestion rests on marked. */
function marked(text, words) {
  const s = String(text || "");
  const spans = [];
  const lower = s.toLowerCase();
  for (const w of words) {
    const at = lower.indexOf(String(w).toLowerCase());
    if (at >= 0 && !spans.some(([a, b]) => at < b && at + w.length > a)) spans.push([at, at + w.length]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  const out = [];
  let pos = 0;
  for (const [a, b] of spans) {
    if (a > pos) out.push(s.slice(pos, a));
    out.push(h("mark", { class: "review-mark" }, s.slice(a, b)));
    pos = b;
  }
  if (pos < s.length) out.push(s.slice(pos));
  return out;
}
