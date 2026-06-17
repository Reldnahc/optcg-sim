import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses leader-typed conditional field-removal replacement separately from the target", () => {
  const result = parseCardEffectLine(
    `[Once Per Turn] If your Leader's type includes "Navy" and this Character would be removed from the field, you may trash 1 card from your hand instead.`,
  );

  expect(result).toMatchObject({
    block: {
      category: "replacement",
      oncePerTurn: true,
      optional: true,
      condition: {
        type: "hasCardInZone",
        player: "self",
        zone: "leaderArea",
        filter: { categories: ["leader"], typesIncludeAny: ["Navy"] },
      },
      trigger: {
        type: "replacement",
        replacement: {
          type: "wouldMoveZone",
          from: "characterArea",
          sourceControllerRelation: "any",
          target: { type: "self" },
        },
      },
      effect: {
        type: "replacement",
        when: {
          type: "wouldMoveZone",
          from: "characterArea",
          sourceControllerRelation: "any",
          target: { type: "self" },
        },
        instead: {
          type: "trashFromHand",
          count: 1,
          player: "self",
          chooser: "self",
        },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:replacement",
      "marker:oncePerTurn",
      "expression:replacement",
      "expression:conditional",
      "condition:leaderIdentity",
      "replacement:wouldMoveZone",
      "replacement:fieldRemoval",
      "replacementSource:any",
      "target:thisCharacter",
      "instruction:trashFromHand",
      "composition:entryExpression",
    ]),
  );
});
