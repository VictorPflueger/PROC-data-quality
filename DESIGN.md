# Data Quality Agent — design

How the page looks and why, on Vici, Victor Pflüger's design system. This file grows with each milestone: version 0.2.0 adds the board's states, the people view, the cohort chart, the review dialog, the options and the outbox; the layout and design suites come with 1.0.

## 1. The basis

- **Vici v1.0.0**, copied unchanged into `vici/` (its stylesheet, script, fonts, icons and marks), loaded before the app's own CSS. Vici sits in cascade layers, so the app's rules refine it without `!important`.
- **The shared shell** of the sister prototypes (REVIEW.md, Part 2): header, control bar, console, drawer, dialogs and boot screen, with Rebate Hunter's styles. This app adds `css/board.css` (the board), `css/agent.css` (the console's plain sentences, the case card, the review, the fix-path cards' details) and a marked block at the end of `css/style.css`.
- **Two themes.** Light and dark follow Vici's tokens; the choice is stored under `vc-theme`, the key all of Victor's pages share.

## 2. Page icon

Vici's `check` icon in a lilac hexagon cell (decision D2): in the header's brand cell, on the loading screen and as `favicon.svg` (Vici's check path in a lilac hexagon, fill `#f2e9fd`, outline `#372544`). Lilac is the prototypes' colour on Victor's website; the matching card there follows in M3.

## 3. Colour grammar

Four rules, the sister apps' (the head of `css/style.css` states them for the shell). Each colour means one thing, everywhere.

| Colour (Vici's tokens) | Means | In this app | Never used for |
|---|---|---|---|
| **Merlot** (`--vc-accent` and its tokens) | **The human in charge** | Primary actions; the progress step that waits for a person: *Your confirmation* (AI-suggested values to confirm), *Your decision* (a fix path), *Your approval* (each draft); the recommended option's frame; the focus ring | A state, or a mark among state colours: merlot sits close to Vici's danger tone |
| **Danger, warning, success** (`--vc-danger-*`, `--vc-warning-*`, `--vc-success-*`) | **The state of the data** | A rule's hexagon: danger with a cross for a high-severity rule with open exceptions, warning with a bar and dot for a medium- or low-severity one, success with a tick for a rule with none; the people view's pips (solid danger, outlined warning); the cohort chart's closed (success) and still-open (warning) series; an approved draft or fix (success, with its words) | Decoration |
| **Fjord** (`--vc-info-*`) | Checking | The rules the agent scans or groups and the records it opens pulse in fjord as the cell's rim or the row's tint; what it marks or alerts on keeps a fjord rim | |
| **Lilac** (`--vc-feature-*`) | **The AI's voice**, and the page icon | The AI disclosure and the AI labels on the case card, the options, each draft, the review and the report; AI-suggested material groups and the words they rest on | Anything a person decided |
| **Ink** (`--vc-text`, Vici's neutrals) | Everything else | Text, rules before a scan (ink on the neutral tint), the cohort table, the production path, the *Fictional company* tag | |

**Every state has a form of its own** (WCAG 1.4.1): Vici's state tones are close in lightness and some come close under colour blindness, so a rule's state will always carry its mark (cross, bar and dot, tick) and a word as well as its tone.

**Before a scan everything is neutral.** The fifteen rules sit in ink on Vici's neutral tint until a run scans them, and the header's tiles show the exception log's figures without a state tone. A rule a run has not scanned stays neutral.

**Warning marks use the warning ink.** Vici's light `--vc-warning-solid` (#e2cfa0) is too pale for a line or a mark on white (under 3:1), so the cohort chart's still-open series, the warning pips and the legend's warning mark use `--vc-warning-text`; danger and success marks use their solid tones. `tests/tokens.mjs` holds every pair.

## 4. Layout

- **Built for the room.** The root size is fluid (15 px at 1280 px wide, about 17 px at 1920 px), so the page reads from the back of a room at 1920 × 1080 and still fits 1280 × 720 without horizontal scrolling. Targets the room clicks are at least 44 px.
- **The header** holds the brand, the mode badge, How it works, the theme toggle, the AI disclosure, the *Fictional company, no client data* tag (shortened to *Fictional company* below 1500 px; its tooltip says what is invented) and four tiles: closure rate, clean spend, open exceptions, session cost.
- **The workspace** puts the board on Vici's sunken canvas with its honeycomb on the left and the console on the right; the drawer with Options, Outbox and Audit sits below both.
- **The board** is a caption card with the exception log's date and the world's size, a switch between its two views with the scope of the last scan, the view, a rule's exceptions when a cell is open, and the weekly cohorts.
  - **Rules:** a honeycomb of fifteen flat-top hexagons in interlocking strips, one strip per data product (order lines; suppliers, materials and contracts side by side). Each cell shows its rule id with its state's mark, its open exceptions large and a two-line short name; its size follows the panel (96 to 150 px wide, `js/board.js`), so the strips fit 1280 × 720 and read from the back of the room at 1920 × 1080. A cell is a button: it opens the rule's exceptions as a table (record, responsible, routed to, spend affected, financing cost, unpaid, suggestion, status), which scrolls inside its card on a narrow board.
  - **People:** one row per routed-to person, by name, role and team, with their exceptions as small hexagon pips by rule (solid for high severity, outlined for medium or low, the rest as "+n"), the drafts waiting for them and the fix path that covers them.
  - **Weekly cohorts:** a line chart of the eight weeks, oldest on the left, with hexagon markers (detected in ink, closed in success, still open in the warning ink and dashed) and direct labels at the line ends, no legend to decode; the table of the same numbers one click away under "Show the numbers". No pie, no donut.

## 5. Shapes: nothing round

Vici's hexagon rule: anything that would be round is a hexagon (`clip-path: var(--vc-hex)`): the brand cell, the rule cells, the pips, the chart's markers, the production path's steps, the progress rail's steps. `tests/hexagon.mjs` scans the app's files for round CSS and drawing code and checks the rendered page in both themes, through a Simulation run with its review, case card, cell table, people view, fix paths, outbox and report.

## 6. The checks

| Suite | What it holds |
|---|---|
| `tests/tokens.mjs` | WCAG 2.2 contrast for every colour pair the shell and this app draw, in both themes (4.5:1 for text, 3:1 for marks); this app's pairs are listed in `tests/lib/prototype.mjs`. It also reports how far the state tones stay apart under protanopia, deuteranopia and tritanopia (the rule states: danger against warning, warning against success), without failing on Vici's own tones |
| `tests/hexagon.mjs` | Nothing round, in the files and on screen |
| `tests/page-icon.mjs` | `favicon.svg` byte for byte, the header and loading screen using the icon's cell |
| `tests/vici-files.mjs` | `vici/` exactly as Vici's README lists it |
| `tests/smoke.mjs` | Both themes at 1920 × 1080 and 1280 × 720: no horizontal scrolling, the screenshots for review |
| `tests/accept.mjs` | The board's numbers equal the engine's; nothing reads closed before a re-scan; the honesty labels stay visible |

## 7. The agent's pieces

- **The console** follows the Timetable Translator: each tool call reads as one plain sentence (`js/tool_plain.js`), with the tool's name, arguments and result under Details; a refused step is a *Guardrail* line with a shield; the case card is a Vici alert in the case's severity tone, with the root cause, the fix at the source, the engine's figures, the people it is routed to, "Checked in this run:" and the AI label; the report sits in a card with its AI label and opens in a dialog.
- **The review** of AI-suggested values is a wide dialog through the shell's `js/modal.js`: each free-text line's short text with the words the suggestion rests on marked in lilac, the proposed group (its code in a lilac tag, its name below), the words, the confidence, and Approve and Reject per line or for all; Confirm review stays disabled until every line is decided.
- **The fix-path cards** are the shell's option cards with this method's figures: exceptions closed (marked projected for a follow-up), spend covered, financing cost avoided now, exceptions prevented and future cost avoided a year, one-off effort, days and, for a fix at the source, when prevention starts; the closure rate projected after re-scan as the card's total. The recommended card has the merlot frame and the one solid Approve. Doing nothing shows what the case gains a year and its past cost, and asks for the reason before "Accept the risk".
- **The outbox** shows each draft with its kind's icon (a slip for a change request, a letter for a follow-up, the honeycomb for a prevention request, a memo for the risk memo), its recipient by name, role and team, its status tag and the AI label; "Draft. Nothing is sent." leads the tab.

## 8. Deviations from Vici

None of this app's own. The shared shell's type steps Vici has no step for (`--fs-xs`, `--fs-lg`, `--fs-xl`, `--fs-kpi`) and its 44 px target size come with the shell, as in the sister apps.
