// The agent's 17 tools: the JSON Schemas the model sees, and the executors that run in the browser
// (and under Node in the tests and the script checker). Both producers use this one toolbox: the live
// agent with the model's inputs, the simulation player with a script's inputs. So a scripted replay is
// held to exactly the guardrails a live run is, and the script checker proves it by running every
// script through here along every decision path.
//
// Guardrails enforced in code (section 7 of the method; TECH_NOTES §6):
//   - every input is validated against its tool's schema; a failure returns is_error with the fields;
//   - only the rules find exceptions: groupings, alerts, reviews and options rest on this run's dq_scan;
//   - a verified alert names a dq_group result and a group holding at least half of its base, after
//     at least three of the case's records were read (all when fewer) and, for DQ-01, the covering
//     contract; the refusal says what is missing;
//   - AI-suggested material groups use a code of the taxonomy and words of the short text, wait for a
//     review, and count as fixes only once approved;
//   - options are two or three distinct applicable paths of the latest dq_fix_paths call for the case;
//     a decision counts once and only for the options on screen; nothing is proposed after an approval;
//   - drafts follow an approval and only of the kinds its path allows; code adds tables and footers;
//   - the report waits for the decision and every draft, and its outcome follows the decision;
//   - every alert, option text, review note, draft and report passes the figure audit: two refusals,
//     then the text shows with an "Unchecked" tag, never silently.

import { scan as runScan, context as engineContext, GROUP_KEYS, valuesOf, matchesFilters, spendOf, isLive, ENGINE_VERSION } from "./engine.js";
import { reconcile, closureRate, cohorts, share14, inflow, recordAsException } from "./history.js";
import { fixPaths } from "./fixpaths.js";
import { RULES, RULE_IDS, ruleById, RULE_SET_VERSION } from "./rules.js";
import { PARAMS } from "./params.js";
import { ERP_TOOLS, DATA_PRODUCTS, FILTER_OPS, MAX_ROWS, personLabel, worldIds, indexOf, valueEur } from "./erp.js";
import { validate, describeErrors } from "./validate.js";
import { KnownFigures, auditText, addDates } from "./figures.js";
import { figuresOf } from "./sim_vars.js";
import { KINDS_BY_PATH, KIND_LABELS, DRAFT_KINDS, changeTable, recordList, finalizeDraft } from "./drafts.js";
import { projectedRate, coveredBy } from "./payoff.js";
import { summarizeToolResult } from "./summaries.js";

export const OUTCOMES = Object.freeze(["fix_approved", "risk_accepted", "nothing_found", "stopped"]);
export const PATH_IDS = Object.freeze(["A", "B", "C", "D"]);
export const UI_BLOCKING_TOOLS = new Set(["ui_await_decision", "ui_await_approvals", "ui_request_review"]);
const FIGURE_RETRIES = 2;
const CONFIDENCE = ["high", "medium", "low"];

// ---- schemas ------------------------------------------------------------------------------------------

const ruleList = (description) => ({ type: "array", items: { type: "string", enum: RULE_IDS }, description });
const FILTERS = {
  type: "array", maxItems: 4,
  description: "Optional filters by grouping key, e.g. [{\"key\": \"plant\", \"values\": [\"3010\"]}]; an exception matches when one of its values is listed.",
  items: { type: "object", properties: { key: { type: "string", enum: GROUP_KEYS }, values: { type: "array", minItems: 1, maxItems: 20, items: { type: "string" } } }, required: ["key", "values"], additionalProperties: false }
};
/** Filters as the engine takes them: [{ key, values }] → { key: values }; null when there are none. */
function filterObject(list) {
  if (!Array.isArray(list) || !list.length) return null;
  const out = {};
  for (const f of list) out[f.key] = [...new Set([...(out[f.key] || []), ...f.values.map(String)])];
  return out;
}
const CASE_REF = {
  grouping: { type: "string", description: "The grouping_id of a dq_group result in this run, e.g. grp-2." },
  group: { type: "string", description: "The group's label exactly as dq_group returned it, e.g. \"punch-out\" (two keys: \"value1 | value2\")." }
};

const DEFINITIONS = [
  { name: "erp_get_overview", kind: "Data",
    description: "Company codes, plants, the five data products and the exception log with row counts and the as-of day, the rule catalogue, the material-group taxonomy, the grouping keys and the method's parameters. Call first.",
    input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "erp_query", kind: "Data",
    description: `Rows of one data product with filters (eq, ne, in, gte, lte, empty, not_empty), sorted, at most ${MAX_ROWS} rows plus the total count. Day fields are relative to today (day 0, negative is past).`,
    input_schema: {
      type: "object",
      properties: {
        product: { type: "string", enum: DATA_PRODUCTS },
        filters: { type: "array", maxItems: 8, items: { type: "object", properties: {
          field: { type: "string" }, op: { type: "string", enum: FILTER_OPS },
          value: { type: ["string", "number", "boolean"], description: "For eq, ne, gte, lte." },
          values: { type: "array", items: { type: ["string", "number"] }, description: "For in." }
        }, required: ["field", "op"], additionalProperties: false } },
        fields: { type: "array", items: { type: "string" }, description: "Only these fields (default: all)." },
        order_by: { type: "string" },
        descending: { type: "boolean" },
        limit: { type: "integer", minimum: 1, maximum: MAX_ROWS, description: `At most ${MAX_ROWS}; default 20.` }
      },
      required: ["product"], additionalProperties: false
    } },
  { name: "erp_get_record", kind: "Data",
    description: "One record with all its fields and its related records (supplier, material, contract, requester, buyer, their managers). Reading a case's records is required before its alert.",
    input_schema: { type: "object", properties: { product: { type: "string", enum: DATA_PRODUCTS }, id: { type: "string" } }, required: ["product", "id"], additionalProperties: false } },
  { name: "dq_scan", kind: "Engine",
    description: "Runs all rules or a subset (optionally filtered) and reconciles the result with the exception log. Returns exceptions by rule, data product, severity and routed-to person, the spend they touch, the financing cost, the clean spend share and closure rate after reconciliation, and the top exceptions. Only exceptions a scan returned can be grouped, alerted or fixed.",
    input_schema: { type: "object", properties: { rules: ruleList("Default: all fifteen."), filters: FILTERS }, additionalProperties: false } },
  { name: "dq_group", kind: "Engine",
    description: `Groups the scanned exceptions of one or more rules (optionally filtered) by one or two keys (${GROUP_KEYS.join(", ")}). Returns a grouping_id, the base and per group its label, count, spend over distinct lines and share of the base. A case is one group holding at least half of its base.`,
    input_schema: { type: "object", properties: {
      rules: { ...ruleList("The rules to group."), minItems: 1 },
      by: { type: "array", minItems: 1, maxItems: 2, items: { type: "string", enum: GROUP_KEYS }, description: "One or two keys." },
      filters: FILTERS
    }, required: ["rules", "by"], additionalProperties: false } },
  { name: "dq_suggest", kind: "Engine",
    description: "The deterministic suggestion for each exception of a case (from the contract, the supplier's terms or the material master), or none, and which free-text lines need an AI-suggested material group.",
    input_schema: { type: "object", properties: { ...CASE_REF }, required: ["grouping", "group"], additionalProperties: false } },
  { name: "dq_classify", kind: "Record (AI)",
    description: "Records your proposed material group for free-text order lines of this run's DQ-02 exceptions: a code of the taxonomy, the words of the short text it rests on and a confidence. Code refuses unknown codes and words that are not in the short text. Every value is AI-suggested and waits for a person's review (ui_request_review).",
    input_schema: { type: "object", properties: {
      items: { type: "array", minItems: 1, maxItems: 40, items: { type: "object", properties: {
        line_id: { type: "string" }, group_code: { type: "string" },
        words: { type: "array", minItems: 1, maxItems: 6, items: { type: "string" }, description: "Words or phrases taken from the line's short text." },
        confidence: { type: "string", enum: CONFIDENCE }
      }, required: ["line_id", "group_code", "words", "confidence"], additionalProperties: false } }
    }, required: ["items"], additionalProperties: false } },
  { name: "dq_history", kind: "Engine",
    description: "From the exception log as it stood before this run's scan: the closure rate and the eight weekly cohorts, the 14-day closure share and the monthly inflow, for some rules or for a case (give rules, or grouping and group).",
    input_schema: { type: "object", properties: { rules: ruleList("For these rules."), ...CASE_REF }, additionalProperties: false } },
  { name: "dq_fix_paths", kind: "Engine",
    description: "Fix paths A to D and doing nothing for a case, with every figure of the method: exceptions closed, spend covered, financing cost avoided now, exceptions prevented and future cost avoided a year, one-off effort, days, and the closure rate projected after re-scan. Approved AI suggestions count; unreviewed ones do not.",
    input_schema: { type: "object", properties: { ...CASE_REF }, required: ["grouping", "group"], additionalProperties: false } },
  { name: "ui_mark_board", kind: "Screen",
    description: "Highlights rules, records and people on the data-quality board while you read them (a fjord outline), and switches between the Rules and People views.",
    input_schema: { type: "object", properties: {
      rules: ruleList("Rule cells to highlight."), records: { type: "array", maxItems: 40, items: { type: "string" } },
      people: { type: "array", maxItems: 20, items: { type: "string" }, description: "User ids." }, view: { type: "string", enum: ["rules", "people"] }
    }, additionalProperties: false } },
  { name: "ui_request_review", kind: "Person",
    description: "Opens the review of AI-suggested material groups for the given lines (each must carry a pending dq_classify suggestion), shows Your confirmation and waits for the person, who approves or rejects each. Returns the decisions.",
    input_schema: { type: "object", properties: {
      line_ids: { type: "array", minItems: 1, maxItems: 40, items: { type: "string" } },
      note: { type: "string", maxLength: 400, description: "One sentence for the reviewer." }
    }, required: ["line_ids", "note"], additionalProperties: false } },
  { name: "ui_report_alert", kind: "Screen",
    description: "Shows the verified case: the dq_group result and the group its root cause rests on, the root cause, the change at its source and a two-sentence summary; code adds the affected records, spend, financing cost, routing and what was checked in this run. Refused, with what is missing, unless this run scanned the rules, the group holds at least half of its base, at least three of the case's records were read (all when fewer) and, for DQ-01, the covering contract.",
    input_schema: { type: "object", properties: {
      title: { type: "string", maxLength: 120 }, ...CASE_REF,
      root_cause: { type: "string", maxLength: 400 }, fix_at_source: { type: "string", maxLength: 300, description: "What would stop the errors where they arise." },
      summary: { type: "string", maxLength: 600 }
    }, required: ["title", "grouping", "group", "root_cause", "fix_at_source", "summary"], additionalProperties: false } },
  { name: "ui_propose_options", kind: "Person",
    description: "Shows two or three applicable fix paths of your latest dq_fix_paths call for the alerted case, plus doing nothing, with your recommendation. The cards' figures come from that result; your texts add what the path means here. Then call ui_await_decision.",
    input_schema: { type: "object", properties: {
      fix_paths_id: { type: "string" },
      options: { type: "array", minItems: 2, maxItems: 3, items: { type: "object", properties: {
        path: { type: "string", enum: PATH_IDS }, title: { type: "string", maxLength: 90 },
        description: { type: "string", maxLength: 400 }, residual_risk: { type: "string", maxLength: 300 }
      }, required: ["path", "title", "description", "residual_risk"], additionalProperties: false } },
      recommended: { type: "string", enum: PATH_IDS },
      nothing_note: { type: "string", maxLength: 300, description: "One sentence: what happens if nothing is done." }
    }, required: ["fix_paths_id", "options", "recommended", "nothing_note"], additionalProperties: false } },
  { name: "ui_await_decision", kind: "Person",
    description: "Waits for the person's decision on the options on screen. Returns it: an approved path, a rejected one (then call again), or the accepted risk.",
    input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "ui_draft_action", kind: "Outbox",
    description: "Queues one draft in the outbox for approval; nothing is ever sent. Only the kinds the approved path allows: change_request (A, C; code adds the table of records, fields, old and new values), follow_up (B, D; one per routed-to person; code adds their records), prevention (C, D; the change at the root cause's source), risk_memo (doing nothing; the accepted risk and its reason).",
    input_schema: { type: "object", properties: {
      kind: { type: "string", enum: DRAFT_KINDS }, recipient: { type: "string", description: "The user id of the recipient." },
      subject: { type: "string", maxLength: 160 }, body: { type: "string", maxLength: 3000 }
    }, required: ["kind", "recipient", "subject", "body"], additionalProperties: false } },
  { name: "ui_await_approvals", kind: "Person",
    description: "Waits until the person has approved or rejected every draft in the outbox. Returns each decision.",
    input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "ui_final_report", kind: "Summary",
    description: "Ends the run with an outcome that follows the decision (fix_approved, risk_accepted, nothing_found, stopped) and a short Markdown report.",
    input_schema: { type: "object", properties: { outcome: { type: "string", enum: OUTCOMES }, markdown: { type: "string", maxLength: 12000 } }, required: ["outcome", "markdown"], additionalProperties: false } }
];

export const TOOL_NAMES = Object.freeze(DEFINITIONS.map((d) => d.name));
export const TOOL_KINDS = Object.freeze(Object.fromEntries(DEFINITIONS.map((d) => [d.name, d.kind])));
const SCHEMA = new Map(DEFINITIONS.map((d) => [d.name, d.input_schema]));

// Keywords strict tool use does not support; the model's copy of a schema leaves them out (the
// descriptions say the bounds) and the app's validator enforces them on every input.
const NOT_STRICT = new Set(["minimum", "maximum", "minLength", "maxLength", "maxItems", "exclusiveMinimum", "exclusiveMaximum"]);
function forModel(schema) {
  if (Array.isArray(schema)) return schema.map(forModel);
  if (!schema || typeof schema !== "object") return schema;
  const out = {};
  for (const [k, v] of Object.entries(schema)) {
    if (NOT_STRICT.has(k)) continue;
    if (k === "minItems" && v > 1) continue;
    out[k] = k === "properties" ? Object.fromEntries(Object.entries(v).map(([p, s]) => [p, forModel(s)])) : forModel(v);
  }
  return out;
}

/** The tool list sent to the model. */
export function toolDefinitions() {
  return DEFINITIONS.map((d) => ({ name: d.name, description: d.description, input_schema: forModel(d.input_schema) }));
}

/** Validates a tool input against its full schema. Returns null or an instructive message. */
export function inputError(name, input) {
  const schema = SCHEMA.get(name);
  if (!schema) return `Unknown tool "${name}". Tools: ${TOOL_NAMES.join(", ")}.`;
  const v = validate(input ?? {}, schema);
  return v.ok ? null : describeErrors(v.errors, `${name} input`);
}

// ---- helpers ------------------------------------------------------------------------------------------

const byId = (a, b) => String(a).localeCompare(String(b), "en", { numeric: true });
const sameFilters = (a, b) => JSON.stringify(normFilters(a)) === JSON.stringify(normFilters(b));
function normFilters(f) {
  const out = {};
  for (const k of Object.keys(f || {}).sort()) {
    const v = f[k];
    if (v === undefined || v === null || (Array.isArray(v) && !v.length)) continue;
    out[k] = (Array.isArray(v) ? v : [v]).map(String).sort(byId);
  }
  return out;
}
/** Does a scan with filters `outer` cover everything a request with filters `inner` looks at? */
function filtersCover(outer, inner) {
  const o = normFilters(outer);
  const i = normFilters(inner);
  return Object.entries(o).every(([k, vals]) => i[k] && i[k].every((v) => vals.includes(v)));
}
function words(text) {
  return String(text || "").toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).filter(Boolean);
}
/** Does the phrase (one or more words) appear in the text, as consecutive words? */
function phraseIn(phrase, text) {
  const p = words(phrase);
  const t = words(text);
  if (!p.length) return false;
  for (let i = 0; i + p.length <= t.length; i++) if (p.every((w, j) => t[i + j] === w)) return true;
  return false;
}
/** Sentences: split at line breaks and after ".", "!" or "?" followed by a space (so "69.7%" stays whole). */
const sentences = (text) => String(text || "").split(/\n+/).flatMap((l) => l.split(/(?<=[.!?])\s+/)).filter((x) => x.trim());
const article = (w) => `${/^[aeiou]/i.test(w) ? "an" : "a"} ${w}`;
/** The contract a DQ-01 exception's suggestion names (the covering contract valid from the latest day). */
const coveringOf = (e) => (e.suggestion && e.suggestion.field === "contract" ? e.suggestion.value : Array.isArray(e.covering) ? e.covering[0] : e.covering);
const coveringContracts = (list) => [...new Set(list.filter((e) => e.rule === "DQ-01").map(coveringOf).filter(Boolean))];
const PROJECTED = /\bproject(ed|ion|s)?\b/i;

// Honesty: nothing reads "closed" for an exception a re-scan still finds. In every text the agent
// writes (alert, review note, options, drafts, report), a sentence that says "closed", or that
// exceptions close now, today, immediately or already, must also name the re-scan, or deny the
// closure ("not closed", "nothing is closed").
const CLOSED = /\bclosed\b/i;
const CLOSES_NOW = /\bclos(e|es|ing)\b[^.!?]*\b(now|today|immediately|already|at once)\b|\b(now|today|immediately|already)\b[^.!?]*\bclos(e|es|ed|ing)\b/i;
const RESCAN = /\bre-?scan/i;
const DENIED = /\b(not|never)\s+((yet|been|be|counted|count|counts|as)\s+)*closed\b|\b(nothing|none|no exceptions?)\b(\s+(of|them|it|these|those|the|exceptions?|entries|lines)){0,3}\s+(is|are|was|were|counts as|count as)\s+(yet\s+)?closed\b/i;
/** The sentences of a text that claim a closure without a re-scan (empty when it is honest). */
export function claimsClosed(text) {
  return sentences(text).filter((x) => (CLOSED.test(x) || CLOSES_NOW.test(x)) && !RESCAN.test(x) && !DENIED.test(x)).map((x) => x.trim());
}

// ---- the toolbox --------------------------------------------------------------------------------------

/**
 * One run's executor. ctx: {
 *   world, day (default 0), today (Date, the app's day 0), params, mode: "live" | "simulation",
 *   emit(type, payload), onPhase(state),
 *   waitFor(kind, test) → Promise of the first matching human event ("option_decision", "action_decision",
 *     "confirmation_decision"); test(ev) returns true to take it,
 *   wholeEuroFloor (correction B8; default true)
 * }
 * execute(name, input) resolves { content (string), isError, result, summary, figures }.
 */
export function createToolbox(ctx) {
  const world = ctx.world;
  const day = ctx.day ?? 0;
  const today = ctx.today || new Date();
  const params = ctx.params || PARAMS;
  const emit = ctx.emit || (() => {});
  const onPhase = ctx.onPhase || (() => {});
  const ix = indexOf(world);
  const ids = worldIds(world);
  const counters = { scan: 0, grp: 0, fp: 0, rev: 0, act: 0 };
  const run = {
    log: (world.exception_log || []).map((x) => ({ ...x })),
    logBefore: (world.exception_log || []).map((x) => ({ ...x })),
    scans: [],               // { id, rules, filters, result }
    scanned: new Map(),      // exception id → exception (every exception a scan returned)
    groupings: new Map(),    // grouping id → { rules, by, filters, scan, result }
    read: new Set(),         // "product:id"
    ai: new Map(),           // line id → { group_code, words, confidence, status: pending|approved|rejected, review }
    reviews: [],
    alert: null,             // the verified case
    fixPaths: new Map(),     // fix_paths id → { caseKey, result, members }
    latestFixPaths: new Map(), // caseKey → fix_paths id
    options: null, optionsSeq: 0, rejected: new Set(), approved: null,
    drafts: new Map(),       // action id → { kind, recipient, status, records }
    followUpsTo: new Set(),
    rejections: { alert: 0, options: 0, review: 0, draft: 0, report: 0 },
    honesty: 0,                     // texts refused because they claimed a closure without a re-scan
    facts: new KnownFigures(),      // ERP results and parameters
    engine: new KnownFigures(),     // engine results (no fix paths, no projections)
    pathFigures: new Map(),         // fix_paths id → KnownFigures
    projections: new Map(),         // fix_paths id → KnownFigures (only in sentences that say "projected")
    reported: false, outcome: null, calls: 0, toolCalls: []
  };
  for (const id of ids) run.facts.id(id);
  run.facts.dayNumber(day); // the run's day (today in a live run): the date the system prompt gives
  for (const [k, v] of Object.entries(params)) run.facts.add(k === "cost_of_capital" ? "share" : k === "day_rate_eur" ? "amount" : /days$/.test(k) ? "days" : "count", v);

  const handlers = {
    erp_get_overview: (i) => ERP_TOOLS.erp_get_overview(world, i, { day, today, params }),
    erp_query: (i) => ERP_TOOLS.erp_query(world, i),
    erp_get_record: (i) => ERP_TOOLS.erp_get_record(world, i),
    dq_scan: dqScan, dq_group: dqGroup, dq_suggest: dqSuggest, dq_classify: dqClassify, dq_history: dqHistory, dq_fix_paths: dqFixPaths,
    ui_mark_board: markBoard, ui_request_review: requestReview, ui_report_alert: reportAlert, ui_propose_options: proposeOptions,
    ui_await_decision: awaitDecision, ui_draft_action: draftAction, ui_await_approvals: awaitApprovals, ui_final_report: finalReport
  };

  async function execute(name, input = {}) {
    run.calls += 1;
    const bad = inputError(name, input);
    let result;
    if (bad) result = { error: bad, refused: "schema" };
    else {
      try {
        result = await handlers[name](input || {});
      } catch (e) {
        if (typeof e === "symbol" || e?.name === "AbortError") throw e;
        console.error(`[Data Quality Agent] tool ${name} failed:`, e);
        result = { error: `The tool failed unexpectedly (${String(e?.message || "unknown error")}). Try different input or another tool.` };
      }
    }
    const isError = !!(result && result.error);
    let figures = [];
    if (!isError) {
      addDates(run.facts, result); // the days and cohorts a date or "Week N" in a text may name
      if (name.startsWith("erp_")) {
        for (const f of result.figures || []) run.facts.add(f.type, f.value, f.currency || "EUR");
        for (const r of result.read || []) run.read.add(`${r.product}:${r.id}`);
      } else {
        figures = figuresOf(name, result);
        addFigures(name, result, figures);
      }
    }
    run.toolCalls.push({ name, ok: !isError });
    const forModel = result && result.figures ? { ...result, figures: undefined } : result;
    if (forModel && "read" in forModel) delete forModel.read;
    return { content: JSON.stringify(forModel), isError, result: forModel, summary: summarizeToolResult(name, forModel), figures };
  }

  function addFigures(name, result, figures) {
    if (name === "dq_fix_paths") {
      const set = new KnownFigures();
      const proj = new KnownFigures();
      for (const f of figures) {
        if (f.type === "text") continue;
        (f.projection ? proj : set).add(f.type, f.value);
      }
      run.pathFigures.set(result.fix_paths_id, set);
      run.projections.set(result.fix_paths_id, proj);
      run.facts.id(result.fix_paths_id);
      return;
    }
    for (const f of figures) if (f.type !== "text") run.engine.add(f.type, f.value);
    if (result.grouping_id) run.facts.id(result.grouping_id);
    if (result.scan_id) run.facts.id(result.scan_id);
  }

  // -- figure audit -------------------------------------------------------------------------------------

  /** The figures a text of one kind may quote. */
  function knownFor(kind, fpId = null) {
    const k = new KnownFigures().merge(run.facts);
    if (kind === "alert" || kind === "review" || kind === "report") k.merge(run.engine);
    if (kind === "alert" || kind === "report") for (const s of run.pathFigures.values()) k.merge(s);
    if (kind === "options") k.merge(run.engine).merge(run.pathFigures.get(fpId) || new KnownFigures());
    if (kind === "draft") k.merge(run.pathFigures.get(fpId) || new KnownFigures());
    for (const id of run.scanned.keys()) k.id(id);
    return k;
  }
  function projectionFor(kind, fpId) {
    if (kind === "report") { const k = new KnownFigures(); for (const s of run.projections.values()) k.merge(s); return k; }
    return run.projections.get(fpId) || new KnownFigures();
  }

  /** Refuses a text that claims a closure no re-scan has shown (see claimsClosed). */
  function honestyCheck(text, kind, tool) {
    const bad = claimsClosed(text);
    if (!bad.length) return null;
    run.honesty += 1;
    return {
      error: `Honesty: ${bad.slice(0, 3).map((x) => `"${x.slice(0, 120)}"`).join("; ")} ${bad.length === 1 ? "claims" : "claim"} a closure, but nothing is closed until a re-scan no longer finds the exception. Write "approved, re-scan pending" for an approved fix, or say what a re-scan would close, then call ${tool} again.`,
      refused: "guard", claims: bad
    };
  }

  /**
   * Audits a text; a sentence that says "projected" may also quote the projections of its result.
   * Returns { reject } (a refusal with the offending tokens), { flag: [tokens] } after two refusals,
   * or {} when every figure is known. Refusals count per text: a text that passes or shows with its
   * "Unchecked" tag resets its kind's count, so the next text of that kind (the follow-up to the next
   * owner, the next set of options) gets its own two refusals (review finding R10; Rebate Hunter
   * counts per kind and run).
   */
  function figureCheck(text, kind, tool, fpId = null) {
    const base = knownFor(kind, fpId);
    const proj = new KnownFigures().merge(base).merge(projectionFor(kind, fpId));
    const opts = { wholeEuroFloor: ctx.wholeEuroFloor !== false, today };
    const offending = [];
    for (const sentence of sentences(text)) {
      const r = auditText(sentence, PROJECTED.test(sentence) ? proj : base, opts);
      offending.push(...r.offending);
    }
    if (!offending.length) { run.rejections[kind] = 0; return {}; }
    const tokens = [...new Set(offending.map((o) => o.token))];
    if (run.rejections[kind] < FIGURE_RETRIES) {
      run.rejections[kind] += 1;
      return { reject: { error: `Figure audit: ${offending.slice(0, 8).map((o) => `"${o.token}" (${o.reason})`).join("; ")}. Quote only figures this run's tools returned, as they are (a projection only in a sentence that says "projected"), or leave the figure out, then call ${tool} again.`, refused: "figures", offending: tokens } };
    }
    run.rejections[kind] = 0;
    emit("notice", { level: "warn", text: `The ${kind === "options" ? "option texts" : kind} quote${kind === "options" ? "" : "s"} figures no tool returned (${tokens.join(", ")}); they show with an "Unchecked" tag.` });
    return { flag: tokens };
  }

  // -- scans --------------------------------------------------------------------------------------------

  function dqScan(i) {
    const rules = i.rules && i.rules.length ? [...new Set(i.rules)] : null;
    const filters = filterObject(i.filters);
    const s = runScan(world, { rules, filters, day, params, log: run.log });
    const rec = reconcile(run.log, s.exceptions, { day, rules, filters, c: s.context });
    run.log = rec.log;
    counters.scan += 1;
    const scanId = `scan-${counters.scan}`;
    for (const e of s.exceptions) run.scanned.set(e.id, e);
    run.scans.push({ id: scanId, rules, filters, result: s });
    const scope = rules || RULE_IDS;
    const byRule = Object.fromEntries(scope.map((r) => [r, 0]));
    const byProduct = {};
    const bySeverity = { high: 0, medium: 0, low: 0 };
    const routed = new Map();
    for (const e of s.exceptions) {
      byRule[e.rule] += 1;
      const p = ruleById(e.rule).product;
      byProduct[p] = (byProduct[p] || 0) + 1;
      bySeverity[e.severity] += 1;
      routed.set(e.routed_to, (routed.get(e.routed_to) || 0) + 1);
    }
    const fin = s.exceptions.filter((e) => ruleById(e.rule).financing);
    const kpi = kpiOfLog();
    const result = {
      scan_id: scanId, rules: rules || "all", filters: filters || null, exceptions: s.exceptions.length,
      by_rule: byRule, by_product: byProduct, by_severity: bySeverity,
      routed_to: [...routed].sort((a, b) => b[1] - a[1] || byId(a[0], b[0])).map(([person, count]) => ({ person, label: personLabel(world, person), count })),
      spend_affected_eur: spendOf(s.context, s.exceptions),
      financing_cost_eur: fin.reduce((t, e) => t + e.financing_cost_eur, 0),
      financing_cost_unpaid_eur: fin.filter((e) => e.unpaid).reduce((t, e) => t + e.financing_cost_eur, 0),
      top: s.exceptions.slice(0, 10).map((e) => ({ id: e.id, rule: e.rule, record: e.record.id, severity: e.severity, spend_eur: e.spend_eur, routed_to: e.routed_to })),
      reconciliation: { still: rec.still.length, closed: rec.closed.length, new: rec.fresh.length, reopened: rec.reopened.length },
      kpi,
      rule_set_version: RULE_SET_VERSION, engine_version: ENGINE_VERSION
    };
    onPhase("scanning");
    emit("board_update", { scan: { id: scanId, rules: scope, exceptions: s.exceptions.map(boardException) }, state: "scanned" });
    emit("kpi_update", { ...kpi, stage: "measured", cohorts: cohorts(run.log, day) });
    return result;
  }

  /** The header's figures from the log as it stands now (open, routed and accepted count). */
  function kpiOfLog() {
    const live = run.log.filter((x) => isLive(x.status));
    const flagged = new Set();
    const ctxScan = run.scans.length ? run.scans[run.scans.length - 1].result.context : engineContext(world, { day, params });
    for (const x of live) { const e = recordAsException(ctxScan, x); if (e) for (const id of e.lines) flagged.add(id); }
    const spend = ctxScan.lines.reduce((t, l) => t + ctxScan.eur(l), 0);
    const clean = ctxScan.lines.filter((l) => !flagged.has(l.id)).reduce((t, l) => t + ctxScan.eur(l), 0);
    const cr = closureRate(run.log, day);
    return { closure_rate: cr.value, closed: cr.closed, eligible: cr.eligible, clean_share: spend > 0 ? clean / spend : null, clean_spend_eur: clean, spend_window_eur: spend, open_exceptions: live.length, open_spend_eur: spend - clean };
  }

  function boardException(e) {
    return {
      id: e.id, rule: e.rule, record: e.record.id, product: e.record.product, severity: e.severity, responsible: e.responsible, routed_to: e.routed_to,
      spend_eur: e.spend_eur, financing_cost_eur: e.financing_cost_eur, unpaid: e.unpaid, suggestion: e.suggestion, status: logStatus(e.id), lines: e.lines
    };
  }
  function logStatus(exceptionId) {
    const x = run.log.find((y) => isLive(y.status) && `${y.rule}|${y.record}` === exceptionId);
    return x ? x.status : "open";
  }

  /** The latest scan of this run that covers the rules and filters. */
  function coveringScan(rules, filters) {
    for (let k = run.scans.length - 1; k >= 0; k--) {
      const s = run.scans[k];
      if ((!s.rules || rules.every((r) => s.rules.includes(r))) && filtersCover(s.filters, filters)) return s;
    }
    return null;
  }

  // -- groups and cases ---------------------------------------------------------------------------------

  function dqGroup(i) {
    const rules = [...new Set(i.rules)];
    const by = [...new Set(i.by)];
    const filters = filterObject(i.filters);
    const s = coveringScan(rules, filters);
    if (!s) return { error: `Only exceptions a dq_scan of this run returned can be grouped. Scan ${rules.join(", ")}${filters ? " (with these filters or wider)" : ""} first.`, refused: "guard" };
    const c = s.result.context;
    const base = s.result.exceptions.filter((e) => rules.includes(e.rule) && (!filters || matchesFilters(c, e, filters)));
    const groups = new Map();
    for (const e of base) {
      const lists = by.map((k) => { const v = valuesOf(c, e, k); return v.length ? v : ["(none)"]; });
      const combos = lists.reduce((acc, list) => acc.flatMap((a) => list.map((v) => [...a, v])), [[]]);
      for (const combo of combos) {
        const label = combo.join(" | ");
        if (!groups.has(label)) groups.set(label, { label, values: Object.fromEntries(by.map((k, n) => [k, combo[n]])), list: [] });
        groups.get(label).list.push(e);
      }
    }
    const all = [...groups.values()].map((g) => ({
      group: g.label, values: g.values, exceptions: g.list.length, share: base.length ? g.list.length / base.length : 0,
      spend_eur: spendOf(c, g.list), members: g.list.map((e) => e.id), sample_records: g.list.slice(0, 5).map((e) => e.record.id)
    })).sort((a, b) => b.exceptions - a.exceptions || b.spend_eur - a.spend_eur || byId(a.group, b.group));
    counters.grp += 1;
    const id = `grp-${counters.grp}`;
    run.groupings.set(id, { rules, by, filters, scan: s, groups: all, base: base.map((e) => e.id) });
    onPhase("verifying");
    return {
      grouping_id: id, rules, by, filters, base: { exceptions: base.length, spend_eur: spendOf(c, base) },
      groups_total: all.length,
      groups: all.slice(0, 10).map(({ members, ...g }) => g),
      note: "A case is one group holding at least half of the base. Read at least three of its records with erp_get_record before ui_report_alert."
    };
  }

  /** A case from a grouping id and a group label: { error } or the case. */
  function caseOf(grouping, group) {
    const g = run.groupings.get(String(grouping));
    if (!g) return { error: `No dq_group result "${grouping}" in this run. Use a grouping_id that dq_group returned.` };
    const hit = g.groups.find((x) => x.group === String(group));
    if (!hit) return { error: `${grouping} has no group "${group}". Its groups: ${g.groups.slice(0, 8).map((x) => `"${x.group}"`).join(", ")}.` };
    const members = hit.members.map((id) => run.scanned.get(id)).filter(Boolean);
    return { grouping: String(grouping), group: hit.group, values: hit.values, rules: g.rules, by: g.by, filters: g.filters, scan: g.scan, base: g.base.length, hit, members, key: `${grouping}|${hit.group}` };
  }

  /** The case's exceptions with approved AI suggestions merged in (unreviewed and rejected ones do not count). */
  function withApprovedAi(members) {
    return members.map((e) => {
      if (e.suggestion) return e;
      const a = e.record.product === "po_line" ? run.ai.get(e.record.id) : null;
      return a && a.status === "approved" && e.rule === "DQ-02" ? { ...e, suggestion: { field: "material_group", value: a.group_code, source: "AI suggestion approved in review" } } : e;
    });
  }

  function dqSuggest(i) {
    const k = caseOf(i.grouping, i.group);
    if (k.error) return { ...k, refused: "guard" };
    const list = withApprovedAi(k.members);
    const needsAi = list.filter((e) => !e.suggestion && e.rule === "DQ-02" && !ix.lines.get(e.record.id)?.material).map((e) => e.record.id);
    onPhase("verifying");
    return {
      grouping_id: k.grouping, group: k.group, exceptions: list.length,
      with_suggestion: list.filter((e) => e.suggestion).length, without_suggestion: list.filter((e) => !e.suggestion).length,
      suggestions: list.filter((e) => e.suggestion).slice(0, 60).map((e) => ({ exception: e.id, record: e.record.id, field: e.suggestion.field, value: e.suggestion.value, source: e.suggestion.source })),
      none: list.filter((e) => !e.suggestion).slice(0, 60).map((e) => e.id),
      needs_ai: needsAi,
      ...(needsAi.length ? { next: "These free-text lines need an AI-suggested material group: propose one per line with dq_classify, then ask for a review with ui_request_review." } : {})
    };
  }

  function dqClassify(i) {
    const accepted = [];
    const refused = [];
    for (const it of i.items) {
      const line = ix.lines.get(String(it.line_id));
      const exc = run.scanned.get(`DQ-02|${it.line_id}`);
      const code = String(it.group_code || "");
      if (!line || !exc) { refused.push({ line_id: it.line_id, reason: "not a DQ-02 exception of this run's scans" }); continue; }
      if (line.material) { refused.push({ line_id: it.line_id, reason: "the line has a material; its group comes from the material master (dq_suggest)" }); continue; }
      if (!ix.taxonomy.has(code)) { refused.push({ line_id: it.line_id, reason: `unknown material group "${code}"; use a code of the taxonomy (erp_get_overview)` }); continue; }
      const missing = it.words.filter((w) => !phraseIn(w, line.short_text));
      if (missing.length) { refused.push({ line_id: it.line_id, reason: `not in the short text "${line.short_text}": ${missing.map((w) => `"${w}"`).join(", ")}` }); continue; }
      const prev = run.ai.get(line.id);
      if (prev && prev.status === "approved") { refused.push({ line_id: it.line_id, reason: "already approved in a review" }); continue; }
      const entry = { line_id: line.id, short_text: line.short_text, group_code: code, group_name: ix.taxonomy.get(code).name, words: it.words.map(String), confidence: it.confidence, status: "pending review" };
      run.ai.set(line.id, { ...entry, status: "pending" });
      accepted.push(entry);
    }
    onPhase("verifying");
    const pending = [...run.ai.values()].filter((a) => a.status === "pending").length;
    if (accepted.length) emit("board_update", { ai: accepted.map((a) => ({ line_id: a.line_id, group_code: a.group_code, status: "pending" })) });
    return {
      accepted, refused, pending_review: pending,
      ...(refused.length && !accepted.length ? { error: `Every suggestion was refused: ${refused.slice(0, 5).map((r) => `${r.line_id} ${r.reason}`).join("; ")}.`, refused_items: refused } : {}),
      next: pending ? "Ask for a review with ui_request_review; unreviewed suggestions never count as fixes." : undefined
    };
  }

  // -- the review (Your confirmation) -------------------------------------------------------------------

  async function requestReview(i) {
    const lines = [...new Set(i.line_ids.map(String))];
    const missing = lines.filter((l) => run.ai.get(l)?.status !== "pending");
    if (missing.length) return { error: `These lines carry no pending AI suggestion: ${missing.slice(0, 8).join(", ")}. Propose one with dq_classify first.`, refused: "guard" };
    let note = String(i.note || "").trim();
    const honest = honestyCheck(note, "review", "ui_request_review");
    if (honest) return honest;
    const audit = figureCheck(note, "review", "ui_request_review");
    if (audit.reject) return audit.reject;
    counters.rev += 1;
    const reviewId = `rev-${counters.rev}`;
    const items = lines.map((l) => { const a = run.ai.get(l); return { line_id: l, short_text: a.short_text, group: a.group_code, group_name: a.group_name, words: a.words, confidence: a.confidence }; });
    // The request goes out before the waiting state, so the rail and the status tag already know
    // that a confirmation is awaited (js/handover.js) when the state arrives.
    emit("confirmation_request", { review_id: reviewId, items, note, ...(audit.flag ? { unchecked: audit.flag } : {}) });
    onPhase("awaiting_approval");
    const ev = await ctx.waitFor("confirmation_decision", (e) => e.payload?.review_id === reviewId);
    const decided = new Map((ev.payload.decisions || []).map((d) => [String(d.line_id), d.decision]));
    const approved = [];
    const rejected = [];
    for (const l of lines) {
      const a = run.ai.get(l);
      if (decided.get(l) === "approved") { a.status = "approved"; approved.push(l); } else { a.status = "rejected"; rejected.push(l); }
      a.review = reviewId;
    }
    run.reviews.push({ id: reviewId, approved, rejected });
    onPhase("verifying");
    emit("board_update", { ai: lines.map((l) => ({ line_id: l, group_code: run.ai.get(l).group_code, status: run.ai.get(l).status })) });
    return { review_id: reviewId, approved, rejected, note: "Approved suggestions count as fixes in dq_fix_paths and go into a mock change request; rejected ones count as no suggestion. Nothing is written to the data." };
  }

  // -- history and fix paths ----------------------------------------------------------------------------

  function dqHistory(i) {
    const hasCase = i.grouping !== undefined || i.group !== undefined;
    if (hasCase && i.rules) return { error: "Give rules, or grouping and group, not both." };
    let rules;
    let inGroup = null;
    let scope;
    if (hasCase) {
      const k = caseOf(i.grouping, i.group);
      if (k.error) return { ...k, refused: "guard" };
      rules = k.rules;
      const c = k.scan.result.context;
      inGroup = (rule, record) => {
        const entry = run.logBefore.find((x) => x.rule === rule && x.record === record);
        const e = recordAsException(c, entry || { rule, record, detected_day: null });
        if (!e) return false;
        if (k.filters && !matchesFilters(c, e, k.filters)) return false;
        return k.by.every((key) => valuesOf(c, e, key).map(String).includes(String(k.values[key])));
      };
      scope = { grouping_id: k.grouping, group: k.group, rules };
    } else {
      rules = i.rules && i.rules.length ? [...new Set(i.rules)] : RULE_IDS.slice();
      scope = { rules };
    }
    const cr = closureRate(run.logBefore, day);
    const h = share14(run.logBefore, rules, day);
    const f = inflow(run.logBefore, rules, day, inGroup);
    onPhase("simulating");
    return {
      scope, from: "the exception log as it stood before this run's scan",
      closure_rate: { value: cr.value, closed: cr.closed, eligible: cr.eligible },
      cohorts: cohorts(run.logBefore, day),
      closure_14d: { share: h.eligible ? h.closed / h.eligible : null, closed: h.closed, eligible: h.eligible },
      inflow_per_month: f
    };
  }

  function dqFixPaths(i) {
    const k = caseOf(i.grouping, i.group);
    if (k.error) return { ...k, refused: "guard" };
    const list = withApprovedAi(k.members);
    const c = k.scan.result.context;
    const h = share14(run.logBefore, k.rules, day);
    const inGroup = (rule, record) => {
      const entry = run.logBefore.find((x) => x.rule === rule && x.record === record);
      const e = recordAsException(c, entry || { rule, record, detected_day: null });
      if (!e) return false;
      if (k.filters && !matchesFilters(c, e, k.filters)) return false;
      return k.by.every((key) => valuesOf(c, e, key).map(String).includes(String(k.values[key])));
    };
    const f = inflow(run.logBefore, k.rules, day, inGroup);
    const fx = fixPaths({ exceptions: list, lineValue: (id) => { const l = c.lineById.get(id); return l ? c.eur(l) : 0; }, history: { closed: h.closed, eligible: h.eligible }, inflow_per_month: f }, params);
    const routed = new Map();
    for (const e of list) routed.set(e.routed_to, (routed.get(e.routed_to) || 0) + 1);
    const paths = {};
    for (const id of PATH_IDS) {
      const p = fx.paths[id];
      // A mass correction is projected by a re-scan within the scope of the scan that found the case.
      paths[id] = { ...p, projected_closure_rate: p.applicable ? projectedRate(world, run.log, id, { caseExceptions: list, closed: p.closed, day, params, rules: k.scan.rules, filters: k.scan.filters }) : null };
    }
    paths.nothing = { ...fx.paths.nothing };
    counters.fp += 1;
    const id = `fp-${counters.fp}`;
    run.fixPaths.set(id, { caseKey: k.key, case: k, list, result: null });
    run.latestFixPaths.set(k.key, id);
    const result = {
      fix_paths_id: id, grouping_id: k.grouping, group: k.group, rules: k.rules,
      case: {
        n: fx.n, s: fx.s, c: fx.c, e: fx.e, f: fx.f, E: fx.E, spend_eur: fx.spend_eur, unpaid_cost_eur: fx.unpaid_cost_eur,
        share14: fx.e ? fx.c / fx.e : null, ai_approved: list.filter((e) => e.suggestion?.source === "AI suggestion approved in review").length,
        routed_to: [...routed].sort((a, b) => b[1] - a[1] || byId(a[0], b[0])).map(([person, count]) => ({ person, label: personLabel(world, person), count }))
      },
      paths,
      measured_closure_rate: closureRate(run.log, day).value,
      notes: [
        "Financing costs are one-off amounts or a yearly run rate, never savings; E is past and no path recovers it.",
        "Projected closure rates are what a re-scan would show after the path; nothing is closed until a re-scan no longer finds the exception.",
        "Effort and lead times rest on the method's parameters, which are assumptions."
      ]
    };
    run.fixPaths.get(id).result = result;
    onPhase("simulating");
    return result;
  }

  // -- the board ----------------------------------------------------------------------------------------

  function markBoard(i) {
    const rules = (i.rules || []).filter((r) => RULE_IDS.includes(r));
    const records = (i.records || []).map(String).filter((r) => ids.has(r) || run.scanned.has(r) || [...run.scanned.values()].some((e) => e.record.id === r));
    const people = (i.people || []).map(String).filter((p) => ix.users.has(p));
    const ignored = [...(i.records || []).map(String).filter((r) => !records.includes(r)), ...(i.people || []).map(String).filter((p) => !people.includes(p))];
    emit("board_update", { focus: { rules, records, people }, ...(i.view ? { view: i.view } : {}) });
    return { ok: true, marked: rules.length + records.length + people.length, ...(ignored.length ? { ignored_unknown_ids: ignored } : {}) };
  }

  // -- the verified alert ---------------------------------------------------------------------------------

  /** What a case still lacks before its alert, or null. */
  function alertMissing(k) {
    const lacks = [];
    if (k.hit.share < 0.5) {
      lacks.push(`the group "${k.group}" holds ${k.hit.exceptions} of ${k.base} exceptions of ${k.grouping} (${Math.round(k.hit.share * 1000) / 10} %), less than half; group by another key or narrow the filters so one group holds at least half`);
    }
    const recordKey = (e) => {
      if (e.record.product === "po_line") return [[`po_line:${e.record.id}`]];
      if (e.record.pair) return [e.record.pair.map((s) => `supplier:${s}`)];
      if (e.record.product === "supplier") return [[`supplier:${e.record.supplier || e.record.id}`]];
      return [[`${e.record.product}:${e.record.id}`]];
    };
    const isRead = (e) => recordKey(e).every((alts) => alts.every((key) => run.read.has(key)));
    const read = k.members.filter(isRead).length;
    const need = Math.min(3, k.members.length);
    if (read < need) {
      const unread = k.members.filter((e) => !isRead(e)).slice(0, 3).map((e) => e.record.pair ? `suppliers ${e.record.pair.join(" and ")}` : `${e.record.product} ${e.record.supplier || e.record.id}`);
      lacks.push(`${read} of the case's records read with erp_get_record, ${need} needed; read for example ${unread.join(", ")}`);
    }
    const covering = coveringContracts(k.members);
    const unreadContracts = covering.filter((cid) => !run.read.has(`contract:${cid}`));
    if (unreadContracts.length) lacks.push(`the covering contract${unreadContracts.length > 1 ? "s" : ""} of the DQ-01 exceptions not read: ${unreadContracts.join(", ")} (erp_get_record, product contract)`);
    return lacks.length ? { lacks, read } : { read };
  }

  function reportAlert(i) {
    const k = caseOf(i.grouping, i.group);
    if (k.error) return { ...k, refused: "guard" };
    const miss = alertMissing(k);
    if (miss.lacks) return { error: `Verified alert refused. Missing: ${miss.lacks.join("; ")}.`, refused: "guard", missing: miss.lacks };
    const texts = { title: String(i.title).trim(), root_cause: String(i.root_cause).trim(), fix_at_source: String(i.fix_at_source).trim(), summary: String(i.summary).trim() };
    const honest = honestyCheck(Object.values(texts).join("\n"), "alert", "ui_report_alert");
    if (honest) return honest;
    const audit = figureCheck(Object.values(texts).join("\n"), "alert", "ui_report_alert");
    if (audit.reject) return audit.reject;
    const c = k.scan.result.context;
    const list = withApprovedAi(k.members);
    const routed = new Map();
    for (const e of list) routed.set(e.routed_to, (routed.get(e.routed_to) || 0) + 1);
    const lines = new Set(list.flatMap((e) => e.lines));
    const fin = list.reduce((t, e) => t + e.financing_cost_eur, 0);
    const unpaid = list.filter((e) => e.unpaid).reduce((t, e) => t + e.financing_cost_eur, 0);
    const covering = coveringContracts(list);
    const checked = [
      `dq_scan ${k.scan.id}`,
      `dq_group ${k.grouping}: "${k.group}" holds ${k.hit.exceptions} of ${k.base}`,
      `${miss.read} of ${list.length} records read`,
      ...(covering.length ? [`covering contract${covering.length > 1 ? "s" : ""} ${covering.join(", ")} read`] : [])
    ];
    run.alert = { ...k, members: list };
    const severity = list.some((e) => e.severity === "high") ? "high" : list.some((e) => e.severity === "medium") ? "medium" : "low";
    const payload = {
      ...texts, severity, grouping_id: k.grouping, group: k.group, group_values: k.values, rules: k.rules,
      share: k.hit.share, base: k.base, exceptions: list.length, exception_ids: list.map((e) => e.id),
      records: list.map((e) => e.record.id), affected_lines: lines.size, spend_eur: spendOf(c, list), financing_cost_eur: fin, unpaid_cost_eur: unpaid,
      financing: k.rules.some((r) => ruleById(r).financing),
      routing: [...routed].sort((a, b) => b[1] - a[1] || byId(a[0], b[0])).map(([person, count]) => ({ person, label: personLabel(world, person), count })),
      records_read: miss.read, checked, ...(audit.flag ? { unchecked: audit.flag } : {})
    };
    emit("alert", payload);
    emit("board_update", { focus: { rules: k.rules, records: payload.records.slice(0, 40), people: payload.routing.map((p) => p.person) }, case: { exceptions: payload.exception_ids } });
    return { ok: true, shown: true, case: { exceptions: payload.exceptions, affected_lines: payload.affected_lines, spend_eur: payload.spend_eur, financing_cost_eur: fin, unpaid_cost_eur: unpaid, routed_to: payload.routing }, checked, next: "Work out the history and the fix paths for this case (dq_history, dq_fix_paths), then propose the options." };
  }

  // -- options and the decision -----------------------------------------------------------------------------

  function proposeOptions(i) {
    if (run.approved) return { error: `A decision was already taken (${run.approved.label}). Continue with its drafts; options cannot be proposed again.`, refused: "guard" };
    if (!run.alert) return { error: "No verified case yet. Raise the alert with ui_report_alert first.", refused: "guard" };
    const fp = run.fixPaths.get(String(i.fix_paths_id));
    const latest = run.latestFixPaths.get(run.alert.key);
    if (!fp || fp.caseKey !== run.alert.key) return { error: `"${i.fix_paths_id}" is not a dq_fix_paths result for the alerted case (${run.alert.grouping} "${run.alert.group}"). Call dq_fix_paths for it.`, refused: "guard" };
    if (String(i.fix_paths_id) !== latest) return { error: `"${i.fix_paths_id}" is not the latest dq_fix_paths result for the case; use ${latest}.`, refused: "guard" };
    const res = fp.result;
    const chosen = i.options.map((o) => o.path);
    if (new Set(chosen).size !== chosen.length) return { error: "Each fix path may appear only once.", refused: "guard" };
    const na = chosen.filter((p) => !res.paths[p].applicable);
    if (na.length) return { error: `Not applicable for this case: ${na.join(", ")} (no suggestions to correct with). Choose among ${PATH_IDS.filter((p) => res.paths[p].applicable).join(", ")}.`, refused: "guard" };
    if (!chosen.includes(i.recommended)) return { error: `The recommendation "${i.recommended}" is not one of the options (${chosen.join(", ")}).`, refused: "guard" };
    const texts = i.options.flatMap((o) => [o.title, o.description, o.residual_risk]).concat([i.nothing_note]);
    const honest = honestyCheck(texts.join("\n"), "options", "ui_propose_options");
    if (honest) return honest;
    const audit = figureCheck(texts.join("\n"), "options", "ui_propose_options", res.fix_paths_id);
    if (audit.reject) return audit.reject;
    run.optionsSeq += 1;
    run.rejected.clear();
    const letterless = i.options.map((o) => ({
      id: o.path, path: o.path, title: String(o.title).trim(), description: String(o.description).trim(), residual_risk: String(o.residual_risk).trim(),
      recommended: o.path === i.recommended, figures: { ...res.paths[o.path] }
    }));
    run.options = { seq: run.optionsSeq, fixPathsId: res.fix_paths_id, list: letterless, nothingNote: String(i.nothing_note).trim() };
    onPhase("options");
    emit("options", {
      options_seq: run.optionsSeq, fix_paths_id: res.fix_paths_id, grouping_id: res.grouping_id, group: res.group, recommended: i.recommended,
      case: res.case, options: letterless, measured_closure_rate: res.measured_closure_rate,
      nothing: { id: "nothing", note: run.options.nothingNote, figures: { ...res.paths.nothing } }, ...(audit.flag ? { unchecked: audit.flag } : {})
    });
    return { shown: true, options_seq: run.optionsSeq, paths: chosen, next: "Call ui_await_decision to wait for the person's decision." };
  }

  async function awaitDecision() {
    if (!run.options) return { error: "No options are on screen. Use ui_propose_options first.", refused: "guard" };
    if (run.approved) return { error: `A decision was already taken (${run.approved.label}). Continue with the drafts.`, refused: "guard" };
    const remaining = () => run.options.list.filter((o) => !run.rejected.has(o.id));
    onPhase("awaiting_approval");
    const ev = await ctx.waitFor("option_decision", (e) => {
      const p = e.payload || {};
      const valid = p.options_seq === run.options.seq && (p.option_id === "nothing" ? p.decision === "approved" : remaining().some((o) => o.id === p.option_id));
      if (!valid) emit("notice", { level: "warn", guardrail: true, text: `Guardrail: a decision on ${p.options_seq !== run.options.seq ? "options that are no longer on screen" : `option ${p.option_id}, which is not open`} was ignored. A decision counts once and only for the options on screen.` });
      return valid;
    });
    const { option_id: id, decision } = ev.payload;
    if (decision === "approved") {
      const opt = run.options.list.find((o) => o.id === id);
      run.approved = { id, label: id === "nothing" ? "Do nothing (accept the risk)" : `${id}: ${opt.title}` };
      const res = run.fixPaths.get(run.options.fixPathsId).result;
      // The case as it stands now: AI suggestions approved after the alert count here as they did in
      // dq_fix_paths (review finding R6).
      const covered = coveredBy(id, withApprovedAi(run.alert.members));
      const projected = id === "nothing" ? null : res.paths[id].projected_closure_rate;
      emit("kpi_update", { stage: "projected", closure_rate: res.measured_closure_rate, projected_closure_rate: projected, path: id });
      emit("board_update", { approved: { path: id, exceptions: covered } });
      onPhase("executing");
      const kinds = KINDS_BY_PATH[id];
      const people = id === "B" || id === "D" ? res.case.routed_to : [];
      return {
        decision: "approved", path: id, option: run.approved.label, title: id === "nothing" ? "Do nothing" : opt.title, note: String(ev.payload.note || "").slice(0, 300),
        ...(projected !== null ? { projected_closure_rate: projected, status: "approved, re-scan pending" } : { status: "risk accepted" }),
        draft_kinds: kinds,
        ...(people.length ? { follow_up_recipients: people } : {}),
        next: id === "nothing"
          ? "The person accepted the risk. Draft one risk_memo recording the accepted risk and its reason, then ui_await_approvals, then ui_final_report with outcome risk_accepted."
          : `Draft what path ${id} allows and nothing else: ${kinds.map((k) => (k === "follow_up" ? `one follow_up per routed-to person (${people.map((p) => p.person).join(", ")})` : k)).join(", ")}. Then ui_await_approvals, then ui_final_report with outcome fix_approved. Say "approved, re-scan pending", never "closed".`
      };
    }
    run.rejected.add(id);
    const left = remaining().map((o) => o.id);
    return {
      decision: "rejected", path: id, remaining: left,
      next: left.length ? "Acknowledge the rejection in one sentence and draft nothing for it. Call ui_await_decision for the next decision." : "Every fix path was rejected. Say so; the person may still accept the risk (call ui_await_decision once more), or end with ui_final_report and outcome stopped."
    };
  }

  // -- drafts and approvals -------------------------------------------------------------------------------

  function draftAction(i) {
    if (!run.approved) return { error: "Drafts follow a decision. Propose options and wait for an approval first.", refused: "guard" };
    const path = run.approved.id;
    const allowed = KINDS_BY_PATH[path];
    if (!allowed.includes(i.kind)) {
      return { error: `Path ${path === "nothing" ? "do nothing" : path} allows ${allowed.map((k) => KIND_LABELS[k].toLowerCase()).join(" and ")}, not ${article(KIND_LABELS[i.kind].toLowerCase())}.`, refused: "guard" };
    }
    const recipient = ix.users.get(String(i.recipient));
    if (!recipient) return { error: `Unknown recipient "${i.recipient}". Use a user id (erp_query on user_org).`, refused: "guard" };
    const res = run.fixPaths.get(run.options.fixPathsId).result;
    // The case's exceptions with every AI suggestion approved so far, as dq_fix_paths counted them.
    const members = withApprovedAi(run.alert.members);
    let table = null;
    let list = null;
    let records = [];
    if (i.kind === "follow_up") {
      const mine = members.filter((e) => e.routed_to === recipient.id);
      if (!mine.length) return { error: `${personLabel(world, recipient.id)} has no exception of this case routed to them. Follow-ups go to: ${res.case.routed_to.map((p) => p.person).join(", ")}.`, refused: "guard" };
      if (run.followUpsTo.has(recipient.id)) return { error: `A follow-up to ${recipient.id} is already in the outbox: one per routed-to person.`, refused: "guard" };
      records = mine.map((e) => e.record.id);
      list = recordList(mine.map((e) => ({ record: e.record.id, rule: e.rule, missing: missingText(e) })));
    } else {
      if ([...run.drafts.values()].some((d) => d.kind === i.kind)) return { error: `A ${KIND_LABELS[i.kind].toLowerCase()} is already in the outbox for this case.`, refused: "guard" };
      if (i.kind === "change_request") {
        const rows = members.filter((e) => e.suggestion && e.record.product === "po_line").map((e) => {
          const line = ix.lines.get(e.record.id);
          return { record: e.record.id, field: e.suggestion.field, old: line ? line[e.suggestion.field] : null, new: e.suggestion.value, source: e.suggestion.source };
        });
        records = rows.map((r) => r.record);
        table = changeTable(rows);
      } else {
        records = members.map((e) => e.record.id);
      }
    }
    const subject = String(i.subject).trim();
    const body = String(i.body).trim();
    if (!subject || !body) return { error: "subject and body are required." };
    const honest = honestyCheck(`${subject}\n${body}`, "draft", "ui_draft_action");
    if (honest) return honest;
    const audit = figureCheck(`${subject}\n${body}`, "draft", "ui_draft_action", run.options.fixPathsId);
    if (audit.reject) return audit.reject;
    counters.act += 1;
    const actionId = `act-${counters.act}`;
    const final = finalizeDraft(i.kind, body, { table, list, unchecked: audit.flag || null });
    run.drafts.set(actionId, { kind: i.kind, recipient: recipient.id, status: "pending", records });
    if (i.kind === "follow_up") run.followUpsTo.add(recipient.id);
    onPhase("executing");
    emit("action_draft", { action_id: actionId, kind: i.kind, recipient: personLabel(world, recipient.id), recipient_id: recipient.id, subject, body: final, records, status: "pending", ...(audit.flag ? { unchecked: audit.flag } : {}) });
    return { action_id: actionId, status: "pending approval", note: "Queued in the outbox as a draft. Nothing is sent." };
  }

  function missingText(e) {
    const line = e.record.product === "po_line" ? ix.lines.get(e.record.id) : null;
    switch (e.rule) {
      case "DQ-01": return `contract reference missing; contract ${coveringOf(e)} covers it`;
      case "DQ-02": return "material group missing";
      case "DQ-03": return `material group ${line?.material_group} differs from the master's`;
      case "DQ-04": return "requester missing or unknown";
      case "DQ-05": return `requester ${line?.requester} had left on the order day`;
      case "DQ-06": return "payment terms missing";
      case "DQ-07": return `payment terms ${line?.payment_terms_days} days, shorter than agreed`;
      case "DQ-08": return "ordered after the supplier's purchasing block started";
      case "DQ-15": return `contract ${line?.contract} not valid on the order day`;
      default: return ruleById(e.rule).name.toLowerCase();
    }
  }

  async function awaitApprovals() {
    if (!run.drafts.size) return { error: "There are no drafts. Use ui_draft_action first.", refused: "guard" };
    const pending = () => [...run.drafts.values()].filter((d) => d.status === "pending").length;
    if (pending()) {
      onPhase("awaiting_approval");
      emit("notice", { level: "info", text: `Waiting for your approval of ${pending()} draft${pending() === 1 ? "" : "s"} in the Outbox.` });
      while (pending()) {
        const ev = await ctx.waitFor("action_decision", (e) => run.drafts.get(e.payload?.action_id)?.status === "pending");
        const d = run.drafts.get(ev.payload.action_id);
        d.status = ev.payload.decision === "approved" ? "approved" : "rejected";
        if (d.status === "approved" && (d.kind === "follow_up" || d.kind === "change_request")) routeEntries(d);
      }
    }
    onPhase("executing");
    const decisions = [...run.drafts.entries()].map(([id, d]) => ({ action_id: id, kind: d.kind, recipient: d.recipient, decision: d.status }));
    return { all_decided: true, approved: decisions.filter((d) => d.decision === "approved").length, rejected: decisions.filter((d) => d.decision === "rejected").length, decisions, next: "Write the report with ui_final_report. Approved drafts are cleared for sending by a person; nothing was sent." };
  }

  /**
   * An approved follow-up or change request routes the open log entries of its records that are routed
   * to its recipient (method: "when a person approves a draft to its routed-to person"). A change
   * request to one owner leaves the entries routed to another owner open (review finding R16).
   */
  function routeEntries(d) {
    const recs = new Set(d.records);
    for (const x of run.log) {
      if (x.status !== "open" || !recs.has(x.record) || x.routed_to !== d.recipient) continue;
      if (run.alert.members.some((e) => e.id === `${x.rule}|${x.record}`)) Object.assign(x, { status: "routed", routed_day: day });
    }
  }

  // -- the report -----------------------------------------------------------------------------------------

  function finalReport(i) {
    const pendingCount = [...run.drafts.values()].filter((d) => d.status === "pending").length;
    if (pendingCount) return { error: `${pendingCount} draft${pendingCount === 1 ? " is" : "s are"} still waiting for approval. Call ui_await_approvals first.`, refused: "guard" };
    const allRejected = run.options && !run.approved && run.options.list.every((o) => run.rejected.has(o.id));
    if (run.options && !run.approved && !allRejected) return { error: "The options are still waiting for a decision. Call ui_await_decision first; the report follows the decision.", refused: "guard" };
    const expected = run.approved ? (run.approved.id === "nothing" ? "risk_accepted" : "fix_approved") : allRejected ? "stopped" : null;
    if (expected && i.outcome !== expected) return { error: `The outcome is ${expected}: ${expected === "fix_approved" ? "a fix path was approved" : expected === "risk_accepted" ? "the risk was accepted" : "every fix path was rejected"}. Publish the report with outcome "${expected}".`, refused: "guard" };
    if (!expected && !["nothing_found", "stopped"].includes(i.outcome)) return { error: "No options were proposed, so nothing was decided: use outcome nothing_found (no case found) or stopped.", refused: "guard" };
    if (run.approved && run.approved.id !== "nothing" && run.drafts.size === 0) return { error: "The approved path has no drafts yet. Draft what it allows first (ui_draft_action), then ui_await_approvals.", refused: "guard" };
    let markdown = String(i.markdown || "").trim();
    if (markdown.length < 40) return { error: "The report is empty. Write a short Markdown report." };
    const honest = honestyCheck(markdown, "report", "ui_final_report");
    if (honest) return honest;
    const audit = figureCheck(markdown, "report", "ui_final_report");
    if (audit.reject) return audit.reject;
    if (audit.flag) markdown += `\n\n*Unchecked figures (no tool returned them): ${audit.flag.join(", ")}.*`;
    const footer = ctx.mode === "simulation"
      ? "*Simulation: an authored script replayed with the engine's figures. GlobalCorp SE is fictional; no client data.*"
      : "*Live agent run. GlobalCorp SE is fictional; no client data. Every figure comes from the deterministic rule engine.*";
    if (!markdown.includes(footer)) markdown += `\n\n${footer}`;
    run.reported = true;
    run.outcome = i.outcome;
    emit("report", { markdown, outcome: i.outcome, ...(audit.flag ? { unchecked: audit.flag } : {}) });
    return { ok: true, published: true, outcome: i.outcome, next: "End your turn now with one short closing sentence." };
  }

  return {
    execute,
    state: () => ({
      scans: run.scans.length, alert: !!run.alert, options: !!run.options, approved: run.approved, reported: run.reported, outcome: run.outcome,
      drafts: [...run.drafts.values()].map((d) => ({ kind: d.kind, status: d.status })), rejected: [...run.rejected], ai: [...run.ai.values()].map((a) => ({ line_id: a.line_id, status: a.status })),
      calls: run.calls
    }),
    /** For the recorder and the tests: the run's log after reconciliation and routing. */
    log: () => run.log.map((x) => ({ ...x }))
  };
}
