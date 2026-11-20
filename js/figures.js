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
//   - a date must be a real one (with the right weekday, when it names one) and, in a run, a day some
//     tool returned: the run's day, an order's day, a contract's validity, a log entry's days, a cohort's
//     bounds. A month ("November 2025") must contain such a day, and "Week 3" must be a cohort the
//     history tool returned;
//   - counts written as words ("three owners") are allowed.

const SCALE = { k: 1e3, thousand: 1e3, m: 1e6, mn: 1e6, million: 1e6, millions: 1e6, bn: 1e9, b: 1e9, billion: 1e9, billions: 1e9 };
const CURRENCY = { "€": "EUR", eur: "EUR", euro: "EUR", euros: "EUR", "£": "GBP", gbp: "GBP", pound: "GBP", pounds: "GBP" };
const MAX_RELATIVE = 0.02;
const EPS = 1e-9;

// Month and weekday names from the same Intl formatter the app writes dates with (js/format.js), so
// the audit reads exactly what the screens and the tools show: en-GB writes "Sept", not "Sep". The
// long names and the three-letter forms are read too, because a text may write "Friday 20 November"
// (the form the system prompt gives today's date in) or "Sep".
const intlNames = (options, n, dateOf) => {
  const fmt = new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" });
  return Array.from({ length: n }, (_, i) => fmt.format(dateOf(i)));
};
const monthDate = (m) => new Date(Date.UTC(2026, m, 7));
const weekdayDate = (d) => new Date(Date.UTC(2026, 10, 1 + d)); // 1 November 2026 is a Sunday
const MONTHS_LONG = intlNames({ month: "long" }, 12, monthDate);
const WEEKDAYS_LONG = intlNames({ weekday: "long" }, 7, weekdayDate);
/** Name → month index (0 to 11): "Sept", "Sep", "September". */
const MONTH_INDEX = new Map();
intlNames({ month: "short" }, 12, monthDate).forEach((s, i) => MONTH_INDEX.set(s, i));
MONTHS_LONG.forEach((s, i) => { MONTH_INDEX.set(s, i); MONTH_INDEX.set(s.slice(0, 3), i); });
/** Name → weekday index (0 is Sunday): "Thu", "Thursday". */
const WEEKDAY_INDEX = new Map();
intlNames({ weekday: "short" }, 7, weekdayDate).forEach((s, i) => WEEKDAY_INDEX.set(s, i));
WEEKDAYS_LONG.forEach((s, i) => { WEEKDAY_INDEX.set(s, i); WEEKDAY_INDEX.set(s.slice(0, 3), i); });
const alternatives = (names) => [...names].sort((a, b) => b.length - a.length).join("|"); // longest first
const MON = alternatives(MONTH_INDEX.keys());
const WD = alternatives(WEEKDAY_INDEX.keys());
const ORD = "(?:st|nd|rd|th)?";

/** The figures one run's tools returned, by kind, and the ids that exist in the world or the run. */
export class KnownFigures {
  constructor() {
    this.amounts = [];   // { value, currency }
    this.shares = [];    // fractions: 0.064 for 6.4 %
    this.counts = [];
    this.days = [];
    this.ids = new Set();
    // Calendar days (day numbers relative to today) that dates may name. The toolbox always adds the
    // run's day, so in a run the set is never empty; an empty set (a check without a run, as in some
    // unit tests) lets any real date pass.
    this.dayNumbers = new Set();
    this.weeks = new Set();      // the cohort numbers "Week N" may name
  }
  amount(value, currency = "EUR") { const v = Number(value); if (Number.isFinite(v)) this.amounts.push({ value: Math.abs(v), currency }); return this; }
  share(value) { const v = Number(value); if (Number.isFinite(v)) this.shares.push(v); return this; }
  count(value) { const v = Number(value); if (Number.isFinite(v)) this.counts.push(Math.abs(v)); return this; }
  day(value) { const v = Number(value); if (Number.isFinite(v)) this.days.push(Math.abs(v)); return this; }
  id(value) { if (value !== null && value !== undefined && value !== "") this.ids.add(String(value)); return this; }
  /** A calendar day a date may name, as a day number relative to today (0 is today, −3 three days ago). */
  dayNumber(value) { const v = Number(value); if (Number.isInteger(v)) this.dayNumbers.add(v); return this; }
  /** A weekly cohort "Week N" may name. */
  week(value) { const v = Number(value); if (Number.isInteger(v)) this.weeks.add(v); return this; }
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
    for (const x of other.weeks) this.weeks.add(x);
    return this;
  }
}

// Keys whose integer values are day numbers relative to today in ERP and engine results: an order's
// day, a contract's validity, a supplier's block and creation, a user's last day, a log entry's days,
// a cohort's or a closure rate's bounds, the run's own day (as_of.day). Durations such as
// payment_terms_days or days are not dates and are not here.
const DATE_KEYS = new Set(["day", "valid_from", "valid_to", "block_from", "created_day", "active_until", "detected_day", "routed_day", "closed_day", "from", "to"]);

/** Adds every day number a tool result names (see DATE_KEYS) and every cohort number to `known`. */
export function addDates(known, result) {
  const walk = (v, depth) => {
    if (depth > 8 || v === null || typeof v !== "object") return;
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    for (const [key, x] of Object.entries(v)) {
      if (DATE_KEYS.has(key) && Number.isInteger(x)) known.dayNumber(x);
      else if (key === "cohorts" && Array.isArray(x)) for (const c of x) if (c && Number.isInteger(c.week)) known.week(c.week);
      walk(x, depth + 1);
    }
  };
  walk(result, 0);
  return known;
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
  // Dates: ISO; day first ("Thu 19 Nov", "Mon 7 Sept 2026", "Friday, 20 November 2026", "20 Nov");
  // month first ("November 20, 2026", "Fri, Nov 20"); a month with its year ("November 2025"). Names
  // are case-sensitive, so "may" and "sun" in a sentence are words, not dates.
  ["date-iso", /\b\d{4}-\d{2}-\d{2}\b/g],
  ["date-dmy", new RegExp(`\\b(?:(${WD})\\.?,?\\s+)?(\\d{1,2})${ORD}\\s+(?:of\\s+)?(${MON})\\b\\.?(?:,?\\s+(\\d{4})\\b)?`, "g")],
  ["date-mdy", new RegExp(`\\b(?:(${WD})\\.?,?\\s+)?(${MON})\\.?\\s+(\\d{1,2})${ORD}\\b(?:,?\\s+(\\d{4})\\b)?`, "g")],
  ["month", new RegExp(`\\b(${MON})\\.?\\s+(\\d{4})\\b`, "g")],
  // Weekly cohorts: "Week 3", "weeks 1 to 8", "weeks 3 and 4". No comma lists: in "in week 2, 14
  // exceptions" the 14 is a count.
  ["week", /\b[Ww]eeks?\s+\d{1,2}(?:(?:\s+(?:to|and|or)\s+|\s*[–-]\s*)\d{1,2})*\b/g],
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
 * word), date (y or null, mo 0 to 11, d, wd 0 to 6 or null), month (y, mo), week (week), ordinal.
 * Earlier patterns win where two overlap.
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
      } else if (type === "date-iso") {
        const [y, mo, d] = raw.split("-").map(Number);
        out.push({ type: "date", raw, index: a, y, mo: mo - 1, d, wd: null });
      } else if (type === "date-dmy" || type === "date-mdy") {
        const dmy = type === "date-dmy";
        const wd = m[1] ? WEEKDAY_INDEX.get(m[1]) : null;
        out.push({ type: "date", raw: raw.replace(/[.,]+$/, ""), index: a, y: m[4] ? Number(m[4]) : null, mo: MONTH_INDEX.get(dmy ? m[3] : m[2]), d: Number(dmy ? m[2] : m[3]), wd });
      } else if (type === "month") {
        out.push({ type, raw, index: a, y: Number(m[2]), mo: MONTH_INDEX.get(m[1]) });
      } else if (type === "week") {
        // "Week 3", "weeks 1 to 8": every number is a cohort; the first carries the word.
        const word = /^[Ww]eeks?/.exec(m[0])[0];
        [...m[0].matchAll(/\d{1,2}/g)].forEach((n, i) => out.push({ type, raw: i === 0 ? `${word} ${n[0]}` : n[0], index: a + n.index, week: Number(n[0]) }));
      } else out.push({ type, raw, index: a });
    }
  }
  return out.sort((x, y) => x.index - y.index);
}

const dayZero = (today) => Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());

/**
 * The day numbers (relative to today) a written date can mean: one for a date with its year, and for
 * a date without one each of this year, last year and next year that is real and has the weekday the
 * text names (the app writes the year whenever it is not this year, but a text may leave it out for a
 * day in last December). An empty list: not a real date.
 */
function dayNumbersOf(f, today) {
  const years = f.y !== null ? [f.y] : [today.getFullYear(), today.getFullYear() - 1, today.getFullYear() + 1];
  const out = [];
  for (const y of years) {
    if (!Number.isInteger(f.mo) || f.mo < 0 || f.mo > 11) continue;
    const d = new Date(Date.UTC(y, f.mo, f.d));
    if (d.getUTCFullYear() !== y || d.getUTCMonth() !== f.mo || d.getUTCDate() !== f.d) continue;
    if (f.wd !== null && d.getUTCDay() !== f.wd) continue;
    out.push(Math.round((d.getTime() - dayZero(today)) / 86400000));
  }
  return out;
}

/** True when a known day number falls in the written month. */
function monthHasKnownDay(f, known, today) {
  const base = dayZero(today);
  for (const n of known.dayNumbers) {
    const d = new Date(base + n * 86400000);
    if (d.getUTCFullYear() === f.y && d.getUTCMonth() === f.mo) return true;
  }
  return false;
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
        const ns = dayNumbersOf(f, today);
        if (!ns.length) flag(f, "not a real date");
        else if (known.dayNumbers.size && !ns.some((n) => known.dayNumbers.has(n))) flag(f, "a date no tool returned");
        break;
      }
      case "month":
        if (known.dayNumbers.size && !monthHasKnownDay(f, known, today)) flag(f, "a month no tool returned a day of");
        break;
      case "week":
        if (!known.weeks.has(f.week)) flag(f, "a week no tool returned");
        break;
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
