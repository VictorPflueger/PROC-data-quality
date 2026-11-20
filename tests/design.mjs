// Design checks and review captures (DESIGN.md), each in the light and the dark theme:
//   states   the colour grammar in the running app, measured against Vici's tokens of the theme on
//            screen: each hexagon cell's face and rim in its state's tokens (danger: high severity,
//            open; warning: medium or low, open; success: nothing open; neutral: not scanned), the
//            legend in the same colours, the people view's pips; merlot only for the person's turn
//            and decisions (the rail's "Your decision" and "Your approval", the recommended option's
//            frame, the status pill while it waits for you, the approved path, drafts and rows, which
//            never take the data's success green) and never on what the AI wrote, which wears the
//            lilac AI label; the label opens its note on click and closes on Escape, giving the focus
//            back; the finished run's rail ends with every step done and the pill reads Done; the
//            intro window's steps in ink, "Check" in fjord and "Propose" in merlot, never a state tone
//   review   screenshots for a design review: the options at 1920×1080 as rendered and under a
//            simulated projector washout, and the finished run as seen with protanopia,
//            deuteranopia and tritanopia (Machado et al. 2009 matrices in linear RGB, as in
//            tests/tokens.mjs); the dark theme's files end in -dark
// Usage: node tests/design.mjs [case…]   prints "DESIGN OK" when every check passes.
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { APP_ROOT, ONLY, outDir, wanted, launchBrowser, serveStatic, SKIP_INTRO } from "./lib/harness.mjs";

const OUT = await outDir("design");
const { base: BASE, close } = await serveStatic(APP_ROOT, 9200 + Math.floor(Math.random() * 400));
const browser = await launchBrowser();
const results = [];
const suffix = (theme) => (theme === "light" ? "" : `-${theme}`);

// Severity 1.0 (dichromacy): the matrices of tests/tokens.mjs.
const CVD = {
  "Normal vision": null,
  Protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  Deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  Tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]]
};
// A projector in a lit room: lower contrast, brighter, less saturated.
const WASHOUT = "contrast(0.62) brightness(1.18) saturate(0.8)";
const THEMES = ["light", "dark"];

/** A page in the given theme: the visitor's choice as Vici remembers it (vc-theme), read by js/theme.js. */
async function newPage(theme = "light") {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, colorScheme: theme });
  await context.addInitScript(SKIP_INTRO);
  await context.addInitScript((t) => { try { localStorage.setItem("vc-theme", t); } catch { /* blocked storage */ } }, theme);
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort("blockedbyclient"));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message || e)));
  await page.goto(BASE);
  await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
  const shown = await page.evaluate(() => document.documentElement.dataset.theme);
  if (shown !== theme) errors.push(`the page shows the ${shown} theme, not the ${theme} one`);
  return { context, page, errors };
}

const pillText = (page) => page.$eval(".status-pill .text", (e) => e.textContent.trim());
const waitPill = (page, re, timeout = 60000) =>
  page.waitForFunction((src) => new RegExp(src).test(document.querySelector(".status-pill .text")?.textContent || ""), re.source, { timeout });
const railNow = (page) => page.evaluate(() => {
  const cur = document.querySelector('.rail-step[aria-current="step"]');
  return { step: cur?.dataset.step || null, state: cur?.dataset.state || null, turn: cur?.querySelector(".rail-turn")?.textContent.trim() || null, states: [...document.querySelectorAll(".rail-step")].map((s) => s.dataset.state) };
});

/** The colour grammar on screen against the theme's tokens. Returns { mismatches, counted }. */
function grammar(page) {
  return page.evaluate(() => {
    const probe = document.createElement("i");
    document.body.append(probe);
    const colour = (name) => { probe.style.color = `var(${name})`; return getComputedStyle(probe).color; };
    const out = { mismatches: [], counted: {} };
    const miss = (what, got, want) => { if (got !== want) out.mismatches.push(`${what}: ${got} ≠ ${want}`); };
    // The cells: face in the state's background and text, rim in its border (unless the agent marks or
    // reads the cell, or it is open).
    const FACE = { danger: ["--vc-danger-bg", "--vc-danger-text", "--vc-danger-border"], warning: ["--vc-warning-bg", "--vc-warning-text", "--vc-warning-border"],
      success: ["--vc-success-bg", "--vc-success-text", "--vc-success-border"], neutral: ["--vc-neutral-bg", "--vc-neutral-text", "--vc-border"] };
    for (const cell of document.querySelectorAll(".hex-cell")) {
      const st = cell.dataset.state;
      const [bg, fg, rim] = FACE[st];
      const face = getComputedStyle(cell.querySelector(".hex-face"));
      out.counted[st] = (out.counted[st] || 0) + 1;
      miss(`${cell.dataset.rule} face (${st})`, face.backgroundColor, colour(bg));
      miss(`${cell.dataset.rule} text (${st})`, face.color, colour(fg));
      const marked = cell.dataset.focus === "true" || cell.dataset.reading === "true" || cell.getAttribute("aria-expanded") === "true" || cell.matches(":focus-visible");
      if (!marked) miss(`${cell.dataset.rule} rim (${st})`, getComputedStyle(cell).backgroundColor, colour(rim));
      if (cell.dataset.focus === "true" && cell.dataset.reading !== "true" && cell.getAttribute("aria-expanded") !== "true") miss(`${cell.dataset.rule} rim (marked by the agent)`, getComputedStyle(cell).backgroundColor, colour("--vc-info-solid"));
      // The state mark: a cross for danger, a bar and dot for warning, a tick for success.
      const mark = cell.querySelector(".hex-mark .vc-icon");
      const want = { danger: "error", warning: "warning", success: "success" }[st];
      if (want && !mark?.classList.contains(`vc-icon--${want}`)) out.mismatches.push(`${cell.dataset.rule}: the ${st} mark is missing`);
      if (!want && mark) out.mismatches.push(`${cell.dataset.rule}: a neutral cell carries a mark`);
    }
    // The legend in the same colours.
    for (const [st, token] of [["danger", "--vc-danger-solid"], ["warning", "--vc-warning-text"], ["success", "--vc-success-solid"]]) {
      const icon = document.querySelector(`.hex-legend li[data-state="${st}"] .vc-icon`);
      miss(`legend ${st}`, icon ? getComputedStyle(icon).color : "missing", colour(token));
    }
    miss("legend reading", getComputedStyle(document.querySelector(".legend-hex--reading")).backgroundColor, colour("--vc-info-solid"));
    // The people view's pips, when they are on screen.
    for (const pip of document.querySelectorAll(".pip")) {
      if (!pip.getClientRects().length) continue;
      const want = pip.dataset.state === "danger" ? "--vc-danger-solid" : "--vc-warning-text";
      miss(`pip ${pip.dataset.state}`, getComputedStyle(pip).backgroundColor, colour(want));
      out.counted.pips = (out.counted.pips || 0) + 1;
    }
    // What the AI wrote wears the lilac label, never merlot.
    for (const chip of document.querySelectorAll(".ai-label-chip")) {
      if (!chip.getClientRects().length) continue;
      miss("AI label", getComputedStyle(chip, "::before").backgroundColor, colour("--vc-feature-bg"));
      out.counted.ai = (out.counted.ai || 0) + 1;
    }
    // Merlot: the recommended option's frame, the letter on it, and the person's turn on the rail.
    const rec = document.querySelector('.option-card[data-recommended="true"]');
    if (rec && rec.getClientRects().length) {
      miss("recommended frame", getComputedStyle(rec).borderTopColor, colour("--vc-accent"));
      miss("recommended letter", getComputedStyle(rec.querySelector(".option-letter")).backgroundColor, colour("--vc-accent"));
      out.counted.recommended = 1;
    }
    const yours = document.querySelector('.rail-step[data-state="yours"] .vc-step__marker');
    if (yours) { miss("rail: your turn", getComputedStyle(yours, "::before").backgroundColor, colour("--vc-accent")); out.counted.yours = 1; }
    probe.remove();
    return out;
  });
}

async function toOptions(page) {
  await page.click("#btn-start");
  await page.click("#btn-mode-simulation");
  await page.click(".segmented button[aria-label='Replay speed ×4']");
  await page.waitForSelector('.option-card[data-recommended="true"] [data-action="approve"]', { state: "visible", timeout: 120000 });
  await waitPill(page, /^Awaiting your decision$/);
}
async function toDrafts(page) {
  await page.click('.option-card[data-recommended="true"] [data-action="approve"]');
  await page.waitForSelector('.action-card[data-status="pending"] [data-action="approve"]', { state: "visible", timeout: 120000 });
}
async function toDone(page) {
  const t0 = Date.now();
  while (!(await page.locator(".entry[data-end]").count())) {
    if (Date.now() - t0 > 120000) throw new Error("the replay did not end in time");
    const pending = page.locator('.action-card[data-status="pending"] [data-action="approve"]');
    if (await pending.count()) await pending.first().click();
    await page.waitForTimeout(150);
  }
}
// Let the reading pulses (2.4 s each) fade before the rims are measured.
const calm = (page) => page.waitForFunction(() => !document.querySelector('[data-reading="true"]'), null, { timeout: 8000 }).catch(() => {});

for (const theme of wanted("states") ? THEMES : []) {
  const { context, page, errors } = await newPage(theme);
  const problems = [];
  try {
    // Idle: fifteen neutral cells.
    const idle = await grammar(page);
    problems.push(...idle.mismatches.map((m) => `idle: ${m}`));
    if (idle.counted.neutral !== 15) problems.push(`idle: ${idle.counted.neutral} neutral cells, not 15`);

    // The intro window's steps (review finding R14): never the data's state tones; ink (Vici's outlined
    // marker, as on the progress rail), "Check" in fjord, "Propose" in merlot.
    await page.click("#btn-about");
    await page.waitForSelector(".intro-steps .intro-step");
    await page.waitForTimeout(400);
    const intro = await page.evaluate(() => {
      const probe = document.createElement("i");
      document.body.append(probe);
      const colour = (name) => { probe.style.color = `var(${name})`; return getComputedStyle(probe).color; };
      // Ink: Vici's own stepper marker, an outlined hexagon in the strong border with muted digits.
      const ink = ["--vc-border-strong", "--vc-text-muted"];
      const want = { spot: ink, check: ["--vc-info-bg", "--vc-info-text"], calculate: ink, propose: ["--vc-accent", "--vc-on-accent"], prepare: ink };
      const states = ["--vc-danger-bg", "--vc-warning-bg", "--vc-success-bg", "--vc-danger-text", "--vc-warning-text", "--vc-success-text"].map(colour);
      const out = [];
      for (const step of document.querySelectorAll(".intro-steps .intro-step")) {
        const m = step.querySelector(".vc-step__marker");
        const bg = getComputedStyle(m, "::before").backgroundColor;
        const fg = getComputedStyle(m).color;
        const [wb, wf] = want[step.dataset.tone] || [];
        if (states.includes(bg) || states.includes(fg)) out.push(`${step.dataset.tone} in a state tone`);
        if (bg !== colour(wb) || fg !== colour(wf)) out.push(`${step.dataset.tone}: ${bg} on ${fg}, not ${wb} on ${wf}`);
      }
      probe.remove();
      return { out, n: document.querySelectorAll(".intro-steps .intro-step").length };
    });
    if (intro.n !== 5) problems.push(`intro: ${intro.n} steps, not 5`);
    problems.push(...intro.out.map((m) => `intro: ${m}`));
    await page.screenshot({ path: path.join(OUT, `states-intro${suffix(theme)}.png`) });
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("dialog[open]"));

    await toOptions(page);
    await calm(page);
    let rail = await railNow(page);
    if (rail.step !== "propose" || rail.state !== "yours" || rail.turn !== "Your decision") problems.push(`options: the rail shows ${JSON.stringify(rail)}`);
    if (!(await page.locator('.status-pill[data-tone="waiting"].vc-tag--accent').count())) problems.push("options: the status pill is not in the waiting (merlot) tone");
    const atOptions = await grammar(page);
    problems.push(...atOptions.mismatches.map((m) => `options: ${m}`));
    if (!atOptions.counted.danger || !atOptions.counted.success || !atOptions.counted.recommended || !atOptions.counted.yours || !atOptions.counted.ai) problems.push(`options: not every tone is on screen to check (${JSON.stringify(atOptions.counted)})`);

    // The AI label opens its note on click, closes on Escape and gives the focus back.
    await page.click(".options-summary-head .ai-label");
    const tip = await page.$eval(".options-summary-head .ai-tip", (t) => ({ hidden: t.hidden, text: t.textContent }));
    if (tip.hidden || !/AI-proposed fix paths/.test(tip.text) || !/Scripted replay/.test(tip.text)) problems.push(`options: the AI label's note reads ${JSON.stringify(tip).slice(0, 160)}`);
    await page.keyboard.press("Escape");
    const after = await page.evaluate(() => ({ hidden: document.querySelector(".options-summary-head .ai-tip").hidden, focus: document.activeElement?.classList.contains("ai-label") }));
    if (!after.hidden || !after.focus) problems.push(`options: the AI label after Escape ${JSON.stringify(after)}`);
    await page.screenshot({ path: path.join(OUT, `states-options${suffix(theme)}.png`) });

    await toDrafts(page);
    await waitPill(page, /^Awaiting your approval$/);
    rail = await railNow(page);
    if (rail.step !== "prepare" || rail.state !== "yours" || rail.turn !== "Your approval") problems.push(`drafts: the rail shows ${JSON.stringify(rail)}`);
    const drafts = await page.$$eval(".action-card", (c) => c.length);
    const draftLabels = await page.$$eval(".action-card .ai-label", (l) => l.length);
    if (!drafts || draftLabels !== drafts) problems.push(`drafts: ${draftLabels} AI labels on ${drafts} drafts`);

    await toDone(page);
    await waitPill(page, /^Done$/);
    await calm(page);
    rail = await railNow(page);
    if (rail.states.some((s) => s !== "done")) problems.push(`done: the rail's states ${rail.states.join(", ")}`);
    if (!(await page.locator('.status-pill[data-tone="done"].vc-tag--success').count())) problems.push("done: the status pill is not in the success tone");
    const done = await grammar(page);
    problems.push(...done.mismatches.map((m) => `done: ${m}`));
    if (!(await page.$("#console .report-card .ai-label"))) problems.push("done: no AI label on the report");
    // Decisions are the person's, in merlot, never in the data's success green: the approved path's
    // card, its status, the approved drafts, and the case's rows, which read approved, re-scan pending
    // and stay open (the cell keeps its danger state).
    const decided = await page.evaluate(() => {
      const probe = document.createElement("i");
      document.body.append(probe);
      const colour = (name) => { probe.style.color = `var(${name})`; return getComputedStyle(probe).color; };
      const card = document.querySelector('.option-card[data-status="approved"]');
      const out = {
        frame: card ? getComputedStyle(card).borderTopColor === colour("--vc-accent") : false,
        status: card ? card.querySelector(".option-status .vc-tag").classList.contains("vc-tag--accent") : false,
        drafts: [...document.querySelectorAll('.action-card[data-status="approved"] .action-status')].map((e) => e.classList.contains("vc-tag--accent")),
        green: [...document.querySelectorAll(".option-status .vc-tag, .action-status, .ex-status .vc-tag, .people-path .vc-tag")].filter((e) => e.classList.contains("vc-tag--success")).map((e) => e.textContent)
      };
      probe.remove();
      return out;
    });
    if (!decided.frame || !decided.status) problems.push(`done: the approved path's card or status is not merlot (${JSON.stringify(decided)})`);
    if (!decided.drafts.length || decided.drafts.some((x) => !x)) problems.push(`done: approved drafts not in merlot's tint (${JSON.stringify(decided.drafts)})`);
    if (decided.green.length) problems.push(`done: decisions in the success green: ${decided.green.join(" / ")}`);
    await page.click(".drawer-toggle");
    await page.click("#cell-DQ-01");
    const tags = await page.$$eval("#ex-table tbody tr[data-exception] .ex-status .vc-tag:first-child", (els) => els.map((e) => `${e.textContent}|${e.classList.contains("vc-tag--accent")}`));
    if (!tags.length || tags.some((x) => x !== "approved, re-scan pending|true")) problems.push(`done: the case's status tags ${[...new Set(tags)].join(" / ")}`);
    if ((await page.getAttribute("#cell-DQ-01", "data-state")) !== "danger") problems.push("done: the case's cell no longer shows its open exceptions in danger");
    await page.click("#btn-ex-close");
    await page.click("#view-people");
    const people = await grammar(page);
    problems.push(...people.mismatches.map((m) => `people: ${m}`));
    if (!people.counted.pips) problems.push("people: no pips on screen to check");
    await page.screenshot({ path: path.join(OUT, `states-people${suffix(theme)}.png`) });
  } catch (e) { problems.push(`exception: ${String(e.message).split("\n")[0]}`); }
  problems.push(...errors.map((e) => `page error: ${e}`));
  results.push({ name: `colour grammar, merlot for your turn, lilac AI labels (${theme} theme)`, ok: !problems.length, problems });
  await context.close();
}

for (const theme of wanted("review") ? THEMES : []) {
  const { context, page, errors } = await newPage(theme);
  const problems = [];
  const files = [];
  const file = (name) => `${name}${suffix(theme)}.png`;
  try {
    await toOptions(page);
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(OUT, file("review-options")) });
    await page.evaluate((f) => { document.documentElement.style.filter = f; }, WASHOUT);
    await page.screenshot({ path: path.join(OUT, file("review-options-washout")) });
    await page.evaluate(() => { document.documentElement.style.filter = ""; });
    files.push(file("review-options"), file("review-options-washout"));

    await toDrafts(page);
    await toDone(page);
    // The finished run with the drawer hidden: the whole board.
    await page.click(".drawer-toggle").catch(() => {});
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("width", "0");
      svg.setAttribute("height", "0");
      svg.style.position = "absolute";
      // Filter primitives work in linear RGB by default, which is where the matrices apply.
      svg.innerHTML = '<filter id="cvd-sim" color-interpolation-filters="linearRGB"><feColorMatrix id="cvd-matrix" type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"/></filter>';
      document.body.appendChild(svg);
    });
    const shots = { full: [], board: [] };
    const boardBox = await page.$eval("#board", (m) => { const r = m.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, innerHeight - r.y) }; });
    for (const [name, m] of Object.entries(CVD)) {
      await page.evaluate((mat) => {
        const values = mat ? `${mat[0].join(" ")} 0 0 ${mat[1].join(" ")} 0 0 ${mat[2].join(" ")} 0 0 0 0 0 1 0` : "1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0";
        document.getElementById("cvd-matrix").setAttribute("values", values);
        document.body.style.filter = mat ? "url(#cvd-sim)" : "";
      }, m);
      await page.waitForTimeout(300);
      shots.full.push([name, (await page.screenshot()).toString("base64")]);
      shots.board.push([name, (await page.screenshot({ clip: boardBox })).toString("base64")]);
    }
    await page.evaluate(() => { document.body.style.filter = ""; });

    const sheet = await context.newPage();
    for (const [kind, list] of Object.entries(shots)) {
      await sheet.setViewportSize({ width: 1920, height: 200 }); // the full-page capture grows to fit
      await sheet.setContent(`<!doctype html><html><body style="margin:0;background:#fff;font:600 20px Arial,sans-serif;color:#2c1f21">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:12px">${list.map(([n, b]) =>
          `<figure style="margin:0"><figcaption style="padding:2px 2px 6px">${n}</figcaption><img style="width:100%;display:block;border:1px solid #e5d9db" src="data:image/png;base64,${b}"></figure>`).join("")}</div></body></html>`);
      await sheet.waitForTimeout(200);
      await sheet.screenshot({ path: path.join(OUT, file(`review-cvd-${kind}`)), fullPage: true });
      files.push(file(`review-cvd-${kind}`));
    }
    await sheet.close();
  } catch (e) { problems.push(`exception: ${String(e.message).split("\n")[0]}`); }
  problems.push(...errors.map((e) => `page error: ${e}`));
  results.push({ name: `review captures (${files.length} files, ${theme} theme)`, ok: !problems.length && files.length === 4, problems });
  await context.close();
}

await browser.close();
await close();
await writeFile(path.join(OUT, "design-results.json"), JSON.stringify(results, null, 2));
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}`);
  for (const p of r.problems.slice(0, 30)) console.log(`      - ${p}`);
}
const allOk = results.length > 0 && results.every((r) => r.ok);
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} design checks passed. Screenshots: ${OUT}`);
if (allOk && ONLY.length === 0) console.log("DESIGN OK");
process.exit(allOk ? 0 : 1);
