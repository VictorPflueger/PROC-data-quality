// The presenter's page in a browser, against the engine's own figures (worked out in Node through the
// same tools and scripts, tests/lib/expected.mjs), so no expected number is typed here.
//   steps    the tip and the five steps by click, the arrow keys, Back and Next and ?step=; each step
//            shows at once after Start (under 1.5 s); ?step=4 waits for the decision; ?step=5 for the
//            drafts; ?case= opens another case
//   kpis     four key figures in the header, top right, sensible before anything happens; after the
//            decision they show the engine's figures, the clock stops, and Session cost equals the
//            estimate of the same run in Node
//   cases    each of the six cases runs along its recommended path to "Done. Nothing was sent.", with
//            the engine's figures in Records fixed and Cost avoided
//   paths    a rejection then another path; the accepted risk with its reason; every path rejected;
//            the review of AI-suggested values (Confirm waits for every line)
//   lean     at most 12 controls to click on the first screen; no tool names, user ids, em dashes,
//            "undefined" or "NaN" on any step (the checker first catches planted ones)
//   layout   every step of the default case at 1920 × 1080 and 1280 × 720, light and dark: no page
//            scrolling, the step's main action in view and not covered, the key figures' text uncut,
//            and at 1920 × 1080 no panel that needs scrolling
// Usage: node tests/presenter.mjs [steps kpis cases paths lean layout]
import path from "node:path";
import { APP_ROOT, launchBrowser, serveStatic, outDir, NETWORK_NOISE, ONLY } from "./lib/harness.mjs";
import { expectedRun, approvedFigures } from "./lib/expected.mjs";
import { loadData } from "./lib/turns.mjs";

const CASES = ["steps", "kpis", "cases", "paths", "lean", "layout"];
const chosen = ONLY.length ? CASES.filter((c) => ONLY.includes(c)) : CASES;
const OUT = await outDir("presenter");
const data = await loadData();
const { euro, euroCents, int } = await import(path.join(APP_ROOT, "js/format.js"));
const { plainText } = await import(path.join(APP_ROOT, "js/plain.js"));
const { scanFacts } = await import(path.join(APP_ROOT, "js/facts.js"));
const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen"];
const LEAD = /defaultScenario:\s*"([^"]+)"/.exec(await (await import("node:fs/promises")).readFile(path.join(APP_ROOT, "js/config.js"), "utf8"))[1];
const slug = (id) => id.replace(/^SC-/, "").toLowerCase();

const server = await serveStatic(APP_ROOT, 9300 + Math.floor(Math.random() * 400));
const browser = await launchBrowser();
const results = [];
let caseErrors = [];   // page errors, policy violations and requests to other sites in the running case

async function newPage({ width = 1920, height = 1080, theme = "light", reducedMotion = "no-preference" } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort("blockedbyclient"));
  await context.addInitScript((t) => {
    try { localStorage.setItem("vc-theme", t); } catch { /* blocked */ }
    document.addEventListener("securitypolicyviolation", (e) => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`));
  }, theme);
  const page = await context.newPage();
  const errors = caseErrors;
  page.on("pageerror", (e) => errors.push(String(e.message || e)));
  page.on("console", (m) => { if (m.type() === "error" && !NETWORK_NOISE.test(m.text())) errors.push(m.text()); });
  page.on("request", (r) => { const u = r.url(); if (!u.startsWith(server.base) && !/^(data|blob):/.test(u)) errors.push(`request to another site: ${u}`); });
  return { context, page, errors };
}
const open = async (page, query = "") => {
  await page.goto(`${server.base}${query.includes("guide=") ? query : `${query}${query.includes("?") ? "&" : "?"}guide=0`}`);
  await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
  // The loading screen fades out and then leaves the page: wait until it has gone.
  await page.waitForFunction(() => !document.getElementById("boot"), null, { timeout: 5000 });
};
const title = (page) => page.locator("#step-title").textContent().then((t) => t.trim());
const stepOn = (page) => page.$eval('.stepbar .vc-step__button[aria-current="step"]', (b) => Number(b.dataset.step));
const kpi = (page, id) => page.$eval(`#kpi-${id}`, (e) => ({ value: e.querySelector(".kpi-value").textContent.trim(), unit: e.querySelector(".kpi-unit").textContent.trim(), note: e.querySelector(".kpi-note").textContent.trim(), state: e.dataset.state }));
async function approveDrafts(page) {
  for (let i = 0; i < 12; i += 1) {
    if (await page.locator(".report").count()) return;
    const pending = page.locator('.draft[data-status="pending"] [data-action="approve"]');
    if (await pending.count()) await pending.first().click();
    await page.waitForTimeout(120);
  }
  await page.waitForSelector(".report", { timeout: 15000 });
}
async function goStep(page, n) {
  await page.click(`.stepbar .vc-step__button[data-step="${n}"]`);
  await page.waitForFunction((k) => document.querySelector('.stepbar .vc-step__button[aria-current="step"]')?.dataset.step === String(k), n, { timeout: 10000 });
}
async function confirmReviewIfAny(page) {
  await goStep(page, 2);
  if (await page.locator(".review-table").count()) {
    await page.click("#btn-review-all");
    await page.click("#btn-review-confirm");
    await page.waitForSelector(".case-card", { timeout: 15000 });
  }
}

async function runCase(name, fn) {
  if (!chosen.includes(name)) return;
  const checks = {};
  const t0 = Date.now();
  caseErrors = [];
  try { await fn(checks); } catch (e) { checks.FAILED = String(e.message || e).split("\n")[0]; }
  const seen = [...new Set(caseErrors)];
  checks["no page error, policy violation or request to another site"] = seen.length ? `FAIL: ${seen.slice(0, 5).join(" | ")}` : true;
  results.push({ name, checks, seconds: Math.round((Date.now() - t0) / 1000) });
}
const ok = (c, k, cond, detail = "") => { c[k] = cond ? true : `FAIL${detail ? `: ${detail}` : ""}`; };

// ---- steps --------------------------------------------------------------------------------------------
await runCase("steps", async (c) => {
  const exp = await expectedRun(LEAD);
  const { page, errors, context } = await newPage();
  await open(page);
  ok(c, "opens on the tip", (await stepOn(page)) === 0 && (await page.locator("#btn-start").count()) === 1);
  const t0 = Date.now();
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(() => /flag/.test(document.getElementById("step-title")?.textContent || ""), null, { timeout: 5000 });
  const ms = Date.now() - t0;
  ok(c, "Spot shows at once after the arrow key", ms < 1500 && (await stepOn(page)) === 1, `${ms} ms`);
  const t1 = await title(page);
  const sf = scanFacts(data.WORLD, exp.scan);
  const fired = [...sf.byRule.values()].filter((v) => v > 0).length;
  ok(c, "Spot names how many rules flag how many records, as the scan found", t1.startsWith(`${WORDS[fired]} ${fired === 1 ? "rule flags" : "rules flag"} ${int(sf.n)} `), t1);
  await page.keyboard.press("ArrowRight");
  ok(c, "Check shows the case", (await title(page)) === plainText(data.WORLD, exp.alert.title) && (await page.locator(".case-card").count()) === 1, await title(page));
  await page.click("#btn-next");
  ok(c, "Next shows Calculate with last year's cost", (await stepOn(page)) === 3 && (await title(page)) === `Paying early cost ${euro(exp.fixPaths.case.E)} last year`, await title(page));
  await page.keyboard.press("ArrowRight");
  ok(c, "Propose waits for the decision", (await stepOn(page)) === 4 && (await page.locator('.opt[data-recommended="true"] [data-action="approve"]:not([disabled])').count()) === 1);
  await page.keyboard.press("ArrowRight");
  ok(c, "the arrow cannot pass an open decision", (await stepOn(page)) === 4 && (await page.isDisabled("#btn-next")));
  ok(c, "the step bar marks your decision", (await page.$eval('.vc-step[data-step="propose"]', (e) => e.dataset.turn)) === "yours");
  await page.keyboard.press("ArrowLeft");
  ok(c, "the left arrow goes back", (await stepOn(page)) === 3);
  await page.click("#btn-back");
  await goStep(page, 1);
  ok(c, "a click on a step goes there, and the address says so", (await stepOn(page)) === 1 && new URL(page.url()).searchParams.get("step") === "1" && new URL(page.url()).searchParams.get("case") === slug(LEAD));
  await goStep(page, 4);
  await page.click('.opt[data-recommended="true"] [data-action="approve"]');
  await page.waitForFunction(() => !document.getElementById("btn-next").disabled, null, { timeout: 5000 });
  await page.keyboard.press("ArrowRight");
  ok(c, "after the decision the drafts wait in Prepare", (await stepOn(page)) === 5 && (await page.locator('.draft[data-status="pending"]').count()) === exp.drafts.length);
  for (const e of errors) c[`page error ${e.slice(0, 40)}`] = `FAIL: ${e}`;
  await context.close();

  // Deep links.
  const d4 = await newPage();
  await open(d4.page, `?case=${slug(LEAD)}&step=4`);
  await d4.page.waitForSelector('.opt[data-recommended="true"] [data-action="approve"]:not([disabled])', { timeout: 10000 });
  ok(c, "?step=4 opens on the decision", (await stepOn(d4.page)) === 4);
  await d4.context.close();
  const d5 = await newPage();
  await open(d5.page, `?case=${slug(LEAD)}&step=5`);
  await d5.page.waitForSelector('.draft[data-status="pending"]', { timeout: 10000 });
  ok(c, "?step=5 opens on the drafts of the recommended path", (await stepOn(d5.page)) === 5 && (await d5.page.locator('.draft[data-status="pending"]').count()) === exp.drafts.length);
  await d5.context.close();
  const d3 = await newPage();
  await open(d3.page, "?case=punchout&step=3");
  await d3.page.waitForFunction(() => document.querySelector('.stepbar .vc-step__button[aria-current="step"]')?.dataset.step === "3", null, { timeout: 10000 });
  const p = await expectedRun("SC-PUNCHOUT");
  const gains = p.options.nothing.figures.gains_per_year;
  ok(c, "?case=punchout&step=3 opens that case on Calculate", (await title(d3.page)) === `About ${int(gains)} more exceptions a year if nothing changes`, await title(d3.page));
  await d3.page.click('.stepbar .vc-step__button[data-step="0"]');
  ok(c, "the case menu shows the case of the address", (await d3.page.$eval("#case-select", (s) => s.value)) === "SC-PUNCHOUT");
  await d3.context.close();

  // By keyboard alone: Tab to Start and Enter, the arrow keys to the decision, Tab to the recommended
  // Approve and Enter; the focused control shows a focus ring.
  const kb = await newPage();
  await open(kb.page);
  const tabTo = async (selector, max = 40) => {
    for (let i = 1; i <= max; i += 1) {
      await kb.page.keyboard.press("Tab");
      if (await kb.page.evaluate((sel) => document.activeElement?.matches(sel), selector)) return i;
    }
    return null;
  };
  const ring = () => kb.page.evaluate(() => { const st = getComputedStyle(document.activeElement); return (st.outlineStyle !== "none" && parseFloat(st.outlineWidth) > 0) || st.boxShadow !== "none"; });
  const toStart = await tabTo("#btn-start");
  ok(c, "Tab reaches Start, with a focus ring", toStart !== null && (await ring()), `${toStart} Tabs`);
  await kb.page.keyboard.press("Enter");
  await kb.page.waitForFunction(() => document.querySelector('.stepbar .vc-step__button[aria-current="step"]')?.dataset.step === "1", null, { timeout: 5000 });
  for (let i = 0; i < 3; i += 1) await kb.page.keyboard.press("ArrowRight");
  const toApprove = await tabTo('.opt[data-recommended="true"] [data-action="approve"]');
  ok(c, "on the decision, Tab reaches the recommended Approve, with a focus ring", toApprove !== null && (await ring()), `${toApprove} Tabs`);
  await kb.page.keyboard.press("Enter");
  await kb.page.waitForSelector('.opt[data-recommended="true"][data-status="approved"]', { timeout: 5000 }).catch(() => {});
  ok(c, "Enter approves it", (await kb.page.locator('.opt[data-recommended="true"][data-status="approved"]').count()) === 1);
  c["keyboard: Tabs to Start, Tabs to Approve"] = `${toStart}, ${toApprove}`;
  await kb.context.close();

  // Reduced motion: the key figures change without their flip.
  const rm = await newPage({ reducedMotion: "reduce" });
  await open(rm.page, `?case=${slug(LEAD)}&step=4`);
  await rm.page.waitForSelector('.opt[data-recommended="true"] [data-action="approve"]:not([disabled])', { timeout: 10000 });
  await rm.page.click('.opt[data-recommended="true"] [data-action="approve"]');
  await rm.page.waitForTimeout(200);
  const anim = await rm.page.$eval("#kpi-cost .kpi-value", (e) => ({ flip: e.classList.contains("flip"), name: getComputedStyle(e).animationName }));
  ok(c, "with reduced motion the figures change without moving", anim.flip && anim.name === "none", JSON.stringify(anim));
  await rm.context.close();
});

// ---- kpis ---------------------------------------------------------------------------------------------
await runCase("kpis", async (c) => {
  const exp = await expectedRun(LEAD);
  const f = approvedFigures(exp);
  const atStake = exp.options.nothing.figures.gains_cost_eur_per_year;
  for (const [w, hgt] of [[1920, 1080], [1280, 720]]) {
    const { page, context } = await newPage({ width: w, height: hgt });
    await open(page);
    const tiles = await page.$$eval("[data-vc-kpi]", (els) => els.map((e) => {
      const r = e.getBoundingClientRect();
      return { name: e.dataset.vcKpi, inHeader: !!e.closest("header.app-header"), left: r.left, right: r.right, top: r.top, value: e.querySelector(".kpi-value")?.textContent.trim() };
    }));
    ok(c, `${w}: four key figures in the header`, tiles.length === 4 && tiles.every((t) => t.inHeader), JSON.stringify(tiles.map((t) => t.name)));
    ok(c, `${w}: they sit top right`, tiles.every((t) => t.top < 40 && t.left >= w * 0.4) && Math.max(...tiles.map((t) => t.right)) >= w - 40, JSON.stringify(tiles.map((t) => [Math.round(t.left), Math.round(t.top)])));
    ok(c, `${w}: each reads sensibly before anything happens`, tiles.every((t) => t.value && !/—|NaN|undefined/.test(t.value)), JSON.stringify(tiles.map((t) => t.value)));
    await context.close();
  }
  const { page, context } = await newPage();
  await open(page, `?case=${slug(LEAD)}&step=4`);
  await page.waitForSelector('.opt[data-recommended="true"] [data-action="approve"]:not([disabled])', { timeout: 10000 });
  const before = await kpi(page, "cost");
  ok(c, "before the decision, Cost avoided shows what is at stake", before.value === euro(0) && before.note === `${euro(atStake)} a year at stake` && before.state === "risk", JSON.stringify(before));
  const fixedBefore = await kpi(page, "fixed");
  ok(c, "Records fixed starts at 0 of the case", fixedBefore.value === "0" && fixedBefore.unit === `of ${int(exp.alert.exceptions)}`, JSON.stringify(fixedBefore));
  const clock1 = await kpi(page, "time");
  await page.waitForTimeout(2300); // the clock redraws once a second
  const clock2 = await kpi(page, "time");
  ok(c, "the detection → decision clock runs while the decision waits", clock1.value !== clock2.value && /^\d+:\d\d$/.test(clock2.value), `${clock1.value} → ${clock2.value}`);
  ok(c, "it names how long the oldest exception has waited", clock2.note === `oldest waited ${int(exp.age.oldestDays)} days`, clock2.note);
  await page.click('.opt[data-recommended="true"] [data-action="approve"]');
  await page.waitForTimeout(400);
  const cost = await kpi(page, "cost");
  ok(c, "after the decision, Cost avoided is the engine's yearly figure", cost.value === euro(f.future_avoided_eur_per_year) && cost.unit === "a year" && cost.note === `and ${euro(f.avoided_now_eur)} at once` && cost.state === "gain", JSON.stringify(cost));
  const fixed = await kpi(page, "fixed");
  ok(c, "Records fixed is the engine's projection", fixed.value === int(f.closed) && fixed.unit === `of ${int(exp.alert.exceptions)}` && /^projected/.test(fixed.note), JSON.stringify(fixed));
  const t1 = await kpi(page, "time");
  await page.waitForTimeout(1300);
  const t2 = await kpi(page, "time");
  ok(c, "the clock stops at the decision", t1.value === t2.value && t2.state === "gain", `${t1.value} → ${t2.value}`);
  await goStep(page, 5);
  await approveDrafts(page);
  await page.waitForTimeout(300);
  const session = await kpi(page, "session");
  ok(c, "Session cost is the estimate of the same run, labelled as one", session.value === `≈ ${euroCents(exp.estimate.eur)}` && /estimate/.test(session.note), `${session.value} vs ${euroCents(exp.estimate.eur)}`);
  const guide = await page.$$eval("[data-fact]", (els) => Object.fromEntries(els.map((e) => [e.dataset.fact, e.textContent])));
  ok(c, "the guide's talk track quotes the engine's figures", guide["lead.yearly"] === euro(atStake) && guide["lead.n"] === int(exp.alert.exceptions) && guide["lead.age"] === `${int(exp.age.oldestDays)} days` && guide["lead.session"] === euroCents(exp.estimate.eur), JSON.stringify(guide));
  await context.close();
});

// ---- cases --------------------------------------------------------------------------------------------
await runCase("cases", async (c) => {
  for (const sc of data.SCENARIOS) {
    const exp = await expectedRun(sc.id);
    const f = approvedFigures(exp);
    const { page, errors, context } = await newPage();
    await open(page, `?case=${slug(sc.id)}`);
    await page.click("#btn-start");
    await confirmReviewIfAny(page);
    await goStep(page, 4);
    await page.waitForSelector('.opt[data-recommended="true"] [data-action="approve"]:not([disabled])', { timeout: 10000 });
    const rec = await page.$eval('.opt[data-recommended="true"]', (e) => e.dataset.path);
    await page.click('.opt[data-recommended="true"] [data-action="approve"]');
    await page.waitForTimeout(300);
    const fixed = await kpi(page, "fixed");
    const cost = await kpi(page, "cost");
    await goStep(page, 5);
    await approveDrafts(page);
    const t = await title(page);
    const report = await page.locator(".report").innerText();
    ok(c, `${sc.id}: recommends what the script recommends`, rec === exp.options.recommended, rec);
    ok(c, `${sc.id}: Records fixed and Cost avoided are the engine's`, fixed.value === int(f.closed) && cost.value === euro(f.future_avoided_eur_per_year), `${fixed.value}/${int(f.closed)} ${cost.value}/${euro(f.future_avoided_eur_per_year)}`);
    ok(c, `${sc.id}: ends with nothing sent`, t === "Done. Nothing was sent." && /nothing was sent/i.test(report) && (await page.locator('.draft[data-status="approved"]').count()) === exp.drafts.length, t);
    if (errors.length) c[`${sc.id}: page errors`] = `FAIL: ${errors.join(" | ")}`;
    await page.screenshot({ path: path.join(OUT, `case-${slug(sc.id)}-done.png`) });
    await context.close();
  }
});

// ---- paths --------------------------------------------------------------------------------------------
await runCase("paths", async (c) => {
  // Reject the recommendation, then approve A.
  {
    const exp = await expectedRun(LEAD, { decide: (o) => [{ options_seq: o.options_seq, option_id: o.recommended, decision: "rejected" }, { options_seq: o.options_seq, option_id: "A", decision: "approved" }] });
    const { page, context } = await newPage();
    await open(page, `?case=${slug(LEAD)}&step=4`);
    await page.waitForSelector('.opt[data-recommended="true"] [data-action="reject"]:not([disabled])', { timeout: 10000 });
    await page.click('.opt[data-recommended="true"] [data-action="reject"]');
    await page.waitForSelector('.opt[data-recommended="true"][data-status="rejected"]', { timeout: 5000 });
    ok(c, "a rejected path stays on screen as rejected, the others stay open", (await page.locator('.opt[data-path="A"] [data-action="approve"]:not([disabled])').count()) === 1);
    await page.click('.opt[data-path="A"] [data-action="approve"]');
    await page.waitForTimeout(300);
    const fixed = await kpi(page, "fixed");
    const fa = approvedFigures(exp);
    ok(c, "path A's figures follow", fixed.value === int(fa.closed), fixed.value);
    await goStep(page, 5);
    ok(c, "path A drafts what A allows", (await page.locator('.draft[data-status="pending"]').count()) === exp.drafts.length && (await page.$$eval(".draft", (els) => els.map((e) => e.dataset.kind).join())) === exp.drafts.map((d) => d.kind).join());
    await approveDrafts(page);
    ok(c, "and ends with nothing sent", (await title(page)) === "Done. Nothing was sent.");
    await context.close();
  }
  // Accept the risk.
  {
    const { page, context } = await newPage();
    await open(page, `?case=${slug(LEAD)}&step=4`);
    await page.waitForSelector('.opt[data-path="nothing"] textarea:not([disabled])', { timeout: 10000 });
    ok(c, "accepting the risk needs a reason", await page.isDisabled('.opt[data-path="nothing"] [data-action="accept"]'));
    await page.fill("#nothing-reason", "Lower priority this quarter.");
    await page.click('.opt[data-path="nothing"] [data-action="accept"]');
    await page.waitForTimeout(300);
    const cost = await kpi(page, "cost");
    ok(c, "the accepted risk shows what goes on", cost.value === euro(0) && / a year goes on$/.test(cost.note) && cost.state === "risk", JSON.stringify(cost));
    await goStep(page, 5);
    ok(c, "a risk memo waits for approval", (await page.$$eval('.draft[data-status="pending"]', (els) => els.map((e) => e.dataset.kind).join())) === "risk_memo");
    await approveDrafts(page);
    ok(c, "the report records the accepted risk", /risk is accepted|accepted/i.test(await page.locator(".report").innerText()));
    await context.close();
  }
  // Reject every path.
  {
    const { page, context } = await newPage();
    await open(page, `?case=${slug(LEAD)}&step=4`);
    await page.waitForSelector('.opt[data-recommended="true"] [data-action="reject"]:not([disabled])', { timeout: 10000 });
    for (;;) {
      const open1 = page.locator('.opt:not(.opt--nothing):not([data-status="rejected"]) [data-action="reject"]:not([disabled])');
      if (!(await open1.count())) break;
      await open1.first().click();
      await page.waitForTimeout(200);
    }
    await page.waitForFunction(() => document.querySelector('.stepbar .vc-step__button[data-step="5"]') && !document.querySelector('.stepbar .vc-step__button[data-step="5"]').disabled, null, { timeout: 10000 });
    await goStep(page, 5);
    ok(c, "with every path rejected nothing is drafted", (await title(page)) === "Every path was rejected: nothing to draft" && (await page.locator(".draft").count()) === 0, await title(page));
    await context.close();
  }
  // The review of AI-suggested values.
  {
    const exp = await expectedRun("SC-UNCLASSIFIED");
    const { page, context } = await newPage();
    await open(page, "?case=unclassified");
    await page.click("#btn-start");
    await goStep(page, 2);
    await page.waitForSelector(".review-table", { timeout: 10000 });
    const rows = await page.locator(".review-table tbody tr").count();
    ok(c, "the review lists every AI suggestion and waits", rows > 0 && (await page.$eval('.vc-step[data-step="check"]', (e) => e.dataset.turn)) === "yours", `${rows} rows`);
    ok(c, "Confirm waits until every line is decided", await page.isDisabled("#btn-review-confirm"));
    await page.click(".review-table tbody tr >> nth=0 >> [data-action=\"reject\"]");
    await page.click("#btn-review-all");
    ok(c, "Approve all decides every line", !(await page.isDisabled("#btn-review-confirm")));
    await page.click("#btn-review-confirm");
    await page.waitForSelector(".case-card", { timeout: 10000 });
    ok(c, "after the review the case shows what you approved", /AI suggestions approved/.test(await page.locator(".case-card").innerText()) && exp.alert !== null);
    await context.close();
  }
});

// ---- lean ---------------------------------------------------------------------------------------------
const BAD = [[/\b(?:erp|dq|ui)_[a-z]+(?:_[a-z]+)*\b/, "a tool name"], [/\bU\d{3}\b/, "a user id"], [/—/, "an em dash"], [/\bundefined\b|\bNaN\b|\[object Object\]/, "a broken value"]];
const badIn = (text) => BAD.flatMap(([re, what]) => { const m = text.match(re); return m ? [`${what} (${m[0]})`] : []; });
await runCase("lean", async (c) => {
  ok(c, "self-test: planted tool name, user id and em dash are caught", badIn("Reads erp_get_record of U190 — fine").length === 3 && badIn("Two rules flag 23 order lines").length === 0);
  const { page, context } = await newPage();
  await open(page);
  const controls = await page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };
    const all = [...document.querySelectorAll("button, a[href], select, input, textarea, summary, [role=tab]")].filter((el) => !el.closest("dialog:not([open])") && vis(el));
    return { all: all.length, enabled: all.filter((el) => !el.disabled).length, names: all.filter((el) => !el.disabled).map((el) => (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 30)) };
  });
  ok(c, "the first screen offers at most 12 controls", controls.enabled <= 12, `${controls.enabled} enabled of ${controls.all} visible: ${controls.names.join(", ")}`);
  c.controls = `${controls.enabled} enabled, ${controls.all} visible`;
  const seen = [];
  const sample = async (state) => {
    const text = await page.evaluate(() => {
      const clone = document.body.cloneNode(true);
      clone.querySelectorAll("dialog:not([open]), script, #boot").forEach((n) => n.remove());
      return clone.innerText;
    });
    const bad = badIn(text);
    if (bad.length) seen.push(`${state}: ${bad.join(", ")}`);
  };
  await sample("the tip");
  await page.click("#btn-start");
  for (const n of [1, 2, 3, 4]) { await goStep(page, n); await sample(`step ${n}`); }
  await page.click('.opt[data-recommended="true"] [data-action="approve"]');
  await sample("step 4, decided");
  await goStep(page, 5);
  await page.$$eval(".draft details", (ds) => ds.forEach((d) => { d.open = true; }));
  await sample("step 5, drafts open");
  await approveDrafts(page);
  await sample("step 5, the report");
  await page.click("#btn-guide");
  for (let i = 0; i < 5; i += 1) { await sample(`the guide, chapter ${i + 1}`); await page.click("dialog.vc-guide [data-vc-guide-next]"); }
  ok(c, "no step shows a tool name, a user id, an em dash or a broken value", !seen.length, seen.join(" | "));
  await context.close();
});

// ---- layout -------------------------------------------------------------------------------------------
// DQ_LAYOUT_SIZES="1000x560" runs other sizes (a negative control: that one must fail).
const SIZES = process.env.DQ_LAYOUT_SIZES ? process.env.DQ_LAYOUT_SIZES.split(",").map((s) => s.split("x").map(Number)) : [[1920, 1080], [1280, 720]];
await runCase("layout", async (c) => {
  for (const [w, hgt] of SIZES) {
    for (const theme of ["light", "dark"]) {
      const tag = `${w}x${hgt}-${theme}`;
      const { page, errors, context } = await newPage({ width: w, height: hgt, theme });
      const problems = [];
      const look = async (state, main) => {
        await page.waitForTimeout(200);
        const r = await page.evaluate((sel) => {
          const doc = document.documentElement;
          const out = { scrollX: doc.scrollWidth > innerWidth + 1, scrollY: doc.scrollHeight > innerHeight + 1, main: [], cut: [], panels: [] };
          for (const el of sel ? document.querySelectorAll(sel) : []) {
            const b = el.getBoundingClientRect();
            const inView = b.top >= 0 && b.left >= 0 && b.bottom <= innerHeight && b.right <= innerWidth && b.width > 0;
            const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
            out.main.push({ inView, covered: !(hit && (hit === el || el.contains(hit))) });
          }
          for (const el of document.querySelectorAll(".kpi .vc-stat__label, .kpi .kpi-note, .kpi .vc-stat__value")) if (el.scrollWidth > el.clientWidth + 1) out.cut.push(el.textContent.trim());
          for (const el of document.querySelectorAll(".stage .panel, .stage .drafts, .stage .options")) if (el.scrollHeight > el.clientHeight + 2) out.panels.push(el.className);
          return out;
        }, main);
        if (r.scrollX || r.scrollY) problems.push(`${state}: the page scrolls ${r.scrollX ? "sideways" : ""}${r.scrollY ? " down" : ""}`);
        if (main && (!r.main.length || r.main.some((m) => !m.inView || m.covered))) problems.push(`${state}: the main action is out of view or covered (${JSON.stringify(r.main)})`);
        if (r.cut.length) problems.push(`${state}: cut key-figure text: ${r.cut.join(" | ")}`);
        if (w >= 1920 && r.panels.length) problems.push(`${state}: a panel needs scrolling: ${r.panels.join(", ")}`);
        await page.screenshot({ path: path.join(OUT, `${tag}-${state.replace(/\W+/g, "-")}.png`) });
      };
      await open(page);
      await look("0 the tip", "#btn-start");
      await page.click("#btn-start");
      await look("1 Spot", null);
      for (const n of [2, 3]) { await goStep(page, n); await look(`${n} step`, null); }
      await goStep(page, 4);
      await look("4 Propose", '.opt[data-recommended="true"] [data-action="approve"]');
      await page.click('.opt[data-recommended="true"] [data-action="approve"]');
      await look("4 decided", null);
      await goStep(page, 5);
      await look("5 drafts", '.draft[data-status="pending"] [data-action="approve"]');
      await approveDrafts(page);
      await look("5 report", "#btn-audit");
      for (const e of errors) problems.push(`page error: ${e}`);
      ok(c, tag, !problems.length, problems.join(" | "));
      await context.close();
    }
  }
});

await browser.close();
await server.close();
let failed = 0;
const isFail = ([k, v]) => k === "FAILED" || (typeof v === "string" && v.startsWith("FAIL"));
for (const r of results) {
  const fails = Object.entries(r.checks).filter(isFail);
  console.log(`${fails.length ? "FAIL" : "PASS"}  ${r.name} (${r.seconds} s)`);
  for (const [k, v] of Object.entries(r.checks)) console.log(`        ${v === true ? "ok  " : isFail([k, v]) ? "FAIL" : "info"}  ${k}${v === true ? "" : `: ${v}`}`);
  if (fails.length) failed += 1;
}
console.log(`Screenshots: ${OUT}`);
if (failed || results.length !== chosen.length) process.exit(1);
console.log(`PRESENTER ${chosen.length === CASES.length ? "OK" : `${chosen.map((x) => x.toUpperCase()).join(" ")} OK`}`);
