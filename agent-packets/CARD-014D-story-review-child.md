# CARD-014D Story Review - Child

Review assignment id: `story-review-CARD-014D-drawupto-final-rereview-2026-05-17`

Reviewed story: `stories/approved/CARD-014D-drawupto-parser-generated-support-expansion.yaml`

Status: `approval-ready`

Artifact identity: `agent-packets/CARD-014D-story-review-child.md`

## Result

`CARD-014D` is approval-ready.

## Findings

Initial review findings were fixed by revision:

- Added exact drawUpTo template, parser rule, DSL shape, and synthetic-only
  proof boundary.
- Added `sourcePresencePolicy: "mustRemainInSameZone"` and capability ID
  `sourcePresencePolicy:mustRemainInSameZone`.

## Residual Risk

Implementation must verify that CARD-014A truthfully exposes drawUpTo,
chooseQuantity-backed, and source-presence capability evidence before enabling
support.

## Disposition

Record `CARD-014D` as `approval-ready` in the Story Approval Review Gate matrix.
