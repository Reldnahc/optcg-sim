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
```

If paying a cost requires choosing cards or DON!!, the runtime creates a `PayCostDecision`.

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
paidCost
playerDeclined
```

Those booleans drive later connector decisions and replay determinism.

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
