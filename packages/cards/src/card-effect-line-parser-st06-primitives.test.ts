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
