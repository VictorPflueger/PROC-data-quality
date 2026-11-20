// What a simulated run would cost on Claude, estimated from the run itself. A simulation replays a
// script through the same tools, so its prompts and replies are known: the system prompt, the tool
// definitions, the tip, every tool result the agent would read and every text and tool call it would
// write. The estimate rebuilds the conversation the live agent would send, request by request, with
// the prompt caching it uses (each request reads what the one before it cached and writes the rest)
// and prices it at the model's list price (js/config.js, the same table as the live cost meter).
// Two assumptions, both shown in the guide: about four characters a token, and 300 tokens of hidden
// reasoning a request. A live run measures its cost instead of estimating it.

import { DEFAULT_MODEL, FX_USD_EUR } from "./config.js";
import { usageCostUsd } from "./cost.js";

export const ESTIMATE = Object.freeze({ charsPerToken: 4, reasoningTokensPerRequest: 300 });

const tokens = (x) => Math.ceil((typeof x === "string" ? x : JSON.stringify(x ?? "")).length / ESTIMATE.charsPerToken);

/**
 * system: the system prompt; tools: the tool definitions; opening: the first user message.
 * Feed it text(t) for what the agent writes, toolCall(name, input) and toolResult(result) in order,
 * and finish() when the run ends. snapshot() gives { eur, usd, requests, tokens }.
 */
export function createEstimator({ system, tools, opening, modelId = DEFAULT_MODEL }) {
  let prompt = tokens(system) + tokens(tools) + tokens(opening); // what the next request sends
  let cached = 0;                // what the previous request left in the cache
  let written = 0;               // assistant text of the turn in progress
  let lastWasRead = false;       // consecutive record reads go out in one request
  let usd = 0;
  let requests = 0;
  const totals = { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 };

  function request(output) {
    const u = { input_tokens: 0, cache_read_input_tokens: cached, cache_creation_input_tokens: Math.max(0, prompt - cached), output_tokens: output + ESTIMATE.reasoningTokensPerRequest };
    usd += usageCostUsd(modelId, u);
    for (const k of Object.keys(totals)) totals[k] += u[k];
    requests += 1;
    cached = prompt;
    prompt += output;
  }

  return {
    text(t) { if (t) { written += tokens(t); lastWasRead = false; } },
    toolCall(name, input) {
      const out = tokens({ name, input }) + 12;
      if (name === "erp_get_record" && lastWasRead && !written) {
        // Another read in the same request: its tool call joins that request's output.
        const u = { input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: out };
        usd += usageCostUsd(modelId, u);
        totals.output_tokens += out;
        prompt += out;
        return;
      }
      request(written + out);
      written = 0;
      lastWasRead = name === "erp_get_record";
    },
    toolResult(result) { prompt += tokens(result) + 12; },
    /** The request that ends the run (the agent's last turn after the report). */
    finish() { request(written + 24); written = 0; lastWasRead = false; },
    snapshot() {
      return { usd, eur: usd * FX_USD_EUR, requests, model: modelId, tokens: { ...totals, prompt } };
    }
  };
}
