# ENG-055G Implementation Feasibility Re-Review

Review assignment id: `implementation-feasibility-rereview-ENG-055G-2026-05-16`

Reviewed story: `stories/approved/ENG-055G-playselected-play-from-hand-runtime.yaml`

## Verdict

Proceed after ENG-055F.

## Hook Trace

- `PlaySelectedEffect` and `PlayHandSelectedEffect` exist.
- `HandSelectionId` exists and ties playSelected to the hand-selection subset.
- SPEC-009B gives direct authority for stale, non-hand, no-longer-legal, and
  unsupported saved-selection fail-closed behavior.
- Existing `play-card*.ts` code owns hand-to-field/trash movement, stage
  replacement, character overflow decisions, cost payment decisions, and
  resulting event patterns.
- Existing character overflow and stage replacement tests provide reusable
  behavioral baselines.

## Feasibility Notes

ENG-055G depends on ENG-055F producing saved hand-selection results in a
serialized execution frame. Once that exists, playSelected can consume only that
authorized saved hand selection. The story should not start before ENG-055F is
merged/reviewed because otherwise the implementation has to invent or duplicate
the hand-selection producer.

## Required Follow-Up

No spec/story rewrite needed. Preserve the dependency on ENG-055F.
