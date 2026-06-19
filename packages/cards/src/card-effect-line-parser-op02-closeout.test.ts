import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("OP02 closeout parser support", () => {
  it("parses optional attack cost followed by immediate and end-of-battle owner deck-bottom movement", () => {
    const result = parseCardEffectLine(
      "[DON!! x1] [When Attacking] You may trash 1 card from your hand: Place up to 1 Character with a cost of 2 or less at the bottom of the owner's deck. Then, at the end of this battle, place this Character at the bottom of the owner's deck.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "whenAttacking" },
        condition: {
          type: "attachedDonCount",
          op: "gte",
          value: 1,
        },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "payCost",
                cost: {
                  type: "trashFromHand",
                  count: 1,
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
                    effect: {
                      type: "sequence",
                      effects: [
                        {
                          connector: "always",
                          effect: {
                            type: "selectTargets",
                            request: {
                              chooser: "self",
                              player: "anyPlayer",
                              zone: "characterArea",
                              min: 0,
                              max: 1,
                              filter: {
                                categories: ["character"],
                                cost: { max: 2 },
                              },
                            },
                          },
                        },
                        {
                          connector: "then",
                          effect: {
                            type: "bounce",
                            destination: "deckBottom",
                          },
                        },
                      ],
                    },
                  },
                  {
                    connector: "then",
                    effect: {
                      type: "delayed",
                      timing: {
                        type: "event",
                        trigger: {
                          type: "endOfBattle",
                          role: "attacker",
                          player: "self",
                        },
                        expires: { type: "endOfTurn", turn: "current" },
                      },
                      effect: {
                        type: "bounce",
                        destination: "deckBottom",
                        target: { type: "self" },
                      },
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
        "marker:attachedDon",
        "entry:whenAttacking",
        "composition:optionalCostedEffect",
        "cost:trashFromHand",
        "instruction:moveSelected",
        "filter:cost",
        "composition:delayed",
        "trigger:endOfBattle",
        "target:thisCharacter",
        "destination:deck",
        "position:bottom",
      ]),
    );
  });
});
