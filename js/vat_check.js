// Check digits of VAT IDs, for the world builder and the world's checker only: every fictional VAT
// ID in the world must FAIL its country's check digit, so that no generated number can be a real
// registration. The rule DQ-10 never uses this module (js/vat.js checks the format only).
//
// Published rules (DATA_SOURCES.md has each source and its date): Germany (ISO 7064 MOD 11,10, first
// digit not 0), Austria (Luhn on the seven digits after U, check = (6 − sum) mod 10), Italy (Luhn
// over eleven digits, office code 001–100, 120, 121, 888 or 999), the Netherlands (modulo 11 as for
// the citizen number, or since 2020 ISO 7064 MOD 97-10 over "NL" and the number), the United Kingdom
// (weights 8 7 6 5 4 3 2 10 1, the sum modulo 97 is 0, or 42 or 55 for numbers from 100 0000 00;
// GD 000–499, HA 500–999) and Switzerland (weights 5 4 3 2 7 6 5 4, check = 11 − sum mod 11, a
// remainder of 10 is never issued). France, Spain and Greece have not agreed to publish theirs: for
// France and Spain the rules in wide use (as python-stdnum 2.2 implements them) are applied as well,
// and DATA_SOURCES.md says that they are not official (correction B2).

import { normaliseVat } from "./vat.js";

const digitsOnly = (s) => /^[0-9]+$/.test(s);
const mod = (a, n) => ((a % n) + n) % n;

/** Luhn checksum of a digit string (0 for a valid number). */
export function luhnChecksum(digits) {
  let sum = 0;
  const rev = digits.split("").reverse().map(Number);
  rev.forEach((d, i) => {
    if (i % 2 === 0) sum += d;
    else { const x = d * 2; sum += Math.floor(x / 10) + (x % 10); }
  });
  return sum % 10;
}

/** ISO 7064 MOD 11,10 checksum (1 for a valid number). */
function mod1110(digits) {
  let check = 5;
  for (const c of digits) check = mod(mod((check || 10) * 2, 11) + Number(c), 10);
  return check;
}

/** ISO 7064 MOD 97-10 over letters and digits (1 for a valid number). */
function mod9710(text) {
  let rest = 0;
  for (const c of text) {
    const v = parseInt(c, 36);
    for (const d of String(v)) rest = (rest * 10 + Number(d)) % 97;
  }
  return rest;
}

const FR_ALPHABET = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";

const RULES = {
  DE(n) {
    const d = n.slice(2);
    return digitsOnly(d) && d.length === 9 && d[0] !== "0" && mod1110(d) === 1;
  },
  AT(n) {
    const d = n.slice(3);
    if (!n.startsWith("ATU") || !digitsOnly(d) || d.length !== 8) return false;
    return String(mod(6 - luhnChecksum(d.slice(0, 7)), 10)) === d[7];
  },
  IT(n) {
    const d = n.slice(2);
    if (!digitsOnly(d) || d.length !== 11 || Number(d.slice(0, 7)) === 0) return false;
    const office = d.slice(7, 10);
    if (!((office >= "001" && office <= "100") || ["120", "121", "888", "999"].includes(office))) return false;
    return luhnChecksum(d) === 0;
  },
  NL(n) {
    const d = n.slice(2);
    if (!/^[0-9]{9}B[0-9]{2}$/.test(d) || Number(d.slice(0, 9)) <= 0 || Number(d.slice(10)) <= 0) return false;
    const nine = d.slice(0, 9);
    let s = 0;
    for (let i = 0; i < 8; i++) s += (9 - i) * Number(nine[i]);
    const bsn = mod(s - Number(nine[8]), 11) === 0;
    return bsn || mod9710(`NL${d}`) === 1;
  },
  GB(n) {
    const d = n.slice(2);
    if (/^GD[0-9]{3}$/.test(d)) return Number(d.slice(2)) < 500;
    if (/^HA[0-9]{3}$/.test(d)) return Number(d.slice(2)) >= 500;
    if (!digitsOnly(d) || !(d.length === 9 || d.length === 12)) return false;
    const w = [8, 7, 6, 5, 4, 3, 2, 10, 1];
    const sum = w.reduce((t, x, i) => t + x * Number(d[i]), 0) % 97;
    return Number(d.slice(0, 3)) >= 100 ? [0, 42, 55].includes(sum) : sum === 0;
  },
  CH(n) {
    const d = n.slice(3);
    if (!n.startsWith("CHE") || !digitsOnly(d) || d.length !== 9) return false;
    const w = [5, 4, 3, 2, 7, 6, 5, 4];
    const s = w.reduce((t, x, i) => t + x * Number(d[i]), 0);
    const check = mod(11 - s, 11);
    return check !== 10 && String(check) === d[8];
  },
  // Not published (B2): the rules in wide use.
  FR(n) {
    const d = n.slice(2);
    if (d.length !== 11 || ![...d.slice(0, 2)].every((c) => FR_ALPHABET.includes(c)) || !digitsOnly(d.slice(2))) return false;
    if (d.slice(2, 5) !== "000" && luhnChecksum(d.slice(2)) !== 0) return false;
    if (digitsOnly(d)) return Number(d.slice(0, 2)) === Number(BigInt(`${d.slice(2)}12`) % 97n);
    const a = FR_ALPHABET.indexOf(d[0]);
    const b = FR_ALPHABET.indexOf(d[1]);
    const check = digitsOnly(d[0]) ? a * 24 + b - 10 : a * 34 + b - 100;
    return mod(Number(d.slice(2)) + 1 + Math.floor(check / 11), 11) === mod(check, 11);
  },
  ES(n) {
    const d = n.slice(2);
    if (d.length !== 9 || !digitsOnly(d.slice(1, 8))) return false;
    const DNI = "TRWAGMYFPDXBNJZSQVHLCKE";
    const first = d[0];
    if (digitsOnly(first)) return DNI[Number(d.slice(0, 8)) % 23] === d[8];
    if ("XYZ".includes(first)) return DNI[Number(`${"XYZ".indexOf(first)}${d.slice(1, 8)}`) % 23] === d[8];
    if ("KLM".includes(first)) return DNI[Number(d.slice(1, 8)) % 23] === d[8];
    if (!"ABCDEFGHJNPQRSUVW".includes(first)) return false;
    const c = String(mod(10 - luhnChecksum(`${d.slice(1, 8)}0`), 10));
    return d[8] === c || d[8] === "JABCDEFGHI"[Number(c)];
  },
  // Greece (not published; python-stdnum's rule), for the test case only: no Greek supplier exists.
  GR(n) {
    const d = n.slice(2);
    if (!digitsOnly(d) || d.length !== 9) return false;
    let s = 0;
    for (const c of d.slice(0, 8)) s = s * 2 + Number(c);
    return String((s * 2) % 11 % 10) === d[8];
  }
};

/** Which kind of rule a country has: "published", "in use" (not official) or "none". */
export const CHECK_RULE_KIND = Object.freeze({ DE: "published", AT: "published", IT: "published", NL: "published", GB: "published", CH: "published", FR: "in use", ES: "in use", GR: "in use" });

/**
 * True when the VAT ID passes its country's check-digit rule (published or in use), false when it
 * fails, null when the country has no rule here.
 */
export function passesCheckDigit(country, id) {
  const fn = RULES[country];
  const n = normaliseVat(id);
  if (!fn || !n) return null;
  return fn(n);
}
