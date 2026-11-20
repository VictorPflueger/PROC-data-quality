// Figure audit: every figure the agent writes into an alert, an option text, a review note, a draft
// or the report must be one that a tool returned in this run, of the same kind: an amount, a share, a
// count or a number of days. The option cards, tiles and tables take their figures from the engine
// directly; this check covers the free text, so "every figure comes from a tool result" is enforced
// in code, not only asked for. Rebate Hunter's js/figures.js is the model, with the method's changes:
//   - amounts of any size are checked (no minimum), and a written amount matches a figure when it lies
//     within half a unit of its last digit and within 2 % of the figure, with no €0.50 floor;
//   - in English text a comma before exactly three digits always groups thousands ("€9,500" is nine
//     thousand five hundred), and a point is always a decimal point;
//   - percentages, counts and days match within half a unit of their last digit;
//   - record, rule and exception ids, order and item numbers, codes after "plant", "company code",
//     "supplier", "vendor" or "account", and dates are exempt from the number check but must exist;
//   - counts written as words ("three owners") are allowed.

const SCALE = { k: 1e3, thousand: 1e3, m: 1e6, mn: 1e6, million: 1e6, millions: 1e6, bn: 1e9, b: 1e9, billion: 1e9, billions: 1e9 };
const CURRENCY = { "€": "EUR", eur: "EUR", euro: "EUR", euros: "EUR", "£": "GBP", gbp: "GBP", pound: "GBP", pounds: "GBP" };
const MAX_RELATIVE = 0.02;
const EPS = 1e-9;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The figures one run's tools returned, by kind, and the ids that exist in the world or the run. */
export class KnownFigures {
  constructor() {
    this.amounts = [];   // { value, currency }
    this.shares = [];    // fractions: 0.064 for 6.4 %
    this.counts = [];
    this.days = [];
    this.ids = new Set();
    this.dayNumbers = new Set(); // calendar days (relative to today) that dates may name; empty: any valid date
  }
  amount(value, currency = "EUR") { const v = Number(value); if (Number.isFinite(v)) this.amounts.push({ value: Math.abs(v), currency }); return this; }
  share(value) { const v = Number(value); if (Number.isFinite(v)) this.shares.push(v); return this; }
  count(value) { const v = Number(value); if (Number.isFinite(v)) this.counts.push(Math.abs(v)); return this; }
  day(value) { const v = Number(value); if (Number.isFinite(v)) this.days.push(Math.abs(v)); return this; }
  id(value) { if (value !== null && value !== undefined && value !== "") this.ids.add(String(value)); return this; }
  /** Adds a typed figure: type is "amount", "share", "count" or "days". */
  add(type, value, currency = "EUR") {
    if (type === "amount") return this.amount(value, currency);
    if (type === "share") return this.share(value);
    if (type === "count") return this.count(value);
    if (type === "days") return this.day(value);
    throw new Error(`unknown figure type "${type}"`);
  }
  /** Adds every figure and id of another set. */
  merge(other) {
    this.amounts.push(...other.amounts); this.shares.push(...other.shares); this.counts.push(...other.counts); this.days.push(...other.days);
    for (const x of other.ids) this.ids.add(x);
    for (const x of other.dayNumbers) this.dayNumbers.add(x);
    return this;
  }
}

/** "58,725" → { value: 58725, decimals: 0 }; "6.38" → { value: 6.38, decimals: 2 }. */
function readNumber(s) {
  const [intPart, frac = ""] = String(s).split(".");
  return { value: Number(`${intPart.replace(/,/g, "")}${frac ? `.${frac}` : ""}`), decimals: frac.length };
}

const NUM = "\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?";
const SCALE_WORDS = "k|K|m|M|mn|bn|b|thousand|million|millions|billion|billions";
const PATTERNS = [
  // Exempt but must exist. Exception ids first, then rule ids, order and contract numbers, codes after
  // their words (a list such as "plants 1010 and 1020" too), letter-prefixed record ids and versions.
  ["id", /\bDQ-\d{2}\|[A-Za-z0-9@+/]+/g],
  ["id", /\bDQ-\d{2}\b/g],
  ["id", /\b4[56]\d{8}(?:\/\d{1,5})?\b/g],
  ["code", /\b(?:plants?|company codes?|suppliers?|vendors?|accounts?)\s+\d{4,6}(?:(?:\s*,\s*|\s+and\s+|\s+or\s+)\d{4,6})*\b/gi],
  ["id", /\b[LSMKUH]\d+\b/g],
  ["id", /\b\d+\.\d+\.\d+\b/g],
  ["date", /\b\d{4}-\d{2}-\d{2}\b/g],
  ["date", new RegExp(`\\b(?:${WEEKDAYS.join("|")}) \\d{1,2} (?:${MONTHS.join("|")})(?: \\d{4})?\\b`, "g")],
  // Figures. Amounts with a currency before or after, an optional scale ("€58.7k", "€1.2 million").
  ["amount-pre", new RegExp(`(€|£|\\b(?:EUR|GBP)\\b)\\s?(${NUM})(?:\\s?(${SCALE_WORDS})(?![A-Za-z]))?`, "g")],
  ["amount-post", new RegExp(`(?<![\\d.,])(${NUM})(?:\\s?(${SCALE_WORDS})(?![A-Za-z]))?\\s?(€|\\bEUR\\b|\\bGBP\\b|[Ee]uros?\\b|[Pp]ounds?\\b)`, "g")],
  ["share", new RegExp(`(?<![\\d.,])(${NUM})\\s?(?:%|per\\s?cent\\b)`, "g")],
  // Days, also as a range ("14 to 69 days") and as an adjective ("14-day").
  ["days", new RegExp(`(?<![\\d.,])(${NUM})(?:\\s*(?:to|–|-|and)\\s*(${NUM}))?[\\s-]?days?\\b`, "g")],
  ["ordinal", /\b\d+(?:st|nd|rd|th)\b/g],
  ["count", new RegExp(`(?<![\\d.,])(${NUM})(?![\\d])`, "g")]
];

/**
 * Every figure and id written in a text, in order: [{ type, raw, index, ... }]. Types: amount (value,
 * decimals, scale, currency), share, days and count (value, decimals), id, code (the codes after their
 * word), date, ordinal. Earlier patterns win where two overlap.
 */
export function extractFigures(text) {
  const s = String(text || "");
  const spans = [];
  const out = [];
  const free = (a, b) => !spans.some(([x, y]) => a < y && b > x);
  for (const [type, re] of PATTERNS) {
    for (const m of s.matchAll(re)) {
      const a = m.index;
      const b = a + m[0].length;
      if (!free(a, b)) continue;
      spans.push([a, b]);
      const raw = m[0].trim();
      if (type === "amount-pre" || type === "amount-post") {
        const pre = type === "amount-pre";
        const num = pre ? m[2] : m[1];
        const unit = pre ? m[3] : m[2];
        const cur = pre ? m[1] : m[3];
        const { value, decimals } = readNumber(num);
        const scale = unit ? SCALE[unit.toLowerCase()] || 1 : 1;
        out.push({ type: "amount", raw, index: a, value: value * scale, decimals, scale, currency: CURRENCY[cur.toLowerCase()] || CURRENCY[cur] || "EUR" });
      } else if (type === "share") {
        const { value, decimals } = readNumber(m[1]);
        out.push({ type, raw, index: a, value, decimals });
      } else if (type === "days") {
        const first = readNumber(m[1]);
        if (m[2]) {
          const second = readNumber(m[2]);
          out.push({ type, raw: m[1], index: a, value: first.value, decimals: first.decimals });
          out.push({ type, raw: raw.slice(raw.lastIndexOf(m[2])), index: a + m[0].lastIndexOf(m[2]), value: second.value, decimals: second.decimals });
        } else out.push({ type, raw, index: a, value: first.value, decimals: first.decimals });
      } else if (type === "count") {
        const { value, decimals } = readNumber(m[1]);
        out.push({ type, raw, index: a, value, decimals });
      } else if (type === "code") {
        // "Company code 4000", "plants 1010 and 1020": the first code carries its word.
        const word = /^[A-Za-z ]+?(?=\s+\d)/.exec(m[0])[0];
        const codes = [...m[0].matchAll(/\d{4,6}/g)];
        codes.forEach((c, i) => out.push({ type, raw: i === 0 ? `${word} ${c[0]}` : c[0], index: a + c.index, code: c[0], word: word.toLowerCase() }));
      } else out.push({ type, raw, index: a });
    }
  }
  return out.sort((x, y) => x.index - y.index);
}

/** A display or ISO date as a Date (UTC midnight), or null when it is not a real date. */
function parseDate(raw, today) {
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (m) {
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? d : null;
  }
  m = /^(\w{3}) (\d{1,2}) (\w{3})(?: (\d{4}))?$/.exec(raw);
  if (!m) return null;
  const year = m[4] ? Number(m[4]) : today.getFullYear();
  const month = MONTHS.indexOf(m[3]);
  const d = new Date(Date.UTC(year, month, Number(m[2])));
  if (d.getUTCMonth() !== month || d.getUTCDate() !== Number(m[2])) return null;
  return WEEKDAYS[d.getUTCDay()] === m[1] ? d : null;
}

const within = (written, decimals, known, factor = 1) => Math.abs(written - known * factor) <= (10 ** -decimals) / 2 + EPS;

/**
 * Audits a text against a run's known figures. Returns { ok, offending: [{ token, reason }], figures }.
 * Options: wholeEuroFloor (an amount written in whole euros without a scale matches any figure that
 * rounds to it, even below €25 where 2 % is less than half a euro; off by default, see correction B8),
 * today (a Date: the app's day 0, for dates).
 */
export function auditText(text, known, { wholeEuroFloor = false, today = new Date() } = {}) {
  const figures = extractFigures(text);
  const offending = [];
  const flag = (f, reason) => offending.push({ token: f.raw, reason });
  for (const f of figures) {
    switch (f.type) {
      case "id":
        if (!known.ids.has(f.raw)) flag(f, "unknown id");
        break;
      case "code":
        if (!known.ids.has(f.code)) flag(f, `unknown ${f.word.replace(/s$/, "")}`);
        break;
      case "date": {
        const d = parseDate(f.raw, today);
        if (!d) flag(f, "not a real date");
        else if (known.dayNumbers.size) {
          const n = Math.round((d.getTime() - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
          if (!known.dayNumbers.has(n)) flag(f, "a date no tool returned");
        }
        break;
      }
      case "amount": {
        const half = (f.scale * 10 ** -f.decimals) / 2;
        const floor = wholeEuroFloor && f.scale === 1 && f.decimals === 0;
        const ok = known.amounts.some((k) => (k.currency === null || k.currency === f.currency)
          && Math.abs(f.value - k.value) <= half + EPS && (floor || Math.abs(f.value - k.value) <= MAX_RELATIVE * k.value + EPS));
        if (!ok) flag(f, "no tool returned this amount");
        break;
      }
      case "share":
        if (!known.shares.some((k) => within(f.value, f.decimals, k, 100))) flag(f, "no tool returned this share");
        break;
      case "days":
        if (!known.days.some((k) => within(f.value, f.decimals, k))) flag(f, "no tool returned this number of days");
        break;
      case "count":
        if (!known.counts.some((k) => within(f.value, f.decimals, k))) flag(f, "no tool returned this number");
        break;
      default:
        break; // ordinals
    }
  }
  return { ok: offending.length === 0, offending, figures: figures.length };
}
