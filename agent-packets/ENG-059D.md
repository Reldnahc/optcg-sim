<!-- agent-packet:story-id ENG-059D -->
<!-- agent-packet:story-path stories/approved/ENG-059D-synthetic-conditional-protection-composition-proof.yaml -->
<!-- agent-packet:story-sha256 2ebca8b12f8507dbbe4dffb01389ad8ee2f9b5dcf69c84823ce23e679289dd65 -->
<!-- prettier-ignore-start -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-059D
Epic ID: ENG-059
Title: Synthetic conditional protection composition proof
Type: implementation
Area: engine
Primary Concern: verification

## Why

Prove the ENG-059 runtime primitives compose in a synthetic engine fixture built from phrase-level primitive shapes: a public trash-count condition grants Blocker and opponent effect-removal protection while existing On K.O. draw behavior still works for allowed K.O. processes.

## Authoritative Spec References

- 02-engine-mechanics.s019 (Block Step)
- 02-engine-mechanics.s025 (Keyword behavior)
- 02-engine-mechanics.s038 (Rule-process trashing is not effect trashing)
- 03-game-state-events-decisions.s005 (Event journal)
- 03-game-state-events-decisions.s020 (State hashing)
- 03-game-state-events-decisions.s023 (Error handling inside the engine)
- 04-effect-runtime.s004 (Stable effect identity)
- 04-effect-runtime.s007 (Source presence policy)
- 04-effect-runtime.s011 (Conditions and costs)
- 04-effect-runtime.s013 (Replacement effects)
- 05-effect-dsl-reference.s006 (Conditions)
- 05-effect-dsl-reference.s016 (Replacement triggers)
- 06-visibility-security.s004 (PlayerView shape)
- 06-visibility-security.s005 (Temporary visibility)
- 06-visibility-security.s017 (Filter checklist)
- 11-testing-quality.s004 (Unit tests per DSL primitive)
- 11-testing-quality.s008 (Invariant tests)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

### 02-engine-mechanics.s019 (Block Step)

1. Defender may activate one legal `[Blocker]`, unless blocking is prohibited.
2. Blocker rests and becomes the current target.
3. Emit `blockerActivated`.
4. Queue `[On Block]` effects.
5. Resolve the block timing window.
6. If attacker or current target left its zone or is no longer a legal battle participant, skip to End of Battle.

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

### 02-engine-mechanics.s038 (Rule-process trashing is not effect trashing)

Two common rule processes do not generate normal K.O./trash triggers:

- Playing a sixth Character requires trashing one existing Character before the new Character is played.
- Playing a new Stage trashes the existing Stage first.

These are rule processes, not card effects. Do not emit ordinary K.O./trash triggers unless official rulings require a specific exception.

### 03-game-state-events-decisions.s005 (Event journal)

Every atomic mutation emits events. Trigger detection consumes events, not actions.

Event sequencing is part of the replay and state-hash contract:

- EngineResult.events from one accepted transition must be strictly increasing by
  `seq`.
- The final `state.eventJournal` must be strictly increasing by `seq`.
- Event `seq` values must be allocated by append order.
- Helpers must not create multiple events in one `push` call when event IDs or seq values depend on `events.length`; append events one at a time or use an
  equivalent allocator that observes the already-appended event count.

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

### 04-effect-runtime.s004 (Stable effect identity)

Every effect block has a stable ID. Never key `[Once Per Turn]` by array index.

```ts
interface EffectBlock {
  id: string; // e.g. "OP01-001:auto-1" or "OP01-040:activate-main-1"
  trigger: Trigger;
  category: EffectCategory;
  condition?: Condition;
  cost?: Cost;
  optional?: boolean;
  oncePerTurn?: boolean;
  failurePolicy?: FailurePolicy;
  sourcePresencePolicy?: SourcePresencePolicy;
  effect: Effect;
}
```

The `id` should remain stable across definition edits unless the effect's identity truly changes.

### 04-effect-runtime.s007 (Source presence policy)

A simple "cancel if source moved" rule is not enough. Zone-transition triggers such as `[On K.O.]` must activate on field and resolve after the card moves to trash.

```ts
type SourcePresencePolicy =
  | "mustRemainInSameZone"
  | "resolveFromDestinationZone"
  | "resolveFromLastKnownInformation"
  | "noSourceRequired";
```

Recommended defaults:

| Trigger/effect kind           | Policy                                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| `[When Attacking]`            | `mustRemainInSameZone`                                                                                |
| `[On Your Opponent's Attack]` | `mustRemainInSameZone`                                                                                |
| `[On Block]`                  | `mustRemainInSameZone`                                                                                |
| `[On K.O.]`                   | `resolveFromDestinationZone` or `resolveFromLastKnownInformation`, depending on ruling/implementation |
| `[Trigger]` from life         | `resolveFromLastKnownInformation` or `noSourceRequired` while in no zone                              |
| Event `[Main]` / `[Counter]`  | `resolveFromDestinationZone` after event is trashed                                                   |
| Global rule-created effect    | `noSourceRequired`                                                                                    |

### 04-effect-runtime.s011 (Conditions and costs)

Before resolving an effect block:

1. Check source presence policy.
2. Re-check condition if the effect requires condition-on-resolution.
3. Check `[Once Per Turn]` usage by `source.instanceId + effectBlock.id + turn`.
4. If activation requires cost, create a `PayCostDecision` when choices are required.
5. Pay cost atomically and emit `costPaid` events.
6. Mark once-per-turn usage only after legal commitment: activation conditions passed, required activation-time targets selected, costs paid, and optional activation accepted. Declined optional effects and failed costs do not consume use; legally committed effects that later fizzle do consume use.

Optionality has three distinct meanings:

- Optional activation asks whether the player commits to resolving the effect block. Declining optional activation means the effect block is not legally committed and once-per-turn usage is not consumed.
- Optional cost asks whether the player pays a non-mandatory cost inside an otherwise committed effect. Declining or failing an optional cost records `paidCost: false` and only skips later instructions whose connector or text depends on that cost being paid.
- Optional effect clause asks whether the player performs a non-mandatory instruction during resolution. Declining an optional effect clause records `playerDeclined: true` for that segment and does not undo prior legally completed segments.

Optional cost clauses inside composed execution are not effect-block activation
costs. They occur after legal commitment to the effect block, inside a
resumable sequence segment. Optional cost accept, decline, and failure do not
consume once-per-turn usage because usage was consumed at legal commitment
before the optional cost clause executes. Accepted optional costs pay cost
atomically and emit the normal cost-payment events. Declined optional costs do
not emit cost-payment events. Failed optional costs emit no public event that
reveals hidden payment candidates or private payment details.

Accepted optional cost records `attempted: true`, `succeeded: true`,
`paidCost: true`, and `playerDeclined: false`; `changedState` records whether
canonical state actually changed. Declined optional cost records
`attempted: true`, `succeeded: false`, `changedState: false`,
`paidCost: false`, and `playerDeclined: true`. Failed optional cost records
`attempted: true`, `succeeded: false`, `changedState: false`,
`paidCost: false`, and `playerDeclined: false`. Optional cost accept, decline,
and failure do not consume once-per-turn usage, and dependent connectors use
`paidCost` rather than optional-activation state.
Event `seq` values and `state.seq` advancement remain deterministic for
optional cost accept, decline, and failure. State hashes include the frame
segment result for each branch.

```ts
interface OncePerTurnRecord {
  cardInstanceId: InstanceId;
  effectId: string;
  turnNumber: number;
  usedAtStateSeq: StateSeq;
}
```

### 04-effect-runtime.s013 (Replacement effects)

Replacement effects intercept replaceable processes.

```ts
interface ReplacementProcess {
  id: string;
  type: ReplaceableProcessType;
  source?: CardRef;
  target?: CardRef;
  payload: unknown;
  causedBy: CausalityRef;
  usedReplacementIds: string[];
}
```

Processing order:

1. Replacements generated by the card/process being replaced, if applicable.
2. Turn player's applicable replacements in chosen order.
3. Non-turn player's applicable replacements in chosen order.

A replacement cannot apply twice to the same replacement process. If a replacement cannot actually perform its replacement, it does not apply.

```ts
function executeReplaceableProcess(
  state: GameState,
  process: ReplacementProcess,
): EngineStepResult {
  let current = process;
  let currentState = state;

  while (true) {
    const replacements = findApplicableReplacements(currentState, current)
      .filter((r) => !current.usedReplacementIds.includes(r.id))
      .filter((r) => canApplyReplacement(r, currentState, current));

    if (replacements.length === 0) {
      return executeUnreplacedProcess(currentState, current);
    }

    const choice = chooseReplacementByPriorityOrDecision(
      currentState,
      replacements,
      current,
    );

    if (choice.pausedForDecision) {
      return choice.result;
    }

    if (!choice.chosen) {
      return executeUnreplacedProcess(currentState, current);
    }

    current = {
      ...transformProcessByReplacement(choice.chosen, currentState, current),
      usedReplacementIds: [...current.usedReplacementIds, choice.chosen.id],
    };

    currentState = emitReplacementApplied(
      currentState,
      choice.chosen,
      current,
    ).state;
  }
}
```

Replacement decisions use `PendingDecision.chooseReplacement`. Optional replacements may be declined; mandatory replacements cannot be declined unless more than one mandatory replacement requires a controller-chosen order. A replacement cannot apply twice to the same `process.id`, even if the process is transformed into a new shape.

Every applied replacement emits `replacementApplied` with the original process ID, selected replacement ID, old process payload hash, and transformed process payload hash. This event is at least `replayOnly` and may be public when the replacement effect is public.

### 05-effect-dsl-reference.s006 (Conditions)

```ts
type Condition =
  | { type: "donCount"; target?: Target; min: number }
  | { type: "yourTurn" }
  | { type: "opponentTurn" }
  | { type: "lifeCount"; player: PlayerRef; op: Comparator; value: number }
  | {
      type: "fieldCount";
      player: PlayerRef;
      filter?: CardFilter;
      op: Comparator;
      value: number;
    }
  | { type: "handCount"; player: PlayerRef; op: Comparator; value: number }
  | {
      type: "trashCount";
      player: PlayerRef;
      filter?: CardFilter;
      op: Comparator;
      value: number;
    }
  | {
      type: "leaderColorCount";
      player: PlayerRef;
      op: Comparator;
      value: number;
    }
  | { type: "hasCardInZone"; zone: Zone; player: PlayerRef; filter: CardFilter }
  | { type: "attackTarget"; targetType: "leader" | "character" | "any" }
  | { type: "cardState"; target: Target; state: "active" | "rested" }
  | { type: "sourceStillInZone" }
  | { type: "eventPayload"; path: string; op: Comparator; value: unknown }
  | { type: "and"; conditions: Condition[] }
  | { type: "or"; conditions: Condition[] }
  | { type: "not"; condition: Condition }
  | { type: "custom"; check: string };

type Comparator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte";
type PlayerRef =
  | "self"
  | "opponent"
  | "turnPlayer"
  | "nonTurnPlayer"
  | "owner"
  | "controller";
```

`leaderColorCount` is a public Leader metadata condition. It reads only the
player's Leader colors from the match manifest or resolved card snapshot, uses a
canonical `PlayerRef` and `Comparator`, and its `value` is a non-negative safe
integer. Printed "multicolored" Leader conditions map to
`{ type: "leaderColorCount", player: "self", op: "gte", value: 2 }`.

Leader type and Leader attribute conditions do not introduce `leaderType` or
`leaderAttribute` predicates. Represent them through the public Leader Area with
`hasCardInZone` and `CardFilter`, for example
`{ type: "hasCardInZone", zone: "leaderArea", player: "self", filter: { categories: ["leader"], typesAny: ["Straw Hat Crew"] } }`
or
`{ type: "hasCardInZone", zone: "leaderArea", player: "self", filter: { categories: ["leader"], attributesAny: ["slash"] } }`.
The schema-supported fixture subset admits only this public Leader-zone metadata
form and does not authorize private-zone metadata queries.

Condition, duration, and restriction primitives outside the schema-supported fixture subset remain planned layers. They are contract-defined by this reference, but they are not fixture-authorable until the schema coverage policy lists them as supported.

### 05-effect-dsl-reference.s016 (Replacement triggers)

```ts
type ReplacementTrigger =
  | { type: "wouldBeKOd"; target: Target }
  | { type: "wouldTakeDamage"; target: Target }
  | { type: "wouldBeTrashed"; target: Target }
  | { type: "wouldDraw"; player: PlayerRef }
  | { type: "wouldMoveZone"; from?: Zone; to?: Zone; target: Target }
  | { type: "custom"; event: string };
```

### 06-visibility-security.s004 (PlayerView shape)

```ts
interface PlayerView {
  matchId: MatchId;
  playerId: PlayerId;
  stateSeq: StateSeq;
  actionSeq: number;
  turn: PublicTurnState;
  self: VisiblePlayerState;
  opponent: OpponentVisibleState;
  battle?: PublicBattleState;
  pendingDecision?: PublicDecision;
  legalActions: PublicLegalAction[];
  revealedCards: PublicRevealRecord[];
  events: EngineEvent[];
  timers: PublicTimerState;
}
```

Do not include:

- Deck order.
- Opponent hand card IDs.
- Face-down life card IDs.
- RNG seed/internal state.
- Effect queue internals.
- Private decision candidates not visible to recipient.
- Internal crash/recovery metadata.

Canonical public support DTOs for the initial live view contract:

```ts
type SpectatorPolicy = {
  mode: "disabled" | "live-filtered";
  allowHandRevealAfterGame: boolean;
};

interface PublicTurnState {
  globalTurn: number;
  playerTurnCounts: Record<PlayerId, number>;
  turnPlayerId: PlayerId;
  phase: "refresh" | "draw" | "don" | "main" | "end";
  step?: BattleStep;
}

interface PublicBattleState {
  attacker: CardRef;
  originalTarget: CardRef;
  currentTarget: CardRef;
  blocker?: CardRef;
  step: BattleStep;
  damageCount: number;
}

interface PublicCardView {
  instanceId: InstanceId;
  cardId: CardId;
  owner: PlayerId;
  controller: PlayerId;
  zone: ZoneRef;
  state?: "active" | "rested";
  attachedDonCount: number;
  turnPlayed?: number;
}

interface PublicLifeView {
  count: number;
  faceUpCards: PublicCardView[];
}

interface VisiblePlayerState {
  playerId: PlayerId;
  deckCount: number;
  donDeckCount: number;
  hand: PublicCardView[];
  trash: PublicCardView[];
  leader: PublicCardView;
  characters: PublicCardView[];
  stage?: PublicCardView;
  costArea: PublicCardView[];
  life: PublicLifeView;
  hasMulliganed: boolean;
  turnCount: number;
}

interface OpponentVisibleState {
  playerId: PlayerId;
  deckCount: number;
  donDeckCount: number;
  handCount: number;
  trash: PublicCardView[];
  leader: PublicCardView;
  characters: PublicCardView[];
  stage?: PublicCardView;
  costArea: PublicCardView[];
  life: PublicLifeView;
  hasMulliganed: boolean;
  turnCount: number;
}

type SpectatorVisiblePlayerState = OpponentVisibleState;

interface PublicDecision {
  id: DecisionId;
  type: string;
  playerId: PlayerId;
  prompt: string;
  causedBy: CausalityRef;
  timeoutMs?: number;
}

type PublicLegalAction =
  | { type: "playCard"; card: CardRef; costPaymentRequired?: boolean }
  | { type: "activateEffect"; source: CardRef; effectId: EffectId }
  | { type: "attachDon"; don: CardRef; target: CardRef }
  | { type: "declareAttack"; attacker: CardRef; target: CardRef }
  | { type: "activateBlocker"; blocker: CardRef }
  | { type: "useCounter"; card: CardRef; target: CardRef }
  | { type: "endMainPhase" }
  | { type: "concede"; playerId: PlayerId }
  | { type: "respondToDecision"; decisionId: DecisionId };

interface PublicRevealRecord {
  id: string;
  cards: CardRef[];
  visibility: "public" | "privateToRecipient";
  origin: ZoneRef | "topOfDeck" | "lifeDamage" | "custom";
  createdAtStateSeq: StateSeq;
  cleanupPolicy: "returnToOrigin" | "trashAfterResolution" | "none";
}

type SpectatorRevealRecord = Omit<PublicRevealRecord, "visibility"> & {
  visibility: "public";
};

type SpectatorEvent = Omit<EngineEvent, "visibility"> & {
  visibility: { type: "public" };
};
```

Initial live-filtered spectator view is distinct from `PlayerView`:

```ts
interface SpectatorView {
  matchId: MatchId;
  stateSeq: StateSeq;
  actionSeq: number;
  spectatorPolicy: SpectatorPolicy;
  turn: PublicTurnState;
  players: Record<PlayerId, SpectatorVisiblePlayerState>;
  battle?: PublicBattleState;
  revealedCards: SpectatorRevealRecord[];
  events: SpectatorEvent[];
  timers: PublicTimerState;
}
```

Initial `SpectatorView` has no `pendingDecision` or `legalActions` field.
It does not include either player's hand card IDs, deck order, face-down life
card IDs, private reveal records, non-public events, RNG state, effect queue
internals, or audit entries. Full-information live spectating is deferred to a
future explicit policy story.

### 06-visibility-security.s005 (Temporary visibility)

Some events reveal hidden cards temporarily.

| Event                    | Who sees                                        | Duration                                       |
| ------------------------ | ----------------------------------------------- | ---------------------------------------------- |
| Playing card from hand   | Both players                                    | Reveal through placement/resolution            |
| Counter card from hand   | Both players                                    | Reveal through trash/effect resolution         |
| Activated life trigger   | Both players                                    | Reveal through trigger resolution              |
| Declined life trigger    | Nobody except server                            | Never shown                                    |
| Search/look at deck      | Searching player only unless effect says reveal | During effect resolution                       |
| Effect reveals hand/life | As specified by effect                          | During effect resolution or specified duration |
| Trash from hidden zone   | Public once in trash                            | From arrival in trash onward                   |

```ts
interface RevealRecord {
  id: string;
  card: CardRef;
  sourceZone: Zone;
  reason:
    | "play"
    | "counter"
    | "trigger"
    | "search"
    | "lookAt"
    | "effect"
    | "trash";
  visibleTo: "both" | PlayerId[] | "replayOnly";
  expires: RevealExpiration;
}
```

The engine must remove expired `RevealRecord`s as part of effect cleanup.

### 06-visibility-security.s017 (Filter checklist)

Before any state leaves the server:

```ts
assertNoDeckContents(view);
assertNoOpponentHandContents(view);
assertNoFaceDownLifeContents(view);
assertNoRngState(view);
assertNoEffectQueueInternals(view);
assertNoPrivateDecisionCandidates(view);
assertRevealRecordsAreRecipientFiltered(view);
assertLegalActionsDoNotLeakOpponentHiddenInfo(view);
assertSpectatorPolicyApplied(view);
```

Run these in tests for every `PlayerView` fixture.

### 11-testing-quality.s004 (Unit tests per DSL primitive)

Every primitive has tests independent of specific cards:

- `draw`
- `ko`
- `trash`
- `bounce`
- `search`
- `lookAtTop`
- `modifyPower`
- `modifyCost`
- `giveKeyword`
- `replacement`
- `damage`
- `addLife`
- `attachDon`
- `returnDon`
- `choice`
- `conditional`
- `sequence`

Primitive tests should assert events, state, decisions, and visibility where applicable.

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

Own only engine-core synthetic fixture/proof tests that compose already-reviewed ENG-059 primitives. Do not add production engine behavior, parser support, generated-support records, real-card fixtures, cards package changes, source hashes, behavior hashes, or production card-ID branches. If the proof requires production integration glue, stop and split a prerequisite implementation story instead of widening ENG-059D.

## Scope

- create an engine-only synthetic fixture or test setup from phrase-level primitive shapes, not full printed clauses
- include condition primitive shapes equivalent to "If you have", "7 or more", "cards in your trash", and zone "trash"
- include protection primitive shapes equivalent to protected object "this Character", removal process "removed from the field", source controller "opponent", and source kind "effects"
- include keyword-grant primitive shapes equivalent to target "this Character", grant verb "gains", and keyword "[Blocker]"
- include existing triggered primitive shapes equivalent to "[On K.O.]", "Draw", and "1 card"
- compose a public `trashCount gte 7` condition with conditional Blocker grant and opponent-effect field-removal protection
- compose the same synthetic Character with existing supported On K.O. draw-1 behavior
- prove below-threshold behavior has no conditional Blocker grant and no opponent-effect removal protection
- prove at-threshold behavior grants Blocker and prevents supported opponent-effect field removal
- prove battle K.O. remains allowed and queues/resolves the existing On K.O. draw-1 behavior
- prove rule-process trash remains allowed and does not fire ordinary On K.O. triggers
- preserve deterministic event order, replay, state hashes, source presence, and hidden-information projection across the composed scenarios

## Out of Scope

- production engine behavior changes or integration glue
- production real-card ID checks or full-card text matching
- parser certification, generated-support evidence, support reports, support probes, real-card fixtures, overlays, source hashes, or behavior hashes
- making any real card playable
- adding new primitive behavior beyond narrow integration glue for already-reviewed ENG-059A, ENG-059B, ENG-059C, and ENG-056B capabilities
- broad card-list proof, catalog scanning, external-list support assertions, or cards-package runtime capability matrix updates
- server, client, API, UI, database, replay UI, WebSocket, Redis, or live Poneglyph work

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/src/**/*composition*.test.ts
- packages/engine-core/src/**/*condition*.test.ts
- packages/engine-core/src/**/*continuous*.test.ts
- packages/engine-core/src/**/*protection*.test.ts
- packages/engine-core/src/**/*ko*.test.ts
- packages/engine-core/src/**/*effect*.test.ts
- tests/hidden-info/**
- stories/generated/ENG-059*.yaml
- stories/approved/ENG-059*.yaml
- agent-packets/ENG-059D.md
- agent-packets/active.json

## Constraints

- generate and activate the ENG-059D packet before implementation
- do not activate or hand off ENG-059D until ENG-059A, ENG-059B, ENG-059C, and ENG-059E have landed as reviewed commit evidence on the parent branch
- stay within allowed_touch_points
- do not import @optcg/cards
- do not add parser/generated-support/card fixture work
- fail closed if the composition proof requires production card-specific logic or unsupported runtime semantics
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

### Code Standard

Follow [`docs/code-standard.md`](docs/code-standard.md). Non-negotiables:

- stay inside the approved story boundary
- preserve package boundaries
- use strict TypeScript without `any`, routine non-null assertions, or ignored TS errors
- prefer named exports and precise types
- keep files cohesive; 500 effective lines is suspect, 800 is high-risk, 1000 is the hard mechanical guard
- split by reason-to-change, not by line count
- do not over-split into tiny files or generic dumping grounds
- keep engine-core pure and hidden-info safe
- prove engine behavior with synthetic/unit/regression tests
- keep real-card fixture tests separate from engine behavior requirements
- preserve deterministic event ordering and state hashes
- record ambiguity instead of inventing behavior

## Required Tests

- story-review for ENG-059D before approval handoff
- synthetic below-threshold test proving no conditional Blocker grant and no opponent-effect removal protection
- synthetic at-threshold test proving Blocker eligibility during defender Block Step
- synthetic at-threshold test proving supported opponent-effect field removal is prevented
- synthetic battle K.O. test proving K.O. remains allowed and On K.O. draw-1 queues/resolves from the supported source-presence path
- synthetic rule-process trash test proving removal remains allowed and ordinary On K.O. trigger behavior does not fire
- event-order, replay, and state-hash tests for below-threshold, at-threshold prevented removal, battle K.O., and rule-process trash paths
- hidden-info tests proving the composed fixture does not expose private hand, deck, or face-down life identities
- production-code search or lint-style assertion proving no real-card ID branch or full-card text branch exists in engine source outside test/story text
- run `corepack pnpm --filter @optcg/engine-core typecheck`
- run focused engine-core composition, condition, continuous, protection, K.O., replay/hash, and hidden-info tests touched by this story
- run `corepack pnpm run test:hidden-info`
- run `corepack pnpm run verify`
- run `corepack pnpm run stories:validate`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- the synthetic fixture is engine-only, built from independent effect parts, and does not consume @optcg/cards
- below seven self-trash cards, the synthetic Character does not receive conditional Blocker or opponent-effect removal protection
- at seven or more self-trash cards, the synthetic Character receives conditional Blocker and prevents supported opponent-effect field removal
- battle K.O. remains allowed at seven or more trash and existing On K.O. draw-1 behavior resolves correctly
- rule-process trash remains allowed and does not fire ordinary On K.O. triggers
- no production engine code mentions real card IDs, the full effect text as one string, or any external card list
- the proof demonstrates reusable primitive composition rather than a direct one-card implementation

## Post-Approval Role Sections

### implementation

Responsibilities
- implement only the approved story using packet authority order
- follow strict TypeScript, lint, and verification requirements
- report ambiguity instead of inventing uncited behavior

Forbidden Actions
- do not broaden scope beyond the approved story boundary or allowed_touch_points
- do not add packet extraction behavior unless the approved story explicitly owns it
- do not implement story-author/story-review handoff mechanics

Required Inputs
- active packet content with authoritative spec references
- approved story scope, non-scope, and acceptance criteria
- allowed_touch_points and required test list

Required Outputs
- scoped code and test changes within approved touch points
- verification command results with pass/fail status
- assumptions and blockers note

Verification Checklist
- confirm required inputs are present and current
- confirm forbidden actions are not introduced
- confirm required outputs are produced for handoff

### code-review

Responsibilities
- review correctness, scope fit, and required-test coverage
- verify no forbidden role sections or lifecycle changes were introduced
- confirm canonical packet behavior remains enforceable

Forbidden Actions
- do not author new feature scope outside the reviewed patch
- do not bypass required tests, packet verification, or CI gate evidence
- do not approve scope drift that violates story boundary

Required Inputs
- proposed patch limited to approved touch points
- active packet, approved story, and cited spec references
- verification and test evidence for required commands

Required Outputs
- review findings prioritized by correctness and scope compliance
- clear disposition for findings (fix/defer/block) with rationale
- review closure recommendation for Session Orchestrator handoff

Verification Checklist
- confirm required inputs are present and current
- confirm forbidden actions are not introduced
- confirm required outputs are produced for handoff

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

<!-- prettier-ignore-end -->
