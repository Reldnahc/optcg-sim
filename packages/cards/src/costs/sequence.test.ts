import { describe, expect, it } from "vitest";

import {
  optionalActivationCostParsers,
  parseCostFromSet,
  parseOptionalCostSequence,
} from "./index.js";

describe("optional cost sequence parser", () => {
  it("parses a single optional trash-from-hand cost without requiring a body shape", () => {
    expect(
      parseOptionalCostSequence({
        text: "trash 1 card from your hand",
      }),
    ).toMatchObject({
      cost: {
        type: "trashFromHand",
        count: 1,
        chooser: "self",
        optional: true,
      },
      evidence: ["cost:trashFromHand", "count:positiveInteger", "chooser:self"],
      rest: "",
    });
  });

  it("carries an inherited rest verb into later target/cardinality cost parts", () => {
    expect(
      parseOptionalCostSequence({
        text: "rest this card and 3 of your DON!! cards",
      }),
    ).toMatchObject({
      cost: {
        type: "sequence",
        optional: true,
        costs: [
          { type: "restSelf" },
          { type: "restDon", count: 3, chooser: "self" },
        ],
      },
      evidence: [
        "composition:costSequence",
        "cost:restSelf",
        "target:thisCard",
        "cost:restDon",
        "cardinality:exact",
        "count:positiveInteger",
        "target:yourDonCards",
        "player:self",
        "chooser:self",
      ],
      rest: "",
    });
  });

  it("parses generic move-cards costs as source and destination primitives", () => {
    expect(
      parseOptionalCostSequence({
        text: "place 2 cards from your trash at the bottom of your deck in any order",
      }),
    ).toMatchObject({
      cost: {
        type: "moveCards",
        count: 2,
        chooser: "self",
        from: { player: "self", zone: "trash" },
        to: { player: "self", zone: "deck", position: "bottom" },
        order: "chooserChoice",
        optional: true,
      },
      evidence: [
        "cost:moveCards",
        "cardinality:exact",
        "count:positiveInteger",
        "player:self",
        "zone:trash",
        "destination:deck",
        "position:bottom",
        "order:anyOrder",
      ],
      rest: "",
    });
  });

  it("parses hand-to-deck-bottom move costs as source and destination primitives", () => {
    expect(
      parseOptionalCostSequence({
        text: "place 2 cards from your hand at the bottom of your deck in any order",
      }),
    ).toMatchObject({
      cost: {
        type: "moveCards",
        count: 2,
        chooser: "self",
        from: { player: "self", zone: "hand" },
        to: { player: "self", zone: "deck", position: "bottom" },
        order: "chooserChoice",
        optional: true,
      },
      evidence: [
        "cost:moveCards",
        "cardinality:exact",
        "count:positiveInteger",
        "player:self",
        "zone:hand",
        "destination:deck",
        "position:bottom",
        "order:anyOrder",
      ],
      rest: "",
    });
  });

  it("parses hand-to-deck-bottom and rest-self as one optional cost sequence", () => {
    expect(
      parseOptionalCostSequence({
        text: "place 2 cards from your hand at the bottom of your deck in any order and rest this Stage",
      }),
    ).toMatchObject({
      cost: {
        type: "sequence",
        optional: true,
        costs: [
          {
            type: "moveCards",
            count: 2,
            chooser: "self",
            from: { player: "self", zone: "hand" },
            to: { player: "self", zone: "deck", position: "bottom" },
            order: "chooserChoice",
          },
          { type: "restSelf" },
        ],
      },
      evidence: [
        "composition:costSequence",
        "cost:moveCards",
        "cardinality:exact",
        "count:positiveInteger",
        "player:self",
        "zone:hand",
        "destination:deck",
        "position:bottom",
        "order:anyOrder",
        "cost:restSelf",
        "target:thisCard",
      ],
      rest: "",
    });
  });

  it("parses singular trash-to-deck-bottom move-card cost", () => {
    expect(
      parseOptionalCostSequence({
        text: "place 1 card from your trash at the bottom of your deck",
      }),
    ).toMatchObject({
      cost: {
        type: "moveCards",
        count: 1,
        chooser: "self",
        from: { player: "self", zone: "trash" },
        to: { player: "self", zone: "deck", position: "bottom" },
        order: "chooserChoice",
        optional: true,
      },
      evidence: [
        "cost:moveCards",
        "cardinality:exact",
        "count:positiveInteger",
        "player:self",
        "zone:trash",
        "destination:deck",
        "position:bottom",
        "order:anyOrder",
      ],
      rest: "",
    });
  });

  it("parses trash-to-deck and shuffle as reusable cost sequence parts", () => {
    expect(
      parseOptionalCostSequence({
        text: "return 20 cards from your trash to your deck and shuffle it",
      }),
    ).toMatchObject({
      cost: {
        type: "sequence",
        costs: [
          {
            type: "moveCards",
            count: 20,
            chooser: "self",
            from: { player: "self", zone: "trash" },
            to: { player: "self", zone: "deck" },
            order: "chooserChoice",
          },
          { type: "shuffleDeck", player: "self" },
        ],
      },
      evidence: [
        "composition:costSequence",
        "cost:moveCards",
        "cardinality:exact",
        "count:positiveInteger",
        "player:self",
        "zone:trash",
        "destination:deck",
        "cost:shuffleDeck",
        "instruction:shuffleDeck",
      ],
      rest: "",
    });
  });

  it("parses filtered trash-to-deck-bottom move-card costs with filter-before-card wording", () => {
    expect(
      parseOptionalCostSequence({
        text: "place 3 {Revolutionary Army} type cards from your trash at the bottom of your deck in any order",
      }),
    ).toMatchObject({
      cost: {
        type: "moveCards",
        count: 3,
        chooser: "self",
        from: { player: "self", zone: "trash" },
        to: { player: "self", zone: "deck", position: "bottom" },
        order: "chooserChoice",
        filter: { typesAny: ["Revolutionary Army"] },
        optional: true,
      },
      evidence: [
        "cost:moveCards",
        "cardinality:exact",
        "count:positiveInteger",
        "player:self",
        "zone:trash",
        "destination:deck",
        "position:bottom",
        "order:anyOrder",
        "filter:type",
      ],
      rest: "",
    });
  });

  it("parses field card move costs to deck bottom as reusable moveCards costs", () => {
    expect(
      parseOptionalCostSequence({
        text: "place 1 of your Characters at the bottom of the owner's deck",
      }),
    ).toMatchObject({
      cost: {
        type: "moveCards",
        count: 1,
        chooser: "self",
        from: { player: "self", zone: "characterArea" },
        to: { player: "self", zone: "deck", position: "bottom" },
        filter: { categories: ["character"] },
        optional: true,
      },
      evidence: [
        "cost:moveCards",
        "cardinality:exact",
        "count:positiveInteger",
        "player:self",
        "zone:characterArea",
        "destination:deck",
        "position:bottom",
        "filter:category:character",
      ],
      rest: "",
    });
  });

  it("parses filtered field card move costs to your deck bottom as reusable moveCards costs", () => {
    expect(
      parseOptionalCostSequence({
        text: "rest this card and place 1 of your Characters with 1000 base power at the bottom of your deck",
      }),
    ).toMatchObject({
      cost: {
        type: "sequence",
        optional: true,
        costs: [
          { type: "restSelf" },
          {
            type: "moveCards",
            count: 1,
            chooser: "self",
            from: { player: "self", zone: "characterArea" },
            to: { player: "self", zone: "deck", position: "bottom" },
            filter: {
              categories: ["character"],
              power: { op: "eq", value: 1000 },
            },
          },
        ],
      },
      evidence: [
        "composition:costSequence",
        "cost:restSelf",
        "target:thisCard",
        "cost:moveCards",
        "cardinality:exact",
        "count:positiveInteger",
        "player:self",
        "zone:characterArea",
        "destination:deck",
        "position:bottom",
        "filter:category:character",
        "filter:power",
        "condition:comparator:eq",
        "condition:threshold:positiveInteger",
      ],
      rest: "",
    });
  });

  it("parses return-DON and hand-trash as one optional cost sequence", () => {
    expect(
      parseOptionalCostSequence({
        text: "DON!! -2, trash 1 card from your hand",
      }),
    ).toMatchObject({
      cost: {
        type: "sequence",
        optional: true,
        costs: [
          { type: "returnDon", count: 2 },
          { type: "trashFromHand", count: 1, chooser: "self" },
        ],
      },
      evidence: [
        "composition:costSequence",
        "cost:returnDon",
        "count:positiveInteger",
        "cost:trashFromHand",
        "count:positiveInteger",
        "chooser:self",
      ],
      rest: "",
    });
  });

  it("parses rest-self and filtered hand-trash as one optional cost sequence", () => {
    expect(
      parseOptionalCostSequence({
        text: "rest this Stage and trash 1 Event or Stage card from your hand",
      }),
    ).toMatchObject({
      cost: {
        type: "sequence",
        optional: true,
        costs: [
          { type: "restSelf" },
          {
            type: "trashFromHand",
            count: 1,
            chooser: "self",
            filter: {
              anyOf: [{ categories: ["event"] }, { categories: ["stage"] }],
            },
          },
        ],
      },
      evidence: [
        "composition:costSequence",
        "cost:restSelf",
        "target:thisCard",
        "cost:trashFromHand",
        "count:positiveInteger",
        "chooser:self",
        "filter:anyOf",
        "filter:category:event",
        "filter:category:stage",
      ],
      rest: "",
    });
  });

  it("does not inherit rest into explicit turn-Life visibility costs", () => {
    expect(
      parseOptionalCostSequence({
        text: "rest this Character and turn 1 card from the top of your Life cards face-down",
      }),
    ).toMatchObject({
      cost: {
        type: "sequence",
        optional: true,
        costs: [
          { type: "restSelf" },
          {
            type: "setLifeFaceUp",
            count: 1,
            player: "self",
            position: "top",
            faceUp: false,
          },
        ],
      },
      evidence: [
        "composition:costSequence",
        "cost:restSelf",
        "target:thisCharacter",
        "cost:setLifeFaceUp",
        "cardinality:exact",
        "count:positiveInteger",
        "player:self",
        "zone:life",
        "position:top",
        "destination:faceDown",
      ],
      rest: "",
    });
  });

  it("parses plural top-Life visibility costs through the same primitive", () => {
    expect(
      parseOptionalCostSequence({
        text: "turn 2 cards from the top of your Life cards face-up",
      }),
    ).toMatchObject({
      cost: {
        type: "turnLifeFaceUp",
        count: 2,
        player: "self",
        position: "top",
        optional: true,
      },
      evidence: [
        "cost:turnLifeFaceUp",
        "cardinality:exact",
        "count:positiveInteger",
        "player:self",
        "zone:life",
        "position:top",
        "destination:faceUp",
        "reveal:bothPlayers",
      ],
      rest: "",
    });
  });

  it("does not inherit rest into explicit Life-to-hand add costs", () => {
    expect(
      parseOptionalCostSequence({
        text: "rest this Character and add 1 card from the top or bottom of your Life cards to your hand",
      }),
    ).toMatchObject({
      cost: {
        type: "sequence",
        optional: true,
        costs: [
          { type: "restSelf" },
          {
            type: "moveCards",
            count: 1,
            chooser: "self",
            from: { player: "self", zone: "life", position: "topOrBottom" },
            to: { player: "self", zone: "hand" },
            order: "chooserChoice",
          },
        ],
      },
      evidence: [
        "composition:costSequence",
        "cost:restSelf",
        "target:thisCharacter",
        "cost:moveCards",
        "cardinality:exact",
        "count:positiveInteger",
        "player:self",
        "zone:life",
        "position:top",
        "position:bottom",
        "destination:hand",
        "order:original",
      ],
      rest: "",
    });
  });

  it("parses reveal-from-hand costs with reusable hand card filters", () => {
    expect(
      parseOptionalCostSequence({
        text: "reveal 2 Character cards with 8000 power from your hand",
      }),
    ).toEqual({
      cost: {
        type: "revealFromHand",
        count: 2,
        chooser: "self",
        filter: {
          categories: ["character"],
          power: { op: "eq", value: 8000 },
        },
        optional: true,
      },
      evidence: [
        "cost:revealFromHand",
        "count:positiveInteger",
        "chooser:self",
        "filter:category:character",
        "filter:power",
        "condition:comparator:eq",
        "condition:threshold:positiveInteger",
        "reveal:bothPlayers",
      ],
      rest: "",
    });
  });

  it("parses activation costs through a semantic cost group", () => {
    expect(
      parseCostFromSet(
        {
          text: "You may trash 1 card from your hand: Draw 1 card.",
        },
        optionalActivationCostParsers,
      ),
    ).toMatchObject({
      cost: {
        type: "trashFromHand",
        count: 1,
        chooser: "self",
        optional: true,
      },
      evidence: ["cost:trashFromHand", "count:positiveInteger", "chooser:self"],
      rest: "Draw 1 card.",
    });
  });
});
