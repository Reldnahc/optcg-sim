# ENG-055F Implementation Review Evidence

Story: `ENG-055F`

Story path: `stories/approved/ENG-055F-cost-and-hand-selection-runtime.yaml`

Active packet: `agent-packets/ENG-055F.md`

Implementation commit: `45d7786555b4a907d00ad6de4b8e581242a1551d`

Base commit for implementation review: `9165d4776796aced88f17ee5d74440d1f3465af1`

Implementation worker: `019e3208-4b0c-7b31-afdd-363036220649`

Code-review agent: `019e3223-6f31-7363-8e50-d48395e112b3`

## Implementation Summary

- Added runtime support for sequence `returnDon` / DON-minus cost payment.
- Exposed generic runtime `payCost` legal responses for sequence-frame cost decisions.
- Included eligible DON from the paying player's cost area and attached to that player's Leader or Characters.
- Detached selected attached DON from host cards and returned selected DON to the DON deck deterministically.
- Added the TYP-007D private filtered hand-selection subset for `selectCards` from hand only.
- Recorded hand-selection segment results for later ENG-055G consumption without implementing `playSelected`.
- Split sequence-frame helpers into cohesive `effect-runtime*.ts` modules to keep file-size enforcement intact.

## Review Findings And Disposition

Initial code review requested changes:

- Block: hand-selection decision IDs used only the queue-entry id, so repeated hand-selection prompts in the same queue entry could collide and violate single-use decision semantics.
- Block: required test coverage was incomplete for unsupported `selectCards` fail-closed shapes, stale hand-selection responses, and story-specific replay/state-hash behavior.

Disposition:

- Made hand-selection decision IDs unique and deterministic per sequence segment by including the segment index.
- Added multi-segment hand-selection coverage proving unique decision IDs and stale-old-id rejection.
- Added fail-closed coverage for unsupported zones, ambiguous chooser/player combinations, unsupported visibility, and unsupported non-hand candidate/filter shape.
- Added stale hand-selection response coverage.
- Added deterministic replay/state-hash regression coverage for accepted and stale `returnDon` and hand-selection branches.

Re-review result:

- No remaining findings.
- Prior blockers resolved.
- No scope drift found; no `playSelected`, `drawUpTo`, parser, or card-support creep.
- Verdict: approve; ready to proceed after F.

## Verification Evidence

Focused and story-required verification after review fixes:

- `corepack pnpm --filter @optcg/engine-core test -- src/effect-runtime-sequence-frames.test.ts src/effect-runtime-cost-hand-selection.test.ts src/actions-pending-decision.test.ts` passed, 97 files / 721 tests.
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
  - root test passed, 176 files / 1362 tests
  - hidden-info passed, 4 files / 5 tests
  - contracts passed, 26 files / 194 tests

Sandbox note:

- Full `pnpm verify` in the sandbox failed only at root test import with EPERM opening `node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/json-schema.js`; the same command passed outside sandbox.
