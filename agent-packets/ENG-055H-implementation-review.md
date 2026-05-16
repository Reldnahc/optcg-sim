# ENG-055H Implementation Review

Story: `ENG-055H` / `stories/approved/ENG-055H-drawupto-runtime.yaml`

Reviewed patch scope:

- reusable queued `drawUpTo` runtime support
- composed sequence `drawUpTo` pause/resume support
- action-layer sequence `chooseQuantity` runtime-context validation
- H authority update and packet refresh for the narrow `actions.ts` touch point

Implementation workers:

- `Darwin` (`019e32af-c4af-7203-88b8-15dbb8ea9168`): implemented and fixed the
  sequence `state.seq` double-increment regression.
- `Lagrange` (`019e32ba-a396-7c82-8c32-e6b1a70d0828`): explored the
  action-layer validation fix.
- `Lovelace` (`019e32bd-6f60-7cd1-a1fc-f986dce5df49`): restored scope
  compliance and identified the need for the `actions.ts` story update.
- `Epicurus` (`019e32d6-a6c7-7613-8ced-95dd00098d52`): implemented the narrow
  action-layer runtime-context validation after story approval.
- `Zeno` (`019e32da-5163-73a3-b9de-9de6cac21e6f`): moved non-routing
  drawUpTo tests out of the oversized action-layer test file.
- `Huygens` (`019e32e5-dc5e-7450-b706-8a529d93b788`): hardened ledger and
  short-deck event-order tests.

Story-review evidence:

- `agent-packets/ENG-055H-story-review-child.md`
- `agent-packets/ENG-055H-actions-validation-story-review.md`
- `agent-packets/ENG-055-story-review-matrix.md`

Code-review evidence:

- Reviewer `Wegener` (`019e32b4-9c87-74f1-a769-99146572cf92`) initially failed
  the patch on stale sequence `chooseQuantity` context/redaction and H/K scope
  drift into trigger queueing.
- Reviewer `Arendt` (`019e32de-b612-7852-b2a5-c872ebefa15e`) reviewed the
  updated authority and implementation. Initial verdict: `FAIL` for missing
  ledger assertion and short-deck event-order assertion. Re-review verdict:
  `PASS_WITH_NOTES`.

Final code-review disposition:

- No remaining correctness findings.
- Prior stale-context/redaction finding is addressed by the updated H authority
  and narrow `actions.ts` validation.
- Prior trigger-queueing scope drift is removed; `drawUpTo` play-card
  reachability remains out of H and belongs to `ENG-055K`.
- Sequence ledger coverage now inspects a still-live frame after resumed
  `drawUpTo` and before a later segment continues.
- Short-deck coverage now asserts resolved-decision event order before actual
  drawn-card events.

Verification evidence:

- `corepack pnpm --filter @optcg/engine-core test -- src/actions-pending-decision.test.ts src/effect-runtime-draw.test.ts src/effect-runtime-sequence-frames.test.ts`
  - Pass: 98 files, 738 tests.
- `corepack pnpm --filter @optcg/engine-core typecheck`
  - Pass.
- `corepack pnpm run stories:validate`
  - Pass: 418 story files.
- `corepack pnpm run packets:verify`
  - Pass: 1 active story packet.
- `corepack pnpm run verify`
  - Sandbox run reached root tests and failed with the known EPERM reading
    `node_modules/.pnpm/zod@4.4.3/.../json-schema.js`.
  - Outside-sandbox run passed: format, lint, typecheck, packet verify, specs
    metadata, root tests 177 files / 1379 tests, hidden-info 4 files / 5 tests,
    contracts 26 files / 194 tests.

Ready for parent-orchestrator handoff:

- Yes. ENG-055H implementation and review evidence are ready to be committed on
  `story/eng-055`.
