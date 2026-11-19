// Intro window: what the Data Quality Agent does, how it works, why it pays off and where each piece
// would run with real data (the production path, decision D7). It opens by itself on a visitor's
// first visit (remembered in this browser's local storage) and any time from "How it works".

import { h } from "./dom.js";
import { icon } from "./icons.js";
import { openModal } from "./modal.js";
import { STORAGE } from "./config.js";

// The five steps are the progress rail's above the console, on Vici's stepper.
const STEPS = [
  { tone: "spot", title: "Spot", text: "Runs fifteen rules over order lines, contracts, supplier and material records." },
  { tone: "check", title: "Check", text: "Reads the records behind the findings and finds the root cause that makes them one case." },
  { tone: "calculate", title: "Calculate", text: "Lets the engine work out spend, financing cost, who must act and what each fix costs." },
  { tone: "propose", title: "Propose", text: "Offers two or three costed fix paths next to doing nothing. You decide." },
  { tone: "prepare", title: "Prepare", text: "Drafts the follow-ups and change requests for your approval. Nothing is sent." }
];

const VALUE = [
  { title: "Which records, and who acts", text: "Every finding names its rule, its records and the person each one is routed to." },
  { title: "Every figure checked", text: "Counts and amounts come from a deterministic engine, and the agent's texts are checked against them." },
  { title: "Closure is measured", text: "An exception counts as closed only when a re-scan no longer finds it." }
];

// The production path: where each piece would run with real data.
const PATH = [
  { name: "SAP S/4HANA or Ariba", role: "Orders, requisitions, contracts and supplier data" },
  { name: "Microsoft Fabric", role: "The data platform where the rules run" },
  { name: "Azure OpenAI and Copilot Studio", role: "The agent" },
  { name: "Power BI", role: "Reporting" },
  { name: "Power Automate and Teams", role: "Alerts, approvals and tasks" },
  { name: "SAP", role: "Carries out what people approved" }
];

/** True once this browser has seen the intro (closed it at least once). */
export function introSeen() {
  try { return localStorage.getItem(STORAGE.introSeen) === "1"; } catch { return false; }
}

function markIntroSeen() {
  try { localStorage.setItem(STORAGE.introSeen, "1"); } catch { /* storage blocked: it opens again next time */ }
}

/** The production path as a row of steps, each with what it does. */
export function productionPath() {
  return h("ol", { class: "prod-path", "aria-label": "Production path" }, PATH.map((p, i) =>
    h("li", { class: "prod-step" },
      h("span", { class: "prod-hex", "aria-hidden": "true" }, String(i + 1)),
      h("strong", { class: "prod-name" }, p.name),
      h("span", { class: "prod-role" }, p.role))));
}

/** Opens the intro window. Resolves when it closes. */
export function openIntro() {
  return new Promise((resolve) => {
    let modal;
    const steps = h("ol", { class: "vc-stepper intro-steps" }, STEPS.map((s, i) =>
      h("li", { class: "vc-step intro-step", dataset: { tone: s.tone } },
        h("span", { class: "vc-step__marker intro-num", "aria-hidden": "true" }, String(i + 1)),
        h("strong", { class: "vc-step__label intro-step-title" }, s.title),
        h("span", { class: "vc-step__hint intro-step-text" }, s.text))));
    const value = h("ul", { class: "intro-value" }, VALUE.map((v) => h("li", {}, h("strong", {}, v.title), h("span", {}, v.text))));
    modal = openModal({
      title: "How the Data Quality Agent works",
      intro: "The Data Quality Agent watches procurement data. Rules find the records that miss something or contradict each other; the agent finds the root cause, costs the ways to fix it and drafts the follow-ups, and you decide.",
      className: "intro-modal",
      size: "intro",
      body: [
        h("h3", {}, "How it works"),
        steps,
        h("h3", {}, "Why it pays off"),
        value,
        h("h3", {}, "With real data"),
        h("p", { class: "intro-path-lead" }, "This page stands in for the whole path. With real data, each piece would run here:"),
        productionPath(),
        h("p", { class: "intro-note" }, "GlobalCorp SE, its suppliers, people, orders and figures are fictional: no client data.")
      ],
      footer: [
        h("span", { class: "dialog-note" }, "Agent runs arrive in version 0.2. Diagnostics checks the data and the rules today."),
        h("button", { class: "vc-button", type: "button", autofocus: true, on: { click: () => modal.close(null) } }, icon("check", 18), "Close")
      ],
      onClose: () => { markIntroSeen(); resolve(null); }
    });
  });
}
