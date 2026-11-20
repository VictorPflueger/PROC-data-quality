// The data-quality board, version 0.1: the fifteen rules by data product as the method defines them,
// and the eight weekly closure cohorts of the exception log, with their numbers in a table. The rules
// stay neutral until a run scans; the honeycomb with each rule's state, the people view and the
// cohort chart arrive with the agent runs in version 0.2.

import { h, clear } from "./dom.js";
import { RULES, PRODUCTS } from "./rules.js";
import { int, pct1, dayLabel } from "./format.js";
import { appToday } from "./clock.js";

const SEVERITY_WORD = { high: "High", medium: "Medium", low: "Low" };

export function createBoard(root) {
  const caption = h("div", { class: "board-caption" },
    h("div", { class: "cap-line" }, h("strong", {}, "Data-quality board")),
    h("span", { class: "cap-sub", id: "board-sub" }, ""));
  const body = h("div", { class: "board-body" });
  root.append(caption, body);

  // The rules, grouped by the data product their record belongs to.
  const rulesCard = h("section", { class: "board-card", "aria-labelledby": "board-rules-title" },
    h("div", { class: "board-card-head" },
      h("h2", { id: "board-rules-title" }, "Rules by data product"),
      h("p", { class: "board-card-note" }, "Neutral until a run scans the data. Accuracy is left out on purpose: whether a value matches reality needs an outside check.")));
  for (const p of PRODUCTS) {
    const rules = RULES.filter((r) => r.product === p.id);
    rulesCard.appendChild(h("div", { class: "rule-group", dataset: { product: p.id } },
      h("h3", { class: "rule-group-title" }, p.label, h("span", { class: "rule-group-source" }, `${rules.length} ${rules.length === 1 ? "rule" : "rules"} · typical source ${p.source}`)),
      h("ul", { class: "rule-list" }, rules.map((r) => h("li", { class: "rule-item", dataset: { rule: r.id, state: "neutral" }, title: r.fires },
        h("span", { class: "rule-hex", "aria-hidden": "true" }, r.id.slice(3)),
        h("span", { class: "rule-text" },
          h("span", { class: "rule-name" }, h("span", { class: "rule-id" }, r.id), " ", r.name),
          h("span", { class: "rule-meta" }, `${r.dimension} · ${SEVERITY_WORD[r.severity]} severity · responsible: ${r.responsible}`)))))));
  }

  // The weekly cohorts: week 1 is days -20 to -14, week 8 days -69 to -63.
  const tbody = h("tbody");
  const tfoot = h("tfoot");
  const cohortCard = h("section", { class: "board-card", "aria-labelledby": "board-cohorts-title" },
    h("div", { class: "board-card-head" },
      h("h2", { id: "board-cohorts-title" }, "Weekly cohorts"),
      h("p", { class: "board-card-note" }, "Exceptions by the week they were first detected, each old enough to have had its 14-day follow-up window. Only a re-scan that no longer finds an exception closes it.")),
    h("div", { class: "vc-table-wrap cohort-wrap" },
      h("table", { class: "vc-table vc-table--compact cohort-table", id: "cohort-table" },
        h("caption", { class: "vc-visually-hidden" }, "Exceptions detected, closed, still open and dismissed per week of detection, from the exception log"),
        h("thead", {}, h("tr", {}, ["Week", "Detected between", "Detected", "Closed", "Still open", "Dismissed", "Closed share"].map((t, i) => h("th", { scope: "col", class: i >= 2 ? "num" : "" }, t)))),
        tbody, tfoot)));
  body.append(rulesCard, cohortCard);

  /** Shows the cohorts of the log ([{ week, from, to, detected, closed, open, dismissed, share }]) and the cohort's rate. */
  function showCohorts(weeks, rate) {
    clear(tbody);
    clear(tfoot);
    const today = appToday();
    for (const w of weeks) {
      tbody.appendChild(h("tr", { dataset: { week: String(w.week) } },
        h("th", { scope: "row" }, `Week ${w.week}`),
        h("td", {}, `${dayLabel(w.from, today)} – ${dayLabel(w.to, today)}`),
        h("td", { class: "num" }, int(w.detected)), h("td", { class: "num" }, int(w.closed)), h("td", { class: "num" }, int(w.open)),
        h("td", { class: "num" }, int(w.dismissed)), h("td", { class: "num" }, w.share === null ? "—" : pct1(w.share))));
    }
    const sum = (k) => weeks.reduce((t, w) => t + w[k], 0);
    tfoot.appendChild(h("tr", {},
      h("th", { scope: "row" }, "All eight"), h("td", {}, "14 to 69 days ago"),
      h("td", { class: "num" }, int(sum("detected"))), h("td", { class: "num" }, int(sum("closed"))), h("td", { class: "num" }, int(sum("open"))),
      h("td", { class: "num" }, int(sum("dismissed"))), h("td", { class: "num", id: "cohort-rate" }, rate === null ? "—" : pct1(rate))));
  }

  /** The caption's second line: what the board shows and as of when. */
  function setAsOf(text) {
    caption.querySelector("#board-sub").textContent = text;
  }

  return { showCohorts, setAsOf, el: root };
}
