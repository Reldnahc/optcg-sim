<!-- agent-packet:story-id ENG-010F -->
<!-- agent-packet:story-path stories/approved/ENG-010F-effect-queue-no-choice-ordering.yaml -->
<!-- agent-packet:story-sha256 052ab49d706e839d5f14f1f609b8449ef77c258385027b9441d52c938f702275 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-010F
Epic ID: M1-001
Title: Add no-choice effect queue ordering tie-breakers
Type: implementation
Area: engine
Primary Concern: rules

## Why

Extend the effect queue helper surface with deterministic no-choice ordering for validated and grouped pending entries, without resolving player-choice buckets or creating decisions.

## Authoritative Spec References

- 02-engine-mechanics.s004 (Authority and official-rules defaults)
- 04-effect-runtime.s006 (Effect queue entry)
- 04-effect-runtime.s009 (Queue ordering)
- 03-game-state-events-decisions.s020 (State hashing)
- 03-game-state-events-decisions.s022 (Internal state sequencing)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

### 02-engine-mechanics.s004 (Authority and official-rules defaults)

- Official card wording overrides the comprehensive rules when they conflict.
- Official FAQ/rulings/errata refine behavior when printed text alone is insufficient.
- The simulator must implement that authority through DSL/custom handlers and card-specific tests.
- Simultaneous player choices are ordered turn player first, then non-turn player.
- When both players have triggered effects at the same timing, turn-player effects resolve first under the official timing rules.
- Effects triggered during damage processing wait until damage processing is complete, except for `[Trigger]` handling which follows the official interrupt path.

### 04-effect-runtime.s006 (Effect queue entry)

```ts
interface EffectQueueEntry {
  id: QueueEntryId;
  state: "pending" | "resolving" | "resolved" | "cancelled";
  timingWindowId: TimingWindowId;
  generation: number;
  controllerId: PlayerId;
  source: CardRef;
  sourceSnapshot: CardSnapshot;
  triggerEventId?: EngineEventId;
  effectBlockId: EffectId;
  orderingGroup: "turnPlayer" | "nonTurnPlayer";
  createdAtEventSeq: number;
  queuedAtStateSeq: StateSeq;
  sourcePresencePolicy: SourcePresencePolicy;
  causedBy: CausalityRef;
}
```

### 04-effect-runtime.s009 (Queue ordering)

Every trigger collection creates or joins a timing window. Queue order is deterministic and must not depend on JavaScript array discovery order except where the spec explicitly says discovery order is the canonical tie-breaker.

Normative ordering algorithm:

```text
1. Assign every collected trigger a timingWindowId.
2. Assign generation = 0 for effects triggered by the original timing event.
3. When resolving an effect produces new triggers, enqueue them with generation = currentGeneration + 1 in the same timing window unless a new official timing window has opened.
4. Resolve older timing windows before newer timing windows.
5. Within a timing window, resolve lower generation before higher generation.
6. Within a generation, resolve turn-player bucket before non-turn-player bucket.
7. Within a player's bucket, if more than one effect is pending, create chooseTriggerOrder for that player.
8. If no choice is required, use stable tie-breakers: createdAtEventSeq, then source instance id, then effect id.
```

Consequences:

- If turn player effect A and non-turn player effect B are pending, and A creates turn player effect C while resolving, B resolves before C.
- Effects triggered during damage processing wait until all damage points are complete, except `[Trigger]` resolution itself.
- Effects triggered during an effect or card activation wait until the triggering process completes.
- Optional triggered effects create `chooseOptionalActivation` decisions at the point they would enter or begin resolution, according to the card's timing rule.

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

### 03-game-state-events-decisions.s022 (Internal state sequencing)

```ts
type StateSeq = number & { __brand: "StateSeq" };

interface TurnState {
  globalTurn: number;
  playerTurnCounts: Record<PlayerId, number>;
  turnPlayerId: PlayerId;
  phase: "refresh" | "draw" | "don" | "main" | "end";
  step?: BattleStep;
}
```

Increment `state.seq` after every accepted action or resolved decision, not after every internal event. Internal events have their own sequence inside the event journal.

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

### 15-implementation-kickoff.s012 (Guardrails)

- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code.
- The client must not import `engine-core` once hidden state exists; use `view-engine`.
- The card-data package may call Poneglyph, but effect resolution must consume resolved manifests, not live HTTP calls.
- Unsupported cards must fail closed outside dev sandbox.

### 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)

Boundary enforcement is mechanical: `@optcg/engine-core` cannot import React, browser code, WebSocket transport, Redis, Postgres, or live HTTP clients.

### 15-implementation-kickoff.s012 (Guardrails)

Kickoff guardrails require the engine to stay free of Redis, Postgres, WebSocket, React, and Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution consumes resolved manifests rather than live HTTP calls.

## Story Boundary

Own only deterministic ordering for ENG-010E groups that do not require player choice. Stop before queue processing, trigger detection, source-presence checks, pending decision creation, legal-action gating, or integration into phase, play-card, or battle paths.

## Scope

- add named exports for ordering ENG-010E no-choice groups
- order by normalized timing-window rank, generation, turn-player before non-turn-player bucket, created event sequence, source instance id, and effect id as required by `04-effect-runtime.s009`
- return a deterministic fail-closed result when a choice-required group is passed to no-choice ordering
- preserve input queue arrays, groups, and entries without mutation
- keep helpers independent from `GameState` mutation, event creation, pending decision creation, rule processing, legal-action projection, and effect execution

## Out of Scope

- validating raw queue entries or timing-window rank data beyond consuming ENG-010A/ENG-010E results
- creating `chooseTriggerOrder` or other pending decisions
- processing or executing queued effects
- integrating with phases, battle, play-card, actions, replay, CLI, server, client, database, Redis, WebSocket, React, live HTTP, or Poneglyph code

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/src/effect-queue-ordering.ts
- packages/engine-core/src/effect-queue-ordering.test.ts

## Constraints

- do not introduce `any`, routine non-null assertions, `@ts-ignore`, or `@ts-nocheck`
- do not export helper APIs from package entrypoints unless an existing production caller needs them
- keep engine-core deterministic and pure
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

## Required Tests

- unit test covering timing-window rank ordering for no-choice groups
- unit test covering generation ordering
- unit test covering turn-player before non-turn-player bucket ordering
- unit test covering created event sequence, source instance id, and effect id tie-breakers
- unit test proving choice-required groups fail closed instead of being tie-break ordered
- unit test proving input queue entries and groups are not mutated or reordered in place
- `corepack pnpm --filter @optcg/engine-core typecheck` must pass
- `corepack pnpm run verify` must pass

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- lower timing-window rank sorts before higher timing-window rank for no-choice groups
- lower generation sorts before higher generation within the same timing window
- turn-player bucket sorts before non-turn-player bucket within the same generation
- created event sequence sorts before source instance id, then effect id tie-breakers for no-choice entries
- choice-required groups return deterministic fail-closed output rather than being tie-break ordered
- ordering is deterministic for identical validated and grouped input across repeated runs
- input queues, groups, and entries are not mutated
- engine-core boundary remains pure and package entrypoints are unchanged

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
