# SUP-002 Story Review Matrix

Review purpose: Story Approval Review Gate for the generated SUP-002 parent
story set.

Status: `approval-ready`

The parent story and every child story have a distinct story-review assignment
identity and a distinct durable artifact identity. The set is approval-ready
after targeted revisions and re-review.

| Story    | Parent  | Child          | Story file                                                                               | Review assignment                                                    | Status         | Durable artifact                               | Notes                                                                                                                                                       |
| -------- | ------- | -------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SUP-002  | SUP-002 | not-applicable | `stories/generated/SUP-002-scalable-optional-trash-basepower-search-support-parent.yaml` | `story-review-SUP-002-parent-post-fix-2026-05-21`                    | approval-ready | `agent-packets/SUP-002-story-review-parent.md` | Parent decomposition covers scalable search expansion and dependency binding.                                                                               |
| SUP-002A | SUP-002 | SUP-002A       | `stories/generated/SUP-002A-optional-hand-trash-cost-contract-authorability.yaml`        | `story-review-SUP-002A-final-rereview-2026-05-21`                    | approval-ready | `agent-packets/SUP-002A-story-review-child.md` | Optional hand-trash cost authorability is narrowly scoped.                                                                                                  |
| SUP-002H | SUP-002 | SUP-002H       | `stories/generated/SUP-002H-base-power-setter-contract-authorability.yaml`               | `story-review-SUP-002H-final-rereview-2026-05-21`                    | approval-ready | `agent-packets/SUP-002H-story-review-child.md` | Base-power setter contract authorability stays scoped to permanent envelope.                                                                                |
| SUP-002I | SUP-002 | SUP-002I       | `stories/generated/SUP-002I-top-n-search-request-contract-authorability.yaml`            | `story-review-SUP-002I-post-fix-2026-05-21`                          | approval-ready | `agent-packets/SUP-002I-story-review-child.md` | Contract authorizes only public-reveal nonempty-filter search and chooser-only empty-filter any-card search.                                                |
| SUP-002B | SUP-002 | SUP-002B       | `stories/generated/SUP-002B-optional-hand-trash-cost-filtered-ko-runtime.yaml`           | `story-review-SUP-002B-dependency-binding-2026-05-21`                | approval-ready | `agent-packets/SUP-002B-story-review-child.md` | Direct ENG-055F dependency binding is approval-ready.                                                                                                       |
| SUP-002C | SUP-002 | SUP-002C       | `stories/generated/SUP-002C-conditional-base-power-set-runtime.yaml`                     | `story-review-SUP-002C-rereview-2026-05-21`                          | approval-ready | `agent-packets/SUP-002C-story-review-child.md` | Runtime base-power setter now cites correct trash-count and compute-view authority.                                                                         |
| SUP-002D | SUP-002 | SUP-002D       | `stories/generated/SUP-002D-top-n-filtered-search-remainder-runtime.yaml`                | `story-review-SUP-002D-post-fix-2026-05-21`                          | approval-ready | `agent-packets/SUP-002D-story-review-child.md` | Runtime search scope includes public-reveal filtered search, chooser-only empty-filter any-card search, hidden-info, short-deck, and deck-reindexing proof. |
| SUP-002E | SUP-002 | SUP-002E       | `stories/generated/SUP-002E-optional-trash-cost-ko-card-components.yaml`                 | `story-review-SUP-002E-final-rereview-2026-05-21d`                   | approval-ready | `agent-packets/SUP-002E-story-review-child.md` | CARD preflight now cites exact optional-cost/K.O. capability IDs.                                                                                           |
| SUP-002F | SUP-002 | SUP-002F       | `stories/generated/SUP-002F-conditional-base-power-set-card-components.yaml`             | `story-review-SUP-002F-final-rereview-2026-05-21b`                   | approval-ready | `agent-packets/SUP-002F-story-review-child.md` | CARD preflight now cites exact base-power runtime capability IDs.                                                                                           |
| SUP-002G | SUP-002 | SUP-002G       | `stories/generated/SUP-002G-top-n-filtered-search-card-components.yaml`                  | `story-review-SUP-002G-search-card-composition-expansion-2026-05-21` | approval-ready | `agent-packets/SUP-002G-story-review-child.md` | CARD scope supports full DON-minus/search/trailing-trash composition only through reusable primitives.                                                      |

## Blocker List

No story-review blockers remain.

## Gate Disposition

SUP-002 may proceed to human approval handoff. Approval-ready does not mean
worker-ready; activate one child packet at a time and run `packets:verify`
before implementation handoff.
