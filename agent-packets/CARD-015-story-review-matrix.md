# CARD-015 Story Review Matrix

Status: `approval-ready`

This matrix records the Story Approval Review Gate evidence for the CARD-015
one-child parent story set. The parent and child rows have distinct
story-review assignment identities and distinct durable artifact identities.

| story ID  | parent story ID | child story ID | story path                                                                    | review assignment ID                                                        | review status  | review artifact                                                                              | disposition summary                                                                                                                                                                                                                                                                                                                                         |
| --------- | --------------- | -------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CARD-015  | CARD-015        | not-applicable | `stories/approved/CARD-015-verbose-generated-support-diagnostics-parent.yaml` | `story-review-CARD-015-parent-diagnostic-decomposition-rereview-2026-05-17` | approval-ready | `agent-packets/CARD-015-story-review-parent-diagnostic-decomposition-rereview-2026-05-17.md` | Parent remains approval-ready after aligning the one-child diagnostics parent with diagnostic-only parser-failure decomposition while preserving no direct parent implementation and fail-closed support boundaries.                                                                                                                                        |
| CARD-015A | CARD-015        | CARD-015A      | `stories/approved/CARD-015A-support-probe-source-span-layer-diagnostics.yaml` | `story-review-CARD-015A-child-conditional-draw-wording-rereview-2026-05-17` | approval-ready | `agent-packets/CARD-015A-story-review-child-conditional-draw-wording-rereview-2026-05-17.md` | Child remains approval-ready for diagnostic-only parser-failure decomposition, with the explicit `or` caveat: only the exact `and` in the named conditional draw template may be classified as a conjunction fragment; unsupported `or`, `or more`, `or less`, and `up to` wording stays in unsupported spans/predicates outside certified exact templates. |

## Gate Result

No story-review blockers remain. The set is approval-ready for approval handoff
and later packet activation of `CARD-015A`; do not implement `CARD-015`
directly.
