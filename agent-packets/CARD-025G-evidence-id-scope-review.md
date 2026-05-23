# CARD-025G Story Review - Evidence Identifier Scope Amendment

Review assignment id: `story-review-CARD-025G-evidence-id-scope-2026-05-23`

Review type: `child-story`

Status: `approval-ready`

Artifact identity: `agent-packets/CARD-025G-evidence-id-scope-review.md`

Reviewed paths:

- `stories/approved/CARD-025G-generated-support-evaluator-proof-compatibility.yaml`
- `stories/generated/CARD-025G-generated-support-evaluator-proof-compatibility.yaml`
- `stories/approved/CARD-025-card-layer-spec010-migration-parent.yaml`
- `agent-packets/CARD-025G.md`
- `agent-packets/active.json`
- `agent-packets/CARD-025G-debt-closeout-scope-review.md`
- `agent-packets/CARD-025G-parser-deshape-scope-review.md`
- `agent-packets/CARD-025G-test-touchpoint-scope-review.md`
- `specs/04-effect-runtime.md`
- `specs/09-card-data-and-support-policy.md`
- `specs/11-testing-quality.md`

## Findings

None blocking.

Handoff precondition: `corepack pnpm run packets:verify` currently fails because the active CARD-025G packet manifest is stale after the story amendment. This does not require story revision, but implementation worker handoff must not proceed until the packet is regenerated/activated and `packets:verify` passes.

## Disposition Summary

`CARD-025G` remains approval-ready after the evidence identifier scope amendment.

The added touchpoints are cards-layer files for generated-support parser certification/catalog/types/runtime capability metadata and adjacent tests. They are appropriate for evidence metadata rename coverage and do not broaden the story into engine runtime, shared schema, fixtures, manifests, overlays, source hashes, behavior hashes, or real-card promotion.

The new scope is coherent with SPEC-010/CARD-025 primitive-boundary authority. It only allows renaming stale cards-layer evidence identifiers when the runtime capability and parser certification are already generic/count-parameterized for the same existing primitive. It does not authorize new runtime behavior, new primitive families, new parser certification families, unrelated parser grammar, or unrelated generated-support coverage.

The amendment supports the existing CARD-025G de-shape goal: remove sample-count-shaped authority and route support through reusable primitive evidence. Required tests still cover synthetic variation, fail-closed missing evidence, regression preservation for current supported families, and anti-shape protection against exact full-line/card-ID/external-list/parser-rule-only/full-definition-size authorization.

`corepack pnpm run stories:validate` passed.
