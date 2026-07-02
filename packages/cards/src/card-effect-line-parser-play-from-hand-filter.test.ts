import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses conditional play-from-hand rested with separated type-or-attribute filters", () => {
  expect(
    parseCardEffectLine(
      "[On Play] If you have 2 or less Characters, play up to 1 {Muggy Kingdom} type or <Slash> attribute Character card with a cost of 4 or less other than [Dracule Mihawk] from your hand rested.",
    ),
  ).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
      condition: {
        type: "fieldCount",
        player: "self",
        filter: { categories: ["character"] },
        op: "lte",
        value: 2,
      },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "selectCards",
              zone: "hand",
              player: "self",
              chooser: "self",
              min: 0,
              max: 1,
              filter: {
                anyOf: [
                  { typesAny: ["Muggy Kingdom"] },
                  { attributesAny: ["slash"] },
                ],
                categories: ["character"],
                cost: { max: 4 },
                nameNot: ["Dracule Mihawk"],
              },
            },
          },
          {
            effect: {
              type: "playSelected",
              selection: "handSelection:play-from-hand",
              ignoreCost: true,
              enterRested: true,
            },
          },
        ],
      },
    },
  });
});

it("parses leader attached-DON condition before typed power-filtered hand play", () => {
  const result = parseCardEffectLine(
    "[On K.O.] If your Leader has any DON!! cards given, you may play up to 1 {Straw Hat Crew} type Character card with 6000 power or less from your hand.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onKO" },
      condition: {
        type: "attachedDonCount",
        target: { type: "myLeader" },
        op: "gte",
        value: 1,
      },
      effect: {
        type: "sequence",
        effects: [
          {
            optional: true,
            effect: {
              type: "sequence",
              effects: [
                {
                  effect: {
                    type: "selectCards",
                    zone: "hand",
                    player: "self",
                    chooser: "self",
                    min: 0,
                    max: 1,
                    filter: {
                      categories: ["character"],
                      typesAny: ["Straw Hat Crew"],
                      power: { max: 6000 },
                    },
                  },
                },
                {
                  effect: {
                    type: "playSelected",
                    selection: "handSelection:play-from-hand",
                    ignoreCost: true,
                  },
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
      "condition:attachedDonCount",
      "zone:leaderArea",
      "filter:power",
      "instruction:playSelected",
    ]),
  );
});

it("parses exact DON conditional play followed by opponent life movement", () => {
  const result = parseCardEffectLine(
    "[Main] If you have 10 DON!! cards on your field, play up to 1 [Marshall.D.Teach] from your hand. Then, add up to 1 card from the top of your opponent's Life cards to the owner's hand.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "main" },
      condition: {
        type: "fieldCount",
        player: "self",
        filter: { categories: ["don"] },
        op: "eq",
        value: 10,
      },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "sequence",
              effects: [
                {
                  effect: {
                    type: "selectCards",
                    zone: "hand",
                    player: "self",
                    chooser: "self",
                    min: 0,
                    max: 1,
                    filter: { names: ["Marshall.D.Teach"] },
                  },
                },
                {
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
            connector: "then",
            effect: {
              type: "moveCards",
              min: 0,
              count: 1,
              from: {
                player: "opponent",
                zone: "life",
                position: "top",
              },
              to: {
                player: "owner",
                zone: "hand",
              },
              order: "original",
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "condition:donFieldCount",
      "condition:comparator:eq",
      "instruction:playSelected",
      "filter:name",
      "instruction:moveCards",
      "destination:ownerHand",
      "composition:entryExpression",
    ]),
  );
});

it("parses conditional play followed by sentence-form optional Life cost and if-you-do power gain", () => {
  const result = parseCardEffectLine(
    `[Main] If your Leader's type includes "Whitebeard Pirates", play up to 1 [Edward.Newgate] from your hand. Then, you may add 1 card from the top or bottom of your Life cards to your hand. If you do, up to 1 of your Leader gains +2000 power until the end of your opponent's next turn.`,
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "main" },
      condition: {
        type: "hasCardInZone",
        zone: "leaderArea",
        player: "self",
        filter: {
          categories: ["leader"],
          typesIncludeAny: ["Whitebeard Pirates"],
        },
      },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "sequence",
              effects: [
                {
                  effect: {
                    type: "selectCards",
                    zone: "hand",
                    player: "self",
                    chooser: "self",
                    min: 0,
                    max: 1,
                    filter: { names: ["Edward.Newgate"] },
                  },
                },
                {
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
            connector: "then",
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
                      optional: true,
                      from: {
                        player: "self",
                        zone: "life",
                        position: "topOrBottom",
                      },
                      to: { player: "self", zone: "hand" },
                      order: "chooserChoice",
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
                        player: "self",
                        zones: ["leaderArea"],
                        min: 0,
                        max: 1,
                        filter: { categories: ["leader"] },
                      },
                    },
                    value: 2000,
                    duration: {
                      type: "untilEndOfNextTurn",
                      player: "opponent",
                    },
                  },
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
      "condition:leaderIdentity",
      "filter:type",
      "instruction:playSelected",
      "filter:name",
      "composition:optionalCostedEffect",
      "cost:moveCards",
      "zone:life",
      "position:top",
      "position:bottom",
      "destination:hand",
      "instruction:modifyPower",
      "target:yourLeader",
      "duration:opponentNextEndPhase",
    ]),
  );
});
