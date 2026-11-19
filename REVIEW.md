# REVIEW — the Data Quality Agent and its parity with the sister prototypes

This file records what was asked and what was built, how the shared shell stays the sister apps' shell, and, from version 1.0.0, the findings of an independent review. It grows with each milestone.

## Part 1. What was asked and what was built

| Milestone | Delivers | Status |
| --- | --- | --- |
| M1 Shell, world and engine (v0.1.0) | The shared shell and Vici with two adapted modules; the fifteen rules, reconciliation, clean spend, financing cost, history and fix paths; the figure audit; the data contracts and their validator; the fictional world with its builder and checker; the golden cases as fixtures; a first page; CI | Built in this pull request |
| M2 Agent, board and Simulation (v0.2.0) | The live agent with its seventeen tools and guardrails, the board's two views and cohorts, the review dialog, options, outbox and report, six scripted runs, Live sweep and Custom what-if | Next |
| M3 Hardening and release (v1.0.0) | Exports, layout, design and accessibility suites, the Method dialog, all documents, the independent review, the website card, Pages live | Later |

Version 0.1.0 shows the page the agent will run on: the header with the closure rate, clean spend and open exceptions as the exception log stands, the control bar (its run controls say that runs arrive in version 0.2), the fifteen rules by data product, the eight weekly cohorts with their table, the console with the agent's plan and the progress rail, the drawer, How it works with the production path, and Diagnostics with the world's checks.

## Part 2. The shared shell

The shell is Rebate Hunter's (`VictorPflueger/PROC-Rebate-Hunter`, commit `73c00f8`), as the Timetable Translator's REVIEW.md lists it. `tests/parity.mjs` compares every shared file with a checkout of Rebate Hunter's `main` on every push, with the app names and storage prefixes normalised (Rebate Hunter, Timetable Translator and Data Quality Agent; `rh.`, `tt.` and `dq.`).

**Identical** (character for character, comments included): `js/anthropic.js`, `js/clock.js`, `js/cost.js`, `js/dom.js`, `js/drawer.js`, `js/keystore.js`, `js/labels.js`, `js/md.js`, `js/modal.js`, `js/sse.js`, `js/theme.js`, `css/components.css`, `css/console.css`, and the four tests that are the same file in every prototype: `tests/tokens.mjs`, `tests/hexagon.mjs`, `tests/page-icon.mjs`, `tests/vici-files.mjs` (this app's values are in `tests/lib/prototype.mjs`).

**Same rules** (comments may name this app's board): `css/drawer.css`, `css/modals.css`, and `css/style.css` down to its marked app-specific block (the "Fictional company, no client data" tag, the production path, the read-only parameters).

**Same files, byte for byte:** `vici/`, Vici v1.0.0.

**Adapted** (exactly two, the only shared files this app changes):

- `js/handover.js` is adapted for the third human step, "Your confirmation": while a person reviews AI-suggested values (the material groups the agent proposes for free-text lines), the run waits for a confirmation as well as for a decision or an approval. It is Repack Pilot's version (its TECH_NOTES D71), with the comment worded for AI-suggested values; the event names stay Repack Pilot's (`confirmation_request`, `confirmation_decision`), so the two adapted copies stay comparable.
- `js/progress.js` is adapted for the same third human step, "Your confirmation": Rebate Hunter's file with its five steps (Spot, Check, Calculate, Propose, Prepare) and its `no_findings` ending, plus only Repack Pilot's confirmation logic. While a confirmation waits, the furthest step reached carries the merlot "Your confirmation" tag (Check in the scripted runs), the status says "Awaiting your confirmation", and the rail never moves back.

Any other change to a shared file needs Victor's approval first, and then joins this list and the test's list of adapted files.

**The app's own counterparts** of shared imports: `js/config.js` (this app's name, id `dq`, version, models and prices, caps, exchange rate, storage keys), `js/events.js` (Rebate Hunter's bus and run states, this app's event types) and `js/icons.js` (Vici's icons and Rebate Hunter's drawings, nothing new drawn).

## Part 3. Findings

The independent review comes with version 1.0.0 (milestone M3).

## Part 4. Open points

See `TECH_NOTES.md` §7.3 (open for Victor) and §7.2 (the build decisions of M1).
