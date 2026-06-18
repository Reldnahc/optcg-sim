import { describe, expect, it } from "vitest";

import { parseKoInstruction } from "./ko.js";

describe("K.O. instruction parser", () => {
  it("parses all opponent Character K.O. as all target plus filter primitives", () => {
    expect(
      parseKoInstruction({
        text: "K.O. all of your opponent's Characters with 0 power or less.",
      }),
    ).toMatchObject({
      effect: {
        type: "ko",
        target: {
          type: "all",
          zone: "characterArea",
          player: "opponent",
          filter: {
            categories: ["character"],
            currentPower: { max: 0 },
          },
        },
      },
      evidence: [
        "instruction:ko",
        "cardinality:all",
        "player:opponent",
        "zone:characterArea",
        "filter:category:character",
        "filter:currentPower",
        "condition:comparator:lte",
        "condition:threshold:nonNegativeInteger",
      ],
      rest: "",
    });
  });

  it("parses ownerless all Character K.O. as an any-player all target", () => {
    expect(
      parseKoInstruction({
        text: "K.O. all Characters with a cost of 1 or less.",
      }),
    ).toMatchObject({
      effect: {
        type: "ko",
        target: {
          type: "all",
          zone: "characterArea",
          player: "anyPlayer",
          filter: {
            categories: ["character"],
            cost: { max: 1 },
          },
        },
      },
      evidence: [
        "instruction:ko",
        "cardinality:all",
        "player:any",
        "zone:characterArea",
        "filter:category:character",
        "filter:cost",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
      ],
      rest: "",
    });
  });

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
                  baseCost: { max: 5 },
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

  it("parses K.O. target selections with a total current-power limit", () => {
    expect(
      parseKoInstruction({
        text: "K.O. up to 2 of your opponent's Characters with a total power of 4000 or less.",
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
                player: "opponent",
                zone: "characterArea",
                min: 0,
                max: 2,
                filter: { categories: ["character"] },
                selectionConstraints: [
                  {
                    type: "totalStat",
                    stat: "currentPower",
                    op: "lte",
                    value: 4000,
                  },
                ],
              },
            },
          },
          { connector: "then", effect: { type: "ko" } },
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
        "targetConstraint:totalStat",
        "condition:stat:currentPower",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
        "composition:selectThenApply",
      ],
      rest: "",
    });
  });

  it("parses K.O.-or-return as one selected target followed by reusable action choice", () => {
    expect(
      parseKoInstruction({
        text: "K.O. up to 1 of your opponent's Characters with a cost of 6 or less, or return it to the owner's hand.",
      }),
    ).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "selected:ko-or-return-target",
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
                  cost: { max: 6 },
                },
              },
            },
          },
          {
            connector: "then",
            effect: {
              type: "choice",
              chooser: "self",
              min: 1,
              max: 1,
              options: [
                {
                  effect: {
                    type: "ko",
                    target: {
                      type: "savedFieldObject",
                      binding: {
                        family: "selectedTargets",
                        saveResultAs: "selected:ko-or-return-target",
                      },
                    },
                  },
                },
                {
                  effect: {
                    type: "bounce",
                    destination: "hand",
                    target: {
                      type: "savedFieldObject",
                      binding: {
                        family: "selectedTargets",
                        saveResultAs: "selected:ko-or-return-target",
                      },
                    },
                  },
                },
              ],
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
        "instruction:returnToOwnerHand",
        "destination:ownerHand",
        "composition:chooseOne",
        "composition:selectThenApply",
      ],
      rest: "",
    });
  });

  it("parses K.O.-or-rest as one selected target followed by reusable action choice", () => {
    const result = parseKoInstruction({
      text: "K.O. or rest up to 1 of your opponent's Characters with a base power of 6000 or less.",
    });

    expect(result).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "selected:ko-or-rest-target",
            effect: {
              type: "selectTargets",
              request: {
                player: "opponent",
                zone: "characterArea",
                min: 0,
                max: 1,
                filter: {
                  categories: ["character"],
                  power: { max: 6000 },
                },
              },
            },
          },
          {
            connector: "then",
            effect: {
              type: "choice",
              options: [
                { effect: { type: "ko" } },
                { effect: { type: "rest" } },
              ],
            },
          },
        ],
      },
      rest: "",
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:ko",
        "instruction:rest",
        "composition:chooseOne",
        "composition:selectThenApply",
      ]),
    );
  });
});
