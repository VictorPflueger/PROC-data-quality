// The fifteen data-quality rules as data: what each checks, on which record, how severe it is, who is
// responsible for an exception and what it can suggest. The checks themselves run in js/engine.js.
// Five of the six DAMA UK dimensions appear; accuracy is left out on purpose, because whether a
// value matches the real world needs an outside check that this prototype cannot make.

export const RULE_SET_VERSION = "1.0.0";

/** The data products, in the order the board groups the rules. */
export const PRODUCTS = Object.freeze([
  { id: "po_line", label: "Order lines", record: "order line", source: "EKKO, EKPO" },
  { id: "supplier", label: "Suppliers", record: "supplier", source: "LFA1, LFB1, LFM1 (business partner in S/4HANA)" },
  { id: "material", label: "Materials", record: "material", source: "MARA, MAKT" },
  { id: "contract", label: "Contracts", record: "contract", source: "EKKO and EKPO with document category K" }
]);

export const DIMENSIONS = Object.freeze(["Completeness", "Consistency", "Validity", "Uniqueness", "Timeliness"]);
export const SEVERITY_ORDER = Object.freeze({ high: 0, medium: 1, low: 2 });

/** The central roles: one user holds each. */
export const CENTRAL_ROLES = Object.freeze({
  supplierSteward: "supplier master steward",
  materialSteward: "material master steward",
  lead: "procurement lead"
});

export const RULES = Object.freeze([
  { id: "DQ-01", name: "Contract not referenced", dimension: "Consistency", severity: "high", product: "po_line", record: "order line",
    fires: "No contract reference, although a contract of the same supplier, company code and material group is valid on the order day.",
    responsible: "the line's buyer", suggestion: "That contract; of several, the one valid from the latest day.", financing: false },
  { id: "DQ-02", name: "Material group missing", dimension: "Completeness", severity: "medium", product: "po_line", record: "order line",
    fires: "No material group.",
    responsible: "the line's buyer", suggestion: "The material master's group when the line has a material; free-text lines need an AI suggestion and a review.", financing: false },
  { id: "DQ-03", name: "Material group differs from master", dimension: "Consistency", severity: "low", product: "po_line", record: "order line",
    fires: "The line has a material and a material group, the material master has a group, and the two differ.",
    responsible: "material master steward", suggestion: "The material master's group.", financing: false },
  { id: "DQ-04", name: "Requester missing", dimension: "Completeness", severity: "medium", product: "po_line", record: "order line",
    fires: "No requester, or one that matches no user.",
    responsible: "the line's buyer", suggestion: null, financing: false },
  { id: "DQ-05", name: "Requester had left", dimension: "Validity", severity: "medium", product: "po_line", record: "order line",
    fires: "The requester was no longer active on the order day.",
    responsible: "the requester's manager", suggestion: null, financing: false },
  { id: "DQ-06", name: "Payment terms missing", dimension: "Completeness", severity: "high", product: "po_line", record: "order line",
    fires: "No payment terms.",
    responsible: "the line's buyer", suggestion: "The agreed terms.", financing: true },
  { id: "DQ-07", name: "Payment terms too short", dimension: "Consistency", severity: "high", product: "po_line", record: "order line",
    fires: "Payment terms shorter than the agreed terms.",
    responsible: "the line's buyer", suggestion: "The agreed terms.", financing: true },
  { id: "DQ-08", name: "Ordered from a blocked supplier", dimension: "Validity", severity: "high", product: "po_line", record: "order line",
    fires: "The order day is on or after the start of the supplier's purchasing block: the order got through, say by an interface or in a purchasing organisation the block does not cover.",
    responsible: "the line's buyer", suggestion: null, financing: false },
  { id: "DQ-09", name: "No payment terms in company code", dimension: "Completeness", severity: "high", product: "supplier", record: "supplier in a company code",
    fires: "The supplier has order lines in a company code but no payment terms there.",
    responsible: "supplier master steward", suggestion: null, financing: false },
  { id: "DQ-10", name: "VAT ID missing or malformed", dimension: "Validity", severity: "medium", product: "supplier", record: "supplier",
    fires: "VAT ID missing, its prefix differs from the supplier's country (EL for Greece, CHE for Switzerland), or the rest breaks the country's published format.",
    responsible: "supplier master steward", suggestion: null, financing: false },
  { id: "DQ-11", name: "Bank details missing or foreign", dimension: "Consistency", severity: "medium", product: "supplier", record: "supplier",
    fires: "No bank details, or the bank's country differs from the supplier's.",
    responsible: "supplier master steward", suggestion: null, financing: false },
  { id: "DQ-12", name: "Duplicate supplier", dimension: "Uniqueness", severity: "medium", product: "supplier", record: "pair of suppliers",
    fires: "The same VAT ID, or the same normalised name in the same country.",
    responsible: "supplier master steward", suggestion: null, financing: false },
  { id: "DQ-13", name: "Material without group", dimension: "Completeness", severity: "medium", product: "material", record: "material",
    fires: "No material group.",
    responsible: "material master steward", suggestion: null, financing: false },
  { id: "DQ-14", name: "Contract owner missing or left", dimension: "Timeliness", severity: "medium", product: "contract", record: "contract",
    fires: "No owner, or the owner is not active today: the record no longer reflects who is in charge.",
    responsible: "procurement lead", suggestion: null, financing: false },
  { id: "DQ-15", name: "Contract not valid on order day", dimension: "Validity", severity: "medium", product: "po_line", record: "order line",
    fires: "The contract it references was not valid on the order day.",
    responsible: "the line's buyer", suggestion: null, financing: false }
]);

export const RULE_IDS = Object.freeze(RULES.map((r) => r.id));
const BY_ID = new Map(RULES.map((r) => [r.id, r]));

/** The rule with this id, or undefined. */
export const ruleById = (id) => BY_ID.get(id);
