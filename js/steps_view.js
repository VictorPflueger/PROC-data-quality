// What each step shows: the tip, Spot, Check, Calculate, Propose and Prepare, drawn from the run model
// (js/run_model.js). Every figure is the engine's (a tool result, the alert, the options) or the world's;
// the agent's own words carry the lilac AI tag; ids become names (js/plain.js). One render per change:
// js/app.js keeps focus and the reason being typed across renders.

import { h } from "./dom.js";
import { renderMarkdown } from "./md.js";
import { euro, int, pct1 } from "./format.js";
import { RULES } from "./rules.js";
import { itemsOf, lastResult, approved, rejectedIds } from "./run_model.js";
import { scanFacts, ageOf, recordsWord, severityTone } from "./facts.js";
import { plainText, personLine, personName, scopeText, ruleName } from "./plain.js";
import { KIND_LABELS } from "./drafts.js";

const icon = (name) => h("span", { class: `vc-icon vc-icon--${name}`, "aria-hidden": "true" });
const aiTag = () => h("span", { class: "ai-tag", title: "Written by the AI agent; its figures were checked against the engine's" }, icon("sparkle"), "AI");
// A text the figure audit refused twice shows anyway, but never silently: it carries this tag.
const uncheckedTag = (tokens) => (tokens && tokens.length
  ? h("span", { class: "vc-tag vc-tag--warning vc-tag--sm unchecked-tag", title: `Figures no tool returned: ${tokens.join(", ")}. Check them before you rely on this text.` }, icon("warning"), "Unchecked")
  : null);
const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen"];
const spell = (n) => WORDS[n] || int(n);
const plural = (n, one, many) => `${int(n)} ${n === 1 ? one : many}`;
const strip = (t) => String(t || "").replace(/^\s*(\*\*)?(hypothesis|revised|revision|finding|check|confirmed)\s*:\s*(\*\*)?\s*/i, "").replace(/^./, (c) => c.toUpperCase());

// Short names for the honeycomb's cells, from the rules' own names.
const SHORT = {
  "DQ-01": "Contract ref missing", "DQ-02": "Material group missing", "DQ-03": "Group differs from master",
  "DQ-04": "Requester missing", "DQ-05": "Requester had left", "DQ-06": "Payment terms missing",
  "DQ-07": "Payment terms too short", "DQ-08": "Blocked supplier", "DQ-09": "No terms in company code",
  "DQ-10": "VAT ID wrong or missing", "DQ-11": "Bank missing or foreign", "DQ-12": "Duplicate supplier",
  "DQ-13": "Material without group", "DQ-14": "Contract owner gone", "DQ-15": "Contract not valid"
};
// Order lines first, then suppliers, materials and contracts: five columns, three rows.
const HIVE_ORDER = ["DQ-01", "DQ-02", "DQ-03", "DQ-04", "DQ-05", "DQ-06", "DQ-07", "DQ-08", "DQ-15", "DQ-09", "DQ-10", "DQ-11", "DQ-12", "DQ-13", "DQ-14"];

/** Draws step n of the run into the stage. ctx: { world, scenarios, scenario, handlers, ui }. */
export function renderStep(stage, n, run, ctx) {
  const view = [tipStep, spotStep, checkStep, calculateStep, proposeStep, prepareStep][n] || tipStep;
  stage.replaceChildren(view(run, ctx));
  stage.dataset.step = String(n);
}

// ---- shared pieces ------------------------------------------------------------------------------------

function agentWords(items, world) {
  const texts = items.filter((x) => (x.kind === "say" || x.kind === "reasoning" || x.kind === "finding" || x.kind === "recommendation") && x.text);
  if (!texts.length) return null;
  return h("div", { class: "ai-words" }, aiTag(), texts.slice(-3).map((x) => h("p", {}, strip(plainText(world, x.text)))));
}

function did(run, n, world) {
  const lines = [];
  let reads = 0;
  for (const x of itemsOf(run, n)) {
    if (x.kind !== "tool") continue;
    if (x.name === "erp_get_record") { reads += 1; continue; }
    const t = toolSentence(x, world);
    if (t) lines.push(t);
  }
  if (reads) lines.push(`Read ${plural(reads, "record", "records")} behind the exceptions`);
  if (!lines.length) return null;
  return [h("p", { class: "did-title" }, "What the agent did"), h("ul", { class: "did" }, lines.map((t) => h("li", {}, t)))];
}

const KEY_WORDS = { plant: "plant", company_code: "company code", supplier: "supplier", channel: "ordering channel", buyer: "buyer", requester: "requester", created_by: "who created the order", material_group: "material group", onboarding_channel: "onboarding channel", week_detected: "week found" };
const PRODUCT_WORDS = { po_line: "order lines", contract: "contracts", supplier: "suppliers", material: "materials", user_org: "people", exception_log: "the exception log" };

function toolSentence(x, world) {
  const i = x.input || {};
  const r = x.result || {};
  switch (x.name) {
    case "erp_get_overview": return "Read the company's data and the rule catalogue";
    case "dq_scan": return `Ran ${i.rules && i.rules.length && i.rules.length < 15 ? i.rules.map(ruleName).join(", ") : "all fifteen rules"} over ${scopeText(world, i.filters)} and compared the result with the exception log`;
    case "dq_group": {
      const by = (i.by || []).map((k) => KEY_WORDS[k] || k).join(" and ");
      if (!r.groups_total) return `Grouped them by ${by}`;
      if (r.groups_total === 1) return `Grouped them by ${by}: all ${int(r.base?.exceptions || 0)} in one group`;
      return `Grouped them by ${by}: ${int(r.groups_total)} groups, the largest holds ${int(r.groups?.[0]?.exceptions || 0)} of ${int(r.base?.exceptions || 0)}`;
    }
    case "erp_query": return `Looked up ${PRODUCT_WORDS[i.product] || "records"}`;
    case "dq_suggest": return r.exceptions ? `Looked up the correct value for each exception: ${int(r.with_suggestion)} of ${int(r.exceptions)} have one` : "Looked up the correct value for each exception";
    case "dq_classify": return `Suggested material groups for ${plural((i.items || []).length, "line", "lines")}, for your review`;
    case "ui_request_review": return "Asked you to review its suggestions";
    case "ui_report_alert": return "Raised the case";
    case "dq_history": return r.closure_14d ? `Read how often such exceptions get fixed within 14 days: ${pct1(r.closure_14d.share)}` : "Read how often such exceptions get fixed";
    case "dq_fix_paths": return "Had the engine cost each way to fix it";
    case "ui_draft_action": return `Drafted a ${(KIND_LABELS[i.kind] || "draft").toLowerCase()}`;
    case "ui_final_report": return "Wrote the report";
    default: return null;
  }
}

function waiting(text) {
  return h("p", { class: "step-wait" }, h("span", { class: "vc-spinner vc-spinner--sm", "aria-hidden": "true" }), text);
}

function hive(world, scan, caseRules) {
  const facts = scan ? scanFacts(world, scan) : null;
  const scanned = new Set(scan ? (scan.rules && scan.rules.length ? scan.rules : RULES.map((r) => r.id)) : []);
  const cells = HIVE_ORDER.map((id, k) => {
    const col = k % 5;
    const row = Math.floor(k / 5);
    const count = facts?.byRule.get(id) || 0;
    const state = !scan || !scanned.has(id) ? "idle" : count > 0 ? severityTone(id) : "success";
    const mark = state === "danger" ? icon("error") : state === "warning" ? icon("warning") : state === "success" ? icon("check") : null;
    const label = state === "idle" ? (scan ? "not part of this scan" : "not scanned yet") : `${int(count)} open`;
    return h("li", {
      class: "hex", dataset: { state, rule: id, case: caseRules?.has(id) ? "true" : "false" },
      style: { "--col": String(col), "--row": String(row), "--odd": String(col % 2) },
      "aria-label": `${id} ${ruleName(id)}: ${label}`
    }, h("span", { "aria-hidden": "true" },
      h("span", { class: "hex-id" }, mark, id),
      h("span", { class: "hex-n" }, state === "idle" ? "·" : int(count)),
      h("span", { class: "hex-name" }, SHORT[id] || ruleName(id))));
  });
  const legend = h("ul", { class: "hive-legend", "aria-hidden": "true" },
    h("li", {}, h("i", { dataset: { state: "danger" } }), "High severity, open"),
    h("li", {}, h("i", { dataset: { state: "warning" } }), "Medium or low, open"),
    h("li", {}, h("i", { dataset: { state: "success" } }), "Nothing open"),
    h("li", {}, h("i", { dataset: { state: "idle" } }), scan ? "Not in this scan" : "Not scanned yet"),
    caseRules && caseRules.size ? h("li", {}, h("i", { dataset: { state: "case" } }), "In the case") : null);
  return h("div", { class: "hive-wrap" },
    h("p", { class: "hive-title" }, "The fifteen rules"),
    h("ul", { class: "hive", "aria-label": "The fifteen rules and what they found", role: "list" }, cells),
    legend);
}

// ---- step 0: the tip ----------------------------------------------------------------------------------

function tipStep(run, ctx) {
  const { world, scenarios, scenario, handlers } = ctx;
  const started = run.status !== "idle";
  const select = h("select", { class: "vc-select", id: "case-select", on: { change: (e) => handlers.onCase(e.target.value) } },
    scenarios.map((s) => h("option", { value: s.id, selected: s.id === scenario.id }, s.title)));
  const n = (rows) => int((rows || []).length);
  return h("section", { class: "step", "aria-labelledby": "step-title" },
    h("div", { class: "panel story" },
      h("div", { class: "case-pick" }, h("label", { class: "vc-label", for: "case-select" }, "Case"), select),
      h("h2", { class: "sr-title", id: "step-title" }, "The tip"),
      h("p", { class: "tip-from" }, `A tip came in. ${scenario.hint}.`),
      h("blockquote", { class: "tip-quote" }, `“${scenario.tip}”`),
      h("p", { class: "step-lead" }, "That sentence is all the agent gets. It works out the rest from the company's data."),
      h("div", { class: "start-row" },
        h("button", { class: "vc-button", type: "button", id: "btn-start", on: { click: () => handlers.onStart("simulation") } }, icon(started ? "refresh" : "play"), started ? "Start again" : "Start the agent"),
        h("button", { class: "vc-button vc-button--secondary", type: "button", id: "btn-live", on: { click: () => handlers.onStart("live") } }, icon("key"), "Run it live")),
      h("p", { class: "step-note" }, "Start plays a scripted run of the agent through the real rules and engine: free, no key, works offline. Run it live calls Claude with your own API key.")),
    h("div", { class: "panel data-card" },
      h("h2", {}, "What the agent can check"),
      h("ul", { class: "facts" },
        h("li", {}, h("span", { class: "fact-value" }, n(world.po_lines)), h("span", { class: "fact-text" }, "order lines from the last 365 days")),
        h("li", {}, h("span", { class: "fact-value" }, n(world.suppliers)), h("span", { class: "fact-text" }, `suppliers, ${n(world.materials)} materials and ${n(world.contracts)} contracts`)),
        h("li", {}, h("span", { class: "fact-value" }, n(world.users)), h("span", { class: "fact-text" }, "people who buy, request and approve"))),
      hive(world, null, null)));
}

// ---- step 1: Spot -------------------------------------------------------------------------------------

function spotStep(run, ctx) {
  const { world } = ctx;
  const scan = run.scans[run.scans.length - 1] || null;
  const items = itemsOf(run, 1);
  if (!scan) {
    return h("section", { class: "step" },
      h("div", { class: "panel story" }, h("h2", { class: "step-title", id: "step-title" }, "The agent reads the data"), agentWords(items, world), waiting("The rules are running."), did(run, 1, world)),
      h("div", { class: "panel" }, hive(world, null, null)));
  }
  const f = scanFacts(world, scan);
  const call = [...run.items].reverse().find((x) => x.kind === "tool" && x.name === "dq_scan");
  const scope = scopeText(world, call?.input?.filters);
  const fired = [...f.byRule.values()].filter((c) => c > 0).length;
  const word = recordsWord(f.onlyLines, f.n);
  const title = f.n
    ? `${spell(fired).replace(/^./, (c) => c.toUpperCase())} ${fired === 1 ? "rule flags" : "rules flag"} ${int(f.n)} ${word} in ${scope}`
    : `No rule flags anything in ${scope}`;
  const scanned = scan.rules?.length || 15;
  return h("section", { class: "step" },
    h("div", { class: "panel story" },
      h("h2", { class: "step-title", id: "step-title" }, title),
      h("p", { class: "step-lead" }, `It ran ${scanned >= 15 ? "all fifteen rules" : `${spell(scanned)} of the fifteen rules`} over ${scope === "all the data" ? "all the data" : `the data of ${scope}`}. An exception is a record that breaks a rule.`),
      agentWords(items, world),
      h("ul", { class: "facts" },
        h("li", {}, h("span", { class: "fact-value" }, euro(f.spend)), h("span", { class: "fact-text" }, `of orders on these ${plural(f.lines, "line", "lines")}`)),
        f.before ? h("li", {}, h("span", { class: "fact-value" }, int(f.before)), h("span", { class: "fact-text" }, `were flagged before and are still open; the oldest has waited ${plural(f.oldestDays, "day", "days")}`)) : null,
        f.fresh ? h("li", {}, h("span", { class: "fact-value" }, int(f.fresh)), h("span", { class: "fact-text" }, f.fresh === 1 ? "is new today" : "are new today")) : null)),
    h("div", { class: "panel" }, hive(world, scan, run.alert ? new Set(run.alert.rules || []) : null)));
}

// ---- step 2: Check ------------------------------------------------------------------------------------

function checkStep(run, ctx) {
  const { world } = ctx;
  const items = itemsOf(run, 2);
  const chain = [];
  let reads = 0;
  for (const x of items) {
    if (x.kind === "hypothesis") chain.push(["hypothesis", "Hypothesis", strip(plainText(world, x.text))]);
    else if (x.kind === "revised") chain.push(["revised", "Revised", strip(plainText(world, x.text))]);
    else if (x.kind === "tool" && x.name === "dq_group" && x.result) chain.push(["check", "Checked", toolSentence(x, world)]);
    else if (x.kind === "tool" && x.name === "erp_get_record") reads += 1;
    else if ((x.kind === "say" || x.kind === "finding" || x.kind === "confirmed") && x.text) chain.push(["say", "Found", strip(plainText(world, x.text))]);
  }
  if (reads) chain.push(["check", "Read", `${plural(reads, "record", "records")} behind the exceptions, to see what they have in common`]);
  const alert = run.alert;
  const title = alert ? plainText(world, alert.title) : "The agent looks for the cause";
  const left = h("div", { class: "panel story" },
    h("h2", { class: "step-title", id: "step-title" }, title),
    chain.length ? h("ol", { class: "chain" }, chain.slice(-6).map(([kind, label, text]) => h("li", { dataset: { kind } },
      h("span", { class: "chain-label" }, label, kind === "hypothesis" || kind === "revised" || kind === "say" ? " (AI)" : ""),
      h("p", { class: "chain-text" }, text)))) : waiting("The agent is testing a cause."),
    !alert && run.status === "running" && chain.length ? waiting("Still checking.") : null);
  let right;
  if (run.review && (!run.review.decision || !alert)) right = reviewPanel(run, ctx);
  else if (alert) right = caseCard(alert, world, run);
  else right = h("div", { class: "panel case-card" }, h("div", { class: "case-head" }, h("h3", {}, "The case")), waiting("The case appears once the agent has checked enough records."));
  return h("section", { class: "step" }, left, right);
}

function caseCard(alert, world, run) {
  const group = alert.group_values ? Object.keys(alert.group_values).map((k) => KEY_WORDS[k] || k).join(" and ") : "one group";
  const review = run.review?.decision ? run.review.decision.decisions || [] : null;
  return h("div", { class: "panel case-card" },
    h("div", { class: "case-head" }, h("h3", {}, "The case"), h("span", { class: "head-tags" }, uncheckedTag(alert.unchecked), aiTag())),
    h("dl", { class: "case-rows" },
      h("div", {}, h("dt", {}, "Root cause"), h("dd", {}, plainText(world, alert.root_cause))),
      h("div", {}, h("dt", {}, "Fix at the source"), h("dd", {}, plainText(world, alert.fix_at_source))),
      h("div", {}, h("dt", {}, "Who must act"), h("dd", {}, h("ul", { class: "people" }, (alert.routing || []).map((r) =>
        h("li", {}, h("span", { class: "vc-avatar vc-avatar--xs", "aria-hidden": "true" }, initials(personName(world, r.person))), h("span", {}, personLine(world, r.person)), h("span", { class: "count" }, plural(r.count, "exception", "exceptions"))))))),
      h("div", {}, h("dt", {}, "Evidence"), h("dd", {}, `${int(alert.exceptions)} exceptions on ${euro(alert.spend_eur)} of orders. ${alert.share >= 0.9995 ? "All of them" : `${pct1(alert.share)} of them`} share one ${group}; the agent read ${plural(alert.records_read, "record", "records")}.`)),
      review ? h("div", {}, h("dt", {}, "Your review"), h("dd", {}, `${int(review.filter((d) => d.decision === "approved").length)} of ${int(review.length)} AI suggestions approved`)) : null));
}

const initials = (name) => String(name || "?").replace(/^the /, "").split(/[\s.]+/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join("");

function reviewPanel(run, ctx) {
  const { handlers, ui } = ctx;
  const req = run.review.request;
  const items = req.items || [];
  const done = !!run.review.decision;
  const choice = ui.review || (ui.review = new Map());
  const decided = items.filter((it) => choice.has(it.line_id)).length;
  const row = (it) => {
    const c = done ? (run.review.decision.decisions || []).find((d) => d.line_id === it.line_id)?.decision : choice.get(it.line_id);
    const btn = (value, label) => h("button", {
      type: "button", class: ["vc-button", "vc-button--sm", c === value ? "" : "vc-button--ghost"], "aria-pressed": c === value ? "true" : "false", disabled: done,
      dataset: { action: value === "approved" ? "approve" : "reject" },
      on: { click: () => { choice.set(it.line_id, value); handlers.onRerender(); } }
    }, label);
    return h("tr", { dataset: { line: it.line_id } },
      h("td", {}, it.short_text),
      h("td", {}, it.group_name || it.group),
      h("td", {}, ({ high: "High", medium: "Medium", low: "Low" })[it.confidence] || it.confidence),
      h("td", {}, h("div", { class: "review-actions" }, btn("approved", "Approve"), btn("rejected", "Reject"))));
  };
  return h("div", { class: "panel review" },
    h("div", { class: "case-head" }, h("h3", {}, done ? "Your review" : `Your review: ${plural(items.length, "suggestion", "suggestions")} by the AI`), h("span", { class: "head-tags" }, uncheckedTag(req.unchecked), aiTag())),
    h("p", { class: "step-note" }, "Free-text order lines have no material group. The agent suggests one from the words of each line; only what you approve counts."),
    h("div", { class: "vc-table-wrap" }, h("table", { class: "vc-table vc-table--compact review-table" },
      h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Order line text"), h("th", { scope: "col" }, "Suggested group"), h("th", { scope: "col" }, "Confidence"), h("th", { scope: "col" }, "Your call"))),
      h("tbody", {}, items.map(row)))),
    done ? null : h("div", { class: "review-actions" },
      h("button", { type: "button", class: "vc-button vc-button--secondary", id: "btn-review-all", on: { click: () => { for (const it of items) choice.set(it.line_id, "approved"); handlers.onRerender(); } } }, "Approve all"),
      h("button", {
        type: "button", class: "vc-button", id: "btn-review-confirm", disabled: decided < items.length,
        on: { click: () => handlers.onReview(req.review_id, items.map((it) => ({ line_id: it.line_id, decision: choice.get(it.line_id) }))) }
      }, icon("check"), decided < items.length ? `Confirm (${int(items.length - decided)} to decide)` : "Confirm review")));
}

// ---- step 3: Calculate --------------------------------------------------------------------------------

function calculateStep(run, ctx) {
  const { world } = ctx;
  const items = itemsOf(run, 3);
  const fp = lastResult(run, "dq_fix_paths");
  const hist = lastResult(run, "dq_history");
  if (!fp) {
    return h("section", { class: "step" },
      h("div", { class: "panel story" }, h("h2", { class: "step-title", id: "step-title" }, "The engine costs the case"), agentWords(items, world), waiting("Working out what the case costs."), did(run, 3, world)),
      h("div", { class: "panel" }));
  }
  const c = fp.case || {};
  const nothing = fp.paths?.nothing || {};
  const E = Number(c.E) || 0;
  const financing = E > 0 || Number(nothing.gains_cost_eur_per_year) > 0;
  const title = financing ? `Paying early cost ${euro(E)} last year` : `About ${int(nothing.gains_per_year || 0)} more exceptions a year if nothing changes`;
  const share14 = hist?.closure_14d?.share ?? c.share14 ?? null;
  const fig = (label, value, note, tone) => h("div", { class: "fig", dataset: { tone: tone || "" } }, h("p", { class: "fig-label" }, label), h("p", { class: "fig-value" }, value), h("p", { class: "fig-note" }, note));
  const figs = financing
    ? [
      fig("Paid too early last year", euro(E), "already paid; no fix gets it back", "spent"),
      fig("Still avoidable", euro(c.unpaid_cost_eur || 0), "on lines not yet paid"),
      fig("If nothing changes", `${euro(nothing.gains_cost_eur_per_year || 0)} a year`, `about ${int(nothing.gains_per_year || 0)} more exceptions a year`, "risk"),
      fig("Orders affected", euro(c.spend_eur || 0), `on ${plural(c.n || 0, "record", "records")}`)
    ]
    : [
      fig("Orders affected", euro(c.spend_eur || 0), `on ${plural(c.n || 0, "record", "records")}`),
      fig("If nothing changes", `about ${int(nothing.gains_per_year || 0)} a year`, "more exceptions like these", "risk"),
      fig("Interest cost", euro(0), "this kind of error costs no financing", "spent"),
      share14 !== null ? fig("Fixed within 14 days today", pct1(share14), "how such exceptions close, from the exception log") : null
    ];
  return h("section", { class: "step" },
    h("div", { class: "panel story" },
      h("h2", { class: "step-title", id: "step-title" }, title),
      agentWords(items, world),
      h("p", { class: "engine-note" }, icon("shield"), "Every figure here comes from the rule engine. The AI only explains them."),
      did(run, 3, world)),
    h("div", { class: "panel" }, h("div", { class: "figs" }, figs)));
}

// ---- step 4: Propose ----------------------------------------------------------------------------------

function optionFigures(f, n) {
  const rows = [];
  const mass = f.id === "A" || f.id === "C";
  rows.push(["Fixes", `${int(f.closed)} of ${int(n)} records${mass ? "" : ", expected"}`]);
  const yearly = Number(f.future_avoided_eur_per_year) || 0;
  const now = Number(f.avoided_now_eur) || 0;
  rows.push(["Avoids", yearly > 0 && now > 0 ? `${euro(yearly)} a year and ${euro(now)} at once` : yearly > 0 ? `${euro(yearly)} a year` : now > 0 ? `${euro(now)} at once` : "no interest cost"]);
  if (Number(f.prevented_per_year) > 0) rows.push(["Prevents", `about ${int(f.prevented_per_year)} a year, from day ${int(f.prevents_after_days || 0)}`]);
  rows.push(["Costs", `${euro(f.effort_eur || 0)} one-off, ${plural(f.days || 0, "day", "days")}`]);
  return h("dl", { class: "opt-figs" }, rows.map(([k, v]) => h("div", {}, h("dt", {}, k), h("dd", {}, v))));
}

function proposeStep(run, ctx) {
  const { world, handlers, ui } = ctx;
  const o = run.options;
  if (!o) {
    return h("section", { class: "step step--wide" },
      h("div", { class: "decide-head" }, h("h2", { class: "step-title", id: "step-title" }, "Your decision comes next")),
      h("div", { class: "panel" }, waiting(run.status === "running" ? "The agent prepares the options." : "No options in this run.")));
  }
  const ok = approved(run);
  const rejected = rejectedIds(run);
  const open = run.status === "running" && run.waiting === "decision";
  const n = o.case?.n || run.alert?.exceptions || 0;
  const cards = o.options.map((opt) => {
    const status = ok ? (ok.decision.option_id === opt.id ? "approved" : "closed") : rejected.has(opt.id) ? "rejected" : "";
    const f = opt.figures || {};
    return h("article", { class: "opt", dataset: { path: opt.id, recommended: opt.recommended ? "true" : "false", status } },
      opt.recommended ? h("span", { class: "vc-tag vc-tag--solid vc-tag--sm opt-badge" }, "Recommended") : null,
      h("div", { class: "opt-head" }, h("span", { class: "vc-cell vc-cell--sm opt-letter", "aria-hidden": "true" }, opt.id), h("h3", {}, h("span", { class: "vc-visually-hidden" }, `Path ${opt.id}: `), plainText(world, opt.title))),
      h("p", { class: "opt-desc" }, plainText(world, opt.description)),
      optionFigures(f, n),
      opt.residual_risk ? h("p", { class: "opt-risk" }, `Still open: ${plainText(world, opt.residual_risk)}`) : null,
      status === "approved" ? h("p", { class: "opt-status" }, icon("check"), "Approved, re-scan pending")
        : status === "rejected" ? h("p", { class: "opt-status" }, "Rejected")
          : status === "closed" ? null
            : h("div", { class: "opt-actions" },
              h("button", { type: "button", class: ["vc-button", opt.recommended ? "" : "vc-button--secondary"], dataset: { action: "approve" }, disabled: !open, on: { click: () => handlers.onDecide(opt.id, "approved") } }, "Approve"),
              h("button", { type: "button", class: "vc-button vc-button--ghost", dataset: { action: "reject" }, disabled: !open, on: { click: () => handlers.onDecide(opt.id, "rejected") } }, "Reject")));
  });
  const nf = o.nothing?.figures || {};
  const nothingStatus = ok ? (ok.nothing ? "approved" : "closed") : "";
  const reason = h("textarea", {
    class: "vc-textarea", id: "nothing-reason", rows: "2", placeholder: "The memo records it.", disabled: !open,
    on: { input: (e) => { ui.reason = e.target.value; acceptBtn.disabled = !open || !ui.reason.trim(); } }
  });
  reason.value = ui.reason || "";
  const acceptBtn = h("button", { type: "button", class: "vc-button vc-button--secondary", dataset: { action: "accept" }, disabled: !open || !(ui.reason || "").trim(), on: { click: () => handlers.onDecide("nothing", "approved", ui.reason.trim()) } }, "Accept the risk");
  const goesOn = Number(nf.gains_cost_eur_per_year) > 0 ? `${euro(nf.gains_cost_eur_per_year)} a year` : "no interest cost";
  cards.push(h("article", { class: "opt opt--nothing", dataset: { path: "nothing", kind: "baseline", status: nothingStatus } },
    h("div", { class: "opt-head" }, h("span", { class: "vc-cell vc-cell--sm opt-letter", "aria-hidden": "true" }, icon("minus")), h("h3", {}, "Do nothing")),
    h("p", { class: "opt-desc" }, plainText(world, o.nothing?.note || "The exceptions stay open.")),
    h("dl", { class: "opt-figs" },
      h("div", {}, h("dt", {}, "Goes on"), h("dd", {}, goesOn)),
      h("div", {}, h("dt", {}, "Grows by"), h("dd", {}, `about ${int(nf.gains_per_year || 0)} exceptions a year`)),
      h("div", {}, h("dt", {}, "Costs"), h("dd", {}, `${euro(0)} now`))),
    nothingStatus === "approved" ? h("p", { class: "opt-status" }, icon("check"), "Risk accepted, recorded in a memo")
      : nothingStatus === "closed" ? null
        : [h("label", { class: "vc-label", for: "nothing-reason" }, "Why accept the risk?"), reason, h("div", { class: "opt-actions" }, acceptBtn)]));
  const rec = o.options.find((x) => x.recommended);
  const title = ok ? (ok.nothing ? "Decided: the risk is accepted" : `Decided: path ${ok.decision.option_id}, ${plainText(world, ok.option?.title || "")}`)
    : `Your decision: ${spell(o.options.length)} ways to fix it, or do nothing`;
  const note = ok
    ? "Watch the figures top right. Nothing counts as fixed until a re-scan stops finding it; Next shows the drafts."
    : `The agent recommends ${rec ? `path ${rec.id}` : "a path"}. The words are the AI's, every figure is the engine's.`;
  return h("section", { class: "step step--wide" },
    h("div", { class: "decide-head" }, h("div", {}, h("h2", { class: "step-title", id: "step-title" }, title), h("p", { class: "step-note note-line" }, note, aiTag(), uncheckedTag(o.unchecked)))),
    h("div", { class: "options", style: { "--n": String(cards.length) } }, cards));
}

// ---- step 5: Prepare ----------------------------------------------------------------------------------

function prepareStep(run, ctx) {
  const { world, handlers } = ctx;
  const pending = run.drafts.filter((d) => d.status === "pending").length;
  const ok = approved(run);
  let title;
  if (run.report) title = run.report.outcome === "stopped" ? "Every path was rejected: nothing to draft" : "Done. Nothing was sent.";
  else if (pending) title = `${spell(pending).replace(/^./, (c) => c.toUpperCase())} ${pending === 1 ? "draft waits" : "drafts wait"} for your approval`;
  else if (!ok) title = "The drafts come after your decision";
  else title = "The agent drafts what the path allows";
  const drafts = run.drafts.map((d) => {
    const body = plainText(world, d.body || "");
    const preview = body.split(/\n{2,}/).find((p) => p.trim() && !/^Record \|/.test(p)) || "";
    return h("article", { class: "draft", dataset: { id: d.action_id, kind: d.kind, status: d.status } },
      h("div", { class: "draft-meta" }, h("span", { class: "vc-tag vc-tag--sm" }, KIND_LABELS[d.kind] || d.kind), h("span", {}, `To ${plainText(world, d.recipient || "")}`), aiTag(), uncheckedTag(d.unchecked)),
      h("p", { class: "draft-subject" }, plainText(world, d.subject)),
      h("p", { class: "draft-preview" }, preview),
      h("details", {}, h("summary", {}, "Show the full draft"), renderMarkdown(body)),
      d.status === "pending"
        ? h("div", { class: "draft-actions" },
          h("button", { type: "button", class: "vc-button", dataset: { action: "approve" }, on: { click: () => handlers.onDraft(d.action_id, "approved") } }, "Approve"),
          h("button", { type: "button", class: "vc-button vc-button--ghost", dataset: { action: "reject" }, on: { click: () => handlers.onDraft(d.action_id, "rejected") } }, "Reject"))
        : h("p", { class: "draft-status" }, d.status === "approved" ? "Approved. Not sent: this page has no email or ERP connection." : "Rejected"));
  });
  const report = run.report
    ? h("div", { class: "panel report" },
      h("div", { class: "case-head" }, h("h3", {}, "The report"), h("span", { class: "head-tags" }, uncheckedTag(run.report.unchecked), aiTag())),
      renderMarkdown(plainText(world, run.report.markdown)),
      h("div", { class: "report-actions" },
        h("button", { type: "button", class: "vc-button vc-button--secondary", id: "btn-audit", on: { click: () => handlers.onDownloadAudit() } }, icon("download"), "Download the audit log"),
        h("button", { type: "button", class: "vc-button vc-button--ghost", id: "btn-restart", on: { click: () => handlers.onRestart() } }, icon("refresh"), "Start again")))
    : null;
  const note = run.report ? "Every decision is in the audit log."
    : pending ? "Drafts go nowhere: approving one only marks it as cleared, in this tab. The report follows once each draft is decided."
      : run.status === "running" ? "The agent is still at work." : "This run ended without a report.";
  return h("section", { class: "step step--wide" },
    h("div", { class: "decide-head" }, h("div", {},
      h("h2", { class: "step-title", id: "step-title" }, title),
      h("p", { class: "step-note" }, note))),
    h("div", { class: "prepare", dataset: { report: report ? "true" : "false" } }, h("div", { class: "drafts" }, drafts.length ? drafts : [h("div", { class: "panel" }, waiting(ok ? "Drafting." : "Decide in Propose first."))]), report));
}
