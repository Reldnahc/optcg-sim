import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses selected target stat comparison condition into reusable selection and conditional KO primitives", () => {
  const result = parseCardEffectLine(
    "[On Play] Select up to 1 of your opponent's rested Characters. If the chosen Character has a cost equal to the number of DON!! cards given to it, K.O. it.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "selected:chosenCharacter",
            effect: {
              type: "selectTargets",
              request: {
                timing: "onResolution",
                chooser: "self",
                player: "opponent",
                zone: "characterArea",
                min: 0,
                max: 1,
                allowFewerIfUnavailable: true,
                visibility: "public",
                filter: { categories: ["character"], state: "rested" },
              },
            },
          },
          {
            connector: "then",
            effect: {
              type: "conditional",
              if: {
                type: "cardStatComparison",
                target: {
                  type: "savedFieldObject",
                  binding: {
                    family: "selectedTargets",
                    saveResultAs: "selected:chosenCharacter",
                  },
                  zone: "characterArea",
                  player: "opponent",
                  visibility: "publicOnly",
                  onFailure: "failClosed",
                },
                stat: "cost",
                op: "eq",
                value: {
                  type: "countAttachedDon",
                  target: {
                    type: "savedFieldObject",
                    binding: {
                      family: "selectedTargets",
                      saveResultAs: "selected:chosenCharacter",
                    },
                    zone: "characterArea",
                    player: "opponent",
                    visibility: "publicOnly",
                    onFailure: "failClosed",
                  },
                  per: 1,
                  multiplier: 1,
                },
              },
              then: {
                type: "ko",
                target: {
                  type: "savedFieldObject",
                  binding: {
                    family: "selectedTargets",
                    saveResultAs: "selected:chosenCharacter",
                  },
                  zone: "characterArea",
                  player: "opponent",
                  visibility: "publicOnly",
                  onFailure: "failClosed",
                },
              },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "instruction:selectTargets",
      "target:opponentCharacters",
      "filter:state:rested",
      "condition:cardStatComparison",
      "condition:stat:cost",
      "condition:comparator:eq",
      "value:dynamic:attachedDonCount",
      "composition:savedTargetCondition",
      "instruction:ko",
      "expression:conditional",
      "expression:sequence",
    ]),
  );
});

it("parses the same selected target condition under another entry point", () => {
  const result = parseCardEffectLine(
    "[When Attacking] Select up to 1 of your opponent's rested Characters. If the chosen Character has a cost equal to the number of DON!! cards given to it, K.O. it.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "whenAttacking" },
      effect: {
        type: "sequence",
        effects: [
          { effect: { type: "selectTargets" } },
          {
            effect: {
              type: "conditional",
              if: { type: "cardStatComparison" },
              then: { type: "ko" },
            },
          },
        ],
      },
    },
  });
});
