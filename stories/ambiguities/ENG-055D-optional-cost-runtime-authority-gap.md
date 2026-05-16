# ENG-055D Optional Cost Runtime Authority Gap

## Status

Blocked during ENG-055D implementation.

## Story

- Parent: `stories/approved/ENG-055-generic-composed-effect-runtime-parent.yaml`
- Child: `stories/approved/ENG-055D-non-replacement-optionality-runtime.yaml`

## Ambiguity

ENG-055D requires non-replacement optional activation, optional cost, and
optional effect-clause runtime semantics in composed effects.

The cited specs establish the required outcomes:

- `04-effect-runtime.s011` distinguishes optional activation, optional cost,
  and optional effect clauses.
- `04-effect-runtime.s011` requires optional cost decline or failure to record
  `paidCost: false`.
- `04-effect-runtime.s012` requires composed execution to record segment
  results containing `paidCost` and `playerDeclined`.
- `05-effect-dsl-reference.s013` requires those segment results to drive
  connector behavior and replay determinism.

The current authorable contract/runtime shape does not identify the runtime hook
for an optional cost clause inside a composed sequence segment:

- `SequencedEffect` has `optional?: boolean` for optional effect clauses, but no
  segment-level `cost` field.
- `EffectBlock.cost` represents block activation cost, not an explicit composed
  sequence segment.
- `Cost` variants can carry `optional?: boolean`, but existing
  `PayCostDecision`/`DecisionResponse` shapes do not define a decline response
  for optional cost payment.
- Existing engine runtime support rejects effect-block costs for the supported
  composed sequence frame path.

Implementing ENG-055D by treating `EffectBlock.cost.optional` as a composed
optional-cost segment, by reusing `chooseOptionalActivation` for optional-cost
decline, or by extending `PayCostDecision` response shapes would each decide
contract and gameplay behavior not specified by the cited story packet.

## Safe Outcome

Do not merge ENG-055D as complete until optional-cost runtime authority is
resolved.

The partial implementation attempt can cover optional sequence effect-clause
accept/decline and `ifYouDo` connector behavior, but it does not satisfy the
approved story's optional-cost acceptance criteria.

## Follow-Up Needed

Create or revise a reviewed TYP/ENG story that defines:

- how optional cost clauses are represented inside composed sequence execution
- whether optional cost decline uses `PayCostDecision`,
  `chooseOptionalActivation`, or a new response shape
- how `paidCost: true/false` segment results are recorded for accept, decline,
  and failure branches
- when once-per-turn usage is consumed relative to optional cost accept, decline,
  and failure
- replay/event-order/state-hash requirements for both optional cost branches

After that authority exists, reattempt ENG-055D or split ENG-055D so optional
effect-clause runtime and optional-cost runtime can be reviewed independently.
