// Smoke test in Chromium (Playwright): the idle page in the two themes at 1920 × 1080 and 1280 × 720.
// It boots without a page error, a console error, a security-policy violation or a request to another
// site, without horizontal scrolling; its header tiles and weekly cohorts show the engine's figures for
// the exception log; the fifteen rules are on the board, neutral before a scan; Start agent is ready
// and Live sweep and Custom what-if are offered; How it works opens by itself once; Diagnostics' own
// checks pass; choosing a scenario shows its tip; Reset keeps the figures; every storage key starts
// with "dq." (or is Vici's "vc-theme"); a missing data file is reported on the boot screen. Runs are
// the other suites' (sims, live, accept). Screenshots go to DQ_TEST_OUT.
// Usage: node tests/smoke.mjs                 (all cases)
//        node tests/smoke.mjs boot diagnostics (only these cases)
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { APP_ROOT, ONLY, wanted, launchBrowser, serveStatic, outDir, NETWORK_NOISE, SKIP_INTRO } from "./lib/harness.mjs";
import { logState } from "../js/history.js";
import { pct1, int, euro } from "../js/format.js";
import { RULES } from "../js/rules.js";

const CASES = ["boot", "intro", "diagnostics", "scenario", "storage", "reset", "missing-data"];
const unknown = ONLY.filter((c) => !CASES.includes(c));
if (unknown.length) { console.error(`Unknown case(s): ${unknown.join(", ")}; known: ${CASES.join(" ")}`); process.exit(1); }

const load = (f) => { const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(APP_ROOT, f), "utf8"), ctx); return ctx.window; };
const { WORLD } = load("data/world.js");
const { SCENARIOS } = load("data/scenarios.js");
const expected = logState(WORLD, { day: 0 });
const shots = await outDir("smoke");
const failures = [];
const passes = [];
const check = (ok, what) => { (ok ? passes : failures).push(what); return ok; };

const browser = await launchBrowser();
const server = await serveStatic(APP_ROOT, 8800 + Math.floor(Math.random() * 400));

/** A fresh context and page with every guard installed. */
async function open({ width = 1920, height = 1080, theme = "light", intro = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height } });
  const outside = [];
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => { outside.push(route.request().url()); return route.abort("blockedbyclient"); });
  await context.addInitScript((t) => {
    try { localStorage.setItem("vc-theme", t); } catch { /* blocked storage */ }
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  }, theme);
  if (!intro) await context.addInitScript(SKIP_INTRO);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`page error: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !NETWORK_NOISE.test(m.text())) errors.push(`console: ${m.text()}`); });
  return { context, page, errors, outside };
}
async function ready(page) {
  await page.goto(server.base);
  await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
  await page.waitForTimeout(300);
}
async function guards(label, { page, errors, outside }) {
  const csp = await page.evaluate(() => window.__csp || []);
  check(!errors.length, `${label}: no page or console error${errors.length ? `: ${errors.slice(0, 3).join("; ")}` : ""}`);
  check(!csp.length, `${label}: no security-policy violation${csp.length ? `: ${csp.slice(0, 3).join("; ")}` : ""}`);
  check(!outside.length, `${label}: no request to another site${outside.length ? `: ${outside.slice(0, 3).join(", ")}` : ""}`);
}
const text = (page, sel) => page.$eval(sel, (el) => el.textContent.trim());

try {
  // ---- boot, in both themes at both sizes ---------------------------------------------------------
  if (wanted("boot")) {
    for (const [width, height] of [[1920, 1080], [1280, 720]]) {
      for (const theme of ["light", "dark"]) {
        const label = `boot ${width}x${height} ${theme}`;
        const s = await open({ width, height, theme });
        await ready(s.page);
        check(await s.page.evaluate(() => document.documentElement.dataset.theme) === theme, `${label}: the ${theme} theme`);
        const overflow = await s.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        check(overflow <= 0, `${label}: no horizontal scrolling (${overflow} px)`);
        // The tiles show the engine's figures for the exception log.
        const tiles = {
          closure: [pct1(expected.closure_rate.value), `${int(expected.closure_rate.closed)} of ${int(expected.closure_rate.eligible)} closed`],
          clean: [pct1(expected.clean_share), `${euro(expected.clean_spend_eur)} of ${euro(expected.spend_window_eur)}`],
          open: [int(expected.open), `${euro(expected.open_spend_eur)} affected`]
        };
        for (const [id, [value, sub]] of Object.entries(tiles)) {
          const got = [await text(s.page, `#kpi-${id}-value`), await text(s.page, `#kpi-${id}-sub`)];
          check(got[0] === value && got[1] === sub, `${label}: tile ${id} shows ${value} / ${sub} (shows ${got.join(" / ")})`);
        }
        const costTile = await text(s.page, "#kpi-cost-value");
        check(costTile === "€0.00", `${label}: the session cost is €0.00 (${costTile})`);
        // The weekly cohorts' table holds the engine's numbers.
        const rows = await s.page.$$eval("#cohort-table tbody tr", (trs) => trs.map((tr) => [...tr.querySelectorAll("td")].map((td) => td.textContent.trim())));
        const want = expected.cohorts.map((w) => [int(w.detected), int(w.closed), int(w.open), int(w.dismissed), w.share === null ? "—" : pct1(w.share)]);
        check(JSON.stringify(rows.map((r) => r.slice(1))) === JSON.stringify(want), `${label}: the eight weekly cohorts equal the engine's`);
        check(await text(s.page, "#cohort-rate") === pct1(expected.closure_rate.value), `${label}: the cohorts' total is the closure rate`);
        // The fifteen rules, by data product, neutral before a scan.
        const rules = await s.page.$$eval(".hex-cell", (els) => els.map((el) => [el.dataset.rule, el.dataset.state]));
        check(JSON.stringify(rules.map((r) => r[0]).sort()) === JSON.stringify(RULES.map((r) => r.id).sort()) && rules.every((r) => r[1] === "neutral"), `${label}: the fifteen rules, all neutral`);
        // The run controls: Start agent and Live sweep ready before a run.
        const start = await s.page.$eval("#btn-start", (b) => b.getAttribute("aria-disabled"));
        const sweep = await s.page.$eval("#btn-scan", (b) => b.getAttribute("aria-disabled"));
        check(start !== "true" && sweep !== "true", `${label}: Start agent and Live sweep are ready (${start} / ${sweep})`);
        // The header's honesty: the AI disclosure and the fiction note.
        const header = await text(s.page, ".app-header");
        check(/AI system/.test(header) && /Fictional company/.test(header), `${label}: the header says AI system and Fictional company`);
        await s.page.screenshot({ path: path.join(shots, `${width}x${height}-${theme}.png`) });
        await guards(label, s);
        await s.context.close();
      }
    }
  }

  // ---- intro: once by itself, then from the header ------------------------------------------------
  if (wanted("intro")) {
    const s = await open({ intro: true });
    await ready(s.page);
    await s.page.waitForSelector(".intro-modal", { timeout: 5000 });
    const intro = await text(s.page, ".intro-modal");
    check(/Spot[\s\S]*Check[\s\S]*Calculate[\s\S]*Propose[\s\S]*Prepare/.test(intro), "intro: the five steps");
    check(/SAP S\/4HANA or Ariba[\s\S]*Microsoft Fabric[\s\S]*Azure OpenAI and Copilot Studio[\s\S]*Power BI[\s\S]*Power Automate and Teams[\s\S]*SAP/.test(intro), "intro: the production path in order");
    check(/fictional: no client data/.test(intro), "intro: fictional, no client data");
    await s.page.screenshot({ path: path.join(shots, "intro.png") });
    await s.page.keyboard.press("Escape");
    await s.page.waitForSelector(".intro-modal", { state: "detached", timeout: 5000 });
    check(await s.page.evaluate(() => localStorage.getItem("dq.introSeen")) === "1", "intro: remembered as seen under dq.introSeen");
    await s.page.reload();
    await s.page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
    await s.page.waitForTimeout(500);
    check(!(await s.page.$(".intro-modal")), "intro: does not open by itself a second time");
    await s.page.click("#btn-about");
    await s.page.waitForSelector(".intro-modal", { timeout: 5000 });
    check(true, "intro: opens from How it works");
    await s.page.keyboard.press("Escape");
    await guards("intro", s);
    await s.context.close();
  }

  // ---- diagnostics: the local checks pass -----------------------------------------------------------
  if (wanted("diagnostics")) {
    const s = await open();
    await ready(s.page);
    await s.page.click("#btn-diagnostics");
    for (const id of ["policy", "privacy", "world"]) {
      await s.page.waitForSelector(`.diag-table tr[data-test="${id}"] .diag-status[data-s="pass"], .diag-table tr[data-test="${id}"] .diag-status[data-s="fail"]`, { timeout: 15000 });
      const st = await s.page.$eval(`.diag-table tr[data-test="${id}"] .diag-status`, (el) => el.dataset.s);
      const detail = await text(s.page, `.diag-table tr[data-test="${id}"] .detail`);
      check(st === "pass", `diagnostics: ${id} passes (${detail})`);
    }
    const worldChecks = await s.page.$$eval(".world-checks li", (lis) => lis.map((li) => li.dataset.ok));
    check(worldChecks.length >= 15 && worldChecks.every((x) => x === "true"), `diagnostics: all ${worldChecks.length} world checks pass in the browser`);
    const params = await s.page.$$eval(".params-table tr", (trs) => trs.length);
    check(params === 12, `diagnostics: the twelve parameters, read-only (${params})`);
    const fx = await text(s.page, "#diag-fx");
    check(fx.includes(String(WORLD.meta.fx_to_eur.GBP)) && /ECB/.test(fx), `diagnostics: the exchange rate with its source (${fx.slice(0, 80)}…)`);
    await s.page.screenshot({ path: path.join(shots, "diagnostics.png") });
    await s.page.keyboard.press("Escape");
    await s.page.waitForSelector(".diag-table", { state: "detached", timeout: 5000 });
    await guards("diagnostics", s);
    await s.context.close();
  }

  // ---- scenario: the menu by keyboard, the tip in the console ---------------------------------------------
  if (wanted("scenario")) {
    const s = await open();
    await ready(s.page);
    check((await text(s.page, ".tip-text")).includes(SCENARIOS[0].tip), "scenario: the default scenario's tip is shown");
    await s.page.focus("#dd-scenario");
    await s.page.keyboard.press("ArrowDown");
    await s.page.waitForSelector(".dropdown-menu:not([hidden])", { timeout: 5000 });
    const items = await s.page.$$eval(".dropdown-menu .vc-menu__item", (els) => els.map((el) => el.dataset.id));
    check(SCENARIOS.every((x) => items.includes(x.id)) && items.includes("custom"), `scenario: the menu lists the six scenarios and Custom what-if (${items.length})`);
    await s.page.click(`.dropdown-menu .vc-menu__item[data-id="${SCENARIOS[2].id}"]`);
    await s.page.waitForTimeout(200);
    check((await text(s.page, ".tip-text")).includes(SCENARIOS[2].tip), "scenario: choosing scenario 3 shows its tip");
    check((await text(s.page, "#dd-scenario")).includes(SCENARIOS[2].title), "scenario: the menu shows the choice");
    const custom = await s.page.$eval('.dropdown-menu .vc-menu__item[data-id="custom"]', (el) => el.getAttribute("aria-disabled"));
    check(custom !== "true", "scenario: Custom what-if is offered before a run");
    await guards("scenario", s);
    await s.context.close();
  }

  // ---- storage: every key under dq. or Vici's vc-theme ----------------------------------------------
  if (wanted("storage")) {
    const s = await open({ intro: true });
    await ready(s.page);
    await s.page.keyboard.press("Escape");
    await s.page.click(".theme-toggle");
    await s.page.click("#console .text-size");
    await s.page.click("#dd-model");
    await s.page.click('.dropdown-menu .vc-menu__item[data-id="claude-haiku-5-5"]');
    await s.page.click('button[aria-label="Replay speed ×4"]');
    await s.page.waitForTimeout(200);
    const keys = await s.page.evaluate(() => {
      const all = (st) => { const out = []; for (let i = 0; i < st.length; i++) out.push(st.key(i)); return out; };
      return { local: all(localStorage), session: all(sessionStorage) };
    });
    const stray = [...keys.local, ...keys.session].filter((k) => !k.startsWith("dq.") && k !== "vc-theme");
    check(!stray.length && keys.local.includes("vc-theme") && keys.local.includes("dq.introSeen") && keys.local.includes("dq.consoleText") && keys.session.includes("dq.model") && keys.session.includes("dq.speed"),
      `storage: local ${keys.local.join(", ")}; session ${keys.session.join(", ")}${stray.length ? `; outside dq.: ${stray.join(", ")}` : ""}`);
    check(await s.page.evaluate(() => document.documentElement.dataset.theme) === "dark", "storage: the theme toggle switched to dark");
    await guards("storage", s);
    await s.context.close();
  }

  // ---- reset ---------------------------------------------------------------------------------------
  if (wanted("reset")) {
    const s = await open();
    await ready(s.page);
    await s.page.click("#tab-outbox");
    await s.page.click("#btn-reset");
    await s.page.waitForTimeout(300);
    check(await s.page.$eval("#drawer", (d) => d.dataset.open) === "false", "reset: the drawer closes");
    check(await text(s.page, "#kpi-open-value") === int(expected.open), "reset: the tiles keep the engine's figures");
    await guards("reset", s);
    await s.context.close();
  }

  // ---- a missing data file is reported on the boot screen -------------------------------------------
  if (wanted("missing-data")) {
    const s = await open();
    server.blockLocal.add("/data/world.js");
    await s.page.goto(server.base);
    await s.page.waitForSelector('#boot[data-state="failed"]', { timeout: 15000 });
    const detail = await text(s.page, "#boot-detail");
    check(/data\/world\.js/.test(detail), `missing-data: the boot screen names the missing file (${detail.slice(0, 90)})`);
    server.blockLocal.clear();
    await s.context.close();
  }
} finally {
  await browser.close();
  await server.close();
}

for (const p of passes) console.log(`PASS  ${p}`);
for (const f of failures) console.log(`FAIL  ${f}`);
console.log(`${passes.length}/${passes.length + failures.length} smoke checks passed; screenshots in ${shots}.`);
if (failures.length) process.exit(1);
console.log("SMOKE OK");
