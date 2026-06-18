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

it("parses opponent Leader or Character presence before battle KO protection", () => {
  const result = parseCardEffectLine(
    "If your opponent has a Leader or Character with a base power of 6000 or more, this Character cannot be K.O.'d in battle.",
  );

  expect(result).toMatchObject({
    block: {
      category: "permanent",
      trigger: { type: "permanent" },
      effect: {
        type: "protectFromKO",
        target: { type: "self" },
        sourceKind: "battle",
        duration: {
          type: "whileConditionTrue",
          condition: {
            type: "fieldCount",
            player: "opponent",
            filter: {
              categories: ["leader", "character"],
              power: { min: 6000 },
            },
            op: "gte",
            value: 1,
          },
        },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:implicitPermanent",
      "expression:conditionalContinuous",
      "condition:opponentFieldCount",
      "filter:category:leader",
      "filter:category:character",
      "filter:power",
      "instruction:giveProtection",
      "protectionProcess:ko",
      "protectionSource:battle",
      "duration:whileConditionTrue",
    ]),
  );
});

it("parses active-source conditional protection for filtered own Characters", () => {
  const result = parseCardEffectLine(
    "If this Character is active, your {Minks} type Characters with a cost of 3 or less other than [Pekoms] cannot be K.O.'d by effects.",
  );

  expect(result).toMatchObject({
    block: {
      category: "permanent",
      trigger: { type: "permanent" },
      effect: {
        type: "protectFromKO",
        target: {
          type: "all",
          player: "self",
          zone: "characterArea",
          filter: {
            categories: ["character"],
            typesAny: ["Minks"],
            cost: { max: 3 },
            nameNot: ["Pekoms"],
          },
        },
        sourceKind: "cardEffect",
        sourceControllerRelation: "eitherController",
        duration: {
          type: "whileConditionTrue",
          condition: {
            type: "cardState",
            target: { type: "self" },
            state: "active",
          },
        },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:implicitPermanent",
      "expression:conditionalContinuous",
      "condition:cardState",
      "state:active",
      "instruction:giveProtection",
      "cardinality:all",
      "player:self",
      "filter:type",
      "filter:cost",
      "filter:nameNot",
      "protectionProcess:ko",
      "protectionSource:effects",
      "duration:whileConditionTrue",
    ]),
  );
});
