// Checks data/world.js with the same checks Diagnostics runs in the browser (js/world_check.js): the
// data contracts, references, day windows, the shared accounts, the fictional VAT IDs, a log that
// agrees with the data, the six scenarios and the frozen reference figures. Simulation scripts join
// in the next milestone.
// Usage from the repository root:  node tools/check_world.mjs [path to a world.js]
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { checkWorld } from "../js/world_check.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = (file) => {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), ctx, { filename: file });
  return ctx.window;
};
const worldFile = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, "data", "world.js");
const { WORLD } = load(worldFile);
const { SCENARIOS } = load(path.join(ROOT, "data", "scenarios.js"));
const refFile = path.join(ROOT, "data", "reference_cases.js");
const REFERENCE_CASES = fs.existsSync(refFile) ? load(refFile).REFERENCE_CASES : null;
const res = checkWorld(WORLD, SCENARIOS, REFERENCE_CASES);
for (const c of res.checks) console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}: ${c.detail}`);
console.log(`${res.checks.filter((c) => c.ok).length}/${res.checks.length} world checks passed (${path.relative(ROOT, worldFile)}).`);
if (!res.ok) process.exit(1);
console.log("WORLD CHECK OK");
