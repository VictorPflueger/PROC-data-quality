// Header tiles: the closure rate (the primary KPI), clean spend, open exceptions and the session cost.
// Before a run scans, the first three show the data as the exception log stands; a scan reconciles
// with the log and they follow it. After an approved fix, the closure rate's second line shows the
// projection after re-scan, never a closure (the next milestone). Every figure comes from the engine.

import { h } from "./dom.js";
import { euro, euroCents, pct1, int } from "./format.js";
import { STORAGE } from "./config.js";

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
    set(closure, cr.value === null ? "—" : pct1(cr.value), "",
      cr.value === null ? "no history yet" : `${int(cr.closed)} of ${int(cr.eligible)} closed`,
      "Closure rate: among the exceptions first detected 14 to 69 days ago, the closed ones over those not dismissed. Only a re-scan that no longer finds an exception closes it.");
    set(clean, f.clean_share === null ? "—" : pct1(f.clean_share), "", `${euro(f.clean_spend_eur)} of ${euro(f.spend_window_eur)}`,
      "Clean spend: the order lines of the last 365 days with no open, routed or accepted exception on the line, its supplier, material or contract.");
    set(open, int(f.open), "", `${euro(f.open_spend_eur)} affected`,
      `Exceptions that are open, routed or accepted${source === "log" ? ", as the exception log stands before a run scans" : ""}; the second line is the spend of their order lines, each line counted once.`);
    container.dataset.source = source;
  }

  function renderCost() {
    let total = 0;
    try { total = Number(sessionStorage.getItem(STORAGE.sessionCost)) || 0; } catch { /* storage unavailable */ }
    set(cost, euroCents(total), total > 0 ? "" : "muted", total > 0 ? "live runs in this tab" : "no model calls yet");
  }
  renderCost();

  return { show, renderCost };
}
