import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("replacement effect parser", () => {
  it("parses opponent field-removal replacement into reusable trigger, target, filter, and instead primitives", () => {
    const target = {
      type: "all",
      zone: "characterArea",
      player: "self",
      filter: {
        categories: ["character"],
        typesAny: ["Sky Island"],
        power: { min: 6000 },
      },
    } as const;
    const when = {
      type: "wouldMoveZone",
      from: "characterArea",
      target,
    } as const;

    const result = parseCardEffectLine(
      "If your {Sky Island} type Character with 6000 base power or more would be removed from the field by your opponent, you may add 1 card from the top of your Life cards to your hand instead.",
    );
    if (result === undefined || !("block" in result)) {
      assert.fail("expected parsed replacement effect block");
    }

    assert.deepEqual(result.block, {
      category: "replacement",
      trigger: { type: "replacement", replacement: when },
      optional: true,
      sourcePresencePolicy: "resolveFromLastKnownInformation",
      effect: {
        type: "replacement",
        when,
        instead: {
          type: "moveCards",
          count: 1,
          from: { player: "self", zone: "life", position: "top" },
          to: { player: "self", zone: "hand" },
          order: "original",
        },
      },
    });
    for (const evidence of [
      "entry:replacement",
      "replacement:wouldMoveZone",
      "replacement:fieldRemoval",
      "replacementSource:opponent",
      "sourcePresence:resolveFromLastKnownInformation",
      "target:yourCharacters",
      "filter:type",
      "filter:category:character",
      "filter:power",
      "condition:comparator:gte",
      "instruction:moveCards",
      "zone:life",
      "position:top",
      "destination:hand",
      "composition:replacementInstead",
      "composition:entryExpression",
    ] as const) {
      assert.equal(result.evidence.includes(evidence), true, evidence);
    }
  });
});
