# Gates: M3 hardening and release (v1.0.0)

OWNS: index.html, favicon.svg, css/**, js/**, data/**, tools/**, tests/**, .github/**, README.md, DESIGN.md, DEMO_SCRIPT.md, TECH_NOTES.md, DATA_SOURCES.md, REVIEW.md, PLAN.md, GATES.md

Scope: version 1.0.0 against acceptance criteria AC-16 to AC-19 and AC-21 to AC-23 of the brief: the three exports, the layout from 1920 × 1080 to 1280 × 720, the design and accessibility checks, the Method dialog with its parameters, the documents with DEMO_SCRIPT, the independent review, the live-site check for GitHub Pages. AC-21 (the demo) and AC-20 (the live run, from M2) are Victor's. Commands run from the repository root with Node.js 22, Playwright with Chromium (PLAYWRIGHT_MODULE or NODE_PATH, CHROME_PATH) and a Rebate Hunter checkout next to the repository. No check calls the real API.

- [x] G1: AC-16 the report, the exceptions and the audit log export with file names starting data-quality- and naming the run; the report carries the SIMULATION banner in a replay; the CSV rows equal the board's rule tables, which hold the engine's exceptions; the audit JSON validates with js/validate.js against the RunEvent and AuditEvent schemas
  CHECK: node tests/accept.mjs exports
  EXPECT: ACCEPT OK: exports
  EVIDENCE: automatic-evidence=v1; definition-sha256=08062c7bc95f57323497d3de24faa7c9f20506c72eb03cbb4063c6691a59a157; exit=0; EXPECT=matched; output-sha256=4e147f84a622c2d22503b63be669d7adbdf5d5fc6ef5a5c31cc81b205974d314; output-bytes=111; shell=/bin/sh; cwd=/home/claude/proc-data-quality; path=14bdffb0e8ca/16 entries

- [x] G2: AC-17 from 1920x1080 to 1280x720 in both themes, through a run: no horizontal overflow, the header and control bar keep their rows, no board or tile text cut or clipped by its hexagon, no ellipsis, every interactive target at least 40 px, no text under 11 px (a cell's under 9.5 px)
  CHECK: node tests/layout.mjs
  EXPECT: LAYOUT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=7a354ba61627a689248731aa09fbbfe208bb383792754c53b5c67d97c263d235; exit=0; EXPECT=matched; output-sha256=b1f59a0903efd221f4b2f3d158dfade463b266319882e452d52e04bd70e2d0e1; output-bytes=1276; shell=/bin/sh; cwd=/home/claude/proc-data-quality; path=14bdffb0e8ca/16 entries

- [x] G3: AC-18 the four shared design tests pass: contrast for every pair in both themes, nothing round, the page icon, vici/ as released
  CHECK: node tests/run-all.mjs tokens hexagon page-icon vici-files
  EXPECT: SUITES PASSED: tokens page-icon vici-files hexagon
  EVIDENCE: automatic-evidence=v1; definition-sha256=71cd50b515f8d403becceff808f6819ea8496c45b76dfb9bf2794e62aecc643c; exit=0; EXPECT=matched; output-sha256=b281640fd69d0908c77709de39be5b0d2b08b5b4c43e1946e242bf04eb8e7a38; output-bytes=31487; shell=/bin/sh; cwd=/home/claude/proc-data-quality; path=14bdffb0e8ca/16 entries

- [x] G4: the colour grammar holds in the running app in both themes: cell states, the reading rim, the human steps and decisions in merlot (never the success green), the AI labels, the intro window's steps; captures for review under projector washout and colour-vision deficiency
  CHECK: node tests/design.mjs
  EXPECT: DESIGN OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=f84206f63c86359b48306cdb488a48211344fc3582ee336f91442d8f147c682c; exit=0; EXPECT=matched; output-sha256=3aa7ad551a00c8ab4a00a4761580c06e8ebd617be23c1a38731408ff55a55594; output-bytes=321; shell=/bin/sh; cwd=/home/claude/proc-data-quality; path=14bdffb0e8ca/16 entries

- [x] G5: AC-19 a Simulation run completes by keyboard alone with a visible focus on every step, the decision and the first draft two Tabs from the top through the turn's skip link; reduced motion stops every pulse; cells, rows and buttons have accessible names
  CHECK: node tests/accept.mjs keyboard motion names
  EXPECT: ACCEPT OK: keyboard motion names
  EVIDENCE: automatic-evidence=v1; definition-sha256=067a040c75e91c6f1cff09c64a81968df6f6d9294e0fb1169fbbdbc2ff9e48ab; exit=0; EXPECT=matched; output-sha256=33637829a11ebc59377ed9012c12412b7cf635d3a6037ae67db3afb35e6f453c; output-bytes=151; shell=/bin/sh; cwd=/home/claude/proc-data-quality; path=14bdffb0e8ca/16 entries

- [x] G6: the Method dialog opens from the control bar with the fifteen rules, why accuracy is left out, the definitions with their assumptions, the parameters and the production path; a parameter change applies to the next Live run and is logged in its audit export, while Simulation keeps the defaults
  CHECK: node tests/accept.mjs method
  EXPECT: ACCEPT OK: method
  EVIDENCE: automatic-evidence=v1; definition-sha256=c172814f855065fe185547b50ad5873c28d31b185e7599671cc97806b3eb2fa7; exit=0; EXPECT=matched; output-sha256=6ab8e671d7aba276117e312a96d8cf114353229b529f442f5a86687f57c38d9a; output-bytes=109; shell=/bin/sh; cwd=/home/claude/proc-data-quality; path=14bdffb0e8ca/16 entries

- [x] G7: AC-23 README, DESIGN, DEMO_SCRIPT (the five questions answered), DATA_SOURCES, TECH_NOTES, REVIEW and tests/README are complete and consistent with the code: required sections, cited sections and named paths exist, the live site is linked
  CHECK: node tests/docs.mjs
  EXPECT: DOCS OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=da61df6a3d67e16fa71295ffae1ac3b8863afa03071572dbbbe9f55afd91b9b1; exit=0; EXPECT=matched; output-sha256=3254e9403821331e89a100814ba24f67eba0c62a6629b35e4b9d9ce20d87ce9c; output-bytes=81; shell=/bin/sh; cwd=/home/claude/proc-data-quality; path=14bdffb0e8ca/16 entries

- [x] G8: AC-22 bookkeeping: REVIEW.md records the independent review's findings with severity and resolution, and no high or medium finding is open
  CHECK: node tests/docs.mjs review
  EXPECT: DOCS OK: review
  EVIDENCE: automatic-evidence=v1; definition-sha256=e5020cf7d52a9f60bd60f12e4b3342e1fc04103562ea415108f4486bc3455388; exit=0; EXPECT=matched; output-sha256=c8623e34b2f2db425b38bbf60ba0470bdf73c78149b6bb10aa99c332b0b992ac; output-bytes=73; shell=/bin/sh; cwd=/home/claude/proc-data-quality; path=14bdffb0e8ca/16 entries

- [x] G9: the live-site check passes against this checkout served locally: the files served equal the checkout and scenario 1 completes in Simulation with no outside request
  CHECK: node tests/live_site.mjs --serve
  EXPECT: LIVE SITE OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=8b2527055cb465b8335ef41c050a4a8f192c94420fd056c83aec527f4d4ed5bf; exit=0; EXPECT=matched; output-sha256=dcae5450fca47a0698c78f62700a8b33bc8e9522c40a33c346e5fba884f226b7; output-bytes=182; shell=/bin/sh; cwd=/home/claude/proc-data-quality; path=14bdffb0e8ca/16 entries

- [x] G10: no published file names a private term or carries an e-mail address (generic checks; the private list stays local)
  CHECK: node tests/hygiene.mjs
  EXPECT: /HYGIENE (GENERIC )?OK/
  EVIDENCE: automatic-evidence=v1; definition-sha256=37d7eede5053bb58f3fe76f2b6233691f5bb12f8800fb376f94562ba2fad3be0; exit=0; EXPECT=matched; output-sha256=747e5d9c39f973021cb39102e3f5b5210d153e72770a3494d1cf1fb829d78e5e; output-bytes=127; shell=/bin/sh; cwd=/home/claude/proc-data-quality; path=14bdffb0e8ca/16 entries

- [x] G11: the shared shell still matches Rebate Hunter's main with exactly the two adapted files
  CHECK: node tests/parity.mjs
  EXPECT: PARITY OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=10d22380aaa3cc9a2d73ee4cf421fa8690a48bd5335b8ecbb9e59e1d414e1214; exit=0; EXPECT=matched; output-sha256=7d27c6b25b3376092205d3152bb47cb2e6dc362ca781fb7f4a37b8e160c3052b; output-bytes=122; shell=/bin/sh; cwd=/home/claude/proc-data-quality; path=14bdffb0e8ca/16 entries

- [x] G12: the security policy and storage rules hold, the new parameter key included
  CHECK: node tests/policy.mjs
  EXPECT: POLICY OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=189d84abec29c153f165920ce49463395c954658297752a2c80ff5a1f18a1492; exit=0; EXPECT=matched; output-sha256=f204eef9e133348ac67f44df6510e68e67266ccab18b4dbcf3c8e8f6ab161a5e; output-bytes=1611; shell=/bin/sh; cwd=/home/claude/proc-data-quality; path=14bdffb0e8ca/16 entries

- [x] G13: every suite passes, M1's and M2's included
  CHECK: node tests/run-all.mjs
  EXPECT: ALL SUITES PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=44b70cde5d3146c4d6e0f2ec1e50b1fe0c51ec72c748b6d4cc7bce3ddf8692de; exit=0; EXPECT=matched; output-sha256=87bd53b4356baee9a037a23fac83a6fe06e1e875e853f33ad78459f7e0037d04; output-bytes=64084; shell=/bin/sh; cwd=/home/claude/proc-data-quality; path=14bdffb0e8ca/16 entries

- [ ] G14: AC-21 Victor gives the five-minute demo at x1 without help

ABANDON: G14 the demo is Victor's to give; DEMO_SCRIPT.md is the script he gives it from
