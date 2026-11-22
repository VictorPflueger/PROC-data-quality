// Run it live, through the presenter's page, against a scripted stand-in for the Anthropic Messages API
// (lib/fake-claude.mjs). The stand-in streams realistic SSE and checks every request against the
// protocol rules (assistant turns echoed unchanged with their signatures, every tool_use answered, the
// headers). No real API is called, and there is no key in the build.
//   run     Simulation never asks for a key. Live asks once in the dialog, checks it with the free model
//           list, keeps it in this tab's session storage only (never in local storage, the page, the
//           console or the audit log), runs the lead case's turns to the end with the presenter
//           deciding on screen, shows the engine's figures, and shows the measured cost (usage × price)
//           in Session cost. Forget key removes the key.
//   frame   inside another page's frame the dialog refuses to take a key
//   guards  a refused tool call (grouping before a scan) is answered as an error and the run still ends
//           with a report
//   unchecked  an alert that quotes a figure no tool returned is refused twice, then shows with an
//           Unchecked tag and a warning, never silently
//   caps    no 41st model call; no further call once €3 is spent, with the spend in Session cost
// Usage: node tests/live_ui.mjs [run frame guards unchecked caps]   prints "LIVE UI OK" when every case passes.
import path from "node:path";
import { readFile } from "node:fs/promises";
import { createFakeClaude } from "./lib/fake-claude.mjs";
import { scriptTurns, loadData, TURN_USAGE } from "./lib/turns.mjs";
import { APP_ROOT, outDir, ONLY, launchBrowser, serveStatic, CORS, MOCK_KEY, NETWORK_NOISE, NO_GUIDE, KEYS } from "./lib/harness.mjs";

const { MODELS, DEFAULT_MODEL, FX_USD_EUR, AGENT, UI } = await import(path.join(APP_ROOT, "js/config.js"));
const { euroCents, euro, int } = await import(path.join(APP_ROOT, "js/format.js"));
const { validate } = await import(path.join(APP_ROOT, "js/validate.js"));
const { EXPORT_SCHEMAS, ALL_DEFS } = await import(path.join(APP_ROOT, "js/schemas.js"));

const CASES = ["run", "frame", "guards", "unchecked", "caps"];
const chosen = ONLY.length ? CASES.filter((c) => ONLY.includes(c)) : CASES;
const OUT = await outDir("live_ui");
const server = await serveStatic(APP_ROOT, 9700 + Math.floor(Math.random() * 250));
const BASE = server.base;
const browser = await launchBrowser();
const DATA = await loadData();
const KEY = MOCK_KEY;
const PRICE = MODELS.find((m) => m.id === DEFAULT_MODEL).price;
const turnEur = (u) => ((u.input_tokens * PRICE.input + u.output_tokens * PRICE.output + u.cache_read_input_tokens * PRICE.cacheRead + u.cache_creation_input_tokens * PRICE.cacheWrite) / 1e6) * FX_USD_EUR;
const tu = (id, name, input, extra = {}) => ({ stop: "tool_use", usage: { ...TURN_USAGE }, ...extra, blocks: [...(extra.text ? [{ type: "text", text: extra.text }] : []), { type: "tool_use", id, name, input }] });
const endTurn = (text = "Done.") => ({ stop: "end_turn", usage: { ...TURN_USAGE }, blocks: [{ type: "text", text }] });
const results = [];

async function newPage(fake, { framed = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
  const log = { pageErrors: [], consoleErrors: [], consoleText: [], models: 0, modelsKey: null, keyElsewhere: [] };
  if (framed) {
    await context.route(`${BASE}test/frame.html`, (route) => route.fulfill({ status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body: `<!doctype html><title>frame</title><iframe src="${BASE}index.html${NO_GUIDE}" width="1800" height="1000" title="app"></iframe>` }));
  }
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const headers = req.headers();
    if (u.host !== "api.anthropic.com" && (JSON.stringify(headers).includes(KEY) || (req.postData() || "").includes(KEY))) log.keyElsewhere.push(u.host);
    if (u.host === "api.anthropic.com") {
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { ...CORS, "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST" } });
      if (u.pathname === "/v1/models") {
        log.models += 1;
        log.modelsKey = headers["x-api-key"];
        return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify({ data: MODELS.map((m) => ({ id: m.id })) }) });
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

async function open(page, query = "") {
  await page.goto(`${BASE}${query}${query.includes("?") ? "&" : "?"}guide=0`);
  await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
}
async function startLive(page) {
  await page.click("#btn-live");
  await page.waitForSelector("#live-dialog[open] #api-key-input", { timeout: 10000 });
  await page.fill("#api-key-input", KEY);
  await page.click("#btn-live-start");
  await page.waitForFunction(() => !document.querySelector("#live-dialog[open]"), null, { timeout: 15000 });
}
const status = (page) => page.evaluate(() => window.__dq?.state?.run?.status || "none");
const kpi = (page, id) => page.$eval(`#kpi-${id}`, (e) => {
  const was = e.querySelector(".kpi-was");
  return { was: was && !was.hidden ? was.textContent.trim() : "", value: e.querySelector(".kpi-value").textContent.trim(), unit: e.querySelector(".kpi-unit").textContent.trim(), note: e.querySelector(".kpi-note").textContent.trim() };
});

/** Takes the presenter's part until the run ends: the recommended path, every draft approved. */
async function drive(page, { timeout = 90000 } = {}) {
  const t0 = Date.now();
  // The run begins once the dialog has closed; until then the page is idle.
  await page.waitForFunction(() => window.__dq?.state?.run?.mode === "live" && window.__dq.state.run.status !== "idle", null, { timeout: 15000 });
  for (;;) {
    const s = await status(page);
    if (s !== "running" && s !== "none") {
      // The page draws on the next animation frame: let it draw the run's end.
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      return s;
    }
    if (Date.now() - t0 > timeout) throw new Error("the run did not end in time");
    const rec = page.locator('.opt[data-recommended="true"] [data-action="approve"]:not([disabled])');
    if (await rec.count()) { await rec.click(); await page.waitForTimeout(150); continue; }
    const draft = page.locator('.draft[data-status="pending"] [data-action="approve"]');
    if (await draft.count()) { await draft.first().click(); await page.waitForTimeout(150); continue; }
    await page.waitForTimeout(150);
  }
}

async function download(page, click) {
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), click()]);
  const file = path.join(OUT, dl.suggestedFilename());
  await dl.saveAs(file);
  return { name: dl.suggestedFilename(), text: await readFile(file, "utf8") };
}

const ok = (c, k, cond, detail = "") => { c[k] = cond ? true : `FAIL${detail !== "" ? `: ${detail}` : ""}`; };
async function finish(name, t, fake, c, { remaining = 0 } = {}) {
  if (fake) {
    ok(c, "every request kept the protocol", !fake.violations.length, fake.violations.slice(0, 3).join(" | "));
    ok(c, "the stand-in's script was used as planned", fake.remaining() === remaining, `${fake.remaining()} turns left, ${remaining} expected`);
  }
  ok(c, "no page errors", !t.log.pageErrors.length && !t.log.consoleErrors.length, [...t.log.pageErrors, ...t.log.consoleErrors].join(" | "));
  results.push({ name, checks: c });
  await t.context.close();
}

// ---- run ---------------------------------------------------------------------------------------------
if (chosen.includes("run")) {
  const LEAD = UI.defaultScenario;
  const built = await scriptTurns(DATA, DATA.SIM_RUNS[LEAD]);
  const rec = built.options.options.find((o) => o.id === built.options.recommended);
  const fake = createFakeClaude(built.turns);
  const t = await newPage(fake);
  const c = {};
  try {
    const { page, log } = t;
    // Simulation first: no key dialog, no key check.
    await open(page);
    await page.click("#btn-start");
    await page.waitForSelector('.stepbar .vc-step__button[data-step="4"]:not([disabled])', { timeout: 10000 });
    ok(c, "Simulation asks for no key and calls nothing", (await page.locator("#live-dialog[open]").count()) === 0 && log.models === 0 && fake.requests.length === 0);
    await page.click('.stepbar .vc-step__button[data-step="0"]');
    // Live: the dialog asks for the key once and checks it with the free model list.
    await startLive(page);
    ok(c, "the key is checked once with the model list", log.models === 1 && log.modelsKey === KEY, `${log.models} checks`);
    // The run starts once the dialog has closed and the page draws on the next frame.
    const live = await page.waitForFunction(() => document.getElementById("mode-tag")?.textContent.trim() === "LIVE" && !document.getElementById("mode-tag").hidden, null, { timeout: 5000 }).then(() => true, () => false);
    ok(c, "a live run shows LIVE", live, await page.locator("#mode-tag").textContent());
    ok(c, "a live run shows the AI notice by the step bar and offers no Play", await page.evaluate(() => !document.getElementById("live-notice").hidden && /You are interacting with an AI system/.test(document.getElementById("live-notice").textContent) && document.getElementById("btn-play").hidden));
    const end = await drive(page);
    ok(c, "the live run ends well", end === "done", end);
    ok(c, "every scripted turn was requested, no more", fake.requests.length === built.turns.length, `${fake.requests.length} of ${built.turns.length}`);
    ok(c, "the page followed the agent to the report", (await page.$eval('.stepbar .vc-step__button[aria-current="step"]', (b) => b.dataset.step)) === "5" && (await page.locator("#step-title").textContent()).trim() === "Done. Nothing was sent.");
    const fixed = await kpi(page, "fixed");
    const cost = await kpi(page, "cost");
    // At stake a year: the engine's yearly cost if nothing changes, struck through for what the approved path leaves.
    const stake = Number(built.options.nothing?.figures?.gains_cost_eur_per_year) || 0;
    const left = stake - Math.min(stake, Number(rec.figures.future_avoided_eur_per_year) || 0);
    ok(c, "Records fixed and At stake a year show the engine's figures", fixed.value === int(rec.figures.closed) && stake > 0 && cost.was === euro(stake) && cost.value === euro(left), `${fixed.value} ${cost.was} → ${cost.value} (engine: ${euro(stake)} → ${euro(left)})`);
    const session = await kpi(page, "session");
    const expected = built.turns.length * turnEur(TURN_USAGE);
    ok(c, "Session cost shows the measured cost, usage × price", session.value === euroCents(expected) && /measured/.test(session.note), `${session.value} (${session.note}) vs ${euroCents(expected)}`);
    // The key: this tab's session storage only.
    ok(c, "the key sits in this tab's session storage", (await page.evaluate((k) => sessionStorage.getItem(k), KEYS.apiKey)) === KEY);
    ok(c, "the key is not in local storage", !(await page.evaluate((k) => Object.keys(localStorage).some((x) => (localStorage.getItem(x) || "").includes(k.slice(0, 20))), KEY)));
    ok(c, "the key is not on the page", !(await page.evaluate((k) => document.documentElement.outerHTML.includes(k) || document.body.innerText.includes(k), KEY)));
    ok(c, "the key is not in the console", !log.consoleText.some((x) => x.includes(KEY)));
    ok(c, "the key went to api.anthropic.com only", !log.keyElsewhere.length, log.keyElsewhere.join());
    ok(c, "every model call carried the key", fake.requests.every((r) => r.headers["x-api-key"] === KEY));
    const audit = await download(page, () => page.click("#btn-audit"));
    const doc = JSON.parse(audit.text);
    ok(c, "the audit log records the live run with its cost", doc.mode === "live" && Math.abs(Number(doc.cost?.eur) - expected) < 1e-9 && doc.events.some((e) => e.type === "option_decision" && e.payload.option_id === rec.id && e.payload.decision === "approved" && e.payload.by === "user"), `${doc.mode} ${doc.cost?.eur}`);
    ok(c, "the key is not in the audit log", !audit.text.includes(KEY));
    const v = validate(doc, EXPORT_SCHEMAS.AuditExport, { defs: ALL_DEFS, maxErrors: 5 });
    ok(c, "the audit log is valid against its schema, named for a live run", v.ok !== false && !(v.errors || []).length && /^data-quality-.+-LIVE-audit\.json$/.test(audit.name), `${audit.name} ${JSON.stringify(v.errors || v).slice(0, 200)}`);
    await page.screenshot({ path: path.join(OUT, "live-run-done.png") });
    // Forget key, from the dialog.
    await page.click('.stepbar .vc-step__button[data-step="0"]');
    await page.click("#btn-live");
    await page.waitForSelector("#btn-forget-key:not([hidden])", { timeout: 5000 });
    await page.click("#btn-forget-key");
    ok(c, "Forget key removes it", (await page.evaluate((k) => sessionStorage.getItem(k), KEYS.apiKey)) === null);
    await page.keyboard.press("Escape");
  } catch (e) { c.FAILED = String(e.message || e).split("\n")[0]; }
  await finish("run", t, fake, c);
}

// ---- frame -------------------------------------------------------------------------------------------
if (chosen.includes("frame")) {
  const t = await newPage(null, { framed: true });
  const c = {};
  try {
    await t.page.goto(`${BASE}test/frame.html`);
    const frame = t.page.frameLocator("iframe");
    await frame.locator('html[data-boot="ready"]').waitFor({ timeout: 20000 });
    await frame.locator("#btn-live").click();
    await frame.locator("#live-dialog[open]").waitFor({ timeout: 10000 });
    ok(c, "in a frame the key field is disabled", await frame.locator("#api-key-input").isDisabled());
    ok(c, "and so is Start", await frame.locator("#btn-live-start").isDisabled());
    ok(c, "and the dialog says why", /another page/.test(await frame.locator("#live-msg").textContent()));
    ok(c, "no key check was made", t.log.models === 0);
  } catch (e) { c.FAILED = String(e.message || e).split("\n")[0]; }
  await finish("frame", t, null, c);
}

// ---- guards ------------------------------------------------------------------------------------------
if (chosen.includes("guards")) {
  const fake = createFakeClaude([
    tu("toolu_g1", "dq_group", { rules: ["DQ-06"], by: ["supplier"] }, { text: "I group the payment-term exceptions by supplier." }),
    tu("toolu_g2", "dq_scan", { rules: ["DQ-06", "DQ-07"] }, { text: "The rules have to find the exceptions first." }),
    tu("toolu_g3", "ui_final_report", { outcome: "nothing_found", markdown: "## Short run\n\nThis run stops after the scan." }),
    endTurn()
  ]);
  const t = await newPage(fake);
  const c = {};
  try {
    await open(t.page);
    await startLive(t.page);
    const end = await drive(t.page, { timeout: 60000 });
    const answers = fake.requests.map(({ req }) => req.messages[req.messages.length - 1]).filter((m) => Array.isArray(m?.content)).flatMap((m) => m.content.filter((b) => b.type === "tool_result"));
    const first = answers.find((b) => b.tool_use_id === "toolu_g1");
    ok(c, "grouping before a scan is refused as an error", first?.is_error === true && /scan/i.test(String(first.content)), String(first?.content).slice(0, 120));
    ok(c, "the scan after it runs", answers.some((b) => b.tool_use_id === "toolu_g2" && !b.is_error));
    ok(c, "the run still ends with a report", end === "done" && (await t.page.locator(".report").count()) === 1, end);
  } catch (e) { c.FAILED = String(e.message || e).split("\n")[0]; }
  await finish("guards", t, fake, c);
}

// ---- unchecked ---------------------------------------------------------------------------------------
if (chosen.includes("unchecked")) {
  const built = await scriptTurns(DATA, DATA.SIM_RUNS[UI.defaultScenario]);
  const turns = JSON.parse(JSON.stringify(built.turns));
  const k = turns.findIndex((t) => t.blocks.some((b) => b.type === "tool_use" && b.name === "ui_report_alert"));
  const use = turns[k].blocks.find((b) => b.type === "tool_use" && b.name === "ui_report_alert");
  const BOGUS = "€987,654";
  use.input.summary = `${use.input.summary} It adds ${BOGUS} a year.`;
  const copy = (n) => ({ stop: "tool_use", usage: { ...TURN_USAGE }, blocks: [{ type: "tool_use", id: `toolu_x${n}`, name: "ui_report_alert", input: JSON.parse(JSON.stringify(use.input)) }] });
  turns.splice(k, 0, copy(1), copy(2));
  const fake = createFakeClaude(turns);
  const t = await newPage(fake);
  const c = {};
  try {
    await open(t.page);
    await startLive(t.page);
    const end = await drive(t.page);
    const answers = fake.requests.map(({ req }) => req.messages[req.messages.length - 1]).filter((m) => Array.isArray(m?.content)).flatMap((m) => m.content.filter((b) => b.type === "tool_result"));
    const refused = ["toolu_x1", "toolu_x2"].map((id) => answers.find((b) => b.tool_use_id === id));
    ok(c, "the alert with a figure no tool returned is refused twice", refused.every((b) => b?.is_error === true && String(b.content).includes("987,654")), refused.map((b) => String(b?.content).slice(0, 80)).join(" | "));
    await t.page.click('.stepbar .vc-step__button[data-step="2"]');
    const tag = t.page.locator(".case-card .unchecked-tag");
    ok(c, "the third time the case shows with an Unchecked tag naming the figure", (await tag.count()) === 1 && (await tag.getAttribute("title")).includes("987,654"));
    ok(c, "the run still ends", end === "done", end);
  } catch (e) { c.FAILED = String(e.message || e).split("\n")[0]; }
  await finish("unchecked", t, fake, c);
}

// ---- caps --------------------------------------------------------------------------------------------
if (chosen.includes("caps")) {
  // 41 turns that never finish: the 41st is never requested.
  const many = Array.from({ length: AGENT.maxSteps + 1 }, (_, i) => tu(`toolu_c${i}`, "erp_get_overview", {}, { text: "I look again." }));
  const fake = createFakeClaude(many);
  const t = await newPage(fake);
  const c = {};
  try {
    await open(t.page);
    await startLive(t.page);
    const end = await drive(t.page, { timeout: 120000 });
    ok(c, `no call after the ${AGENT.maxSteps}th`, fake.requests.length === AGENT.maxSteps, `${fake.requests.length} calls`);
    ok(c, "the run stops and says why", end !== "done" && /Step limit reached/.test(await t.page.locator("#banners").innerText()), end);
  } catch (e) { c.FAILED = String(e.message || e).split("\n")[0]; }
  await finish("caps: step limit", t, fake, c, { remaining: 1 });

  // A turn that costs about €1.79: after the second, the run has spent more than €3 and calls no more.
  const big = { input_tokens: 4000, output_tokens: 200000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  const fake2 = createFakeClaude([0, 1, 2].map((i) => ({ ...tu(`toolu_b${i}`, "erp_get_overview", {}, { text: "Looking." }), usage: { ...big } })));
  const t2 = await newPage(fake2);
  const c2 = {};
  try {
    await open(t2.page);
    await startLive(t2.page);
    const end = await drive(t2.page, { timeout: 60000 });
    const spent = 2 * turnEur(big);
    ok(c2, `no call once €${AGENT.budgetEur} is spent`, fake2.requests.length === 2 && spent > AGENT.budgetEur, `${fake2.requests.length} calls`);
    ok(c2, "the run stops", end !== "done", end);
    const session = await kpi(t2.page, "session");
    ok(c2, "Session cost shows what was spent", session.value === euroCents(spent), `${session.value} vs ${euroCents(spent)}`);
  } catch (e) { c2.FAILED = String(e.message || e).split("\n")[0]; }
  await finish("caps: cost limit", t2, fake2, c2, { remaining: 1 });
}

await browser.close();
await server.close();
let failed = 0;
const isFail = ([k, v]) => k === "FAILED" || (typeof v === "string" && v.startsWith("FAIL"));
for (const r of results) {
  const fails = Object.entries(r.checks).filter(isFail);
  console.log(`${fails.length ? "FAIL" : "PASS"}  ${r.name}`);
  for (const [k, v] of Object.entries(r.checks)) console.log(`        ${v === true ? "ok  " : isFail([k, v]) ? "FAIL" : "info"}  ${k}${v === true ? "" : `: ${v}`}`);
  if (fails.length) failed += 1;
}
console.log(`Screenshots and downloads: ${OUT}`);
if (failed || !results.length) process.exit(1);
console.log(chosen.length === CASES.length ? "LIVE UI OK" : `LIVE UI ${chosen.map((x) => x.toUpperCase()).join(" ")} OK`);
