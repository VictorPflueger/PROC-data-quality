// The page's security policy and what it loads (AC-07), checked in the files without a browser:
//   policy    the policy meta tag of index.html is exactly the documented policy;
//   loads     every script, stylesheet, font, image and module comes from this site: no absolute URL
//             in a <script src>, <link href>, CSS url() or @import, or a JavaScript import; the only
//             host any code connects to is api.anthropic.com;
//   inline    no inline script or style: no <script> without src, no <style>, no style or on…
//             attribute in index.html, and no code that writes a style attribute or a handler as text;
//   storage   every browser storage key the app uses starts with "dq." except Vici's shared "vc-theme".
// Each check first proves on planted examples that it catches what it looks for.
// Usage: node tests/policy.mjs
import fs from "node:fs";
import path from "node:path";
import { APP_ROOT } from "./lib/harness.mjs";

// The policy as the build plan states it, character for character.
const POLICY = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src https://api.anthropic.com; object-src 'none'; base-uri 'none'; form-action 'none'";
const failures = [];
const passes = [];
const check = (ok, what) => (ok ? passes : failures).push(what);
const read = (f) => fs.readFileSync(path.join(APP_ROOT, f), "utf8");
const files = (dir, ext) => fs.readdirSync(path.join(APP_ROOT, dir)).filter((f) => f.endsWith(ext)).map((f) => `${dir}/${f}`);
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

// ---- the scanners ----------------------------------------------------------------------------------
const ABS = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i;
function htmlLoads(html) {
  const out = [];
  for (const m of html.matchAll(/<(script|link|img|iframe|source|video|audio|embed|object)\b[^>]*?\s(src|href|data)\s*=\s*["']([^"']+)["']/gi)) {
    const tag = m[1].toLowerCase();
    if (tag === "link" && !/rel=["'](stylesheet|icon|preload|modulepreload|manifest)["']/i.test(m[0])) continue;
    if (ABS.test(m[3])) out.push(`<${tag} ${m[2]}="${m[3]}">`);
  }
  return out;
}
function cssLoads(css) {
  const out = [];
  const plain = stripComments(css);
  for (const m of plain.matchAll(/@import\s+(?:url\()?\s*["']?([^"')\s;]+)/gi)) if (ABS.test(m[1])) out.push(`@import ${m[1]}`);
  for (const m of plain.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) if (ABS.test(m[1]) && !/^data:/i.test(m[1])) out.push(`url(${m[1]})`);
  return out;
}
function jsLoads(js) {
  const out = [];
  const plain = stripComments(js);
  for (const m of plain.matchAll(/\bimport\s*(?:[\w*{}\s,]+from\s*)?\(?\s*["'`]([^"'`]+)["'`]/g)) if (ABS.test(m[1])) out.push(`import ${m[1]}`);
  for (const m of plain.matchAll(/\bimportScripts\s*\(|new\s+(?:Worker|SharedWorker|WebSocket|EventSource)\s*\(/g)) out.push(m[0]);
  return out;
}
function hostsIn(js) {
  return [...stripComments(js).matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase());
}
function htmlInline(html) {
  const out = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) if (!/\bsrc\s*=/.test(m[1]) && m[2].trim()) out.push("<script> without src");
  if (/<style\b/i.test(html)) out.push("<style>");
  for (const m of html.matchAll(/<[a-z][^>]*\s(style|on[a-z]+)\s*=\s*["'][^"']*["']/gi)) out.push(`${m[1]}="…"`);
  return out;
}
function jsInline(js) {
  const out = [];
  const plain = stripComments(js);
  for (const m of plain.matchAll(/setAttribute\(\s*["'`](style|on[a-z]+)["'`]/g)) out.push(`setAttribute("${m[1]}")`);
  for (const m of plain.matchAll(/\.innerHTML\s*=\s*[^;]*<(?:script|style)\b|<[a-z][^>]*\sstyle\s*=\s*\\?["']/gi)) out.push(m[0].slice(0, 50));
  for (const m of plain.matchAll(/\bnew\s+Function\s*\(|\beval\s*\(/g)) out.push(m[0]);
  return out;
}
function storageKeys(js) {
  return [...stripComments(js).matchAll(/(?:local|session)Storage\.(?:getItem|setItem|removeItem)\(\s*["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
}

// The scanners prove themselves on planted examples.
{
  const planted = [
    [htmlLoads('<script src="https://cdn.example.com/x.js"></script>').length === 1, "an outside script"],
    [htmlLoads('<link rel="stylesheet" href="//fonts.example.com/a.css">').length === 1, "an outside stylesheet"],
    [htmlLoads('<script src="js/main.js"></script><link rel="stylesheet" href="css/style.css">').length === 0, "local files pass"],
    [cssLoads("@font-face { src: url(https://fonts.example.com/f.woff2); }").length === 1, "an outside font"],
    [cssLoads("@import url('https://example.com/a.css');").some((x) => x.startsWith("@import")), "an outside @import"],
    [cssLoads(".a { background: url(\"data:image/svg+xml,%3Csvg%3E\"); }").length === 0, "a data URI passes"],
    [jsLoads('import { x } from "https://esm.example.com/x.js";').length === 1, "an outside module"],
    [jsLoads('const m = await import("https://esm.example.com/x.js");').length === 1, "an outside dynamic import"],
    [htmlInline("<script>alert(1)</script>").length === 1, "an inline script"],
    [htmlInline('<div style="color:red"></div><button onclick="x()"></button>').length === 2, "inline style and handler"],
    [jsInline('el.setAttribute("style", "color:red");').length === 1, "a style attribute from code"],
    [storageKeys('localStorage.setItem("introSeen", "1")').join() === "introSeen", "a storage key"]
  ];
  for (const [ok, what] of planted) check(ok, `self-test: ${what}`);
}

// ---- policy ----------------------------------------------------------------------------------------
const html = read("index.html");
const metas = [...html.matchAll(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/g)].map((m) => m[1]);
check(metas.length === 1, `index.html has exactly one policy meta tag (${metas.length})`);
check(metas[0] === POLICY, `the policy is exactly the documented one${metas[0] === POLICY ? "" : `: ${metas[0]}`}`);
check(/<head>[\s\S]*?<meta charset="utf-8">[\s\S]*?http-equiv="Content-Security-Policy"[\s\S]*?<link rel="stylesheet"/.test(html), "the policy comes before any stylesheet or script");

// ---- loads -----------------------------------------------------------------------------------------
const css = [...files("css", ".css")];
const js = [...files("js", ".js"), "favicon.svg"].filter((f) => f.endsWith(".js"));
const data = files("data", ".js");
const htmlOut = htmlLoads(html);
check(!htmlOut.length, `index.html loads nothing from another site${htmlOut.length ? `: ${htmlOut.join(", ")}` : ""}`);
const cssOut = css.flatMap((f) => cssLoads(read(f)).map((x) => `${f}: ${x}`));
check(!cssOut.length, `${css.length} stylesheets load nothing from another site${cssOut.length ? `: ${cssOut.join(", ")}` : ""}`);
const viciCss = cssLoads(read("vici/dist/vici.min.css"));
check(!viciCss.length, `Vici's stylesheet loads its fonts and icons from this site${viciCss.length ? `: ${viciCss.slice(0, 3).join(", ")}` : ""}`);
const jsOut = [...js, ...data, "vici/dist/vici.js"].flatMap((f) => jsLoads(read(f)).map((x) => `${f}: ${x}`));
check(!jsOut.length, `no script imports or opens anything from another site${jsOut.length ? `: ${jsOut.join(", ")}` : ""}`);
// Hosts named in code: the API (the only one the page connects to) and links a person opens.
const LINK_HOSTS = new Set(["platform.claude.com", "www.linkedin.com", "victorpflueger.github.io", "github.com", "www.w3.org"]);
const hosts = new Map();
for (const f of [...js, ...data]) for (const h of hostsIn(read(f))) if (!hosts.has(h)) hosts.set(h, f);
const unknown = [...hosts].filter(([h]) => h !== "api.anthropic.com" && !LINK_HOSTS.has(h));
check(!unknown.length, `code names api.anthropic.com and links only${unknown.length ? `; also ${unknown.map(([h, f]) => `${h} (${f})`).join(", ")}` : ""}`);
const fetches = js.flatMap((f) => [...stripComments(read(f)).matchAll(/\bfetch\(\s*([^,)]+)/g)].map((m) => `${f}: ${m[1].trim()}`));
const okFetch = (x) => /ANTHROPIC\.(messagesUrl|modelsUrl)|\burl\b/.test(x);
check(fetches.every(okFetch) && fetches.every((x) => x.startsWith("js/anthropic.js")), `only the shared client calls fetch, with the API's addresses (${fetches.length} call sites)`);

// ---- inline ----------------------------------------------------------------------------------------
const inl = htmlInline(html);
check(!inl.length, `index.html has no inline script, style or handler${inl.length ? `: ${inl.join(", ")}` : ""}`);
const jsInl = js.flatMap((f) => jsInline(read(f)).map((x) => `${f}: ${x}`));
check(!jsInl.length, `no code writes a style attribute, a handler or a script as text, or evaluates text${jsInl.length ? `: ${jsInl.join("; ")}` : ""}`);

// ---- storage ---------------------------------------------------------------------------------------
const config = read("js/config.js");
const prefix = /id:\s*"([a-z]+)"/.exec(config)[1];
check(prefix === "dq", `the app's id is "dq" (${prefix})`);
const storageBlock = /export const STORAGE = \{([\s\S]*?)\};/.exec(config)[1];
const declared = [...storageBlock.matchAll(/`\$\{P\}([^`]+)`/g)].map((m) => `dq.${m[1]}`);
check(declared.length >= 1 && /const P = `\$\{APP\.id\}\.`;/.test(config), `js/config.js declares ${declared.length} storage key(s), each under "dq." (${declared.join(", ")})`);
const literal = [...js, "tests/lib/harness.mjs"].flatMap((f) => storageKeys(read(f)).map((k) => [f, k]));
const strays = literal.filter(([, k]) => !k.startsWith("dq.") && k !== "vc-theme");
check(!strays.length, `every literal storage key starts with "dq." or is Vici's "vc-theme"${strays.length ? `: ${strays.map(([f, k]) => `${k} (${f})`).join(", ")}` : ` (${literal.length} uses)`}`);
const harness = read("tests/lib/harness.mjs");
check(/KEYS = \{ apiKey: "dq\.anthropic\.key" \}/.test(harness), "the test harness uses the same key");
check(/STORAGE\.apiKey/.test(read("js/keystore.js")) && /sessionStorage/.test(read("js/keystore.js")) && !/localStorage/.test(stripComments(read("js/keystore.js"))), "the API key is kept in session storage under STORAGE.apiKey, never in local storage");

for (const p of passes) console.log(`PASS  ${p}`);
for (const f of failures) console.log(`FAIL  ${f}`);
console.log(`${passes.length}/${passes.length + failures.length} policy checks passed.`);
if (failures.length) process.exit(1);
console.log("POLICY OK");
