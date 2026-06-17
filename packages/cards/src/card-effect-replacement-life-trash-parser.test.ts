import assert from "node:assert/strict";
import { test } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

test("parses K.O.-by-effect replacement that trashes top Life as a reusable move primitive", () => {
  const result = parseCardEffectLine(
    "[Once Per Turn] If this Character would be K.O.'d by an effect, you may trash 1 card from the top of your Life cards instead.",
  );
  if (result === undefined || !("block" in result)) {
    assert.fail("expected parsed replacement effect block");
  }

  const when = {
    type: "wouldBeKOd",
    sourceControllerRelation: "any",
    sourceKind: "cardEffect",
    target: { type: "self" },
  } as const;

  assert.deepEqual(result.block, {
    category: "replacement",
    trigger: { type: "replacement", replacement: when },
    oncePerTurn: true,
    optional: true,
    sourcePresencePolicy: "resolveFromLastKnownInformation",
    effect: {
      type: "replacement",
      when,
      instead: {
        type: "moveCards",
        count: 1,
        from: { player: "self", zone: "life", position: "top" },
        to: { player: "self", zone: "trash" },
        order: "original",
      },
    },
  });
  for (const evidence of [
    "marker:oncePerTurn",
    "entry:replacement",
    "replacement:wouldBeKOd",
    "replacementSource:cardEffect",
    "target:thisCharacter",
    "instruction:moveCards",
    "zone:life",
    "position:top",
    "destination:trash",
    "composition:replacementInstead",
  ] as const) {
    assert.equal(result.evidence.includes(evidence), true, evidence);
  }
});
