// Agent console: the progress rail with the agent's five steps and the three human steps, and the
// logbook of the run-event stream (time · mark · entry), adapted from Rebate Hunter's. Every tool call
// reads as one plain sentence for the audience (js/tool_plain.js, as in the Timetable Translator), with
// the tool's own name, arguments and result one click away. Narration paragraphs that start with a
// label (Hypothesis:, Check:, Revised: …) get their styling; a step that code refused shows as a
// Guardrail line. Choosing a scenario before a run shows its tip: the unverified first hint.

import { bus } from "./events.js";
import { h, clear, prefersReducedMotion } from "./dom.js";
import { icon } from "./icons.js";
import { renderInline, renderMarkdown } from "./md.js";
import { clock, euro, int, pct1 } from "./format.js";
import { auditRows } from "./audit.js";
import { computeRunFacts, describeRunFacts } from "./run_facts.js";
import { createProgressRail } from "./progress.js";
import { aiLabel } from "./ai_label.js";
import { runStateLabel } from "./handover.js";
import { LABELS, splitParagraphs } from "./labels.js";
import { toolPlain } from "./tool_plain.js";
import { KIND_LABELS } from "./drafts.js";
import { STORAGE } from "./config.js";

const PHASES = new Set(["diagnosing", "verifying", "simulating", "options", "awaiting_approval", "executing"]);
const KIND_ICON = { change_request: "receipt", follow_up: "mail", prevention: "target", risk_memo: "memo" };

export function createConsole(panel, { onOpenOptions, onOpenOutbox, onOpenReport, onOpenReview, onSaveSimulation } = {}) {
  const count = h("span", { class: "count vc-tabular" }, "");
  const jumpBtn = h("button", { class: "vc-button vc-button--outline button-compact", type: "button", hidden: true }, icon("chevronDown", 16), "Jump to latest");
  // Larger text for projectors, remembered per browser (a convenience; storage may be unavailable).
  const sizeBtn = h("button", { class: "vc-button vc-button--ghost button-compact text-size", type: "button", "aria-pressed": "false", title: "Larger console text for projectors" }, "Larger text");
  const applySize = (large) => {
    panel.dataset.text = large ? "large" : "standard";
    sizeBtn.setAttribute("aria-pressed", String(large));
    pin();
  };
  sizeBtn.addEventListener("click", () => {
    const large = panel.dataset.text !== "large";
    applySize(large);
    try { localStorage.setItem(STORAGE.consoleText, large ? "large" : "standard"); } catch { /* storage unavailable */ }
  });
  const SCRIPTED = "Scripted replay of a representative run. Not live data, no model calls.";
  const watermarkText = h("span", {}, SCRIPTED);
  const watermark = h("div", { class: "sim-watermark", hidden: true, role: "note" }, "SIMULATION", watermarkText);
  const log = h("div", { class: "log", role: "log", "aria-live": "polite", "aria-relevant": "additions" });
  const rail = createProgressRail();
  rail.reset();

  panel.append(
    h("div", { class: "console-head" },
      h("div", { class: "console-title" }, h("h2", {}, "Agent console"), count),
      h("div", { class: "console-head-actions" }, jumpBtn, sizeBtn)),
    rail.el,
    watermark,
    log
  );

  const byMsg = new Map();
  const byCall = new Map();
  let entries = 0;
  let lastPhase = null;
  let runMeta = null;
  let sawReport = false;
  let optionsSeq = null;
  // Auto-follow: the log stays pinned to the newest entry until the presenter scrolls up; only user
  // input (wheel, touch, keys, scrollbar drag) unpins it.
  let follow = true;
  let userIntentUntil = 0;
  const noteIntent = () => { userIntentUntil = performance.now() + 900; };
  for (const type of ["wheel", "touchmove", "pointerdown", "keydown"]) log.addEventListener(type, noteIntent, { passive: true });
  const atBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  function pin() { if (follow) log.scrollTop = log.scrollHeight; }

  log.addEventListener("scroll", () => {
    if (atBottom()) {
      follow = true;
      jumpBtn.hidden = true;
    } else if (performance.now() < userIntentUntil) {
      follow = false;
      if (entries > 0) jumpBtn.hidden = false;
    }
  });
  if (typeof ResizeObserver === "function") new ResizeObserver(pin).observe(log);
  jumpBtn.addEventListener("click", () => {
    follow = true;
    jumpBtn.hidden = true;
    log.scrollTo({ top: log.scrollHeight, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  });

  /** The empty log before a run: the agent's plan and the chosen scenario's tip. */
  function showEmpty(scenario, { custom = null } = {}) {
    reset(false);
    log.appendChild(h("div", { class: "log-empty" },
      h("h3", {}, "The agent's plan"),
      h("p", {}, "Five steps above: it scans the fifteen rules, reads the records behind the findings and finds the root cause that makes them one case, lets the engine cost two or three fix paths next to doing nothing, waits for your decision, then drafts the follow-ups and change requests."),
      h("p", {}, "When it needs you, the step turns merlot: your confirmation of AI-suggested values, your decision on a fix path, your approval of each draft. Nothing is sent, and nothing is written to the data."),
      custom ? h("div", { class: "tip-preview", dataset: { scenario: "custom" } },
        h("p", { class: "tip-label" }, icon("info", 16), "Custom what-if (Live only)"),
        h("p", { class: "tip-text" }, `“${custom}”`),
        h("p", { class: "tip-note" }, "Your tip, unverified. The live agent gets it and nothing else."))
        : scenario ? h("div", { class: "tip-preview", dataset: { scenario: scenario.id } },
          h("p", { class: "tip-label" }, icon("info", 16), `Scenario ${scenario.n}: ${scenario.title}`),
          h("p", { class: "tip-text" }, `“${scenario.tip}”`),
          h("p", { class: "tip-note" }, "An unverified tip, as a first hint arrives. In Live mode it is all the agent gets.")) : null,
      h("p", { class: "log-version" }, "Start agent to run it: as a free Simulation, or live with your own API key.")));
    count.textContent = "";
  }

  function add(el) {
    if (entries === 0) clear(log);
    log.appendChild(el);
    entries++;
    count.textContent = `${entries} ${entries === 1 ? "entry" : "entries"}`;
    if (follow) pin();
    else jumpBtn.hidden = false;
    return el;
  }

  function entry(type, t, mark, body, data = {}) {
    return h("div", { class: "entry", dataset: { type, ...data } },
      h("div", { class: "entry-time" }, t !== null && t !== undefined ? clock(t) : ""),
      h("div", { class: "entry-mark" }, mark ? icon(mark, 18) : null),
      h("div", { class: "entry-body" }, body));
  }

  // ---- event handlers ---------------------------------------------------------------------------

  bus.on("run_start", (ev) => {
    const p = ev.payload;
    reset(false);
    runMeta = p;
    const recorded = p.mode === "simulation" && p.sim_source === "recorded";
    watermark.hidden = p.mode !== "simulation";
    watermarkText.textContent = recorded
      ? `Replay of a live run recorded${p.recorded_on ? ` on ${p.recorded_on}` : ""}${p.recorded_model ? ` (${p.recorded_model})` : ""}. Not live data, no model calls.`
      : SCRIPTED;
    log.dataset.sim = String(p.mode === "simulation");
    const meta = p.mode === "simulation"
      ? recorded ? "Simulation: replay of a recorded live run, no API key, no cost. Paths the live run did not take keep the scripted texts." : "Simulation: scripted replay, no API key, no cost. Every figure comes from the rule engine."
      : `Live agent on ${p.model_label || p.model || "Claude"}. Real model reasoning and real tool calls.`;
    add(entry("run", ev.t, "play", [
      h("div", { class: "run-title" }, p.title || "Agent run"),
      h("div", {}, meta),
      p.tip ? h("div", { class: "seed" }, h("strong", {}, p.entry === "sweep" ? "Instruction: " : "Tip: "), `“${p.tip}”`) : null
    ]));
  });

  bus.on("state_change", (ev) => {
    const s = ev.payload.state;
    rail.update(s);
    if (!PHASES.has(s) || s === lastPhase) return;
    lastPhase = s;
    add(entry("phase", ev.t, null, h("span", { class: "phase" }, `Phase: ${runStateLabel(s)}`)));
  });

  bus.on("narration", (ev) => {
    const { msg_id: id, text, done } = ev.payload;
    let el = byMsg.get(id);
    if (!el) {
      el = add(entry("narration", ev.t, "pulse", h("div", { class: "narration" })));
      byMsg.set(id, el);
    }
    const body = el.querySelector(".narration");
    clear(body);
    for (const para of splitParagraphs(text)) body.appendChild(renderParagraph(para));
    el.classList.toggle("streaming", !done);
    if (done) el.removeAttribute("aria-busy"); else el.setAttribute("aria-busy", "true");
    pin();
  });

  bus.on("reasoning", (ev) => {
    const { msg_id: id, text } = ev.payload;
    let el = byMsg.get(`r:${id}`);
    if (!el) {
      const details = h("details", { class: "reasoning" },
        h("summary", {}, icon("chevronRight", 14), "Reasoning summary"),
        h("div", { class: "reasoning-text" }));
      el = add(entry("reasoning", ev.t, null, details));
      byMsg.set(`r:${id}`, el);
    }
    el.querySelector(".reasoning-text").textContent = text || "";
  });

  bus.on("tool_call", (ev) => {
    const p = ev.payload;
    if (isUiTool(p.name)) return; // ui_* tools show by their effect (case card, review, options, outbox)
    const line = h("div", { class: "tool-line" }, h("span", { class: "tool-name" }, p.name), h("span", { class: "tool-args" }, argsSummary(p.input)));
    // What the call does in one plain sentence, above the tool's own name: for the audience.
    let plainText = null;
    try { plainText = toolPlain(p.name, p.input || {}); } catch { plainText = null; }
    const result = h("div", { class: "result", dataset: { open: "false" } });
    const toggle = h("button", { class: "result-toggle", type: "button", "aria-expanded": "false", title: `Show the tool call (${p.name}) and its result` },
      icon("chevronRight", 14), h("span", { class: "result-label" }, "Details"));
    toggle.addEventListener("click", () => {
      const open = result.dataset.open !== "true";
      result.dataset.open = String(open);
      toggle.setAttribute("aria-expanded", String(open));
    });
    result.append(toggle, h("div", { class: "tool-detail" }, line));
    const el = add(entry("tool_call", ev.t, String(p.name).startsWith("dq_") ? "gear" : "list", [h("div", { class: "tool-plain" }, plainText || p.name), result], { plain: "true", tool: p.name }));
    byCall.set(p.call_id, el);
  });

  bus.on("tool_result", (ev) => {
    const p = ev.payload;
    const refused = p.ok === false && p.result?.refused;
    if (isUiTool(p.name)) {
      // A refused ui_* call is a guardrail at work (a verified case, figures from tools, drafts only
      // after a decision): show it, so the presenter sees why the agent tries again.
      if (p.ok === false) guardrail(ev.t, p);
      return;
    }
    let el = byCall.get(p.call_id);
    if (!el) el = add(entry("tool_call", ev.t, "gear", [h("div", { class: "tool-plain" }, p.name), h("div", { class: "result", dataset: { open: "false" } }, h("div", { class: "tool-detail" }))], { plain: "true", tool: p.name }));
    const detail = el.querySelector(".tool-detail");
    detail.append(h("div", { class: "result-summary", dataset: { ok: String(p.ok !== false) } }, p.summary || (p.ok === false ? "Tool error" : "Result")));
    if (p.ok === false) el.dataset.failed = "true";
    el.querySelector(".result").append(h("pre", { class: "result-body" }, formatJson(p.result)));
    if (refused) guardrail(ev.t, p);
    pin();
  });

  function guardrail(t, p) {
    const why = String(p.result?.error || p.summary || "").replace(/^Error:\s*/, "");
    add(entry("notice", t, "shield", h("span", {}, h("strong", {}, "Guardrail: "), `${GUARD_LABEL[p.name] || `The call to ${p.name} was`} refused. `, why), { level: "warn", guard: p.name }));
  }

  bus.on("alert", (ev) => {
    const p = ev.payload;
    const sev = String(p.severity || "high").toLowerCase();
    const tone = sev === "medium" || sev === "low" ? "vc-alert--warning" : "vc-alert--danger";
    const routing = (p.routing || []).slice(0, 6);
    const card = h("div", { class: ["vc-alert", tone, "alert-card", "case-card"], dataset: { severity: sev } }, h("div", { class: "vc-alert__body" },
      h("div", { class: "alert-sev" }, `Verified case, severity ${sev} · ${(p.rules || []).join(", ")} · group “${p.group}”`, p.unchecked ? h("span", { class: "vc-tag vc-tag--warning case-unchecked", title: `Figures no tool returned: ${p.unchecked.join(", ")}` }, "Unchecked") : null),
      h("h3", {}, p.title || "Data-quality case"),
      h("p", { class: "case-cause" }, h("strong", {}, "Root cause: "), p.root_cause),
      h("p", { class: "case-fix" }, h("strong", {}, "Fix at source: "), p.fix_at_source),
      p.summary ? renderInline(p.summary, h("p", { class: "case-summary" })) : null,
      h("dl", { class: "case-figures" },
        h("dt", {}, "Exceptions"), h("dd", {}, `${int(p.exceptions)}${p.base ? ` (${pct1(p.share)} of ${int(p.base)} in the grouping)` : ""}`),
        h("dt", {}, "Order lines"), h("dd", {}, `${int(p.affected_lines)}, worth ${euro(p.spend_eur)}`),
        p.financing ? h("dt", {}, "Financing cost") : null,
        p.financing ? h("dd", {}, `${euro(p.financing_cost_eur)} over the last 365 days, ${euro(p.unpaid_cost_eur)} on unpaid lines`) : null,
        h("dt", {}, "Routed to"), h("dd", {}, routing.map((r) => `${r.label} (${int(r.count)})`).join("; ") + ((p.routing || []).length > routing.length ? `; ${int(p.routing.length - routing.length)} more` : ""))),
      Array.isArray(p.checked) && p.checked.length ? h("p", { class: "alert-evidence" }, h("strong", {}, "Checked in this run: "), p.checked.join("; "), ".") : null,
      h("div", { class: "case-ai" }, aiLabel("alert"))));
    add(entry("alert", ev.t, "alert", card));
  });

  bus.on("confirmation_request", (ev) => {
    const n = (ev.payload.items || []).length;
    add(entry("review", ev.t, "spark", h("div", {},
      h("p", {}, `${int(n)} AI-suggested material ${n === 1 ? "group waits" : "groups wait"} for your confirmation. Until you approve them, they count as no suggestion.`),
      h("button", { class: "vc-button button-compact", type: "button", id: "btn-open-review", on: { click: () => onOpenReview?.() } }, "Open the review"))));
  });

  bus.on("confirmation_decision", (ev) => {
    const d = ev.payload.decisions || [];
    const a = d.filter((x) => x.decision === "approved").length;
    add(entry("decision", ev.t, "user", h("p", {}, h("strong", {}, "You reviewed the suggestions: "), `${int(a)} approved, ${int(d.length - a)} rejected.`), { decision: "review" }));
  });

  // A response that was not kept (failed and retried, or cut off and redone): its entries stay
  // visible for the record, dimmed and marked, and nothing in them counts.
  bus.on("attempt_discarded", (ev) => {
    const p = ev.payload || {};
    const els = [...(p.msg_ids || []).flatMap((id) => [byMsg.get(id), byMsg.get(`r:${id}`)]), ...(p.call_ids || []).map((id) => byCall.get(id))].filter(Boolean);
    for (const el of new Set(els)) {
      if (el.dataset.discarded === "true") continue;
      el.dataset.discarded = "true";
      el.classList.remove("streaming");
      el.removeAttribute("aria-busy");
      el.querySelector(".entry-body")?.prepend(h("div", { class: "discarded-note" }, h("em", {}, "Discarded: "), p.reason || "this part of the response was not used."));
    }
  });

  bus.on("options", (ev) => {
    optionsSeq = ev.payload.options_seq ?? null;
    const n = ev.payload.options?.length || 0;
    add(entry("narration", ev.t, "list", h("div", {},
      h("p", {}, `${int(n)} fix paths and doing nothing are ready for your decision; path ${ev.payload.recommended} is recommended.`),
      h("button", { class: "vc-button button-compact", type: "button", on: { click: () => onOpenOptions?.() } }, "Review the fix paths"))));
  });

  bus.on("option_decision", (ev) => {
    const p = ev.payload;
    if (p.options_seq !== undefined && (p.options_seq ?? null) !== optionsSeq) return;
    const approved = p.decision === "approved";
    add(entry("decision", ev.t, "user", h("p", {},
      h("strong", {}, approved ? (p.option_id === "nothing" ? "You accepted the risk: " : "You approved ") : "You rejected "),
      p.option_id === "nothing" ? "doing nothing" : (p.option_label || p.option_id), p.note ? `. Reason: ${p.note}` : ".",
      approved && p.option_id !== "nothing" ? " Approved, re-scan pending: nothing counts as closed until a re-scan no longer finds it." : ""),
    { decision: p.decision }));
  });

  bus.on("action_draft", (ev) => {
    const p = ev.payload;
    add(entry("narration", ev.t, KIND_ICON[p.kind] || "mail", h("div", {},
      h("p", {}, `Drafted ${(KIND_LABELS[p.kind] || "draft").toLowerCase()} for ${p.recipient}: “${p.subject}”. Waiting for your approval in the Outbox.`),
      h("button", { class: "vc-button vc-button--outline button-compact", type: "button", on: { click: () => onOpenOutbox?.() } }, "Open outbox"))));
  });

  bus.on("action_decision", (ev) => {
    const p = ev.payload;
    add(entry("decision", ev.t, "user", h("p", {},
      h("strong", {}, p.decision === "approved" ? "You approved " : "You rejected "),
      p.label || p.action_id, p.decision === "approved" ? " (draft only; nothing was sent)." : "."), { decision: p.decision }));
  });

  bus.on("report", (ev) => {
    sawReport = true;
    const card = h("div", { class: "vc-card report-card" },
      aiLabel("report"),
      h("details", { class: "report-full", open: true }, h("summary", {}, icon("chevronRight", 14), "Report"), renderMarkdown(ev.payload.markdown)),
      h("div", { class: "report-actions" },
        h("button", { class: "vc-button button-compact", type: "button", id: "btn-open-report", on: { click: () => onOpenReport?.(ev.payload.markdown) } }, icon("external", 16), "Open the report")));
    add(entry("report", ev.t, "check", card));
  });

  bus.on("notice", (ev) => {
    const { level = "info", text, guardrail: guard } = ev.payload;
    add(entry("notice", ev.t, guard ? "shield" : level === "error" || level === "warn" ? "alert" : "info", renderInline(text, h("span")), { level, ...(guard ? { guard: "decision" } : {}) }));
  });

  bus.on("run_end", (ev) => {
    const { status, reason } = ev.payload;
    rail.finish(status);
    const text = {
      done: "Run complete.",
      aborted: "Run aborted.",
      error: "Run stopped because of an error.",
      no_findings: "Run complete: no material finding.",
      incomplete: "Run stopped before the workflow was complete."
    }[status] || "Run ended.";
    const canSave = status === "done" && sawReport && runMeta?.mode === "live" && runMeta?.entry === "scenario";
    let facts = null;
    if (["done", "no_findings", "incomplete"].includes(status)) {
      try { facts = describeRunFacts(computeRunFacts(auditRows(), ev)); } catch (e) { console.error("[Data Quality Agent] run facts failed:", e); }
    }
    add(entry("notice", ev.t, status === "done" || status === "no_findings" ? "check" : "stop", h("div", {},
      h("span", {}, h("strong", {}, text), reason ? ` ${reason}` : ""),
      facts ? h("details", { class: "run-facts" }, h("summary", {}, icon("chevronRight", 14), runMeta?.mode === "simulation" ? "Replay facts" : "Run facts"), h("p", {}, facts)) : null,
      canSave ? h("div", { class: "entry-actions" },
        h("button", { class: "vc-button vc-button--outline button-compact", type: "button", title: "Download this run as a simulation script that can replace the scripted replay of this scenario", on: { click: () => onSaveSimulation?.() } }, icon("download", 16), "Save run as simulation")) : null),
    { level: status === "error" ? "error" : "info", end: status }));
    for (const el of byMsg.values()) { el.classList.remove("streaming"); el.removeAttribute("aria-busy"); }
  });

  function reset(empty = true) {
    byMsg.clear();
    byCall.clear();
    entries = 0;
    lastPhase = null;
    runMeta = null;
    sawReport = false;
    optionsSeq = null;
    follow = true;
    jumpBtn.hidden = true;
    watermark.hidden = true;
    log.dataset.sim = "false";
    rail.reset();
    clear(log);
    count.textContent = "";
    if (empty) showEmpty(null);
  }

  let storedSize = null;
  try { storedSize = localStorage.getItem(STORAGE.consoleText); } catch { /* storage unavailable */ }
  applySize(storedSize === "large");
  return { showEmpty, reset, rail };
}

// ---------------------------------------------------------------------------------------------

function renderParagraph(raw) {
  const text = raw.replace(/^\*\*([^*]+?:)\*\*\s*/, "$1 ");
  for (const rule of LABELS) {
    const m = rule.re.exec(text);
    if (!m) continue;
    const rest = text.slice(m[0].length);
    const label = m[1][0].toUpperCase() + m[1].slice(1);
    const p = h("p", { class: "para", dataset: { kind: rule.kind } }, h("span", { class: "tag" }, `${label}:`));
    if (rule.kind === "revised") {
      const arrow = rest.search(/\s(→|->)\s/);
      if (arrow > 0) {
        const old = rest.slice(0, arrow);
        const after = rest.slice(arrow).replace(/^\s(→|->)\s/, "");
        p.append(renderInline(old, h("span", { class: "struck" })), h("span", { class: "arrow", "aria-label": "replaced by" }, "→"), renderInline(after, h("span", { class: "amended" })));
        return p;
      }
    }
    renderInline(rest, p);
    return p;
  }
  return renderInline(text, h("p", { class: "para" }));
}

function argsSummary(input) {
  if (!input || typeof input !== "object") return "";
  const parts = [];
  for (const [k, v] of Object.entries(input)) {
    if (v === null || v === undefined || v === "") continue;
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    parts.push(`${k}=${trim(s, 56)}`);
  }
  return parts.join(", ");
}

function trim(s, n) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function formatJson(value) {
  if (value === undefined) return "";
  let s;
  try {
    s = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  } catch {
    s = String(value);
  }
  return s.length > 9000 ? `${s.slice(0, 9000)}\n… (truncated for display; the full result is in the audit log)` : s;
}

function isUiTool(name) {
  return String(name || "").startsWith("ui_");
}

const GUARD_LABEL = {
  ui_report_alert: "The alert was", ui_mark_board: "The board update was", ui_request_review: "The review was", ui_propose_options: "The options were",
  ui_await_decision: "The wait was", ui_draft_action: "The draft was", ui_await_approvals: "The wait was", ui_final_report: "The report was"
};
