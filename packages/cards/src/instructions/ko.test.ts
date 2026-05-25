import { describe, expect, it } from "vitest";

import { parseKoInstruction } from "./ko.js";

describe("K.O. instruction parser", () => {
  it("parses K.O. as an action consuming a reusable selected field target request", () => {
    expect(
      parseKoInstruction({
        text: "K.O. up to 1 of your opponent's Characters with a base cost of 5 or less.",
      }),
    ).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "selected:ko-target",
            effect: {
              type: "selectTargets",
              request: {
                timing: "onResolution",
                chooser: "self",
                player: "opponent",
                zone: "characterArea",
                min: 0,
                max: 1,
                allowFewerIfUnavailable: true,
                visibility: "public",
                filter: {
                  categories: ["character"],
                  cost: { max: 5 },
                },
              },
            },
          },
          {
            connector: "then",
            effect: {
              type: "ko",
              target: {
                type: "savedFieldObject",
                binding: {
                  family: "selectedTargets",
                  saveResultAs: "selected:ko-target",
                },
                zone: "characterArea",
                player: "opponent",
                visibility: "publicOnly",
                onFailure: "failClosed",
              },
            },
          },
        ],
      },
      evidence: [
        "instruction:ko",
        "cardinality:upTo",
        "count:positiveInteger",
        "chooser:self:upTo",
        "player:opponent",
        "target:opponentCharacters",
        "filter:category:character",
        "filter:cost",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
        "composition:selectThenApply",
      ],
      rest: "",
    });
  });
});
