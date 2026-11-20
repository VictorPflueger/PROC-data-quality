// The four key figures top right. Each starts from a value that makes sense before anything happens
// and moves with the steps; every figure comes from the engine's results in the run, the page's own
// clock or the session-cost estimate, never from the agent's words.
//   Cost avoided          the financing cost the approved fix avoids a year (fix paths), and at once
//   Records fixed         the records the approved fix corrects (projected until a re-scan)
//   Detection → decision  the time from the scan to your decision; below it the oldest exception's wait
//   Session cost          measured in Live, estimated in Simulation (js/estimate.js)

import { euro, euroCents, int } from "./format.js";
import { approved, lastResult } from "./run_model.js";
import { ageOf, scanFacts } from "./facts.js";

/** "3:07" from milliseconds. */
export const clock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const daysText = (d) => `${int(d)} ${d === 1 ? "day" : "days"}`;

export function createKpis(root) {
  const tile = (id) => {
    const el = root.querySelector(`#${id}`);
    return { el, value: el.querySelector(".kpi-value"), unit: el.querySelector(".kpi-unit"), note: el.querySelector(".kpi-note") };
  };
  const tiles = { cost: tile("kpi-cost"), fixed: tile("kpi-fixed"), time: tile("kpi-time"), session: tile("kpi-session") };

  function set(t, { value, unit = "", note = "", state = "idle" }) {
    if (t.value.textContent !== value) {
      t.value.textContent = value;
      t.value.classList.remove("flip");
      void t.value.offsetWidth;
      t.value.classList.add("flip");
    }
    if (t.unit.textContent !== unit) t.unit.textContent = unit;
    if (t.note.textContent !== note) { t.note.textContent = note; t.note.title = note; }
    t.el.dataset.state = state;
  }

  /**
   * run: the run model; ctx: { world, estimate (snapshot or null), scanWall, decisionWall, now }
   * (wall times from performance.now()).
   */
  function render(run, { world, estimate, scanWall, decisionWall, now }) {
    const scan = run.scans[run.scans.length - 1] || null;
    const facts = scan ? scanFacts(world, scan) : null;
    const alert = run.alert;
    const fp = lastResult(run, "dq_fix_paths");
    const nothing = fp?.paths?.nothing || run.options?.nothing?.figures || null;
    const atStake = nothing ? Number(nothing.gains_cost_eur_per_year) || 0 : null;
    const ok = approved(run);
    const caseIds = alert?.exception_ids || null;
    const age = caseIds ? ageOf(world, caseIds) : facts;
    const n = alert ? alert.exceptions : facts?.n ?? 0;

    // Cost avoided
    if (ok && !ok.nothing && ok.option) {
      const f = ok.option.figures;
      const yearly = Number(f.future_avoided_eur_per_year) || 0;
      const now0 = Number(f.avoided_now_eur) || 0;
      set(tiles.cost, {
        value: euro(yearly), unit: "a year",
        note: now0 > 0 ? `and ${euro(now0)} at once` : atStake > 0 && yearly === 0 ? `${euro(atStake)} a year goes on` : atStake === 0 ? "no interest cost here" : "",
        state: yearly > 0 || now0 > 0 ? "gain" : atStake > 0 ? "risk" : "idle"
      });
    } else if (ok && ok.nothing) {
      set(tiles.cost, { value: euro(0), unit: "a year", note: atStake > 0 ? `${euro(atStake)} a year goes on` : "risk accepted", state: atStake > 0 ? "risk" : "idle" });
    } else if (atStake !== null) {
      set(tiles.cost, { value: euro(0), unit: "a year", note: atStake > 0 ? `${euro(atStake)} a year at stake` : "no interest cost here", state: atStake > 0 ? "risk" : "idle" });
    } else {
      set(tiles.cost, { value: euro(0), unit: "a year", note: run.status === "idle" ? "nothing costed yet" : "costed in step 3", state: "idle" });
    }

    // Records fixed
    if (ok && !ok.nothing && ok.option) {
      const f = ok.option.figures;
      const projected = f.id === "A" || f.id === "C" || /mass/i.test(f.title || "");
      set(tiles.fixed, { value: int(f.closed), unit: `of ${int(n)}`, note: projected ? "projected after re-scan" : "expected, from history", state: f.closed > 0 ? "gain" : "idle" });
    } else if (ok && ok.nothing) {
      set(tiles.fixed, { value: "0", unit: `of ${int(n)}`, note: "risk accepted", state: "risk" });
    } else if (facts) {
      set(tiles.fixed, { value: "0", unit: `of ${int(n)}`, note: alert ? `${euro(alert.spend_eur)} of orders` : `${int(facts.n)} flagged`, state: "idle" });
    } else {
      set(tiles.fixed, { value: "0", note: "nothing scanned yet", state: "idle" });
    }

    // Detection → decision
    if (scanWall !== null && scanWall !== undefined) {
      const end = decisionWall ?? now;
      const waited = age && age.before ? `oldest waited ${daysText(age.oldestDays)}` : "all found today";
      set(tiles.time, {
        value: clock(end - scanWall), unit: "min",
        note: waited,
        state: decisionWall !== null && decisionWall !== undefined ? "gain" : run.waiting === "decision" ? "yours" : "idle"
      });
    } else {
      set(tiles.time, { value: "0:00", unit: "min", note: "starts with the scan", state: "idle" });
    }

    // Session cost
    if (run.mode === "live") {
      const eur = Number(run.cost?.eur) || 0;
      set(tiles.session, { value: euroCents(eur), note: run.status === "running" ? "measured, run going" : "measured, this run", state: "idle" });
    } else if (run.mode === "simulation" && estimate) {
      set(tiles.session, { value: `≈ ${euroCents(estimate.eur)}`, note: "estimate if run live", state: "idle" });
    } else {
      set(tiles.session, { value: euroCents(0), note: "no run yet", state: "idle" });
    }
  }

  return { render };
}
