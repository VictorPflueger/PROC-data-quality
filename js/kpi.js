// Header tiles: the closure rate (the primary KPI), clean spend, open exceptions and the session cost.
// Before a run scans, the first three show the data as the exception log stands; a scan reconciles
// with the log and they follow it (kpi_update, stage "measured"). After an approved fix the closure
// rate keeps the measured rate and adds the projection after re-scan in its second line (stage
// "projected"): approved, re-scan pending, never closed. Every figure comes from the engine, and no
// tile sums spend across exceptions: the second lines count each order line once.

import { bus } from "./events.js";
import { h } from "./dom.js";
import { euro, euroCents, pct1, int } from "./format.js";
import { STORAGE } from "./config.js";

const CLOSURE_TIP = "Closure rate: among the exceptions first detected 14 to 69 days ago, the closed ones over those not dismissed. Only a re-scan that no longer finds an exception closes it.";

export function createKpis(container) {
  // Vici's stat card; a tile that shows a state takes that state's tone (css/style.css).
  const make = (id, label, sub) => {
    const value = h("div", { class: "vc-stat__value kpi-value", id: `kpi-${id}-value` }, "—");
    const subEl = h("div", { class: "vc-stat__note kpi-sub", id: `kpi-${id}-sub` }, sub);
    const el = h("div", { class: "vc-stat kpi", id: `kpi-${id}`, dataset: { tone: "muted" }, role: "group", "aria-label": label },
      h("div", { class: "vc-stat__label kpi-label" }, label), value, subEl);
    container.appendChild(el);
    return { el, value, sub: subEl };
  };
  const closure = make("closure", "Closure rate", "no history yet");
  const clean = make("clean", "Clean spend", "no data yet");
  const open = make("open", "Open exceptions", "no data yet");
  const cost = make("cost", "Session cost", "no model calls yet");

  let mode = null;
  let runCost = 0;
  let measured = null;   // the last measured figures, kept while a projection shows

  const set = (tile, text, tone, sub, title = sub) => {
    if (tile.value.textContent !== text) {
      tile.value.textContent = text;
      tile.value.classList.remove("flip");
      void tile.value.offsetWidth;
      tile.value.classList.add("flip");
    }
    if (tone !== undefined) tile.el.dataset.tone = tone;
    if (sub !== undefined) {
      tile.sub.textContent = sub;
      tile.sub.title = title;
    }
  };

  /**
   * Shows the data's figures: { closure_rate: { value, closed, eligible }, clean_share, clean_spend_eur,
   * spend_window_eur, open, open_spend_eur }, and where they come from ("log" or "scan").
   */
  function show(f, source = "log") {
    const cr = f.closure_rate;
    measured = { rate: cr.value, closed: cr.closed, eligible: cr.eligible };
    set(closure, cr.value === null ? "—" : pct1(cr.value), "",
      cr.value === null ? "no history yet" : `${int(cr.closed)} of ${int(cr.eligible)} closed`, CLOSURE_TIP);
    closure.el.dataset.stage = "measured";
    set(clean, f.clean_share === null ? "—" : pct1(f.clean_share), "", `${euro(f.clean_spend_eur)} of ${euro(f.spend_window_eur)}`,
      "Clean spend: the order lines of the last 365 days with no open, routed or accepted exception on the line, its supplier, material or contract.");
    set(open, int(f.open), "", `${euro(f.open_spend_eur)} affected`,
      `Exceptions that are open, routed or accepted${source === "log" ? ", as the exception log stands before a run scans" : ", after the run's scans reconciled with the log"}; the second line is the spend of their order lines, each line counted once.`);
    container.dataset.source = source;
  }

  bus.on("kpi_update", (ev) => {
    const p = ev.payload || {};
    if (p.stage === "projected") {
      // The measured rate stays; the projection is a what-if after re-scan, labelled as one.
      if (p.projected_closure_rate === null || p.projected_closure_rate === undefined) {
        set(closure, closure.value.textContent, "", "risk accepted: no fix, no projection", `${CLOSURE_TIP} The risk was accepted, so nothing is projected.`);
      } else {
        set(closure, measured?.rate === null || measured?.rate === undefined ? pct1(p.closure_rate) : pct1(measured.rate), "",
          `${pct1(p.projected_closure_rate)} projected after re-scan`,
          `${CLOSURE_TIP} Fix path ${p.path} is approved, re-scan pending: the projection is a what-if on a copy of the data with the approved changes, reconciled like a scan. Nothing counts as closed yet.`);
      }
      closure.el.dataset.stage = "projected";
      return;
    }
    show({
      closure_rate: { value: p.closure_rate ?? null, closed: p.closed, eligible: p.eligible },
      clean_share: p.clean_share ?? null, clean_spend_eur: p.clean_spend_eur, spend_window_eur: p.spend_window_eur,
      open: p.open_exceptions, open_spend_eur: p.open_spend_eur
    }, "scan");
  });

  bus.on("run_start", (ev) => {
    mode = ev.payload.mode;
    runCost = 0;
    renderCost();
  });

  bus.on("cost_update", (ev) => {
    if (ev.payload.simulated) { renderCost(); return; }
    runCost = Number(ev.payload.eur) || 0;
    renderCost();
  });

  bus.on("run_end", () => {
    if (mode === "live") {
      writeSessionCost(readSessionCost() + runCost);
      runCost = 0;
    }
    renderCost();
  });

  function renderCost() {
    const base = readSessionCost();
    const total = base + (mode === "live" ? runCost : 0);
    if (mode === "simulation" && total === 0) { set(cost, euroCents(0), "muted", "simulated, no cost"); return; }
    set(cost, euroCents(total), total > 0 ? "" : "muted", total > 0 ? (mode === "live" && runCost > 0 ? `this run ${euroCents(runCost)}` : "live runs in this tab") : "no model calls yet");
  }

  function reset() {
    mode = null;
    runCost = 0;
    renderCost();
  }

  renderCost();
  return { show, renderCost, reset };
}

function readSessionCost() {
  try { return Number(sessionStorage.getItem(STORAGE.sessionCost)) || 0; } catch { return 0; }
}

function writeSessionCost(v) {
  try { sessionStorage.setItem(STORAGE.sessionCost, String(v)); } catch { /* storage unavailable */ }
}
