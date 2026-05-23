# CARD-025G Story Review - Legacy Test Expectation Scope Amendment

Review assignment id: `story-review-CARD-025G-legacy-test-expectation-scope-2026-05-23`

Review type: `child-story`

Status: `approval-ready`

Artifact identity: `agent-packets/CARD-025G-legacy-test-expectation-scope-review.md`

Reviewed paths:

- `stories/approved/CARD-025G-generated-support-evaluator-proof-compatibility.yaml`
- `stories/generated/CARD-025G-generated-support-evaluator-proof-compatibility.yaml`
- `stories/approved/CARD-025-card-layer-spec010-migration-parent.yaml`
- `agent-packets/CARD-025G.md`
- `agent-packets/active.json`
- `agent-packets/CARD-025G-evidence-id-scope-review.md`
- `agent-packets/CARD-025G-parser-deshape-scope-review.md`
- `agent-packets/CARD-025G-test-touchpoint-scope-review.md`
- `packages/cards/src/card014f-support.test.ts`
- `docs/workflow/story-execution.md`
- `docs/workflow/card-fixture-capture.md`

## Findings

None requiring story revision.

Handoff precondition: `corepack pnpm run packets:verify` currently fails because the active CARD-025G packet manifest is stale after amendment. Regenerate/activate the packet and rerun packet verification before implementation handoff. `corepack pnpm run stories:validate` passed and reported `Validated 579 committed story file(s).`

## Disposition Summary

`CARD-025G` remains approval-ready after the legacy generated-support test-expectation touchpoint amendment.

The added `packages/cards/src/card014f-support.test.ts` touchpoint is an adjacent cards-layer generated-support unit test. Its current assertions cover generated-support parser-rule IDs, runtime capability evidence IDs, synthetic card IDs, and fail-closed missing-evidence/residue behavior. Updating those expectations when cards-layer parser-rule or capability evidence identifiers are renamed coheres with the already-approved evidence-id rename scope and CARD-025G de-shape goals.

The amendment remains limited to cards-layer tests/evidence. It does not authorize real-card fixture updates, representative fixture manifests, source hashes, behavior hashes, overlays, support manifests, cards-produced manifests, external card-list behavior, engine runtime behavior, shared schema changes, new primitive families, unrelated parser grammar, or real-card promotion.

This artifact satisfies only the `CARD-025G` child-story review row for the latest legacy test-expectation scope amendment.
