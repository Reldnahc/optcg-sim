# ENG-055 Parent Story Review - H/K Split

Review assignment id: `story-review-ENG-055-parent-H-split-2026-05-16`

Reviewed story id/path: `ENG-055` / `stories/approved/ENG-055-generic-composed-effect-runtime-parent.yaml`

Review type: `parent-story re-review`

Status: `approval-ready`

Artifact identity: `agent-packets/ENG-055-parent-HK-split-story-review.md`

## Revision Context

ENG-055H was split after implementation review found that normal `playCard`
reachability for drawUpTo requires play-card support-gating files outside the
runtime-only H touch points.

The split keeps:

- `ENG-055H`: reusable drawUpTo runtime primitive and sequence support.
- `ENG-055K`: play-card support gating and integration tests for drawUpTo
  reachability.

## Prior Findings

- The parent boundary wording was broad enough to forbid ENG-055K's child-owned
  play-card support-gating work.
- The parent review-gate language did not explicitly require one distinct
  story-review assignment identity and one distinct durable artifact identity per
  parent/child row.
- The review-status matrix timing did not explicitly include parent PR opening.

## Revision Disposition

- Revised the parent boundary to allow play-card support gating only when an
  approved child story explicitly owns it.
- Kept parser support, generated support, real-card fixture work, and card-data
  admission broadening out of scope.
- Updated parent acceptance criteria and required tests to require distinct
  story-review assignment identity and distinct durable artifact identity per
  required row.
- Updated matrix timing to require reconstruction before parent PR opening and
  parent PR handoff.

## Final Findings

- No remaining findings.
- The parent split boundary is consistent with revised ENG-055H and new
  ENG-055K.
- The parent review-gate language matches the Story Approval Review Gate.

Disposition guidance:

- No further parent-story revision is needed for the H/K split.
