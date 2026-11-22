# Tests (optional, for developers)

The Data Quality Agent itself needs no Node.js, npm or build step. These scripts are the checks behind the acceptance checklist in `TECH_NOTES.md` §11. Run them after changing code or data. GitHub Actions runs them on every push and pull request (`.github/workflows/tests.yml`). No test calls a real API or spends money.

## What runs

| Suite | Command | Checks |
|---|---|---|
| tokens | `node tests/tokens.mjs` | The colour system on Vici's values in the light and the dark theme: WCAG 2.2 contrast for every pair the page draws (this app's in `lib/prototype.mjs`), every Vici token the CSS and JavaScript name exists, and a report of how far the state tones stay apart under colour-vision deficiency. Shared with the sister apps, unchanged. Node.js only |
| page-icon | `node tests/page-icon.mjs` | `favicon.svg` byte for byte; the header and the loading screen use the page icon's cell; with a checkout of Victor's website (`VIP`) next to this repository, its card gives the Data Quality Agent the same icon and kind (otherwise that part is skipped). Shared, unchanged. Node.js only |
| vici-files | `node tests/vici-files.mjs` | `vici/` holds exactly the files `vici/README.md` lists; with a Vici checkout (`ViciDesign`) at the same release next to this repository, byte for byte. Shared, unchanged. Node.js only |
| vici | `node tests/vici.mjs [--require-vici]` | Vici's own checks, imported from a ViciDesign checkout (`VICI_DIR`, or `ViciDesign` next to this repository): the guide with a row in How it works for each key figure, the byline, the writing rules and the AI notice, on the page; the writing rules on every sentence the scripts put on screen for the six cases along three decision paths (no rule code, user id or tool name among them), on the presenter's own strings and on the docs; SIMULATION in the header, one sentence and the byline under it; `vici/` byte for byte at the commit `vici/README.md` and the workflow name. Each check first fails on a planted control. Without a checkout it says so and passes, unless `--require-vici` is given or it runs on GitHub Actions. Ends with VICI OK. Node.js only |
| world | `node tests/world.mjs` | The builder is deterministic (two builds, the same bytes, equal to `data/world.js`); the eighteen checks of `js/world_check.js`; the shared base re-derived from a Rebate Hunter checkout at commit `73c00f8`; each check failing on a world planted with its fault (AC-05); the script check of the six simulation scripts along every decision path. Node.js only |
| unit | `node tests/unit.mjs` | The streaming client (SSE parsing, thinking signatures, retries, aborts, cut streams) and the cost maths; the data contracts and the validator, with planted violations; the display formats. Node.js only |
| engine | `node tests/engine.mjs [D1 D2 D3 D4]` | The golden cases on the fixtures in `fixtures/`: D1 and D2 (every exception, total and display string; AC-01), D3 (closure rates, 14-day shares, inflows, reconciliation, the what-if) and D4 (fix paths; AC-02), plus routing controls. Node.js only |
| audit | `node tests/audit.mjs` | The figure audit: F01 to F15 with their offending tokens (AC-04), adversarial texts, the whole-euro edge of correction B8 both ways, currencies, dates and weekly cohorts. Node.js only |
| tools | `node tests/tools.mjs` | The agent's seventeen tools: names and schemas within the strict-tool limits; every input checked against its schema; the engine's figures for the six cases equal to the frozen references; every guardrail refusing what it guards against; the review counting only approved suggestions; the figure audit's Unchecked fallback; the honesty check on every text; the projection scoped to the case. Node.js only |
| vat | `node tests/vat.mjs` | The VAT format rule DQ-10: one passing and one failing example per country and Greece (AC-03), further forms, and proof that the rule never consults a check digit. Node.js only |
| policy | `node tests/policy.mjs` | The security policy exactly as specified, in one meta tag; nothing loaded from outside in HTML, CSS, JavaScript or data; `fetch` only in the API client; no inline script, style or handler; every storage key under `dq.` or Vici's own (AC-07). Each scanner first catches planted examples. Node.js only |
| hygiene | `node tests/hygiene.mjs` | No published file names a term of a private list or carries an e-mail address. The list is read from the `HYGIENE_TERMS` environment variable (a CI secret), the file in `HYGIENE_TERMS_FILE`, or a `.hygiene-terms` file next to the repository folder; without it only the generic checks run and the suite ends with HYGIENE GENERIC OK. Node.js only |
| docs | `node tests/docs.mjs` | AC-23: README, DESIGN, DEMO_SCRIPT, DATA_SOURCES, TECH_NOTES and this file carry their sections; README, DEMO_SCRIPT and DESIGN stay within 900, 700 and 700 words and use no em dash; DEMO_SCRIPT answers the five questions that will come and quotes only the engine's euro figures for the default case; the version named is the app's; every section the code cites and every path a document names exists; the README links the live site. Ends with DOCS OK. Node.js only |
| presenter | `node tests/presenter.mjs [steps play kpis cases paths lean guide layout] [--require-vici]` | The page in Chromium, against the engine's figures worked out in Node (`lib/expected.mjs`). steps: the tip and five steps by click, arrow keys, Back, Next and `?case=…&step=…`, each at once; each step's own Next naming where it leads; the *Your turn* callouts with `vc-attention` on the one action; a paused step's Next marked after six idle seconds; by Tab and Enter with a focus ring; reduced motion. play: Start plays the case, each step's rail and Next filling with words on when it moves on; an open dialog holds it; Space and a chosen step pause it; it waits at the decision and the drafts, reads on after, and ends on Replay. kpis: answer first, the four key figures top right showing the engine's figures before anything runs (also with the guide open); after the decision the old values struck through, the clock stopping, Session cost equal to the estimate in Node, the guide quoting the engine. cases: all six along the recommended path to "Done. Nothing was sent.". paths: a rejection, the accepted risk, every path rejected, the review of AI suggestions. lean: at most 12 controls on the first screen; no tool name, user id, rule code, em dash or broken value on any step or guide chapter. guide: opens on a new tab and not on a reload, `?guide=0` and `?guide=present`, a row per key figure, three to seven timed steps, every chapter fitting, and Vici's check-guide-render.mjs against the page (it needs a ViciDesign checkout, as the vici suite does). layout: every step at 1920 × 1080 and 1280 × 720 in both themes without page scrolling and with the main action in view. Every case also fails on a page error, a policy violation or a request to another site. Screenshots in the output folder. Ends with PRESENTER OK |
| live_ui | `node tests/live_ui.mjs [run frame guards unchecked caps]` | Run it live against the scripted API stand-in `lib/fake-claude.mjs`, which streams SSE and checks every request (turns echoed unchanged with their signatures, every tool call answered, the headers); `lib/turns.mjs` builds its answers from a simulation script. run: the key dialog, the key in this tab's session storage only (AC-08), a full run of the default case with the presenter deciding, the engine's figures, the measured Session cost, the audit log valid against its schema, Forget key. frame: the dialog refuses inside a frame. guards: a refused call and a run that still ends. unchecked: a text refused twice shows with its Unchecked tag. caps: no 41st call and none after €3 (AC-11). Ends with LIVE UI OK |
| hexagon | `node tests/hexagon.mjs` | Vici's hexagon rule: nothing in the app's files or on the rendered page (the tour in `lib/prototype.mjs`, both themes, through a whole run) is round. Shared, unchanged |
| live site | `node tests/live_site.mjs [url \| --serve]` | The published site serves exactly this checkout's files (it waits up to twelve minutes for the Pages cache) and a Simulation of the default case completes there with no error and no request to another host. The *live site* workflow runs it after every Pages build; `--serve` runs it against this checkout. Ends with LIVE SITE OK. Not part of `run-all` |

`node tests/run-all.mjs` runs the sixteen suites above (all but the live-site check) in that order, prints a summary and ends with ALL SUITES PASSED when every suite passed; name suites to run only those (`node tests/run-all.mjs engine presenter`), and the run ends with SUITES PASSED and their names. With `--require-vici` (and always on GitHub Actions) the vici and presenter suites fail without a ViciDesign checkout instead of skipping Vici's checks; the workflow checks ViciDesign out next to the app at the commit `vici/README.md` names. The world suite looks for a Rebate Hunter checkout next to this repository (`../PROC-Rebate-Hunter`) or in `PARITY_REF`.

## Setup for the browser suites

You need Node.js 20 or later and Playwright with Chromium. Install them once, outside this folder:

```
npm install -g playwright@1.56.0
npx playwright install chromium
```

The GitHub Actions workflow pins the same version. The suites find a global Playwright by asking npm where global packages live; if that fails, point Node's module path at them:

```
NODE_PATH="$(npm root -g)" node tests/run-all.mjs
```

On Windows PowerShell: `$env:NODE_PATH = (npm root -g); node tests/run-all.mjs`.

Options (environment variables):
- `PLAYWRIGHT_MODULE`: path to a Playwright installation.
- `CHROME_PATH`: use this Chrome or Chromium binary instead of Playwright's.
- `DQ_TEST_OUT`: folder for screenshots and result files (default: a folder named data-quality-agent-tests in the system temp folder).
- `DQ_LAYOUT_SIZES`: other viewports for the layout case, such as `1000x560` (a negative control: that size must fail).
- `PARITY_REF`: path to a Rebate Hunter checkout for the world suite.
- `VICI_DIR`: path to a ViciDesign checkout for Vici's checks (default: `ViciDesign` next to this repository).
- `HYGIENE_TERMS` or `HYGIENE_TERMS_FILE`: the private term list for the hygiene suite.

The browser suites serve the app on `127.0.0.1` at a random port.
