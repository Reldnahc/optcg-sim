<!-- agent-packet:story-id ENG-002B -->
<!-- agent-packet:story-path stories/approved/ENG-002B-deterministic-initial-state-setup.yaml -->
<!-- agent-packet:story-sha256 ca2ffb4688331c71e2ba170c4fde38966b6c597eaf4d3ede515b26534ff0fe63 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-002B
Epic ID: M1-001
Title: Add deterministic pre-mulligan initial game setup
Type: implementation
Area: engine
Primary Concern: rules

## Why

Add `createInitialState` for vanilla Milestone 1 setup fixtures, producing a deterministic authoritative pre-mulligan `GameState` from explicit player loadouts, deck lists, first-player choice, and RNG seed.

## Authoritative Spec References

- 02-engine-mechanics.s008 (Setup sequence)
- 02-engine-mechanics.s009 (Canonical Life orientation)
- 02-engine-mechanics.s037 (First-turn restrictions)
- 03-game-state-events-decisions.s002 (Canonical state model)
- 03-game-state-events-decisions.s019 (Deterministic RNG)
- 12-roadmap.s005 (Milestone 1: terminal engine)
- 15-implementation-kickoff.s006 (Step 2 - `@optcg/engine-core`)
- 18-acceptance-tests.s003 (Milestone 1 - terminal engine)
- 22-v6-implementation-tightening.s008 (4. Life orientation)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

### 02-engine-mechanics.s008 (Setup sequence)

Use a deterministic setup flow:

```text
1. Validate decks, card support, format, banlist.
2. Determine first/second player.
3. Build initial full GameState.
4. Resolve start-of-game effects that modify setup.
5. Shuffle decks using recorded RNG.
6. Draw opening hands.
7. Handle official mulligan decisions: each player may once either keep or return all 5 to deck, reshuffle, and redraw 5, in first-player-then-second-player order.
8. Place Life from the top of deck equal to Leader life using the canonical orientation algorithm below.
9. Start first player's Refresh Phase.
```

Start-of-game effects that alter decks must happen before final shuffle and opening draw.

### 02-engine-mechanics.s009 (Canonical Life orientation)

Canonical state convention:

```text
player.deck[0] = top of deck
player.life[0] = top of Life area = next Life card taken for damage
```

Life setup must satisfy the official rule that the card that was on top of the deck becomes the bottom card of the Life area.

Implementation algorithm:

```ts
function setupLifeFromDeck(
  player: PlayerState,
  lifeCount: number,
): PlayerState {
  const takenInDeckOrder = player.deck.slice(0, lifeCount); // [A, B, C], A was top of deck
  const remainingDeck = player.deck.slice(lifeCount);
  const lifeTopFirst = [...takenInDeckOrder]
    .reverse()
    .map((card) => ({ card, faceUp: false }));
  return { ...player, deck: remainingDeck, life: lifeTopFirst };
}
```

Damage always takes `player.life[0]`. Effects that add cards to Life must specify `position: "top" | "bottom"`; if a card text does not specify, use the official ruling for that card and add a card-specific test.

### 02-engine-mechanics.s037 (First-turn restrictions)

The engine must track first/second player and each player's first turn.

| Player / turn                   |    Draw Phase |                DON!! Phase |        Attack |
| ------------------------------- | ------------: | -------------------------: | ------------: |
| Player going first, first turn  |       No draw |         Place only 1 DON!! | Cannot attack |
| Player going second, first turn | Draw normally | Place 2 DON!! if available | Cannot attack |

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

### 12-roadmap.s005 (Milestone 1: terminal engine)

Deliverables:

- `GameState` model.
- Setup, draw, DON!!, main, end phases.
- Play Character/Stage/Event skeleton.
- Attack/battle/damage with vanilla cards.
- Event journal.
- State hash.
- CLI runner.

Exit criteria:

- Two sample decks can finish a vanilla match in CLI.
- Golden replay can reconstruct final hash.
- Invariant tests pass after every action.

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

### 18-acceptance-tests.s003 (Milestone 1 - terminal engine)

```text
M1-001 setup creates legal starting state
M1-002 opening hand draw uses deterministic deck order
M1-003 official mulligan flow supports keep or redraw-five once per player in first-player-then-second-player order
M1-004 first player skips first draw
M1-005 first player gains only one DON!! on first turn
M1-006 second player cannot attack on their first turn
M1-007 active DON!! can be attached during Main Phase
M1-008 attached DON!! returns rested during Refresh Phase
M1-009 vanilla leader damage moves life to hand
M1-010 leader taking damage at 0 life loses at rule processing
M1-011 attacking rested character can K.O. it
M1-012 character played this turn cannot attack without Rush
M1-013 deck-out loses at rule-processing checkpoint
M1-014 concession immediately ends match and cannot be replaced
M1-015 state hash is stable for same seed and action log
M1-016 PlayerView hides opponent hand and deck order
M1-017 life setup orientation makes original deck top card bottom Life card
M1-018 attached DON!! has attached state and no active/rested state while attached
M1-019 start-of-main-phase trigger window resolves before Main Phase action priority
```

### 22-v6-implementation-tightening.s008 (4. Life orientation)

Canonical state convention:

```text
player.life[0] = top Life card = next Life card taken for damage.
```

Setup algorithm:

1. Take `leader.life` cards from the top of deck in deck order.
2. Let that draw-order list be `[A, B, C, ...]`, where `A` was originally top of deck.
3. Store Life as `reverse([A, B, C, ...])`.
4. This makes the original top-deck card the bottom Life card.

Damage algorithm:

```text
take player.life[0]
remove it from life
process trigger/hand/trash path
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

Own only deterministic pre-mulligan initial-state construction and setup tests inside engine-core. Do not implement official mulligan decisions, action application, phase progression after setup, legal actions, CLI output, or live view filtering.

## Scope

- add an exported `createInitialState` engine-core API for pre-mulligan setup state
- accept explicit match id, player ids, first player id, deck order, DON!! deck order, leader card ids, and RNG seed
- instantiate unique card instances with deterministic instance ids for the fixture input
- shuffle only through the deterministic RNG helper when shuffle is requested by input
- draw opening hands and create life in the orientation required by the spec before official mulligan decisions are applied
- initialize turn, timers, effect queues, reveal records, event journal, audit, and status fields to canonical empty values
- run the ENG-002A invariant helper before returning the state
- document the returned state as pre-mulligan setup output that is not yet a full legal post-mulligan game start

## Out of Scope

- official mulligan decision flow and post-mulligan redraw/keep resolution
- start-of-game card effects
- deck construction legality validation
- Poneglyph card data resolution
- action application and legal action generation
- player or spectator view filtering

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/**
- tests/engine/**

## Constraints

- do not approve this story until ENG-002A is done
- setup must be deterministic and must not call `Math.random`
- generated instance ids must be stable for the same input
- no hidden-information view filtering behavior may be added in this story
- must pass `corepack pnpm run verify`
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

## Required Tests

- unit test proving repeated pre-mulligan setup with same input and seed produces the same hash
- unit test proving different explicit deck order changes the resulting state hash
- unit test proving opening hands and remaining deck order match the deterministic setup policy
- unit test proving life orientation matches `02-engine-mechanics.s009` and `22-v6-implementation-tightening.s008`
- unit test proving setup state passes ENG-002A invariants
- unit test or type-level assertion proving this helper returns the documented pre-mulligan setup status

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- the same pre-mulligan setup input and seed produce the same `GameState` and state hash
- opening hand draw uses deterministic deck order after any requested deterministic shuffle
- life setup preserves the required top/bottom orientation for damage processing
- first-player and per-player turn counters are initialized consistently
- setup output passes engine invariant checks
- callers cannot confuse this story's output with completed official mulligan flow

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
