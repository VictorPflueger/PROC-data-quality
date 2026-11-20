# REVIEW — the Data Quality Agent and its parity with the sister prototypes

This file records what was asked and what was built, how the shared shell stays the sister apps' shell, and the findings of the independent review of version 1.0.0 with what became of each.

## Part 1. What was asked and what was built

| Milestone | Delivers | Status |
| --- | --- | --- |
| M1 Shell, world and engine (v0.1.0) | The shared shell and Vici with two adapted modules; the fifteen rules, reconciliation, clean spend, financing cost, history and fix paths; the figure audit; the data contracts and their validator; the fictional world with its builder and checker; the golden cases as fixtures; a first page; CI | Merged (pull request 1) |
| M2 Agent, board and Simulation (v0.2.0) | The live agent with its seventeen tools and guardrails, the board's two views and cohorts, the review dialog, options, outbox and report, the recorder, six scripted runs, Live sweep and Custom what-if | Merged (pull request 2); AC-20, the live run with Victor's key, is his |
| M3 Hardening and release (v1.0.0) | The three exports, the Method dialog with the method's parameters for Live runs, the layout, design and accessibility suites with the fixes they found, the documents with the demo script, the independent review (Part 3), a pull request for the website's card, the live-site check | Built in this pull request; AC-21, the demo, is Victor's |

Version 0.1.0 showed the page the agent runs on. Version 0.2.0 ran it: six scenarios in Simulation and Live, Live sweep and Custom what-if; the console with a plain sentence per tool call and Guardrail lines; the board's honeycomb with each rule's state, its exceptions per cell, the people view and the cohort chart; the review of AI-suggested values; the fix paths next to doing nothing; the outbox; the report; the audit log and Save run as simulation.

Version 1.0.0 makes it ready for the room and for the record:

- **Exports.** The report as Markdown, the exceptions as CSV (built from the board's own tables) and the audit log as JSON, each named `data-quality-<run id>` with SIMULATION or LIVE, each saying its mode in its content; the audit JSON has its own schema and an audit log with the actor of every entry.
- **The Method dialog.** The fifteen rules, why accuracy is left out, the definitions behind every figure, the parameters for Live runs (checked against bounds, logged, recorded in the audit export, locked during a run; Simulation keeps the defaults) and the production path.
- **Laptops and projectors.** Five screens from 1920 × 1080 to 1280 × 720, both themes, measured in every main state: two cell names shortened so they stay inside their hexagons, the control bar kept on one row, the exceptions table fitted to the board, the console's sideways scroll removed.
- **Keyboard, focus and motion.** A run by keyboard alone with visible focus; the decision two Tabs from the top through *Skip to your decision*; the focus kept in rebuilt panels and handed to the drawer's opened panel; reduced motion stopping the pulses; names for every cell, row and control.
- **The independent review** (Part 3): seventeen findings, the high one and the eight medium ones fixed, among them a projection that counted closures outside the case, decisions shown in the success green and dates the figure audit could not read.
- **Documents.** README, DESIGN, TECH_NOTES, DATA_SOURCES, the demo script and this review, held to the code by `tests/docs.mjs`.

TECH_NOTES.md sections 6 to 8 say how the method, the agent, the exports and the simulations work, section 9.4 what version 1.0.0 decided and why, section 11 which acceptance criteria are met and how.

## Part 2. The shared shell

The shell is Rebate Hunter's (`VictorPflueger/PROC-Rebate-Hunter`, commit `73c00f8`), as the Timetable Translator's REVIEW.md lists it. `tests/parity.mjs` compares every shared file with a checkout of Rebate Hunter's `main` on every push, with the app names and storage prefixes normalised (Rebate Hunter, Timetable Translator and Data Quality Agent; `rh.`, `tt.` and `dq.`).

**Identical** (character for character, comments included): `js/anthropic.js`, `js/clock.js`, `js/cost.js`, `js/dom.js`, `js/drawer.js`, `js/keystore.js`, `js/labels.js`, `js/md.js`, `js/modal.js`, `js/sse.js`, `js/theme.js`, `css/components.css`, `css/console.css`, and the four tests that are the same file in every prototype: `tests/tokens.mjs`, `tests/hexagon.mjs`, `tests/page-icon.mjs`, `tests/vici-files.mjs` (this app's values are in `tests/lib/prototype.mjs`).

**Same rules** (comments may name this app's board): `css/drawer.css`, `css/modals.css`, and `css/style.css` down to its marked app-specific block (the "Fictional company, no client data" tag, the production path, the parameters in Diagnostics and the Method dialog, the control bar's Method button and short scenario name).

**Same files, byte for byte:** `vici/`, Vici v1.0.0.

**Adapted** (exactly two, the only shared files this app changes):

- `js/handover.js` is adapted for the third human step, "Your confirmation": while a person reviews AI-suggested values (the material groups the agent proposes for free-text lines), the run waits for a confirmation as well as for a decision or an approval. It is Repack Pilot's version (its TECH_NOTES D71), with the comment worded for AI-suggested values; the event names stay Repack Pilot's (`confirmation_request`, `confirmation_decision`), so the two adapted copies stay comparable.
- `js/progress.js` is adapted for the same third human step, "Your confirmation": Rebate Hunter's file with its five steps (Spot, Check, Calculate, Propose, Prepare) and its `no_findings` ending, plus only Repack Pilot's confirmation logic. While a confirmation waits, the furthest step reached carries the merlot "Your confirmation" tag (Check in the scripted runs), the status says "Awaiting your confirmation", and the rail never moves back.

Any other change to a shared file needs Victor's approval first, and then joins this list and the test's list of adapted files.

**Unchanged in versions 0.2.0 and 1.0.0.** The agent, the board, the review, the options, the outbox, the recorder, the Method dialog and the exports are this app's own modules; the shell's shared files stayed as they were (`tests/parity.mjs`). The app's stylesheet `css/agent.css` refines the shell where this app needs it: `overflow: hidden` on the console panel (TECH_NOTES §9.3, M2-10) and, from version 1.0.0, the console's log clipping its watermark sideways (§9.4, M3-07).

**Candidates for the shared shell,** found here and worth carrying to the sister apps when Victor agrees, each a change to a shared file:

- `css/console.css`: the log scrolls a few pixels sideways on laptop screens during a Simulation, because the turned SIMULATION watermark is wider than the console. One rule, `overflow-x: hidden` on the log, fixes it; this app has it in its own stylesheet.
- `js/drawer.js`: when the run switches the drawer's tab, the focus can stay in the panel that closes and fall to the page; this app moves it to the opened panel's first decision in `js/ui.js`. The drawer could do it for every app, and open each tab at its top (review finding R13).
- `css/modals.css`: the intro window colours its five steps in the data's state tones (danger, warning, success). This app sets them by the colour grammar in `css/agent.css` (review finding R14); the shared file could do the same for every app.

**Adapted from the Timetable Translator** (not shared files, so not in the parity test): `tests/layout.mjs`, `tests/design.mjs`, `tests/docs.mjs`, `tests/live_site.mjs` and `.github/workflows/live-site.yml`, each rewritten for this app's board, states and documents.

**The app's own counterparts** of shared imports: `js/config.js` (this app's name, id `dq`, version, models and prices, caps, exchange rate, storage keys), `js/events.js` (Rebate Hunter's bus and run states, this app's event types) and `js/icons.js` (Vici's icons, among them `book` and `lock` for the Method dialog from version 1.0.0, and Rebate Hunter's drawings; nothing new drawn).

## Part 3. Findings

**Who and when.** On 20 November 2026 an agent that did not build the prototype reviewed the release candidate of version 1.0.0: a separate session with the method, the code and the running page, without the build's working notes. It played the six scenarios in Simulation along their decision paths at 1920 × 1080 and 1280 × 720 in both themes, drove the toolbox in Node with inputs of its own, and read the code against the method.

**What it covered.** The **figures** (the engine's figures against the screens and the exports, the projections, the figure audit), the **rules** and guardrails (the verified alert, the review of AI-suggested values, the drafts each path allows, routing), the **honesty** rules (nothing closed before a re-scan, labels for what the AI wrote, the fiction and Simulation notes) and the **UI** (layout, colour grammar, keyboard, legibility).

**17 findings: 1 high, 8 medium, 8 low.** Every finding was reproduced before it was fixed, and each fix has a check that failed before it; TECH_NOTES §9.4 (M3-13 to M3-27) records the decisions.

| ID | Severity | Area | Finding | What became of it |
| --- | --- | --- | --- | --- |
| R1 | high | figures | The projection of paths A and C re-scanned every rule on the copy of the world, so it also closed three exceptions outside the case, planned corrections of other rules: scenario 1 showed 69.7 % instead of 68.4 %, scenario 2 64.9 % instead of 63.6 %, scenario 3 71.4 % instead of 70.1 % | Fixed: the re-scan keeps the case's rules and filters (`project()` with the case's scope); the toolbox suite checks the scoped projection and, as its control, that the unscoped one counts closures outside the case |
| R2 | medium | honesty, UI | Approved fix paths, approved drafts and the case's rows *approved, re-scan pending* wore the success green, the colour of data with nothing open | Fixed: decisions wear merlot's tint, the person's colour; a rejected path or draft is ink; the design suite checks that no decision is green |
| R3 | medium | honesty | The cards of A and C read *Exceptions closed 30 of 30*, without saying it is a projection | Fixed: every path reads *Closed after re-scan (projected)*, with a note that the figure is projected from the case's 14-day closure history |
| R4 | medium | honesty, UI | Below 1,500 px the header shortened *Fictional company, no client data* to *Fictional company* | Fixed: the tag stays in full at every width; the layout suite passes at 1366 × 768 and 1280 × 720 with it |
| R5 | medium | honesty | Only the report was checked for *closed*, as a whole, so a sentence calling an exception closed passed when another sentence named a re-scan, and the alert, options and drafts were not read at all | Fixed: every alert, option text, review note, draft and the report is read sentence by sentence; the toolbox suite refuses each kind of text that claims a closure, with a control that passes for each |
| R6 | medium | rules, figures | When AI-suggested values were approved after the alert, the fix paths counted them but the decision's coverage and the change request used the case as it stood at the alert | Fixed: the decision and the drafts count the approved suggestions as `dq_fix_paths` does; checked in the toolbox suite |
| R7 | medium | honesty | The console's narration and reasoning summaries, the agent's own words, carried no AI label | Fixed: the console's header carries the AI label, which says that narration is not read by the figure audit and which texts are |
| R8 | medium | UI | When the options arrived, the recommended card's Approve sat below the drawer's edge at 1920 × 1080 and 1280 × 720, and up to 1,500 px the options' summary was hidden | Fixed: at least 1,000 px high the drawer is up to 520 px tall and the cards are more compact (at 1920 × 1080 the Approve sits at 991 to 1,035 px in a drawer that reaches the screen's foot, with no scrolling); on a laptop the drawer scrolls the recommended actions into view; the summary shows, set smaller |
| R9 | medium | figures | The figure audit refused *Sept* (as `en-GB` writes September) and the long date forms, read *Week 8* as a count, and let any real date pass, because the days the tools returned were never collected | Fixed: month and weekday names come from the same `Intl` formatter as the screens; dates must be days a tool returned, months must contain one, *Week N* must be a cohort the history tool returned; the audit suite reads every day label from 400 days before to 120 days after two dates back as its own day, and the toolbox suite refuses an unreturned date and week with controls |
| R10 | low | rules | Figure-audit refusals were counted per kind and run, so after two refusals of one follow-up every later follow-up showed *Unchecked* at once | Fixed: refusals count per text, so the next owner's follow-up gets its own two; checked in the toolbox suite |
| R11 | low | UI | The tile said 151 open exceptions and the board 40, and neither face said which scope it counts | Fixed: the board's scope line says *40 open exceptions in this scope; the header tiles count the whole exception log*; the demo script answers the question |
| R12 | low | UI | The cells' names are 9.7 px at 1280 × 720 | Kept: 9.7 px is the largest size that stays inside the hexagon at that width (10.4 px left it in a measured run); the full name is in the cell's accessible name, tooltip and table; 10.4 px at 1366 × 768, 14.6 px at 1920 × 1080. The layout suite now measures every text on screen (11 px at least, 9.5 px on a cell) |
| R13 | low | UI | The drawer kept one scroll position for all its tabs, so a tab could open halfway down | Fixed: each tab opens at its top (`js/ui.js`; the shared drawer is unchanged, a candidate for the shell in Part 2) |
| R14 | low | UI | The intro window's steps wore the data's state tones, and the case card always carried the warning mark | Fixed: the case card's mark follows the board (a cross for high severity); the intro's steps follow the colour grammar in the app's own CSS, the shared `css/modals.css` unchanged; the design suite checks both themes |
| R15 | low | UI | By keyboard the recommended Approve was about fifty Tabs from the top of the page | Fixed: while something waits, a second skip link, *Skip to your decision* or *Skip to your approval*, hands the focus to it in two Tabs; the keyboard case checks both |
| R16 | low | rules | An approved change request to one owner marked as routed the entries routed to other owners | Fixed: an approved draft routes only the entries routed to its recipient, as the method says; the toolbox suite checks both owners' entries |
| R17 | low | figures | Doing nothing in scenario 2 shows about €10,293 a year beside €3,482 of financing cost in the last 365 days | Not a defect: the method costs a year's new exceptions at the case's average cost (12 × *f* × *E* / *n*), and the case gains 68 exceptions a year while it holds 23. The card now says how the figure is costed, and TECH_NOTES §9.5 asks Victor whether the method should cost only the share that stays open |

No high or medium finding is open (`node tests/docs.mjs review`).

## Part 4. Open points

- **AC-20, a live run with your key,** and **AC-21, the five-minute demo,** are yours (TECH_NOTES §9.5).
- **The website's card:** a pull request in VIP updates the Data Quality Agent's card for version 1.0.0; merge it once this version is live.
- **The live-site check** runs after the Pages build of the merge and must end with LIVE SITE OK.
- **Doing nothing's yearly cost** (finding R17): whether the method should cost only the share of new exceptions that stays open past the 14-day window (TECH_NOTES §9.5).
- **The candidates for the shared shell** (Part 2), each a change to a shared file that needs your approval.

See `TECH_NOTES.md` §9.5 (open for Victor), §9.4, §9.3 and §9.2 (the build decisions of M3, M2 and M1).
