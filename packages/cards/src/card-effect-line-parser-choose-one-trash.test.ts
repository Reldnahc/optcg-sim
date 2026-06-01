import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses optional filtered hand-or-field trash cost into rested-character K.O. composition", () => {
  const result = parseCardEffectLine(
    "[On Play] You may trash 1 {Fish-Man} type card from your hand or 1 [The Ark Noah] from your hand or field: K.O. up to 1 of your opponent's rested Characters.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "paidCost",
            effect: {
              type: "payCost",
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
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "sequence",
              effects: [
                {
                  connector: "always",
                  saveResultAs: "selected:ko-target",
                  effect: {
                    type: "selectTargets",
                    request: {
                      player: "opponent",
                      zone: "characterArea",
                      filter: {
                        categories: ["character"],
                        state: "rested",
                      },
                    },
                  },
                },
                {
                  connector: "then",
                  effect: { type: "ko" },
                },
              ],
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "composition:optionalCostedEffect",
      "cost:chooseOne",
      "cost:trashFromHand",
      "cost:trashFromField",
      "filter:type",
      "filter:name",
      "zone:hand",
      "zone:stageArea",
      "instruction:ko",
      "target:opponentCharacters",
      "filter:state:rested",
      "composition:selectThenApply",
    ]),
  );
});
