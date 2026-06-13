import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses shorthand cost thresholds in KO targets before active DON movement", () => {
  const result = parseCardEffectLine(
    "[Main] K.O. up to 1 of your opponent's Characters with a cost 5 or less. Then, add up to 1 DON!! card from your DON!! deck and set it as active.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "main" },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "sequence",
              effects: [
                {
                  effect: {
                    type: "selectTargets",
                    request: {
                      player: "opponent",
                      zone: "characterArea",
                      filter: {
                        categories: ["character"],
                        cost: { max: 5 },
                      },
                    },
                  },
                },
                {
                  effect: {
                    type: "ko",
                    target: {
                      type: "savedFieldObject",
                      zone: "characterArea",
                      player: "opponent",
                    },
                  },
                },
              ],
            },
          },
          {
            effect: {
              type: "moveCards",
              from: { player: "self", zone: "donDeck", position: "top" },
              to: { player: "self", zone: "costArea" },
              destinationState: "active",
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:eventMain",
      "instruction:ko",
      "filter:cost",
      "instruction:moveCards",
      "zone:donDeck",
      "destination:costArea",
      "state:active",
    ]),
  );
});

it("parses dynamic total-Life cost filters independently from attacking rest bodies", () => {
  const result = parseCardEffectLine(
    "[DON!! x1] [When Attacking] Rest up to 1 of your opponent's Characters with a cost equal to or less than the total of your and your opponent's Life cards.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "whenAttacking" },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "selectTargets",
              request: {
                player: "opponent",
                zone: "characterArea",
                filter: {
                  categories: ["character"],
                  statComparisons: [
                    {
                      stat: "cost",
                      op: "lte",
                      value: {
                        type: "countMatchingZoneCardsAcrossPlayers",
                        players: ["self", "opponent"],
                        zone: "life",
                      },
                    },
                  ],
                },
              },
            },
          },
          {
            effect: {
              type: "rest",
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:whenAttacking",
      "marker:attachedDon",
      "instruction:rest",
      "filter:cost",
      "valueSource:lifeCountTotal",
    ]),
  );
});

it("parses all-target temporary K.O. protection independently from On Play", () => {
  const result = parseCardEffectLine(
    "[On Play] All of your Characters with 1000 base power or less cannot be K.O.'d by your opponent's effects until the end of your opponent's next turn.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
      effect: {
        type: "protectFromKO",
        target: {
          type: "all",
          player: "self",
          zone: "characterArea",
          filter: {
            categories: ["character"],
            power: { max: 1000 },
          },
        },
        sourceKind: "cardEffect",
        sourceControllerRelation: "opponentControlled",
        duration: { type: "untilEndOfNextTurn", player: "opponent" },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "instruction:giveProtection",
      "cardinality:all",
      "filter:power",
      "protectionProcess:ko",
      "protectionSource:opponentEffects",
      "duration:opponentNextEndPhase",
    ]),
  );
});
