# CARD-020D Child Story Review

Review assignment id: `story-review-CARD-020D-child-2026-05-19`

Reviewed story: `stories/generated/CARD-020D-generated-support-proof-certificate-reporting.yaml`

Parent alignment checked: `stories/generated/CARD-020-generic-support-probe-diagnostics-parent.yaml`

Review type: `child-story`

Parent story: `CARD-020`

Status: `approval-ready`

Artifact identity: `agent-packets/CARD-020D-story-review-child.md`

## Disposition

`CARD-020D` is approval-ready.

The child is correctly scoped as diagnostic/reporting-only generated-support
proof/certificate output. It requires support-probe and generated-support-report
output to expose the full support chain in order: source and behavior hash
status, parse completeness, generated DSL schema validation, component evidence
IDs, required runtime capability IDs, missing runtime capability IDs,
engine-proof/test-evidence status where currently representable, and final
playable decision. The final decision is derived from the full chain rather
than parse success, scanner recognition, component evidence, or schema validity
alone.

The story explicitly prevents new playable support, new engine behavior, new
runtime capability records, marking new runtime capabilities supported,
fixture/hash/overlay/support-manifest changes, per-card bespoke proof logic,
per-card bespoke tests, and exact card or exact full-text proof branches.

## Findings By Severity

- Critical: none
- High: none
- Medium: none
- Low: none

## Intent Checks

- Parse success is distinct from schema validity.
- Schema-valid generated DSL is distinct from runtime capability coverage.
- Runtime capability coverage is distinct from engine-proof/test-evidence.
- Engine-proof/test-evidence is distinct from final playable support.
- Missing capability and missing proof layers remain explicit blockers.
- Existing supported cards report supported only when every current gate is
  green.
- Existing unsupported cards remain unsupported.
- The proof/certificate is generic metadata-driven, not exact-card or exact-text
  driven.

## Matrix Instruction

Record the `CARD-020D` child row as `approval-ready` using this artifact. This
artifact satisfies only the `CARD-020D` child row and does not satisfy the
`CARD-020` parent row or any sibling child row.
