// Self-tests run from the presenter's browser: the Claude API's reachability (or the stored key,
// with the free model list), the security policy, key handling and storage, and the world's
// integrity checks (js/world_check.js) against the frozen reference figures, and every simulation
// script under the live guardrails (js/sim_check.js).

import { ANTHROPIC, APP, STORAGE } from "./config.js";
import { checkKey, probeEndpoint } from "./anthropic.js";
import { getKey, redactSecrets } from "./keystore.js";
import { checkWorld } from "./world_check.js";
import { checkScripts } from "./sim_check.js";

/** The security policy of the page, exactly (TECH_NOTES §4). */
export const EXPECTED_POLICY = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src https://api.anthropic.com; object-src 'none'; base-uri 'none'; form-action 'none'";

export const TESTS = [
  { id: "anthropic", label: "Claude API", host: "api.anthropic.com", purpose: "The live agent: reachability, or your key with the free model list" },
  { id: "policy", label: "Security policy", host: "local", purpose: "The page may connect to api.anthropic.com only and loads nothing from another site" },
  { id: "privacy", label: "Key and storage", host: "local", purpose: "A key stays in this tab only, under this app's own name, and never reaches an export" },
  { id: "world", label: "World data integrity", host: "local", purpose: "The fictional company, the six scenarios and the frozen reference figures" },
  { id: "scripts", label: "Simulation scripts", host: "local", purpose: "Every scripted run passes the live guardrails along each decision path" }
];

const KEY_LIKE = /sk-ant-(?!\[REDACTED\])[A-Za-z0-9_-]{8,}/;

const RUNNERS = {
  async anthropic() {
    const key = getKey();
    if (!key) {
      const r = await probeEndpoint();
      return { status: r.ok ? "pass" : "fail", ms: r.ms, detail: r.ok ? `${r.detail} Add your key in Live mode to check it.` : r.detail };
    }
    const r = await checkKey(key);
    if (!r.ok) {
      const msg = r.status === 401 ? "Key rejected (401). Check that it is active and copied completely." : `${r.error?.type || "error"}: ${r.error?.message || ""}`;
      return { status: "fail", ms: r.ms, detail: msg };
    }
    const missing = r.missing.length ? ` Missing for this key: ${r.missing.join(", ")}.` : ` All three ${APP.name} models are available.`;
    return { status: r.missing.length ? "warn" : "pass", ms: r.ms, detail: `Key valid (free check, no tokens used).${missing}` };
  },
  async policy() {
    const issues = [];
    const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute("content") || "";
    if (csp !== EXPECTED_POLICY) issues.push(csp ? "the page's policy differs from the documented one" : "no security policy found");
    const connect = (/connect-src([^;]*)/.exec(csp)?.[1] || "").trim().split(/\s+/).filter(Boolean);
    const allowed = new URL(ANTHROPIC.messagesUrl).origin;
    if (connect.join(" ") !== allowed) issues.push(`connections allowed to ${connect.join(", ") || "nothing"}`);
    const inline = document.querySelectorAll("script:not([src])").length;
    const styled = document.querySelectorAll("[style]").length;
    // Element styles set from code (CSSOM) are allowed by the policy; markup with style="" is not.
    if (inline) issues.push(`${inline} inline script(s)`);
    const outside = [...document.querySelectorAll("script[src], link[href]")].map((el) => el.getAttribute("src") || el.getAttribute("href")).filter((u) => /^(https?:)?\/\//.test(u));
    if (outside.length) issues.push(`files from another site: ${outside.join(", ")}`);
    const text = issues.length ? `${issues.join("; ")}.` : `The policy is exactly the documented one: connections to ${allowed} only; no inline script; ${document.scripts.length} scripts and every stylesheet from this site${styled ? `; ${styled} element styles set from code` : ""}.`;
    return { status: issues.length ? "fail" : "pass", ms: null, detail: text };
  },
  async privacy() {
    const issues = [];
    const notes = [];
    const own = Object.values(STORAGE);
    const foreign = own.filter((k) => !k.startsWith(`${APP.id}.`));
    if (foreign.length) issues.push(`storage keys outside "${APP.id}.": ${foreign.join(", ")}`);
    else notes.push(`all ${own.length} storage keys start with "${APP.id}." (Vici's theme key vc-theme is the only shared one)`);
    let inLocal = false;
    try { for (let i = 0; i < localStorage.length; i++) if (KEY_LIKE.test(localStorage.getItem(localStorage.key(i)) || "")) inLocal = true; } catch { /* storage unavailable */ }
    if (inLocal) issues.push("an API key was found in local storage");
    notes.push(getKey() ? `your key is stored for this tab only (${STORAGE.apiKey})` : "no key stored");
    const sample = getKey() || "sk-ant-EXAMPLE-not-a-real-key-0000";
    if (redactSecrets(`x ${sample} y`).includes(sample)) issues.push("key redaction failed");
    else notes.push("key redaction checked");
    const text = issues.length ? `${issues.join("; ")}.` : `${notes.join("; ")}.`;
    return { status: issues.length ? "fail" : "pass", ms: null, detail: text.charAt(0).toUpperCase() + text.slice(1) };
  },
  async scripts() {
    const started = performance.now();
    const res = await checkScripts(globalThis.WORLD, globalThis.SIM_RUNS || {}, { scenarios: globalThis.SCENARIOS || [] });
    const passed = res.results.filter((r) => r.ok).length;
    const runs = res.results.reduce((t, r) => t + r.runs.length, 0);
    const bad = res.results.find((r) => !r.ok);
    const why = bad ? (bad.problems[0] || bad.runs.find((x) => !x.ok)?.problems[0] || "a decision path failed") : "";
    return {
      status: res.ok ? "pass" : "fail", ms: Math.round(performance.now() - started),
      detail: res.ok ? `${passed} of ${res.results.length} scripts pass the live guardrails along every decision path (${runs} runs through the live tools).` : `${passed} of ${res.results.length} scripts pass; ${bad.id}: ${why}.`
    };
  },
  async world() {
    const started = performance.now();
    const res = checkWorld(globalThis.WORLD, globalThis.SCENARIOS || [], globalThis.REFERENCE_CASES || null);
    const passed = res.checks.filter((c) => c.ok).length;
    return { status: res.ok ? "pass" : "fail", ms: Math.round(performance.now() - started), detail: `${passed}/${res.checks.length} integrity checks passed.`, checks: res.checks };
  }
};

/** Runs one test. */
export async function runTest(id) {
  const fn = RUNNERS[id];
  if (!fn) return { status: "skip", detail: "Unknown test." };
  try { return await fn(); } catch (e) { return { status: "fail", ms: null, detail: `The test failed to run: ${e?.message || e}` }; }
}

/** Runs all tests in parallel, reporting each result as it arrives. */
export async function runAll(onResult) {
  const results = {};
  await Promise.all(TESTS.map(async (t) => {
    onResult?.(t.id, { status: "running" });
    const r = await runTest(t.id);
    results[t.id] = r;
    onResult?.(t.id, r);
  }));
  return results;
}
