<!-- agent-packet:story-id ENG-002A -->
<!-- agent-packet:story-path stories/approved/ENG-002A-engine-invariant-utilities.yaml -->
<!-- agent-packet:story-sha256 aeb268a528ff16f6ae592be6f6d2ced64d4622d589d383189d48964e0af7bbe1 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-002A
Epic ID: M1-001
Title: Add engine invariant utilities
Type: implementation
Area: engine
Primary Concern: rules

## Why

Add pure invariant utilities for authoritative `GameState` values so later setup, action application, decision resume, and replay tests can fail closed on invalid state structure.

## Authoritative Spec References

- 03-game-state-events-decisions.s002 (Canonical state model)
- 03-game-state-events-decisions.s021 (Invariant hooks)
- 03-game-state-events-decisions.s023 (Error handling inside the engine)
- 11-testing-quality.s008 (Invariant tests)
- 18-acceptance-tests.s009 (Global invariants)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

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

### 03-game-state-events-decisions.s021 (Invariant hooks)

Run invariants after every accepted action and after every effect resolution in tests/dev.

Required invariants:

```ts
assertAllCardsInExactlyOneLocation(state);
assertNoDuplicateInstanceIds(state);
assertZoneOwnershipIsValid(state);
assertAttachedDonExistsAndBelongsToController(state);
assertCharacterAreaSizeAtMostFive(state);
assertStageAreaSizeAtMostOne(state);
assertLeaderAreaExactlyOne(state);
assertNoNegativeZoneCounts(state);
assertPendingDecisionHasLegalResponses(state);
assertEffectQueueEntriesHaveValidSourcesOrPolicies(state);
assertHiddenInfoNotPresentInPlayerViews(state);
```

### 03-game-state-events-decisions.s023 (Error handling inside the engine)

Engine errors are classified.

```ts
type EngineError =
  | { type: "illegalAction"; reason: string }
  | { type: "invalidDecisionResponse"; reason: string }
  | { type: "invariantViolation"; invariant: string; details: unknown }
  | { type: "unsupportedCard"; cardId: CardId; status: CardSupportStatus }
  | { type: "effectRuntimeError"; effectId: string; details: unknown }
  | { type: "loopDetected"; signature: LoopSignature };
```

Illegal player actions are rejected and logged. Invariant violations and effect runtime errors freeze or recover the match according to the recovery policy.

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

### 18-acceptance-tests.s009 (Global invariants)

Run these after every accepted action and every decision resume:

```text
G-001 every card instance is in exactly one zone or attached to exactly one legal host
G-002 no duplicate instance IDs exist
G-003 each player has at most five Characters
G-004 each player has at most one Stage
G-005 each player has exactly one Leader
G-006 attached DON!! belongs to same player as host unless a future ruling says otherwise
G-007 public zones contain public card IDs in PlayerView
G-008 hidden zones are represented by counts only in opponent PlayerView
G-009 RNG state never appears in any client view
G-010 effect queue internals never appear in any client view
G-011 canonical state serializes and hashes deterministically
G-012 continuous effects are recomputed without growing duplicate modifiers
```

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

Own only invariant helper APIs and package-local invariant tests inside engine-core. Do not implement setup, action application, phase progression, hidden-information filtering, or replay execution.

## Scope

- add an exported invariant assertion helper for `GameState`
- add a non-throwing invariant collection helper that returns named violations
- check that every card instance appears in exactly one zone or as attached DON!! to exactly one legal host
- check that attached DON!! belongs to the same player as its host
- check that player zone ownership, controller, life wrapping, and turn player references are internally consistent
- check that canonical state-shaped values can be serialized and hashed by the existing hash primitive

## Out of Scope

- creating initial game state
- applying player actions
- legal action generation
- event journal generation
- hidden-information view filtering
- replay file format or replay execution

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/**
- tests/engine/**

## Constraints

- do not approve this story until ENG-001A, ENG-001C, and TYP-001G are done
- engine-core behavior must remain deterministic and pure
- no hidden-information filtering behavior may be added in this story
- must pass `corepack pnpm run verify`
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

## Required Tests

- unit test for a valid minimal state fixture
- unit test for duplicate zone placement
- unit test for invalid attached DON!! ownership or missing attached instance
- unit test for invalid turn player reference
- unit test proving invariant checks do not mutate input state

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- valid minimal `GameState` fixtures pass invariant checks
- duplicate card-instance placement fails with a stable invariant name
- unattached DON!! referenced from a host fails with a stable invariant name
- attached DON!! controlled by a different player than its host fails with a stable invariant name
- missing turn player and malformed player references fail closed

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
