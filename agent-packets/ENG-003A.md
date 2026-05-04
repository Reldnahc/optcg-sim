<!-- agent-packet:story-id ENG-003A -->
<!-- agent-packet:story-path stories/approved/ENG-003A-match-manifest-computed-combat-view.yaml -->
<!-- agent-packet:story-sha256 46743431fd531c0bafb96ddbf5658cb4b4696c7001a64ef1ea2368658b77279c -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-003A
Epic ID: M1-001
Title: Add match-manifest computed combat view
Type: implementation
Area: engine
Primary Concern: rules

## Why

Add canonical match-manifest state authority and the manifest-backed computed combat view needed before attack legality and damage resolution can use card stats instead of raw card IDs.

## Authoritative Spec References

- 02-engine-mechanics.s007 (Card categories)
- 02-engine-mechanics.s014 (Main Phase)
- 02-engine-mechanics.s018 (Attack Step)
- 02-engine-mechanics.s021 (Damage Step)
- 02-engine-mechanics.s025 (Keyword behavior)
- 02-engine-mechanics.s036 (DON!! card mechanics)
- 02-engine-mechanics.s037 (First-turn restrictions)
- 08-replay-rollback-recovery.s005 (Card manifest snapshot)
- 09-card-data-and-support-policy.s006 (Why the match server fetches card data)
- 03-game-state-events-decisions.s002 (Canonical state model)
- 03-game-state-events-decisions.s003 (Base state vs. computed view)
- 03-game-state-events-decisions.s004 (Engine result)
- 09-card-data-and-support-policy.s013 (Match-time card manifest)
- 15-implementation-kickoff.s006 (Step 2 - `@optcg/engine-core`)
- 16-typescript-interface-draft.s002 (v6 supersession)
- 16-typescript-interface-draft.s005 (Game state)
- 18-acceptance-tests.s003 (Milestone 1 - terminal engine)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

### 02-engine-mechanics.s007 (Card categories)

| Category  | Field zone               | Has power | Has cost |   Has life |                             Can attack |
| --------- | ------------------------ | --------: | -------: | ---------: | -------------------------------------: |
| Leader    | Leader Area              |       Yes |       No | Setup only |                                    Yes |
| Character | Character Area           |       Yes |      Yes |         No | Yes, subject to turn-played/Rush rules |
| Event     | None after use           |        No |      Yes |         No |                                     No |
| Stage     | Stage Area               |        No |      Yes |         No |                                     No |
| DON!!     | Cost/attached/DON!! deck |        No |       No |         No |                                     No |

### 02-engine-mechanics.s014 (Main Phase)

Before the turn player receives action priority, emit `phaseStarted(main)`, collect `[Start of Main Phase]` triggers, and resolve required automatic effects. If any pending decision is created, Main Phase action priority does not begin until that decision and the resulting queue are complete.

Turn player may repeatedly:

- Play a Character, Stage, or `[Main]` Event from hand.
- Activate `[Activate: Main]` effects.
- Give active DON!! to Leader or Characters.
- Declare an attack, if legal.
- End the phase.

Neither player can attack on their first turn.

### 02-engine-mechanics.s018 (Attack Step)

1. Attacker rests an active Leader or Character.
2. Attacker selects target: opponent Leader or one rested opponent Character.
3. Emit `attackDeclared`.
4. Queue attacker's `[When Attacking]` effects in the attack timing window.
5. Resolve that attack timing window.
6. If attacker or target left its zone or is no longer a legal battle participant, skip to End of Battle.

### 02-engine-mechanics.s021 (Damage Step)

1. Compute attacker and target power from `ComputedGameView`.
2. If attacker power is lower than target power, no damage/K.O. occurs.
3. If attacker power is equal or greater:
   - Target Leader: deal damage.
   - Target Character: K.O. target.
4. Emit events for damage, life movement, K.O., card movement.
5. Triggered effects during damage wait until damage processing completes.

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

### 02-engine-mechanics.s037 (First-turn restrictions)

The engine must track first/second player and each player's first turn.

| Player / turn                   |    Draw Phase |                DON!! Phase |        Attack |
| ------------------------------- | ------------: | -------------------------: | ------------: |
| Player going first, first turn  |       No draw |         Place only 1 DON!! | Cannot attack |
| Player going second, first turn | Draw normally | Place 2 DON!! if available | Cannot attack |

### 08-replay-rollback-recovery.s005 (Card manifest snapshot)

Every replay stores `manifestHash` and a manifest snapshot or reference that can reconstruct the exact `MatchCardManifest` used at match creation. Live Poneglyph data, current card overlays, and current banlists must not be consulted during deterministic replay except to locate the pinned historical artifact.

The manifest snapshot includes:

- normalized card metadata,
- variant keys used for display,
- source text hashes,
- behavior hashes,
- support status,
- effect definition version,
- custom handler version,
- banlist/format version.

### 09-card-data-and-support-policy.s006 (Why the match server fetches card data)

The server is authoritative. The client may render card names, images, and text from Poneglyph for convenience, but **client-supplied card data has no gameplay authority**.

At match creation, the server resolves every card ID in both decks through `@optcg/cards`, validates it, merges overlays, and snapshots the resolved manifest for the match. During the match, the engine reads the match snapshot rather than refetching live card data.

This prevents:

- Modified clients changing card stats or text.
- Deck submissions with fake card metadata.
- Mid-match behavior changes if Poneglyph updates text or metadata.
- Inconsistent replays caused by live external data changing.

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

### 16-typescript-interface-draft.s002 (v6 supersession)

This file is retained as historical/explanatory context. The implementation contract is now [`contracts/canonical-types.ts`](contracts/canonical-types.ts), which resolves the undefined symbols and naming conflicts from this draft and compiles under strict TypeScript. Implementation packages should copy or import from the contract file rather than from snippets in this document.

This file gives the first implementation pass a concrete shape. Types can evolve, but starting from shared interfaces avoids each package inventing its own model.

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

Own only the canonical match-manifest field and the minimal computed combat view behavior required for Milestone 1 vanilla attacks. Do not implement attack application, damage, K.O., card play, blockers, counters, triggers, replacement effects, Rush-granting effects, or client view filtering.

## Scope

- add canonical `cardManifest: MatchCardManifest` to `GameState` in the v6 contract and mirrored types package, grounded in the server-owned match snapshot from `09-card-data-and-support-policy.s006` and the implementation-contract authority from `09-card-data-and-support-policy.s013`
- treat `16-typescript-interface-draft.s005` as explanatory shape context only; do not use the historical draft as implementation authority over `contracts/canonical-types.ts`
- update deterministic initial-state input and fixtures to carry a manual-test or fixture-sourced match manifest for all setup cards
- export `computeView(state)` from engine-core
- derive `ComputedGameView.cards` for Leaders and Characters from `state.cardManifest.cards[cardId]`
- derive base power, current power, and printed keywords without persisting derived current power on canonical card instances
- include attached-DON!! +1000 current-power modifiers only during the controller's turn
- derive vanilla `canAttack` and `legalAttackTargets` for active Leaders and Characters during the turn player's Main Phase and outside battle
- enforce each player's first-turn attack restriction and Character `turnPlayed` restrictions in the computed view
- use canonical `ResolvedCard.printedKeywords` values `"rush"` and `"rushCharacter"`: `"rush"` may attack legal Leaders and Characters, while `"rushCharacter"` may attack legal Characters but not Leaders
- fail closed with current engine error contracts or invariant failures when combat-relevant card metadata is missing or unsupported for the Milestone 1 path

## Out of Scope

- accepting `declareAttack` in `applyAction`
- resting attackers
- battle sub-state creation
- damage, K.O., life movement, or defeat checks
- play-card behavior that sets `turnPlayed`
- blocker, counter, trigger, replacement, Banish, Double Attack, or Rush-granting behavior
- Poneglyph HTTP access, card-data normalization, deck legality validation, or persisted manifest storage

## Allowed Touch Points

<!-- prettier-ignore -->
- contracts/canonical-types.ts
- fixtures/replays/**
- packages/types/src/**
- packages/engine-core/**
- tests/contracts/**
- tests/engine/**

## Constraints

- do not approve this story until ENG-002E and ENG-002F are done
- do not persist derived current power into canonical `CardInstance`
- do not introduce live Poneglyph access or a card-data package dependency into engine-core
- keep engine-core deterministic and pure
- must pass `corepack pnpm run verify`
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

## Required Tests

- contract/type test proving `GameState.cardManifest` is part of canonical and package-local type authority
- unit test for manifest snapshot plumbing through deterministic setup
- unit test for computed base/current power from manifest and attached DON!! during controller turn
- unit test for attached DON!! not modifying current power outside controller turn
- unit test for first-player first-turn attack restriction in computed legal attack targets
- unit test for second-player first-turn attack restriction in computed legal attack targets
- unit test for played-this-turn Character attack restriction
- unit test proving `printedKeywords: ["rush"]` permits played-this-turn Character attacks against legal Leader and Character targets
- unit test proving `printedKeywords: ["rushCharacter"]` permits played-this-turn Character attacks against legal Character targets but not Leader targets
- unit test for target lists including opponent Leader and rested opponent Characters only
- negative test proving missing Leader or Character power metadata fails closed for combat view computation

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- canonical contract and types package expose `GameState.cardManifest: MatchCardManifest`
- engine setup snapshots a deterministic match manifest into `GameState`
- `computeView(state)` returns manifest-derived base and current power for Leaders and Characters
- attached DON!! increases current power only during the controller's turn
- Leaders and Characters cannot attack on either player's first turn according to the computed view
- Characters with `turnPlayed` equal to the current global turn cannot attack unless `printedKeywords` include `"rush"` or `"rushCharacter"`
- played-this-turn Characters with `"rush"` may include opponent Leader and rested opponent Characters as legal targets
- played-this-turn Characters with `"rushCharacter"` may include rested opponent Characters as legal targets but must exclude opponent Leader
- legal attack target lists include opponent Leader and rested opponent Characters only
- missing combat metadata for a relevant Leader or Character fails closed instead of using fallback power

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
