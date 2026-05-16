# ENG-055 Implementation Feasibility Re-Review Matrix

Review purpose: implementation-feasibility pass after ENG-055D exposed that
approval-ready story review did not trace acceptance criteria to concrete
type/runtime hooks.

Review assignment id: `implementation-feasibility-rereview-ENG-055-E-J-2026-05-16`

This is supplemental feasibility evidence. It does not replace the repository's
distinct Story Approval Review Gate artifacts unless the workflow is explicitly
updated to accept feasibility re-review artifacts as story-review evidence.

| Story    | Verdict                | Feasibility summary                                                                                                                                                                                                                                                   | Required action before implementation                                                                         |
| -------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| ENG-055E | proceed                | `Condition` contracts exist; runtime currently rejects conditions, but the story is narrow enough to add a local evaluator for `yourTurn` and source/self `attachedDonCount` in `effect-runtime*.ts`.                                                                 | None beyond normal packet refresh.                                                                            |
| ENG-055F | proceed                | `returnDon`, `PayCostDecision`, `PaymentOption.returnDon`, `SelectCardsDecision`, `HandSelectionId`, and serialized execution frames exist. Existing payCost/selectCards responders provide implementable patterns.                                                   | None beyond normal packet refresh.                                                                            |
| ENG-055G | proceed after ENG-055F | `PlaySelectedEffect`, `HandSelectionId`, play-card placement/overflow/stage replacement code, and SPEC-009B stale-selection authority exist.                                                                                                                          | Implement only after ENG-055F records saved hand-selection results.                                           |
| ENG-055H | proceed                | `drawUpTo` type/schema, chooseQuantity runtime, and SPEC-009A short-deck semantics exist. Existing draw primitive path is an implementable seam.                                                                                                                      | None beyond normal packet refresh.                                                                            |
| ENG-055I | blocked                | Saved-reference producer contracts exist, but no in-scope concrete positive consumer exists: `TargetSpec.selection` is currently used by continuous modifier/restriction records, while ENG-055I explicitly excludes modifier/restriction and playSelected consumers. | Split/rewrite story or add prerequisite contract/runtime story for a concrete non-J saved-reference consumer. |
| ENG-055J | proceed                | `ContinuousEffectRecord`, `Modifier`, `TargetSpec`, `Duration`, computed view, battle legality, and cleanup hooks exist. Runtime is broad but has concrete seams in allowed touch points.                                                                             | None beyond normal packet refresh.                                                                            |

## Recommendation

Do not continue linear implementation into ENG-055I as currently written.

Safe next implementation candidates after ENG-055D is resolved or intentionally
deferred are ENG-055E, ENG-055F, ENG-055H, and ENG-055J. ENG-055G should wait
for ENG-055F. ENG-055I needs story/spec correction before implementation.
