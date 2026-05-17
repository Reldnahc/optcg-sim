# CARD-014I Story Review - Child

Review assignment id: `story-review-CARD-014I-report-diagnostics-post-optionality-rereview-2026-05-17`

Reviewed story: `stories/approved/CARD-014I-support-probe-report-integration-composed-effects.yaml`

Status: `approval-ready`

Artifact identity: `agent-packets/CARD-014I-story-review-child.md`

## Result

`CARD-014I` is approval-ready.

## Findings

Initial and follow-up findings were fixed by revision:

- Added runtime/DSL refs for the diagnostic taxonomy.
- Preserved existing blocker identities for `unparsed-span`,
  `ambiguous-wording`, `custom-handler-required`, `unsupported-primitive`,
  `stale-hash`, `invalid-dsl-schema`, and `missing-runtime-capability`.
- Added unsupported optionality as an explicit diagnostic category.
- Added fail-closed test coverage for unknown or untrusted layer
  classification.

## Residual Risk

Implementation must add diagnostic layering without renaming or collapsing
existing blocker codes.

## Disposition

Record `CARD-014I` as `approval-ready` in the Story Approval Review Gate matrix.
