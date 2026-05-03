<!-- agent-packet:story-id TYP-001C -->
<!-- agent-packet:story-path stories/approved/TYP-001C-engine-event-causality-and-error-contracts.yaml -->
<!-- agent-packet:story-sha256 7f2243004ebeff553df293bc97ace4e93ca3fa3338360106f0a56b18a252c8db -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: TYP-001C
Epic ID: M1-001
Title: Add engine event, causality, and visibility contracts
Type: implementation
Area: contracts
Primary Concern: contract

## Why

Add the canonical event journal support contracts that later decisions, runtime state, engine results, replay, and filtering stories depend on.

## Authoritative Spec References

- 03-game-state-events-decisions.s005 (Event journal)
- 03-game-state-events-decisions.s006 (Event visibility)
- 03-game-state-events-decisions.s008 (Causality)
- 03-game-state-events-decisions.s018 (Canonical event visibility)
- 16-typescript-interface-draft.s007 (Engine events)
- 22-v6-implementation-tightening.s006 (2. TypeScript model)

## Relevant Spec Excerpts

### 03-game-state-events-decisions.s005 (Event journal)

Every atomic mutation emits events. Trigger detection consumes events, not actions.

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

### 03-game-state-events-decisions.s006 (Event visibility)

Events may contain hidden data. Filter them before sending to clients.

```ts
type EventVisibility =
  | { type: "public" }
  | { type: "private"; playerId: PlayerId }
  | { type: "hidden" }
  | { type: "replayOnly" };
```

### 03-game-state-events-decisions.s008 (Causality)

Use causality references to make replays and debugging readable.

```ts
type CausalityRef =
  | { type: "playerAction"; actionId: string }
  | { type: "effect"; queueEntryId: string; effectId: string }
  | { type: "ruleProcess"; name: string }
  | { type: "replacement"; replacementId: string }
  | { type: "decision"; decisionId: string };
```

### 03-game-state-events-decisions.s018 (Canonical event visibility)

Each `EngineEvent` has one visibility policy:

```text
public          safe for both players immediately
private         visible only to listed player IDs
replayOnly      hidden during live play but available in completed full replay
serverOnly      never leaves trusted server/runtime logs
```

Visibility is independent of replay determinism. Replay artifacts may store information that was never sent to either player during the live match.

### 16-typescript-interface-draft.s007 (Engine events)

```ts
export interface EngineEvent {
  id: string;
  stateSeq: number;
  type:
    | "cardMoved"
    | "cardPlayed"
    | "cardKOd"
    | "attackDeclared"
    | "blockerActivated"
    | "counterUsed"
    | "damageDealt"
    | "lifeCardRevealed"
    | "donAttached"
    | "cardDrawn"
    | "effectQueued"
    | "effectResolved"
    | "phaseStarted"
    | "phaseEnded"
    | "ruleProcessing";
  actor?: PlayerId;
  source?: CardRef;
  payload: unknown;
  causedBy?: string;
  visibility: EventVisibility;
}
```

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

Own only event, causality, and visibility type exports. Do not add GameState, pending decisions, actions, effect queues, engine errors, engine results, hashing, replay behavior, or filtering behavior.

## Scope

- export canonical `EventVisibility`, `EngineEvent`, `EngineEventType`, and `CausalityRef` contracts
- ensure events are serializable and can carry visibility metadata without embedding filtered view DTOs
- add package-local type tests for representative public and private event shapes

## Out of Scope

- `GameState`, `EngineResult`, `EngineStepResult`, `StateHashInput`, or `AtomicMutation`
- `EngineError` or result error contracts
- pending decision or action unions
- effect queue or continuous effect records
- replay reconstruction or event emission behavior
- player or spectator view DTOs

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/types/src/**

## Constraints

- do not implement event emission, filtering, replay, hashing, or mutation behavior
- keep event contracts serializable and deterministic-friendly
- must pass `corepack pnpm run verify`

## Required Tests

- package type test compiling a representative `EngineEvent`
- package type test compiling all canonical `EventVisibility` variants: `public`, `private`, `hidden`, `replayOnly`, and `serverOnly`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- event visibility and causality contracts are available to later engine and filtering stories
- event contracts are pure data and do not import client, server, or replay packages
- event contracts do not reference not-yet-owned GameState, decision, or result contracts

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
