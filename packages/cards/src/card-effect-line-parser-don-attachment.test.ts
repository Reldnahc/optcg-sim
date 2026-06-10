import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses rested DON attachment to the selected DON owner's Leader or Character", () => {
  const result = parseCardEffectLine(
    "[When Attacking] Give up to 1 rested DON!! card to its owner's Leader or 1 of their Characters.",
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
                chooser: "self",
                player: "anyPlayer",
                zone: "costArea",
                min: 0,
                max: 1,
                filter: { categories: ["don"], state: "rested" },
              },
            },
          },
          {
            effect: {
              type: "selectTargets",
              request: {
                chooser: "self",
                player: "anyPlayer",
                zones: ["leaderArea", "characterArea"],
                min: 1,
                max: 1,
                filter: { categories: ["leader", "character"] },
              },
            },
          },
          {
            effect: {
              type: "attachSelectedDon",
              targetOwner: "selectedDonOwner",
              sourceState: "rested",
              target: { type: "savedFieldObject", player: "anyPlayer" },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:whenAttacking",
      "instruction:attachDon",
      "filter:state:rested",
      "reference:ownerOfSelected",
      "composition:selectThenApply",
    ]),
  );
});

it("parses opponent rested DON attachment to opponent Characters", () => {
  const result = parseCardEffectLine(
    "[On Play] Give up to 3 of your opponent's rested DON!! cards to 1 of your opponent's Characters.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "selectTargets",
              request: {
                player: "opponent",
                zone: "costArea",
                min: 0,
                max: 3,
                filter: { categories: ["don"], state: "rested" },
              },
            },
          },
          {
            effect: {
              type: "selectTargets",
              request: {
                player: "opponent",
                zone: "characterArea",
                min: 1,
                max: 1,
                filter: { categories: ["character"] },
              },
            },
          },
          {
            effect: {
              type: "attachSelectedDon",
              sourceState: "rested",
              target: { type: "savedFieldObject", player: "opponent" },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "instruction:attachDon",
      "player:opponent",
      "filter:state:rested",
      "composition:selectThenApply",
    ]),
  );
});

it("parses opponent cost-area DON attachment without requiring a rested source", () => {
  const result = parseCardEffectLine(
    "[On Play] Give up to 2 DON!! cards from your opponent's cost area to 1 of your opponent's Characters.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "selectTargets",
              request: {
                player: "opponent",
                zone: "costArea",
                min: 0,
                max: 2,
                filter: { categories: ["don"] },
              },
            },
          },
          {
            effect: {
              type: "selectTargets",
              request: {
                player: "opponent",
                zone: "characterArea",
                min: 1,
                max: 1,
                filter: { categories: ["character"] },
              },
            },
          },
          {
            effect: {
              type: "attachSelectedDon",
              target: { type: "savedFieldObject", player: "opponent" },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "instruction:attachDon",
      "player:opponent",
      "zone:costArea",
      "composition:selectThenApply",
    ]),
  );
});
