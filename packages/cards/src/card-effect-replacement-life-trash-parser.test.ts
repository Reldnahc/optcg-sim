import assert from "node:assert/strict";
import { it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses top-or-bottom Life trash replacement into reusable move-card payment primitives", () => {
  const result = parseCardEffectLine(
    "[Once Per Turn] If this Character would be K.O.'d, you may trash 1 card from the top or bottom of your Life cards instead.",
  );
  if (result === undefined || !("block" in result)) {
    assert.fail("expected parsed replacement effect block");
  }

  const effect = result.block.effect;
  if (effect.type !== "replacement") {
    assert.fail("expected replacement effect");
  }

  assert.deepEqual(effect.instead, {
    type: "sequence",
    effects: [
      {
        connector: "always",
        effect: {
          type: "payCost",
          cost: {
            type: "moveCards",
            count: 1,
            chooser: "self",
            from: { player: "self", zone: "life", position: "topOrBottom" },
            to: { player: "self", zone: "trash" },
            order: "chooserChoice",
            optional: true,
          },
        },
      },
    ],
  });
  for (const evidence of [
    "entry:replacement",
    "marker:oncePerTurn",
    "replacement:wouldBeKOd",
    "instruction:moveCards",
    "cost:moveCards",
    "zone:life",
    "destination:trash",
    "position:top",
    "position:bottom",
  ] as const) {
    assert.equal(result.evidence.includes(evidence), true, evidence);
  }
});
