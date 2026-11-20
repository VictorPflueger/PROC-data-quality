// Outbox tab: the drafts the approved fix path allows (mock change requests, owner follow-ups,
// prevention requests, the risk memo). Every item is a draft that needs its own approval; approval only
// changes its status here and marks the exceptions it covers that are routed to its recipient as routed
// in the log. Nothing is sent, and nothing is written to the data.

import { bus } from "./events.js";
import { h, clear } from "./dom.js";
import { icon } from "./icons.js";
import { aiLabel } from "./ai_label.js";
import { KIND_LABELS } from "./drafts.js";

const KIND_ICON = { change_request: "receipt", follow_up: "mail", prevention: "target", risk_memo: "memo" };

export function createOutbox(panel, { onDecision, onCount } = {}) {
  const actions = new Map(); // id → { draft, status: "pending" | "approved" | "rejected" | "expired" }
  let refocus = false;

  function counts() {
    const pending = [...actions.values()].filter((a) => a.status === "pending").length;
    onCount?.(actions.size, pending > 0);
  }

  function render() {
    // A rebuild must not strand the keyboard: focus that was in the panel stays in it (a draft that
    // arrives while the focus rests on the list would otherwise drop it to the page).
    if (panel.contains(document.activeElement)) refocus = true;
    clear(panel);
    const pending = [...actions.values()].filter((a) => a.status === "pending");
    panel.appendChild(h("div", { class: "outbox-head" },
      h("span", { class: "outbox-safety" }, icon("shield", 18), h("span", {}, h("strong", {}, "Draft. Nothing is sent."), " The Data Quality Agent has no e-mail or ERP connection; approving marks a draft as cleared and the exceptions it covers that are routed to its recipient as routed.")),
      pending.length > 1
        ? h("button", { class: "vc-button vc-button--secondary button-compact", type: "button", dataset: { action: "approve-all" }, on: { click: () => pending.forEach((a) => decide(a.draft, "approved")) } }, icon("check", 16), `Approve all ${pending.length} pending`)
        : null));

    if (!actions.size) {
      panel.appendChild(h("div", { class: "vc-empty empty" },
        h("strong", { class: "vc-empty__title" }, "Nothing drafted yet"),
        h("p", { class: "vc-empty__text" }, "After your decision, the agent drafts what the fix path allows: the follow-ups to the people each exception is routed to, a mock change request, a prevention request, or a memo of the accepted risk. Each draft waits here for your approval.")));
      return;
    }

    const list = h("div", { class: "outbox-list" });
    for (const { draft, status } of actions.values()) list.appendChild(card(draft, status));
    panel.appendChild(list);
    if (refocus) {
      refocus = false;
      const next = panel.querySelector(".action-card[data-status=\"pending\"] [data-action=\"approve\"]");
      if (next) next.focus();
      else { list.setAttribute("tabindex", "-1"); list.focus(); }
    }
  }

  function card(d, status) {
    const label = KIND_LABELS[d.kind] || "Draft";
    // The status is a Vici tag: solid merlot while it waits for you (as the rail's turn), merlot's tint
    // once you approved it (your decision; nothing was sent), plain otherwise.
    const tone = status === "pending" ? "vc-tag--solid" : status === "approved" ? "vc-tag--accent" : "";
    const statusText = status === "pending" ? "Pending approval"
      : status === "approved" ? "Approved — draft, not sent"
        : status === "expired" ? "Not decided: the run ended" : "Rejected";
    const bodyText = String(d.body || "");
    const clipped = bodyText.split("\n").length > 8 || bodyText.length > 560;
    const el = h("article", { class: "vc-card action-card", dataset: { status, kind: d.kind, expanded: "false", clipped: String(clipped) } },
      h("span", { class: "vc-cell action-type", "aria-hidden": "true" }, icon(KIND_ICON[d.kind] || "mail", 20)),
      h("div", {},
        h("div", { class: "action-meta" },
          h("span", {}, label),
          h("span", {}, `To: ${d.recipient}`),
          h("span", { class: ["vc-tag", tone, "action-status"] }, statusText),
          Array.isArray(d.unchecked) && d.unchecked.length
            ? h("span", { class: "vc-tag vc-tag--warning", title: `Figures no tool returned: ${d.unchecked.join(", ")}` }, "Unchecked")
            : null,
          aiLabel("draft")),
        h("div", { class: "action-subject" }, d.subject),
        h("pre", { class: "action-body" }, bodyText),
        clipped
          ? h("button", { class: "vc-button vc-button--ghost button-compact action-more", type: "button", on: { click: (e) => {
            const open = el.dataset.expanded !== "true";
            el.dataset.expanded = String(open);
            e.currentTarget.textContent = open ? "Show less" : "Show full draft";
          } } }, "Show full draft")
          : null),
      status === "pending"
        ? h("div", { class: "action-buttons" },
          h("button", { class: "vc-button", type: "button", dataset: { action: "approve" }, on: { click: () => decide(d, "approved") } }, icon("check", 18), "Approve"),
          h("button", { class: "vc-button vc-button--outline", type: "button", dataset: { action: "reject" }, on: { click: () => decide(d, "rejected") } }, "Reject"))
        : h("div", { class: "action-buttons" }));
    return el;
  }

  function decide(d, decision) {
    const a = actions.get(d.action_id);
    if (!a || a.status !== "pending") return;
    refocus = panel.contains(document.activeElement);
    onDecision?.({ action_id: d.action_id, decision, label: `${(KIND_LABELS[d.kind] || "draft").toLowerCase()} “${d.subject}”` });
  }

  bus.on("action_draft", (ev) => {
    actions.set(ev.payload.action_id, { draft: ev.payload, status: "pending" });
    render();
    counts();
  });

  bus.on("action_decision", (ev) => {
    const a = actions.get(ev.payload.action_id);
    if (!a || a.status !== "pending") return;
    a.status = ev.payload.decision;
    render();
    counts();
  });

  // Drafts still pending when a run ends (abort, error) can no longer be decided; nothing was sent.
  bus.on("run_end", () => {
    let changed = false;
    for (const a of actions.values()) if (a.status === "pending") { a.status = "expired"; changed = true; }
    if (changed) { render(); counts(); }
  });

  function reset() {
    actions.clear();
    render();
    counts();
  }

  render();
  return { reset, pendingFor: (person) => [...actions.values()].filter((a) => a.status === "pending" && a.draft.recipient_id === person).length };
}
