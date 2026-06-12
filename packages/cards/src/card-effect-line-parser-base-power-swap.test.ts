import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

const expectBasePowerSwapEvidence = (
  result: ReturnType<typeof parseCardEffectLine>,
) => {
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "composition:selectThenApply",
      "instruction:selectTargets",
      "instruction:swapBasePower",
      "value:basePower:snapshotBasePower",
    ]),
  );
};

it("parses selected self Character base-power swap during this turn", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] [Once Per Turn] Select 2 of your {Supernovas} or {Heart Pirates} type Characters. Swap the base power of the selected Characters with each other during this turn.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "activateMain" },
      oncePerTurn: true,
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "selected:base-power-swap",
            effect: {
              type: "selectTargets",
              request: {
                min: 2,
                max: 2,
                player: "self",
                zone: "characterArea",
                filter: {
                  categories: ["character"],
                  typesAny: ["Supernovas", "Heart Pirates"],
                },
              },
            },
          },
          {
            connector: "ifPreviousSucceeded",
            effect: {
              type: "swapBasePower",
              left: {
                type: "savedFieldObject",
                binding: {
                  family: "selectedTargets",
                  saveResultAs: "selected:base-power-swap",
                  objectIndex: 0,
                },
                zone: "characterArea",
                player: "self",
              },
              right: {
                type: "savedFieldObject",
                binding: {
                  family: "selectedTargets",
                  saveResultAs: "selected:base-power-swap",
                  objectIndex: 1,
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
  });
  expectBasePowerSwapEvidence(result);
});

it("parses opponent Character base-power swap from Main events", () => {
  const result = parseCardEffectLine(
    "[Main] Select 2 of your opponent's Characters with 9000 base power or less. Swap the base power of the selected Characters with each other during this turn.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "main" },
      effect: {
        type: "sequence",
        effects: [
          {
            saveResultAs: "selected:base-power-swap",
            effect: {
              type: "selectTargets",
              request: {
                min: 2,
                max: 2,
                player: "opponent",
                zone: "characterArea",
                filter: {
                  categories: ["character"],
                  power: { max: 9000 },
                },
              },
            },
          },
          {
            effect: {
              type: "swapBasePower",
              duration: { type: "thisTurn" },
            },
          },
        ],
      },
    },
  });
  expectBasePowerSwapEvidence(result);
});

it("parses leader and Character base-power swap during this battle", () => {
  const result = parseCardEffectLine(
    "[On Your Opponent's Attack] [Once Per Turn] You may trash 2 cards from your hand: Select your Leader and 1 Character. Swap the base power of the selected cards with each other during this battle.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onOpponentAttack" },
      oncePerTurn: true,
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "payCost",
              cost: {
                type: "trashFromHand",
                count: 2,
                optional: true,
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
                  saveResultAs: "selected:base-power-swap:left",
                  effect: {
                    type: "selectTargets",
                    request: {
                      min: 1,
                      max: 1,
                      player: "self",
                      zone: "leaderArea",
                      filter: { categories: ["leader"] },
                    },
                  },
                },
                {
                  connector: "ifPreviousSucceeded",
                  saveResultAs: "selected:base-power-swap:right",
                  effect: {
                    type: "selectTargets",
                    request: {
                      min: 1,
                      max: 1,
                      player: "self",
                      zone: "characterArea",
                      filter: { categories: ["character"] },
                    },
                  },
                },
                {
                  connector: "ifPreviousSucceeded",
                  effect: {
                    type: "swapBasePower",
                    left: {
                      binding: {
                        saveResultAs: "selected:base-power-swap:left",
                      },
                      zone: "leaderArea",
                    },
                    right: {
                      binding: {
                        saveResultAs: "selected:base-power-swap:right",
                      },
                      zone: "characterArea",
                    },
                    duration: { type: "thisBattle" },
                  },
                },
              ],
            },
          },
        ],
      },
    },
  });
  expectBasePowerSwapEvidence(result);
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "composition:optionalCostedEffect",
      "cost:trashFromHand",
      "duration:thisBattle",
    ]),
  );
});

it("does not accept field-effect-only durations for base-power swaps", () => {
  const result = parseCardEffectLine(
    "[Main] Select 2 of your opponent's Characters with 9000 base power or less. Swap the base power of the selected Characters with each other until the start of your next turn.",
  );

  expect(result).toBeUndefined();
});
