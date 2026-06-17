import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses Counter return-DON reminder cost into conditional selected attack retargeting", () => {
  const result = parseCardEffectLine(
    '[Counter] DON!! -1 (You may return the specified number of DON!! cards from your field to your DON!! deck.): If your Leader\'s type includes "Baroque Works", select 1 of your Characters. Change the attack target to the selected Character.',
  );

  expect(result).toMatchObject({
    block: {
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
                zone: "leaderArea",
                player: "self",
                filter: {
                  categories: ["leader"],
                  typesIncludeAny: ["Baroque Works"],
                },
              },
              then: {
                type: "sequence",
                effects: [
                  {
                    connector: "always",
                    saveResultAs: "targetSelection:change-attack-target",
                    effect: {
                      type: "selectTargets",
                      request: {
                        player: "self",
                        zones: ["characterArea"],
                        min: 1,
                        max: 1,
                        filter: { categories: ["character"] },
                      },
                    },
                  },
                  {
                    connector: "then",
                    effect: {
                      type: "changeAttackTarget",
                      target: { type: "savedFieldObject" },
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
      "composition:costedEffect",
      "composition:selectThenApply",
      "instruction:changeAttackTarget",
      "target:yourCharacters",
    ]),
  );
});
