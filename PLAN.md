# Data Quality Agent: build plan

**Status:** Phase 0 plan of 19 November 2026, waiting for approval. No app code yet.

This plan turns the build brief into three milestones. The brief decides what to build; this file decides how, in which order, and how each step is proven. Where the plan departs from the brief or from the sister prototypes, it says so and gives the reason. Figures from the brief appear here unchanged; every other figure in this file was measured in Phase 0 and says how. The brief stays outside the repository.

The Data Quality Agent watches the procurement data of GlobalCorp SE, the fictional industrial group of the Rebate Hunter. Fifteen deterministic rules find order lines, contracts, supplier and material records that miss something or contradict each other. The agent reads the records behind the findings, finds the root cause that makes them one case, lets the engine cost two or three ways to fix it next to doing nothing, waits for a person's decision and drafts the follow-ups and change requests. An exception counts as closed only when a re-scan no longer finds it.

Contents: [0 Summary](#0-phase-0-in-one-page) · [1 Findings and probes](#1-phase-0-findings) · [2 Architecture](#2-architecture-and-file-tree) · [3 World and scenarios](#3-the-world-and-how-each-scenario-is-planted) · [4 Engine](#4-the-rule-engine-reconciliation-and-fix-paths) · [5 Events, tools, guardrails](#5-run-events-tool-schemas-and-guardrails) · [6 Screens](#6-screens-at-1920--1080-and-1280--720) · [7 Tests](#7-test-plan-and-ci) · [8 Milestones](#8-milestones-and-acceptance-criteria) · [9 Risks](#9-risks-and-how-i-will-test-them) · [Appendix](#appendix-a-browser-console-probes)

---

## 0. Phase 0 in one page

**What I did.** Read the brief in full. Recomputed every golden case (D1 to D4, F01 to F15) from the brief's own fixture tables with a throwaway engine written for this check: 188 of 188 values and display strings agree, and the same script finds all eight disagreements when three cells of the brief are changed on purpose (section 1.5). Recomputed the brief's claims about Rebate Hunter's world from its `data/world.js`: 13 of 13 agree. Studied the four sister prototypes at their current commits (Rebate Hunter 7.2.0 `73c00f8`, Navigator 1.2.0 `61f1483`, Timetable Translator 1.4.0 `04006b6`, Repack Pilot 0.5.0 `c319649`), Vici v1.0.0 at `fdd868b`, the website at `f6f7aae` and the Duty Radar plan at `b5cf15e`. Measured shared-shell parity across the four sisters file by file. Played one Simulation of each sister in headless Chrome, served from the clones. Probed CORS and the browser header from the shell and from a real Chrome page, re-verified model IDs, prices, API versions, thinking, effort, prompt caching and the strict-tool limits, and drafted all 17 tool schemas and measured them against those limits. Verified the VAT formats and the published check-digit algorithms against official sources (section 1.4).

**The plan in five lines.**

1. The shared shell comes from Rebate Hunter: Vici, 11 of its 13 modules, 5 stylesheets and 4 design tests unchanged; the other two, `js/handover.js` and `js/progress.js`, gain *Your confirmation* the way Repack Pilot's do, and `tests/parity.mjs` lists exactly those two as adapted.
2. A pure, deterministic engine owns every number: the fifteen rules, reconciliation with the exception log, clean spend, financing cost, history and the fix paths. It runs unchanged in the browser and under Node, so the golden cases test the code the app runs.
3. One run-event stream drives the screen in both modes: Simulation replays six hand-authored scripts whose figures the engine recomputes at playback, Live runs Rebate Hunter's agent loop with 17 tools and the guardrails of the brief in `js/guards.js`.
4. The centrepiece is a data-quality board with two views, a honeycomb of the fifteen rules and one row per person an exception is routed to, above eight weekly closure cohorts.
5. Three milestones, each one branch and one pull request with green CI: M1 shell, world and engine (v0.1.0), M2 agent, board and Simulation (v0.2.0), M3 hardening and release (v1.0.0).

**Decisions for you** (section 1.7 has the reasons): the defaults of D1 to D7 as the brief proposes them, and three new ones: N1 who defines the world both procurement prototypes share, N2 the scope of the material and contract rules, N3 what the *Open exceptions* tile counts.

**What I need from you.**

1. Enable GitHub Pages: Settings → Pages → Deploy from a branch → `main` / `/ (root)`. The session proxy refuses the Pages API to me (HTTP 403).
2. Add the repository secret `HYGIENE_TERMS` (Settings → Secrets and variables → Actions), one term per line, naming only what would reveal the relationship. The check matches whole words in every file and has no allowlist, so leave out SAP, Ariba, Microsoft Fabric, Snowflake, Power BI and the other public products the production path names. The proxy refuses the secrets API to me as well.
3. Approve or change the decisions and the corrections in section 1.6. Then I start M1.

---

## 1. Phase 0 findings

### 1.1 What I read

| Source | Commit | What | Notes |
| --- | --- | --- | --- |
| The brief | project file | In full | Kept in the project as `data-quality-agent-prompt.md`; never committed |
| Rebate Hunter 7.2.0 | `73c00f8` (= `main`) | Line by line: `js/agent.js`, `js/guards.js`, `js/figures.js`, `js/config.js`, `js/events.js`, `js/sim_vars.js`, `js/handover.js`, `js/progress.js`, `index.html`, `tools/build_world.mjs` (head), `tools/check_world.mjs`, `tests/lib/harness.mjs`, `tests/sims.mjs` (head), `data/scenarios.js`, one script of `data/sim_runs.js`. Every module's purpose line; the shared shell compared byte for byte | The reference shell and the procurement sibling |
| Timetable Translator 1.4.0 | `04006b6` | Line by line: REVIEW Parts 2–4, DESIGN §3 and §10, `js/tool_plain.js`, `tests/parity.mjs`, `tests/hygiene.mjs`, `tests/docs.mjs` (head), both workflows, `tests/lib/prototype.mjs` (tour) | Its REVIEW's shared-shell list is the base of the reuse map |
| Navigator 1.2.0 | `61f1483` | TECH_NOTES §3 in full (headers, CORS probes, request fields, streaming, stop reasons, errors) | Lacks `js/clock.js` and `js/labels.js`; loads its map library from a CDN, so no model for the security policy |
| Repack Pilot 0.5.0 | `c319649` | PLAN.md outline and §0, TECH_NOTES D69–D83 and §9 (start), `js/handover.js` and `js/progress.js` against Rebate Hunter's, the start of `tests/sims.mjs` | The model for this plan's structure and for the third human step |
| Vici v1.0.0 | `fdd868b` | Guidelines on colour, typography, hexagon, layout and data visualisation; the data-display components (table, stat card, legend); `dist/tokens.json` (474 tokens); the `check` icon (`vc-icon--check` in `dist/vici.min.css`) | Coral is danger, honey warning, sage success, fjord information, lilac the AI; record and rule ids in JetBrains Mono, figures in tabular digits; chart markers are flat-top hexagons with a 1.5 px ring, legends hexagon swatches, part-to-whole a honeycomb waffle, never a pie |
| Website | `f6f7aae` | `data/prototypes.js` (how to add a card) | A card has name, kind, subtitle, description, url, code, icon, tags and note |
| Duty Radar plan | `b5cf15e` | §0 and §1 (probe log of today) | Every probe re-run here (section 1.4) |

Not read in full: the sisters' README, DESIGN, TECH_NOTES, DEMO_SCRIPT and DATA_SOURCES beyond the sections named above, and their domain modules beyond their purpose lines. M1 and M2 read each module this app adapts in full before adapting it.

**Shared-shell parity, measured.** With app names and storage prefixes normalised as `tests/parity.mjs` does, Rebate Hunter and the Timetable Translator are identical in all 22 shared files and `vici/`. Repack Pilot differs in ten (`js/anthropic.js`, `js/cost.js`, `js/dom.js`, `js/drawer.js`, `js/handover.js`, `js/modal.js`, `js/progress.js`, `css/components.css`, `css/console.css`, `css/style.css`), the Navigator lacks `js/clock.js` and `js/labels.js`, and `vici/` is the same in all four. Rebate Hunter's `css/style.css` has no app-specific block (its own rules sit in `css/board.css`); the Timetable Translator's and Repack Pilot's end with the marked block that `tests/parity.mjs` strips. No app module outside the shell is identical between Rebate Hunter and the Timetable Translator, so every one of them is adapted per app.

### 1.2 Sister prototypes played

The live sites are refused from this environment (proxy CONNECT 403 for `victorpflueger.github.io`). I served each clone at its commit from a local server and played its default scenario in headless Chrome 153 (Playwright 1.63) at 1920 × 1080 and ×4, blocking and counting every request to another host. At the first wait for a person I took a screenshot, then approved the recommended option and every draft.

| Prototype | First wait for a person | Done after | Outside requests | Page errors, CSP violations |
| --- | --- | --- | --- | --- |
| Rebate Hunter | *Your decision* on Propose, 17 s | 20 s | None | None |
| Navigator | *Your decision* on Propose, 15 s | 19 s | `unpkg.com`, `cdn.jsdelivr.net`, `tile.openstreetmap.org` (blocked; the run still completes) | None |
| Timetable Translator | *Your decision* on Propose, 10 s | 13 s | None | None |
| Repack Pilot | *Your confirmation* on Prepare, status *Awaiting your confirmation* | 23 s (its default scenario has no options: the confirmation is its only human step) | None | None |

All four showed the SIMULATION badge and the AI disclosure. The Repack Pilot run is the reference for this app's review step: the rail puts the merlot *Your confirmation* tag on the furthest step reached and never moves back.

### 1.3 Target repository

- `VictorPflueger/PROC-data-quality`: public, created 19 November 2026, default branch `main`, no refs before this commit (`git ls-remote` empty, size 0), `has_pages` false. Attached to this session with push access.
- The bootstrap commit holds this plan, a README stub and `.nojekyll`. After it, one branch and one pull request per milestone.
- The proxy refuses the Pages API and the Actions secrets API (HTTP 403), as it did for the other builds.
- `VictorPflueger/PROC-price-variance` exists and is empty (no refs), so the Price Variance Agent's taxonomy and plants do not exist yet (N1).

### 1.4 Probe log

All on 2026-11-19, times in UTC. "Shell" is this build environment's terminal; "web fetch" is the tool that reads public pages (it summarises, so I asked for verbatim quotes).

| # | Date | Probe | How and source | Result | Status |
| --- | --- | --- | --- | --- | --- |
| P1 | 2026-11-19 | CORS preflight | Shell, 19:13: `OPTIONS https://api.anthropic.com/v1/messages` with `Origin: https://victorpflueger.github.io` and the four request headers | 200; `access-control-allow-origin: *`; allow-headers `x-api-key,anthropic-version,content-type,anthropic-dangerous-direct-browser-access`; max-age 600 | verified |
| P2 | 2026-11-19 | Browser header, keyless POST | Shell, 19:13, with and without `anthropic-dangerous-direct-browser-access: true` | With it: 401 `authentication_error`, `access-control-allow-origin: *`, `access-control-expose-headers: *`. Without it: 401 with no `access-control-allow-origin`. The same with `anthropic-version: 2026-10-21` | verified |
| P3 | 2026-11-19 | Browser header from a real page | Headless Chrome 153, page on 127.0.0.1, 19:13 | With the header the page reads the 401; without it `TypeError: Failed to fetch` (a CORS block), for `POST /v1/messages` and `GET /v1/models` alike. The header stays mandatory, as Navigator's TECH_NOTES §3 found on 12 October | verified |
| P4 | 2026-11-19 | `GET /v1/models` as the key check | Shell and Chrome as P2–P3 | 401 readable with the header, so the free key check works from the page | verified |
| P5 | 2026-11-19 | Model IDs | Web fetch, https://platform.claude.com/docs/en/about-claude/models/overview | `claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-opus-5-5` (and `claude-fable-5-2`, not in the sister list); 1M context, 128K output; default effort Sonnet 5.5 high, Haiku 5.5 medium, Opus 5.5 medium; thinking adaptive, always on for Opus 5.5 | verified |
| P6 | 2026-11-19 | Prices | Web fetch, https://platform.claude.com/docs/en/about-claude/pricing | Sonnet 5.5 $2 input, $10 output, $2.50 5-minute cache write, $0.10 cache read; Opus 5.5 $4, $20, $5, $0.20; Haiku 5.5 $0.10, $0.50, $0.125, $0.01 for prompts up to 100,000 tokens and $0.50, $2.50, $0.625, $0.05 above. Identical to Rebate Hunter's `js/config.js`. 1 USD = 0.894 EUR kept as the brief says | verified |
| P7 | 2026-11-19 | API versions | Web fetch, https://platform.claude.com/docs/en/api/versioning.md | `2026-10-21` is the latest and removes `temperature`, `top_p` and `top_k` (none of them is sent); `2023-06-01` is still listed and stays, as in every sister | verified |
| P8 | 2026-11-19 | Thinking and effort | Web fetch, thinking.md, adaptive-thinking and effort pages under https://platform.claude.com/docs/en/build-with-claude/ | Thinking `display` defaults to `omitted` on the three 5.5 models, so the loop keeps asking for `summarized`; thinking blocks go back unchanged with their signatures; some models' blocks work only in the account that made them, so recordings keep UI events, not transcripts. `output_config.effort` takes low to max; Opus 5.5 rejects `thinking: disabled` at every effort | verified |
| P9 | 2026-11-19 | Strict tool limits | Web fetch, https://platform.claude.com/docs/en/build-with-claude/structured-outputs.md | Per request at most 20 strict tools, 24 optional parameters, 16 union-typed parameters; `additionalProperties: false`; no `minimum`, `maximum`, `minLength`, `maxLength`, `maxItems`, `oneOf` or `not`; `minItems` only 0 or 1. The 17 tools drafted in section 5.2 measure 17 strict tools, 20 optional and 3 union-typed parameters: within the limits | verified |
| P10 | 2026-11-19 | Prompt caching | Web fetch, https://platform.claude.com/docs/en/build-with-claude/prompt-caching | A top-level `cache_control: {type: "ephemeral"}` is automatic caching, the breakpoint on the last cacheable block; 5 minutes by default, 1 hour at twice the base input price; 512 tokens minimum on the three 5.5 models; total input = `cache_read_input_tokens` + `cache_creation_input_tokens` + `input_tokens` | verified |
| P11 | 2026-11-19 | VAT formats | Web fetch. The EC's VIES FAQ (https://ec.europa.eu/taxation_customs/vies/faq.html) renders empty (a single-page app); its item 11 table as the French customs reproduce it (https://www.douane.gouv.fr/sites/default/files/2021-02/02/VIES_Structure_des_identifiants_TVA_DEB_2021.pdf, February 2021); HMRC manuals VATGPB9400 and VATREG12450 (gov.uk); the Swiss UID ordinance SR 431.031 Art. 5 and https://www.ch.ch/en/value-added-tax-number-und-business-identification-number/ | DE, FR, NL, AT, IT, EL and CH as the brief writes them. GB: GD and HA numbers confirmed by HMRC, nine digits by both, twelve digits only through a secondary page quoting HMRC's API (HMRC's developer site refuses automated reading). ES differs: VIES says the first and last characters may be letters or digits but not both digits (section 1.6, B1) | partly verified |
| P12 | 2026-11-19 | Check digits | Web fetch, Austrian Ministry of Finance, "UID-Konstruktionsregeln", Stand November 2020 (https://bmf.gv.at/dam/jcr:d6794f8f-d321-43df-9840-1a841f9bf5dc/BMF_UID_Konstruktionsregeln_Stand_November%202020.pdf), rules each member state released for publication; eCH-0097 v5.2.0 (https://www.ech.ch); python-stdnum 2.2 read from PyPI | Published: DE (the iterative MOD 11,10 procedure, first digit not 0), AT, IT (with the office-code range), NL (modulo 11 and, from 2020, modulo 97), GB through XI (modulo 97 or 9755; GD 000–499, HA 500–999). Not published: FR, ES and EL ("einer Veröffentlichung … wurde nicht zugestimmt"). CH: weights 5 4 3 2 7 6 5 4, modulo 11, a result of 10 never issued, in eCH-0097 v5.2.0, which eCH withdrew on 2021-07-02 | verified |
| P13 | 2026-11-19 | Data quality dimensions | Web fetch, https://www.gov.uk/government/news/meet-the-data-quality-dimensions | Six dimensions credited to DAMA(UK) with one-line definitions; page of 24 June 2021 | verified |
| P14 | 2026-11-19 | SAP fields | Web search; third-party dictionary pages https://leanx.eu/sap/table/eban/, https://www.se80.co.uk/sap-data-element/?name=afnam and https://www.sapdatasheet.org/abap/dtel/konnr.html; SAP's own documentation and KBA 2955651 not reached (sign-in) | Third-party dictionary mirrors agree: KONNR "Number of Principal Purchase Agreement", CHAR 10, value table EKKO; AFNAM "Name of Requisitioner/Requester", CHAR 12, on EBAN and EKPO. Until SAP's own pages are read, DATA_SOURCES writes "typical source field, not verified" | not probed |
| P15 | 2026-11-19 | Live sites | Shell: `victorpflueger.github.io` refused (proxy 403), as the brief warns | The sisters were played from their clones (section 1.2) | not probed |
| P16 | 2026-11-19 | GitHub | `gh api`, 19:10 | Repository public and empty; Pages and secrets APIs refused through the proxy | verified |

### 1.5 Golden cases and Rebate Hunter's world, recomputed

<!-- golden-check: none -->
<!-- rh-world-check: none -->

**Golden cases.** A throwaway script outside the repository parses the six fixture tables and every expected table straight from the brief, recomputes them with an engine written for this check, and compares raw values within 1e-9 and display strings exactly (`Intl` with `en-GB`, values rounded to 1e-9 first). Result: 188 of 188 checks agree, so there is no disagreement to report.

- D1: all eighteen exceptions with rule, record, routed-to person, spend affected, exact financing cost and unpaid flag (GBP 1,500 × 1.15 is 1724.9999999999998 in floating point and still shows €1,725, which is why the 1e-9 rounding matters).
- D2: every total and display (€62,725, €4,000, 6.4%, €58,725, €73, €18); the clean lines are L11 and L12.
- D3: closure rates 71.4% → 85.7% → 100.0%, the 14-day shares and inflows, and the first scan's H07 and H09 still routed, H03 closed by re-scan and sixteen new entries; the what-if also finds DQ-01 on L03.
- D4: all five fix paths, the do-nothing figures (24 a year, €4,800, €2,400), the no-history and no-suggestion cases and the integer floor (5 × 1 / 3 → 1).
- F01 to F15: the expected result and offending token for each, with a typed matcher (amounts, shares, counts, days). Rebate Hunter's own `js/figures.js` confirms the brief's note: at its default minimum of €100 it lets F07 pass, and at a minimum of 0 its second reading (€18.411) lets F15 pass.
- Negative control: changing three cells of the brief (D2's clean spend, F10's expected result and H03's status) makes the same script report eight disagreements.

**Rebate Hunter's world.** Recomputed from its `data/world.js` at `73c00f8`: the three company codes as the brief names them; 143 accounts outside the five real groups (by group key and by the register), all invoicing in euros, 129 in company code 1000; 17 groups share a normalised name and country (36 accounts, two groups of three), 124 kept, the same with ASCII-only letters; 30008 and 30098 are both "Inno IT-Services AG" in Paris; the two pound accounts belong to Salesforce; each account has one company code; the Apex accounts 40001 (Stuttgart, DE, DE606060602) and 40002 (Manchester, GB, GB707070702) are no duplicate by DQ-12. Further facts used below: 141 of the 143 tax ids start with "EU"; their countries are DE 67, CH 14, IT 14, AT 13, FR 13, ES 11, NL 10 and GB 1, all within the brief's VAT table; ten categories; all 143 have orders in Rebate Hunter. 13 of 13 claims agree.

### 1.6 What I think is wrong, missing or not buildable

| # | Where | Finding | Proposed fix |
| --- | --- | --- | --- |
| B1 | §6.2 VAT formats, AC-03 | **Wrong for Spain.** VIES's structure table (remark 4 in the French customs' reproduction) says the first and last characters may be letters or digits but not both digits. The brief's "a letter or digit + 7 digits + a letter or digit" accepts ES123456789 | DQ-10 rejects an ES number whose first and last characters are both digits; AC-03's Spanish failing example is exactly that case |
| B2 | §8.1, AC-05 | France, Spain and Greece have not agreed to publish their check-digit rules (Austrian Ministry of Finance, November 2020). Switzerland's rule sits in a withdrawn eCH standard | "Fails the published check digit" applies to DE, AT, IT, NL, GB and CH. For FR and ES the builder also fails the widely used rules (python-stdnum 2.2), and DATA_SOURCES says which rule is official and which is not |
| B3 | §1, §8.1, D5 | The Price Variance Agent's repository is empty, so "the same taxonomy as the Price Variance Agent's" and the shared plants have no source yet | N1 |
| B4 | §5, §9, D3 of §11 | "Open" means two things: the status of an exception found and not yet routed, and the *Open exceptions* tile, which D3 sets to 18 after the first scan (16 open and 2 routed) | N3 |
| B5 | §6.2 | The supplier rules look only at suppliers with order lines in the window; the brief does not say whether DQ-13 and DQ-14 look at materials and contracts without any | N2 |
| B6 | §6.5 | The direction of the sort by spend affected is not stated | Largest first. D1 lists its rows in rule order, so the tests compare the set and the engine's order separately |
| B7 | §6.2 VAT formats | The published rules are slightly stricter than a format check: a German number never starts with 0, GD numbers run 000–499 and HA numbers 500–999 | Keep the brief's format rule (format only, as §6.2 says) and record the refinements in DATA_SOURCES |

Nothing in the brief is unbuildable from here. Four things wait for you: Pages and `HYGIENE_TERMS` (section 0), the live check AC-20 and the demo AC-21.

### 1.7 Decisions for you

| # | Decision | My recommended default | Why |
| --- | --- | --- | --- |
| D1 | Product name and card subtitle | **"Data Quality Agent", subtitle "Procurement data quality"** | The portfolio's name; the subtitle says the domain in three words |
| D2 | Page icon and website card | **Vici's `check` icon in a lilac hexagon cell, kind "prototype"**; the card text comes to you in M3 | `check` exists in Vici v1.0.0 (`vc-icon--check`); lilac is the prototypes' colour on the website |
| D3 | German interface | **Not in version 1** | The four sisters are English; the shell's i18n path is the Duty Radar's if you want it later |
| D4 | Cost of capital, payment assumption, effort parameters | **The brief's defaults** (6 % a year, invoices paid on the order's terms, the parameters of §6.7), each labelled as an assumption | They reproduce D4; the Method dialog shows them and Live mode can change them, logged |
| D5 | One world with the Price Variance Agent | **Yes**: same company, company codes, plants, supplier accounts and taxonomy; each prototype builds its own world, with no runtime dependency | One story across the procurement prototypes |
| D6 | API key for recording simulations | **Six authored scripts**, marked `"source": "authored"`; you record live runs later and I curate them as `"recorded"` | No key here, and I never ask for one |
| D7 | Production-path panel | **In the intro window's last part and in the README**, with the portfolio's products and no client | One small diagram: where each piece would run with real data |
| N1 | Who defines the shared world | **This build, in M1**: `tools/globalcorp_base.mjs`, plain data (company codes, four plants, the 124 accounts with Rebate Hunter's ids, names, cities, countries, currencies and categories, the material-group taxonomy). The Price Variance build copies the file unchanged, and a byte comparison joins each repository's parity test once both exist | Its repository is empty today; whichever build goes first would otherwise invent the taxonomy alone |
| N2 | Scope of DQ-13 and DQ-14 | **Only materials and contracts with order lines in the analysis window**, like the supplier rules | A dormant material or an expired, unused contract carries no spend and no follow-up worth a case; it keeps the honeycomb about money. D1 to D4 are unchanged: M3 and K2 both have lines |
| N3 | What the *Open exceptions* tile counts | **Every exception not closed and not dismissed** (open, routed and accepted), as D3's 18 requires; the status word *open* keeps its meaning (found, not yet routed) and the tile's note says "open, routed or accepted" | The tile then agrees with clean spend, which excludes the same three statuses |

---

## 2. Architecture and file tree

### 2.1 Layers

1. **Data** (`data/`, `tools/`): a generated world as a classic script (`window.WORLD`), the six tips (`window.SCENARIOS`), frozen reference figures per scenario and six simulation scripts. The security policy allows no fetch from the page's own origin, so everything ships as scripts.
2. **Engine** (`js/rules.js`, `js/engine.js`, `js/history.js`, `js/fixpaths.js`, `js/vat.js`, `js/figures.js`, `js/format.js`): pure functions, no DOM and no state, the same code in the browser and in the Node tests.
3. **Tools and guards** (`js/tools.js`, `js/schemas.js`, `js/validate.js`, `js/guards.js`, `js/erp.js`, `js/world.js`): the 17 tools, each input checked against its JSON Schema by the app's own validator, and the guardrail policy that both producers share.
4. **Producers** (`js/agent.js`, `js/simulation.js`, `js/recorder.js`): the live loop and the script player emit the same run events; the recorder turns a live run into a script.
5. **Screen** (`js/ui.js` and the view modules): header tiles, control bar, board, console, drawer, dialogs. They listen to the run-event bus and never ask which producer runs.

### 2.2 How a run works

Start agent opens the mode dialog. Simulation plays the chosen scenario's script; Live asks for the key once (checked with `GET /v1/models`) and starts the loop with the tip as the only opening message. The rail follows the run states (Spot: `dq_scan`; Check: records, grouping, suggestions and the review; Calculate: history and fix paths; Propose: the options and *Your decision*; Prepare: the drafts and *Your approval*). While AI-suggested values wait for review, the rail shows *Your confirmation* on the furthest step reached. Approving a fix path shows its projection (*approved, re-scan pending*), never a closure. The report ends the run; exports and "Save run as simulation" follow.

### 2.3 File tree

```text
index.html              header, control bar, board, console, drawer, boot screen; the security policy of the brief
favicon.svg             Vici's check icon in a lilac hexagon
.nojekyll  README.md  DESIGN.md  TECH_NOTES.md  DATA_SOURCES.md  DEMO_SCRIPT.md  REVIEW.md  PLAN.md  GATES.md
vici/                   Vici v1.0.0, byte for byte as in Rebate Hunter
css/   style.css (shared part + marked app block)  components.css  console.css  drawer.css  modals.css  board.css
data/  world.js  scenarios.js  reference_cases.js  sim_runs.js
js/    shell:     theme anthropic sse cost keystore clock dom drawer labels md modal (copied)  handover progress (adapted)
       app-own:   config events icons
       engine:    rules engine history fixpaths vat figures format
       tools:     tools schemas validate guards erp world tool_plain prompt agent
       replay:    simulation sim_check sim_vars recorder world_check
       screen:    main ui state controls dialogs intro method review kpi console summaries run_facts
                  board board_rules board_people board_cohorts board_pop popovers
                  options_panel outbox drafts payoff audit audit_panel ai_label exports diagnostics diagnostics_view
tools/ globalcorp_base.mjs  build_world.mjs  check_world.mjs
tests/ run-all  tokens hexagon page-icon vici-files (shared)  unit  world  engine  audit  vat  hygiene  docs  parity
       smoke  sims  live  accept  layout  design  live_site  remote_head
       lib/harness  lib/prototype  lib/fake-claude   fixtures/ (D1–D4, F01–F15, VAT examples)
.github/workflows/  tests.yml  live-site.yml
```

### 2.4 Reuse map

Verdicts: **copy** (unchanged; for shared files checked by `tests/parity.mjs`), **adapt** (taken from a sister and changed where the note says), **replace** (same role, new content for this domain), **drop** (not taken), **new** (no sister twin).

#### Shared shell (the Timetable Translator's REVIEW.md, Part 2)

| File | Verdict | Note |
| --- | --- | --- |
| `vici/` | copy | Vici v1.0.0 with `vici/README.md`, byte for byte as Rebate Hunter's (`tests/vici-files.mjs`, parity) |
| `js/theme.js`, `js/anthropic.js`, `js/sse.js`, `js/cost.js`, `js/keystore.js`, `js/clock.js`, `js/dom.js`, `js/drawer.js`, `js/labels.js`, `js/md.js`, `js/modal.js` | copy | Identical to Rebate Hunter's `main` after name normalisation |
| `css/components.css`, `css/console.css`, `css/drawer.css`, `css/modals.css` | copy | Same rules as Rebate Hunter's |
| `css/style.css` | copy | Rebate Hunter's file down to the marker line "App-specific: not part of the shared shell"; this app's rules (header tiles, honeycomb sizes) in the block below it |
| `tests/tokens.mjs`, `tests/hexagon.mjs`, `tests/page-icon.mjs`, `tests/vici-files.mjs` | copy | The same file in every prototype; this app's values live in `tests/lib/prototype.mjs` |
| `js/handover.js`, `js/progress.js` | adapt | *Your confirmation* as in Repack Pilot (section 2.5); Rebate Hunter's five steps and its `no_findings` ending stay |

#### Files the shell imports, and test infrastructure

| File | Verdict | Note |
| --- | --- | --- |
| `js/config.js` | adapt | `APP` (id `dq`, name, version), the three models and prices of P5–P6, `anthropic-version: 2023-06-01`, the browser header, caps (40 calls, €3, 90 s idle), 1 USD = 0.894 EUR, every storage key under `dq.`; no web search, no open data |
| `js/events.js` | adapt | Rebate Hunter's bus and envelope; this app's event types (section 5.1), Rebate Hunter's run-state ids so that `js/progress.js` keeps its state map |
| `js/icons.js` | adapt | Vici's set plus Rebate Hunter's own drawings (stop, memo, key, eye-off, pulse, list, shield); nothing new drawn |
| `tests/lib/harness.mjs` | adapt | Prefix `dq.`, output folder `DQ_TEST_OUT` |
| `tests/lib/prototype.mjs` | adapt | This app's colour pairs, the hexagon tour through the board, the review and both decision paths, the page icon (`check`, lilac) |
| `tests/parity.mjs` | adapt | The Timetable Translator's test with this app's name and `dq.` in the name normalisation; `js/handover.js` and `js/progress.js` move to a list of adapted files, which must exist and be listed in REVIEW.md |
| `tests/hygiene.mjs` | copy | The Timetable Translator's test; its term list is the `HYGIENE_TERMS` secret |
| `tests/docs.mjs` | adapt | English DEMO_SCRIPT headings (Pre-flight, the five-minute version, Contingencies, Questions that will come) and this app's live URL |
| `tests/live_site.mjs`, `tests/remote_head.mjs` | adapt | The published site serves this commit and plays a Simulation |
| `.github/workflows/live-site.yml` | copy | Runs after every Pages build |
| `js/tool_plain.js` | adapt | The Timetable Translator's pattern: one plain sentence per tool call, written for the 17 tools here |
| `tests/pitch.mjs` | drop | Its pitch checks belong to the Timetable Translator's mirror; `tests/accept.mjs` covers this app's five-minute path |

#### Rebate Hunter's modules (`js/`)

| File | Verdict | Note |
| --- | --- | --- |
| `js/agent.js` | adapt | The loop as it is: streaming, stop reasons, retries, the `max_tokens` retry, two nudges, caps, audit of every exchange, graceful downgrade of optional request fields. Removed: web search and its evidence; parallel calls only for `erp_*` reads; this app's phases and continue instructions |
| `js/prompt.js` | replace | This app's system prompt (the ten rules of the brief's section 7) and opening message (the tip only) |
| `js/tools.js` | replace | The 17 tools of section 5.2 with their executors; every input through `js/validate.js` |
| `js/guards.js` | replace | The policy of section 5.4: scanned exceptions only, verified alert, reviews, options, drafts, report; shared with `js/sim_check.js` |
| `js/figures.js` | adapt | Rebate Hunter's reader with the brief's changes: minimum 0, no €0.50 floor, a comma before exactly three digits always groups thousands, typed figures (amounts, shares, counts, days), ids and codes exempt but required to exist |
| `js/sim_vars.js` | replace | This app's figure names (`scan.clean_share`, `case.n`, `path.A.cost` …) and `fillTemplate` as Rebate Hunter's |
| `js/simulation.js` | adapt | Rebate Hunter's player and step kinds, plus a `review` step; `source` marks as in Repack Pilot |
| `js/sim_check.js` | adapt | Holds every script to the live guardrails, the review included |
| `js/recorder.js` | adapt | "Save run as simulation" with `"source": "recorded"` |
| `js/world.js` | replace | Indexes over the five data products and the log |
| `js/erp.js` | replace | `erp_get_overview`, `erp_query`, `erp_get_record` over the data products |
| `js/rebate.js` | replace | By `js/rules.js`, `js/engine.js`, `js/history.js`, `js/fixpaths.js` and `js/vat.js` (section 4) |
| `js/world_check.js` | replace | The world's checks (section 3.6), in the browser (Diagnostics) and under Node |
| `js/payoff.js` | adapt | What an approval changes on screen: *approved, re-scan pending* and the projection, never *closed* |
| `js/options_panel.js` | adapt | Fix-path cards A to D and doing nothing, figures from the engine by path id, the recommended card in the merlot frame, one solid Approve |
| `js/outbox.js`, `js/drafts.js` | adapt | Four draft kinds; code appends the footers and builds the change request's table from the engine |
| `js/kpi.js` | replace | Closure rate, clean spend, open exceptions, session cost |
| `js/board.js`, `js/board_band.js`, `js/board_data.js`, `js/board_group.js`, `js/board_portfolio.js`, `js/board_race.js` | replace | By the data-quality board: `js/board.js` (the frame and the two views), `js/board_rules.js` (honeycomb), `js/board_people.js` (people rows), `js/board_cohorts.js` (weekly cohorts and their table) |
| `js/board_pop.js`, `js/popovers.js` | adapt | One popover at a time; a record's fields from the same ERP queries the agent uses |
| `js/console.js` | adapt | The logbook as it is, the plain sentence above each tool call, *Guardrail* lines |
| `js/summaries.js`, `js/run_facts.js` | adapt | One-line summaries of this app's tool results; the run-facts line |
| `js/controls.js` | adapt | Scenario menu, Live sweep, model, ×1 ×2 ×4, status, Abort, Reset, Diagnostics, plus **Method** |
| `js/dialogs.js` | adapt | Mode, key, custom what-if, report; the review and Method dialogs live in their own modules |
| `js/intro.js` | adapt | "How it works" in this app's words, ending with the production path |
| `js/ui.js`, `js/main.js`, `js/state.js` | adapt | Wiring, data-file checks before start, observable state |
| `js/audit.js`, `js/audit_panel.js` | adapt | Every event and model exchange, with rule-set and engine versions; JSON export |
| `js/ai_label.js` | adapt | Names only |
| `js/format.js` | replace | `Intl` with `en-GB` and the 1e-9 rounding of the brief's section 5 |
| `js/diagnostics.js`, `js/diagnostics_view.js` | adapt | The policy check, the key check, the world's checks, the parameters read-only, the exchange rate's source and date, "Run all tests"; no open-data probes |
| `js/opendata.js`, `js/source_health.js` | drop | No open data and no web search here |
| `js/similarity.js` | drop | Similar names never make a duplicate (DQ-12 compares normalised names for equality) |
| `js/theme.js`, `js/anthropic.js`, `js/sse.js`, `js/cost.js`, `js/keystore.js`, `js/clock.js`, `js/dom.js`, `js/drawer.js`, `js/labels.js`, `js/md.js`, `js/modal.js`, `js/handover.js`, `js/progress.js`, `js/config.js`, `js/events.js`, `js/icons.js` | see above | Shared shell and its imports |

#### Rebate Hunter's root files, styles, data, tools, tests and workflow

| File | Verdict | Note |
| --- | --- | --- |
| `index.html` | adapt | The same skeleton; the policy without the open-data hosts; this app's header, board and boot screen |
| `favicon.svg` | replace | Vici's `check` in a lilac hexagon |
| `.nojekyll` | copy | "Serve files as they are" |
| `css/board.css` | replace | Honeycomb, people rows, cohorts |
| `data/world.js` | replace | Generated by `tools/build_world.mjs` |
| `data/scenarios.js` | replace | The six tips of section 3.4 |
| `data/reference_cases.js` | replace | Frozen reference figures per scenario (AC-05) |
| `data/sim_runs.js` | replace | Six authored scripts (section 5.5) |
| `tools/build_world.mjs` | replace | Seeded builder (section 3) with Rebate Hunter's Python-compatible random generator |
| `tools/check_world.mjs` | adapt | Runs `js/world_check.js` and `js/sim_check.js` under Node |
| `tools/legacy_seed.mjs`, `tools/legacy_reference.py` | drop | They regenerate Rebate Hunter's Streamlit data, which this world does not need (the accounts come from `tools/globalcorp_base.mjs`); only the Python-compatible random generator class of `tools/legacy_seed.mjs` moves into `tools/build_world.mjs` |
| `tests/run-all.mjs` | adapt | Node suites and browser suites as in section 7 |
| `tests/unit.mjs` | adapt | Streaming client and cost maths as Rebate Hunter's, plus the schema validator and `js/format.js` |
| `tests/engine.mjs` | replace | D1 to D4 against `tests/fixtures/` (AC-01, AC-02) |
| `tests/smoke.mjs`, `tests/sims.mjs`, `tests/live.mjs`, `tests/accept.mjs`, `tests/layout.mjs`, `tests/design.mjs` | adapt | This app's flows (section 7) |
| `tests/README.md` | adapt | What runs and how |
| `tests/lib/fake-claude.mjs` | adapt | The scripted stand-in, with this app's tools |
| `tests/lib/fixtures.mjs` | drop | Open-data fixtures; nothing here calls open data |
| `.github/workflows/tests.yml` | adapt | The Timetable Translator's: Node 22, ubuntu-24.04, Playwright 1.56.0, parity against Rebate Hunter's public repository, `HYGIENE_TERMS` from the secret |

New files without a sister twin: `js/rules.js`, `js/engine.js`, `js/history.js`, `js/fixpaths.js`, `js/vat.js`, `js/schemas.js`, `js/validate.js`, `js/review.js`, `js/method.js`, `js/exports.js`, `js/board_rules.js`, `js/board_people.js`, `js/board_cohorts.js`, `tools/globalcorp_base.mjs`, `tests/world.mjs`, `tests/audit.mjs`, `tests/vat.mjs`, `tests/fixtures/`.

### 2.5 The two adapted shell modules

- `js/handover.js`: Repack Pilot's version (one `awaited` value, "decision", "approval" or "confirmation", set by `options`, `option_decision`, `action_draft`, `state_change`, `confirmation_request` and `confirmation_decision`, and `turnLabel`), with its comment worded for AI-suggested values instead of an item-master entry. The event names stay Repack Pilot's, so the two adapted copies stay comparable.
- `js/progress.js`: Rebate Hunter's file, including its steps Spot, Check, Calculate, Propose, Prepare and its `no_findings` ending, plus only Repack Pilot's confirmation logic: while a confirmation waits, the step is the furthest one reached (`Math.max(reached, 0)`), its tag reads *Your confirmation* in merlot, and the status tag says "Awaiting your confirmation". The rail never moves back.
- REVIEW.md lists both with this reason; `tests/parity.mjs` checks every other shared file against Rebate Hunter's `main`.

---

## 3. The world and how each scenario is planted

### 3.1 What comes from Rebate Hunter

`tools/globalcorp_base.mjs` (N1) holds, as plain data: the three company codes of the brief; four plants (1010 Frankfurt, headquarters site and central warehouse, and 1020 Duisburg, production, in 1000; 2010 Birmingham in 2000; 3010 Lyon in 3000); the 124 accounts kept from Rebate Hunter's 143 (one per duplicate-name group, with Rebate Hunter's ids, names, cities, countries, currencies and categories), extracted once from its `data/world.js` at `73c00f8` with the extraction recorded in DATA_SOURCES; and the taxonomy below. New accounts take ids from 80001 up, a range Rebate Hunter does not use (its accounts run 10001–70004).

**Material-group taxonomy (20 groups, following the ten categories).** MRO supplies: `MRO-PPE`, `MRO-TOOLS`, `MRO-SPARES`, `MRO-LUBE`. Chemicals: `CHEM`, `CHEM-CLEAN`. Packaging: `PACK-CARTON`, `PACK-FILM`, `PACK-PALLET`. Automation and robotics: `AUTO-ROB`, `AUTO-SVC`. IT services: `SVC-IT`. Consulting: `SVC-CONS`. Facility management: `SVC-FM`. Logistics services: `SVC-LOG`. Security services: `SVC-SEC`. Fleet services: `SVC-FLEET`. New for this world: `LAB-CONS`, `LAB-EQUIP`, `OFFICE`. The fixture's codes are all in it.

### 3.2 Records the builder adds

Seeded like Rebate Hunter's builder (its Python-compatible generator, a fixed seed), all day numbers relative to day 0.

| Product | Size | Notes |
| --- | --- | --- |
| `supplier` | 124 + about 15 new | Country, city, VAT ID in the country's format and failing its check digit (section 3.3), bank country and last four digits, terms per company code, purchasing block from, created day, onboarding channel (central onboarding, self-registration portal, migrated). About 60 of them, plus the new ones, get order lines |
| `material` | about 300 | Description, group, base unit; a few without a group in the background |
| `contract` | 24 | Supplier, company code, group, validity, terms, owner |
| `user_org` | about 40 | Role and team ("Buyer, MRO, Frankfurt"), company code, active until, manager; given name and an initial only; one supplier master steward, one material master steward, one procurement lead |
| `po_line` | about 2,000 over the last 365 days | All fields of the brief's section 6.1, channels catalog, punch-out, free-text requisition, direct order and contract call-off; order numbers 45001xxxxx, items 10, 20 … |
| `exception_log` | 26 weeks | Background exceptions detected, routed, closed or dismissed over the weeks; each scenario's exceptions as routed entries detected 14 to 69 days ago and never closed; a few entries whose records were corrected since, which the first scan closes |

### 3.3 VAT IDs and bank details

Every supplier gets a VAT ID in its country's format (DE, FR, GB, NL, AT, IT, ES, CH), generated and then changed until it fails the country's published check digit (DE, AT, IT, NL, GB, CH) and, for FR and ES, the widely used rules as well (B2). Bank details are a country and four digits, as in Rebate Hunter. A supplier with no VAT ID, a wrong prefix or a broken format exists only where a scenario or the background rate puts one.

### 3.4 How each scenario is planted

Each case is planted so that one `dq_group` result names it with a group holding well over half of its base, and so that its records are readable with `erp_get_record`. Counts below are targets; M1 calibrates them and freezes the results in `data/reference_cases.js`.

| # | Scenario | Planted | Group that names the case | Suggestions | Fix at source | Paths the engine finds applicable |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Contract references lost in punch-out | A new laboratory supplier in Lyon with a framework contract (3000, `LAB-CONS`, 45 days, valid all year) and a punch-out catalog; about 25 punch-out lines at plant 3010 without a contract reference (DQ-01), its catalog and call-off lines clean | `dq_group([DQ-01], by: channel)` filtered to plant 3010: punch-out | Deterministic for all: the contract | The punch-out mapping that drops the contract number | A, B, C, D |
| 2 | Paying too early | Two new suppliers in 2000 that invoice in pounds, with contracts on 60 days; the Indirect team in Birmingham creates its orders through one shared buying profile whose default terms key is 14 days: about 20 lines with DQ-07, four without terms (DQ-06), a few ordered less than 14 days ago and so still unpaid | `dq_group([DQ-07, DQ-06], by: created_by)` in company code 2000: the shared profile | Deterministic: the contract's terms | The profile's default payment-terms key | A, B, C, D |
| 3 | Unclassified spend | About 30 free-text requisitions at plant 1020 without a material group (DQ-02), with short texts that name what they are ("Hydraulic oil HLP 46, 20 l drum"); a few lines with a material, whose group the master gives | `dq_group([DQ-02], by: channel)` at plant 1020: free-text requisition | The material master's group where there is a material; for free text the agent proposes groups with `dq_classify` and a person reviews them | A mandatory material group in the free-text form | A and C count deterministic and approved suggestions; B and D always |
| 4 | Who ordered this? | A reorganisation on day −120 at plant 1010: requesters who left are still on requisition templates (DQ-05, routed to their managers; where a manager left too, to that manager's manager or else the procurement lead), and a form lets the requester stay empty (DQ-04, routed to the buyers) | `dq_group([DQ-04, DQ-05], by: plant)`: 1010 | None (A and C not applicable) | Requester required and checked against active users | B, D |
| 5 | New suppliers, half the data | About eight suppliers onboarded through the self-registration portal between day −120 and day −30: terms missing in a company code they order in (DQ-09), VAT ID missing or malformed (DQ-10), no bank details or a foreign bank (DQ-11) | `dq_group([DQ-09, DQ-10, DQ-11], by: onboarding_channel)`: self-registration portal | None | Required fields and format checks in onboarding | B, D |
| 6 | Two Apexes? | The Apex accounts stay as Rebate Hunter has them (DE and GB, different VAT IDs: no DQ-12). A new account (80xxx) duplicates one of the 124 kept accounts: same VAT ID, same name, same country, created by an interface load; it was blocked for purchasing on day −60 when someone noticed, and the interface still sent orders to it (DQ-08) | `dq_group([DQ-12, DQ-08], by: supplier)`: the blocked account | None | The interface's block check, and merging the duplicate | B, D |

Two choices in this table are mine. Scenario 2 groups by *created by* because `dq_group` has no team key and the verified alert needs one group with half the base: the team's orders share one buying profile, and its default terms key is the root cause. Scenario 6 plants the pair with a new account rather than by keeping one of Rebate Hunter's duplicate-name pairs, because AC-05 requires exactly the 124 accounts.

Every tip is the brief's wording, delivered as the only opening message in Live mode. **Live sweep** scans all rules, ranks the cases by severity and spend, and investigates the first; **Custom what-if** takes any tip.

### 3.5 Background and calibration

Background exceptions occur at low rates in every rule, outside the planted groups, so the whole world's clean spend share lands near 75 % (measured and recorded in M1; the brief asks for "around"). Supplier-level rules taint every line of their supplier, so background DQ-09 to DQ-12 go to small suppliers only. The builder runs twice in CI and the outputs must be byte for byte the same.

### 3.6 World checker

`js/world_check.js` (Diagnostics and `tools/check_world.mjs`): referential integrity of every id; day numbers inside their windows; the 124 accounts equal to `tools/globalcorp_base.mjs`; no VAT ID passes a published check digit; every scenario's case found as section 3.4 says, against the frozen reference figures; the log agrees with the data (open, routed and accepted entries are found by a scan, except the planned corrections; closed entries are not; no entry before day −181); the clean spend share recorded; every simulation script under the live guardrails (AC-13).

---

## 4. The rule engine, reconciliation and fix paths

### 4.1 Rule engine

`js/rules.js` holds the fifteen rules as data plus one predicate each; `js/engine.js` runs them over the window. The recomputation of D1 to D4 in Phase 0 used exactly this structure. Notes per rule, where the brief leaves a choice:

- **DQ-01** needs the line's material group to match a contract; of several valid contracts the one valid from the latest day is suggested.
- **DQ-02** suggests the material master's group when the line has a material; free-text lines get only approved AI suggestions.
- **DQ-03** fires only when line and master both have a group; a master without one is DQ-13.
- **DQ-04** treats a requester id that matches no user as missing; **DQ-05** compares "active until" with the order day and routes to the requester's manager.
- **DQ-06** and **DQ-07** use the agreed terms (contract first, then the supplier's terms in the line's company code); without agreed terms DQ-07 cannot fire and DQ-06 has no financing cost.
- **DQ-08** fires on lines ordered on or after the supplier's block day.
- **DQ-09** is per supplier and company code; **DQ-10** checks prefix and format only (`js/vat.js`, section 1.6 B1); **DQ-11** compares the bank's country with the supplier's.
- **DQ-12** pairs a supplier with lines with any other record, by equal VAT ID or equal normalised name in one country; the record key is the sorted pair.
- **DQ-13** and **DQ-14** look at materials and contracts with lines in the window (N2); DQ-14's responsible person is the procurement lead.
- **DQ-15** checks the referenced contract's validity on the order day.

Routing: the responsible person if active today, else their manager if active, else the procurement lead. Identity: rule plus record key; a dismissed exception is not raised again. Order: severity, then spend affected (largest first, B6), then rule id, then record id.

**Grouping (`dq_group`).** Each exception takes its group values from its record: a line rule from the line (plant, company code, supplier, channel, buyer, requester, created by, material group); a supplier rule from the supplier (supplier, onboarding channel) and, for plant and company code, from its lines; a pair (DQ-12) belongs to the groups of both suppliers; a material or contract rule from its lines; *week detected* from the log. An exception with several values counts once in each group; each group's share is its count over the base count, and its spend counts each line once.

### 4.2 Spend, clean spend and financing cost

Spend affected per exception follows the brief's section 6.3; clean spend excludes every line touched by an open, routed or accepted exception on the line, its supplier, its material or its contract; no tile or case sums spend across exceptions, it unions their lines. The financing cost per line is the brief's formula; a line is unpaid when it was ordered fewer days ago than its own terms. Values in pounds convert at one rate for the window (`fx_to_eur`, its source and date in Diagnostics).

### 4.3 History and reconciliation

`js/history.js`: the closure rate over the cohort detected 14 to 69 days ago (closed over not dismissed); the 14-day closure share over entries routed at least 14 days ago; the monthly inflow over the last 90 days; the eight weekly cohorts (week 1 = days −20 to −14 … week 8 = days −69 to −63) with detected, closed and still open. Reconciliation after every scan, within the rules and filters it ran: still found stays; found for the first time becomes a new entry today; no longer found closes today as "closed by re-scan"; a closed exception that reappears gets a new entry linked to the old one. An entry becomes routed on the day a person approves a draft to its routed-to person. A projection is the same scan and reconciliation on a copy of the data with the approved changes applied; it is shown as *projected after re-scan* and never written to the log.

### 4.4 Fix paths

`js/fixpaths.js` implements the table of the brief's section 6.7 with the parameters of the Method dialog: closed, spend covered (over distinct lines), financing cost avoided now, exceptions prevented a year, future cost avoided a year, one-off effort, days, and for doing nothing the yearly growth and its cost. A and C are not applicable without suggestions; B and D project 0 without history; B's closures use integer floor. Suggestions count only when deterministic or approved in the review.

### 4.5 Rounding and display

Full precision in the engine; `js/format.js` rounds every value to 1e-9 and formats with `Intl` and `en-GB`: euros without decimals, shares with one decimal, inflow with one decimal, counts and days whole, dates "Thu 19 Nov" (with the year when it is not this year).

### 4.6 Figure audit

`js/figures.js` is Rebate Hunter's reader with the brief's changes, and the matcher is typed: an amount must lie within half a unit of its last written digit and within 2 % of a known amount; a percentage, count or day within half a unit of a known share, count or day; record, rule and exception ids, order and item numbers, codes after "plant", "company code", "supplier", "vendor" or "account", and dates are exempt but must exist; counts in words pass. Known figures are the typed values of this run's engine and ERP results; a draft may quote only the result its approved path rests on and a projection only as a projection. Phase 0's matcher of this design passed F01 to F15.

---

## 5. Run events, tool schemas and guardrails

### 5.1 Run events

The envelope and bus are Rebate Hunter's (`id, seq, type, ts, t, run_id, mode, payload`). Types, both producers alike:

| Type | Payload (main fields) | Shown as |
| --- | --- | --- |
| `run_start` | run id, mode, entry (scenario, sweep, custom), scenario, model, `sim_source` | Run line, mode badge, SIMULATION tape |
| `state_change` | state (Rebate Hunter's ids: scanning, diagnosing, verifying, simulating, options, awaiting_approval, executing, done, stopped, aborted, error) | Rail and status tag |
| `narration`, `reasoning` | streamed text | Console; reasoning collapsed |
| `tool_call`, `tool_result` | name, input; ok, summary, result | Plain sentence from `js/tool_plain.js`, details one click away; a refused `ui_*` call as a *Guardrail* line |
| `board_update` | rules, records, people, view, state | Fjord outline pulses, cell and row states |
| `kpi_update` | closure rate, projected rate, clean spend and share, open exceptions and their spend | Header tiles |
| `alert` | case: grouping id and group, rules, root cause, fix at source, records read, affected lines, spend, financing cost, routing, "Checked in this run" | Case card |
| `confirmation_request`, `confirmation_decision` | review items (line, short text, proposed group, words, confidence); approve or reject each | Review dialog, *Your confirmation* |
| `options`, `option_decision` | fix-paths id, options, recommended; approved or rejected, by the user, `options_seq` | Options tab, *Your decision* |
| `action_draft`, `action_decision` | kind, recipient, subject, body, records; approved or rejected | Outbox, *Your approval* |
| `report` | markdown, outcome | Report dialog, Markdown export |
| `cost_update`, `notice`, `attempt_discarded`, `run_end` | as Rebate Hunter's | Session cost tile, notices, discarded attempts, end of run |

### 5.2 Tool schemas

Drafted in Phase 0 and measured against the strict limits (P9): 17 tools, 20 optional parameters, 3 union-typed parameters, no unsupported keyword. Bounds the strict grammar cannot carry (at most 50 rows, one or two grouping keys, two or three options) are checked by `js/validate.js` and the executors. Every result is JSON; figures carry stable names.

| Tool | Kind | Input (required in bold) | Returns |
| --- | --- | --- | --- |
| `erp_get_overview` | Data | none | Company codes, plants, data products with row counts and as-of day, the rule catalogue, the parameters |
| `erp_query` | Data | **product**, filters (field, op, values), fields, order_by, descending, limit ≤ 50 | Up to 50 rows and the total count |
| `erp_get_record` | Data | **product**, **id** | The record with all fields and its related records (supplier, material, contract, requester, buyer, their managers) |
| `dq_scan` | Engine | rules, filters | Exceptions by rule, product, severity and routed-to person; clean spend, spend with an open exception, financing cost; top exception ids; what the reconciliation did |
| `dq_group` | Engine | **rules**, **by** (one or two keys), filters | A result id (`grp-n`), the base count, per group: key and value, count, spend over distinct lines, share of the base |
| `dq_suggest` | Engine | **grouping**, **group** | Per exception the deterministic suggestion with its source, or none |
| `dq_classify` | Record (AI) | **items** (line, group code, words, confidence) | Accepted items as AI-suggested and pending review; refused items with the reason (unknown code, words not in the short text) |
| `dq_history` | Engine | rules, or grouping and group (one of the two, checked in code) | Closure rate, cohorts, 14-day share, inflow |
| `dq_fix_paths` | Engine | **grouping**, **group** | A result id, paths A to D and doing nothing with every figure of the brief's section 6.7, applicability |
| `ui_mark_board` | Screen | rules, records, people, view | Done |
| `ui_request_review` | Person | **line_ids**, note | Waits; the person's decision per item |
| `ui_report_alert` | Screen | **title**, **grouping**, **group**, **root_cause**, **fix_at_source**, **summary** | The verified case, or a refusal saying what is missing |
| `ui_propose_options` | Person | **fix_paths_id**, **options** (path, title, description, residual risk), **recommended**, **nothing_note** | Options shown, or a refusal |
| `ui_await_decision` | Person | none | The decision on the options on screen |
| `ui_draft_action` | Outbox | **kind**, **recipient**, **subject**, **body**, records | The draft as shown (with code's footers and tables), or a refusal |
| `ui_await_approvals` | Person | none | Every draft's decision |
| `ui_final_report` | Summary | **outcome**, **markdown** | Ends the run, or a refusal |

Strict tool use stays off in version 1, as in every sister: the validator returns `is_error: true` with an instructive message for any input that breaks its schema, and the first request of a run avoids the grammar compilation. Turning it on is one line in `js/config.js`, logged in TECH_NOTES, because the drafts measure within the limits.

### 5.3 Agent loop, caps and cost

Rebate Hunter's loop: at most 40 model calls and €3 per run (checked after every call), a 90-second idle limit, two transport retries, one `max_tokens` retry with 1.5 times the room, at most two nudges after an early `end_turn`, `refusal` and a full context window end the run. Request fields as Rebate Hunter's: automatic prompt caching, adaptive thinking with summaries, the model's effort from `js/config.js` (medium for Sonnet and Haiku, high for Opus, as the sisters), `tool_choice` auto. The cost meter equals usage × price (AC-11).

### 5.4 Guardrails in code

`js/guards.js`, applied to live tools and by `js/sim_check.js` to every script:

1. Tool results and record texts are data; the system prompt says so and no tool result is ever placed in the system prompt.
2. An alert, a review or an option names only exceptions this run's `dq_scan` returned.
3. **Verified alert**: names a `dq_group` result and a group holding at least half its base, the base's exceptions came from `dq_scan`, at least three of the case's records (all when fewer) were read with `erp_get_record`, and for DQ-01 the covering contract was read; the refusal says what is missing; the card adds "Checked in this run".
4. `dq_classify` refuses unknown codes and words not in the short text; suggestions count only after approval in the review; a suggestion never writes data.
5. Options: two or three distinct applicable paths from the latest `dq_fix_paths` for the case, plus doing nothing; figures from the engine by path id; the recommendation among them; refused after an approval; a decision counts once and only for the options on screen.
6. Drafts only after an approval and only of the kinds the path contains (A and C change requests, B and D follow-ups per routed-to person, C and D a prevention request, doing nothing a risk memo); code adds both footers of the brief.
7. The report is refused while a decision or a draft is open; its outcome follows the decision.
8. The figure audit (section 4.6) on alerts, option texts, review notes, drafts and the report; two refusals, then the text shows with an *Unchecked* tag.
9. Narration stays short and without figures; the plain sentence above each tool call comes from code.
10. Budgets and stops as section 5.3.

### 5.5 Simulation scripts and the recorder

Rebate Hunter's format (`steps` with `state`, `say`, `board`, `tool` and `input`, `alert`, `options`, `awaitOption` with both decision paths, drafts, report), plus a `review` step for scenario 3 and `"source": "authored"`. Tool calls are re-executed against the world at playback and texts use placeholders from `js/sim_vars.js`, so the figures are the engine's. Each script has a hypothesis, a visible revision and at least eight tool calls before the decision. Scenario 3's figures follow the presenter's review choices at playback. "Save run as simulation" after a live run writes a script marked `"recorded"`.

---

## 6. Screens at 1920 × 1080 and 1280 × 720

### 6.1 Mapping onto the shell

Header (page icon and name, mode badge, How it works, theme toggle, the AI disclosure, "Fictional company, no client data", four tiles); control bar (Start agent, Scenario, Live sweep, Model, ×1 ×2 ×4, status, Abort, Reset, Method, Diagnostics); workspace with the board on the left and the console on the right; the drawer (Options, Outbox, Audit) below; dialogs for mode, key, custom what-if, review, Method, report and Diagnostics. Figures in the sketches are placeholders.

### 6.2 1920 × 1080: Rules view, a decision waiting

```text
┌───────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ⬡✓ Data Quality Agent        ▧ SIMULATION  ⓘ How it works  ☾  │Closure rate │Clean spend  │Open exceptions│Session  │
│    Data-quality agent for    ✦ You are interacting with an     │ nn.n %      │ nn.n %      │ nn            │ €0.00   │
│    GlobalCorp SE (fictional)   AI system  · Fictional company, │ projected   │ €n.nM of    │ €n.nM open,   │ no model│
│                                no client data                  │ nn.n %      │ €n.nM       │ routed or acc.│ calls   │
├───────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ▷ Start agent  Scenario: Contract references lost in punch-out ▾  ◎ Live sweep  Model: Sonnet 5.5 ▾  ×1 ×2 ×4 │
│                                   ● Awaiting your decision   ▢ Abort   ↻ Reset   ≡ Method   ⌁ Diagnostics      │
├──────────────────────────────────────────────────────────────┬────────────────────────────────────────────────┤
│ Data-quality board        [ Rules | People ]  as of Thu 19 Nov│ Agent console                      Larger text │
│ ORDER LINES                  SUPPLIERS      MATERIAL CONTRACT │ ⬡Spot─⬡Check─⬡Calculate─⬢Propose[Your decision]─⑤│
│  ⬡DQ-01  ⬡DQ-02  ⬡DQ-03      ⬡DQ-09 ⬡DQ-10   ⬡DQ-13   ⬡DQ-14  │ ▧ SIMULATION  Scripted replay, no model calls │
│  ✕ nn    ▬• n    ✓ 0         ✕ n    ▬• n     ▬• n     ✓ 0    │ 00:03 Runs every rule over the order data     │
│     ⬡DQ-04 ⬡DQ-05 ⬡DQ-06        ⬡DQ-11 ⬡DQ-12                 │ 00:05 ✦ Hypothesis: one supplier's punch-out… │
│     ▬• n   ✓ 0    ✕ n           ▬• n   ▬• n                   │ 00:08 Groups the missing contract references… │
│  ⬡DQ-07  ⬡DQ-08  ⬡DQ-15                                       │ 00:11 ✦ Revised: …                             │
│  ✕ n     ✓ 0     ▬• n                                         │ 00:13 Case card (see 6.4)                      │
│ Weekly cohorts, detected 14–69 days ago             [Table]   │ 00:15 Recommendation: path C …                 │
│  wk8 ▇▇░  wk7 ▇▇░  …  wk1 ▇░░    ⬡──⬡──⬡──⬡──⬡──⬡──⬡──⬢ share  │                                                │
├──────────────────────────────────────────────────────────────┴────────────────────────────────────────────────┤
│ Options 3 │ Outbox │ Audit nn          Built by …                 Actions stay drafts; nothing is sent.  ▾ Hide │
│ ┌Case: DQ-01 at plant 3010 ┐ ┌A Mass correction┐ ┌B Owner follow-up┐ ┌C Correct + fix at source┐ ┌Do nothing ┐ │
│ │ closed / spend / cost now│ │ closed  nn      │ │ closed  nn      │ │ RECOMMENDED (merlot)    │ │ +nn a year │ │
│ │ prevented / effort / days│ │ [Approve][Reject]│ │ [Approve][Reject]│ │ [ ✓ Approve ] [ Reject ]│ │ [Accept]  │ │
│ └──────────────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────────────┘ └───────────┘ │
└───────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

The honeycomb groups the cells by data product (order lines nine, suppliers four, material one, contract one) in flat-top hexagons. A cell shows the rule id, a short name, its open count and its state with a mark: danger and a cross (high, open), warning and a bar and dot (medium or low, open), success and a tick (nothing open), neutral before the first scan. Rules and records the agent reads pulse in fjord as an outline. A click opens the cell's exceptions as a table (record, responsible, routed to, spend, financing cost, unpaid, suggestion, status). The cohorts follow Vici's chart anatomy: bars of closed and still-open exceptions per week, the closure share as a line with hexagon markers and the latest point enlarged, a table one click away; no pie or donut.

### 6.3 1280 × 720: People view during Check, the review open

```text
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ ⬡✓ Data Quality Agent  ▧ SIMULATION ⓘ ☾ ✦ AI system │Closure  │Clean    │Open    │Cost  │
│    GlobalCorp SE (fictional) · Fictional company…   │ nn.n %  │ nn.n %  │ nn     │€0.00 │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ ▷ Start  Scenario: Unclassified spend ▾  ◎ Sweep  ×1 ×2 ×4  ● Awaiting your confirmation ▢ ↻ ≡ ⌁│
├───────────────────────────────────────────────────┬──────────────────────────────────────┤
│ Board  [ Rules | People ]                         │ Console                              │
│ Buyer, Production, Duisburg · Lena K.  DQ-02 ⬡⬡⬡⬡⬡│ ⬡Spot─⬢Check[Your confirmation]─③─④─⑤│
│ Buyer, MRO, Duisburg · Name X.         DQ-02 ⬡⬡⬡  │ 00:07 Proposes material groups for…  │
│ Material master steward · Name Y.      DQ-13 ⬡    │ 00:08 Asks you to review them        │
│ Cohorts ⬡─⬡─⬡─⬡─⬡─⬡─⬡─⬢                [Table]   │                                      │
├───────────────────────────────────────────────────┴──────────────────────────────────────┤
│ Options │ Outbox │ Audit nn                                                    ▴ Show     │
└──────────────────────────────────────────────────────────────────────────────────────────┘
        ┌ Review AI-suggested material groups ──────────────────────────────── ✦ AI ┐
        │ Line          Short text                     Proposed   Rests on    Conf.  │
        │ 45001…/10     Nitrile gloves size L, box 100  MRO-PPE    nitrile,    high   │
        │                                                          gloves  [✓] [✕]   │
        │ 45001…/20     Hydraulic oil HLP 46, 20 l drum MRO-LUBE   hydraulic,  high   │
        │                                                          oil     [✓] [✕]   │
        │ [ Approve all ]  [ Reject all ]     Approved values go into a mock change   │
        │                                     request; nothing is written to the data │
        │ You are interacting with an AI system                                      │
        └────────────────────────────────────────────────────────────────────────────┘
```

At 1280 × 720 the header keeps four tiles beside two rows of badges (100 px, as the sisters), the control bar shortens its labels, the board steps down to compact cells (id and count, the short name in the tooltip) before anything is cut, and the cohorts fold into one line with their table a click away. The People view lists one row per routed-to person (role and team, given name and initial), their exceptions by rule as small hexagon pips in the state colours, the drafts waiting for them and the fix path that covers them.

### 6.4 The case card in the console

```text
┌ ✦ AI   Case: contract references lost in punch-out (DQ-01)                       high ┐
│ Root cause: the punch-out catalog of supplier 8nnnn does not return the contract       │
│ number; group "channel = punch-out" holds nn of nn DQ-01 exceptions at plant 3010      │
│ Affected: nn order lines · spend €n.nM (each line once) · financing cost: none (DQ-01) │
│ Routed to: Buyer, Lab, Lyon (nn) · Buyer, MRO, Lyon (n)                                │
│ Fix at source: the punch-out mapping                                                   │
│ Checked in this run: dq_scan · dq_group grp-n · 3 records read · contract read         │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 6.5 Colour grammar

Merlot is the person in charge (Approve, the step that waits, the decisions, the recommended card's frame). Lilac is the AI's voice (AI tags, hypothesis and revision lines, AI-suggested values in the review, drafts). Fjord is checking (the outline pulse on what the agent reads). Danger, warning and success are the state of the data, always with a word or a mark. Ink is everything else; a neutral tape marks Simulation. Hexagons replace circles everywhere, light theme by default, dark through Vici's toggle. DESIGN.md lists every deviation from Vici, starting from the Timetable Translator's list.

---

## 7. Test plan and CI

### 7.1 Suites

`tests/run-all.mjs` as in the sisters. Node only: `tokens`, `page-icon`, `vici-files` (shared, unchanged), `unit` (client, cost, validator, format), `world` (builder determinism, the 124 accounts, check digits, scenarios, log; AC-05, AC-13), `engine` (D1 to D4; AC-01, AC-02), `audit` (F01 to F15 and adversarial cases; AC-04), `vat` (one passing and one failing example per country and Greece; AC-03), `hygiene`, `docs`, `parity` (AC-06). Browser (Playwright, Chromium): `smoke` (boot, policy, storage keys, key flow; AC-07, AC-08), `sims` (six scenarios, both decision paths and the accepted risk; AC-12, AC-15), `live` (the scripted stand-in; AC-09 to AC-11), `accept` (board equals engine, exports, keyboard; AC-14, AC-16, AC-19), `layout` (five window sizes, both themes; AC-17), `design` and `hexagon` (AC-18). Automated tests never call the real API.

### 7.2 CI

`.github/workflows/tests.yml`, the Timetable Translator's: Node 22 on ubuntu-24.04 for the Node suites with `HYGIENE_TERMS` from the secret, then `tests/parity.mjs` against a fresh clone of Rebate Hunter's public `main`, then the browser suites with Playwright 1.56.0. `.github/workflows/live-site.yml` after every Pages build. The page-icon test compares with the website's card whenever a checkout of the website sits next to the repository.

### 7.3 Evidence per milestone

Before each milestone, `GATES.md` is written from its acceptance criteria and kept in the repository; the pull request reports the suites' results, screenshots at 1920 × 1080 and 1280 × 720 in both themes, and what could not be checked.

---

## 8. Milestones and acceptance criteria

| Milestone | Delivers | Acceptance criteria |
| --- | --- | --- |
| **M1 Shell, world and engine (v0.1.0)** | Shell and Vici with the two adapted modules; `tools/globalcorp_base.mjs`, world builder and checker; rules, reconciliation, clean spend, financing cost, history, fix paths; figure audit; fixtures D1–D4 and F01–F15 written first; JSON Schemas for Supplier, Material, Contract, PoLine, User, LogEntry, Rule, Exception, Case, Suggestion, FixPath, Decision, Draft, RunEvent, AuditEvent and the validator; CI | AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07 |
| **M2 Agent, board and Simulation (v0.2.0)** | The live agent with all 17 tools and guardrails; the board's two views and cohorts; review dialog, options, outbox, report; recorder; six authored scripts; Live sweep and Custom what-if | AC-08, AC-09, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15; AC-20 (your live run) |
| **M3 Hardening and release (v1.0.0)** | Exports; layout, design and accessibility suites; Method dialog and the production path; README, DESIGN, TECH_NOTES, DATA_SOURCES, DEMO_SCRIPT, REVIEW; the independent review; a pull request for the website card; Pages live and the live-site check | AC-16, AC-17, AC-18, AC-19, AC-21 (your demo), AC-22, AC-23 |

Inside each milestone: fixtures and failing tests first, then the code, then the UI. One branch and one pull request per milestone, titled with milestone and version; merged when CI is green and you approve.

---

## 9. Risks and how I will test them

| # | Risk | How it is tested or contained |
| --- | --- | --- |
| R1 | The planted scenarios and supplier-level rules pull the whole world's clean share far from 75 % | `tools/check_world.mjs` measures it on every build; background rates tuned in M1 and the value recorded |
| R2 | The figure audit blocks honest text or lets a wrong figure through (ids that look like numbers, "€58.7k", codes after their words) | F01–F15 plus adversarial unit cases; every authored script's texts pass through the audit in `js/sim_check.js` |
| R3 | A case cannot be verified because no group reaches half its base (several buyers, pairs, multi-valued keys) | Section 4.1's grouping rules tested per scenario against frozen reference figures; the guard's refusal names the shares found |
| R4 | A projection disagrees with a later re-scan (fixing one rule makes another fire, as DQ-01 on L03 in D3) | The projection is a full scan and reconciliation on a copy; D3's what-if is a unit test |
| R5 | Fifteen cells, cohorts and the console do not fit 1280 × 720 | Layout suite at five sizes in both themes; the board steps down before any value is cut |
| R6 | The shared shell drifts when Rebate Hunter's `main` changes | Parity on every push against a fresh clone; the adapted list is explicit |
| R7 | The live agent loops, picks weak groupings or burns its budget | Guards refuse with instructions; live tests against the stand-in; caps; your rehearsal (AC-20) |
| R8 | A fictional VAT ID passes a real check digit | The builder replaces it; the world suite tests every ID against the published rules and the FR and ES rules in use |
| R9 | Deterministic output changes between machines | The builder runs twice in CI and compares bytes; the engine uses no clock but the app's day 0 |
| R10 | A private or relationship term enters a file | `tests/hygiene.mjs` with `HYGIENE_TERMS` in CI; the Phase 0 self-check covered this commit |
| R11 | Pages stays off, so the live-site workflow cannot run | Your step 1 in section 0 |

---

## Appendix A. Browser-console probes

The API probes worked from this environment, so nothing waits on you. To re-check the browser path from the live origin later, paste into the console of any `victorpflueger.github.io` page:

```js
fetch("https://api.anthropic.com/v1/models",{headers:{"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"}}).then(r=>console.log("models",r.status)).catch(e=>console.log("blocked",e.message))
```

Expected: `models 401` (no key sent, CORS open). Three sources need a person in a browser, not a console: the VIES FAQ item 11 (a single-page app), HMRC's developer page for the VAT check API (refuses automated reading) and SAP KBA 2955651 (needs a sign-in). M1 cites them as read by the fetch tool or marks them "not verified".

## Appendix B. Phase 0 evidence kept outside the repository

The golden-case recomputation, the world recomputation, the parity matrix, the tool-schema measurement, the probe outputs and the eight screenshots of the four sister runs stay in the build session's workspace, together with the Phase 0 `GATES.md`. The figures above are their results.
