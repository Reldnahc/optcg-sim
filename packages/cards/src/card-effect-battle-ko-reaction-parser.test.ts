import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("battle K.O. reaction parser", () => {
  it("parses battle K.O. reactions as source-card field-removal hooks", () => {
    const drawTrash = parseCardEffectLine(
      "[DON!! x1] When this Character battles and K.O.'s your opponent's Character, draw 2 cards and trash 2 cards from your hand.",
    );

    expect(drawTrash).toMatchObject({
      block: {
        category: "auto",
        condition: { type: "attachedDonCount" },
        trigger: {
          type: "fieldRemoved",
          player: "opponent",
          filter: { categories: ["character"] },
          sourceController: "self",
          sourceKind: "battle",
          sourceTarget: "self",
        },
        effect: { type: "sequence" },
      },
    });
    expect(drawTrash?.evidence).toEqual(
      expect.arrayContaining([
        "marker:attachedDon",
        "trigger:fieldRemoved",
        "player:opponent",
        "filter:category:character",
        "instruction:draw",
        "instruction:trashFromHand",
      ]),
    );

    const setActive = parseCardEffectLine(
      "[DON!! x1] [Once Per Turn] When this Character battles and K.O.'s your opponent's Character, set this Character as active.",
    );

    expect(setActive).toMatchObject({
      block: {
        category: "auto",
        oncePerTurn: true,
        trigger: {
          type: "fieldRemoved",
          player: "opponent",
          sourceKind: "battle",
          sourceTarget: "self",
        },
        effect: { type: "activate", target: { type: "self" } },
      },
    });
    expect(setActive?.evidence).toEqual(
      expect.arrayContaining([
        "marker:oncePerTurn",
        "trigger:fieldRemoved",
        "instruction:activate",
        "target:thisCharacter",
      ]),
    );
  });
});
