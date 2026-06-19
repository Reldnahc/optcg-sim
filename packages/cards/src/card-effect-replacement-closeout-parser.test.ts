import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("closeout replacement effect parser", () => {
  it("parses once-per-turn field-removal replacement into reusable typed target and rest-DON instead primitives", () => {
    const result = parseCardEffectLine(
      "[Once Per Turn] If your {Straw Hat Crew} type Character would be removed from the field by your opponent's effect, you may rest 1 of your DON!! cards instead.",
    );
    if (result === undefined || !("block" in result)) {
      assert.fail("expected parsed replacement effect block");
    }

    const when = {
      type: "wouldMoveZone",
      from: "characterArea",
      sourceKind: "cardEffect",
      sourceControllerRelation: "opponentControlled",
      target: {
        type: "all",
        zone: "characterArea",
        player: "self",
        filter: {
          categories: ["character"],
          typesAny: ["Straw Hat Crew"],
        },
      },
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
          type: "rest",
          target: {
            type: "chooseFromZones",
            request: {
              timing: "onResolution",
              chooser: "self",
              player: "self",
              zones: ["costArea"],
              min: 1,
              max: 1,
              allowFewerIfUnavailable: false,
              visibility: "public",
              filter: { categories: ["don"] },
            },
          },
        },
      },
    });
    for (const evidence of [
      "marker:oncePerTurn",
      "entry:replacement",
      "replacement:wouldMoveZone",
      "replacement:fieldRemoval",
      "replacementSource:opponent",
      "replacementSource:cardEffect",
      "target:yourCharacters",
      "filter:type",
      "instruction:rest",
      "target:yourDonCards",
      "zone:costArea",
    ] as const) {
      assert.equal(result.evidence.includes(evidence), true, evidence);
    }
  });

  it("parses typed base-power K.O. replacement into reusable trash-this-Stage instead primitives", () => {
    const result = parseCardEffectLine(
      "If your {Straw Hat Crew} type Characters with a base power of 8000 or less would be K.O.'d, you may trash this Stage instead.",
    );
    if (result === undefined || !("block" in result)) {
      assert.fail("expected parsed replacement effect block");
    }

    const when = {
      type: "wouldBeKOd",
      sourceControllerRelation: "any",
      target: {
        type: "all",
        zone: "characterArea",
        player: "self",
        filter: {
          categories: ["character"],
          typesAny: ["Straw Hat Crew"],
          power: { max: 8000 },
        },
      },
    } as const;

    assert.deepEqual(result.block, {
      category: "replacement",
      trigger: { type: "replacement", replacement: when },
      optional: true,
      sourcePresencePolicy: "resolveFromLastKnownInformation",
      effect: {
        type: "replacement",
        when,
        instead: {
          type: "trash",
          target: { type: "self" },
        },
      },
    });
    for (const evidence of [
      "entry:replacement",
      "replacement:wouldBeKOd",
      "target:yourCharacters",
      "filter:type",
      "filter:power",
      "instruction:trash",
      "target:thisStage",
    ] as const) {
      assert.equal(result.evidence.includes(evidence), true, evidence);
    }
  });
});
