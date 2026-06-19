import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses turn-window deck-count continuous self power through reusable condition composition", () => {
  const result = parseCardEffectLine(
    "[Opponent's Turn] If you have 20 or less cards in your deck, this Character gains +3000 power.",
  );

  expect(result).toMatchObject({
    block: {
      category: "permanent",
      condition: { type: "opponentTurn" },
      effect: {
        type: "modifyPower",
        target: { type: "self" },
        value: 3000,
        duration: {
          type: "whileConditionTrue",
          condition: {
            type: "and",
            conditions: [
              { type: "opponentTurn" },
              {
                type: "deckCount",
                player: "self",
                op: "lte",
                value: 20,
              },
            ],
          },
        },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:opponentTurn",
      "expression:conditionalContinuous",
      "composition:conditionAnd",
      "condition:deckCount",
      "condition:comparator:lte",
      "instruction:modifyPower",
      "duration:whileConditionTrue",
    ]),
  );
});

it("parses attached-DON deck-count continuous self power through the same condition primitive", () => {
  const result = parseCardEffectLine(
    "[DON!! x1] If you have 20 or less cards in your deck, this Character gains +2000 power.",
  );

  expect(result).toMatchObject({
    block: {
      category: "permanent",
      condition: {
        type: "attachedDonCount",
        target: { type: "self" },
        op: "gte",
        value: 1,
      },
      effect: {
        type: "modifyPower",
        target: { type: "self" },
        value: 2000,
        duration: {
          type: "whileConditionTrue",
          condition: {
            type: "and",
            conditions: [
              {
                type: "attachedDonCount",
                target: { type: "self" },
                op: "gte",
                value: 1,
              },
              {
                type: "deckCount",
                player: "self",
                op: "lte",
                value: 20,
              },
            ],
          },
        },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "marker:attachedDon",
      "condition:attachedDonCount",
      "expression:conditionalContinuous",
      "composition:conditionAnd",
      "condition:deckCount",
      "instruction:modifyPower",
    ]),
  );
});

it("parses action deck-count conditions independently from continuous power bodies", () => {
  const result = parseCardEffectLine(
    "[On Play] If you have 20 or less cards in your deck, return up to 1 Character with a cost of 3 or less to the owner's hand.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      condition: {
        type: "deckCount",
        player: "self",
        op: "lte",
        value: 20,
      },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "selectTargets",
              request: {
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
            effect: {
              type: "bounce",
              destination: "hand",
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "expression:conditional",
      "condition:deckCount",
      "instruction:returnToOwnerHand",
    ]),
  );
});
