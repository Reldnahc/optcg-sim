import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses chosen-cost opponent deck reveal into saved-number and revealed-set primitives", () => {
  const result = parseCardEffectLine(
    "[Main] Choose a cost and reveal 1 card from the top of your opponent's deck. If the revealed card has the chosen cost, K.O. up to 1 of your opponent's Characters with a base cost of 8 or less.",
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
              type: "chooseNumber",
              chooser: "self",
              purpose: "cost",
              min: 0,
            },
          },
          {
            connector: "then",
            effect: {
              type: "revealTop",
              player: "opponent",
              count: 1,
              visibility: "bothPlayers",
            },
          },
          {
            connector: "then",
            effect: {
              type: "selectFromSet",
              chooser: "self",
              min: 0,
              max: 1,
              filter: {
                statComparisons: [
                  {
                    stat: "cost",
                    op: "eq",
                    value: {
                      type: "savedNumber",
                    },
                  },
                ],
              },
            },
          },
          {
            connector: "ifPreviousSucceeded",
            effect: { type: "sequence" },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:eventMain",
      "instruction:chooseNumber",
      "numberPurpose:cost",
      "instruction:revealTop",
      "player:opponent",
      "instruction:selectFromSet",
      "value:savedNumber",
      "connector:ifPreviousSucceeded",
      "instruction:ko",
    ]),
  );
});

it("reuses chosen-cost reveal with counter timing and battle power body", () => {
  const result = parseCardEffectLine(
    "[Counter] Choose a cost and reveal 1 card from the top of your opponent's deck. If the revealed card has the chosen cost, up to 1 of your Leader or Character cards gains +5000 power during this battle.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "counter" },
      effect: {
        type: "sequence",
        effects: [
          { effect: { type: "chooseNumber", purpose: "cost" } },
          { effect: { type: "revealTop", player: "opponent" } },
          {
            effect: {
              type: "selectFromSet",
              filter: {
                statComparisons: [
                  {
                    stat: "cost",
                    op: "eq",
                    value: { type: "savedNumber" },
                  },
                ],
              },
            },
          },
          {
            connector: "ifPreviousSucceeded",
            effect: {
              type: "modifyPower",
              duration: { type: "thisBattle" },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:eventCounter",
      "instruction:chooseNumber",
      "duration:thisBattle",
      "instruction:modifyPower",
    ]),
  );
});
