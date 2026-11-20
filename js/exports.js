// The three exports, each named data-quality-<run id>[-SIMULATION | -LIVE]-<kind>: the run's report as
// Markdown, the exceptions as CSV (what the board's rule tables hold, built from the board's own
// snapshot, so the file and the screen cannot differ) and the audit log as JSON (js/audit.js). A
// simulation says so in each file, not only in its name.

import { runFileBase, auditRunInfo, auditEvents } from "./audit.js";
import { RULE_SET_VERSION } from "./rules.js";
import { ENGINE_VERSION } from "./engine.js";

/** The CSV's columns: [header, value of a snapshot row]. Amounts in euros with two decimals. */
export const EXCEPTION_COLUMNS = Object.freeze([
  ["rule", (r) => r.rule],
  ["rule_name", (r) => r.rule_name],
  ["dimension", (r) => r.dimension],
  ["severity", (r) => r.severity],
  ["record_type", (r) => r.record_type],
  ["record", (r) => r.record],
  ["order_lines", (r) => (r.lines || []).length],
  ["responsible", (r) => r.responsible || ""],
  ["responsible_name", (r) => r.responsible_label || ""],
  ["routed_to", (r) => r.routed_to || ""],
  ["routed_to_name", (r) => r.routed_to_label || ""],
  ["spend_affected_eur", (r) => cents(r.spend_eur)],
  ["financing_cost_eur", (r) => (r.financing ? cents(r.financing_cost_eur) : "")],
  ["unpaid", (r) => (r.unpaid === true ? "yes" : r.unpaid === false ? "no" : "")],
  ["suggestion", (r) => r.suggestion_shown],
  ["status", (r) => r.status_shown],
  ["in_case", (r) => (r.in_case ? "yes" : "no")],
  ["scan", (r) => r.scan_id],
  ["mode", (r, ctx) => ctx.mode],
  ["run_id", (r, ctx) => ctx.run_id]
]);

const cents = (v) => (typeof v === "number" && Number.isFinite(v) ? (Math.round(v * 100 + (v >= 0 ? 1e-7 : -1e-7)) / 100).toFixed(2) : "");

/**
 * One CSV cell: quoted when it holds a comma, a quote or a line break; a text that a spreadsheet would
 * read as a formula (=, +, -, @, a tab or a carriage return at its start) is prefixed with a quote mark
 * and kept as text. Numbers stay numbers.
 */
export function csvCell(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The exceptions as CSV text: a byte-order mark (so spreadsheets read UTF-8), a header, one row each, CRLF. */
export function exceptionsCsv(rows, { mode = null, run_id = null } = {}) {
  const ctx = { mode: mode === "simulation" ? "SIMULATION" : mode === "live" ? "LIVE" : "", run_id: run_id || "" };
  const lines = [EXCEPTION_COLUMNS.map(([name]) => name).join(",")];
  for (const r of rows) lines.push(EXCEPTION_COLUMNS.map(([, get]) => csvCell(get(r, ctx))).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** "data-quality-<run>-SIMULATION-exceptions.csv" */
export function exceptionsFileName() {
  return `${runFileBase()}-exceptions.csv`;
}

/** "data-quality-<run>-LIVE-report.md" */
export function reportFileName() {
  return `${runFileBase()}-report.md`;
}

/** The run's last published report (Markdown), or null. */
export function lastReport() {
  const ev = [...auditEvents()].reverse().find((e) => e.type === "report");
  return ev?.payload?.markdown || null;
}

/**
 * The report as a file: a head that says what it is (mode, run, versions, and that an AI agent wrote
 * the text from the engine's figures), then the report itself.
 */
export function reportDocument(markdown, { mode = auditRunInfo()?.mode || null, simSource = auditRunInfo()?.sim_source || null } = {}) {
  const run = auditRunInfo();
  const head = mode === "simulation"
    ? simSource === "recorded"
      ? "> SIMULATION — replay of a recorded live run, not a live analysis. No model was called during the replay; the engine recalculated every figure."
      : "> SIMULATION — scripted replay, not a live analysis. No model was called; every figure comes from the rule engine."
    : mode === "live"
      ? `> LIVE run${run?.model ? ` on ${run.model}` : ""}. An AI agent wrote this report; every figure in it was checked against the rule engine's output. Nothing was sent and no data was changed.`
      : "> No run recorded.";
  const meta = `> Data Quality Agent · run ${run?.run_id || "—"} · rule set ${RULE_SET_VERSION} · engine ${ENGINE_VERSION} · exported ${new Date().toISOString()} · GlobalCorp SE is fictional; no client data.`;
  return `${head}\n${meta}\n\n${String(markdown || "").trim()}\n`;
}
