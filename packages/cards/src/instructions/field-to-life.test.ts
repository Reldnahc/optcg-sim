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
      rest: "",
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
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
      ]),
    );
  });

  it("parses exact opponent Character placement to explicit opponent Life wording", () => {
    const result = parsePlaceAtOwnerLifeInstruction({
      text: "Place 1 of your opponent's Characters with a cost of 3 or less at the top or bottom of your opponent's Life cards face-up.",
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
                min: 1,
                max: 1,
                filter: { categories: ["character"], cost: { max: 3 } },
              },
            },
          },
          {
            effect: {
              type: "choice",
              chooser: "self",
            },
          },
        ],
      },
      rest: "",
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "cardinality:exact",
        "chooser:self",
        "target:opponentCharacters",
        "destination:life",
        "destination:faceUp",
      ]),
    );
  });

  it("parses add-to-owner-Life face-down wording through the same field movement primitive", () => {
    const result = parsePlaceAtOwnerLifeInstruction({
      text: "Add up to 1 Character with a cost of 9 or less to the top or bottom of the owner's Life cards face-down.",
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
                player: "anyPlayer",
                zone: "characterArea",
                min: 0,
                max: 1,
                filter: { categories: ["character"], cost: { max: 9 } },
              },
            },
          },
          {
            effect: {
              type: "choice",
              options: [
                { effect: { destination: "lifeTop" } },
                { effect: { destination: "lifeBottom" } },
              ],
            },
          },
        ],
      },
      rest: "",
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:moveSelected",
        "player:any",
        "destination:life",
        "position:top",
        "position:bottom",
        "destination:faceDown",
      ]),
    );
  });
});
