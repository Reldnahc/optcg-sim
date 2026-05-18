# ENG-058 Story Review Matrix

| story ID | parent story ID | child story ID | story paths                                                               | review assignment ID                              | review type  | review status  | review artifact or blocker reference                               | disposition summary                                                         |
| -------- | --------------- | -------------- | ------------------------------------------------------------------------- | ------------------------------------------------- | ------------ | -------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| ENG-058  | ENG-058         | n/a            | `stories/generated/ENG-058-conditional-effect-runtime-parent.yaml`        | `story-review-ENG-058-parent-2026-05-18`          | parent-story | approval-ready | `agent-packets/ENG-058-story-review-parent-rereview-2026-05-18.md` | Parent boundary, event-order authority, and wrapper scope findings fixed.   |
| ENG-058A | ENG-058         | ENG-058A       | `stories/generated/ENG-058A-public-condition-evaluator-expansion.yaml`    | `story-review-ENG-058A-child-2026-05-18`          | child-story  | approval-ready | `agent-packets/ENG-058A-story-review-child-rereview-2026-05-18.md` | TYP-011A Leader-zone representation and hidden-info command findings fixed. |
| ENG-058B | ENG-058         | ENG-058B       | `stories/generated/ENG-058B-conditional-queued-trigger-reachability.yaml` | `story-review-ENG-058B-child-rereview-2026-05-18` | child-story  | approval-ready | `agent-packets/ENG-058B-story-review-child-rereview-2026-05-18.md` | Fresh rereview after prior High finding; no remaining findings.             |

## Gate Status

Story Approval Review Gate status: `approval-ready`.

Each required row has a distinct assignment identity and a distinct durable artifact identity. The parent review does not satisfy either child row, and neither child review satisfies another row.

`corepack pnpm run stories:validate` passed after story revisions.
