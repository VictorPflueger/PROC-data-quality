// Numbers and dates as the app shows them: Intl with en-GB. Euros without decimals ("€58,725"),
// shares with one decimal ("6.4%"), monthly inflow with one decimal ("1.3"), counts and days as whole
// numbers, dates as "Thu 19 Nov" (with the year when it is not this year). Every value is rounded to
// 1e-9 first, so floating-point noise (1,500 × 1.15 = 1724.9999999999998) never moves a digit; Intl
// then rounds half away from zero. Pure functions, the same in the browser and in the tests.

const LOCALE = "en-GB";
const EURO = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const EURO_CENTS = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PCT1 = new Intl.NumberFormat(LOCALE, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
const DEC1 = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const INT = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const DAY_LABEL = new Intl.DateTimeFormat(LOCALE, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const DAY_LABEL_YEAR = new Intl.DateTimeFormat(LOCALE, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** The value rounded to 1e-9 (removes floating-point noise before display). */
export const r9 = (v) => Math.round(Number(v) * 1e9) / 1e9;

/** "€58,725". */
export const euro = (v) => EURO.format(r9(v));
/** "€18.41", for the few places that need cents. */
export const euroCents = (v) => EURO_CENTS.format(r9(v));
/** "6.4%" from 0.0637…. */
export const pct1 = (v) => PCT1.format(r9(v));
/** "1.3". */
export const dec1 = (v) => DEC1.format(r9(v));
/** "18", "1,234". */
export const int = (v) => INT.format(r9(v));
/** "14 days", "1 day". */
export const days = (v) => `${int(v)} ${Math.abs(r9(v)) === 1 ? "day" : "days"}`;
/** A share, or "no history" when there is none. */
export const shareOrNone = (v) => (v === null || v === undefined ? "no history" : pct1(v));

/** The calendar day (UTC midnight) of day number `n` relative to `today` (a Date, the app's day 0). */
export function dateOfDay(n, today = new Date()) {
  const base = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return new Date(base + n * 86400000);
}
/** "Thu 19 Nov", with the year when it is not today's year: "Fri 21 Nov 2025". */
export function dayLabel(n, today = new Date()) {
  const d = dateOfDay(n, today);
  return (d.getUTCFullYear() === today.getFullYear() ? DAY_LABEL : DAY_LABEL_YEAR).format(d).replace(",", "");
}
/** "2026-11-19". */
export function isoDay(n, today = new Date()) {
  return dateOfDay(n, today).toISOString().slice(0, 10);
}
/** The day number of a calendar date (UTC midnight) relative to `today`. */
export function dayOfDate(date, today = new Date()) {
  const base = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((date.getTime() - base) / 86400000);
}
