// Run it live: asks for the visitor's own Anthropic API key and the model, checks the key with
// Anthropic's free model list (no tokens) and resolves { modelId } once it is accepted, or null. The key
// stays in this tab's session storage (js/keystore.js) and is sent only to api.anthropic.com. Inside
// another page's frame the dialog refuses, so a framing page cannot steer the clicks around the key.

import { checkKey } from "./anthropic.js";
import { getKey, setKey, forgetKey, hasKey, looksLikeKey, maskKey } from "./keystore.js";
import { MODELS } from "./config.js";

export function openLiveDialog({ modelId }) {
  const dlg = document.getElementById("live-dialog");
  const input = document.getElementById("api-key-input");
  const select = document.getElementById("model-select");
  const msg = document.getElementById("live-msg");
  const current = document.getElementById("live-current");
  const start = document.getElementById("btn-live-start");
  const forget = document.getElementById("btn-forget-key");
  const framed = (() => { try { return window.top !== window.self; } catch { return true; } })();

  if (!select.options.length) {
    for (const m of MODELS) select.append(new Option(`${m.label}: ${m.hint}`, m.id));
  }
  select.value = MODELS.some((m) => m.id === modelId) ? modelId : MODELS[0].id;
  input.value = "";
  const say = (text, tone = "") => { msg.textContent = text; msg.dataset.tone = tone; };
  const showCurrent = () => {
    current.hidden = !hasKey();
    current.textContent = hasKey() ? `A key is stored for this tab: ${maskKey()}. Leave the field empty to use it.` : "";
    forget.hidden = !hasKey();
  };
  showCurrent();
  say(framed ? "This page runs inside another page. Open it in its own tab to run it live; the simulation works here." : "", framed ? "error" : "");
  input.disabled = framed;
  start.disabled = framed;

  return new Promise((resolve) => {
    let accepted = null;
    async function go() {
      if (framed || start.disabled) return;
      const raw = input.value.trim() || getKey() || "";
      if (!raw) { say("Paste your Anthropic API key. It starts with sk-ant-.", "error"); input.focus(); return; }
      if (!looksLikeKey(raw)) { say("That does not look like an Anthropic API key. It starts with sk-ant-.", "error"); input.focus(); return; }
      start.disabled = true;
      say("Checking the key with Anthropic. This call is free.");
      const r = await checkKey(raw);
      start.disabled = false;
      if (r.ok) {
        setKey(raw);
        accepted = { modelId: select.value };
        dlg.close("live");
        return;
      }
      if (r.status === 0) say(`Could not reach api.anthropic.com (${r.error?.message || "network"}). Check the network, or use the simulation.`, "error");
      else if (r.status === 401) { forgetKey(); showCurrent(); say("Anthropic rejected this key (401). Check that it is active and copied completely.", "error"); }
      else say(`Anthropic answered ${r.status}: ${r.error?.message || r.error?.type || "error"}.`, "error");
    }
    const onKey = (e) => { if (e.key === "Enter") { e.preventDefault(); go(); } };
    const onForget = () => { forgetKey(); input.value = ""; showCurrent(); say("Key removed from this tab."); };
    start.addEventListener("click", go);
    input.addEventListener("keydown", onKey);
    forget.addEventListener("click", onForget);
    dlg.addEventListener("close", () => {
      start.removeEventListener("click", go);
      input.removeEventListener("keydown", onKey);
      forget.removeEventListener("click", onForget);
      input.value = "";
      resolve(accepted);
    }, { once: true });
    dlg.showModal();
    (framed ? dlg.querySelector("[data-vc-close]") : input).focus();
  });
}
