---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "20-card-implementation-examples"
doc_title: "Card Implementation Examples"
doc_type: "spec-section"
status: "canonical"
machine_readable: true
---

# Card Implementation Examples: OP01-060 and OP05-091

<!-- SECTION_REF: 20-card-implementation-examples.s001 -->

Section Ref: `20-card-implementation-examples.s001`

## Purpose

<!-- SECTION_REF: 20-card-implementation-examples.s002 -->

Section Ref: `20-card-implementation-examples.s002`

This file turns the supplied Poneglyph card examples into implementation guidance, DSL requirements, and acceptance tests. These two cards are useful because they expose several non-trivial engine needs:

- Poneglyph variant indexes are not simple positive IDs.
- FAQ entries can affect hidden-information behavior.
- Effects can temporarily reveal cards, then return them face-down.
- An effect can add a card to hand and then immediately allow that same card to be played.
- Card filters need name exclusion, type matching, color matching, category matching, and cost ranges.

## Example 1: OP01-060 Donquixote Doflamingo

<!-- SECTION_REF: 20-card-implementation-examples.s003 -->

Section Ref: `20-card-implementation-examples.s003`

### Poneglyph facts from fixture

<!-- SECTION_REF: 20-card-implementation-examples.s004 -->

Section Ref: `20-card-implementation-examples.s004`

```text
Card ID: OP01-060
Name: Donquixote Doflamingo
Category: Leader
Color: Blue
Power: 5000
Life: 5
Types: The Seven Warlords of the Sea; Donquixote Pirates
Effect: [DON!! x2] [When Attacking] ①: Reveal 1 card from the top of your deck. If that card is a {The Seven Warlords of the Sea} type Character card with a cost of 4 or less, you may play that card rested.
Legality: Standard not_legal; Extra Regulation legal
Variants: indexes 1, 2, and 0
FAQ: if the revealed card is not played, return it to the top of the deck face-down.
```

### Implementation consequences

<!-- SECTION_REF: 20-card-implementation-examples.s005 -->

Section Ref: `20-card-implementation-examples.s005`

`[DON!! x2]` is a source-attached DON!! condition, not a cost. The cost is `①`, paid by resting one active DON!! in the cost area.

The effect needs a transient public reveal zone/set. The revealed top card is public while revealed. If it is not played, it returns to the top of the deck face-down and must no longer be visible in either player's normal `PlayerView`.

If the revealed card is eligible, the controller may play it rested. The effect text does not say to pay its cost, so this is an effect-play with `ignoreCost: true`.

### Required DSL support

<!-- SECTION_REF: 20-card-implementation-examples.s006 -->

Section Ref: `20-card-implementation-examples.s006`

The current DSL must support all of these primitives:

```ts
// Conditions
{ type: 'attachedDonCount', target: { type: 'self' }, op: 'gte', value: 2 }

// Transient reveal set
{ type: 'revealTop', player: 'self', count: 1, saveAs: 'doffyReveal', visibility: 'bothPlayers' }

// Conditional selection from a transient set
{
  type: 'selectFromSet',
  set: 'doffyReveal',
  chooser: 'self',
  min: 0,
  max: 1,
  filter: {
    categories: ['character'],
    typesAny: ['The Seven Warlords of the Sea'],
    cost: { op: 'lte', value: 4 }
  },
  saveAs: 'doffyPlayChoice'
}

// Effect-play selected revealed card rested
{ type: 'playSelected', selection: 'doffyPlayChoice', enterRested: true, ignoreCost: true }

// Cleanup unplayed revealed card
{
  type: 'returnUnselectedToDeck',
  set: 'doffyReveal',
  player: 'self',
  position: 'top',
  order: 'original',
  faceDown: true
}
```

### Draft effect definition

<!-- SECTION_REF: 20-card-implementation-examples.s007 -->

Section Ref: `20-card-implementation-examples.s007`

```jsonc
{
  "cardId": "OP01-060",
  "implementationStatus": "implemented-dsl",
  "effects": [
    {
      "id": "OP01-060:when-attacking-1",
      "category": "auto",
      "trigger": { "type": "whenAttacking" },
      "condition": {
        "type": "attachedDonCount",
        "target": { "type": "self" },
        "op": "gte",
        "value": 2,
      },
      "conditionTiming": "activation",
      "cost": { "type": "restDon", "count": 1, "chooser": "self" },
      "optional": true,
      "oncePerTurn": false,
      "sourcePresencePolicy": "mustRemainInSameZone",
      "failurePolicy": "doAsMuchAsPossible",
      "effect": {
        "type": "sequence",
        "effects": [
          {
            "connector": "always",
            "effect": {
              "type": "revealTop",
              "player": "self",
              "count": 1,
              "saveAs": "revealedTop",
              "visibility": "bothPlayers",
            },
          },
          {
            "connector": "ifPreviousSucceeded",
            "effect": {
              "type": "selectFromSet",
              "set": "revealedTop",
              "chooser": "self",
              "min": 0,
              "max": 1,
              "filter": {
                "categories": ["character"],
                "typesAny": ["The Seven Warlords of the Sea"],
                "cost": { "op": "lte", "value": 4 },
              },
              "saveAs": "playChoice",
            },
          },
          {
            "connector": "ifYouDo",
            "effect": {
              "type": "playSelected",
              "selection": "playChoice",
              "enterRested": true,
              "ignoreCost": true,
            },
          },
          {
            "connector": "always",
            "effect": {
              "type": "returnUnselectedToDeck",
              "set": "revealedTop",
              "player": "self",
              "position": "top",
              "order": "original",
              "faceDown": true,
            },
          },
        ],
      },
    },
  ],
  "metadata": {
    "sourceTextHash": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    "behaviorHash": "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    "rulesVersion": "2026-01-16",
    "effectDefinitionsVersion": "0.2.0",
    "tested": false,
    "notes": "FAQ requires unplayed revealed card to return top face-down.",
  },
}
```

### Acceptance tests

<!-- SECTION_REF: 20-card-implementation-examples.s008 -->

Section Ref: `20-card-implementation-examples.s008`

```text
DOFFY-001 OP01-060 variant index 0 normalizes to OP01-060:v0 and is selectable in deck builder.
DOFFY-002 [DON!! x2] condition checks attached DON!! on leader, not total cost-area DON!!.
DOFFY-003 When attacking with two attached DON!! and one active DON!! in cost area, player may pay ①.
DOFFY-004 If player declines to pay ①, no top card is revealed.
DOFFY-005 Eligible top card can be played rested without paying cost.
DOFFY-006 Ineligible top card is revealed, then returns to top of deck face-down.
DOFFY-007 Eligible top card declined by player returns to top face-down.
DOFFY-008 Opponent sees the revealed card while revealed but not after it returns face-down.
DOFFY-009 Returning the card to top preserves deck order and does not shuffle.
DOFFY-010 If the revealed card is played, it leaves the transient reveal set and does not also return to deck.
```

## Example 2: OP05-091 Rebecca

<!-- SECTION_REF: 20-card-implementation-examples.s009 -->

Section Ref: `20-card-implementation-examples.s009`

### Poneglyph facts from fixture

<!-- SECTION_REF: 20-card-implementation-examples.s010 -->

Section Ref: `20-card-implementation-examples.s010`

```text
Card ID: OP05-091
Name: Rebecca
Category: Character
Color: Black
Cost: 4
Power: 0
Counter: 1000
Attribute: Wisdom
Types: Dressrosa
Effect: [Blocker]\n[On Play] Add up to 1 black Character card with a cost of 3 to 7 other than [Rebecca] from your trash to your hand. Then, play up to 1 black Character card with a cost of 3 or less from your hand rested.
Legality: Standard legal; Extra Regulation legal
Variants: indexes 0, 1, 2, 3, 4, 5
FAQ: the card added from trash may be played by the second part of the effect.
```

### Implementation consequences

<!-- SECTION_REF: 20-card-implementation-examples.s011 -->

Section Ref: `20-card-implementation-examples.s011`

`[Blocker]` should be implemented as a keyword available while the card is on the field.

The `[On Play]` effect is a sequence. The second step sees the updated hand after the first step. The official FAQ confirms that the card added from trash can be selected for the subsequent play step.

`other than [Rebecca]` is a name exclusion. It does not merely mean `excludeSelf`, because the source Rebecca is on the field and the searched zone is trash. The filter needs a card-name exclusion operator.

### Required DSL support

<!-- SECTION_REF: 20-card-implementation-examples.s012 -->

Section Ref: `20-card-implementation-examples.s012`

```ts
interface CardFilter {
  names?: string[];
  nameNot?: string[];
  colorsAny?: Color[];
  categories?: CardCategory[];
  cost?: { op: Comparator; value: number } | { min?: number; max?: number };
}
```

The play-from-hand effect must support `enterRested: true`, `ignoreCost: true`, and normal board-cap rule processing.

### Draft effect definition

<!-- SECTION_REF: 20-card-implementation-examples.s013 -->

Section Ref: `20-card-implementation-examples.s013`

```jsonc
{
  "cardId": "OP05-091",
  "implementationStatus": "implemented-dsl",
  "effects": [
    {
      "id": "OP05-091:keyword-blocker",
      "category": "permanent",
      "trigger": { "type": "permanent" },
      "effect": {
        "type": "giveKeyword",
        "target": { "type": "self" },
        "keyword": "blocker",
        "duration": { "type": "whileSourceOnField" },
      },
    },
    {
      "id": "OP05-091:on-play-1",
      "category": "auto",
      "trigger": { "type": "onPlay" },
      "optional": false,
      "oncePerTurn": false,
      "sourcePresencePolicy": "mustRemainInSameZone",
      "failurePolicy": "doAsMuchAsPossible",
      "effect": {
        "type": "sequence",
        "effects": [
          {
            "connector": "always",
            "effect": {
              "type": "selectCards",
              "request": {
                "zone": "trash",
                "player": "self",
                "chooser": "self",
                "min": 0,
                "max": 1,
                "allowFewerIfUnavailable": true,
                "filter": {
                  "categories": ["character"],
                  "colorsAny": ["black"],
                  "cost": { "min": 3, "max": 7 },
                  "nameNot": ["Rebecca"],
                },
                "saveAs": "trashChoice",
                "visibility": "public",
              },
            },
          },
          {
            "connector": "ifYouDo",
            "effect": {
              "type": "moveSelected",
              "selection": "trashChoice",
              "from": "trash",
              "to": "hand",
            },
          },
          {
            "connector": "then",
            "effect": {
              "type": "selectCards",
              "request": {
                "zone": "hand",
                "player": "self",
                "chooser": "self",
                "min": 0,
                "max": 1,
                "allowFewerIfUnavailable": true,
                "filter": {
                  "categories": ["character"],
                  "colorsAny": ["black"],
                  "cost": { "op": "lte", "value": 3 },
                },
                "saveAs": "handPlayChoice",
                "visibility": "privateToChooser",
              },
            },
          },
          {
            "connector": "ifYouDo",
            "effect": {
              "type": "playSelected",
              "selection": "handPlayChoice",
              "enterRested": true,
              "ignoreCost": true,
            },
          },
        ],
      },
    },
  ],
  "metadata": {
    "sourceTextHash": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    "behaviorHash": "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    "rulesVersion": "2026-01-16",
    "effectDefinitionsVersion": "0.2.0",
    "tested": false,
    "notes": "FAQ confirms the trash-to-hand card may be played by the later hand-play step.",
  },
}
```

### Acceptance tests

<!-- SECTION_REF: 20-card-implementation-examples.s014 -->

Section Ref: `20-card-implementation-examples.s014`

```text
REBECCA-001 OP05-091 normalizes all variant indexes 0 through 5; null product set_code is accepted.
REBECCA-002 [Blocker] appears in computed view while Rebecca is on field.
REBECCA-003 On Play can choose zero cards from trash even when legal targets exist.
REBECCA-004 On Play cannot choose a card named Rebecca from trash.
REBECCA-005 On Play can choose a black Character cost 3-7 from trash and move it to hand.
REBECCA-006 The second step can play the exact card added to hand in the first step if it is black Character cost <=3.
REBECCA-007 The played card enters rested and does not require cost payment.
REBECCA-008 If the character area is full, the engine creates the correct forced-trash decision before the effect-play completes.
REBECCA-009 Private hand candidate list is visible only to Rebecca's controller.
REBECCA-010 The sequence is deterministic in replay and produces the same state hash.
```

## DSL additions required by these examples

<!-- SECTION_REF: 20-card-implementation-examples.s015 -->

Section Ref: `20-card-implementation-examples.s015`

These examples prove the DSL should include the following before scaling beyond the first fixture set:

```ts
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

type Condition = {
  type: "attachedDonCount";
  target: Target;
  op: Comparator;
  value: number;
};

interface CardFilter {
  nameNot?: string[];
  colorsAny?: Color[];
  typesAny?: string[];
  cost?: { op: Comparator; value: number } | { min?: number; max?: number };
}
```

Without these, both cards would need custom handlers even though their behavior is structurally normal.
