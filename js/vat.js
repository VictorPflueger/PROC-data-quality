// The VAT ID format rule of DQ-10: a supplier's VAT ID must exist, start with its country's prefix
// (EL for Greece, CHE for Switzerland) and follow that country's published format. It checks the
// format only and never a check digit: the world's VAT IDs are fictional and fail the real check
// digits on purpose (js/vat_check.js holds those, for the world builder and its checker only).
// The formats and their sources are in DATA_SOURCES.md; Spain's follows VIES (correction B1).

/** The VAT prefix of each country the method knows (ISO country code → prefix). */
export const VAT_PREFIX = Object.freeze({ DE: "DE", FR: "FR", GB: "GB", NL: "NL", AT: "AT", IT: "IT", ES: "ES", CH: "CHE", GR: "EL" });

/** Each country's format after normalisation, with the words the method dialog shows. */
export const VAT_FORMATS = Object.freeze({
  DE: { re: /^DE[0-9]{9}$/, text: "DE + 9 digits" },
  FR: { re: /^FR[A-Z0-9]{2}[0-9]{9}$/, text: "FR + 2 letters or digits + 9 digits" },
  GB: { re: /^GB(?:[0-9]{9}|[0-9]{12}|GD[0-9]{3}|HA[0-9]{3})$/, text: "GB + 9 or 12 digits, or GD or HA + 3 digits" },
  NL: { re: /^NL[0-9]{9}B[0-9]{2}$/, text: "NL + 9 digits + B + 2 digits" },
  AT: { re: /^ATU[0-9]{8}$/, text: "AT + U + 8 digits" },
  IT: { re: /^IT[0-9]{11}$/, text: "IT + 11 digits" },
  // VIES: the first and the last character may each be a letter or a digit, but not both digits.
  ES: { re: /^ES(?:[A-Z][0-9]{7}[A-Z0-9]|[0-9][0-9]{7}[A-Z])$/, text: "ES + a letter or digit + 7 digits + a letter or digit, not digits at both ends" },
  CH: { re: /^CHE[0-9]{9}$/, text: "CHE + 9 digits (printed CHE-123.456.789 with MWST, TVA or IVA)" },
  GR: { re: /^EL[0-9]{9}$/, text: "EL + 9 digits" }
});

/**
 * A VAT ID as the rule compares it: upper case, without spaces, dots and hyphens, and without the
 * Swiss suffix MWST, TVA or IVA. Empty or missing: null.
 */
export function normaliseVat(id) {
  if (id === null || id === undefined) return null;
  const s = String(id).toUpperCase().replace(/[\s.\-]/g, "").replace(/(MWST|TVA|IVA)$/, "");
  return s ? s : null;
}

/**
 * Why a supplier's VAT ID breaks DQ-10, or null when it does not:
 * "missing" (no VAT ID), "prefix" (not the country's prefix), "format" (the rest breaks the format).
 * A country without a published format here is checked for its prefix only.
 */
export function vatProblem(country, id) {
  const v = normaliseVat(id);
  if (!v) return "missing";
  const prefix = VAT_PREFIX[country] || String(country || "").toUpperCase();
  if (!prefix || !v.startsWith(prefix)) return "prefix";
  const format = VAT_FORMATS[country];
  if (format && !format.re.test(v)) return "format";
  return null;
}

/** Words for a problem, for tables and the agent's evidence. */
export const VAT_PROBLEM_TEXT = Object.freeze({ missing: "VAT ID missing", prefix: "VAT prefix differs from the country", format: "VAT ID breaks the country's format" });
