// UI orchestrator, version 0.1: builds the header tiles, the control bar, the board, the console and
// the drawer, wires How it works, Diagnostics and Reset, and shows the data as the exception log
// stands. Runs (Simulation and Live), the honeycomb, options, outbox and audit arrive in version 0.2;
// their places on screen are here already, so the layout can be judged now.

import { getState, setState, subscribe } from "./state.js";
import { createBoard } from "./board.js";
import { createConsole } from "./console.js";
import { createKpis } from "./kpi.js";
import { createDrawer } from "./drawer.js";
import { createControls } from "./controls.js";
import { openDiagnostics } from "./diagnostics_view.js";
import { openIntro, introSeen } from "./intro.js";
import { logState } from "./history.js";
import { dayLabel } from "./format.js";
import { appToday } from "./clock.js";
import { h, withTooltip } from "./dom.js";
import { icon } from "./icons.js";
import { APP } from "./config.js";

export function initUI() {
  const scenarios = window.SCENARIOS || [];
  const world = window.WORLD;
  const byId = (id) => scenarios.find((s) => s.id === id);

  // ---- components ------------------------------------------------------------------------------
  const badge = document.getElementById("mode-badge");
  const board = createBoard(document.getElementById("board"));
  const consoleUI = createConsole(document.getElementById("console"));
  const kpis = createKpis(document.getElementById("kpis"));
  const drawer = createDrawer(document.getElementById("drawer"));
  drawer.panel("options").append(empty("Fix paths", "When the agent has verified a case, its two or three fix paths appear here next to doing nothing, each with the exceptions it closes, the spend it covers, the financing cost it avoids and its effort. You decide."));
  drawer.panel("outbox").append(empty("Draft. Nothing is sent.", "After your decision, the agent drafts the follow-ups to the people each exception is routed to and the change requests. Each draft waits for your approval; nothing leaves this page."));
  drawer.panel("audit").append(empty("Audit log", "Every event of a run lands here with the rule-set and engine versions, the reviewer, the decision and its time, and exports as JSON."));

  const controls = createControls(document.getElementById("controls"), scenarios, {
    onStart: () => {},
    onLiveScan: () => {},
    onSelectScenario: (id) => {
      setState({ scenarioId: id, entry: "scenario" });
      consoleUI.showEmpty(byId(id));
    },
    onSelectCustom: () => {},
    onSelectModel: (id) => setState({ model: id }),
    onSpeed: (n) => setState({ speed: n }),
    onAbort: () => {},
    onReset: () => resetWorkspace(),
    onDiagnostics: () => openDiagnostics()
  });

  // ---- intro window: "How it works" in the header, and once by itself on a first visit -----------
  const aboutBtn = h("button", {
    class: "vc-button vc-button--secondary about-btn", type: "button", id: "btn-about",
    title: `What the ${APP.name} does, how it works and where it would run with real data`
  }, icon("info", 18), h("span", { class: "btn-text" }, "How it works"));
  aboutBtn.addEventListener("click", () => openIntro());
  badge.after(withTooltip(aboutBtn, "How it works", { below: true }));

  // ---- state → view ----------------------------------------------------------------------------
  const render = (s) => {
    controls.update(s, { scenarioLabel: byId(s.scenarioId)?.title || "Choose" });
    badge.dataset.mode = s.mode || "none";
    badge.className = "vc-tag mode-badge";
    badge.replaceChildren("No run active");
    badge.title = "Agent runs arrive in version 0.2";
  };
  subscribe(render);
  render(getState());

  // ---- the data as the exception log stands -------------------------------------------------------
  function showData() {
    const st = logState(world, { day: 0 });
    kpis.show(st, "log");
    board.showCohorts(st.cohorts, st.closure_rate.value);
    const n = (rows) => rows.length.toLocaleString("en-GB");
    board.setAsOf(`Exception log as of ${dayLabel(0, appToday())} · ${n(world.po_lines)} order lines of the last 365 days, ${n(world.suppliers)} suppliers, ${n(world.materials)} materials, ${n(world.contracts)} contracts, ${n(world.users)} users`);
    return st;
  }
  showData();
  consoleUI.showEmpty(byId(getState().scenarioId));

  function resetWorkspace() {
    drawer.setOpen(false);
    setState({ scenarioId: getState().scenarioId, entry: "scenario" });
    consoleUI.rail.reset();
    consoleUI.showEmpty(byId(getState().scenarioId));
    showData();
  }

  return {
    introOnFirstVisit() {
      if (!introSeen()) openIntro();
    }
  };
}

function empty(title, text) {
  return h("div", { class: "vc-empty empty" }, h("strong", { class: "vc-empty__title" }, title), h("p", { class: "vc-empty__text" }, text));
}

/** A banner at the top of the page (info, warn or error), dismissible, optionally timed. */
export function showBanner({ level = "info", title = "", text = "", timeout = 0 } = {}) {
  const stack = document.getElementById("banners");
  if (!stack) return null;
  // A Vici alert in the tone of its level, with its icon and a dismiss button that names itself.
  const close = h("button", { class: "vc-icon-button", type: "button" }, icon("x", 18));
  const tone = level === "error" ? "vc-alert--danger" : level === "warn" ? "vc-alert--warning" : "";
  const el = h("div", { class: ["vc-alert", tone, "banner"], dataset: { level }, role: level === "error" ? "alert" : "status" },
    icon(level === "info" ? "info" : "alert", 22),
    h("div", { class: "vc-alert__body banner-text" }, title ? h("p", { class: "vc-alert__title" }, title) : null, h("p", {}, text)),
    withTooltip(close, "Dismiss", { below: true }));
  close.addEventListener("click", () => el.remove());
  stack.appendChild(el);
  if (timeout) setTimeout(() => el.remove(), timeout);
  return el;
}
