# CARD-014 Story Review Matrix

Review purpose: Story Approval Review Gate for the generated CARD-014 parent
story set.

Status: `approval-ready`

The parent story and every child story have a distinct story-review assignment
identity and a distinct durable artifact identity. The set is approval-ready
after TYP-009 lifecycle cleanup and targeted `CARD-014A`/`CARD-014G` re-review.

| Story     | Parent   | Child          | Story file                                                                                        | Review assignment                                                                | Status         | Durable artifact                                | Notes                                                                                                |
| --------- | -------- | -------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| CARD-014  | CARD-014 | not-applicable | `stories/approved/CARD-014-generated-composed-effect-support-parent.yaml`                         | `story-review-CARD-014-parent-2026-05-17`                                        | approval-ready | `agent-packets/CARD-014-story-review-parent.md` | Parent coordinator is review-ready.                                                                  |
| CARD-014A | CARD-014 | CARD-014A      | `stories/approved/CARD-014A-composed-runtime-capability-matrix-expansion.yaml`                    | `story-review-CARD-014A-post-typ009-cleanup-rereview-2026-05-17`                 | approval-ready | `agent-packets/CARD-014A-story-review-child.md` | TYP-009 lifecycle cleanup resolved prior blocker; capability-ID and ENG-055K mapping findings fixed. |
| CARD-014B | CARD-014 | CARD-014B      | `stories/approved/CARD-014B-generic-composed-parser-builder-scaffold.yaml`                        | `story-review-CARD-014B-parser-scaffold-rereview-2026-05-17`                     | approval-ready | `agent-packets/CARD-014B-story-review-child.md` | Parser scaffold story passed after tests/gating revisions.                                           |
| CARD-014C | CARD-014 | CARD-014C      | `stories/approved/CARD-014C-draw-trash-composed-sequence-parser-expansion.yaml`                   | `story-review-CARD-014C-draw-trash-sequence-rereview-2026-05-17`                 | approval-ready | `agent-packets/CARD-014C-story-review-child.md` | Sequence refs and CARD-009C evidence fixed.                                                          |
| CARD-014D | CARD-014 | CARD-014D      | `stories/approved/CARD-014D-drawupto-parser-generated-support-expansion.yaml`                     | `story-review-CARD-014D-drawupto-final-rereview-2026-05-17`                      | approval-ready | `agent-packets/CARD-014D-story-review-child.md` | drawUpTo sourcePresence/capability evidence fixed.                                                   |
| CARD-014E | CARD-014 | CARD-014E      | `stories/approved/CARD-014E-returndon-hand-selection-playselected-parser-expansion.yaml`          | `story-review-CARD-014E-playselected-2026-05-17`                                 | approval-ready | `agent-packets/CARD-014E-story-review-child.md` | No blocking findings.                                                                                |
| CARD-014F | CARD-014 | CARD-014F      | `stories/approved/CARD-014F-condition-optionality-parser-expansion.yaml`                          | `story-review-CARD-014F-post-typ009-cleanup-rereview-2026-05-17`                 | approval-ready | `agent-packets/CARD-014F-story-review-child.md` | Optionality/condition envelope, capability IDs, and post-cleanup wording fixed.                      |
| CARD-014G | CARD-014 | CARD-014G      | `stories/approved/CARD-014G-selecttargets-saved-field-modifier-restriction-parser-expansion.yaml` | `story-review-CARD-014G-post-typ009-cleanup-rereview-2026-05-17`                 | approval-ready | `agent-packets/CARD-014G-story-review-child.md` | TYP-009/TYP-009B lifecycle cleanup resolved prior blocker; scope/test findings fixed.                |
| CARD-014H | CARD-014 | CARD-014H      | `stories/approved/CARD-014H-representative-support-proof-bundle.yaml`                             | `story-review-CARD-014H-proof-bundle-second-final-rereview-2026-05-17`           | approval-ready | `agent-packets/CARD-014H-story-review-child.md` | Proof matrix/source-integrity and diagnostic ownership fixed.                                        |
| CARD-014I | CARD-014 | CARD-014I      | `stories/approved/CARD-014I-support-probe-report-integration-composed-effects.yaml`               | `story-review-CARD-014I-report-diagnostics-post-optionality-rereview-2026-05-17` | approval-ready | `agent-packets/CARD-014I-story-review-child.md` | Diagnostics taxonomy and existing blocker-code preservation fixed.                                   |

## Blocker List

No story-review blockers remain.

## Gate Disposition

CARD-014 may proceed to approval review handoff. Approval-ready does not mean
worker-ready; activate one child packet at a time and run `packets:verify`
before implementation handoff.
