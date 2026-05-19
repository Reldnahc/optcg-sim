# CARD-020A Story Re-Review

- Assignment ID: `CARD-020A-child-review-rereview-2026-05-19`
- Story Path: `stories/approved/CARD-020A-generic-card-text-diagnostic-scanner.yaml`
- Review Type: `child-story`
- Status: `approval-ready`

## Remaining Findings

None.

## Disposition Summary

The prior CARD-020A finding about `engine_capability_preflight` substance is fixed. The revised section now does the work the CARD review gate requires: it explicitly says the story is diagnostic-scanner-only, lists the parsed effect-shape families the scanner may recognize, separates allowed read-only runtime interaction from missing/unsupported runtime-capability groups, and preserves fail-closed ENG-story gating for any future playable-support work.

No new scope drift was introduced by the revision. The child story remains diagnostic-only, keeps gameplay/generated-DSL/runtime-capability-record work out of scope, keeps fixture/hash/overlay/support-manifest edits out of scope, and stays aligned with the CARD-020 parent's rule that runtime capability evidence is read-only diagnostic input rather than support authority.

Record this child row as `approval-ready`.
