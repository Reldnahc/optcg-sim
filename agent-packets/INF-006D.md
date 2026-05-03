<!-- agent-packet:story-id INF-006D -->
<!-- agent-packet:story-path stories/approved/INF-006D-root-contracts-lane-aggregation.yaml -->
<!-- agent-packet:story-sha256 6922b73e82d53e29818509b21a30829cc4af0849ffde09557b162300fee3d9c3 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: INF-006D
Epic ID: KICK-001
Title: Expand the root contracts lane to aggregate contract checks
Type: tooling
Area: infra
Primary Concern: verification

## Why

Expand the root contracts lane so canonical type compilation, effect DSL validation, database schema validation, and story-schema checks run through one stable command for local verification and CI.

## Authoritative Spec References

- 23-repo-tooling-and-enforcement.s010 (Test tooling requirements)
- 23-repo-tooling-and-enforcement.s011 (Contract and fixture validation)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

## Relevant Spec Excerpts

### 23-repo-tooling-and-enforcement.s010 (Test tooling requirements)

The repo must support the following test lanes:

1. package unit tests,
2. engine interaction tests,
3. invariant/property or fuzz-style tests where applicable,
4. replay determinism tests,
5. hidden-information leakage tests,
6. contract/schema validation tests,
7. smoke integration tests for server protocol behavior.

At minimum, the root verification pipeline must include:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:contracts   # if defined at root via recursive filtering
```

Before public alpha or ranked play, CI must also include replay and hidden-information test lanes.

### 23-repo-tooling-and-enforcement.s011 (Contract and fixture validation)

The repo must validate the canonical contract files and fixtures automatically.

Required checks:

- `contracts/canonical-types.ts` compiles under `contracts/tsconfig.json`
- effect DSL fixtures validate against `contracts/effect-dsl.schema.json`
- card fixture normalization tests run against real supplied fixture payloads
- replay fixtures remain loadable and hash-stable
- schema/DDL files parse successfully in CI

A change to DSL shape, card manifests, or replay structure is incomplete unless fixtures are updated in the same change.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

A pull request must not merge unless the main CI pipeline passes.

Minimum required merge gates:

1. install dependencies with locked versions,
2. build/typecheck workspace,
3. lint workspace,
4. run tests,
5. validate contracts and schemas,
6. validate formatting,
7. publish coverage artifact,
8. fail if generated artifacts or snapshots are stale when the repo defines them.

Recommended CI jobs:

- `quality` -> lint, typecheck, format check
- `engine` -> engine unit, interaction, invariant, replay tests
- `contracts` -> canonical types, DSL schema, fixture normalization, SQL/schema validation
- `client-server-smoke` -> protocol smoke tests and filtered-view checks

For protected branches, require at least one human review plus passing CI.

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

## Story Boundary

Own root contracts lane composition and CI-aligned command wiring only. Do not create the underlying canonical artifacts or validation fixtures in this story.

## Scope

- compose the root contracts command from the dedicated contract sub-lanes
- keep local verify and CI materially aligned with the expanded contracts lane
- preserve the already-landed story-schema validation inside the aggregated lane

## Out of Scope

- authoring canonical TypeScript contract content
- authoring the effect DSL schema
- authoring the database schema contract

## Allowed Touch Points

<!-- prettier-ignore -->
- package.json
- .github/workflows/**
- tests/ci/**
- tests/contracts/**

## Constraints

- CI and local contract validation must remain materially aligned
- root aggregation must not silently bypass a failing contract sub-lane
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale

## Required Tests

- root contracts smoke test proving the aggregated lane calls the expected subcommands
- CI workflow smoke test proving the contracts job still calls the canonical root lane

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- one root contracts lane runs the available contract compile and validation subcommands
- the root contracts lane still includes story-schema validation
- CI continues to call the canonical root contracts lane instead of bespoke per-job logic

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
