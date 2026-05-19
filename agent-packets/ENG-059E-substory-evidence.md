# ENG-059E Substory Evidence

Story: `stories/approved/ENG-059E-conditional-field-removal-protection-modifiers.yaml`
Packet: `agent-packets/ENG-059E.md`
Implementation commit: `27cff5f253a7ef3a41188416daf87c80d4a2dab3`
Base commit: `0ab0321`

## Worker Evidence

Implementation worker: `019e4244-b5ed-7551-b7d6-5899dd533043`
Review-fix worker: `019e424f-8f69-7ec1-9098-c80989c38a8c`

Implemented scoped engine support for conditionally active field-removal protection modifiers:

- reuses the existing condition evaluator
- supported false `trashCount` conditions make protection inactive
- supported true `trashCount` conditions make protection active
- unsupported or malformed active applicable conditions fail closed before mutation
- inactive or unrelated conditional protection records are ignored before condition evaluation
- no parser, generated-support, card data, real-card ID, full-card text, or `@optcg/cards` work

## Review Evidence

Initial code-review agent: `019e424c-f9b6-7c61-8f1b-0d07b06754c0`

Initial review found one important issue:

- condition evaluation happened before duration and self-target applicability checks, so inactive or unrelated conditional protection records could fail closed incorrectly

Re-review agent: `019e4253-997b-7102-9cfe-4d1fbe8ce2b5`

Re-review disposition: approved/ready, no findings.

Re-review confirmed:

- condition evaluation now runs only after supported metadata, active duration, and self-target applicability
- regressions cover stale `whileSourceOnField` source-dependent conditions and unrelated malformed conditional records
- active applicable malformed conditions still fail closed

## Verification Evidence

Focused verification:

- `corepack pnpm --filter @optcg/engine-core test -- field-removal-protection.test.ts`
  - passed: 104 files, 876 tests
- `corepack pnpm --filter @optcg/engine-core typecheck`
  - passed
- `corepack pnpm run packets:verify`
  - passed: 1 active story packet
- `corepack pnpm run stories:validate`
  - passed: 479 committed story files

Exact-HEAD verification for implementation commit `27cff5f253a7ef3a41188416daf87c80d4a2dab3`:

- `corepack pnpm --filter @optcg/engine-core test`
  - passed: 104 files, 876 tests
- `corepack pnpm run test:hidden-info`
  - sandbox run failed with `EPERM` opening `node_modules/.pnpm/zod@4.4.3/.../json-schema.js`
  - escalated rerun passed: 6 files, 9 tests
- `corepack pnpm run verify`
  - sandbox run failed with the same `EPERM` Zod file access issue during Vitest import
  - escalated rerun passed all phases:
    - format check
    - lint
    - typecheck
    - packets verify
    - specs metadata verify
    - main tests: 165 files, 1555 tests
    - hidden-info tests: 6 files, 9 tests
    - tooling tests: 9 files, 80 tests
    - contracts tests: 21 files, 130 tests
    - cleanup contract tests: 7 files, 99 tests

## Assumptions

- `effect.controller` is the correct `self` context for continuous protection condition evaluation.
- Unsupported condition evaluation on an active applicable field-removal protection maps to existing fail-closed `malformed-field-removal-protection` behavior.
