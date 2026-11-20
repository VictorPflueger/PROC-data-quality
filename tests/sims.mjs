// AC-12: the six scenarios play in Simulation mode, offline and without a key, along three decision
// paths each: approve the recommendation; reject it and approve another path; accept the risk with a
// reason. Every run must show the SIMULATION tape, make no request to any outside host, never ask for
// a key, end with its report, and show the engine's figures: each fix-path card is compared with the
// same script run through the live toolbox in Node, and the closure-rate tile with that run's
// projection. Scenario 3's review must hold "Your confirmation" on Check, the furthest step reached.
// Usage: node tests/sims.mjs [scenario id…]   prints "SIMS OK: 6 scenarios, 18 runs" when all pass.
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { APP_ROOT, outDir, ONLY, launchBrowser, serveStatic, NETWORK_NOISE, SKIP_INTRO } from "./lib/harness.mjs";
import { loadData } from "./lib/turns.mjs";

const { runOnce } = await import(path.join(APP_ROOT, "js/sim_check.js"));
const { euro, pct1, int, dec1, days } = await import(path.join(APP_ROOT, "js/format.js"));
const { KINDS_BY_PATH } = await import(path.join(APP_ROOT, "js/drafts.js"));

const OUT = await outDir("sims");
const DATA = await loadData();
const SCENARIOS = DATA.SCENARIOS.filter((s) => !ONLY.length || ONLY.includes(s.id));
const PORT = 8790 + Math.floor(Math.random() * 400);
const { base: BASE, close } = await serveStatic(APP_ROOT, PORT);
const browser = await launchBrowser();
const REASON = "Lower priority this quarter; to be reviewed next quarter.";
const perYear = (v) => (Number.isInteger(Math.round(Number(v) * 1e9) / 1e9) ? int(v) : dec1(v));

/** The three plans, as decisions on an options payload and as clicks on the cards. */
function plans(o) {
  const other = o.options.find((x) => x.id !== o.recommended).id;
  return [
    { name: "approve the recommendation", decide: (p) => [{ options_seq: p.options_seq, option_id: p.recommended, decision: "approved" }], clicks: [["approve", o.recommended]], path: o.recommended },
    { name: `reject ${o.recommended}, approve ${other}`, decide: (p) => [{ options_seq: p.options_seq, option_id: p.recommended, decision: "rejected" }, { options_seq: p.options_seq, option_id: other, decision: "approved" }], clicks: [["reject", o.recommended], ["approve", other]], path: other },
    { name: "accept the risk", decide: (p) => [{ options_seq: p.options_seq, option_id: "nothing", decision: "approved", note: REASON }], clicks: [["accept", REASON]], path: "nothing" }
  ];
}

/** What a fix-path card must show, from the engine's figures (js/options_panel.js formats them so). */
function expectedCard(opt, n) {
  const f = opt.figures;
  const source = opt.path === "C" || opt.path === "D";
  return {
    closed: `${int(f.closed)} of ${int(n)}`, spend: euro(f.spend_covered_eur), cost_now: euro(f.avoided_now_eur),
    prevented: perYear(f.prevented_per_year), future: euro(f.future_avoided_eur_per_year), effort: euro(f.effort_eur), days: days(f.days),
    ...(source ? { prevents_after: days(f.prevents_after_days) } : {}), projected: pct1(f.projected_closure_rate)
  };
}

async function play(scenario, plan, expected) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  await context.addInitScript(SKIP_INTRO);
  const outside = [];
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => { outside.push(route.request().url()); return route.abort("blockedbyclient"); });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`page error: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !NETWORK_NOISE.test(m.text())) errors.push(`console error: ${m.text()}`); });
  const c = { scenario: scenario.id, plan: plan.name, problems: [] };
  const problem = (ok, msg) => { if (!ok) c.problems.push(msg); };
  try {
    await page.goto(`${BASE}index.html`);
    await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
    if (scenario.id !== "SC-PUNCHOUT") { await page.click("#dd-scenario"); await page.click(`.dropdown-menu [data-id="${scenario.id}"]`); }
    await page.click("#btn-start");
    await page.click("#btn-mode-simulation");
    await page.click(".segmented button[aria-label='Replay speed ×4']");
    problem(await page.locator(".sim-watermark:not([hidden])").count() === 1, "no SIMULATION tape");
    problem((await page.locator("#mode-badge").textContent()) === "SIMULATION", "the mode badge does not say SIMULATION");
    let step = 0;
    let checkedCards = false;
    let review = null;
    const t0 = Date.now();
    for (;;) {
      if (await page.locator(".entry[data-end]").count()) break;
      if (Date.now() - t0 > 150000) throw new Error("the replay did not end in time");
      if (await page.locator(".review-modal").count() && review === null) {
        review = await page.$$eval(".rail-step", (els) => els.map((e) => `${e.dataset.step}:${e.dataset.state}`).join(" "));
        review += ` | ${await page.locator(".rail-step[data-state='yours'] .rail-turn").textContent()} | ${await page.locator(".status-pill .text").textContent()}`;
        await page.screenshot({ path: path.join(OUT, `${scenario.id}-review.png`) });
        await page.click("#btn-review-approve-all");
        await page.click("#btn-review-confirm");
      }
      const open = page.locator('.option-card[data-kind="option"][data-status=""] [data-action="approve"]');
      if (step < plan.clicks.length && await open.count()) {
        if (!checkedCards) {
          checkedCards = true;
          for (const opt of expected.options.options) {
            const want = expectedCard(opt, expected.options.case.n);
            const got = await page.$$eval(`.option-card[data-path="${opt.path}"] [data-figure]`, (els) => Object.fromEntries(els.map((e) => [e.dataset.figure, e.textContent])));
            for (const [k, v] of Object.entries(want)) problem(got[k] === v, `${opt.path} ${k}: shows ${got[k]}, the engine says ${v}`);
          }
          if (plan.name === "approve the recommendation") await page.screenshot({ path: path.join(OUT, `${scenario.id}-options.png`) });
        }
        const [action, arg] = plan.clicks[step];
        if (action === "accept") {
          await page.fill("#nothing-reason", arg);
          await page.click('.option-card[data-kind="baseline"] [data-action="accept"]');
        } else await page.click(`.option-card[data-path="${arg}"] [data-action="${action}"]`);
        step += 1;
      }
      const pending = page.locator('.action-card[data-status="pending"] [data-action="approve"]');
      if (await pending.count()) await pending.first().click();
      await page.waitForTimeout(120);
    }
    c.end = await page.locator(".entry[data-end]").last().getAttribute("data-end");
    problem(c.end === "done", `the replay ended ${c.end}`);
    problem(await page.locator("#console .report-card").count() === 1, "no report");
    problem(step === plan.clicks.length && checkedCards, "the decision was not taken on the cards");
    const kpi = await page.locator("#kpi-closure-sub").textContent();
    const approved = expected.options.options.find((o) => o.id === plan.path);
    const wantKpi = plan.path === "nothing" ? "risk accepted: no fix, no projection" : `${pct1(approved.figures.projected_closure_rate)} projected after re-scan`;
    problem(kpi === wantKpi, `closure-rate tile: "${kpi}", expected "${wantKpi}"`);
    const status = await page.locator(plan.path === "nothing" ? '.option-card[data-kind="baseline"] .option-status' : `.option-card[data-path="${plan.path}"] .option-status`).textContent();
    problem(plan.path === "nothing" ? /Risk accepted/.test(status) : /Approved, re-scan pending/.test(status), `the decided card reads "${status}"`);
    const kinds = await page.$$eval(".action-card", (els) => els.map((e) => e.dataset.kind));
    const people = plan.path === "B" || plan.path === "D" ? expected.options.case.routed_to.length : 1;
    const wantKinds = KINDS_BY_PATH[plan.path].flatMap((k) => (k === "follow_up" ? Array(people).fill(k) : [k]));
    problem(JSON.stringify(kinds) === JSON.stringify(wantKinds), `drafts ${JSON.stringify(kinds)}, the path allows ${JSON.stringify(wantKinds)}`);
    problem(!(await page.locator("#api-key-input").count()), "a key was asked for");
    if (scenario.id === "SC-UNCLASSIFIED") problem(/spot:done check:yours calculate:todo .* \| Your confirmation \| Awaiting your confirmation/.test(review || ""), `the review must hold Your confirmation on Check (got ${review})`);
    if (plan.name === "approve the recommendation") await page.screenshot({ path: path.join(OUT, `${scenario.id}-done.png`) });
  } catch (e) {
    c.problems.push(`exception: ${e.message}`);
    await page.screenshot({ path: path.join(OUT, `${scenario.id}-${plan.path}-failed.png`) }).catch(() => {});
  }
  problem(outside.length === 0, `requests to outside hosts: ${outside.slice(0, 3).join(", ")}`);
  c.problems.push(...errors);
  await context.close();
  return c;
}

const jobs = [];
for (const scenario of SCENARIOS) {
  const script = DATA.SIM_RUNS[scenario.id];
  const probe = await runOnce(DATA.WORLD, script, { decide: (o) => [{ options_seq: o.options_seq, option_id: o.recommended, decision: "approved" }] });
  for (const plan of plans(probe.options)) {
    const expected = await runOnce(DATA.WORLD, script, { decide: plan.decide });
    if (!expected.ok) { jobs.push(async () => ({ scenario: scenario.id, plan: plan.name, problems: [`the script fails in Node: ${expected.problems[0]}`] })); continue; }
    jobs.push(() => play(scenario, plan, expected));
  }
}

// Three replays at a time.
const results = [];
let next = 0;
await Promise.all([0, 1, 2].map(async () => { while (next < jobs.length) { const k = next++; results[k] = await jobs[k](); } }));
await browser.close();
await close();
await writeFile(path.join(OUT, "sims-results.json"), JSON.stringify(results, null, 2));

let passed = 0;
for (const r of results) {
  if (!r.problems.length) passed += 1;
  console.log(`${r.problems.length ? "FAIL" : "PASS"}  ${r.scenario}: ${r.plan}`);
  for (const p of r.problems) console.log(`      - ${String(p).slice(0, 300)}`);
}
console.log(`\n${passed}/${results.length} replays passed. Screenshots: ${OUT}`);
if (passed === results.length && results.length) console.log(`SIMS OK: ${SCENARIOS.length} scenarios, ${results.length} runs`);
process.exit(passed === results.length && results.length ? 0 : 1);
