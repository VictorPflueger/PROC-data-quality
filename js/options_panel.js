// Options tab: the two or three fix paths the agent proposes for the verified case, next to doing
// nothing, each with the engine's figures (exceptions closed, spend covered, financing cost avoided now,
// exceptions prevented and future cost avoided a year, one-off effort and days, the closure rate
// projected after re-scan). The recommended card has the merlot frame and the one solid Approve;
// doing nothing asks for the reason the risk is accepted. Card states follow the option_decision
// events, so live and simulated runs behave alike. An approved fix reads "approved, re-scan pending",
// never closed: only a re-scan that no longer finds an exception closes it.

import { bus } from "./events.js";
import { h, clear } from "./dom.js";
import { icon } from "./icons.js";
import { euro, pct1, int, dec1, days } from "./format.js";
import { renderInline } from "./md.js";
import { aiLabel } from "./ai_label.js";

/** A yearly count: whole when it is one, else with one decimal (as the named figures show it). */
const perYear = (v) => (Number.isInteger(Math.round(Number(v) * 1e9) / 1e9) ? int(v) : dec1(v));

export function createOptionsPanel(panel, { onDecision, onCount } = {}) {
  let current = null;           // the options payload on screen
  const status = new Map();     // option id → "approved" | "rejected"
  let locked = false;           // an option (or doing nothing) was approved
  let ended = false;            // the run ended before an approval
  let refocus = false;          // a decision was made in the panel: keep focus in it after the rebuild
  let reason = "";              // the reason typed for accepting the risk

  function empty() {
    clear(panel);
    panel.appendChild(h("div", { class: "vc-empty empty" },
      h("strong", { class: "vc-empty__title" }, "No fix paths yet"),
      h("p", { class: "vc-empty__text" }, "When the agent has verified a case, its two or three fix paths appear here next to doing nothing, each with the exceptions it closes, the spend it covers, the financing cost it avoids and its effort. You decide.")));
  }

  function render() {
    clear(panel);
    if (!current) return empty();
    const c = current.case || {};
    const pending = !locked && !ended;
    const head = h("div", { class: "options-summary" },
      h("div", { class: "options-summary-head" },
        h("h3", {}, pending ? "Decide how to fix the case" : locked ? "Decision taken" : "Run ended before a decision"),
        aiLabel("options")),
      h("p", { class: "options-case" },
        h("strong", {}, `Case “${current.group}”: `),
        `${int(c.n)} exceptions on order lines worth ${euro(c.spend_eur)}`,
        c.E > 0 ? `, financing cost ${euro(c.E)} over the last 365 days (past: no fix path recovers it once paid)` : "",
        `. Measured closure rate ${current.measured_closure_rate === null || current.measured_closure_rate === undefined ? "—" : pct1(current.measured_closure_rate)}.`),
      h("p", { class: "options-note" }, "Titles, descriptions and risks are the agent's words; every figure comes from the deterministic rule engine. A projection is a what-if on a copy of the data after re-scan, never a closure."));
    const grid = h("div", { class: "options-grid" });
    for (const o of current.options || []) grid.appendChild(optionCard(o, c));
    grid.appendChild(nothingCard(current.nothing || {}, c));
    panel.append(h("div", { class: "options-layout" }, head, grid));
    if (refocus) {
      refocus = false;
      const next = panel.querySelector(".option-actions button:not([aria-disabled='true'])");
      const target = next || panel.querySelector(".option-status")?.closest(".option-card");
      if (target) {
        if (!next) target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: false });
      }
    }
  }

  function optionCard(o, c) {
    const f = o.figures || {};
    const st = status.get(o.id) || (locked ? "not_selected" : ended ? "expired" : "");
    const followUp = o.path === "B" || o.path === "D";
    const source = o.path === "C" || o.path === "D";
    return h("article", { class: "vc-card option-card", dataset: { recommended: String(!!o.recommended), status: st, kind: "option", path: o.path }, "aria-label": `Fix path ${o.path}: ${o.title}` },
      h("div", { class: "option-top" },
        h("span", { class: "option-letter", "aria-hidden": "true" }, o.path),
        h("h4", { class: "option-title" }, o.title),
        o.recommended ? h("span", { class: "vc-tag vc-tag--solid" }, "Recommended") : null),
      h("p", { class: "option-kind" }, f.title || ""),
      o.description ? renderInline(o.description, h("p", { class: "option-desc" })) : null,
      h("dl", { class: "option-figures" },
        h("dt", {}, followUp ? "Exceptions closed (projected)" : "Exceptions closed"), h("dd", { dataset: { figure: "closed" } }, `${int(f.closed)} of ${int(c.n)}`),
        h("dt", {}, "Spend covered"), h("dd", { dataset: { figure: "spend" } }, euro(f.spend_covered_eur)),
        h("dt", {}, "Financing cost avoided now"), h("dd", { dataset: { figure: "cost_now" } }, euro(f.avoided_now_eur)),
        h("dt", {}, "Exceptions prevented a year"), h("dd", { dataset: { figure: "prevented" } }, perYear(f.prevented_per_year)),
        h("dt", {}, "Future cost avoided a year"), h("dd", { dataset: { figure: "future" } }, euro(f.future_avoided_eur_per_year)),
        h("dt", {}, "One-off effort"), h("dd", { dataset: { figure: "effort" } }, euro(f.effort_eur)),
        h("dt", {}, "Days"), h("dd", { dataset: { figure: "days" } }, days(f.days)),
        source ? h("dt", {}, "Prevents after") : null, source ? h("dd", { dataset: { figure: "prevents_after" } }, days(f.prevents_after_days)) : null),
      followUp ? h("p", { class: "option-fig-note" }, "Closures projected from the case's 14-day closure history.") : null,
      f.projected_closure_rate !== null && f.projected_closure_rate !== undefined
        ? h("div", { class: "option-total", title: "The closure rate a re-scan would measure after this fix: a what-if on a copy of the data, never a closure" }, h("span", { class: "label" }, "Projected closure rate"), h("span", { class: "value vc-tabular", dataset: { figure: "projected" } }, pct1(f.projected_closure_rate)))
        : null,
      o.residual_risk ? h("p", { class: "option-risk" }, h("strong", {}, "Residual risk: "), o.residual_risk) : null,
      actionsFor(o, st));
  }

  function nothingCard(n, c) {
    const f = n.figures || {};
    const st = status.get("nothing") || (locked ? "not_selected" : ended ? "expired" : "");
    const input = h("textarea", { class: "vc-textarea option-reason", id: "nothing-reason", rows: "2", maxlength: "300", placeholder: "Why is the risk acceptable? The memo records it." }, reason);
    input.addEventListener("input", () => {
      reason = input.value;
      const btn = panel.querySelector('[data-action="accept"]');
      if (btn) btn.setAttribute("aria-disabled", String(reason.trim().length < 5));
    });
    return h("article", { class: "vc-card option-card", dataset: { kind: "baseline", status: st }, "aria-label": "Do nothing" },
      h("div", { class: "option-top" },
        h("span", { class: "option-letter", "aria-hidden": "true" }, "–"),
        h("h4", { class: "option-title" }, "Do nothing")),
      n.note ? renderInline(n.note, h("p", { class: "option-desc" })) : null,
      h("dl", { class: "option-figures" },
        h("dt", {}, "Exceptions closed"), h("dd", {}, `0 of ${int(c.n)}`),
        h("dt", {}, "Exceptions gained a year"), h("dd", { dataset: { figure: "gains" } }, `about ${perYear(f.gains_per_year)}`),
        h("dt", {}, "Their cost a year"), h("dd", { dataset: { figure: "gains_cost" } }, f.gains_cost_eur_per_year > 0 ? `about ${euro(f.gains_cost_eur_per_year)}` : euro(0)),
        h("dt", {}, "Financing cost, last 365 days"), h("dd", { dataset: { figure: "past" } }, euro(f.past_cost_eur)),
        h("dt", {}, "One-off effort"), h("dd", {}, euro(0))),
      h("p", { class: "option-fig-note" }, "The past financing cost is spent: no fix path recovers it once the lines are paid."),
      st ? null : h("div", { class: "vc-field option-reason-field" }, h("label", { class: "vc-label", for: "nothing-reason" }, "Reason for accepting the risk"), input),
      actionsFor({ id: "nothing", title: "Do nothing" }, st, true));
  }

  function actionsFor(o, st, isNothing = false) {
    if (st === "approved") return h("div", { class: "option-status" }, h("span", { class: "vc-tag vc-tag--success" }, icon("check", 20), isNothing ? "Risk accepted" : "Approved, re-scan pending"));
    if (st === "rejected") return h("div", { class: "option-status" }, h("span", { class: "vc-tag vc-tag--danger" }, icon("x", 20), "Rejected"));
    if (st === "not_selected") return h("div", { class: "option-status" }, h("span", { class: "vc-tag" }, "Not selected"));
    if (st === "expired") return h("div", { class: "option-status" }, h("span", { class: "vc-tag" }, "No decision: the run ended"));
    if (isNothing) {
      return h("div", { class: "option-actions" },
        h("button", { class: "vc-button vc-button--outline", type: "button", dataset: { action: "accept" }, "aria-disabled": String(reason.trim().length < 5),
          on: { click: (e) => { if (e.currentTarget.getAttribute("aria-disabled") !== "true") decide(o, "approved", reason.trim()); } } }, "Accept the risk"));
    }
    return h("div", { class: "option-actions" },
      // The recommended path's Approve is the one solid merlot button; the others are Vici's
      // secondary (soft merlot) buttons. Reject is a neutral decision, not an alarm.
      h("button", { class: `vc-button${o.recommended ? "" : " vc-button--secondary"}`, type: "button", dataset: { action: "approve" }, on: { click: () => decide(o, "approved") } }, icon("check", 18), "Approve"),
      h("button", { class: "vc-button vc-button--outline", type: "button", dataset: { action: "reject" }, on: { click: () => decide(o, "rejected") } }, "Reject"));
  }

  function decide(o, decision, note) {
    if (locked || !current) return;
    refocus = panel.contains(document.activeElement);
    // The decision names the set of options it was taken on, so a click on a set the agent has just
    // replaced is ignored by the agent instead of counting for the new one.
    onDecision?.({
      option_id: o.id, option_label: o.id === "nothing" ? "Do nothing (accept the risk)" : `Fix path ${o.id}: ${o.title}`,
      options_seq: current.options_seq ?? null, decision, ...(note ? { note } : {})
    });
  }

  bus.on("options", (ev) => {
    current = ev.payload;
    status.clear();
    locked = false;
    ended = false;
    reason = "";
    render();
    onCount?.(current.options?.length || 0, true);
  });

  bus.on("option_decision", (ev) => {
    const { option_id: id, decision, options_seq: seq } = ev.payload;
    if (!current || (seq !== undefined && seq !== (current.options_seq ?? null)) || locked) return;
    status.set(id, decision);
    if (decision === "approved") locked = true;
    render();
    onCount?.(current.options?.length || 0, !locked);
  });

  // An aborted or failed run cannot take a decision any more: say so instead of offering buttons.
  bus.on("run_end", () => {
    if (!current || locked) return;
    ended = true;
    render();
    onCount?.(current.options?.length || 0, false);
  });

  function reset() {
    current = null;
    status.clear();
    locked = false;
    ended = false;
    reason = "";
    empty();
    onCount?.(0, false);
  }

  empty();
  return { reset };
}
