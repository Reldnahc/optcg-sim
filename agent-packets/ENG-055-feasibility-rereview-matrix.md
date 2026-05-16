# ENG-055 Agent Feasibility Re-Review Matrix

Review purpose: implementation-feasibility pass after ENG-055D exposed that
approval-ready story review did not trace acceptance criteria to concrete
type/runtime hooks.

This matrix records six distinct agent story-review runs for ENG-055E through
ENG-055J. The earlier local feasibility notes are supplemental only; the agent
verdicts below are the durable re-review evidence.

| Story    | Assignment id                                        | Agent verdict  | Feasibility summary                                                                                                                                                         | Required action before implementation                                                                                             |
| -------- | ---------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| ENG-055E | `agent-story-review-ENG-055E-feasibility-2026-05-16` | needs-revision | `yourTurn` and live-source `attachedDonCount` are implementable, but LKI source snapshots do not preserve attached-DON state.                                               | Revise story to limit positive `attachedDonCount` support to live-source/self evaluation, or add prerequisite snapshot authority. |
| ENG-055F | `agent-story-review-ENG-055F-feasibility-2026-05-16` | needs-revision | Contracts exist, but generic effect-runtime `payCost` continuation needs routing outside current touch points; DON-minus source legality needs `02-engine-mechanics.s036`.  | Add `actions.ts`/legal-action routing touch points and `02-engine-mechanics.s036`.                                                |
| ENG-055G | `agent-story-review-ENG-055G-feasibility-2026-05-16` | approval-ready | Feasible after ENG-055F. Current play-card code is reusable for legality/consequences, but not drop-in for `ignoreCost` plus `enterRested`.                                 | Implement only after ENG-055F; use a runtime-only or parameterized placement path.                                                |
| ENG-055H | `agent-story-review-ENG-055H-feasibility-2026-05-16` | approval-ready | Feasible. Needs continuation-aware `drawUpTo` resume semantics, not a blind post-decision call to the current draw executor.                                                | None beyond implementation caution.                                                                                               |
| ENG-055I | `agent-story-review-ENG-055I-feasibility-2026-05-16` | blocked        | Saved-reference producer contracts exist, but there is no in-scope positive consumer; current sequence frame also does not produce `selectedTargets`.                       | Rewrite/split: make negative-only, move positive consumer to ENG-055J, or add prerequisite consumer authority.                    |
| ENG-055J | `agent-story-review-ENG-055J-feasibility-2026-05-16` | needs-revision | Self/all modifier and restriction seams exist, but positive `choose` target scope lacks a durable selected-target carrier; spec coverage wording is stale against TYP-007E. | Drop/narrow `choose`, or add prerequisite target-choice/selection-carrier authority; reconcile spec coverage wording.             |

## Recommendation

Do not continue the ENG-055 sequence as currently approved.

Safe implementation candidates after revisions:

- ENG-055H can proceed as written.
- ENG-055G can proceed only after ENG-055F is corrected and implemented.

Stories needing correction first:

- ENG-055E: narrow or add LKI snapshot authority.
- ENG-055F: expand touch points and add DON-minus authority.
- ENG-055I: blocked on missing in-scope positive saved-reference consumer.
- ENG-055J: narrow positive target scope or add durable chosen-target authority.
