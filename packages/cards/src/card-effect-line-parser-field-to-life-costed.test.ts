import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses costed conditional field-to-owner-Life placement as reusable primitives", () => {
  const result = parseCardEffectLine(
    "[Main] You may rest 5 of your DON!! cards: If your Leader has the {Supernovas} type, add up to 1 Character with a cost of 9 or less to the top or bottom of the owner's Life cards face-down.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "main" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "payCost",
              cost: {
                type: "restDon",
                count: 5,
                chooser: "self",
                optional: true,
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "conditional",
              if: {
                player: "self",
              },
              then: {
                type: "sequence",
                effects: [
                  {
                    saveResultAs: "selected:field-to-life",
                    effect: {
                      type: "selectTargets",
                      request: {
                        player: "anyPlayer",
                        zone: "characterArea",
                        min: 0,
                        max: 1,
                        filter: {
                          categories: ["character"],
                          cost: { max: 9 },
                        },
                      },
                    },
                  },
                  {
                    effect: { type: "choice", chooser: "self" },
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
      "composition:optionalCostedEffect",
      "cost:restDon",
      "condition:leaderIdentity",
      "instruction:moveSelected",
      "destination:life",
      "destination:faceDown",
      "composition:chooseOne",
    ]),
  );
});
