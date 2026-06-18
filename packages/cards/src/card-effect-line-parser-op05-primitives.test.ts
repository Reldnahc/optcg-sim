import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses all Characters owner deck-bottom placement as all-target bounce", () => {
  const mainResult = parseCardEffectLine(
    "[Main] Place all Characters with a cost of 3 or less at the bottom of the owner's deck.",
  );
  const triggerResult = parseCardEffectLine(
    "[Trigger] Place all Characters with a cost of 2 or less at the bottom of the owner's deck.",
  );

  expect(mainResult).toMatchObject({
    block: {
      trigger: { type: "main" },
      effect: {
        type: "bounce",
        destination: "deckBottom",
        target: {
          type: "all",
          player: "anyPlayer",
          zone: "characterArea",
          filter: {
            categories: ["character"],
            cost: { max: 3 },
          },
        },
      },
    },
  });
  expect(triggerResult).toMatchObject({
    block: {
      trigger: { type: "trigger" },
      effect: {
        type: "bounce",
        destination: "deckBottom",
        target: {
          type: "all",
          player: "anyPlayer",
          zone: "characterArea",
          filter: {
            categories: ["character"],
            cost: { max: 2 },
          },
        },
      },
    },
  });
  expect(mainResult?.evidence).toEqual(
    expect.arrayContaining([
      "entry:eventMain",
      "instruction:bounce",
      "cardinality:all",
      "player:any",
      "filter:cost",
      "destination:deck",
      "position:bottom",
    ]),
  );
});

it("parses all-target deck-bottom placement followed by both players trashing down to a hand count", () => {
  const result = parseCardEffectLine(
    "[Main] Place all Characters with a cost of 3 or less at the bottom of the owner's deck. Then, you and your opponent trash cards from your hands until you each have 5 cards in your hands.",
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
              type: "bounce",
              destination: "deckBottom",
              target: {
                type: "all",
                player: "anyPlayer",
                zone: "characterArea",
                filter: {
                  categories: ["character"],
                  cost: { max: 3 },
                },
              },
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
                    type: "trashFromHandUntilCount",
                    player: "self",
                    chooser: "self",
                    handCount: 5,
                  },
                },
                {
                  connector: "then",
                  effect: {
                    type: "trashFromHandUntilCount",
                    player: "opponent",
                    chooser: "opponent",
                    handCount: 5,
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
      "entry:eventMain",
      "instruction:bounce",
      "cardinality:all",
      "instruction:trashFromHandUntilCount",
      "player:self",
      "player:opponent",
    ]),
  );
});

it("parses KO replacement power changes against the replacement target", () => {
  const result = parseCardEffectLine(
    "[DON!! x1] [Opponent's Turn] [Once Per Turn] If your Character with 5000 power or more would be K.O.'d, you may give that Character -1000 power during this turn instead of that Character being K.O.'d.",
  );

  expect(result).toMatchObject({
    block: {
      category: "replacement",
      trigger: {
        type: "replacement",
        replacement: {
          type: "wouldBeKOd",
          target: {
            type: "all",
            zone: "characterArea",
            player: "self",
            filter: {
              categories: ["character"],
            },
          },
        },
      },
      optional: true,
      oncePerTurn: true,
      condition: { type: "and" },
      effect: {
        type: "replacement",
        instead: {
          type: "modifyPower",
          target: { type: "replacementTarget" },
          value: -1000,
          duration: { type: "thisTurn" },
        },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "marker:attachedDon",
      "entry:opponentTurn",
      "marker:oncePerTurn",
      "replacement:wouldBeKOd",
      "target:replacementTarget",
      "filter:currentPower",
      "instruction:modifyPower",
      "duration:thisTurn",
    ]),
  );
});

it("parses KO replacement up-to filtered rest bodies", () => {
  const result = parseCardEffectLine(
    "[Once Per Turn] If this Character would be K.O.'d, you may rest up to 1 of your Characters with a cost of 3 or more other than [Pica] instead.",
  );

  expect(result).toMatchObject({
    block: {
      category: "replacement",
      trigger: {
        type: "replacement",
        replacement: {
          type: "wouldBeKOd",
          target: { type: "self" },
        },
      },
      oncePerTurn: true,
      optional: true,
      effect: {
        type: "replacement",
        instead: {
          type: "rest",
          target: {
            type: "chooseFromZones",
            request: {
              chooser: "self",
              player: "self",
              zones: ["characterArea"],
              min: 0,
              max: 1,
              allowFewerIfUnavailable: true,
              filter: {
                categories: ["character"],
                cost: { min: 3 },
                nameNot: ["Pica"],
              },
            },
          },
        },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "marker:oncePerTurn",
      "replacement:wouldBeKOd",
      "instruction:rest",
      "cardinality:upTo",
      "filter:cost",
      "condition:comparator:gte",
      "condition:threshold:positiveInteger",
      "filter:nameNot",
    ]),
  );
});

it("parses conditional all-character refresh locks across both players", () => {
  const result = parseCardEffectLine(
    "If your Leader is [Donquixote Doflamingo], all Characters with a cost of 5 or less do not become active in your and your opponent's Refresh Phases.",
  );

  expect(result).toMatchObject({
    block: {
      category: "permanent",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "cannotBecomeActive",
              target: {
                type: "all",
                player: "self",
                zone: "characterArea",
                filter: {
                  categories: ["character"],
                  cost: { max: 5 },
                },
              },
              duration: {
                type: "whileConditionTrue",
                condition: {
                  type: "hasCardInZone",
                  player: "self",
                  zone: "leaderArea",
                  filter: {
                    categories: ["leader"],
                    names: ["Donquixote Doflamingo"],
                  },
                },
              },
            },
          },
          {
            connector: "always",
            effect: {
              type: "cannotBecomeActive",
              target: {
                type: "all",
                player: "opponent",
                zone: "characterArea",
                filter: {
                  categories: ["character"],
                  cost: { max: 5 },
                },
              },
              duration: {
                type: "whileConditionTrue",
                condition: {
                  type: "hasCardInZone",
                  player: "self",
                  zone: "leaderArea",
                  filter: {
                    categories: ["leader"],
                    names: ["Donquixote Doflamingo"],
                  },
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
      "expression:conditionalContinuous",
      "condition:leaderIdentity",
      "instruction:preventActivation",
      "cardinality:all",
      "player:self",
      "player:opponent",
      "filter:cost",
      "duration:whileConditionTrue",
    ]),
  );
});

it("parses end-of-turn conditional all-rested K.O. then trash-self Stage", () => {
  const result = parseCardEffectLine(
    "[End of Your Turn] If you have 10 DON!! cards on your field, K.O. all rested Characters with a cost of 5 or less. Then, trash this Stage.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "endOfYourTurn" },
      condition: {
        type: "fieldCount",
        player: "self",
        op: "eq",
        value: 10,
      },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "ko",
              target: {
                type: "all",
                player: "anyPlayer",
                zone: "characterArea",
                filter: {
                  categories: ["character"],
                  state: "rested",
                  cost: { max: 5 },
                },
              },
            },
          },
          {
            connector: "then",
            effect: {
              type: "trash",
              target: { type: "self" },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:endOfYourTurn",
      "expression:conditional",
      "condition:donFieldCount",
      "instruction:ko",
      "cardinality:all",
      "player:any",
      "filter:state:rested",
      "filter:cost",
      "instruction:trash",
      "target:thisStage",
      "expression:sequence",
    ]),
  );
});

it("parses circled DON plus two rest costs before reusable trash-to-hand selection", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] ➀ (You may rest the specified number of DON!! cards in your cost area.) You may rest this Character and 1 of your Characters: Add up to 1 black Character card with a cost of 1 from your trash to your hand.",
  );

  expect(result).toMatchObject({
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
                  { type: "restDon", count: 1, chooser: "self" },
                  { type: "restSelf" },
                  {
                    type: "restFromField",
                    count: 1,
                    chooser: "self",
                    filter: { categories: ["character"] },
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
                  effect: {
                    type: "selectCards",
                    zone: "trash",
                    player: "self",
                    chooser: "self",
                    min: 0,
                    max: 1,
                    filter: {
                      categories: ["character"],
                      colorsAny: ["black"],
                      cost: { op: "eq", value: 1 },
                    },
                  },
                },
                {
                  connector: "then",
                  effect: {
                    type: "moveSelected",
                    from: "trash",
                    to: "hand",
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
      "entry:activateMain",
      "composition:optionalCostedEffect",
      "composition:costSequence",
      "cost:restDon",
      "cost:restSelf",
      "cost:restFromField",
      "filter:category:character",
      "instruction:moveSelected",
      "zone:trash",
      "destination:hand",
      "filter:color",
      "filter:cost",
      "composition:entryExpression",
    ]),
  );
});
