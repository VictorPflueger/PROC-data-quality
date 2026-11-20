# Design

How the screen is built, and why. The page follows Vici, Victor Pflüger's design system (`vici/`), and is written for someone in a customer meeting with no time, background or interest in the machinery.

## 1. One question per screen

Each step answers one question in its title, in plain words and with the engine's figure in it: *Two rules flag 23 order lines in Birmingham*, *Paying early cost €3,482 last year*. The left column tells the story (title, what the agent said, the facts); the right column shows the evidence (the honeycomb, the case card, the figures). Propose and Prepare use the full width, because the person acts there.

## 2. The frame

- **Header.** Name and company on the left; *How it works* and the theme switch; the four key figures top right.
- **Step bar.** The tip and the five steps, with Back and Next. A step the run has not reached is disabled. Where a person must act, the step says so (*Your review*, *Your decision*, *Your approval*) and its marker turns merlot.
- **Stage.** One step at a time, with no page scrolling at 1920 × 1080 or 1280 × 720. Long lists scroll inside their panel.
- **Footer.** The byline with LinkedIn and website, as Vici specifies, and three short notes: an AI system, a fictional company, nothing ever sent.

The address follows the presenter (`?case=…&step=…`), so a link opens the same screen.

## 3. Colour

Vici's tokens only; nothing round (Vici's hexagons replace circles). Each colour has one meaning, and the meanings must stay apart:

| Colour | Meaning |
| --- | --- |
| Danger (red) | A high-severity rule with open exceptions |
| Warning (amber) | A medium or low-severity rule with open exceptions; a cost that goes on |
| Success (green) | A rule with nothing open; a figure the approved fix improves |
| Neutral (grey) | Not scanned yet, or not part of this scan |
| Merlot (accent) | Your turn: the step that waits for you, the primary button, Approve |
| Lilac (AI) | What the AI wrote: the AI tag, hypotheses and revisions |

Colour never carries a meaning alone: each state also has an icon or a word, and the honeycomb's legend names them. `tests/tokens.mjs` checks every pair the page draws for contrast in both themes and reports how far the states stay apart for colour-blind readers.

## 4. The key figures

Four Vici stat tiles, top right, each with a label, a value and a note. Each starts from a value that makes sense before anything happens (€0 a year, *nothing costed yet*) and moves with the steps: Calculate puts the yearly cost at stake under *Cost avoided*; the decision turns it into the fix's yearly saving and stops the clock. The guide's third chapter explains all four, and its talk track quotes them.

## 5. Words

- Plain English, British spelling, no em dashes and none of Vici's stock words.
- Names, not ids: *James P., buyer, Indirect, Birmingham*, never U124; *the buying profile of the Indirect team*, never U190; cities for plants and company codes (`js/plain.js`).
- No tool names on screen. *What the agent did* says what a tool call did in a sentence.
- Every figure is the engine's. The agent's words carry the lilac AI tag, and the case card and the report say so.
- Approving a draft says what happens: *Approved. Not sent: this page has no email or ERP connection.*

## 6. What the page leaves out

Version 2.0.0 cut what a customer audience does not need, to get the first screen to nine controls: the control bar and replay speeds, the timed console, the drawer with its tables and people view, the weekly cohort chart, the Method dialog, Diagnostics, Save run as simulation, Live sweep and the custom what-if. The engine, the seventeen tools, their guardrails, the figure audit, Live mode and the audit log stayed. TECH_NOTES.md §9 records the decision.

## 7. Access and motion

Every control is a native button, select or input, reachable by Tab and labelled. The arrow keys move between steps unless the focus is in a field or a dialog is open. Each step change moves the focus to the step's title, so a screen reader announces it. Reduced motion stops the figure flips and the live pulse; forced colours keep the honeycomb's states readable.
