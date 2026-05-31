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

  it("parses opponent effect field-removal replacement into reusable rest-card instead primitives", () => {
    const target = {
      type: "all",
      zone: "characterArea",
      player: "self",
      filter: {
        categories: ["character"],
        power: { max: 7000 },
      },
    } as const;
    const when = {
      type: "wouldMoveZone",
      from: "characterArea",
      sourceKind: "cardEffect",
      target,
    } as const;

    const result = parseCardEffectLine(
      "If your Character with 7000 base power or less would be removed from the field by your opponent's effect, you may rest 2 of your cards instead.",
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
          type: "rest",
          target: {
            type: "chooseFromZones",
            request: {
              timing: "onResolution",
              chooser: "self",
              player: "self",
              zones: ["leaderArea", "characterArea", "stageArea", "costArea"],
              min: 2,
              max: 2,
              allowFewerIfUnavailable: false,
              visibility: "public",
            },
          },
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
      "filter:category:character",
      "filter:power",
      "condition:comparator:lte",
      "instruction:rest",
      "target:yourCards",
      "zone:leaderArea",
      "zone:characterArea",
      "zone:stageArea",
      "zone:costArea",
      "cardinality:exact",
      "count:positiveInteger",
      "composition:replacementInstead",
      "composition:entryExpression",
    ] as const) {
      assert.equal(result.evidence.includes(evidence), true, evidence);
    }
  });
});
