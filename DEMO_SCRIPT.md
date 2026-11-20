# Data Quality Agent — five-minute demo script

The demo plays scenario 1, *Contract references lost in punch-out*, in **Simulation mode at ×1**: no key, no network once the page has loaded, the same figures every time. The replay itself takes about half a minute; the rest of the five minutes is yours to explain, because the run stops and waits wherever a person decides. A Live run with your own key is an optional extra after the five minutes (part 7).

Every figure below is the engine's for scenario 1 on the fictional world, as it was on 20 November 2026. The world is built with relative days, so the figures stay the same whenever the page is opened; `tests/sims.mjs` and `tools/check_world.mjs` hold the scripts to the frozen reference figures.

## Pre-flight (30 minutes before, on the presentation laptop and network)

1. Open <https://victorpflueger.github.io/PROC-data-quality/> in a current Chrome or Edge, at 100 % zoom, on the screen you will present from. The page is laid out for 1920 × 1080 and still fits 1280 × 720 without scrolling sideways.
2. Click **Diagnostics** (control bar, the pulse icon on laptops) and **Run all tests**. Every line should read *Pass*. If only the *Claude API* line fails, the network blocks api.anthropic.com: Simulation still works, Live will not.
3. Choose the theme for the room: light for a lit room or a projector, dark for a dim one. The toggle is the moon or sun in the header.
4. Click **Method** (the book icon) and, if any parameter shows *Changed*, press **Back to the defaults**. Simulation always runs on the defaults, but the dialog should show what the audience will hear.
5. Click **Reset**, choose **1. Contract references lost in punch-out** in the scenario picker and set the replay speed to **×1**.
6. Decide whether to show **How it works** at the start. It opens by itself on a browser's first visit; afterwards it opens from the header.
7. Close other tabs and notifications. If the venue's network is doubtful, keep a local copy ready: clone the repository and run `python -m http.server 8000` in it (part *Contingencies*).
8. For a Live run after the demo: an Anthropic API key of its own with a low monthly spend limit, ready to paste. Never type it on a shared screen.

## The five minutes at a glance

| Time | On screen | The point |
| --- | --- | --- |
| 0:00–0:40 | The idle page: the board, four tiles | Data-quality figures usually end at a red number; this one ends at a decision |
| 0:40–1:10 | Start agent → Simulation, the tip | The agent starts from one vague hint, as a person would |
| 1:10–2:10 | The run: scan, hypothesis, revision, case card | The rules find; the agent explains; it changes its mind when the data says so |
| 2:10–3:30 | The fix paths, your decision | Costed options next to doing nothing; you decide |
| 3:30–4:20 | The outbox, the report | Drafts only; nothing is sent; closure is projected, never claimed |
| 4:20–5:00 | Audit tab, Method, How it works | Everything is traceable, every assumption visible, and this is where it would run |

## 1. The page (0:00–0:40)

Point at the header first: *You are interacting with an AI system* and *Fictional company, no client data*. Then the four tiles: **Closure rate 56.7 %** (131 of 231 exceptions detected in the eight weeks that have had their follow-up window are closed), **Clean spend 77.5 %**, **Open exceptions 148** and **Session cost €0.00**.

Say: "GlobalCorp SE is a fictional industrial group. Fifteen rules watch its orders, contracts, supplier and material records. The usual data-quality dashboard stops here, at a red number. The question that matters is which records are behind it, who can fix each one, what it costs and how to fix it. That is what the agent works out."

Point at the honeycomb: fifteen cells, one per rule, grouped by data product, all neutral because nothing has been scanned in this run yet. Below them, the eight weekly cohorts.

## 2. The tip (0:40–1:10)

Click **Start agent**, then **Run simulation** in the mode dialog. Mention the other card in one sentence: Live runs the same agent with your own key.

The console shows the tip: *"The Lyon lab-supply orders never show up in the contract compliance report, although we have a framework contract with that supplier."* Say: "That is all the agent gets: an unverified hint, the way a first hint arrives."

## 3. Spot and check (1:10–2:10)

The progress rail moves from **Spot** to **Check**. As the agent reads, the cells and rows it reads pulse in fjord blue.

- The scan over plant 3010 turns **DQ-01 Contract not referenced** red with **30** open exceptions. Red and a cross mean high severity, open.
- The agent's first hypothesis: one buyer leaves the reference out. Then the visible revision: the same buyer's contract call-offs carry the reference, so the buyer is not the cause; the missing references sit on the lines that arrive through **punch-out**.
- It reads three of the order lines and the contract, and the **case card** appears: 30 of 30 exceptions come through Lumen Labware's punch-out catalog, on lines worth **€29,281**, all routed to **Camille R., the Lyon lab buyer**. Root cause: the catalog does not pass the framework contract's number back. Fix at source: map contract 4600000101 in the catalog's interface.

Say: "The rules found the thirty lines. The agent did not declare anything wrong by itself: it grouped what the rules found, read the records behind them and named a cause the data supports. The card says what it checked." Point at the lilac **AI** label: everything the agent wrote carries it, and a click explains what that means.

## 4. Calculate and decide (2:10–3:30)

The drawer opens on **Options**; the rail shows **Propose** in merlot with *Your decision*. The run now waits for you, as long as you like.

Walk through the three fix paths next to doing nothing (every figure is the engine's):

- **A Mass correction of the references:** **30 of 30** closed after a re-scan (projected), one-off effort **€750**, 5 days. New punch-out orders keep arriving without the reference.
- **B Ask the buyer to correct the lines:** a follow-up to Camille R.; the case's 14-day history projects **16 of 30** closed, **€1,050**, 14 days.
- **C Mass correction and fix the catalog mapping** (recommended, the merlot frame): **30 of 30** closed after a re-scan (projected) and about **108** new exceptions a year prevented once the catalog is fixed, **€4,350**, prevention after 20 days.
- **Do nothing:** about 108 more lines a year lose their reference, and the compliance report stays blind to them.

Point out *Financing cost avoided now: €0*: a missing contract reference costs no interest; only wrong or missing payment terms do (scenario 2).

Click **Approve** on C. Three things happen, and none of them says *closed*: the card reads **Approved, re-scan pending**, in merlot like every decision of yours, never in the success green; the closure-rate tile keeps **56.7 %** and adds **68.4 % projected after re-scan**; and the thirty rows in DQ-01's table read *approved, re-scan pending*. Say: "Closure is measured, not claimed. Only a re-scan that no longer finds an exception closes it."

## 5. Drafts and the report (3:30–4:20)

The drawer switches to **Outbox** (*Draft. Nothing is sent.*) and the rail shows *Your approval*. Two drafts wait: a **mock change request** listing the thirty lines with their old and new contract reference, and a **prevention request** to fix the catalog mapping. Open one, then **Approve** both.

The report closes the run in the console, with its AI label: the case, the decision (*approved, re-scan pending*, 68.4 % projected against 56.7 % measured) and *2 of 2 drafts approved; nothing was sent*.

## 6. Traceable, explained, and where it would run (4:20–5:00)

- **Audit** tab: every event and decision with its time, and the three exports: the report as Markdown, the exceptions as CSV, the audit log as JSON. In Simulation each file says SIMULATION in its name and its content.
- **Method** (control bar): the fifteen rules, why accuracy is left out, the definitions behind every figure and the parameters, all labelled as assumptions.
- **How it works** (header): the production path, from SAP S/4HANA or Ariba through Microsoft Fabric, Azure OpenAI and Copilot Studio to Power BI, Power Automate and Teams, and back to SAP for what people approved.

Close: "Every finding names its records, the person who can act and what each fix costs. People decide, nothing leaves the outbox, and the closure rate moves only when a re-scan proves it."

## 7. Optional: a Live run (after the five minutes)

Click **New run**, choose **Live**, paste your key when asked (it is checked with Anthropic's free model list and kept for this tab only). The agent then works from the same tip with real model calls; its path and wording differ from the script, but the figures still come from the engine and every guardrail still holds. A run stops at 40 model calls or €3; the session-cost tile shows the spend as it goes. After the demo: **Forget key** in the mode dialog.

## Contingencies

| What happens | What to do |
| --- | --- |
| The page does not load, or the venue's network is down | Use the local copy: `python -m http.server 8000` in the repository, then `http://localhost:8000`. Opened straight from disk, the page cannot load its modules and says so. |
| The replay runs too fast or too slow for your words | It waits at every decision anyway; set ×2 to get through the scan faster, ×1 to slow it. |
| You picked the wrong scenario or started too early | **Abort**, then **Reset**, then start again. Nothing is kept. |
| The drawer covers the board | **Hide** at the drawer's right edge; the tabs show their counts. |
| A dialog is open | **Escape** or its close button. |
| Text is too small for the back row | **Larger text** in the console's header; the browser's zoom also works, and the page keeps one row of controls down to 1280 px wide. |
| The tiles show other figures than this script | Someone changed the parameters or ran a Live sweep in this tab: **Reset**, then **Method → Back to the defaults**. Simulation always uses the defaults. |
| Live fails (key refused, network, rate limit) | The console says why; switch to Simulation. Nothing was spent beyond what the cost tile shows. |
| Someone asks to see real company data | Say it is not possible by design: the page has no connection to any system, and its security policy allows calls to api.anthropic.com only. |

## Questions that will come

**“Is this real data?”** No. GlobalCorp SE, its suppliers, people, orders and figures are invented by a seeded generator (`tools/build_world.mjs`), the same every time. What is real is the structure: the data products follow SAP's purchasing tables (EKKO and EKPO for orders and contracts, LFA1, LFB1 and LFM1 for suppliers, MARA and MAKT for materials) and the VAT ID formats are the published ones. The VAT IDs are built to fail the real check digits, so none can belong to a company.

**“What is clean spend?”** The value of the order lines of the last 365 days that carry no open, routed or accepted exception, neither on the line itself nor on its supplier, material or contract. Here 77.5 % of €8.4 million. A line touched by several exceptions counts once, so spend is never added up across exceptions.

**“Why no accuracy?”** Accuracy asks whether a value matches the real world, whether the supplier really banks where the record says, whether the material group fits what was bought. Only a check outside the data can answer that: a register, a document, a look at the goods. The prototype has none, so it checks the five dimensions it can check inside the data (completeness, consistency, validity, uniqueness, timeliness) and says nothing about accuracy rather than guess.

**“What does fixing a paid order save?”** Nothing in euros. When the payment terms on an order are missing or shorter than agreed, the company pays earlier than it has to, and that early payment has a financing cost. Once the invoice is paid, that cost is spent; correcting the order afterwards recovers none of it. Correcting an order that is still unpaid avoids its cost, and fixing the cause prevents the next ones. The page shows these as costs, a one-off amount or a yearly run rate, never as savings.

**“What happens to the drafts?”** Nothing leaves the app. It has no e-mail and no ERP connection: approving a draft marks it as cleared and the exceptions it covers that are routed to its recipient as routed, in this browser tab only. With real data, the approved drafts would go out through Power Automate and Teams, and SAP would carry out the changes people approved.

**“Why does the board say 40 and the tile 151?”** They count different scopes, and both say which. The board counts the last scan's scope, here all fifteen rules at plant 3010: *40 open exceptions in this scope*. The header's tile counts the whole exception log after the scan, every rule and plant: 151 open, routed or accepted.

**“Why not let the AI decide?”** Because a fix changes master data and asks people for their time. The agent proposes, costs and drafts; a person decides on the fix path and approves every draft; the guardrails in code refuse anything else.

**“Can the AI make up a figure?”** Every figure the agent writes is checked in code against the figures its tools returned. A figure no tool returned is refused, or marked as unchecked if it slips through a fallback. The cards, tiles and tables show the engine's figures only.

**“What would it take to run this on our data?”** The production path in *How it works*: the rules as views on the data platform, the agent on Azure OpenAI and Copilot Studio, reporting in Power BI, approvals in Teams, execution in SAP. The prototype stands in for all of it in one page.

## After the demo

1. **Reset**, so the next visitor starts from the idle board.
2. If you ran Live: **Start agent → Change or forget key → Forget key**, then close the tab.
3. If you changed parameters for a Live run: **Method → Back to the defaults**.
4. If someone wants the run: **Audit → Audit log (.json)**, or the report and the exceptions as files.
5. Note the questions you could not answer, for the next version.
