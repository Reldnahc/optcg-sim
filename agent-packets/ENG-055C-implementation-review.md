# ENG-055C Implementation Review Evidence

Story: `ENG-055C`

Story path: `stories/approved/ENG-055C-draw-then-trash-migration-cavendish-baseline.yaml`

Active packet: `agent-packets/ENG-055C.md`

Implementation worker: `019e2ef8-756a-75d3-91f3-59b14b2fe239`

Implementation commit: `30742df77896964631a13c154a2bc2dcdc9c8ffe`

Base commit for implementation review: `8d4dbe1781574d1a263c8b38a8688de5c852ef8d`

Code-review agent: `019e2efd-cc0e-75b1-b1e5-6746b16cf1f7`

## Implementation Summary

- Migrated the existing draw-then-trash sequence path to delegate through `createSupportedSequenceFrameDecision`.
- Added frame-boundary regression coverage proving the trash-from-hand pause stores an ENG-055B execution frame and resumes without duplicating the pre-decision draw.
- Added zero-count draw regression so legal no-op draw followed by `then` still reaches the trash decision through a stored frame.
- Preserved Cavendish/draw-then-trash behavior while keeping parser/card support and new draw/trash semantics out of scope.

## Review Findings And Disposition

Initial code review requested changes:

- Medium: `then` behavior changed for legal no-op draws because the generic frame runner treated `then` like `ifPreviousSucceeded`.

Disposition:

- Added focused regression for `drawTrashSequence(0, 1)`.
- Updated sequence-frame connector handling so `then` attempts after a previous segment was attempted and succeeded, while `ifPreviousSucceeded` keeps stricter meaningful-success behavior.

Re-review result:

- No findings.
- Verdict: approve.

## Verification Evidence

Focused and story-required verification:

- `corepack pnpm --filter @optcg/engine-core test -- effect-runtime-draw-trash-sequence.test.ts` passed, 95 files / 689 tests before the review fix.
- `corepack pnpm --filter @optcg/engine-core test -- battle-declare-attack-sequence-trigger.test.ts real-card-dsl-runtime.test.ts` passed, 95 files / 689 tests.
- `corepack pnpm --filter @optcg/engine-core test -- effect-runtime-draw-trash-sequence.test.ts effect-runtime-sequence-frames.test.ts` passed after the review fix, 95 files / 690 tests.
- `corepack pnpm --filter @optcg/engine-core typecheck` passed.
- `corepack pnpm run stories:validate` passed, 414 story files.
- `corepack pnpm run packets:verify` passed.
- `corepack pnpm exec vitest run tests/hidden-info` passed outside sandbox, 4 files / 5 tests. Sandbox run failed only with EPERM opening `node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/json-schema.js`.

Full verification:

- `corepack pnpm run verify` passed outside sandbox after the amended implementation commit:
  - format check passed
  - lint passed
  - typecheck passed
  - packets verify passed
  - specs metadata verify passed
  - root test passed, 174 files / 1320 tests
  - hidden-info passed, 4 files / 5 tests
  - contracts passed, 26 files / 190 tests

Sandbox note:

- Full `pnpm verify` in the sandbox failed only at root test import with EPERM opening `node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/json-schema.js`; the same command passed outside sandbox.
