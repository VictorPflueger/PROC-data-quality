// The presenter: the step bar, the stage and the four key figures, driven by the run events of
// whichever producer runs (the simulation player or the live agent). A presenter moves through the
// tip and the five steps by click, the arrow keys or ?step=; each step shows at once. A simulation goes
// as far as it can at once and waits where a person decides; a live run fills the steps as it goes and
// the page follows it, unless the presenter has gone back to an earlier step.

import { bus, newRunId } from "./events.js";
import { emptyRun, applyEvent, STEPS, approved } from "./run_model.js";
import { renderStep } from "./steps_view.js";
import { createKpis } from "./kpis.js";
import { createSimulationPlayer } from "./simulation.js";
import { createLiveAgent } from "./agent.js";
import { createEstimator } from "./estimate.js";
import { buildSystemPrompt, buildOpeningMessage } from "./prompt.js";
import { createToolbox, toolDefinitions } from "./tools.js";
import { createHumanQueue } from "./human.js";
import { runScript } from "./sim_script.js";
import { resetAudit, buildAuditExport, auditFileName } from "./audit.js";
import { downloadText, h } from "./dom.js";
import { euro, euroCents, int } from "./format.js";
import { leadFacts } from "./facts.js";
import { plainText } from "./plain.js";
import { MODELS, DEFAULT_MODEL, UI } from "./config.js";
import { PARAMS } from "./params.js";
import { appToday } from "./clock.js";
import { openLiveDialog } from "./live_dialog.js";
import { forgetKey } from "./keystore.js";

const slugOf = (id) => id.replace(/^SC-/, "").toLowerCase();
const longDate = () => appToday().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export function initApp() {
  const world = window.WORLD;
  const scenarios = window.SCENARIOS || [];
  const byId = (id) => scenarios.find((s) => s.id === id);
  const params = new URLSearchParams(location.search);
  const fromSlug = (slug) => scenarios.find((s) => slugOf(s.id) === String(slug || "").toLowerCase())?.id || null;

  const stage = document.getElementById("stage");
  const stepsEl = document.getElementById("steps");
  const back = document.getElementById("btn-back");
  const next = document.getElementById("btn-next");
  const stop = document.getElementById("btn-stop");
  const modeTag = document.getElementById("mode-tag");
  const kpis = createKpis(document.querySelector(".kpis"));
  const player = createSimulationPlayer();
  const agent = createLiveAgent({ onKeyRejected: () => forgetKey() });

  const state = {
    scenarioId: fromSlug(params.get("case")) || UI.defaultScenario,
    step: 0,
    following: true,
    run: emptyRun(),
    estimator: null,
    estimate: null,
    scanWall: null,
    decisionWall: null,
    deepLink: null,
    modelId: DEFAULT_MODEL,
    ui: { reason: "", review: null, open: new Set() }
  };

  // ---- the step bar ---------------------------------------------------------------------------------
  const stepButtons = STEPS.map((s) => {
    const hint = h("span", { class: "vc-step__hint" });
    const b = h("button", { type: "button", class: "vc-step__button", dataset: { step: String(s.n) }, on: { click: () => go(s.n) } },
      h("span", { class: "vc-step__marker", "aria-hidden": "true" }, String(s.n)),
      h("span", { class: "vc-step__label" }, s.name, hint));
    const li = h("li", { class: "vc-step", dataset: { step: s.id } }, b);
    stepsEl.append(li);
    return { li, b, hint };
  });

  const maxStep = () => (state.run.status === "idle" ? 0 : Math.max(1, state.run.reached));

  function renderStepBar() {
    const run = state.run;
    const max = maxStep();
    stepButtons.forEach(({ li, b, hint }, n) => {
      const current = n === state.step;
      const done = n < state.step && n <= max;
      li.classList.toggle("vc-step--current", current);
      li.classList.toggle("vc-step--done", done);
      if (current) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
      b.disabled = n > max;
      let turn = "";
      if (n === 2 && run.waiting === "review") turn = "Your review";
      if (n === 4 && run.waiting === "decision") turn = "Your decision";
      if (n === 5 && run.waiting === "approvals") turn = "Your approval";
      li.dataset.turn = turn ? "yours" : "";
      hint.textContent = turn || (n === 0 ? (run.status === "idle" ? "start here" : "") : n <= max && run.status !== "idle" ? stepHint(n) : "");
    });
    back.disabled = state.step === 0;
    const canNext = state.step < max;
    next.replaceChildren("Next", h("span", { class: "vc-icon vc-icon--chevron-right", "aria-hidden": "true" }));
    // On the tip the stage's Start button is the one primary action; Next starts the run too.
    next.classList.toggle("vc-button--secondary", state.step === 0);
    next.disabled = !(canNext || (state.step === 0 && run.status === "idle"));
    next.title = !canNext && state.step === 4 && run.waiting === "decision" ? "Decide first" : "";
    stop.hidden = !(run.mode === "live" && run.status === "running");
    modeTag.hidden = run.status === "idle";
    modeTag.dataset.mode = run.mode || "";
    modeTag.textContent = run.mode === "live" ? "LIVE" : "SIMULATION";
    modeTag.title = run.mode === "live" ? `Live agent on your API key${run.model ? `, ${run.model}` : ""}` : "A scripted run through the real rules and engine: not live, no model calls";
  }

  function stepHint(n) {
    const run = state.run;
    if (n === 1) return run.scans.length ? "scanned" : "";
    if (n === 2) return run.alert ? "case found" : "";
    if (n === 3) return run.items.some((x) => x.name === "dq_fix_paths" && x.ok) ? "costed" : "";
    if (n === 4) return approved(run) ? "decided" : "";
    if (n === 5) return run.report ? "done" : "";
    return "";
  }

  // ---- rendering --------------------------------------------------------------------------------------
  let frame = 0;
  function scheduleRender() {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; render(); });
  }

  const ctx = {
    world, scenarios, ui: state.ui,
    get scenario() { return byId(state.scenarioId) || scenarios[0]; },
    handlers: {
      onStart: (mode) => start(mode),
      onCase: (id) => chooseCase(id),
      onDecide: (optionId, decision, note) => decide(optionId, decision, note),
      onDraft: (actionId, decision) => bus.emit("action_decision", { action_id: actionId, decision, by: "user" }),
      onReview: (reviewId, decisions) => bus.emit("confirmation_decision", { review_id: reviewId, decisions, by: "user" }),
      onRerender: () => render(),
      onDownloadAudit: () => downloadText(auditFileName(), buildAuditExport()),
      onRestart: () => (state.run.mode === "live" ? reset(0) : start("simulation"))
    }
  };

  let lastStep = -1;
  function render() {
    renderStepBar();
    // Keep focus, open drafts and scroll positions across a re-render of the same step.
    const active = document.activeElement;
    const focusKey = active && stage.contains(active) ? keyOf(active) : null;
    const sameStep = lastStep === state.step;
    const scrolls = sameStep ? [...stage.querySelectorAll(".panel, .drafts")].map((el) => el.scrollTop) : [];
    const open = new Set([...stage.querySelectorAll("details[open]")].map((d) => d.closest("[data-id]")?.dataset.id).filter(Boolean));
    renderStep(stage, state.step, state.run, ctx);
    for (const d of stage.querySelectorAll("details")) {
      const id = d.closest("[data-id]")?.dataset.id;
      if (id && (open.has(id) || state.ui.open.has(id))) d.open = true;
      d.addEventListener("toggle", () => { if (!id) return; if (d.open) state.ui.open.add(id); else state.ui.open.delete(id); });
    }
    if (sameStep) [...stage.querySelectorAll(".panel, .drafts")].forEach((el, i) => { if (scrolls[i]) el.scrollTop = scrolls[i]; });
    if (focusKey) {
      const target = findByKey(focusKey);
      if (target && !target.disabled) target.focus({ preventScroll: true });
      else if (target || !stage.contains(document.activeElement)) stage.focus({ preventScroll: true });
    }
    lastStep = state.step;
    renderKpis();
  }

  const keyOf = (el) => el.id ? `#${el.id}` : el.dataset.action ? `${el.closest("[data-path],[data-id],[data-line]")?.dataset.path || el.closest("[data-id]")?.dataset.id || el.closest("[data-line]")?.dataset.line || ""}|${el.dataset.action}` : null;
  const findByKey = (key) => {
    if (key.startsWith("#")) return document.getElementById(key.slice(1));
    const [where, action] = key.split("|");
    return [...stage.querySelectorAll(`[data-action="${action}"]`)].find((b) => {
      const box = b.closest("[data-path],[data-id],[data-line]");
      return box && (box.dataset.path === where || box.dataset.id === where || box.dataset.line === where);
    }) || null;
  };

  function renderKpis() {
    kpis.render(state.run, { world, estimate: state.estimate, scanWall: state.scanWall, decisionWall: state.decisionWall, now: performance.now() });
  }
  // The detection → decision clock ticks while the run waits for a decision.
  setInterval(() => { if (state.scanWall !== null && state.decisionWall === null && state.run.status === "running") renderKpis(); }, 1000);

  // ---- navigation -------------------------------------------------------------------------------------
  function go(n, { focus = true } = {}) {
    if (state.run.status === "idle" && n > 0) { start("simulation", n); return; }
    const target = Math.max(0, Math.min(maxStep(), n));
    state.step = target;
    state.following = target >= state.run.reached;
    syncUrl();
    render();
    if (focus) document.getElementById("step-title")?.setAttribute("tabindex", "-1");
    if (focus) (document.getElementById("step-title") || stage).focus({ preventScroll: true });
  }
  back.addEventListener("click", () => go(state.step - 1));
  next.addEventListener("click", () => (state.step === 0 && state.run.status === "idle" ? start("simulation") : go(state.step + 1)));
  stop.addEventListener("click", () => agent.abort("Stopped by the presenter."));
  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (document.querySelector("dialog[open]")) return;
    const t = e.target;
    if (t && (t.closest("input, textarea, select, [contenteditable]"))) return;
    if (e.key === "ArrowRight") { e.preventDefault(); if (state.step === 0 && state.run.status === "idle") start("simulation"); else go(state.step + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); go(state.step - 1); }
  });

  function syncUrl() {
    const u = new URL(location.href);
    u.searchParams.set("case", slugOf(state.scenarioId));
    if (state.step > 0) u.searchParams.set("step", String(state.step)); else u.searchParams.delete("step");
    history.replaceState(null, "", u);
  }

  // ---- runs ---------------------------------------------------------------------------------------------
  function stopCurrent(reason) {
    if (player.isActive()) player.abort(reason);
    if (agent.isActive()) agent.abort(reason);
  }

  function reset(step = 0) {
    stopCurrent("Reset by the presenter.");
    bus.endRun();
    resetAudit();
    state.run = emptyRun();
    state.estimator = null;
    state.estimate = null;
    state.scanWall = null;
    state.decisionWall = null;
    state.ui.reason = "";
    state.ui.review = null;
    state.ui.open.clear();
    state.step = step;
    state.following = true;
    syncUrl();
    render();
  }

  function chooseCase(id) {
    if (!byId(id)) return;
    state.scenarioId = id;
    reset(0);
  }

  async function start(mode, toStep = 1) {
    if (mode === "live") {
      const ok = await openLiveDialog({ modelId: state.modelId });
      if (!ok) return;
      state.modelId = ok.modelId;
    }
    begin(mode, toStep);
  }

  function begin(mode, toStep = 1) {
    reset(0);
    const sc = byId(state.scenarioId);
    const script = window.SIM_RUNS?.[sc.id];
    const model = MODELS.find((m) => m.id === state.modelId) || MODELS[0];
    const run_id = newRunId();
    bus.beginRun({ run_id, mode });
    state.estimator = mode === "simulation"
      ? createEstimator({ system: buildSystemPrompt({ today: longDate() }), tools: toolDefinitions(), opening: buildOpeningMessage({ entry: "scenario", tip: sc.tip }), modelId: DEFAULT_MODEL })
      : null;
    state.step = Math.max(1, Math.min(toStep, 5));
    state.deepLink = state.step > 1 ? state.step : null;
    bus.emit("run_start", {
      run_id, mode, entry: "scenario", title: `Case ${sc.n}: ${sc.title}`, scenario_id: sc.id, tip: sc.tip,
      params: { ...PARAMS }, params_changed: [],
      model: mode === "live" ? model.id : null, model_label: mode === "live" ? model.label : null,
      ...(mode === "simulation" ? { sim_source: script?.source || "authored" } : {})
    });
    if (mode === "simulation") {
      if (!script) {
        bus.emit("notice", { level: "error", text: `No simulation script for “${sc.title}”. Check that data/sim_runs.js is complete.` });
        bus.emit("run_end", { status: "error", reason: "No simulation script for this case." });
        return;
      }
      player.play(script);
    } else {
      agent.run({ entry: "scenario", tip: sc.tip, modelId: model.id, params: PARAMS });
    }
    state.step = Math.min(state.step, maxStep());
    syncUrl();
    render();
    document.getElementById("step-title")?.setAttribute("tabindex", "-1");
    (document.getElementById("step-title") || stage).focus({ preventScroll: true });
  }

  function decide(optionId, decision, note) {
    const o = state.run.options;
    if (!o || state.run.waiting !== "decision") return;
    const opt = o.options.find((x) => x.id === optionId);
    bus.emit("option_decision", {
      option_id: optionId, option_label: optionId === "nothing" ? "Do nothing (accept the risk)" : `${optionId}: ${opt?.title || ""}`,
      options_seq: o.options_seq, decision, by: "user", ...(note ? { note } : {})
    });
  }

  // ---- run events -------------------------------------------------------------------------------------
  bus.onAny((ev) => {
    if (ev.type !== "run_start" && !state.run.runId) return;
    applyEvent(state.run, ev);
    feedEstimate(ev);
    if (ev.type === "board_update" && ev.payload?.scan && state.scanWall === null) state.scanWall = performance.now();
    if (ev.type === "option_decision" && ev.payload?.decision === "approved" && state.decisionWall === null) state.decisionWall = performance.now();
    if (ev.type === "notice" && ev.payload?.level && ev.payload.level !== "info") showBanner({ level: ev.payload.level, text: plainText(world, ev.payload.text) });
    if (ev.type === "run_end" && ["error", "incomplete", "aborted"].includes(ev.payload?.status) && !/Reset by the presenter/.test(ev.payload?.reason || "")) {
      showBanner({ level: ev.payload.status === "error" ? "error" : "warn", title: ev.payload.status === "aborted" ? "Run stopped" : "The run ended early", text: ev.payload.reason || "The agent did not finish the workflow." });
    }
    // A deep link (?step=5) takes the recommended path once the options are on screen.
    if (state.deepLink && state.deepLink >= 5 && ev.type === "options" && state.run.mode === "simulation") {
      const rec = ev.payload.recommended;
      queueMicrotask(() => decide(rec, "approved"));
    }
    if (state.deepLink && state.run.reached >= state.deepLink) { state.step = state.deepLink; state.deepLink = null; syncUrl(); }
    // Live: follow the agent to the newest step, unless the presenter went back to an earlier one.
    if (state.run.mode === "live" && state.following && state.run.reached > state.step) state.step = state.run.reached;
    scheduleRender();
  });

  function feedEstimate(ev) {
    const est = state.estimator;
    if (!est || state.run.mode !== "simulation") return;
    const p = ev.payload || {};
    if ((ev.type === "reasoning" || ev.type === "narration") && p.done) est.text(p.text);
    else if (ev.type === "tool_call") est.toolCall(p.name, p.input);
    else if (ev.type === "tool_result") est.toolResult(p.result);
    else if (ev.type === "run_end") est.finish();
    else return;
    state.estimate = est.snapshot();
  }

  // ---- the guide's figures --------------------------------------------------------------------------------
  fillGuide();
  async function fillGuide() {
    const lead = byId(UI.defaultScenario);
    const ref = window.REFERENCE_CASES?.cases?.[UI.defaultScenario];
    const script = window.SIM_RUNS?.[UI.defaultScenario];
    if (!lead || !ref || !script) return;
    const f = leadFacts(world, ref, script);
    const root = (script.steps || []).find((s) => s.tool === "ui_report_alert")?.input?.root_cause || "";
    const set = (key, text) => document.querySelectorAll(`[data-fact="${key}"]`).forEach((el) => { el.textContent = text; });
    set("lead.tip", `“${lead.tip}”`);
    set("lead.found", `${int(f.n)} order lines worth ${euro(f.spend)}. ${plainText(world, root)}`);
    set("lead.choice", f.yearly > 0
      ? `Fix the lines and the cause for ${euro(f.effort)} one-off, or keep paying about ${euro(f.yearly)} a year`
      : `Fix them for ${euro(f.effort)} one-off, or leave them`);
    set("lead.n", int(f.n));
    set("lead.spend", euro(f.spend));
    set("lead.age", `${int(f.oldestDays)} days`);
    set("lead.past", euro(f.past));
    set("lead.yearly", euro(f.yearly));
    set("lead.path", f.path || "the recommendation");
    set("lead.fixed", `${int(f.fixed)} of ${int(f.n)}`);
    const est = await headlessEstimate(lead, script);
    set("lead.session", est ? euroCents(est.eur) : "a few cents");
  }

  /** The default case run once in the background, as the simulation would play it, for its estimate. */
  async function headlessEstimate(sc, script) {
    try {
      const human = createHumanQueue();
      const est = createEstimator({ system: buildSystemPrompt({ today: longDate() }), tools: toolDefinitions(), opening: buildOpeningMessage({ entry: "scenario", tip: sc.tip }) });
      const toolbox = createToolbox({
        world, mode: "simulation", today: appToday(), params: PARAMS, onPhase: () => {}, waitFor: (k, t) => human.waitFor(k, t),
        emit: (type, p) => {
          if (type === "options") queueMicrotask(() => human.push({ type: "option_decision", payload: { options_seq: p.options_seq, option_id: p.recommended, decision: "approved", by: "user" } }));
          if (type === "confirmation_request") queueMicrotask(() => human.push({ type: "confirmation_decision", payload: { review_id: p.review_id, by: "user", decisions: p.items.map((it) => ({ line_id: it.line_id, decision: "approved" })) } }));
          if (type === "action_draft") queueMicrotask(() => human.push({ type: "action_decision", payload: { action_id: p.action_id, decision: "approved", by: "user" } }));
        }
      });
      await runScript(script, { world, toolbox, hooks: { think: (t) => est.text(t), say: (t) => est.text(t), toolCall: (id, name, input) => est.toolCall(name, input), toolResult: (id, name, out) => est.toolResult(out.result) } });
      est.finish();
      return est.snapshot();
    } catch (e) {
      console.warn("[Data Quality Agent] the guide's estimate failed:", e);
      return null;
    }
  }

  // ---- start ----------------------------------------------------------------------------------------------
  const wanted = Number(params.get("step"));
  if (!params.has("case")) syncUrl();
  render();
  if (Number.isInteger(wanted) && wanted >= 1 && wanted <= 5) begin("simulation", wanted);

  return { state, start, go, reset };
}

/** A banner at the top of the stage (info, warn or error), dismissible, timed for info and warnings. */
export function showBanner({ level = "info", title = "", text = "", timeout = level === "error" ? 0 : 9000 } = {}) {
  const stack = document.getElementById("banners");
  if (!stack) return null;
  const tone = level === "error" ? "vc-alert--danger" : level === "warn" ? "vc-alert--warning" : "";
  const close = h("button", { class: "vc-icon-button", type: "button", "aria-label": "Dismiss" }, h("span", { class: "vc-icon vc-icon--close", "aria-hidden": "true" }));
  const el = h("div", { class: ["vc-alert", tone], role: level === "error" ? "alert" : "status" },
    h("span", { class: `vc-icon vc-icon--${level === "info" ? "info" : "warning"}`, "aria-hidden": "true" }),
    h("div", { class: "vc-alert__body" }, title ? h("p", { class: "vc-alert__title" }, title) : null, h("p", {}, text)),
    close);
  close.addEventListener("click", () => el.remove());
  stack.append(el);
  if (timeout) setTimeout(() => el.remove(), timeout);
  return el;
}
