# CARD-025E Dynamic Condition Certification Scope Review

Review assignment ID: `CARD-025E-dynamic-condition-cert-scope-review`

Artifact identity: `agent-packets/CARD-025E-dynamic-condition-cert-scope-review.md`

Status: `approval-ready`

## Findings

None.

## Disposition Summary

The CARD-025E amendment is approval-ready after adding the required evaluator-default parser-certification path test. The amendment permits `packages/cards/src/external-deck-construction-rule.ts` for shared review-layer parser-cert blocker aggregation and `packages/cards/src/support-evaluator.ts` for default certification inventory alignment.

The story now explicitly requires conditional continuous non-base body support to fail closed only for the parsed condition primitive that is missing or stale, remain supported when an unrelated condition primitive certification is stale, and remain supported through `evaluateGeneratedSupportPlayability` default parser-certification evidence without explicit parser-certification input.

Follow-up re-review also approved adding `packages/cards/src/support-evaluator-default-parser-certification.test.ts` as a focused regression test file because `support-evaluator.test.ts` is already near the repo `max-lines` guard. This does not broaden CARD-025E into new condition semantics or unrelated evaluator behavior.
