import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses played-rested continuous effects as reusable play entry-state primitives", () => {
  const result = parseCardEffectLine("Your Character cards are played rested.");

  expect(result).toMatchObject({
    block: {
      category: "permanent",
      trigger: { type: "permanent" },
      effect: {
        type: "enterRested",
        player: "self",
        filter: { categories: ["character"] },
        duration: { type: "whileSourceOnField" },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:implicitPermanent",
      "instruction:enterRested",
      "player:self",
      "filter:category:character",
      "duration:whileSourceOnField",
    ]),
  );
});
