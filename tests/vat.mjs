// The VAT ID format rule DQ-10 (AC-03): for each country of the world, plus Greece as a test case,
// one VAT ID that passes and one that fails (tests/fixtures/vat.json), more edge cases, and proof
// that the rule never checks a check digit: it gives the same verdict for all ten variants of an
// ID's check-digit position, of which the published rule (js/vat_check.js) accepts some and rejects
// others, and js/vat.js neither imports the check-digit module nor does modular arithmetic.
// Usage: node tests/vat.mjs
import { readFileSync } from "node:fs";
import path from "node:path";
import { APP_ROOT } from "./lib/harness.mjs";
import { vatProblem, VAT_FORMATS, VAT_PREFIX } from "../js/vat.js";
import { passesCheckDigit, CHECK_RULE_KIND } from "../js/vat_check.js";

const FIX = JSON.parse(readFileSync(path.join(APP_ROOT, "tests", "fixtures", "vat.json"), "utf8"));
const failures = [];
let checks = 0;
const check = (ok, what) => { checks += 1; if (!ok) failures.push(what); return ok; };

// One passing and one failing example per country, plus Greece.
const WORLD_COUNTRIES = ["DE", "FR", "GB", "NL", "AT", "IT", "ES", "CH"];
const covered = FIX.countries.map((c) => c.country);
check(JSON.stringify([...WORLD_COUNTRIES, "GR"].sort()) === JSON.stringify(covered.slice().sort()), `examples for exactly the world's countries and Greece (got ${covered.join(", ")})`);
check(JSON.stringify(Object.keys(VAT_FORMATS).sort()) === JSON.stringify([...WORLD_COUNTRIES, "GR"].sort()), "a format for each of those countries and no other");
for (const c of FIX.countries) {
  const pass = vatProblem(c.country, c.pass);
  const fail = vatProblem(c.country, c.fail);
  check(pass === null, `${c.country}: ${c.pass} should pass, got "${pass}"`);
  check(fail !== null, `${c.country}: ${c.fail} should fail (${c.why}), but passed`);
  console.log(`${pass === null && fail !== null ? "PASS" : "FAIL"}  ${c.country.padEnd(3)} ${VAT_FORMATS[c.country].text.padEnd(70)} accepts ${c.pass.padEnd(15)} rejects ${c.fail.padEnd(13)} (${fail})`);
}
check(VAT_PREFIX.GR === "EL" && VAT_PREFIX.CH === "CHE", "Greece's prefix is EL and Switzerland's CHE");
// Spain, correction B1: digits at both ends are rejected; a letter at either end is accepted.
check(vatProblem("ES", "ES123456789") === "format", "ES: digits at both ends are rejected (B1)");
for (const m of FIX.more) {
  const got = vatProblem(m.country, m.id);
  check((got === null) === m.valid, `${m.country} ${JSON.stringify(m.id)}: ${m.why}; expected ${m.valid ? "pass" : "fail"}, got ${got === null ? "pass" : got}`);
}
check(vatProblem("DE", null) === "missing" && vatProblem("DE", "") === "missing" && vatProblem("DE", "   ") === "missing", "missing, empty and blank IDs are missing");
check(vatProblem("DE", "ATU12345678") === "prefix", "a foreign prefix is a prefix problem");

// Never a check digit: vary the check-digit position through 0–9. The rule accepts all ten; the
// published (or widely used) rule accepts some and rejects the others.
const POSITION = { DE: -1, AT: -1, IT: -1, NL: 10, GB: -1, CH: -1, FR: -1, ES: -1, GR: -1 };
for (const c of FIX.countries) {
  const base = c.pass;
  const at = POSITION[c.country] < 0 ? base.length + POSITION[c.country] : POSITION[c.country];
  const variants = [..."0123456789"].map((d) => base.slice(0, at) + d + base.slice(at + 1));
  const verdicts = variants.map((v) => vatProblem(c.country, v));
  check(verdicts.every((v) => v === null), `${c.country}: the rule accepts every check-digit variant of ${base} (${verdicts.join(",")})`);
  const real = variants.map((v) => passesCheckDigit(c.country, v));
  if (CHECK_RULE_KIND[c.country] === "published") {
    check(real.some((x) => x === true) && real.some((x) => x === false), `${c.country}: among the variants of ${base}, the published check digit accepts some and rejects others (${real.join(",")}), so the rule's verdict does not depend on it`);
  }
}

// Static: js/vat.js imports nothing (in particular not js/vat_check.js) and computes no remainder.
const src = readFileSync(path.join(APP_ROOT, "js", "vat.js"), "utf8");
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1").replace(/\/(?:\\.|\[[^\]]*\]|[^/\\\n])+\/[gimsuy]*/g, "RE").replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, "S");
check(!/\bimport\b/.test(code), "js/vat.js imports nothing");
check(!/%/.test(code) && !/\bmod\w*\s*\(/i.test(code), "js/vat.js computes no remainder (no check digit)");
// The engine uses the format rule, never the check-digit module.
for (const f of ["engine.js", "rules.js"]) {
  const s = readFileSync(path.join(APP_ROOT, "js", f), "utf8");
  check(!/vat_check/.test(s), `js/${f} does not use js/vat_check.js`);
}

for (const f of failures) console.log(`FAIL  ${f}`);
console.log(`${checks - failures.length}/${checks} VAT checks passed.`);
if (failures.length) process.exit(1);
console.log("VAT OK");
