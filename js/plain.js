// Plain words for the screen. The engine, the tools and the agent work with ids (user U190, company
// code 2000, supplier 80001, field payment_terms_days); a viewer should read names, cities and words.
// These helpers turn ids into what a person would say, without changing a figure. Pure apart from the
// world they are given, so the tests run them in Node.

import { indexOf } from "./erp.js";
import { ruleById } from "./rules.js";

const FIELDS = {
  payment_terms_days: "payment terms (days)",
  contract_id: "contract",
  material_group: "material group",
  requester: "requester",
  created_by: "created by",
  vat_id: "VAT ID",
  bank_country: "bank country"
};

/** "James P." for a person; "the Indirect team's buying profile" for an account without a name. */
export function personName(world, id) {
  const u = indexOf(world).users.get(String(id));
  if (!u) return String(id || "");
  return u.name || `the ${teamOf(u)} team's ${u.role}`;
}

/** "Indirect" from the team "Indirect, Birmingham". */
const teamOf = (u) => String(u.team || "").split(",")[0].trim();

/** "James P., buyer, Indirect, Birmingham". */
export function personLine(world, id) {
  const u = indexOf(world).users.get(String(id));
  if (!u) return String(id || "");
  return `${u.name || `Shared ${u.role}`}, ${u.name ? `${u.role}, ` : ""}${u.team}`;
}

/** The city of a company code or plant: "Birmingham". */
export function placeName(world, kind, id) {
  const ix = indexOf(world);
  const rec = kind === "company_code" ? ix.companyCodes.get(String(id)) : ix.plants.get(String(id));
  if (!rec) return null;
  return kind === "company_code" ? rec.city.replace(/ am Main$/, "") : rec.name;
}

/** "Lumen Labware" for supplier 80001. */
export function supplierName(world, id) {
  return indexOf(world).suppliers.get(String(id))?.name || null;
}

/** "Payment terms too short" for DQ-07. */
export const ruleName = (id) => ruleById(id)?.name || id;

/** The scope of a scan or grouping in words: "Birmingham", "the Lyon plant", "all data". */
export function scopeText(world, filters) {
  const parts = [];
  for (const f of Array.isArray(filters) ? filters : []) {
    if (!f || !Array.isArray(f.values)) continue;
    if (f.key === "company_code") parts.push(f.values.map((v) => placeName(world, "company_code", v) || `company code ${v}`).join(" and "));
    else if (f.key === "plant") parts.push(f.values.map((v) => `the ${placeName(world, "plant", v) || v} plant`).join(" and "));
    else if (f.key === "supplier") parts.push(f.values.map((v) => supplierName(world, v) || `supplier ${v}`).join(" and "));
    else if (f.key === "onboarding_channel") parts.push(f.values.map((v) => `suppliers onboarded by ${v}`).join(" and "));
    else parts.push(f.values.join(" and "));
  }
  return parts.length ? parts.join(", ") : "all the data";
}

/**
 * A text the agent or the engine wrote, with ids turned into names: user ids into people, company
 * codes and plants into cities, supplier numbers into names, field names into words. Figures stay as
 * they are. A city already named in the same sentence keeps the code, so "Birmingham is company code
 * 2000" does not turn into "Birmingham is Birmingham".
 */
export function plainText(world, text) {
  if (!text) return "";
  const ix = indexOf(world);
  let out = String(text);
  // "(supplier 80001)" after the supplier's own name is noise: drop it.
  out = out.replace(/\s*\(supplier (\d{5})\)/g, (m, id) => (ix.suppliers.has(id) ? "" : m));
  out = out.replace(/\bsupplier (\d{5})\b/g, (m, id) => {
    const name = supplierName(world, id);
    return name ? name : m;
  });
  // Sentence by sentence (newlines and paragraphs stay exactly where they are).
  out = out.replace(/[^.!?\n]+[.!?]*/g, (s) => s
    .replace(/\b(?:in |at )?company code (\d{4})\b/g, (m, id) => {
      const city = placeName(world, "company_code", id);
      if (!city || otherMention(s, m, city)) return m;
      return /^(in|at) /.test(m) ? `${m.slice(0, 3)}${city}` : city;
    })
    .replace(/\bplant (\d{4})\b/g, (m, id) => {
      const city = placeName(world, "plant", id);
      return city && !otherMention(s, m, city) ? `the ${city} plant` : m;
    }));
  out = out.replace(/\b(buying profile|user|creator|requester) (U\d{3})\b/g, (m, word, id) => {
    const u = ix.users.get(id);
    if (!u) return m;
    return u.name ? `${word} ${u.name}` : `${word} of the ${teamOf(u)} team`;
  });
  out = out.replace(/\bU\d{3}\b/g, (id) => (ix.users.has(id) ? personName(world, id) : id));
  out = out.replace(/\b([a-z]+(?:_[a-z]+)+)\b/g, (m) => FIELDS[m] || m);
  out = out.replace(/the the /g, "the ").replace(/\b([A-Z]\.)\./g, "$1");
  return out;
}

const otherMention = (sentence, match, city) => sentence.replace(match, "").includes(city);

