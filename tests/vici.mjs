// Vici's own rules, checked with Vici's own functions (Build a prototype, "Check it"): the How it works
// guide and its key figures (guideProblems), the byline (bylineProblems), the Writing guideline's
// checkable patterns (writingProblems) and the AI notice of a page that can start a live run
// (aiNoticeProblems). They run on the page, on every sentence the agent's scripts put on screen for the
// six cases along three decision paths, on the presenter's own strings and on the docs. Also the page's
// frame from Vici's brief (SIMULATION or LIVE in the header, one sentence and the byline under it) and
// vici/: every file byte for byte as in ViciDesign at the commit vici/README.md and the GitHub Actions
// workflow name. Node.js only.
//
// Each imported check first fails on a planted control. Prints VICI CONTROLS OK and VICI STANDARDS OK.
// The functions come from a ViciDesign checkout (VICI_DIR, or ../ViciDesign); without one the suite says
// so and passes, unless --require-vici is given or it runs on GitHub Actions.
// Usage: node tests/vici.mjs [--require-vici]
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { APP_ROOT, REQUIRE_VICI, viciDir } from "./lib/harness.mjs";
import { expectedRun } from "./lib/expected.mjs";
import { loadData } from "./lib/turns.mjs";

const dir = viciDir();
if (!dir) {
  console.log(`${REQUIRE_VICI ? "FAIL" : "SKIP"}  no ViciDesign checkout in VICI_DIR or next to this repository (../ViciDesign)`);
  process.exit(REQUIRE_VICI ? 1 : 0);
}
const lib = async (file) => import(pathToFileURL(path.join(dir, "scripts", "lib", file)).href);
const { guideProblems } = await lib("guide.mjs");
const { bylineProblems } = await lib("byline.mjs");
const { writingProblems } = await lib("writing.mjs");
const { aiNoticeProblems, canRunLive, AI_NOTICE } = await lib("ai.mjs");
const { plainText } = await import(pathToFileURL(path.join(APP_ROOT, "js/plain.js")).href);

const read = (f) => readFileSync(path.join(APP_ROOT, f), "utf8");
const html = read("index.html");
const page = (paragraphs) => `<html lang="en-GB"><body>${paragraphs.map((t) => `<p>${String(t).replace(/</g, "&lt;")}</p>`).join("")}</body></html>`;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const controls = [];
const standards = [];
const control = (ok, what) => controls.push([!!ok, what]);
const check = (ok, what) => standards.push([!!ok, what]);

// ---- the checks can fail ----------------------------------------------------------------------------
control(guideProblems(html.replace(/<dialog\b[^>]*vc-guide[\s\S]*?<\/dialog>/, "")).length > 0, "control: guideProblems catches a page without the guide");
control(guideProblems(html.replace(/data-vc-kpi="[^"]+"/, 'data-vc-kpi="Orders checked"')).some((p) => /Orders checked/.test(p)), "control: guideProblems catches a key figure the How it works chapter never explains");
control(bylineProblems(html.replace(/href="https:\/\/victorpflueger\.github\.io\/VIP\/index\.html"/, 'href="#"')).length > 0, "control: bylineProblems catches a byline without the website link");
control(writingProblems(page(["The flag waited 62 days — far too long."])).length > 0 && writingProblems(page(["A seamless fix."])).length > 0, "control: writingProblems catches an em dash and a stock word");
control(aiNoticeProblems(html.split(AI_NOTICE.en).join("An assistant")).length > 0 && !aiNoticeProblems('<meta http-equiv="Content-Security-Policy" content="connect-src \'none\'"><p>Replay</p>').length, "control: aiNoticeProblems catches a live page that never says it is an AI, and leaves a page that cannot run live alone");

// ---- the page ---------------------------------------------------------------------------------------
const g = guideProblems(html);
check(!g.length, `the guide follows Vici's standard, a row in How it works for each key figure included${g.length ? `: ${g.join("; ")}` : ""}`);
check(/<h2 class="vc-dialog__title" id="guide-title">How the prototype works<\/h2>/.test(html), "the guide is titled How the prototype works");
check(/<dialog class="vc-dialog vc-guide" id="guide"[^>]*\bdata-vc-guide-auto\b/.test(html), "the guide opens by itself on a new tab (data-vc-guide-auto)");
const kpis = [...html.matchAll(/\bdata-vc-kpi="([^"]+)"/g)].map((m) => m[1]);
check(kpis.join("|") === "At stake a year|Records fixed|Detection → decision|Session cost", `the header marks its four key figures (${kpis.join(", ")})`);
const b = bylineProblems(html);
check(!b.length, `the byline follows Vici's standard${b.length ? `: ${b.join("; ")}` : ""}`);
const w = writingProblems(html);
check(!w.length, `index.html keeps Vici's writing rules${w.length ? `: ${w.join("; ")}` : ""}`);
const a = aiNoticeProblems(html);
check(canRunLive(html) && !a.length, `the page can start a live run and says "${AI_NOTICE.en}"${a.length ? `: ${a.join("; ")}` : ""}`);
// Beside each control that starts a live run, in a lilac tag: Run it live on the first screen (drawn by
// js/steps_view.js), and the live dialog's own start, under the notice above its key.
const view = read("js/steps_view.js");
check(new RegExp(`id: "btn-live", dataset: \\{ vcLive: "" \\}[^\\n]*"Run it live"\\),\\s*h\\("span", \\{ class: "vc-tag vc-tag--feature ai-notice" \\}, icon\\("sparkle"\\), "${esc(AI_NOTICE.en)}"\\)`).test(view), "the AI notice stands in a lilac tag right beside Run it live on the first screen");
check(/<dialog class="vc-dialog live-dialog"[\s\S]*?vc-tag--feature ai-notice-full[\s\S]*?You are interacting with an AI system[\s\S]*?id="btn-live-start" data-vc-live/.test(html), "the live dialog says it too, in a lilac tag above its key and its start button");
check(/id="live-notice"[^>]*>[\s\S]{0,120}You are interacting with an AI system/.test(html), "during a live run the step bar shows the same notice");
check(/<html lang="en-GB">/.test(html), 'the page is marked lang="en-GB"');
const header = (html.match(/<header class="app-header">[\s\S]*?<\/header>/) || [""])[0];
check(/<span class="vc-tag vc-tag--lg mode-tag"[^>]*><span id="mode-text">SIMULATION<\/span><\/span>/.test(header) && /"LIVE"/.test(read("js/app.js")), "the header says SIMULATION from the first screen, or LIVE during a live run, in capitals");
check(/class="brand"[\s\S]*?vc-cell[\s\S]*?vc-icon--check[\s\S]*?class="brand-name">Data Quality Agent</.test(header), "the header starts with the page icon and the name");
check(/id="btn-guide" data-vc-guide-open="guide"><span class="vc-icon vc-icon--info" aria-hidden="true"><\/span>How it works<\/button>/.test(header) && /data-vc-theme-toggle/.test(header), "the header offers How it works, in words, and the theme toggle");
const strip = (html.match(/<\/header>\s*<div class="intro">([\s\S]*?)<\/div>\s*<nav/) || [])[1] || "";
const sentence = (strip.match(/<p class="intro-text">([^<]*)<\/p>/) || [])[1] || "";
check(sentence.length >= 40 && sentence.length <= 180 && /fictional/.test(sentence) && (sentence.match(/[.!?](\s|$)/g) || []).length === 1 && /class="vc-byline"/.test(strip), `one sentence under the header says what the prototype does and that its data is fictional, beside the byline ("${sentence}")`);
check((html.match(/class="vc-byline"/g) || []).length === 1, "the page carries one byline");
check(!/github\.com\/VictorPflueger\/PROC-data-quality|href="https:\/\/github\.com/i.test(html), "the page links to no repository");

// ---- every sentence the agent's scripts put on screen: six cases, three decision paths -----------------
const data = await loadData();
const said = new Set();
// Fields the page never shows: ids, kinds, states, rule lists, and the alert's list of the checks it ran.
const HIDDEN = /(^|_)(id|ids|kind|seq|key|status|by|rule|rules|checked|unchecked)$/;
const collect = (v) => {
  if (typeof v === "string") { if (/[a-z]{3}/i.test(v) && / /.test(v)) said.add(plainText(data.WORLD, v)); return; }
  if (Array.isArray(v)) return v.forEach(collect);
  if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) if (!HIDDEN.test(k)) collect(x);
};
const PLANS = {
  recommended: undefined,
  "rejected, then another path": (o) => [{ options_seq: o.options_seq, option_id: o.recommended, decision: "rejected" }, { options_seq: o.options_seq, option_id: o.options.find((x) => !x.recommended)?.id, decision: "approved" }],
  "the risk accepted": (o) => [{ options_seq: o.options_seq, option_id: "nothing", decision: "approved", note: "Lower priority this quarter." }]
};
let runs = 0;
for (const sc of data.SCENARIOS) {
  collect([sc.title, sc.tip, sc.hint]);
  for (const decide of Object.values(PLANS)) {
    const r = await expectedRun(sc.id, decide ? { decide } : {});
    runs += 1;
    collect([r.alert, r.options, r.drafts, r.report]);
  }
}
const sentences = [...said];
const written = writingProblems(page(sentences));
check(sentences.length > 120 && !written.length, `the ${sentences.length} sentences the agent's scripts put on screen in ${runs} runs of the six cases keep the writing rules${written.length ? `: ${written.join("; ")}` : ""}`);
const FORBIDDEN = [[/\bDQ-\d{2}\b/, "a rule code"], [/\bU\d{3}\b/, "a user id"], [/\b(?:erp|dq|ui)_[a-z]+(?:_[a-z]+)*\b/, "a tool name"], [/\{\{|\}\}/, "an unfilled placeholder"], [/\bundefined\b|\bNaN\b|\[object Object\]/, "a broken value"]];
for (const [re, what] of FORBIDDEN) {
  const hit = sentences.find((t) => re.test(t));
  check(!hit, `no sentence on any path shows ${what}${hit ? `: "${hit.slice(0, 120)}"` : ""}`);
}
// The words the presenter's modules write themselves: every string and template in them.
const MODULES = ["js/app.js", "js/steps_view.js", "js/kpis.js", "js/plain.js", "js/main.js", "js/live_dialog.js"];
const literals = MODULES.flatMap((f) => [...read(f).replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "").matchAll(/"((?:[^"\\\n]|\\.){12,})"|`((?:[^`\\\n]|\\.){12,})`/g)]
  .map((m) => (m[1] || m[2]).replace(/\$\{[^}]*\}/g, "x").replace(/\\n/g, " ").replace(/\\(.)/g, "$1")).filter((t) => / [a-z]/.test(t) && !/^[\w.-]+$/.test(t)));
const own = writingProblems(page(literals));
check(literals.length > 40 && !own.length, `the presenter's modules keep the writing rules in their ${literals.length} strings${own.length ? `: ${own.join("; ")}` : ""}`);

// ---- the docs, as text --------------------------------------------------------------------------------
for (const doc of ["README.md", "DEMO_SCRIPT.md", "DESIGN.md", "DATA_SOURCES.md", "TECH_NOTES.md", "tests/README.md"]) {
  const there = existsSync(path.join(APP_ROOT, doc));
  const p = there ? writingProblems(page([read(doc).replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "")])) : ["missing"];
  check(!p.length, `${doc} keeps the writing rules${p.length ? `: ${p.join("; ")}` : ""}`);
}

// ---- vici/: Vici's files, unchanged, at the commit the README and the workflow name -------------------
const pin = (read("vici/README.md").match(/commit \*\*`([0-9a-f]{7,40})`\*\*/) || [])[1];
const ref = (read(".github/workflows/tests.yml").match(/repository: VictorPflueger\/ViciDesign\s+ref: ([0-9a-f]{7,40})/) || [])[1];
check(pin && ref && ref.startsWith(pin), `vici/README.md and the workflow name the same ViciDesign commit (${pin} and ${ref})`);
let head = null;
try { head = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { /* not a git checkout */ }
check(!head || !pin || head.startsWith(pin), `the ViciDesign checkout is at that commit (${head ? head.slice(0, 7) : "not a git checkout"})`);
const files = [];
const walk = (d) => { for (const f of readdirSync(path.join(APP_ROOT, d))) { const p = `${d}/${f}`; if (statSync(path.join(APP_ROOT, p)).isDirectory()) walk(p); else files.push(p); } };
walk("vici");
const ours = files.filter((f) => f !== "vici/README.md");
const differ = ours.filter((f) => { const there = path.join(dir, f.slice("vici/".length)); return !existsSync(there) || !readFileSync(there).equals(readFileSync(path.join(APP_ROOT, f))); });
check(ours.length >= 18 && !differ.length, `the ${ours.length} files in vici/ equal ViciDesign's byte for byte${differ.length ? `: ${differ.join(", ")} differ` : ""}`);

let failed = 0;
const report = (results, token) => {
  const f = results.filter(([ok]) => !ok).length;
  for (const [ok, what] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  failed += f;
  return f ? null : token;
};
const tokens = [report(controls, "VICI CONTROLS OK"), report(standards, "VICI STANDARDS OK")].filter(Boolean);
console.log(`(Vici's checks from ${dir})`);
if (failed) { console.log(`\n${failed} checks failed.`); process.exit(1); }
console.log(`\nAll ${controls.length + standards.length} checks passed.\n${tokens.join("\n")}\nVICI OK`);
