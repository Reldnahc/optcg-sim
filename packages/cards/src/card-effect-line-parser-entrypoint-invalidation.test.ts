import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses permanent player-scoped entry-point effect invalidation", () => {
  const result = parseCardEffectLine("Your [On Play] effects are negated.");

  expect(result).toMatchObject({
    block: {
      category: "permanent",
      trigger: { type: "permanent" },
      effect: {
        type: "invalidateEffectEntryPoint",
        player: "self",
        effectEntryPoint: { type: "onPlay" },
        duration: { type: "whileSourceOnField" },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:implicitPermanent",
      "instruction:invalidateEffects",
      "entry:onPlay",
      "player:self",
      "duration:whileSourceOnField",
    ]),
  );
});

it("parses costed temporary player-scoped entry-point effect invalidation", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] You may trash 1 card from your hand: Your opponent's [On Play] effects are negated until the end of your opponent's next turn.",
  );

  expect(result).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "payCost",
              cost: { type: "trashFromHand", count: 1 },
            },
          },
          {
            effect: {
              type: "invalidateEffectEntryPoint",
              player: "opponent",
              effectEntryPoint: { type: "onPlay" },
              duration: { type: "untilEndOfNextTurn", player: "opponent" },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:activateMain",
      "cost:trashFromHand",
      "instruction:invalidateEffects",
      "entry:onPlay",
      "player:opponent",
      "duration:opponentNextEndPhase",
    ]),
  );
});
