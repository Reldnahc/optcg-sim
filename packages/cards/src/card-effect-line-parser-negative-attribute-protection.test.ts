import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses attached-DON K.O. protection from Characters without a named attribute", () => {
  const result = parseCardEffectLine(
    "[DON!! x1] This Character cannot be K.O.'d by effects of Characters without the \uFF1CSpecial\uFF1E attribute.",
  );

  expect(result).toMatchObject({
    block: {
      category: "permanent",
      condition: {
        type: "attachedDonCount",
        target: { type: "self" },
        op: "gte",
        value: 1,
      },
      effect: {
        type: "protectFromKO",
        target: { type: "self" },
        sourceKind: "cardEffect",
        sourceControllerRelation: "eitherController",
        sourceCardFilter: {
          categories: ["character"],
          attributesNotAny: ["special"],
        },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "marker:attachedDon",
      "instruction:giveProtection",
      "protectionSource:cardFilterEffects",
      "filter:category:character",
      "filter:attribute",
      "filter:negated",
    ]),
  );
});
