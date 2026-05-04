<!-- agent-packet:story-id ENG-002E -->
<!-- agent-packet:story-path stories/approved/ENG-002E-legal-action-and-apply-action-skeleton.yaml -->
<!-- agent-packet:story-sha256 1efd6956c775547ab6ef709e2a73501a4f0876e697b0ce9701d93daa042a5250 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-002E
Epic ID: M1-001
Title: Add legal-action and apply-action skeleton
Type: implementation
Area: engine
Primary Concern: rules

## Why

Add the first `getLegalActions` and `applyAction` engine APIs for safe Milestone 1 concession, phase control, and simple active-DON!! attachment, with illegal-action rejection and deterministic result hashing.

## Authoritative Spec References

- 02-engine-mechanics.s014 (Main Phase)
- 02-engine-mechanics.s027 (Impossible actions)
- 02-engine-mechanics.s035 (Exact win/loss conditions)
- 02-engine-mechanics.s036 (DON!! card mechanics)
- 03-game-state-events-decisions.s004 (Engine result)
- 03-game-state-events-decisions.s005 (Event journal)
- 03-game-state-events-decisions.s015 (Legal actions)
- 03-game-state-events-decisions.s016 (Action envelope inside the engine)
- 03-game-state-events-decisions.s023 (Error handling inside the engine)
- 18-acceptance-tests.s003 (Milestone 1 - terminal engine)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

### 02-engine-mechanics.s014 (Main Phase)

Before the turn player receives action priority, emit `phaseStarted(main)`, collect `[Start of Main Phase]` triggers, and resolve required automatic effects. If any pending decision is created, Main Phase action priority does not begin until that decision and the resulting queue are complete.

Turn player may repeatedly:

- Play a Character, Stage, or `[Main]` Event from hand.
- Activate `[Activate: Main]` effects.
- Give active DON!! to Leader or Characters.
- Declare an attack, if legal.
- End the phase.

Neither player can attack on their first turn.

### 02-engine-mechanics.s027 (Impossible actions)

If a required part of an effect is impossible, skip that impossible part unless the effect block says it requires all parts. Default policy is do as much as possible.

### 02-engine-mechanics.s035 (Exact win/loss conditions)

Run defeat checks at every rule-processing checkpoint:

1. **Leader damage at 0 Life** - if a player has 0 Life cards and their Leader would take damage, that player loses.
2. **Deck-out** - if a player has 0 cards in deck at any rule-processing checkpoint, that player loses.
3. **Concession** - a player may concede at any time; concession is immediate and cannot be prevented or replaced by card effects.
4. **Effect-based win/loss** - card effects may directly cause a win or loss during effect resolution.
5. **Double loss** - if both players meet defeat conditions at the same rule-processing checkpoint, both lose and the match is a draw.

Rule processing happens after atomic state changes, including mid-effect. For example, if a player decks out while drawing during an effect, the loss is detected at the next rule-processing point.

### 02-engine-mechanics.s036 (DON!! card mechanics)

- Each DON!! attached to a Leader or Character grants +1000 power during the controller's turn only.
- During Main Phase, a player may give any number of active DON!! from cost area to their Leader or Characters.
- An attached DON!! card has `state: "attached"`; it is neither active nor rested while attached.
- When a card with attached DON!! leaves the field, all attached DON!! return to the owner's cost area rested.
- During Refresh Phase, all attached DON!! return to cost area rested, then the player's Leader, Characters, Stage, and DON!! in cost area become active.
- A `DON!! -X` cost may return the paying player's DON!! from cost area, attached to their Leader, or attached to their Characters unless the card text narrows the source. The paying player chooses the DON!! sources. If there are fewer than X eligible DON!! cards, the cost cannot be paid and the activation is illegal or declined before use is consumed.

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

### 03-game-state-events-decisions.s015 (Legal actions)

`getLegalActions()` should return actions valid for the current game state and current pending decision.

```ts
function getLegalActions(state: GameState, playerId: PlayerId): LegalAction[] {
  if (state.pendingDecision) {
    return legalResponsesForDecision(state.pendingDecision, playerId, state);
  }

  return legalPhaseActions(state, playerId);
}
```

Legal actions sent to a client must not leak hidden information. For example, the opponent should not receive an action list that implies exactly which hidden counter cards exist.

### 03-game-state-events-decisions.s016 (Action envelope inside the engine)

The server-facing protocol envelope is defined separately. The engine action should be pure data.

```ts
type Action =
  | { type: "playCard"; cardInstanceId: InstanceId; costPayment?: PaymentSpec }
  | {
      type: "activateEffect";
      source: CardRef;
      effectId: string;
      costPayment?: PaymentSpec;
    }
  | { type: "attachDon"; donInstanceId: InstanceId; target: CardRef }
  | { type: "declareAttack"; attacker: CardRef; target: CardRef }
  | { type: "activateBlocker"; blocker: CardRef }
  | { type: "useCounter"; cardInstanceId: InstanceId; target: CardRef }
  | { type: "endMainPhase" }
  | { type: "concede"; playerId: PlayerId }
  | {
      type: "respondToDecision";
      decisionId: string;
      response: DecisionResponse;
    };
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

Own only legal-action generation and action application for `concede`, `endMainPhase`, and simple active-DON!! attachment during Main Phase. Do not implement play-card, activate-effect, attack, blocker, counter, damage, or pending-decision response behavior.

## Scope

- export `getLegalActions(state, playerId)` from engine-core
- export `applyAction(state, action)` from engine-core
- include `concede` for active players regardless of current phase because concession is immediate and allowed at any time
- return phase-control and simple active-DON!! attachment actions that are legal for the current Main Phase state
- apply `endMainPhase` by using the ENG-002D end-phase progression helper
- apply `concede` as an immediate completed match result that cannot be replaced
- apply `attachDon` only from the turn player's active cost area to that player's leader or characters during Main Phase
- reject wrong-player, wrong-phase, unavailable-DON!!, invalid-target, and unsupported action shapes with `illegalAction` errors
- run invariants and hash the authoritative state after accepted actions

## Out of Scope

- `playCard`
- `activateEffect`
- `declareAttack`
- `activateBlocker`
- `useCounter`
- `respondToDecision`
- hidden-information projection of legal actions for clients
- server idempotency envelopes or `clientActionId` behavior

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/**
- tests/engine/**

## Constraints

- do not approve this story until ENG-002D is done
- engine behavior must remain deterministic and pure
- legal action output must not expose hidden hand contents or private decision candidates
- no server protocol envelope or idempotency behavior may be added in this story
- must pass `corepack pnpm run verify`
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

## Required Tests

- unit test for `getLegalActions` in Main Phase for turn player and non-turn player
- unit test for `getLegalActions` including concession outside Main Phase
- unit test for legal `attachDon`
- unit test for illegal `attachDon` wrong player, wrong phase, rested DON!!, and invalid target
- unit test for `endMainPhase`
- unit test for immediate concession
- unit test proving illegal actions do not mutate input state

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- legal actions for non-turn players during Main Phase exclude turn-player-only actions except concession
- legal actions outside Main Phase still include concession for active players
- legal actions during Main Phase include `endMainPhase` for the turn player
- legal active-DON!! attachment moves the DON!! from cost area to the target's `attachedDon` and clears active/rested state while attached
- illegal actions return `EngineResult` errors without mutating the input state
- concession immediately completes the match for the conceding player's opponent

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
