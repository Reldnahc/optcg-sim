# ENG-059C Substory Evidence

Story: `stories/approved/ENG-059C-effect-origin-field-removal-protection.yaml`
Packet: `agent-packets/ENG-059C.md`
Implementation commit: `4843d97c552e0fde8b2035c693359d35d89180ce`
Base commit: `ef576041807a169535ba5fb75c72ac74fdaba003`

## Worker Evidence

Implementation worker: `019e41bb-5d61-71f3-8be3-8d6d78ee0dc7`
Review-fix test worker: `019e41d4-f071-7752-8fba-43a4749299da`
Review-fix implementation worker: `019e41d8-b8ac-7c51-a0be-814fc8e34142`

Implemented scoped engine field-removal protection support:

- classifies supported field-to-trash removal attempts by source kind and controller
- prevents supported opponent card-effect field removal before zone mutation
- preserves battle K.O., rule-process trash, controller-owned effects, and controller-cost removal
- fails closed for ambiguous or malformed field-removal/protection metadata
- keeps parser, generated-support, card fixtures, real-card IDs, and shared type contracts out of scope

## Review Evidence

Initial code-review agent: `019e41d1-c70b-7d62-9484-3e04064f5f87`

Initial review found missing required tests for:

- sixth-character overflow rule-process trash on a protected Character
- controller-cost removal not being blocked by opponent-effect protection

Re-review agent: `019e41db-042c-7ac0-8976-fa33b8dcf460`

Re-review disposition: approved/ready, no findings.

Re-review confirmed:

- overflow rule-process trash removes the protected Character and does not fire ordinary On K.O. trigger/draw events
- controller-cost removal is classified as an excluded attempt and is not prevented
- supported `wouldBeKOd` replacement decision ordering is pinned before field-removal protection prevents removal
- amended files stay within ENG-059C allowed touch points

## Verification Evidence

Focused verification after review fix:

- `corepack pnpm --filter @optcg/engine-core test -- field-removal-protection.test.ts`
  - passed: 104 files, 870 tests
- `corepack pnpm --filter @optcg/engine-core typecheck`
  - passed

Exact-HEAD verification for implementation commit `4843d97c552e0fde8b2035c693359d35d89180ce`:

- `corepack pnpm run stories:validate`
  - passed: 477 committed story files
- `corepack pnpm run packets:verify`
  - passed: 1 active story packet
- `corepack pnpm --filter @optcg/engine-core test`
  - passed: 104 files, 870 tests
- `corepack pnpm --filter @optcg/engine-core typecheck`
  - passed
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
    - main tests: 165 files, 1549 tests
    - hidden-info tests: 6 files, 9 tests
    - tooling tests: 9 files, 80 tests
    - contracts tests: 21 files, 130 tests
    - cleanup contract tests: 7 files, 99 tests

## Assumptions

- Controller-cost field-removal attempts are a known excluded source kind for ENG-059C protection and must return allowed/not prevented.
- Unknown or custom source kinds remain ambiguous and fail closed.
- Replacement decision ordering for supported `wouldBeKOd` replacement effects remains current engine behavior and is now pinned by synthetic test coverage.
