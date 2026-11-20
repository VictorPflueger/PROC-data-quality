// The six scenarios as simulation scripts, written by hand ("source": "authored"): there is no API key
// in the build environment. A script is the event stream of a run: narration, tool calls with their
// inputs, and at the decision what to draft for each path. At playback the player executes every tool
// call through the same toolbox the live agent uses (js/tools.js), so each script is held to the live
// guardrails, and every figure comes from the engine: texts write {{name}} placeholders (js/sim_vars.js)
// that the player fills from the tool results. tools/check_world.mjs runs each script along every
// decision path before a demo. Narration carries no figures, as the live agent's must not.
//
// Step kinds: { think }, { say, kind?: "hypothesis" | "revision" }, { tool, input }, { decide }.
// decide: { approved: { default, nothing }, rejected: { default }, allRejected, drafts: { change_request,
//   follow_up (one per routed-to person: {{person.name}}, {{person.id}}), prevention, risk_memo },
//   report: { fix_approved, risk_accepted, stopped } }.
window.SIM_RUNS = {
  "SC-PUNCHOUT": {
    id: "SC-PUNCHOUT",
    source: "authored",
    title: "Contract references lost in punch-out",
    steps: [
      { think: "The tip names Lyon, lab supplies and a framework contract. Lyon is plant 3010, and a missing contract reference while a contract covers the order is rule DQ-01." },
      { tool: "erp_get_overview", input: {} },
      { say: "I start with every rule over Lyon's data, so nothing outside the tip's guess is missed." },
      { tool: "dq_scan", input: { filters: [{ key: "plant", values: ["3010"] }] } },
      { say: "Hypothesis: one buyer at Lyon leaves the contract reference out when ordering lab supplies.", kind: "hypothesis" },
      { tool: "dq_group", input: { rules: ["DQ-01"], by: ["buyer"], filters: [{ key: "plant", values: ["3010"] }] } },
      { tool: "erp_query", input: { product: "po_line", filters: [{ field: "buyer", op: "eq", value: "U126" }, { field: "contract", op: "not_empty" }], fields: ["id", "channel", "contract", "supplier"], order_by: "day", descending: true, limit: 8 } },
      { say: "Revised: the same buyer's contract call-offs carry the reference, so the buyer is not the cause. The missing references sit on the lines that arrive through punch-out.", kind: "revision" },
      { tool: "dq_group", input: { rules: ["DQ-01"], by: ["channel"], filters: [{ key: "plant", values: ["3010"] }] } },
      { tool: "erp_get_record", input: { product: "po_line", id: "{{grp.top.record.1}}" } },
      { tool: "erp_get_record", input: { product: "po_line", id: "{{grp.top.record.2}}" } },
      { tool: "erp_get_record", input: { product: "po_line", id: "{{grp.top.record.3}}" } },
      { tool: "erp_get_record", input: { product: "contract", id: "4600000101" } },
      { say: "Each line orders lab consumables from Lumen Labware, and the framework contract with that supplier was valid on every order day. The catalog drops the reference on the way back." },
      { tool: "dq_suggest", input: { grouping: "{{grp.id}}", group: "punch-out" } },
      { tool: "ui_mark_board", input: { rules: ["DQ-01"], records: ["{{grp.top.record.1}}", "{{grp.top.record.2}}", "{{grp.top.record.3}}"], people: ["U126"], view: "rules" } },
      { tool: "ui_report_alert", input: {
        title: "Contract references lost in punch-out at Lyon",
        grouping: "{{grp.id}}", group: "punch-out",
        root_cause: "The punch-out catalog of Lumen Labware (supplier 80001) does not pass the framework contract's number back into the order lines.",
        fix_at_source: "Map the number of contract 4600000101 in the punch-out catalog's interface.",
        summary: "{{grp.top.exceptions}} of {{grp.base}} DQ-01 exceptions at plant 3010 come through punch-out, on order lines worth {{grp.top.spend}}. The contract compliance report cannot see them, and every line has its contract as a deterministic suggestion."
      } },
      { tool: "dq_history", input: { grouping: "{{grp.id}}", group: "punch-out" } },
      { tool: "dq_fix_paths", input: { grouping: "{{grp.id}}", group: "punch-out" } },
      { say: "Every exception has a suggestion, so a mass correction can close the case now; only a fix in the catalog stops new ones." },
      { tool: "ui_propose_options", input: {
        fix_paths_id: "{{fp.id}}",
        options: [
          { path: "A", title: "Mass correction of the references", description: "Set contract 4600000101 on the {{path.A.closed}} punch-out lines in one change.", residual_risk: "New punch-out orders keep arriving without the reference." },
          { path: "B", title: "Ask the buyer to correct the lines", description: "One follow-up to the Lyon lab buyer, who corrects the lines within the follow-up window.", residual_risk: "Closure depends on the buyer's time; the history suggests {{path.B.closed}} of {{case.n}} close." },
          { path: "C", title: "Mass correction and fix the catalog mapping", description: "Correct the {{path.C.closed}} lines and have the punch-out interface return the contract number.", residual_risk: "The mapping change needs the supplier's catalog team." }
        ],
        recommended: "C",
        nothing_note: "About {{path.nothing.gains}} more lines a year lose the reference, and the compliance report stays blind to them."
      } },
      { decide: {
        approved: { default: "Path {{approved.path}} is approved. I am drafting what it allows; nothing is sent.", nothing: "The risk is accepted. I am recording it in a memo." },
        rejected: { default: "Understood: path {{rejected.path}} is off the table. The other options stay open." },
        drafts: {
          change_request: { recipient: "{{role.lead}}", subject: "Mock change request: contract reference on punch-out lines at Lyon", body: "Please set contract 4600000101 as the contract reference on the order lines below, as approved in path {{approved.path}}. They came through Lumen Labware's punch-out catalog without it." },
          follow_up: { subject: "Contract reference missing on your punch-out orders", body: "Hello {{person.name}},\n\nthe order lines below came through Lumen Labware's punch-out catalog without the framework contract's reference. Please add contract 4600000101 to each of them within the follow-up window." },
          prevention: { recipient: "{{role.lead}}", subject: "Prevention request: return the contract number from the punch-out catalog", body: "Root cause: the punch-out catalog of Lumen Labware (supplier 80001) does not pass the contract number back into the order lines.\n\nChange at the source: map contract 4600000101 in the catalog's interface, so that new punch-out lines carry their reference." },
          risk_memo: { recipient: "{{role.lead}}", subject: "Risk accepted: contract references missing on punch-out lines at Lyon", body: "Decision: the {{case.n}} punch-out lines at plant 3010 keep their missing contract reference for now.\n\nReason given: {{decision.note}}\n\nThe contract compliance report will not show these orders, and about {{path.nothing.gains}} more lines a year are expected until the catalog is fixed." }
        },
        report: {
          fix_approved: "## Contract references lost in punch-out\n\n**Case:** {{case.n}} DQ-01 exceptions at plant 3010, all from Lumen Labware's punch-out catalog, on lines worth {{case.spend}} (each line counted once).\n\n**Decision:** path {{approved.path}}, {{approved.title}}: approved, re-scan pending. The closure rate is projected at {{approved.projected}} after re-scan, against {{kpi.measured}} measured today.\n\n**Outbox:** {{actions.approved}} of {{actions.total}} drafts approved; nothing was sent.",
          risk_accepted: "## Contract references lost in punch-out\n\n**Case:** {{case.n}} DQ-01 exceptions at plant 3010 from Lumen Labware's punch-out catalog.\n\n**Decision:** the risk is accepted and recorded in a memo. The exceptions stay open and visible; about {{path.nothing.gains}} more are expected a year.\n\n**Outbox:** {{actions.approved}} of {{actions.total}} drafts approved; nothing was sent.",
          stopped: "## Contract references lost in punch-out\n\n**Case:** {{case.n}} DQ-01 exceptions at plant 3010 from Lumen Labware's punch-out catalog.\n\n**Decision:** every proposed fix path was rejected, and the risk was not accepted. Nothing is drafted; the exceptions stay open."
        }
      } }
    ]
  },

  "SC-EARLY-PAY": {
    id: "SC-EARLY-PAY",
    source: "authored",
    title: "Paying too early",
    steps: [
      { think: "Birmingham is company code 2000. Terms shorter than agreed are DQ-07, missing terms DQ-06; both carry a financing cost." },
      { tool: "erp_get_overview", input: {} },
      { tool: "dq_scan", input: { rules: ["DQ-06", "DQ-07"], filters: [{ key: "company_code", values: ["2000"] }] } },
      { say: "Hypothesis: one supplier's contracts were set up with the wrong terms.", kind: "hypothesis" },
      { tool: "dq_group", input: { rules: ["DQ-07", "DQ-06"], by: ["supplier"], filters: [{ key: "company_code", values: ["2000"] }] } },
      { say: "Revised: the short terms spread over several suppliers, so their contracts are not the cause. I group by who created the orders instead.", kind: "revision" },
      { tool: "dq_group", input: { rules: ["DQ-07", "DQ-06"], by: ["created_by"], filters: [{ key: "company_code", values: ["2000"] }] } },
      { tool: "erp_get_record", input: { product: "user_org", id: "U190" } },
      { tool: "erp_get_record", input: { product: "po_line", id: "{{grp.top.record.1}}" } },
      { tool: "erp_get_record", input: { product: "po_line", id: "{{grp.top.record.2}}" } },
      { tool: "erp_get_record", input: { product: "po_line", id: "{{grp.top.record.3}}" } },
      { say: "The creator is a shared buying profile of the indirect team. Its orders carry a short default key, while the contracts and the suppliers' terms agree on longer ones." },
      { tool: "dq_suggest", input: { grouping: "{{grp.id}}", group: "U190" } },
      { tool: "ui_mark_board", input: { rules: ["DQ-07", "DQ-06"], people: ["U124", "U125"], view: "people" } },
      { tool: "ui_report_alert", input: {
        title: "Birmingham pays early on a buying profile's orders",
        grouping: "{{grp.id}}", group: "U190",
        root_cause: "The indirect team in Birmingham orders through one shared buying profile whose default payment-terms key is 14 days.",
        fix_at_source: "Set the buying profile's default payment-terms key to the agreed terms.",
        summary: "All {{grp.top.exceptions}} payment-terms exceptions in company code 2000 were created by the buying profile U190, on lines worth {{grp.top.spend}}. Every line has the agreed terms as a deterministic suggestion."
      } },
      { tool: "dq_history", input: { grouping: "{{grp.id}}", group: "U190" } },
      { tool: "dq_fix_paths", input: { grouping: "{{grp.id}}", group: "U190" } },
      { say: "Most of the financing cost is already paid and cannot be recovered; correcting the unpaid lines avoids the rest, and only the profile's key stops the yearly run rate." },
      { tool: "ui_propose_options", input: {
        fix_paths_id: "{{fp.id}}",
        options: [
          { path: "A", title: "Correct the terms now", description: "Set the agreed terms on all {{path.A.closed}} lines; the unpaid ones avoid {{path.A.cost_now}} of financing cost.", residual_risk: "The profile keeps creating short-terms orders." },
          { path: "B", title: "Ask the two buyers", description: "Follow-ups to the buyers whose orders carry the short key, listing each line.", residual_risk: "The history suggests {{path.B.closed}} of {{case.n}} close within the window." },
          { path: "C", title: "Correct the terms and fix the profile's key", description: "Correct the lines and set the profile's default key to the agreed terms, preventing about {{path.C.prevented}} exceptions a year.", residual_risk: "Until the key changes, new orders keep the short terms." }
        ],
        recommended: "C",
        nothing_note: "The profile keeps paying early, at a financing cost of about {{path.nothing.cost}} a year."
      } },
      { decide: {
        approved: { default: "Path {{approved.path}} is approved. I am drafting what it allows; nothing is sent.", nothing: "The risk is accepted. I am recording it in a memo." },
        rejected: { default: "Understood: path {{rejected.path}} is off the table. The other options stay open." },
        drafts: {
          change_request: { recipient: "{{role.lead}}", subject: "Mock change request: agreed payment terms on Birmingham orders", body: "Please set the agreed payment terms on the order lines below, as approved in path {{approved.path}}. Correcting the unpaid lines first avoids {{approved.cost_now}} of financing cost." },
          follow_up: { subject: "Payment terms shorter than agreed on your orders", body: "Hello {{person.name}},\n\nthe order lines below were created by the indirect team's buying profile with a short default payment-terms key. Please correct each line to the agreed terms within the follow-up window." },
          prevention: { recipient: "{{role.lead}}", subject: "Prevention request: the buying profile's default payment terms", body: "Root cause: the indirect team in Birmingham orders through one shared buying profile whose default payment-terms key is 14 days.\n\nChange at the source: set the profile's default key to the agreed terms. This prevents about {{approved.prevented}} exceptions a year." },
          risk_memo: { recipient: "{{role.lead}}", subject: "Risk accepted: early payment on the buying profile's orders", body: "Decision: the {{case.n}} lines with short payment terms in company code 2000 stay as they are for now.\n\nReason given: {{decision.note}}\n\nThe financing cost of paying early continues at about {{path.nothing.cost}} a year." }
        },
        report: {
          fix_approved: "## Paying too early in Birmingham\n\n**Case:** {{case.n}} DQ-07 and DQ-06 exceptions in company code 2000, all created by the buying profile U190, on lines worth {{case.spend}}. Financing cost over the last year: {{case.financing}}, of which {{case.unpaid}} on lines not yet paid.\n\n**Decision:** path {{approved.path}}, {{approved.title}}: approved, re-scan pending. It avoids {{approved.cost_now}} now; the closure rate is projected at {{approved.projected}} after re-scan.\n\n**Outbox:** {{actions.approved}} of {{actions.total}} drafts approved; nothing was sent.",
          risk_accepted: "## Paying too early in Birmingham\n\n**Case:** {{case.n}} exceptions created by the buying profile U190 in company code 2000.\n\n**Decision:** the risk is accepted and recorded in a memo; the financing cost continues at about {{path.nothing.cost}} a year. The exceptions stay open and visible.\n\n**Outbox:** {{actions.approved}} of {{actions.total}} drafts approved; nothing was sent.",
          stopped: "## Paying too early in Birmingham\n\n**Case:** {{case.n}} exceptions created by the buying profile U190.\n\n**Decision:** every proposed fix path was rejected, and the risk was not accepted. Nothing is drafted; the exceptions stay open."
        }
      } }
    ]
  },

  "SC-UNCLASSIFIED": {
    id: "SC-UNCLASSIFIED",
    source: "authored",
    title: "Unclassified spend",
    steps: [
      { think: "Duisburg is plant 1020. Unclassified spend means order lines without a material group: rule DQ-02." },
      { tool: "erp_get_overview", input: {} },
      { tool: "dq_scan", input: { rules: ["DQ-02", "DQ-03"], filters: [{ key: "plant", values: ["1020"] }] } },
      { say: "Hypothesis: one requester types free text and leaves the group empty.", kind: "hypothesis" },
      { tool: "dq_group", input: { rules: ["DQ-02"], by: ["created_by"], filters: [{ key: "plant", values: ["1020"] }] } },
      { say: "Revised: several requesters share the gap, and all of the lines are free-text requisitions. The form is the common factor.", kind: "revision" },
      { tool: "dq_group", input: { rules: ["DQ-02"], by: ["channel"], filters: [{ key: "plant", values: ["1020"] }] } },
      { tool: "erp_get_record", input: { product: "po_line", id: "{{grp.top.record.1}}" } },
      { tool: "erp_get_record", input: { product: "po_line", id: "{{grp.top.record.2}}" } },
      { tool: "erp_get_record", input: { product: "po_line", id: "{{grp.top.record.3}}" } },
      { tool: "dq_suggest", input: { grouping: "{{grp.id}}", group: "free-text requisition" } },
      { say: "A few lines carry a material, so the master gives their group. The rest are free text: I propose a group for each from its short text, for your review." },
      { tool: "dq_classify", input: { items: [
        { line_id: "4500101059/10", group_code: "MRO-TOOLS", words: ["cordless drill"], confidence: "high" },
        { line_id: "4500101062/10", group_code: "MRO-SPARES", words: ["ball bearing", "conveyor drive"], confidence: "high" },
        { line_id: "4500101065/10", group_code: "OFFICE", words: ["toner cartridge", "printer"], confidence: "high" },
        { line_id: "4500101075/10", group_code: "PACK-FILM", words: ["stretch film"], confidence: "high" },
        { line_id: "4500101094/10", group_code: "MRO-SPARES", words: ["V-belt", "fan drive"], confidence: "high" },
        { line_id: "4500101098/10", group_code: "PACK-PALLET", words: ["Euro pallets"], confidence: "high" },
        { line_id: "4500101119/10", group_code: "SVC-SEC", words: ["access control", "maintenance"], confidence: "medium" },
        { line_id: "4500101129/30", group_code: "PACK-PALLET", words: ["load carrier"], confidence: "high" },
        { line_id: "4500101141/10", group_code: "MRO-PPE", words: ["hi-vis vests"], confidence: "high" },
        { line_id: "4500101142/10", group_code: "MRO-TOOLS", words: ["torque wrench"], confidence: "high" },
        { line_id: "4500101148/10", group_code: "MRO-SPARES", words: ["hydraulic filter element"], confidence: "high" },
        { line_id: "4500101153/10", group_code: "MRO-SPARES", words: ["solenoid valve"], confidence: "high" },
        { line_id: "4500101155/10", group_code: "MRO-LUBE", words: ["grease cartridges"], confidence: "high" },
        { line_id: "4500101176/10", group_code: "PACK-CARTON", words: ["corrugated cartons"], confidence: "high" },
        { line_id: "4500101177/10", group_code: "MRO-PPE", words: ["safety goggles"], confidence: "high" },
        { line_id: "4500101182/10", group_code: "CHEM", words: ["epoxy resin"], confidence: "medium" },
        { line_id: "4500101185/10", group_code: "SVC-LOG", words: ["courier service"], confidence: "high" },
        { line_id: "4500101186/10", group_code: "MRO-LUBE", words: ["hydraulic oil"], confidence: "high" },
        { line_id: "4500101188/10", group_code: "PACK-FILM", words: ["packing tape"], confidence: "high" },
        { line_id: "4500101218/10", group_code: "SVC-LOG", words: ["customs clearance"], confidence: "high" },
        { line_id: "4500101234/10", group_code: "SVC-LOG", words: ["warehousing"], confidence: "high" },
        { line_id: "4500101238/10", group_code: "OFFICE", words: ["copy paper"], confidence: "high" },
        { line_id: "4500101253/10", group_code: "MRO-LUBE", words: ["gear oil"], confidence: "high" },
        { line_id: "4500101263/10", group_code: "PACK-CARTON", words: ["folding box"], confidence: "high" },
        { line_id: "4500101263/20", group_code: "PACK-CARTON", words: ["shipping carton"], confidence: "high" },
        { line_id: "4500101268/10", group_code: "MRO-PPE", words: ["nitrile gloves"], confidence: "high" },
        { line_id: "4500101279/10", group_code: "CHEM", words: ["soldering flux"], confidence: "medium" },
        { line_id: "4500101291/10", group_code: "MRO-TOOLS", words: ["angle grinder discs"], confidence: "high" },
        { line_id: "4500101313/10", group_code: "MRO-PPE", words: ["earplugs"], confidence: "high" },
        { line_id: "4500101321/10", group_code: "CHEM-CLEAN", words: ["industrial degreaser"], confidence: "medium" },
        { line_id: "4500101322/10", group_code: "CHEM", words: ["acetone"], confidence: "high" },
        { line_id: "4500101334/10", group_code: "MRO-LUBE", words: ["cutting fluid"], confidence: "high" }
      ] } },
      { tool: "ui_request_review", input: {
        line_ids: ["4500101059/10", "4500101062/10", "4500101065/10", "4500101075/10", "4500101094/10", "4500101098/10", "4500101119/10", "4500101129/30",
          "4500101141/10", "4500101142/10", "4500101148/10", "4500101153/10", "4500101155/10", "4500101176/10", "4500101177/10", "4500101182/10",
          "4500101185/10", "4500101186/10", "4500101188/10", "4500101218/10", "4500101234/10", "4500101238/10", "4500101253/10", "4500101263/10",
          "4500101263/20", "4500101268/10", "4500101279/10", "4500101291/10", "4500101313/10", "4500101321/10", "4500101322/10", "4500101334/10"],
        note: "Each proposed group rests on the words shown from the line's short text. Approve the ones you agree with; the others stay without a suggestion."
      } },
      { say: "Only the groups you approved count as fixes; a rejected one leaves its line without a suggestion." },
      { tool: "ui_mark_board", input: { rules: ["DQ-02"], people: ["U122", "U123"], view: "rules" } },
      { tool: "ui_report_alert", input: {
        title: "Unclassified free-text spend at Duisburg",
        grouping: "{{grp.id}}", group: "free-text requisition",
        root_cause: "Duisburg's free-text requisition form lets the material group stay empty.",
        fix_at_source: "Make the material group a mandatory field of the free-text form.",
        summary: "All {{grp.top.exceptions}} DQ-02 exceptions at plant 1020 are free-text requisitions, on lines worth {{grp.top.spend}}. You approved {{rev.approved}} AI-suggested groups, and {{sug.with}} lines take the material master's group."
      } },
      { tool: "dq_history", input: { grouping: "{{grp.id}}", group: "free-text requisition" } },
      { tool: "dq_fix_paths", input: { grouping: "{{grp.id}}", group: "free-text requisition" } },
      { say: "A mass correction can now close the lines with an approved or master group; the form change stops new unclassified spend." },
      { tool: "ui_propose_options", input: {
        fix_paths_id: "{{fp.id}}",
        options: [
          { path: "A", title: "Mass correction with the reviewed groups", description: "Set the material group on the {{path.A.closed}} lines with an approved or master suggestion.", residual_risk: "Lines whose suggestion was rejected stay unclassified." },
          { path: "B", title: "Ask the buyers to classify", description: "Follow-ups to the two Duisburg buyers, listing each line without a group.", residual_risk: "The history suggests {{path.B.closed}} of {{case.n}} close within the window." },
          { path: "C", title: "Mass correction and a mandatory field", description: "Correct the {{path.C.closed}} lines and make the material group mandatory in the free-text form.", residual_risk: "Requesters may pick a wrong group once it is mandatory." }
        ],
        recommended: "C",
        nothing_note: "About {{path.nothing.gains}} more unclassified lines a year reach the spend cube."
      } },
      { decide: {
        approved: { default: "Path {{approved.path}} is approved. I am drafting what it allows; nothing is sent.", nothing: "The risk is accepted. I am recording it in a memo." },
        rejected: { default: "Understood: path {{rejected.path}} is off the table. The other options stay open." },
        drafts: {
          change_request: { recipient: "{{role.material_steward}}", subject: "Mock change request: material groups on Duisburg free-text lines", body: "Please set the material group on the order lines below, as approved in path {{approved.path}}. Each value is a reviewed AI suggestion or the material master's group." },
          follow_up: { subject: "Material group missing on your free-text requisitions", body: "Hello {{person.name}},\n\nthe free-text order lines below have no material group, so their spend is unclassified. Please add the group to each line within the follow-up window." },
          prevention: { recipient: "{{role.material_steward}}", subject: "Prevention request: make the material group mandatory in the free-text form", body: "Root cause: Duisburg's free-text requisition form lets the material group stay empty.\n\nChange at the source: make the material group a mandatory field of the form, with the taxonomy as its list of values." },
          risk_memo: { recipient: "{{role.lead}}", subject: "Risk accepted: unclassified free-text spend at Duisburg", body: "Decision: the {{case.n}} free-text lines at plant 1020 stay without a material group for now.\n\nReason given: {{decision.note}}\n\nAbout {{path.nothing.gains}} more unclassified lines a year are expected until the form changes." }
        },
        report: {
          fix_approved: "## Unclassified spend at Duisburg\n\n**Case:** {{case.n}} DQ-02 exceptions at plant 1020, all free-text requisitions, on lines worth {{case.spend}}.\n\n**Review:** {{rev.approved}} AI-suggested groups approved and {{rev.rejected}} rejected; only the approved ones count.\n\n**Decision:** path {{approved.path}}, {{approved.title}}: approved, re-scan pending. The closure rate is projected at {{approved.projected}} after re-scan.\n\n**Outbox:** {{actions.approved}} of {{actions.total}} drafts approved; nothing was sent.",
          risk_accepted: "## Unclassified spend at Duisburg\n\n**Case:** {{case.n}} free-text lines without a material group at plant 1020.\n\n**Decision:** the risk is accepted and recorded in a memo. The exceptions stay open and visible.\n\n**Outbox:** {{actions.approved}} of {{actions.total}} drafts approved; nothing was sent.",
          stopped: "## Unclassified spend at Duisburg\n\n**Case:** {{case.n}} free-text lines without a material group.\n\n**Decision:** every proposed fix path was rejected, and the risk was not accepted. Nothing is drafted; the exceptions stay open."
        }
      } }
    ]
  },

  "SC-REQUESTER": {
    id: "SC-REQUESTER",
    source: "authored",
    title: "Who ordered this?",
    steps: [
      { think: "Frankfurt is plant 1010. An empty or unknown requester is DQ-04; a requester who had already left on the order day is DQ-05." },
      { tool: "erp_get_overview", input: {} },
      { tool: "dq_scan", input: { rules: ["DQ-04", "DQ-05"] } },
      { say: "Hypothesis: the gaps come from the people who left in the reorganisation.", kind: "hypothesis" },
      { tool: "dq_group", input: { rules: ["DQ-04", "DQ-05"], by: ["requester"] } },
      { say: "Revised: no single requester explains it. Empty requesters and leavers sit together at one plant, so the case is Frankfurt after its reorganisation.", kind: "revision" },
      { tool: "dq_group", input: { rules: ["DQ-04", "DQ-05"], by: ["plant"] } },
      { tool: "erp_get_record", input: { product: "po_line", id: "{{grp.top.record.1}}" } },
      { tool: "erp_get_record", input: { product: "po_line", id: "{{grp.top.record.2}}" } },
      { tool: "erp_get_record", input: { product: "po_line", id: "{{grp.top.record.3}}" } },
      { tool: "erp_get_record", input: { product: "user_org", id: "U143" } },
      { tool: "dq_suggest", input: { grouping: "{{grp.id}}", group: "1010" } },
      { say: "There is no deterministic suggestion: only the people involved know who asked for these orders." },
      { tool: "ui_mark_board", input: { rules: ["DQ-04", "DQ-05"], people: ["U101", "U120", "U110"], view: "people" } },
      { tool: "ui_report_alert", input: {
        title: "Requesters missing or gone after Frankfurt's reorganisation",
        grouping: "{{grp.id}}", group: "1010",
        root_cause: "After Frankfurt's reorganisation, requisition templates still name requesters who left, and a new form lets the requester stay empty.",
        fix_at_source: "Make the requester mandatory and check it against active users.",
        summary: "{{grp.top.exceptions}} of {{grp.base}} requester exceptions sit at plant 1010, on lines worth {{grp.top.spend}}. Missing requesters go to the buyers, requesters who left to their managers."
      } },
      { tool: "dq_history", input: { grouping: "{{grp.id}}", group: "1010" } },
      { tool: "dq_fix_paths", input: { grouping: "{{grp.id}}", group: "1010" } },
      { say: "Without suggestions only the owners can close these; a check in the form stops new ones." },
      { tool: "ui_propose_options", input: {
        fix_paths_id: "{{fp.id}}",
        options: [
          { path: "B", title: "Follow up with the owners", description: "One follow-up per routed-to person: buyers name the requester, managers confirm who ordered.", residual_risk: "The history suggests {{path.B.closed}} of {{case.n}} close within the window." },
          { path: "D", title: "Follow-ups and a requester check", description: "The same follow-ups, and the form requires an active requester, preventing about {{path.D.prevented}} exceptions a year.", residual_risk: "Templates must be cleaned of the leavers' names first." }
        ],
        recommended: "D",
        nothing_note: "Internal audit's question stays open, and about {{path.nothing.gains}} more lines a year arrive without a valid requester."
      } },
      { decide: {
        approved: { default: "Path {{approved.path}} is approved. I am drafting what it allows; nothing is sent.", nothing: "The risk is accepted. I am recording it in a memo." },
        rejected: { default: "Understood: path {{rejected.path}} is off the table. The other option stays open." },
        drafts: {
          follow_up: { subject: "Who requested these Frankfurt orders?", body: "Hello {{person.name}},\n\ninternal audit needs the requester of the order lines below: the field is empty or names someone who had already left. Please name the person who asked for each order within the follow-up window." },
          prevention: { recipient: "{{role.lead}}", subject: "Prevention request: a mandatory, active requester", body: "Root cause: after Frankfurt's reorganisation, requisition templates still name requesters who left, and a new form lets the requester stay empty.\n\nChange at the source: make the requester mandatory and check it against active users. This prevents about {{approved.prevented}} exceptions a year." },
          risk_memo: { recipient: "{{role.lead}}", subject: "Risk accepted: requesters missing on Frankfurt orders", body: "Decision: the {{case.n}} lines at plant 1010 keep their missing or outdated requester for now.\n\nReason given: {{decision.note}}\n\nInternal audit's question stays open." }
        },
        report: {
          fix_approved: "## Who ordered this?\n\n**Case:** {{case.n}} DQ-04 and DQ-05 exceptions at plant 1010 after the reorganisation, on lines worth {{case.spend}}.\n\n**Decision:** path {{approved.path}}, {{approved.title}}: approved, re-scan pending. Follow-ups go to {{case.people}} people; the closure rate is projected at {{approved.projected}} after re-scan.\n\n**Outbox:** {{actions.approved}} of {{actions.total}} drafts approved; nothing was sent.",
          risk_accepted: "## Who ordered this?\n\n**Case:** {{case.n}} requester exceptions at plant 1010.\n\n**Decision:** the risk is accepted and recorded in a memo. The exceptions stay open and visible.\n\n**Outbox:** {{actions.approved}} of {{actions.total}} drafts approved; nothing was sent.",
          stopped: "## Who ordered this?\n\n**Case:** {{case.n}} requester exceptions at plant 1010.\n\n**Decision:** every proposed fix path was rejected, and the risk was not accepted. Nothing is drafted; the exceptions stay open."
        }
      } }
    ]
  },

  "SC-ONBOARDING": {
    id: "SC-ONBOARDING",
    source: "authored",
    title: "New suppliers, half the data",
    steps: [
      { think: "Blocked invoices from new suppliers point at incomplete supplier master data: terms per company code, VAT ID and bank details are DQ-09, DQ-10 and DQ-11." },
      { tool: "erp_get_overview", input: {} },
      { tool: "dq_scan", input: { rules: ["DQ-09", "DQ-10", "DQ-11"] } },
      { say: "Hypothesis: a handful of foreign suppliers lack data their countries require.", kind: "hypothesis" },
      { tool: "dq_group", input: { rules: ["DQ-09", "DQ-10", "DQ-11"], by: ["supplier"] } },
      { say: "Revised: the gaps are spread over many suppliers, most of them new. What they share is how they were onboarded.", kind: "revision" },
      { tool: "dq_group", input: { rules: ["DQ-09", "DQ-10", "DQ-11"], by: ["onboarding_channel"] } },
      { tool: "erp_get_record", input: { product: "supplier", id: "{{grp.top.record.1}}" } },
      { tool: "erp_get_record", input: { product: "supplier", id: "{{grp.top.record.2}}" } },
      { tool: "erp_get_record", input: { product: "supplier", id: "{{grp.top.record.3}}" } },
      { tool: "dq_suggest", input: { grouping: "{{grp.id}}", group: "self-registration portal" } },
      { say: "Each of these accounts came through the self-registration portal with a field missing or malformed, and nothing in the data can fill it." },
      { tool: "ui_mark_board", input: { rules: ["DQ-09", "DQ-10", "DQ-11"], people: ["U102"], view: "rules" } },
      { tool: "ui_report_alert", input: {
        title: "Suppliers from the self-registration portal arrive incomplete",
        grouping: "{{grp.id}}", group: "self-registration portal",
        root_cause: "Suppliers onboarded through the self-registration portal arrive without payment terms, VAT ID or bank details checked.",
        fix_at_source: "Required fields and format checks in the portal's onboarding.",
        summary: "{{grp.top.exceptions}} of {{grp.base}} supplier exceptions belong to accounts from the self-registration portal, touching lines worth {{grp.top.spend}}. They all go to the supplier master steward."
      } },
      { tool: "dq_history", input: { grouping: "{{grp.id}}", group: "self-registration portal" } },
      { tool: "dq_fix_paths", input: { grouping: "{{grp.id}}", group: "self-registration portal" } },
      { say: "Nothing in the data can fill these fields, so the steward has to obtain them; checks in the portal stop the next gaps." },
      { tool: "ui_propose_options", input: {
        fix_paths_id: "{{fp.id}}",
        options: [
          { path: "B", title: "Follow up with the steward", description: "One follow-up to the supplier master steward, listing each account and what is missing.", residual_risk: "The history suggests {{path.B.closed}} of {{case.n}} close within the window." },
          { path: "D", title: "Follow-up and checks in the portal", description: "The same follow-up, and required fields with format checks in the portal, preventing about {{path.D.prevented}} exceptions a year.", residual_risk: "Suppliers already onboarded still need the follow-up." }
        ],
        recommended: "D",
        nothing_note: "Invoices from these suppliers stay blocked, and about {{path.nothing.gains}} more gaps a year arrive through the portal."
      } },
      { decide: {
        approved: { default: "Path {{approved.path}} is approved. I am drafting what it allows; nothing is sent.", nothing: "The risk is accepted. I am recording it in a memo." },
        rejected: { default: "Understood: path {{rejected.path}} is off the table. The other option stays open." },
        drafts: {
          follow_up: { subject: "Supplier master data missing after portal onboarding", body: "Hello {{person.name}},\n\nthe supplier records below came through the self-registration portal with payment terms, a VAT ID or bank details missing or malformed. Please obtain the missing data from each supplier within the follow-up window." },
          prevention: { recipient: "{{role.lead}}", subject: "Prevention request: required fields in the self-registration portal", body: "Root cause: suppliers onboarded through the self-registration portal arrive without payment terms, VAT ID or bank details checked.\n\nChange at the source: required fields and format checks in the portal's onboarding. This prevents about {{approved.prevented}} exceptions a year." },
          risk_memo: { recipient: "{{role.lead}}", subject: "Risk accepted: incomplete supplier data from the portal", body: "Decision: the {{case.n}} supplier exceptions from the self-registration portal stay open for now.\n\nReason given: {{decision.note}}\n\nInvoices from these suppliers may stay blocked." }
        },
        report: {
          fix_approved: "## New suppliers, half the data\n\n**Case:** {{case.n}} DQ-09, DQ-10 and DQ-11 exceptions on suppliers from the self-registration portal, touching lines worth {{case.spend}}.\n\n**Decision:** path {{approved.path}}, {{approved.title}}: approved, re-scan pending. The closure rate is projected at {{approved.projected}} after re-scan.\n\n**Outbox:** {{actions.approved}} of {{actions.total}} drafts approved; nothing was sent.",
          risk_accepted: "## New suppliers, half the data\n\n**Case:** {{case.n}} supplier exceptions from the self-registration portal.\n\n**Decision:** the risk is accepted and recorded in a memo. The exceptions stay open and visible.\n\n**Outbox:** {{actions.approved}} of {{actions.total}} drafts approved; nothing was sent.",
          stopped: "## New suppliers, half the data\n\n**Case:** {{case.n}} supplier exceptions from the self-registration portal.\n\n**Decision:** every proposed fix path was rejected, and the risk was not accepted. Nothing is drafted; the exceptions stay open."
        }
      } }
    ]
  },

  "SC-DUPLICATE": {
    id: "SC-DUPLICATE",
    source: "authored",
    title: "Two Apexes?",
    steps: [
      { think: "Two Apexes: the vendor master has two Apex accounts with similar names. Similar names alone never make a duplicate; an equal VAT ID, or an equal normalised name in the same country, does." },
      { tool: "erp_get_overview", input: {} },
      { tool: "erp_get_record", input: { product: "supplier", id: "40001" } },
      { tool: "erp_get_record", input: { product: "supplier", id: "40002" } },
      { say: "Hypothesis: the tip is right, and the two Apex accounts are one supplier entered twice.", kind: "hypothesis" },
      { tool: "dq_scan", input: { rules: ["DQ-12", "DQ-08"] } },
      { say: "Revised: the Apex accounts sit in different countries with different VAT IDs, and the duplicate rule does not pair them. It pairs two other accounts that share one VAT ID, and one of them is blocked.", kind: "revision" },
      { tool: "dq_group", input: { rules: ["DQ-12", "DQ-08"], by: ["supplier"] } },
      { tool: "erp_get_record", input: { product: "supplier", id: "30041" } },
      { tool: "erp_get_record", input: { product: "supplier", id: "80013" } },
      { tool: "erp_get_record", input: { product: "po_line", id: "{{grp.top.record.1}}" } },
      { tool: "erp_get_record", input: { product: "po_line", id: "{{grp.top.record.2}}" } },
      { tool: "dq_suggest", input: { grouping: "{{grp.id}}", group: "80013" } },
      { say: "Orders still reached the blocked account through the MRP interface after the block started." },
      { tool: "ui_mark_board", input: { rules: ["DQ-12", "DQ-08"], records: ["30041", "80013"], view: "rules" } },
      { tool: "ui_report_alert", input: {
        title: "A duplicate supplier account still receives orders",
        grouping: "{{grp.id}}", group: "80013",
        root_cause: "An interface load created a duplicate of an existing account; it was blocked later, but the MRP interface still sends orders to it.",
        fix_at_source: "Check the purchasing block in the interface, and merge the duplicate into the original account.",
        summary: "Supplier 80013 shares its VAT ID with supplier 30041, and {{grp.top.exceptions}} exceptions centre on it, on lines worth {{grp.top.spend}}. The Apex look-alikes, supplier 40001 and supplier 40002, are not duplicates: different countries, different VAT IDs."
      } },
      { tool: "dq_history", input: { grouping: "{{grp.id}}", group: "80013" } },
      { tool: "dq_fix_paths", input: { grouping: "{{grp.id}}", group: "80013" } },
      { say: "Merging accounts is a person's decision; the agent can only route it, and an interface check stops orders to blocked accounts." },
      { tool: "ui_propose_options", input: {
        fix_paths_id: "{{fp.id}}",
        options: [
          { path: "B", title: "Follow up with the owners", description: "Follow-ups to the buyer of the blocked orders and to the supplier master steward for the duplicate.", residual_risk: "The history suggests {{path.B.closed}} of {{case.n}} close within the window." },
          { path: "D", title: "Follow-ups and an interface check", description: "The same follow-ups, and the MRP interface checks the purchasing block, preventing about {{path.D.prevented}} exceptions a year.", residual_risk: "The merge itself needs a person's decision in the vendor master." }
        ],
        recommended: "D",
        nothing_note: "Orders keep reaching the blocked duplicate, about {{path.nothing.gains}} more exceptions a year."
      } },
      { decide: {
        approved: { default: "Path {{approved.path}} is approved. I am drafting what it allows; nothing is sent.", nothing: "The risk is accepted. I am recording it in a memo." },
        rejected: { default: "Understood: path {{rejected.path}} is off the table. The other option stays open." },
        drafts: {
          follow_up: { subject: "Duplicate supplier account 80013", body: "Hello {{person.name}},\n\nsupplier 80013 is a second account of supplier 30041 with the same VAT ID, and it is blocked. Please handle the records below within the follow-up window: move open orders to supplier 30041, and prepare the merge for the vendor master's decision." },
          prevention: { recipient: "{{role.lead}}", subject: "Prevention request: purchasing block check in the MRP interface", body: "Root cause: an interface load created a duplicate of an existing account; it was blocked later, but the MRP interface still sends orders to it.\n\nChange at the source: the interface checks the purchasing block, and the duplicate is merged into the original account. This prevents about {{approved.prevented}} exceptions a year." },
          risk_memo: { recipient: "{{role.lead}}", subject: "Risk accepted: orders to the blocked duplicate account", body: "Decision: supplier 80013 stays as it is for now.\n\nReason given: {{decision.note}}\n\nOrders may keep reaching the blocked account." }
        },
        report: {
          fix_approved: "## Two Apexes?\n\n**Finding:** the Apex look-alikes, supplier 40001 and supplier 40002, are not duplicates. The real duplicate is supplier 80013, which shares its VAT ID with supplier 30041 and still receives orders although it is blocked: {{case.n}} exceptions on lines worth {{case.spend}}.\n\n**Decision:** path {{approved.path}}, {{approved.title}}: approved, re-scan pending. The closure rate is projected at {{approved.projected}} after re-scan.\n\n**Outbox:** {{actions.approved}} of {{actions.total}} drafts approved; nothing was sent.",
          risk_accepted: "## Two Apexes?\n\n**Finding:** the Apex look-alikes are not duplicates; supplier 80013 duplicates supplier 30041.\n\n**Decision:** the risk is accepted and recorded in a memo. The exceptions stay open and visible.\n\n**Outbox:** {{actions.approved}} of {{actions.total}} drafts approved; nothing was sent.",
          stopped: "## Two Apexes?\n\n**Finding:** the Apex look-alikes are not duplicates; supplier 80013 duplicates supplier 30041.\n\n**Decision:** every proposed fix path was rejected, and the risk was not accepted. Nothing is drafted; the exceptions stay open."
        }
      } }
    ]
  }
};
