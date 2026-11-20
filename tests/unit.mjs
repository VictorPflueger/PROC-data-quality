// Unit tests (Node.js 20 or later; no browser needed), in three parts:
//   1. the shared streaming client and cost maths: SSE parsing and message reconstruction in
//      js/anthropic.js with a mocked fetch, retries, aborts, truncated streams, the price table in js/cost.js;
//   2. the data contracts (js/schemas.js) and the app's own JSON-Schema validator (js/validate.js): the
//      fixture world, the engine's exceptions and fix paths and the built world validate, planted
//      violations are refused with instructive messages, an unknown keyword is a schema error;
//   3. the display formats of js/format.js.
// Usage: node tests/unit.mjs
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { APP_ROOT } from "./lib/harness.mjs";

const mod = (p) => import(pathToFileURL(path.join(APP_ROOT, p)).href);
const { streamMessage, ApiError, withRetry } = await mod("js/anthropic.js");
const { usageCostUsd, createCostTracker } = await mod("js/cost.js");

function sse(events, { crlf = false } = {}) {
  const nl = crlf ? "\r\n" : "\n";
  return events.map(([ev, data]) => `event: ${ev}${nl}data: ${JSON.stringify(data)}${nl}${nl}`).join("");
}
function chunked(text, sizes) {
  const enc = new TextEncoder().encode(text);
  const parts = [];
  let i = 0, k = 0;
  while (i < enc.length) { const n = sizes[k++ % sizes.length]; parts.push(enc.slice(i, i + n)); i += n; }
  return new ReadableStream({ start(c) { for (const p of parts) c.enqueue(p); c.close(); } });
}
const events = [
  ["message_start", { type: "message_start", message: { id: "msg_1", model: "claude-sonnet-5-5", role: "assistant", content: [], usage: { input_tokens: 1200, cache_creation_input_tokens: 3000, cache_read_input_tokens: 0, output_tokens: 3 } } }],
  ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } }],
  ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Check the scan " } }],
  ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "first." } }],
  ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "SIG==abc" } }],
  ["content_block_stop", { type: "content_block_stop", index: 0 }],
  ["ping", { type: "ping" }],
  ["content_block_start", { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } }],
  ["content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Hypothesis: the punch-out catalog " } }],
  ["content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "drops the contract — Lyon ✓" } }],
  ["content_block_stop", { type: "content_block_stop", index: 1 }],
  ["content_block_start", { type: "content_block_start", index: 2, content_block: { type: "tool_use", id: "toolu_1", name: "erp_get_record", input: {} } }],
  ["content_block_delta", { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: "{\"product\": \"po_line\", \"i" } }],
  ["content_block_delta", { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: "d\": \"L03\"}" } }],
  ["content_block_stop", { type: "content_block_stop", index: 2 }],
  ["content_block_start", { type: "content_block_start", index: 3, content_block: { type: "tool_use", id: "toolu_2", name: "erp_get_overview", input: {} } }],
  ["content_block_stop", { type: "content_block_stop", index: 3 }],
  ["message_delta", { type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 240, server_tool_use: { web_search_requests: 0 } } }],
  ["message_stop", { type: "message_stop" }]
];
for (const [label, crlf, sizes] of [["lf small chunks", false, [7, 13, 1, 50]], ["crlf odd chunks", true, [3, 1, 2, 97, 5]], ["one chunk", false, [100000]]]) {
  globalThis.fetch = async () => new Response(chunked(sse(events, { crlf }), sizes), { status: 200, headers: { "content-type": "text/event-stream", "request-id": "req_123" } });
  const texts = [];
  const r = await streamMessage({ key: "k", body: { model: "claude-sonnet-5-5", messages: [] }, hooks: { onText: (i, t) => texts.push(t) } });
  const m = r.message;
  assert.equal(m.stop_reason, "tool_use", label);
  assert.equal(m.content.length, 4, label);
  assert.deepEqual(m.content[0], { type: "thinking", thinking: "Check the scan first.", signature: "SIG==abc" }, label);
  assert.equal(m.content[1].text, "Hypothesis: the punch-out catalog drops the contract — Lyon ✓", label);
  assert.deepEqual(m.content[2].input, { product: "po_line", id: "L03" }, label);
  assert.deepEqual(m.content[3].input, {}, label);
  assert.equal(m.usage.output_tokens, 240, label);
  assert.equal(m.usage.cache_creation_input_tokens, 3000, label);
  assert.equal(r.requestId, "req_123");
  assert.ok(texts.length >= 2);
  console.log("ok:", label);
}
// Mid-stream error
globalThis.fetch = async () => new Response(chunked(sse([events[0], ["error", { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }]]), [11]), { status: 200 });
await assert.rejects(() => streamMessage({ key: "k", body: {} }), (e) => e instanceof ApiError && e.type === "overloaded_error" && e.retryable && e.midStream);
console.log("ok: mid-stream error");
// HTTP error with retry-after
globalThis.fetch = async () => new Response(JSON.stringify({ type: "error", error: { type: "rate_limit_error", message: "slow down" }, request_id: "req_9" }), { status: 429, headers: { "retry-after": "1" } });
await assert.rejects(() => streamMessage({ key: "k", body: {} }), (e) => e.status === 429 && e.retryAfter === "1" && e.retryable);
console.log("ok: 429");
// spend limit not retryable
const spend = new ApiError({ status: 429, type: "rate_limit_error", message: "x", details: { error_code: "enforced_spend_limit_reached" } });
assert.equal(spend.retryable, false);
// withRetry: succeeds on third attempt
let n = 0;
const v = await withRetry(async () => { n++; if (n < 3) throw new ApiError({ status: 529, type: "overloaded_error", message: "o" }); return 42; }, { retries: 2 });
assert.equal(v, 42); assert.equal(n, 3);
console.log("ok: withRetry");
// Incomplete tool input (max_tokens)
const cut = [events[0], ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_x", name: "ui_draft_action", input: {} } }],
  ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{\"subject\": \"Contract refer" } }],
  ["content_block_stop", { type: "content_block_stop", index: 0 }],
  ["message_delta", { type: "message_delta", delta: { stop_reason: "max_tokens" }, usage: { output_tokens: 16000 } }]];
globalThis.fetch = async () => new Response(chunked(sse(cut), [64]), { status: 200 });
const rc = await streamMessage({ key: "k", body: {} });
assert.equal(rc.message.stop_reason, "max_tokens"); assert.ok(rc.incomplete.has(0));
console.log("ok: incomplete tool input flagged");
// Abort
const ac = new AbortController();
globalThis.fetch = async (url, init) => new Promise((res, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))));
setTimeout(() => ac.abort(), 20);
await assert.rejects(() => streamMessage({ key: "k", body: {}, signal: ac.signal }), (e) => e.name === "AbortError");
console.log("ok: abort");
// Cost maths
const usd = usageCostUsd("claude-sonnet-5-5", { input_tokens: 1200, cache_creation_input_tokens: 3000, cache_read_input_tokens: 10000, output_tokens: 240, server_tool_use: { web_search_requests: 2 } });
const expected = 1200 * 2 / 1e6 + 3000 * 2.5 / 1e6 + 10000 * 0.1 / 1e6 + 240 * 10 / 1e6 + 2 * 0.01;
assert.ok(Math.abs(usd - expected) < 1e-12, `${usd} vs ${expected}`);
const haikuLong = usageCostUsd("claude-haiku-5-5", { input_tokens: 90000, cache_read_input_tokens: 20000, output_tokens: 1000 });
assert.ok(Math.abs(haikuLong - (90000 * 0.5 / 1e6 + 20000 * 0.05 / 1e6 + 1000 * 2.5 / 1e6)) < 1e-12);
const t = createCostTracker("claude-opus-5-5"); t.add({ input_tokens: 1e6 }); const snap = t.add({ output_tokens: 1e6 });
assert.ok(Math.abs(snap.usd - 24) < 1e-9 && Math.abs(snap.eur - 24 * 0.894) < 1e-9 && snap.requests === 2);
console.log("ok: cost maths");
// A body that ends without a stop reason (cut connection, or a proxy that is not passing the
// event stream through) is an interrupted connection, not an empty answer.
globalThis.fetch = async () => new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
await assert.rejects(() => streamMessage({ key: "k", body: {} }), (e) => e instanceof ApiError && e.type === "network_error" && e.midStream);
globalThis.fetch = async () => new Response(chunked(sse(events.slice(0, 6)), [40]), { status: 200 });
await assert.rejects(() => streamMessage({ key: "k", body: {} }), (e) => e instanceof ApiError && e.type === "network_error");
console.log("ok: truncated stream rejected");

// ---- 2. data contracts and the validator ----------------------------------------------------------------
const { validate, describeErrors } = await mod("js/validate.js");
const { SCHEMAS, ALL_DEFS, WORLD_SCHEMA } = await mod("js/schemas.js");
const { scan } = await mod("js/engine.js");
const { fixPaths } = await mod("js/fixpaths.js");
const { RULES } = await mod("js/rules.js");
const { PARAMS } = await mod("js/params.js");
const { readFileSync, existsSync } = await import("node:fs");
const vm = await import("node:vm");
const fixture = JSON.parse(readFileSync(path.join(APP_ROOT, "tests", "fixtures", "world.json"), "utf8"));
const check = (value, name) => validate(value, SCHEMAS[name], { defs: ALL_DEFS });
const names = Object.keys(SCHEMAS);
assert.deepEqual(names, ["Supplier", "Material", "Contract", "PoLine", "User", "LogEntry", "Rule", "Exception", "Case", "Suggestion", "FixPath", "Decision", "Draft", "RunEvent", "AuditEvent"]);
console.log(`ok: ${names.length} data contracts`);
const fw = validate(fixture, WORLD_SCHEMA, { defs: ALL_DEFS });
assert.ok(fw.ok, describeErrors(fw.errors, "fixture world"));
for (const r of RULES) assert.ok(check(r, "Rule").ok, `${r.id}: ${describeErrors(check(r, "Rule").errors)}`);
const first = scan(fixture, { day: 0 });
for (const e of first.exceptions) assert.ok(check(e, "Exception").ok, `${e.id}: ${describeErrors(check(e, "Exception").errors)}`);
const fp = fixPaths({ exceptions: first.exceptions.filter((e) => e.rule === "DQ-07"), lineValue: (id) => first.context.eur(first.context.lineById.get(id)), history: { closed: 2, eligible: 2 }, inflow_per_month: 2 / 3 }, PARAMS);
for (const p of Object.values(fp.paths)) assert.ok(check(p, "FixPath").ok, `${p.id}: ${describeErrors(check(p, "FixPath").errors)}`);
console.log(`ok: the fixture world, ${RULES.length} rules, ${first.exceptions.length} exceptions and ${Object.keys(fp.paths).length} fix paths validate`);
// The built world, when it exists.
const worldFile = path.join(APP_ROOT, "data", "world.js");
if (existsSync(worldFile)) {
  const ctx = { window: {} };
  vm.runInNewContext(readFileSync(worldFile, "utf8"), ctx);
  const wv = validate(ctx.window.WORLD, WORLD_SCHEMA, { defs: ALL_DEFS, maxErrors: 5 });
  assert.ok(wv.ok, describeErrors(wv.errors, "world"));
  const ws = scan(ctx.window.WORLD, { day: 0, log: ctx.window.WORLD.exception_log });
  const bad = ws.exceptions.map((e) => [e.id, check(e, "Exception")]).filter(([, r]) => !r.ok);
  assert.equal(bad.length, 0, bad.slice(0, 3).map(([id, r]) => `${id}: ${describeErrors(r.errors)}`).join("\n"));
  console.log(`ok: the world (${ctx.window.WORLD.po_lines.length} order lines) and its ${ws.exceptions.length} exceptions validate`);
}
// Planted violations, each refused with a message that says what to fix.
const line = fixture.po_lines[0];
const cases = [
  ["a missing required field", (({ buyer, ...rest }) => rest)(line), "PoLine", /buyer: is required/],
  ["a wrong type", { ...line, value: "12000" }, "PoLine", /value: "12000" is of type string; expected number/],
  ["a value outside the list", { ...line, currency: "USD" }, "PoLine", /currency: "USD" is not allowed; use one of "EUR", "GBP"/],
  ["a field that does not exist", { ...line, colour: "red" }, "PoLine", /colour: is not a field here; allowed: id, po/],
  ["a pattern", { ...line, po: "45000001" }, "PoLine", /po: "45000001" does not have the expected form/],
  ["a nullable field", { ...line, contract: 7 }, "PoLine", /contract: 7 is a whole number; expected string \(or null\)/],
  ["a minimum", { ...line, value: -1 }, "PoLine", /value: -1 is below the minimum 0/],
  ["a nested reference", { ...first.exceptions[0], suggestion: { field: "colour", value: 1, source: "x" } }, "Exception", /suggestion\.field: "colour" is not allowed/],
  ["an array item", { grouping_id: "grp-1", group: { key: "plant", value: "1010" }, rules: ["DQ-01", "DQ-99"], exceptions: ["x"], root_cause: "r", fix_at_source: "f" }, "Case", /rules\[1\]: "DQ-99" does not have the expected form/],
  ["a list given twice", { grouping_id: "grp-1", group: { key: "plant", value: "1010" }, rules: ["DQ-01", "DQ-01"], exceptions: ["x"], root_cause: "r", fix_at_source: "f" }, "Case", /rules: lists "DQ-01" twice/],
  ["a pattern of keys", { ...fixture.suppliers[0], payment_terms: { "10000": 30 } }, "Supplier", /payment_terms\.10000: is not a field here/],
  ["a constant", { option_id: "A", options_seq: 1, decision: "approved", by: "agent" }, "Decision", /by: must be "user"/]
];
for (const [what, value, schema, re] of cases) {
  const r = check(value, schema);
  assert.equal(r.ok, false, `${what}: should be refused`);
  const text = describeErrors(r.errors, "input");
  assert.match(text, re, `${what}: ${text}`);
  assert.match(text, /Fix these fields and call again\./);
}
console.log(`ok: ${cases.length} planted violations refused with instructive messages`);
assert.throws(() => validate({}, { type: "object", requird: ["x"] }), /unsupported keyword "requird"/);
assert.throws(() => validate({}, { $ref: "#/$defs/Nowhere" }), /cannot resolve \$ref/);
assert.ok(validate({ a: [1, 2] }, { type: "object", properties: { a: { type: "array", items: { type: "integer" }, minItems: 1, maxItems: 2 } } }).ok);
assert.equal(validate(1.5, { type: "integer" }).ok, false);
assert.equal(validate(2, { oneOf: [{ type: "integer" }, { type: "number" }] }).ok, false, "oneOf: exactly one");
assert.equal(validate("x", { not: { type: "string" } }).ok, false);
console.log("ok: schema errors are loud; integer, oneOf and not behave");

// ---- 3. display formats ------------------------------------------------------------------------------
const f = await mod("js/format.js");
const today = new Date(2026, 10, 19);
const FORMATS = [
  [f.euro(58725), "€58,725"], [f.euro(1500 * 1.15), "€1,725"], [f.euro(2160 / 73), "€30"], [f.euro(0.5), "€1"], [f.euro(0), "€0"],
  [f.euroCents(1344 / 73), "€18.41"], [f.pct1(160 / 2509), "6.4%"], [f.pct1(5 / 7), "71.4%"], [f.pct1(1), "100.0%"], [f.pct1(0.0005), "0.1%"],
  [f.dec1(4 / 3), "1.3"], [f.dec1(0.25), "0.3"], [f.int(18), "18"], [f.int(2125), "2,125"], [f.days(14), "14 days"], [f.days(1), "1 day"],
  [f.shareOrNone(null), "no history"], [f.dayLabel(0, today), "Thu 19 Nov"], [f.dayLabel(-42, today), "Thu 8 Oct"],
  [f.dayLabel(-364, today), "Thu 20 Nov 2025"], [f.isoDay(-1, today), "2026-11-18"], [String(f.dayOfDate(new Date(Date.UTC(2026, 10, 12)), today)), "-7"]
];
for (const [got, want] of FORMATS) assert.equal(got, want);
// 1e-9 rounding first: noise below 1e-9 is no difference (0.49999999999 is the half and rounds away
// from zero, as 0.5 does), while a real difference keeps its digit.
assert.equal(f.euro(0.49999999999), "€1");
assert.equal(f.euro(0.4999), "€0");
assert.equal(f.euro(2.5), "€3");
assert.equal(f.pct1(0.06349999999999999), "6.4%");
console.log(`ok: ${FORMATS.length + 4} display formats`);

console.log("\nAll unit tests passed.");
console.log("UNIT OK");
