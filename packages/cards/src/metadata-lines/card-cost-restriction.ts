import type { ParsedMetadataLine, ParseInput } from "../types.js";

const pattern =
  /^Under the rules of this game, you cannot include cards with a cost of (?<cost>[1-9]\d*) or more in your deck\.$/u;

export const parseCardCostRestrictionRuleLine = (
  input: ParseInput,
): ParsedMetadataLine | undefined => {
  const match = pattern.exec(input.text.trim());
  const costText = match?.groups?.["cost"];
  if (costText === undefined) {
    return undefined;
  }
  const cost = Number(costText);
  if (!Number.isSafeInteger(cost) || cost <= 0) {
    return undefined;
  }

  return {
    kind: "metadata",
    metadata: {
      type: "deckRestriction",
      restriction: {
        type: "cardCostLessThan",
        cost,
      },
    },
    evidence: [
      "deckRestriction:ignored",
      "deckRestriction:cardCostLessThan",
      "filter:any",
      "filter:cost",
      "condition:comparator:gte",
      "condition:threshold:positiveInteger",
      "zone:deck",
    ],
  };
};
