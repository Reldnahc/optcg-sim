<!-- agent-packet:story-id CARD-006 -->
<!-- agent-packet:story-path stories/approved/CARD-006-real-implemented-primitive-fixture-coverage.yaml -->
<!-- agent-packet:story-sha256 591530cb3020889845cc6d20908f32d522160ecc39057e9f44cca3639eac26f9 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: CARD-006
Epic ID: CARD-006
Title: Add real fixture coverage for implemented primitives
Type: implementation
Area: cards
Primary Concern: verification

## Why

Promote a small reviewed set of real Poneglyph-backed fixtures into implemented-primitive regression coverage only where the card's complete printed behavior is already supported by the current engine runtime, so previously implemented primitives are tested against real card data without granting partial or ambiguous gameplay support.

## Authoritative Spec References

- 02-engine-mechanics.s017 (Battle sequence)
- 02-engine-mechanics.s018 (Attack Step)
- 02-engine-mechanics.s019 (Block Step)
- 02-engine-mechanics.s021 (Damage Step)
- 02-engine-mechanics.s023 (Damage processing)
- 02-engine-mechanics.s025 (Keyword behavior)
- 03-game-state-events-decisions.s005 (Event journal)
- 03-game-state-events-decisions.s015 (Legal actions)
- 03-game-state-events-decisions.s020 (State hashing)
- 04-effect-runtime.s005 (Card implementation support)
- 05-effect-dsl-reference.s001 (Effect DSL Reference)
- 05-effect-dsl-reference.s002 (Purpose)
- 05-effect-dsl-reference.s003 (Top-level definition)
- 05-effect-dsl-reference.s004 (Effect block)
- 05-effect-dsl-reference.s008 (Targets)
- 05-effect-dsl-reference.s012 (Effects)
- 05-effect-dsl-reference.s019 (Example: On Play draw 1)
- 05-effect-dsl-reference.s020 (Example: Activate Main with cost and up-to target)
- 05-effect-dsl-reference.s022 (Poneglyph text-to-DSL pipeline)
- 05-effect-dsl-reference.s029 (Schema coverage policy)
- 06-visibility-security.s003 (Player zone visibility)
- 06-visibility-security.s004 (PlayerView shape)
- 06-visibility-security.s006 (Effect event visibility)
- 06-visibility-security.s007 (Legal-action visibility)
- 06-visibility-security.s017 (Filter checklist)
- 09-card-data-and-support-policy.s003 (Data ownership model)
- 09-card-data-and-support-policy.s010 (Card implementation record)
- 09-card-data-and-support-policy.s011 (Support policy by mode)
- 09-card-data-and-support-policy.s012 (Deck validation)
- 09-card-data-and-support-policy.s013 (Match-time card manifest)
- 09-card-data-and-support-policy.s014 (Canonical Poneglyph normalization)
- 09-card-data-and-support-policy.s019 (Failure behavior)
- 09-card-data-and-support-policy.s022 (Security checklist)
- 09-card-data-and-support-policy.s023 (Concrete Poneglyph API contract)
- 09-card-data-and-support-policy.s024 (Source hash and behavior hash)
- 09-card-data-and-support-policy.s025 (Poneglyph fixture-backed implementation tests)
- 17-first-card-fixtures.s003 (Fixture policy)
- 17-first-card-fixtures.s004 (Recommended 20-card coverage set)
- 17-first-card-fixtures.s007 (Real Poneglyph-backed fixtures added in v3)
- 17-first-card-fixtures.s008 (Updated first fixture slice)
- 19-poneglyph-api-contract.s002 (Purpose)
- 19-poneglyph-api-contract.s003 (Source fixtures in this package)
- 19-poneglyph-api-contract.s005 (Do not use search results for match manifests)
- 19-poneglyph-api-contract.s007 (Normalized card shape)
- 19-poneglyph-api-contract.s010 (Zod schema policy)
- 19-poneglyph-api-contract.s012 (Match creation behavior)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

### 02-engine-mechanics.s017 (Battle sequence)

A battle is a sub-state inside Main Phase.

### 02-engine-mechanics.s018 (Attack Step)

1. Attacker rests an active Leader or Character.
2. Attacker selects target: opponent Leader or one rested opponent Character.
3. Emit `attackDeclared`.
4. Queue attacker's `[When Attacking]` effects in the attack timing window.
5. Resolve that attack timing window.
6. If attacker or target left its zone or is no longer a legal battle participant, skip to End of Battle.

### 02-engine-mechanics.s019 (Block Step)

1. Defender may activate one legal `[Blocker]`, unless blocking is prohibited.
2. Blocker rests and becomes the current target.
3. Emit `blockerActivated`.
4. Queue `[On Block]` effects.
5. Resolve the block timing window.
6. If attacker or current target left its zone or is no longer a legal battle participant, skip to End of Battle.

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

### 04-effect-runtime.s005 (Card implementation support)

Effects load only from supported implementation records.

```ts
type CardSupportStatus =
  | "vanilla-confirmed"
  | "implemented-dsl"
  | "implemented-custom"
  | "unsupported"
  | "banned-in-simulator";
```

A missing effect definition for a non-vanilla card is an error in normal play. Only dev/sandbox modes may allow unsupported cards.

### 05-effect-dsl-reference.s001 (Effect DSL Reference)

Effect definitions are keyed by **Poneglyph base card ID**. Poneglyph supplies the printed card text and metadata; the simulator DSL supplies executable rule behavior. The DSL should store a source-text hash so a Poneglyph text change can trigger implementation review.

### 05-effect-dsl-reference.s002 (Purpose)

The effect DSL is a serializable card-effect definition language. It should cover most cards through composable primitives and route unusual cards to tested custom handlers.

**v6 contract:** [`contracts/effect-dsl.schema.json`](contracts/effect-dsl.schema.json) is the canonical validation schema for JSON fixtures, and [`contracts/canonical-types.ts`](contracts/canonical-types.ts) is the canonical TypeScript contract. Markdown snippets below are explanatory.

Definitions live in the repo for Phase 1 so they can be reviewed, diffed, tested, and versioned.

### 05-effect-dsl-reference.s003 (Top-level definition)

```ts
interface EffectDefinition {
  cardId: CardId;
  implementationStatus: CardSupportStatus;
  effects: EffectBlock[];
  metadata: EffectDefinitionMetadata;
}

interface EffectDefinitionMetadata {
  sourceTextHash: string;
  rulesVersion: string;
  effectDefinitionsVersion: string;
  tested: boolean;
  reviewer?: string;
  notes?: string;
}
```

### 05-effect-dsl-reference.s004 (Effect block)

```ts
interface EffectBlock {
  id: string;
  category: "auto" | "activate" | "permanent" | "replacement";
  trigger: Trigger;
  condition?: Condition;
  conditionTiming?: "activation" | "resolution" | "both";
  cost?: Cost;
  optional?: boolean;
  oncePerTurn?: boolean;
  failurePolicy?: FailurePolicy;
  sourcePresencePolicy?: SourcePresencePolicy;
  effect: Effect;
}
```

### 05-effect-dsl-reference.s008 (Targets)

Use `TargetRequest` when a player may choose and `Target` for source-relative automatic targets.

```ts
type Target =
  | { type: "self" }
  | { type: "myLeader" }
  | { type: "opponentLeader" }
  | { type: "attacker" }
  | { type: "attackTarget" }
  | { type: "blocker" }
  | { type: "triggerCard" }
  | { type: "all"; zone: Zone; player: PlayerRef; filter?: CardFilter }
  | { type: "choose"; request: TargetRequest };

interface TargetRequest {
  timing: "onActivation" | "onResolution";
  chooser: PlayerRef;
  zone: Zone;
  player: PlayerRef;
  filter?: CardFilter;
  min: number;
  max: number;
  allowFewerIfUnavailable: boolean;
  visibility?: "public" | "privateToChooser";
}
```

### 05-effect-dsl-reference.s012 (Effects)

```ts
type Effect =
  // Card movement
  | { type: "draw"; count: number; player: PlayerRef }
  | { type: "drawUpTo"; count: number; player: PlayerRef }
  | { type: "search"; request: SearchRequest }
  | { type: "lookAtTop"; player: PlayerRef; count: number }
  | {
      type: "revealFromZone";
      player: PlayerRef;
      zone: Zone;
      count?: number;
      filter?: CardFilter;
      to: Visibility;
    }
  | {
      type: "moveSelected";
      selection: SelectionId;
      from: Zone | SelectionSetId;
      to: Zone;
      position?: "top" | "bottom";
    }
  | {
      type: "putRemaining";
      zone: Zone;
      position: "top" | "bottom";
      order: "ownerChoice" | "chooserChoice" | "random";
    }
  | { type: "shuffleDeck"; player: PlayerRef }
  | {
      type: "bounce";
      target: Target;
      destination: "hand" | "deckTop" | "deckBottom";
    }
  | { type: "trash"; target: Target }
  | { type: "ko"; target: Target }
  | {
      type: "play";
      source: Zone;
      player: PlayerRef;
      filter: CardFilter;
      costModifier?: number;
    }
  | {
      type: "trashFromHand";
      player: PlayerRef;
      count: number;
      filter?: CardFilter;
      chooser: PlayerRef;
    }

  // Power/cost modification
  | { type: "modifyPower"; target: Target; value: number; duration: Duration }
  | { type: "setPowerToZero"; target: Target; duration: Duration }
  | { type: "setBasePower"; target: Target; value: number; duration: Duration }
  | {
      type: "modifyCost";
      filter: CardFilter;
      value: number;
      duration: Duration;
      player: PlayerRef;
    }
  | { type: "setBaseCost"; target: Target; value: number; duration: Duration }

  // State and keywords
  | { type: "rest"; target: Target }
  | { type: "activate"; target: Target }
  | {
      type: "giveKeyword";
      target: Target;
      keyword: Keyword;
      duration: Duration;
    }
  | {
      type: "removeKeyword";
      target: Target;
      keyword: Keyword;
      duration: Duration;
    }

  // DON!!
  | { type: "addDon"; count: number; player: PlayerRef }
  | { type: "attachDon"; target: Target; count: number; player: PlayerRef }
  | { type: "returnDon"; count: number; player: PlayerRef }

  // Life and damage
  | {
      type: "addLife";
      count: number;
      player: PlayerRef;
      source: "deck" | "hand" | "trash";
      faceUp?: boolean;
    }
  | { type: "damage"; target: "leader"; player: PlayerRef; count: number }

  // Restrictions/protections
  | { type: "invalidateEffects"; target: Target; duration: Duration }
  | { type: "protectFromKO"; target: Target; duration: Duration }
  | { type: "cannotAttack"; target: Target; duration: Duration }
  | { type: "cannotBlock"; target: Target; duration: Duration }
  | { type: "cannotBeAttacked"; target: Target; duration: Duration }
  | {
      type: "cannotBeBlockedBy";
      target: Target;
      filter: CardFilter;
      duration: Duration;
    }

  // Composition
  | { type: "sequence"; effects: SequencedEffect[] }
  | {
      type: "choice";
      chooser: PlayerRef;
      options: EffectOption[];
      min: number;
      max: number;
    }
  | { type: "conditional"; if: Condition; then: Effect; else?: Effect }
  | {
      type: "forEachMatch";
      zone: Zone;
      player: PlayerRef;
      filter: CardFilter;
      effect: Effect;
    }
  | { type: "repeat"; count: number; effect: Effect }

  // Replacement/custom
  | { type: "replacement"; when: ReplacementTrigger; instead: Effect }
  | { type: "custom"; handler: string };
```

### 05-effect-dsl-reference.s019 (Example: On Play draw 1)

```json
{
  "cardId": "OP01-015",
  "implementationStatus": "implemented-dsl",
  "effects": [
    {
      "id": "OP01-015:auto-on-play-1",
      "category": "auto",
      "trigger": { "type": "onPlay" },
      "optional": false,
      "oncePerTurn": false,
      "sourcePresencePolicy": "mustRemainInSameZone",
      "effect": { "type": "draw", "count": 1, "player": "self" }
    }
  ],
  "metadata": {
    "sourceTextHash": "sha256:...",
    "rulesVersion": "2026-01-16",
    "effectDefinitionsVersion": "0.1.0",
    "tested": true
  }
}
```

### 05-effect-dsl-reference.s020 (Example: Activate Main with cost and up-to target)

```json
{
  "cardId": "OP01-040",
  "implementationStatus": "implemented-dsl",
  "effects": [
    {
      "id": "OP01-040:activate-main-1",
      "category": "activate",
      "trigger": { "type": "activateMain" },
      "optional": true,
      "oncePerTurn": true,
      "sourcePresencePolicy": "mustRemainInSameZone",
      "cost": {
        "type": "sequence",
        "costs": [
          { "type": "restDon", "count": 2, "chooser": "self" },
          { "type": "restSelf" }
        ]
      },
      "failurePolicy": "doAsMuchAsPossible",
      "effect": {
        "type": "ko",
        "target": {
          "type": "choose",
          "request": {
            "timing": "onResolution",
            "chooser": "self",
            "zone": "characterArea",
            "player": "opponent",
            "filter": { "cost": { "op": "lte", "value": 3 } },
            "min": 0,
            "max": 1,
            "allowFewerIfUnavailable": true,
            "visibility": "public"
          }
        }
      }
    }
  ],
  "metadata": {
    "sourceTextHash": "sha256:...",
    "rulesVersion": "2026-01-16",
    "effectDefinitionsVersion": "0.1.0",
    "tested": true
  }
}
```

### 05-effect-dsl-reference.s022 (Poneglyph text-to-DSL pipeline)

The original effect-system plan defined three authoring phases:

1. Manual DSL definitions written by developers.
2. Custom TypeScript handlers for cards that cannot be expressed in DSL.
3. Generated DSL candidates from Poneglyph printed card text, always requiring human review before merge.

Generated definitions must never be deployed blindly. The pipeline may read Poneglyph card text and produce a candidate `EffectDefinition`, but a reviewer must verify the card against official text/rulings, update tests, and approve the source-text hash.

```ts
interface EffectDefinitionMetadata {
  cardId: CardId; // Poneglyph base card ID
  source: "poneglyph";
  sourceTextHash: string;
  generatedBy?: "manual" | "rule-parser" | "llm-assisted";
  reviewedBy?: string;
  reviewedAt?: string;
}
```

### 05-effect-dsl-reference.s029 (Schema coverage policy)

`contracts/effect-dsl.schema.json` is the executable JSON fixture contract.
TypeScript/spec primitives outside that JSON schema are planned/not
fixture-authorable until schema validation and fixtures exist.

Schema-supported fixture subset:

- trigger: onPlay
- trigger: whenAttacking
- trigger: onOpponentAttack
- trigger: onBlock
- trigger: onKO
- trigger: endOfYourTurn
- trigger: endOfOpponentTurn
- trigger: trigger
- trigger: activateMain
- trigger: main
- trigger: counter
- trigger: permanent
- trigger: startOfGame
- trigger: startOfYourTurn
- trigger: startOfOpponentTurn
- trigger: startOfMainPhase
- trigger: endOfBattle
- trigger: donAttach
- trigger: custom
- condition: yourTurn
- condition: attachedDonCount
- cost: restDon
- cost: restSelf
- cost: sequence
- target: self, myLeader, opponentLeader, attacker, attackTarget, blocker,
  triggerCard, all, choose
- duration: thisAction, thisBattle, thisTurn, whileSourceOnField, permanent
- effect: draw
- effect: ko
- effect: modifyPower
- effect: sequence
- effect: custom
- card filters: cardIds, names, nameContains, nameNot, categories, colorsAny,
  colorsAll, typesAny, typesAll, attributesAny, attributesAll, cost, power,
  counter, hasKeywords, lacksKeywords, state, owner, controller, excludeSelf,
  custom

Planned/not fixture-authorable until schema coverage exists:

- condition: donCount
- condition: opponentTurn
- condition: lifeCount
- condition: fieldCount
- condition: handCount
- condition: trashCount
- condition: hasCardInZone
- condition: attackTarget
- condition: cardState
- condition: sourceStillInZone
- condition: eventPayload
- condition: and, or, not, custom
- cost: returnDon
- cost: trashFromHand
- cost: trashSelf
- cost: trashFromField
- cost: discard
- cost: chooseOne
- cost: custom
- duration: untilEndOfTurn
- duration: untilStartOfNextTurn
- duration: whileConditionTrue
- effect: drawUpTo
- effect: search
- effect: lookAtTop
- effect: revealFromZone
- effect: revealTop
- effect: selectFromSet
- effect: selectCards
- effect: moveSelected with position
- effect: putRemaining
- effect: shuffleDeck
- effect: bounce
- effect: trash
- effect: play
- effect: playSelected
- effect: returnUnselectedToDeck
- effect: trashFromHand
- effect: setPowerToZero
- effect: setBasePower
- effect: modifyCost
- effect: setBaseCost
- effect: rest
- effect: activate
- effect: giveKeyword
- effect: removeKeyword
- effect: addDon
- effect: attachDon
- effect: returnDon
- effect: addLife
- effect: damage
- effect: invalidateEffects
- effect: protectFromKO
- effect: cannotAttack
- effect: cannotBlock
- effect: cannotBeAttacked
- effect: cannotBeBlockedBy
- effect: choice
- effect: conditional
- effect: forEachMatch
- effect: repeat
- effect: replacement

new fixture-authorable primitives must add schema coverage and validation fixtures in the same story that makes the primitive authorable.

### 06-visibility-security.s003 (Player zone visibility)

| Zone           | Self view                        | Opponent view                    |
| -------------- | -------------------------------- | -------------------------------- |
| Deck           | Count only                       | Count only                       |
| DON!! Deck     | Count only / cosmetic art policy | Count only / cosmetic art policy |
| Hand           | Full card data                   | Count only                       |
| Trash          | Full ordered public data         | Full ordered public data         |
| Leader Area    | Full public data                 | Full public data                 |
| Character Area | Full public data                 | Full public data                 |
| Stage Area     | Full public data                 | Full public data                 |
| Cost Area      | Full public DON!! state          | Full public DON!! state          |
| Life Area      | Count + face-up cards only       | Count + face-up cards only       |
| No Zone        | Only if revealed to that player  | Only if revealed to that player  |

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

### 06-visibility-security.s006 (Effect event visibility)

The game log can leak information if not filtered.

```ts
interface EffectEvent {
  id: string;
  sourceCardId: CardId;
  sourceInstanceId?: InstanceId;
  effectId: string;
  description: string;
  choices?: PublicChoiceSummary;
  visibleTo: "both" | PlayerId[] | "replayOnly";
}
```

Examples:

- Public target selection: visible to both.
- Searching deck: opponent sees "Opponent is searching deck" and maybe count, not card IDs.
- Choosing a card from hand to trash: opponent sees the resulting public trash card, not pre-choice hand options.

### 06-visibility-security.s007 (Legal-action visibility)

Legal actions can leak hidden information. The view should expose only what that recipient is entitled to know.

Examples:

- The defender should not see exactly why the server auto-passed the counter window.
- A player may see their own legal counter cards.
- The opponent sees only that the game progressed, not whether no counters existed or auto-pass was enabled.

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

### 09-card-data-and-support-policy.s003 (Data ownership model)

| Data                    | Source / authority                                            | Notes                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Base card ID            | Poneglyph                                                     | This is the canonical `cardId` used by decks, effects, state, and DB rows.                                                                                                     |
| Printed name            | Poneglyph                                                     | Display and search.                                                                                                                                                            |
| Category                | Poneglyph                                                     | Leader, Character, Event, Stage, DON!!.                                                                                                                                        |
| Color                   | Poneglyph                                                     | Used by deck validation and display.                                                                                                                                           |
| Cost/life/power/counter | Poneglyph                                                     | Engine reads this only after server-side validation.                                                                                                                           |
| Type/attribute          | Poneglyph                                                     | Used by filters and effects.                                                                                                                                                   |
| Printed card text       | Poneglyph                                                     | Used for display, text hashes, effect-authoring pipeline, and human review.                                                                                                    |
| Images and variants     | Poneglyph                                                     | Cosmetic display only. No gameplay authority.                                                                                                                                  |
| Effect DSL definitions  | Simulator overlay                                             | Local JSON/JSONC/YAML keyed by Poneglyph card ID.                                                                                                                              |
| Custom handler IDs      | Simulator overlay                                             | Used only for cards that cannot be represented by DSL.                                                                                                                         |
| Ruling overrides        | Simulator overlay                                             | Local rules/ruling notes keyed by Poneglyph card ID.                                                                                                                           |
| Card support status     | Simulator overlay                                             | Determines if a card can be used in each play mode.                                                                                                                            |
| Banlist / restrictions  | Poneglyph legality data plus simulator overlay/format service | Poneglyph is the source of truth for per-format card legality status and copy-limit inputs; simulator overlays add unsupported-card policy and any platform-local enforcement. |

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

### 09-card-data-and-support-policy.s011 (Support policy by mode)

| Status                |              Dev sandbox | Unranked / custom |                         Ranked |
| --------------------- | -----------------------: | ----------------: | -----------------------------: |
| `vanilla-confirmed`   |                  Allowed |           Allowed |                        Allowed |
| `implemented-dsl`     |                  Allowed |           Allowed |                        Allowed |
| `implemented-custom`  |                  Allowed | Allowed if tested | Allowed if tested and reviewed |
| `unsupported`         |     Allowed with warning |          Rejected |                       Rejected |
| `banned-in-simulator` | Rejected unless override |          Rejected |                       Rejected |

Missing overlay records should fail closed in public modes. A non-vanilla Poneglyph card without support metadata is treated as `unsupported`.

### 09-card-data-and-support-policy.s012 (Deck validation)

Deck validation resolves and validates against Poneglyph IDs, Poneglyph legality records, and simulator support metadata. Poneglyph is the canonical external source for format/card legality inputs such as legal status, bans, and copy limits; the simulator may only layer unsupported-card policy or platform-specific constraints on top.

```ts
interface DeckValidationResult {
  valid: boolean;
  errors: DeckValidationError[];
  warnings: DeckValidationWarning[];
  resolvedCards: ResolvedDeckCard[];
  versions: {
    cardDataVersion: string;
    effectDefinitionsVersion: string;
    overlayVersion: string;
    banlistVersion: string;
  };
}
```

Validation checks:

- Leader count and leader identity.
- Main deck size.
- DON!! deck size.
- Leader/color restrictions.
- Per-card copy limits by Poneglyph base `cardId`.
- Official format restrictions.
- Simulator-specific bans.
- Unsupported-card status.
- Variant IDs resolve to valid Poneglyph variants for the base card.

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

### 09-card-data-and-support-policy.s014 (Canonical Poneglyph normalization)

The Poneglyph adapter emits `ResolvedCard` from `contracts/canonical-types.ts`. Important normalization rules:

- `attribute` values become `attributes: Attribute[]`; never collapse to a singular attribute.
- `color` values become `colors: CardColor[]`; multi-color cards preserve all colors.
- `variants[].index` becomes `variantIndex`.
- `variantKey = `${cardId}:v${variantIndex}``.
- Missing market prices, product set codes, or image URLs are allowed display gaps and must not fail gameplay resolution.
- Search endpoint DTOs are never accepted as manifest card details. Only detail/batch card payloads can become `ResolvedCard`.
- `sourceTextHash` covers printed effect/trigger text used for implementation drift.
- `behaviorHash` covers stats, type line, effect, trigger, official FAQ, errata, and any source field that can alter behavior.

### 09-card-data-and-support-policy.s019 (Failure behavior)

If Poneglyph is unavailable:

| Situation                                         | Behavior                                                     |
| ------------------------------------------------- | ------------------------------------------------------------ |
| Deck builder display card not cached              | Show degraded/error state; retry.                            |
| Unranked/custom match start with all cards cached | Start normally from cache.                                   |
| Match start requires uncached card                | Fail to start with clear error.                              |
| Ranked queue                                      | Reject deck if all cards cannot be resolved and validated.   |
| In-progress match                                 | Continue from match snapshot; never refetch rules mid-match. |

Poneglyph downtime should not affect matches already created because card data was resolved and snapshotted at match creation.

### 09-card-data-and-support-policy.s022 (Security checklist)

- Server never trusts card metadata from client.
- Poneglyph response is schema-validated before cache write.
- Overlay merge is versioned.
- Match snapshots resolved cards before play starts.
- Unsupported cards are rejected in public modes.
- Variant IDs are cosmetic and never affect rules.
- Poneglyph text hash changes trigger implementation review.
- Replays store versions and manifest hashes.

### 09-card-data-and-support-policy.s023 (Concrete Poneglyph API contract)

The provided OpenAPI document is captured in [`fixtures/poneglyph/openapi.optcg-api-0.1.0.json`](fixtures/poneglyph/openapi.optcg-api-0.1.0.json). The exact adapter contract is now split into [`19-poneglyph-api-contract.md`](19-poneglyph-api-contract.md).

Key implementation rules from the API contract:

- Use `GET /v1/cards/{card_number}` or `POST /v1/cards/batch` for match/deck resolution.
- Batch requests accept at most 60 `card_numbers`, so deck resolution must chunk unique IDs.
- Do not use `/v1/search` results as authoritative card details. Search variants can be filtered by query predicates and the result shape lacks some fields needed for implementation review.
- Treat `legality` as an input to format validation, not as the only authority. Merge it with simulator support status and banlist overlays.
- Keep `official_faq` and variant `errata` in implementation review data because they can change effect behavior.

### 09-card-data-and-support-policy.s024 (Source hash and behavior hash)

Use both hashes:

```ts
interface CardImplementationRecord {
  cardId: CardId;
  status: CardSupportStatus;
  effectDefinitionId?: string;
  customHandlerIds?: string[];
  tested: boolean;
  rulesVersion: string;
  cardDataVersion: string;
  sourceTextHash: string; // effect + trigger text only
  behaviorHash: string; // stats + type line + effect + trigger + FAQ + errata
  notes?: string;
}
```

`OP01-060` demonstrates why `behaviorHash` matters: the FAQ clarifies that an unplayed revealed card returns to the top of the deck face-down. A change to that FAQ would affect hidden-information behavior even if the printed effect text did not change.

### 09-card-data-and-support-policy.s025 (Poneglyph fixture-backed implementation tests)

Use these local fixtures before live HTTP exists:

```text
fixtures/poneglyph/openapi.optcg-api-0.1.0.json
fixtures/poneglyph/cards/OP01-060.donquixote-doflamingo.json
fixtures/poneglyph/cards/OP05-091.rebecca.json
```

Required tests:

```text
PON-001 validate OpenAPI fixture parses and expected endpoints exist.
PON-002 validate OP01-060 and OP05-091 detail payloads with Zod.
PON-003 normalize variant indexes into generated variant keys.
PON-004 preserve nullable product and market fields without crashing.
PON-005 compute stable sourceTextHash and behaviorHash.
PON-006 reject missing card IDs from batch resolution.
PON-007 chunk batch resolution into groups of <=60 IDs.
```

### 17-first-card-fixtures.s003 (Fixture policy)

- Use real-looking Poneglyph base IDs if testing with actual card data, or clearly prefixed fixture IDs if avoiding real cards.
- Each non-vanilla fixture has an implementation record.
- Each fixture has at least one test.
- The pool should be small enough that every interaction is understood.

### 17-first-card-fixtures.s004 (Recommended 20-card coverage set)

| Slot | Fixture purpose                  | Mechanics covered                                          |
| ---: | -------------------------------- | ---------------------------------------------------------- |
|    1 | Vanilla Leader                   | Setup, life, attacks, leader damage.                       |
|    2 | Vanilla Character 2-cost         | Basic play, cost payment, summoning sickness.              |
|    3 | Vanilla Character high power     | Character battle and K.O.                                  |
|    4 | Vanilla Stage                    | Stage play and stage replacement.                          |
|    5 | Character with counter value     | Counter step, hand trash, temporary battle power.          |
|    6 | `[Blocker]` Character            | Block window, blocker rests, target redirection.           |
|    7 | `[Rush]` Character               | Can attack turn played.                                    |
|    8 | `[Rush: Character]` Character    | Can attack rested Characters but not Leader on play turn.  |
|    9 | `[Double Attack]` Character      | Multiple damage points and damage deferral.                |
|   10 | `[Banish]` Character             | Replacement of life-to-hand/trigger path.                  |
|   11 | `[On Play] Draw 1`               | Auto trigger, draw event, rule processing.                 |
|   12 | `[When Attacking]` Draw/discard  | Attack trigger, sequence effect, private discard decision. |
|   13 | `[On K.O.]` Draw 1               | Source leaves field, resolves from trash/last known info.  |
|   14 | `[Trigger]` Life effect          | Reveal from life, no-zone resolution, trash after trigger. |
|   15 | `[Counter]` Event + power        | Counter event cost/trash/effect.                           |
|   16 | `[Main]` Event K.O. low-cost     | Main event play, target selection, K.O. effect.            |
|   17 | Permanent +1000 during your turn | Computed continuous effect, no state mutation.             |
|   18 | Search/look top cards            | Hidden-information private choice and reveal policy.       |
|   19 | Protection/replacement effect    | Replacement priority and one-use-per-process rule.         |
|   20 | Custom-handler card              | Escape hatch, handler registry, handler tests.             |

### 17-first-card-fixtures.s007 (Real Poneglyph-backed fixtures added in v3)

Use these two real card payloads immediately because they test the card-data adapter and effect DSL more effectively than pure fake cards.

| Card                             | Fixture path                                                   | Why it is included early                                                                                                                                    |
| -------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OP01-060` Donquixote Doflamingo | `fixtures/poneglyph/cards/OP01-060.donquixote-doflamingo.json` | Tests variant index `0`, source-attached DON!! condition, paid attack trigger, public reveal, optional effect-play rested, and FAQ-driven face-down return. |
| `OP05-091` Rebecca               | `fixtures/poneglyph/cards/OP05-091.rebecca.json`               | Tests nullable variant fields, `[Blocker]`, trash-to-hand, then hand-to-field sequence, `other than [Rebecca]`, and FAQ-confirmed same-card play.           |

These do not replace the 20-card coverage set. They anchor it to actual Poneglyph payloads so the adapter, effect DSL, and tests evolve together.

### 17-first-card-fixtures.s008 (Updated first fixture slice)

For the first implementation sprint, use this tighter subset:

```text
1. FX-LEADER-VANILLA      - fake vanilla leader for minimal combat
2. FX-CHAR-VANILLA        - fake vanilla character for play/K.O.
3. FX-BLOCKER             - fake blocker if Rebecca is not yet loaded
4. FX-ONPLAY-DRAW         - simple on-play draw primitive
5. OP01-060               - real Doflamingo fixture, implemented after transient reveal primitives
6. OP05-091               - real Rebecca fixture, implemented after sequence-local selections
```

The fake cards keep the CLI loop simple. The real cards prove that the Poneglyph adapter and DSL are not drifting away from actual card payloads.

### 19-poneglyph-api-contract.s002 (Purpose)

This document tightens the `@optcg/cards` implementation against the provided Poneglyph OpenAPI contract and real card payload examples. The original simulator plan says Poneglyph is the source of truth for printed card text, stats, images, variants, and metadata. This document makes that actionable without giving Poneglyph gameplay authority.

The engine never calls Poneglyph during effect resolution. `@optcg/cards` resolves Poneglyph data, validates it, normalizes it, merges simulator overlays, and produces a match-time manifest.

### 19-poneglyph-api-contract.s003 (Source fixtures in this package)

```text
fixtures/poneglyph/openapi.optcg-api-0.1.0.json
fixtures/poneglyph/cards/OP01-060.donquixote-doflamingo.json
fixtures/poneglyph/cards/OP05-091.rebecca.json
```

These fixtures should be used for contract tests and early implementation tests before live HTTP is wired in.

### 19-poneglyph-api-contract.s005 (Do not use search results for match manifests)

`/v1/search` returns card items with matching variants and pagination metadata. The OpenAPI description says `collapse=card` returns one item per matching card with `variants[]` filtered to matching prints, while `collapse=variant` returns one item per matching print. Search data is therefore a UI/search result shape, not a canonical card-detail shape.

Match creation must use `/v1/cards/{card_number}` or `/v1/cards/batch`, not `/v1/search`.

### 19-poneglyph-api-contract.s007 (Normalized card shape)

`@optcg/cards` should normalize Poneglyph records into an engine-safe `ResolvedCard`. Keep the original payload available for audit/debug, but the engine should read the normalized shape.

A critical rule for deck validation: `ResolvedCard.legality` is populated from Poneglyph and is the canonical external legality record the platform validates against. Queue eligibility, unsupported-card rejection, or platform-specific safety blocks may add stricter checks, but they must not invent a separate base legality source.

```ts
interface ResolvedCard {
  cardId: CardId; // from card_number, e.g. "OP05-091"
  language: string;
  name: string;
  category: CardCategory;
  set: string;
  block?: string;
  released: boolean;
  releasedAt?: string;
  rarity?: string;
  colors: Color[];
  cost?: number;
  power?: number;
  counter?: number;
  life?: number;
  attributes: Attribute[];
  types: string[];
  effectText?: string;
  triggerText?: string;
  printedKeywords: Keyword[];
  variants: ResolvedCardVariant[];
  legality: Record<string, PoneglyphLegalityRecord>;
  officialFaq: PoneglyphOfficialFaq[];
  errata: NormalizedErrata[];
  sourceTextHash: string;
  behaviorHash: string;
  support: CardImplementationRecord;
}
```

### 19-poneglyph-api-contract.s010 (Zod schema policy)

Runtime validation should be strict about required gameplay fields and tolerant of additive non-breaking fields.

```ts
const PoneglyphOfficialFaqSchema = z.object({
  question: z.string(),
  answer: z.string(),
  updated_on: z.string(),
});

const PoneglyphVariantSchema = z
  .object({
    index: z.number().int(),
    name: z.string().nullable(),
    label: z.string().nullable(),
    artist: z.string().nullable(),
    product: z
      .object({
        id: z.string().nullable(),
        slug: z.string().nullable(),
        name: z.string().nullable(),
        set_code: z.string().nullable(),
        released_at: z.string().nullable(),
      })
      .passthrough(),
    images: z
      .object({
        stock: z
          .object({ full: z.string().nullable(), thumb: z.string().nullable() })
          .passthrough(),
        scan: z
          .object({
            display: z.string().nullable(),
            full: z.string().nullable(),
            thumb: z.string().nullable(),
          })
          .passthrough(),
      })
      .passthrough(),
    errata: z.array(z.unknown()),
    market: z
      .object({
        tcgplayer_url: z.string().nullable(),
        market_price: z.string().nullable(),
        low_price: z.string().nullable(),
        mid_price: z.string().nullable(),
        high_price: z.string().nullable(),
      })
      .passthrough(),
  })
  .passthrough();

const PoneglyphCardDetailSchema = z
  .object({
    card_number: z.string(),
    name: z.string(),
    language: z.string(),
    set: z.string(),
    set_name: z.string(),
    released_at: z.string().nullable(),
    released: z.boolean(),
    card_type: z.string(),
    rarity: z.string().nullable(),
    color: z.array(z.string()),
    cost: z.number().int().nullable(),
    power: z.number().int().nullable(),
    counter: z.number().int().nullable(),
    life: z.number().int().nullable(),
    attribute: z.array(z.string()).nullable(),
    types: z.array(z.string()),
    effect: z.string().nullable(),
    trigger: z.string().nullable(),
    block: z.string().nullable(),
    variants: z.array(PoneglyphVariantSchema),
    legality: z.record(
      z
        .object({
          status: z.string(),
          banned_at: z.string().optional(),
          reason: z.string().optional(),
          max_copies: z.number().int().optional(),
          paired_with: z.array(z.string()).optional(),
        })
        .passthrough(),
    ),
    available_languages: z.array(z.string()),
    official_faq: z.array(PoneglyphOfficialFaqSchema),
  })
  .passthrough();
```

Contract tests should also hash the OpenAPI document and alert maintainers if it changes.

### 19-poneglyph-api-contract.s012 (Match creation behavior)

1. Collect unique base card IDs from both leaders, main decks, and DON!! decks.
2. Resolve through batch endpoint in chunks of 60.
3. Validate and normalize each returned card.
4. Fail if any requested card appears in `missing`.
5. Merge simulator overlays.
6. Reject unsupported, stale, unreleased, or format-illegal cards according to mode.
7. Snapshot the full match manifest, including hash/version fields.

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Each package must expose consistent task names where applicable:

- `build`
- `typecheck`
- `lint`
- `test`
- `test:watch`
- `coverage`

Integration-heavy packages may additionally expose:

- `test:integration`
- `test:replay`
- `test:contracts`
- `test:hidden-info`

At the root, the workspace must provide:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm coverage
pnpm verify
```

`pnpm verify` is the canonical local pre-push command and must run the same core checks as the main merge CI pipeline.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

The repo must define a root `tsconfig.base.json` and package-level `tsconfig.json` files extending it.

Required compiler settings for implementation packages:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noImplicitOverride": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "useUnknownInCatchVariables": true,
    "noEmitOnError": true
  }
}
```

Strongly preferred unless a package-specific exception is justified in writing:

- `verbatimModuleSyntax`
- `importsNotUsedAsValues = error`
- `noUnusedLocals`
- `noUnusedParameters`

The repo must not rely on broad TypeScript escape hatches. The following require explicit justification in code review and should be lint-restricted where possible:

- `any`
- non-null assertion (`!`)
- `@ts-ignore`
- `@ts-nocheck`
- unchecked type assertions across trust boundaries

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

Own only real fixture-backed verification and overlay/effect-definition linkage for primitives already implemented before this story. Do not add new primitives, keyword behavior, effect DSL semantics, custom handlers, full catalog support, server/client/API/UI integration, live-network tests, or partial support for cards whose full printed behavior is not implemented.

## Scope

- audit the CARD-005 real effect-shape corpus plus existing OP01-060, OP05-091, and EB01-023 fixtures for cards whose entire printed effect text, trigger text, keyword text, FAQ-relevant behavior, and errata-relevant behavior are already supported by landed engine primitives
- keep EB01-023 as the baseline real implemented-dsl On Play draw regression and preserve its existing support.effectDefinitionId linkage
- add a small number of story-specific real Poneglyph card-detail fixtures with the CARD-003 fixture capture helper only when the CARD-005 corpus lacks an honest complete-card match for a primitive already implemented before this story
- permitted already-implemented primitive families for consideration are limited to exact no-choice draw DSL, simple reviewed Main Event no-choice draw, simple reviewed selected-target public Character K.O., and exact supported combat-keyword bodies such as Rush, Banish, or Blocker when the full card text has no unsupported extra behavior
- mark a real card as implemented-dsl or otherwise supported only when the card's full printed behavior is covered by existing runtime behavior and reviewed effect/keyword metadata; otherwise keep it unsupported and fail closed
- add or update simulator overlay metadata and effect definitions only for those exact fully supported real-card matches
- update the real-card DSL manifest fixture so newly supported real cards, if any, carry reviewed support metadata, sourceTextHash, behaviorHash, and effectDefinitionId linkage where applicable
- add cards-package tests proving selected implemented real fixtures validate, normalize, merge overlays, build manifest entries, link effect definitions, and avoid raw Poneglyph payload leakage
- add engine-core tests proving the supported real fixtures execute or participate through existing runtime/combat paths using only plain manifest/effect-definition data
- preserve unsupported/fail-closed tests for CARD-005 cards whose printed behavior includes unimplemented extra text, timings, triggers, choices, replacement effects, search/reveal, once-per-turn, permanent modifiers, multi-damage, Counter Events, Life Triggers, or custom-handler needs
- if no real complete-card match exists for a previously implemented primitive, record that as an ambiguity or blocker instead of inventing text, stripping text, or partially supporting the card

## Out of Scope

- full released-card catalog coverage
- live Poneglyph, live Redis, server, client, Postgres, browser, or UI requirements in tests or CI
- implementing Poneglyph search as production package API
- automatic effect generation from printed text
- new DSL primitives, new target shapes, new keyword behavior, custom handlers, optional effects, once-per-turn, replacement effects, search/reveal, Counter Events, Life Trigger changes, permanent modifiers, multi-damage, or new gameplay semantics
- marking a real card supported when only part of its printed behavior is implemented
- changing engine-core to import @optcg/cards, Poneglyph HTTP, Redis, Postgres, server, client, or UI code
- server, client, API, WebSocket, database, deck-builder, or UI integration

## Allowed Touch Points

<!-- prettier-ignore -->
- fixtures/poneglyph/cards/*.json
- fixtures/effect-dsl/valid/*.json
- fixtures/cards/real-card-dsl-match-card-manifest.json
- packages/cards/src/real-card-fixtures.ts
- packages/cards/src/real-card-fixtures.test.ts
- packages/engine-core/src/real-card-dsl-runtime.test.ts
- packages/engine-core/src/*real-card*.test.ts
- tests/integration/real-card-dsl-manifest-smoke.test.mjs
- stories/ambiguities/*.md
- stories/generated/CARD-006-real-implemented-primitive-fixture-coverage.yaml
- stories/approved/CARD-006-real-implemented-primitive-fixture-coverage.yaml
- agent-packets/CARD-006.md
- agent-packets/active.json

## Constraints

- story-review must pass before moving this story to approved or implementing
- use TDD by adding or extending failing real-fixture tests before changing support metadata or manifest fixtures
- use live Poneglyph only as an explicit local capture/discovery step; never make tests or CI call live Poneglyph
- keep Poneglyph data as printed/display metadata authority only
- keep simulator overlay as gameplay implementation authority
- do not add effect definitions or engine runtime behavior for unsupported or partial real fixtures
- fail closed on fixture schema, printed-text completeness, support-status, effect-definition linkage, runtime execution, hidden-information behavior, or deck-validation ambiguity
- do not weaken TypeScript strictness
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

## Required Tests

- package-local schema validation for any newly added real Poneglyph fixture
- package-local selected-card rationale assertion proving every newly supported real fixture is a complete match for already implemented behavior
- package-local overlay/manifest test proving support.status, support.effectDefinitionId/customHandlerIds, tested/version metadata, sourceTextHash, and behaviorHash are correct for newly supported real fixtures
- package-local assertion that unsupported CARD-005 fixtures do not gain effectDefinitionId, customHandlerIds, or implemented support accidentally
- package-local assertion that manifest effectDefinitions are not broadened beyond reviewed implemented real fixtures
- package-local assertion that manifest cards built from real fixtures do not contain raw Poneglyph payloads
- engine-core real-card runtime/combat tests for each newly supported primitive path using only plain checked-in manifest data
- package-boundary assertion or existing boundary test proving engine-core does not import @optcg/cards, Poneglyph HTTP, Redis, Postgres, server, client, or UI surfaces
- deck/loadout validation coverage proving newly supported cards are accepted where policy allows and unsupported non-vanilla real cards are rejected outside dev/sandbox policy
- root `corepack pnpm test -- packages/cards`
- engine-core command covering the real-card runtime/combat tests
- `corepack pnpm run packets:verify`
- full `corepack pnpm run verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- the story identifies which candidate real fixtures are complete matches for existing implemented primitives and records why selected cards are safe to support
- any newly supported real fixture is backed by a checked-in validated Poneglyph detail payload, reviewed overlay metadata, sourceTextHash, behaviorHash, and effectDefinitionId linkage when an effect definition is required
- cards with unsupported extra printed behavior remain unsupported and continue to fail closed outside allowed dev or sandbox policy
- the real-card manifest fixture contains only reviewed implemented support metadata and does not add effect definitions for unsupported fixtures
- engine-core real-card tests consume only plain manifest/effect-definition data and never import @optcg/cards or live card-data surfaces
- no test requires live Poneglyph, live Redis, server, client, Postgres, browser, or UI code
- if no honest complete-card match exists for a targeted implemented primitive, the story records the blocker or ambiguity instead of adding partial support

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
