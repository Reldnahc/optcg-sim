import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("closeout optional cost composition parser", () => {
  it("parses You can as an optional trash-from-hand cost marker", () => {
    const result = parseCardEffectLine(
      "[Activate: Main] [Once Per Turn] You can trash 1 {Land of Wano} type card from your hand: Set up to 2 of your DON!! cards as active.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "activateMain" },
        oncePerTurn: true,
        effect: {
          type: "sequence",
          effects: [
            {
              effect: {
                type: "payCost",
                cost: {
                  type: "trashFromHand",
                  count: 1,
                  filter: { typesAny: ["Land of Wano"] },
                },
              },
            },
            { effect: { type: "sequence" } },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "composition:optionalCostedEffect",
        "cost:trashFromHand",
        "state:active",
      ]),
    );
  });

  it("parses Life area as the same optional Life-to-hand cost primitive", () => {
    const result = parseCardEffectLine(
      "[On Play] You may add 1 card from your Life area to your hand: This Character gains [Rush] during this turn. (This card can attack on the turn in which it is played.)",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "onPlay" },
        effect: {
          type: "sequence",
          effects: [
            {
              effect: {
                type: "payCost",
                cost: {
                  type: "moveCards",
                  from: { player: "self", zone: "life" },
                  to: { player: "self", zone: "hand" },
                },
              },
            },
            {
              effect: {
                type: "giveKeyword",
                target: { type: "self" },
                keyword: "rush",
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "composition:optionalCostedEffect",
        "cost:moveCards",
        "zone:life",
        "destination:hand",
        "instruction:giveKeyword",
      ]),
    );
  });

  it("parses rest your Leader as an optional field-rest cost", () => {
    const result = parseCardEffectLine(
      "[Trigger] You may rest your Leader: K.O. up to 1 of your opponent's Characters with a cost of 5 or less.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "trigger" },
        effect: {
          type: "sequence",
          effects: [
            {
              effect: {
                type: "payCost",
                cost: {
                  type: "restFromField",
                  count: 1,
                  filter: { categories: ["leader"] },
                },
              },
            },
            { effect: { type: "sequence" } },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "composition:optionalCostedEffect",
        "cost:restFromField",
        "filter:category:leader",
        "instruction:ko",
      ]),
    );
  });

  it("parses optional hand-trash cost into a conditional drawUpTo body", () => {
    const result = parseCardEffectLine(
      "[Main] You may trash 2 cards from your hand: If your Leader has the {Impel Down} type, draw up to 2 cards.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "main" },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "payCost",
                cost: {
                  type: "trashFromHand",
                  count: 2,
                  chooser: "self",
                },
              },
            },
            {
              connector: "ifYouDo",
              effect: {
                type: "conditional",
                if: {
                  type: "hasCardInZone",
                  player: "self",
                  zone: "leaderArea",
                  filter: { typesAny: ["Impel Down"] },
                },
                then: { type: "drawUpTo", count: 2, player: "self" },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:eventMain",
        "composition:optionalCostedEffect",
        "cost:trashFromHand",
        "expression:conditional",
        "condition:leaderIdentity",
        "instruction:draw",
        "cardinality:upTo",
      ]),
    );
  });
});
