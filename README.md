# Data Quality Agent

**Procurement data quality.** An AI agent that finds missing and contradictory procurement data, works out the root cause, who has to act and what it costs, and proposes costed ways to fix it for a person to decide.

Fictional company, no client data. You are interacting with an AI system: every action it prepares is a draft that waits for human approval, and nothing is ever sent.

> **Status: Phase 0.** This repository holds the build plan only ([PLAN.md](PLAN.md)). The app follows in three milestones; the plan waits for approval before the first one starts.

## What it will do

GlobalCorp SE is the fictional industrial group of the [Rebate Hunter](https://github.com/VictorPflueger/PROC-Rebate-Hunter). Fifteen deterministic rules check its purchase-order lines, contracts, supplier and material master data and user records over five data-quality dimensions: completeness, consistency, validity, uniqueness and timeliness. The agent reads the records behind the findings, groups them by their root cause, lets the engine cost two or three fix paths next to doing nothing, waits for a decision and drafts the follow-ups and change requests. An exception counts as closed only when a re-scan no longer finds it.

Two modes, chosen when a run starts: **Simulation** replays scripted runs offline and needs no key; **Live** runs the agent with your own Claude API key, kept for the browser session only. It runs as a static page on GitHub Pages: <https://victorpflueger.github.io/PROC-data-quality/> (once published).

## The production path

In a real landscape the same steps would run as SAP S/4HANA or Ariba (the source data) → Microsoft Fabric (where the rules run) → Azure OpenAI and Copilot Studio (the agent) → Power BI (reporting) → Power Automate and Teams (alerts, approvals, tasks) → SAP again (executing what people approved). The prototype stands in for all of it in one browser page.

## Sister prototypes

Built on the same shell and on [Vici](https://github.com/VictorPflueger/ViciDesign), Victor Pflüger's design system: [Rebate Hunter](https://github.com/VictorPflueger/PROC-Rebate-Hunter), [Navigator](https://github.com/VictorPflueger/supply-chain-navigator), [Timetable Translator](https://github.com/VictorPflueger/physicalAI-scheduler) and [Repack Pilot](https://github.com/VictorPflueger/physicalAI-repacking).
