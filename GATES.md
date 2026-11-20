# Gates: M1 shell, world and engine (v0.1.0)

Scope: the shared shell with its two adapted modules, the fictional world with its builder and checker, the rule engine with reconciliation, clean spend, financing cost, history and fix paths, the figure audit, the data contracts with their validator, a first page and CI, each proven against the acceptance criteria AC-01 to AC-07 of the build plan. Every check runs from the repository root with Node 22. The browser checks need Playwright (see tests/README.md), the parity check a Rebate Hunter checkout next to this folder, and the hygiene check the private term list next to it.

- [x] G1: AC-01, the engine reproduces D1 and D2 on the fixtures: every exception with its rule, record, routed-to person, spend, unpaid flag and financing cost within 1e-9 of the exact fractions, every total and every display string
  CHECK: node tests/engine.mjs D1 D2
  EXPECT: ENGINE OK: D1 D2
  EVIDENCE: automatic-evidence=v1; definition-sha256=8c6c5fb1909f6e85c1059472da5a62a7370a176259e1c961a5bcd65a4352fe9d; exit=0; EXPECT=matched; output-sha256=1b1498ccb69c1246efee7d4eda3df06a0881f115a4b45f09eb107104d06c1cac; output-bytes=73; shell=/bin/sh; cwd=/home/claude/proc-data-quality; path=14bdffb0e8ca/16 entries

- [x] G2: AC-02, history and reconciliation reproduce D3 (closure rates, 14-day shares, inflows, the first scan's still-routed, closed-by-re-scan and new entries, the projection) and the fix-path engine reproduces D4 with its not-applicable, no-history and integer-floor cases
  CHECK: node tests/engine.mjs D3 D4
  EXPECT: ENGINE OK: D3 D4
  EVIDENCE: automatic-evidence=v1; definition-sha256=c8762e547febfab02ae5ac0ff9767b830921b79319b2103799dd4eb6c5e06063; exit=0; EXPECT=matched; output-sha256=ae14340c3fc1bf00c4a5c9baea28d48407166df0a3d34ae77d61593a34ce3e59; output-bytes=71; shell=/bin/sh; cwd=/home/claude/proc-data-quality; path=14bdffb0e8ca/16 entries

- [x] G3: AC-03, the VAT format rule accepts one and rejects one example for each country of the method plus Greece, and the rule's code never computes a check digit
  CHECK: node tests/vat.mjs
  EXPECT: VAT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=76a9c0a5c4a1660bcfdf66d3710a4a9b490f669c323556bc96817f32a7a7c681; exit=0; EXPECT=matched; output-sha256=b7409f0bb693d9d5a166b40f2fe8573a8765cce3c5d67619d536630a2b9b39af; output-bytes=1264; shell=/bin/sh; cwd=/home/claude/proc-data-quality; path=14bdffb0e8ca/16 entries

- [x] G4: AC-04, the figure audit returns the expected result and the offending tokens for F01 to F15
  CHECK: node tests/audit.mjs
  EXPECT: AUDIT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=46931aeef80f1d79649d01ee142bc5c432fe49c960d9d7d154e6c1823d585221; exit=0; EXPECT=matched; output-sha256=682b4ec7419676d7ed028063be281936b982cd695a3cf8676ce42b34d1130cf0; output-bytes=1312; shell=/bin/sh; cwd=/home/claude/proc-data-quality; path=14bdffb0e8ca/16 entries

- [x] G5: AC-05, the world builder writes the same bytes twice and data/world.js is its output; the shared base keeps one account per duplicate-name group; every scenario's case appears as planted and equals its frozen reference figures; the whole world's clean spend share is recorded; no VAT ID passes a published check digit; the log agrees with the data
  CHECK: node tests/world.mjs
  EXPECT: WORLD OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=6bbf52f45304fe7b7ff95f23bab95a14222b87cf6c9476b2190271b89c579818; exit=0; EXPECT=matched; output-sha256=04af1cf84ee3670db8bcbf0a9eba6324dedf638e27b7d9191059229c7a176356; output-bytes=3230; shell=/bin/sh; cwd=/home/claude/proc-data-quality; path=14bdffb0e8ca/16 entries

- [x] G6: AC-06, the shared shell matches Rebate Hunter's main with exactly js/handover.js and js/progress.js adapted, both listed in REVIEW.md, and vici/ byte for byte
  CHECK: node tests/parity.mjs
  EXPECT: PARITY OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=10d22380aaa3cc9a2d73ee4cf421fa8690a48bd5335b8ecbb9e59e1d414e1214; exit=0; EXPECT=matched; output-sha256=7d27c6b25b3376092205d3152bb47cb2e6dc362ca781fb7f4a37b8e160c3052b; output-bytes=122; shell=/bin/sh; cwd=/home/claude/proc-data-quality; path=14bdffb0e8ca/16 entries

- [x] G7: AC-06, the four shared design tests pass unchanged with this app's values: colour pairs in both themes, the page icon, vici/ against its release, and nothing round in the files or on the rendered page in both themes
  CHECK: node tests/run-all.mjs tokens page-icon vici-files hexagon
  EXPECT: SUITES PASSED: tokens page-icon vici-files hexagon
  EVIDENCE: automatic-evidence=v1; definition-sha256=58af3bd2a6d2bbdceab962f9240e9d80b2e5cc304f195eb92233eef418917a5d; exit=0; EXPECT=matched; output-sha256=ab523f3538ef00479aa07880ace420351b14ef5f04c4b761c109b26bc755b796; output-bytes=25963; shell=/bin/sh; cwd=/home/claude/proc-data-quality; path=14bdffb0e8ca/16 entries

- [x] G8: AC-07, the page's security policy is exactly the plan's, nothing is loaded from another host, no inline script or style exists, and every storage key starts with dq. except vc-theme
  CHECK: node tests/policy.mjs
  EXPECT: POLICY OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=189d84abec29c153f165920ce49463395c954658297752a2c80ff5a1f18a1492; exit=0; EXPECT=matched; output-sha256=1a04e250d0331c6778435f8371d7ed8e1152b4cd4d50c7275dbe5bf00e61ff4f; output-bytes=1600; shell=/bin/sh; cwd=/home/claude/proc-data-quality; path=14bdffb0e8ca/16 entries

- [x] G9: the page boots in Chromium at 1920x1080 and 1280x720 in both themes without page errors, policy violations or outside requests; its header tiles show the engine's figures; its storage holds only dq. keys and vc-theme; Diagnostics' own checks pass
  CHECK: node tests/smoke.mjs
  EXPECT: SMOKE OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=ea5d94eb2ceb5e5e3d47535be064361a756521cc393772c01aa9afa6686a13c7; exit=0; EXPECT=matched; output-sha256=4d8cd66e2e5a57098d034a9e80bb524fae688af33ad5c2c14ab0f7ac1ac0b867; output-bytes=6880; shell=/bin/sh; cwd=/home/claude/proc-data-quality; path=14bdffb0e8ca/16 entries

- [x] G10: the JSON Schemas of the fifteen data contracts accept the fixtures and the world and reject planted violations through the app's own validator; formatting, the streaming client and the cost meter pass their unit tests
  CHECK: node tests/unit.mjs
  EXPECT: UNIT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=fa1a0ce969cef95437f83b99d758e0590cb1ddeca95c73e0c8eb61df4c273654; exit=0; EXPECT=matched; output-sha256=b656cd46a470f77de9ff4d0fbb218fd578620403edd534249e280691a88773e5; output-bytes=518; shell=/bin/sh; cwd=/home/claude/proc-data-quality; path=14bdffb0e8ca/16 entries

- [x] G11: no file the repository publishes names a private term or carries an e-mail address, checked against the private list next to this folder
  CHECK: node tests/hygiene.mjs
  EXPECT: HYGIENE OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=a215c327e9a4010351cbe3499b8936283175fd7fcc573c6b16ce4ff49cc209a1; exit=0; EXPECT=matched; output-sha256=4a68eba12230a0ee12a43cc886517ab76e88fea09a71b9a0945b846a8b456295; output-bytes=126; shell=/bin/sh; cwd=/home/claude/proc-data-quality; path=14bdffb0e8ca/16 entries

- [x] G12: every suite of tests/run-all.mjs passes in one run, none skipped
  CHECK: node tests/run-all.mjs
  EXPECT: ALL SUITES PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=44b70cde5d3146c4d6e0f2ec1e50b1fe0c51ec72c748b6d4cc7bce3ddf8692de; exit=0; EXPECT=matched; output-sha256=92186d73d653769fddc39e18ec85567e975fc2ae88870e0e47b45e2a1d1d93b5; output-bytes=42937; shell=/bin/sh; cwd=/home/claude/proc-data-quality; path=14bdffb0e8ca/16 entries
