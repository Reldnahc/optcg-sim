import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";
import { parsePlaceAtOwnerDeckBottomInstruction } from "./instructions/owner-deck-bottom.js";

it("parses this Character owner-deck-bottom movement as a reusable self bounce", () => {
  expect(
    parsePlaceAtOwnerDeckBottomInstruction({
      text: "place this Character at the bottom of the owner's deck.",
    }),
  ).toEqual({
    effect: {
      type: "bounce",
      destination: "deckBottom",
      target: { type: "self" },
    },
    evidence: [
      "instruction:bounce",
      "target:thisCharacter",
      "destination:deck",
      "position:bottom",
    ],
    rest: "",
  });
});

it("parses owner-deck-bottom target followed by conditional source deck-bottom movement", () => {
  const parsed = parseCardEffectLine(
    "[On Play] Place up to 1 of your opponent's Characters at the bottom of the owner's deck. Then, if you do not have 5 Characters with a cost of 5 or more, place this Character at the bottom of the owner's deck.",
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
              type: "sequence",
              effects: [
                { effect: { type: "selectTargets" } },
                { effect: { type: "bounce", destination: "deckBottom" } },
              ],
            },
          },
          {
            connector: "then",
            effect: {
              type: "conditional",
              if: {
                type: "fieldCount",
                player: "self",
                filter: {
                  categories: ["character"],
                  cost: { min: 5 },
                },
                op: "lt",
                value: 5,
              },
              then: {
                type: "bounce",
                destination: "deckBottom",
                target: { type: "self" },
              },
            },
          },
        ],
      },
    },
  });
  expect(parsed?.evidence).toEqual(
    expect.arrayContaining([
      "instruction:moveSelected",
      "composition:selectThenApply",
      "connector:then",
      "expression:conditional",
      "condition:fieldCount",
      "condition:comparator:lt",
      "instruction:bounce",
      "target:thisCharacter",
      "composition:entryExpression",
    ]),
  );
});
