<!-- agent-packet:story-id ENG-001B -->
<!-- agent-packet:story-path stories/approved/ENG-001B-deterministic-rng-wrapper.yaml -->
<!-- agent-packet:story-sha256 46a34968cd86c0d4551a7d0cd76a1c59b9c58058bbcc98a3321c50a3c9872d2b -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-001B
Epic ID: M1-001
Title: Add deterministic RNG wrapper primitive
Type: implementation
Area: engine
Primary Concern: rules

## Why

Add the deterministic RNG wrapper primitive needed before setup, shuffling, mulligan, and state hashing stories can produce replayable results.

## Authoritative Spec References

- 03-game-state-events-decisions.s002 (Canonical state model)
- 03-game-state-events-decisions.s019 (Deterministic RNG)
- 03-game-state-events-decisions.s020 (State hashing)
- 12-roadmap.s015 (Immediate next tasks)
- 15-implementation-kickoff.s006 (Step 2 - `@optcg/engine-core`)
- 15-implementation-kickoff.s011 (Definition of done for kickoff)
- 15-implementation-kickoff.s012 (Guardrails)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)

## Relevant Spec Excerpts

### 03-game-state-events-decisions.s002 (Canonical state model)

The canonical `GameState` is server-only. It includes hidden information, RNG state, internal queues, snapshots, and metadata.

**v6 contract:** the compile-ready version of every interface in this document is [`contracts/canonical-types.ts`](contracts/canonical-types.ts). Markdown snippets below are explanatory and may be abbreviated. If a snippet conflicts with the contract file, the contract file wins.

Canonical naming decisions:

| Concept                | Canonical name             |
| ---------------------- | -------------------------- |
| State sequence         | `stateSeq`                 |
| Event collection       | `eventJournal`             |
| Battle sub-state       | `battle`                   |
| Effect queue           | `effectQueue`              |
| Continuous modifiers   | `continuousEffects`        |
| Decision answer action | `Action.respondToDecision` |
| Hidden/server-only RNG | `rng`                      |

Do not use `eventLog`, `activeBattle`, raw JavaScript `Set`, or transport envelopes inside canonical state. Serializable arrays are required for deterministic hashing.

```ts
type PlayerId = string & { __brand: "PlayerId" };
type CardId = string & { __brand: "CardId" };
type InstanceId = string & { __brand: "InstanceId" };
type MatchId = string & { __brand: "MatchId" };
type EngineEventId = string & { __brand: "EngineEventId" };

interface GameState {
  matchId: MatchId;
  status: MatchStatus;
  version: RuntimeVersionSet;
  seq: StateSeq;
  actionSeq: number;
  turn: TurnState;
  players: Record<PlayerId, PlayerState>;
  timers: TimerState;
  battle?: BattleState;
  pendingDecision?: PendingDecision;
  effectQueue: EffectQueueEntry[];
  deferredTriggers: DeferredTriggerBucket[];
  continuousEffects: ContinuousEffectRecord[];
  replacementState: ReplacementProcessState[];
  revealedCards: RevealRecord[];
  rng: RngState;
  eventJournal: EngineEvent[];
  audit: AuditEntry[];
}
```

Canonical live state also carries the authoritative per-player timer snapshot used for `PlayerView` and reconnect/state-sync payloads. Do not fabricate timer values in filtered views.

The browser does not receive this object.

### 03-game-state-events-decisions.s019 (Deterministic RNG)

The engine must never use `Math.random()`.

```ts
interface RngState {
  algorithm: "pcg32" | "xoshiro256ss" | "test-fixed";
  seedCommitment?: string;
  internalState: string;
  callCount: number;
}

interface RngDrawResult<T> {
  value: T;
  nextRng: RngState;
  event: EngineEvent;
}
```

All shuffle operations emit an event without exposing the resulting order to players.

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

### 12-roadmap.s015 (Immediate next tasks)

1. Create `@optcg/types` skeleton.
2. Define `GameState`, `PlayerView`, `Action`, `EngineEvent`, `PendingDecision` types.
3. Write invariant utilities.
4. Implement deterministic RNG wrapper.
5. Implement setup and vanilla turn flow.
6. Create CLI runner.
7. Add first golden replay test.

### 15-implementation-kickoff.s006 (Step 2 - `@optcg/engine-core`)

Implement the pure deterministic engine.

Initial exports:

```ts
createInitialState(input): GameState
getLegalActions(state, playerId): LegalAction[]
applyAction(state, action): EngineResult
resumeDecision(state, response): EngineResult
computeView(state): ComputedGameView
filterStateForPlayer(state, playerId): PlayerView
hashGameState(state): string
```

### 15-implementation-kickoff.s011 (Definition of done for kickoff)

- `pnpm test` passes.
- A CLI vanilla match can end by damage, deck-out, or concession.
- Every accepted action increments `stateSeq`.
- Every atomic mutation emits at least one `EngineEvent` or has an explicit no-event reason.
- `hashGameState()` is stable across repeated runs with the same seed.
- `filterStateForPlayer()` never leaks opponent hand, deck order, face-down life, RNG, or effect queue internals.

### 15-implementation-kickoff.s012 (Guardrails)

- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code.
- The client must not import `engine-core` once hidden state exists; use `view-engine`.
- The card-data package may call Poneglyph, but effect resolution must consume resolved manifests, not live HTTP calls.
- Unsupported cards must fail closed outside dev sandbox.

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

Own only deterministic RNG state and draw/advance helpers inside engine-core. Do not implement deck setup, shuffling policy, GameState creation, action application, or replay serialization.

## Scope

- add engine-core helpers that consume and return `RngState` from `@optcg/types`; do not redefine the shared contract
- add deterministic RNG initialization from an explicit seed
- add pure advance helpers that return next RNG state plus generated value
- add or update engine-core package metadata as needed to depend on `@optcg/types`
- add tests proving repeated runs with the same seed produce the same sequence

## Out of Scope

- deck shuffling
- GameState creation
- state hash computation
- event emission and `RngDrawResult` event construction
- CLI command behavior

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/**
- pnpm-lock.yaml
- tests/engine/**

## Constraints

- do not approve this story until ENG-001A is done
- engine-core behavior must remain deterministic
- no hidden global randomness is allowed
- must pass `corepack pnpm run verify`
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

## Required Tests

- unit test proving same seed produces same sequence
- unit test proving different seeds produce different early sequences
- unit test proving helpers do not mutate the input RNG state
- unit test proving initialized and advanced RNG state is JSON-serializable
- unit test proving `callCount` initializes at 0 and increments once per advance

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- RNG helpers are pure and deterministic for a given seed
- RNG state values conform to `@optcg/types` `RngState` and remain JSON-serializable
- initialized RNG state starts at `callCount: 0`
- each advance increments `callCount` exactly once
- no global `Math.random` or hidden runtime randomness is introduced

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
