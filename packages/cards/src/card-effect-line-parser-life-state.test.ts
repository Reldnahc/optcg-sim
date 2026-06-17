import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses face-up Life condition before K.O. and Life face-down state change", () => {
  const result = parseCardEffectLine(
    "[On Play] If you have a face-up Life card, K.O. up to 1 of your opponent's Characters with a cost of 2 or less. Then, turn all of your Life cards face-down.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      condition: {
        type: "lifeVisibilityCount",
        player: "self",
        faceUp: true,
        op: "gte",
        value: 1,
      },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "sequence",
              effects: [
                {
                  effect: {
                    type: "selectTargets",
                    request: {
                      player: "opponent",
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
                  effect: { type: "ko" },
                },
              ],
            },
          },
          {
            effect: { type: "setLifeFaceUp", player: "self", faceUp: false },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "condition:lifeVisibilityCount",
      "visibility:faceUp",
      "instruction:ko",
      "instruction:setState",
      "destination:faceDown",
    ]),
  );
});
