import { describe, expect, it } from "vitest";

import { parseOptionalCostSequence } from "./sequence.js";

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
        "order:anyOrder",
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
});
