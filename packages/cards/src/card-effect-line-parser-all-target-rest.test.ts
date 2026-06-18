import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses On Play rest all opponent Characters as a reusable all-target rest primitive", () => {
  const result = parseCardEffectLine(
    "[On Play] Rest all of your opponent's Characters.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "rest",
              target: {
                type: "all",
                zone: "characterArea",
                player: "opponent",
                filter: { categories: ["character"] },
              },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "instruction:rest",
      "cardinality:all",
      "player:opponent",
      "zone:characterArea",
      "filter:category:character",
    ]),
  );
});
