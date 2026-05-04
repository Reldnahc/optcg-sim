<!-- agent-packet:story-id ENG-002D -->
<!-- agent-packet:story-path stories/approved/ENG-002D-vanilla-phase-progression.yaml -->
<!-- agent-packet:story-sha256 2289eb6439906d710c1b1e06b8c78e1c675e531d40cdc9de21718b806413c656 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-002D
Epic ID: M1-001
Title: Add vanilla phase progression primitives
Type: implementation
Area: engine
Primary Concern: rules

## Why

Add deterministic phase progression helpers for the Milestone 1 vanilla turn loop, covering refresh, draw, DON!!, main entry, and end-phase turn handoff without implementing attack, battle, damage, or card effects.

## Authoritative Spec References

- 02-engine-mechanics.s011 (Refresh Phase)
- 02-engine-mechanics.s012 (Draw Phase)
- 02-engine-mechanics.s013 (DON!! Phase)
- 02-engine-mechanics.s014 (Main Phase)
- 02-engine-mechanics.s015 (End Phase)
- 02-engine-mechanics.s036 (DON!! card mechanics)
- 02-engine-mechanics.s037 (First-turn restrictions)
- 03-game-state-events-decisions.s004 (Engine result)
- 03-game-state-events-decisions.s005 (Event journal)
- 03-game-state-events-decisions.s022 (Internal state sequencing)
- 18-acceptance-tests.s003 (Milestone 1 - terminal engine)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

### 02-engine-mechanics.s011 (Refresh Phase)

1. Expire effects that end at the start of this player's turn.
2. Queue/resolve start-of-turn triggers.
3. Return attached DON!! to cost area rested.
4. Set the turn player's Leader, Characters, Stage, and Cost Area cards active.

### 02-engine-mechanics.s012 (Draw Phase)

1. Turn player draws one card.
2. First player skips this draw on their first turn.

### 02-engine-mechanics.s013 (DON!! Phase)

1. Place two DON!! from DON!! Deck into cost area active.
2. First player places only one on their first turn.
3. If fewer DON!! remain, place as many as possible.

### 02-engine-mechanics.s014 (Main Phase)

Before the turn player receives action priority, emit `phaseStarted(main)`, collect `[Start of Main Phase]` triggers, and resolve required automatic effects. If any pending decision is created, Main Phase action priority does not begin until that decision and the resulting queue are complete.

Turn player may repeatedly:

- Play a Character, Stage, or `[Main]` Event from hand.
- Activate `[Activate: Main]` effects.
- Give active DON!! to Leader or Characters.
- Declare an attack, if legal.
- End the phase.

Neither player can attack on their first turn.

### 02-engine-mechanics.s015 (End Phase)

1. Resolve `[End of Your Turn]` triggers controlled by the turn player.
2. Resolve `[End of Your Opponent's Turn]` triggers controlled by the non-turn player.
3. Expire end-of-turn effects in the correct order.
4. Swap turn player.
5. Proceed to the next Refresh Phase.

### 02-engine-mechanics.s036 (DON!! card mechanics)

- Each DON!! attached to a Leader or Character grants +1000 power during the controller's turn only.
- During Main Phase, a player may give any number of active DON!! from cost area to their Leader or Characters.
- An attached DON!! card has `state: "attached"`; it is neither active nor rested while attached.
- When a card with attached DON!! leaves the field, all attached DON!! return to the owner's cost area rested.
- During Refresh Phase, all attached DON!! return to cost area rested, then the player's Leader, Characters, Stage, and DON!! in cost area become active.
- A `DON!! -X` cost may return the paying player's DON!! from cost area, attached to their Leader, or attached to their Characters unless the card text narrows the source. The paying player chooses the DON!! sources. If there are fewer than X eligible DON!! cards, the cost cannot be paid and the activation is illegal or declined before use is consumed.

### 02-engine-mechanics.s037 (First-turn restrictions)

The engine must track first/second player and each player's first turn.

| Player / turn                   |    Draw Phase |                DON!! Phase |        Attack |
| ------------------------------- | ------------: | -------------------------: | ------------: |
| Player going first, first turn  |       No draw |         Place only 1 DON!! | Cannot attack |
| Player going second, first turn | Draw normally | Place 2 DON!! if available | Cannot attack |

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

Own only automatic phase advancement primitives and their engine-core tests. Do not implement legal action lists, player action application, combat, card-play effects, mulligan, or CLI output.

## Scope

- add exported helpers that advance automatic phases from refresh through main priority and from end to the next player's refresh
- return `EngineResult` values with updated state, emitted events, and state hash
- implement first-player first-turn draw skip
- implement first-player first-turn one-DON!! placement and normal two-DON!! placement otherwise
- return attached DON!! to cost area rested during refresh, then ready the turn player's readyable cards
- increment state sequence after accepted phase-advancement operations according to the canonical sequence rule
- run invariants after each accepted phase transition

## Out of Scope

- `getLegalActions`
- `applyAction`
- `resumeDecision`
- official mulligan flow
- attack, battle, damage, blocker, and counter windows
- play-card or activate-effect behavior
- CLI runner behavior

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/**
- tests/engine/**

## Constraints

- do not approve this story until ENG-002C is done
- engine behavior must remain deterministic and pure
- event output must not include transport timestamps or server envelopes
- no combat, card-play, or hidden-information filtering behavior may be added in this story
- must pass `corepack pnpm run verify`
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

## Required Tests

- unit test for first-player first-turn draw skip
- unit test for normal draw on non-skipped draw phase
- unit test for first-player one-DON!! first turn and normal two-DON!! later turns
- unit test for attached DON!! refresh return and readying
- unit test for end-phase turn handoff and sequence/hash changes
- unit test proving invariant checks run after phase transitions

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- first player skips their first draw
- first player places exactly one DON!! on their first DON!! phase
- later DON!! phases place up to two available DON!! cards
- attached DON!! returns rested during refresh before the turn player's cards are readied
- end phase swaps turn player and advances global/player turn counters consistently
- every accepted phase transition emits deterministic events and produces a stable state hash

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
