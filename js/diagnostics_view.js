// Diagnostics dialog: the self-tests of js/diagnostics.js, the world's integrity checks, the method's
// parameters (read-only here: the values Live runs use, edited and logged in the Method dialog) and the
// exchange rate with its source and date.

import { h, clear } from "./dom.js";
import { icon } from "./icons.js";
import { openModal } from "./modal.js";
import { TESTS, runAll, runTest } from "./diagnostics.js";
import { APP } from "./config.js";
import { PARAMS, PARAM_LABELS } from "./params.js";
import { liveParams } from "./settings.js";
import { paramText } from "./method.js";
import { RULE_SET_VERSION } from "./rules.js";
import { ENGINE_VERSION } from "./engine.js";
import { int } from "./format.js";

const STATUS_TEXT = { pass: "Pass", fail: "Fail", warn: "Check", skip: "Skipped", running: "Testing", idle: "Not run" };
const STATUS_ICON = { pass: "check", fail: "x", warn: "alert", skip: "info", idle: "info" };
// Each status is a Vici tag in its tone, with its icon and its word; skipped and not run are plain.
const STATUS_TAG = { pass: "vc-tag--success", fail: "vc-tag--danger", warn: "vc-tag--warning", running: "vc-tag--info", skip: "", idle: "" };

export function openDiagnostics() {
  const rows = new Map();
  const tbody = h("tbody");
  for (const t of TESTS) {
    const statusCell = h("td", { class: "status" });
    const msCell = h("td", { class: "ms vc-tabular" }, "");
    const detailCell = h("td", { class: "detail" }, t.purpose);
    tbody.appendChild(h("tr", { dataset: { test: t.id } },
      h("td", {}, h("strong", {}, t.label), h("span", { class: "host" }, t.host)),
      statusCell, msCell, detailCell));
    rows.set(t.id, { statusCell, msCell, detailCell });
    setRow(t.id, { status: "idle" });
  }
  const worldList = h("ul", { class: "world-checks" });

  function setRow(id, r) {
    const row = rows.get(id);
    if (!row) return;
    const s = r.status || "idle";
    clear(row.statusCell).appendChild(h("span", { class: ["vc-tag", STATUS_TAG[s] || "", "diag-status"], dataset: { s } },
      s === "running" ? h("span", { class: "vc-spinner vc-spinner--sm", "aria-hidden": "true" }) : icon(STATUS_ICON[s] || "info", 16), STATUS_TEXT[s] || s));
    row.msCell.textContent = r.ms ? `${r.ms} ms` : "";
    if (r.detail) row.detailCell.textContent = r.detail;
    if (id === "world" && r.checks) {
      clear(worldList);
      for (const c of r.checks) {
        const st = c.ok ? "pass" : "fail";
        worldList.appendChild(h("li", { dataset: { ok: String(!!c.ok) } },
          h("span", { class: ["vc-tag", STATUS_TAG[st], "world-mark"] }, icon(STATUS_ICON[st], 14), STATUS_TEXT[st]),
          h("span", {}, `${c.name}${c.detail ? ` — ${c.detail}` : ""}`)));
      }
    }
  }

  const live = liveParams();
  const params = h("table", { class: "vc-table vc-table--compact params-table", id: "diag-params" },
    h("caption", { class: "vc-visually-hidden" }, "The method's parameters for Live runs, all assumptions"),
    h("tbody", {}, Object.entries(live).map(([k, v]) => h("tr", { dataset: { param: k, changed: String(v !== PARAMS[k]) } },
      h("th", { scope: "row" }, PARAM_LABELS[k][0]),
      h("td", { class: "num" }, paramText(k, v), v !== PARAMS[k] ? h("span", { class: "param-default" }, ` (default ${paramText(k, PARAMS[k])})`) : null)))));
  const changedCount = Object.keys(live).filter((k) => live[k] !== PARAMS[k]).length;
  const meta = globalThis.WORLD?.meta || {};
  const fx = meta.fx_to_eur || {};

  const runBtn = h("button", { class: "vc-button", type: "button", autofocus: true }, icon("pulse", 18), "Run all tests");
  runBtn.addEventListener("click", async () => {
    if (runBtn.getAttribute("aria-disabled") === "true") return;
    runBtn.setAttribute("aria-disabled", "true");
    await runAll(setRow);
    runBtn.setAttribute("aria-disabled", "false");
  });

  const modal = openModal({
    title: "Diagnostics",
    intro: "Checks the Claude API from this browser, the page's security policy, how a key would be kept, and the fictional company's data against its frozen reference figures.",
    size: "wide",
    body: [
      h("div", { class: "vc-table-wrap diag-wrap" },
        h("table", { class: "vc-table diag-table" },
          h("thead", {}, h("tr", {}, h("th", {}, "Test"), h("th", {}, "Status"), h("th", {}, "Time"), h("th", {}, "Details"))),
          tbody)),
      h("div", { class: "diag-section" },
        h("h3", {}, "World data integrity"),
        h("p", {}, "Checks run locally on the fictional company: data contracts, references, the shared accounts, VAT IDs that fail their check digits, a log that agrees with the data, the six scenarios and the frozen figures."),
        worldList),
      h("div", { class: "diag-section diag-params" },
        h("h3", {}, "Parameters (assumptions, read-only here)"),
        h("p", {}, `The values Live runs use${changedCount ? `, ${changedCount} changed from the defaults` : ", all at their defaults"}. They are changed only in the Method dialog, where every change is logged; Simulation always runs on the defaults, so the scripted runs stay valid.`),
        params),
      h("div", { class: "diag-section" },
        h("h3", {}, "Exchange rate and versions"),
        h("p", { id: "diag-fx" }, `1 GBP = ${fx.GBP} EUR, one rate for the whole window: ${meta.fx_source || "source not recorded"}.`),
        h("p", { id: "diag-versions" }, `${APP.name} ${APP.version} · rule set ${RULE_SET_VERSION} · engine ${ENGINE_VERSION} · world ${meta.world_version || "?"} (seed ${meta.seed ?? "?"}, ${int(globalThis.WORLD?.po_lines?.length || 0)} order lines)`))
    ],
    footer: [
      h("span", { class: "dialog-note" }, `${APP.name} ${APP.version}. Run this on the presentation laptop and network before going on stage.`),
      runBtn
    ]
  });

  // The local checks are instant: show them straight away.
  for (const id of ["policy", "privacy", "world"]) runTest(id).then((r) => setRow(id, r));
  return modal;
}
