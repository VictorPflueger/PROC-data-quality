// The data contracts as JSON Schemas: the five data products and the exception log of the world, and
// what the engine, the agent and the screen exchange (rules, exceptions, cases, suggestions, fix paths,
// decisions, drafts, run events, audit events). js/validate.js checks against them: the world builder
// and checker, the tests, the JSON exports and, in Live mode, the tool layer.

import { GROUP_KEYS } from "./engine.js";

const ID = { type: "string", minLength: 1, maxLength: 40 };
const DAY = { type: "integer", minimum: -4000, maximum: 4000 };
const COUNTRY = { type: "string", pattern: "^[A-Z]{2}$" };
const COMPANY_CODE = { type: "string", pattern: "^[0-9]{4}$" };
const RULE_ID = { type: "string", pattern: "^DQ-(0[1-9]|1[0-5])$" };
const nullable = (s) => ({ anyOf: [s, { type: "null" }] });

export const CHANNELS = Object.freeze(["catalog", "punch-out", "free-text requisition", "direct order", "contract call-off"]);
export const ONBOARDING_CHANNELS = Object.freeze(["central onboarding", "self-registration portal", "migrated"]);
export const ROLES = Object.freeze(["requester", "buyer", "manager", "contract owner", "supplier master steward", "material master steward",
  "procurement lead", "buying profile", "interface"]);
export const STATUSES = Object.freeze(["open", "routed", "closed", "dismissed", "accepted"]);
export const EVENT_TYPES = Object.freeze(["run_start", "state_change", "narration", "reasoning", "tool_call", "tool_result", "board_update", "kpi_update",
  "alert", "confirmation_request", "confirmation_decision", "options", "option_decision", "action_draft", "action_decision", "report",
  "cost_update", "notice", "attempt_discarded", "run_end"]);
export const DRAFT_KINDS = Object.freeze(["change_request", "follow_up", "prevention", "risk_memo"]);

/** Shared definitions, for "$ref": "#/$defs/Name" in every schema. */
export const DEFS = {
  Suggestion: {
    description: "A value that would fix an exception: deterministic from a record, or proposed by the AI and reviewed by a person",
    type: "object",
    required: ["field", "value", "source"],
    properties: {
      field: { enum: ["contract", "material_group", "payment_terms_days"] },
      value: { type: ["string", "integer"] },
      source: { type: "string", minLength: 1, description: "where the value comes from, e.g. \"contract K1\" or \"material master M3\"" },
      origin: { enum: ["deterministic", "ai"] },
      confidence: { enum: ["high", "medium", "low"] },
      words: { type: "array", items: { type: "string", minLength: 1 } },
      review: { enum: ["pending", "approved", "rejected"] }
    },
    additionalProperties: false
  }
};

export const SCHEMAS = {
  Supplier: {
    title: "Supplier account (supplier)",
    type: "object",
    required: ["id", "name", "country", "vat_id", "bank", "payment_terms", "block_from"],
    properties: {
      id: ID, name: { type: "string", minLength: 1 }, country: COUNTRY, city: nullable({ type: "string", minLength: 1 }),
      currency: nullable({ enum: ["EUR", "GBP"] }), category: nullable({ type: "string", minLength: 1 }),
      vat_id: nullable({ type: "string" }),
      bank: nullable({ type: "object", required: ["country"], properties: { country: COUNTRY, last4: nullable({ type: "string", pattern: "^[0-9]{4}$" }) }, additionalProperties: false }),
      payment_terms: { type: "object", patternProperties: { "^[0-9]{4}$": { type: "integer", minimum: 0, maximum: 180 } }, additionalProperties: false },
      block_from: nullable(DAY), created_day: nullable(DAY), onboarding_channel: nullable({ enum: ONBOARDING_CHANNELS }),
      origin: { enum: ["Rebate Hunter", "this world"], description: "where the account comes from" }
    },
    additionalProperties: false
  },
  Material: {
    title: "Material (material)",
    type: "object",
    required: ["id", "description", "material_group"],
    properties: { id: ID, description: { type: "string", minLength: 1 }, material_group: nullable({ type: "string", pattern: "^[A-Z]+(-[A-Z]+)*$" }), base_unit: nullable({ type: "string", minLength: 1 }) },
    additionalProperties: false
  },
  Contract: {
    title: "Outline agreement (contract)",
    type: "object",
    required: ["id", "supplier", "company_code", "material_group", "valid_from", "valid_to", "payment_terms_days", "owner"],
    properties: {
      id: ID, supplier: ID, company_code: COMPANY_CODE, material_group: nullable({ type: "string", minLength: 1 }), valid_from: DAY, valid_to: DAY,
      payment_terms_days: nullable({ type: "integer", minimum: 0, maximum: 180 }), owner: nullable(ID)
    },
    additionalProperties: false
  },
  PoLine: {
    title: "Purchase-order item (po_line)",
    type: "object",
    required: ["id", "po", "item", "company_code", "supplier", "material", "material_group", "value", "currency", "day", "payment_terms_days", "contract", "requester", "buyer"],
    properties: {
      id: ID, po: { type: "string", pattern: "^[0-9]{10}$" }, item: { type: "integer", minimum: 1, maximum: 99999 }, company_code: COMPANY_CODE,
      plant: nullable({ type: "string", pattern: "^[0-9]{4}$" }), supplier: ID, material: nullable(ID), short_text: nullable({ type: "string", minLength: 1, maxLength: 80 }),
      material_group: nullable({ type: "string", minLength: 1 }), quantity: nullable({ type: "number", exclusiveMinimum: 0 }), unit: nullable({ type: "string", minLength: 1 }),
      value: { type: "number", minimum: 0 }, currency: { enum: ["EUR", "GBP"] }, day: DAY, payment_terms_days: nullable({ type: "integer", minimum: 0, maximum: 180 }),
      contract: nullable(ID), requester: nullable({ type: "string", minLength: 1 }), buyer: ID, created_by: nullable(ID), channel: nullable({ enum: CHANNELS })
    },
    additionalProperties: false
  },
  User: {
    title: "User (user_org)",
    type: "object",
    required: ["id", "role", "active_until", "manager"],
    properties: {
      id: ID, name: nullable({ type: "string", pattern: "^\\p{Lu}\\p{Ll}+ \\p{Lu}\\.$", description: "a given name and an initial, e.g. \"Lena K.\"" }),
      role: { enum: ROLES }, team: nullable({ type: "string", minLength: 1 }), company_code: nullable(COMPANY_CODE), active_until: nullable(DAY), manager: nullable(ID)
    },
    additionalProperties: false
  },
  LogEntry: {
    title: "Entry of the exception log (exception_log)",
    type: "object",
    required: ["id", "rule", "record", "detected_day", "routed_day", "status", "closed_day"],
    properties: {
      id: ID, rule: RULE_ID, record: { type: "string", minLength: 1 }, detected_day: DAY, routed_day: nullable(DAY), responsible: nullable(ID), routed_to: nullable(ID),
      status: { enum: STATUSES }, closed_day: nullable(DAY), reason: nullable({ type: "string", minLength: 1 }), reopens: nullable(ID)
    },
    additionalProperties: false
  },
  Rule: {
    title: "Rule of the catalogue",
    type: "object",
    required: ["id", "name", "dimension", "severity", "product", "record", "fires", "responsible", "suggestion", "financing"],
    properties: {
      id: RULE_ID, name: { type: "string", minLength: 1 }, dimension: { enum: ["Completeness", "Consistency", "Validity", "Uniqueness", "Timeliness"] },
      severity: { enum: ["high", "medium", "low"] }, product: { enum: ["po_line", "supplier", "material", "contract"] }, record: { type: "string" },
      fires: { type: "string", minLength: 1 }, responsible: { type: "string", minLength: 1 }, suggestion: nullable({ type: "string" }), financing: { type: "boolean" }
    },
    additionalProperties: false
  },
  Exception: {
    title: "Exception, as the engine returns it",
    type: "object",
    required: ["id", "rule", "record", "severity", "responsible", "routed_to", "spend_eur", "financing_cost_eur", "unpaid", "suggestion", "status", "detected_day", "rule_set_version"],
    properties: {
      id: { type: "string", pattern: "^DQ-[0-9]{2}\\|.+$" }, rule: RULE_ID,
      record: { type: "object", required: ["product", "id"], properties: { product: { enum: ["po_line", "supplier", "material", "contract"] }, id: ID, supplier: ID, company_code: COMPANY_CODE, pair: { type: "array", items: ID, minItems: 2, maxItems: 2 } }, additionalProperties: false },
      severity: { enum: ["high", "medium", "low"] }, responsible: nullable(ID), routed_to: nullable(ID),
      spend_eur: { type: "number", minimum: 0 }, financing_cost_eur: { type: "number", minimum: 0 }, unpaid: nullable({ type: "boolean" }),
      suggestion: nullable({ $ref: "#/$defs/Suggestion" }), status: { enum: STATUSES }, detected_day: DAY, rule_set_version: { type: "string", pattern: "^[0-9]+\\.[0-9]+\\.[0-9]+$" },
      lines: { type: "array", items: ID }, match: { type: "array", items: { enum: ["vat", "name"] } }, vat_problem: { enum: ["missing", "prefix", "format"] },
      bank_problem: { enum: ["missing", "foreign"] }, owner_problem: { enum: ["missing", "left"] }, covering: { type: "array", items: ID }, contract_found: { type: "boolean" }
    },
    additionalProperties: false
  },
  Case: {
    title: "Case: the exceptions that share one root cause (a dq_group group)",
    type: "object",
    required: ["grouping_id", "group", "rules", "exceptions", "root_cause", "fix_at_source"],
    properties: {
      id: ID, title: { type: "string", minLength: 1 }, grouping_id: { type: "string", pattern: "^grp-[0-9]+$" },
      group: { type: "object", required: ["key", "value"], properties: { key: { enum: GROUP_KEYS }, value: { type: "string", minLength: 1 } }, additionalProperties: false },
      rules: { type: "array", items: RULE_ID, minItems: 1, uniqueItems: true }, exceptions: { type: "array", items: { type: "string" }, minItems: 1, uniqueItems: true },
      root_cause: { type: "string", minLength: 1 }, fix_at_source: { type: "string", minLength: 1 },
      spend_eur: { type: "number", minimum: 0 }, financing_cost_eur: { type: "number", minimum: 0 },
      routed_to: { type: "object", patternProperties: { "^.+$": { type: "integer", minimum: 1 } } }, checked: { type: "array", items: { type: "string" } }
    },
    additionalProperties: false
  },
  Suggestion: { $ref: "#/$defs/Suggestion" },
  FixPath: {
    title: "Fix path of a case (A to D, or doing nothing)",
    type: "object",
    required: ["id", "title", "applicable", "closed", "spend_covered_eur", "avoided_now_eur", "prevented_per_year", "future_avoided_eur_per_year", "effort_eur", "days", "prevents_after_days"],
    properties: {
      id: { enum: ["A", "B", "C", "D", "nothing"] }, title: { type: "string", minLength: 1 }, applicable: { type: "boolean" },
      closed: nullable({ type: "integer", minimum: 0 }), spend_covered_eur: nullable({ type: "number", minimum: 0 }), avoided_now_eur: nullable({ type: "number", minimum: 0 }),
      prevented_per_year: nullable({ type: "number", minimum: 0 }), future_avoided_eur_per_year: nullable({ type: "number", minimum: 0 }),
      effort_eur: nullable({ type: "number", minimum: 0 }), days: nullable({ type: "number", minimum: 0 }), prevents_after_days: nullable({ type: "number", minimum: 0 }),
      gains_per_year: { type: "number", minimum: 0 }, gains_cost_eur_per_year: { type: "number", minimum: 0 }, past_cost_eur: { type: "number", minimum: 0 }
    },
    additionalProperties: false
  },
  Decision: {
    title: "A person's decision on the options on screen",
    type: "object",
    required: ["option_id", "options_seq", "decision", "by"],
    properties: { option_id: { enum: ["A", "B", "C", "D", "nothing"] }, option_label: { type: "string" }, options_seq: { type: "integer", minimum: 1 }, decision: { enum: ["approved", "rejected"] }, by: { const: "user" }, note: nullable({ type: "string" }) },
    additionalProperties: false
  },
  Draft: {
    title: "Draft in the outbox (nothing is sent)",
    type: "object",
    required: ["action_id", "kind", "recipient", "subject", "body", "records", "status"],
    properties: {
      action_id: ID, kind: { enum: DRAFT_KINDS }, recipient: { type: "string", minLength: 1 }, subject: { type: "string", minLength: 1, maxLength: 160 },
      body: { type: "string", minLength: 1 }, records: { type: "array", items: { type: "string", minLength: 1 } }, status: { enum: ["pending", "approved", "rejected"] },
      unchecked: { type: "array", items: { type: "string" } }
    },
    additionalProperties: false
  },
  RunEvent: {
    title: "Run event (the envelope of the run-event bus)",
    type: "object",
    required: ["id", "seq", "type", "ts", "t", "run_id", "mode", "payload"],
    properties: {
      id: { type: "string", minLength: 1 }, seq: { type: "integer", minimum: 1 }, type: { enum: EVENT_TYPES }, ts: { type: "string", pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}T" },
      t: nullable({ type: "integer", minimum: 0 }), run_id: nullable({ type: "string" }), mode: nullable({ enum: ["live", "simulation"] }), payload: { type: "object" }
    },
    additionalProperties: false
  },
  AuditEvent: {
    title: "Audit event (the audit log, exported as JSON)",
    type: "object",
    required: ["seq", "ts", "type", "run_id", "mode", "actor", "rule_set_version", "engine_version"],
    properties: {
      seq: { type: "integer", minimum: 1 }, ts: { type: "string", pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}T" }, type: { type: "string", minLength: 1 },
      run_id: nullable({ type: "string" }), mode: nullable({ enum: ["live", "simulation"] }), actor: { enum: ["system", "engine", "agent", "user"] },
      rule_set_version: { type: "string" }, engine_version: { type: "string" }, payload: { type: "object" },
      model: nullable({ type: "string" }), usage: nullable({ type: "object" }), cost_eur: nullable({ type: "number", minimum: 0 })
    },
    additionalProperties: false
  }
};

/** The world as a whole: meta, company codes, plants, taxonomy and the five products with the log. */
export const WORLD_SCHEMA = {
  type: "object",
  required: ["meta", "company_codes", "users", "suppliers", "materials", "contracts", "po_lines", "exception_log"],
  properties: {
    $comment: { type: "string" },
    meta: { type: "object" },
    company_codes: { type: "array", items: { type: "object", required: ["id", "name", "city", "country", "currency"], properties: { id: COMPANY_CODE, name: { type: "string" }, city: { type: "string" }, country: COUNTRY, currency: { enum: ["EUR", "GBP"] } }, additionalProperties: false } },
    plants: { type: "array", items: { type: "object", required: ["id", "name", "company_code", "role"], properties: { id: { type: "string", pattern: "^[0-9]{4}$" }, name: { type: "string" }, company_code: COMPANY_CODE, role: { type: "string" } }, additionalProperties: false } },
    taxonomy: { type: "array", items: { type: "object", required: ["code", "name", "category"], properties: { code: { type: "string", pattern: "^[A-Z]+(-[A-Z]+)*$" }, name: { type: "string" }, category: { type: "string" }, words: { type: "array", items: { type: "string" } } }, additionalProperties: false } },
    users: { type: "array", items: { $ref: "#/$defs/User" } },
    suppliers: { type: "array", items: { $ref: "#/$defs/Supplier" } },
    materials: { type: "array", items: { $ref: "#/$defs/Material" } },
    contracts: { type: "array", items: { $ref: "#/$defs/Contract" } },
    po_lines: { type: "array", items: { $ref: "#/$defs/PoLine" } },
    exception_log: { type: "array", items: { $ref: "#/$defs/LogEntry" } }
  },
  additionalProperties: false
};

/** Every schema by name, for "$ref" across schemas. */
export const ALL_DEFS = { ...SCHEMAS, ...DEFS };

const TS = { type: "string", pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}T" };
const PARAM_NAME = { enum: ["day_rate_eur", "hours_per_day", "mass_setup_days", "mass_minutes_per_record", "mass_lead_days", "followup_prep_days",
  "followup_owner_minutes", "followup_window_days", "source_fix_days", "source_lead_days", "cost_of_capital", "window_days"] };

/** The JSON exports' own schemas (validated with the same validator and ALL_DEFS). */
export const EXPORT_SCHEMAS = {
  AuditExport: {
    title: "The audit export (data-quality-<run>[-SIMULATION|-LIVE]-audit.json)",
    type: "object",
    required: ["app", "app_version", "rule_set_version", "engine_version", "world_version", "exported_at", "mode", "mode_statement", "ai_disclosure",
      "company_note", "reviewer", "run", "model", "usage", "parameters", "parameter_changes", "run_facts", "cost", "counts", "events", "audit_log", "api_exchanges"],
    properties: {
      app: { type: "string", minLength: 1 }, app_version: { type: "string", pattern: "^[0-9]+\\.[0-9]+\\.[0-9]+$" },
      rule_set_version: { type: "string", minLength: 1 }, engine_version: { type: "string", minLength: 1 }, world_version: nullable({ type: "string" }),
      exported_at: TS, mode: nullable({ enum: ["live", "simulation"] }), mode_statement: { type: "string", minLength: 1 },
      ai_disclosure: { type: "string", minLength: 1 }, company_note: { type: "string", minLength: 1 }, reviewer: { type: "string", minLength: 1 },
      run: nullable({
        type: "object", required: ["run_id", "mode", "entry", "title", "started_at", "ended_at", "status"],
        properties: {
          run_id: { type: "string", minLength: 1 }, mode: { enum: ["live", "simulation"] }, entry: { enum: ["scenario", "sweep", "custom"] },
          scenario_id: nullable({ type: "string" }), title: { type: "string" }, tip: nullable({ type: "string" }), model: nullable({ type: "string" }),
          sim_source: nullable({ enum: ["authored", "recorded"] }), started_at: TS, ended_at: nullable(TS), status: { type: "string", minLength: 1 }
        },
        additionalProperties: false
      }),
      model: nullable({ type: "string" }), usage: nullable({ type: "object" }),
      parameters: nullable({
        type: "object", required: ["in_effect", "changed", "source"],
        properties: {
          in_effect: { type: "object", required: PARAM_NAME.enum, patternProperties: { "^[a-z_]+$": { type: "number", minimum: 0 } }, additionalProperties: false },
          changed: { type: "array", items: { type: "object", required: ["name", "label", "value", "default"], properties: { name: PARAM_NAME, label: { type: "string" }, value: { type: "number" }, default: { type: "number" } }, additionalProperties: false } },
          source: { enum: ["defaults", "method dialog"] }
        },
        additionalProperties: false
      }),
      parameter_changes: { type: "array", items: { type: "object", required: ["ts", "name", "label", "from", "to"], properties: { ts: TS, name: PARAM_NAME, label: { type: "string" }, from: { type: "number" }, to: { type: "number" } }, additionalProperties: false } },
      run_facts: nullable({ type: "object" }), cost: nullable({ type: "object" }), counts: { type: "object" },
      events: { type: "array", items: { $ref: "#/$defs/RunEvent" } },
      audit_log: { type: "array", items: { $ref: "#/$defs/AuditEvent" } },
      api_exchanges: { type: "array", items: { type: "object" } }
    },
    additionalProperties: false
  }
};
