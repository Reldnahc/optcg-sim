import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses rested DON attachment to an up-to named field target", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] You may rest this Stage: Give up to 1 rested DON!! card to up to 1 of your [Example] cards.",
  );

  expect(result).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "payCost",
              cost: { type: "restSelf", optional: true },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "sequence",
              effects: [
                { effect: { type: "selectCards", zone: "costArea" } },
                {
                  effect: {
                    type: "selectTargets",
                    request: {
                      player: "self",
                      zones: ["leaderArea", "characterArea"],
                      min: 1,
                      max: 1,
                      filter: {
                        categories: ["leader", "character"],
                        names: ["Example"],
                      },
                    },
                  },
                },
                { effect: { type: "attachSelectedDon" } },
              ],
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "cost:restSelf",
      "instruction:attachDon",
      "cardinality:upTo",
      "filter:name",
      "composition:selectThenApply",
    ]),
  );
});

it("parses top-or-bottom Life visibility costs through the shared cost primitive", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] [Once Per Turn] You may turn 1 card from the top or bottom of your Life cards face-up: Give up to 1 rested DON!! card to your Leader.",
  );

  expect(result).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      oncePerTurn: true,
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "payCost",
              cost: {
                type: "turnLifeFaceUp",
                count: 1,
                player: "self",
                position: "topOrBottom",
                optional: true,
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: { type: "sequence" },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "cost:turnLifeFaceUp",
      "position:top",
      "position:bottom",
      "destination:faceUp",
      "instruction:attachDon",
    ]),
  );
});

it("parses attack retargeting to a named card with a base-power filter", () => {
  const result = parseCardEffectLine(
    '[On Your Opponent\'s Attack] [Once Per Turn] You may turn 1 card from the top or bottom of your Life cards face-down: Change the target of that attack to one of your [Example"Name"] cards with 5000 base power or more.',
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onOpponentAttack" },
      oncePerTurn: true,
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "payCost",
              cost: {
                type: "setLifeFaceUp",
                position: "topOrBottom",
                faceUp: false,
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "sequence",
              effects: [
                {
                  saveResultAs: "targetSelection:change-attack-target",
                  effect: {
                    type: "selectTargets",
                    request: {
                      player: "self",
                      zones: ["leaderArea", "characterArea"],
                      filter: {
                        names: ['Example"Name"'],
                        power: { min: 5000 },
                      },
                    },
                  },
                },
                { effect: { type: "changeAttackTarget" } },
              ],
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "instruction:changeAttackTarget",
      "filter:name",
      "filter:power",
      "composition:selectThenApply",
    ]),
  );
});

it("parses selected negative power scaled by matching controlled field cards", () => {
  const result = parseCardEffectLine(
    "[On Play] Give up to 1 of your opponent's Characters -1000 power during this turn for each {Example} type card you control.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      effect: {
        type: "modifyPower",
        target: {
          type: "choose",
          request: {
            player: "opponent",
            zone: "characterArea",
            min: 0,
            max: 1,
          },
        },
        value: {
          type: "countMatchingFieldCards",
          player: "self",
          zone: "field",
          filter: { typesAny: ["Example"] },
          multiplier: -1000,
        },
        duration: { type: "thisTurn" },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "instruction:modifyPower",
      "valueSource:fieldCount",
      "modifier:negativePower",
      "filter:type",
    ]),
  );
});

it("parses optional costs that rest a filtered field card or DON", () => {
  const result = parseCardEffectLine(
    "[On Play] You may rest 1 of your <Slash> attribute Leader or DON!! cards: Draw 2 cards and trash 1 card from your hand.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "payCost",
              cost: {
                type: "chooseOne",
                optional: true,
                options: [
                  {
                    type: "restFromField",
                    count: 1,
                    filter: {
                      categories: ["leader"],
                      attributesAny: ["slash"],
                    },
                  },
                  {
                    type: "restDon",
                    count: 1,
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
                { effect: { type: "draw", count: 2 } },
                { effect: { type: "trashFromHand", count: 1 } },
              ],
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "cost:chooseOne",
      "cost:restFromField",
      "cost:restDon",
      "filter:attribute",
      "filter:category:leader",
    ]),
  );
});

it("parses selected opponent character base power becoming zero", () => {
  const result = parseCardEffectLine(
    "[On Play] Up to 1 of your opponent's Characters' base power becomes 0 during this turn.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      effect: {
        type: "setBasePower",
        target: {
          type: "choose",
          request: {
            player: "opponent",
            zone: "characterArea",
            min: 0,
            max: 1,
          },
        },
        value: 0,
        duration: { type: "thisTurn" },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "instruction:setBasePower",
      "value:basePower:nonNegativeInteger",
      "duration:thisTurn",
    ]),
  );
});
