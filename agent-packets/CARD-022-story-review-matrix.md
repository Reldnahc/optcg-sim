# CARD-022 Story Review Matrix

Review purpose: Story Approval Review Gate for the CARD-022 parent story set.

The parent story and every child story have a distinct story-review assignment identity and distinct durable artifact identity.

| Story     | Parent   | Child          | Story file                                                                       | Review assignment                         | Status         | Durable artifact                                | Notes                                                                                                               |
| --------- | -------- | -------------- | -------------------------------------------------------------------------------- | ----------------------------------------- | -------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| CARD-022  | CARD-022 | not-applicable | `stories/approved/CARD-022-card-layer-regression-hardening-parent.yaml`          | `story-review-CARD-022-parent-2026-05-20` | approval-ready | `agent-packets/CARD-022-story-review-parent.md` | Parent workflow, cleanup handoff, and child capability preflight blockers resolved.                                 |
| CARD-022A | CARD-022 | CARD-022A      | `stories/approved/CARD-022A-conditional-draw-generated-support-test-matrix.yaml` | `story-review-CARD-022A-child-2026-05-20` | approval-ready | `agent-packets/CARD-022A-story-review-child.md` | Test-only conditional draw matrix story cleared after preflight, ENG-058B, source-integrity, and touch-point fixes. |
| CARD-022B | CARD-022 | CARD-022B      | `stories/approved/CARD-022B-card014g-primitive-parser-replacement.yaml`          | `story-review-CARD-022B-child-2026-05-20` | approval-ready | `agent-packets/CARD-022B-story-review-child.md` | Parser replacement story cleared after exact runtime capability/provenance and touch-point fixes.                   |

No story-review blockers remain.
