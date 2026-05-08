<!-- agent-packet:story-id INF-025B -->
<!-- agent-packet:story-path stories/approved/INF-025B-split-packet-rendering-tests.yaml -->
<!-- agent-packet:story-sha256 790f2a16ac4a50e437d9203fc7f38aef3a26fab69d9e51186fe928f8cd9d6712 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: INF-025B
Epic ID: KICK-001
Title: Split packet rendering tests
Type: refactor
Area: infra
Primary Concern: verification

## Why

Move packet rendering and spec excerpt contract tests into focused files without changing generated packet markdown or supplemental constraint output.

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

Own only behavior-preserving test organization for canonical packet rendering, annotated spec refs, checked-in spec discovery, and fenced SECTION_REF excerpt behavior currently in agent-packet-contract.test.mjs.

## Scope

- move canonical packet section rendering coverage into agent-packet-rendering-contract.test.mjs
- move annotated spec-ref label normalization coverage into agent-packet-rendering-contract.test.mjs
- move checked-in spec document discovery coverage into agent-packet-rendering-contract.test.mjs
- move fenced SECTION_REF excerpt retention coverage into agent-packet-rendering-contract.test.mjs
- preserve every assertion and generated packet expectation

## Out of Scope

- changing tools/build-agent-packet.ts
- changing packet markdown content, metadata, supplemental constraints, spec discovery semantics, or CLI output
- moving active verification or completion lifecycle tests

## Allowed Touch Points

<!-- prettier-ignore -->
- tests/contracts/agent-packet-contract.test.mjs
- tests/contracts/agent-packet-rendering-contract.test.mjs
- tests/contracts/agent-packet-test-support.mjs
- stories/generated/INF-025B-split-packet-rendering-tests.yaml
- stories/approved/INF-025B-split-packet-rendering-tests.yaml
- agent-packets/INF-025B.md
- agent-packets/active.json

## Constraints

- target the INF-025 parent integration branch
- do not run packets:complete after merging only into the parent integration branch
- this is a behavior-preserving test organization story; if packet output changes appear necessary, stop and record an ambiguity
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale

## Required Tests

- run corepack pnpm exec vitest run tests/contracts/agent-packet-rendering-contract.test.mjs tests/contracts/agent-packet-contract.test.mjs
- run corepack pnpm run packets:verify
- run corepack pnpm run contracts
- run corepack pnpm run verify

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- rendering-focused contract tests cover the same canonical rendering and excerpt scenarios
- agent-packet-contract.test.mjs no longer contains the moved rendering-only scenarios
- generated packet content assertions remain identical in meaning and expected values
- focused rendering contract test, contracts, and full verify pass

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
