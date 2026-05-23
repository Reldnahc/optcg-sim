# CARD-025G Story Review - Parser Test Touchpoint Scope Amendment

Review assignment id: `story-review-CARD-025G-test-touchpoint-scope-2026-05-23`

Review type: `child-story`

Status: `approval-ready`

Artifact identity: `agent-packets/CARD-025G-test-touchpoint-scope-review.md`

Reviewed story: `stories/approved/CARD-025G-generated-support-evaluator-proof-compatibility.yaml`

Generated mirror: `stories/generated/CARD-025G-generated-support-evaluator-proof-compatibility.yaml`

Parent story: `stories/approved/CARD-025-card-layer-spec010-migration-parent.yaml`

Related prior amendment artifacts:

- `agent-packets/CARD-025G-debt-closeout-scope-review.md`
- `agent-packets/CARD-025G-parser-deshape-scope-review.md`

Reviewed paths:

- `stories/approved/CARD-025G-generated-support-evaluator-proof-compatibility.yaml`
- `stories/generated/CARD-025G-generated-support-evaluator-proof-compatibility.yaml`
- `stories/approved/CARD-025-card-layer-spec010-migration-parent.yaml`
- `agent-packets/CARD-025G.md`
- `agent-packets/CARD-025G-debt-closeout-scope-review.md`
- `agent-packets/CARD-025G-parser-deshape-scope-review.md`
- `packages/cards/src/certified-card-text-parser.ts`
- `packages/cards/src/certified-card-text-parser.test.ts`
- `packages/cards/src/composed-parser-builder.ts`
- `packages/cards/src/composed-parser-builder.test.ts`
- `packages/cards/src/card-support-authority-shape.test.ts`
- `specs/04-effect-runtime.md`
- `specs/09-card-data-and-support-policy.md`

## Findings

None.

## Disposition Summary

`CARD-025G` is approval-ready after this parser-test touchpoint amendment.

Allowing `packages/cards/src/certified-card-text-parser.test.ts` and `packages/cards/src/composed-parser-builder.test.ts` is coherent with the already-reviewed CARD-025G de-shape scope. The child story already requires de-shaping exact parser authorization into reusable primitive evidence, plus synthetic variation and regression coverage proving current-family parser support no longer depends on exact full-line samples, story-coded ownership labels, or sample-specific numeric branches.

These two added touchpoints are adjacent test surfaces for the exact production files already in scope. They are the natural place to update expectations, diagnostics, residue handling, fail-closed behavior, and primitive-boundary regression coverage when `certified-card-text-parser.ts` and `composed-parser-builder.ts` are adjusted for the final CARD-025G de-shaping work.

This amendment does not by itself authorize new production behavior scope. It adds only test touchpoints. The parent and child stories still forbid new engine runtime capability, shared schema authority, real-card promotion, fixture/source-integrity work, unrelated wording-family expansion, or any production authorization route based on exact printed text, real card IDs, external lists, or sample-shaped allowlists.

This artifact satisfies only the `CARD-025G` child-story review row for the parser-test touchpoint scope amendment.
