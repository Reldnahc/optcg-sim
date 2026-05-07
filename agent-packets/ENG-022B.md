<!-- agent-packet:story-id ENG-022B -->
<!-- agent-packet:story-path stories/approved/ENG-022B-extract-battle-support-and-guards.yaml -->
<!-- agent-packet:story-sha256 bb3efa7b4af3aeaab902d9816c596fc5f378dc489776de707c10031f854226df -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-022B
Epic ID: KICK-001
Title: Extract battle support and guards
Type: refactor
Area: engine
Primary Concern: rules

## Why

Move shared battle support helpers and unsupported metadata guards out of the oversized battle action module without changing behavior.

## Authoritative Spec References

- 01-system-architecture.s024 (Original team and workflow rules preserved)
- 11-testing-quality.s002 (Testing goals)
- 11-testing-quality.s008 (Invariant tests)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

### 01-system-architecture.s024 (Original team and workflow rules preserved)

Even during solo development, the original ownership model remains useful because it defines clean module boundaries.

| Module                | Future owner profile               | Depends on                    |
| --------------------- | ---------------------------------- | ----------------------------- |
| `@optcg/types`        | Shared / rotating                  | None                          |
| `@optcg/cards`        | API integration developer          | Poneglyph API, Redis          |
| `@optcg/engine-core`  | Rules engineer                     | `types`, card manifest        |
| `@optcg/effects`      | Rules/card implementation engineer | `types`, card schema          |
| `@optcg/match-server` | Real-time backend engineer         | `engine-core`, `types`, Redis |
| `@optcg/api`          | Backend/product engineer           | `types`, PostgreSQL, Redis    |
| `@optcg/client`       | Frontend/game UI engineer          | `types`, `view-engine`        |
| `@optcg/bot`          | AI/gameplay developer              | `engine-core`                 |

Workflow rules:

1. Avoid cross-module PRs. If a feature touches multiple packages, land shared type changes first, then package-specific PRs.
2. Module owners review their package's PRs once contributors join.
3. Integration tests live at the top level and exercise package boundaries.
4. `@optcg/types` and `@optcg/engine-core` are semantically versioned; consumers upgrade deliberately.
5. Changes to Poneglyph schema handling require card-data validation tests.
6. Changes to effect definitions require card tests and coverage updates.

### 11-testing-quality.s002 (Testing goals)

The engine must be testable without UI, network, Redis, or Postgres. Most correctness bugs should be caught in package-level tests before an integration test or manual playtest.

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

### 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)

Package-boundary enforcement is required, not optional.

At minimum, lint rules or dependency-cruiser / equivalent boundary tooling must enforce:

- `@optcg/engine-core` cannot import React, browser code, WebSocket transport, Redis, Postgres, or live HTTP clients.
- `@optcg/view-engine` cannot import hidden-information-only server modules.
- `@optcg/client` cannot import server-only packages.
- `@optcg/server` cannot bypass `@optcg/cards` to call card-data sources directly from engine execution paths.
- test helpers that expose hidden state cannot be imported into browser/client production bundles.
- replay validation code cannot depend on client rendering code.

If stronger tooling is adopted, such as dependency-cruiser, Knip, or custom graph checks, CI must fail on violations.

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

### 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)

Boundary enforcement is mechanical: `@optcg/engine-core` cannot import React, browser code, WebSocket transport, Redis, Postgres, or live HTTP clients.

### 15-implementation-kickoff.s012 (Guardrails)

Kickoff guardrails require the engine to stay free of Redis, Postgres, WebSocket, React, and Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution consumes resolved manifests rather than live HTTP calls.

## Story Boundary

Own only extraction of shared pure helpers, support predicates, and unsupported battle metadata guards from battle-actions.ts into focused engine modules. Public battle action exports must remain stable.

## Scope

- extract CardRef comparison, text/record checks, thisBattle duration checks, unsupported battle effect body checks, and unsupported battle metadata checks into battle-support.ts or equivalent
- extract supported battle resolution envelope checks only if they remain behavior-identical
- keep battle-actions.ts public exports and imported call sites stable
- preserve all existing unsupported metadata fail-closed behavior

## Out of Scope

- changing action handling, legal action output, event creation, state mutation, damage resolution, Block Step, Counter Step, or cleanup behavior
- weakening unsupported effect, trigger, replacement, continuous-effect, or metadata guards
- new rules behavior or new tests beyond behavior-equivalence regression checks

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/src/battle-actions.ts
- packages/engine-core/src/battle-support.ts
- packages/engine-core/src/battle-actions.test.ts
- packages/engine-core/src/battle-declare-attack.test.ts
- packages/engine-core/src/battle-damage-banish.test.ts
- packages/engine-core/src/battle-counter.test.ts
- packages/engine-core/src/battle-blocker.test.ts
- packages/engine-core/src/battle-cleanup.test.ts
- packages/engine-core/src/battle-pipeline-regression.test.ts
- packages/engine-core/src/event-sequencing-regression.test.ts
- stories/approved/ENG-022B-extract-battle-support-and-guards.yaml
- agent-packets/ENG-022B.md
- agent-packets/active.json

## Constraints

- story-review must pass before moving this story to approved or implementing
- generate and activate only the ENG-022B packet while implementing this story
- run corepack pnpm run packets:verify before implementation and review handoff
- stay within allowed_touch_points
- target the ENG-022 parent integration branch
- do not run packets:complete after merging only into the parent integration branch
- if extraction reveals behavior ambiguity, stop and report the blocker
- implementation-review gate is required after the PR is opened
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

## Required Tests

- run corepack pnpm exec vitest run packages/engine-core/src/battle-actions.test.ts packages/engine-core/src/battle-declare-attack.test.ts packages/engine-core/src/battle-damage-banish.test.ts packages/engine-core/src/battle-counter.test.ts packages/engine-core/src/battle-blocker.test.ts packages/engine-core/src/battle-cleanup.test.ts packages/engine-core/src/battle-pipeline-regression.test.ts packages/engine-core/src/event-sequencing-regression.test.ts
- run corepack pnpm --filter @optcg/engine-core typecheck
- run corepack pnpm run packets:verify
- run corepack pnpm run coverage
- run corepack pnpm run verify

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- battle-support.ts or equivalent owns extracted support/guard helpers
- battle-actions.ts delegates to extracted helpers without changing public exports
- existing guard tests still pass and prove fail-closed behavior is unchanged
- full verify passes

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
