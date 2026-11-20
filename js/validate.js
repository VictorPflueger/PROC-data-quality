// A small JSON Schema validator without a dependency, for the app's data contracts (js/schemas.js)
// and, in Live mode, every tool input the model sends: an input that breaks its tool's schema is
// refused with an instructive message (is_error: true) instead of being guessed at.
//
// Supported keywords, the subset the app's schemas use: type (a name or a list, with "integer" and
// "null"), enum, const, required, properties, additionalProperties (false or a schema),
// patternProperties, items, minItems, maxItems, uniqueItems, minimum, maximum, exclusiveMinimum,
// exclusiveMaximum, minLength, maxLength, pattern, anyOf, oneOf, allOf, not, $ref to "#/$defs/…" (in
// the schema itself or in the shared definitions passed as `defs`), and description (ignored).
// An unknown keyword is an error in the schema, so a typo can never switch a check off silently.

const KNOWN = new Set(["$id", "$schema", "$comment", "$defs", "$ref", "title", "description", "type", "enum", "const", "required", "properties",
  "additionalProperties", "patternProperties", "items", "minItems", "maxItems", "uniqueItems", "minimum", "maximum", "exclusiveMinimum",
  "exclusiveMaximum", "minLength", "maxLength", "pattern", "anyOf", "oneOf", "allOf", "not", "default", "examples"]);

const typeOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v === "number" ? (Number.isInteger(v) ? "integer" : "number") : typeof v);
const matchesType = (v, t) => {
  const actual = typeOf(v);
  if (t === "number") return actual === "number" || actual === "integer";
  return actual === t;
};
const show = (v) => {
  const s = JSON.stringify(v);
  return s === undefined ? String(v) : s.length > 60 ? `${s.slice(0, 57)}…` : s;
};
const where = (path) => (path ? path : "the input");

/**
 * Validates `value` against `schema`. Returns { ok, errors: [{ path, message }] }; each message says
 * what is wrong and what is expected, so it can be handed back to the model as it is.
 * defs: shared definitions for "$ref": "#/$defs/Name".
 */
export function validate(value, schema, { defs = {}, maxErrors = 20 } = {}) {
  const errors = [];
  const rootDefs = { ...defs, ...(schema.$defs || {}) };
  const push = (path, message) => { if (errors.length < maxErrors) errors.push({ path: where(path), message }); };

  function resolve(s) {
    let out = s;
    for (let depth = 0; out && out.$ref; depth++) {
      if (depth > 20) throw new Error(`schema error: $ref "${s.$ref}" does not end`);
      const m = /^#\/\$defs\/(.+)$/.exec(out.$ref);
      const target = m && rootDefs[m[1]];
      if (!target) throw new Error(`schema error: cannot resolve $ref "${out.$ref}"`);
      out = { ...target, ...Object.fromEntries(Object.entries(out).filter(([k]) => k !== "$ref")) };
    }
    return out;
  }

  function check(v, s0, path) {
    if (s0 === true || s0 === undefined) return true;
    if (s0 === false) { push(path, "no value is allowed here"); return false; }
    const s = resolve(s0);
    for (const k of Object.keys(s)) if (!KNOWN.has(k)) throw new Error(`schema error: unsupported keyword "${k}" at ${where(path)}`);
    const before = errors.length;
    if (s.type !== undefined) {
      const types = Array.isArray(s.type) ? s.type : [s.type];
      if (!types.some((t) => matchesType(v, t))) {
        push(path, `${show(v)} is ${typeOf(v) === "integer" ? "a whole number" : typeOf(v) === "null" ? "null" : `of type ${typeOf(v)}`}; expected ${types.join(" or ")}`);
        return false;
      }
    }
    if (s.const !== undefined && JSON.stringify(v) !== JSON.stringify(s.const)) push(path, `must be ${show(s.const)}, not ${show(v)}`);
    if (s.enum && !s.enum.some((x) => JSON.stringify(x) === JSON.stringify(v))) push(path, `${show(v)} is not allowed; use one of ${s.enum.map(show).join(", ")}`);
    if (typeof v === "string") {
      if (s.minLength !== undefined && v.length < s.minLength) push(path, s.minLength === 1 ? "must not be empty" : `must have at least ${s.minLength} characters`);
      if (s.maxLength !== undefined && v.length > s.maxLength) push(path, `must have at most ${s.maxLength} characters (has ${v.length})`);
      if (s.pattern !== undefined && !new RegExp(s.pattern, "u").test(v)) push(path, `${show(v)} does not have the expected form ${s.pattern}`);
    }
    if (typeof v === "number") {
      if (s.minimum !== undefined && v < s.minimum) push(path, `${v} is below the minimum ${s.minimum}`);
      if (s.maximum !== undefined && v > s.maximum) push(path, `${v} is above the maximum ${s.maximum}`);
      if (s.exclusiveMinimum !== undefined && v <= s.exclusiveMinimum) push(path, `${v} must be greater than ${s.exclusiveMinimum}`);
      if (s.exclusiveMaximum !== undefined && v >= s.exclusiveMaximum) push(path, `${v} must be less than ${s.exclusiveMaximum}`);
    }
    if (Array.isArray(v)) {
      if (s.minItems !== undefined && v.length < s.minItems) push(path, `needs at least ${s.minItems} item${s.minItems === 1 ? "" : "s"} (has ${v.length})`);
      if (s.maxItems !== undefined && v.length > s.maxItems) push(path, `takes at most ${s.maxItems} item${s.maxItems === 1 ? "" : "s"} (has ${v.length})`);
      if (s.uniqueItems) {
        const seen = new Set();
        for (const x of v) { const k = JSON.stringify(x); if (seen.has(k)) { push(path, `lists ${show(x)} twice`); break; } seen.add(k); }
      }
      if (s.items !== undefined) v.forEach((x, i) => check(x, s.items, `${path}[${i}]`));
    }
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const k of s.required || []) if (!(k in v)) push(path ? `${path}.${k}` : k, `is required${s.properties?.[k]?.description ? ` (${s.properties[k].description})` : ""}`);
      const props = s.properties || {};
      const patterns = Object.entries(s.patternProperties || {}).map(([p, ps]) => [new RegExp(p, "u"), ps]);
      for (const [k, x] of Object.entries(v)) {
        const sub = path ? `${path}.${k}` : k;
        let known = false;
        if (k in props) { known = true; check(x, props[k], sub); }
        for (const [re, ps] of patterns) if (re.test(k)) { known = true; check(x, ps, sub); }
        if (!known) {
          if (s.additionalProperties === false) push(sub, `is not a field here; allowed: ${Object.keys(props).join(", ") || (patterns.length ? "keys of the form " + patterns.map(([re]) => re.source).join(" or ") : "none")}`);
          else if (s.additionalProperties && typeof s.additionalProperties === "object") check(x, s.additionalProperties, sub);
        }
      }
    }
    const tries = (list) => list.map((sub) => {
      const r = validate(v, { ...resolve(sub), $defs: rootDefs }, { maxErrors: 3 });
      return r;
    });
    if (s.allOf) for (const sub of s.allOf) check(v, sub, path);
    if (s.anyOf) {
      // A nullable value ({ anyOf: [schema, { type: "null" }] }) reports the schema's own errors.
      const nullIndex = s.anyOf.findIndex((x) => x && x.type === "null" && Object.keys(x).length === 1);
      if (s.anyOf.length === 2 && nullIndex >= 0) {
        if (v !== null) {
          const at = errors.length;
          check(v, s.anyOf[1 - nullIndex], path);
          for (let i = at; i < errors.length; i++) if (errors[i].path === where(path)) errors[i].message += " (or null)";
        }
      } else {
        const r = tries(s.anyOf);
        if (!r.some((x) => x.ok)) push(path, `matches none of the allowed forms (${r.map((x) => x.errors[0]?.message).filter(Boolean).slice(0, 2).join("; or ")})`);
      }
    }
    if (s.oneOf) {
      const r = tries(s.oneOf);
      const n = r.filter((x) => x.ok).length;
      if (n !== 1) push(path, n === 0 ? `matches none of the allowed forms (${r.map((x) => x.errors[0]?.message).filter(Boolean).slice(0, 2).join("; or ")})` : "matches more than one of the allowed forms");
    }
    if (s.not && validate(v, { ...resolve(s.not), $defs: rootDefs }).ok) push(path, "has a form that is not allowed here");
    return errors.length === before;
  }

  check(value, schema, "");
  return { ok: errors.length === 0, errors };
}

/** One instructive message for a failed validation (for a tool result with is_error: true). */
export function describeErrors(errors, what = "input") {
  if (!errors.length) return "";
  const lines = errors.slice(0, 8).map((e) => `- ${e.path}: ${e.message}`);
  return `The ${what} does not match its schema:\n${lines.join("\n")}${errors.length > 8 ? `\n- and ${errors.length - 8} more` : ""}\nFix these fields and call again.`;
}
