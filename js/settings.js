// The method's parameters for this tab: the defaults of js/params.js, and the values the person set in
// the Method dialog for Live runs. Every value is an assumption (decision D4). A change is checked
// against its bounds, kept in this tab's session storage (dq.params) and logged with its time, its old
// and its new value; the next live run carries the values in effect and the log into its audit export.
// Simulation always runs on the defaults, so the scripted runs stay valid. The analysis window is fixed
// by the data (the world holds the last 365 days), so it is not editable.

import { PARAMS, PARAM_LABELS } from "./params.js";
import { STORAGE } from "./config.js";

/** The bounds a value must keep (inclusive), and the step its field offers. */
export const PARAM_LIMITS = Object.freeze({
  day_rate_eur: { min: 100, max: 5000, step: 50 },
  hours_per_day: { min: 4, max: 12, step: 0.5 },
  mass_setup_days: { min: 0, max: 20, step: 0.25 },
  mass_minutes_per_record: { min: 0.5, max: 60, step: 0.5 },
  mass_lead_days: { min: 1, max: 90, step: 1 },
  followup_prep_days: { min: 0, max: 5, step: 0.25 },
  followup_owner_minutes: { min: 1, max: 120, step: 1 },
  followup_window_days: { min: 1, max: 60, step: 1 },
  source_fix_days: { min: 0, max: 60, step: 0.5 },
  source_lead_days: { min: 1, max: 180, step: 1 },
  cost_of_capital: { min: 0, max: 0.25, step: 0.005 }
});
/** Parameters that cannot change: the window is the world's. */
export const FIXED_PARAMS = Object.freeze(["window_days"]);

const LOG_LIMIT = 200;  // the log keeps this tab's latest changes

// Session storage holds { values: { name: value }, log: [{ ts, name, label, from, to }] }, so a reload
// keeps both the values in effect and how they came about.
function read() {
  try {
    const raw = JSON.parse(sessionStorage.getItem(STORAGE.params) || "{}");
    const values = {};
    for (const [k, v] of Object.entries(raw.values || {})) if (k in PARAM_LIMITS && valid(k, v)) values[k] = Number(v);
    const log = Array.isArray(raw.log) ? raw.log.filter((c) => c && c.name in PARAM_LIMITS && typeof c.ts === "string"
      && Number.isFinite(c.from) && Number.isFinite(c.to)).slice(-LOG_LIMIT) : [];
    return { values, log };
  } catch {
    return { values: {}, log: [] };
  }
}

function write() {
  try {
    if (Object.keys(overrides).length || changes.length) sessionStorage.setItem(STORAGE.params, JSON.stringify({ values: overrides, log: changes }));
    else sessionStorage.removeItem(STORAGE.params);
  } catch { /* storage unavailable: the values and the log stay for this page only */ }
}

const stored = read();
let overrides = stored.values;
const changes = stored.log;  // this tab's log, oldest first

function valid(name, value) {
  const lim = PARAM_LIMITS[name];
  const v = Number(value);
  return !!lim && Number.isFinite(v) && v >= lim.min && v <= lim.max;
}

/** The parameters a Live run uses: the defaults with this tab's changes. */
export function liveParams() {
  return Object.freeze({ ...PARAMS, ...overrides });
}

/** The parameters that differ from the defaults: [{ name, label, value, default }]. */
export function changedParams() {
  return Object.entries(overrides).filter(([k, v]) => v !== PARAMS[k]).map(([k, v]) => ({ name: k, label: PARAM_LABELS[k][0], value: v, default: PARAMS[k] }));
}

/** This tab's log of changes, oldest first. */
export function paramChanges() {
  return changes.map((c) => ({ ...c }));
}

/**
 * Sets parameters ({ name: value }). Returns { ok, errors: [text], changed: [names] }; nothing is set
 * when any value is out of bounds.
 */
export function setParams(patch) {
  const errors = [];
  for (const [k, v] of Object.entries(patch)) {
    if (FIXED_PARAMS.includes(k)) { errors.push(`${PARAM_LABELS[k]?.[0] || k} is fixed by the data`); continue; }
    if (!(k in PARAM_LIMITS)) { errors.push(`unknown parameter ${k}`); continue; }
    if (v === "" || v === null || v === undefined || !Number.isFinite(Number(v))) errors.push(`${PARAM_LABELS[k][0]} needs a number`);
    else if (!valid(k, v)) errors.push(`${PARAM_LABELS[k][0]} must lie between ${PARAM_LIMITS[k].min} and ${PARAM_LIMITS[k].max}`);
  }
  if (errors.length) return { ok: false, errors, changed: [] };
  const next = { ...overrides };
  const changed = [];
  const ts = new Date().toISOString();
  for (const [k, raw] of Object.entries(patch)) {
    const v = Number(raw);
    const from = next[k] ?? PARAMS[k];
    if (v === from) continue;
    if (v === PARAMS[k]) delete next[k]; else next[k] = v;
    changes.push({ ts, name: k, label: PARAM_LABELS[k][0], from, to: v });
    changed.push(k);
  }
  if (changes.length > LOG_LIMIT) changes.splice(0, changes.length - LOG_LIMIT);
  overrides = next;
  write();
  return { ok: true, errors: [], changed };
}

/** Back to the defaults (logged like any change). */
export function resetParams() {
  return setParams(Object.fromEntries(Object.keys(overrides).map((k) => [k, PARAMS[k]])));
}
