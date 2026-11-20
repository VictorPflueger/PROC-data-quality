// UI orchestrator: builds the components, wires controls and dialogs, starts run producers (the
// simulation player or the live agent) and translates run events into drawer and state changes. The
// board, the tiles, the console, the review, options and outbox follow the run events themselves; the
// UI never branches on which producer is running, and only the mode badge reads the mode.

import { bus, newRunId } from "./events.js";
import { getState, setState, subscribe, isRunning, isFinished } from "./state.js";
import { createBoard } from "./board.js";
import { createConsole } from "./console.js";
import { createKpis } from "./kpi.js";
import { createDrawer } from "./drawer.js";
import { createOptionsPanel } from "./options_panel.js";
import { createOutbox } from "./outbox.js";
import { createReview } from "./review.js";
import { createAuditPanel } from "./audit_panel.js";
import { resetAudit } from "./audit.js";
import { createControls } from "./controls.js";
import { chooseMode, askApiKey, askCustomScenario, showReport } from "./dialogs.js";
import { openDiagnostics } from "./diagnostics_view.js";
import { openMethod, paramText } from "./method.js";
import { openIntro, introSeen } from "./intro.js";
import { createSimulationPlayer } from "./simulation.js";
import { createLiveAgent } from "./agent.js";
import { hasKey, forgetKey } from "./keystore.js";
import { logState } from "./history.js";
import { dayLabel } from "./format.js";
import { appToday } from "./clock.js";
import { MODELS } from "./config.js";
import { PARAMS } from "./params.js";
import { liveParams, changedParams } from "./settings.js";
import { h, withTooltip, prefersReducedMotion } from "./dom.js";
import { icon } from "./icons.js";

const modelLabel = (id) => MODELS.find((m) => m.id === id)?.label || id || null;
const SWEEP_TITLE = "Live sweep: every rule scanned, the first case investigated";

export function initUI() {
  const scenarios = window.SCENARIOS || [];
  const world = window.WORLD;
  const byId = (id) => scenarios.find((s) => s.id === id);
  setState({ keyPresent: hasKey() });

  // ---- components ------------------------------------------------------------------------------
  const badge = document.getElementById("mode-badge");
  const board = createBoard(document.getElementById("board"), { world });
  const consoleUI = createConsole(document.getElementById("console"), {
    onOpenOptions: () => drawer.show("options"),
    onOpenOutbox: () => drawer.show("outbox"),
    onOpenReview: () => review.open(),
    onOpenReport: (md) => showReport(md, { mode: getState().mode, simSource: getState().simSource }),
    onSaveSimulation: async () => {
      const r = await auditPanel.saveSimulation();
      showBanner({ level: r.ok && r.ready ? "info" : "warn", title: r.ok ? (r.ready ? "Run saved as simulation" : "Run saved for curation") : "Could not save the run", text: r.message, timeout: r.ok ? 12000 : 0 });
    }
  });
  const kpis = createKpis(document.getElementById("kpis"));
  const drawer = createDrawer(document.getElementById("drawer"));
  const optionsPanel = createOptionsPanel(drawer.panel("options"), {
    onDecision: (d) => {
      if (!isRunning(getState())) return notice("warn", "This run has ended. Start a new run to take a decision.");
      bus.emit("option_decision", { ...d, by: "user" });
    },
    onCount: (n, attention) => drawer.setCount("options", n, attention)
  });
  const outbox = createOutbox(drawer.panel("outbox"), {
    onDecision: (d) => {
      if (!isRunning(getState())) return notice("warn", "This run has ended. Start a new run to approve drafts.");
      bus.emit("action_decision", { ...d, by: "user" });
    },
    onCount: (n, attention) => drawer.setCount("outbox", n, attention)
  });
  const review = createReview({
    onDecision: (d) => {
      if (!isRunning(getState())) return notice("warn", "This run has ended. Start a new run to review suggestions.");
      bus.emit("confirmation_decision", { ...d, by: "user" });
    }
  });
  const auditPanel = createAuditPanel(drawer.panel("audit"), { onCount: (n) => drawer.setCount("audit", n), getExceptions: () => board.snapshot() });
  const player = createSimulationPlayer({ getSpeed: () => getState().speed });
  const agent = createLiveAgent({
    onKeyRejected: () => {
      forgetKey();
      setState({ keyPresent: false });
    }
  });

  const controls = createControls(document.getElementById("controls"), scenarios, {
    onStart: () => start(getState().entry === "custom" ? "custom" : "scenario"),
    onLiveScan: () => start("sweep"),
    onSelectScenario: (id) => {
      setState({ scenarioId: id, entry: "scenario" });
      if (!isRunning(getState()) && !isFinished(getState())) consoleUI.showEmpty(byId(id));
    },
    onSelectCustom: async () => {
      const text = await askCustomScenario(getState().customText);
      if (!text) return;
      setState({ entry: "custom", customText: text });
      if (!isRunning(getState()) && !isFinished(getState())) consoleUI.showEmpty(null, { custom: text });
    },
    onSelectModel: (id) => setState({ model: id }),
    onSpeed: (n) => setState({ speed: n }),
    onAbort: () => abort("Stopped by the user."),
    onReset: () => resetWorkspace(),
    onMethod: () => openMethod({ running: isRunning(getState()) }),
    onDiagnostics: () => openDiagnostics()
  });

  // ---- intro window: "How it works" in the header, and once by itself on a first visit -----------
  const aboutBtn = h("button", {
    class: "vc-button vc-button--secondary about-btn", type: "button", id: "btn-about",
    title: "What the Data Quality Agent does, how it works and where it would run with real data"
  }, icon("info", 18), h("span", { class: "btn-text" }, "How it works"));
  aboutBtn.addEventListener("click", () => showIntro());
  badge.after(withTooltip(aboutBtn, "How it works", { below: true }));

  function showIntro() {
    const s = getState();
    // During a run the window only explains; it never starts or interrupts anything.
    if (isRunning(s)) return openIntro({});
    return openIntro({
      startLabel: isFinished(s) ? "New run" : "Start agent",
      onStart: () => start(getState().entry === "custom" ? "custom" : "scenario")
    });
  }

  // ---- state → view ----------------------------------------------------------------------------
  const render = (s) => {
    const scenario = byId(s.scenarioId);
    controls.update(s, { scenarioLabel: scenario ? `${scenario.n}. ${scenario.title}` : "Choose", scenarioShort: scenario ? `Scenario ${scenario.n}` : "Choose" });
    badge.dataset.mode = s.mode || "none";
    // A Vici tag: LIVE solid merlot with a pulsing hexagon, SIMULATION on its neutral tape.
    badge.className = s.mode === "live" ? "vc-tag vc-tag--solid mode-badge" : "vc-tag mode-badge";
    badge.replaceChildren(...(s.mode === "live"
      ? [h("span", { class: "mode-dot", "aria-hidden": "true" }), "LIVE"]
      : s.mode === "simulation" ? ["SIMULATION"] : ["No run active"]));
    badge.title = s.mode === "live" ? "Live agent: real model calls on your API key"
      : s.mode === "simulation" ? "Simulation: scripted replay, not live data" : "Choose a mode with Start agent";
  };
  subscribe(render);
  render(getState());

  // ---- run events → UI effects --------------------------------------------------------------------
  bus.on("state_change", (ev) => setState({ runState: ev.payload.state }));
  bus.on("run_end", (ev) => {
    const st = ev.payload.status;
    setState({ runState: st === "done" || st === "no_findings" ? "done" : st === "incomplete" ? "stopped" : st });
  });
  bus.on("options", () => showDrawer("options"));
  bus.on("action_draft", () => showDrawer("outbox"));

  // The run switches the drawer's tab by itself (options, then drafts). A keyboard user whose focus was
  // in the panel that closes is not left on the page's body: the focus moves to the first decision of
  // the panel that opens, or to its tab.
  function showDrawer(tab) {
    const before = document.activeElement;
    const inDrawer = !!before && before !== document.body && document.getElementById("drawer").contains(before);
    const switched = !document.getElementById(`tab-${tab}`)?.matches('[aria-selected="true"]');
    drawer.show(tab);
    const body = document.querySelector("#drawer .drawer-body");
    if (switched && body) body.scrollTop = 0;
    if (inDrawer && (!before.isConnected || !before.getClientRects().length)) {
      const panel = document.getElementById(`panel-${tab}`);
      const target = panel?.querySelector('[data-action="approve"]:not([aria-disabled="true"])') || document.getElementById(`tab-${tab}`);
      target?.focus();
    }
    // New fix paths: the recommended card's Approve is brought into the drawer's view (on a laptop the
    // cards are taller than the drawer), once the drawer has opened.
    if (tab === "options") {
      setTimeout(() => {
        const actions = document.querySelector('#panel-options .option-card[data-recommended="true"] .option-actions');
        if (actions && body) {
          const a = actions.getBoundingClientRect();
          const b = body.getBoundingClientRect();
          if (a.bottom > b.bottom || a.top < b.top) body.scrollTop += a.bottom - b.bottom + 8;
        }
      }, prefersReducedMotion() ? 0 : 280);
    }
  }
  // The person's turn, two Tabs from the top of the page (review finding R15): while options or drafts
  // wait, a second skip link leads to the recommended option's Approve or the first pending draft's.
  const skipTurn = document.getElementById("skip-turn");
  function turnTarget() {
    const open = (sel) => [...document.querySelectorAll(sel)].find((b) => b.getAttribute("aria-disabled") !== "true" && !b.disabled);
    const option = open('#panel-options .option-card[data-recommended="true"][data-status=""] [data-action="approve"]')
      || open('#panel-options .option-card[data-status=""] [data-action="approve"]');
    if (option) return { tab: "options", el: option, label: "Skip to your decision" };
    const draft = open('#panel-outbox .action-card[data-status="pending"] [data-action="approve"]');
    if (draft) return { tab: "outbox", el: draft, label: "Skip to your approval" };
    return null;
  }
  function updateSkipTurn() {
    if (!skipTurn) return;
    const target = turnTarget();
    if (!target && document.activeElement === skipTurn) skipTurn.blur();
    skipTurn.hidden = !target;
    if (target) skipTurn.textContent = target.label;
  }
  skipTurn?.addEventListener("click", (e) => {
    e.preventDefault();
    const target = turnTarget();
    if (!target) return;
    showDrawer(target.tab);
    requestAnimationFrame(() => (turnTarget()?.el || target.el).focus());
  });
  // The panels render on the same events; the link follows once they have.
  for (const type of ["run_start", "options", "option_decision", "action_draft", "action_decision", "state_change", "run_end"]) {
    bus.on(type, () => setTimeout(updateSkipTurn, 0));
  }

  // A tab the person opens starts at its top: the drawer keeps one scroll position for all its tabs.
  for (const t of document.querySelectorAll('#drawer [role="tab"]')) {
    t.addEventListener("click", () => { const body = document.querySelector("#drawer .drawer-body"); if (body) body.scrollTop = 0; });
  }

  // ---- the data as the exception log stands ---------------------------------------------------------
  function showData() {
    const st = logState(world, { day: 0 });
    kpis.show(st, "log");
    board.showCohorts(st.cohorts, st.closure_rate.value);
    const n = (rows) => rows.length.toLocaleString("en-GB");
    board.setAsOf(`Exception log as of ${dayLabel(0, appToday())} · ${n(world.po_lines)} order lines of the last 365 days, ${n(world.suppliers)} suppliers, ${n(world.materials)} materials, ${n(world.contracts)} contracts, ${n(world.users)} users`);
  }

  // ---- run control ---------------------------------------------------------------------------------
  async function start(entry) {
    if (isRunning(getState())) return;
    // A finished run stays on screen until the next run really begins: cancelling the mode or key
    // dialog must not wipe a console, outbox or audit trail that may not be exported yet.
    const scenario = byId(getState().scenarioId);
    const runLabel = entry === "sweep" ? SWEEP_TITLE
      : entry === "custom" ? `Custom what-if: ${getState().customText}`
        : `Scenario ${scenario?.n}: ${scenario?.title}`;

    let mode = "live";
    if (entry !== "sweep") {
      mode = await chooseMode({
        runLabel,
        simBlocked: entry === "custom" ? "Custom what-ifs need the live agent: free text has no scripted replay." : null
      });
      if (!mode) return;
    }
    if (mode === "key") {
      // "Change or forget key": the key dialog shows the stored key masked, with Forget key.
      const ok = await askApiKey({});
      setState({ keyPresent: hasKey() });
      if (!ok) return;
      mode = "live";
    }
    if (mode === "live" && !hasKey()) {
      const ok = await askApiKey({});
      setState({ keyPresent: hasKey() });
      if (!ok) return;
    }
    begin(mode, entry, scenario);
  }

  function begin(mode, entry, scenario) {
    const s = getState();
    const run_id = newRunId();
    const model = MODELS.find((m) => m.id === s.model) || MODELS[0];
    resetWorkspace({ keepMode: true, silent: true });
    setState({ mode, runState: "scanning", runId: run_id });
    bus.beginRun({ run_id, mode });
    const title = entry === "sweep" ? "Live sweep" : entry === "custom" ? "Custom what-if" : `Scenario ${scenario.n}: ${scenario.title}`;
    const tip = entry === "scenario" ? scenario.tip : entry === "custom" ? s.customText : "";
    const def = mode === "simulation" ? window.SIM_RUNS?.[scenario?.id] : null;
    const recorded = def?.source === "recorded";
    setState({ simSource: mode === "simulation" ? (recorded ? "recorded" : "authored") : null });
    // The parameters in effect: this tab's changes for Live, the defaults for Simulation (TECH_NOTES §7).
    const params = mode === "live" ? liveParams() : PARAMS;
    const changed = mode === "live" ? changedParams() : [];
    bus.emit("run_start", {
      run_id, mode, entry, title,
      scenario_id: entry === "scenario" ? scenario.id : null,
      tip: tip || null,
      params: { ...params }, params_changed: changed,
      model: mode === "live" ? model.id : null,
      model_label: mode === "live" ? model.label : null,
      ...(mode === "simulation" ? {
        sim_source: recorded ? "recorded" : "authored",
        ...(recorded ? { recorded_on: recordedOn(def.recorded?.at), recorded_model: modelLabel(def.recorded?.model) } : {})
      } : {})
    });

    if (changed.length) {
      bus.emit("notice", { level: "info", text: `Parameters changed in the Method dialog apply to this run: ${changed.map((c) => `${c.label} ${paramText(c.name, c.value)} (default ${paramText(c.name, c.default)})`).join("; ")}.` });
    } else if (mode === "simulation" && changedParams().length) {
      bus.emit("notice", { level: "info", text: "Simulation runs on the method's default parameters, so the scripted run stays valid; your changes in the Method dialog apply to Live runs." });
    }
    if (mode === "simulation") {
      if (!def) {
        bus.emit("notice", { level: "error", text: `No simulation script found for “${scenario?.title}”. Check that data/sim_runs.js is complete, or run Diagnostics.` });
        bus.emit("state_change", { state: "error" });
        bus.emit("run_end", { status: "error", reason: "No simulation script for this scenario." });
        return;
      }
      player.play(def, { scenario: scenario.id });
      return;
    }
    agent.run({ entry, tip, modelId: model.id, params });
  }

  function abort(reason) {
    if (player.isActive()) player.abort(reason);
    if (agent.isActive()) agent.abort(reason);
  }

  function resetWorkspace({ keepMode = false, silent = false } = {}) {
    if (player.isActive()) player.abort("Reset by the user.");
    if (agent.isActive()) agent.abort("Reset by the user.");
    bus.endRun();
    review.reset();
    board.reset();
    kpis.reset();
    optionsPanel.reset();
    outbox.reset();
    resetAudit();
    auditPanel.refresh();
    drawer.setOpen(false);
    showData();
    setState({ runState: "idle", runId: null, ...(keepMode ? {} : { mode: null, simSource: null }) });
    if (!silent) {
      const s = getState();
      if (s.entry === "custom" && s.customText) consoleUI.showEmpty(null, { custom: s.customText });
      else consoleUI.showEmpty(byId(s.scenarioId));
    } else consoleUI.reset(false);
  }

  function notice(level, text) {
    showBanner({ level, title: level === "warn" ? "Heads-up" : "Note", text, timeout: 6000 });
  }

  showData();
  consoleUI.showEmpty(byId(getState().scenarioId));

  /** Opens the intro once per browser: called by main.js after the boot screen is gone. */
  function introOnFirstVisit() {
    if (!introSeen() && !document.querySelector("dialog[open]")) showIntro();
  }

  return { board, start, resetWorkspace, showIntro, introOnFirstVisit };
}

/** "Thu 19 Nov 2026": the day a script was recorded. */
function recordedOn(iso) {
  const d = new Date(iso || "");
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).replace(/,/g, "");
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
