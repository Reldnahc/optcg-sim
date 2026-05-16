# ENG-055 Agent Feasibility Re-Review Matrix

Review purpose: implementation-feasibility pass after ENG-055D exposed that
approval-ready story review did not trace acceptance criteria to concrete
type/runtime hooks.

This matrix records distinct agent story-review runs for ENG-055E through
ENG-055J. The earlier local feasibility notes are supplemental only; the agent
verdicts below are the durable re-review evidence. E, F, I, and J received
fresh second-pass reviews after story/spec corrections.

| Story    | Current assignment id                                          | Current verdict | Feasibility summary                                                                                                                                          | Required action before implementation                                                                                               |
| -------- | -------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| ENG-055E | `agent-story-review-ENG-055E-feasibility-rereview2-2026-05-16` | approval-ready  | Story is now narrowed to `yourTurn` and live-source/self `attachedDonCount`; sourceSnapshot/LKI and non-source/self cases fail closed.                       | None beyond implementation cautions in the story artifact.                                                                          |
| ENG-055F | `agent-story-review-ENG-055F-feasibility-rereview2-2026-05-16` | approval-ready  | Story now cites DON-minus authority and authorizes generic effect-runtime `payCost` routing/legal-action touch points.                                       | None beyond implementation cautions in the story artifact.                                                                          |
| ENG-055G | `agent-story-review-ENG-055G-feasibility-2026-05-16`           | approval-ready  | Feasible after ENG-055F. Current play-card code is reusable for legality/consequences, but not drop-in for `ignoreCost` plus `enterRested`.                  | Implement only after ENG-055F; use a runtime-only or parameterized placement path.                                                  |
| ENG-055H | `agent-story-review-ENG-055H-feasibility-2026-05-16`           | approval-ready  | Feasible. Needs continuation-aware `drawUpTo` resume semantics, not a blind post-decision call to the current draw executor.                                 | None beyond implementation caution.                                                                                                 |
| ENG-055I | `agent-story-review-ENG-055I-feasibility-rereview2-2026-05-16` | blocked         | No in-scope positive non-`playSelected` saved-reference consumer exists, and current sequence frames do not produce saved `selectedTargets`.                 | Split/rewrite before implementation; add concrete saved field-object consumer/producer authority or remove the positive story body. |
| ENG-055J | `agent-story-review-ENG-055J-feasibility-rereview2-2026-05-16` | approval-ready  | Story now narrows positive restriction targets to `self`/`all`, fail-closes `choose`, and reconciles `05-effect-dsl-reference.s029` schema coverage wording. | None beyond implementation cautions in the story artifact.                                                                          |

## Recommendation

Do not implement ENG-055I as currently approved.

Safe implementation candidates after revisions and second-pass review:

- ENG-055E is approval-ready.
- ENG-055F is approval-ready.
- ENG-055G is approval-ready after ENG-055F is implemented.
- ENG-055H is approval-ready.
- ENG-055J is approval-ready after the narrowed story/spec update.

Concrete blockers:

- ENG-055D remains blocked on the optional-cost runtime authority ambiguity
  recorded in `stories/ambiguities/ENG-055D-optional-cost-runtime-authority-gap.md`.
- ENG-055I is blocked on missing concrete saved-reference consumer/producer
  authority for non-`playSelected` field-object references.
