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
//   exports  AC-16: after a Simulation of scenario 1, the report (Markdown), the exceptions (CSV) and
//            the audit log (JSON) download with names that start with data-quality-, the run id and
//            SIMULATION; each says SIMULATION in its content; the CSV holds the board's rule tables
//            row for row; the JSON validates against its schema (events as RunEvent, the audit log
//            as AuditEvent) with the app's own validator, and its parameters are the defaults
//   method   the Method dialog: the fifteen rules with dimension, severity, responsible person and
//            suggestion, why accuracy is left out, the definitions, the parameters and the production
//            path; a change is checked, applied to Live runs only and logged; locked during a run;
//            a Live sweep then computes with it (the board's financing costs at the changed cost of
//            capital), Diagnostics shows it read-only and the audit export records it
//   keyboard AC-19: a Simulation of scenario 1 completed by keyboard alone (Tab, Enter), with a visible
//            focus indicator on everything the keyboard reaches; the decision and the first draft are
//            two Tabs from the top of the page, through the skip link "Skip to your decision"
//   motion   AC-19: with reduced motion the pulses stop (no animation keeps running while the agent
//            reads); without it they run (the control)
//   names    AC-19: every cell, row and control has an accessible name (Chrome's accessibility tree),
//            idle, during the decision and after the run, and in the Method dialog
// Usage: node tests/accept.mjs [case…]   prints "ACCEPT OK: <cases>" when every case passes.
import path from "node:path";
import { writeFile, readFile } from "node:fs/promises";
import { createFakeClaude } from "./lib/fake-claude.mjs";
import { loadData, TURN_USAGE } from "./lib/turns.mjs";
import { APP_ROOT, outDir, ONLY, launchBrowser, serveStatic, CORS, MOCK_KEY, NETWORK_NOISE, SKIP_INTRO } from "./lib/harness.mjs";

const CASES = ["board", "honesty", "exports", "method", "keyboard", "motion", "names"];
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

async function newPage(fake, { reducedMotion = "no-preference", viewport = { width: 1920, height: 1080 } } = {}) {
  const context = await browser.newContext({ viewport, reducedMotion, acceptDownloads: true });
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

// ---- shared steps of the cases below ---------------------------------------------------------------
const { validate, describeErrors } = await import(path.join(APP_ROOT, "js/validate.js"));
const { EXPORT_SCHEMAS, ALL_DEFS } = await import(path.join(APP_ROOT, "js/schemas.js"));
const { PARAMS } = await import(path.join(APP_ROOT, "js/params.js"));
const { EXCEPTION_COLUMNS } = await import(path.join(APP_ROOT, "js/exports.js"));

async function download(page, click) {
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), click()]);
  const file = path.join(OUT, dl.suggestedFilename());
  await dl.saveAs(file);
  return { name: dl.suggestedFilename(), text: await readFile(file, "utf8") };
}

/** A Simulation of the chosen scenario at ×4: the recommended path approved, every draft approved. */
async function simulate(page) {
  await page.click("#btn-start");
  await page.click("#btn-mode-simulation");
  await page.click(".segmented button[aria-label='Replay speed ×4']");
  const t0 = Date.now();
  for (;;) {
    if (await page.locator(".entry[data-end]").count()) break;
    if (Date.now() - t0 > 120000) throw new Error("the replay did not end in time");
    const rec = page.locator('.option-card[data-recommended="true"][data-status=""] [data-action="approve"]');
    if (await rec.count()) await rec.click();
    const pending = page.locator('.action-card[data-status="pending"] [data-action="approve"]');
    if (await pending.count()) await pending.first().click();
    await page.waitForTimeout(150);
  }
  return page.locator(".entry[data-end]").last().getAttribute("data-end");
}

/** A minimal CSV reader for the export: quoted cells, doubled quotes, CRLF rows. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; } else if (ch === "\r" && text[i + 1] === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i++; } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// ---- exports -------------------------------------------------------------------------------------
if (chosen.includes("exports")) {
  const t = await newPage(null);
  const c = { problems: [] };
  const problem = (ok, msg) => { if (!ok) c.problems.push(msg); };
  try {
    const { page } = t;
    // Before a run, the report and the exceptions have nothing to export: their buttons say why.
    await page.click("#tab-audit");
    problem((await page.getAttribute("#btn-export-report", "aria-disabled")) === "true" && (await page.getAttribute("#btn-export-csv", "aria-disabled")) === "true", "before a run the report and exceptions exports are disabled");
    await page.click("#tab-audit");
    c.end = await simulate(page);
    problem(c.end === "done", `the replay ended ${c.end}`);
    const runId = await page.evaluate(async () => (await import("./js/audit.js")).auditRunInfo().run_id);
    const base = `data-quality-${runId}-SIMULATION`;
    await page.click("#tab-audit");
    // The report.
    const rep = await download(page, () => page.click("#btn-export-report"));
    const shown = await page.evaluate(async () => (await import("./js/exports.js")).lastReport());
    problem(rep.name === `${base}-report.md`, `report file name ${rep.name}`);
    problem(/^> SIMULATION — scripted replay, not a live analysis\./.test(rep.text), "the report file opens with the SIMULATION line");
    problem(rep.text.includes(`run ${runId}`) && /rule set \d+\.\d+\.\d+ · engine \d+\.\d+\.\d+/.test(rep.text), "the report file names the run and the versions");
    problem(shown && rep.text.includes(shown.trim()), "the report file holds the report as published");
    // The report dialog's download is the same file.
    await page.click("#btn-open-report");
    const rep2 = await download(page, () => page.click("#btn-report-download"));
    problem(rep2.name === rep.name && rep2.text.replace(/exported \S+/, "") === rep.text.replace(/exported \S+/, ""), "the report dialog downloads the same file");
    await page.keyboard.press("Escape");
    // The exceptions: the board's rule tables, row for row.
    const csv = await download(page, () => page.click("#btn-export-csv"));
    problem(csv.name === `${base}-exceptions.csv`, `exceptions file name ${csv.name}`);
    problem(csv.text.charCodeAt(0) === 0xfeff, "the CSV starts with a byte-order mark");
    const rows = parseCsv(csv.text.replace(/^﻿/, ""));
    const header = rows.shift();
    problem(JSON.stringify(header) === JSON.stringify(EXCEPTION_COLUMNS.map(([n]) => n)), `CSV header ${header.join(",")}`);
    const col = Object.fromEntries(header.map((n, i) => [n, i]));
    const counts = await page.$$eval(".hex-cell", (els) => Object.fromEntries(els.map((e) => [e.dataset.rule, e.querySelector(".hex-count").textContent])));
    const byRule = {};
    for (const r of rows) byRule[r[col.rule]] = (byRule[r[col.rule]] || 0) + 1;
    for (const [rule, n] of Object.entries(counts)) problem(String(byRule[rule] || 0) === (n === "—" ? "0" : n.replace(/,/g, "")) || (n === "—" && !byRule[rule]), `${rule}: the CSV holds ${byRule[rule] || 0} rows, the cell shows ${n}`);
    problem(rows.every((r) => r[col.mode] === "SIMULATION" && r[col.run_id] === runId), "every CSV row says SIMULATION and the run");
    // Row for row against the open table of the case's rule.
    await page.click(".drawer-toggle");
    await page.click("#cell-DQ-01");
    const table = await page.$$eval("#ex-table tbody tr[data-exception]", (els) => els.map((e) => [...e.children].map((x) => x.textContent)));
    const dq01 = rows.filter((r) => r[col.rule] === "DQ-01");
    problem(table.length === dq01.length && table.length > 0, `DQ-01: ${dq01.length} CSV rows, ${table.length} table rows`);
    for (const [k, r] of dq01.entries()) {
      const tr = table[k];
      if (!tr) break;
      const ok = tr[0] === r[col.record] && tr[3] === euro(Number(r[col.spend_affected_eur])) && tr[7].startsWith(r[col.status]) && tr[6].includes(r[col.suggestion].split(" (")[0]);
      problem(ok, `DQ-01 row ${k + 1}: table ${JSON.stringify(tr)} ≠ CSV ${JSON.stringify(r)}`);
    }
    problem(dq01.every((r) => r[col.status] === "approved, re-scan pending" && r[col.in_case] === "yes"), "the approved case's rows read approved, re-scan pending in the CSV");
    await page.click(".drawer-toggle");
    // The audit log.
    const js = await download(page, () => page.click("#btn-export"));
    problem(js.name === `${base}-audit.json`, `audit file name ${js.name}`);
    const doc = JSON.parse(js.text);
    const v = validate(doc, EXPORT_SCHEMAS.AuditExport, { defs: ALL_DEFS, maxErrors: 10 });
    problem(v.ok, `the audit export breaks its schema: ${describeErrors(v.errors, "export")}`);
    problem(doc.mode === "simulation" && /^SIMULATION/.test(doc.mode_statement), "the audit export says SIMULATION");
    problem(doc.audit_log.length === doc.events.length + doc.counts.model_calls && doc.audit_log.every((e, i) => e.seq === i + 1), "the audit log holds every event, in order");
    const actors = new Set(doc.audit_log.map((e) => e.actor));
    problem(["system", "engine", "agent", "user"].every((a) => actors.has(a)), `actors: ${[...actors].join(", ")}`);
    problem(doc.audit_log.filter((e) => e.type === "option_decision").every((e) => e.actor === "user") && doc.audit_log.some((e) => e.type === "option_decision"), "the decision is the person's in the audit log");
    problem(doc.parameters?.source === "defaults" && JSON.stringify(doc.parameters.in_effect) === JSON.stringify({ ...PARAMS }) && doc.parameters.changed.length === 0, `the run used the defaults (${JSON.stringify(doc.parameters).slice(0, 120)})`);
    c.files = [rep.name, csv.name, js.name];
    c.rows = rows.length;
  } catch (e) { c.problems.push(`exception: ${e.message}`); }
  problem(t.log.outside.length === 0, `requests to outside hosts: ${t.log.outside.slice(0, 3).join(", ")}`);
  record("exports", c, t);
  await t.context.close();
}

// ---- method --------------------------------------------------------------------------------------
if (chosen.includes("method")) {
  // The engine's sweep at the changed cost of capital, in Node, and at the default for the control.
  const sweep = async (params) => {
    const seen = {};
    const tb = createToolbox({ world: DATA.WORLD, mode: "live", today: new Date(), params, onPhase: () => {}, waitFor: () => new Promise(() => {}), emit: (type, p) => { if (type === "board_update" && p.scan) seen.scan = p.scan; } });
    await tb.execute("dq_scan", {});
    return seen.scan.exceptions;
  };
  const at8 = await sweep({ ...PARAMS, cost_of_capital: 0.08 });
  const at6 = await sweep(PARAMS);
  const fake = createFakeClaude([
    { stop: "tool_use", usage: { ...TURN_USAGE }, blocks: [{ type: "text", text: "I scan every rule over all the data." }, { type: "tool_use", id: "toolu_m1", name: "dq_scan", input: {} }] },
    { stop: "tool_use", usage: { ...TURN_USAGE }, blocks: [{ type: "tool_use", id: "toolu_m2", name: "erp_get_overview", input: {} }] },
    { stop: "tool_use", usage: { ...TURN_USAGE }, blocks: [{ type: "tool_use", id: "toolu_m3", name: "ui_final_report", input: { outcome: "nothing_found", markdown: "## Sweep\n\nThe board shows what the scan found." } }] },
    { stop: "end_turn", usage: { ...TURN_USAGE }, blocks: [{ type: "text", text: "Done." }] }
  ]);
  const t = await newPage(fake);
  const c = { problems: [] };
  const problem = (ok, msg) => { if (!ok) c.problems.push(msg); };
  try {
    const { page } = t;
    await page.click("#btn-method");
    await page.waitForSelector(".method-modal[open]");
    // The rules with their dimension, severity, responsible person and suggestion.
    const rules = await page.$$eval("#method-rules tbody tr", (els) => els.map((e) => ({ rule: e.dataset.rule, cells: [...e.children].map((x) => x.textContent) })));
    problem(rules.length === 15, `${rules.length} rules in the dialog`);
    for (const r of RULES) {
      const row = rules.find((x) => x.rule === r.id);
      const sev = { high: "High", medium: "Medium", low: "Low" }[r.severity];
      const ok = row && row.cells[0].startsWith(`${r.id} ${r.name}`) && row.cells[1] === r.dimension && row.cells[2] === sev
        && row.cells[3].toLowerCase() === r.responsible.toLowerCase() && row.cells[4] === (r.suggestion || "None");
      problem(ok, `${r.id}: the dialog shows ${JSON.stringify(row?.cells)}`);
    }
    const text = await page.locator(".method-modal").innerText();
    problem(/Why accuracy is left out/.test(text) && /outside the data/.test(text), "the dialog says why accuracy is left out");
    const terms = await page.$$eval("#method-defs dt", (els) => els.map((e) => e.textContent));
    for (const want of ["Spend affected", "Clean spend", "Closure rate", "Weekly cohorts", "Financing cost of paying early", "Assumptions"]) problem(terms.includes(want), `the definitions lack "${want}"`);
    problem(await page.locator(".method-modal .prod-step").count() === 6, "the production path's six steps");
    problem(await page.locator(".method-param-input").count() === 11 && /fixed/.test(await page.locator('#method-params-table tr[data-param="window_days"]').innerText()), "eleven parameters to edit, the window fixed");
    // A value out of bounds is refused, and nothing changes.
    await page.fill("#param-day_rate_eur", "99999");
    await page.click("#btn-params-apply");
    problem(/Not applied: Day rate .* must lie between 100 and 5000/.test(await page.locator("#method-param-status").textContent()), "an out-of-bounds value is refused with its bounds");
    await page.fill("#param-day_rate_eur", "1200");
    // The cost of capital to 8 %: applied, marked and logged.
    await page.fill("#param-cost_of_capital", "8");
    await page.click("#btn-params-apply");
    problem(/Applied and logged: 1 parameter applies from the next Live run on/.test(await page.locator("#method-param-status").textContent()), "the change is applied and logged");
    problem(await page.locator('#method-params-table tr[data-param="cost_of_capital"][data-changed="true"] .method-changed:not([hidden])').count() === 1, "the changed row is marked");
    problem(/Cost of capital: 6\.0% a year → 8\.0% a year/.test(await page.locator("#method-param-log").innerText()), "the log names the change");
    await page.keyboard.press("Escape");
    // Diagnostics shows it read-only.
    await page.click("#btn-diagnostics");
    await page.waitForSelector("#diag-params");
    problem(/8\.0% a year \(default 6\.0% a year\)/.test(await page.locator('#diag-params tr[data-param="cost_of_capital"]').innerText()) && await page.locator("#diag-params input").count() === 0, "Diagnostics shows the change, read-only");
    await page.keyboard.press("Escape");
    // A Simulation keeps the defaults, says so, and locks the parameters while it runs.
    await page.click("#btn-start");
    await page.click("#btn-mode-simulation");
    await page.waitForSelector("#console .entry");
    await page.click("#btn-method");
    await page.waitForSelector(".method-modal[open]");
    problem((await page.getAttribute("#btn-params-apply", "aria-disabled")) === "true" && await page.locator(".method-param-input[readonly]").count() === 11, "the parameters are locked during a run");
    await page.keyboard.press("Escape");
    problem(/Simulation runs on the method's default parameters/.test(await page.locator("#console").innerText()), "the Simulation says it runs on the defaults");
    await page.click("#btn-abort");
    await page.click("#btn-reset");
    // A Live sweep computes with the change: the board's financing costs at 8 %.
    await page.click("#btn-scan");
    await page.fill("#api-key-input", MOCK_KEY);
    await page.click("#btn-key-save");
    await page.waitForSelector(".entry[data-end]", { timeout: 60000 });
    problem(/Parameters changed in the Method dialog apply to this run: Cost of capital 8\.0% a year \(default 6\.0% a year\)/.test(await page.locator("#console").innerText()), "the Live run names the changed parameter");
    await page.click("#cell-DQ-07");
    await page.waitForSelector("#ex-card:not([hidden])");
    const fin = await page.$$eval("#ex-table tbody tr[data-exception]", (els) => els.map((e) => [e.dataset.exception, e.children[4].textContent]));
    const want8 = at8.filter((e) => e.rule === "DQ-07");
    const want6 = at6.filter((e) => e.rule === "DQ-07");
    problem(fin.length === want8.length && fin.length > 0, `DQ-07: ${fin.length} rows, the engine ${want8.length}`);
    problem(fin.every(([id, shownCost], k) => id === want8[k].id && shownCost === euro(want8[k].financing_cost_eur)), "the board shows the financing costs at 8 %");
    problem(want8.some((e, k) => euro(e.financing_cost_eur) !== euro(want6[k].financing_cost_eur)), "control: 8 % and 6 % give different costs");
    // The audit export records the parameters in effect and the change.
    await page.click("#tab-audit");
    const js = await download(page, () => page.click("#btn-export"));
    const doc = JSON.parse(js.text);
    const v = validate(doc, EXPORT_SCHEMAS.AuditExport, { defs: ALL_DEFS, maxErrors: 10 });
    problem(v.ok, `the audit export breaks its schema: ${describeErrors(v.errors, "export")}`);
    problem(doc.parameters?.source === "method dialog" && doc.parameters.in_effect.cost_of_capital === 0.08 && doc.parameters.changed[0]?.name === "cost_of_capital", `the export records the parameters in effect (${JSON.stringify(doc.parameters?.changed)})`);
    problem(doc.parameter_changes.length === 1 && doc.parameter_changes[0].from === 0.06 && doc.parameter_changes[0].to === 0.08, `the export logs the change (${JSON.stringify(doc.parameter_changes)})`);
    const overview = doc.events.find((e) => e.type === "tool_result" && e.payload.name === "erp_get_overview")?.payload.result;
    problem(overview?.parameters?.some((p) => p.name === "cost_of_capital" && p.value === 0.08 && p.default === 0.06), "the agent's overview names the changed parameter with its default");
    // Back to the defaults: logged too.
    await page.click("#btn-method");
    await page.click("#btn-params-reset");
    problem((await page.locator("#method-param-log li").count()) === 2 && (await page.evaluate(() => sessionStorage.getItem("dq.params") || "")).includes('"values":{}'), "back to the defaults, logged");
    await page.keyboard.press("Escape");
    await page.screenshot({ path: path.join(OUT, "method.png") });
  } catch (e) { c.problems.push(`exception: ${e.message}`); }
  problem(t.log.outside.length === 0, `requests to outside hosts: ${t.log.outside.slice(0, 3).join(", ")}`);
  record("method", c, t, fake);
  await t.context.close();
}

// ---- keyboard ------------------------------------------------------------------------------------
if (chosen.includes("keyboard")) {
  const t = await newPage(null);
  const c = { problems: [], tabs: 0, unseen: [] };
  const problem = (ok, msg) => { if (!ok) c.problems.push(msg); };
  // Whether the focused element shows its focus, once its transitions have run: Vici's outline, a ring in
  // the focus colour, Vici's hexagon ring (an icon button's ::after), the outline of an interactive card
  // around its stretched link, or (a hexagon cell) its rim in the focus colour; and it is on screen.
  const focusSeen = () => t.page.evaluate(async () => {
    const el = document.activeElement;
    if (!el || el === document.body) return { ok: false, what: "nothing focused (the focus fell to the page)" };
    const settle = el.getAnimations({ subtree: false }).filter((a) => a.effect?.getComputedTiming?.().iterations !== Infinity).map((a) => a.finished.catch(() => {}));
    await Promise.race([Promise.all(settle), new Promise((r) => setTimeout(r, 600))]);
    const cs = getComputedStyle(el);
    const probe = document.createElement("i");
    probe.style.color = "var(--vc-focus)";
    document.body.append(probe);
    const focus = getComputedStyle(probe).color;
    probe.remove();
    const outline = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 1.5;
    const ring = cs.boxShadow && cs.boxShadow !== "none" && cs.boxShadow.includes(focus);
    const after = getComputedStyle(el, "::after");
    const hexRing = after.content !== "none" && Number(after.opacity) > 0.5 && after.backgroundColor === focus;
    const card = el.matches(".vc-card__link") && (() => { const k = getComputedStyle(el.closest(".vc-card")); return k.outlineStyle !== "none" && parseFloat(k.outlineWidth) >= 1.5; })();
    const rim = el.matches(".hex-cell") && cs.backgroundColor === focus;
    let r = el.getBoundingClientRect();
    if (!(r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth)) {
      await new Promise((res) => setTimeout(res, 400));   // a skip link slides in
      r = el.getBoundingClientRect();
    }
    const inView = r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    const what = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}.${[...el.classList].slice(0, 2).join(".")} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}"${inView ? "" : " (off screen)"}`;
    return { ok: (outline || ring || hexRing || card || rim) && inView, what };
  });
  async function tabTo(selector, max = 400) {
    // Already there (the app handed the focus over): the next key is Enter.
    if (await t.page.evaluate((sel) => document.activeElement?.matches(sel) ?? false, selector)) { c.handedOver = (c.handedOver || 0) + 1; return true; }
    for (let i = 0; i < max; i++) {
      await t.page.keyboard.press("Tab");
      c.tabs += 1;
      // Tab from the last control leaves the page for the browser's own controls (the body here).
      if (await t.page.evaluate(() => document.activeElement === document.body)) { c.wraps = (c.wraps || 0) + 1; continue; }
      const f = await focusSeen();
      if (!f.ok && !c.unseen.some((u) => u.startsWith(f.what))) c.unseen.push(`${f.what} (Tab ${i + 1} towards ${selector})`);
      if (await t.page.evaluate((sel) => document.activeElement?.matches(sel) ?? false, selector)) return true;
    }
    throw new Error(`Tab never reached ${selector}`);
  }
  try {
    const { page } = t;
    await tabTo("#btn-start");
    await page.keyboard.press("Enter");
    await page.waitForSelector("#btn-mode-simulation");
    await tabTo("#btn-mode-simulation", 20);
    await page.keyboard.press("Enter");
    await tabTo(".segmented button[aria-label='Replay speed ×4']", 40);
    await page.keyboard.press("Enter");
    await page.waitForSelector('.option-card[data-recommended="true"] [data-action="approve"]', { state: "visible", timeout: 120000 });
    await page.waitForFunction(() => /Awaiting your decision/.test(document.querySelector(".status-pill .text")?.textContent || ""), null, { timeout: 60000 });
    // The decision is two Tabs from the top of the page (review finding R15): after the console's skip
    // link comes "Skip to your decision", which hands the focus to the recommended Approve.
    await page.evaluate(() => document.querySelector(".skip-link")?.focus());
    const before = c.tabs;
    await tabTo("#skip-turn", 2);
    c.skipTabs = c.tabs - before + 1;
    problem(/^Skip to your decision$/.test((await page.locator("#skip-turn").innerText()).trim()), "the second skip link names the decision");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
    problem(await page.evaluate(() => document.activeElement?.matches('.option-card[data-recommended="true"] [data-action="approve"]') ?? false), "the skip link hands the focus to the recommended Approve");
    await tabTo('.option-card[data-recommended="true"] [data-action="approve"]');
    await page.keyboard.press("Enter");
    // The first draft is reached the same way: "Skip to your approval".
    await page.waitForSelector('.action-card[data-status="pending"] [data-action="approve"]', { state: "visible", timeout: 120000 });
    await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector(".skip-link")?.focus());
    await tabTo("#skip-turn", 2);
    problem(/^Skip to your approval$/.test((await page.locator("#skip-turn").innerText()).trim()), "with drafts waiting, the skip link names the approval");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
    problem(await page.evaluate(() => document.activeElement?.matches('.action-card[data-status="pending"] [data-action="approve"]') ?? false), "the skip link hands the focus to the first pending draft's Approve");
    const t0 = Date.now();
    while (!(await page.locator(".entry[data-end]").count())) {
      if (Date.now() - t0 > 120000) throw new Error("the replay did not end in time");
      if (await page.locator('.action-card[data-status="pending"] [data-action="approve"]').count()) {
        await tabTo('.action-card[data-status="pending"] [data-action="approve"]');
        await page.keyboard.press("Enter");
      }
      await page.waitForTimeout(200);
    }
    c.end = await page.locator(".entry[data-end]").last().getAttribute("data-end");
    problem(c.end === "done", `the run ended ${c.end}`);
    problem(await page.locator("#skip-turn").isHidden(), "the turn's skip link is hidden once nothing waits");
    // Every cell opens by keyboard too, and Escape-free Close returns the focus to it.
    await tabTo("#cell-DQ-01");
    await page.keyboard.press("Enter");
    problem(await page.locator("#ex-card:not([hidden])").count() === 1, "Enter opens a cell's exceptions");
    problem(c.unseen.length === 0, `focus not visible on: ${c.unseen.slice(0, 8).join("; ")}`);
    await page.screenshot({ path: path.join(OUT, "keyboard-done.png") });
  } catch (e) { c.problems.push(`exception: ${e.message}`); }
  record("keyboard", c, t);
  await t.context.close();
}

// ---- motion --------------------------------------------------------------------------------------
if (chosen.includes("motion")) {
  // Infinite animations still running while the agent reads, with and without reduced motion.
  const running = async (reducedMotion) => {
    const t = await newPage(null, { reducedMotion });
    const seen = new Set();
    let reading = 0;
    try {
      const { page } = t;
      await page.click("#btn-start");
      await page.click("#btn-mode-simulation");
      const t0 = Date.now();
      while (Date.now() - t0 < 12000) {
        const r = await page.evaluate(() => {
          const names = document.getAnimations().filter((a) => a.playState === "running" && a.effect?.getComputedTiming?.().iterations === Infinity)
            .map((a) => { const el = a.effect.target; return `${a.animationName || a.id || "animation"} on ${el?.classList?.[0] || el?.tagName}`; })
            .filter((n) => !/vc-spinner/.test(n));
          return { names, reading: document.querySelectorAll('[data-reading="true"]').length };
        });
        r.names.forEach((n) => seen.add(n));
        reading = Math.max(reading, r.reading);
        await page.waitForTimeout(250);
      }
    } finally { await t.context.close(); }
    return { seen: [...seen], reading, errors: t.log.errors };
  };
  const c = { problems: [] };
  const problem = (ok, msg) => { if (!ok) c.problems.push(msg); };
  try {
    const normal = await running("no-preference");
    const reduced = await running("reduce");
    c.normal = normal.seen;
    c.reduced = reduced.seen;
    problem(normal.reading > 0 && reduced.reading > 0, `the agent read records in both runs (${normal.reading}, ${reduced.reading})`);
    problem(normal.seen.some((n) => /fjordPulse|rowRead/.test(n)), `control: without reduced motion the reading pulses run (${normal.seen.join(", ")})`);
    problem(reduced.seen.length === 0, `with reduced motion these keep running: ${reduced.seen.join(", ")}`);
    c.problems.push(...normal.errors, ...reduced.errors);
  } catch (e) { c.problems.push(`exception: ${e.message}`); }
  record("motion", c, null);
}

// ---- names ---------------------------------------------------------------------------------------
if (chosen.includes("names")) {
  const t = await newPage(null);
  const c = { problems: [] };
  const problem = (ok, msg) => { if (!ok) c.problems.push(msg); };
  const INTERACTIVE = new Set(["button", "link", "textbox", "spinbutton", "checkbox", "radio", "tab", "menuitemradio", "menuitem", "combobox", "switch", "slider", "searchbox"]);
  const audit = async (label) => {
    const cdp = await t.context.newCDPSession(t.page);
    await cdp.send("Accessibility.enable");
    const { nodes } = await cdp.send("Accessibility.getFullAXTree");
    await cdp.detach();
    const live = nodes.filter((n) => !n.ignored);
    const unnamed = live.filter((n) => INTERACTIVE.has(n.role?.value) && !String(n.name?.value || "").trim()).map((n) => n.role.value);
    problem(unnamed.length === 0, `${label}: ${unnamed.length} controls without a name (${unnamed.slice(0, 6).join(", ")})`);
    // The honeycomb is on screen in the Rules view without a dialog over it (a modal makes the page inert).
    const honeycomb = await t.page.evaluate(() => !document.querySelector("dialog[open]") && !!document.querySelector(".honeycomb")?.getClientRects().length);
    const cells = live.filter((n) => n.role?.value === "button" && /^DQ-(0[1-9]|1[0-5]) /.test(n.name?.value || ""));
    if (honeycomb) problem(cells.length === 15, `${label}: ${cells.length} cells named by their rule`);
    // Table rows carry a row header, so a screen reader announces each row by its record or person.
    const rows = await t.page.$$eval("table tbody tr", (els) => els.filter((e) => e.getClientRects().length && !e.closest("[hidden]"))
      .map((e) => ({ table: e.closest("table").id || e.closest("table").className, header: e.querySelector('th[scope="row"]')?.textContent.trim() || "", cells: e.children.length })));
    const bad = rows.filter((r) => r.cells > 1 && !r.header);
    problem(bad.length === 0, `${label}: rows without a row header in ${[...new Set(bad.map((r) => r.table))].join(", ")}`);
    return { cells: cells.length, rows: rows.length };
  };
  try {
    const { page } = t;
    c.idle = await audit("idle");
    await page.click("#btn-start");
    await page.click("#btn-mode-simulation");
    await page.click(".segmented button[aria-label='Replay speed ×4']");
    await page.waitForSelector('.option-card[data-recommended="true"] [data-action="approve"]', { state: "visible", timeout: 120000 });
    c.options = await audit("options");
    const hex = await page.$eval("#cell-DQ-01", (e) => e.getAttribute("aria-label"));
    problem(/^DQ-01 Contract not referenced: \d+ open exceptions, high severity\. Open its exceptions\.$/.test(hex), `a cell's name says its rule, count and severity (${hex})`);
    await page.click('.option-card[data-recommended="true"] [data-action="approve"]');
    const t0 = Date.now();
    while (!(await page.locator(".entry[data-end]").count())) {
      if (Date.now() - t0 > 120000) throw new Error("the replay did not end in time");
      const pending = page.locator('.action-card[data-status="pending"] [data-action="approve"]');
      if (await pending.count()) await pending.first().click();
      await page.waitForTimeout(150);
    }
    await page.click(".drawer-toggle");
    await page.click("#cell-DQ-01");
    c.table = await audit("a rule's exceptions");
    await page.click("#btn-ex-close");
    await page.click("#view-people");
    c.people = await audit("people");
    await page.click("#view-rules");
    await page.click("#cohort-details > summary");
    c.cohorts = await audit("cohorts");
    await page.click("#btn-method");
    await page.waitForSelector(".method-modal[open]");
    c.method = await audit("Method dialog");
  } catch (e) { c.problems.push(`exception: ${e.message}`); }
  record("names", c, t);
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
