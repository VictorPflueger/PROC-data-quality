// Layout checks for projector use (AC-17), at 1920×1080, 1600×900, 1536×864, 1366×768 and 1280×720,
// each in the light and the dark theme, through a Simulation of scenario 1: idle, the options, the
// outbox, the finished run with the Audit tab and its exports, and the Method and Diagnostics dialogs.
//   overflow  no horizontal overflow: the page never scrolls sideways and no panel, card or table on
//             screen scrolls or clips sideways
//   cut       nothing on the board or the tiles is cut: no ellipsis, no clamp that hides a line, no
//             text clipped by its box; every text on a hexagon cell lies inside the cell's hexagon
//   header    the header badges never cover the tiles and the control bar keeps one row
//   targets   every visible interactive element is at least 40 px high and wide (text links inside
//             sentences are part of the prose and exempt)
//   legible   no text on screen below 11 px; a hexagon cell's texts scale with the cell and never go
//             below 9.5 px (the names' 9.7 px at 1280 × 720 is the largest that fits the hexagon)
// Usage: node tests/layout.mjs [WIDTHxHEIGHT…]   prints "LAYOUT OK" when every viewport passes.
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { APP_ROOT, ONLY, outDir, launchBrowser, serveStatic, SKIP_INTRO } from "./lib/harness.mjs";

const VIEWPORTS = [[1920, 1080], [1600, 900], [1536, 864], [1366, 768], [1280, 720]];
const chosen = ONLY.length ? VIEWPORTS.filter(([w, h]) => ONLY.includes(`${w}x${h}`)) : VIEWPORTS;
const OUT = await outDir("layout");
const { base: BASE, close } = await serveStatic(APP_ROOT, 8800 + Math.floor(Math.random() * 400));
const browser = await launchBrowser();
const results = [];

async function newPage(width, height) {
  const context = await browser.newContext({ viewport: { width, height }, acceptDownloads: true });
  await context.addInitScript(SKIP_INTRO);
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort("blockedbyclient"));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message || e)));
  await page.goto(BASE);
  await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  return { context, page, errors };
}

/** Everything this file checks, measured in the page as it stands. Returns a list of problems. */
function measure(page, { dialog = false } = {}) {
  return page.evaluate(async ({ dialog }) => {
    // Sizes are taken at rest: entrance animations must have finished.
    const settle = Date.now() + 3000;
    while (Date.now() < settle && document.getAnimations().some((a) => a.effect?.getComputedTiming?.().iterations !== Infinity && a.playState === "running")) await new Promise((r) => setTimeout(r, 50));
    const out = [];
    const W = innerWidth;
    const H = innerHeight;
    const shown = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden" && !el.closest("[hidden]");
    const name = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${el.classList.length ? `.${[...el.classList].slice(0, 2).join(".")}` : ""} "${(el.innerText || el.getAttribute("aria-label") || el.title || "").trim().replace(/\s+/g, " ").slice(0, 32)}"`;
    const root = dialog ? document.querySelector("dialog[open]") : document;

    // 1. Horizontal overflow: the page, and every element on screen that scrolls or clips sideways.
    if (!dialog && document.documentElement.scrollWidth > W + 1) out.push(`the page scrolls sideways (${document.documentElement.scrollWidth} > ${W})`);
    // What sticks out of a clipping box sideways: an element of its own or a line of text.
    const clipped = (el) => {
      const box = el.getBoundingClientRect();
      const left = box.left + el.clientLeft;
      const right = left + el.clientWidth;
      for (const k of el.querySelectorAll("*")) {
        if (!shown(k) || k.closest(".vc-visually-hidden, .vc-icon, svg")) continue;
        const q = k.getBoundingClientRect();
        if (q.width && (q.right > right + 1 || q.left < left - 1)) return name(k);
      }
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent.trim() || !shown(n.parentElement) || n.parentElement.closest(".vc-visually-hidden")) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const q of range.getClientRects()) if (q.right > right + 1 || q.left < left - 1) return `"${n.textContent.trim().slice(0, 30)}"`;
      }
      return null;
    };
    for (const el of root.querySelectorAll("*")) {
      if (!shown(el)) continue;
      const cs = getComputedStyle(el);
      if (!/(auto|scroll|hidden|clip)/.test(cs.overflowX)) continue;
      if (el.scrollWidth <= el.clientWidth + 1) continue;
      const r = el.getBoundingClientRect();
      if (r.right < 0 || r.left > W || r.bottom < 0 || r.top > H || r.width < 2) continue;
      // Clipping inside a hexagon face or an icon is drawing, not text; visually hidden text is meant to be.
      if (el.closest(".hex-face, .vc-icon, svg, .vc-visually-hidden")) continue;
      // A track that only holds absolutely placed hexagons is sized by js/board.js (checked below).
      if (el.matches(".hex-strip")) continue;
      // The shared shell's pickers end a long choice in an ellipsis by design (components.css); their
      // menus and the console's tip card show it in full (DESIGN.md, deviations).
      if (el.matches(".dropdown-toggle .value")) continue;
      if (/(auto|scroll)/.test(cs.overflowX)) { out.push(`${name(el)} scrolls sideways (${el.scrollWidth} > ${el.clientWidth})`); continue; }
      const what = clipped(el);
      if (what) out.push(`${name(el)} clips ${what} sideways (${el.scrollWidth} > ${el.clientWidth})`);
    }

    if (!dialog) {
      // 2. Nothing on the board or the tiles is cut.
      for (const el of document.querySelectorAll("#board *, #kpis *")) {
        if (!shown(el)) continue;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > H) continue;
        const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (cs.textOverflow === "ellipsis" && el.scrollWidth > el.clientWidth + 1) out.push(`${name(el)} is cut to an ellipsis`);
        const clamp = cs.webkitLineClamp && cs.webkitLineClamp !== "none";
        if (clamp && el.scrollHeight > el.clientHeight + 1) out.push(`${name(el)} hides a line (clamp ${cs.webkitLineClamp})`);
        if (ownText && /(hidden|clip)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1 && !el.closest(".vc-visually-hidden")) out.push(`${name(el)} clips its text`);
      }
      // Every text on a cell lies inside the cell's hexagon (flat-top: 25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%).
      for (const cell of document.querySelectorAll(".hex-cell")) {
        if (!shown(cell)) continue;
        const face = cell.querySelector(".hex-face").getBoundingClientRect();
        if (face.bottom < 0 || face.top > H) continue;
        const cx = face.left + face.width / 2;
        const cy = face.top + face.height / 2;
        const inside = (x, y) => {
          const dy = Math.abs(y - cy);
          if (dy > face.height / 2 + 0.5) return false;
          const half = face.width / 2 - (dy / (face.height / 2)) * (face.width / 4);
          return Math.abs(x - cx) <= half + 0.5;
        };
        const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (!n.textContent.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(n);
          for (const q of range.getClientRects()) {
            if (![[q.left, q.top], [q.right, q.top], [q.left, q.bottom], [q.right, q.bottom]].every(([x, y]) => inside(x, y))) {
              out.push(`${cell.dataset.rule}: "${n.textContent.trim()}" leaves the hexagon (${Math.round(q.width)}×${Math.round(q.height)} in a ${Math.round(face.width)} px face)`);
              break;
            }
          }
        }
        // The mark icon too.
        const mark = cell.querySelector(".hex-mark .vc-icon");
        if (mark) {
          const q = mark.getBoundingClientRect();
          if (q.width && ![[q.left, q.top], [q.right, q.top], [q.left, q.bottom], [q.right, q.bottom]].every(([x, y]) => inside(x, y))) out.push(`${cell.dataset.rule}: the state mark leaves the hexagon`);
        }
      }
      // Cells of one strip never cover each other, and every strip stays inside its card.
      for (const strip of document.querySelectorAll(".hex-strip")) {
        if (!shown(strip)) continue;
        const card = strip.closest(".board-card, .vc-card") || strip.parentElement;
        const s = strip.getBoundingClientRect();
        const c = card.getBoundingClientRect();
        if (s.right > c.right + 1 || s.left < c.left - 1) out.push(`a strip of cells leaves its card (${Math.round(s.left)}–${Math.round(s.right)} in ${Math.round(c.left)}–${Math.round(c.right)})`);
      }

      // 3. The header: badges never cover the tiles; the control bar keeps one row.
      const items = [...document.querySelectorAll(".header-badges > *")].filter(shown).map((e) => e.getBoundingClientRect());
      const kpis = document.querySelector("#kpis").getBoundingClientRect();
      if (items.some((r) => r.right > kpis.left - 4 && r.bottom > kpis.top && r.top < kpis.bottom)) out.push("the header badges cover the tiles");
      const controls = [...document.querySelectorAll("#controls > *")].filter(shown).map((e) => e.getBoundingClientRect());
      const tops = new Set(controls.map((r) => Math.round(r.top + r.height / 2) >> 3));
      if (tops.size > 1) out.push(`the control bar wraps to ${tops.size} rows`);
    }

    // 4. Targets: every visible interactive element is at least 40 px high and wide.
    const sel = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"], [role="menuitemradio"], [tabindex="0"]';
    for (const el of root.querySelectorAll(sel)) {
      if (!shown(el)) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (r.bottom < 0 || r.top > H || r.right < 0 || r.left > W) continue;
      // Behind an open dialog the page is inert: only the dialog's targets count then.
      if (!dialog && document.querySelector("dialog[open]")) continue;
      if (el.tagName === "A" && el.closest("p, li, td, .md, .report-full, .vc-dialog__body > p")) continue;
      // A scrollable region made focusable for the keyboard is a region, not a target.
      if (el.matches('[tabindex="0"]') && !el.matches("button, a, input, select, textarea, summary, [role]")) continue;
      if (r.height < 40 - 0.5 || r.width < 40 - 0.5) out.push(`target ${name(el)} is ${Math.round(r.width)}×${Math.round(r.height)}`);
    }

    // 5. Legibility: no text on screen below 11 px, except on a hexagon cell, whose texts scale with the
    //    cell: at 1280 × 720 the names' 9.7 px is the largest that stays inside the hexagon (10.4 px
    //    leaves it), so a cell's text may not shrink below 9.5 px. The smallest sizes are reported.
    for (const n of textNodes(root, shown, W, H)) {
      const cell = n.el.closest(".hex-cell");
      if (n.size < (cell ? 9.5 : 11) - 0.05) out.push(`text ${name(n.el)} is ${n.size.toFixed(1)} px`);
    }
    return [...new Set(out)];

    function textNodes(scope, isShown, w, h) {
      const list = [];
      const walker = document.createTreeWalker(scope === document ? document.body : scope, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        const el = t.parentElement;
        if (!t.textContent.trim() || !el || !isShown(el) || el.closest(".vc-visually-hidden, [aria-hidden='true'], svg, script, style")) continue;
        let faded = false;
        for (let a = el; a; a = a.parentElement) if (Number(getComputedStyle(a).opacity) === 0) { faded = true; break; }
        if (faded) continue;
        const r = el.getBoundingClientRect();
        if (!r.width || r.bottom < 0 || r.top > h || r.right < 0 || r.left > w) continue;
        list.push({ el, size: parseFloat(getComputedStyle(el).fontSize) });
      }
      return list;
    }
  }, { dialog });
}

/** The smallest text sizes on screen: on the hexagon cells and elsewhere (for the report). */
function smallestText(page) {
  return page.evaluate(() => {
    const out = { cell: Infinity, other: Infinity, otherWhat: "" };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const el = t.parentElement;
      if (!t.textContent.trim() || !el || el.getClientRects().length === 0 || getComputedStyle(el).visibility === "hidden" || el.closest("[hidden], .vc-visually-hidden, [aria-hidden='true'], svg, script, style")) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (el.closest(".hex-cell")) out.cell = Math.min(out.cell, size);
      else if (size < out.other) { out.other = size; out.otherWhat = t.textContent.trim().slice(0, 24); }
    }
    return out;
  });
}

async function themeTo(page, theme) {
  // The header's toggle, as the presenter uses it; behind an open dialog the page is inert, so then the
  // theme is set as the toggle sets it.
  const now = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, dialog: !!document.querySelector("dialog[open]") }));
  if (now.theme !== theme && !now.dialog) await page.click(".theme-toggle");
  else if (now.theme !== theme) await page.evaluate((t) => { document.documentElement.setAttribute("data-theme", t); try { localStorage.setItem("vc-theme", t); } catch { /* blocked */ } }, theme);
  await page.waitForFunction((t) => document.documentElement.dataset.theme === t, theme);
  await page.waitForTimeout(150);
}

/** Measures the state in both themes, with a screenshot of each. */
async function check(page, problems, label, w, h, opts = {}) {
  for (const theme of ["light", "dark"]) {
    await themeTo(page, theme);
    for (const p of await measure(page, opts)) problems.push(`${label} (${theme}): ${p}`);
    await page.screenshot({ path: path.join(OUT, `vp-${w}x${h}-${label.replace(/\W+/g, "-")}-${theme}.png`) });
  }
  await themeTo(page, "light");
}

for (const [w, h] of chosen) {
  const { context, page, errors } = await newPage(w, h);
  const problems = [];
  let smallest = null;
  try {
    await check(page, problems, "idle", w, h);
    await page.click("#btn-method");
    await page.waitForSelector(".method-modal[open]");
    await check(page, problems, "method dialog", w, h, { dialog: true });
    await page.keyboard.press("Escape");
    await page.click("#btn-diagnostics");
    await page.waitForSelector("#diag-params");
    await check(page, problems, "diagnostics", w, h, { dialog: true });
    await page.keyboard.press("Escape");
    await page.click("#btn-start");
    await page.waitForSelector("#btn-mode-simulation");
    await check(page, problems, "mode dialog", w, h, { dialog: true });
    await page.click("#btn-mode-simulation");
    await page.click(".segmented button[aria-label='Replay speed ×4']");
    await page.waitForSelector('.option-card[data-recommended="true"] [data-action="approve"]', { state: "visible", timeout: 120000 });
    await page.waitForFunction(() => /Awaiting your decision/.test(document.querySelector(".status-pill .text")?.textContent || ""), null, { timeout: 60000 });
    await check(page, problems, "options", w, h);
    smallest = await smallestText(page);
    await page.click('.option-card[data-recommended="true"] [data-action="approve"]');
    await page.waitForSelector('.action-card[data-status="pending"] [data-action="approve"]', { state: "visible", timeout: 120000 });
    await page.waitForTimeout(400);
    await check(page, problems, "outbox", w, h);
    const t0 = Date.now();
    while (!(await page.locator(".entry[data-end]").count())) {
      if (Date.now() - t0 > 120000) throw new Error("the replay did not end in time");
      const pending = page.locator('.action-card[data-status="pending"] [data-action="approve"]');
      if (await pending.count()) await pending.first().click();
      await page.waitForTimeout(150);
    }
    await page.click("#tab-audit");
    await page.waitForTimeout(300);
    await check(page, problems, "done, audit and exports", w, h);
    // The rule table of the case, opened from its cell.
    await page.click("#cell-DQ-01");
    await page.waitForSelector("#ex-card:not([hidden])");
    await page.waitForTimeout(200);
    await check(page, problems, "a rule's exceptions", w, h);
    await page.click("#btn-ex-close");
    await page.click("#view-people");
    await page.waitForTimeout(200);
    await check(page, problems, "people", w, h);
  } catch (e) { problems.push(`exception: ${String(e.message).split("\n")[0]}`); }
  problems.push(...errors.map((e) => `page error: ${e}`));
  results.push({ name: `${w}×${h}, light and dark: idle, Method, Diagnostics, mode dialog, options, outbox, done with the exports, a rule's table, people`, ok: !problems.length, problems,
    smallest: smallest && `smallest text with the options on screen: ${smallest.cell.toFixed(1)} px on the cells, ${smallest.other.toFixed(1)} px elsewhere ("${smallest.otherWhat}")` });
  await context.close();
}

await browser.close();
await close();
await writeFile(path.join(OUT, "layout-results.json"), JSON.stringify(results, null, 2));
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}`);
  if (r.smallest) console.log(`      ${r.smallest}`);
  for (const p of r.problems.slice(0, 40)) console.log(`      - ${p}`);
  if (r.problems.length > 40) console.log(`      … and ${r.problems.length - 40} more`);
}
const allOk = results.length > 0 && results.every((r) => r.ok);
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} viewports passed. Screenshots: ${OUT}`);
if (allOk && chosen.length === VIEWPORTS.length) console.log("LAYOUT OK");
process.exit(allOk ? 0 : 1);
