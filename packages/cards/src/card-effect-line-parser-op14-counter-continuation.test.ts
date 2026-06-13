import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("OP14 counter selected-target continuations", () => {
  it("parses return-DON conditional counter power with additional saved-target power", () => {
    const result = parseCardEffectLine(
      "[Counter] DON!! −1: If your Leader has the {Donquixote Pirates} type, up to 1 of your Leader or Character cards gains +2000 power during this battle. Then, that card gains an additional +2000 power during this turn.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "counter" },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "payCost",
                cost: { type: "returnDon", count: 1, optional: true },
              },
            },
            {
              connector: "ifYouDo",
              effect: {
                type: "conditional",
                if: {
                  type: "hasCardInZone",
                  player: "self",
                  zone: "leaderArea",
                  filter: {
                    categories: ["leader"],
                    typesAny: ["Donquixote Pirates"],
                  },
                },
                then: {
                  type: "sequence",
                  effects: [
                    {
                      saveResultAs: "selected:power-continuation-target",
                      effect: { type: "selectTargets" },
                    },
                    {
                      effect: {
                        type: "modifyPower",
                        value: 2000,
                        duration: { type: "thisBattle" },
                      },
                    },
                    {
                      effect: {
                        type: "modifyPower",
                        value: 2000,
                        duration: { type: "thisTurn" },
                      },
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
        "entry:eventCounter",
        "cost:returnDon",
        "condition:leaderIdentity",
        "composition:selectThenApply",
        "duration:thisBattle",
        "duration:thisTurn",
      ]),
    );
  });
});
