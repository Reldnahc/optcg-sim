<!-- agent-packet:story-id CARD-007 -->
<!-- agent-packet:story-path stories/approved/CARD-007-real-implemented-mechanics-regression-set.yaml -->
<!-- agent-packet:story-sha256 488c2c38ad7fd3765c936e5c397699b69bf078a55ca99e819d57924fbd4305ed -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: CARD-007
Epic ID: CARD-007
Title: Add real implemented mechanics regression set
Type: implementation
Area: cards
Primary Concern: verification

## Why

Add a broader real-card regression set for mechanics already implemented and already represented by reviewed real fixtures, proving the cards-produced manifest exercises those mechanics through engine-core without adding new gameplay behavior or broadening unsupported card support.

## Authoritative Spec References

- 02-engine-mechanics.s017 (Battle sequence)
- 02-engine-mechanics.s018 (Attack Step)
- 02-engine-mechanics.s019 (Block Step)
- 02-engine-mechanics.s021 (Damage Step)
- 02-engine-mechanics.s023 (Damage processing)
- 02-engine-mechanics.s025 (Keyword behavior)
- 02-engine-mechanics.s045 (Parenthetical explanatory notes)
- 04-effect-runtime.s005 (Card implementation support)
- 04-effect-runtime.s012 (Player choices during effect resolution)
- 05-effect-dsl-reference.s001 (Effect DSL Reference)
- 05-effect-dsl-reference.s002 (Purpose)
- 05-effect-dsl-reference.s003 (Top-level definition)
- 05-effect-dsl-reference.s012 (Effects)
- 05-effect-dsl-reference.s019 (Example: On Play draw 1)
- 05-effect-dsl-reference.s022 (Poneglyph text-to-DSL pipeline)
- 05-effect-dsl-reference.s029 (Schema coverage policy)
- 09-card-data-and-support-policy.s003 (Data ownership model)
- 09-card-data-and-support-policy.s010 (Card implementation record)
- 09-card-data-and-support-policy.s011 (Support policy by mode)
- 09-card-data-and-support-policy.s012 (Deck validation)
- 09-card-data-and-support-policy.s013 (Match-time card manifest)
- 09-card-data-and-support-policy.s014 (Canonical Poneglyph normalization)
- 09-card-data-and-support-policy.s015 (Poneglyph text hash and stale-card review)
- 09-card-data-and-support-policy.s022 (Security checklist)
- 09-card-data-and-support-policy.s025 (Poneglyph fixture-backed implementation tests)
- 17-first-card-fixtures.s003 (Fixture policy)
- 17-first-card-fixtures.s004 (Recommended 20-card coverage set)
- 17-first-card-fixtures.s006 (Fixture acceptance interactions)
- 17-first-card-fixtures.s007 (Real Poneglyph-backed fixtures added in v3)
- 17-first-card-fixtures.s008 (Updated first fixture slice)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s011 (Contract and fixture validation)
- 23-repo-tooling-and-enforcement.s023 (Definition of done for repo tooling)
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

### 02-engine-mechanics.s045 (Parenthetical explanatory notes)

Comprehensive Rules 2-8-4, 2-8-4-1, and 2-8-4-2 define parenthetical explanatory notes for keyword effects and other card effects. These explanatory notes provide further explanation or make an effect easier to understand, but they do not influence gameplay.

For engine support gates, support and classification logic may ignore parenthetical explanatory notes when deciding whether remaining printed text requires simulator implementation. This is a classification rule only. It must not be used to parse, execute, generate, or replace gameplay behavior.

Parenthetical explanatory-note handling must not mutate raw Poneglyph text, normalized `ResolvedCard.effectText`, manifest display text, PlayerView card text, `sourceTextHash`, `behaviorHash`, or reviewed printed-text evidence. The simulator overlay, keyword behavior table, effect DSL definitions, custom handlers, rulings, support status, and card-specific tests remain the gameplay implementation authority.

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

### 04-effect-runtime.s012 (Player choices during effect resolution)

Effects pause through `PendingDecision`.

Example target selection flow:

```ts
function executeKoEffect(
  state: GameState,
  effect: KoEffect,
  context: EffectContext,
): EngineResult {
  const candidates = resolveTargetCandidates(state, effect.target, context);

  if (requiresChoice(effect.target)) {
    return pauseForDecision(state, {
      type: "selectTargets",
      playerId: resolveChooser(effect.target, context),
      request: effect.target,
      candidates,
      causedBy: context.causedBy,
    });
  }

  return koTargets(state, candidates.selected, context);
}
```

Decision responses are validated by the engine, not the client.

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

### 09-card-data-and-support-policy.s015 (Poneglyph text hash and stale-card review)

Every supported card stores a hash of its Poneglyph printed text.

When the Poneglyph text changes:

1. Mark the card implementation as stale.
2. Fail CI if a stale card remains marked `tested` without review.
3. Prevent ranked use if the changed text affects card behavior.
4. Require a reviewer to update the source hash after verifying the DSL/custom handler.

This catches errata, typo fixes that affect parsing, and Poneglyph schema/text changes.

### 09-card-data-and-support-policy.s022 (Security checklist)

- Server never trusts card metadata from client.
- Poneglyph response is schema-validated before cache write.
- Overlay merge is versioned.
- Match snapshots resolved cards before play starts.
- Unsupported cards are rejected in public modes.
- Variant IDs are cosmetic and never affect rules.
- Poneglyph text hash changes trigger implementation review.
- Replays store versions and manifest hashes.

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

### 17-first-card-fixtures.s006 (Fixture acceptance interactions)

These interactions should exist as golden scripts:

- Vanilla Leader vs vanilla Leader match reaches a legal winner.
- Sixth Character rule-process trash does not fire `[On K.O.]`.
- Blocker redirects an attack and then the blocker can be K.O.'d.
- Double Attack processes two life cards before deferred triggers resolve.
- Banish trashes life and prevents normal trigger/hand path.
- `[On K.O.]` source leaves field and still resolves correctly.
- Search/look effect does not leak candidates to opponent.
- Permanent +1000 does not stack every recomputation.
- Replacement effect applies once to a process.
- Custom handler replay hash is deterministic.

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

### 23-repo-tooling-and-enforcement.s011 (Contract and fixture validation)

The repo must validate the canonical contract files and fixtures automatically.

Required checks:

- `contracts/canonical-types.ts` compiles under `contracts/tsconfig.json`
- effect DSL fixtures validate against `contracts/effect-dsl.schema.json`
- card fixture normalization tests run against real supplied fixture payloads
- replay fixtures remain loadable and hash-stable
- schema/DDL files parse successfully in CI

A change to DSL shape, card manifests, or replay structure is incomplete unless fixtures are updated in the same change.

### 23-repo-tooling-and-enforcement.s023 (Definition of done for repo tooling)

Repo tooling is considered defined and implementation-ready when all of the following are true:

- a contributor can clone the repo and run one documented bootstrap command successfully,
- `pnpm verify` exists and fails on real quality violations,
- package boundaries are mechanically enforced,
- contract/schema validation is automated,
- CI and local checks are materially aligned,
- hidden-information regression checks exist,
- merge protection depends on passing CI rather than reviewer memory.

At that point the repo is not just documented; it is enforceable.

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

Own only real fixture-backed regression tests and package-local assertions for the closed set of currently reviewed supported real fixture mechanics: EB01-023 On Play draw and OP04-014 Banish. Do not audit or promote additional real cards, add new engine primitives, add new effect definitions for unsupported cards, add custom handlers, add live Poneglyph/Redis/server/client dependencies, or partially support cards whose full printed behavior is not implemented.

## Scope

- add a named real implemented mechanics regression matrix for the checked-in cards-produced manifest that records the closed set of supported real fixture cards, initially only EB01-023 and OP04-014, and the exact implemented mechanics they cover
- include EB01-023 as the real implemented-dsl On Play draw regression and prove its effect definition remains linked, reviewed, hash-bound, and executable
- include OP04-014 as the real Banish keyword regression and prove it uses unchanged printed text, printedKeywords metadata, no effectDefinitionId/customHandlerIds, and existing Banish damage behavior
- prove OP04-014 Banish damage moves the damaged Life card to trash, suppresses the Life Trigger decision, and prevents the Trigger's draw effect from happening
- add package-local assertions that the implemented real-card regression matrix has no unsupported or partially implemented fixture entries
- add package-local assertions that unsupported CARD-005 real effect-shape fixtures remain unsupported, untested for gameplay support, and absent from the manifest effect definition registry
- reuse or extend existing engine-core real-card runtime tests as matrix-backed regressions that consume only plain checked-in MatchCardManifest/effect definition data and do not import @optcg/cards
- keep any target-K.O., Main Event, Rush, Blocker, Double Attack, Life Trigger, search/reveal, optional, once-per-turn, replacement, permanent modifier, multi-damage, Counter Event, and custom-handler real cards unsupported unless a complete already-reviewed implementation already exists
- if the implementation discovers another checked-in real card may be a complete match for an already-implemented mechanic, record that as a follow-up ambiguity or story candidate instead of adding it to this closed regression matrix

## Out of Scope

- adding new real Poneglyph card fixtures
- live Poneglyph, live Redis, server, client, Postgres, browser, or UI requirements in tests or CI
- implementing Poneglyph search as production package API
- automatic effect generation from printed text
- new DSL primitives, target shapes, keyword behavior, custom handlers, optional effects, once-per-turn, replacement effects, search/reveal, Counter Events, Life Trigger changes, permanent modifiers, multi-damage, or new gameplay semantics
- marking a real card supported when only part of its printed behavior is implemented
- adding effect definitions for unsupported CARD-005 fixture cards
- changing engine-core to import @optcg/cards, Poneglyph HTTP, Redis, Postgres, server, client, or UI code
- server, client, API, WebSocket, database, deck-builder, or UI integration

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/cards/src/real-card-fixtures.test.ts
- packages/engine-core/src/real-card-dsl-runtime.test.ts
- packages/engine-core/src/*real-card*.test.ts
- packages/engine-core/src/package-boundary.test.ts
- tests/integration/real-card-dsl-manifest-smoke.test.mjs
- stories/ambiguities/*.md
- stories/generated/CARD-007-real-implemented-mechanics-regression-set.yaml
- stories/approved/CARD-007-real-implemented-mechanics-regression-set.yaml
- agent-packets/CARD-007.md
- agent-packets/active.json

## Constraints

- story-review must pass before moving this story to approved or implementing
- use TDD by adding or extending failing real-fixture regression tests before changing test helpers or support assertions
- do not add new fixtures, new effect definitions, support metadata, implemented matrix entries, or engine runtime behavior
- use live Poneglyph only as an optional local maintainer discovery step; never make tests or CI call live Poneglyph
- keep Poneglyph data as printed/display metadata authority only
- keep simulator overlay as gameplay implementation authority
- fail closed on fixture schema, printed-text completeness, support-status, effect-definition linkage, runtime execution, hidden-information behavior, or deck-validation ambiguity
- do not weaken TypeScript strictness
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

## Required Tests

- package-local real implemented mechanics matrix test covering supported card IDs, implemented mechanic labels, support status, tested metadata, effectDefinitionId/customHandlerIds, and printed text/hash binding expectations
- package-local assertion that every implemented matrix entry exists in the checked-in real-card manifest and no unsupported CARD-005 fixture appears in the implemented matrix
- package-local assertion that unsupported CARD-005 fixtures remain unsupported, have tested false, and have no effectDefinitionId/customHandlerIds
- package-local assertion that manifest effectDefinitions are limited to reviewed implemented real fixture definitions
- engine-core real-card runtime coverage for EB01-023 On Play draw is reused or extended as a matrix-backed regression using only plain checked-in manifest/effect definition data
- engine-core real-card runtime coverage for OP04-014 Banish is reused or extended as a matrix-backed regression using only plain checked-in manifest data and explicitly checking trash movement plus Trigger/draw suppression
- package-boundary assertion or existing boundary test proving engine-core does not import @optcg/cards, Poneglyph HTTP, Redis, Postgres, server, client, or UI surfaces
- root `corepack pnpm exec vitest run packages/cards/src/real-card-fixtures.test.ts packages/engine-core/src/real-card-dsl-runtime.test.ts`
- `corepack pnpm run packets:verify`
- full `corepack pnpm run verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- a reviewed real implemented mechanics regression matrix exists in package-local tests and contains exactly the closed supported real fixture set for this story, initially EB01-023 and OP04-014
- EB01-023 remains the baseline real implemented-dsl On Play draw regression, with support.effectDefinitionId linked to the checked-in effect definition registry entry and executable through engine-core from plain manifest data
- OP04-014 remains the baseline real Banish regression, with unchanged printed effect text, matching printedKeywords metadata, no effectDefinitionId/customHandlerIds, and executable Banish damage through engine-core from plain manifest data
- OP04-014 Banish runtime coverage explicitly proves the damaged Life card goes to trash, no Trigger decision opens, and the Trigger draw effect does not resolve
- unsupported CARD-005 real effect-shape fixtures remain unsupported, untested for gameplay support, without effectDefinitionId/customHandlerIds, and rejected outside allowed dev/sandbox policy
- the manifest effect definition registry is not broadened beyond reviewed implemented real fixture definitions
- engine-core tests consume only plain checked-in manifest/effect-definition data and never import @optcg/cards or live card-data surfaces
- no test requires live Poneglyph, live Redis, server, client, Postgres, browser, or UI code
- any possible additional real complete-card match is deferred to a separate story or ambiguity note instead of being added to this closed regression set

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
