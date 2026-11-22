// The presenter: the step bar, the stage and the four key figures, driven by the run events of
// whichever producer runs (the simulation player or the live agent). The key figures answer first: the
// case's script runs once in the background through the same tools, so the first screen shows what is at
// stake before anything runs. A simulation goes as far as it can at once and waits where a person decides;
// Play then walks the steps by itself, each for as long as its words take to read, and stops wherever the
// person acts (Start, the review, the decision, the drafts). Space plays or pauses; a step chosen by click,
// arrow key, clicker (PageDown and PageUp) or ?step= pauses Play. A live run fills the steps as it goes and
// the page follows it, unless the presenter has gone back to an earlier step.

import { bus, newRunId } from "./events.js";
import { emptyRun, applyEvent, STEPS, approved } from "./run_model.js";
import { renderStep } from "./steps_view.js";
import { createKpis, previewOf } from "./kpis.js";
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

export async function initApp() {
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
  const playBtn = document.getElementById("btn-play");
  const modeTag = document.getElementById("mode-tag");
  const modeText = document.getElementById("mode-text");
  const liveNotice = document.getElementById("live-notice");
  const announce = document.getElementById("announce");
  const guide = document.getElementById("guide");
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
    previews: new Map(),
    attention: false,
    ui: { reason: "", review: null, open: new Set() }
  };
  /** Play: on, the frame it asked for, the time spent reading the step, the step it timed, the last frame. */
  const P = { on: false, raf: 0, at: 0, step: -1, last: 0 };
  const params0 = Number(params.get("step"));
  const linked = Number.isInteger(params0) && params0 >= 1 && params0 <= 5;

  // The guide opens by itself in a new tab (vici.js) and closes on the first screen, which waits for the
  // person: Start the agent, or Play, starts the run and plays it. The guide's Start, on a guide opened
  // during a run, plays on from where the page is.
  guide?.addEventListener("vc:guideclose", (e) => {
    if (e.detail?.returnValue === "done" && state.run.status !== "idle" && state.run.mode !== "live") play();
  });

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
      if (n === 0 && run.status === "idle") turn = "Your turn";
      if (n === 2 && run.waiting === "review") turn = "Your review";
      if (n === 4 && run.waiting === "decision") turn = "Your decision";
      if (n === 5 && run.waiting === "approvals") turn = "Your approval";
      li.dataset.turn = turn ? "yours" : "";
      hint.textContent = turn || (n > 0 && n <= max && run.status !== "idle" ? stepHint(n) : "");
    });
    back.disabled = state.step === 0;
    const canNext = state.step < max;
    next.replaceChildren("Next", h("span", { class: "vc-icon vc-icon--chevron-right", "aria-hidden": "true" }));
    // The step's own button (Start, or Next with where it leads) is the one primary action on the
    // stage; the bar's Next does the same for a presenter, so it stays secondary.
    next.classList.add("vc-button--secondary");
    next.disabled = !(canNext || (state.step === 0 && run.status === "idle"));
    next.title = !canNext && state.step === 4 && run.waiting === "decision" ? "Decide first" : "";
    const live = run.mode === "live";
    stop.hidden = !(live && run.status === "running");
    liveNotice.hidden = !live;
    playBtn.hidden = live;
    modeTag.dataset.mode = live ? "live" : "simulation";
    modeText.textContent = live ? "LIVE" : "SIMULATION";
    document.getElementById("tip-mode").textContent = live
      ? `Claude${run.model ? ` ${run.model}` : ""} runs on your key; the engine computes every figure and nothing is sent.`
      : "A scripted run of the agent through the real rules and engine: no model is called. Run it live, on the first screen, calls Claude with your own key.";
    drawPlay();
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
    get play() { return { on: P.on && state.run.mode !== "live", attention: state.attention }; },
    handlers: {
      onStart: (mode) => start(mode),
      onGo: (n) => go(n),
      onNext: (n) => go(n, { keep: true }),
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
    fill(P.on && !waits() ? P.at / readMs() : 0);
    drawFoot();
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
    kpis.render(state.run, { world, preview: state.previews.get(state.scenarioId) || null, estimate: state.estimate, scanWall: state.scanWall, decisionWall: state.decisionWall, now: performance.now() });
  }

  // ---- Play: the steps go by themselves and stop where the person acts --------------------------------
  /** The step waits for the person: Start on the tip, the review, the decision, the drafts. */
  function waits() {
    const run = state.run;
    const n = state.step;
    if (n === 0 && run.status === "idle") return true;
    if (n === 2 && run.waiting === "review") return true;
    if (n === 4 && run.waiting === "decision") return true;
    if (n === 5 && run.waiting === "approvals") return true;
    return false;
  }
  /** The story is over: the furthest step, the run ended, nothing left for the person to do. */
  const finished = () => state.run.status !== "idle" && state.run.status !== "running" && state.step >= maxStep() && !waits();
  /** A dialog covers the page: Play holds its time until it closes. */
  const covered = () => !!document.querySelector("dialog[open]");
  /** How long Play stays on a step: the time to read its title and lead, between 7 and 14 seconds. */
  function readMs() {
    const title = document.getElementById("step-title")?.textContent || "";
    const lead = [...stage.querySelectorAll("[data-read]")].map((e) => e.textContent).join(" ");
    const words = `${title} ${lead}`.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
    return Math.min(14000, Math.max(7000, 3000 + 230 * words));
  }

  function play() {
    if (state.run.mode === "live") return;
    // On the first screen Play starts the agent, as Start does. Replay: the case again from Spot, with its
    // decision open again.
    if (state.run.status === "idle" || finished()) begin("simulation", 1);
    P.on = true;
    P.last = 0;
    calm();
    drawPlay();
    render();
    if (!P.raf) P.raf = requestAnimationFrame(playFrame);
  }

  function pause() {
    if (!P.on) return;
    P.on = false;
    cancelAnimationFrame(P.raf);
    P.raf = 0;
    drawPlay();
    render();
    armAttention();
  }

  function playFrame(now) {
    P.raf = 0;
    if (!P.on) return;
    // Time away from the tab, or a slow frame, does not count.
    const dt = P.last ? Math.min(now - P.last, 100) : 0;
    P.last = now;
    if (P.step !== state.step) Object.assign(P, { step: state.step, at: 0 });
    const total = readMs();
    if (waits()) {
      // The person's turn: Play waits; once they have acted, the step's new words get their reading time.
      P.at = 0;
    } else if (finished()) {
      fill(0);
      pause();
      return;
    } else if (state.step < maxStep() && !covered()) {
      P.at += dt;
      if (P.at >= total) {
        go(state.step + 1, { focus: false, keep: true });
        P.raf = requestAnimationFrame(playFrame);
        return;
      }
    }
    fill(waits() ? 0 : P.at / total);
    drawFoot(total);
    P.raf = requestAnimationFrame(playFrame);
  }

  /** How far the step is read: the rail to the next step and the bar along the step's action fill with it. */
  function fill(p) {
    const v = Math.max(0, Math.min(1, p)).toFixed(4);
    stepButtons.forEach(({ li }, n) => li.style.setProperty("--vc-step-fill", n === state.step ? v : "0"));
    document.getElementById("btn-cta")?.style.setProperty("--fill", v);
  }

  /** Play, Pause or Replay on the one button before the steps. */
  function drawPlay() {
    const st = P.on ? "pause" : finished() ? "replay" : "play";
    if (playBtn.dataset.state === st) return;
    playBtn.dataset.state = st;
    playBtn.querySelector(".vc-icon").className = `vc-icon vc-icon--${st === "pause" ? "pause" : st === "replay" ? "refresh" : "play"}`;
    document.getElementById("play-text").textContent = st === "pause" ? "Pause" : st === "replay" ? "Replay" : "Play";
  }

  /** Beside the step's action, in words: when Play moves on, or that the move is the person's. */
  function drawFoot(total = readMs()) {
    const note = document.getElementById("foot-note");
    if (!note) return;
    const playing = P.on && state.run.mode !== "live";
    const words = playing ? (state.step < maxStep() && !waits() ? `Plays on in ${Math.max(1, Math.ceil((total - P.at) / 1000))} s` : "") : "Your move";
    if (note.textContent !== words) note.textContent = words;
    note.dataset.tone = playing ? "" : "move";
  }

  // Paused, the step's action draws the eye (Vici's vc-attention) after six seconds without a click, a
  // key or a scroll; any of them calms it again. Where the page waits for the person, the action carries
  // vc-attention from the start (js/steps_view.js).
  const QUIET_MS = 6000;
  let quiet = 0;
  function calm() {
    state.attention = false;
    document.getElementById("btn-cta")?.classList.remove("vc-attention");
  }
  function armAttention() {
    clearTimeout(quiet);
    calm();
    quiet = setTimeout(() => {
      const cta = document.getElementById("btn-cta");
      if (P.on || !cta || cta.disabled || covered()) return;
      state.attention = true;
      cta.classList.add("vc-attention");
    }, QUIET_MS);
  }
  for (const type of ["pointerdown", "keydown", "wheel"]) document.addEventListener(type, () => { if (!P.on) armAttention(); }, { capture: true, passive: true });
  playBtn.addEventListener("click", () => (P.on ? pause() : play()));

  // ---- navigation -------------------------------------------------------------------------------------
  /** Shows step n. A step chosen by the presenter pauses Play; keep: Next and Play itself go on playing. */
  function go(n, { focus = true, keep = false } = {}) {
    if (!keep) pause();
    if (state.run.status === "idle" && n > 0) { begin("simulation", n); return; }
    const target = Math.max(0, Math.min(maxStep(), n));
    state.step = target;
    state.following = target >= state.run.reached;
    if (P.step !== state.step) Object.assign(P, { step: state.step, at: 0 });
    syncUrl();
    render();
    const shown = STEPS[state.step];
    announce.textContent = `Step ${state.step} of 5: ${document.getElementById("step-title")?.textContent || shown.name}.`;
    if (!P.on) armAttention();
    if (focus) document.getElementById("step-title")?.setAttribute("tabindex", "-1");
    if (focus) (document.getElementById("step-title") || stage).focus({ preventScroll: true });
  }
  back.addEventListener("click", () => go(state.step - 1));
  next.addEventListener("click", () => go(state.step + 1, { keep: true }));
  stop.addEventListener("click", () => agent.abort("Stopped by the presenter."));
  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (document.querySelector("dialog[open]")) return;
    const t = e.target;
    if (t && (t.closest("input, textarea, select, [contenteditable]"))) return;
    // Space plays or pauses, unless it presses the button that has the focus.
    if (e.key === " ") {
      if (t?.closest?.("button, a, summary, [role=button]")) return;
      e.preventDefault();
      if (!e.repeat) (P.on ? pause() : play());
      return;
    }
    // A presentation clicker sends the arrow keys or PageDown and PageUp.
    if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); go(state.step + 1); }
    if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(state.step - 1); }
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

  async function chooseCase(id) {
    if (!byId(id)) return;
    state.scenarioId = id;
    reset(0);
    await previewFor(byId(id));
    render();
  }

  /** Start the agent plays the case from Spot; Run it live asks for the key first and follows the agent. */
  async function start(mode, toStep = 1) {
    if (mode === "live") {
      pause();
      const ok = await openLiveDialog({ modelId: state.modelId });
      if (!ok) return;
      state.modelId = ok.modelId;
      begin(mode, toStep);
      return;
    }
    begin(mode, toStep);
    play();
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
    Object.assign(P, { step: state.step, at: 0 });
    syncUrl();
    render();
    announce.textContent = `${sc.title}, step ${state.step} of 5: ${document.getElementById("step-title")?.textContent || STEPS[state.step].name}.`;
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

  // ---- answer first: each case worked out once in the background ------------------------------------
  /**
   * Runs a case's script once, as the simulation will play it, through the same tools and with the
   * recommended path approved: the figures the first screen shows before anything runs, and the
   * session-cost estimate. Cached per case.
   */
  async function previewFor(sc) {
    if (!sc) return null;
    if (state.previews.has(sc.id)) return state.previews.get(sc.id);
    const script = window.SIM_RUNS?.[sc.id];
    let out = null;
    try {
      const human = createHumanQueue();
      const got = { alert: null, fixPaths: null, options: null };
      const est = createEstimator({ system: buildSystemPrompt({ today: longDate() }), tools: toolDefinitions(), opening: buildOpeningMessage({ entry: "scenario", tip: sc.tip }) });
      const toolbox = createToolbox({
        world, mode: "simulation", today: appToday(), params: PARAMS, onPhase: () => {}, waitFor: (k, t) => human.waitFor(k, t),
        emit: (type, p) => {
          if (type === "alert") got.alert = p;
          if (type === "options") { got.options = p; queueMicrotask(() => human.push({ type: "option_decision", payload: { options_seq: p.options_seq, option_id: p.recommended, decision: "approved", by: "user" } })); }
          if (type === "confirmation_request") queueMicrotask(() => human.push({ type: "confirmation_decision", payload: { review_id: p.review_id, by: "user", decisions: p.items.map((it) => ({ line_id: it.line_id, decision: "approved" })) } }));
          if (type === "action_draft") queueMicrotask(() => human.push({ type: "action_decision", payload: { action_id: p.action_id, decision: "approved", by: "user" } }));
        }
      });
      await runScript(script, {
        world, toolbox,
        hooks: {
          think: (t) => est.text(t), say: (t) => est.text(t),
          toolCall: (id, name, input) => est.toolCall(name, input),
          toolResult: (id, name, o) => { est.toolResult(o.result); if (name === "dq_fix_paths" && o.result && !o.isError) got.fixPaths = o.result; }
        }
      });
      est.finish();
      const estimate = est.snapshot();
      out = { ...previewOf({ world, alert: got.alert, fixPaths: got.fixPaths, estimate }), options: got.options };
    } catch (e) {
      console.warn("[Data Quality Agent] the case's figures could not be worked out in advance:", e);
    }
    state.previews.set(sc.id, out);
    return out;
  }

  /** The guide's figures: the default case, from the same run and the engine's frozen references. */
  function fillGuide(pre) {
    const lead = byId(UI.defaultScenario);
    const ref = window.REFERENCE_CASES?.cases?.[UI.defaultScenario];
    const script = window.SIM_RUNS?.[UI.defaultScenario];
    if (!lead || !ref || !script) return;
    const f = leadFacts(world, ref, script);
    const root = (script.steps || []).find((s) => s.tool === "ui_report_alert")?.input?.root_cause || "";
    const set = (key, text) => document.querySelectorAll(`[data-fig="${key}"]`).forEach((el) => { el.textContent = text; });
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
    set("lead.left", euro(Math.max(0, f.yearly - Math.min(f.yearly, f.avoided))));
    set("lead.path", f.path || "the recommendation");
    set("lead.fixed", `${int(f.fixed)} of ${int(f.n)}`);
    set("lead.session", pre?.estimateEur != null ? euroCents(pre.estimateEur) : "a few cents");
  }

  // ---- start ----------------------------------------------------------------------------------------------
  const [leadPre] = await Promise.all([previewFor(byId(UI.defaultScenario)), previewFor(byId(state.scenarioId))]);
  fillGuide(leadPre);
  if (!params.has("case")) syncUrl();
  render();
  // A link to a step opens it, paused; otherwise the first screen waits for Start.
  if (linked) begin("simulation", params0);
  armAttention();
  setInterval(() => { if (state.scanWall !== null && state.decisionWall === null && state.run.status === "running") renderKpis(); }, 1000);

  return { state, start, go, reset, play, pause, get playing() { return P.on; } };
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
