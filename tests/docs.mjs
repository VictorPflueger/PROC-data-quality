// The documents are complete, lean and consistent with the code (AC-23):
//   - README, DESIGN, DEMO_SCRIPT, DATA_SOURCES, TECH_NOTES and tests/README exist and carry their
//     sections; README, DEMO_SCRIPT and DESIGN stay short (900, 700 and 700 words of prose) and use no
//     em dash; DEMO_SCRIPT answers the five questions that will come, and every whole-euro amount in it
//     is one of the engine's figures for the default case (data/reference_cases.js) or the €3 cap;
//     TECH_NOTES and DATA_SOURCES date their verified facts;
//   - every section the code cites ("TECH_NOTES §3", "DATA_SOURCES.md §4", "DESIGN.md §3") exists;
//   - every repository path a document names (in backticks or as a relative link) exists;
//   - the README links the live site; the version the README and TECH_NOTES name is the app's.
// Usage: node tests/docs.mjs   prints "DOCS OK".
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { APP_ROOT } from "./lib/harness.mjs";

const LIVE_URL = "https://victorpflueger.github.io/PROC-data-quality/";
const CONFIG = fs.readFileSync(path.join(APP_ROOT, "js", "config.js"), "utf8");
const VERSION = (/version: "(\d+\.\d+\.\d+)"/.exec(CONFIG) || [])[1];
const LEAD = (/defaultScenario:\s*"([^"]+)"/.exec(CONFIG) || [])[1];
const problems = [];
const read = (f) => (fs.existsSync(path.join(APP_ROOT, f)) ? fs.readFileSync(path.join(APP_ROOT, f), "utf8") : null);
const heads = (t) => [...t.matchAll(/^#{2,3} (.+)$/gm)].map((m) => m[1].trim());
// Prose: the text without code, inline code, tags and link targets.
const prose = (md) => md.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ").replace(/<[^>]+>/g, " ").replace(/\]\([^)]*\)/g, "]");
const words = (md) => prose(md).split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

const DOCS = {
  "README.md": { max: 900, sections: ["What it shows", "The five steps", "The four key figures", "Presenting it", "Simulation and Live", "Safety", "Run it yourself", "Tests", "Files", "Documents"] },
  "DEMO_SCRIPT.md": { max: 700, sections: ["Before you start", "The five minutes", "If something goes wrong", "Questions that will come", "After the demo"] },
  "DESIGN.md": { max: 700, numbered: 7 },
  "DATA_SOURCES.md": { numbered: 8 },
  "TECH_NOTES.md": { numbered: 11, sections: ["Simulation", "The agent in Live mode", "Decisions and open points", "Verification log", "Acceptance checklist"] },
  "tests/README.md": { sections: ["What runs", "Setup for the browser suites"] }
};
// The questions the demo script answers, each as a bold lead.
const QUESTIONS = ["Is this real data?", "Where do the figures come from?", "What does fixing a paid order save?", "What happens to the drafts?", "What does a run cost?"];

const text = {};
for (const [f, rule] of Object.entries(DOCS)) {
  const t = read(f);
  if (t === null) { problems.push(`${f} is missing`); continue; }
  text[f] = t;
  const n = words(t);
  if (n < 200) problems.push(`${f} has ${n} words: too thin to explain anything`);
  if (rule.max && n > rule.max) problems.push(`${f} has ${n} words of prose, at most ${rule.max}`);
  if (rule.max && prose(t).includes("—")) problems.push(`${f} uses an em dash`);
  const hs = heads(t);
  for (const s of rule.sections || []) if (!hs.some((h) => h.startsWith(s) || h.includes(s))) problems.push(`${f} lacks the section "${s}"`);
  if (rule.numbered) for (let k = 1; k <= rule.numbered; k++) if (!hs.some((h) => h.startsWith(`${k}. `))) problems.push(`${f} lacks section ${k}`);
}

// The demo script: the questions, and the engine's figures for the default case.
if (text["DEMO_SCRIPT.md"]) {
  const t = text["DEMO_SCRIPT.md"];
  for (const q of QUESTIONS) if (!new RegExp(`\\*\\*${q.replace(/[?]/g, "\\?")}\\*\\*`).test(t)) problems.push(`DEMO_SCRIPT.md does not answer "${q}"`);
  const ctx = { window: {} };
  vm.runInNewContext(read("data/reference_cases.js"), ctx);
  const c = ctx.window.REFERENCE_CASES?.cases?.[LEAD];
  if (!c) problems.push(`no reference figures for the default case ${LEAD}`);
  else {
    const euros = new Set([3]); // the €3 cap of a live run
    const add = (x) => { if (typeof x === "number" && Number.isFinite(x)) euros.add(Math.round(x)); };
    add(c.spend_eur); add(c.financing_cost_eur); add(c.unpaid_cost_eur);
    for (const p of Object.values(c.paths || {})) for (const [k, v] of Object.entries(p)) if (/eur/.test(k)) add(v);
    // Amounts with cents are the session cost, which tests/presenter.mjs holds to the estimate.
    const whole = [...prose(t).matchAll(/€\s?([\d,]+(?:\.\d+)?)/g)].map((m) => Number(m[1].replace(/,/g, ""))).filter(Number.isInteger);
    if (!whole.length) problems.push("DEMO_SCRIPT.md quotes no euro figure of the default case");
    const unknown = whole.filter((x) => !euros.has(x));
    if (unknown.length) problems.push(`DEMO_SCRIPT.md quotes euro amounts the engine does not give for ${LEAD}: ${unknown.join(", ")}`);
  }
}
// Verified facts carry their dates.
for (const f of ["TECH_NOTES.md", "DATA_SOURCES.md"]) {
  const dated = (text[f] || "").match(/\b\d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December) 20\d\d\b/g) || [];
  if (dated.length < 5) problems.push(`${f} dates ${dated.length} facts (at least 5 expected)`);
}
// The version the documents name is the app's.
if (VERSION) {
  if (text["README.md"] && !text["README.md"].includes(`version ${VERSION}`)) problems.push(`README.md does not name version ${VERSION}`);
  if (text["TECH_NOTES.md"] && !text["TECH_NOTES.md"].includes(`**${VERSION}**`)) problems.push(`TECH_NOTES.md's basis is not version ${VERSION}`);
  if (text["TECH_NOTES.md"] && !new RegExp(`## 11\\. Acceptance checklist \\(version ${VERSION.replace(/\./g, "\\.")}\\)`).test(text["TECH_NOTES.md"])) problems.push(`TECH_NOTES.md's acceptance checklist is not for version ${VERSION}`);
}

// Sections the code cites.
const tracked = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: APP_ROOT, encoding: "utf8" }).split("\n").filter(Boolean).filter((f) => fs.existsSync(path.join(APP_ROOT, f)));
const sources = tracked.filter((f) => /\.(m?js|css|html)$/.test(f) && !f.startsWith("vici/"));
const DOC_OF = { TECH_NOTES: "TECH_NOTES.md", DESIGN: "DESIGN.md", DATA_SOURCES: "DATA_SOURCES.md" };
let cited = 0;
for (const f of sources) {
  const t = fs.readFileSync(path.join(APP_ROOT, f), "utf8");
  for (const m of t.matchAll(/\b(TECH_NOTES|DESIGN|DATA_SOURCES)(?:\.md)?,? ?§ ?(\d+)(?:\.(\d+))?(?:[–-](\d+))?/g)) {
    const doc = DOC_OF[m[1]];
    const body = text[doc];
    if (!body) continue;
    const from = Number(m[2]);
    const to = m[4] ? Number(m[4]) : from;
    for (let n = from; n <= to; n++) {
      cited += 1;
      const want = m[3] && n === from ? `${n}\\.${m[3]}` : `${n}\\.`;
      if (!new RegExp(`^#{2,3} ${want} `, "m").test(body)) problems.push(`${f} cites ${doc} §${n}${m[3] && n === from ? `.${m[3]}` : ""}, which does not exist`);
    }
  }
}

// Paths the documents name.
const EXT = /\.(m?js|css|html|md|json|svg|yml|txt|jpg|png|woff2)$/;
const FOLDERS = ["", "js", "css", "data", "tests", "tests/lib", "tests/fixtures", "tools", "vici", "vici/dist", ".github/workflows"];
let paths = 0;
for (const [f, t] of Object.entries(text)) {
  const base = path.dirname(path.join(APP_ROOT, f));
  const names = new Set();
  for (const m of t.matchAll(/`([^`\s]+)`/g)) names.add(m[1]);
  for (const m of t.matchAll(/\]\(([^)\s#]+)(?:#[^)]*)?\)/g)) if (!/^[a-z]+:/i.test(m[1])) names.add(m[1]);
  for (const n of names) {
    const clean = n.replace(/[.,;:]$/, "");
    if (/[<>*{}$]|^~|^\/|^https?:|^-/.test(clean)) continue;
    if (/^[\w-]+(\.[\w-]+)*\.(io|com|org|net|de|dev|ai)(\/|$)/i.test(clean)) continue; // a web address, not a path
    if (!clean.includes("/") && !EXT.test(clean)) continue;
    if (!/^[\w./ -]+$/.test(clean) || !(EXT.test(clean) || clean.endsWith("/") || /^(js|css|data|tests|tools|vici)(\/|$)/.test(clean))) continue;
    // Files the app writes for the person (the audit log) are named by pattern, not shipped.
    if (/^data-quality-/.test(path.basename(clean))) continue;
    paths += 1;
    // A bare file name ("engine.js") may live in any of the app's folders.
    const candidates = clean.includes("/") ? [path.join(APP_ROOT, clean), path.join(base, clean)] : FOLDERS.map((d) => path.join(APP_ROOT, d, clean));
    if (!candidates.some((c) => fs.existsSync(c))) problems.push(`${f} names ${clean}, which does not exist`);
  }
}

if (text["README.md"] && !text["README.md"].includes(LIVE_URL)) problems.push(`README.md does not link the live site (${LIVE_URL})`);

for (const p of problems) console.log(`FAIL  ${p}`);
console.log(`${Object.keys(DOCS).length} documents checked (${cited} section citations, ${paths} named paths), ${problems.length} problem${problems.length === 1 ? "" : "s"}.`);
if (!problems.length) console.log("DOCS OK");
process.exit(problems.length ? 1 : 0);
