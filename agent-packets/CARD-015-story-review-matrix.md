# CARD-015 Story Review Matrix

Status: `approval-ready`

This matrix records the Story Approval Review Gate evidence for the CARD-015
one-child parent story set. The parent and child rows have distinct
story-review assignment identities and distinct durable artifact identities.

| story ID  | parent story ID | child story ID | story path                                                                    | review assignment ID                               | review status  | review artifact                                 | disposition summary                                                                                                                                                        |
| --------- | --------------- | -------------- | ----------------------------------------------------------------------------- | -------------------------------------------------- | -------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CARD-015  | CARD-015        | not-applicable | `stories/approved/CARD-015-verbose-generated-support-diagnostics-parent.yaml` | `story-review-CARD-015-parent-rereview-2026-05-17` | approval-ready | `agent-packets/CARD-015-story-review-parent.md` | Parent coordinator is approval-ready after narrowing the child delta and encoding one-child parent integration branch verification flow.                                   |
| CARD-015A | CARD-015        | CARD-015A      | `stories/approved/CARD-015A-support-probe-source-span-layer-diagnostics.yaml` | `story-review-CARD-015A-child-rereview-2026-05-17` | approval-ready | `agent-packets/CARD-015A-story-review-child.md` | Child is approval-ready for incremental post-CARD-014I diagnostics: deepest-successful-layer presentation, narrow spans, and stale-hash priority regression coverage only. |

## Gate Result

No story-review blockers remain. The set is approval-ready for approval handoff
and later packet activation of `CARD-015A`; do not implement `CARD-015`
directly.
