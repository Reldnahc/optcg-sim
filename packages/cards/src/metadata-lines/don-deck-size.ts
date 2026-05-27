import type { ParsedMetadataLine, ParseInput } from "../types.js";

const pattern =
  /^Under the rules of this game, your DON!! deck consists of (?<count>\d+) cards\.$/u;

export const parseDonDeckSizeRuleLine = (
  input: ParseInput,
): ParsedMetadataLine | undefined => {
  const match = pattern.exec(input.text.trim());
  const countText = match?.groups?.["count"];
  if (countText === undefined) {
    return undefined;
  }
  const count = Number(countText);
  if (!Number.isSafeInteger(count) || count <= 0) {
    return undefined;
  }

  return {
    kind: "metadata",
    metadata: {
      type: "deckRestriction",
      restriction: {
        type: "donDeckSize",
        count,
      },
    },
    evidence: [
      "deckRestriction:ignored",
      "deckRestriction:donDeckSize",
      "filter:category:don",
      "zone:donDeck",
      "count:positiveInteger",
    ],
  };
};
