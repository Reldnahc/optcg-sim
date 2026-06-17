import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses turn-windowed reactions to opponent Characters being K.O.'d", () => {
  const result = parseCardEffectLine(
    "[Your Turn] [Once Per Turn] When your opponent's Character is K.O.'d, draw 1 card.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: {
        type: "fieldRemoved",
        player: "opponent",
        filter: { categories: ["character"] },
        sourceKind: "ko",
      },
      condition: { type: "yourTurn" },
      oncePerTurn: true,
      effect: { type: "draw", player: "self", count: 1 },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:yourTurn",
      "condition:yourTurn",
      "marker:oncePerTurn",
      "trigger:fieldRemoved",
      "player:opponent",
      "filter:category:character",
      "instruction:draw",
      "composition:entryExpression",
    ]),
  );
});
