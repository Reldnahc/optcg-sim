# CARD-025G Story Review - Parser De-shape Scope Amendment

Review assignment id: `story-review-CARD-025G-parser-deshape-scope-2026-05-23`

Review type: `child-story`

Status: `approval-ready`

Artifact identity: `agent-packets/CARD-025G-parser-deshape-scope-review.md`

Reviewed story: `stories/approved/CARD-025G-generated-support-evaluator-proof-compatibility.yaml`

Generated mirror: `stories/generated/CARD-025G-generated-support-evaluator-proof-compatibility.yaml`

Parent story: `stories/approved/CARD-025-card-layer-spec010-migration-parent.yaml`

Related prior amendment artifact: `agent-packets/CARD-025G-debt-closeout-scope-review.md`

Reviewed paths:

- `stories/approved/CARD-025G-generated-support-evaluator-proof-compatibility.yaml`
- `stories/generated/CARD-025G-generated-support-evaluator-proof-compatibility.yaml`
- `stories/approved/CARD-025-card-layer-spec010-migration-parent.yaml`
- `agent-packets/CARD-025G.md`
- `agent-packets/CARD-025G-debt-closeout-scope-review.md`
- `packages/cards/src/card-support-authority-shape.test.ts`
- `specs/04-effect-runtime.md`
- `specs/09-card-data-and-support-policy.md`

## Findings

None.

## Disposition Summary

`CARD-025G` is approval-ready after this second scope amendment.

The amendment is coherent with the CARD-025 parent and the cited SPEC-010 primitive-boundary authority. It keeps support authorization on reusable primitive evidence rather than exact wrapper-body samples, exact full-line gates, story-named production branches, real-card IDs, external lists, or sample-specific numeric authorization.

The amendment remains cards-layer only. It does not authorize engine runtime work, shared schema changes, real-card fixture promotion, manifest/hash/overlay changes, or unrelated wording-family expansion.

Permitting parameterized parser de-shaping for already-supported primitive families is acceptable here because the remaining CARD-025A `migrationDebtInventory` rows are described as active production authorization gates, and the parent story requires that inventory to be empty by the end of `CARD-025G`. The amendment preserves the current supported families and still forbids unrelated parser grammar or new generated-support coverage outside those families.

The required tests are sufficient to prevent another hardcoded or sample-shaped closeout. In particular, the story now requires:

- closeout of the original CARD-025A `migrationDebtInventory`
- synthetic variation coverage proving current-family support does not depend on exact full-line samples, story-coded parser ownership labels, or sample-specific numeric branches
- regression coverage proving de-shaped support preserves current supported families and still fails closed for unrelated wording families
- anti-shape coverage proving evaluator/proof/report paths do not authorize support from exact full-line text, card IDs, external lists, parser-rule-only evidence, or full-definition-size gates

Optional tightening only, not required for approval: add one sentence limiting de-shaping to production authorization shapes already represented by the current CARD-025A inventory rows, or code directly required to route those rows to existing primitive evidence, and forbidding new primitive families, new capability IDs, or new parser certification families.

This artifact satisfies only the `CARD-025G` child-story review row for the second parser de-shape scope amendment.
