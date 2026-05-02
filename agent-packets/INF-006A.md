<!-- agent-packet:story-id INF-006A -->
<!-- agent-packet:story-path stories/approved/INF-006A-canonical-types-compile-lane.yaml -->
<!-- agent-packet:story-sha256 c12e35a4fd9e76167615f18288a882ecc7298281724606d1d61e7bf804730165 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: INF-006A
Epic ID: KICK-001
Title: Add canonical TypeScript contract compilation lane
Type: tooling
Area: contracts
Primary Concern: contract

## Why

Materialize the canonical TypeScript contract artifact and add a compile-only validation lane so contract drift is caught before engine packages consume the shared types.

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

Own the canonical TypeScript contract file, its dedicated tsconfig, and compile smoke automation only. Do not add JSON fixture validation, SQL contract checks, or root lane aggregation in this story.

## Scope

- add the canonical TypeScript contract file at the spec-defined path
- add a dedicated contracts tsconfig for compile validation
- add a compile smoke command or test proving the contract compiles locally without emit

## Out of Scope

- effect DSL schema validation
- database schema validation
- root contracts lane aggregation

## Allowed Touch Points

<!-- prettier-ignore -->
- contracts/canonical-types.ts
- contracts/tsconfig.json
- package.json
- tests/contracts/**

## Constraints

- the canonical contract must not require package build output to compile
- no contract compile path may require live external services
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale

## Required Tests

- command or test smoke check proving contracts/tsconfig.json compiles canonical-types.ts without emit

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- contracts/canonical-types.ts exists at the canonical path
- contracts/tsconfig.json compiles the canonical contract under strict TypeScript
- a dedicated contract compile smoke path exists and fails if the contract stops compiling

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
