// The Method dialog, opened from the control bar: the fifteen rules with their dimension, severity,
// responsible person and deterministic suggestion; why accuracy is left out; the definitions behind
// the figures with their assumptions; the parameters, which apply to Live runs and are logged when
// changed (Simulation keeps the defaults, so the scripted runs stay valid; locked while a run is in
// progress); and the production path.

import { h, setDisabled, isDisabled } from "./dom.js";
import { icon } from "./icons.js";
import { openModal } from "./modal.js";
import { RULES, PRODUCTS, RULE_SET_VERSION } from "./rules.js";
import { PARAMS, PARAM_LABELS } from "./params.js";
import { PARAM_LIMITS, FIXED_PARAMS, liveParams, setParams, resetParams, paramChanges } from "./settings.js";
import { productionPath } from "./intro.js";
import { euro, pct1, timeOfDay } from "./format.js";

const SEVERITY = { high: "High", medium: "Medium", low: "Low" };
const LOCKED = "Locked while a run is in progress: change the parameters before the next Live run.";

/** A parameter's value as the page writes it: "€1,200", "6.0% a year", "14 days". */
export function paramText(name, v) {
  if (name === "day_rate_eur") return euro(v);
  if (name === "cost_of_capital") return `${pct1(v)} a year`;
  return `${String(v)} ${PARAM_LABELS[name]?.[1] || ""}`.trim();
}

// The cost of capital is a share; its field takes per cent.
const toField = (name, v) => String(name === "cost_of_capital" ? Math.round(v * 1e8) / 1e6 : v);
const fromField = (name, text) => {
  if (String(text).trim() === "") return "";
  const n = Number(text);
  return name === "cost_of_capital" ? Math.round((n / 100) * 1e12) / 1e12 : n;
};

/** Opens the dialog. running: a run is in progress, so the parameters are locked. Returns { el, close }. */
export function openMethod({ running = false } = {}) {
  const productOf = (r) => PRODUCTS.find((p) => p.id === r.product)?.label || r.product;
  const rules = h("table", { class: "vc-table vc-table--compact method-rules", id: "method-rules" },
    h("caption", { class: "vc-visually-hidden" }, "The fifteen rules: what each checks, its dimension and severity, who is responsible and what it suggests"),
    h("thead", {}, h("tr", {}, ["Rule", "Dimension", "Severity", "Responsible", "Deterministic suggestion"].map((t) => h("th", { scope: "col" }, t)))),
    h("tbody", {}, RULES.map((r) => h("tr", { dataset: { rule: r.id } },
      h("th", { scope: "row", class: "method-rule" },
        h("span", { class: "method-rule-name" }, h("span", { class: "method-rule-id" }, r.id), " ", r.name),
        h("span", { class: "method-rule-fires" }, `${productOf(r)}, one per ${r.record}. Fires when: ${r.fires.charAt(0).toLowerCase()}${r.fires.slice(1)}`)),
      h("td", {}, r.dimension),
      h("td", {}, SEVERITY[r.severity]),
      h("td", {}, cap(r.responsible)),
      h("td", { class: r.suggestion ? "" : "method-none" }, r.suggestion || "None")))));

  const definitions = h("dl", { class: "method-defs", id: "method-defs" },
    def("Spend affected", "What an exception touches, in euros, over the last 365 days: its own line for a line rule; the supplier's lines in that company code (DQ-09); all the supplier's lines (DQ-10, DQ-11); the lines of both suppliers of a pair (DQ-12); the material's lines (DQ-13); the lines that reference the contract (DQ-14). A case or a tile counts each line once, however many exceptions touch it, so spend is never added up across exceptions."),
    def("Clean spend", "The value of the lines that carry no open, routed or accepted exception, neither on the line nor on its supplier (either supplier of a duplicate pair, and DQ-09 in the line's company code), its material or its contract. Its share divides it by all spend in the window; the rest is spend with an open exception."),
    def("Closure rate", "Takes the exceptions first detected 14 to 69 days ago, eight weeks of detections that have each had their 14-day follow-up window, and divides those closed by those not dismissed; an accepted exception counts as open. Newer detections are not in it yet, so a scan that finds new exceptions cannot lower it by itself. Only a re-scan that no longer finds an exception closes it: an approved fix reads \"approved, re-scan pending\" and shows its effect as a projection after re-scan, worked out on a copy of the data with the approved changes applied."),
    def("Weekly cohorts", "The same exceptions by the week they were first detected: week 1 holds days −20 to −14, week 2 days −27 to −21, and so on to week 8, days −69 to −63. Each week shows how many were detected, closed and are still open."),
    def("History behind the fix paths", "Read from the exception log as it stood before the run's scan. A rule's 14-day closure share: of its entries routed at least 14 days ago and not dismissed, how many were closed within 14 days of their routing (no history when there are none); a case pools its rules' counts. Monthly inflow: the entries detected in the last 90 days and not dismissed, divided by three; for a case, only those whose records fall in its root-cause group."),
    def("Financing cost of paying early", "The only euro effect the rules carry, and a cost, never a saving: only DQ-06 and DQ-07 have one. Per line, once: for DQ-07, value × (agreed days − ordered days) / 365 × cost of capital; for DQ-06, value × agreed days / 365 × cost of capital. A line ordered fewer days ago than its own terms is unpaid: correcting it avoids its cost, while correcting a paid line recovers nothing. Summed over the window, the cost is also the yearly run rate if nothing changes."),
    def("Routing", "Each exception goes to its responsible person when that person is active today, otherwise to their manager if active, otherwise to the procurement lead."),
    def("Fix paths", "A mass correction applies the suggested values; an owner follow-up asks the people the exceptions are routed to; either can add a fix at source, which changes what creates the errors. Their effort, lead times and prevention come from the parameters below, next to what doing nothing costs."),
    def("Assumptions", "Invoices are paid on the order's payment terms. An order without terms counts as due on receipt. One exchange rate per currency covers the whole window (Diagnostics shows it with its source and date). The cost of capital and every effort and lead-time figure are the parameters below. The page labels each as an assumption where it uses it."));

  // ---- the parameters: for Live runs, logged, locked while a run is in progress -------------------
  const inputs = new Map();
  const status = h("p", { class: "vc-help method-param-status", id: "method-param-status", role: "status", "aria-live": "polite" });
  const rows = Object.entries(PARAMS).map(([k, def0]) => {
    const fixed = FIXED_PARAMS.includes(k);
    const pct = k === "cost_of_capital";
    const unit = pct ? "% a year" : PARAM_LABELS[k][1];
    const lim = PARAM_LIMITS[k];
    const input = fixed ? null : h("input", {
      class: "vc-input method-param-input", type: "number", id: `param-${k}`, name: k, inputmode: "decimal",
      min: toField(k, lim.min), max: toField(k, lim.max), step: toField(k, lim.step),
      "aria-label": `${PARAM_LABELS[k][0]}, in ${unit}`, "aria-describedby": `param-${k}-default`,
      readonly: running
    });
    if (input) inputs.set(k, input);
    return h("tr", { dataset: { param: k } },
      h("th", { scope: "row" }, PARAM_LABELS[k][0], h("span", { class: "vc-tag method-changed", hidden: true }, "Changed")),
      h("td", { class: "method-param-value" }, fixed
        ? h("span", {}, paramText(k, def0), h("span", { class: "method-note" }, " (fixed: the data covers 365 days)"))
        : h("div", { class: "vc-input-group method-param-field" }, input, h("span", { class: "vc-input-group__addon", "aria-hidden": "true" }, unit))),
      h("td", { class: "method-param-default", id: `param-${k}-default` }, `Default ${paramText(k, def0)}`));
  });
  const fill = () => {
    const now = liveParams();
    for (const [k, input] of inputs) input.value = toField(k, now[k]);
    for (const tr of rows) {
      const changed = now[tr.dataset.param] !== PARAMS[tr.dataset.param];
      tr.dataset.changed = String(changed);
      tr.querySelector(".method-changed").hidden = !changed;
    }
  };
  fill();

  const applyBtn = h("button", { class: "vc-button", type: "button", id: "btn-params-apply" }, icon("check", 18), "Apply to Live runs");
  const resetBtn = h("button", { class: "vc-button vc-button--outline", type: "button", id: "btn-params-reset" }, icon("reset", 18), "Back to the defaults");
  setDisabled(applyBtn, running, LOCKED);
  setDisabled(resetBtn, running, LOCKED);
  const log = h("ul", { class: "method-param-log", id: "method-param-log" });
  const renderLog = () => {
    const list = paramChanges();
    log.replaceChildren(...(list.length
      ? list.slice().reverse().map((c) => h("li", {}, h("span", { class: "method-log-time vc-tabular" }, timeOfDay(c.ts)), ` ${c.label}: ${paramText(c.name, c.from)} → ${paramText(c.name, c.to)}`))
      : [h("li", { class: "method-note" }, "No change in this browser tab: Live runs use the defaults.")]));
  };
  renderLog();
  const say = (tone, text) => {
    status.className = `vc-help ${tone ? `vc-help--${tone}` : ""} method-param-status`;
    status.textContent = text;
  };

  applyBtn.addEventListener("click", () => {
    if (isDisabled(applyBtn)) return;
    const patch = {};
    for (const [k, input] of inputs) patch[k] = fromField(k, input.value);
    const r = setParams(patch);
    if (!r.ok) { say("error", `Not applied: ${r.errors.join("; ")}.`); return; }
    fill();
    renderLog();
    say("success", r.changed.length
      ? `Applied and logged: ${r.changed.length} ${r.changed.length === 1 ? "parameter applies" : "parameters apply"} from the next Live run on.`
      : "Nothing changed.");
  });
  resetBtn.addEventListener("click", () => {
    if (isDisabled(resetBtn)) return;
    const r = resetParams();
    fill();
    renderLog();
    say("success", r.changed.length ? "Back to the defaults, and logged." : "The defaults are already in effect.");
  });
  if (running) say("", LOCKED);

  return openModal({
    title: "Method",
    intro: `How the rules find exceptions and where each figure comes from. Rule set ${RULE_SET_VERSION}. Every value on this page that is not a definition is an assumption.`,
    className: "method-modal",
    size: "wide",
    body: [
      h("section", { class: "method-section", "aria-labelledby": "method-rules-title" },
        // The dialog opens at its top: the focus starts on this heading, not on the first field below.
        h("h3", { id: "method-rules-title", tabindex: "-1", autofocus: true }, "The fifteen rules"),
        h("p", {}, "Deterministic rules over five of DAMA UK's six data-quality dimensions find every exception. The agent groups them into cases, explains them and proposes how to fix them; it never declares a record wrong on its own."),
        h("div", { class: "vc-table-wrap method-rules-wrap" }, rules)),
      h("section", { class: "method-section", id: "method-accuracy", "aria-labelledby": "method-accuracy-title" },
        h("h3", { id: "method-accuracy-title" }, "Why accuracy is left out"),
        h("p", {}, "Accuracy asks whether a value matches the real world: whether the supplier really banks where the record says, whether the material group fits what was bought. Only a check outside the data can answer that (a register, a document, a look at the goods), and this prototype has none. So its rules cover completeness, consistency, validity, uniqueness and timeliness, and say nothing about accuracy rather than guess.")),
      h("section", { class: "method-section", "aria-labelledby": "method-defs-title" },
        h("h3", { id: "method-defs-title" }, "Definitions"),
        definitions),
      h("section", { class: "method-section", id: "method-params", "aria-labelledby": "method-params-title" },
        h("h3", { id: "method-params-title" }, running ? h("span", { class: "method-lock" }, icon("lock", 18), "Parameters (assumptions), locked during the run") : "Parameters (assumptions)"),
        h("p", {}, "They set the fix paths' effort and lead times and the financing cost. A change applies to Live runs from the next run on, is logged with its time and stays for this browser tab; the run's audit export lists the values in effect and every change. Simulation always runs on the defaults, so the scripted runs stay valid."),
        h("div", { class: "vc-table-wrap method-params-wrap" },
          h("table", { class: "vc-table vc-table--compact method-params-table", id: "method-params-table" },
            h("caption", { class: "vc-visually-hidden" }, "The method's parameters: the values for Live runs and the defaults"),
            h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Parameter"), h("th", { scope: "col" }, "For Live runs"), h("th", { scope: "col" }, "Default"))),
            h("tbody", {}, rows))),
        h("div", { class: "method-param-actions" }, status, resetBtn, applyBtn),
        h("h4", { class: "method-log-title" }, "Changes in this tab, latest first"),
        log),
      h("section", { class: "method-section", "aria-labelledby": "method-path-title" },
        h("h3", { id: "method-path-title" }, "With real data"),
        h("p", {}, "This page stands in for the whole path. With real data, each piece would run here:"),
        productionPath())
    ]
  });
}

function def(term, text) {
  return [h("dt", {}, term), h("dd", {}, text)];
}

function cap(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}
