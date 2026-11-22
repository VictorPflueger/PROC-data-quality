// The four key figures top right. They answer first: before anything runs they show the case as the
// engine works it out (the preview, from the case's script run once in the background, js/app.js), and
// the run itself then shows the same figures as it reaches them. When the decision moves a figure, its
// tile keeps the old value struck through (Vici's vc-stat__was) before the new one. Every figure comes
// from the engine's results, the page's own clock or the session-cost estimate, never from the agent's
// words.
//   At stake a year       the financing cost a year if nothing changes; after the decision, what is left
//   Records fixed         the records the approved fix corrects (projected until a re-scan)
//   Detection → decision  the time from the scan to your decision, beside the oldest exception's wait
//   Session cost          measured in a live run, estimated for a simulation (js/estimate.js)

import { euro, euroCents, int } from "./format.js";
import { approved, lastResult } from "./run_model.js";
import { ageOf, scanFacts } from "./facts.js";

/** "3:07" from milliseconds. */
export const clock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const daysText = (d) => `${int(d)} ${d === 1 ? "day" : "days"}`;

/**
 * The figures of one case before anything runs, from a run of its script (js/app.js): the yearly cost
 * at stake, the records and their spend, how long the oldest has waited, the estimated session cost.
 */
export function previewOf({ world, alert, fixPaths, estimate }) {
  const nothing = fixPaths?.paths?.nothing || null;
  const age = alert ? ageOf(world, alert.exception_ids || []) : null;
  return {
    atStake: nothing ? Number(nothing.gains_cost_eur_per_year) || 0 : null,
    n: alert ? alert.exceptions : null,
    spend: alert ? alert.spend_eur : null,
    oldestDays: age && age.before ? age.oldestDays : 0,
    estimateEur: estimate ? estimate.eur : null
  };
}

export function createKpis(root) {
  const tile = (id) => {
    const el = root.querySelector(`#${id}`);
    return { el, was: el.querySelector(".kpi-was"), now: el.querySelector(".kpi-now"), value: el.querySelector(".kpi-value"), unit: el.querySelector(".kpi-unit"), note: el.querySelector(".kpi-note") };
  };
  const tiles = { cost: tile("kpi-cost"), fixed: tile("kpi-fixed"), time: tile("kpi-time"), session: tile("kpi-session") };

  function set(t, { value, unit = "", note = "", state = "idle", was = "" }) {
    if (t.value.textContent !== value) {
      t.value.textContent = value;
      t.value.classList.remove("flip");
      void t.value.offsetWidth;
      t.value.classList.add("flip");
    }
    if (t.was.textContent !== was) t.was.textContent = was;
    t.was.hidden = !was;
    t.now.hidden = !was;
    if (t.unit.textContent !== unit) t.unit.textContent = unit;
    if (t.note.textContent !== note) { t.note.textContent = note; t.note.title = note; }
    t.el.dataset.state = state;
  }

  /**
   * run: the run model; ctx: { world, preview (previewOf, or null), estimate (snapshot or null),
   * scanWall, decisionWall, now } (wall times from performance.now()).
   */
  function render(run, { world, preview, estimate, scanWall, decisionWall, now }) {
    const live = run.mode === "live";
    // A live run shows only what it has found itself; a simulation is the preview's run, so the preview
    // stands in until the run reaches a figure.
    const pre = live ? null : preview;
    const scan = run.scans[run.scans.length - 1] || null;
    const facts = scan ? scanFacts(world, scan) : null;
    const alert = run.alert;
    const fp = lastResult(run, "dq_fix_paths");
    const nothing = fp?.paths?.nothing || run.options?.nothing?.figures || null;
    const atStake = nothing ? Number(nothing.gains_cost_eur_per_year) || 0 : pre?.atStake ?? null;
    const ok = approved(run);
    const n = alert ? alert.exceptions : pre?.n ?? facts?.n ?? null;
    const spend = alert ? alert.spend_eur : pre?.spend ?? null;
    const caseIds = alert?.exception_ids || null;
    const age = caseIds ? ageOf(world, caseIds) : facts && !pre ? facts : null;
    const oldest = age ? (age.before ? age.oldestDays : 0) : pre?.oldestDays ?? null;

    // At stake a year
    if (atStake === null) {
      set(tiles.cost, { value: "…", note: run.status === "idle" ? "costed once the agent runs" : "costed in step 3" });
    } else if (ok && !ok.nothing && ok.option) {
      const f = ok.option.figures;
      const avoided = Math.min(atStake, Number(f.future_avoided_eur_per_year) || 0);
      const now0 = Number(f.avoided_now_eur) || 0;
      const left = atStake - avoided;
      if (avoided > 0) {
        set(tiles.cost, { was: euro(atStake), value: euro(left), note: left > 0 ? `path ${f.id} avoids ${euro(avoided)}` : `avoided by path ${f.id}`, state: "gain" });
      } else if (atStake > 0) {
        set(tiles.cost, { value: euro(atStake), note: now0 > 0 ? `goes on; ${euro(now0)} avoided at once` : "goes on with this path", state: "risk" });
      } else {
        set(tiles.cost, { value: euro(0), note: now0 > 0 ? `${euro(now0)} avoided at once` : "no interest cost in this case", state: now0 > 0 ? "gain" : "idle" });
      }
    } else if (ok && ok.nothing) {
      set(tiles.cost, { value: euro(atStake), note: atStake > 0 ? "risk accepted: it goes on" : "risk accepted", state: atStake > 0 ? "risk" : "idle" });
    } else {
      set(tiles.cost, { value: euro(atStake), note: atStake > 0 ? "if nothing changes" : "no interest cost in this case", state: atStake > 0 ? "risk" : "idle" });
    }

    // Records fixed
    if (n === null) {
      set(tiles.fixed, { value: "0", note: run.status === "idle" ? "counted once the agent runs" : "the rules are running" });
    } else if (ok && !ok.nothing && ok.option) {
      const f = ok.option.figures;
      const projected = f.id === "A" || f.id === "C" || /mass/i.test(f.title || "");
      set(tiles.fixed, { was: f.closed > 0 ? "0" : "", value: int(f.closed), unit: `of ${int(n)}`, note: projected ? "projected after re-scan" : "expected, from history", state: f.closed > 0 ? "gain" : "idle" });
    } else if (ok && ok.nothing) {
      set(tiles.fixed, { value: "0", unit: `of ${int(n)}`, note: "risk accepted", state: "risk" });
    } else {
      set(tiles.fixed, { value: "0", unit: `of ${int(n)}`, note: spend !== null ? `${euro(spend)} of orders` : `${int(n)} flagged`, state: "idle" });
    }

    // Detection → decision
    const waited = oldest === null ? "starts with the scan" : oldest > 0 ? `oldest waited ${daysText(oldest)}` : "all found today";
    if (scanWall !== null && scanWall !== undefined) {
      const end = decisionWall ?? now;
      set(tiles.time, {
        value: clock(end - scanWall), unit: "min", note: waited,
        state: decisionWall !== null && decisionWall !== undefined ? "gain" : run.waiting === "decision" ? "yours" : "idle"
      });
    } else {
      set(tiles.time, { value: "0:00", unit: "min", note: waited, state: "idle" });
    }

    // Session cost
    if (live) {
      const eur = Number(run.cost?.eur) || 0;
      set(tiles.session, { value: euroCents(eur), note: run.status === "running" ? "measured, run going" : "measured, this run", state: "idle" });
    } else {
      const eur = pre?.estimateEur ?? estimate?.eur ?? null;
      set(tiles.session, { value: eur === null ? "…" : `≈ ${euroCents(eur)}`, note: "estimate if run live", state: "idle" });
    }
  }

  return { render };
}
