# CARD-014F Story Review - Child

Review assignment id: `story-review-CARD-014F-post-typ009-cleanup-rereview-2026-05-17`

Reviewed story: `stories/approved/CARD-014F-condition-optionality-parser-expansion.yaml`

Status: `approval-ready`

Artifact identity: `agent-packets/CARD-014F-story-review-child.md`

## Result

`CARD-014F` is approval-ready.

## Findings

Initial and follow-up findings were fixed by revision:

- Optional effect DSL now uses effect-block optionality; `optional` is not put
  on the draw effect object.
- Condition templates now use full auto/onPlay effect-block envelopes with
  block-level `condition`, absent `conditionTiming`, and exact source text.
- Capability gating now includes optionality/condition IDs plus base
  `trigger:onPlay`, `category:auto`,
  `effect:draw:self:count:positive-safe-integer`, and
  `sourcePresencePolicy:mustRemainInSameZone`.
- Fail-closed wording for `may` now excludes the one admitted exact template.
- Post-cleanup wording now states optional costs are out of CARD-014F scope
  instead of referring to stale TYP-009A lifecycle state.

## Residual Risk

Implementation depends on prerequisite capability evidence from CARD-014A,
ENG-055D, and ENG-055E. The story keeps parser rules blocked unless that
evidence exists.

## Disposition

Record `CARD-014F` as `approval-ready` in the Story Approval Review Gate matrix.
