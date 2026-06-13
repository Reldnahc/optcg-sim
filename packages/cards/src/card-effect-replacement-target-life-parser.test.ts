import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("replacement target Life parser", () => {
  it("parses field-removal replacement that moves the replaced Character to Life face-down", () => {
    const target = {
      type: "all",
      zone: "characterArea",
      player: "self",
      filter: {
        categories: ["character"],
        typesAny: ["Supernovas"],
        nameNot: ['Capone"Gang"Bege'],
      },
    } as const;
    const when = {
      type: "wouldMoveZone",
      from: "characterArea",
      sourceKind: "cardEffect",
      sourceControllerRelation: "opponentControlled",
      target,
    } as const;

    const result = parseCardEffectLine(
      '[Once Per Turn] If your {Supernovas} type Character other than [Capone"Gang"Bege] would be removed from the field by your opponent\'s effect, you may add it to the top of your Life cards face-down instead.',
    );
    if (result === undefined || !("block" in result)) {
      assert.fail("expected parsed replacement effect block");
    }

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
          type: "bounce",
          target: { type: "replacementTarget" },
          destination: "lifeTop",
          destinationFaceUp: false,
        },
      },
    });
    for (const evidence of [
      "entry:replacement",
      "replacement:wouldMoveZone",
      "replacement:fieldRemoval",
      "replacementSource:opponent",
      "replacementSource:cardEffect",
      "sourcePresence:resolveFromLastKnownInformation",
      "target:yourCharacters",
      "filter:type",
      "filter:category:character",
      "filter:nameNot",
      "instruction:bounce",
      "target:replacementTarget",
      "destination:life",
      "position:top",
      "visibility:faceDown",
      "composition:replacementInstead",
      "composition:entryExpression",
    ] as const) {
      assert.equal(result.evidence.includes(evidence), true, evidence);
    }
  });
});
