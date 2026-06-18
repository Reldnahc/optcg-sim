import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses Trigger opponent hand choice trash as reusable hand-trash primitive", () => {
  const result = parseCardEffectLine(
    "[Trigger] Your opponent chooses 1 card from their hand and trashes it.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "trigger" },
      sourcePresencePolicy: "noSourceRequired",
      effect: {
        type: "trashFromHand",
        count: 1,
        player: "opponent",
        chooser: "opponent",
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:lifeTrigger",
      "instruction:trashFromHand",
      "count:positiveInteger",
      "player:opponent",
      "chooser:opponent",
    ]),
  );
});

it("parses Trigger draw plus source-less all-character K.O. protection", () => {
  const result = parseCardEffectLine(
    "[Trigger] Draw 1 card and none of your Characters can be K.O.'d during this turn.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "trigger" },
      sourcePresencePolicy: "noSourceRequired",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: { type: "draw", count: 1, player: "self" },
          },
          {
            connector: "then",
            effect: {
              type: "protectFromKO",
              target: {
                type: "all",
                player: "self",
                zone: "characterArea",
                filter: { categories: ["character"] },
              },
              duration: { type: "thisTurn" },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:lifeTrigger",
      "instruction:draw",
      "instruction:giveProtection",
      "protectionProcess:ko",
      "duration:thisTurn",
      "connector:andOrdered",
    ]),
  );
});
