# CARD-020A Story Review - Child Post-CARD-020D

Review assignment id: `story-review-CARD-020A-child-post-020D-2026-05-19`

Reviewed story: `stories/generated/CARD-020A-generic-card-text-diagnostic-scanner.yaml`

Parent alignment checked: `stories/generated/CARD-020-generic-support-probe-diagnostics-parent.yaml`

Related new child checked: `stories/generated/CARD-020D-generated-support-proof-certificate-reporting.yaml`

Review type: `child-story`

Parent story: `CARD-020`

Status: `approval-ready`

Artifact identity: `agent-packets/CARD-020A-story-review-child.md`

## Disposition

`CARD-020A` remains approval-ready after adding `CARD-020D`.

The child is still bounded to cards-side diagnostic scanner infrastructure. It
requires arbitrary-card component scanning with stable IDs, source spans,
residue, normalized-equivalent behavior, and variation tests. It still excludes
generated DSL construction, playable support, runtime capability records,
engine behavior, shared schema work, fixture/hash changes, exact card ID
branches, exact full-effect branches, and fake support evidence.

`CARD-020D` does not weaken this generic scanner requirement. It consumes
generic generated-support metadata and capability evidence for proof/certificate
reporting, while CARD-020A scanner recognition remains diagnostic discovery
only and not support authority.

## Findings

- Critical: none
- High: none
- Medium: none
- Low: none

## Intent Checks

- Generic arbitrary-card diagnostic scanning is preserved.
- Wrapper recognition remains independent from condition recognition.
- Condition fragments/connectors remain independent from action/body support.
- Body/action recognition remains independent from condition support.
- Exact examples, sample-shaped templates, sample-specific regexes, and
  complete sample-effect branches still fail review.

## Matrix Instruction

Record the `CARD-020A` child row as `approval-ready` using this artifact. This
artifact satisfies only the `CARD-020A` child row and does not satisfy the
`CARD-020` parent row or any sibling child row.
