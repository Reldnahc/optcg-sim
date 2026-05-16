# ENG-055H Implementation Feasibility Re-Review

Review assignment id: `implementation-feasibility-rereview-ENG-055H-2026-05-16`

Reviewed story: `stories/approved/ENG-055H-drawupto-runtime.yaml`

## Verdict

Proceed.

## Hook Trace

- `Effect.drawUpTo` exists in package and contract types.
- `chooseQuantity` pending decision creation and response handling already
  exist from ENG-055A.
- `createChooseQuantityDecisionForQueuedEffect` provides an effect-originated
  decision seam.
- Existing draw primitive code provides the actual draw/move/event path.
- SPEC-009A explicitly authorizes short-deck do-as-much-as-possible behavior,
  event append order, `state.seq` expectations, and state-hash coverage.

## Feasibility Notes

This story is directly implementable. The main review point should be preserving
existing mandatory draw behavior while adding drawUpTo-specific quantity
selection and short-deck behavior.

## Required Follow-Up

No spec/story rewrite needed before implementation.
