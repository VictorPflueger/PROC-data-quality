// The published site: GitHub Pages serves exactly the files of this checkout, and a Simulation run
// completes there with no error and no request to any other host. The "live site" workflow runs it
// after every Pages build; it can also be run by hand.
//   files   index.html, the config, the engine, the tools, the world and the scripts as served equal
//           this checkout (Pages caches for up to ten minutes, so it retries for up to twelve)
//   run     scenario 1 in Simulation mode to the end: the case cell DQ-01 in danger with its thirty
//           exceptions, the recommended fix path approved and its projection labelled as one, the
//           drafts approved, Done; no page error, nothing loaded from another host (up to three
//           runs a minute apart, for a deployment the CDN is still taking up)
// With --serve the same checks run against this checkout served locally (the files then match by
// construction): the way to test the check itself where github.io cannot be reached.
// In GitHub Actions every problem is also printed as an annotation (::error / ::warning).
// Usage: node tests/live_site.mjs [url | --serve]   (default: the repository's Pages address; LIVE_URL)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { APP_ROOT, launchBrowser, serveStatic, SKIP_INTRO } from "./lib/harness.mjs";

const SERVE = process.argv.includes("--serve");
const local = SERVE ? await serveStatic(APP_ROOT, 9600 + Math.floor(Math.random() * 300)) : null;
const URL_BASE = (local ? local.base : (process.argv.slice(2).find((a) => !a.startsWith("--")) || process.env.LIVE_URL || "https://victorpflueger.github.io/PROC-data-quality/")).replace(/\/?$/, "/");
const FILES = ["index.html", "js/config.js", "js/engine.js", "js/tools.js", "data/world.js", "data/sim_runs.js", "css/style.css"];
const WAIT_MS = SERVE ? 0 : Number(process.env.LIVE_WAIT_MS || 12 * 60 * 1000);
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const problems = [];

// 1. The files as served equal this checkout.
const deadline = Date.now() + WAIT_MS;
let stale = FILES;
for (;;) {
  stale = [];
  for (const f of FILES) {
    try {
      const r = await fetch(`${URL_BASE}${f}?t=${Date.now()}`, { cache: "no-store" });
      const body = Buffer.from(await r.arrayBuffer());
      if (!r.ok || sha(body) !== sha(fs.readFileSync(path.join(APP_ROOT, f)))) stale.push(`${f} (${r.status})`);
    } catch (e) {
      stale.push(`${f} (${String(e.message || e).slice(0, 60)})`);
    }
  }
  if (!stale.length || Date.now() > deadline) break;
  console.log(`waiting for the site to serve this checkout: ${stale.join(", ")}`);
  await new Promise((r) => setTimeout(r, 30000));
}
if (stale.length) problems.push(`the site does not serve this checkout: ${stale.join(", ")}`);
else console.log(`PASS  files: ${FILES.length} files as served equal this checkout`);

// 2. A Simulation run completes there.
async function simulationRun() {
  const found = [];
  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  await context.addInitScript(SKIP_INTRO);
  const page = await context.newPage();
  const errors = [];
  const hosts = new Set();
  page.on("pageerror", (e) => errors.push(String(e.message || e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("request", (r) => { try { const u = new URL(r.url()); if (/^https?:$/.test(u.protocol)) hosts.add(u.host); } catch { /* data: URLs */ } });
  try {
    await page.goto(URL_BASE, { waitUntil: "load" });
    await page.waitForSelector('html[data-boot="ready"]', { timeout: 30000 });
    await page.click("#btn-start");
    await page.click("#btn-mode-simulation");
    await page.click(".segmented button[aria-label='Replay speed ×4']");
    await page.waitForSelector('.option-card[data-recommended="true"] [data-action="approve"]', { state: "visible", timeout: 120000 });
    const cell = await page.$eval("#cell-DQ-01", (e) => `${e.dataset.state} ${e.querySelector(".hex-count").textContent}`);
    if (cell !== "danger 30") found.push(`the case's cell DQ-01 reads "${cell}"`);
    await page.click('.option-card[data-recommended="true"] [data-action="approve"]');
    const t0 = Date.now();
    while (!(await page.locator(".entry[data-end]").count())) {
      if (Date.now() - t0 > 120000) throw new Error("the replay did not end in time");
      const pending = page.locator('.action-card[data-status="pending"] [data-action="approve"]');
      if (await pending.count()) await pending.first().click();
      await page.waitForTimeout(200);
    }
    const sub = (await page.locator("#kpi-closure-sub").textContent()).trim();
    if (!/projected after re-scan$/.test(sub)) found.push(`the closure tile's second line reads "${sub}"`);
    await page.waitForFunction(() => /Done/.test(document.querySelector(".status-pill")?.innerText || ""), null, { timeout: 15000 }).catch(() => {});
    const status = (await page.locator(".status-pill").innerText()).trim();
    if (!/Done/.test(status)) found.push(`the run ends as "${status}"`);
  } catch (e) {
    found.push(`the run did not complete: ${String(e.message || e).split("\n")[0]}`);
  }
  const own = new URL(URL_BASE).host;
  const other = [...hosts].filter((h) => h !== own);
  if (other.length) found.push(`requests to other hosts: ${other.join(", ")}`);
  if (errors.length) found.push(`page errors: ${errors.slice(0, 3).join(" | ")}`);
  await browser.close();
  return found;
}

// In GitHub Actions each problem also becomes an annotation, readable without the job log.
const annotate = (level, text) => { if (process.env.GITHUB_ACTIONS === "true") console.log(`::${level} title=live site::${text.replace(/\r?\n/g, " ")}`); };

if (!stale.length) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const found = await simulationRun();
    if (!found.length) { console.log(`PASS  run: scenario 1 in Simulation mode completes on the ${SERVE ? "locally served checkout" : "published site"}${attempt > 1 ? ` (run ${attempt})` : ""}`); break; }
    if (attempt === 3 || SERVE) { problems.push(...found); break; }
    for (const f of found) { console.log(`WARN  run ${attempt}: ${f}`); annotate("warning", `run ${attempt}: ${f}`); }
    await new Promise((r) => setTimeout(r, 60000));
  }
}

await local?.close();
for (const p of problems) annotate("error", p);
for (const p of problems) console.log(`FAIL  ${p}`);
console.log(`${URL_BASE}: ${problems.length} problem${problems.length === 1 ? "" : "s"}.`);
if (!problems.length) console.log("LIVE SITE OK");
process.exit(problems.length ? 1 : 0);
