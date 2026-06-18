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
