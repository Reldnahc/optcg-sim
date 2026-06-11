import { describe, expect, it } from "vitest";

import { parsePlaceAtOwnerLifeInstruction } from "./field-to-life.js";

describe("field-to-Life instruction parser", () => {
  it("parses opponent Character placement to top-or-bottom Life as saved field movement choices", () => {
    const result = parsePlaceAtOwnerLifeInstruction({
      text: "Place up to 1 of your opponent's Characters with a cost of 1 or less at the top or bottom of their Life cards face-up.",
    });

    expect(result).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            saveResultAs: "selected:field-to-life",
            effect: {
              type: "selectTargets",
              request: {
                player: "opponent",
                zone: "characterArea",
                min: 0,
                max: 1,
                filter: { categories: ["character"], cost: { max: 1 } },
              },
            },
          },
          {
            effect: {
              type: "choice",
              chooser: "self",
              options: [
                {
                  effect: {
                    type: "bounce",
                    destination: "lifeTop",
                    destinationFaceUp: true,
                  },
                },
                {
                  effect: {
                    type: "bounce",
                    destination: "lifeBottom",
                    destinationFaceUp: true,
                  },
                },
              ],
            },
          },
        ],
      },
      evidence: [
        "instruction:moveSelected",
        "cardinality:upTo",
        "count:positiveInteger",
        "chooser:self:upTo",
        "player:opponent",
        "target:opponentCharacters",
        "filter:category:character",
        "filter:cost",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
        "destination:life",
        "position:top",
        "position:bottom",
        "composition:chooseOne",
        "destination:faceUp",
        "composition:selectThenApply",
      ],
      rest: "",
    });
  });
});
