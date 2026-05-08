<!-- agent-packet:story-id INF-025F -->
<!-- agent-packet:story-path stories/approved/INF-025F-extract-packet-rendering-helpers.yaml -->
<!-- agent-packet:story-sha256 f9fe9c43faa12d59a55250f29d1b4cb4c01ec163f2a465130bfb678e1857e65a -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: INF-025F
Epic ID: KICK-001
Title: Extract packet rendering helpers
Type: refactor
Area: infra
Primary Concern: tooling

## Why

Extract packet rendering and spec excerpt helpers from build-agent-packet.ts without changing generated packet markdown, metadata, supplemental constraints, or spec excerpt selection.

## Authoritative Spec References

- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 11-testing-quality.s008 (Invariant tests)

## Relevant Spec Excerpts

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Each package must expose consistent task names where applicable:

- `build`
- `typecheck`
- `lint`
- `test`
- `test:watch`
- `coverage`

Integration-heavy packages may additionally expose:

- `test:integration`
- `test:replay`
- `test:contracts`
- `test:hidden-info`

At the root, the workspace must provide:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm coverage
pnpm verify
```

`pnpm verify` is the canonical local pre-push command and must run the same core checks as the main merge CI pipeline.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

The repo must define a root `tsconfig.base.json` and package-level `tsconfig.json` files extending it.

Required compiler settings for implementation packages:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noImplicitOverride": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "useUnknownInCatchVariables": true,
    "noEmitOnError": true
  }
}
```

Strongly preferred unless a package-specific exception is justified in writing:

- `verbatimModuleSyntax`
- `importsNotUsedAsValues = error`
- `noUnusedLocals`
- `noUnusedParameters`

The repo must not rely on broad TypeScript escape hatches. The following require explicit justification in code review and should be lint-restricted where possible:

- `any`
- non-null assertion (`!`)
- `@ts-ignore`
- `@ts-nocheck`
- unchecked type assertions across trust boundaries

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

### 11-testing-quality.s008 (Invariant tests)

Run after every action, decision response, effect resolution, and replay step in test mode.

```ts
assertAllCardsInExactlyOneLocation(state);
assertNoDuplicateInstanceIds(state);
assertCharacterAreaSizeAtMostFive(state);
assertStageAreaSizeAtMostOne(state);
assertLeaderAreaExactlyOne(state);
assertAttachedDonConsistency(state);
assertNoIllegalHiddenInfoInViews(state);
assertPendingDecisionIsValid(state);
assertEffectQueueEntriesAreResolvableOrCancelled(state);
assertStateHashStable(state);
```

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

## Story Boundary

Own only behavior-preserving extraction of packet rendering, supplemental constraint, spec section loading, and markdown excerpt helpers. Generated packet content must remain byte-equivalent for covered fixtures.

## Scope

- extract packet construction and rendering helpers into a focused rendering module
- extract spec document discovery and SECTION_REF excerpt loading helpers used by packet rendering
- preserve supplemental constraint selection and output ordering
- preserve generated packet content byte-for-byte for covered fixtures

## Out of Scope

- changing parser behavior beyond import compatibility
- changing active manifest, verification, completion, lifecycle, story schema, workflow docs, CLI command names, CLI arguments, or output paths

## Allowed Touch Points

<!-- prettier-ignore -->
- tools/build-agent-packet.ts
- tools/agent-packet-renderer.ts
- tools/agent-packet-parser.ts
- tests/contracts/agent-packet-rendering-contract.test.mjs
- tests/contracts/agent-packet-test-support.mjs
- stories/generated/INF-025F-extract-packet-rendering-helpers.yaml
- stories/approved/INF-025F-extract-packet-rendering-helpers.yaml
- agent-packets/INF-025F.md
- agent-packets/active.json

## Constraints

- target the INF-025 parent integration branch
- do not run packets:complete after merging only into the parent integration branch
- this is a behavior-preserving extraction story; if generated packet content changes, stop and record an ambiguity
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale

## Required Tests

- run corepack pnpm exec vitest run tests/contracts/agent-packet-rendering-contract.test.mjs tests/contracts/agent-packet-parser-contract.test.mjs
- run corepack pnpm run packets:verify
- run corepack pnpm run contracts
- run corepack pnpm run verify

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- rendering helper extraction reduces build-agent-packet.ts while preserving packet output
- rendering-focused contract tests pass without expectation changes
- parser-focused contract tests still pass after import compatibility changes
- contracts and full verify pass

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
