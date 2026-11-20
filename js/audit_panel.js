// Audit tab: chronological log of every event and every model call, with filters, JSON export and
// "Save run as simulation" (enabled after a completed live run of a preset scenario).

import { h, clear, downloadText, setDisabled } from "./dom.js";
import { icon } from "./icons.js";
import { clock, timeOfDay, int, pct1 } from "./format.js";
import { auditRows, onAuditEvent, buildAuditExport, auditFileName } from "./audit.js";
import { canRecord, saveRunAsSimulation } from "./recorder.js";

const GROUPS = {
  all: { label: "All", types: null },
  agent: { label: "Agent", types: ["narration", "reasoning", "alert", "options", "action_draft", "report"] },
  tools: { label: "Tools", types: ["tool_call", "tool_result"] },
  model: { label: "Model calls", types: ["model_call"] },
  human: { label: "Human decisions", types: ["confirmation_request", "confirmation_decision", "option_decision", "action_decision"] },
  system: { label: "System", types: ["run_start", "run_end", "state_change", "notice", "board_update", "kpi_update", "cost_update", "attempt_discarded"] }
};

export function createAuditPanel(panel, { onCount } = {}) {
  let filter = "all";
  const filterBtns = new Map();
  const tbody = h("tbody");
  const status = h("div", { class: "vc-alert vc-alert--success audit-status", role: "status", hidden: true });
  const saveBtn = h("button", { class: "vc-button vc-button--outline button-compact", type: "button", id: "btn-save-sim", on: { click: saveSimulation } }, icon("download", 16), "Save run as simulation");
  const head = h("div", { class: "audit-head" },
    h("div", { class: "audit-filters", role: "group", "aria-label": "Filter audit events" },
      Object.entries(GROUPS).map(([id, g]) => {
        // Toggles the app owns (aria-pressed), in Vici's pressed look.
        const b = h("button", { class: "vc-button vc-button--outline button-compact", type: "button", "aria-pressed": String(id === filter) }, g.label);
        b.addEventListener("click", () => { filter = id; for (const [fid, fb] of filterBtns) fb.setAttribute("aria-pressed", String(fid === id)); renderAll(); });
        filterBtns.set(id, b);
        return b;
      })),
    h("div", { class: "audit-actions" },
      saveBtn,
      h("button", { class: "vc-button button-compact", type: "button", id: "btn-export", on: { click: exportJson } }, icon("download", 16), "Export JSON")));
  // Vici's table; its wrapper clips without scrolling, so the header row sticks while the drawer scrolls.
  const table = h("div", { class: "vc-table-wrap audit-wrap" },
    h("table", { class: "vc-table vc-table--compact audit-table" },
      h("thead", {}, h("tr", {}, h("th", {}, "Run time"), h("th", {}, "Clock"), h("th", {}, "Event"), h("th", {}, "Details"))),
      tbody));
  panel.append(head, status, table);

  function matches(ev) {
    const g = GROUPS[filter];
    return !g.types || g.types.includes(ev.type);
  }

  function row(ev) {
    return h("tr", { dataset: { type: ev.type } },
      h("td", { class: "t" }, ev.t !== null && ev.t !== undefined ? clock(ev.t) : "—"),
      h("td", { class: "t" }, timeOfDay(ev.ts)),
      h("td", { class: "k" }, h("span", { class: "audit-kind" }, ev.type)),
      h("td", { class: "s" }, summarize(ev)));
  }

  function updateSave() {
    const can = canRecord();
    setDisabled(saveBtn, !can.ok, can.reason);
  }

  function renderAll() {
    clear(tbody);
    const rows = auditRows();
    for (const ev of rows) if (matches(ev)) tbody.appendChild(row(ev));
    onCount?.(rows.length);
    updateSave();
  }

  onAuditEvent((ev) => {
    if (matches(ev)) tbody.appendChild(row(ev));
    onCount?.(auditRows().length);
    if (ev.type === "run_end" || ev.type === "run_start") {
      updateSave();
      if (ev.type === "run_start") setStatus("");
    }
  });

  function exportJson() {
    downloadText(auditFileName(), buildAuditExport());
  }

  async function saveSimulation() {
    if (saveBtn.getAttribute("aria-disabled") === "true") return;
    const r = await saveRunAsSimulation();
    setStatus(r.message, r.ok && r.ready ? "ok" : r.ok ? "warn" : "error");
  }

  function setStatus(text, tone = "ok") {
    status.textContent = text || "";
    status.dataset.tone = tone;
    status.className = `vc-alert ${tone === "error" ? "vc-alert--danger" : tone === "warn" ? "vc-alert--warning" : "vc-alert--success"} audit-status`;
    status.hidden = !text;
  }

  renderAll();
  return {
    refresh: () => { setStatus(""); renderAll(); },
    saveSimulation: async () => { const r = await saveRunAsSimulation(); setStatus(r.message, r.ok && r.ready ? "ok" : r.ok ? "warn" : "error"); return r; }
  };
}

function summarize(ev) {
  const p = ev.payload || {};
  switch (ev.type) {
    case "run_start": return `${p.mode?.toUpperCase()} run "${p.title}"${p.model ? ` on ${p.model}` : ""}${p.sim_source === "recorded" ? " (replay of a recorded live run)" : ""}`;
    case "run_end": return `${p.status}${p.reason ? `: ${p.reason}` : ""}`;
    case "state_change": return p.state;
    case "narration": return trim(p.text, 220);
    case "reasoning": return trim(p.text, 200);
    case "tool_call": return `${p.name} ${trim(JSON.stringify(p.input || {}), 200)}`;
    case "tool_result": return `${p.name}: ${p.ok === false ? "REFUSED " : ""}${trim(p.summary || "", 200)}`;
    case "model_call": return `Step ${p.step}: ${p.messages_total ?? "?"} messages sent, stop reason ${p.stop_reason || "?"}, ${int(p.input_tokens)} in / ${int(p.output_tokens)} out tokens${p.cache_read_tokens ? ` (${int(p.cache_read_tokens)} from cache)` : ""}${p.duration_ms ? `, ${(p.duration_ms / 1000).toFixed(1)} s` : ""}${p.request_id ? `, request ${p.request_id}` : ""}`;
    case "alert": return `[${p.severity}] ${p.title}${p.unchecked ? " (unchecked)" : ""}`;
    case "board_update": return [p.state, p.scan ? `scan ${p.scan.id}: ${int(p.scan.exceptions?.length || 0)} exceptions` : null,
      p.focus ? `focus ${p.focus.key || ""}=${p.focus.value ?? ""}` : null, p.ai ? `${int(p.ai.length)} AI suggestions` : null,
      p.approved ? `approved path ${p.approved.path}` : null,
      ...["rules", "records", "people"].map((k) => (p[k]?.length ? `${k}: ${p[k].slice(0, 8).join(", ")}${p[k].length > 8 ? " …" : ""}` : null))]
      .filter(Boolean).join(" · ");
    case "kpi_update": return p.stage === "projected"
      ? `projected closure rate ${pct1(p.projected_closure_rate)} with path ${p.path} (measured ${pct1(p.closure_rate)})`
      : `closure rate ${pct1(p.closure_rate)}, clean spend ${pct1(p.clean_share)}, ${int(p.open_exceptions)} open exceptions`;
    case "confirmation_request": return `review ${p.review_id}: ${int((p.items || []).length)} AI suggestions`;
    case "confirmation_decision": {
      const d = p.decisions || [];
      return `review ${p.review_id}: ${int(d.filter((x) => x.decision === "approved").length)} approved, ${int(d.filter((x) => x.decision === "rejected").length)} rejected`;
    }
    case "options": return `${(p.options || []).length} fix paths (recommended ${p.recommended}) and doing nothing`;
    case "option_decision": return `${p.decision}: ${p.option_label || p.option_id}${p.options_seq ? ` (options set ${p.options_seq})` : ""}${p.note ? ` — "${trim(p.note, 80)}"` : ""}`;
    case "action_draft": return `${p.kind} to ${p.recipient}: ${p.subject}`;
    case "action_decision": return `${p.decision}: ${p.label || p.action_id}`;
    case "report": return `${p.outcome}: ${trim(p.markdown, 180)}`;
    case "cost_update": return p.simulated ? "simulated (no cost)" : `€${Number(p.eur || 0).toFixed(4)} (${p.input_tokens || 0} in / ${p.output_tokens || 0} out tokens)`;
    case "notice": return `[${p.level}] ${p.text}`;
    case "attempt_discarded": return `response not kept (${(p.msg_ids || []).length} text, ${(p.call_ids || []).length} tool calls): ${p.reason || ""}`;
    default: return trim(JSON.stringify(p), 200);
  }
}

function trim(s, n) {
  s = String(s ?? "");
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
