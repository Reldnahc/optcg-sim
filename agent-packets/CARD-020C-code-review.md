# CARD-020C Code Review

Assignment identity: `code-review-CARD-020C-arbitrary-proof-bundle-2026-05-19`
Reviewer agent: `019e40d5-bf3d-7e71-a268-0ffa18f27aeb`
Reviewed story: `stories/approved/CARD-020C-arbitrary-card-probe-proof-bundle.yaml`
Reviewed packet: `agent-packets/CARD-020C.md`
Verdict: PASS

## Findings

No blocking findings.

The patch stays within CARD-020C touch points, keeps diagnostics separate from support authority, and does not add card ID branches, exact full printed-text branches, runtime behavior, capability records, fixture/hash changes, or support manifests. The generated-support fallback only enriches `unparsed-span` blockers with diagnostic decomposition in `packages/cards/src/generated-support-index.ts`.

## Residual Risks

- `packages/cards/src/generated-support-diagnostics.test.ts` includes all six report samples, but only deeply asserts structured decomposition for slash/K.O. The support-probe tests cover the detailed components for all samples, so this is non-blocking.
- `packages/cards/src/generic-card-text-diagnostic-scanner.ts` adds phrase-level recognizers close to CARD-020C examples. They are component recognizers with variation coverage, not full-effect/card branches, and remain diagnostic-only.

## Verification Evidence

- `corepack pnpm --filter @optcg/cards exec vitest run --root ../.. packages/cards/src/support-probe.test.ts packages/cards/src/generated-support-diagnostics.test.ts packages/cards/src/generated-support-report.test.ts packages/cards/src/support-evaluator.test.ts` -> 4 files, 84 tests passed.
- `corepack pnpm run packets:verify` -> verified 1 active story packet.
- `corepack pnpm run stories:validate` -> validated 465 committed story files.
- `corepack pnpm --filter @optcg/cards typecheck` -> exit 0.
- `corepack pnpm --filter @optcg/cards test` -> 31 files, 557 tests passed.
- `corepack pnpm verify` -> exit 0; format, lint, typecheck, packets, specs metadata, tests, hidden-info tests, tooling tests, contracts, and cleanup contracts passed.

This review is acceptable to record as the CARD-020C AI review artifact.
