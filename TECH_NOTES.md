# TECH_NOTES — verified facts and build decisions

The Data Quality Agent runs as a static page and, in Live mode, calls the Claude API directly from the browser and nothing else. Every external detail the code depends on is recorded here with its source and the date it was verified. If a fact changes, update this file first, then `js/config.js`.

**Basis.** Version **0.2.0**, 20 November 2026: milestone M2 of three (PLAN.md §8), the agent, the board and Simulation, on version 0.1.0's shell, world and engine. The shell is Rebate Hunter 7.2.0's at commit `73c00f8`, with two modules adapted for a third human step (REVIEW.md, Part 2), on Vici v1.0.0, Victor Pflüger's design system (commit `fdd868b`). Sections 1 to 3 record the API facts the live agent rests on, probed for this build on 19 November 2026 (PLAN.md §1.4 has the full probe log, P1 to P16). Section 4 is the browser's security policy and storage; section 5 the world; section 6 how the engine reads the method; section 7 the agent in Live mode and its guardrails; section 8 Simulation and the recorder; section 9 the decisions and open points; sections 10 and 11 the verification log and the acceptance checklist.

---

## 1. Claude models and token prices (cost meter inputs)

Sources: Models overview and Pricing pages, `https://platform.claude.com/docs/en/about-claude/models/overview` and `https://platform.claude.com/docs/en/about-claude/pricing`, read on 19 Nov 2026 (P5, P6). The values equal Rebate Hunter's `js/config.js`; this app's `js/config.js` repeats them, with the same effort and output limit per model.

| Label | API model ID | Input $/MTok | Output $/MTok | 5-min cache write $/MTok | Cache read $/MTok | Effort | Max tokens per call |
|---|---|---|---|---|---|---|---|
| **Sonnet 5.5 — default** | `claude-sonnet-5-5` | 2.00 | 10.00 | 2.50 | 0.10 | medium | 16,000 |
| Haiku 5.5 — fast, cheapest | `claude-haiku-5-5` | 0.10 (prompt ≤ 100k tok) / 0.50 (> 100k) | 0.50 / 2.50 | 0.125 / 0.625 | 0.01 / 0.05 | medium | 12,000 |
| Opus 5.5 — deepest | `claude-opus-5-5` | 4.00 | 20.00 | 5.00 | 0.20 | high | 16,000 |

- All three have a 1M-token context and 128K output tokens; thinking is adaptive, and always on for Opus 5.5 (P5).
- Haiku 5.5 is priced in two tiers by prompt size; the shared cost meter (`js/cost.js`) picks the tier per request.
- **USD → EUR.** The API bills in USD; the cost meter converts at a fixed **1 USD = 0.894 EUR** (`FX_USD_EUR`, the ECB reference rate of 12 October 2026 that the sister apps use), so every prototype's meter agrees.
- **Caps per run** (`AGENT` in `js/config.js`): 40 model calls and €3, a 90-second idle limit per stream (section 7; `tests/live.mjs caps` proves the first two).

## 2. Request features and the API version

Read on 19 Nov 2026 under `https://platform.claude.com/docs` (P7 to P10).

- **API version.** The client sends `anthropic-version: 2023-06-01`, as every sister app does. `2026-10-21` is the newest version and removes `temperature`, `top_p` and `top_k`, none of which is sent; switching is one line in `js/config.js` and should happen in all prototypes together (P7).
- **Thinking and effort.** Thinking `display` defaults to `omitted` on the 5.5 models, so the agent loop asks for `summarized`; thinking blocks go back unchanged with their signatures, and recordings keep the page's events, never API transcripts. `output_config.effort` takes low to max (P8).
- **Prompt caching.** A top-level `cache_control: {type: "ephemeral"}` caches automatically at the last cacheable block: 5 minutes, 512 tokens minimum on the 5.5 models (P10).
- **Strict tools.** At most 20 strict tools, 24 optional and 16 union-typed parameters per request; no `minimum`, `maximum`, `minLength`, `maxLength`, `maxItems`, `oneOf` or `not`; `minItems` only 0 or 1 (P9). The 17 tools as built measure 17 optional and 2 union-typed parameters (`tests/tools.mjs`), and the schemas the model sees carry none of those keywords; the `strict` flag itself is not sent (section 9.3, M2-02).
- **No server tools.** The agent's only sources are the world's data products and the engine. The shared client and cost meter still know the server-side web search tool, because the sister apps use it; this app never sends it.

## 3. Messages API from the browser (CORS, headers, the key)

Probed on 19 Nov 2026 from this build's terminal and from a headless Chrome page (P1 to P4).

- **The browser header is mandatory.** `POST https://api.anthropic.com/v1/messages` and `GET /v1/models` answer a keyless request with a 401 that carries `access-control-allow-origin: *` only when the request sends `anthropic-dangerous-direct-browser-access: true`; without it the page sees `TypeError: Failed to fetch` (a CORS block). The preflight allows `x-api-key`, `anthropic-version`, `content-type` and that header (P1 to P3).
- **The key check is free.** `GET /v1/models` with the header is readable from the page, so a key is validated without a model call (P4).
- **Workspaces.** Spend limits are set per workspace, not per key, so the key dialog advises a dedicated workspace with a monthly limit and a key scoped to it; a key spanning several workspaces needs a header the app does not send. These come from the sister apps' verification of 12 October 2026 and were not probed again for this build.
- **The key.** It is asked for only when a live run starts, checked with `GET /v1/models`, kept in this tab's session storage under `dq.anthropic.key`, and never written to local storage, logs, exports, recordings or the console; *Forget key* removes it; the key dialog refuses to work inside a frame; the key goes only to api.anthropic.com. The shared key store (`js/keystore.js`: session storage only, and redaction of anything key-shaped) holds it, Diagnostics' *Key and storage* check proves it in the presenter's browser, and `tests/live.mjs key` proves every point of this list against the scripted stand-in (section 11, AC-08).

## 4. Browser security policy and storage

### Content Security Policy (meta tag in `index.html`)

```
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src https://api.anthropic.com; object-src 'none'; base-uri 'none'; form-action 'none'
```

- The meta tag sits at the top of `<head>`, after the character set and the viewport and before any stylesheet or script. GitHub Pages sends no policy header of its own, so the meta tag is the policy; `frame-ancestors` cannot be set in a meta tag, which is why the key dialog checks for a frame itself.
- The page loads nothing from another site: Vici's stylesheet, fonts and script are in `vici/`, the data are three classic scripts in `data/`, everything else is a module in `js/`. Only `js/anthropic.js` calls `fetch`, and only `https://api.anthropic.com` is reachable. Links to other sites (Victor's LinkedIn profile and website in the drawer's byline, the Claude Console for keys) are plain links that open in a new tab.
- No inline script, no inline style attribute, no inline event handler, no `eval`. Styles that code sets at run time go through the CSSOM (`element.style.x = …`), which `style-src 'self'` allows.
- Three checks hold this: `tests/policy.mjs` (the exact policy in exactly one meta tag, Diagnostics' copy of it, no outside resource in HTML, CSS, JavaScript or data, `fetch` only in the client, no inline script or style, the storage keys); `tests/smoke.mjs` (the running page in both themes and two sizes: no policy violation, no request to another site); and Diagnostics' *Security policy* check in the presenter's own browser.

### Storage

Every key starts with `dq.`; the only shared key is Vici's `vc-theme`, which all of Victor's pages use for the theme.

| Key | Storage | Holds | From |
|---|---|---|---|
| `vc-theme` | local | the light or dark theme (Vici's, shared) | 0.1 |
| `dq.introSeen` | local | How it works has opened by itself once | 0.1 |
| `dq.consoleText` | local | *Larger text* in the console, for projectors | 0.1 |
| `dq.model` | session | the model chosen in the control bar | 0.1 |
| `dq.speed` | session | the replay speed | 0.1 |
| `dq.anthropic.key` | session | the API key, this tab only | 0.2 |
| `dq.diag` | session | Diagnostics checks that failed recently; reserved as in the sister apps, no module writes it yet | — |
| `dq.sessionCostEur` | session | live spend in this tab | 0.2 |

## 5. The world

`tools/build_world.mjs` writes `data/world.js` (`window.WORLD`, version 1.0.0) from a fixed seed (1911) with Python's Mersenne Twister, as Rebate Hunter's builder does; two builds give the same bytes, and `tests/world.mjs` checks that on every run. `tools/check_world.mjs` checks the world, and `node tools/build_world.mjs --freeze` writes the reference figures in `data/reference_cases.js` that the checker then holds the world to. Everything in the world is fictional.

**Day numbers.** Day 0 is the day the page is opened and negative days are past, as in Rebate Hunter's world, so the data stay current. The analysis window is days −364 to 0 (365 days).

**What it holds** (measured on the built world): 3 company codes, 4 plants (1010 Frankfurt, 1020 Duisburg, 2010 Birmingham, 3010 Lyon), 20 material groups, 48 users, 139 suppliers (76 of them with order lines in the window), 292 materials, 24 contracts, 2,052 order lines worth €8,432,005 in the window, and an exception log of 648 entries over 26 weeks. One exchange rate converts pounds for the whole window: 1 GBP = 1.196444 EUR (section 9.2, M1-07).

**The shared base** (decision N1). `tools/globalcorp_base.mjs` is plain data for the procurement prototypes that share GlobalCorp SE: the company codes, the plants, the material-group taxonomy and 124 supplier accounts with Rebate Hunter's ids, names, cities, countries, currencies and categories. The accounts are the 143 of Rebate Hunter's world (commit `73c00f8`) that belong to none of its five corporate groups, less the 19 that repeat a normalised name in the same country (of each such group the lowest id is kept). `tests/world.mjs` re-derives the list from that commit of a Rebate Hunter checkout, independently of the extraction script.

**How each scenario is planted.** Each root cause sits in the data on purpose; its exceptions are in the log as routed entries detected 14 to 69 days ago and never closed, which is why the tip arrives. The checker holds each case to frozen reference figures.

| Scenario | Root cause planted | Case (exceptions in the group / found by the rules) | Spend affected |
|---|---|---|---|
| SC-PUNCHOUT | Punch-out at plant 3010 goes live on day −70 with the lab-supply supplier 80001; its orders lose the framework contract reference (DQ-01) | punch-out channel: 30 / 30 | €29,281 |
| SC-EARLY-PAY | A buying profile (U190) at company code 2000 loses its payment-terms key on day −75; its orders with 80002 and 80003 get 14 days against contracts of 60 (DQ-07, DQ-06) | created by U190: 23 / 23 | €475,350; financing cost €3,482, of which €1,374 on unpaid lines |
| SC-UNCLASSIFIED | The free-text requisition form at plant 1020 drops the material group from day −70 (DQ-02); 4 of the 36 lines carry a material, so the master suggests their group | free-text requisition: 36 / 36 | €65,642 |
| SC-REQUESTER | A reorganisation on day −120: three requesters and their manager left on day −121 and orders still name them (DQ-04, DQ-05) | plant 1010: 21 / 26 | €61,636 |
| SC-ONBOARDING | Suppliers 80005 to 80012 registered through the self-registration portal without terms, VAT ID or bank details (DQ-09, DQ-10, DQ-11) | self-registration portal: 11 / 15 | €81,455 |
| SC-DUPLICATE | Supplier 80013 is a second account of 30041, created when the first was blocked on day −60 (DQ-12, DQ-08) | supplier 80013: 6 / 6 | €55,270 |

**Background.** Other exceptions occur at low rates and on purpose, so that every rule has something to find and the scenarios are not the only signal: call-offs placed as direct orders, missing or differing material groups, missing requesters, missing or short terms outside Birmingham, an order to a blocked supplier, three materials without a group, a contract whose owner left and one without an owner, an order on a contract that expired on day −90, one supplier with a malformed VAT ID, one without bank details, one with a bank abroad, one in Lyon without terms. The Apex accounts 40001 and 40002 look alike but are not duplicates by DQ-12, as in Rebate Hunter.

**Calibration** (`tools/check_world.mjs`, frozen in `data/reference_cases.js`). A scan of the whole world on day 0 finds **164 exceptions**; the clean spend share is **75.2 %** (the method aims for about 75 %). Before that scan, the log holds 148 live entries (open, routed or accepted), clean spend is 77.5 % and the closure rate 56.7 % (131 of 231); the scan keeps 145 of the live entries, closes 3 that the data no longer show and adds 19 new ones, and the closure rate becomes 58.0 %. The header shows the log's state until a run scans (section 9.2, M1-01).

**The checker's eighteen checks:** data contracts (JSON Schemas), ids and references, day windows, Rebate Hunter's 124 accounts, the people and their roles, no VAT ID passing its check digit, the log agreeing with the data, the Apex look-alikes, the six tips, one story check per scenario, the frozen reference figures, the recorded clean spend share, and the sizes. Each check has a control in `tests/world.mjs` that plants its fault and sees it caught.

## 6. How the engine reads the method

The engine (`js/engine.js`, `js/history.js`, `js/fixpaths.js`, `js/cases.js`) is pure: no DOM, no clock but the day it is given, no randomness. The same modules run in the browser and under Node, and the golden cases D1 to D4 test them (`tests/engine.mjs`, 341 checks). Where the method leaves room, the engine reads it as follows.

**Rules** (`js/rules.js`, rule set 1.0.0). Fifteen rules over five of DAMA UK's six dimensions, each with its data product, record, severity, the person responsible and its deterministic suggestion.

- Supplier rules (DQ-09 to DQ-12) look only at suppliers with order lines in the window; DQ-13 and DQ-14 look only at materials and contracts with order lines in the window (decision N2).
- DQ-05's responsible is the requester's manager (else the procurement lead). DQ-14's is the procurement lead.
- DQ-06 (no payment terms) treats the order as due on receipt: its financing cost is the value × agreed days / 365 × cost of capital when agreed terms exist (else 0), and it is never unpaid. DQ-07 (terms shorter than agreed) costs value × (agreed − own days) / 365 × cost of capital and is unpaid while the order is younger than its own terms.
- **Agreed terms** are the referenced contract's terms, else the supplier's terms in the line's company code, else none.
- DQ-12 pairs two suppliers with the same normalised name (legal forms dropped) in the same country, or the same normalised VAT ID; at least one of the two has order lines in the window. The exception lists what matched (name, VAT ID or both).
- DQ-15 also fires when the referenced contract does not exist.
- DQ-10 checks prefix and format only, never a check digit (`js/vat.js`; DATA_SOURCES.md §3 has the formats). Spain follows VIES (correction B1).

**Records and ids.** A record's key is a line, supplier, material or contract id, `S2@1000` for a supplier in a company code (DQ-09), or `S1+S5` for a pair (DQ-12, sorted). An exception's id is `RULE|key`, so a re-scan finds the same exception again.

**Routing.** An exception goes to the responsible person if they are active today, else to their manager if active, else to the procurement lead.

**Spend.** An exception's spend affected is the euro value of its lines in the window: the line itself, or the supplier's lines (in the company code for DQ-09), the material's or the contract's. A case's or a tile's spend counts each line once, however many exceptions touch it. **Clean spend** is the value of the lines with no live exception (open, routed or accepted) on the line, its supplier (DQ-10, DQ-11, DQ-12 for either supplier of a pair, DQ-09 for the line's company code), its material (DQ-13) or its contract (DQ-14).

**Order.** By severity (high, medium, low), then spend affected, largest first (correction B6), then rule, then record.

**History** (`js/history.js`). The closure rate counts the entries first detected 14 to 69 days ago: closed over not dismissed; accepted entries stay open. The eight weekly cohorts run from week 1 (days −20 to −14) to week 8 (days −69 to −63). The 14-day closure share of a set of rules is, among their entries routed at least 14 days ago and not dismissed, the share closed within 14 days of routing; a case pools its rules. The monthly inflow is the entries detected in the last 90 days and not dismissed, divided by three. Without entries a figure is "no history", never 0.

**Reconciliation.** Within the rules and filters a scan ran: a live entry the scan still finds stays as it is; an exception found for the first time becomes a new entry, *open*, detected today; a live entry the scan no longer finds closes today, closed by re-scan; a closed exception that reappears gets a new entry linked to the old one. Dismissed exceptions are not raised again. New entry ids continue the log's own prefix and width. **Projections** run the same scan and reconciliation on a copy of the world with the changes applied; they are shown as "projected after re-scan", never written back.

**Fix paths** (`js/fixpaths.js`). The paths of the method next to doing nothing, from the case's figures and the parameters in `js/params.js`; path B's closures are `floor(n × c / e)`; a path that does not apply carries "not applicable" and no figures; a case without history carries "no history".

**Figure audit** (`js/figures.js`). Every figure in a text is read with its type (amount, share, count, days) and must match a figure the run produced or a parameter: amounts of any size within half a unit of their last digit and within 2 % of the figure, with no €0.50 floor; shares, counts and days within half a unit of their last digit. A comma followed by exactly three digits always groups thousands. Ids, codes and dates are exempt from matching but must exist. From version 0.2 an amount written in whole euros without a scale also matches a figure that rounds to it (correction B8, section 9.3, M2-01).

**Validator** (`js/validate.js`). A JSON Schema subset without a dependency (types, required, properties, `additionalProperties`, enums, patterns, items, `$ref` to definitions, nullable `anyOf`); an unknown keyword throws, so a schema cannot ask for a check that silently does not run. The fifteen schemas are in `js/schemas.js`.

**Rounding and display.** Values are rounded to 1e-9 before display, so GBP 1,500 × 1.15 (1,724.9999999999998 in floating point) shows €1,725. Amounts show whole euros (`en-GB`), the session cost euros and cents, shares one decimal.

## 7. The agent in Live mode

**The loop** (`js/agent.js`, adapted from Rebate Hunter's). Every model call streams, with adaptive thinking and summaries, the model's effort, a top-level `cache_control` and `tool_choice: auto`, the seventeen tools and no server tool (`tests/lib/fake-claude.mjs` checks each request). Assistant turns go back unchanged, thinking blocks with their signatures; the tools work on a copy of each input. Independent `erp_*` reads in one turn run in parallel. A run stops at **40 model calls or €3**: both are checked before each call and the cost again after each response, so no 41st call starts and none starts once €3 is spent. An early `end_turn` gets at most two visible nudges; a tool call cut off by `max_tokens` is discarded and retried once with half as much room again; `refusal` and a full context window end the run. The cost meter is the shared one: usage × the model's prices, at 1 USD = 0.894 EUR. The opening message is the scenario's tip, the person's own words for a custom what-if, or the sweep instruction for Live sweep (`js/prompt.js`).

**One toolbox for every producer** (`js/tools.js`). The seventeen tools of the brief, in its order. The live agent calls them with the model's inputs, the simulation player with a script's inputs (`js/sim_script.js`), and the script checker with a scripted person along every decision path (`js/sim_check.js`), so the guardrails, the figure audit and the figures are the same in all three. The brief names `js/guards.js`, as in Rebate Hunter; here the guards live inside the toolbox, where no producer can go around them (M2-03). Each input is checked against its tool's full JSON Schema (`js/validate.js`); a failure returns `is_error` with the validator's message.

**Guardrails.** Where code refuses a step, the console shows a *Guardrail* line with the reason, and the agent tries again.

| Rule | Enforced by | What is refused |
| --- | --- | --- |
| 1. Data, not instructions | The system prompt; record texts reach the model only as JSON values | — |
| 2. Only the rules find exceptions | Every engine and screen tool takes only exceptions this run's `dq_scan` returned | Grouping before a scan; an exception id no scan found |
| 3. Verified alert | `ui_report_alert` | A group under half its `dq_group` base; fewer than three of the case's records read with `erp_get_record` (all when fewer); for DQ-01, the covering contract not read. The card adds "Checked in this run:" from the tool results |
| 4. AI suggestions | `dq_classify`, `ui_request_review` | Unknown taxonomy codes; words not in the line's short text; a line with a material. A suggestion is pending until a person approves it: unreviewed and rejected ones count as no suggestion, approved ones count in `dq_suggest`, `dq_fix_paths` and the change request |
| 5. Options | `ui_propose_options`, `ui_await_decision` | Paths not from the latest `dq_fix_paths` for the alerted case, repeated or not applicable paths, a recommendation outside them, options after an approval; a decision on a set no longer on screen or on a rejected path is ignored |
| 6. Drafts | `ui_draft_action` | Drafts before an approval, a kind the approved path does not allow (A: change request; B: one follow-up per routed-to person; C and D: those plus a prevention request; doing nothing: the risk memo), a second follow-up to the same person. Code adds the footer and the mock line, and the change request's table of records, fields, old and new values |
| 7. Report | `ui_final_report` | A report while a decision or a draft is open, an outcome that does not follow the decision |
| 8. Figure audit | Every alert, option text, review note, draft and report | A figure no tool returned (below). After two refusals the text shows with an *Unchecked* tag and a notice, never silently |
| 9. Narration | The system prompt keeps figures out; the plain sentence above each tool call comes from `js/tool_plain.js` | — |
| 10. Budgets and stops | The loop above | — |

**Known figures** (`js/sim_vars.js`). Each engine result yields named, typed figures (`scan.clean_share`, `case.spend`, `path.C.prevented` …), which feed both the figure audit and the scripts' placeholders, so the two cannot drift. Each text may quote:

| Text | May quote |
| --- | --- |
| Alert | the ERP facts read, the engine's results and every fix path's figures |
| Review note | the ERP facts and the engine's results |
| Options | the facts, the engine's results and the figures of their `dq_fix_paths` result |
| Draft | the facts and the approved path's figures |
| Report | the facts, the engine's results and every path's figures; projections only in a sentence that says "projected" |

**Projections.** An approved fix path never closes anything in the demo, because nothing changes the data; it shows as *approved, re-scan pending* with the closure rate projected after re-scan. For A and C the projection runs the scan and reconciliation on a copy of the world with the suggestions applied, approved AI suggestions included (`project()` in `js/history.js`). For B and D, whose closures are themselves an expectation, it is the expected rate: (the cohort's closed exceptions + the path's closures × the case's share of entries in the cohort) / the cohort's eligible exceptions. Doing nothing projects nothing. The tile keeps the measured rate and shows the projection in its second line.

**People and steps.** The person's decisions, reviews and approvals reach the agent as run events (`option_decision`, `confirmation_decision`, `action_decision`); a waiting tool takes the first of its kind that passes its test (`js/human.js`). The rail never moves back (`js/phase.js` keeps the furthest step), and a review's request goes out before its waiting state, so *Your confirmation* shows on the step reached: Check in the scripted runs, because the review comes before any engine calculation for the case.

## 8. Simulation and the recorder

**Scripts** (`data/sim_runs.js`, `window.SIM_RUNS`). A script is the event stream of a run in four kinds of step: `{ think }`, `{ say, kind }` (kind `hypothesis` or `revision`, and the text must start with "Hypothesis:" or "Revised:", as the console labels it), `{ tool, input }`, and one `{ decide }` with what to say, draft and report for each decision. Texts write `{{name}}` where an engine figure goes; the player fills it from the tool results before it, so every figure on screen is recomputed at playback. A recorded script may add, per path it recorded, the live run's own texts (`decide.paths`).

| Scenario | Tool calls before the decision | Paths offered | Recommended | Review |
| --- | --- | --- | --- | --- |
| 1 Contract references lost in punch-out | 15 | A, B, C | C | — |
| 2 Paying too early | 14 | A, B, C | C | — |
| 3 Unclassified spend | 15 | A, B, C | C | 32 AI-suggested groups |
| 4 Who ordered this? | 14 | B, D | D | — |
| 5 New suppliers, half the data | 13 | B, D | D | — |
| 6 Two Apexes? | 15 | B, D | D | — |

**Playback** (`js/simulation.js`). The player runs the script through the same toolbox as the live agent, with the presenter deciding, reviewing and approving on screen; replay speeds ×1, ×2 and ×4; the SIMULATION tape on the console and "simulated, no cost" on the cost tile; no key and no request leaves the page.

**The script check** (`js/sim_check.js`; `tools/check_world.mjs`, Diagnostics and `tests/world.mjs`). Every script runs with a scripted person along every path it offers: approving the recommendation, rejecting it and approving another, accepting the risk, rejecting every path, approving each other path, and, where it has a review, rejecting every suggestion. A fault is any tool refusal, an unresolved placeholder, a figure in an authored script's narration (a recorded one may quote figures through placeholders only), a missing or unlabelled hypothesis or revision, fewer than eight tool calls before the decision, or a report whose outcome does not follow the decision. The six authored scripts pass in 34 runs.

**Save run as simulation** (`js/recorder.js`). After a completed live run of a scenario, the Audit tab and the console's last line offer the run as a script: the reasoning summaries and narration (a step per paragraph), every tool call that succeeded with its input, and for the path the person took what the agent said, drafted and reported. Every figure in those texts that an engine tool returned becomes its placeholder, so the replay recomputes it; refused calls and lookups after the decision are dropped; paths the run did not take keep the scenario's previous texts, so the replay works for any decision. The script check runs before the download, and the file's header and the Audit tab say whether it can be appended to `data/sim_runs.js` as is or needs curation first. The file is `sim-run-<scenario>-recorded-<yyyymmdd>.js`; appending it replaces the scenario's script, marked `"source": "recorded"` (decision D6). The key never enters a recording.

## 9. Decisions and open points

### 9.1 Approved by Victor on 19 November 2026

The recommended defaults of PLAN.md §1.7 and the corrections B1 and B2 of §1.6:

| # | Decision |
|---|---|
| D1 | Name "Data Quality Agent", subtitle "Procurement data quality" |
| D2 | Vici's `check` icon in a lilac hexagon cell, kind "prototype"; the website card follows in M3 |
| D3 | No German interface in version 1 |
| D4 | The method's defaults: 6 % cost of capital a year, invoices paid on the order's terms, the effort parameters of `js/params.js`, each labelled as an assumption |
| D5 | One world with the Price Variance Agent: same company, company codes, plants, supplier accounts and taxonomy; each prototype builds its own world |
| D6 | Six authored simulation scripts, marked as authored; recorded live runs later |
| D7 | The production path in How it works and in the README |
| N1 | This build defines the shared base, `tools/globalcorp_base.mjs`; the Price Variance build copies it unchanged |
| N2 | DQ-13 and DQ-14 look only at materials and contracts with order lines in the window |
| N3 | *Open exceptions* counts every exception not closed and not dismissed (open, routed and accepted) |
| B1 | DQ-10 rejects a Spanish VAT ID whose first and last characters are both digits, as VIES says |
| B2 | "Fails the published check digit" applies to DE, AT, IT, NL, GB and CH; for FR and ES the builder also fails the rules in wide use, and DATA_SOURCES.md says which rule is official |

Corrections B3 to B7 stand as PLAN.md §1.6 resolves them: B3 by N1, B4 by N3, B5 by N2, B6 sorts by spend largest first, B7 records the stricter published refinements in DATA_SOURCES.md and keeps the format rule.

### 9.2 Build decisions in M1

| # | Decision | Reason |
|---|---|---|
| M1-01 | Before a run, the header shows the data as the exception log stands (`logState`): 148 live exceptions, clean spend 77.5 %, closure rate 56.7 %. A scan then reconciles and the tiles follow it (version 0.2) | The page opens on the company's current state, not on an empty header; the figures are the engine's |
| M1-02 | The *Open exceptions* tile's second line shows the spend of their order lines ("€1,894,505 affected"), and "open, routed or accepted" moved to the tile's tooltip | N3 put "open, routed or accepted" in the note, while the header's design puts the spend there; one line cannot hold both at 1280 × 720. The count is N3's either way |
| M1-03 | The board of version 0.1 lists the fifteen rules as hexagons by data product, neutral, with the cohorts as a table; the honeycomb with each rule's state, the people view and the cohort chart come with the runs | Rule states need a scan, which the agent runs |
| M1-04 | The world's DQ-15 background has one order line, where the builder asks for two | Only one order of that supplier, company code and material group falls after the contract's expiry; the frozen figures include it |
| M1-05 | `data/world.js` is about 1 MB | 2,052 order lines and 648 log entries with readable field names; it loads once, deferred, while the loading screen shows |
| M1-06 | `tests/parity.mjs` compares with Rebate Hunter's current `main`; `tests/world.mjs` re-derives the shared accounts from commit `73c00f8` of the same checkout | The shell must follow the sister's `main`; the base names the commit it was taken from, so a later change to Rebate Hunter's world does not break this build until the base is taken again on purpose |
| M1-07 | Pounds convert at the ECB euro reference rate of 19 November 2026, 1 EUR = 0.83581 GBP, so 1 GBP = 1.196444 EUR, one rate for the whole window | One rate keeps every figure reproducible; DATA_SOURCES.md §2 |
| M1-08 | The hygiene suite runs with the private term list locally; in CI it runs the generic checks only (HYGIENE GENERIC OK) | The repository secret `HYGIENE_TERMS` cannot be provided; the local run before each push covers the private terms |

### 9.3 Build decisions in M2

| # | Decision | Reason |
|---|---|---|
| M2-01 | Correction B8 applied: an amount written in whole euros without a scale ("€18", not "€18k") matches a figure that rounds to it (`wholeEuroFloor`, on unless a caller turns it off) | Proposed in version 0.1 as the default from 0.2, and announced at the start of M2; the method's own rule would reject the €18 that golden case D2 displays. F01 to F15 give the same results either way (`tests/audit.mjs`, B01 to B04) |
| M2-02 | Strict mode stays off; filters are a list of `{ key, values }` | The first drafts of the schemas measured 37 optional and 22 union-typed parameters, over the limits of 24 and 16; the list form brings them to 17 and 2. The validator checks every bound the strict grammar cannot carry against the full schema |
| M2-03 | The guards live in the toolbox (`js/tools.js`), not in a separate `js/guards.js` | One toolbox serves the live agent, the player and the checker, so a replay and a checked script obey exactly what a live run obeys |
| M2-04 | B and D project the expected closure rate; A and C a re-scan of a copy (section 7, Projections) | A follow-up's closures are an expectation from history, not a change to the data that a re-scan could find |
| M2-05 | A recorded script keeps the recorded path's texts and the previous script's texts for the other paths; its narration may quote engine figures through placeholders only | A replay must work for any decision the presenter takes, and every figure it shows must come from the engine |
| M2-06 | A review's request goes out before its waiting state | The rail and the status tag must already know a confirmation is awaited, so *Your confirmation* shows on Check, not on Prepare (found by `tests/live.mjs review`) |
| M2-07 | The board's cells show each rule's last scan, with its scope (rules and filters) in the line above the honeycomb and in each cell's tooltip; a rule never scanned stays neutral; the people view and the tables are built from the same exceptions | A scenario scans a filtered part of the data; the scope says what a count covers |
| M2-08 | Doing nothing needs a reason of at least five characters before "Accept the risk" | The risk memo records the accepted risk and its reason |
| M2-09 | Scenario 6's hypothesis now starts "Hypothesis:", and the check requires every marked step to read as its label | The console labels paragraphs by their words and the run facts count them; "Hypothesis from the tip:" was neither labelled nor counted |
| M2-10 | The console keeps to its panel (`overflow: hidden`, in the app's own stylesheet) | At 1280 × 720 with the drawer open, the console's head, rail and tape were taller than the panel and covered the drawer's toggle |
| M2-11 | Diagnostics gained "Simulation scripts", the script check in the presenter's browser | The brief has `tools/check_world.mjs` hold the scripts to the guardrails before a demo; the same check runs on the deployed page |

### 9.4 Open for Victor

| # | Point | Proposal |
|---|---|---|
| AC-20 | Your own live run | With your key, Sonnet 5.5: Start agent, scenario 1, Live; decide, approve the drafts; then Audit, Export JSON. The export names the model, the usage and the cost; the run stops by itself at 40 model calls or €3. If you like the run, Save run as simulation and send me the file to curate |
| Hygiene secret | CI cannot see the private term list | Nothing to do unless you want CI to check it: then add the `HYGIENE_TERMS` secret and CI's hygiene suite ends with HYGIENE OK |

## 10. Verification log

**20 November 2026, version 0.2.0.** Node.js 22.23.5; Playwright 1.63 with Chrome for the browser suites (CI: Playwright 1.56.0 with its Chromium); a Rebate Hunter checkout at `73c00f8` and a Vici checkout at `fdd868b` next to the repository; the private term list next to it. `node tests/run-all.mjs`: ALL SUITES PASSED (17 of 17). No test called a real API; no key was used.

| Suite | Result |
|---|---|
| tools | 90/90: the seventeen tools and their schemas (17 optional and 2 union-typed parameters), every input validated, the six cases' figures equal to the frozen references, the named figures, plain sentences and summaries, every guardrail refusing its fault, the review counting only approved suggestions, the figure audit's Unchecked fallback; Save run as simulation for each scenario along two paths, every recording passing the script check, and a recording with a typed figure in its narration held for curation |
| world | 51/51, with the script check (6 of 6 scripts, 34 runs along every decision path) and twelve planted violations it catches |
| sims | 18/18: six scenarios × three paths in Simulation, offline and without a key, each fix-path card equal to the engine's figures in Node, the tile's projection, the drafts each path allows; scenario 3's review holds *Your confirmation* on Check |
| live | 10/10 against the scripted stand-in: key (and the key dialog in a frame), guards (eight Guardrail lines, counted in the run facts), review, caps (exactly 40 calls; two calls when the second passes €3; the meter equal to usage × price within 1e-9), sweep, custom, recorder (a full run of scenario 1 with a rejection, the audit export with model, usage and cost, the recording checked, downloaded and replayed offline); the stand-in found no protocol violation |
| accept | 2/2: board (the fifteen cells, every cell's table, the people rows and the weekly cohorts equal to the engine's after a sweep; the open-exceptions tile counting each line once) and honesty (nothing reads closed before a re-scan; the tile keeps the measured rate; the AI labels and the honesty tags stay) |
| smoke | 93/93, as in version 0.1.0 with the run controls now ready |
| hexagon | the file scan and the rendered app in both themes through a Simulation run of scenario 3 (mode dialog, review, case card, cell table, people view, fix paths, outbox, report): nothing round |
| tokens | 77 colour pairs in two themes pass, the board's states, pips, chart and the review's lilac among them |
| engine, audit, vat, unit, policy, parity, page-icon, vici-files, hygiene | as in version 0.1.0: 341/341, 64/64, 60/60, all, 29/29, 24/24 (two adapted files), passed, passed, 15 private terms with no finding |

**Screens.** A Simulation of scenario 3 at 1920 × 1080 and 1280 × 720, light and dark (review, case card, honeycomb with states, cell table, people view, fix paths, outbox, report) was looked at. Three defects were found and fixed: the console covering the drawer's toggle at 1280 × 720 (M2-10), wide board tables cut at the board's edge (they now scroll inside their card, and names and roles stack), and the warning ink for marks (DESIGN.md §3). The honeycomb's names are small at 1280 × 720 (cells 96 px wide); the layout suite of version 1.0 measures legibility and targets.

**19 November 2026, version 0.1.0.** Node.js 22.23.5; Playwright 1.63 with Chrome for the browser suites (CI: Playwright 1.56.0 with its Chromium); a Rebate Hunter checkout at `73c00f8` and a Vici checkout at `fdd868b` next to the repository; the private term list next to it.

| Suite | Result |
|---|---|
| engine | 341/341: D1 (every exception with rule, record, routed-to person, spend, unpaid flag and financing cost within 1e-9, and every display string), D2, D3 (history, reconciliation, the what-if), D4 (fix paths, "not applicable", "no history", the integer floor), plus routing controls |
| audit | 64/64: F01 to F15, 27 adversarial texts, the whole-euro edge B8 both ways, F01 to F15 again with the proposed floor, currencies, the reader's types |
| vat | 60/60: one passing and one failing example per country and Greece, 17 further forms, and the rule never consulting a check digit |
| world | 32/32: two builds byte-identical and equal to `data/world.js`, the eighteen checks, the shared base re-derived from Rebate Hunter at `73c00f8`, six controls |
| unit | all passed: the shared client's streaming, retries and cost maths with this app's tools, the data contracts and the validator (with planted violations), the formats |
| parity | 24/24 against Rebate Hunter's `main` (`73c00f8`): two adapted files, `js/handover.js` and `js/progress.js`, both in REVIEW.md |
| policy | 29/29, with each scanner first catching planted examples |
| tokens, page-icon, vici-files | 61 colour pairs in two themes pass; the page icon as on the card (the website not compared until the card exists); `vici/` exactly as listed |
| hygiene | 15 private terms and the e-mail check over every published file: no finding |
| smoke | 93/93: boot in both themes at 1920 × 1080 and 1280 × 720 without a page error, policy violation, outside request or horizontal scrolling; tiles and cohorts equal to the engine's; the fifteen rules; the intro once; Diagnostics' checks; scenario tips; storage keys; Reset; a missing data file named on the boot screen |
| hexagon | the file scan and the rendered app in both themes: nothing round |

**Check digits.** `js/vat_check.js` agrees with python-stdnum 2.2 on 37,795 generated numbers across DE, AT, IT, NL, GB, CH, FR, ES and EL: no disagreement (run outside the repository).

**Screens.** The idle page at 1920 × 1080 and 1280 × 720 in both themes, How it works and Diagnostics were looked at in the smoke suite's screenshots: no clipped value, the header on two rows at 1280 × 720 with the short fiction tag.

## 11. Acceptance checklist (version 0.2.0)

`GATES.md` holds the runnable gates with their commands; `node tests/run-all.mjs` runs every suite. AC-01 to AC-07 were met in version 0.1.0 and their suites still pass.

| # | Criterion | Proven by | Status |
|---|---|---|---|
| AC-01 | The engine reproduces D1 and D2 on the fixtures, within 1e-9 and every display string | `node tests/engine.mjs D1 D2` | met |
| AC-02 | History and reconciliation reproduce D3; the fix paths reproduce D4 | `node tests/engine.mjs D3 D4` | met |
| AC-03 | The VAT format rule accepts and rejects each country's format plus Greece, never checking a check digit | `node tests/vat.mjs` | met |
| AC-04 | The figure audit gives the expected result and offending tokens for F01 to F15 | `node tests/audit.mjs` | met |
| AC-05 | The world builder is deterministic; 124 accounts; every scenario's case with frozen figures; the clean share recorded; no VAT ID passes its check digit; the log agrees with the data | `node tests/world.mjs` | met |
| AC-06 | Parity against Rebate Hunter's `main` with exactly two adapted files listed in REVIEW.md; the four shared tests run unchanged with this app's values | `node tests/parity.mjs`; `node tests/run-all.mjs tokens page-icon vici-files hexagon` | met |
| AC-07 | The security policy exactly as specified; nothing loaded from outside; every storage key starts with `dq.` except `vc-theme` | `node tests/policy.mjs`; the smoke suite in the browser | met |
| AC-08 | The key is asked for only in Live, checked with `GET /v1/models`, and never appears in local storage, exports, the audit log, recordings or the console; Forget key removes it; the dialog refuses to work in a frame | `node tests/live.mjs key`; the recorder case for recordings | met |
| AC-09 | Against the stand-in: a verified alert refused without a named group of at least half its base or without three records read; options outside the latest fix paths, a stale decision, a draft the path does not allow and a report before the outbox is decided refused with a Guardrail line; a schema-breaking input refused | `node tests/live.mjs guards`; `node tests/tools.mjs` | met |
| AC-10 | The review shows *Your confirmation* in merlot on the furthest step reached (Check in the scripted runs) and the rail never moves back; an unknown code or words not in the short text refused; unreviewed suggestions never count, approved ones do | `node tests/live.mjs review`; `node tests/sims.mjs SC-UNCLASSIFIED` | met |
| AC-11 | No 41st model call; none once €3 is spent; the cost meter equals usage × price within 1e-9 | `node tests/live.mjs caps` | met |
| AC-12 | The six scenarios play offline without a key, with the SIMULATION tape and recomputed figures, along both decision paths and accepting the risk | `node tests/sims.mjs` | met |
| AC-13 | `tools/check_world.mjs` passes every simulation script under the live guardrails | `node tools/check_world.mjs`; the world suite's planted violations | met |
| AC-14 | Cells, people rows and the eight cohorts show the engine's numbers; each cell lists its exceptions; the tables agree with the views; no tile adds spend up over exceptions | `node tests/accept.mjs board` | met |
| AC-15 | Nothing reads "closed" for an exception a re-scan still finds; an approved fix shows "approved, re-scan pending" and its projection | `node tests/accept.mjs honesty`; the sims suite's cards and tiles | met |
| AC-20 | Victor runs one scenario live with his key, end to end within the caps; the audit export shows model, usage and cost | Victor, with his key (section 9.4); the recorder case proves the export's fields against the stand-in | open: Victor's run |
