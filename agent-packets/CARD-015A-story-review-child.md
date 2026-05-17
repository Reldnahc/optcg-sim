# CARD-015A Story Review - Child

Review assignment id: `story-review-CARD-015A-child-rereview-2026-05-17`

Reviewed story:
`stories/approved/CARD-015A-support-probe-source-span-layer-diagnostics.yaml`

Review type: `child-story`

Parent story: `CARD-015`

Status: `approval-ready`

Artifact identity: `agent-packets/CARD-015A-story-review-child.md`

## Disposition

`CARD-015A` is approval-ready. The story now limits ownership to the
incremental post-`CARD-014I` diagnostics delta, specifies ordered
deepest-successful-layer behavior for runtime-capability, schema, parser, and
stale-hash outcomes, preserves existing blocker identities and stale-hash
highest priority, keeps touch points package-local, and requires regression
coverage for the prior broad missing-layer taxonomy rather than re-owning it.

## Prior Finding Resolved

- Medium: deepest-successful-layer semantics were not precise enough. Resolved
  by defining the ordered progression `source-integrity` -> `metadata` ->
  `parser` -> `schema` -> `runtime-capability` -> `support-status`, reporting
  `schema` for runtime-capability failures after valid schema, reporting
  `parser` for schema failures after parser success, and omitting
  deepest-successful-layer for parser failures and stale-hash failures.

## Matrix Instruction

Record the child row as `approval-ready` in the Story Approval Review Gate
matrix. This artifact satisfies only the `CARD-015A` child row and does not
satisfy the `CARD-015` parent row.
