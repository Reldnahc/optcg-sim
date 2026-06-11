import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses optional trash-self into conditional keyword and attribute grants", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] You may trash this Character: If you have 15 or more cards in your trash, up to 1 of your [Monkey.D.Luffy] Characters gains [Rush: Character] and the <Slash> attribute during this turn.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "activateMain" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "payCost",
              cost: { type: "trashSelf", optional: true },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "conditional",
              if: {
                type: "trashCount",
                player: "self",
                op: "gte",
                value: 15,
              },
              then: {
                type: "sequence",
                effects: [
                  {
                    connector: "always",
                    effect: {
                      type: "selectTargets",
                      request: {
                        min: 0,
                        max: 1,
                        player: "self",
                        filter: {
                          categories: ["character"],
                          names: ["Monkey.D.Luffy"],
                        },
                      },
                    },
                    saveResultAs: "selected:keyword-attribute-grant",
                  },
                  {
                    connector: "ifPreviousSucceeded",
                    effect: {
                      type: "giveKeyword",
                      keyword: "rushCharacter",
                      target: {
                        type: "savedFieldObject",
                        binding: {
                          family: "selectedTargets",
                          saveResultAs: "selected:keyword-attribute-grant",
                        },
                        zone: "characterArea",
                        player: "self",
                      },
                      duration: { type: "thisTurn" },
                    },
                  },
                  {
                    connector: "ifPreviousSucceeded",
                    effect: {
                      type: "giveAttribute",
                      attribute: "slash",
                      target: {
                        type: "savedFieldObject",
                        binding: {
                          family: "selectedTargets",
                          saveResultAs: "selected:keyword-attribute-grant",
                        },
                        zone: "characterArea",
                        player: "self",
                      },
                      duration: { type: "thisTurn" },
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:activateMain",
      "composition:optionalCostedEffect",
      "cost:trashSelf",
      "condition:trashCount",
      "expression:conditional",
      "composition:sequence",
      "instruction:selectTargets",
      "instruction:giveKeyword",
      "instruction:giveAttribute",
      "keyword:anySupported",
      "filter:attribute",
      "duration:thisTurn",
    ]),
  );
});

it("reuses targeted keyword and attribute grants under another entry point", () => {
  const result = parseCardEffectLine(
    "[On Play] Up to 1 of your [Sabo] Characters gains [Blocker] and the <Special> attribute during this turn.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "selectTargets",
              request: {
                min: 0,
                max: 1,
                player: "self",
                filter: {
                  categories: ["character"],
                  names: ["Sabo"],
                },
              },
            },
            saveResultAs: "selected:keyword-attribute-grant",
          },
          {
            connector: "ifPreviousSucceeded",
            effect: {
              type: "giveKeyword",
              keyword: "blocker",
              target: {
                type: "savedFieldObject",
                binding: {
                  family: "selectedTargets",
                  saveResultAs: "selected:keyword-attribute-grant",
                },
                zone: "characterArea",
                player: "self",
              },
            },
          },
          {
            connector: "ifPreviousSucceeded",
            effect: {
              type: "giveAttribute",
              attribute: "special",
              target: {
                type: "savedFieldObject",
                binding: {
                  family: "selectedTargets",
                  saveResultAs: "selected:keyword-attribute-grant",
                },
                zone: "characterArea",
                player: "self",
              },
            },
          },
        ],
      },
    },
  });
});
