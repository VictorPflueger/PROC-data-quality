// Acceptance tests the other suites do not cover (TECH_NOTES, acceptance checklist):
//   board    AC-14: after a live sweep (the scripted stand-in scans every rule over all the data),
//            each of the fifteen cells shows the engine's open exceptions in its state, every cell
//            opens its exceptions and the table holds the same rows and figures as the engine, the
//            people rows hold the engine's routing, the weekly cohorts' chart and table hold the
//            engine's cohorts, and no tile sums spend across exceptions (each order line counts once)
//   honesty  AC-15 and the honesty rules of the brief: in a Simulation of scenario 1 with an approved
//            fix, nothing reads "closed" for an exception a re-scan still finds: the approved card
//            reads "Approved, re-scan pending", the tile keeps the measured rate and adds the
//            projection, the case's rows read "approved, re-scan pending" and stay open; the AI
//            disclosure, the fiction note and the SIMULATION tape stay visible, and every text the AI
//            wrote carries the AI label
// Usage: node tests/accept.mjs [case…]   prints "ACCEPT OK: <cases>" when every case passes.
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { createFakeClaude } from "./lib/fake-claude.mjs";
import { loadData, TURN_USAGE } from "./lib/turns.mjs";
import { APP_ROOT, outDir, ONLY, launchBrowser, serveStatic, CORS, MOCK_KEY, NETWORK_NOISE, SKIP_INTRO } from "./lib/harness.mjs";

const CASES = ["board", "honesty"];
const chosen = ONLY.length ? ONLY : CASES;
const OUT = await outDir("accept");
const PORT = 8790 + Math.floor(Math.random() * 400);
const { base: BASE, close } = await serveStatic(APP_ROOT, PORT);
const browser = await launchBrowser();
const DATA = await loadData();
const { createToolbox } = await import(path.join(APP_ROOT, "js/tools.js"));
const { euro, pct1, int } = await import(path.join(APP_ROOT, "js/format.js"));
const { RULES, ruleById } = await import(path.join(APP_ROOT, "js/rules.js"));
const results = [];

async function newPage(fake) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await context.addInitScript(SKIP_INTRO);
  const log = { errors: [], outside: [] };
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.host === "api.anthropic.com" && fake) {
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { ...CORS, "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST" } });
      if (u.pathname === "/v1/models") return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify({ data: [{ id: "claude-sonnet-5-5" }, { id: "claude-haiku-5-5" }, { id: "claude-opus-5-5" }] }) });
      if (u.pathname === "/v1/messages") {
        const out = fake.handle(req.postData() || "{}", req.headers());
        return route.fulfill({ status: out.status, headers: { ...CORS, ...out.headers }, body: out.body }).catch(() => {});
      }
    }
    log.outside.push(req.url());
    return route.abort("blockedbyclient");
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => log.errors.push(`page error: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !NETWORK_NOISE.test(m.text())) log.errors.push(`console error: ${m.text()}`); });
  await page.goto(BASE);
  await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
  return { context, page, log };
}

function record(name, checks, t, fake = null) {
  results.push({ name, checks, problems: [...(t?.log.errors || []), ...(fake?.violations || []).map((v) => `protocol: ${v}`), ...(fake && fake.remaining() ? [`${fake.remaining()} scripted responses were never requested`] : [])] });
}

// ---- board -------------------------------------------------------------------------------------------
if (chosen.includes("board")) {
  // The engine's view of the same sweep, in Node: the scan's exceptions and the header's figures.
  const seen = {};
  const tb = createToolbox({ world: DATA.WORLD, mode: "live", today: new Date(), onPhase: () => {}, waitFor: () => new Promise(() => {}), emit: (type, p) => { if (type === "board_update" && p.scan) seen.scan = p.scan; if (type === "kpi_update") seen.kpi = p; } });
  const scan = (await tb.execute("dq_scan", {})).result;
  const exByRule = new Map(RULES.map((r) => [r.id, seen.scan.exceptions.filter((e) => e.rule === r.id)]));
  const fake = createFakeClaude([
    { stop: "tool_use", usage: { ...TURN_USAGE }, blocks: [{ type: "text", text: "I scan every rule over all the data." }, { type: "tool_use", id: "toolu_b1", name: "dq_scan", input: {} }] },
    { stop: "tool_use", usage: { ...TURN_USAGE }, blocks: [{ type: "tool_use", id: "toolu_b2", name: "ui_final_report", input: { outcome: "nothing_found", markdown: "## Sweep\n\nThe board shows what the scan found." } }] },
    { stop: "end_turn", usage: { ...TURN_USAGE }, blocks: [{ type: "text", text: "Done." }] }
  ]);
  const t = await newPage(fake);
  const c = { problems: [] };
  const problem = (ok, msg) => { if (!ok) c.problems.push(msg); };
  try {
    const { page } = t;
    await page.click("#btn-scan");
    await page.fill("#api-key-input", MOCK_KEY);
    await page.click("#btn-key-save");
    await page.waitForSelector(".entry[data-end]", { timeout: 60000 });
    // The cells: open exceptions and state, as the engine's scan has them, and the reference figures.
    const cells = await page.$$eval(".hex-cell", (els) => els.map((e) => ({ rule: e.dataset.rule, state: e.dataset.state, count: e.querySelector(".hex-count").textContent, label: e.getAttribute("aria-label") })));
    problem(cells.length === 15, `fifteen cells (got ${cells.length})`);
    for (const cell of cells) {
      const n = exByRule.get(cell.rule).length;
      const want = n === 0 ? "success" : ruleById(cell.rule).severity === "high" ? "danger" : "warning";
      problem(cell.count === int(n) && cell.state === want, `${cell.rule}: shows ${cell.count} (${cell.state}), the engine found ${n} (${want})`);
      problem(n === (DATA.REFERENCE_CASES.world.by_rule[cell.rule] || 0), `${cell.rule}: the engine's ${n} differs from the frozen reference`);
      problem(new RegExp(`^${cell.rule} `).test(cell.label || ""), `${cell.rule} has an accessible name (${cell.label})`);
    }
    // Every cell opens its exceptions, with the engine's rows and figures.
    let opened = 0;
    for (const r of RULES) {
      await page.click(`#cell-${r.id}`);
      await page.waitForSelector("#ex-card:not([hidden])");
      const rows = await page.$$eval("#ex-table tbody tr[data-exception]", (els) => els.map((e) => ({ id: e.dataset.exception, cells: [...e.children].map((x) => x.textContent) })));
      const want = exByRule.get(r.id);
      problem(rows.length === want.length, `${r.id}: the table lists ${rows.length} rows, the engine ${want.length}`);
      for (const [k, e] of want.entries()) {
        const row = rows[k];
        if (!row) break;
        const fin = ruleById(e.rule).financing ? euro(e.financing_cost_eur) : "—";
        const unpaid = e.unpaid === true ? "yes" : e.unpaid === false ? "no" : "—";
        const ok = row.id === e.id && row.cells[0] === e.record && row.cells[3] === euro(e.spend_eur) && row.cells[4] === fin && row.cells[5] === unpaid && !/closed/.test(row.cells[7]);
        problem(ok, `${r.id} row ${k + 1}: ${JSON.stringify(row.cells)} differs from the engine's ${e.id} ${euro(e.spend_eur)} ${fin} ${unpaid}`);
      }
      if (!want.length) problem(await page.locator("#ex-table .ex-empty").count() === 1, `${r.id}: an empty table says so`);
      opened += 1;
    }
    c.opened = opened;
    await page.click("#btn-ex-close");
    // People: one row per routed-to person, with the engine's counts.
    await page.click("#view-people");
    const people = await page.$$eval("#people-table tbody tr[data-person]", (els) => els.map((e) => ({ person: e.dataset.person, count: e.children[1].textContent, pips: e.querySelectorAll(".pip-group").length })));
    problem(people.length === scan.routed_to.length, `people rows: ${people.length}, the engine routes to ${scan.routed_to.length}`);
    for (const p of scan.routed_to) {
      const row = people.find((x) => x.person === p.person);
      problem(row && row.count === int(p.count), `${p.person}: shows ${row?.count}, the engine routes ${p.count}`);
      const rules = new Set(seen.scan.exceptions.filter((e) => e.routed_to === p.person).map((e) => e.rule));
      problem(row && row.pips === rules.size, `${p.person}: ${row?.pips} pip groups for ${rules.size} rules`);
    }
    await page.screenshot({ path: path.join(OUT, "board-people.png") });
    await page.click("#view-rules");
    // The weekly cohorts: the table one click away and the chart hold the engine's numbers.
    await page.click("#cohort-details > summary");
    const table = await page.$$eval("#cohort-table tbody tr", (els) => els.map((e) => [...e.children].map((x) => x.textContent)));
    for (const w of seen.kpi.cohorts) {
      const row = table.find((r) => r[0] === `Week ${w.week}`);
      problem(row && row[2] === int(w.detected) && row[3] === int(w.closed) && row[4] === int(w.open) && row[5] === int(w.dismissed) && row[6] === (w.share === null ? "—" : pct1(w.share)), `week ${w.week}: ${JSON.stringify(row)} differs from the engine's ${JSON.stringify(w)}`);
    }
    const chartTitle = await page.locator("#cohort-svg-title").textContent();
    for (const w of seen.kpi.cohorts) problem(chartTitle.includes(`week ${w.week} detected ${w.detected}, closed ${w.closed}, still open ${w.open}`), `the chart's week ${w.week} differs from the table`);
    problem((await page.locator("#cohort-rate").textContent()) === pct1(seen.kpi.closure_rate), "the cohort table's rate is the engine's closure rate");
    problem((await page.locator("#kpi-closure-value").textContent()) === pct1(seen.kpi.closure_rate), "the closure-rate tile is the engine's");
    // No tile sums spend across exceptions: the second lines count each order line once.
    const summed = seen.scan.exceptions.reduce((s, e) => s + e.spend_eur, 0);
    const openSub = await page.locator("#kpi-open-sub").textContent();
    problem(openSub === `${euro(seen.kpi.open_spend_eur)} affected` && Math.abs(summed - seen.kpi.open_spend_eur) > 1, `the open-exceptions tile counts each line once (${openSub}; summed over exceptions it would be ${euro(summed)})`);
    problem((await page.locator("#kpi-open-value").textContent()) === int(seen.kpi.open_exceptions), "the open-exceptions tile is the engine's count");
    problem((await page.locator("#kpi-clean-sub").textContent()) === `${euro(seen.kpi.clean_spend_eur)} of ${euro(seen.kpi.spend_window_eur)}`, "the clean-spend tile is the engine's");
    await page.screenshot({ path: path.join(OUT, "board-rules.png") });
  } catch (e) { c.problems.push(`exception: ${e.message}`); }
  record("board", c, t, fake);
  await t.context.close();
}

// ---- honesty -----------------------------------------------------------------------------------------
if (chosen.includes("honesty")) {
  const t = await newPage(null);
  const c = { problems: [] };
  const problem = (ok, msg) => { if (!ok) c.problems.push(msg); };
  try {
    const { page } = t;
    const visible = async () => ({
      ai: await page.locator(".ai-disclosure").isVisible(),
      fiction: await page.locator(".fiction-note").isVisible(),
      tape: await page.locator(".sim-watermark").isVisible()
    });
    await page.click("#btn-start");
    await page.click("#btn-mode-simulation");
    await page.click(".segmented button[aria-label='Replay speed ×4']");
    const measured = [];
    let approvedAt = null;
    const t0 = Date.now();
    for (;;) {
      if (await page.locator(".entry[data-end]").count()) break;
      if (Date.now() - t0 > 120000) throw new Error("the replay did not end in time");
      const v = await visible();
      problem(v.ai && v.fiction && v.tape, `the AI disclosure, the fiction note and the tape stay visible (${JSON.stringify(v)})`);
      const open = page.locator('.option-card[data-path="C"][data-status=""] [data-action="approve"]');
      if (!approvedAt && await open.count()) {
        measured.push(await page.locator("#kpi-closure-value").textContent());
        measured.push(await page.locator("#kpi-open-value").textContent());
        await open.click();
        approvedAt = Date.now();
      }
      const pending = page.locator('.action-card[data-status="pending"] [data-action="approve"]');
      if (await pending.count()) await pending.first().click();
      await page.waitForTimeout(150);
    }
    c.end = await page.locator(".entry[data-end]").last().getAttribute("data-end");
    problem(c.end === "done", `the replay ended ${c.end}`);
    // The tiles: the measured rate stays, the projection is labelled, the case stays open.
    problem((await page.locator("#kpi-closure-value").textContent()) === measured[0], "the closure-rate tile keeps the measured rate");
    const sub = await page.locator("#kpi-closure-sub").textContent();
    problem(/^\d+\.\d% projected after re-scan$/.test(sub), `the projection is labelled as one ("${sub}")`);
    problem(/approved, re-scan pending/.test(await page.locator("#kpi-closure-sub").getAttribute("title")), "the tile explains approved, re-scan pending");
    problem((await page.locator("#kpi-open-value").textContent()) === measured[1], "the approved case's exceptions still count as open");
    problem(/Approved, re-scan pending/.test(await page.locator('.option-card[data-path="C"] .option-status').textContent()), "the approved card reads Approved, re-scan pending");
    // The case's rows: approved, re-scan pending; nothing reads closed.
    await page.click("#cell-DQ-01");
    const statuses = await page.$$eval("#ex-table tbody tr[data-exception] .ex-status", (els) => els.map((e) => e.textContent));
    problem(statuses.length === 30 && statuses.every((s) => /^approved, re-scan pending/.test(s)), `the case's rows read approved, re-scan pending (${[...new Set(statuses)].join(" / ")})`);
    await page.click("#view-people");
    const path_ = await page.locator('#people-table tr[data-person="U126"] .people-path').textContent();
    problem(/Path C: approved, re-scan pending \(30\)/.test(path_), `the people row names the covering path (${path_})`);
    const labels = await page.$$eval(".ex-status, .option-status, .people-path, .kpi-sub, .hex-cell, .action-status", (els) => els.map((e) => e.textContent));
    problem(!labels.some((s) => /\bclosed\b/i.test(s) && !/of \d+ closed$/.test(s)), `no label reads closed (${labels.filter((s) => /\bclosed\b/i.test(s)).join(" / ")})`);
    // Everything the AI wrote carries the AI label.
    const drafts = await page.locator(".action-card").count();
    c.labels = {
      case: await page.locator("#console .case-card .ai-label").count(),
      options: await page.locator(".options-summary .ai-label").count(),
      drafts: await page.locator(".action-card .ai-label").count(),
      report: await page.locator("#console .report-card .ai-label").count()
    };
    problem(c.labels.case === 1 && c.labels.options === 1 && c.labels.drafts === drafts && drafts === 2 && c.labels.report === 1, `AI labels on the case, the options, each draft and the report (${JSON.stringify(c.labels)})`);
    problem((await page.locator("#mode-badge").textContent()) === "SIMULATION", "the mode badge says SIMULATION");
    await page.screenshot({ path: path.join(OUT, "honesty.png") });
  } catch (e) { c.problems.push(`exception: ${e.message}`); }
  problem(t.log.outside.length === 0, `requests to outside hosts: ${t.log.outside.slice(0, 3).join(", ")}`);
  record("honesty", c, t);
  await t.context.close();
}

await browser.close();
await close();
await writeFile(path.join(OUT, "accept-results.json"), JSON.stringify(results, null, 2));
let passed = 0;
for (const r of results) {
  const problems = [...r.checks.problems, ...r.problems];
  if (!problems.length) passed += 1;
  console.log(`${problems.length ? "FAIL" : "PASS"}  ${r.name}`);
  for (const p of problems.slice(0, 25)) console.log(`      - ${String(p).slice(0, 300)}`);
}
console.log(`\n${passed}/${results.length} acceptance cases passed. Screenshots: ${OUT}`);
if (passed === results.length && results.length) console.log(`ACCEPT OK: ${chosen.join(" ")}`);
process.exit(passed === results.length && results.length ? 0 : 1);
