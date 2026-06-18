import { describe, expect, it } from "vitest";

import { parseTrashInstruction } from "./trash-all-characters.js";

describe("trash instruction parser", () => {
  it("parses trash all your Characters as a reusable target/action primitive", () => {
    expect(
      parseTrashInstruction({
        text: "Trash all of your Characters",
      }),
    ).toEqual({
      effect: {
        type: "trash",
        target: {
          type: "all",
          zone: "characterArea",
          player: "self",
          filter: { categories: ["character"] },
        },
      },
      evidence: [
        "instruction:trash",
        "cardinality:all",
        "player:self",
        "zone:characterArea",
        "filter:category:character",
      ],
      rest: "",
    });
  });

  it("parses trash all typed Characters through the same all-field target primitive", () => {
    expect(
      parseTrashInstruction({
        text: "Trash all of your {Sky Island} type Characters.",
      }),
    ).toMatchObject({
      effect: {
        type: "trash",
        target: {
          type: "all",
          zone: "characterArea",
          player: "self",
          filter: {
            categories: ["character"],
            typesAny: ["Sky Island"],
          },
        },
      },
      evidence: [
        "instruction:trash",
        "cardinality:all",
        "player:self",
        "zone:characterArea",
        "filter:type",
        "filter:category:character",
      ],
    });
  });

  it("parses selected opponent Character trash as reusable select-then-trash primitives", () => {
    expect(
      parseTrashInstruction({
        text: "Trash up to 1 of your opponent's Characters with 6000 power or less.",
      }),
    ).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "selected:trash-target",
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
                  currentPower: { max: 6000 },
                },
              },
            },
          },
          {
            connector: "then",
            effect: {
              type: "trash",
              target: {
                type: "savedFieldObject",
                binding: {
                  family: "selectedTargets",
                  saveResultAs: "selected:trash-target",
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
        "instruction:trash",
        "cardinality:upTo",
        "count:positiveInteger",
        "chooser:self:upTo",
        "player:opponent",
        "target:opponentCharacters",
        "filter:category:character",
        "filter:currentPower",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
        "composition:selectThenApply",
      ],
      rest: "",
    });
  });

  it("parses selected self Character trash as reusable select-then-trash primitives", () => {
    const result = parseTrashInstruction({
      text: "Trash 1 of your {FILM} type Characters.",
    });

    expect(result).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "selected:trash-target",
            effect: {
              type: "selectTargets",
              request: {
                timing: "onResolution",
                chooser: "self",
                player: "self",
                zone: "characterArea",
                min: 1,
                max: 1,
                allowFewerIfUnavailable: true,
                visibility: "public",
                filter: {
                  categories: ["character"],
                  typesAny: ["FILM"],
                },
              },
            },
          },
          {
            connector: "then",
            effect: {
              type: "trash",
              target: {
                type: "savedFieldObject",
                binding: {
                  family: "selectedTargets",
                  saveResultAs: "selected:trash-target",
                },
                zone: "characterArea",
                player: "self",
                visibility: "publicOnly",
                onFailure: "failClosed",
              },
            },
          },
        ],
      },
      rest: "",
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:trash",
        "cardinality:exact",
        "count:positiveInteger",
        "chooser:self",
        "target:yourCharacters",
        "player:self",
        "filter:category:character",
        "filter:type",
        "composition:selectThenApply",
      ]),
    );
  });
});
