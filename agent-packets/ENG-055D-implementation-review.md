# ENG-055D Implementation Review Evidence

Story: `ENG-055D`

Story path: `stories/approved/ENG-055D-non-replacement-optionality-runtime.yaml`

Active packet: `agent-packets/ENG-055D.md`

Implementation commit: `f8b9df17a940eba23e9d9ad3f6a20448beecec99`

Base commit for implementation review: `da2b4428517bc8964c8735f1734ed96c14bcfe64`

Revision worker: `019e31ce-e34d-78f1-87e6-4d1b3cdd8d10`

Code-review agent: `019e31c9-d3db-7e73-bfb2-088ab11622c5`

## Implementation Summary

- Added non-replacement optional sequence clause runtime for supported sequence primitives.
- Added optional `payCost(restDon)` sequence runtime with accept, decline, malformed response, and stale decision handling.
- Routed sequence `chooseOptionalActivation` and `payCost` responses through the existing decision response path.
- Preserved hidden frame filtering and deterministic event/state behavior for optional branches.

## Review Findings And Disposition

Initial code review requested changes:

- Important: optional effect-clause handling was draw-only; optional `trashFromHand` still failed closed.
- Important: accepted optional `payCost(restDon)` emitted `costPaid` with private decision visibility instead of normal public cost-payment visibility.
- Important: required replay, state-hash, event-order, and hidden-info regressions for optional accept/decline branches were under-covered.

Disposition:

- Generalized optional sequence-clause pause/resume so supported optional `trashFromHand` accepts through `chooseOptionalActivation` into the existing `selectCards` pause path.
- Declining optional `trashFromHand` records `playerDeclined` and deterministically skips dependent `ifYouDo` segments.
- Emitted accepted optional `restDon` `costPaid` events with public visibility.
- Added deterministic accept/decline coverage for optional activation, optional cost, and optional effect-clause branches, plus public-view visibility coverage for optional cost payment.
- Extracted completed-sequence resolution event emission to `effect-runtime-sequence-frame-events.ts` to keep file-size lint passing without changing behavior.

Re-review result:

- No remaining Critical or Important blockers.
- Verdict: approve; ready to proceed after D.

## Verification Evidence

Focused and story-required verification after review fixes:

- `corepack pnpm exec vitest run packages/engine-core/src/effect-runtime-sequence-frames.test.ts` passed, 1 file / 13 tests.
- `corepack pnpm --filter @optcg/engine-core typecheck` passed.
- `corepack pnpm run packets:verify` passed.

Full verification:

- `corepack pnpm run verify` passed outside sandbox after the review fixes:
  - format check passed
  - lint passed
  - typecheck passed
  - packets verify passed
  - specs metadata verify passed
  - root test passed, 174 files / 1341 tests
  - hidden-info passed, 4 files / 5 tests
  - contracts passed, 26 files / 194 tests

Sandbox note:

- Full `pnpm verify` in the sandbox failed only at root test import with EPERM opening `node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/json-schema.js`; the same command passed outside sandbox.
