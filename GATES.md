# Gates: M2 agent, board and Simulation (v0.2.0)

OWNS: index.html, css/**, js/**, data/**, tools/**, tests/**, .github/**, README.md, DESIGN.md, TECH_NOTES.md, DATA_SOURCES.md, REVIEW.md, GATES.md

Scope: the live agent with all 17 tools and its guardrails in code, the board's Rules and People views with the weekly cohorts, the review dialog, options, outbox and report, the recorder, the six scenarios as authored simulations, Live sweep and Custom what-if, proven against acceptance criteria AC-08 to AC-15 of the brief; AC-20 is Victor's live run with his own key. Commands run from the repository root with Node.js 22, Playwright with Chromium (PLAYWRIGHT_MODULE or NODE_PATH, CHROME_PATH), a Rebate Hunter checkout next to the repository and the private term list next to it. No check calls the real API: the live suites run against the scripted stand-in in tests/lib/fake-claude.mjs.

- [x] G1: AC-08 the key is requested only for Live, checked with GET /v1/models, never appears in local storage, exports, the audit log, recordings or the console; Forget key removes it; the key dialog refuses to work inside a frame
  CHECK: node tests/live.mjs key
  EXPECT: LIVE OK: key
  EVIDENCE: automatic-evidence=v1; definition-sha256=ad1b2f5817c02a2259c502250040e6ef9307a0088d558e4ef46154873e9fdabb; exit=0; EXPECT=matched; output-sha256=d90245d5992a18f5388c45d74155d663d862fda3d4e71c1c10b07589bdfb9068; output-bytes=115; shell=/bin/sh; cwd=/home/claude/proc-data-quality; path=14bdffb0e8ca/16 entries

- [x] G2: AC-09 against the stand-in, a verified alert is refused without a named dq_group group of at least half its base or without three records read; options outside the latest dq_fix_paths call, a stale decision, a draft the fix path does not allow and a report before the outbox is decided are refused with a Guardrail line; an input that breaks its tool's schema is refused
  CHECK: node tests/live.mjs guards
  EXPECT: LIVE OK: guards
  EVIDENCE: automatic-evidence=v1; definition-sha256=9d8f3224882fd385aff6c70bd695e60a069e7f69e28fa0a405f80b4f03c0816b; exit=0; EXPECT=matched; output-sha256=8bcd79c9f2ab9e6a89c6512a2b84717bb3ad71dd670db637ee8b4defe3e79f0c; output-bytes=100; shell=/bin/sh; cwd=/home/claude/proc-data-quality; path=14bdffb0e8ca/16 entries

- [x] G3: AC-10 the review dialog shows Your confirmation in merlot on the furthest step reached and the rail never moves back; a suggested group with an unknown code or words not in the short text is refused; unreviewed suggestions never count in a fix path and approved ones do
  CHECK: node tests/live.mjs review
  EXPECT: LIVE OK: review
  EVIDENCE: automatic-evidence=v1; definition-sha256=f3ab80b75820cb532607452d0e8d13435c6e4dbad25551323f59b8c0ce797bac; exit=0; EXPECT=matched; output-sha256=5b9e996b38b4eafe7b8201be40e8a3a1cdb82f97b514e70478f776e94fd7cbd6; output-bytes=100; shell=/bin/sh; cwd=/home/claude/proc-data-quality; path=14bdffb0e8ca/16 entries

- [x] G4: AC-11 a run never starts a 41st model call and starts none once €3 is spent; the cost meter equals usage times price to within 1e-9
  CHECK: node tests/live.mjs caps
  EXPECT: LIVE OK: caps
  EVIDENCE: automatic-evidence=v1; definition-sha256=bc8c422b1888eb94bccf11f84e7c4ef880785e71dbc51bbcc464378297170486; exit=0; EXPECT=matched; output-sha256=d1eae7b3260367e81fb52bec374b089a60fc315076307796644a4d4f680c77e4; output-bytes=141; shell=/bin/sh; cwd=/home/claude/proc-data-quality; path=14bdffb0e8ca/16 entries

- [x] G5: AC-12 each of the six scenarios plays offline without a key, with the SIMULATION tape and the engine's figures, along three decision paths (approve the recommendation; reject one and approve another; accept the risk), and scenario 3's review holds Your confirmation on Check
  CHECK: node tests/sims.mjs
  EXPECT: SIMS OK: 6 scenarios, 18 runs
  EVIDENCE: automatic-evidence=v1; definition-sha256=e0eb32377f879281b3a9ab7602d0d603a26963e2aa4b2f77b8d723b07591172f; exit=0; EXPECT=matched; output-sha256=a62f0c9517e2ec104196a294f99d5fbb50d4da7ed34393717f850b0d06ae52a2; output-bytes=832; shell=/bin/sh; cwd=/home/claude/proc-data-quality; path=14bdffb0e8ca/16 entries

- [x] G6: AC-13 tools/check_world.mjs passes every simulation script under the live guardrails, along every decision path a script offers
  CHECK: node tools/check_world.mjs
  EXPECT: /WORLD CHECK OK[\s\S]*SCRIPTS OK: 6 of 6/
  EVIDENCE: automatic-evidence=v1; definition-sha256=366017a3440ded636258b6fa4da8ba9fb565edb0d463b0876aab45764eaf3a9e; exit=0; EXPECT=matched; output-sha256=2ce25e60d3a62523660e315f3e0413a9100be723b1c524f021ea07f7fb99fe03; output-bytes=2294; shell=/bin/sh; cwd=/home/claude/proc-data-quality; path=14bdffb0e8ca/16 entries

- [x] G7: AC-13 control: the world suite plants guardrail violations in copies of the scripts and the script checker catches each, while the world's own checks still pass
  CHECK: node tests/world.mjs
  EXPECT: WORLD OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=6bbf52f45304fe7b7ff95f23bab95a14222b87cf6c9476b2190271b89c579818; exit=0; EXPECT=matched; output-sha256=c316c05e412216998e81911a190645b3705dd2389666409892c2a979f21a8585; output-bytes=4579; shell=/bin/sh; cwd=/home/claude/proc-data-quality; path=14bdffb0e8ca/16 entries

- [x] G8: AC-14 the board's cells, people rows and weekly cohorts equal the engine's figures after a scan; every cell opens its exceptions; the table views hold the same numbers; no tile sums spend across exceptions
  CHECK: node tests/accept.mjs board
  EXPECT: ACCEPT OK: board
  EVIDENCE: automatic-evidence=v1; definition-sha256=73238e27f0e2aeb098fff38c2f8be05625b4ffacacfde9c823d9cde93453a3a8; exit=0; EXPECT=matched; output-sha256=d53286a44cb249a43cd6ab929c52ba0d3739a4cde622a7cfacf8643077fd06c6; output-bytes=93; shell=/bin/sh; cwd=/home/claude/proc-data-quality; path=14bdffb0e8ca/16 entries

- [x] G9: AC-15 no tile, card or label reads closed for an exception a re-scan still finds; an approved fix shows approved, re-scan pending and its projection
  CHECK: node tests/accept.mjs honesty
  EXPECT: ACCEPT OK: honesty
  EVIDENCE: automatic-evidence=v1; definition-sha256=a978060ce5613da9ca4382795db4750d382cc2279bfc03fa293ce36479102ac9; exit=0; EXPECT=matched; output-sha256=fef965b4f0b7990d4e42501b16c933e78988de19134c01fca0f12bd450ac065e; output-bytes=97; shell=/bin/sh; cwd=/home/claude/proc-data-quality; path=14bdffb0e8ca/16 entries

- [x] G10: the 17 tools exist with their JSON Schemas, every input is validated, the executors return the engine's figures with stable names, and each guard refuses its fault in Node
  CHECK: node tests/tools.mjs
  EXPECT: TOOLS OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=9739c8e14daae207d1e7671bc5c5eff36945d31d31a2881be336a8f6d2438c2d; exit=0; EXPECT=matched; output-sha256=fae4d69bdb9903bceca97c447131084b247cb1f28a90479c2f358ceb65bf7e59; output-bytes=8190; shell=/bin/sh; cwd=/home/claude/proc-data-quality; path=14bdffb0e8ca/16 entries

- [x] G11: Live sweep and Custom what-if run against the stand-in, and Save run as simulation writes a script marked recorded that the script checker passes and the player replays
  CHECK: node tests/live.mjs sweep custom recorder
  EXPECT: LIVE OK: sweep custom recorder
  EVIDENCE: automatic-evidence=v1; definition-sha256=d6c10898841d8bcc411aee0742e31dd18b0dbc2e1eb30c0e3e9d3fd7d4265629; exit=0; EXPECT=matched; output-sha256=14348111f8a445fc51ca3dd0b2b061e39a2701abdad9a66c0fe3f5bb24fc6c88; output-bytes=229; shell=/bin/sh; cwd=/home/claude/proc-data-quality; path=14bdffb0e8ca/16 entries

- [x] G12: the shared shell still matches Rebate Hunter's main with exactly the two adapted files
  CHECK: node tests/parity.mjs
  EXPECT: PARITY OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=10d22380aaa3cc9a2d73ee4cf421fa8690a48bd5335b8ecbb9e59e1d414e1214; exit=0; EXPECT=matched; output-sha256=7d27c6b25b3376092205d3152bb47cb2e6dc362ca781fb7f4a37b8e160c3052b; output-bytes=122; shell=/bin/sh; cwd=/home/claude/proc-data-quality; path=14bdffb0e8ca/16 entries

- [x] G13: the security policy and storage rules hold for every new module (AC-07 kept)
  CHECK: node tests/policy.mjs
  EXPECT: POLICY OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=189d84abec29c153f165920ce49463395c954658297752a2c80ff5a1f18a1492; exit=0; EXPECT=matched; output-sha256=bd1234f936f9fa7a12350cc20c94282868f7886c6f9803aebe134059ab424e73; output-bytes=1600; shell=/bin/sh; cwd=/home/claude/proc-data-quality; path=14bdffb0e8ca/16 entries

- [x] G14: no published file names a private term or carries an e-mail address
  CHECK: node tests/hygiene.mjs
  EXPECT: HYGIENE OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=a215c327e9a4010351cbe3499b8936283175fd7fcc573c6b16ce4ff49cc209a1; exit=0; EXPECT=matched; output-sha256=5207887b0e88d7f26fedc75cf1e56a71c5d3f60bb61b042684a11447896d776e; output-bytes=127; shell=/bin/sh; cwd=/home/claude/proc-data-quality; path=14bdffb0e8ca/16 entries

- [x] G15: every suite passes, M1's included
  CHECK: node tests/run-all.mjs
  EXPECT: ALL SUITES PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=44b70cde5d3146c4d6e0f2ec1e50b1fe0c51ec72c748b6d4cc7bce3ddf8692de; exit=0; EXPECT=matched; output-sha256=611f38431bfc354ed7d4b7ef28ffddd4fded5c7afb9c25d6bf7849ec933a5edf; output-bytes=58592; shell=/bin/sh; cwd=/home/claude/proc-data-quality; path=14bdffb0e8ca/16 entries

- [ ] G16: AC-20 Victor runs one scenario live with his own key, end to end within the caps, and the audit export shows model, usage and cost
  EVIDENCE: pending

ABANDON: G16 needs Victor's own Claude API key; this environment has none and the brief says never to ask for one, so the live run is handed to Victor with the steps in the pull request
