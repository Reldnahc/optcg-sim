import type { ParsedMetadataLine, ParseInput } from "../types.js";

const designatedEventLeaderPattern =
  /^This Leader can only be used in designated events according to the rules\.?$/u;

const allLeaderIdentityPattern =
  /^This Leader is treated as a card with all card names, types, and attributes according to the rules\.?$/u;

export const parseSpecialRulesLine = (
  input: ParseInput,
): ParsedMetadataLine | undefined => {
  const text = input.text.trim();

  if (designatedEventLeaderPattern.test(text)) {
    return {
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
    };
  }

  if (allLeaderIdentityPattern.test(text)) {
    return {
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
    };
  }

  return undefined;
};
