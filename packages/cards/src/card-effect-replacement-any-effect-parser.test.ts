import assert from "node:assert/strict";
import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("any-effect K.O. replacement parser", () => {
  it("parses any-effect K.O. replacement source independently from target filters", () => {
    const broad = parseCardEffectLine(
      "If your Character would be K.O.'d by an effect, you may trash this Character instead.",
    );
    const named = parseCardEffectLine(
      "If your Character [Bonk Punch] would be K.O.'d by an effect, you may trash this Character instead.",
    );

    for (const result of [broad, named]) {
      if (result === undefined || !("block" in result)) {
        assert.fail("expected parsed K.O. replacement effect block");
      }
      expect(result.block.effect).toMatchObject({
        type: "replacement",
        when: {
          type: "wouldBeKOd",
          sourceKind: "cardEffect",
          sourceControllerRelation: "any",
        },
        instead: {
          type: "trash",
          target: { type: "self" },
        },
      });
      expect(result.evidence).toEqual(
        expect.arrayContaining([
          "replacement:wouldBeKOd",
          "replacementSource:cardEffect",
          "target:yourCharacters",
          "instruction:trash",
          "target:thisCharacter",
          "composition:replacementInstead",
        ]),
      );
    }
    expect(named).toMatchObject({
      block: {
        effect: {
          when: {
            target: {
              filter: {
                names: ["Bonk Punch"],
              },
            },
          },
        },
      },
    });
    expect(named?.evidence).toContain("filter:name");
  });
});
