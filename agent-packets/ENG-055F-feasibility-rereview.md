# ENG-055F Agent Feasibility Re-Review

Review assignment id: `agent-story-review-ENG-055F-feasibility-2026-05-16`

Reviewed story: `stories/approved/ENG-055F-cost-and-hand-selection-runtime.yaml`

## Verdict

`needs-revision`

## Findings

- High: current allowed touch points are too narrow for the `PayCostDecision`
  acceptance criteria. Generic effect-runtime `returnDon` pay-cost continuation
  needs decision routing outside `effect-runtime*.ts`, at least `actions.ts` and
  likely the legal-action helper path.
- Medium: the story is missing `02-engine-mechanics.s036`, which defines
  DON-minus source legality: eligible DON can come from cost area or attached to
  the player's Leader/Characters, and the cost fails if fewer than N are
  eligible.

## Hook Trace

- `Cost.returnDon`, `PaymentOption.returnDon`, and
  `DecisionResponse.payment.selectedDonInstanceIds` exist.
- `PayCostDecision` exists.
- `SelectCardsDecision`, `HandSelectionId`, `EffectExecutionFrame.segmentResults`,
  `savedReferences`, and `transientSets` exist.
- Private `selectCards` and frame-resume patterns exist.
- Missing seam: generic effect-runtime `payCost` response routing is not
  currently handled by `actions.ts`.

## Required Story Change

Add `02-engine-mechanics.s036` to `spec_refs`, and expand allowed touch points
to include the pending-decision routing/legal-action files required for generic
effect-runtime `payCost` responses.

## Second-Pass Re-Review

Review assignment id:
`agent-story-review-ENG-055F-feasibility-rereview2-2026-05-16`

Verdict: `approval-ready`

The revised story now cites `02-engine-mechanics.s036` for DON-minus source
legality and authorizes the generic pending-decision `payCost` action/legal
action path through `actions.ts` and legal-action helpers. The reviewer found no
remaining approval-gate findings.

Implementation cautions:

- keep runtime `payCost` continuation on the existing `respondToDecision` path
- preserve chooser-private decision envelopes and PlayerView redaction
- follow the stale-envelope/current-state validation pattern used by existing
  runtime decision handlers
