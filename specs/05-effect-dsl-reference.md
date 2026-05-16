---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "05-effect-dsl-reference"
doc_title: "Effect Dsl Reference"
doc_type: "spec-section"
status: "canonical"
machine_readable: true
---

# Effect DSL Reference

<!-- SECTION_REF: 05-effect-dsl-reference.s001 -->

Section Ref: `05-effect-dsl-reference.s001`

Effect definitions are keyed by **Poneglyph base card ID**. Poneglyph supplies the printed card text and metadata; the simulator DSL supplies executable rule behavior. The DSL should store a source-text hash so a Poneglyph text change can trigger implementation review.

## Purpose

<!-- SECTION_REF: 05-effect-dsl-reference.s002 -->

Section Ref: `05-effect-dsl-reference.s002`

The effect DSL is a serializable card-effect definition language. It should cover most cards through composable primitives and route unusual cards to tested custom handlers.

**v6 contract:** [`contracts/effect-dsl.schema.json`](contracts/effect-dsl.schema.json) is the canonical validation schema for JSON fixtures, and [`contracts/canonical-types.ts`](contracts/canonical-types.ts) is the canonical TypeScript contract. Markdown snippets below are explanatory.

Definitions live in the repo for Phase 1 so they can be reviewed, diffed, tested, and versioned.

## Top-level definition

<!-- SECTION_REF: 05-effect-dsl-reference.s003 -->

Section Ref: `05-effect-dsl-reference.s003`

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

## Effect block

<!-- SECTION_REF: 05-effect-dsl-reference.s004 -->

Section Ref: `05-effect-dsl-reference.s004`

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

## Triggers

<!-- SECTION_REF: 05-effect-dsl-reference.s005 -->

Section Ref: `05-effect-dsl-reference.s005`

```ts
type Trigger =
  | { type: "onPlay" }
  | { type: "whenAttacking" }
  | { type: "onOpponentAttack" }
  | { type: "onBlock" }
  | { type: "onKO" }
  | { type: "endOfYourTurn" }
  | { type: "endOfOpponentTurn" }
  | { type: "trigger" }
  | { type: "donAttach"; count: number }
  | { type: "activateMain" }
  | { type: "main" }
  | { type: "counter" }
  | { type: "permanent" }
  | { type: "replacement"; replacement: ReplacementTrigger }
  | { type: "startOfGame" }
  | { type: "startOfYourTurn" }
  | { type: "startOfOpponentTurn" }
  | { type: "startOfMainPhase" }
  | { type: "endOfBattle" }
  | { type: "custom"; event: string };
```

## Conditions

<!-- SECTION_REF: 05-effect-dsl-reference.s006 -->

Section Ref: `05-effect-dsl-reference.s006`

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

Condition, duration, and restriction primitives outside the schema-supported fixture subset remain planned layers. They are contract-defined by this reference, but they are not fixture-authorable until the schema coverage policy lists them as supported.

## Costs

<!-- SECTION_REF: 05-effect-dsl-reference.s007 -->

Section Ref: `05-effect-dsl-reference.s007`

```ts
type Cost =
  | { type: "restDon"; count: number; chooser?: PlayerRef }
  | { type: "returnDon"; count: number; chooser?: PlayerRef }
  | { type: "restSelf" }
  | {
      type: "trashFromHand";
      count: number;
      filter?: CardFilter;
      chooser: PlayerRef;
    }
  | { type: "trashSelf" }
  | {
      type: "trashFromField";
      count: number;
      filter?: CardFilter;
      chooser: PlayerRef;
    }
  | { type: "discard"; count: number; filter?: CardFilter; chooser: PlayerRef }
  | { type: "sequence"; costs: Cost[] }
  | { type: "chooseOne"; options: Cost[] }
  | { type: "custom"; action: string };

type OptionalCost =
  | { type: "restDon"; count: number; chooser?: PlayerRef; optional: true }
  | { type: "returnDon"; count: number; chooser?: PlayerRef; optional: true }
  | { type: "restSelf"; optional: true }
  | { type: "sequence"; costs: Cost[]; optional: true };
```

If paying a cost requires choosing cards or DON!!, the runtime creates a `PayCostDecision`.
Cost primitives outside the schema-supported fixture subset remain planned layers. Optional cost behavior must remain separate from optional activation and optional effect clauses as defined by `04-effect-runtime.s011`.

## Targets

<!-- SECTION_REF: 05-effect-dsl-reference.s008 -->

Section Ref: `05-effect-dsl-reference.s008`

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

## Card filters

<!-- SECTION_REF: 05-effect-dsl-reference.s009 -->

Section Ref: `05-effect-dsl-reference.s009`

```ts
interface CardFilter {
  cardIds?: CardId[];
  names?: string[];
  nameContains?: string;
  nameNot?: string[];
  categories?: CardCategory[];
  colorsAny?: Color[];
  colorsAll?: Color[];
  typesAny?: string[];
  typesAll?: string[];
  attributesAny?: Attribute[];
  attributesAll?: Attribute[];
  cost?: { op: Comparator; value: number } | { min?: number; max?: number };
  power?: { op: Comparator; value: number } | { min?: number; max?: number };
  counter?: { op: Comparator; value: number } | { min?: number; max?: number };
  hasKeywords?: Keyword[];
  lacksKeywords?: Keyword[];
  state?: "active" | "rested" | "attached";
  owner?: PlayerRef;
  controller?: PlayerRef;
  excludeSelf?: boolean;
  custom?: string;
}
```

### Deprecated filter aliases

<!-- SECTION_REF: 05-effect-dsl-reference.s010 -->

Section Ref: `05-effect-dsl-reference.s010`

The following earlier aliases are not canonical and should not appear in committed DSL fixtures:

| Deprecated                                | Canonical                          |
| ----------------------------------------- | ---------------------------------- |
| `cardId`                                  | `cardIds`                          |
| `cardName`                                | `names`                            |
| `cardNameContains`                        | `nameContains`                     |
| `cardNameNot`                             | `nameNot`                          |
| `category`                                | `categories`                       |
| `color`, `colorIncludes`                  | `colorsAny` or `colorsAll`         |
| `type`, `typeIncludes`, `typeIncludesAny` | `typesAny` or `typesAll`           |
| `attribute`                               | `attributesAny` or `attributesAll` |
| `costOp` + `costValue`                    | `cost: { op, value }`              |
| `powerOp` + `powerValue`                  | `power: { op, value }`             |
| `hasKeyword`                              | `hasKeywords`                      |
| `lacksKeyword`                            | `lacksKeywords`                    |

A migration adapter may accept these aliases while importing old examples, but CI should reject them in canonical effect-definition fixtures.

## Durations

<!-- SECTION_REF: 05-effect-dsl-reference.s011 -->

Section Ref: `05-effect-dsl-reference.s011`

```ts
type Duration =
  | { type: "thisAction" }
  | { type: "thisBattle" }
  | { type: "thisTurn" }
  | {
      type: "untilEndOfTurn";
      whoseTurn?: "current" | "sourceController" | "targetController";
    }
  | { type: "untilStartOfNextTurn"; player: PlayerRef }
  | { type: "whileSourceOnField" }
  | { type: "whileConditionTrue"; condition: Condition }
  | { type: "permanent" };
```

Use `permanent` sparingly. Field buffs should normally be `whileSourceOnField` or a timing duration.
Duration primitives not listed in the schema-supported fixture subset are contract-defined planned layers until schema coverage, validation fixtures, and runtime capability evidence are added.

## Effects

<!-- SECTION_REF: 05-effect-dsl-reference.s012 -->

Section Ref: `05-effect-dsl-reference.s012`

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
  | { type: "payCost"; cost: OptionalCost }

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

Cardinality fields such as `min` and `max` use the exact-N and up-to-N semantics from `03-game-state-events-decisions.s017`. `drawUpTo` is a planned `chooseQuantity`-backed primitive: it must pause through a `chooseQuantity` pending decision, validate the selected whole integer against public min/max bounds, and draw only the chosen amount when a future runtime story makes it executable.

`drawUpTo` short-deck resolution is do-as-much-as-possible. If the chosen quantity is greater than the number of cards remaining in that player's deck, the runtime must draw every remaining card and emit draw and card-movement events only for cards actually drawn. The next rule-processing checkpoint detects deck-out under `02-engine-mechanics.s035`; the effect does not fail closed before drawing the remaining cards solely because the chosen quantity exceeded the remaining deck size.

Event `seq` values for partial-deck drawUpTo resolution must remain strictly increasing by append order, as required by `03-game-state-events-decisions.s005`. The resolved decision increments `state.seq` once under `03-game-state-events-decisions.s022`; individual draw events do not each advance `state.seq`. State hashes at the replay checkpoints include the post-draw empty deck. Golden replay coverage for drawUpTo short-deck cases must pin the final state hash.

Duration and restriction effects such as `cannotAttack`, `cannotBlock`, `cannotBeAttacked`, `cannotBeBlockedBy`, `invalidateEffects`, and `protectFromKO` remain planned unless the schema coverage policy lists them as schema-supported and the runtime capability matrix proves the active engine can enforce the restriction for the full duration.

## Sequence connector semantics

<!-- SECTION_REF: 05-effect-dsl-reference.s013 -->

Section Ref: `05-effect-dsl-reference.s013`

`Effect.type = "sequence"` uses explicit segment connectors. This avoids ambiguity in card text such as "Then", "If you do", and "If possible".

```ts
interface SequencedEffect {
  id?: string;
  effect: Effect;
  connector:
    | "always"
    | "then"
    | "ifPreviousSucceeded"
    | "ifYouDo"
    | "ifPossible";
  saveResultAs?: string;
}
```

Connector behavior:

| Connector             | Runtime behavior                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `always`              | Run this segment regardless of the previous segment result.                                                                          |
| `then`                | Run after the previous segment; if the previous segment was impossible, continue only when card text says to do as much as possible. |
| `ifPreviousSucceeded` | Run only if the previous segment changed game state or made a legal selection.                                                       |
| `ifYouDo`             | Run only if the player chose/performed the previous optional instruction.                                                            |
| `ifPossible`          | Attempt the segment if there is a legal way to perform it; no error if there is not.                                                 |

A segment result must record at least:

```text
attempted
succeeded
changedState
selectedCards
selectedTargets
paidCost
playerDeclined
```

Those fields drive later connector decisions and replay determinism. Runtime frame, pause/resume, saved-reference, and failure-policy behavior for composed execution is authoritative in `04-effect-runtime.s010`, `04-effect-runtime.s012`, and `04-effect-runtime.s016`.

Saved references include `saveResultAs`, `SelectionSetId`, and `SelectionId`. A saved reference is contract-defined here, but generated support may rely on it only when schema validation, parser certification, and runtime capability evidence all cover the reference lifetime, visibility, and later-use legality.

Optionality must preserve optional activation, optional cost, and optional effect clause distinctions. These boundaries are part of generated-support capability evidence because a parser that recognizes optional text still cannot make the effect playable unless the runtime can resume and record the correct optional segment result.

Optional cost clauses inside composed sequence execution use a sequence segment
whose effect is `{ type: "payCost"; cost: OptionalCost }`. The optionality flag
lives on the nested `OptionalCost`; `SequencedEffect.optional` remains reserved
for optional effect clauses and must not be used to represent optional cost
decline. Runtime decline for that segment uses the `PayCostDecision` and
`PaymentDeclinedResponse` contract from `03-game-state-events-decisions.s012`
and `03-game-state-events-decisions.s017`.
Optional cost decline uses the active `PayCostDecision` and a
`PaymentDeclinedResponse` payload.

`ifYouDo` after an optional cost runs only when the previous cost segment
recorded `paidCost: true`. A declined or failed optional cost segment does not
run dependent `ifYouDo` segments. Segment-result, event-order, state-hash, and
once-per-turn timing for optional cost accept, decline, and failure are
authoritative in `04-effect-runtime.s011` and `04-effect-runtime.s012`.

## Search request

<!-- SECTION_REF: 05-effect-dsl-reference.s014 -->

Section Ref: `05-effect-dsl-reference.s014`

```ts
interface SearchRequest {
  zone: "deck" | "trash" | "life";
  player: PlayerRef;
  lookCount?: number;
  filter: CardFilter;
  min: number;
  max: number;
  destination: Zone;
  revealTo: Visibility;
  remainingCards?: {
    destination: Zone;
    position: "top" | "bottom";
    order: "ownerChoice" | "random";
  };
  shuffleAfter?: boolean;
}
```

## Visibility

<!-- SECTION_REF: 05-effect-dsl-reference.s015 -->

Section Ref: `05-effect-dsl-reference.s015`

```ts
type Visibility =
  | "bothPlayers"
  | "chooserOnly"
  | "ownerOnly"
  | "controllerOnly"
  | "hidden"
  | "replayOnly";
```

## Replacement triggers

<!-- SECTION_REF: 05-effect-dsl-reference.s016 -->

Section Ref: `05-effect-dsl-reference.s016`

```ts
type ReplacementTrigger =
  | { type: "wouldBeKOd"; target: Target }
  | { type: "wouldTakeDamage"; target: Target }
  | { type: "wouldBeTrashed"; target: Target }
  | { type: "wouldDraw"; player: PlayerRef }
  | { type: "wouldMoveZone"; from?: Zone; to?: Zone; target: Target }
  | { type: "custom"; event: string };
```

## Type enums

<!-- SECTION_REF: 05-effect-dsl-reference.s017 -->

Section Ref: `05-effect-dsl-reference.s017`

```ts
type Zone =
  | "hand"
  | "deck"
  | "trash"
  | "life"
  | "costArea"
  | "characterArea"
  | "stageArea"
  | "leaderArea"
  | "donDeck"
  | "noZone";

type CardCategory = "leader" | "character" | "event" | "stage" | "don";
type Color = "red" | "green" | "blue" | "purple" | "black" | "yellow";
type Attribute = "slash" | "strike" | "ranged" | "special" | "wisdom";
type Keyword =
  | "rush"
  | "rushCharacter"
  | "doubleAttack"
  | "banish"
  | "blocker"
  | "unblockable";
```

## Example: vanilla confirmed card

<!-- SECTION_REF: 05-effect-dsl-reference.s018 -->

Section Ref: `05-effect-dsl-reference.s018`

```json
{
  "cardId": "OP01-006",
  "implementationStatus": "vanilla-confirmed",
  "effects": [],
  "metadata": {
    "sourceTextHash": "sha256:...",
    "rulesVersion": "2026-01-16",
    "effectDefinitionsVersion": "0.1.0",
    "tested": true
  }
}
```

## Example: On Play draw 1

<!-- SECTION_REF: 05-effect-dsl-reference.s019 -->

Section Ref: `05-effect-dsl-reference.s019`

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

## Example: Activate Main with cost and up-to target

<!-- SECTION_REF: 05-effect-dsl-reference.s020 -->

Section Ref: `05-effect-dsl-reference.s020`

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

## Example: permanent power buff

<!-- SECTION_REF: 05-effect-dsl-reference.s021 -->

Section Ref: `05-effect-dsl-reference.s021`

```json
{
  "cardId": "OP01-001",
  "implementationStatus": "implemented-dsl",
  "effects": [
    {
      "id": "OP01-001:permanent-1",
      "category": "permanent",
      "trigger": { "type": "permanent" },
      "condition": {
        "type": "and",
        "conditions": [
          { "type": "donCount", "target": { "type": "self" }, "min": 1 },
          { "type": "yourTurn" }
        ]
      },
      "sourcePresencePolicy": "mustRemainInSameZone",
      "effect": {
        "type": "modifyPower",
        "target": {
          "type": "all",
          "zone": "characterArea",
          "player": "self",
          "filter": { "typesAny": ["Straw Hat Crew"] }
        },
        "value": 1000,
        "duration": { "type": "whileSourceOnField" }
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

The runtime should convert this into a `ContinuousEffectRecord`/modifier and apply it through `computeView()`.

## Poneglyph text-to-DSL pipeline

<!-- SECTION_REF: 05-effect-dsl-reference.s022 -->

Section Ref: `05-effect-dsl-reference.s022`

The effect-system plan supports three authoring paths:

1. Manual DSL definitions written by developers.
2. Custom TypeScript handlers for cards that cannot be expressed in DSL.
3. Generated DSL from Poneglyph printed card text when certified parser rules produce a complete parse and runtime capability checks pass.

Support ladder:

1. `contract-defined`: a primitive or behavior is described by the Markdown spec or canonical TypeScript contract.
2. `schema-authorable`: `contracts/effect-dsl.schema.json` can validate JSON fixtures for that primitive.
3. `runtime-executable`: the current runtime capability matrix proves the engine can execute the primitive, including decisions, visibility, replay, failure policy, and pause/resume behavior.
4. `parser-certified`: reviewed parser rules produce a complete parse for the relevant printed text shape.
5. `generated-support playable`: a generated support record may enable normal play only when the parse is complete and every parsed component has current runtime capability evidence.

Schema authorability alone is insufficient for generated-support playable status. Generated support requires runtime capability evidence and complete parser support; schema validation only proves a JSON shape can be authored.

Generated definitions must never be deployed blindly. A new parser rule, ambiguous parse class, custom handler binding, or wording/ruling ambiguity requires review before it can certify support. Once a parser rule is certified, matching complete-parse cards may be generated without a manual per-card allowlist or manual card-to-mechanic map for that common template.

A complete parse covers all gameplay-relevant printed text, trigger text, keyword text, costs, conditions, timing windows, target or selection requirements, visibility requirements, replacement or optionality semantics, and ruling/errata inputs that affect behavior. Multiple parsed effects compose into one generated `EffectDefinition`. Partial parse output may be reported for coverage progress, but it must not make the card playable in normal modes.

Bandai or Poneglyph wording drift must invalidate the affected parse/hash evidence or downgrade support until parser and support evidence are updated. If any parsed component is unparsed, ambiguous, stale, unsupported, or missing runtime capability evidence, the generated definition fails closed instead of partially enabling the card.

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

## v3 additions from real Poneglyph examples

<!-- SECTION_REF: 05-effect-dsl-reference.s023 -->

Section Ref: `05-effect-dsl-reference.s023`

`OP01-060` and `OP05-091` require a few DSL primitives that are common enough to support directly rather than route to custom handlers.

### Source-attached DON!! condition

<!-- SECTION_REF: 05-effect-dsl-reference.s024 -->

Section Ref: `05-effect-dsl-reference.s024`

`[DON!! xN]` is usually a condition based on DON!! attached to the source card.

```ts
type Condition = {
  type: "attachedDonCount";
  target: Target;
  op: Comparator;
  value: number;
};
```

### Richer filters

<!-- SECTION_REF: 05-effect-dsl-reference.s025 -->

Section Ref: `05-effect-dsl-reference.s025`

Use the canonical filter fields defined above and in `contracts/effect-dsl.schema.json`:

```ts
interface CardFilter {
  nameNot?: string[];
  colorsAny?: Color[];
  colorsAll?: Color[];
  typesAny?: string[];
  typesAll?: string[];
  cost?: { op: Comparator; value: number } | { min?: number; max?: number };
}
```

`nameNot` is necessary for text like `other than [Rebecca]`. `typesAny`/`typesAll` are necessary for text like `{The Seven Warlords of the Sea} type`.

### Transient reveal and selection primitives

<!-- SECTION_REF: 05-effect-dsl-reference.s026 -->

Section Ref: `05-effect-dsl-reference.s026`

```ts
type SelectionSetId = string;
type SelectionId = string;

type Effect =
  | {
      type: "revealTop";
      player: PlayerRef;
      count: number;
      saveAs: SelectionSetId;
      visibility: Visibility;
    }
  | {
      type: "selectFromSet";
      set: SelectionSetId;
      chooser: PlayerRef;
      min: number;
      max: number;
      filter?: CardFilter;
      saveAs: SelectionId;
    }
  | {
      type: "selectCards";
      zone: Zone;
      player: PlayerRef;
      chooser: PlayerRef;
      min: number;
      max: number;
      filter?: CardFilter;
      saveAs: SelectionId;
      visibility: Visibility;
    }
  | {
      type: "playSelected";
      selection: SelectionId;
      enterRested?: boolean;
      ignoreCost?: boolean;
    }
  | {
      type: "returnUnselectedToDeck";
      set: SelectionSetId;
      player: PlayerRef;
      position: "top" | "bottom";
      order: "original" | "ownerChoice" | "random";
      faceDown: boolean;
    }
  | {
      type: "moveSelected";
      selection: SelectionId;
      from: Zone | SelectionSetId;
      to: Zone;
    };
```

These are not UI concepts. They are deterministic effect-runtime concepts. They let the runtime represent "reveal top card, maybe play it, otherwise return it face-down" without losing hidden-information boundaries.

`playSelected` is planned/not fixture-authorable until schema coverage and runtime capability evidence exist. Generated support may not treat a parsed play-from-selection instruction as playable unless the parser covers the complete selection/play/return flow and the runtime capability matrix covers the resulting decision, hidden-information, forced-trash, and zone-movement behavior.

`playSelected` may consume only an authorized saved hand selection produced by the same supported effect execution frame. At playSelected resolution time, the selected card must still be in that player's hand and must still be legal to play under the current rules and the playSelected options. A stale, non-hand, no-longer-legal, or unsupported saved-reference family fails closed.

A fail-closed stale playSelected segment does not emit `cardPlayed` or hand-to-field `cardMoved` events, records the failed segment as attempted, not succeeded, and not changedState, and then follows the active connector and failure policy. Public events, public legal actions, PlayerView, and SpectatorView must not reveal hidden hand card IDs, private candidates, or unsupported saved-reference details. Replay and private effect logs may retain the internal saved-reference failure reason for audit and deterministic replay.

Event `seq` values and `state.seq` advancement remain deterministic for stale playSelected failures under `03-game-state-events-decisions.s005` and `03-game-state-events-decisions.s022`. State hashes must include the unchanged hand and board state after the failed segment. Golden replay coverage for stale playSelected failures must pin the final state hash.

### Effect-play options

<!-- SECTION_REF: 05-effect-dsl-reference.s027 -->

Section Ref: `05-effect-dsl-reference.s027`

Effects that say "play" without requiring cost payment should use:

```ts
{ type: 'playSelected', selection: '...', enterRested: true, ignoreCost: true }
```

The play still obeys rule-processing constraints such as character-area capacity and stage replacement. If the character area is full, the engine must create the forced-trash decision before completing the play.

## Example implementation docs

<!-- SECTION_REF: 05-effect-dsl-reference.s028 -->

Section Ref: `05-effect-dsl-reference.s028`

See [`20-card-implementation-examples.md`](20-card-implementation-examples.md) for full drafts of `OP01-060` and `OP05-091` using these primitives.

## Schema coverage policy

<!-- SECTION_REF: 05-effect-dsl-reference.s029 -->

Section Ref: `05-effect-dsl-reference.s029`

`contracts/effect-dsl.schema.json` is the executable JSON fixture contract.
TypeScript/spec primitives outside that JSON schema are planned/not
fixture-authorable until schema validation and fixtures exist.
This list is the fixture-authorability boundary, not generated playable support.
Schema authorability alone does not imply runtime-executable,
parser-certified, or generated-support playable status. New TYP schema stories
may move primitives into the schema-supported fixture subset only when they also
add schema coverage and validation fixtures; generated playable support still
requires complete parser support and runtime capability evidence.

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
- cost: returnDon
- cost: restSelf
- cost: sequence
- target: self, myLeader, opponentLeader, attacker, attackTarget, blocker,
  triggerCard, all, choose
- duration: thisAction, thisBattle, thisTurn, whileSourceOnField, permanent
- effect: draw
- effect: ko
- effect: modifyPower
- effect: payCost
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
