# Data Quality Agent

An AI agent for procurement data. It takes a one-sentence tip, finds the records behind it, works out why they are wrong and who can fix them, and has a rule engine cost each way to fix them. A person decides. Nothing is ever sent.

Live site: <https://victorpflueger.github.io/PROC-data-quality/> (GitHub Pages, from `main`), version 2.1.0. GlobalCorp SE and all its data are fictional: no client data. You are interacting with an AI system.

Built by Victor Pflüger: [LinkedIn](https://www.linkedin.com/in/victorpflueger), [website](https://victorpflueger.github.io/VIP/index.html).

## What it shows

Bad purchasing data costs money, and nobody owns it. An order without its contract reference escapes compliance reporting; a buying profile with the wrong payment terms pays suppliers early. The demo shows an agent that turns a vague tip into a costed fix in five steps, with a person deciding twice.

## The five steps

| Step | What happens |
| --- | --- |
| The tip | One sentence from a colleague. It is all the agent gets. |
| 1 Spot | Fifteen rules scan the company's data and flag the records behind the tip. |
| 2 Check | The agent tests a cause, corrects itself when the data disagree and names who must act. In one case you review the values the AI suggests. |
| 3 Calculate | The engine works out what the case costs. |
| 4 Propose | Two or three fix paths next to doing nothing, each with its cost and effect. **Your decision.** |
| 5 Prepare | Follow-ups, a mock change request or a risk memo wait for **your approval**. Nothing is sent; the audit log downloads as JSON. |

## The four key figures

They sit top right and move as you step through. The engine computes them, never the AI.

| Figure | What it shows |
| --- | --- |
| Cost avoided | The financing cost the approved fix avoids a year; below it, what it avoids at once |
| Records fixed | The records the approved fix corrects, projected until a re-scan no longer finds them |
| Detection → decision | The time from the scan to your decision; below it, how long the oldest of these exceptions has waited |
| Session cost | What the run costs on Claude: measured in Live, estimated in a simulation |

## Presenting it

- **The guide.** *How it works* opens by itself once per tab. Its last chapter is the five-minute talk track, with the default case's figures filled in from the engine. `?guide=present` opens it on the talk track; `?guide=0` keeps it closed.
- **Moving.** Each step ends with a Next button that names where it leads; the arrow keys (or a presentation clicker), Back and Next in the bar, or a click on a step do the same. Each step shows at once; where a person decides, a *Your turn* line says what to do.
- **Deep links.** `?case=early-pay&step=4` opens a case on its decision. The cases: `early-pay` (the default, Paying too early), `punchout`, `unclassified`, `requester`, `onboarding` and `duplicate`.
- **The script.** [DEMO_SCRIPT.md](DEMO_SCRIPT.md) has what to say, step by step, and the questions that will come.

## Simulation and Live

**Start the agent** plays a scripted run of the agent through the real rules, engine and guardrails: free, offline and without a key. Session cost then shows what the same run would cost live (about €0.10 on Sonnet 5.5), estimated from the run's own prompts and replies at list price.

**Run it live** calls Claude from the browser with your own Anthropic API key. The key stays in this tab's session storage, goes only to api.anthropic.com and is checked first with a free call. A run stops by itself at 40 model calls or €3, and Session cost shows what it spent.

## Safety

- Only the rules find exceptions, and the engine computes every figure. The agent's words carry an AI tag, and a figure audit refuses any figure no tool returned.
- People decide: fix paths, AI-suggested values and every draft wait for a person. Approving a draft sends nothing: the page has no email or ERP connection.
- Nothing counts as fixed until a re-scan stops finding it; until then the page says *projected*.
- The page says that it is an AI system and labels what the AI wrote, as the EU AI Act's transparency duty asks.

## Run it yourself

The page is static, with no build step and no dependency. Serve the folder, for example with `python3 -m http.server`, and open `http://localhost:8000`. Opened straight from disk, the browser blocks its modules and the loading screen says what to do.

## Tests

`node tests/run-all.mjs` runs every suite. The browser suites need Playwright; [tests/README.md](tests/README.md) says how to install it and what each suite proves.

## Files

| Path | What it holds |
| --- | --- |
| `index.html`, `css/app.css` | The page: header with the key figures, step bar, stage, guide and the live dialog |
| `js/app.js`, `js/steps_view.js`, `js/kpis.js` | The presenter, what each step shows and the four key figures |
| `js/engine.js`, `js/history.js`, `js/fixpaths.js`, `js/figures.js` | The engine and the figure audit |
| `js/tools.js`, `js/agent.js`, `js/simulation.js` | The agent's seventeen tools and their guardrails, the live agent and the simulation player |
| `js/estimate.js` | The session-cost estimate of a simulated run |
| `data/` | The fictional world, the six cases, their frozen reference figures and their scripts |
| `tools/` | The world's builder and checker |
| `vici/` | Vici, Victor Pflüger's design system, release 1.0.0 |

## Documents

[DEMO_SCRIPT.md](DEMO_SCRIPT.md) is the five-minute demo. [DESIGN.md](DESIGN.md) explains the screen. [TECH_NOTES.md](TECH_NOTES.md) records the API facts, the engine's reading of the method, the agent's guardrails and the acceptance checklist. [DATA_SOURCES.md](DATA_SOURCES.md) says where every value comes from.
