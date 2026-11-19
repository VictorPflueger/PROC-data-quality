# Tests (optional, for developers)

The Data Quality Agent itself needs no Node.js, npm or build step. These scripts are the checks behind the acceptance checklist in `TECH_NOTES.md` §9 and the gates in `GATES.md`. Run them after changing code or data. GitHub Actions runs them on every push and pull request (`.github/workflows/tests.yml`). No test calls a real API or spends money.

## What runs

| Suite | Command | Checks |
|---|---|---|
| tokens | `node tests/tokens.mjs` | The colour system on Vici's values in the light and the dark theme: WCAG 2.2 contrast for every pair the shell and this app draw (this app's in `lib/prototype.mjs`), every Vici token the CSS and JavaScript name exists, and a report of how far the state tones stay apart under colour-vision deficiency. Shared with the sister apps, unchanged. Node.js only |
| page-icon | `node tests/page-icon.mjs` | `favicon.svg` byte for byte; the header and the loading screen use the page icon's cell; with a checkout of Victor's website (`VIP`) next to this repository, its card gives the Data Quality Agent the same icon and kind (otherwise that part is skipped). Shared, unchanged. Node.js only |
| vici-files | `node tests/vici-files.mjs` | `vici/` holds exactly the files `vici/README.md` lists; with a Vici checkout (`ViciDesign`) at the same release next to this repository, byte for byte. Shared, unchanged. Node.js only |
| world | `node tests/world.mjs` | The builder is deterministic (two builds, the same bytes, equal to `data/world.js`); the eighteen checks of `js/world_check.js` (data contracts, references, the 124 shared accounts, the people, no VAT ID passing its check digit, the log agreeing with the data, the six scenarios against the frozen reference figures, the recorded clean spend share); the shared base re-derived from a Rebate Hunter checkout at commit `73c00f8`; each check failing on a world planted with its fault (AC-05). Node.js only |
| unit | `node tests/unit.mjs` | The shared streaming client (SSE parsing, thinking signatures, retries, aborts, cut streams) and cost maths; the data contracts and the validator, with planted violations; the display formats. Node.js only |
| engine | `node tests/engine.mjs [D1 D2 D3 D4]` | The golden cases on the fixtures in `fixtures/`: D1 and D2 (every exception with rule, record, routed-to person, spend, unpaid flag and financing cost within 1e-9, every total and display string; AC-01), D3 (closure rates, 14-day shares, inflows, the first scan's reconciliation, the what-if) and D4 (fix paths, "not applicable", "no history", the integer floor; AC-02), plus routing controls. Name sections to run only those. Node.js only |
| audit | `node tests/audit.mjs` | The figure audit: F01 to F15 with their offending tokens (AC-04), adversarial texts, the whole-euro edge of correction B8 both ways, currencies and the reader's figure types. Node.js only |
| vat | `node tests/vat.mjs` | The VAT format rule DQ-10: one passing and one failing example per country and Greece (AC-03), further forms, normalisation, and proof that the rule never consults a check digit. Node.js only |
| policy | `node tests/policy.mjs` | The security policy exactly as specified, in one meta tag and in Diagnostics; nothing loaded from outside in HTML, CSS, JavaScript or data; `fetch` only in the API client; no inline script, style or handler; every storage key under `dq.` or Vici's `vc-theme` (AC-07). Each scanner first catches planted examples. Node.js only |
| hygiene | `node tests/hygiene.mjs` | No file the repository publishes names a term of a private list or carries an e-mail address. The list never enters the repository: it is read from the `HYGIENE_TERMS` environment variable (a CI secret), from the file named in `HYGIENE_TERMS_FILE`, or from a `.hygiene-terms` file next to the repository folder. Without it only the generic checks run, and the suite ends with HYGIENE GENERIC OK instead of HYGIENE OK. Node.js only |
| parity | `node tests/parity.mjs [Rebate Hunter checkout]` | The shared shell is Rebate Hunter's `main`: the shared modules and the four shared tests character for character (names normalised), the shared stylesheets rule for rule, `vici/` byte for byte, and exactly two adapted files, `js/handover.js` and `js/progress.js`, each named in REVIEW.md with its reason (AC-06). Without a checkout it says so and exits with 2 (`run-all` reports it as skipped) |
| smoke | `node tests/smoke.mjs [cases]` | The page in Chromium: boot in both themes at 1920 × 1080 and 1280 × 720 with no page error, policy violation, request to another site or horizontal scrolling; the header tiles and the weekly cohorts equal to the engine's figures; the fifteen rules; the run controls waiting for version 0.2; How it works opening once by itself; Diagnostics' checks passing; scenario tips; storage keys; Reset; a missing data file named on the boot screen. Screenshots in the output folder. Cases: boot, intro, diagnostics, scenario, storage, reset, missing-data |
| hexagon | `node tests/hexagon.mjs` | Vici's hexagon rule: nothing in the app's files or on the rendered page (the tour in `lib/prototype.mjs`, both themes) is round. Shared, unchanged |

`node tests/run-all.mjs` runs everything in that order, prints a summary and ends with ALL SUITES PASSED when every suite ran and passed; name suites to run only those (`node tests/run-all.mjs engine audit`), and the run ends with SUITES PASSED and their names. The parity and world suites look for a Rebate Hunter checkout next to this repository (`../PROC-Rebate-Hunter`) or in `PARITY_REF`.

## Setup for the browser suites

You need Node.js 20 or later and Playwright with Chromium. Install them once, outside this folder:

```
npm install -g playwright@1.56.0
npx playwright install chromium
```

The GitHub Actions workflow pins the same version. Then run with Node's module path pointing at the global packages:

```
NODE_PATH="$(npm root -g)" node tests/run-all.mjs
```

On Windows PowerShell: `$env:NODE_PATH = (npm root -g); node tests/run-all.mjs`.

Options (environment variables):
- `PLAYWRIGHT_MODULE`: path to a Playwright installation, instead of `NODE_PATH`.
- `CHROME_PATH`: use this Chrome or Chromium binary instead of Playwright's.
- `DQ_TEST_OUT`: folder for screenshots and result files (default: a folder named data-quality-agent-tests in the system temp folder).
- `PARITY_REF`: path to a Rebate Hunter checkout for the parity and world suites.
- `HYGIENE_TERMS` or `HYGIENE_TERMS_FILE`: the private term list for the hygiene suite.

The browser suites serve the app on `127.0.0.1` at a random port between 8790 and 9199.
