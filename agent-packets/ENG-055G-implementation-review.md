# ENG-055G Implementation Review Evidence

Story: `ENG-055G`

Story path: `stories/approved/ENG-055G-play-selected-runtime.yaml`

Active packet: `agent-packets/ENG-055G.md`

Implementation commit: `5938ea6eb0f38029a7e3a240db41c47ad24b3665`

Base commit for implementation review: `3ac8eee688b3f0483aa73bdcff83d93ca636c8c3`

Implementation worker: `019e3230-e80d-7a01-925f-c77a301a79d9`

Code-review agent: `019e3259-9c11-7153-a047-6ea51ad82d3a`

## Implementation Summary

- Added Character-only runtime support for sequence `playSelected` from saved `handSelection:*` references.
- Played selected Character cards from hand rested and without cost payment when `enterRested: true` and `ignoreCost: true`.
- Supported zero-card up-to selections and multiple selected Characters in saved order.
- Added runtime Character overflow handling that pauses and resumes the same `playSelected` segment until all remaining selected Characters resolve.
- Preserved full selected-card audit results while saving only the remaining tail across overflow pauses.
- Kept Stage and Event `playSelected` out of scope by failing closed without play or hand-to-field movement.
- Added normal Stage/Event play regressions proving Character overflow handling does not affect non-Character destinations.
- Added runtime overflow action sequencing and public causality redaction coverage.

## Review Findings And Disposition

Initial code review requested changes:

- High: multi-card `playSelected` skipped remaining selected cards after an overflow pause because the sequence frame resumed after the `playSelected` segment instead of inside it.
- Open question: runtime overflow used `state.turn.turnPlayerId`, which could reject off-turn effect resolution.

Disposition:

- Changed runtime `playSelected` overflow resume to continue inside the same segment using the remaining saved selected-card tail.
- Preserved original selected-card audit evidence across repeated overflow pauses.
- Removed the turn-player requirement for overflow decision responses and followed the pending decision player.
- Added off-turn overflow response coverage.

Second code review requested changes:

- High: accepted runtime overflow responses did not advance `actionSeq`, and chained runtime overflow decisions used synthetic player-action causality that could leak misleading public causality.

Disposition:

- Runtime `playSelected` overflow decisions now carry effect causality from the owning sequence frame.
- Accepted runtime overflow `respondToDecision` actions now advance `actionSeq`.
- Added multi-overflow regression coverage for per-response `actionSeq` increments, internal follow-up overflow causality, public `PlayerView` redaction to `ruleProcess/privateCausality`, ordered continuation, and full selected-card audit preservation.

Final re-review result:

- No findings.
- Prior High blockers resolved.
- No shared Stage/Event play regression found.
- Scope remains contained to Character-only `playSelected`; Stage/Event `playSelected` fail closed.
- Verdict: ready to proceed after G.

## Verification Evidence

Focused and story-required verification after review fixes:

- `corepack pnpm --filter @optcg/engine-core test -- effect-runtime-play-selected.test.ts effect-runtime-cost-hand-selection.test.ts play-card-character-overflow.test.ts play-card-event.test.ts play-card-stage-replacement.test.ts` passed, 98 files / 731 tests.
- `corepack pnpm --filter @optcg/engine-core typecheck` passed.
- `corepack pnpm run stories:validate` passed, 417 story files.
- `corepack pnpm run packets:verify` passed.

Full verification:

- `corepack pnpm run verify` passed outside sandbox after review fixes:
  - format check passed
  - lint passed
  - typecheck passed
  - packets verify passed
  - specs metadata verify passed
  - root test passed, 177 files / 1372 tests
  - hidden-info passed, 4 files / 5 tests
  - contracts passed, 26 files / 194 tests

Sandbox note:

- Full `pnpm verify` has previously failed in the sandbox only at root test import with EPERM opening `node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/json-schema.js`; the same command passed outside sandbox.
