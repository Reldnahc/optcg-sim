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
        "filter:type",
        "filter:category:character",
        "zone:characterArea",
        "zone:stageArea",
        "chooser:self",
        "cost:trashFromHand",
        "cardinality:exact",
        "count:positiveInteger",
        "zone:hand",
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

  it("parses filtered hand and named hand-or-field trash alternatives independently", () => {
    expect(
      parseOptionalChooseOneTrashCost({
        text: "You may trash 1 {Fish-Man} type card from your hand or 1 [The Ark Noah] from your hand or field: K.O. up to 1 of your opponent's rested Characters.",
      }),
    ).toEqual({
      cost: {
        type: "chooseOne",
        optional: true,
        options: [
          {
            type: "trashFromHand",
            count: 1,
            chooser: "self",
            optional: true,
            filter: { typesAny: ["Fish-Man"] },
          },
          {
            type: "trashFromHand",
            count: 1,
            chooser: "self",
            optional: true,
            filter: { names: ["The Ark Noah"] },
          },
          {
            type: "trashFromField",
            count: 1,
            chooser: "self",
            optional: true,
            filter: { names: ["The Ark Noah"] },
          },
        ],
      },
      evidence: [
        "cost:chooseOne",
        "cost:trashFromHand",
        "cardinality:exact",
        "count:positiveInteger",
        "filter:type",
        "zone:hand",
        "chooser:self",
        "cost:trashFromHand",
        "cardinality:exact",
        "count:positiveInteger",
        "filter:name",
        "zone:hand",
        "chooser:self",
        "cost:trashFromField",
        "cardinality:exact",
        "count:positiveInteger",
        "filter:name",
        "zone:characterArea",
        "zone:stageArea",
        "chooser:self",
      ],
      rest: "K.O. up to 1 of your opponent's rested Characters.",
    });
  });
});
