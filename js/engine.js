// The rule engine: runs the fifteen rules of js/rules.js over a world (the five data products and
// the exception log) and returns the exceptions with their spend, financing cost, responsible and
// routed-to people and suggestions, plus the totals of the header and the board: clean spend, spend
// with an open exception, the financing cost of paying early. Pure functions without DOM or clock:
// day 0 is "today", and the same code runs in the browser and in the Node tests (tests/engine.mjs).

import { RULES, RULE_SET_VERSION, SEVERITY_ORDER, CENTRAL_ROLES, ruleById } from "./rules.js";
import { PARAMS } from "./params.js";
import { vatProblem, normaliseVat } from "./vat.js";

export const ENGINE_VERSION = "0.1.0";

/** The statuses under which an exception still counts against its records (open, routed, accepted). */
export const LIVE_STATUSES = Object.freeze(["open", "routed", "accepted"]);
export const isLive = (status) => LIVE_STATUSES.includes(status);

/** A rule's severity ("high", "medium", "low"). */
export const ruleSeverity = (id) => ruleById(id)?.severity;

const LEGAL_FORMS = new Set("gmbh ag se sa sas sarl ltd limited plc bv nv spa srl kg co inc".split(" "));
/**
 * The normalised name of DQ-12: lower case; dots removed first ("S.A." → "sa"); every other character
 * that is not a letter or digit becomes a space; spaces collapse; legal-form tokens are dropped.
 */
export function normaliseName(name) {
  return String(name || "").toLowerCase().replace(/\./g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim()
    .split(/\s+/).filter((t) => t && !LEGAL_FORMS.has(t)).join(" ");
}

/** Natural order for record ids ("L2" before "L10"). */
const byId = (a, b) => String(a).localeCompare(String(b), "en", { numeric: true });

/**
 * Indexes and shared definitions over one world, for one day and one set of parameters. Built once
 * per scan; never mutates the world.
 */
export function context(world, { day = 0, params = PARAMS } = {}) {
  const fx = world.meta?.fx_to_eur || { EUR: 1 };
  const window = params.window_days ?? 365;
  const from = day - (window - 1);
  const users = new Map((world.users || []).map((u) => [u.id, u]));
  const suppliers = new Map((world.suppliers || []).map((s) => [s.id, s]));
  const materials = new Map((world.materials || []).map((m) => [m.id, m]));
  const contracts = new Map((world.contracts || []).map((k) => [k.id, k]));
  const lines = (world.po_lines || []).filter((l) => l.day >= from && l.day <= day);
  const lineById = new Map(lines.map((l) => [l.id, l]));
  const eur = (l) => {
    const rate = fx[l.currency];
    if (typeof rate !== "number") throw new Error(`no exchange rate for ${l.currency} (line ${l.id})`);
    return l.value * rate;
  };
  const roleHolder = (role) => (world.users || []).find((u) => u.role === role)?.id ?? null;
  const active = (uid, onDay) => {
    const u = users.get(uid);
    return !!u && (u.active_until === null || u.active_until === undefined || u.active_until >= onDay);
  };
  const lead = roleHolder(CENTRAL_ROLES.lead);
  // Routing: the responsible person if active today, else their manager if active, else the lead.
  const routeTo = (responsible) => {
    if (responsible && active(responsible, day)) return responsible;
    const manager = responsible ? users.get(responsible)?.manager : null;
    if (manager && active(manager, day)) return manager;
    return lead;
  };
  // Agreed terms: the referenced contract's terms, else the supplier's terms in the line's company
  // code, else none. The source names where they come from (for suggestions).
  const agreed = (l) => {
    const k = l.contract ? contracts.get(l.contract) : null;
    if (k && k.payment_terms_days !== null && k.payment_terms_days !== undefined) return { days: k.payment_terms_days, source: `contract ${k.id}` };
    const t = suppliers.get(l.supplier)?.payment_terms?.[l.company_code];
    if (t !== null && t !== undefined) return { days: t, source: `supplier terms in company code ${l.company_code}` };
    return null;
  };
  return {
    world, day, params, from, to: day, fx, users, suppliers, materials, contracts, lines, lineById, eur, active, routeTo, agreed,
    supplierSteward: roleHolder(CENTRAL_ROLES.supplierSteward), materialSteward: roleHolder(CENTRAL_ROLES.materialSteward), lead
  };
}

// ---- the rules ---------------------------------------------------------------------------------------
// Each check returns findings: { key, record, responsible, lines, ...extra }. key is the record's key
// within the rule: a line id, a supplier id, "S2@1000" (a supplier in a company code), "S1+S5" (a pair,
// sorted), a material id or a contract id.

function lineFindings(c) {
  const out = [];
  const coc = c.params.cost_of_capital;
  const yearDays = 365;
  for (const l of c.lines) {
    const mat = l.material ? c.materials.get(l.material) : null;
    const sup = c.suppliers.get(l.supplier);
    const rec = { product: "po_line", id: l.id };
    const a = c.agreed(l);
    // DQ-01: no contract reference although a contract of the same supplier, company code and
    // material group is valid on the order day; suggest the one valid from the latest day.
    if (!l.contract && l.material_group) {
      const cover = [...c.contracts.values()].filter((k) => k.supplier === l.supplier && k.company_code === l.company_code
        && k.material_group === l.material_group && k.valid_from <= l.day && l.day <= k.valid_to)
        .sort((x, y) => y.valid_from - x.valid_from || byId(x.id, y.id));
      if (cover.length) out.push({ rule: "DQ-01", key: l.id, record: rec, responsible: l.buyer, lines: [l.id], covering: cover.map((k) => k.id),
        suggestion: { field: "contract", value: cover[0].id, source: `contract ${cover[0].id}, valid on the order day` } });
    }
    // DQ-02: no material group; the material master's group when the line has a material.
    if (!l.material_group) {
      out.push({ rule: "DQ-02", key: l.id, record: rec, responsible: l.buyer, lines: [l.id],
        suggestion: mat?.material_group ? { field: "material_group", value: mat.material_group, source: `material master ${mat.id}` } : null });
    }
    // DQ-03: line and master both have a group, and they differ.
    if (l.material && l.material_group && mat?.material_group && mat.material_group !== l.material_group) {
      out.push({ rule: "DQ-03", key: l.id, record: rec, responsible: c.materialSteward, lines: [l.id],
        suggestion: { field: "material_group", value: mat.material_group, source: `material master ${mat.id}` } });
    }
    // DQ-04: no requester, or one that matches no user. DQ-05: the requester had left on the order day.
    const known = l.requester && c.users.has(l.requester);
    if (!known) out.push({ rule: "DQ-04", key: l.id, record: rec, responsible: l.buyer, lines: [l.id], suggestion: null });
    else if (!c.active(l.requester, l.day)) {
      out.push({ rule: "DQ-05", key: l.id, record: rec, responsible: c.users.get(l.requester).manager || c.lead, lines: [l.id], suggestion: null });
    }
    // DQ-06: no payment terms; an order without terms is treated as due on receipt (paid).
    if (l.payment_terms_days === null || l.payment_terms_days === undefined) {
      out.push({ rule: "DQ-06", key: l.id, record: rec, responsible: l.buyer, lines: [l.id],
        financing_cost_eur: a ? (c.eur(l) * a.days / yearDays) * coc : 0, unpaid: false,
        suggestion: a ? { field: "payment_terms_days", value: a.days, source: a.source } : null });
    } else if (a && l.payment_terms_days < a.days) {
      // DQ-07: terms shorter than the agreed terms; unpaid while ordered fewer days ago than its own terms.
      out.push({ rule: "DQ-07", key: l.id, record: rec, responsible: l.buyer, lines: [l.id],
        financing_cost_eur: (c.eur(l) * (a.days - l.payment_terms_days) / yearDays) * coc, unpaid: c.day - l.day < l.payment_terms_days,
        suggestion: { field: "payment_terms_days", value: a.days, source: a.source } });
    }
    // DQ-08: ordered on or after the day the supplier's purchasing block started.
    if (sup && sup.block_from !== null && sup.block_from !== undefined && l.day >= sup.block_from) {
      out.push({ rule: "DQ-08", key: l.id, record: rec, responsible: l.buyer, lines: [l.id], suggestion: null });
    }
    // DQ-15: the referenced contract was not valid on the order day (or does not exist).
    if (l.contract) {
      const k = c.contracts.get(l.contract);
      if (!k || !(k.valid_from <= l.day && l.day <= k.valid_to)) out.push({ rule: "DQ-15", key: l.id, record: rec, responsible: l.buyer, lines: [l.id], suggestion: null, contract_found: !!k });
    }
  }
  return out;
}

function supplierFindings(c) {
  const out = [];
  const bySupplier = new Map();
  for (const l of c.lines) {
    if (!bySupplier.has(l.supplier)) bySupplier.set(l.supplier, []);
    bySupplier.get(l.supplier).push(l);
  }
  const ids = (ls) => ls.map((l) => l.id);
  for (const [sid, ls] of bySupplier) {
    const s = c.suppliers.get(sid);
    if (!s) continue;
    // DQ-09: order lines in a company code without payment terms there.
    const codes = [...new Set(ls.map((l) => l.company_code))].sort(byId);
    for (const cc of codes) {
      const t = s.payment_terms?.[cc];
      if (t === null || t === undefined) out.push({ rule: "DQ-09", key: `${sid}@${cc}`, record: { product: "supplier", id: `${sid}@${cc}`, supplier: sid, company_code: cc },
        responsible: c.supplierSteward, lines: ids(ls.filter((l) => l.company_code === cc)), suggestion: null });
    }
    // DQ-10: VAT ID missing, wrong prefix or wrong format (never a check digit).
    const problem = vatProblem(s.country, s.vat_id);
    if (problem) out.push({ rule: "DQ-10", key: sid, record: { product: "supplier", id: sid }, responsible: c.supplierSteward, lines: ids(ls), suggestion: null, vat_problem: problem });
    // DQ-11: no bank details, or a bank in another country.
    if (!s.bank || !s.bank.country || s.bank.country !== s.country) {
      out.push({ rule: "DQ-11", key: sid, record: { product: "supplier", id: sid }, responsible: c.supplierSteward, lines: ids(ls), suggestion: null, bank_problem: s.bank?.country ? "foreign" : "missing" });
    }
  }
  // DQ-12: pairs of suppliers, at least one with lines, with the same VAT ID or the same normalised
  // name in the same country. Similar names alone never make a duplicate.
  const all = (c.world.suppliers || []).slice().sort((a, b) => byId(a.id, b.id));
  const vat = new Map(all.map((s) => [s.id, normaliseVat(s.vat_id)]));
  const name = new Map(all.map((s) => [s.id, normaliseName(s.name)]));
  const byVat = new Map();
  const byName = new Map();
  for (const s of all) {
    if (vat.get(s.id)) { const k = vat.get(s.id); if (!byVat.has(k)) byVat.set(k, []); byVat.get(k).push(s.id); }
    const nk = `${s.country}|${name.get(s.id)}`;
    if (name.get(s.id)) { if (!byName.has(nk)) byName.set(nk, []); byName.get(nk).push(s.id); }
  }
  const pairs = new Map();
  const note = (group, how) => {
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
      const [a, b] = [group[i], group[j]].sort(byId);
      if (!bySupplier.has(a) && !bySupplier.has(b)) continue;
      const key = `${a}+${b}`;
      if (!pairs.has(key)) pairs.set(key, { a, b, match: [] });
      pairs.get(key).match.push(how);
    }
  };
  for (const g of byVat.values()) note(g, "vat");
  for (const g of byName.values()) note(g, "name");
  for (const [key, p] of [...pairs].sort((x, y) => byId(x[0], y[0]))) {
    const ls = [...(bySupplier.get(p.a) || []), ...(bySupplier.get(p.b) || [])];
    out.push({ rule: "DQ-12", key, record: { product: "supplier", id: key, pair: [p.a, p.b] }, responsible: c.supplierSteward, lines: ids(ls), suggestion: null, match: p.match.sort() });
  }
  return out;
}

function materialAndContractFindings(c) {
  const out = [];
  // DQ-13 and DQ-14 look at materials and contracts with order lines in the window (decision N2).
  const byMaterial = new Map();
  const byContract = new Map();
  for (const l of c.lines) {
    if (l.material) { if (!byMaterial.has(l.material)) byMaterial.set(l.material, []); byMaterial.get(l.material).push(l.id); }
    if (l.contract) { if (!byContract.has(l.contract)) byContract.set(l.contract, []); byContract.get(l.contract).push(l.id); }
  }
  for (const [mid, ls] of [...byMaterial].sort((x, y) => byId(x[0], y[0]))) {
    const m = c.materials.get(mid);
    if (m && !m.material_group) out.push({ rule: "DQ-13", key: mid, record: { product: "material", id: mid }, responsible: c.materialSteward, lines: ls, suggestion: null });
  }
  for (const [kid, ls] of [...byContract].sort((x, y) => byId(x[0], y[0]))) {
    const k = c.contracts.get(kid);
    if (k && (!k.owner || !c.active(k.owner, c.day))) out.push({ rule: "DQ-14", key: kid, record: { product: "contract", id: kid }, responsible: c.lead, lines: ls, suggestion: null, owner_problem: k.owner ? "left" : "missing" });
  }
  return out;
}

/** Sort order of section 6.5: severity, spend affected (largest first), rule id, record id. */
export function compareExceptions(a, b) {
  return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.spend_eur - a.spend_eur
    || a.rule.localeCompare(b.rule) || byId(a.record.id, b.record.id);
}

/**
 * Runs the rules over the world. Options: rules (ids; default all), filters (see matchesFilters),
 * day (default 0), params, log (the exception log: dismissed exceptions are not raised again, and
 * the status and detected day of a live entry carry over).
 * Returns { exceptions, context }.
 */
export function scan(world, { rules = null, filters = null, day = 0, params = PARAMS, log = null } = {}) {
  const c = context(world, { day, params });
  const wanted = new Set(rules && rules.length ? rules : RULES.map((r) => r.id));
  const findings = [...lineFindings(c), ...supplierFindings(c), ...materialAndContractFindings(c)].filter((f) => wanted.has(f.rule));
  const entries = log || world.exception_log || [];
  const dismissed = new Set(entries.filter((x) => x.status === "dismissed").map((x) => `${x.rule}|${x.record}`));
  const liveEntry = new Map(entries.filter((x) => isLive(x.status)).map((x) => [`${x.rule}|${x.record}`, x]));
  const exceptions = [];
  for (const f of findings) {
    const id = `${f.rule}|${f.key}`;
    if (dismissed.has(id)) continue;
    const lines = [...new Set(f.lines)].sort(byId);
    const spend = lines.reduce((t, lid) => t + c.eur(c.lineById.get(lid)), 0);
    const rule = ruleById(f.rule);
    const entry = log ? liveEntry.get(id) : null;
    const e = {
      id, rule: f.rule, record: f.record, severity: rule.severity, responsible: f.responsible ?? null, routed_to: c.routeTo(f.responsible),
      spend_eur: spend, financing_cost_eur: rule.financing ? f.financing_cost_eur : 0, unpaid: rule.financing ? f.unpaid : null,
      suggestion: f.suggestion ?? null, status: entry ? entry.status : "open", detected_day: entry ? entry.detected_day : day,
      rule_set_version: RULE_SET_VERSION, lines
    };
    for (const k of ["match", "vat_problem", "bank_problem", "owner_problem", "covering", "contract_found"]) if (f[k] !== undefined) e[k] = f[k];
    if (filters && !matchesFilters(c, e, filters)) continue;
    exceptions.push(e);
  }
  exceptions.sort(compareExceptions);
  return { exceptions, context: c };
}

// ---- grouping values and filters ------------------------------------------------------------------------
// Each exception takes its values from its record: a line rule from the line; a supplier rule from the
// supplier (supplier, onboarding channel) and, for plant and company code, from its lines; a pair
// belongs to both suppliers' values; a material or contract rule from its lines.

export const GROUP_KEYS = Object.freeze(["plant", "company_code", "supplier", "channel", "buyer", "requester", "created_by", "material_group", "onboarding_channel", "week_detected"]);

/** The values of one grouping key for an exception (a sorted list; empty when it has none). */
export function valuesOf(c, e, key, log = null) {
  const lines = e.lines.map((id) => c.lineById.get(id)).filter(Boolean);
  const uniq = (xs) => [...new Set(xs.filter((x) => x !== null && x !== undefined && x !== ""))].sort(byId);
  const suppliers = e.record.pair ? e.record.pair : e.record.supplier ? [e.record.supplier] : e.record.product === "supplier" ? [e.record.id] : null;
  switch (key) {
    case "supplier": return uniq(suppliers || lines.map((l) => l.supplier));
    case "onboarding_channel": return uniq((suppliers || lines.map((l) => l.supplier)).map((s) => c.suppliers.get(s)?.onboarding_channel));
    case "company_code": return e.record.company_code ? [e.record.company_code] : uniq(lines.map((l) => l.company_code));
    case "week_detected": {
      const d = e.detected_day;
      if (d === null || d === undefined) return [];
      const age = c.day - d;
      return age >= 14 && age <= 69 ? [String(Math.floor((age - 14) / 7) + 1)] : age < 14 ? ["new"] : ["older"];
    }
    default: return uniq(lines.map((l) => l[key]));
  }
}

/**
 * Filters for scans and groupings: { key: value or [values] } over the grouping keys, plus
 * "rules" handled by the caller. An exception matches when, for every key, one of its values is
 * among the wanted ones.
 */
export function matchesFilters(c, e, filters) {
  for (const [key, want] of Object.entries(filters || {})) {
    if (want === undefined || want === null) continue;
    if (!GROUP_KEYS.includes(key)) throw new Error(`unknown filter "${key}"`);
    const wanted = (Array.isArray(want) ? want : [want]).map(String);
    if (!valuesOf(c, e, key).some((v) => wanted.includes(String(v)))) return false;
  }
  return true;
}

// ---- totals ----------------------------------------------------------------------------------------------

/**
 * The totals of section 6.3 and 6.4 for a set of exceptions: counts by severity, routed-to person,
 * rule and data product; spend in the window, clean spend and its share, spend with an open exception
 * (each line counted once); the financing cost of paying early and the part on unpaid lines. Only
 * exceptions that are open, routed or accepted count against their lines.
 */
export function totals(world, exceptions, { day = 0, params = PARAMS, c = null } = {}) {
  const ctx = c || context(world, { day, params });
  const live = exceptions.filter((e) => isLive(e.status || "open"));
  const flagged = new Set(live.flatMap((e) => e.lines));
  const spend = ctx.lines.reduce((t, l) => t + ctx.eur(l), 0);
  const cleanLines = ctx.lines.filter((l) => !flagged.has(l.id));
  const clean = cleanLines.reduce((t, l) => t + ctx.eur(l), 0);
  const count = (key) => {
    const m = new Map();
    for (const e of live) m.set(e[key], (m.get(e[key]) || 0) + 1);
    return Object.fromEntries([...m].sort((a, b) => b[1] - a[1] || byId(a[0], b[0])));
  };
  const bySeverity = { high: 0, medium: 0, low: 0 };
  for (const e of live) bySeverity[e.severity] += 1;
  const byProduct = {};
  for (const e of live) { const p = ruleById(e.rule).product; byProduct[p] = (byProduct[p] || 0) + 1; }
  const fin = live.filter((e) => ruleById(e.rule).financing);
  return {
    count: live.length, by_severity: bySeverity, by_routed_to: count("routed_to"), by_rule: count("rule"), by_product: byProduct,
    spend_window_eur: spend, clean_spend_eur: clean, clean_share: spend > 0 ? clean / spend : null, open_spend_eur: spend - clean,
    clean_lines: cleanLines.map((l) => l.id).sort(byId), lines_in_window: ctx.lines.length,
    financing_cost_eur: fin.reduce((t, e) => t + e.financing_cost_eur, 0),
    financing_cost_unpaid_eur: fin.filter((e) => e.unpaid).reduce((t, e) => t + e.financing_cost_eur, 0)
  };
}

/** Spend over the distinct lines of some exceptions (never summed across exceptions). */
export function spendOf(c, exceptions) {
  const ids = new Set(exceptions.flatMap((e) => e.lines));
  let t = 0;
  for (const id of ids) { const l = c.lineById.get(id); if (l) t += c.eur(l); }
  return t;
}
