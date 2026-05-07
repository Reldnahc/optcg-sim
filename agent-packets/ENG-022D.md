<!-- agent-packet:story-id ENG-022D -->
<!-- agent-packet:story-path stories/approved/ENG-022D-extract-supported-battle-resolution.yaml -->
<!-- agent-packet:story-sha256 e64795f8c16997cbdac5f1958f223a6dc9f0a628d5b5128a5065a6b6c10bc67b -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-022D
Epic ID: KICK-001
Title: Extract supported battle resolution
Type: refactor
Area: engine
Primary Concern: rules

## Why

Move supported damage and End of Battle resolution out of battle-actions.ts behind the stable public facade.

## Authoritative Spec References

- 01-system-architecture.s024 (Original team and workflow rules preserved)
- 02-engine-mechanics.s021 (Damage Step)
- 02-engine-mechanics.s022 (End of Battle)
- 02-engine-mechanics.s023 (Damage processing)
- 03-game-state-events-decisions.s005 (Event journal)
- 03-game-state-events-decisions.s020 (State hashing)
- 11-testing-quality.s007 (Interaction tests)
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

### 02-engine-mechanics.s021 (Damage Step)

1. Compute attacker and target power from `ComputedGameView`.
2. If attacker power is lower than target power, no damage/K.O. occurs.
3. If attacker power is equal or greater:
   - Target Leader: deal damage.
   - Target Character: K.O. target.
4. Emit events for damage, life movement, K.O., card movement.
5. Triggered effects during damage wait until damage processing completes.

### 02-engine-mechanics.s022 (End of Battle)

1. Queue/resolve end-of-battle triggers.
2. Expire battle-duration continuous effects.
3. Clear battle context.
4. Return to Main Phase.

### 02-engine-mechanics.s023 (Damage processing)

For each point of damage:

1. If player has 0 life, mark defeat condition and run rule processing.
2. Otherwise, take the top life card.
3. If the card has `[Trigger]`, ask whether to reveal and activate it instead of adding it to hand.
4. If trigger is activated, the card is temporarily in no zone while the trigger resolves.
5. After trigger resolution, trash the card unless the trigger or a replacement says otherwise.
6. If trigger is declined or unavailable, add the card to hand hidden.

When damage is greater than 1, repeat this process one point at a time in official order.

`[Banish]` replaces the normal life-to-hand/trigger path by trashing the life card instead.

### 03-game-state-events-decisions.s005 (Event journal)

Every atomic mutation emits events. Trigger detection consumes events, not actions.

Event sequencing is part of the replay and state-hash contract:

- EngineResult.events from one accepted transition must be strictly increasing by
  `seq`.
- The final `state.eventJournal` must be strictly increasing by `seq`.
- Event `seq` values must be allocated by append order.
- Helpers must not create multiple events in one `push` call when event IDs or seq values depend on `events.length`; append events one at a time or use an
  equivalent allocator that observes the already-appended event count.

```ts
interface EngineEvent {
  id: EngineEventId;
  seq: number;
  type: EngineEventType;
  actor?: PlayerId;
  source?: CardRef;
  affected?: CardRef[];
  payload: unknown;
  causedBy?: CausalityRef;
  visibility: EventVisibility;
  createdAtStateSeq: StateSeq;
}

type EngineEventType =
  | "phaseStarted"
  | "phaseEnded"
  | "cardRevealed"
  | "cardMoved"
  | "cardPlayed"
  | "cardDrawn"
  | "cardDiscarded"
  | "cardTrashed"
  | "cardKOd"
  | "cardReturned"
  | "donAttached"
  | "donReturned"
  | "costPaid"
  | "attackDeclared"
  | "blockerActivated"
  | "counterUsed"
  | "damageWouldBeDealt"
  | "damageDealt"
  | "lifeTaken"
  | "triggerActivated"
  | "effectQueued"
  | "effectResolved"
  | "replacementApplied"
  | "decisionCreated"
  | "decisionResolved"
  | "ruleProcessingChecked"
  | "gameEnded";
```

### 03-game-state-events-decisions.s020 (State hashing)

Replays and recovery need state hashes.

```ts
interface StateHashInput {
  state: GameState;
  includeHidden: boolean;
  normalizeTransientIds: boolean;
}
```

Use canonical JSON serialization:

- Stable object-key ordering.
- Stable array ordering.
- Exclude timestamps unless explicitly part of replay logic.
- Include hidden data for authoritative replay hashes.
- Use separate public-view hash for client sync if useful.

### 11-testing-quality.s007 (Interaction tests)

Representative interactions:

```text
tests/interactions/
  blocker-plus-unblockable.test.ts
  double-attack-plus-banish.test.ts
  replacement-on-ko.test.ts
  simultaneous-ko-triggers.test.ts
  on-ko-source-presence.test.ts
  trigger-during-damage-defers.test.ts
  event-activates-effect-after-resolution.test.ts
  negative-power-stays-on-field.test.ts
  negative-cost-clamps-to-zero.test.ts
```

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

Own only behavior-preserving extraction of supported battle resolution, damage, Banish, Character K.O., rule-processing continuation, and centralized End of Battle cleanup code into a focused engine module.

## Scope

- extract resolveSupportedVanillaBattle and its private damage, life movement, Character K.O., Banish, rule-processing, and End of Battle cleanup helpers into battle-resolution.ts or equivalent
- keep resolveSupportedVanillaBattle and expireBattleDurationStateForCleanup exported from battle-actions.ts for existing callers
- preserve event ordering, event IDs, eventJournal suffix equality, rule-processing checkpoints, invariants, state hashes, and fail-closed behavior
- keep battle-actions.ts as the stable public facade after extraction

## Out of Scope

- new damage behavior, Banish behavior, cleanup behavior, triggers, replacement effects, On K.O., replay schema, server/client/UI, database, Redis, WebSocket, or CLI behavior
- changing public action or EngineResult contracts
- weakening unsupported runtime queue, trigger, replacement, continuous-effect, or metadata fail-closed guards

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/src/battle-actions.ts
- packages/engine-core/src/battle-support.ts
- packages/engine-core/src/battle-resolution.ts
- packages/engine-core/src/battle-actions.test.ts
- packages/engine-core/src/battle-damage-banish.test.ts
- packages/engine-core/src/battle-cleanup.test.ts
- packages/engine-core/src/battle-pipeline-regression.test.ts
- packages/engine-core/src/event-sequencing-regression.test.ts
- stories/approved/ENG-022D-extract-supported-battle-resolution.yaml
- agent-packets/ENG-022D.md
- agent-packets/active.json

## Constraints

- story-review must pass before moving this story to approved or implementing
- generate and activate only the ENG-022D packet while implementing this story
- run corepack pnpm run packets:verify before implementation and review handoff
- stay within allowed_touch_points
- target the ENG-022 parent integration branch
- do not run packets:complete after merging only into the parent integration branch
- if extraction requires behavior changes, stop and split or record the blocker
- implementation-review gate is required after the PR is opened
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

## Required Tests

- run corepack pnpm exec vitest run packages/engine-core/src/battle-damage-banish.test.ts packages/engine-core/src/battle-cleanup.test.ts packages/engine-core/src/battle-pipeline-regression.test.ts packages/engine-core/src/event-sequencing-regression.test.ts packages/engine-core/src/battle-actions.test.ts
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

- supported battle resolution production code lives in a focused module
- battle-actions.ts public exports remain stable
- damage, Banish, Character K.O., cleanup, event sequencing, and pipeline regression tests pass
- full verify passes without behavior-driven assertion updates

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
