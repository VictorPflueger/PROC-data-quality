// The presenter's page in a browser, against the engine's own figures (worked out in Node through the
// same tools and scripts, tests/lib/expected.mjs), so no expected number is typed here.
//   steps    the tip and the five steps by click, the arrow keys, Back and Next and ?step=; each step
//            shows at once after Start (under 1.5 s); ?step=4 waits for the decision; ?step=5 for the
//            drafts; ?case= opens another case; each step ends with a Next button that names where it
//            leads; where the person must act, a Your turn callout says what to do and the action
//            carries Vici's vc-attention; a paused step's Next gets it after six idle seconds (still,
//            with reduced motion)
//   play     Start plays the case: each step fills and says when it moves on, Play goes on by itself,
//            stops where the person acts and reads on after; an open dialog holds it; Space and a
//            chosen step pause it; it ends on Replay, and Replay plays the case again
//   kpis     four key figures in the header, top right; before anything runs they answer: the stake a
//            year, the records, the clock with the oldest wait and the session-cost estimate, all the
//            engine's; after the decision the stake is struck through for what is left and Records
//            fixed for the engine's count, the clock stops, and Session cost equals the estimate of the
//            same run in Node
//   cases    each of the six cases runs along its recommended path to "Done. Nothing was sent.", with
//            the engine's figures in Records fixed and At stake a year
//   paths    a rejection then another path; the accepted risk with its reason; every path rejected;
//            the review of AI-suggested values (Confirm waits for every line)
//   lean     at most 12 controls to click on the first screen; no tool names, user ids, rule codes, em
//            dashes, "undefined" or "NaN" on any step or guide chapter (the checker first catches
//            planted ones)
//   guide    the guide opens by itself on a new tab and not on a reload, ?guide=0 keeps it closed and
//            ?guide=present opens its talk track; How it works has a row for each key figure, the talk
//            track three to seven timed steps; every chapter fits 1280 × 720; Start on the last chapter
//            closes it; Vici's check-guide-render.mjs passes against the page over http
//   layout   every step of the default case at 1920 × 1080 and 1280 × 720, light and dark: no page
//            scrolling, the step's main action in view and not covered, the key figures' text uncut,
//            and at 1920 × 1080 no panel that needs scrolling
// Usage: node tests/presenter.mjs [steps play kpis cases paths lean guide layout] [--require-vici]
import { spawn } from "node:child_process";
import path from "node:path";
import { APP_ROOT, launchBrowser, serveStatic, outDir, NETWORK_NOISE, ONLY, REQUIRE_VICI, viciDir } from "./lib/harness.mjs";
import { expectedRun, approvedFigures } from "./lib/expected.mjs";
import { loadData } from "./lib/turns.mjs";

const CASES = ["steps", "play", "kpis", "cases", "paths", "lean", "guide", "layout"];
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
/** Opens the page with the guide kept closed (?guide=0), unless the query names the guide or guide is true (a new tab as a visitor opens it). */
const open = async (page, query = "", { guide = false } = {}) => {
  await page.goto(`${server.base}${guide || query.includes("guide=") ? query : `${query}${query.includes("?") ? "&" : "?"}guide=0`}`);
  await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
  // The loading screen fades out and then leaves the page: wait until it has gone.
  await page.waitForFunction(() => !document.getElementById("boot"), null, { timeout: 5000 });
};
const title = (page) => page.locator("#step-title").textContent().then((t) => t.trim());
const stepOn = (page) => page.$eval('.stepbar .vc-step__button[aria-current="step"]', (b) => Number(b.dataset.step));
/** A key figure as it reads: its value, the old value struck through beside it (Vici's vc-stat__was), its unit, note and state. */
const kpi = (page, id) => page.$eval(`#kpi-${id}`, (e) => {
  const was = e.querySelector(".kpi-was");
  return { was: was && !was.hidden ? was.textContent.trim() : "", value: e.querySelector(".kpi-value").textContent.trim(), unit: e.querySelector(".kpi-unit").textContent.trim(), note: e.querySelector(".kpi-note").textContent.trim(), state: e.dataset.state };
});
/** At stake a year once a path is approved: the engine's yearly stake, what the path avoids of it, what is left. */
function stakeAfter(exp, f) {
  const atStake = Number(exp.options.nothing.figures.gains_cost_eur_per_year) || 0;
  const avoided = Math.min(atStake, Number(f?.future_avoided_eur_per_year) || 0);
  return { atStake, avoided, left: atStake - avoided };
}
/** The tile At stake a year shows after path f, as kpis.js words it from the engine's figures. */
function stakeTile(exp, f) {
  const { atStake, avoided, left } = stakeAfter(exp, f);
  const now = Number(f?.avoided_now_eur) || 0;
  if (avoided > 0) return { was: euro(atStake), value: euro(left), note: left > 0 ? `path ${f.id} avoids ${euro(avoided)}` : `avoided by path ${f.id}`, state: "gain" };
  if (atStake > 0) return { was: "", value: euro(atStake), note: now > 0 ? `goes on; ${euro(now)} avoided at once` : "goes on with this path", state: "risk" };
  return { was: "", value: euro(0), note: now > 0 ? `${euro(now)} avoided at once` : "no interest cost in this case", state: now > 0 ? "gain" : "idle" };
}
const sameTile = (got, want) => ["was", "value", "note", "state"].every((k) => got[k] === want[k]);
/** Two animation frames: what the page draws after a click has been drawn. */
const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
/** Play's button, the step on screen, how far it is read, the words beside its action and what carries vc-attention. */
const shown = (page) => page.evaluate(() => {
  const cur = document.querySelector('.stepbar .vc-step__button[aria-current="step"]');
  const turn = document.querySelector("#stage .turn");
  const marked = [...document.querySelectorAll("#stage .vc-attention")];
  const cta = document.getElementById("btn-cta");
  return {
    step: cur ? Number(cur.dataset.step) : null,
    play: document.getElementById("play-text").textContent.trim(),
    fill: Number(cur?.closest(".vc-step")?.style.getPropertyValue("--vc-step-fill") || 0),
    bar: cta ? Number(cta.style.getPropertyValue("--fill") || 0) : null,
    foot: document.getElementById("foot-note")?.textContent.trim() ?? null,
    turn: turn ? turn.innerText.replace(/\s+/g, " ").trim() : null,
    marked: marked.length, markedText: marked[0]?.textContent.trim() || "",
    markedRecommended: !!marked[0]?.closest('.opt[data-recommended="true"]'),
    cta: cta ? cta.textContent.trim() : null
  };
});
/** Waits until the page shows step n, up to a time (Play's longest step is 14 s). */
const reach = (page, n, ms = 16000) => page.waitForFunction((k) => document.querySelector('.stepbar .vc-step__button[aria-current="step"]')?.dataset.step === String(k), n, { timeout: ms }).then(() => true, () => false);
/** A child process run to its end without blocking this one: { status, stdout, stderr }. */
function runChild(cmd, args, opts, limit) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, opts);
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    const timer = setTimeout(() => child.kill("SIGKILL"), limit);
    child.on("close", (status) => { clearTimeout(timer); resolve({ status, stdout, stderr }); });
  });
}
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

  // What to do next: each step names it where the reading ends, and the person's turn says so.
  const nx = await newPage();
  await open(nx.page);
  await nx.page.click("#btn-start");
  const cta = () => nx.page.$eval("#btn-cta", (b) => { const r = b.getBoundingClientRect(); return { text: b.textContent.trim(), primary: !b.classList.contains("vc-button--secondary"), inView: r.top >= 0 && r.bottom <= innerHeight && r.width > 0 }; }).catch(() => null);
  const steps = [];
  for (const [n, label] of [[1, "Next: find the cause"], [2, "Next: what it costs"], [3, "Next: your decision"]]) {
    const b = await cta();
    steps.push(`${n}: ${b ? b.text : "none"}`);
    ok(c, `step ${n} ends with "${label}", in view`, b && b.text === label && b.primary && b.inView, JSON.stringify(b));
    await nx.page.click("#btn-cta");
    await nx.page.waitForFunction((k) => document.querySelector('.stepbar .vc-step__button[aria-current="step"]')?.dataset.step === String(k), n + 1, { timeout: 5000 });
  }
  ok(c, "the bar's Next stays secondary", await nx.page.$eval("#btn-next", (b) => b.classList.contains("vc-button--secondary")));
  const turn4 = await nx.page.locator(".decide-head .turn").textContent().catch(() => "");
  ok(c, "the decision says it is your turn and what to do", /^Your turn\s*Approve one way to fix it, or accept the risk\.$/.test(turn4.trim()) && (await nx.page.locator("#btn-cta").count()) === 0, turn4);
  const marked4 = await nx.page.$$eval("#stage .vc-attention", (els) => els.map((b) => ({ text: b.textContent.trim(), rec: !!b.closest('.opt[data-recommended="true"]'), anim: getComputedStyle(b).animationName })));
  ok(c, "the recommended Approve, and only it, carries Vici's vc-attention", marked4.length === 1 && marked4[0].rec && marked4[0].text === "Approve" && marked4[0].anim === "vc-attention", JSON.stringify(marked4));
  await nx.page.click('.opt[data-recommended="true"] [data-action="approve"]');
  const b4 = await nx.page.waitForSelector("#btn-cta", { timeout: 5000 }).then(() => cta());
  ok(c, 'after the decision the step ends with "Next: the drafts", in view', b4 && b4.text === "Next: the drafts" && b4.inView, JSON.stringify(b4));
  await nx.page.click("#btn-cta");
  await nx.page.waitForSelector('.draft[data-status="pending"]', { timeout: 10000 });
  const turn5 = await nx.page.locator(".decide-head .turn").textContent().catch(() => "");
  ok(c, "the drafts say it is your turn", /^Your turn\s*Approve or reject each draft/.test(turn5.trim()), turn5);
  ok(c, "the first draft's Approve carries vc-attention", (await nx.page.$$eval("#stage .vc-attention", (els) => els.map((b) => !!b.closest(".draft") && b.textContent.trim() === "Approve"))).join() === "true");
  await approveDrafts(nx.page);
  ok(c, "with the report done, nothing asks for a turn", (await nx.page.locator("#stage .turn, #btn-cta, #stage .vc-attention").count()) === 0);
  await nx.context.close();

  // Paused on a step, its Next draws the eye after six idle seconds, and a key calms it again.
  const idle = await newPage();
  await open(idle.page, `?case=${slug(LEAD)}&step=1`);
  await idle.page.waitForSelector("#btn-cta", { timeout: 10000 });
  ok(c, "a link to a step opens it paused, with nothing marked yet", (await shown(idle.page)).marked === 0 && (await shown(idle.page)).play === "Play");
  await idle.page.waitForTimeout(6600);
  const quiet = await idle.page.$eval("#btn-cta", (b) => ({ marked: b.classList.contains("vc-attention"), anim: getComputedStyle(b).animationName }));
  ok(c, "after six idle seconds the paused step's Next carries vc-attention", quiet.marked && quiet.anim === "vc-attention", JSON.stringify(quiet));
  await idle.page.keyboard.press("Shift");
  ok(c, "a key calms it again", !(await idle.page.$eval("#btn-cta", (b) => b.classList.contains("vc-attention"))));
  await idle.context.close();

  // Reduced motion: the key figures change without their flip, and vc-attention is a still ring.
  const rm = await newPage({ reducedMotion: "reduce" });
  await open(rm.page, `?case=${slug(LEAD)}&step=4`);
  await rm.page.waitForSelector('.opt[data-recommended="true"] [data-action="approve"]:not([disabled])', { timeout: 10000 });
  const still = await rm.page.$eval('.opt[data-recommended="true"] [data-action="approve"]', (b) => ({ marked: b.classList.contains("vc-attention"), ms: parseFloat(getComputedStyle(b).animationDuration) * (getComputedStyle(b).animationDuration.endsWith("ms") ? 1 : 1000), runs: getComputedStyle(b).animationIterationCount, ring: getComputedStyle(b).boxShadow }));
  ok(c, "with reduced motion vc-attention does not move but still shows a ring", still.marked && still.ms < 1 && still.runs === "1" && still.ring !== "none", JSON.stringify(still));
  await rm.page.click('.opt[data-recommended="true"] [data-action="approve"]');
  await rm.page.waitForTimeout(200);
  const anim = await rm.page.$eval("#kpi-cost .kpi-value", (e) => ({ flip: e.classList.contains("flip"), name: getComputedStyle(e).animationName }));
  ok(c, "with reduced motion the figures change without moving", anim.flip && anim.name === "none", JSON.stringify(anim));
  await rm.context.close();
});

// ---- play ---------------------------------------------------------------------------------------------
await runCase("play", async (c) => {
  const { page, context } = await newPage({ width: 1600, height: 900 });
  await open(page);
  let s = await shown(page);
  ok(c, "the first screen waits for Start: Your turn, Start carries vc-attention, Play's button reads Play", s.step === 0 && s.play === "Play" && /^Your turn /.test(s.turn || "") && s.marked === 1 && s.markedText === "Start the agent", JSON.stringify(s));
  await page.waitForTimeout(2500);
  ok(c, "it waits however long it takes", (await shown(page)).step === 0);
  await page.click("#btn-start");
  await settle(page);
  s = await shown(page);
  ok(c, "Start plays the case from Spot", s.step === 1 && s.play === "Pause", JSON.stringify(s));
  await page.waitForTimeout(3000);
  s = await shown(page);
  ok(c, "while Play reads Spot, the rail to the next step and the bar along Next fill", s.step === 1 && s.fill > 0.1 && s.fill < 0.6 && Math.abs(s.bar - s.fill) < 0.05, JSON.stringify(s));
  ok(c, "beside Next, the page says when it moves on", /^Plays on in \d{1,2} s$/.test(s.foot || ""), s.foot);
  // A dialog holds Play: How it works over the page, then closed again.
  await page.click("#btn-guide");
  const held = (await shown(page)).fill;
  await page.waitForTimeout(1500);
  const after = (await shown(page)).fill;
  await page.keyboard.press("Escape");
  await settle(page);
  ok(c, "an open dialog holds Play", Math.abs(after - held) < 0.02 && (await shown(page)).play === "Pause", `${held} → ${after}`);
  ok(c, "Play reads Spot and moves on to Check by itself", await reach(page, 2));
  ok(c, "the address follows Play", new URL(page.url()).searchParams.get("step") === "2", page.url());
  // Space pauses and plays again (the focus is on no button).
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press(" ");
  await settle(page);
  s = await shown(page);
  await page.waitForTimeout(1200);
  const later = await shown(page);
  ok(c, "Space pauses Play, and the rail stops", s.play === "Play" && Math.abs(later.fill - s.fill) < 0.01 && later.step === 2, `${JSON.stringify(s)} → ${later.fill}`);
  ok(c, "paused, the words beside Next say the move is yours", s.foot === "Your move", s.foot);
  await page.keyboard.press(" ");
  await settle(page);
  ok(c, "Space plays again", (await shown(page)).play === "Pause");
  // A step chosen by key pauses Play; the Play button goes on from there.
  await page.keyboard.press("ArrowRight");
  await settle(page);
  s = await shown(page);
  ok(c, "a step chosen by key pauses Play", s.play === "Play" && s.step === 3, JSON.stringify(s));
  await page.click("#btn-play");
  await settle(page);
  s = await shown(page);
  ok(c, "Play goes on from the step on screen", s.play === "Pause" && s.step === 3, JSON.stringify(s));
  // The step's Next goes on at once and keeps Play; at the decision Play waits for the person.
  await page.click("#btn-cta");
  await settle(page);
  s = await shown(page);
  ok(c, "the step's Next goes on at once and keeps Play going", s.step === 4 && s.play === "Pause", JSON.stringify(s));
  ok(c, "at the decision: Your turn, the recommended Approve marked, no Next", /^Your turn Approve one way to fix it, or accept the risk\.$/.test(s.turn || "") && s.marked === 1 && s.markedRecommended && s.cta === null, JSON.stringify(s));
  await page.waitForTimeout(2000);
  ok(c, "Play waits for the person", (await shown(page)).step === 4);
  await page.click('.opt[data-recommended="true"] [data-action="approve"]');
  await page.waitForSelector("#btn-cta", { timeout: 10000 }).catch(() => {});
  s = await shown(page);
  ok(c, "after the approval the turn goes and Next comes back", !s.turn && s.cta === "Next: the drafts" && s.step === 4, JSON.stringify(s));
  ok(c, "Play moves on to the drafts by itself once the decision is read", await reach(page, 5));
  await page.waitForSelector('.draft[data-status="pending"]', { timeout: 15000 });
  s = await shown(page);
  ok(c, "at the drafts: Your turn again, the first draft's Approve marked", /^Your turn Approve or reject each draft/.test(s.turn || "") && s.marked === 1 && s.markedText === "Approve", JSON.stringify(s));
  await approveDrafts(page);
  await page.waitForFunction(() => document.getElementById("play-text").textContent.trim() === "Replay", null, { timeout: 5000 }).catch(() => {});
  s = await shown(page);
  ok(c, "after the drafts the story ends on Replay, with nothing left to press", s.play === "Replay" && !s.turn && !s.marked && s.cta === null, JSON.stringify(s));
  await page.click("#btn-play");
  await settle(page);
  s = await shown(page);
  const reopened = await page.waitForFunction(() => document.querySelector('.vc-step[data-step="propose"]')?.dataset.turn === "yours", null, { timeout: 10000 }).then(() => true, () => false);
  ok(c, "Replay plays the case again from Spot, its decision open again", s.step === 1 && s.play === "Pause" && reopened, JSON.stringify(s));
  await context.close();
});

// ---- kpis ---------------------------------------------------------------------------------------------
await runCase("kpis", async (c) => {
  const exp = await expectedRun(LEAD);
  const f = approvedFigures(exp);
  const atStake = exp.options.nothing.figures.gains_cost_eur_per_year;
  const n = int(exp.alert.exceptions);
  // Answer first: before anything runs, the tiles show the case as the engine works it out.
  const first = {
    cost: { was: "", value: euro(atStake), note: "if nothing changes", state: "risk" },
    fixed: { value: "0", unit: `of ${n}`, note: `${euro(exp.alert.spend_eur)} of orders` },
    time: { value: "0:00", unit: "min", note: `oldest waited ${int(exp.age.oldestDays)} days` },
    session: { value: `≈ ${euroCents(exp.estimate.eur)}`, note: "estimate if run live" }
  };
  for (const [w, hgt, query] of [[1920, 1080, ""], [1280, 720, ""], [1280, 720, "?guide=present"]]) {
    const tag = `${w}${query ? ", guide open" : ""}`;
    const { page, context } = await newPage({ width: w, height: hgt });
    await open(page, query);
    const tiles = await page.$$eval("[data-vc-kpi]", (els) => els.map((e) => {
      const r = e.getBoundingClientRect();
      return { name: e.dataset.vcKpi, inHeader: !!e.closest("header.app-header"), left: r.left, right: r.right, top: r.top };
    }));
    ok(c, `${tag}: four key figures in the header`, tiles.length === 4 && tiles.every((t) => t.inHeader), JSON.stringify(tiles.map((t) => t.name)));
    ok(c, `${tag}: they sit top right`, tiles.every((t) => t.top < 40 && t.left >= w * 0.4) && Math.max(...tiles.map((t) => t.right)) >= w - 40, JSON.stringify(tiles.map((t) => [Math.round(t.left), Math.round(t.top)])));
    for (const [id, want] of Object.entries(first)) {
      const got = await kpi(page, id);
      ok(c, `${tag}: before anything runs, ${id} shows the engine's figure`, Object.entries(want).every(([k, v]) => got[k] === v), JSON.stringify(got));
    }
    if (query) ok(c, `${tag}: the guide is open over them`, await page.evaluate(() => document.getElementById("guide").open));
    await context.close();
  }
  const { page, context } = await newPage();
  await open(page, `?case=${slug(LEAD)}&step=4`);
  await page.waitForSelector('.opt[data-recommended="true"] [data-action="approve"]:not([disabled])', { timeout: 10000 });
  const before = await kpi(page, "cost");
  ok(c, "before the decision, At stake a year shows the engine's yearly cost if nothing changes", sameTile(before, first.cost), JSON.stringify(before));
  const fixedBefore = await kpi(page, "fixed");
  ok(c, "Records fixed starts at 0 of the case", fixedBefore.value === "0" && fixedBefore.unit === `of ${n}` && !fixedBefore.was, JSON.stringify(fixedBefore));
  const clock1 = await kpi(page, "time");
  await page.waitForTimeout(2300); // the clock redraws once a second
  const clock2 = await kpi(page, "time");
  ok(c, "the detection → decision clock runs while the decision waits", clock1.value !== clock2.value && /^\d+:\d\d$/.test(clock2.value), `${clock1.value} → ${clock2.value}`);
  ok(c, "it names how long the oldest exception has waited", clock2.note === `oldest waited ${int(exp.age.oldestDays)} days`, clock2.note);
  await page.click('.opt[data-recommended="true"] [data-action="approve"]');
  await page.waitForTimeout(400);
  const cost = await kpi(page, "cost");
  const want = stakeTile(exp, f);
  ok(c, "after the decision, the stake is struck through and the tile shows what is left, the engine's figures", sameTile(cost, want) && want.was === euro(atStake), `${JSON.stringify(cost)} vs ${JSON.stringify(want)}`);
  const struck = await page.$eval("#kpi-cost .kpi-was", (e) => ({ tag: e.tagName, cls: e.className, line: getComputedStyle(e).textDecorationLine }));
  ok(c, "the old value is Vici's vc-stat__was, struck through", struck.tag === "S" && /\bvc-stat__was\b/.test(struck.cls) && /line-through/.test(struck.line), JSON.stringify(struck));
  const fixed = await kpi(page, "fixed");
  ok(c, "Records fixed is the engine's projection, the 0 struck through", fixed.was === "0" && fixed.value === int(f.closed) && fixed.unit === `of ${n}` && /^projected/.test(fixed.note), JSON.stringify(fixed));
  const t1 = await kpi(page, "time");
  await page.waitForTimeout(1300);
  const t2 = await kpi(page, "time");
  ok(c, "the clock stops at the decision", t1.value === t2.value && t2.state === "gain", `${t1.value} → ${t2.value}`);
  await goStep(page, 5);
  await approveDrafts(page);
  await page.waitForTimeout(300);
  const session = await kpi(page, "session");
  ok(c, "Session cost is the estimate of the same run, labelled as one", session.value === `≈ ${euroCents(exp.estimate.eur)}` && /estimate/.test(session.note), `${session.value} vs ${euroCents(exp.estimate.eur)}`);
  const guide = await page.$$eval("[data-fig]", (els) => Object.fromEntries(els.map((e) => [e.dataset.fig, e.textContent])));
  ok(c, "the guide quotes the engine's figures", guide["lead.yearly"] === euro(atStake) && guide["lead.left"] === euro(stakeAfter(exp, f).left) && guide["lead.n"] === n && guide["lead.age"] === `${int(exp.age.oldestDays)} days` && guide["lead.session"] === euroCents(exp.estimate.eur) && guide["lead.fixed"] === `${int(f.closed)} of ${n}`, JSON.stringify(guide));
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
    const want = stakeTile(exp, f);
    ok(c, `${sc.id}: Records fixed and At stake a year are the engine's`, fixed.value === int(f.closed) && sameTile(cost, want), `${fixed.value}/${int(f.closed)} ${JSON.stringify(cost)} vs ${JSON.stringify(want)}`);
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
    const stake = (await expectedRun(LEAD)).options.nothing.figures.gains_cost_eur_per_year;
    ok(c, "the accepted risk keeps the stake, says it goes on, and strikes nothing through", cost.value === euro(stake) && cost.note === "risk accepted: it goes on" && cost.state === "risk" && !cost.was, JSON.stringify(cost));
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
    const turn = await page.locator(".review .turn").textContent().catch(() => "");
    ok(c, "the review says it is your turn, and nothing says the agent is still checking", /^Your turn\s*Approve or reject each suggestion, then confirm\.$/.test(turn.trim()) && !(await page.locator(".story .step-wait").count()), turn);
    ok(c, "Approve all carries vc-attention while lines wait", (await page.$$eval("#stage .vc-attention", (els) => els.map((b) => b.id))).join() === "btn-review-all");
    ok(c, "Confirm waits until every line is decided", await page.isDisabled("#btn-review-confirm"));
    await page.click(".review-table tbody tr >> nth=0 >> [data-action=\"reject\"]");
    await page.click("#btn-review-all");
    ok(c, "Approve all decides every line", !(await page.isDisabled("#btn-review-confirm")));
    const turn2 = await page.locator(".review .turn").textContent().catch(() => "");
    ok(c, "then the turn asks for Confirm, which carries vc-attention", /^Your turn\s*Every line is decided: confirm the review\.$/.test(turn2.trim()) && (await page.$$eval("#stage .vc-attention", (els) => els.map((b) => b.id))).join() === "btn-review-confirm", turn2);
    await page.click("#btn-review-confirm");
    await page.waitForSelector(".case-card", { timeout: 10000 });
    ok(c, "after the review the case shows what you approved", /AI suggestions approved/.test(await page.locator(".case-card").innerText()) && exp.alert !== null);
    ok(c, 'and the story ends with "Next: what it costs"', (await page.locator("#btn-cta").textContent().catch(() => "")).trim() === "Next: what it costs");
    await context.close();
  }
});

// ---- lean ---------------------------------------------------------------------------------------------
const BAD = [[/\b(?:erp|dq|ui)_[a-z]+(?:_[a-z]+)*\b/, "a tool name"], [/\bU\d{3}\b/, "a user id"], [/\bDQ-\d{2}\b/, "a rule code"], [/—/, "an em dash"], [/\bundefined\b|\bNaN\b|\[object Object\]/, "a broken value"]];
const badIn = (text) => BAD.flatMap(([re, what]) => { const m = text.match(re); return m ? [`${what} (${m[0]})`] : []; });
await runCase("lean", async (c) => {
  ok(c, "self-test: planted tool name, user id, rule code and em dash are caught", badIn("Reads erp_get_record of U190 under DQ-07 — fine").length === 4 && badIn("Two rules flag 23 order lines").length === 0);
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
  const chapters = await page.$$eval("#guide .vc-guide__chapter", (els) => els.length);
  for (let i = 0; i < chapters; i += 1) { await sample(`the guide, chapter ${i + 1}`); await page.click("dialog.vc-guide [data-vc-guide-next]"); }
  ok(c, `the guide's ${chapters} chapters were all read, and its last Start closed it`, chapters >= 3 && !(await page.evaluate(() => document.getElementById("guide").open)));
  ok(c, "no step or chapter shows a tool name, a user id, a rule code, an em dash or a broken value", !seen.length, seen.join(" | "));
  await context.close();
});

// ---- guide --------------------------------------------------------------------------------------------
await runCase("guide", async (c) => {
  const isOpen = (page) => page.evaluate(() => document.getElementById("guide").open === true);
  const chapterOn = (page) => page.evaluate(() => [...document.querySelectorAll("#guide .vc-guide__chapter")].find((x) => !x.hidden)?.dataset.vcChapter || null);
  for (const [w, hgt] of [[1920, 1080], [1280, 720]]) {
    const { page, context } = await newPage({ width: w, height: hgt });
    await open(page, "", { guide: true });
    ok(c, `${w}: the guide opens by itself on a new tab`, await isOpen(page));
    const chapters = await page.$$eval("#guide .vc-guide__chapter", (els) => els.length);
    const over = [];
    for (let i = 0; i < chapters; i += 1) {
      const r = await page.evaluate(() => {
        const g = document.getElementById("guide");
        const box = g.getBoundingClientRect();
        const ch = [...g.querySelectorAll(".vc-guide__chapter")].find((x) => !x.hidden);
        const out = [];
        for (let el = ch; el && el !== g; el = el.parentElement) if (el.scrollHeight > el.clientHeight + 2 && getComputedStyle(el).overflowY !== "visible") out.push(`${el.className} ${el.scrollHeight}>${el.clientHeight}`);
        if (box.top < 0 || box.bottom > innerHeight + 1) out.push(`the dialog leaves the window (${Math.round(box.top)} to ${Math.round(box.bottom)})`);
        return { id: ch?.dataset.vcChapter, out };
      });
      if (r.out.length) over.push(`${r.id}: ${r.out.join(", ")}`);
      await page.click("#guide [data-vc-guide-next]");
    }
    ok(c, `${w}: each of its ${chapters} chapters fits the window without scrolling`, chapters >= 3 && !over.length, over.join(" | "));
    ok(c, `${w}: Start on the last chapter closes it`, !(await isOpen(page)));
    await page.reload();
    await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
    ok(c, `${w}: a reload in the same tab leaves it closed`, !(await isOpen(page)));
    await context.close();
  }
  const closed = await newPage();
  await open(closed.page, "?guide=0");
  ok(c, "?guide=0 keeps it closed", !(await isOpen(closed.page)));
  await closed.context.close();
  const talk = await newPage({ width: 1280, height: 720 });
  await open(talk.page, "?guide=present");
  ok(c, "?guide=present opens it on the talk track", (await isOpen(talk.page)) && (await chapterOn(talk.page)) === "present", await chapterOn(talk.page));
  // How it works: a row for each key figure, by the tile's own name; the talk track: three to seven timed steps.
  const shape = await talk.page.evaluate(() => {
    const names = [...document.querySelectorAll("[data-vc-kpi]")].map((e) => e.dataset.vcKpi);
    const rows = [...document.querySelectorAll('#guide [data-vc-chapter="how"] tbody tr')].map((tr) => ({ name: tr.querySelector("th")?.textContent.trim(), cells: tr.querySelectorAll("td").length, value: tr.querySelector("td:last-child")?.textContent.trim() }));
    const steps = [...document.querySelectorAll('#guide [data-vc-chapter="present"] .vc-guide__path > li')].map((li) => li.querySelector(".vc-guide__time")?.textContent.trim() || "");
    return { names, rows, steps };
  });
  const missing = shape.names.filter((n) => !shape.rows.some((r) => r.name === n && r.cells >= 2 && r.value));
  ok(c, "How it works has a row for each key figure: what it measures and its value in the case", shape.names.length === 4 && !missing.length, `missing: ${missing.join(", ")}; rows: ${JSON.stringify(shape.rows)}`);
  ok(c, "the talk track has three to seven steps, each with its time", shape.steps.length >= 3 && shape.steps.length <= 7 && shape.steps.every((t) => /^\d+(\.\d+)? min$/.test(t)), JSON.stringify(shape.steps));
  await talk.context.close();
  // Vici's own render check of the guide, against the page served over http.
  const vici = viciDir();
  if (!vici) {
    ok(c, "a ViciDesign checkout for check-guide-render.mjs (VICI_DIR or ../ViciDesign)", !REQUIRE_VICI, "none found");
    c["Vici's check-guide-render.mjs"] = "info: skipped, no ViciDesign checkout";
  } else {
    const r = await runChild(process.execPath, [path.join(vici, "scripts", "check-guide-render.mjs"), server.base], { cwd: vici, env: process.env }, 240000);
    ok(c, "Vici's check-guide-render.mjs passes against the page", r.status === 0 && /GUIDE BEHAVIOUR OK/.test(r.stdout), `exit ${r.status}: ${(r.stdout + r.stderr).split("\n").filter((l) => l.trim()).slice(-8).join(" | ")}`);
  }
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
          const out = { scrollX: doc.scrollWidth > innerWidth + 1, scrollY: doc.scrollHeight > innerHeight + 1, main: [], cut: [], panels: [], story: [] };
          for (const el of sel ? document.querySelectorAll(sel) : []) {
            const b = el.getBoundingClientRect();
            const inView = b.top >= 0 && b.left >= 0 && b.bottom <= innerHeight && b.right <= innerWidth && b.width > 0;
            const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
            out.main.push({ inView, covered: !(hit && (hit === el || el.contains(hit))) });
          }
          for (const el of document.querySelectorAll(".kpi .vc-stat__label, .kpi .kpi-note, .kpi .vc-stat__value")) if (el.scrollWidth > el.clientWidth + 1) out.cut.push(el.textContent.trim());
          for (const el of document.querySelectorAll(".stage .panel, .stage .drafts, .stage .options")) if (el.scrollHeight > el.clientHeight + 2) out.panels.push(el.className);
          // The story and the bar under it fit at every size: nothing of what just happened hides under the bar.
          for (const el of document.querySelectorAll(".stage .panel.story")) if (el.scrollHeight > el.clientHeight + 2) out.story.push(`${el.scrollHeight - el.clientHeight} px`);
          return out;
        }, main);
        if (r.scrollX || r.scrollY) problems.push(`${state}: the page scrolls ${r.scrollX ? "sideways" : ""}${r.scrollY ? " down" : ""}`);
        if (main && (!r.main.length || r.main.some((m) => !m.inView || m.covered))) problems.push(`${state}: the main action is out of view or covered (${JSON.stringify(r.main)})`);
        if (r.cut.length) problems.push(`${state}: cut key-figure text: ${r.cut.join(" | ")}`);
        if (w >= 1920 && r.panels.length) problems.push(`${state}: a panel needs scrolling: ${r.panels.join(", ")}`);
        if (r.story.length) problems.push(`${state}: the story needs scrolling (${r.story.join(", ")})`);
        await page.screenshot({ path: path.join(OUT, `${tag}-${state.replace(/\W+/g, "-")}.png`) });
      };
      await open(page);
      await look("0 the tip", "#btn-start");
      await page.click("#btn-start");
      await look("1 Spot", "#btn-cta");
      for (const n of [2, 3]) { await goStep(page, n); await look(`${n} step`, "#btn-cta"); }
      await goStep(page, 4);
      await look("4 Propose", '.opt[data-recommended="true"] [data-action="approve"]');
      await page.click('.opt[data-recommended="true"] [data-action="approve"]');
      await look("4 decided", "#btn-cta");
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
