// Agent console, version 0.1: the progress rail with the agent's five steps (Spot, Check, Calculate,
// Propose, Prepare) and the three human steps, and the logbook, empty until runs arrive in version
// 0.2. Choosing a scenario shows its tip: the unverified first hint the agent starts from.

import { h, clear } from "./dom.js";
import { icon } from "./icons.js";
import { createProgressRail } from "./progress.js";
import { STORAGE } from "./config.js";

export function createConsole(panel) {
  const sizeBtn = h("button", { class: "vc-button vc-button--ghost button-compact text-size", type: "button", "aria-pressed": "false", title: "Larger console text for projectors" }, "Larger text");
  const applySize = (large) => {
    panel.dataset.text = large ? "large" : "standard";
    sizeBtn.setAttribute("aria-pressed", String(large));
  };
  sizeBtn.addEventListener("click", () => {
    const large = panel.dataset.text !== "large";
    applySize(large);
    try { localStorage.setItem(STORAGE.consoleText, large ? "large" : "standard"); } catch { /* storage unavailable */ }
  });
  try { applySize(localStorage.getItem(STORAGE.consoleText) === "large"); } catch { applySize(false); }

  const log = h("div", { class: "log", role: "log", "aria-live": "polite", "aria-relevant": "additions" });
  const rail = createProgressRail();
  rail.reset();
  panel.append(
    h("div", { class: "console-head" },
      h("div", { class: "console-title" }, h("h2", {}, "Agent console"), h("span", { class: "count vc-tabular" }, "")),
      h("div", { class: "console-head-actions" }, sizeBtn)),
    rail.el,
    log
  );

  function showEmpty(scenario) {
    clear(log);
    log.appendChild(h("div", { class: "log-empty" },
      h("h3", {}, "The agent's plan"),
      h("p", {}, "Five steps above: it scans the fifteen rules, reads the records behind the findings and finds the root cause that makes them one case, lets the engine cost two or three fix paths next to doing nothing, waits for your decision, then drafts the follow-ups and change requests."),
      h("p", {}, "When it needs you, the step turns merlot: your confirmation of AI-suggested values, your decision on a fix path, your approval of each draft. Nothing is sent, and nothing is written to the data."),
      scenario ? h("div", { class: "tip-preview", dataset: { scenario: scenario.id } },
        h("p", { class: "tip-label" }, icon("info", 16), `Scenario ${scenario.n}: ${scenario.title}`),
        h("p", { class: "tip-text" }, `“${scenario.tip}”`),
        h("p", { class: "tip-note" }, "An unverified tip, as a first hint arrives. In Live mode it is all the agent gets.")) : null,
      h("p", { class: "log-version" }, "Agent runs, in Simulation and with your own API key, arrive in version 0.2.")));
  }

  return { showEmpty, rail };
}
