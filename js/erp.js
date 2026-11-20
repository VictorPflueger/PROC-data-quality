// The three data tools: erp_get_overview, erp_query and erp_get_record, over the world's five data
// products and the exception log. Pure functions of the world (no DOM, no clock but the day given),
// shared by the live agent, the simulation player and the Node tests. Each result also lists the
// typed figures a text may quote from it (`figures`: amounts, counts and days), so the figure audit
// knows what this run's ERP lookups returned without treating every field as a figure.

import { RULES, PRODUCTS, CENTRAL_ROLES } from "./rules.js";
import { PARAMS, PARAM_TYPES, PARAM_LABELS } from "./params.js";
import { GROUP_KEYS } from "./engine.js";
import { dayLabel } from "./format.js";

export const DATA_PRODUCTS = Object.freeze(["po_line", "contract", "supplier", "material", "user_org", "exception_log"]);
export const FILTER_OPS = Object.freeze(["eq", "ne", "in", "gte", "lte", "empty", "not_empty"]);
export const MAX_ROWS = 50;

const LIST = { po_line: "po_lines", contract: "contracts", supplier: "suppliers", material: "materials", user_org: "users", exception_log: "exception_log" };

/** The fields each product can be filtered, sorted and selected by. Nested values flatten with a dot. */
export const FIELDS = Object.freeze({
  po_line: ["id", "po", "item", "company_code", "plant", "supplier", "material", "short_text", "material_group", "quantity", "unit", "value", "currency", "day", "payment_terms_days", "contract", "requester", "buyer", "created_by", "channel"],
  contract: ["id", "supplier", "company_code", "material_group", "valid_from", "valid_to", "payment_terms_days", "owner"],
  supplier: ["id", "name", "country", "city", "currency", "category", "vat_id", "bank.country", "bank.last4", "block_from", "created_day", "onboarding_channel"],
  material: ["id", "description", "material_group", "base_unit"],
  user_org: ["id", "name", "role", "team", "company_code", "active_until", "manager"],
  exception_log: ["id", "rule", "record", "detected_day", "routed_day", "responsible", "routed_to", "status", "closed_day", "reason", "reopens"]
});

const naturally = (a, b) => (typeof a === "number" && typeof b === "number" ? a - b : String(a ?? "").localeCompare(String(b ?? ""), "en", { numeric: true }));
const get = (row, field) => field.split(".").reduce((v, k) => (v === null || v === undefined ? v : v[k]), row);
const isEmpty = (v) => v === null || v === undefined || v === "" || (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0);
const cap = (s) => String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);

/** Indexes over the world, built once per world and reused. */
const INDEX = new WeakMap();
export function indexOf(world) {
  let ix = INDEX.get(world);
  if (ix) return ix;
  const map = (list) => new Map((list || []).map((r) => [String(r.id), r]));
  ix = {
    lines: map(world.po_lines), contracts: map(world.contracts), suppliers: map(world.suppliers), materials: map(world.materials),
    users: map(world.users), log: map(world.exception_log), plants: map(world.plants), companyCodes: map(world.company_codes),
    taxonomy: new Map((world.taxonomy || []).map((t) => [t.code, t]))
  };
  INDEX.set(world, ix);
  return ix;
}

/** A person as the screens show them: "Lena K., Buyer, MRO, Frankfurt". */
export function personLabel(world, id) {
  const u = indexOf(world).users.get(String(id));
  if (!u) return id ? String(id) : "nobody";
  return `${u.name ? `${u.name}, ` : ""}${cap(u.role)}, ${u.team}`;
}

/** Role and team only: "Buyer, MRO, Frankfurt". */
export function roleLabel(world, id) {
  const u = indexOf(world).users.get(String(id));
  return u ? `${cap(u.role)}, ${u.team}` : String(id || "nobody");
}

/** A line's value in euros at the world's rate. */
export function valueEur(world, line) {
  const fx = world.meta?.fx_to_eur || { EUR: 1 };
  return Number(line.value) * (fx[line.currency] ?? 1);
}

/** Every id a text may name: records, orders, codes, rules, people (for the figure audit). */
export function worldIds(world) {
  const ids = new Set();
  for (const l of world.po_lines || []) { ids.add(l.id); ids.add(l.po); }
  for (const key of ["contracts", "suppliers", "materials", "users", "plants", "company_codes", "exception_log"]) for (const r of world[key] || []) ids.add(String(r.id));
  for (const t of world.taxonomy || []) ids.add(t.code);
  for (const r of RULES) ids.add(r.id);
  return ids;
}

// ---- typed figures of ERP results ------------------------------------------------------------------

/** The typed figures of one record: amounts, durations and quantities, not ids or day numbers. */
export function recordFigures(product, row, world) {
  const out = [];
  if (!row) return out;
  if (product === "po_line") {
    out.push({ type: "amount", value: Number(row.value), currency: row.currency });
    out.push({ type: "amount", value: valueEur(world, row), currency: "EUR" });
    if (row.payment_terms_days !== null && row.payment_terms_days !== undefined) out.push({ type: "days", value: row.payment_terms_days });
    if (row.quantity !== null && row.quantity !== undefined) out.push({ type: "count", value: row.quantity });
  } else if (product === "contract") {
    if (row.payment_terms_days !== null && row.payment_terms_days !== undefined) out.push({ type: "days", value: row.payment_terms_days });
  } else if (product === "supplier") {
    for (const d of Object.values(row.payment_terms || {})) if (d !== null && d !== undefined) out.push({ type: "days", value: d });
  }
  return out;
}

// ---- erp_get_overview -------------------------------------------------------------------------------

export function erpOverview(world, { day = 0, today = new Date(), params = PARAMS } = {}) {
  const ix = indexOf(world);
  const rows = (p) => (world[LIST[p]] || []).length;
  const owner = (role) => (world.users || []).find((u) => u.role === role)?.id || null;
  return {
    company: "GlobalCorp SE (fictional; no client data)",
    as_of: { day, date: dayLabel(day, today) },
    company_codes: (world.company_codes || []).map((c) => ({ id: c.id, name: c.name, city: c.city, currency: c.currency })),
    plants: (world.plants || []).map((p) => ({ id: p.id, name: p.name, company_code: p.company_code, role: p.role })),
    data_products: [
      { product: "po_line", rows: rows("po_line"), one_row_per: "purchase-order item, last 365 days", typical_source: PRODUCTS[0].source },
      { product: "contract", rows: rows("contract"), one_row_per: "outline agreement", typical_source: PRODUCTS[3].source },
      { product: "supplier", rows: rows("supplier"), one_row_per: "supplier account", typical_source: PRODUCTS[1].source },
      { product: "material", rows: rows("material"), one_row_per: "material", typical_source: PRODUCTS[2].source },
      { product: "user_org", rows: rows("user_org"), one_row_per: "user", typical_source: "user master and organisation" },
      { product: "exception_log", rows: rows("exception_log"), one_row_per: "exception ever detected", typical_source: "the agent's own store" }
    ],
    central_roles: Object.fromEntries(Object.values(CENTRAL_ROLES).map((r) => [r, owner(r)])),
    rules: RULES.map((r) => ({ id: r.id, name: r.name, dimension: r.dimension, severity: r.severity, record: r.record, fires: r.fires, responsible: r.responsible, suggestion: r.suggestion || "none" })),
    material_groups: [...ix.taxonomy.values()].map((t) => ({ code: t.code, name: t.name })),
    parameters: Object.entries(params).map(([k, v]) => ({ name: k, value: v, unit: PARAM_LABELS[k][1], label: PARAM_LABELS[k][0], assumption: true, ...(v !== PARAMS[k] ? { default: PARAMS[k] } : {}) })),
    group_keys: GROUP_KEYS.slice(),
    notes: [
      "Accuracy is left out: whether a value matches reality needs an outside check this prototype cannot make.",
      "Days are relative to today (day 0); negative days are past.",
      "Values are in each line's currency; one exchange rate per currency converts to euros for the window."
    ],
    figures: [
      ...DATA_PRODUCTS.map((p) => ({ type: "count", value: rows(p) })),
      ...Object.entries(params).map(([k, v]) => ({ type: PARAM_TYPES[k], value: v }))
    ]
  };
}

// ---- erp_query --------------------------------------------------------------------------------------

/** Rows of one product with filters, sorted, at most MAX_ROWS, plus the total count. */
export function erpQuery(world, { product, filters = [], fields = null, order_by = null, descending = false, limit = 20 } = {}) {
  if (!DATA_PRODUCTS.includes(product)) return { error: `Unknown product "${product}". Use one of: ${DATA_PRODUCTS.join(", ")}.` };
  const allowed = FIELDS[product];
  for (const f of filters || []) {
    if (!allowed.includes(f.field)) return { error: `${product} has no field "${f.field}". Fields: ${allowed.join(", ")}.` };
    if (!FILTER_OPS.includes(f.op)) return { error: `Unknown op "${f.op}". Use one of: ${FILTER_OPS.join(", ")}.` };
    if (f.op === "in" && !Array.isArray(f.values)) return { error: `Filter on ${f.field}: op "in" needs "values", a list.` };
    if (!["in", "empty", "not_empty"].includes(f.op) && f.value === undefined) return { error: `Filter on ${f.field}: op "${f.op}" needs "value".` };
  }
  if (order_by && !allowed.includes(order_by)) return { error: `${product} cannot be sorted by "${order_by}". Fields: ${allowed.join(", ")}.` };
  const pick = fields && fields.length ? fields : null;
  if (pick) for (const f of pick) if (!allowed.includes(f)) return { error: `${product} has no field "${f}". Fields: ${allowed.join(", ")}.` };
  const n = Math.max(1, Math.min(MAX_ROWS, Number.isInteger(limit) ? limit : 20));
  const test = (row) => (filters || []).every((f) => {
    const v = get(row, f.field);
    switch (f.op) {
      case "eq": return String(v) === String(f.value);
      case "ne": return String(v) !== String(f.value);
      case "in": return f.values.map(String).includes(String(v));
      case "gte": return v !== null && v !== undefined && naturally(v, f.value) >= 0;
      case "lte": return v !== null && v !== undefined && naturally(v, f.value) <= 0;
      case "empty": return isEmpty(v);
      case "not_empty": return !isEmpty(v);
      default: return false;
    }
  });
  let rows = (world[LIST[product]] || []).filter(test);
  if (order_by) rows = rows.slice().sort((a, b) => naturally(get(a, order_by), get(b, order_by)) * (descending ? -1 : 1));
  const total = rows.length;
  const shown = rows.slice(0, n).map((r) => (pick ? Object.fromEntries(pick.map((f) => [f, get(r, f) ?? null])) : structuredCloneSafe(r)));
  const figures = [{ type: "count", value: total }, { type: "count", value: shown.length }];
  if (!pick) for (const r of rows.slice(0, n)) figures.push(...recordFigures(product, r, world));
  else for (const r of rows.slice(0, n)) {
    if (pick.includes("value")) figures.push({ type: "amount", value: Number(r.value), currency: r.currency || "EUR" });
    if (pick.includes("payment_terms_days") && r.payment_terms_days !== null && r.payment_terms_days !== undefined) figures.push({ type: "days", value: r.payment_terms_days });
    if (pick.includes("quantity") && r.quantity !== null && r.quantity !== undefined) figures.push({ type: "count", value: r.quantity });
  }
  return { product, total, returned: shown.length, truncated: total > shown.length, rows: shown, figures };
}

function structuredCloneSafe(r) {
  return JSON.parse(JSON.stringify(r));
}

// ---- erp_get_record ---------------------------------------------------------------------------------

/**
 * One record with all its fields and its related records. A supplier in a company code ("30041@2000")
 * and a pair ("30041+80013") resolve to their suppliers. Returns { product, id, record, related,
 * read: [{ product, id }] (what counts as read for the guardrails), figures } or { error }.
 */
export function erpGetRecord(world, { product, id } = {}) {
  if (!DATA_PRODUCTS.includes(product)) return { error: `Unknown product "${product}". Use one of: ${DATA_PRODUCTS.join(", ")}.` };
  const ix = indexOf(world);
  const key = String(id ?? "").trim();
  const userWithManager = (uid) => {
    const u = uid ? ix.users.get(String(uid)) : null;
    if (!u) return uid ? { id: String(uid), found: false } : null;
    const m = u.manager ? ix.users.get(u.manager) : null;
    return { ...u, label: personLabel(world, u.id), manager: m ? { id: m.id, name: m.name, role: m.role, team: m.team, active_until: m.active_until } : null };
  };
  const supplierSummary = (sid) => {
    const s = sid ? ix.suppliers.get(String(sid)) : null;
    return s ? JSON.parse(JSON.stringify(s)) : sid ? { id: String(sid), found: false } : null;
  };
  const linesOf = (pred) => (world.po_lines || []).filter(pred);
  const spend = (lines) => lines.reduce((t, l) => t + valueEur(world, l), 0);
  const figures = [];
  let record = null;
  let related = {};
  let read = [];
  if (product === "po_line") {
    const l = ix.lines.get(key);
    if (!l) return { error: `No order line "${key}". Line ids look like 4500100001/10 (order/item); find them with erp_query.` };
    record = { ...l, value_eur: valueEur(world, l) };
    const material = l.material ? ix.materials.get(l.material) || { id: l.material, found: false } : null;
    const contract = l.contract ? ix.contracts.get(l.contract) || { id: l.contract, found: false } : null;
    related = {
      supplier: supplierSummary(l.supplier), material, contract,
      requester: l.requester ? userWithManager(l.requester) : null, buyer: userWithManager(l.buyer), created_by: userWithManager(l.created_by)
    };
    figures.push(...recordFigures("po_line", l, world), ...recordFigures("supplier", related.supplier, world));
    if (contract) figures.push(...recordFigures("contract", contract, world));
    read = [{ product: "po_line", id: l.id }];
  } else if (product === "supplier") {
    const m = /^([^@+]+)(?:@(.+))?$/.exec(key);
    const s = m ? ix.suppliers.get(m[1]) : null;
    if (!s) return { error: `No supplier "${key}". Supplier ids are numbers such as 30041; find them with erp_query.` };
    const lines = linesOf((l) => l.supplier === s.id);
    const byCc = {};
    for (const l of lines) byCc[l.company_code] = (byCc[l.company_code] || 0) + 1;
    record = JSON.parse(JSON.stringify(s));
    related = {
      order_lines_in_window: lines.length, spend_eur: spend(lines), lines_by_company_code: byCc,
      contracts: (world.contracts || []).filter((k) => k.supplier === s.id).map((k) => k.id)
    };
    figures.push(...recordFigures("supplier", s, world), { type: "count", value: lines.length }, { type: "amount", value: related.spend_eur, currency: "EUR" });
    for (const v of Object.values(byCc)) figures.push({ type: "count", value: v });
    read = [{ product: "supplier", id: s.id }];
  } else if (product === "material") {
    const mat = ix.materials.get(key);
    if (!mat) return { error: `No material "${key}". Material ids look like M10001.` };
    const lines = linesOf((l) => l.material === mat.id);
    record = { ...mat };
    related = { material_group: mat.material_group ? ix.taxonomy.get(mat.material_group) || null : null, order_lines_in_window: lines.length, spend_eur: spend(lines) };
    figures.push({ type: "count", value: lines.length }, { type: "amount", value: related.spend_eur, currency: "EUR" });
    read = [{ product: "material", id: mat.id }];
  } else if (product === "contract") {
    const k = ix.contracts.get(key);
    if (!k) return { error: `No contract "${key}". Contract ids look like 4600000101.` };
    const lines = linesOf((l) => l.contract === k.id);
    record = { ...k };
    related = { supplier: supplierSummary(k.supplier), owner: k.owner ? userWithManager(k.owner) : null, order_lines_referencing: lines.length, spend_eur: spend(lines) };
    figures.push(...recordFigures("contract", k, world), ...recordFigures("supplier", related.supplier, world), { type: "count", value: lines.length }, { type: "amount", value: related.spend_eur, currency: "EUR" });
    read = [{ product: "contract", id: k.id }];
  } else if (product === "user_org") {
    const u = ix.users.get(key);
    if (!u) return { error: `No user "${key}". User ids look like U101.` };
    record = userWithManager(u.id);
    related = { reports: (world.users || []).filter((x) => x.manager === u.id).map((x) => ({ id: x.id, name: x.name, role: x.role, active_until: x.active_until })) };
    read = [{ product: "user_org", id: u.id }];
  } else {
    const x = ix.log.get(key);
    if (!x) return { error: `No log entry "${key}". Log ids look like H0001.` };
    record = { ...x };
    related = { responsible: x.responsible ? userWithManager(x.responsible) : null, routed_to: x.routed_to ? userWithManager(x.routed_to) : null };
    read = [{ product: "exception_log", id: x.id }];
  }
  return { product, id: record.id, record, related, read, figures };
}

/** The data tools by name: (world, input, opts) → result. */
export const ERP_TOOLS = Object.freeze({
  erp_get_overview: (world, input, opts) => erpOverview(world, opts),
  erp_query: (world, input) => erpQuery(world, input),
  erp_get_record: (world, input) => erpGetRecord(world, input)
});
