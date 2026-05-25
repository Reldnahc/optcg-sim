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
});
