<!-- agent-packet:story-id TYP-001G -->
<!-- agent-packet:story-path stories/approved/TYP-001G-game-state-engine-result-and-hash-contracts.yaml -->
<!-- agent-packet:story-sha256 0e24942022307fc558bff7e325abb4f04654a00c62d65519b948baa723ecf08d -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: TYP-001G
Epic ID: M1-001
Title: Add GameState, engine result, error, hash, and handler contracts
Type: implementation
Area: contracts
Primary Concern: contract

## Why

Add the canonical top-level GameState, engine result, error, hash input, and custom handler contracts after all referenced support, event, decision, action, and runtime contracts exist.

## Authoritative Spec References

- 03-game-state-events-decisions.s002 (Canonical state model)
- 03-game-state-events-decisions.s004 (Engine result)
- 03-game-state-events-decisions.s007 (Atomic mutation contract)
- 03-game-state-events-decisions.s020 (State hashing)
- 03-game-state-events-decisions.s023 (Error handling inside the engine)
- 04-effect-runtime.s018 (Custom handlers)
- 16-typescript-interface-draft.s005 (Game state)
- 16-typescript-interface-draft.s009 (Engine result)
- 16-typescript-interface-draft.s010 (Hashing rules)
- 22-v6-implementation-tightening.s006 (2. TypeScript model)

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

### 03-game-state-events-decisions.s004 (Engine result)

Every engine call returns a result object rather than only the new state.

```ts
interface EngineResult {
  state: GameState;
  events: EngineEvent[];
  decisions?: PendingDecision[];
  errors?: EngineError[];
  stateHash: string;
}
```

For normal play there should be at most one active `pendingDecision` at a time. Tests may use arrays to inspect internal generated decisions.

### 03-game-state-events-decisions.s007 (Atomic mutation contract)

Every primitive state mutation uses the same return shape.

```ts
interface EngineStepResult {
  state: GameState;
  events: EngineEvent[];
}

type AtomicMutation = (state: GameState) => EngineStepResult;
```

The engine should not mutate state in place in production logic. Dev/test may use deep-freeze to catch accidental mutation.

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

### 04-effect-runtime.s018 (Custom handlers)

Custom handlers are an escape hatch, not a shortcut.

Use a custom handler when:

- The effect needs state tracking not represented by DSL primitives.
- The effect modifies core rules.
- The effect has complex nested choices that would make the DSL unreadable.
- A new DSL primitive would be premature for a one-off effect.

Handlers must be pure, immutable, deterministic, and test-covered.

```ts
interface CustomHandler {
  id: string;
  cardId: CardId;
  effectId: string;
  execute(state: GameState, context: EffectContext): EngineResult;
}
```

If several handlers repeat the same logic, promote that behavior into a DSL primitive.

### 16-typescript-interface-draft.s005 (Game state)

```ts
export interface GameState {
  matchId: MatchId;
  seq: number;
  actionSeq: number;
  rulesVersion: string;
  engineVersion: string;
  cardManifest: MatchCardManifest;
  rng: RngState;
  players: Record<PlayerId, PlayerState>;
  timers: TimerState;
  turn: TurnState;
  battle?: BattleState;
  pendingDecision?: PendingDecision;
  effectQueue: EffectQueueEntry[];
  continuousEffects: ContinuousEffect[];
  eventJournal: EngineEvent[];
  winner?: PlayerId | "draw";
  status: "setup" | "active" | "frozen" | "completed" | "errored";
}

export interface PlayerState {
  playerId: PlayerId;
  deck: CardInstance[];
  donDeck: CardInstance[];
  hand: CardInstance[];
  trash: CardInstance[];
  leader: CardInstance;
  characters: CardInstance[];
  stage?: CardInstance;
  costArea: CardInstance[];
  attachedCards: CardInstance[];
  life: LifeCard[];
  hasMulliganed: boolean;
  turnCount: number;
}

export interface CardInstance {
  instanceId: InstanceId;
  cardId: CardId;
  owner: PlayerId;
  controller: PlayerId;
  zone: ZoneRef;
  state?: "active" | "rested";
  attachedDon?: InstanceId[];
  turnPlayed?: number;
  oncePerTurnUsed?: Record<EffectId, number>;
}

export interface LifeCard {
  card: CardInstance;
  faceUp: boolean;
}
```

### 16-typescript-interface-draft.s009 (Engine result)

```ts
export interface EngineResult {
  state: GameState;
  events: EngineEvent[];
  publicEvents: PublicEffectEvent[];
  pendingDecision?: PendingDecision;
  stateHash: string;
}
```

### 16-typescript-interface-draft.s010 (Hashing rules)

State hash input includes canonical `GameState` only:

- Include hidden zones server-side.
- Include RNG state.
- Include pending decision.
- Include effect queue.
- Include card manifest versions.
- Sort object keys.
- Preserve array order.
- Exclude UI-only data, WebSocket connection state, timestamps that do not affect gameplay, and logs not part of canonical state.

### 22-v6-implementation-tightening.s006 (2. TypeScript model)

The old `16-typescript-interface-draft.md` was a draft and referenced undefined symbols. The implementation contract is now `contracts/canonical-types.ts`.

Resolved and normalized items include:

- `Color` -> `CardColor`
- `Attribute`
- `ZoneRef`
- `MatchCardManifest`
- `RngState`
- `EffectQueueEntry`
- `ContinuousEffect`
- `EventVisibility`
- `CardRef`
- `DecisionResponse`
- `Cost`
- `PaymentOption`
- `TargetRequest`
- `CardSelectionRequest`
- `EffectOption`
- `PublicEffectEvent` replacement via filtered `EngineEvent[]`
- `eventLog`/`eventJournal` conflict resolved to `eventJournal`
- `activeBattle`/`battle` conflict resolved to `battle`
- serializable arrays instead of `Set`

The contract compiles with:

```bash
cd contracts
tsc -p tsconfig.json
```

## Story Boundary

Own only top-level canonical state, engine result, step result, atomic mutation, engine error, custom handler, and state-hash input type exports. Do not implement hashing, mutation, event emission, replay reconstruction, filtering, public view DTOs, or engine-core behavior.

## Scope

- export canonical `GameState`, `EngineStepResult`, `EngineResult`, `EngineError`, `StateHashInput`, `AtomicMutation`, and `CustomHandler` contracts
- ensure `GameState` composes only type families delivered by TYP-001A through TYP-001F
- ensure canonical v6 `EngineResult` exposes `events: EngineEvent[]` only, does not add `publicEvents`, and does not reintroduce stale `PublicEffectEvent` contracts
- add package-local type tests compiling representative minimal `GameState`, `EngineStepResult`, `EngineResult`, `EngineError`, `StateHashInput`, and `CustomHandler` fixtures

## Out of Scope

- hash computation
- event journal mutation logic
- replay serialization or reconstruction
- replay validation or reconstruction behavior
- public/player/spectator view DTOs
- filtering or public-view projection contracts
- engine-core package creation
- CLI runner behavior
- custom handler execution behavior
- package export cohesion or exhaustive export manifests

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/types/src/**

## Constraints

- canonical state is server-only and may include hidden information
- do not implement hashing, mutation, filtering, or engine behavior in this contract story
- must pass `corepack pnpm run verify`

## Required Tests

- package type test compiling a minimal canonical `GameState` fixture
- package type test proving hidden-zone fields are represented in canonical state
- package type test compiling representative `EngineStepResult`, `EngineResult`, `EngineError`, `StateHashInput`, and `CustomHandler` fixtures
- package negative type test proving `EngineResult` rejects stale `publicEvents: PublicEffectEvent[]`
- package negative type tests proving `PublicEffectEvent`, player/spectator/public view DTOs, filtering DTOs, and replay DTOs are not exported
- package compile test proving no replay reconstruction, filtering, hashing, mutation, or custom-handler execution behavior is added
- update prior TYP-001F negative export guard so G-owned exports are now allowed while public DTO/export negatives remain

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- `GameState` includes hidden zones, RNG state, internal queues, audit metadata, decisions, and match status fields through canonical support types
- engine result contracts expose deterministic result metadata without implementing behavior
- public view DTOs are not mixed into canonical state or result contracts
- G-owned exports match `contracts/canonical-types.ts` exactly for `GameState`, `EngineStepResult`, `EngineResult`, `EngineError`, `StateHashInput`, `AtomicMutation`, and `CustomHandler`

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
