import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("OP06 primitive parser support", () => {
  it("parses power gain followed by delayed selected self-field trash", () => {
    const result = parseCardEffectLine(
      "[DON!! x1] [When Attacking] This Character gains +1000 power until the start of your next turn. Then, trash 1 of your {FILM} type Characters at the end of this turn.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "whenAttacking" },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "modifyPower",
                value: 1000,
                duration: { type: "untilStartOfNextTurn" },
                target: { type: "self" },
              },
            },
            {
              connector: "then",
              effect: {
                type: "delayed",
                timing: { type: "endOfTurn", turn: "current" },
                effect: {
                  type: "sequence",
                  effects: [
                    {
                      connector: "always",
                      effect: {
                        type: "selectTargets",
                        request: {
                          player: "self",
                          zone: "characterArea",
                          min: 1,
                          max: 1,
                          filter: {
                            categories: ["character"],
                            typesAny: ["FILM"],
                          },
                        },
                      },
                    },
                    {
                      connector: "then",
                      effect: { type: "trash" },
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "marker:attachedDon",
        "condition:attachedDonCount",
        "instruction:modifyPower",
        "composition:delayed",
        "instruction:trash",
        "target:yourCharacters",
        "filter:type",
      ]),
    );
  });

  it("parses conditional battle protection and power gain followed by Life movement", () => {
    const result = parseCardEffectLine(
      "[When Attacking] If your Leader has the {New Fish-Man Pirates} type, this Character cannot be K.O.'d in battle and gains +2000 power until the start of your next turn. Then, add 1 card from the top of your Life cards to your hand.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "whenAttacking" },
        condition: {
          type: "hasCardInZone",
          player: "self",
          zone: "leaderArea",
          filter: {
            categories: ["leader"],
            typesAny: ["New Fish-Man Pirates"],
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
                    connector: "always",
                    effect: {
                      type: "protectFromKO",
                      target: { type: "self" },
                      sourceKind: "battle",
                      duration: { type: "untilStartOfNextTurn" },
                    },
                  },
                  {
                    connector: "then",
                    effect: {
                      type: "modifyPower",
                      target: { type: "self" },
                      value: 2000,
                      duration: { type: "untilStartOfNextTurn" },
                    },
                  },
                ],
              },
            },
            {
              connector: "then",
              effect: {
                type: "moveCards",
                count: 1,
                from: { player: "self", zone: "life", position: "top" },
                to: { player: "self", zone: "hand" },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "expression:conditional",
        "instruction:giveProtection",
        "protectionSource:battle",
        "instruction:modifyPower",
        "instruction:moveCards",
      ]),
    );
  });
});
