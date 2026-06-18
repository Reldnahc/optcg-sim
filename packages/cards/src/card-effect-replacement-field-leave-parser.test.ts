import { strict as assert } from "node:assert";

import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses field-leave replacement with reusable negated field-presence condition", () => {
  const result = parseCardEffectLine(
    "[Once Per Turn] If this Character would leave the field, you may trash 1 card from the top of your Life cards instead. If there is a [Monkey.D.Luffy] Character, this effect is negated.",
  );
  if (result === undefined || !("block" in result)) {
    assert.fail("expected parsed replacement effect block");
  }

  const when = {
    type: "wouldMoveZone",
    from: "characterArea",
    sourceControllerRelation: "any",
    target: { type: "self" },
  } as const;
  assert.deepEqual(result.block, {
    category: "replacement",
    trigger: { type: "replacement", replacement: when },
    oncePerTurn: true,
    optional: true,
    condition: {
      type: "not",
      condition: {
        type: "or",
        conditions: [
          {
            type: "fieldCount",
            player: "self",
            filter: {
              categories: ["character"],
              names: ["Monkey.D.Luffy"],
            },
            op: "gte",
            value: 1,
          },
          {
            type: "fieldCount",
            player: "opponent",
            filter: {
              categories: ["character"],
              names: ["Monkey.D.Luffy"],
            },
            op: "gte",
            value: 1,
          },
        ],
      },
    },
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
    "replacement:wouldMoveZone",
    "replacement:fieldRemoval",
    "replacementSource:any",
    "target:thisCharacter",
    "instruction:moveCards",
    "zone:life",
    "position:top",
    "destination:trash",
    "composition:conditionNot",
    "condition:fieldCount",
    "condition:opponentFieldCount",
    "filter:name",
  ] as const) {
    assert.equal(result.evidence.includes(evidence), true, evidence);
  }
});

it("parses negated field-presence replacement suffix with another named character", () => {
  const result = parseCardEffectLine(
    "If this Character would leave the field, you may trash 1 card from the top of your Life cards instead. If there is a [Sabo] Character, this effect is negated.",
  );

  expect(result).toMatchObject({
    block: {
      category: "replacement",
      condition: {
        type: "not",
        condition: {
          type: "or",
          conditions: [
            { type: "fieldCount", player: "self" },
            { type: "fieldCount", player: "opponent" },
          ],
        },
      },
      trigger: {
        type: "replacement",
        replacement: {
          type: "wouldMoveZone",
          sourceControllerRelation: "any",
          target: { type: "self" },
        },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "composition:conditionNot",
      "filter:name",
      "replacement:wouldMoveZone",
    ]),
  );
});
