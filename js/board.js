// The data-quality board, where Rebate Hunter shows its rebate board, with two views and the cohorts:
//   Rules:  a honeycomb of fifteen hexagon cells, one per rule, grouped by data product. Each cell
//           shows the rule id, a short name and the open exceptions the run's scans found, and takes
//           its state with a mark: danger and a cross for a high-severity rule with open exceptions,
//           warning and a bar and dot for a medium- or low-severity one, success and a tick for a rule
//           with none, neutral before the first scan. A cell opens its exceptions as a table.
//   People: one row per routed-to person (role and team), with their exceptions by rule as small
//           hexagon pips in the state colours, the drafts waiting for them and the fix path that
//           covers them.
//   Below both: the eight weekly cohorts as a chart with hexagon markers, their numbers one click away.
// What the agent reads pulses in fjord as an outline (rules it scans or groups, records it opens), and
// what it marks keeps a fjord outline. Every number comes from the engine through the run events; the
// board never sums spend across exceptions, and an approved fix reads "approved, re-scan pending".

import { bus } from "./events.js";
import { h, clear } from "./dom.js";
import { icon } from "./icons.js";
import { RULES, PRODUCTS, ruleById } from "./rules.js";
import { int, pct1, euro, dayLabel } from "./format.js";
import { appToday } from "./clock.js";
import { indexOf, personLabel } from "./erp.js";

/** Each rule's short name on its cell, in two lines that fit the hexagon. */
const SHORT = {
  "DQ-01": ["Contract ref", "missing"], "DQ-02": ["Material group", "missing"], "DQ-03": ["Group differs", "from master"],
  "DQ-04": ["Requester", "missing"], "DQ-05": ["Requester", "had left"], "DQ-06": ["Payment terms", "missing"],
  "DQ-07": ["Payment terms", "too short"], "DQ-08": ["Blocked", "supplier"], "DQ-09": ["Company code", "lacks terms"],
  "DQ-10": ["VAT ID format", "or missing"], "DQ-11": ["Bank missing", "or foreign"], "DQ-12": ["Duplicate", "supplier"],
  "DQ-13": ["Material lacks", "a group"], "DQ-14": ["Owner missing", "or left"], "DQ-15": ["Contract", "not valid"]
};
const STATE_ICON = { danger: "error", warning: "warning", success: "success" };
const STATE_WORD = { danger: "open, high severity", warning: "open", success: "nothing open", neutral: "not scanned yet" };
const STATUS_WORD = { open: "open", routed: "routed", accepted: "accepted", closed: "closed", dismissed: "dismissed" };
const STRIPS = [["po_line"], ["supplier", "material", "contract"]];
const PULSE_MS = 2400;

export function createBoard(root, { world = window.WORLD } = {}) {
  const users = indexOf(world).users;
  const byRule = new Map();       // rule → { exceptions, scanId, scope }
  const ai = new Map();           // line id → { group_code, status }
  const drafts = new Map();       // action id → { person, status }
  let approved = null;            // { path, ids: Set }
  let caseIds = new Set();
  const focus = { rules: new Set(), records: new Set(), people: new Set() };
  let view = "rules";
  let openRule = null;
  let lastScope = "";

  // ---- frame ------------------------------------------------------------------------------------
  const sub = h("span", { class: "cap-sub", id: "board-sub" }, "");
  const caption = h("div", { class: "board-caption" }, h("div", { class: "cap-line" }, h("strong", {}, "Data-quality board")), sub);
  const body = h("div", { class: "board-body" });
  root.append(caption, body);

  const viewBtns = ["rules", "people"].map((v) => {
    const b = h("button", { class: "vc-button vc-button--outline button-compact", type: "button", id: `view-${v}`, "aria-pressed": String(v === view) }, v === "rules" ? "Rules" : "People");
    b.addEventListener("click", () => setView(v));
    return b;
  });
  const scopeEl = h("p", { class: "board-scope", id: "board-scope", role: "status" }, "Before the first scan the rules are neutral. Start the agent to scan them.");
  const viewBar = h("div", { class: "board-viewbar" }, h("div", { class: "segmented board-views", role: "group", "aria-label": "Board view" }, viewBtns), scopeEl);

  // Rules: the honeycomb.
  const cells = new Map();        // rule → { el, count, mark, state }
  const strips = [];
  const honey = h("div", { class: "honeycomb", id: "honeycomb" });
  for (const row of STRIPS) {
    const rowEl = h("div", { class: "hex-row" });
    for (const pid of row) {
      const product = PRODUCTS.find((p) => p.id === pid);
      const rules = RULES.filter((r) => r.product === pid);
      const strip = h("div", { class: "hex-strip", dataset: { product: pid, n: String(rules.length) } });
      for (const r of rules) strip.appendChild(cell(r));
      strips.push(strip);
      rowEl.appendChild(h("section", { class: "hex-group", "aria-label": `${product.label}: ${rules.length} ${rules.length === 1 ? "rule" : "rules"}` },
        h("h3", { class: "hex-group-title", title: `Typical SAP source: ${product.source}` }, product.label), strip));
    }
    honey.appendChild(rowEl);
  }
  const legend = h("ul", { class: "hex-legend", "aria-label": "What the cells show" },
    h("li", { dataset: { state: "danger" } }, icon("error", 16), "High severity, open"),
    h("li", { dataset: { state: "warning" } }, icon("warning", 16), "Medium or low, open"),
    h("li", { dataset: { state: "success" } }, icon("success", 16), "Nothing open"),
    h("li", { dataset: { state: "neutral" } }, h("span", { class: "legend-hex", "aria-hidden": "true" }), "Not scanned yet"),
    h("li", { dataset: { state: "reading" } }, h("span", { class: "legend-hex legend-hex--reading", "aria-hidden": "true" }), "The agent reads it"));
  const rulesCard = h("section", { class: "board-card rules-card", "aria-labelledby": "board-rules-title" },
    h("div", { class: "board-card-head" },
      h("h2", { id: "board-rules-title" }, "Rules by data product"),
      h("p", { class: "board-card-note" }, "Open exceptions per rule, as the run's scans find them. Open a cell for its exceptions. Accuracy is left out on purpose: it needs an outside check.")),
    honey, legend);

  // People.
  const peopleBody = h("tbody");
  const peopleCard = h("section", { class: "board-card people-card", "aria-labelledby": "board-people-title", hidden: true },
    h("div", { class: "board-card-head" },
      h("h2", { id: "board-people-title" }, "People the exceptions are routed to"),
      h("p", { class: "board-card-note" }, "The responsible person for each rule, or a substitute when they have left. Each pip is an open exception: solid for high severity, outlined for medium or low.")),
    h("div", { class: "vc-table-wrap people-wrap" },
      h("table", { class: "vc-table vc-table--compact people-table", id: "people-table" },
        h("caption", { class: "vc-visually-hidden" }, "Routed-to people with their exceptions by rule, the drafts waiting for them and the fix path that covers them"),
        h("thead", {}, h("tr", {}, ["Person", "Exceptions", "By rule", "Drafts waiting", "Fix path"].map((t, i) => h("th", { scope: "col", class: i === 1 || i === 3 ? "num" : "" }, t)))),
        peopleBody)));

  // A rule's exceptions.
  const exTitle = h("h2", { id: "board-ex-title" }, "");
  const exNote = h("p", { class: "board-card-note" }, "");
  const exBody = h("tbody");
  const exClose = h("button", { class: "vc-button vc-button--ghost button-compact", type: "button", id: "btn-ex-close" }, icon("x", 16), "Close");
  exClose.addEventListener("click", () => closeRule());
  const exCard = h("section", { class: "board-card ex-card", id: "ex-card", "aria-labelledby": "board-ex-title", hidden: true },
    h("div", { class: "board-card-head ex-head" }, exTitle, exNote, exClose),
    h("div", { class: "vc-table-wrap ex-wrap" },
      h("table", { class: "vc-table vc-table--compact ex-table", id: "ex-table" },
        h("caption", { class: "vc-visually-hidden" }, "The rule's exceptions with their responsible and routed-to people, spend, financing cost, suggestion and status"),
        h("thead", {}, h("tr", {}, ["Record", "Responsible", "Routed to", "Spend affected", "Financing cost", "Unpaid", "Suggestion", "Status"].map((t, i) => h("th", { scope: "col", class: i === 3 || i === 4 ? "num" : "" }, t)))),
        exBody)));

  // The weekly cohorts: chart, and the table one click away.
  const chart = h("div", { class: "cohort-chart", id: "cohort-chart" });
  const tbody = h("tbody");
  const tfoot = h("tfoot");
  const cohortCard = h("section", { class: "board-card", "aria-labelledby": "board-cohorts-title" },
    h("div", { class: "board-card-head" },
      h("h2", { id: "board-cohorts-title" }, "Weekly cohorts"),
      h("p", { class: "board-card-note" }, "Exceptions by the week they were first detected, each old enough to have had its 14-day follow-up window. Only a re-scan that no longer finds an exception closes it.")),
    chart,
    h("details", { class: "cohort-details", id: "cohort-details" },
      h("summary", {}, icon("chevronRight", 14), "Show the numbers"),
      h("div", { class: "vc-table-wrap cohort-wrap" },
        h("table", { class: "vc-table vc-table--compact cohort-table", id: "cohort-table" },
          h("caption", { class: "vc-visually-hidden" }, "Exceptions detected, closed, still open and dismissed per week of detection, from the exception log"),
          h("thead", {}, h("tr", {}, ["Week", "Detected between", "Detected", "Closed", "Still open", "Dismissed", "Closed share"].map((t, i) => h("th", { scope: "col", class: i >= 2 ? "num" : "" }, t)))),
          tbody, tfoot))));
  body.append(viewBar, rulesCard, peopleCard, exCard, cohortCard);

  // ---- the honeycomb's geometry: flat-top hexagons interlock, each column a quarter width over ----
  function layout() {
    const avail = Math.max(320, body.clientWidth - 56);
    const w = Math.max(96, Math.min(150, Math.floor(avail / 7.1)));
    const hgt = Math.round(w * 0.8660254);
    honey.style.setProperty("--hex-w", `${w}px`);
    honey.style.setProperty("--hex-h", `${hgt}px`);
    for (const strip of strips) {
      const n = Number(strip.dataset.n);
      strip.style.width = `${Math.round((0.75 * (n - 1) + 1) * w)}px`;
      strip.style.height = `${Math.round(n > 1 ? 1.5 * hgt : hgt)}px`;
      [...strip.children].forEach((c, i) => {
        c.style.left = `${Math.round(i * 0.75 * w)}px`;
        c.style.top = `${Math.round((i % 2) * 0.5 * hgt)}px`;
      });
    }
  }
  if (typeof ResizeObserver === "function") new ResizeObserver(() => layout()).observe(body);
  layout();

  function cell(r) {
    const count = h("span", { class: "hex-count" }, "—");
    const mark = h("span", { class: "hex-mark", "aria-hidden": "true" });
    const btn = h("button", { class: "hex-cell", type: "button", id: `cell-${r.id}`, dataset: { rule: r.id, state: "neutral", severity: r.severity } },
      h("span", { class: "hex-face" },
        h("span", { class: "hex-top" }, mark, h("span", { class: "hex-id" }, r.id)),
        count,
        h("span", { class: "hex-name" }, h("span", {}, SHORT[r.id][0]), h("span", {}, SHORT[r.id][1]))));
    btn.addEventListener("click", () => (openRule === r.id ? closeRule() : openRuleTable(r.id)));
    cells.set(r.id, { el: btn, count, mark, state: "neutral" });
    label(r.id);
    return btn;
  }

  function label(rule) {
    const c = cells.get(rule);
    const r = ruleById(rule);
    const d = byRule.get(rule);
    const n = d ? d.exceptions.length : null;
    const what = n === null ? "not scanned yet" : `${int(n)} open ${n === 1 ? "exception" : "exceptions"}${n ? `, ${r.severity} severity` : ""}`;
    c.el.setAttribute("aria-label", `${rule} ${r.name}: ${what}. ${n === null ? "" : "Open its exceptions."}`.trim());
    c.el.title = `${rule} ${r.name} (${r.dimension}, ${r.severity} severity, responsible: ${r.responsible})${d ? `\nLast scanned: ${d.scope}` : ""}`;
  }

  function paintCell(rule) {
    const c = cells.get(rule);
    const d = byRule.get(rule);
    const r = ruleById(rule);
    const n = d ? d.exceptions.length : null;
    const state = n === null ? "neutral" : n === 0 ? "success" : r.severity === "high" ? "danger" : "warning";
    c.state = state;
    c.el.dataset.state = state;
    c.count.textContent = n === null ? "—" : int(n);
    clear(c.mark);
    if (STATE_ICON[state]) c.mark.appendChild(icon(STATE_ICON[state], 14));
    c.el.dataset.ai = String(!!d && d.exceptions.some((e) => e.lines?.some((l) => ai.get(l)?.status === "pending")));
    c.el.dataset.focus = String(focus.rules.has(rule));
    c.el.dataset.case = String(!!d && d.exceptions.some((e) => caseIds.has(e.id)));
    label(rule);
  }

  // ---- views ------------------------------------------------------------------------------------
  function setView(v) {
    view = v === "people" ? "people" : "rules";
    for (const [i, b] of viewBtns.entries()) b.setAttribute("aria-pressed", String(["rules", "people"][i] === view));
    rulesCard.hidden = view !== "rules";
    peopleCard.hidden = view !== "people";
    if (view === "people") renderPeople();
  }

  function allExceptions() {
    return [...byRule.values()].flatMap((d) => d.exceptions);
  }

  /** A person in a table cell: the name, and the role below it. */
  function personCell(id) {
    const u = users.get(String(id));
    if (!u) return String(id || "—");
    return [h("span", { class: "who-name" }, u.name || String(id)), h("span", { class: "who-role" }, cap(u.role))];
  }

  function renderPeople() {
    clear(peopleBody);
    const people = new Map();
    for (const e of allExceptions()) {
      if (!people.has(e.routed_to)) people.set(e.routed_to, []);
      people.get(e.routed_to).push(e);
    }
    if (!people.size) {
      peopleBody.appendChild(h("tr", {}, h("td", { colspan: "5", class: "people-empty" }, "No exceptions yet: the people appear once a scan has found exceptions.")));
      return;
    }
    const rows = [...people].sort((a, b) => b[1].length - a[1].length || String(a[0]).localeCompare(String(b[0])));
    for (const [person, list] of rows) {
      const rules = new Map();
      for (const e of list) rules.set(e.rule, (rules.get(e.rule) || []).concat(e));
      const waiting = [...drafts.values()].filter((d) => d.person === person && d.status === "pending").length;
      const approvedDrafts = [...drafts.values()].filter((d) => d.person === person && d.status === "approved").length;
      const covered = approved ? list.filter((e) => approved.ids.has(e.id)).length : 0;
      peopleBody.appendChild(h("tr", { dataset: { person, focus: String(focus.people.has(person)) }, id: `person-${person}` },
        h("th", { scope: "row", class: "people-who", title: personLabel(world, person) }, h("span", { class: "people-name" }, users.get(person)?.name || person), h("span", { class: "people-role" }, roleTeam(person))),
        h("td", { class: "num" }, int(list.length)),
        h("td", { class: "people-pips" }, [...rules].sort((a, b) => a[0].localeCompare(b[0])).map(([rule, xs]) => pips(rule, xs))),
        h("td", { class: "num" }, waiting ? h("span", { class: "vc-tag vc-tag--accent" }, int(waiting)) : approvedDrafts ? h("span", { class: "people-done" }, `${int(approvedDrafts)} approved`) : "—"),
        h("td", { class: "people-path" }, covered ? h("span", { class: "vc-tag vc-tag--accent" }, `Path ${approved.path}: approved, re-scan pending (${int(covered)})`) : approved?.path === "nothing" && list.some((e) => caseIds.has(e.id)) ? "risk accepted" : "—")));
    }
  }

  function pips(rule, xs) {
    const sev = ruleById(rule).severity === "high" ? "danger" : "warning";
    const shown = xs.slice(0, 10);
    return h("span", { class: "pip-group", "aria-label": `${rule}: ${int(xs.length)} open`, title: `${rule} ${ruleById(rule).name}: ${int(xs.length)} open` },
      h("span", { class: "pip-rule" }, rule.slice(3)),
      shown.map(() => h("span", { class: "pip", dataset: { state: sev }, "aria-hidden": "true" })),
      xs.length > shown.length ? h("span", { class: "pip-more" }, `+${int(xs.length - shown.length)}`) : null);
  }

  function roleTeam(id) {
    const u = users.get(String(id));
    return u ? `${cap(u.role)}, ${u.team}` : "";
  }

  // ---- a rule's exceptions ------------------------------------------------------------------------
  function openRuleTable(rule) {
    openRule = rule;
    for (const [r, c] of cells) c.el.setAttribute("aria-expanded", String(r === rule));
    renderRuleTable();
    exCard.hidden = false;
    exCard.scrollIntoView({ block: "nearest" });
  }

  function closeRule() {
    const was = openRule;
    openRule = null;
    exCard.hidden = true;
    for (const c of cells.values()) c.el.setAttribute("aria-expanded", "false");
    if (was) cells.get(was)?.el.focus();
  }

  function renderRuleTable() {
    if (!openRule) return;
    const r = ruleById(openRule);
    const d = byRule.get(openRule);
    exTitle.textContent = `${r.id} ${r.name}`;
    exNote.textContent = d
      ? `${int(d.exceptions.length)} open ${d.exceptions.length === 1 ? "exception" : "exceptions"} in the last scan of this rule (${d.scope}). ${r.dimension}, ${r.severity} severity; responsible: ${r.responsible}.`
      : `Not scanned yet. ${r.dimension}, ${r.severity} severity; responsible: ${r.responsible}.`;
    clear(exBody);
    if (!d || !d.exceptions.length) {
      exBody.appendChild(h("tr", {}, h("td", { colspan: "8", class: "ex-empty" }, d ? "The scan found no exception of this rule." : "Nothing to show before a scan.")));
      return;
    }
    for (const e of d.exceptions) {
      const { covered, aiNote, status } = shown(e);
      exBody.appendChild(h("tr", { dataset: { exception: e.id, record: e.record, case: String(caseIds.has(e.id)), focus: String(focus.records.has(e.record)) } },
        // An order line's record breaks after its order number on a narrow board ("4500101079/" "20").
        h("th", { scope: "row", class: "ex-record" }, ...String(e.record).split(/(?<=\/)/).flatMap((part, i) => (i ? [h("wbr"), part] : [part]))),
        h("td", { class: "ex-who", title: personLabel(world, e.responsible) }, personCell(e.responsible)),
        h("td", { class: "ex-who", title: personLabel(world, e.routed_to) }, personCell(e.routed_to)),
        h("td", { class: "num" }, euro(e.spend_eur)),
        h("td", { class: "num" }, ruleById(e.rule).financing ? euro(e.financing_cost_eur) : "—"),
        h("td", {}, e.unpaid === true ? "yes" : e.unpaid === false ? "no" : "—"),
        h("td", { class: "ex-suggestion" }, suggestionText(e, aiNote)),
        // An approved fix is the person's decision (merlot's tint); the exception stays open until a re-scan.
        h("td", { class: "ex-status" }, h("span", { class: ["vc-tag", covered ? "vc-tag--accent" : ""] }, status), caseIds.has(e.id) ? h("span", { class: "vc-tag ex-case" }, "in the case") : null)));
    }
  }

  // An exception as its table row shows it: covered by an approved fix path ("approved, re-scan
  // pending"), its AI suggestion if any, its status and its suggestion in words.
  function shown(e) {
    const covered = !!approved && approved.ids.has(e.id);
    const aiNote = (e.lines || []).map((l) => ai.get(l)).find(Boolean) || null;
    const status = covered ? "approved, re-scan pending" : STATUS_WORD[e.status] || e.status || "open";
    const suggestion = e.suggestion ? `${e.suggestion.field}: ${e.suggestion.value} (${e.suggestion.source})`
      : aiNote ? `AI: ${aiNote.group_code}, ${aiNote.status === "approved" ? "approved" : aiNote.status === "rejected" ? "rejected" : "waits for review"}` : "none";
    return { covered, aiNote, status, suggestion };
  }

  function suggestionText(e, aiNote) {
    const { suggestion } = shown(e);
    return !e.suggestion && aiNote ? h("span", { class: "vc-tag vc-tag--feature ex-ai" }, suggestion) : suggestion;
  }

  // ---- what the agent reads pulses in fjord ---------------------------------------------------------
  const timers = new Map();
  function pulse(el) {
    if (!el) return;
    el.dataset.reading = "true";
    clearTimeout(timers.get(el));
    timers.set(el, setTimeout(() => { el.dataset.reading = "false"; timers.delete(el); }, PULSE_MS));
  }

  function exceptionsOnRecord(id) {
    const s = String(id);
    return allExceptions().filter((e) => e.record === s || e.record.split(/[+@|]/).includes(s) || (e.lines || []).includes(s));
  }

  bus.on("tool_call", (ev) => {
    const { name, input = {} } = ev.payload;
    if (name === "dq_scan" || name === "dq_group") {
      const rules = Array.isArray(input.rules) && input.rules.length ? input.rules : RULES.map((r) => r.id);
      for (const r of rules) pulse(cells.get(r)?.el);
    }
    if (name === "erp_get_record" && input.id) {
      for (const e of exceptionsOnRecord(input.id)) {
        pulse(cells.get(e.rule)?.el);
        pulse(peopleBody.querySelector(`tr[data-person="${cssId(e.routed_to)}"]`));
        pulse(exBody.querySelector(`tr[data-exception="${cssId(e.id)}"]`));
      }
    }
  });

  // ---- run events ---------------------------------------------------------------------------------
  bus.on("board_update", (ev) => {
    const p = ev.payload || {};
    if (p.scan) {
      const scope = scopeText(p.scan, ev);
      lastScope = scope;
      const fresh = new Map(p.scan.rules.map((r) => [r, []]));
      for (const e of p.scan.exceptions) fresh.get(e.rule)?.push(e);
      for (const [rule, list] of fresh) byRule.set(rule, { exceptions: list, scanId: p.scan.id, scope });
      scopeEl.textContent = scopeLine(p.scan.id, scope, p.scan.exceptions.length);
    }
    if (p.ai) for (const a of p.ai) ai.set(a.line_id, { group_code: a.group_code, status: a.status });
    if (p.focus) {
      focus.rules = new Set(p.focus.rules || []);
      focus.records = new Set(p.focus.records || []);
      focus.people = new Set(p.focus.people || []);
      for (const r of focus.rules) pulse(cells.get(r)?.el);
    }
    if (p.case) caseIds = new Set(p.case.exceptions || []);
    if (p.approved) approved = { path: p.approved.path, ids: new Set(p.approved.exceptions || []) };
    if (p.view === "rules" || p.view === "people") setView(p.view);
    refresh();
  });

  // The board counts the last scan's scope; the header tiles count the whole exception log, so the
  // line says which is which (review finding R11: "40 open" here, "151" on the tile).
  function scopeLine(id, scope, n) {
    return `Last scan ${id}: ${scope}. ${int(n)} open ${n === 1 ? "exception" : "exceptions"} in this scope; the header tiles count the whole exception log.`;
  }

  function scopeText(scan, ev) {
    const n = scan.rules.length;
    const rules = n === RULES.length ? "all fifteen rules" : n === 1 ? scan.rules[0] : `${n} rules (${scan.rules.join(", ")})`;
    const filters = lastFilters.get(scan.id);
    return filters ? `${rules}, ${filters}` : rules;
  }

  // The scan's filters are in its tool result; the board keeps them to say what a cell's count covers.
  const lastFilters = new Map();
  bus.on("tool_result", (ev) => {
    const p = ev.payload;
    if (p.name !== "dq_scan" || p.ok === false || !p.result?.scan_id) return;
    const f = p.result.filters;
    if (f && Object.keys(f).length) lastFilters.set(p.result.scan_id, Object.entries(f).map(([k, v]) => `${k.replace(/_/g, " ")} ${[].concat(v).join(" or ")}`).join(", "));
    const d = [...byRule.values()].filter((x) => x.scanId === p.result.scan_id);
    for (const x of d) x.scope = scopeText({ id: p.result.scan_id, rules: Array.isArray(p.result.rules) ? p.result.rules : RULES.map((r) => r.id) });
    if (d.length) {
      lastScope = d[0].scope;
      scopeEl.textContent = scopeLine(p.result.scan_id, lastScope, p.result.exceptions);
      refresh();
    }
  });

  bus.on("kpi_update", (ev) => {
    const p = ev.payload || {};
    if (p.stage === "measured" && Array.isArray(p.cohorts)) showCohorts(p.cohorts, p.closure_rate ?? null);
  });

  bus.on("action_draft", (ev) => {
    drafts.set(ev.payload.action_id, { person: ev.payload.recipient_id, status: "pending" });
    if (view === "people") renderPeople();
  });
  bus.on("action_decision", (ev) => {
    const d = drafts.get(ev.payload.action_id);
    if (d && d.status === "pending") d.status = ev.payload.decision;
    if (view === "people") renderPeople();
  });
  bus.on("run_end", () => {
    for (const d of drafts.values()) if (d.status === "pending") d.status = "expired";
    if (view === "people") renderPeople();
  });

  function refresh() {
    for (const r of RULES) paintCell(r.id);
    if (view === "people") renderPeople();
    renderRuleTable();
  }

  // ---- cohorts ------------------------------------------------------------------------------------
  /** Shows the cohorts ([{ week, from, to, detected, closed, open, dismissed, share }]) and the cohort's rate. */
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
    drawChart(weeks);
  }

  function drawChart(weeks) {
    clear(chart);
    const ordered = [...weeks].sort((a, b) => b.week - a.week); // oldest (week 8) on the left
    const W = 640;
    const H = 210;
    const pad = { l: 40, r: 128, t: 14, b: 34 };
    const max = Math.max(4, ...ordered.map((w) => w.detected));
    const step = niceStep(max);
    const top = Math.ceil(max / step) * step;
    const x = (i) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, ordered.length - 1);
    const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
    const ns = "http://www.w3.org/2000/svg";
    const el = (tag, attrs = {}, text) => {
      const n = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
      if (text !== undefined) n.textContent = text;
      return n;
    };
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "cohort-svg", role: "img", "aria-labelledby": "cohort-svg-title" });
    svg.appendChild(el("title", { id: "cohort-svg-title" }, `Weekly cohorts, oldest first: ${ordered.map((w) => `week ${w.week} detected ${w.detected}, closed ${w.closed}, still open ${w.open}`).join("; ")}`));
    for (let v = 0; v <= top; v += step) {
      svg.appendChild(el("line", { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: "grid" }));
      svg.appendChild(el("text", { x: pad.l - 8, y: y(v) + 4, class: "tick", "text-anchor": "end" }, int(v)));
    }
    ordered.forEach((w, i) => svg.appendChild(el("text", { x: x(i), y: H - 12, class: "tick", "text-anchor": "middle" }, `Wk ${w.week}`)));
    const series = [
      { key: "detected", label: "Detected", cls: "s-detected", size: 6.5 },
      { key: "closed", label: "Closed", cls: "s-closed", size: 5.5 },
      { key: "open", label: "Still open", cls: "s-open", size: 5.5 }
    ];
    const ends = [];
    for (const s of series) {
      const pts = ordered.map((w, i) => [x(i), y(w[s.key])]);
      svg.appendChild(el("path", { d: pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`).join(" "), class: `line ${s.cls}` }));
      for (const [px, py] of pts) svg.appendChild(el("polygon", { points: hexPoints(px, py, s.size), class: `marker ${s.cls}` }));
      const last = ordered[ordered.length - 1];
      ends.push({ s, y: y(last[s.key]), v: last[s.key] });
    }
    // Direct labels at the right end, spread so they never overlap.
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 16) ends[i].y = ends[i - 1].y + 16;
    for (const e of ends) svg.appendChild(el("text", { x: W - pad.r + 12, y: e.y + 4, class: `end-label ${e.s.cls}` }, `${e.s.label} ${int(e.v)}`));
    chart.appendChild(svg);
  }

  // ---- reset and idle state ------------------------------------------------------------------------
  function reset() {
    byRule.clear();
    ai.clear();
    drafts.clear();
    lastFilters.clear();
    approved = null;
    caseIds = new Set();
    focus.rules = new Set();
    focus.records = new Set();
    focus.people = new Set();
    lastScope = "";
    scopeEl.textContent = "Before the first scan the rules are neutral. Start the agent to scan them.";
    closeRule();
    setView("rules");
    refresh();
  }

  /** The caption's second line: what the board shows and as of when. */
  function setAsOf(text) {
    sub.textContent = text;
  }

  /**
   * What the board's rule tables hold, one row per exception in the order of the rules: the latest
   * scan of each rule, with the status, the suggestion and the case mark the table shows (the
   * exceptions export is built from this, so the file and the screen cannot differ).
   */
  function snapshot() {
    const rows = [];
    for (const r of RULES) {
      const d = byRule.get(r.id);
      if (!d) continue;
      for (const e of d.exceptions) {
        const v = shown(e);
        rows.push({
          ...e, rule_name: r.name, dimension: r.dimension, record_type: r.record, scan_id: d.scanId, scope: d.scope,
          responsible_label: personLabel(world, e.responsible), routed_to_label: personLabel(world, e.routed_to),
          financing: r.financing, status_shown: v.status, suggestion_shown: v.suggestion, in_case: caseIds.has(e.id)
        });
      }
    }
    return rows;
  }

  refresh();
  return { showCohorts, setAsOf, reset, setView, snapshot, el: root };
}

function niceStep(max) {
  const raw = max / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/** A flat-top hexagon around (x, y) with radius r. */
function hexPoints(x, y, r) {
  const pts = [];
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 3) * k;
    pts.push(`${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}

function cap(s) {
  const t = String(s || "");
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

function cssId(s) {
  return String(s).replace(/["\\]/g, "\\$&");
}
