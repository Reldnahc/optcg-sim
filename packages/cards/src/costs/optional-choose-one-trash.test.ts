import { describe, expect, it } from "vitest";

import { parseOptionalChooseOneTrashCost } from "./optional-choose-one-trash.js";

describe("optional choose-one trash cost parser", () => {
  it("parses field typed-character and hand trash alternatives independently from the body", () => {
    expect(
      parseOptionalChooseOneTrashCost({
        text: "You may trash 1 of your {Celestial Dragons} type Characters or 1 card from your hand: Draw 1 card.",
      }),
    ).toEqual({
      cost: {
        type: "chooseOne",
        optional: true,
        options: [
          {
            type: "trashFromField",
            count: 1,
            chooser: "self",
            optional: true,
            filter: {
              categories: ["character"],
              typesAny: ["Celestial Dragons"],
            },
          },
          {
            type: "trashFromHand",
            count: 1,
            chooser: "self",
            optional: true,
          },
        ],
      },
      evidence: [
        "cost:chooseOne",
        "cost:trashFromField",
        "cardinality:exact",
        "count:positiveInteger",
        "chooser:self",
        "filter:type",
        "filter:category:character",
        "cost:trashFromHand",
        "count:positiveInteger",
        "chooser:self",
      ],
      rest: "Draw 1 card.",
    });
  });

  it("does not silently drop unsupported field trash predicates", () => {
    expect(
      parseOptionalChooseOneTrashCost({
        text: "You may trash 1 of your {Celestial Dragons} type Characters with 5000 power or less or 1 card from your hand: Draw 1 card.",
      }),
    ).toBeUndefined();
  });
});
