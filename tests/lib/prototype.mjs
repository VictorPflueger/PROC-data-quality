// What differs between the prototypes in the shared Vici tests (tests/tokens.mjs, tests/hexagon.mjs,
// tests/page-icon.mjs and tests/vici-files.mjs). Those four files are the same in every prototype;
// this file is the one place that is not. Everything here is the Data Quality Agent's.

/** The prototype's name, as on its page and on its card on Victor's website. */
export const NAME = "Data Quality Agent";

/**
 * Colour pairs only this prototype draws (the shared shell's pairs are in tests/tokens.mjs):
 * [what, foreground token, background token, kind]. kind "text" needs 4.5:1, "mark" (a line, an icon,
 * a control's border, a bar) 3:1 (WCAG 2.2, 1.4.3 and 1.4.11). Tokens are Vici's, without "--vc-".
 * Decorative outlines (cards, table rules, a cell's rim in its state's border colour) carry no
 * information and are not listed, as in the shared shell's pairs.
 */
export const COLOUR_PAIRS = [
  // The data-quality board: its canvas (bg-sunken) holds cards on the surface.
  ["The board's caption and card titles", "text", "surface", "text"],
  ["Rule details, card notes and the cohort table's dates", "text-muted", "surface", "text"],
  ["A rule's hexagon before a scan: its number (neutral)", "neutral-text", "neutral-bg", "text"],
  ["The cohort table's figures and its total row", "text", "surface", "text"],
  // The honeycomb's cells after a scan: id, count, name and mark on the state's tint.
  ["A high-severity rule with open exceptions: words and cross", "danger-text", "danger-bg", "text"],
  ["A medium- or low-severity rule with open exceptions: words and bar and dot", "warning-text", "warning-bg", "text"],
  ["A rule with nothing open: words and tick", "success-text", "success-bg", "text"],
  ["What the agent reads: the fjord rim of a cell", "info-solid", "surface", "mark"],
  ["The legend's warning mark", "warning-text", "surface", "mark"],
  ["The legend's danger mark", "danger-solid", "surface", "mark"],
  ["The legend's success mark", "success-solid", "surface", "mark"],
  // People: pips by rule.
  ["A high-severity pip", "danger-solid", "surface", "mark"],
  ["A medium- or low-severity pip's outline", "warning-text", "surface", "mark"],
  // The weekly cohorts' chart.
  ["Detected: line and hexagon markers", "text", "surface", "mark"],
  ["Closed: line and hexagon markers", "success-solid", "surface", "mark"],
  ["Still open: dashed line and outlined markers", "warning-text", "surface", "mark"],
  ["The chart's direct labels: closed", "success-text", "surface", "text"],
  ["The chart's direct labels: still open", "warning-text", "surface", "text"],
  ["The chart's axis labels", "text-muted", "surface", "text"],
  // The review of AI-suggested values: the AI's words in lilac.
  ["The words a suggestion rests on, marked in the short text and listed", "feature-text", "feature-bg", "text"],
  // The console's empty state and the scenario's tip.
  ["The scenario's tip on its quiet fill", "text", "bg-subtle", "text"],
  ["The tip's note", "text-muted", "bg-subtle", "text"],
  // How it works: the production path.
  ["The production path's numbers in their hexagons", "neutral-text", "neutral-bg", "text"],
  ["The production path's names", "text", "surface-raised", "text"],
  ["The production path's roles", "text-muted", "surface-raised", "text"],
  // The header's fiction note: a plain tag.
  ["Fictional company, no client data (a plain tag)", "neutral-text", "neutral-bg", "text"]
];

/**
 * Colours that must stay apart, beyond the shared ones in tests/tokens.mjs: [what, token, token].
 * The test reports how far apart they stay under colour-vision deficiency; it does not fail on them.
 */
export const SEPARATIONS = [
  ["Rule states: high severity open (danger) vs medium or low open (warning)", "danger-solid", "warning-solid"],
  ["Rule states: open (warning) vs nothing open (success)", "warning-solid", "success-solid"]
];

/**
 * The hexagon test's tour of the app (tests/hexagon.mjs): the intro, the idle board, Diagnostics, the
 * scenario menu, the drawer's three tabs, and the main states of a Simulation run of scenario 3 (the
 * review of AI-suggested values, the case card, the honeycomb with states, a cell's exceptions, the
 * people view, the fix paths, the outbox and the report). The page has just been opened, without
 * SKIP_INTRO, so the intro opens by itself. visit(name, { settle }) checks the page as it is, settle
 * ms (250) after the step.
 */
export async function hexagonTour(page, visit) {
  await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
  await page.waitForSelector(".intro-modal", { timeout: 10000 });
  await visit("start screen with the intro");
  await page.keyboard.press("Escape");
  await page.waitForSelector(".intro-modal", { state: "detached", timeout: 5000 });
  await visit("idle board");
  await page.click("#cohort-details > summary");
  await page.locator("#cohort-table").scrollIntoViewIfNeeded();
  await visit("idle board, weekly cohorts");
  await page.click("#btn-diagnostics");
  await page.waitForSelector('.diag-table tr[data-test="world"] .diag-status[data-s="pass"], .diag-table tr[data-test="world"] .diag-status[data-s="fail"]', { timeout: 15000 });
  await visit("diagnostics");
  await page.keyboard.press("Escape");
  await page.waitForSelector(".diag-table", { state: "detached", timeout: 5000 });
  await page.click("#dd-scenario");
  await page.waitForSelector(".dropdown-menu:not([hidden])", { timeout: 5000 });
  await visit("scenario menu");
  await page.click('.dropdown-menu [data-id="SC-UNCLASSIFIED"]');
  for (const tab of ["options", "outbox", "audit"]) {
    await page.click(`#tab-${tab}`);
    await page.waitForSelector(`#panel-${tab}:not([hidden])`, { timeout: 5000 });
    await visit(`drawer, ${tab}`);
  }
  await page.click(".drawer-toggle");
  await page.click("#btn-about");
  await page.waitForSelector(".intro-modal", { timeout: 5000 });
  await visit("how it works");
  await page.keyboard.press("Escape");
  await page.waitForSelector(".intro-modal", { state: "detached", timeout: 5000 });
  // A Simulation run of scenario 3, through its review, decision and drafts.
  await page.click("#btn-start");
  await page.waitForSelector(".mode-modal", { timeout: 5000 });
  await visit("mode dialog");
  await page.click("#btn-mode-simulation");
  await page.click(".segmented button[aria-label='Replay speed ×4']");
  await page.waitForSelector(".review-modal", { timeout: 60000 });
  await visit("review of AI-suggested values", { settle: 600 });
  await page.click("#btn-review-approve-all");
  await page.click("#btn-review-confirm");
  await page.waitForSelector("#console .case-card", { timeout: 60000 });
  await visit("case card and the honeycomb with states");
  await page.click("#cell-DQ-02");
  await page.waitForSelector("#ex-card:not([hidden])", { timeout: 5000 });
  await visit("a cell's exceptions");
  await page.click("#view-people");
  await visit("people view");
  await page.click("#view-rules");
  await page.waitForSelector('.option-card[data-recommended="true"] [data-action="approve"]', { timeout: 60000 });
  await visit("fix paths");
  await page.click('.option-card[data-recommended="true"] [data-action="approve"]');
  for (;;) {
    if (await page.locator(".entry[data-end]").count()) break;
    const pending = page.locator('.action-card[data-status="pending"] [data-action="approve"]');
    if (await pending.count()) {
      if (!(await page.locator('.action-card[data-status="approved"]').count())) await visit("outbox with drafts");
      await pending.first().click();
    }
    await page.waitForTimeout(200);
  }
  await visit("run complete with its report");
  await page.click("#btn-open-report");
  await page.waitForSelector(".report-modal", { timeout: 5000 });
  await visit("the report");
  await page.keyboard.press("Escape");
}

/**
 * The page icon (tests/page-icon.mjs): the icon and kind of this prototype's card on Victor's website
 * (VictorPflueger/VIP, data/prototypes.js), the colour of that kind's cell (Vici's lilac for a
 * prototype), and favicon.svg exactly: the card's cell drawn for small sizes.
 */
export const PAGE_ICON = {
  icon: "check",
  kind: "prototype",
  tone: "lilac",
  favicon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 103.92">
  <!-- Data Quality Agent's page icon: Vici's check icon in a lilac hexagon cell, the same as its card
       on Victor Pflüger's website (icon and kind: VictorPflueger/VIP, data/prototypes.js). Vici's
       lilac 100 (#f2e9fd) and lilac 900 (#372544); the icon is drawn larger and bolder
       than on the card so that it still reads at 16 px. -->
  <polygon points="120,51.96 90,103.92 30,103.92 0,51.96 30,0 90,0" fill="#f2e9fd"/>
  <g transform="translate(18 9.96) scale(3.5)" fill="none" stroke="#372544" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 12 L8.5 17.5 L20 4.5"/>
  </g>
</svg>
`
};
