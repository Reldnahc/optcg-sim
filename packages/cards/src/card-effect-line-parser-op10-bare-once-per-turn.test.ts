import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses bare once-per-turn prose before implicit permanent protection", () => {
  const result = parseCardEffectLine(
    "Once per turn, this Character cannot be K.O.'d by your opponent's effects.",
  );

  expect(result).toMatchObject({
    block: {
      category: "permanent",
      trigger: { type: "permanent" },
      oncePerTurn: true,
      effect: {
        type: "protectFromKO",
        target: { type: "self" },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:implicitPermanent",
      "marker:oncePerTurn",
      "instruction:giveProtection",
      "target:thisCharacter",
      "protectionProcess:ko",
      "protectionSource:opponentEffects",
    ]),
  );
});
