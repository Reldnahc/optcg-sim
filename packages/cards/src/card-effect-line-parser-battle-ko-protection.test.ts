import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses conditional battle KO protection and self power gain as continuous primitives", () => {
  const result = parseCardEffectLine(
    "If your Leader has the <Slash> attribute, this Character cannot be K.O.'d in battle by <Slash> attribute cards and gains +1000 power.",
  );

  expect(result).toMatchObject({
    block: {
      category: "permanent",
      trigger: { type: "permanent" },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "protectFromKO",
              target: { type: "self" },
              sourceKind: "battle",
              sourceCardFilter: { attributesAny: ["slash"] },
              duration: {
                type: "whileConditionTrue",
                condition: {
                  type: "hasCardInZone",
                  zone: "leaderArea",
                  player: "self",
                  filter: {
                    categories: ["leader"],
                    attributesAny: ["slash"],
                  },
                },
              },
            },
          },
          {
            effect: {
              type: "modifyPower",
              target: { type: "self" },
              value: 1000,
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:implicitPermanent",
      "expression:conditionalContinuous",
      "condition:leaderIdentity",
      "instruction:giveProtection",
      "protectionProcess:ko",
      "protectionSource:battle",
      "filter:attribute",
      "instruction:modifyPower",
      "duration:whileConditionTrue",
    ]),
  );
});
