# CARD-025F Line Composition Certification Scope Review

Assignment ID: `CARD-025F-line-composition-cert-scope-review`

Artifact identity: `agent-packets/CARD-025F-line-composition-cert-scope-review.md`

Status: `approval-ready`

## Findings

None.

## Disposition Summary

The CARD-025F scope amendment is approval-ready. Adding `packages/cards/src/external-deck-construction-rule.test.ts` and `packages/cards/src/support-evaluator-parser-certification.test.ts` as test touchpoints stays inside the composition concern because those tests already exercise existing supported line-separated composition paths.

The amendment requires explicit parser-certification tests for supported multiline runtime compositions, including a path whose component evidence IDs do not use trigger-prefix heuristics, while preserving the external-deck-rule plus single runtime line compatibility boundary. It does not authorize new runtime, schema, fixture, manifest, source-hash, behavior-hash, or overlay behavior.
