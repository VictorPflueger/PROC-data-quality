// The live agent against a scripted stand-in for the Anthropic Messages API (lib/fake-claude.mjs).
// The stand-in streams realistic SSE and checks every request against the protocol rules of
// TECH_NOTES §3: assistant turns echoed unchanged with their signatures, every tool_use answered,
// the headers and the request features. No real API is called, and there is no key in the build.
//   key       AC-08: Simulation never asks for a key; Live asks once, checks it with GET /v1/models,
//             keeps it in this tab's session storage only, never in local storage, the page, the
//             browser console, the audit export or a recording; Forget key removes it; the key dialog
//             refuses to work inside a frame
//   guards    AC-09: grouping before a scan, an input that breaks its schema, an alert on a group under
//             half its base and one without the records read, options outside the latest fix paths, a
//             stale decision, a draft the fix path does not allow and a report while a draft is open:
//             each refused with a Guardrail line, and the run still ends well
//   review    AC-10: AI-suggested groups with an unknown code or words not in the short text are
//             refused; unreviewed ones do not count; the review shows Your confirmation in merlot on
//             the furthest step reached (Check) and the rail never moves back; approved ones count
//   caps      AC-11: no 41st model call; none once €3 is spent; the cost meter equals usage × price
//   sweep     Live sweep: no mode dialog, the sweep instruction, every rule scanned, an honest end
//   custom    Custom what-if: Simulation blocked, the person's words reach the agent unchanged
//   recorder  a full live run of scenario 1 (one path rejected, one approved), the audit export with
//             model, usage and cost, Save run as simulation, and the recording replayed offline
// Usage: node tests/live.mjs [case…]   prints "LIVE OK: <cases>" when every case passes.
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { createFakeClaude } from "./lib/fake-claude.mjs";
import { scriptTurns, loadData, TURN_USAGE } from "./lib/turns.mjs";
import { APP_ROOT, outDir, ONLY, launchBrowser, serveStatic, CORS, MOCK_KEY, NETWORK_NOISE, SKIP_INTRO } from "./lib/harness.mjs";

const CASES = ["key", "guards", "review", "caps", "sweep", "custom", "recorder"];
const chosen = ONLY.length ? ONLY : CASES;
const unknown = chosen.filter((c) => !CASES.includes(c));
if (unknown.length) { console.error(`Unknown case(s): ${unknown.join(", ")}. Cases: ${CASES.join(", ")}`); process.exit(2); }
const OUT = await outDir("live");
const PORT = 8790 + Math.floor(Math.random() * 400);
const { base: BASE, close } = await serveStatic(APP_ROOT, PORT);
const browser = await launchBrowser();
const DATA = await loadData();
const results = [];
const KEY = MOCK_KEY;
const SONNET = { input: 2.0, output: 10.0, cacheWrite: 2.5, cacheRead: 0.1 };
const FX = 0.894;

// ---- page and stand-in ------------------------------------------------------------------------------
async function newPage(fake, { models = "ok", simRunsExtra = null, framed = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
  await context.addInitScript(SKIP_INTRO);
  const log = { pageErrors: [], consoleErrors: [], consoleText: [], modelsRequests: 0, keyElsewhere: [], hosts: new Set() };
  if (simRunsExtra) {
    // "Append it to data/sim_runs.js": the page gets the file with the recording at its end.
    const original = await readFile(path.join(APP_ROOT, "data/sim_runs.js"), "utf8");
    await context.route(`${BASE}data/sim_runs.js`, (route) => route.fulfill({ status: 200, headers: { "content-type": "text/javascript; charset=utf-8" }, body: `${original}\n${simRunsExtra}` }));
  }
  if (framed) {
    await context.route(`${BASE}test/frame.html`, (route) => route.fulfill({ status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body: `<!doctype html><title>frame</title><iframe src="${BASE}index.html" width="1800" height="1000" title="app"></iframe>` }));
  }
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    log.hosts.add(u.host);
    const headers = req.headers();
    if (u.host !== "api.anthropic.com" && (JSON.stringify(headers).includes(KEY) || (req.postData() || "").includes(KEY))) log.keyElsewhere.push(u.host);
    if (u.host === "api.anthropic.com") {
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { ...CORS, "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST" } });
      if (u.pathname === "/v1/models") {
        log.modelsRequests += 1;
        log.modelsKey = headers["x-api-key"];
        if (models === "reject") return route.fulfill({ status: 401, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }) });
        return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify({ data: [{ id: "claude-sonnet-5-5" }, { id: "claude-haiku-5-5" }, { id: "claude-opus-5-5" }] }) });
      }
      if (u.pathname === "/v1/messages" && fake) {
        const out = fake.handle(req.postData() || "{}", headers);
        if (out.delayMs) await new Promise((r) => setTimeout(r, out.delayMs));
        return route.fulfill({ status: out.status, headers: { ...CORS, ...out.headers }, body: out.body }).catch(() => {});
      }
    }
    return route.abort("blockedbyclient");
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => log.pageErrors.push(String(e.message || e)));
  page.on("console", (m) => {
    log.consoleText.push(m.text());
    if (m.type() === "error" && !NETWORK_NOISE.test(m.text())) log.consoleErrors.push(m.text());
  });
  return { context, page, log };
}

async function open(page, { scenario = null } = {}) {
  await page.goto(BASE);
  await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
  if (scenario && scenario !== "SC-PUNCHOUT") {
    await page.click("#dd-scenario");
    await page.click(`.dropdown-menu [data-id="${scenario}"]`);
  }
}

async function enterKey(page) {
  await page.waitForSelector("#api-key-input", { timeout: 10000 });
  await page.fill("#api-key-input", KEY);
  await page.click("#btn-key-save");
}

async function startLive(page, { sweep = false, scenario = null } = {}) {
  await open(page, { scenario });
  if (sweep) await page.click("#btn-scan");
  else {
    await page.click("#btn-start");
    await page.click("#btn-mode-live");
  }
  await enterKey(page);
}

/**
 * Takes the person's part until the run ends: options as planned (["reject", "A"], ["approve", "C"],
 * ["accept", reason]), the review (approve all, or reject the listed lines) and every draft approved.
 */
async function drive(page, { options = [["approve", null]], reviewReject = [], timeout = 90000, onOptions = null } = {}) {
  const t0 = Date.now();
  let step = 0;
  for (;;) {
    if (await page.locator(".entry[data-end]").count()) break;
    if (Date.now() - t0 > timeout) throw new Error("the run did not end in time");
    if (await page.locator(".review-modal").count() && !(await page.locator("#btn-review-confirm").getAttribute("data-done"))) {
      await page.click("#btn-review-approve-all");
      for (const line of reviewReject) await page.click(`.review-modal tr[data-line="${line}"] [data-action="reject"]`);
      await page.evaluate(() => document.getElementById("btn-review-confirm")?.setAttribute("data-done", "1"));
      await page.click("#btn-review-confirm");
    }
    if (step < options.length && await page.locator('.option-card[data-kind="option"]:not([data-status]) [data-action="approve"], .option-card[data-kind="option"][data-status=""] [data-action="approve"]').count()) {
      if (onOptions) { await onOptions(step); }
      const [action, arg] = options[step];
      const sel = arg ? `.option-card[data-path="${arg}"]` : '.option-card[data-recommended="true"]';
      if (action === "accept") {
        await page.fill("#nothing-reason", arg);
        await page.click('.option-card[data-kind="baseline"] [data-action="accept"]');
      } else await page.click(`${sel} [data-action="${action}"]`);
      step += 1;
      await page.waitForTimeout(150);
    }
    const pending = page.locator('.action-card[data-status="pending"] [data-action="approve"]');
    if (await pending.count()) await pending.first().click();
    await page.waitForTimeout(150);
  }
  return page.locator(".entry[data-end]").last().getAttribute("data-end");
}

function finish(name, t, fake, checks, { remaining = 0 } = {}) {
  return t.page.evaluate(() => window.__csp || []).catch(() => []).then(async (csp) => {
    results.push({
      name, checks, violations: fake?.violations || [],
      remainingScript: fake ? fake.remaining() - remaining : 0,
      pageErrors: t.log.pageErrors, consoleErrors: t.log.consoleErrors.filter((x) => !/live run failed/.test(x)), csp
    });
    await t.context.close();
  });
}

const lastResults = (req) => {
  const last = req.messages[req.messages.length - 1];
  return Array.isArray(last?.content) ? last.content.filter((b) => b.type === "tool_result").map((b) => ({ id: b.tool_use_id, isError: b.is_error === true, json: safeJson(b.content) })) : [];
};
const resultOf = (fake, id) => {
  for (const { req } of fake.requests) for (const r of lastResults(req)) if (r.id === id) return r;
  return null;
};
const safeJson = (s) => { try { return JSON.parse(s); } catch { return null; } };
const guardLines = (page) => page.$$eval("#console .entry[data-guard]", (els) => els.map((e) => e.dataset.guard));
const tu = (id, name, input, extra = {}) => ({ stop: "tool_use", usage: { ...TURN_USAGE }, ...extra, blocks: [...(extra.text ? [{ type: "text", text: extra.text }] : []), { type: "tool_use", id, name, input }] });
const endTurn = (text = "Done.") => ({ stop: "end_turn", usage: { ...TURN_USAGE }, blocks: [{ type: "text", text }] });
const turnCost = (u) => ((u.input_tokens * SONNET.input + u.output_tokens * SONNET.output + u.cache_read_input_tokens * SONNET.cacheRead + u.cache_creation_input_tokens * SONNET.cacheWrite) / 1e6) * FX;

async function download(page, click) {
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), click()]);
  const file = path.join(OUT, dl.suggestedFilename());
  await dl.saveAs(file);
  return { name: dl.suggestedFilename(), text: await readFile(file, "utf8") };
}

// ---- key ---------------------------------------------------------------------------------------------
if (chosen.includes("key")) {
  const fake = createFakeClaude([
    tu("toolu_k1", "erp_get_overview", {}, { text: "I look at what the data holds first." }),
    tu("toolu_k2", "ui_final_report", { outcome: "nothing_found", markdown: "## Key check\n\nNo case was investigated in this short run." }),
    endTurn()
  ]);
  const t = await newPage(fake);
  const c = {};
  try {
    const { page, log } = t;
    // Simulation: no key dialog, no key check.
    await open(page);
    await page.click("#btn-start");
    await page.click("#btn-mode-simulation");
    await page.waitForTimeout(1500);
    c.simAskedKey = await page.locator("#api-key-input").count();
    c.simModels = log.modelsRequests;
    await page.click("#btn-abort");
    await page.click("#btn-reset");
    // Live: the key is asked once and checked with the free model list.
    await page.click("#btn-start");
    await page.click("#btn-mode-live");
    await enterKey(page);
    c.end = await drive(page, { options: [] });
    c.models = log.modelsRequests;
    c.modelsKey = log.modelsKey === KEY;
    c.messagesKey = fake.requests.every((r) => r.headers["x-api-key"] === KEY);
    c.session = await page.evaluate(() => sessionStorage.getItem("dq.anthropic.key"));
    c.local = await page.evaluate((k) => Object.keys(localStorage).some((x) => (localStorage.getItem(x) || "").includes(k.slice(0, 20))), KEY);
    c.inPage = await page.evaluate((k) => document.documentElement.outerHTML.includes(k) || document.body.innerText.includes(k), KEY);
    c.inConsole = log.consoleText.some((x) => x.includes(KEY));
    c.keyElsewhere = log.keyElsewhere;
    await page.click("#tab-audit");
    const exp = await download(page, () => page.click("#btn-export"));
    c.exportName = exp.name;
    c.inExport = exp.text.includes(KEY);
    c.exportHasRun = /"mode": "live"/.test(exp.text);
    // Forget key: from the mode dialog's "Change or forget key".
    await page.click("#btn-start");
    await page.click("#btn-manage-key");
    await page.waitForSelector("#btn-key-forget:not([hidden])");
    await page.click("#btn-key-forget");
    c.forgotten = (await page.evaluate(() => sessionStorage.getItem("dq.anthropic.key"))) === null;
    await page.keyboard.press("Escape");
    await page.screenshot({ path: path.join(OUT, "key-forgotten.png") });
  } catch (e) { c.FAILED = e.message; }
  await finish("key", t, fake, c);

  // Inside a frame the key dialog refuses to work.
  const tf = await newPage(null, { framed: true });
  const cf = {};
  try {
    await tf.page.goto(`${BASE}test/frame.html`);
    const frame = tf.page.frameLocator("iframe");
    await frame.locator('html[data-boot="ready"]').waitFor({ timeout: 20000 });
    await frame.locator("#btn-start").click();
    await frame.locator("#btn-mode-live").click();
    await frame.locator("#api-key-input").waitFor();
    cf.inputDisabled = await frame.locator("#api-key-input").isDisabled();
    cf.saveDisabled = await frame.locator("#btn-key-save").getAttribute("aria-disabled");
    cf.message = await frame.locator("#api-key-msg").textContent();
    cf.models = tf.log.modelsRequests;
  } catch (e) { cf.FAILED = e.message; }
  await finish("key in a frame", tf, null, cf);
}

// ---- guards ------------------------------------------------------------------------------------------
if (chosen.includes("guards")) {
  const plant = [{ key: "plant", values: ["3010"] }];
  const option = (path, title) => ({ path, title, description: `The ${title.toLowerCase()} for the punch-out lines.`, residual_risk: "Depends on the people involved." });
  const options = [option("A", "Mass correction"), option("B", "Buyer follow-up"), option("C", "Correction and catalog fix")];
  const recs = ["4500101079/20", "4500101086/10", "4500101219/20"];
  const script = [
    tu("toolu_g01", "dq_group", { rules: ["DQ-01"], by: ["buyer"], filters: plant }, { text: "I group the contract-reference gaps at Lyon by buyer." }),
    tu("toolu_g02", "dq_scan", { filters: plant }, { text: "The rules have to find the exceptions first: I scan Lyon." }),
    tu("toolu_g03", "dq_group", { rules: ["DQ-01"], by: ["colour"], filters: plant }),
    tu("toolu_g04", "dq_group", { rules: ["DQ-01"], by: ["week_detected"], filters: plant }),
    tu("toolu_g05", "ui_report_alert", { title: "Contract references missing in week one", grouping: "grp-1", group: "1", root_cause: "Lines of one week lack the contract reference.", fix_at_source: "Remind the buyers.", summary: "One week of punch-out lines lacks the contract reference." }),
    tu("toolu_g06", "dq_group", { rules: ["DQ-01"], by: ["channel"], filters: plant }),
    tu("toolu_g07", "ui_report_alert", { title: "Contract references lost in punch-out", grouping: "grp-2", group: "punch-out", root_cause: "The punch-out catalog drops the contract number.", fix_at_source: "Map the contract number in the catalog interface.", summary: "The punch-out lines at Lyon lack their contract reference." }),
    { stop: "tool_use", usage: { ...TURN_USAGE }, blocks: [
      ...recs.map((id, k) => ({ type: "tool_use", id: `toolu_g08${k}`, name: "erp_get_record", input: { product: "po_line", id } })),
      { type: "tool_use", id: "toolu_g083", name: "erp_get_record", input: { product: "contract", id: "4600000101" } }
    ] },
    tu("toolu_g09", "ui_report_alert", { title: "Contract references lost in punch-out", grouping: "grp-2", group: "punch-out", root_cause: "The punch-out catalog drops the contract number.", fix_at_source: "Map the contract number in the catalog interface.", summary: "The punch-out lines at Lyon lack their contract reference." }),
    tu("toolu_g10", "dq_fix_paths", { grouping: "grp-2", group: "punch-out" }),
    tu("toolu_g11", "dq_fix_paths", { grouping: "grp-2", group: "punch-out" }),
    tu("toolu_g12", "ui_propose_options", { fix_paths_id: "fp-1", options, recommended: "C", nothing_note: "The compliance report stays blind to these lines." }),
    tu("toolu_g13", "ui_propose_options", { fix_paths_id: "fp-2", options, recommended: "C", nothing_note: "The compliance report stays blind to these lines." }),
    // Answered late, so the person can still click the first set of options while the second is on its way.
    tu("toolu_g14", "ui_propose_options", { fix_paths_id: "fp-2", options, recommended: "C", nothing_note: "The compliance report stays blind to these lines." }, { delayMs: 2500 }),
    tu("toolu_g15", "ui_await_decision", {}),
    tu("toolu_g16", "ui_draft_action", { kind: "follow_up", recipient: "U126", subject: "Contract references", body: "Please add the contract reference to your punch-out lines." }),
    tu("toolu_g17", "ui_draft_action", { kind: "change_request", recipient: "U101", subject: "Mock change request: contract references at Lyon", body: "Please set contract 4600000101 on the punch-out lines below." }),
    tu("toolu_g18", "ui_final_report", { outcome: "fix_approved", markdown: "## Lyon punch-out\n\nThe catalog fix and the correction are approved." }),
    tu("toolu_g19", "ui_await_approvals", {}),
    tu("toolu_g20", "ui_final_report", { outcome: "fix_approved", markdown: "## Lyon punch-out\n\nThe catalog fix and the correction are approved; the change request waits in the outbox as a draft." }),
    endTurn()
  ];
  const fake = createFakeClaude(script);
  const t = await newPage(fake);
  const c = {};
  try {
    const { page } = t;
    await startLive(page);
    // The first set of options: approve B on it while the agent replaces the set.
    await page.waitForFunction(() => [...document.querySelectorAll("#console .entry")].filter((e) => /fix paths and doing nothing are ready/.test(e.textContent)).length >= 1, null, { timeout: 60000 });
    await page.click('.option-card[data-path="B"] [data-action="approve"]');
    await page.waitForFunction(() => [...document.querySelectorAll("#console .entry")].filter((e) => /fix paths and doing nothing are ready/.test(e.textContent)).length >= 2, null, { timeout: 30000 });
    c.staleCardsOpen = await page.locator('.option-card[data-kind="option"] [data-action="approve"]').count();
    await page.waitForSelector('#console .entry[data-guard="decision"]', { timeout: 20000 });
    c.end = await drive(page, { options: [["approve", "C"]] });
    c.guards = await guardLines(page);
    c.refusedSchema = resultOf(fake, "toolu_g03")?.json?.refused;
    c.halfError = resultOf(fake, "toolu_g05")?.json?.error || "";
    c.readError = resultOf(fake, "toolu_g07")?.json?.error || "";
    c.latestError = resultOf(fake, "toolu_g12")?.json?.error || "";
    c.draftError = resultOf(fake, "toolu_g16")?.json?.error || "";
    c.reportError = resultOf(fake, "toolu_g18")?.json?.error || "";
    c.scanFirstError = resultOf(fake, "toolu_g01")?.json?.error || "";
    c.staleNotice = await page.locator('#console .entry[data-guard="decision"]').first().textContent();
    c.approvedC = await page.locator('.option-card[data-path="C"] .option-status').textContent();
    c.drafts = await page.$$eval(".action-card", (els) => els.map((e) => e.dataset.kind));
    c.facts = await page.locator(".entry[data-end] .run-facts p").textContent().catch(() => "");
    await page.screenshot({ path: path.join(OUT, "guards.png") });
  } catch (e) { c.FAILED = e.message; }
  await finish("guards", t, fake, c);
}

// ---- review ------------------------------------------------------------------------------------------
if (chosen.includes("review")) {
  const base = DATA.SIM_RUNS["SC-UNCLASSIFIED"];
  const steps = JSON.parse(JSON.stringify(base.steps));
  const k = steps.findIndex((s) => s.tool === "dq_classify");
  steps[k].input.items.push(
    { line_id: "4500101059/10", group_code: "XX-NOPE", words: ["cordless drill"], confidence: "high" },
    { line_id: "4500101062/10", group_code: "MRO-SPARES", words: ["unicorn horn"], confidence: "low" }
  );
  // Before the review: the suggestions as the engine counts them.
  steps.splice(k + 1, 0, { tool: "dq_suggest", input: { grouping: "{{grp.id}}", group: "free-text requisition" } });
  const reject = ["4500101182/10", "4500101279/10"];
  const built = await scriptTurns(DATA, { ...base, steps }, { review: (items) => items.map((it) => ({ line_id: it.line_id, decision: reject.includes(it.line_id) ? "rejected" : "approved" })) });
  const id = (name, nth = 0) => built.calls.filter((x) => x.name === name)[nth]?.id;
  const fake = createFakeClaude(built.turns);
  const t = await newPage(fake);
  const c = {};
  try {
    const { page } = t;
    await startLive(page, { scenario: "SC-UNCLASSIFIED" });
    await page.waitForSelector(".review-modal", { timeout: 60000 });
    c.railYours = await page.$$eval(".rail-step", (els) => els.map((e) => `${e.dataset.step}:${e.dataset.state}`).join(" "));
    c.railTurn = await page.locator(".rail-step[data-state='yours'] .rail-turn").textContent();
    c.pill = await page.locator(".status-pill .text").textContent();
    c.reviewRows = await page.locator(".review-modal tbody tr").count();
    await page.screenshot({ path: path.join(OUT, "review-dialog.png") });
    c.end = await drive(page, { reviewReject: reject });
    const cls = resultOf(fake, id("dq_classify"))?.json;
    c.classifyAccepted = cls?.accepted?.length;
    c.classifyRefused = (cls?.refused || []).map((r) => r.reason);
    c.sugBefore = resultOf(fake, id("dq_suggest", 1))?.json?.with_suggestion;
    c.caseS = resultOf(fake, id("dq_fix_paths"))?.json?.case?.s;
    c.reviewResult = resultOf(fake, id("ui_request_review"))?.json;
    c.railAfter = await page.$$eval(".rail-step", (els) => els.map((e) => `${e.dataset.step}:${e.dataset.state}`).join(" "));
  } catch (e) { c.FAILED = e.message; }
  await finish("review", t, fake, c);
}

// ---- caps --------------------------------------------------------------------------------------------
if (chosen.includes("caps")) {
  // 41 scripted turns that never finish: the 41st must never be requested.
  const many = Array.from({ length: 41 }, (_, i) => tu(`toolu_c${i}`, "erp_get_overview", {}, { text: "I look again." }));
  const fake = createFakeClaude(many);
  const t = await newPage(fake);
  const c = {};
  try {
    await startLive(t.page);
    await t.page.waitForSelector(".entry[data-end]", { timeout: 120000 });
    c.requests = fake.requests.length;
    c.endLine = await t.page.locator(".entry[data-end]").last().textContent();
  } catch (e) { c.FAILED = e.message; }
  await finish("caps: step limit", t, fake, c, { remaining: 1 });

  // A turn that costs about €1.79: after the second, the run has spent €3.58 and starts no third call.
  const big = { input_tokens: 4000, output_tokens: 200000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  const fake2 = createFakeClaude([0, 1, 2].map((i) => ({ ...tu(`toolu_b${i}`, "erp_get_overview", {}, { text: "Looking." }), usage: { ...big } })));
  const t2 = await newPage(fake2);
  const c2 = {};
  try {
    await startLive(t2.page);
    await t2.page.waitForSelector(".entry[data-end]", { timeout: 60000 });
    c2.requests = fake2.requests.length;
    c2.endLine = await t2.page.locator(".entry[data-end]").last().textContent();
    await t2.page.click("#tab-audit");
    const exp = await download(t2.page, () => t2.page.click("#btn-export"));
    const doc = JSON.parse(exp.text);
    c2.costEur = doc.cost?.eur;
    c2.expected = 2 * turnCost(big);
    c2.tile = await t2.page.locator("#kpi-cost-value").textContent();
  } catch (e) { c2.FAILED = e.message; }
  await finish("caps: cost limit and meter", t2, fake2, c2, { remaining: 1 });
}

// ---- sweep -------------------------------------------------------------------------------------------
if (chosen.includes("sweep")) {
  const fake = createFakeClaude([
    { ...tu("toolu_s1", "dq_scan", {}, { text: "I scan every rule over all the data." }), expect: (req, { check }) => check(/^Live sweep: scan every rule/.test(String(req.messages[0].content)), "the opening message is the sweep instruction") },
    tu("toolu_s2", "ui_final_report", { outcome: "nothing_found", markdown: "## Sweep\n\nThis short sweep stops after the scan." }),
    endTurn()
  ]);
  const t = await newPage(fake);
  const c = {};
  try {
    const { page } = t;
    await open(page);
    await page.click("#btn-scan");
    c.modeDialog = await page.locator(".mode-modal").count();
    await enterKey(page);
    c.end = await drive(page, { options: [] });
    c.cells = await page.$$eval(".hex-cell", (els) => els.filter((e) => e.dataset.state !== "neutral").length);
    c.endLine = await page.locator(".entry[data-end]").last().textContent();
    c.title = await page.locator("#console .entry[data-type='run'] .run-title").textContent();
  } catch (e) { c.FAILED = e.message; }
  await finish("sweep", t, fake, c);
}

// ---- custom ------------------------------------------------------------------------------------------
if (chosen.includes("custom")) {
  const tip = "Our Lyon buyers say lab orders never show their contract. Which lines, and who has to fix them?";
  const fake = createFakeClaude([
    { ...tu("toolu_u1", "dq_scan", { rules: ["DQ-01"], filters: [{ key: "plant", values: ["3010"] }] }, { text: "I scan the contract rule at Lyon." }), expect: (req, { check }) => check(String(req.messages[0].content).includes(`"${tip}"`), "the opening message carries the person's words unchanged") },
    tu("toolu_u2", "ui_final_report", { outcome: "nothing_found", markdown: "## Custom what-if\n\nThis short run stops after the scan." }),
    endTurn()
  ]);
  const t = await newPage(fake);
  const c = {};
  try {
    const { page } = t;
    await open(page);
    await page.click("#dd-scenario");
    await page.click('.dropdown-menu [data-id="custom"]');
    await page.fill("#custom-scenario", tip);
    await page.click("#btn-custom-ok");
    c.preview = await page.locator(".tip-preview[data-scenario='custom'] .tip-text").textContent();
    await page.click("#btn-start");
    c.simBlocked = await page.locator('.mode-card[data-mode="simulation"]').getAttribute("aria-disabled");
    c.simWhy = await page.locator(".why-disabled").textContent();
    await page.click("#btn-mode-live");
    await enterKey(page);
    c.end = await drive(page, { options: [] });
    c.seed = await page.locator("#console .entry[data-type='run'] .seed").textContent();
  } catch (e) { c.FAILED = e.message; }
  await finish("custom", t, fake, c);
}

// ---- recorder ----------------------------------------------------------------------------------------
if (chosen.includes("recorder")) {
  const script = DATA.SIM_RUNS["SC-PUNCHOUT"];
  const decide = (o) => [{ options_seq: o.options_seq, option_id: "A", decision: "rejected" }, { options_seq: o.options_seq, option_id: "C", decision: "approved" }];
  const built = await scriptTurns(DATA, script, { decide });
  const fake = createFakeClaude(built.turns);
  const t = await newPage(fake);
  const c = {};
  let recording = null;
  try {
    const { page } = t;
    await startLive(page);
    c.end = await drive(page, { options: [["reject", "A"], ["approve", "C"]] });
    c.turns = built.turns.length;
    c.requests = fake.requests.length;
    c.kpi = await page.locator("#kpi-closure-sub").textContent();
    c.facts = await page.locator(".entry[data-end] .run-facts p").textContent().catch(() => "");
    await page.click("#tab-audit");
    const exp = await download(page, () => page.click("#btn-export"));
    const doc = JSON.parse(exp.text);
    c.exportName = exp.name;
    c.model = doc.model;
    c.usage = doc.usage;
    c.costEur = doc.cost?.eur;
    c.expectedCost = built.turns.length * turnCost(TURN_USAGE);
    c.versions = [doc.app_version, doc.rule_set_version, doc.engine_version, doc.world_version].every(Boolean) && doc.app_version === "0.2.0";
    c.decisionLogged = doc.events.some((e) => e.type === "option_decision" && e.payload.option_id === "C" && e.payload.decision === "approved" && e.payload.by === "user");
    const rec = await download(page, () => page.click("#btn-save-sim"));
    c.recName = rec.name;
    c.recStatus = await page.locator(".audit-status").textContent();
    c.recSource = /"source": "recorded"/.test(rec.text);
    c.recPassed = /SCRIPT CHECK: passed/.test(rec.text);
    c.recKey = rec.text.includes(KEY);
    recording = rec.text;
    await page.screenshot({ path: path.join(OUT, "recorder-live-done.png") });
  } catch (e) { c.FAILED = e.message; }
  await finish("recorder: live run, audit export, Save run as simulation", t, fake, c);

  // The recording replays offline in Simulation mode, through the same tools.
  const t2 = await newPage(null, { simRunsExtra: recording || "" });
  const c2 = {};
  try {
    const { page } = t2;
    await open(page);
    await page.click("#btn-start");
    await page.click("#btn-mode-simulation");
    await page.click(".segmented button[aria-label='Replay speed ×4']");
    c2.tape = await page.locator(".sim-watermark").textContent();
    c2.end = await drive(page, { options: [["approve", "C"]] });
    c2.kpi = await page.locator("#kpi-closure-sub").textContent();
    c2.report = await page.locator("#console .report-card").count();
    c2.models = t2.log.modelsRequests;
  } catch (e) { c2.FAILED = e.message; }
  await finish("recorder: the recording replayed", t2, null, c2);
}

await browser.close();
await close();

// ---- expectations --------------------------------------------------------------------------------------
const near = (a, b) => typeof a === "number" && Math.abs(a - b) < 1e-9;
const EXPECT = {
  key: (c) => [
    [c.simAskedKey === 0 && c.simModels === 0, "Simulation asks for no key and checks none"],
    [c.models === 1 && c.modelsKey, `Live checks the key once with GET /v1/models (got ${c.models})`],
    [c.messagesKey, "the key goes with every model call to api.anthropic.com"],
    [(c.keyElsewhere || []).length === 0, `the key reached no other host (${(c.keyElsewhere || []).join(", ")})`],
    [c.session && c.session.startsWith("sk-ant-"), "kept in this tab's session storage"],
    [c.local === false, "never in local storage"],
    [c.inPage === false, "never in the page"],
    [c.inConsole === false, "never in the browser console"],
    [c.inExport === false && c.exportHasRun && /^data-quality-run-.*-LIVE-audit\.json$/.test(c.exportName || ""), `never in the audit export (${c.exportName})`],
    [c.end === "no_findings", `the short run ends honestly (got ${c.end})`],
    [c.forgotten, "Forget key removes it"]
  ],
  "key in a frame": (c) => [
    [c.inputDisabled && c.saveDisabled === "true", "the key field and its button are disabled in a frame"],
    [/inside another page/.test(c.message || ""), `the dialog says why (got ${c.message})`],
    [c.models === 0, "no key check from a frame"]
  ],
  guards: (c) => [
    [/Only exceptions a dq_scan/.test(c.scanFirstError), "grouping before a scan is refused"],
    [c.refusedSchema === "schema", "an input that breaks its schema is refused"],
    [/less than half/.test(c.halfError), `an alert on a group under half its base is refused (${c.halfError.slice(0, 120)})`],
    [/records read with erp_get_record/.test(c.readError) && /4600000101/.test(c.readError), "an alert without three records and the contract read is refused"],
    [/not the latest dq_fix_paths result/.test(c.latestError), "options outside the latest fix paths are refused"],
    [/no longer on screen/.test(c.staleNotice || ""), "a stale decision is ignored with a Guardrail line"],
    [c.staleCardsOpen >= 3, "the new set of options is open again after the stale click"],
    [/allows mock change request and prevention request, not an owner follow-up/.test(c.draftError), "a draft the fix path does not allow is refused"],
    [/still waiting for approval/.test(c.reportError), "a report while a draft is open is refused"],
    [["dq_group", "ui_report_alert", "ui_propose_options", "decision", "ui_draft_action", "ui_final_report"].every((g) => (c.guards || []).includes(g)), `Guardrail lines for each (got ${JSON.stringify(c.guards)})`],
    [(c.guards || []).length === 8, `eight Guardrail lines (got ${(c.guards || []).length})`],
    [/· 8 guardrail refusals ·/.test(c.facts || ""), `the run facts count the eight (got ${c.facts})`],
    [/Approved, re-scan pending/.test(c.approvedC || ""), "the approved path reads approved, re-scan pending"],
    [JSON.stringify(c.drafts) === '["change_request"]', `only the allowed draft reached the outbox (got ${JSON.stringify(c.drafts)})`],
    [c.end === "done", `the run still ends well (got ${c.end})`]
  ],
  review: (c) => [
    [c.classifyAccepted === 32, `the valid suggestions are recorded (got ${c.classifyAccepted})`],
    [(c.classifyRefused || []).some((r) => /unknown material group "XX-NOPE"/.test(r)) && (c.classifyRefused || []).some((r) => /not in the short text/.test(r)), `an unknown code and words not in the text are refused (got ${JSON.stringify(c.classifyRefused)})`],
    [c.sugBefore === 4, `unreviewed suggestions do not count (with a suggestion before the review: ${c.sugBefore})`],
    [/spot:done check:yours calculate:todo/.test(c.railYours || ""), `Your confirmation on Check, the furthest step reached (got ${c.railYours})`],
    [c.railTurn === "Your confirmation" && c.pill === "Awaiting your confirmation", `merlot step and status (got ${c.railTurn} / ${c.pill})`],
    [c.reviewRows === 32, `the dialog lists every suggestion (got ${c.reviewRows})`],
    [c.reviewResult?.approved?.length === 30 && c.reviewResult?.rejected?.length === 2, "the review's decisions reach the agent"],
    [c.caseS === 34, `approved suggestions count in the fix paths (s = 4 + 30, got ${c.caseS})`],
    [/spot:done check:done calculate:done propose:done prepare:done/.test(c.railAfter || ""), `the rail goes on and never back (got ${c.railAfter})`],
    [c.end === "done", `the run ends (got ${c.end})`]
  ],
  "caps: step limit": (c) => [
    [c.requests === 40, `exactly 40 model calls (got ${c.requests})`],
    [/Step limit reached \(40 model calls\)/.test(c.endLine || ""), `the console says why (got ${c.endLine})`]
  ],
  "caps: cost limit and meter": (c) => [
    [c.requests === 2, `no model call once €3 is spent (got ${c.requests})`],
    [/Cost cap reached/.test(c.endLine || ""), "the console says why"],
    [near(c.costEur, c.expected), `the cost meter equals usage × price (got ${c.costEur}, expected ${c.expected})`],
    [c.tile === `€${c.expected.toFixed(2)}`, `the session cost tile shows it (got ${c.tile})`]
  ],
  sweep: (c) => [
    [c.modeDialog === 0, "Live sweep asks for no mode"],
    [c.cells === 15, `every rule scanned (got ${c.cells})`],
    [/no material finding/.test(c.endLine || ""), "an honest end"],
    [c.title === "Live sweep", `the run is titled as the sweep (got ${c.title})`]
  ],
  custom: (c) => [
    [c.simBlocked === "true" && /need the live agent/.test(c.simWhy || ""), "Simulation is blocked for a custom what-if"],
    [/Lyon buyers say lab orders/.test(c.preview || ""), "the console previews the tip"],
    [/Lyon buyers say lab orders/.test(c.seed || ""), "the run shows the tip"],
    [c.end === "no_findings", `the run ends (got ${c.end})`]
  ],
  "recorder: live run, audit export, Save run as simulation": (c) => [
    [c.end === "done" && c.requests === c.turns, `the live run completes on its ${c.turns} turns (requests ${c.requests})`],
    [c.kpi === "69.7% projected after re-scan", `the same projection as the engine's (got ${c.kpi})`],
    [/model calls/.test(c.facts || "") && /€0\.\d\d/.test(c.facts || ""), `run facts with model calls and cost (got ${c.facts})`],
    [c.model === "claude-sonnet-5-5", `the export names the model (got ${c.model})`],
    [c.usage && c.usage.input_tokens === c.turns * TURN_USAGE.input_tokens && c.usage.output_tokens === c.turns * TURN_USAGE.output_tokens && c.usage.cache_read_input_tokens === c.turns * TURN_USAGE.cache_read_input_tokens, `the export sums the usage (got ${JSON.stringify(c.usage)})`],
    [near(c.costEur, c.expectedCost), `the export's cost equals usage × price (got ${c.costEur}, expected ${c.expectedCost})`],
    [c.versions, "the export carries app, rule-set, engine and world versions"],
    [c.decisionLogged, "the person's decision is in the audit log"],
    [/^sim-run-SC-PUNCHOUT-recorded-\d{8}\.js$/.test(c.recName || "") && c.recSource && c.recPassed && c.recKey === false, `the recording is a checked script without the key (${c.recName})`],
    [/passes the script check/.test(c.recStatus || ""), `the audit tab says so (got ${c.recStatus})`]
  ],
  "recorder: the recording replayed": (c) => [
    [/Replay of a live run recorded on .* \(Sonnet 5\.5\)/.test(c.tape || ""), `the tape names the recording (got ${c.tape})`],
    [c.end === "done" && c.report === 1, `the replay ends with its report (got ${c.end})`],
    [c.kpi === "69.7% projected after re-scan", `figures recomputed by the engine (got ${c.kpi})`],
    [c.models === 0, "no model call, no key"]
  ]
};

await writeFile(path.join(OUT, "live-results.json"), JSON.stringify(results, null, 2));
let passed = 0;
for (const r of results) {
  const problems = [
    ...(r.checks.FAILED ? [`exception: ${r.checks.FAILED}`] : []),
    ...(EXPECT[r.name]?.(r.checks) || [[false, "no expectations"]]).filter(([ok]) => !ok).map(([, msg]) => msg),
    ...r.violations.map((v) => `protocol: ${v}`),
    ...(r.remainingScript ? [`${r.remainingScript} scripted responses were never requested`] : []),
    ...r.pageErrors.map((e) => `page error: ${e}`),
    ...r.consoleErrors.map((e) => `console error: ${e}`),
    ...r.csp.map((e) => `CSP: ${e}`)
  ];
  if (!problems.length) passed += 1;
  console.log(`${problems.length ? "FAIL" : "PASS"}  ${r.name}`);
  for (const p of problems) console.log(`      - ${String(p).slice(0, 300)}`);
}
console.log(`\n${passed}/${results.length} live checks passed. Screenshots and downloads: ${OUT}`);
if (passed === results.length && results.length) console.log(`LIVE OK: ${chosen.join(" ")}`);
process.exit(passed === results.length && results.length ? 0 : 1);
