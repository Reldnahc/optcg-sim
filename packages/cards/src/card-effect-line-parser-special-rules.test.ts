import { expect, it } from "vitest";

import { parseCardEffectLineDetailed } from "./card-effect-line-parser.js";

it("parses designated-event-only leader rules text as metadata", () => {
  const result = parseCardEffectLineDetailed(
    "This Leader can only be used in designated events according to the rules.",
  );

  expect(result).toEqual({
    ok: true,
    value: {
      kind: "metadata",
      metadata: {
        type: "ruleModifier",
        modifier: {
          type: "designatedEventOnly",
          cardCategory: "leader",
        },
      },
      evidence: [
        "ruleModifier:designatedEventOnly",
        "sourceCategory:leader",
        "deckRestriction:ignored",
      ],
    },
  });
});

it("parses all identity values rules text as metadata", () => {
  const result = parseCardEffectLineDetailed(
    "This Leader is treated as a card with all card names, types, and attributes according to the rules.",
  );

  expect(result).toEqual({
    ok: true,
    value: {
      kind: "metadata",
      metadata: {
        type: "identityTreatment",
        subject: {
          type: "thisCard",
          cardCategory: "leader",
        },
        includes: ["names", "types", "attributes"],
      },
      evidence: [
        "metadata:identityTreatment",
        "sourceCategory:leader",
        "filter:name",
        "filter:typeIncludes",
        "filter:attribute",
        "target:thisCard",
      ],
    },
  });
});
