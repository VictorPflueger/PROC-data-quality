# Gates: M1 shell, world and engine (v0.1.0)

Scope: the shared shell with its two adapted modules, the fictional world with its builder and checker, the rule engine with reconciliation, clean spend, financing cost, history and fix paths, the figure audit, the data contracts with their validator, a first page and CI, each proven against the acceptance criteria AC-01 to AC-07 of the build plan. Every check runs from the repository root with Node 22. The browser checks need Playwright (see tests/README.md), the parity check a Rebate Hunter checkout next to this folder, and the hygiene check the private term list next to it.

- [ ] G1: AC-01, the engine reproduces D1 and D2 on the fixtures: every exception with its rule, record, routed-to person, spend, unpaid flag and financing cost within 1e-9 of the exact fractions, every total and every display string
  CHECK: node tests/engine.mjs D1 D2
  EXPECT: ENGINE OK: D1 D2
  EVIDENCE: pending

- [ ] G2: AC-02, history and reconciliation reproduce D3 (closure rates, 14-day shares, inflows, the first scan's still-routed, closed-by-re-scan and new entries, the projection) and the fix-path engine reproduces D4 with its not-applicable, no-history and integer-floor cases
  CHECK: node tests/engine.mjs D3 D4
  EXPECT: ENGINE OK: D3 D4
  EVIDENCE: pending

- [ ] G3: AC-03, the VAT format rule accepts one and rejects one example for each country of the method plus Greece, and the rule's code never computes a check digit
  CHECK: node tests/vat.mjs
  EXPECT: VAT OK
  EVIDENCE: pending

- [ ] G4: AC-04, the figure audit returns the expected result and the offending tokens for F01 to F15
  CHECK: node tests/audit.mjs
  EXPECT: AUDIT OK
  EVIDENCE: pending

- [ ] G5: AC-05, the world builder writes the same bytes twice and data/world.js is its output; the shared base keeps one account per duplicate-name group; every scenario's case appears as planted and equals its frozen reference figures; the whole world's clean spend share is recorded; no VAT ID passes a published check digit; the log agrees with the data
  CHECK: node tests/world.mjs
  EXPECT: WORLD OK
  EVIDENCE: pending

- [ ] G6: AC-06, the shared shell matches Rebate Hunter's main with exactly js/handover.js and js/progress.js adapted, both listed in REVIEW.md, and vici/ byte for byte
  CHECK: node tests/parity.mjs
  EXPECT: PARITY OK
  EVIDENCE: pending

- [ ] G7: AC-06, the four shared design tests pass unchanged with this app's values: colour pairs in both themes, the page icon, vici/ against its release, and nothing round in the files or on the rendered page in both themes
  CHECK: node tests/run-all.mjs tokens page-icon vici-files hexagon
  EXPECT: SUITES PASSED: tokens page-icon vici-files hexagon
  EVIDENCE: pending

- [ ] G8: AC-07, the page's security policy is exactly the plan's, nothing is loaded from another host, no inline script or style exists, and every storage key starts with dq. except vc-theme
  CHECK: node tests/policy.mjs
  EXPECT: POLICY OK
  EVIDENCE: pending

- [ ] G9: the page boots in Chromium at 1920x1080 and 1280x720 in both themes without page errors, policy violations or outside requests; its header tiles show the engine's figures; its storage holds only dq. keys and vc-theme; Diagnostics' own checks pass
  CHECK: node tests/smoke.mjs
  EXPECT: SMOKE OK
  EVIDENCE: pending

- [ ] G10: the JSON Schemas of the fifteen data contracts accept the fixtures and the world and reject planted violations through the app's own validator; formatting, the streaming client and the cost meter pass their unit tests
  CHECK: node tests/unit.mjs
  EXPECT: UNIT OK
  EVIDENCE: pending

- [ ] G11: no file the repository publishes names a private term or carries an e-mail address, checked against the private list next to this folder
  CHECK: node tests/hygiene.mjs
  EXPECT: HYGIENE OK
  EVIDENCE: pending

- [ ] G12: every suite of tests/run-all.mjs passes in one run, none skipped
  CHECK: node tests/run-all.mjs
  EXPECT: ALL SUITES PASSED
  EVIDENCE: pending
