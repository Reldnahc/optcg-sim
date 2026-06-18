import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("combined replacement trigger parser", () => {
  it("parses combined K.O. or opponent-effect removal replacement as composed trigger primitives", () => {
    const koWhen = {
      type: "wouldBeKOd",
      sourceControllerRelation: "any",
      target: { type: "self" },
    } as const;
    const fieldRemovalWhen = {
      type: "wouldMoveZone",
      from: "characterArea",
      sourceKind: "cardEffect",
      sourceControllerRelation: "opponentControlled",
      target: { type: "self" },
    } as const;
    const when = {
      type: "anyOf",
      replacements: [koWhen, fieldRemovalWhen],
    } as const;

    const result = parseCardEffectLine(
      "[Once Per Turn] If this Character would be K.O.'d or would be removed from the field by your opponent's effect, you may trash 1 card with a type including \"Whitebeard Pirates\" from your hand instead.",
    );
    if (result === undefined || !("block" in result)) {
      assert.fail("expected parsed composed replacement effect block");
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
          type: "trashFromHand",
          player: "self",
          chooser: "self",
          count: 1,
          filter: { typesIncludeAny: ["Whitebeard Pirates"] },
        },
      },
    });
    for (const evidence of [
      "marker:oncePerTurn",
      "entry:replacement",
      "replacement:wouldBeKOd",
      "replacement:wouldMoveZone",
      "replacement:fieldRemoval",
      "replacementSource:opponent",
      "replacementSource:cardEffect",
      "composition:triggerAnyOf",
      "target:thisCharacter",
      "instruction:trashFromHand",
      "filter:type",
      "composition:replacementInstead",
    ] as const) {
      assert.equal(result.evidence.includes(evidence), true, evidence);
    }
  });

  it("parses combined opponent-effect removal or K.O. replacement regardless of printed trigger order", () => {
    const koWhen = {
      type: "wouldBeKOd",
      sourceControllerRelation: "any",
      target: { type: "self" },
    } as const;
    const fieldRemovalWhen = {
      type: "wouldMoveZone",
      from: "characterArea",
      sourceKind: "cardEffect",
      sourceControllerRelation: "opponentControlled",
      target: { type: "self" },
    } as const;
    const when = {
      type: "anyOf",
      replacements: [koWhen, fieldRemovalWhen],
    } as const;

    const result = parseCardEffectLine(
      "If this Character would be removed from the field by your opponent's effect or K.O.'d, trash this Character and draw 1 card instead.",
    );
    if (result === undefined || !("block" in result)) {
      assert.fail("expected parsed composed replacement effect block");
    }

    assert.deepEqual(result.block, {
      category: "replacement",
      trigger: { type: "replacement", replacement: when },
      optional: false,
      sourcePresencePolicy: "resolveFromLastKnownInformation",
      effect: {
        type: "replacement",
        when,
        instead: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: { type: "trash", target: { type: "self" } },
            },
            {
              connector: "then",
              effect: { type: "draw", count: 1, player: "self" },
            },
          ],
        },
      },
    });
    for (const evidence of [
      "entry:replacement",
      "replacement:wouldBeKOd",
      "replacement:wouldMoveZone",
      "replacement:fieldRemoval",
      "replacementSource:opponent",
      "replacementSource:cardEffect",
      "composition:triggerAnyOf",
      "target:thisCharacter",
      "instruction:trash",
      "instruction:draw",
      "composition:sequence",
      "composition:replacementInstead",
    ] as const) {
      assert.equal(result.evidence.includes(evidence), true, evidence);
    }
  });
});
