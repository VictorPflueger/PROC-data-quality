// The synthetic world (AC-05): the builder is deterministic (built twice into temporary files, the
// same bytes, and data/world.js is its output); the shared base keeps 124 of Rebate Hunter's 143
// accounts, one per duplicate-name group (re-derived here from a Rebate Hunter checkout when one is
// next to this repository or named by PARITY_REF); every check of js/world_check.js passes, including
// the six scenarios against the frozen reference figures, the recorded clean spend share, the VAT IDs
// failing their check digits and a log that agrees with the data; and each of those checks fails on a
// world planted with the fault it looks for. The six simulation scripts pass the live guardrails along
// every decision path (AC-13), and the script checker catches each fault planted in a copy of a script.
// Usage: node tests/world.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { APP_ROOT } from "./lib/harness.mjs";
import { checkWorld } from "../js/world_check.js";
import { ACCOUNTS } from "../tools/globalcorp_base.mjs";
import { passesCheckDigit } from "../js/vat_check.js";
import { checkScripts, checkScript, runOnce } from "../js/sim_check.js";

const failures = [];
const notes = [];
const check = (ok, what) => { (ok ? notes : failures).push(what); return ok; };
const load = (file) => { const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(file, "utf8"), ctx, { filename: file }); return ctx.window; };

// 1. Deterministic: two builds, the same bytes, equal to the committed file.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dq-world-"));
const outs = [path.join(tmp, "a.js"), path.join(tmp, "b.js")];
for (const out of outs) {
  const r = spawnSync(process.execPath, [path.join(APP_ROOT, "tools", "build_world.mjs"), "--out", out], { cwd: APP_ROOT, encoding: "utf8" });
  check(r.status === 0, `the builder runs (${(r.stderr || r.stdout).trim().split("\n").pop()})`);
}
const [a, b] = outs.map((f) => fs.readFileSync(f));
const committed = fs.readFileSync(path.join(APP_ROOT, "data", "world.js"));
check(a.equals(b), `two builds give the same bytes (${a.length} bytes)`);
check(a.equals(committed), "data/world.js is the builder's output (rebuild with node tools/build_world.mjs)");
fs.rmSync(tmp, { recursive: true, force: true });

// 2. The world, the tips and the frozen figures.
const { WORLD } = load(path.join(APP_ROOT, "data", "world.js"));
const { SCENARIOS } = load(path.join(APP_ROOT, "data", "scenarios.js"));
const { REFERENCE_CASES } = load(path.join(APP_ROOT, "data", "reference_cases.js"));
const res = checkWorld(WORLD, SCENARIOS, REFERENCE_CASES);
for (const c of res.checks) check(c.ok, `${c.name}: ${c.detail}`);

// 3. The shared base: the world's Rebate Hunter accounts are exactly tools/globalcorp_base.mjs, and
// that file is what Rebate Hunter's world yields (re-derived here independently, when a checkout exists).
const fields = (x) => JSON.stringify([x.id, x.name, x.city, x.country, x.currency, x.category]);
const inWorld = WORLD.suppliers.filter((s) => s.origin === "Rebate Hunter").map(fields).join("\n");
check(inWorld === ACCOUNTS.map(fields).join("\n"), `the world's ${ACCOUNTS.length} Rebate Hunter accounts equal tools/globalcorp_base.mjs`);
// The base names the commit it was taken from; the checkout's history gives that commit's world, so a
// later change to Rebate Hunter's world shows up here only once the base is taken again on purpose.
const BASE_COMMIT = "73c00f8";
const ref = [process.env.PARITY_REF, path.resolve(APP_ROOT, "..", "PROC-Rebate-Hunter")].find((d) => d && fs.existsSync(path.join(d, "data", "world.js")));
const rhWorld = (dir) => {
  const r = spawnSync("git", ["-C", dir, "show", `${BASE_COMMIT}:data/world.js`], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  const text = r.status === 0 ? r.stdout : fs.readFileSync(path.join(dir, "data", "world.js"), "utf8");
  const ctx = { window: {} };
  vm.runInNewContext(text, ctx);
  return { W: ctx.window.WORLD, at: r.status === 0 ? `at ${BASE_COMMIT}` : `its working tree, commit ${BASE_COMMIT} not in the checkout` };
};
check(fs.readFileSync(path.join(APP_ROOT, "tools", "globalcorp_base.mjs"), "utf8").includes(`at commit ${BASE_COMMIT}`), `tools/globalcorp_base.mjs names commit ${BASE_COMMIT} as its source`);
if (ref) {
  const { W, at } = rhWorld(ref);
  const LEGAL = new Set("gmbh ag se sa sas sarl ltd limited plc bv nv spa srl kg co inc".split(" "));
  const norm = (s) => String(s).toLowerCase().replace(/\./g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).filter((t) => t && !LEGAL.has(t)).join(" ");
  const real = new Set(W.groups.filter((g) => g.real).map((g) => g.id));
  const keys = new Set([...W.agreements.filter((x) => real.has(x.group)).map((x) => x.group_key), ...[...real].map((g) => g.replace(/^G-/, ""))]);
  const members = new Set(W.register.filter((r) => real.has(r.group)).map((r) => String(r.vendor)));
  const outside = W.vendors.filter((v) => !(v.group_key && keys.has(v.group_key)) && !members.has(String(v.id)));
  const groups = new Map();
  for (const v of outside) { const k = `${norm(v.name)}|${v.country}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(v); }
  const kept = [...groups.values()].map((g) => g.sort((x, y) => Number(x.id) - Number(y.id))[0]).sort((x, y) => Number(x.id) - Number(y.id));
  check(outside.length === 143 && kept.length === 124, `Rebate Hunter's world (${path.relative(APP_ROOT, ref) || "."}, ${at}): ${outside.length} accounts outside the five groups, ${kept.length} after one per duplicate-name group`);
  check(kept.map((v) => JSON.stringify([v.id, v.name, v.city, v.country, v.currency, v.category])).join("\n") === ACCOUNTS.map(fields).join("\n"), "tools/globalcorp_base.mjs equals the accounts re-derived from Rebate Hunter's world");
} else notes.push("SKIP  no Rebate Hunter checkout next to this repository (or PARITY_REF): the base was not re-derived");

// 4. Each check fails on a world planted with its fault (so that its passing means something).
const clone = () => JSON.parse(JSON.stringify(WORLD));
const fails = (world, name) => !checkWorld(world, SCENARIOS, REFERENCE_CASES).checks.find((c) => c.name === name).ok;
{
  const w = clone();
  const s = w.suppliers.find((x) => x.country === "DE" && x.vat_id);
  for (const d of "0123456789") { const v = s.vat_id.slice(0, -1) + d; if (passesCheckDigit("DE", v)) { s.vat_id = v; break; } }
  check(fails(w, "No VAT ID passes a check digit"), "control: a VAT ID with a valid check digit is caught");
}
{
  const w = clone();
  const live = w.exception_log.find((x) => x.status === "routed" && !w.meta.planned_corrections.includes(x.id));
  Object.assign(live, { status: "closed", closed_day: -1 });
  check(fails(w, "The log agrees with the data"), "control: a closed entry whose exception is still found is caught");
}
{
  const w = clone();
  w.po_lines[0].value += 1;
  check(fails(w, "Frozen reference figures"), "control: a moved figure is caught by the frozen references");
}
{
  const w = clone();
  w.suppliers = w.suppliers.filter((s) => s.id !== "40002");
  check(fails(w, "Rebate Hunter's accounts"), "control: a missing shared account is caught");
}
{
  const w = clone();
  w.contracts.find((k) => k.supplier === "80001").material_group = "LAB-EQUIP";
  check(fails(w, "Scenario SC-PUNCHOUT"), "control: without a covering contract, scenario 1 has no case");
}
{
  const w = clone();
  for (const l of w.po_lines.filter((x) => x.created_by === "U190" && x.payment_terms_days === 14)) l.payment_terms_days = 60;
  check(fails(w, "Scenario SC-EARLY-PAY"), "control: with the agreed terms on the profile's orders, scenario 2 breaks");
}

// 5. The simulation scripts (AC-13): every script passes the live guardrails along every decision
// path, and the script checker catches each fault planted in a copy of a script.
{
  const { SIM_RUNS } = load(path.join(APP_ROOT, "data", "sim_runs.js"));
  const all = await checkScripts(WORLD, SIM_RUNS, { scenarios: SCENARIOS });
  for (const r of all.results) check(r.ok, `script ${r.id}: ${r.runs.length} decision paths pass the live guardrails${r.ok ? "" : ` (${[...r.problems, ...r.runs.filter((x) => !x.ok).map((x) => `${x.plan}: ${x.problems.join("; ")}`)].join(" | ").slice(0, 300)})`}`);
  check(Object.keys(SIM_RUNS).length === 6 && Object.values(SIM_RUNS).every((x) => x.source === "authored"), "six scripts, each marked authored");
  const copy = (id) => JSON.parse(JSON.stringify(SIM_RUNS[id]));
  const approveRecommended = (o) => [{ options_seq: o.options_seq, option_id: o.recommended, decision: "approved" }];
  const caught = async (what, script, pattern, { full = false } = {}) => {
    const r = full ? await checkScript(WORLD, script, { scenarios: SCENARIOS }) : await runOnce(WORLD, script, { decide: approveRecommended });
    const text = full ? [...r.problems, ...r.runs.flatMap((x) => x.problems)].join(" | ") : r.problems.join(" | ");
    check(!r.ok && pattern.test(text), `script control: ${what} is caught${r.ok ? " (NOT caught)" : pattern.test(text) ? "" : ` (caught differently: ${text.slice(0, 160)})`}`);
  };
  let s = copy("SC-PUNCHOUT");
  s.steps = s.steps.filter((x) => !(x.tool === "erp_get_record" && x.input.product === "po_line"));
  await caught("an alert before three of the case's records were read", s, /records read with erp_get_record/);
  s = copy("SC-PUNCHOUT");
  s.steps = s.steps.filter((x) => !(x.tool === "erp_get_record" && x.input.product === "contract"));
  await caught("a DQ-01 alert without the covering contract read", s, /covering contract/);
  s = copy("SC-ONBOARDING");
  for (const x of s.steps) if (x.input && x.input.group === "self-registration portal") x.input.group = "migrated";
  await caught("an alert on a group holding less than half of its base", s, /less than half/);
  s = copy("SC-REQUESTER");
  s.steps.find((x) => x.tool === "ui_propose_options").input.options[0].path = "A";
  await caught("an option that is not applicable", s, /Not applicable/);
  s = copy("SC-PUNCHOUT");
  s.steps.find((x) => x.tool === "ui_report_alert").input.summary = "The punch-out lines are worth €30,000 and the report cannot see them.";
  await caught("an amount no tool returned, typed into an alert", s, /Figure audit/);
  s = copy("SC-EARLY-PAY");
  s.steps.find((x) => x.tool === "ui_report_alert").input.title = "Paying early on {{grp.nowhere}}";
  await caught("a placeholder that resolves to nothing", s, /unresolved placeholder/);
  s = copy("SC-UNCLASSIFIED");
  s.steps.find((x) => x.tool === "dq_classify").input.items[0].words = ["drill press"];
  await caught("an AI suggestion resting on words not in the short text", s, /no pending AI suggestion/);
  s = copy("SC-UNCLASSIFIED");
  s.steps.find((x) => x.tool === "dq_classify").input.items[1].group_code = "MRO-BEARINGS";
  await caught("an AI suggestion with an unknown material-group code", s, /no pending AI suggestion/);
  s = copy("SC-DUPLICATE");
  s.steps.splice(s.steps.findIndex((x) => x.decide), 0, { tool: "ui_draft_action", input: { kind: "follow_up", recipient: "U123", subject: "Early draft", body: "A draft before any decision." } });
  await caught("a draft before the decision", s, /Drafts follow a decision/);
  s = copy("SC-REQUESTER");
  s.steps.splice(3, 0, { say: "There are 26 lines to look at." });
  await caught("a figure in narration", s, /narration quotes figures/, { full: true });
  s = copy("SC-ONBOARDING");
  for (const x of s.steps) if (x.kind === "revision") delete x.kind;
  await caught("a script without a visible revision", s, /no visible revision/, { full: true });
  s = copy("SC-PUNCHOUT");
  s.steps = s.steps.filter((x) => !(x.tool === "dq_scan"));
  await caught("grouping without a scan in the run", s, /Only exceptions a dq_scan of this run returned/);
}

for (const n of notes) console.log(n.startsWith("SKIP") ? n : `PASS  ${n}`);
for (const f of failures) console.log(`FAIL  ${f}`);
const share = REFERENCE_CASES.world.clean_share;
console.log(`${notes.filter((n) => !n.startsWith("SKIP")).length}/${notes.filter((n) => !n.startsWith("SKIP")).length + failures.length} world checks passed; the whole world's clean spend share is ${(share * 100).toFixed(1)} %.`);
if (failures.length) process.exit(1);
console.log("WORLD OK");
