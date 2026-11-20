// Runs every check in order and prints a summary. The app itself needs none of this.
// Usage: node tests/run-all.mjs               (all suites)
//        node tests/run-all.mjs engine smoke  (only the named suites)
import { spawnSync } from "node:child_process";
import path from "node:path";
import { APP_ROOT } from "./lib/harness.mjs";

const SUITES = [
  { id: "tokens", what: "colour system on Vici's tokens, light and dark: contrast, colour-blind separation", file: "tests/tokens.mjs", browser: false },
  { id: "page-icon", what: "page icon: favicon, header and loading screen, as on the website's card", file: "tests/page-icon.mjs", browser: false },
  { id: "vici-files", what: "vici/ holds exactly the files its README lists, unchanged", file: "tests/vici-files.mjs", browser: false },
  { id: "world", what: "world builder deterministic, the shared accounts, scenarios against frozen figures, check digits, log", file: "tests/world.mjs", browser: false },
  { id: "unit", what: "data contracts and validator, formatting, streaming client, retries, cost maths", file: "tests/unit.mjs", browser: false },
  { id: "engine", what: "golden cases D1 to D4: rules, totals, history, reconciliation, projection, fix paths", file: "tests/engine.mjs", browser: false },
  { id: "audit", what: "figure audit: golden cases F01 to F15 and adversarial texts", file: "tests/audit.mjs", browser: false },
  { id: "tools", what: "the agent's seventeen tools: schemas and limits, figures equal the references, every guardrail", file: "tests/tools.mjs", browser: false },
  { id: "vat", what: "VAT format rule: one passing and one failing example per country, never a check digit", file: "tests/vat.mjs", browser: false },
  { id: "policy", what: "security policy, no outside resources, no inline script or style, storage keys", file: "tests/policy.mjs", browser: false },
  { id: "hygiene", what: "no client, contact or meeting named in any published file", file: "tests/hygiene.mjs", browser: false },
  { id: "docs", what: "the documents complete, their cited sections and named paths real, the live site linked", file: "tests/docs.mjs", browser: false },
  { id: "parity", what: "shared shell identical to the sister app's, two modules adapted (needs a Rebate Hunter checkout)", file: "tests/parity.mjs", browser: false, optional: true },
  { id: "smoke", what: "the page boots in both themes and two sizes, tiles equal the engine, Diagnostics passes", file: "tests/smoke.mjs", browser: true },
  { id: "sims", what: "the six scenarios in Simulation along three decision paths, offline, with the engine's figures", file: "tests/sims.mjs", browser: true },
  { id: "live", what: "the live agent against the scripted API stand-in: key, guardrails, review, caps, sweep, custom, recorder", file: "tests/live.mjs", browser: true },
  { id: "accept", what: "the board equals the engine; honesty; exports; the Method dialog; keyboard, motion and names", file: "tests/accept.mjs", browser: true },
  { id: "hexagon", what: "nothing round: the app's files, and the rendered app in both themes through a run", file: "tests/hexagon.mjs", browser: true },
  { id: "layout", what: "1920×1080 to 1280×720 in both themes: no overflow, nothing cut, targets of 40 px", file: "tests/layout.mjs", browser: true },
  { id: "design", what: "the colour grammar on the tokens, merlot for your turn, AI labels; review captures", file: "tests/design.mjs", browser: true }
];

const only = process.argv.slice(2);
const unknown = only.filter((id) => !SUITES.some((s) => s.id === id));
if (unknown.length) {
  console.error(`Unknown suite(s): ${unknown.join(", ")}. Known: ${SUITES.map((s) => s.id).join(", ")}.`);
  process.exit(1);
}
const chosen = SUITES.filter((s) => !only.length || only.includes(s.id));
const summary = [];
// In GitHub Actions a failed suite also becomes an annotation with its FAIL lines, readable in the
// run's summary and through the API without the full log.
const CI = process.env.GITHUB_ACTIONS === "true";
const annotate = (s, out) => {
  // Each FAIL line with the indented detail lines under it; otherwise the last lines of the output.
  const lines = out.split("\n").filter((l) => l.trim());
  const picked = [];
  lines.forEach((l, i) => {
    if (!/^(FAIL|Error|AssertionError|TypeError)|failed|exceeded/i.test(l.trim())) return;
    picked.push(l.trim());
    for (let j = i + 1; j < lines.length && /^\s+(-|at |\S)/.test(lines[j]) && j <= i + 8; j++) picked.push(lines[j].trim());
  });
  const text = (picked.length ? picked : lines.slice(-12).map((l) => l.trim())).join(" ⏎ ").slice(0, 6000);
  console.log(`::error title=${s.id} suite failed::${text}`);
};
for (const s of chosen) {
  console.log(`\n=== ${s.id}: ${s.what} ===`);
  const started = Date.now();
  const r = spawnSync(process.execPath, [path.join(APP_ROOT, s.file), ...(s.args || [])], { cwd: APP_ROOT, stdio: CI ? ["inherit", "pipe", "pipe"] : "inherit", env: process.env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (CI) {
    process.stdout.write(r.stdout || "");
    process.stderr.write(r.stderr || "");
    if (r.status !== 0 && !(s.optional && r.status === 2)) annotate(s, `${r.stdout || ""}\n${r.stderr || ""}`);
  }
  // An optional suite without what it needs (parity without a sister-app checkout) exits 2: skipped.
  if (s.optional && r.status === 2) {
    summary.push({ ...s, ok: true, skipped: true, code: r.status, seconds: Math.round((Date.now() - started) / 1000) });
    continue;
  }
  summary.push({ ...s, ok: r.status === 0, code: r.status, seconds: Math.round((Date.now() - started) / 1000) });
  if (r.status === 2 && s.browser) {
    console.log("Playwright is missing; browser suites are skipped. See tests/README.md.");
    break;
  }
}

console.log("\n=== Summary ===");
for (const s of summary) console.log(`${s.skipped ? "SKIP" : s.ok ? "PASS" : "FAIL"}  ${s.id.padEnd(10)} ${String(s.seconds).padStart(4)} s  ${s.what}`);
const skipped = chosen.length - summary.length;
if (skipped) console.log(`(${skipped} suite${skipped === 1 ? "" : "s"} not run)`);
const allPassed = summary.length === chosen.length && summary.every((s) => s.ok);
const noneSkipped = summary.every((s) => !s.skipped);
// The success lines name what ran: every suite with none skipped, or exactly the suites asked for.
if (allPassed && noneSkipped && !only.length) console.log(`ALL SUITES PASSED (${summary.length} of ${SUITES.length})`);
if (allPassed && noneSkipped && only.length) console.log(`SUITES PASSED: ${chosen.map((s) => s.id).join(" ")}`);
process.exit(allPassed ? 0 : 1);
