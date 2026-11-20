// Checks data/world.js with the same checks Diagnostics runs in the browser (js/world_check.js): the
// data contracts, references, day windows, the shared accounts, the fictional VAT IDs, a log that
// agrees with the data, the six scenarios and the frozen reference figures. Then it holds every
// simulation script in data/sim_runs.js to the live guardrails (js/sim_check.js): each script runs
// through the live toolbox with a scripted person, along every decision path it offers.
// Usage from the repository root:  node tools/check_world.mjs [path to a world.js] [--runs path to a sim_runs.js]
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { checkWorld } from "../js/world_check.js";
import { checkScripts } from "../js/sim_check.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = (file) => {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), ctx, { filename: file });
  return ctx.window;
};
const args = process.argv.slice(2);
const runsAt = args.indexOf("--runs");
const runsFile = runsAt >= 0 ? path.resolve(args.splice(runsAt, 2)[1]) : path.join(ROOT, "data", "sim_runs.js");
const worldFile = args[0] ? path.resolve(args[0]) : path.join(ROOT, "data", "world.js");
const { WORLD } = load(worldFile);
const { SCENARIOS } = load(path.join(ROOT, "data", "scenarios.js"));
const refFile = path.join(ROOT, "data", "reference_cases.js");
const REFERENCE_CASES = fs.existsSync(refFile) ? load(refFile).REFERENCE_CASES : null;
const res = checkWorld(WORLD, SCENARIOS, REFERENCE_CASES);
for (const c of res.checks) console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}: ${c.detail}`);
console.log(`${res.checks.filter((c) => c.ok).length}/${res.checks.length} world checks passed (${path.relative(ROOT, worldFile)}).`);
if (!res.ok) process.exit(1);
console.log("WORLD CHECK OK");

const { SIM_RUNS } = load(runsFile);
const scripts = await checkScripts(WORLD, SIM_RUNS, { scenarios: SCENARIOS });
for (const s of scripts.results) {
  console.log(`${s.ok ? "PASS" : "FAIL"}  Script ${s.id}: ${s.runs.length} decision paths${s.problems.length ? `; ${s.problems.join("; ")}` : ""}`);
  for (const r of s.runs) if (!r.ok) console.log(`        ${r.plan}: ${r.problems.join(" | ")}`);
}
const passed = scripts.results.filter((s) => s.ok).length;
console.log(`${passed}/${scripts.results.length} simulation scripts pass the live guardrails (${path.relative(ROOT, runsFile)}).`);
if (!scripts.ok) process.exit(1);
console.log(`SCRIPTS OK: ${passed} of ${scripts.results.length}`);
