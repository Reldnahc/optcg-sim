# CARD-017 Story Review Matrix

Status: `approval-ready`

This matrix records the Story Approval Review Gate evidence for the CARD-017
parent story set. The parent and every child row have distinct story-review
assignment identities and distinct durable artifact identities.

| story ID  | parent story ID | child story ID | story path                                                                   | review assignment ID                                                          | review status  | review artifact                                 | disposition summary                                                                                                                  |
| --------- | --------------- | -------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| CARD-017  | CARD-017        | not-applicable | `stories/approved/CARD-017-component-generated-support-identity-parent.yaml` | `story-review-CARD-017-parent-trigger-out-of-scope-final-rereview-2026-05-17` | approval-ready | `agent-packets/CARD-017-story-review-parent.md` | Parent is approval-ready as a non-implementable coordinator after removing Trigger proof from this set.                              |
| CARD-017A | CARD-017        | CARD-017A      | `stories/approved/CARD-017A-generated-support-component-evidence-model.yaml` | `story-review-CARD-017A-child-component-evidence-rereview-2026-05-17`         | approval-ready | `agent-packets/CARD-017A-story-review-child.md` | Child is approval-ready after CARD preflight substance and touch point scope were fixed.                                             |
| CARD-017B | CARD-017        | CARD-017B      | `stories/approved/CARD-017B-capability-evaluator-component-migration.yaml`   | `story-review-CARD-017B-capability-evaluator-rereview-2026-05-17`             | approval-ready | `agent-packets/CARD-017B-story-review-child.md` | Child is approval-ready after adding sequence connector spec authority and keeping evaluator migration cards-local and parity-gated. |
| CARD-017C | CARD-017        | CARD-017C      | `stories/approved/CARD-017C-parser-diagnostics-and-test-id-migration.yaml`   | `story-review-CARD-017C-inherited-blocker-taxonomy-rereview-2026-05-17`       | approval-ready | `agent-packets/CARD-017C-story-review-child.md` | Child is approval-ready after preserving all inherited blocker identities and unsupported/layer taxonomy in acceptance and tests.    |

## Gate Result

No story-review blockers remain. The set is approval-ready for approval handoff
and later packet activation of `CARD-017A`; do not implement `CARD-017`
directly. Keep one active child packet at a time.
