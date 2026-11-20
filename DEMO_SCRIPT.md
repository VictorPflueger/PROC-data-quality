# Demo script: five minutes

The default case, *Paying too early*, in Simulation. Every figure below is the engine's for that case, and the guide's talk track quotes the same ones from the page itself.

## Before you start

- Open the live site in a fresh tab, full screen, at 1920 × 1080 or 1280 × 720. *How it works* opens by itself; `?guide=present` opens it straight on the talk track.
- Leave the guide with **Start**: you are on the tip. Every step ends with a Next button that names where it leads; the clicker or the right arrow does the same. Check the clicker once.
- For a live run, have an Anthropic API key with a low spend limit ready. Rehearse in Simulation first: it needs no key and works offline.

## The five minutes

| Time | Step | Say | Do and watch |
| --- | --- | --- | --- |
| 0.5 min | The tip | "Treasury thinks we pay Birmingham's suppliers too early. That one sentence is all the agent gets." | Click **Start the agent** or press the right arrow. |
| 1 min | Spot | "Two of fifteen rules flag 23 order lines worth €475,350. The oldest flag has waited 62 days without a decision." | Point at the honeycomb, then at *Detection → decision*, top right: the clock runs. |
| 1 min | Check | "The agent suspects one supplier, tests it and corrects itself: one shared buying profile created all 23." | The chain shows Hypothesis, Checked and Revised. The case card names the two buyers who must act. |
| 0.5 min | Calculate | "Paying early cost €3,482 last year. Leave it, and it costs about €10,293 a year." | *Cost avoided* still reads €0, with €10,293 a year at stake below it. |
| 1 min | Propose | "You decide, not the AI. Path C corrects the 23 lines and fixes the profile for €4,315." | Approve **C**. *Cost avoided* goes to €10,293 a year and €1,374 at once, *Records fixed* to 23 of 23, and the clock stops. |
| 1 min | Prepare | "Two drafts wait for approval, and nothing is ever sent. Run live, this would cost about €0.10." | Approve both drafts; the report appears. Point at *Session cost*. |

## If something goes wrong

- **A wrong click.** Reject leaves the path on screen as rejected; approve another. To start over, go back to the tip and click **Start again**.
- **Lost on the way.** `?case=early-pay&step=4` opens the case on its decision, `step=5` on the drafts.
- **Live fails** (network, key or limit). Say so, go back to the tip and click **Start the agent**: the simulation runs the same tools offline.
- **A small projector.** The page fits 1280 × 720. Lower the resolution rather than zoom in.

## Questions that will come

**Is this real data?** No. GlobalCorp SE and everything in it are invented. The rules, the cost of early payment and the SAP tables the data stand in for are real; DATA_SOURCES.md has the sources.

**Where do the figures come from?** From a rule engine that the agent calls as a tool. The AI explains and proposes; a figure audit refuses any figure in its words that no tool returned.

**What does fixing a paid order save?** Nothing: the €3,482 is spent. Correcting the lines avoids €1,374 on invoices not yet paid, and fixing the buying profile stops about €10,293 a year.

**What happens to the drafts?** Nothing is sent. With real data they would go to Teams, Outlook or an SAP change request after the same approval. The audit log records every decision.

**What does a run cost?** About €0.10 in Claude tokens on Sonnet 5.5, shown in *Session cost*. A live run stops by itself at 40 model calls or €3.

## After the demo

- Send the link with `?guide=present`: the talk track lets the audience replay it alone.
- Show a second case if there is time: `?case=unclassified` adds the review of AI-suggested values.
- Download the audit log in Prepare when someone asks what is recorded.
