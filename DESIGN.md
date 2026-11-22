# Design

How the screen is built, and why. The page follows Vici, Victor Pflüger's design system (`vici/`), and is written for a customer with no time to spare.

## 1. One question per screen

Each step answers one question in its title, in plain words and with the engine's figure in it: *Two rules flag 23 order lines in Birmingham*, *Paying early cost €3,482 last year*. The left column tells the story; the right column shows the evidence. Propose and Prepare use the full width, because the person acts there.

## 2. The frame

- **Header.** The page icon and name; SIMULATION, or LIVE in a live run; *How it works* and the theme switch; the four key figures top right.
- **Under the header.** One sentence on what the agent does, on fictional data, with the byline beside it.
- **Step bar.** Play, the tip and the five steps, Back and a secondary Next. Where a person must act, the step says so (*Your decision*) and its marker turns merlot.
- **Play.** *Start the agent* plays the case, each step as long as its words take to read; Play stops wherever you act.
- **The next action.** Each step ends with a button that names where it leads (*Next: find the cause*). Where you must act, from the first screen on, Vici's merlot *Your turn* callout says what to do, and the button carries `vc-attention`.
- **Stage.** One step at a time, with no page scrolling at 1920 × 1080 or 1280 × 720. Long lists scroll inside their panel.

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

Colour never carries a meaning alone: each state also has an icon or a word. `tests/tokens.mjs` checks every pair the page draws for contrast in both themes.

## 4. The key figures

Four Vici stat tiles top right, each with a label, a value and a note. They answer first: before anything runs, they show the case as the engine works it out. The decision moves two of them, each keeping its old value struck through (`vc-stat__was`), and stops the clock. How it works has a row for each; the talk track quotes them.

## 5. Words

- Plain English, British spelling, no em dashes and none of Vici's stock words.
- Names, not ids: *James P., buyer, Indirect, Birmingham*, never U124; *the buying profile of the Indirect team*, never U190; cities for plants and company codes (`js/plain.js`).
- No tool names or rule codes on screen: the honeycomb names its rules (*Payment terms too short*), and *What the agent did* says what a tool call did.
- Every figure is the engine's. The agent's words carry the lilac AI tag, and the case card and the report say so.
- Approving a draft says what happens: *Approved. Not sent: this page has no email or ERP connection.*

## 6. What the page leaves out

Version 2.0.0 cut what a customer does not need: the control bar, the console, the drawer, the people view, the cohort chart, the Method dialog, Diagnostics, the recorder, Live sweep and the what-if. Version 2.2.0 cut the rule codes and the footer. The engine, tools, guardrails, figure audit, Live mode and audit log stayed (TECH_NOTES.md §9).

## 7. Access and motion

Every control is a native button, select or input, reachable by Tab and labelled. The arrow keys move between steps unless the focus is in a field or a dialog is open; Space plays and pauses. Each step change moves the focus to the step's title, so a screen reader announces it. Reduced motion stops the figure flips and the live pulse, and keeps `vc-attention` as a still ring; forced colours keep the honeycomb's states readable.
