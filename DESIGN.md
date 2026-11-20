# Data Quality Agent — design

How the page looks and why, on Vici, Victor Pflüger's design system. This file starts with version 0.1.0 and grows with each milestone; the board's states, the people view, the review dialog and the options arrive with the runs in version 0.2, the layout and design suites with 1.0.

## 1. The basis

- **Vici v1.0.0**, copied unchanged into `vici/` (its stylesheet, script, fonts, icons and marks), loaded before the app's own CSS. Vici sits in cascade layers, so the app's rules refine it without `!important`.
- **The shared shell** of the sister prototypes (REVIEW.md, Part 2): header, control bar, console, drawer, dialogs and boot screen, with Rebate Hunter's styles. This app adds `css/board.css` and a marked block at the end of `css/style.css`.
- **Two themes.** Light and dark follow Vici's tokens; the choice is stored under `vc-theme`, the key all of Victor's pages share.

## 2. Page icon

Vici's `check` icon in a lilac hexagon cell (decision D2): in the header's brand cell, on the loading screen and as `favicon.svg` (Vici's check path in a lilac hexagon, fill `#f2e9fd`, outline `#372544`). Lilac is the prototypes' colour on Victor's website; the matching card there follows in M3.

## 3. Colour grammar

Four rules, the sister apps' (the head of `css/style.css` states them for the shell). Each colour means one thing, everywhere.

| Colour (Vici's tokens) | Means | In this app | Never used for |
|---|---|---|---|
| **Merlot** (`--vc-accent` and its tokens) | **The human in charge** | Primary actions; the progress step that waits for a person: *Your confirmation* (AI-suggested values to confirm), *Your decision* (a fix path), *Your approval* (each draft); the recommended option's frame; the focus ring | A state, or a mark among state colours: merlot sits close to Vici's danger tone |
| **Danger, warning, success** (`--vc-danger-*`, `--vc-warning-*`, `--vc-success-*`) | **The state of the data** | From version 0.2, a rule's hexagon: danger with a cross for a high-severity rule with open exceptions, warning with a bar and dot for a medium- or low-severity one, success with a tick for a rule with none | Decoration |
| **Fjord** (`--vc-info-*`) | Checking | From version 0.2, the rules and records the agent reads pulse in fjord as an outline | |
| **Lilac** (`--vc-feature-*`) | **The AI's voice**, and the page icon | The AI disclosure; from version 0.2 the AI labels, suggestions and what-ifs | Anything a person decided |
| **Ink** (`--vc-text`, Vici's neutrals) | Everything else | Text, rules before a scan (ink on the neutral tint), the cohort table, the production path, the *Fictional company* tag | |

**Every state has a form of its own** (WCAG 1.4.1): Vici's state tones are close in lightness and some come close under colour blindness, so a rule's state will always carry its mark (cross, bar and dot, tick) and a word as well as its tone.

**Before a scan everything is neutral.** Version 0.1 runs no scan, so the fifteen rules sit in ink on Vici's neutral tint, and the header's tiles show the exception log's figures without a state tone.

## 4. Layout

- **Built for the room.** The root size is fluid (15 px at 1280 px wide, about 17 px at 1920 px), so the page reads from the back of a room at 1920 × 1080 and still fits 1280 × 720 without horizontal scrolling. Targets the room clicks are at least 44 px.
- **The header** holds the brand, the mode badge, How it works, the theme toggle, the AI disclosure, the *Fictional company, no client data* tag (shortened to *Fictional company* below 1500 px; its tooltip says what is invented) and four tiles: closure rate, clean spend, open exceptions, session cost.
- **The workspace** puts the board on Vici's sunken canvas with its honeycomb on the left and the console on the right; the drawer with Options, Outbox and Audit sits below both.
- **The board of version 0.1** is a caption card with the exception log's date and the world's size, the fifteen rules by data product in a grid of hexagons with their dimension, severity and the person responsible, and the eight weekly cohorts as a table. The rule grid fills four columns at 1920 × 1080 and two at 1280 × 720.

## 5. Shapes: nothing round

Vici's hexagon rule: anything that would be round is a hexagon (`clip-path: var(--vc-hex)`): the brand cell, the rule numbers, the production path's steps, the progress rail's steps. `tests/hexagon.mjs` scans the app's files for round CSS and drawing code and checks the rendered page in both themes.

## 6. The checks

| Suite | What it holds |
|---|---|
| `tests/tokens.mjs` | WCAG 2.2 contrast for every colour pair the shell and this app draw, in both themes (4.5:1 for text, 3:1 for marks); this app's pairs are listed in `tests/lib/prototype.mjs`. It also reports how far the state tones stay apart under protanopia, deuteranopia and tritanopia (the rule states: danger against warning, warning against success), without failing on Vici's own tones |
| `tests/hexagon.mjs` | Nothing round, in the files and on screen |
| `tests/page-icon.mjs` | `favicon.svg` byte for byte, the header and loading screen using the icon's cell |
| `tests/vici-files.mjs` | `vici/` exactly as Vici's README lists it |
| `tests/smoke.mjs` | Both themes at 1920 × 1080 and 1280 × 720: no horizontal scrolling, the screenshots for review |

## 7. Deviations from Vici

None of this app's own. The shared shell's type steps Vici has no step for (`--fs-xs`, `--fs-lg`, `--fs-xl`, `--fs-kpi`) and its 44 px target size come with the shell, as in the sister apps.
