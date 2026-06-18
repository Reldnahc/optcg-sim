import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses all Characters owner deck-bottom placement as all-target bounce", () => {
  const mainResult = parseCardEffectLine(
    "[Main] Place all Characters with a cost of 3 or less at the bottom of the owner's deck.",
  );
  const triggerResult = parseCardEffectLine(
    "[Trigger] Place all Characters with a cost of 2 or less at the bottom of the owner's deck.",
  );

  expect(mainResult).toMatchObject({
    block: {
      trigger: { type: "main" },
      effect: {
        type: "bounce",
        destination: "deckBottom",
        target: {
          type: "all",
          player: "anyPlayer",
          zone: "characterArea",
          filter: {
            categories: ["character"],
            cost: { max: 3 },
          },
        },
      },
    },
  });
  expect(triggerResult).toMatchObject({
    block: {
      trigger: { type: "trigger" },
      effect: {
        type: "bounce",
        destination: "deckBottom",
        target: {
          type: "all",
          player: "anyPlayer",
          zone: "characterArea",
          filter: {
            categories: ["character"],
            cost: { max: 2 },
          },
        },
      },
    },
  });
  expect(mainResult?.evidence).toEqual(
    expect.arrayContaining([
      "entry:eventMain",
      "instruction:bounce",
      "cardinality:all",
      "player:any",
      "filter:cost",
      "destination:deck",
      "position:bottom",
    ]),
  );
});
