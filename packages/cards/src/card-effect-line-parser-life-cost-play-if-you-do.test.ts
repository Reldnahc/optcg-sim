import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses optional Life cost into play-from-hand followed by if-you-do draw", () => {
  const parsed = parseCardEffectLine(
    "[On Play] You may add 1 card from the top or bottom of your Life cards to your hand: Play up to 1 {Revolutionary Army} type Character card with a cost of 4 or less from your hand. If you do, draw 1 card.",
  );

  expect(parsed).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "payCost",
              cost: {
                type: "moveCards",
                count: 1,
                chooser: "self",
                from: { player: "self", zone: "life", position: "topOrBottom" },
                to: { player: "self", zone: "hand" },
                order: "chooserChoice",
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
                  effect: {
                    type: "sequence",
                    effects: [
                      {
                        connector: "always",
                        effect: {
                          type: "selectCards",
                          zone: "hand",
                          player: "self",
                          chooser: "self",
                          min: 0,
                          max: 1,
                          filter: {
                            categories: ["character"],
                            typesAny: ["Revolutionary Army"],
                            cost: { max: 4 },
                          },
                        },
                      },
                      {
                        connector: "ifPossible",
                        effect: {
                          type: "playSelected",
                          selection: "handSelection:play-from-hand",
                          ignoreCost: true,
                        },
                      },
                    ],
                  },
                },
                {
                  connector: "ifYouDo",
                  effect: { type: "draw", player: "self", count: 1 },
                },
              ],
            },
          },
        ],
      },
    },
  });
  expect(parsed?.evidence).toEqual(
    expect.arrayContaining([
      "composition:optionalCostedEffect",
      "cost:moveCards",
      "instruction:playSelected",
      "filter:type",
      "filter:category:character",
      "filter:cost",
      "instruction:draw",
      "composition:ifYouDoContinuation",
      "composition:entryExpression",
    ]),
  );
});

it("parses rest-self plus Life-to-hand as one reusable cost sequence", () => {
  const parsed = parseCardEffectLine(
    "[Activate: Main] You may rest this Character and add 1 card from the top or bottom of your Life cards to your hand: Up to 1 of your Leader or Character cards gains +3000 power during this turn.",
  );

  expect(parsed).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "payCost",
              cost: {
                type: "sequence",
                optional: true,
                costs: [
                  { type: "restSelf" },
                  {
                    type: "moveCards",
                    count: 1,
                    chooser: "self",
                    from: {
                      player: "self",
                      zone: "life",
                      position: "topOrBottom",
                    },
                    to: { player: "self", zone: "hand" },
                    order: "chooserChoice",
                  },
                ],
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "modifyPower",
              target: {
                type: "chooseFromZones",
                request: {
                  chooser: "self",
                  player: "self",
                  zones: ["leaderArea", "characterArea"],
                  min: 0,
                  max: 1,
                  filter: { categories: ["leader", "character"] },
                },
              },
              value: 3000,
              duration: { type: "thisTurn" },
            },
          },
        ],
      },
    },
  });
  expect(parsed?.evidence).toEqual(
    expect.arrayContaining([
      "entry:activateMain",
      "composition:optionalCostedEffect",
      "composition:costSequence",
      "cost:restSelf",
      "target:thisCharacter",
      "cost:moveCards",
      "zone:life",
      "position:top",
      "position:bottom",
      "destination:hand",
      "instruction:modifyPower",
      "target:yourLeaderOrCharacters",
      "composition:entryExpression",
    ]),
  );
});
