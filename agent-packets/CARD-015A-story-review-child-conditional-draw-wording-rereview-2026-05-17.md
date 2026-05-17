# CARD-015A Story Review - Conditional Draw Wording Refinement

Review assignment id: `story-review-CARD-015A-child-conditional-draw-wording-rereview-2026-05-17`

Reviewed story: `stories/approved/CARD-015A-support-probe-source-span-layer-diagnostics.yaml`

Parent alignment checked: `stories/approved/CARD-015-verbose-generated-support-diagnostics-parent.yaml`

Review type: `child-story`

Parent story: `CARD-015`

Status: `approval-ready`

Artifact identity: `agent-packets/CARD-015A-story-review-child-conditional-draw-wording-rereview-2026-05-17.md`

## Disposition

`CARD-015A` remains approval-ready after the conditional draw diagnostic wording
refinement. The story now clarifies that `[On Play]` is a recognized trigger
candidate, the `if` wrapper is recognized conditional syntax, `draw 2 cards` is
a recognized supported-action candidate, the multicolored-leader and hand-count
predicates are unsupported condition blockers, and `and` is an unsupported
condition-conjunction syntax fragment.

`CARD-015A` also remains approval-ready after the `or` caveat refinement. The
story now limits conjunction classification to the exact `and` fragment in the
named conditional draw template and explicitly forbids generalizing `or`, `or
more`, `or less`, or `up to` into invented connector/comparator classifications
outside certified exact templates. Those unsupported forms must remain in
unsupported spans or condition predicates. This is a narrowing, fail-closed
clarification and does not authorize parser certification, comparator support,
runtime behavior, generated DSL, support metadata, fixture changes, or playable
support.

This remains diagnostic-only. The full effect template stays unsupported
because the whole condition/action template is not certified, and the story
still prohibits new parser certification, generated DSL support, runtime
capability evidence, support metadata, fixture support, or playable support.

The `CARD-015` parent remains aligned as a planning-only one-child diagnostics
parent: it requires parser-failure decomposition into recognized candidate
pieces and unsupported blockers while preserving fail-closed generated-support
behavior.

## Findings

- High: none
- Medium: none
- Low: regenerate the active `CARD-015A` packet before implementation because
  the checked-in packet is stale relative to this refined story text.

## Matrix Instruction

Record the `CARD-015A` child row as `approval-ready` using this artifact. This
artifact satisfies only the `CARD-015A` child row and does not satisfy the
`CARD-015` parent row. Update the matrix child disposition to mention the
refined conditional draw fragments: recognized `[On Play]`, recognized `if`
wrapper, recognized `draw 2 cards`, unsupported condition predicates,
unsupported `and` conjunction fragment, and the `or` caveat that unsupported
`or`, `or more`, `or less`, and `up to` wording stays in unsupported
spans/predicates outside certified exact templates.
