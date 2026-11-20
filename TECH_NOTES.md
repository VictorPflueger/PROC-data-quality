# TECH_NOTES: verified facts and build decisions

The Data Quality Agent runs as a static page and, in Live mode, calls the Claude API directly from the browser and nothing else. Every external detail the code depends on is recorded here with its source and the date it was verified. If a fact changes, update this file first, then `js/config.js`.

**Basis.** Version **2.0.0**, 20 November 2026: the presenter. The page was rebuilt for customer presentations: the tip and five steps in a step bar, four key figures top right, Vici's guide with a five-minute talk track, the byline in the footer, and Live mode in a dialog of its own (section 9.3). The engine, the world, the seventeen tools with their guardrails, the figure audit, the live agent, the six simulation scripts and the audit log are version 1.0.0's and compute what they computed then; version 1.0.0's build plan, independent review and gates stay in the git history (commit `6386bd6`). The page uses Vici v1.0.0 at commit `f7bf7e0`. Sections 1 to 3 record the API facts the live agent rests on, probed on 19 November 2026. Section 4 is the browser's security policy and storage; section 5 the world; section 6 how the engine reads the method; section 7 the agent in Live mode and its guardrails; section 8 Simulation and the session-cost estimate; section 9 the decisions and open points; sections 10 and 11 the verification log and the acceptance checklist.

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
- **Caps per run** (`AGENT` in `js/config.js`): 40 model calls and €3, a 90-second idle limit per stream (section 7; the caps case of `tests/live_ui.mjs` proves the first two).

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
- **Workspaces.** Spend limits are set per workspace, not per key, so the live dialog advises a key of its own with a low monthly spend limit; a key spanning several workspaces needs a header the app does not send. These come from the sister apps' verification of 12 October 2026 and were not probed again for this build.
- **The key.** It is asked for only when a live run starts, checked with `GET /v1/models`, kept in this tab's session storage under `dq.anthropic.key`, and never written to local storage, logs, exports, recordings or the console; *Forget key* removes it; the key dialog refuses to work inside a frame; the key goes only to api.anthropic.com. The shared key store (`js/keystore.js`: session storage only, and redaction of anything key-shaped) holds it, and `tests/live_ui.mjs` proves every point of this list against the scripted stand-in (section 11, AC-08).

## 4. Browser security policy and storage

### Content Security Policy (meta tag in `index.html`)

```
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src https://api.anthropic.com; object-src 'none'; base-uri 'none'; form-action 'none'
```

- The meta tag sits at the top of `<head>`, after the character set and the viewport and before any stylesheet or script. GitHub Pages sends no policy header of its own, so the meta tag is the policy; `frame-ancestors` cannot be set in a meta tag, which is why the key dialog checks for a frame itself.
- The page loads nothing from another site: Vici's stylesheet, fonts and script are in `vici/`, the data are three classic scripts in `data/`, everything else is a module in `js/`. Only `js/anthropic.js` calls `fetch`, and only `https://api.anthropic.com` is reachable. Links to other sites (Victor's LinkedIn profile and website in the footer's byline) are plain links that open in a new tab.
- No inline script, no inline style attribute, no inline event handler, no `eval`. Styles that code sets at run time go through the CSSOM (`element.style.x = …`), which `style-src 'self'` allows.
- Two checks hold this: `tests/policy.mjs` (the exact policy in exactly one meta tag, no outside resource in HTML, CSS, JavaScript or data, `fetch` only in the client, no inline script or style, the storage keys) and `tests/presenter.mjs` (the running page through every step, in both themes and two sizes: no page error, no policy violation and no request to another site).

### Storage

Every key starts with `dq.`; the only shared key is Vici's `vc-theme`, which all of Victor's pages use for the theme.

| Key | Storage | Holds | From |
|---|---|---|---|
| `vc-theme` | local | the light or dark theme (Vici's, shared) | 0.1 |
| `vc-guide:<path>#guide` | session | the guide has opened by itself in this tab (Vici's) | 2.0 |
| `dq.anthropic.key` | session | the API key, this tab only | 0.2 |

Version 2.0.0 dropped `dq.introSeen`, `dq.consoleText`, `dq.model`, `dq.speed`, `dq.diag`, `dq.sessionCostEur` and `dq.params` with the features that wrote them (section 9.3).

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

**Calibration** (`tools/check_world.mjs`, frozen in `data/reference_cases.js`). A scan of the whole world on day 0 finds **164 exceptions**; the clean spend share is **75.2 %** (the method aims for about 75 %). Before that scan, the log holds 148 live entries (open, routed or accepted), clean spend is 77.5 % and the closure rate 56.7 % (131 of 231); the scan keeps 145 of the live entries, closes 3 that the data no longer show and adds 19 new ones, and the closure rate becomes 58.0 %.

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

**Reconciliation.** Within the rules and filters a scan ran: a live entry the scan still finds stays as it is; an exception found for the first time becomes a new entry, *open*, detected today; a live entry the scan no longer finds closes today, closed by re-scan; a closed exception that reappears gets a new entry linked to the old one. Dismissed exceptions are not raised again. New entry ids continue the log's own prefix and width. An entry becomes *routed*, with that day as its routed day, when a person approves a follow-up or a change request **to its routed-to person**: a change request to one owner leaves the entries routed to another owner open (review finding R16). **Projections** run the same scan and reconciliation on a copy of the world with the changes applied, within the case's scan scope (its rules and filters); they are shown as "projected after re-scan", never written back.

**Fix paths** (`js/fixpaths.js`). The paths of the method next to doing nothing, from the case's figures and the parameters in `js/params.js`; path B's closures are `floor(n × c / e)`; a path that does not apply carries "not applicable" and no figures; a case without history carries "no history".

**Parameters** (`js/params.js`). The twelve parameters of the method, each an assumption (decision D4): the day rate, working hours, the three efforts and lead times, the cost of capital and the analysis window. Every run, live or simulated, computes with these defaults: the `run_start` event carries them, and every engine tool uses them, so the frozen reference figures hold for every run. Version 1.0.0 let a presenter change eleven of them for Live runs in a Method dialog; version 2.0.0 removed the dialog (section 9.3).

**Figure audit** (`js/figures.js`). Every figure in a text is read with its type (amount, share, count, days) and must match a figure the run produced or a parameter: amounts of any size within half a unit of their last digit and within 2 % of the figure, with no €0.50 floor; shares, counts and days within half a unit of their last digit. A comma followed by exactly three digits always groups thousands. Ids, codes and dates are exempt from matching but must exist. From version 0.2 an amount written in whole euros without a scale also matches a figure that rounds to it (correction B8, section 9.2, M2-01).

**Dates and weeks** (from version 1.0.0, review finding R9). A date is read in the app's own names, which come from the same `Intl` formatter as the screens (`en-GB` writes *Sept*), in its short or long form, day or month first, with or without its weekday and year, or as ISO. It must be a real date with the right weekday, and in a run a day some tool returned: the run's day (the date the system prompt gives), an order's day, a contract's validity, a supplier's block or creation, a user's last day, a log entry's days or a cohort's bounds (`addDates` collects them from every tool result). A date without its year may mean this year, last year or next year. A month with its year (*November 2025*) must contain such a day, and *Week 3* must be a weekly cohort the history tool returned. Before, *Sept* and the long forms were read as bare numbers and refused, and any real date passed.

**Validator** (`js/validate.js`). A JSON Schema subset without a dependency (types, required, properties, `additionalProperties`, enums, patterns, items, `$ref` to definitions, nullable `anyOf`); an unknown keyword throws, so a schema cannot ask for a check that silently does not run. The fifteen schemas are in `js/schemas.js`.

**Rounding and display.** Values are rounded to 1e-9 before display, so GBP 1,500 × 1.15 (1,724.9999999999998 in floating point) shows €1,725. Amounts show whole euros (`en-GB`), the session cost euros and cents, shares one decimal.

## 7. The agent in Live mode

**The loop** (`js/agent.js`, adapted from Rebate Hunter's). Every model call streams, with adaptive thinking and summaries, the model's effort, a top-level `cache_control` and `tool_choice: auto`, the seventeen tools and no server tool (`tests/lib/fake-claude.mjs` checks each request). Assistant turns go back unchanged, thinking blocks with their signatures; the tools work on a copy of each input. Independent `erp_*` reads in one turn run in parallel. A run stops at **40 model calls or €3**: both are checked before each call and the cost again after each response, so no 41st call starts and none starts once €3 is spent. An early `end_turn` gets at most two visible nudges; a tool call cut off by `max_tokens` is discarded and retried once with half as much room again; `refusal` and a full context window end the run. The cost meter is the shared one: usage × the model's prices, at 1 USD = 0.894 EUR. The opening message is the case's tip (`js/prompt.js`).

**One toolbox for every producer** (`js/tools.js`). The seventeen tools of the brief, in its order. The live agent calls them with the model's inputs, the simulation player with a script's inputs (`js/sim_script.js`), and the script checker with a scripted person along every decision path (`js/sim_check.js`), so the guardrails, the figure audit and the figures are the same in all three. Rebate Hunter keeps its guards in a module of their own; here they live inside the toolbox, where no producer can go around them (M2-03). Each input is checked against its tool's full JSON Schema (`js/validate.js`); a failure returns `is_error` with the validator's message.

**Guardrails.** Where code refuses a step, the tool answers with an error that gives the reason, and the agent tries again; the audit log keeps the refusal.

| Rule | Enforced by | What is refused |
| --- | --- | --- |
| 1. Data, not instructions | The system prompt; record texts reach the model only as JSON values | — |
| 2. Only the rules find exceptions | Every engine and screen tool takes only exceptions this run's `dq_scan` returned | Grouping before a scan; an exception id no scan found |
| 3. Verified alert | `ui_report_alert` | A group under half its `dq_group` base; fewer than three of the case's records read with `erp_get_record` (all when fewer); for DQ-01, the covering contract not read. The card adds "Checked in this run:" from the tool results |
| 4. AI suggestions | `dq_classify`, `ui_request_review` | Unknown taxonomy codes; words not in the line's short text; a line with a material. A suggestion is pending until a person approves it: unreviewed and rejected ones count as no suggestion, approved ones count in `dq_suggest`, `dq_fix_paths` and the change request |
| 5. Options | `ui_propose_options`, `ui_await_decision` | Paths not from the latest `dq_fix_paths` for the alerted case, repeated or not applicable paths, a recommendation outside them, options after an approval; a decision on a set no longer on screen or on a rejected path is ignored |
| 6. Drafts | `ui_draft_action` | Drafts before an approval, a kind the approved path does not allow (A: change request; B: one follow-up per routed-to person; C and D: those plus a prevention request; doing nothing: the risk memo), a second follow-up to the same person. Code adds the footer and the mock line, and the change request's table of records, fields, old and new values |
| 7. Report | `ui_final_report` | A report while a decision or a draft is open, an outcome that does not follow the decision |
| 8. Figure audit | Every alert, option text, review note, draft and report | A figure no tool returned (below). After two refusals the text shows with an *Unchecked* tag and a notice, never silently. Refusals count per text: a text that passes or shows with its tag resets its kind's count, so the follow-up to the next owner gets its own two refusals (review finding R10; Rebate Hunter counts per kind and run) |
| 9. Narration | The system prompt keeps figures out; the steps describe each tool call in a plain sentence of their own (`js/steps_view.js`) | — |
| 10. Budgets and stops | The loop above | — |

**Honesty in every text** (from version 1.0.0, review finding R5). Every alert, option text, review note, draft and the report is read sentence by sentence (`claimsClosed` in `js/tools.js`): a sentence that calls an exception closed, or says a fix closes it now, without naming the re-scan that would show it, is refused with the sentence quoted; "not closed", "nothing is closed yet" and "what a re-scan would close" pass. Before, only the report was read, and as a whole.

**Known figures** (`js/sim_vars.js`). Each engine result yields named, typed figures (`scan.clean_share`, `case.spend`, `path.C.prevented` …), which feed both the figure audit and the scripts' placeholders, so the two cannot drift. Each text may quote:

| Text | May quote |
| --- | --- |
| Alert | the ERP facts read, the engine's results and every fix path's figures |
| Review note | the ERP facts and the engine's results |
| Options | the facts, the engine's results and the figures of their `dq_fix_paths` result |
| Draft | the facts and the approved path's figures |
| Report | the facts, the engine's results and every path's figures; projections only in a sentence that says "projected" |

**Projections.** An approved fix path never closes anything in the demo, because nothing changes the data; it shows as *approved, re-scan pending* with the closure rate projected after re-scan. For A and C the projection runs the scan and reconciliation on a copy of the world with the suggestions applied, approved AI suggestions included, **within the case's scan scope** (`project()` in `js/history.js` with the case's rules and filters): an unscoped re-scan of the copy closed three exceptions outside the case as well, and showed scenario 1's C at 69.7 % instead of 68.4 % (review finding R1). Scenarios 1 to 3 now project 68.4 %, 63.6 % and 70.1 %. A decision and the drafts count the AI suggestions a person approved after the alert, as `dq_fix_paths` does (review finding R6). For B and D, whose closures are themselves an expectation, it is the expected rate: (the cohort's closed exceptions + the path's closures × the case's share of entries in the cohort) / the cohort's eligible exceptions. Doing nothing projects nothing. *Records fixed* shows the closures of the approved path, noted *projected after re-scan* for A and C and *expected, from history* for B and D.

**People and steps.** The person's decisions, reviews and approvals reach the agent as run events (`option_decision`, `confirmation_decision`, `action_decision`); a waiting tool takes the first of its kind that passes its test (`js/human.js`). The step bar names the person's turn on the step that waits (*Your review* on Check, *Your decision* on Propose, *Your approval* on Prepare), and Next cannot pass an open decision; `js/phase.js` keeps the furthest phase the run reached.

**The audit log** (`js/audit.js`). The audit log records every run event and every model request and response of the current run, redacted of anything key-shaped. Prepare's *Download the audit log* writes it as `data-quality-<run id>-SIMULATION-audit.json` or `…-LIVE-audit.json`: the app, its version, the rule set, engine and world versions, the mode and a statement of it, the AI disclosure, the fiction note, the run, the model, usage and cost (Live), the parameters in effect, the run facts, every run event (schema `RunEvent`), the audit log proper (schema `AuditEvent`: each event and model call with its actor, the rule set and engine versions, and for model calls the model, usage and cost) and the model exchanges. The export has its own schema (`EXPORT_SCHEMAS.AuditExport` in `js/schemas.js`), and `tests/live_ui.mjs` validates a downloaded one with the app's validator. The actor of an audit entry is the agent (its texts, tool calls and model calls), the engine (tool results), the person at this browser (decisions, reviews and approvals) or the app itself (the run's frame, notices, refusals and costs). Version 2.0.0 dropped the report (.md) and exceptions (.csv) downloads with the Audit tab (section 9.3).

## 8. Simulation and the session-cost estimate

**Scripts** (`data/sim_runs.js`, `window.SIM_RUNS`). A script is the event stream of a run in four kinds of step: `{ think }`, `{ say, kind }` (kind `hypothesis` or `revision`, and the text must start with "Hypothesis:" or "Revised:", as the Check step labels it), `{ tool, input }`, and one `{ decide }` with what to say, draft and report for each decision. Texts write `{{name}}` where an engine figure goes; the player fills it from the tool results before it, so every figure on screen is recomputed at playback. A recorded script may add, per path it recorded, the live run's own texts (`decide.paths`).

| Scenario | Tool calls before the decision | Paths offered | Recommended | Review |
| --- | --- | --- | --- | --- |
| 1 Contract references lost in punch-out | 15 | A, B, C | C | — |
| 2 Paying too early | 14 | A, B, C | C | — |
| 3 Unclassified spend | 15 | A, B, C | C | 32 AI-suggested groups |
| 4 Who ordered this? | 14 | B, D | D | — |
| 5 New suppliers, half the data | 13 | B, D | D | — |
| 6 Two Apexes? | 15 | B, D | D | — |

**Playback** (`js/simulation.js`). The player runs the script through the same toolbox as the live agent, at once: there is no replay speed. It stops where a person acts (a review, the decision, each draft) and goes on when the presenter acts on screen, so every step shows as soon as the presenter moves to it. A deep link (`?step=4`, `?step=5`) plays the run up to that step; `?step=5` approves the recommended path on the way. The mode tag says SIMULATION; no key is asked for and no request leaves the page.

**The session-cost estimate** (`js/estimate.js`). A simulated run costs nothing, but *Session cost* shows what the same run would cost live, labelled as an estimate. The estimator rebuilds the conversation the live agent would hold, request by request: the system prompt, the seventeen tool definitions and the opening message, then each reasoning summary, narration, tool call and tool result in order; consecutive record reads count as one request, because the live agent sends them in parallel. Each request reads what came before from the prompt cache and writes the rest; tokens are estimated at four characters each, plus 300 reasoning tokens per request, at Sonnet 5.5's list prices (section 1) and 1 USD = 0.894 EUR. The six scripts come to €0.09 to €0.12 a run, the default case to €0.10; `tests/presenter.mjs` holds the tile to the same estimate computed in Node. A live run measures its real cost: the estimate is a guide, not a quote.

**The script check** (`js/sim_check.js`; `tools/check_world.mjs` and `tests/world.mjs`). Every script runs with a scripted person along every path it offers: approving the recommendation, rejecting it and approving another, accepting the risk, rejecting every path, approving each other path, and, where it has a review, rejecting every suggestion. A fault is any tool refusal, an unresolved placeholder, a figure in an authored script's narration (a recorded one may quote figures through placeholders only), a missing or unlabelled hypothesis or revision, fewer than eight tool calls before the decision, or a report whose outcome does not follow the decision. The six authored scripts pass in 34 runs.

Save run as simulation, which turned a live run into a script, was removed in version 2.0.0 (section 9.3); the six authored scripts are the ones that ship.

## 9. Decisions and open points

### 9.1 Approved by Victor on 19 November 2026

The recommended defaults of the build plan (PLAN.md §1.7, in the git history) and its corrections B1 and B2:

| # | Decision |
|---|---|
| D1 | Name "Data Quality Agent", subtitle "Procurement data quality" |
| D2 | The website's card | Update the card in VIP for version 2.0.0 once this version is live |
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

Corrections B3 to B7 stand as the plan resolves them: B3 by N1, B4 by N3, B5 by N2, B6 sorts by spend largest first, B7 records the stricter published refinements in DATA_SOURCES.md and keeps the format rule.

### 9.2 Build decisions before version 2.0.0

Versions 0.1.0 to 1.0.0 recorded 46 build decisions, M1-01 to M3-27; the full table is in this file's history. Most concerned the screens that version 2.0.0 replaced. Those the other sections cite still hold:

| # | Decision | Reason |
|---|---|---|
| M1-07 | Pounds convert at the ECB euro reference rate of 19 November 2026, 1 EUR = 0.83581 GBP, so 1 GBP = 1.196444 EUR, one rate for the whole window | One rate keeps every figure reproducible; DATA_SOURCES.md §2 |
| M2-01 | Correction B8: an amount written in whole euros without a scale ("€18", not "€18k") matches a figure that rounds to it | The method's own rule would reject the €18 that golden case D2 displays; F01 to F15 give the same results either way (`tests/audit.mjs`) |
| M2-02 | Strict mode stays off; filters are a list of `{ key, values }` | The list form keeps the tools within 17 optional and 2 union-typed parameters; the validator checks every bound against the full schema |
| M2-03 | The guards live in the toolbox (`js/tools.js`) | One toolbox serves the live agent, the player and the checker, so a replay obeys exactly what a live run obeys |
| M3-10 | The live-site check runs in GitHub Actions after every Pages build (`.github/workflows/live-site.yml`); `node tests/live_site.mjs --serve` runs it against the local checkout | github.io cannot be reached from the build environment |

### 9.3 The presenter (version 2.0.0, 20 November 2026)

A partner review of version 1.0.0 found a prototype that proved everything and told a customer little: 38 controls on the first screen, key figures that barely moved, a timed replay of 27 seconds before the decision, tool names in a console, and option cards of ten figure rows each. Version 2.0.0 keeps the case and rebuilds the screen around it.

| # | Decision | Reason |
|---|---|---|
| P1 | The tip and five steps, one at a time, in a step bar; Back and Next, the arrow keys, a click on a step, and `?case=…&step=…` | A customer follows one question at a time; the presenter sets the pace |
| P2 | Simulation runs at once and waits only where a person acts; no replay speeds, no timed console | Waiting for a replay is dead air in a meeting |
| P3 | Four key figures top right: Cost avoided, Records fixed, Detection → decision, Session cost | Each says what the agent brings in money, records, time or run cost, and each moves with the steps |
| P4 | *Records fixed* counts records, not order lines | In the onboarding and duplicate cases the exceptions sit on suppliers |
| P5 | Session cost is estimated in Simulation and labelled as an estimate (section 8) | A demo without a key still shows what a live run costs |
| P6 | The default case is *Paying too early* (`UI.defaultScenario`) | Money in every step, an agent that corrects itself, two named buyers and a clear choice: path C costs €4,315 and stops about €10,293 a year |
| P7 | Vici's guide opens once per tab with five chapters; the last is a five-minute talk track whose figures the page fills in from the engine | The talk track opens with the prototype, as in the Dispatch Lab, and cannot drift from the figures on screen |
| P8 | Cut: the control bar, the console, the drawer with its tables and people view, the weekly cohort chart, the Method dialog, Diagnostics, Save run as simulation, Live sweep, the custom what-if, and the report and CSV downloads | None carried the customer story; the first screen went from 38 controls to 9. The engine, tools, guardrails, figure audit, Live mode and the audit log stay |
| P9 | Live mode starts from the tip in a dialog with the key and the model | The same live agent, with one place for the key's rules |
| P10 | Parity with Rebate Hunter's shell is retired | The presenter replaces the shared shell; the shared Vici suites still run unchanged |
| P11 | Names, not ids, and no tool names on screen (`js/plain.js`) | A newcomer reads people and cities, not U190 or a tool's name |
| P12 | A text the figure audit refused twice shows with an *Unchecked* tag on its card, as before | Honesty survives the new screens |

### 9.4 Open for Victor

| # | Point | Proposal |
|---|---|---|
| AC-20 | Your own live run | With your key and Sonnet 5.5: on the tip, *Run it live*; decide and approve the drafts; then *Download the audit log* in Prepare. It names the model, the usage and the cost; the run stops by itself at 40 model calls or €3 |
| AC-21 | The five-minute demo | `DEMO_SCRIPT.md`: before you start, the five minutes, what to do if something goes wrong and the questions that will come. Rehearse it once against the live site |
| AC-22 | A review of the presenter | Version 1.0.0's independent review covered the figures, rules and honesty, which 2.0.0 keeps; the new screens have not been reviewed by an agent that did not build them. Ask for one before a customer sees it, or accept the risk |
| D2 | The website's card | A pull request in VIP updates the card for version 1.0.0 (the note loses "Work in progress."); merge it once this version is live |
| Live site | The check after the merge | The *live site* workflow runs after the Pages build of the merge and must end with LIVE SITE OK; nothing to do unless it fails |
| R17 | Doing nothing's yearly cost | The method costs a year's new exceptions at the case's average past cost (12 × *f* × *E* / *n*). In scenario 2 that is about €10,293 a year against €3,482 for the last 365 days, because the case gains 68 exceptions a year and holds 23. The card now says how the figure is costed. If you would rather cost only the share that stays open past the 14-day window, that is a change to the method (its fix-path table); I would make it in a later version |

## 10. Verification log

**20 November 2026, version 2.0.0.** Node.js 22.23.5; Playwright with Chromium 157 for the browser suites; a Vici checkout next to the repository whose release files equal `f7bf7e0`. Vici's own guide check (`check-guide-render`) passes against the page: it opens once per tab, focus and keyboard behave, `?guide=0` and `?guide=present` work, full screen on a phone. `node tests/run-all.mjs`: ALL SUITES PASSED (15 of 15). No test called a real API; no key was used.

| Suite | Result |
| --- | --- |
| presenter | 78 checks in six cases: steps (click, arrow keys, Back and Next, `?case=…&step=…`, each step under 1.5 s, Tab and Enter with a focus ring, reduced motion), kpis (four figures top right before a run, the engine's after the decision, the clock stopping, Session cost equal to the estimate in Node, the talk track's figures), cases (six of six to "Done. Nothing was sent."), paths (a rejection, the accepted risk, every path rejected, the review), lean (9 controls on the first screen; no tool name, user id, em dash or broken value on any step, the checker first catching planted ones), layout (1920 × 1080 and 1280 × 720 in both themes; at 900 × 520 the same check fails, as a control); no page error, policy violation or request to another site |
| live_ui | 49 checks against the scripted stand-in: run (the key in this tab's session storage only, the default case end to end, the engine's figures, the measured cost, the audit log valid against `AuditExport`, Forget key), frame, guards, unchecked, caps (exactly 40 calls; two calls when the second passes €3) |
| tools, world, engine, audit, vat, policy | 98/98 (version 1.0.0's 114 less the checks of Save run as simulation and the console's plain sentences, both removed), 49/49 with the script check of six scripts, 341/341, 82/82, 60/60, 28/28 |
| tokens, hexagon, page-icon, vici-files | 80 colour pairs in two themes pass (11 colour-blind separation gaps reported, to fix in Vici); nothing round through a whole run in both themes; the page icon as on the website's card; `vici/` as listed, byte for byte against the Vici checkout |
| unit, docs, hygiene | all passed; 6 documents (15 section citations, 93 named paths); the generic checks only, because the private term list is not in this environment |

**Screens.** Every step of the default case at 1920 × 1080 and 1280 × 720, light and dark, was looked at in the presenter suite's screenshots, and so was the end of each of the six cases. Two defects were found and fixed on the way: the tip's hidden heading showed while it held the focus and moved the buttons between press and release (it now stays hidden); and a text that the figure audit let through after two refusals showed without its *Unchecked* tag (section 9.3, P12).

**Versions 0.1.0 to 1.0.0** (19 and 20 November 2026). Every suite passed at each release, 20 of 20 for version 1.0.0; their logs are in this file's history.

**Check digits.** `js/vat_check.js` agrees with python-stdnum 2.2 on 37,795 generated numbers across DE, AT, IT, NL, GB, CH, FR, ES and EL: no disagreement (run outside the repository on 19 November 2026).

## 11. Acceptance checklist (version 2.0.0)

`node tests/run-all.mjs` runs every suite. AC-01 to AC-07 were met in version 0.1.0, AC-08 to AC-15 in version 0.2.0 and AC-16 to AC-23 in version 1.0.0; this table says how version 2.0.0 meets each, and adds AC-24 and AC-25 for the presenter.

| # | Criterion | Proven by | Status |
|---|---|---|---|
| AC-01 | The engine reproduces D1 and D2 on the fixtures, within 1e-9 and every display string | `node tests/engine.mjs D1 D2` | met |
| AC-02 | History and reconciliation reproduce D3; the fix paths reproduce D4 | `node tests/engine.mjs D3 D4` | met |
| AC-03 | The VAT format rule accepts and rejects each country's format plus Greece, never checking a check digit | `node tests/vat.mjs` | met |
| AC-04 | The figure audit gives the expected result and offending tokens for F01 to F15 | `node tests/audit.mjs` | met |
| AC-05 | The world builder is deterministic; 124 accounts; every case with frozen figures; the clean share recorded; no VAT ID passes its check digit; the log agrees with the data | `node tests/world.mjs` | met |
| AC-06 | The four shared design tests run unchanged with this app's values. Parity with Rebate Hunter's shell is retired (section 9.3, P10) | `node tests/run-all.mjs tokens page-icon vici-files hexagon` | met; parity retired |
| AC-07 | The security policy exactly as specified; nothing loaded from outside; every storage key starts with `dq.` except Vici's own | `node tests/policy.mjs`; `node tests/presenter.mjs` in the browser | met |
| AC-08 | The key is asked for only in Live, checked with `GET /v1/models`, and never appears in local storage, the page, the audit log or the console; Forget key removes it; the dialog refuses to work in a frame | `node tests/live_ui.mjs run frame` | met |
| AC-09 | Every guardrail refuses its fault; a refused call goes back to the agent as an error and the run still ends | `node tests/tools.mjs`; `node tests/live_ui.mjs guards` | met |
| AC-10 | The review waits on Check as *Your review* and Confirm waits for every line; an unknown code or words not in the short text are refused; unreviewed suggestions never count, approved ones do | `node tests/presenter.mjs paths`; `node tests/tools.mjs` | met |
| AC-11 | No 41st model call; none once €3 is spent; Session cost shows usage × price | `node tests/live_ui.mjs caps run` | met |
| AC-12 | The six cases play offline without a key, with the engine's figures, along the recommended path; the default case also after a rejection, with the accepted risk and with every path rejected | `node tests/presenter.mjs cases paths` | met |
| AC-13 | `tools/check_world.mjs` passes every simulation script under the live guardrails | `node tools/check_world.mjs`; the world suite's planted violations | met |
| AC-14 | The key figures show the engine's numbers: Records fixed and Cost avoided equal the approved path's figures computed in Node, for every case | `node tests/presenter.mjs kpis cases` | met |
| AC-15 | Nothing reads closed before a re-scan: an approved path shows *Approved, re-scan pending*, and Records fixed says *projected after re-scan* or *expected, from history* | `node tests/presenter.mjs kpis`; `node tests/tools.mjs` | met |
| AC-16 | The audit log downloads with its name and mode, holds the run's decisions and cost, and validates against `AuditExport` with the app's validator | `node tests/live_ui.mjs run` | met |
| AC-17 | At 1920 × 1080 and 1280 × 720, both themes, every step of the default case: no page scrolling, the step's main action in view and uncovered, no key figure cut | `node tests/presenter.mjs layout` | met |
| AC-18 | The four shared design tests pass: contrast in both themes for every pairing the app uses; nothing round; the page icon; `vici/` matching its release | `node tests/run-all.mjs tokens hexagon page-icon vici-files` | met |
| AC-19 | Start and the recommended Approve are reached by Tab and work with Enter, with a visible focus ring; the arrow keys move between steps; reduced motion stops the figures' flip | `node tests/presenter.mjs steps` | met |
| AC-20 | Victor runs one case live with his key, end to end within the caps; the audit log shows model, usage and cost | Victor, with his key (section 9.4); `tests/live_ui.mjs run` proves the fields against the stand-in | open: Victor's run |
| AC-21 | Victor gives the five-minute demo without help | Victor, with `DEMO_SCRIPT.md` (section 9.4) | open: Victor's demo |
| AC-22 | An agent that did not build the prototype reviews figures, rules, honesty rules and the UI; no high or medium finding stays open | Version 1.0.0's review (git history) for figures, rules and honesty | open for the 2.0.0 screens (section 9.4) |
| AC-23 | README, DESIGN, TECH_NOTES, DATA_SOURCES and DEMO_SCRIPT complete and lean; `tests/hygiene.mjs` passes | `node tests/docs.mjs`; `node tests/hygiene.mjs` | met |
| AC-24 | The guide follows Vici: it opens by itself once per tab, explains the four key figures, and its talk track quotes the engine's figures for the default case | `node tests/presenter.mjs kpis`; Vici's guide check (check-guide-render in the ViciDesign repository) against the page | met |
| AC-25 | The first screen offers at most 12 controls; no step shows a tool name, a user id, an em dash or a broken value | `node tests/presenter.mjs lean` | met |
