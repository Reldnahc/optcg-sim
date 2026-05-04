<!-- agent-packet:story-id ENG-003C -->
<!-- agent-packet:story-path stories/approved/ENG-003C-vanilla-damage-life-and-ko.yaml -->
<!-- agent-packet:story-sha256 e3ed024bdeee7b44a6a5d1620142471fa87bb3eade265be93b5e43add97f9496 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-003C
Epic ID: M1-001
Title: Resolve supported vanilla damage, life movement, and K.O.
Type: implementation
Area: engine
Primary Concern: rules

## Why

Resolve manifest-proven no-blocker, no-counter, no-trigger vanilla battles as a deterministic internal engine step reached from the canonical action loop, moving Life to hand or K.O.ing rested Characters when attacker power is sufficient.

## Authoritative Spec References

- 02-engine-mechanics.s002 (Purpose)
- 02-engine-mechanics.s009 (Canonical Life orientation)
- 02-engine-mechanics.s017 (Battle sequence)
- 02-engine-mechanics.s019 (Block Step)
- 02-engine-mechanics.s020 (Counter Step)
- 02-engine-mechanics.s021 (Damage Step)
- 02-engine-mechanics.s022 (End of Battle)
- 02-engine-mechanics.s023 (Damage processing)
- 02-engine-mechanics.s025 (Keyword behavior)
- 02-engine-mechanics.s036 (DON!! card mechanics)
- 03-game-state-events-decisions.s003 (Base state vs. computed view)
- 03-game-state-events-decisions.s004 (Engine result)
- 03-game-state-events-decisions.s005 (Event journal)
- 03-game-state-events-decisions.s018 (Canonical event visibility)
- 03-game-state-events-decisions.s023 (Error handling inside the engine)
- 09-card-data-and-support-policy.s010 (Card implementation record)
- 09-card-data-and-support-policy.s013 (Match-time card manifest)
- 18-acceptance-tests.s003 (Milestone 1 - terminal engine)
- 22-v6-implementation-tightening.s008 (4. Life orientation)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

### 02-engine-mechanics.s002 (Purpose)

This document translates OPTCG gameplay into engine-facing structures and logic flows. It intentionally avoids UI and networking concerns.

The canonical engine loop is:

```ts
applyAction(state, action) -> EngineResult
resumeDecision(state, decisionResponse) -> EngineResult
getLegalActions(state, playerId) -> LegalAction[]
filterStateForPlayer(state, playerId) -> PlayerView
```

Every accepted action creates a new state sequence number and an event journal entry.

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

### 02-engine-mechanics.s017 (Battle sequence)

A battle is a sub-state inside Main Phase.

### 02-engine-mechanics.s019 (Block Step)

1. Defender may activate one legal `[Blocker]`, unless blocking is prohibited.
2. Blocker rests and becomes the current target.
3. Emit `blockerActivated`.
4. Queue `[On Block]` effects.
5. Resolve the block timing window.
6. If attacker or current target left its zone or is no longer a legal battle participant, skip to End of Battle.

### 02-engine-mechanics.s020 (Counter Step)

1. Queue defender-side effects that trigger from being attacked or from the opponent's attack timing, such as `[On Your Opponent's Attack]`, before ordinary counter actions.
2. Resolve that timing window.
3. If attacker or current target left its zone or is no longer a legal battle participant, skip to End of Battle.
4. Defender may perform any number of legal counter actions:
   - Trash a Character card with counter value from hand for power.
   - Use a `[Counter]` Event by paying its cost and trashing it.
5. After each counter action and after the defender passes, re-check whether attacker and current target still exist and remain legal battle participants. If not, skip to End of Battle.
6. Proceed to Damage Step only if the attacker and current target are still legal.

The server must avoid timing leaks. If the defender has no legal counter actions and settings allow auto-pass, the window should auto-pass without revealing hidden details.

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

### 02-engine-mechanics.s025 (Keyword behavior)

| Keyword         | Engine behavior                                                      |
| --------------- | -------------------------------------------------------------------- |
| Rush            | Character may attack the turn it was played.                         |
| Rush: Character | Character may attack Characters, not Leader, the turn it was played. |
| Double Attack   | Leader damage count is 2.                                            |
| Banish          | Damaged life card is trashed; no normal trigger/hand path.           |
| Blocker         | During Block Step, can rest to redirect attack.                      |
| Unblockable     | Skips opponent blocker window.                                       |
| Activate: Main  | Legal only during controller's Main Phase outside battle.            |
| Main            | Event usable during controller's Main Phase.                         |
| Counter         | Event usable during opponent's Counter Step.                         |
| Once Per Turn   | Tracked by stable effect ID and card instance per turn.              |
| DON!! xX        | Condition is attached DON!! count greater than or equal to X.        |

### 02-engine-mechanics.s036 (DON!! card mechanics)

- Each DON!! attached to a Leader or Character grants +1000 power during the controller's turn only.
- During Main Phase, a player may give any number of active DON!! from cost area to their Leader or Characters.
- An attached DON!! card has `state: "attached"`; it is neither active nor rested while attached.
- When a card with attached DON!! leaves the field, all attached DON!! return to the owner's cost area rested.
- During Refresh Phase, all attached DON!! return to cost area rested, then the player's Leader, Characters, Stage, and DON!! in cost area become active.
- A `DON!! -X` cost may return the paying player's DON!! from cost area, attached to their Leader, or attached to their Characters unless the card text narrows the source. The paying player chooses the DON!! sources. If there are fewer than X eligible DON!! cards, the cost cannot be paid and the activation is illegal or declined before use is consumed.

### 03-game-state-events-decisions.s003 (Base state vs. computed view)

Separate base facts from derived values.

Base state stores:

- Which cards are in which zones.
- Active/rested state.
- Attached DON!! cards.
- Turn, phase, battle sub-step.
- Effect durations and source references.
- Pending decisions.

Computed view derives:

- Current power.
- Current cost.
- Granted/removed keywords.
- Attack/block restrictions.
- Protection from K.O. or other processes.
- Replacement candidates.

```ts
interface ComputedGameView {
  seq: StateSeq;
  turnPlayerId: PlayerId;
  cards: Record<InstanceId, ComputedCardView>;
  legalAttackTargets: Record<InstanceId, InstanceId[]>;
  restrictions: RestrictionIndex;
}

interface ComputedCardView {
  instanceId: InstanceId;
  cardId: CardId;
  basePower?: number;
  currentPower?: number;
  baseCost?: number;
  currentCost?: number;
  keywords: Keyword[];
  canAttack: boolean;
  canBlock: boolean;
  cannotBeAttacked: boolean;
  protectedFrom: Protection[];
}
```

Do not persist derived current power as canonical state unless a rule explicitly changes a base value. Recompute from base state and continuous modifiers.

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

### 03-game-state-events-decisions.s018 (Canonical event visibility)

Each `EngineEvent` has one visibility policy:

```text
public          safe for both players immediately
private         visible only to listed player IDs
replayOnly      hidden during live play but available in completed full replay
serverOnly      never leaves trusted server/runtime logs
```

Visibility is independent of replay determinism. Replay artifacts may store information that was never sent to either player during the live match.

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

### 09-card-data-and-support-policy.s010 (Card implementation record)

```ts
type CardSupportStatus =
  | "vanilla-confirmed"
  | "implemented-dsl"
  | "implemented-custom"
  | "unsupported"
  | "banned-in-simulator";

interface CardImplementationRecord {
  cardId: CardId; // Poneglyph base card ID
  status: CardSupportStatus;
  effectDefinitionId?: string;
  customHandlerIds?: string[];
  tested: boolean;
  rulesVersion: string;
  cardDataVersion: string;
  sourceTextHash: string; // hash of Poneglyph printed text used for review drift
  notes?: string;
}
```

A card with printed effect text but no implementation must be marked `unsupported`, not omitted.

### 09-card-data-and-support-policy.s013 (Match-time card manifest)

At match creation, snapshot resolved card data versions and implementation data. Replays use this manifest instead of live Poneglyph data. The implementation contract is `MatchCardManifest` in `contracts/canonical-types.ts`.

```ts
interface MatchCardManifest {
  manifestHash: string;
  source: "poneglyph" | "poneglyph-fixture" | "manual-test";
  cardDataVersion: string;
  effectDefinitionsVersion: string;
  customHandlerVersion: string;
  banlistVersion: string;
  cards: Record<CardId, ResolvedCard>;
  createdAt: string;
}
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

Own only vanilla one-damage battle resolution for battles created by `declareAttack` when the manifest proves the unsupported Block, Counter, Trigger, replacement, protection, Banish, and multi-damage paths are absent. Do not add blocker choices, counter choices, life triggers, replacement effects, Banish, multi-damage, card-play effects, or rule-processing defeat completion.

## Scope

- export engine-local `resolveSupportedVanillaBattle(state)` from engine-core for focused tests and replay smoke support, while treating it as an internal system step rather than a player-facing command
- wire supported vanilla battle resolution into the canonical `applyAction` path after accepted `declareAttack` creates `state.battle`, so supported Milestone 1 combat can advance without an external caller inventing a continuation action
- do not add a new `Action` union member or public legal action for battle continuation; the continuation is a deterministic internal system step under `02-engine-mechanics.s002`
- before resolving vanilla damage, fail closed with the current engine error contract when the manifest or battle state indicates any unsupported blocker, counter, trigger, replacement, protection, Banish, Double Attack, or non-vanilla timing behavior is relevant
- resolve supported vanilla battles without creating blocker or counter decisions only after the unsupported-window guard passes
- compute attacker and target power from `computeView` during Damage Step
- if attacker power is lower than target power, end the battle without damage or K.O.
- if the target is a Leader and the defender has 0 Life, fail closed without mutating input state because terminal defeat is owned by ENG-003D
- if the target is a Leader and the defender has Life, move `player.life[0]` to that player's hand according to canonical Life orientation
- ensure face-down Life-to-hand public events do not expose card IDs; card-identifying Life-to-hand details must be private to the damaged player or replayOnly
- if the target is a rested Character and attacker power is equal or greater, K.O. the Character and move it to trash
- return attached DON!! from a K.O.'d Character to the owner's cost area rested
- emit deterministic events for damage, life movement, K.O., card movement, and end-of-battle cleanup
- clear `state.battle` after vanilla battle resolution completes
- run invariants and return a stable `EngineResult.stateHash` after accepted battle resolution

## Out of Scope

- leader damage at 0 Life producing terminal match completion
- deck-out defeat checks
- blocker activation and blocker redirection
- counter Character or Counter Event decisions
- life Trigger reveal/activation decisions
- Banish, Double Attack, replacement effects, protection effects, or triggered effects
- full multi-damage processing beyond the vanilla `damageCount: 1` path

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/**
- tests/engine/**

## Constraints

- do not activate, packetize, or implement this story until ENG-003B is done
- do not add or modify the canonical `Action` contract for battle continuation in this story
- do not implement terminal defeat checks in this story; leave them to ENG-003D
- do not silently skip official Block, Counter, or Trigger behavior when manifest metadata indicates it may apply
- do not add blocker, counter, trigger, replacement, Banish, Double Attack, or protection behavior in this story
- engine behavior must remain deterministic and pure
- must pass `corepack pnpm run verify`
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

## Required Tests

- unit test proving supported `applyAction(declareAttack)` reaches vanilla battle resolution through the internal engine step without requiring a continuation action
- unit test proving unsupported battle windows fail closed without mutating input state instead of leaving a caller-owned continuation path
- unit test proving `resolveSupportedVanillaBattle(state)` rejects states with no active battle without mutating input state
- unit test proving Leader damage at 0 Life fails closed without mutating input state
- unit test for supported vanilla Leader damage moving top Life to hand
- unit test proving Life orientation uses `player.life[0]` as the next damage card
- unit test proving public events for face-down Life movement do not expose Life card IDs
- unit test proving card-identifying Life-to-hand details are private to the damaged player or replayOnly
- unit test for equal-or-greater power K.O. against a rested Character
- unit test for lower-power attack causing no K.O. and no Life movement
- unit test for attached DON!! returning rested after K.O.
- unit test proving battle state clears after resolution
- negative test proving a damaged Life card with trigger metadata fails closed because trigger decisions are out of scope
- negative test proving a legal blocker or counter window fails closed because blocker/counter decisions are out of scope
- negative test proving Banish, Double Attack, replacement, or protection metadata fails closed for this story

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- battle resolution is reachable from canonical `applyAction` as a deterministic internal system step after supported `declareAttack`, not only from tests or replay helper scripts
- focused tests may invoke `resolveSupportedVanillaBattle(state)`, but no new public action contract is added for battle continuation
- Leader damage at 0 Life fails closed without mutating input state until ENG-003D implements terminal defeat
- supported Leader damage with at least one non-trigger Life moves `life[0]` to the damaged player's hand and reindexes remaining Life
- Character target battle K.O.s the rested target when attacker power is equal or greater
- Character target battle does not K.O. the target when attacker power is lower
- attached DON!! on a K.O.'d Character returns to its owner's cost area rested
- battle state is cleared after supported vanilla resolution
- accepted battle resolution emits deterministic events and produces a new state hash
- unsupported blocker, counter, trigger, replacement, protection, Banish, or multi-damage paths fail closed without mutating input state

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
