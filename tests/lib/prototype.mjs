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
  // The stage: panels on the surface, the honeycomb canvas behind them.
  ["A step's title, its lead and the facts", "text", "surface", "text"],
  ["A step's notes, the facts' words and what the agent did", "text-muted", "surface", "text"],
  // The fifteen rules as hexagons: words and marks on the state's tint.
  ["A high-severity rule with open exceptions", "danger-text", "danger-bg", "text"],
  ["A medium- or low-severity rule with open exceptions", "warning-text", "warning-bg", "text"],
  ["A rule with nothing open", "success-text", "success-bg", "text"],
  ["A rule outside the scan", "text-muted", "neutral-bg", "text"],
  ["The rim of a rule in the case", "info-solid", "surface", "mark"],
  // The AI's words: lilac.
  ["The agent's words on their lilac ground", "text", "feature-bg", "text"],
  ["The AI tag on the agent's words", "feature-text", "feature-bg", "text"],
  ["The AI tag on a panel", "feature-text", "surface", "text"],
  // The four key figures.
  ["A key figure before anything happens", "text-muted", "surface", "text"],
  ["A key figure that shows a gain", "success-text", "success-bg", "text"],
  ["A key figure that shows what is at stake", "warning-text", "warning-bg", "text"],
  ["A key figure's note on a gain", "text-muted", "success-bg", "text"],
  ["A key figure's note at stake", "text-muted", "warning-bg", "text"],
  ["A key figure's old value, struck through (vc-stat__was), on a gain", "text-muted", "success-bg", "text"],
  ["The arrow from a key figure's old value to its new one", "text-subtle", "success-bg", "mark"],
  // Calculate: the money.
  ["Money already spent, on its quiet ground", "text", "bg-subtle", "text"],
  ["Money at stake if nothing changes", "warning-text", "warning-bg", "text"],
  // Propose and Prepare: your decisions in merlot's tint.
  ["An approved path or draft: its words", "text", "accent-soft", "text"],
  ["An approved path or draft: its status", "accent-text", "accent-soft", "text"],
  ["Do nothing, on its quiet ground", "text-muted", "bg-subtle", "text"],
  ["Show the full draft", "text-link", "surface", "text"],
  // The step bar.
  ["A step's name and hint", "text-muted", "bg-subtle", "text"],
  ["The step that waits for you: its hint", "accent-text", "bg-subtle", "text"],
  ["Your turn: the callout's words on the soft merlot", "on-accent-soft", "accent-soft", "text"],
  ["Your turn: the merlot tag against its callout", "accent", "accent-soft", "mark"],
  ["Your turn: the callout's edge on a panel", "accent", "surface", "mark"],
  ["The step's Next button", "on-accent", "accent", "text"],
  ["The bar along Next that fills as Play reads the step", "on-accent", "accent", "mark"],
  ["Beside Next: when Play moves on", "text-muted", "surface", "text"],
  ["Beside Next: Your move, when the page waits", "accent-text", "surface", "text"],
  ["The step that waits for you: its number", "on-accent", "accent", "text"],
  ["The step on screen: its number", "on-accent-soft", "accent-soft", "text"],
  // Header tags.
  ["SIMULATION (a plain tag)", "neutral-text", "neutral-bg", "text"],
  ["LIVE, on merlot", "on-accent", "accent", "text"],
  ["You are interacting with an AI system", "feature-text", "feature-bg", "text"],
  // The guide's production path.
  ["The production path's roles", "text-muted", "bg-subtle", "text"]
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
 * The hexagon test's tour of the page (tests/hexagon.mjs): the guide as it opens on a new tab, the tip,
 * the five steps of the default case through the decision and the drafts to the report, the live
 * dialog, and the review of AI-suggested values in Unclassified spend. visit(name, { settle }) checks the
 * page as it is, settle ms (250) after the step.
 */
export async function hexagonTour(page, visit) {
  await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
  await page.waitForSelector("dialog.vc-guide[open]", { timeout: 10000 });
  await visit("the guide as it opens");
  await page.click("dialog.vc-guide .vc-guide__rail .vc-step__button >> nth=-1");
  await visit("the guide's talk track");
  await page.keyboard.press("Escape");
  await visit("the tip");
  await page.click("#btn-live");
  await page.waitForSelector("#live-dialog[open]", { timeout: 5000 });
  await visit("the live dialog");
  await page.keyboard.press("Escape");
  await page.click("#btn-start");
  await page.waitForSelector('.hex[data-state="danger"]', { timeout: 20000 });
  await visit("Spot");
  for (const name of ["Check", "Calculate", "Propose"]) {
    await page.keyboard.press("ArrowRight");
    await visit(name);
  }
  await page.click('.opt[data-recommended="true"] [data-action="approve"]');
  await visit("Propose, decided");
  await page.keyboard.press("ArrowRight");
  await page.waitForSelector('.draft[data-status="pending"]', { timeout: 20000 });
  await visit("Prepare, drafts waiting");
  for (let i = 0; i < 6; i += 1) {
    const pending = page.locator('.draft[data-status="pending"] [data-action="approve"]');
    if (!(await pending.count())) break;
    await pending.first().click();
    await page.waitForTimeout(150);
  }
  await page.waitForSelector(".report", { timeout: 20000 });
  await visit("Prepare, the report");
  // The review of AI-suggested values.
  await page.click('.stepbar .vc-step__button[data-step="0"]');
  await page.selectOption("#case-select", "SC-UNCLASSIFIED");
  await page.click("#btn-start");
  await page.keyboard.press("ArrowRight");
  await page.waitForSelector(".review-table", { timeout: 20000 });
  await visit("Check, the review of AI suggestions");
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
