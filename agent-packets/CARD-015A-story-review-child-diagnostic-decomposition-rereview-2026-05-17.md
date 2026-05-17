# CARD-015A Story Review - Child Revision

Review assignment id: `story-review-CARD-015A-child-diagnostic-decomposition-rereview-2026-05-17`

Reviewed story: `stories/approved/CARD-015A-support-probe-source-span-layer-diagnostics.yaml`

Parent alignment checked: `stories/approved/CARD-015-verbose-generated-support-diagnostics-parent.yaml`

Review type: `child-story`

Parent story: `CARD-015`

Status: `approval-ready`

Artifact identity: `agent-packets/CARD-015A-story-review-child-diagnostic-decomposition-rereview-2026-05-17.md`

## Disposition

`CARD-015A` is approval-ready. The revised story now explicitly requires
diagnostic-only decomposition for parser failures where recognizable
supported-action candidates appear inside unsupported wrappers or conditions.
It requires recognized candidate pieces and unsupported blocker pieces to be
reported separately, including the concrete conditional draw example, while
explicitly preserving unsupported status.

The story remains fail-closed: decomposition must not create parser
certification, generated DSL, runtime capability evidence, support metadata, or
playable support, and the full effect template must remain unsupported when the
whole condition/action template is not certified.

The parent `CARD-015` remains aligned as a planning-only parent for a one-child
diagnostics set and continues to prohibit direct parent implementation or
parser/runtime/playable support expansion.

## Findings

- High: none
- Medium: none
- Low: regenerate the active `CARD-015A` packet before implementation because
  the checked-in packet may be stale relative to this revised story text.

## Matrix Instruction

Record the `CARD-015A` child row as `approval-ready` using this artifact. This
artifact satisfies only the `CARD-015A` child row and does not satisfy the
`CARD-015` parent row. Update the matrix disposition to mention diagnostic-only
parser-failure decomposition into recognized candidate pieces and unsupported
blockers.
