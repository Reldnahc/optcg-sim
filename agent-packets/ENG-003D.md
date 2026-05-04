<!-- agent-packet:story-id ENG-003D -->
<!-- agent-packet:story-path stories/approved/ENG-003D-rule-processing-defeat-checks.yaml -->
<!-- agent-packet:story-sha256 1eedf7b7cbca5c72a67e63ddcadb4eb059f5c0af7353b2d8b93636193c20d025 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-003D
Epic ID: M1-001
Title: Add rule-processing defeat checks
Type: implementation
Area: engine
Primary Concern: rules

## Why

Add reusable rule-processing defeat checks for Milestone 1 leader damage at 0 Life, deck-out, and simultaneous double-loss handling.

## Authoritative Spec References

- 02-engine-mechanics.s003 (Rule-processing checkpoints)
- 02-engine-mechanics.s021 (Damage Step)
- 02-engine-mechanics.s023 (Damage processing)
- 02-engine-mechanics.s035 (Exact win/loss conditions)
- 03-game-state-events-decisions.s004 (Engine result)
- 03-game-state-events-decisions.s005 (Event journal)
- 03-game-state-events-decisions.s020 (State hashing)
- 03-game-state-events-decisions.s022 (Internal state sequencing)
- 03-game-state-events-decisions.s023 (Error handling inside the engine)
- 18-acceptance-tests.s003 (Milestone 1 - terminal engine)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

### 02-engine-mechanics.s003 (Rule-processing checkpoints)

Run rule processing after every atomic state change, not only after player actions.

```ts
function afterAtomicMutation(result: EngineStepResult): EngineStepResult {
  const checked = checkRuleProcessing(result.state);
  return { ...result, state: checked };
}
```

Rule processing checks:

- Leader damage when that player has 0 life.
- Deck-out at a rule-processing checkpoint.
- Effect-created win/loss conditions.
- Simultaneous loss resulting in draw.
- Invariant violations in development/test mode.

Concession is immediate and cannot be replaced or prevented.

### 02-engine-mechanics.s021 (Damage Step)

1. Compute attacker and target power from `ComputedGameView`.
2. If attacker power is lower than target power, no damage/K.O. occurs.
3. If attacker power is equal or greater:
   - Target Leader: deal damage.
   - Target Character: K.O. target.
4. Emit events for damage, life movement, K.O., card movement.
5. Triggered effects during damage wait until damage processing completes.

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

### 02-engine-mechanics.s035 (Exact win/loss conditions)

Run defeat checks at every rule-processing checkpoint:

1. **Leader damage at 0 Life** - if a player has 0 Life cards and their Leader would take damage, that player loses.
2. **Deck-out** - if a player has 0 cards in deck at any rule-processing checkpoint, that player loses.
3. **Concession** - a player may concede at any time; concession is immediate and cannot be prevented or replaced by card effects.
4. **Effect-based win/loss** - card effects may directly cause a win or loss during effect resolution.
5. **Double loss** - if both players meet defeat conditions at the same rule-processing checkpoint, both lose and the match is a draw.

Rule processing happens after atomic state changes, including mid-effect. For example, if a player decks out while drawing during an effect, the loss is detected at the next rule-processing point.

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

Own only rule-processing loss checks and their wiring into existing engine checkpoints and supported vanilla damage. Do not add new action types, card effects, replacement effects, trigger handling, client projection, or server recovery.

## Scope

- add a reusable rule-processing helper that can mark the match completed for deck-out, leader damage at 0 Life, and double loss as draw
- wire deck-out checks into existing rule-processing checkpoints reached after accepted actions, phase transitions, and supported vanilla battle resolution
- wire leader-damage-at-0-Life loss into supported vanilla damage before any Life movement
- emit deterministic `ruleProcessingChecked` and `gameEnded` events for terminal checks
- preserve already terminal completed/game-over match status if the helper is called after a prior rule process or concession has already ended the match
- do not run rule-processing terminal mutations after rejected illegal actions
- return authoritative state hashes and invariant-checked states after terminal checks

## Out of Scope

- card-effect based win/loss effects
- replacement effects that prevent damage or defeat
- life Trigger decisions
- server recovery policy for frozen or errored matches
- timer loss or tournament policy

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/**
- tests/engine/**

## Constraints

- do not activate, packetize, or implement this story until ENG-003C is done
- fail closed on ambiguous defeat timing
- preserving already terminal status is a derived idempotency guard for repeated rule-processing helper calls and must not add concession handling in this story
- do not implement effect-based win/loss beyond explicit Milestone 1 rule processing
- engine behavior must remain deterministic and pure
- must pass `corepack pnpm run verify`
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

## Required Tests

- unit test for Leader damage at 0 Life completing the match for the opponent
- unit test for deck-out completing the match at a checkpoint after an accepted phase/action mutation
- unit test for simultaneous double-loss producing draw
- unit test proving already terminal match status is not overwritten by later checks
- unit test proving rejected illegal actions do not run terminal rule processing
- unit test proving terminal events and state hash are deterministic

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- a Leader that would take damage at 0 Life loses at rule processing
- a player with 0 cards in deck loses at a rule-processing checkpoint after an accepted atomic mutation
- if both players meet defeat conditions at the same checkpoint, the match result is a draw
- already terminal completed/game-over matches cannot be overwritten by later rule-processing checks
- rejected illegal actions do not create new terminal rule-processing state
- terminal checks emit deterministic event-journal entries

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
