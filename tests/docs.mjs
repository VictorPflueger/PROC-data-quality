// The documentation set is complete and consistent with the code (AC-23), adapted from the Timetable
// Translator's check:
//   - README, DESIGN, DEMO_SCRIPT, DATA_SOURCES, TECH_NOTES, REVIEW and tests/README exist, are
//     substantial and carry their required sections; DEMO_SCRIPT answers the five questions that will
//     come; TECH_NOTES and DATA_SOURCES date their verified facts;
//   - every section the code cites ("TECH_NOTES §3", "DATA_SOURCES.md §4", "DESIGN.md §8") exists;
//   - every repository path a document names (in backticks or as a relative link) exists;
//   - the README links the live site; the version the README and TECH_NOTES name is the app's.
// Case "review" (AC-22): REVIEW.md Part 3 records the independent review: who reviewed and when, each
// finding with its severity and what became of it, and no high or medium finding left open.
// Usage: node tests/docs.mjs [review]   prints "DOCS OK" (or "DOCS OK: review").
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { APP_ROOT, ONLY } from "./lib/harness.mjs";

const LIVE_URL = "https://victorpflueger.github.io/PROC-data-quality/";
const VERSION = (/version: "(\d+\.\d+\.\d+)"/.exec(fs.readFileSync(path.join(APP_ROOT, "js", "config.js"), "utf8")) || [])[1];
const problems = [];
const read = (f) => (fs.existsSync(path.join(APP_ROOT, f)) ? fs.readFileSync(path.join(APP_ROOT, f), "utf8") : null);
const heads = (t) => [...t.matchAll(/^#{2,3} (.+)$/gm)].map((m) => m[1].trim());

if (ONLY.includes("review")) {
  // ---- AC-22: the independent review's bookkeeping ----------------------------------------------------
  const t = read("REVIEW.md");
  if (!t) problems.push("REVIEW.md is missing");
  else {
    const part = (/^## Part 3\.[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(t) || [])[1] || "";
    if (!part) problems.push("REVIEW.md has no Part 3");
    if (!/did not build/i.test(part)) problems.push("Part 3 does not say that the reviewer did not build the prototype");
    if (!/\b\d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December) 20\d\d\b/.test(part)) problems.push("Part 3 does not date the review");
    for (const area of ["figures", "rules", "honesty", "UI"]) if (!new RegExp(`\\b${area}\\b`, "i").test(part)) problems.push(`Part 3 does not say the review covered the ${area}`);
    // The findings table: | ID | Severity | Area | Finding | What became of it |
    const rows = [...part.matchAll(/^\|\s*(R\d+)\s*\|\s*(high|medium|low)\s*\|([^|]*)\|([^|]*)\|([^|]*)\|\s*$/gim)]
      .map((m) => ({ id: m[1], severity: m[2].toLowerCase(), area: m[3].trim(), finding: m[4].trim(), outcome: m[5].trim() }));
    if (!rows.length) problems.push("Part 3 lists no finding as a table row (| R1 | high/medium/low | area | finding | outcome |)");
    const ids = new Set();
    for (const r of rows) {
      if (ids.has(r.id)) problems.push(`finding ${r.id} is listed twice`);
      ids.add(r.id);
      if (!r.finding || !r.outcome) problems.push(`finding ${r.id} lacks its text or its outcome`);
      const fixed = /^fixed\b/i.test(r.outcome);
      const notADefect = /^not a defect\b/i.test(r.outcome) && r.outcome.length > 30;
      const later = /^(kept|deferred|open)\b/i.test(r.outcome);
      if (!fixed && !notADefect && !later) problems.push(`finding ${r.id}: the outcome must start with Fixed, Not a defect (with the reason), Kept, Deferred or Open ("${r.outcome.slice(0, 40)}")`);
      if ((r.severity === "high" || r.severity === "medium") && !fixed && !notADefect) problems.push(`finding ${r.id} (${r.severity}) is still open: ${r.outcome.slice(0, 80)}`);
    }
    const counted = /(\d+) findings?: (\d+) high, (\d+) medium, (\d+) low/i.exec(part);
    if (!counted) problems.push('Part 3 does not sum up its findings ("N findings: H high, M medium, L low")');
    else {
      const [n, hi, me, lo] = counted.slice(1).map(Number);
      const by = (s) => rows.filter((r) => r.severity === s).length;
      if (n !== rows.length || hi !== by("high") || me !== by("medium") || lo !== by("low")) problems.push(`Part 3 says ${counted[0]}, the table holds ${rows.length}: ${by("high")} high, ${by("medium")} medium, ${by("low")} low`);
    }
    console.log(`REVIEW.md Part 3: ${rows.length} findings (${["high", "medium", "low"].map((s) => `${rows.filter((r) => r.severity === s).length} ${s}`).join(", ")}).`);
  }
  for (const p of problems) console.log(`FAIL  ${p}`);
  if (!problems.length) console.log("DOCS OK: review");
  process.exit(problems.length ? 1 : 0);
}

// ---- AC-23: the documents ---------------------------------------------------------------------------
const DOCS = {
  "README.md": { words: 1800, sections: ["What it is and why it matters", "How it works", "The production path", "Deploy", "Reading the screen", "The two modes", "Your API key", "What a run costs", "The Method dialog", "Exports", "Troubleshooting", "Recording a live run for Simulation mode", "Safety and the EU AI Act", "Quality and acceptance", "Files", "Documents"] },
  "DESIGN.md": { words: 1800, numbered: 10 },
  "DEMO_SCRIPT.md": { words: 1300, sections: ["Pre-flight", "The five minutes at a glance", "Contingencies", "Questions that will come", "After the demo"] },
  "DATA_SOURCES.md": { words: 1500, numbered: 8 },
  "TECH_NOTES.md": { words: 7000, numbered: 11, sections: ["Verification log", "Acceptance checklist", "Decisions and open points", "Simulation and the recorder", "The agent in Live mode"] },
  "REVIEW.md": { words: 900, sections: ["Part 1.", "Part 2.", "Part 3.", "Part 4."] },
  "tests/README.md": { words: 1200, sections: ["What runs", "Setup for the browser suites"] }
};
// The questions the demo script answers (AC-23), each as a heading or a bold lead.
const QUESTIONS = ["Is this real data?", "What is clean spend?", "Why no accuracy?", "What does fixing a paid order save?", "What happens to the drafts?"];

const text = {};
for (const [f, rule] of Object.entries(DOCS)) {
  const t = read(f);
  if (t === null) { problems.push(`${f} is missing`); continue; }
  text[f] = t;
  const words = t.split(/\s+/).filter(Boolean).length;
  if (words < rule.words) problems.push(`${f} has ${words} words (at least ${rule.words} expected)`);
  const hs = heads(t);
  for (const s of rule.sections || []) if (!hs.some((h) => h.startsWith(s) || h.includes(s))) problems.push(`${f} lacks the section "${s}"`);
  if (rule.numbered) for (let n = 1; n <= rule.numbered; n++) if (!hs.some((h) => h.startsWith(`${n}. `))) problems.push(`${f} lacks section ${n}`);
}
if (text["DEMO_SCRIPT.md"]) {
  for (const q of QUESTIONS) if (!new RegExp(`(^#{2,4} |\\*\\*)“?"?${q.replace(/[?]/g, "\\?")}`, "mi").test(text["DEMO_SCRIPT.md"])) problems.push(`DEMO_SCRIPT.md does not answer "${q}"`);
  if (!/×1/.test(text["DEMO_SCRIPT.md"])) problems.push("DEMO_SCRIPT.md does not say the demo runs at ×1");
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
const tracked = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: APP_ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
const sources = tracked.filter((f) => /\.(m?js|css|html)$/.test(f) && !f.startsWith("vici/"));
const DOC_OF = { TECH_NOTES: "TECH_NOTES.md", DESIGN: "DESIGN.md", DATA_SOURCES: "DATA_SOURCES.md", PLAN: "PLAN.md" };
const planText = read("PLAN.md") || "";
let cited = 0;
for (const f of sources) {
  const t = fs.readFileSync(path.join(APP_ROOT, f), "utf8");
  for (const m of t.matchAll(/\b(TECH_NOTES|DESIGN|DATA_SOURCES|PLAN)(?:\.md)?,? ?§ ?(\d+)(?:\.(\d+))?(?:[–-](\d+))?/g)) {
    const doc = DOC_OF[m[1]];
    const body = doc === "PLAN.md" ? planText : text[doc];
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
// PLAN.md is the build plan: its reuse map names the sister apps' files, so its paths are not checked.
const named = { ...text };
let paths = 0;
for (const [f, t] of Object.entries(named)) {
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
    // Files the app writes for the person (exports, recordings) are named by pattern, not shipped.
    if (/^(data-quality-|sim-run-)/.test(path.basename(clean))) continue;
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
