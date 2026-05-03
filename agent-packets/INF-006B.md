<!-- agent-packet:story-id INF-006B -->
<!-- agent-packet:story-path stories/approved/INF-006B-effect-dsl-schema-fixture-validation.yaml -->
<!-- agent-packet:story-sha256 42b2d504166d11e7d947516b1ce320bb51609f08b94e27f52c8b63bc6b52f194 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: INF-006B
Epic ID: KICK-001
Title: Add effect DSL schema and fixture validation lane
Type: tooling
Area: contracts
Primary Concern: contract

## Why

Add the baseline canonical effect DSL schema plus valid and invalid fixture coverage so JSON effect definitions can be validated mechanically before they reach runtime work.

## Authoritative Spec References

- 11-testing-quality.s021 (v6 contract validation)
- 23-repo-tooling-and-enforcement.s011 (Contract and fixture validation)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)

## Relevant Spec Excerpts

### 11-testing-quality.s021 (v6 contract validation)

Add these checks to CI before broad card implementation:

```bash
tsc -p contracts/tsconfig.json
# validate each card effect fixture against contracts/effect-dsl.schema.json
# run a SQL parser/linter against contracts/database-schema-v6.sql
# validate approved story files against contracts/story.schema.json
```

The fixture validator must reject deprecated DSL aliases such as `costOp`, `costValue`, `typeIncludes`, `cardNameNot`, and `colorIncludes` in committed canonical definitions. A migration script may accept them only when converting legacy examples.

Every rules-timing algorithm tightened in the v4, v5, and v6 spec passes must have at least one named test in `18-acceptance-tests.md` when code behavior is affected.

### 23-repo-tooling-and-enforcement.s011 (Contract and fixture validation)

The repo must validate the canonical contract files and fixtures automatically.

Required checks:

- `contracts/canonical-types.ts` compiles under `contracts/tsconfig.json`
- effect DSL fixtures validate against `contracts/effect-dsl.schema.json`
- card fixture normalization tests run against real supplied fixture payloads
- replay fixtures remain loadable and hash-stable
- schema/DDL files parse successfully in CI

A change to DSL shape, card manifests, or replay structure is incomplete unless fixtures are updated in the same change.

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

## Story Boundary

Own the effect DSL schema artifact, fixture samples, and fixture-validation automation only. Do not add database checks, canonical TypeScript compilation, or root lane aggregation in this story.

## Scope

- add the baseline canonical effect DSL schema at the spec-defined path
- add at least one valid and one invalid effect DSL fixture dedicated to validation tests
- add a validation command or test that proves invalid fixtures are rejected
- add a direct JSON Schema validation dev dependency when needed for the validation lane

## Out of Scope

- canonical TypeScript contract compilation
- database schema validation
- root contracts lane aggregation
- exhaustive JSON Schema parity with every canonical TypeScript effect, cost, condition, and duration union

## Allowed Touch Points

<!-- prettier-ignore -->
- contracts/effect-dsl.schema.json
- fixtures/**
- package.json
- pnpm-lock.yaml
- tests/contracts/**
- tools/**

## Constraints

- fixture validation must remain local and deterministic
- invalid fixtures used for validation must stay isolated from production card content
- dependency and lockfile changes are allowed only for the effect DSL schema validation lane
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale

## Required Tests

- fixture validation smoke test with one valid effect DSL sample and one invalid sample

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- contracts/effect-dsl.schema.json exists at the canonical path
- committed validation fixtures include at least one valid and one invalid sample
- the validation lane rejects the invalid sample and accepts the valid sample
- the baseline schema rejects deprecated CardFilter aliases represented by the invalid fixture

## Ambiguity Rule

Policy: fail_and_escalate

If the story or cited specification is ambiguous, do not invent behavior. Report the ambiguity and stop at the narrowest safe point.

## Agent Instruction Footer

```text
You are implementing a constrained story in an existing codebase.
The cited specification is authoritative.
Do not invent behavior not supported by the cited spec.
Stay within scope.
Stay within the approved story boundary and allowed touch points.
Follow repo tooling and code standard requirements.
Include tests for the listed acceptance criteria.
If the spec is ambiguous, report the ambiguity instead of guessing.
```
