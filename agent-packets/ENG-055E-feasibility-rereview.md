# ENG-055E Agent Feasibility Re-Review

Review assignment id: `agent-story-review-ENG-055E-feasibility-2026-05-16`

Reviewed story: `stories/approved/ENG-055E-condition-evaluator-runtime.yaml`

## Verdict

`needs-revision`

## Findings

- Medium: `attachedDonCount` is not fully implementable as written across the
  current runtime surface. `yourTurn` and live-source/self `attachedDonCount`
  are implementable, but queued-effect snapshots do not preserve attached-DON
  state for `resolveFromLastKnownInformation` paths.
- The previous supplemental note overstated readiness by saying
  source/self `attachedDonCount` can always be evaluated from source lookup/card
  state.

## Hook Trace

- `Condition` types exist for `yourTurn` and `attachedDonCount`.
- `yourTurn` can use `GameState.turn.turnPlayerId`.
- Live-source `attachedDonCount` can use `CardInstance.attachedDon`.
- The main queue-resolution seam exists after source-presence evaluation and
  before primitive execution.
- Unsupported conditions can continue to use the existing fail-closed queue
  result path.

## Required Story Change

Revise ENG-055E to explicitly limit positive `attachedDonCount` support to
live-source/self evaluation, or add prerequisite snapshot/contract work that
captures attached-DON state for LKI evaluation.

## Second-Pass Re-Review

Review assignment id:
`agent-story-review-ENG-055E-feasibility-rereview2-2026-05-16`

Verdict: `approval-ready`

The revised story now limits positive `attachedDonCount` evaluation to
live-source/self authoritative state and requires fail-closed behavior for
sourceSnapshot/LKI and non-source/self target forms. The reviewer found this
consistent with `05-effect-dsl-reference.s024` and `05-effect-dsl-reference.s029`
because schema authorability does not imply broad runtime execution.

Implementation cautions:

- support only `target: { type: "self" }` with a currently resolvable live field
  source
- do not read attached-DON counts from source snapshots, player views, or generic
  target-resolution paths
- relax existing runtime predicates only for `yourTurn` and live-source/self
  `attachedDonCount`
