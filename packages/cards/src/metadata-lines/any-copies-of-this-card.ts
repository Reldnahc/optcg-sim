import type { ParsedMetadataLine, ParseInput } from "../types.js";

const pattern =
  /^Under the rules of this game, you may have any number of this card in your deck\.$/u;

export const parseAnyCopiesOfThisCardRuleLine = (
  input: ParseInput,
): ParsedMetadataLine | undefined => {
  if (!pattern.test(input.text.trim())) {
    return undefined;
  }

  return {
    kind: "metadata",
    metadata: {
      type: "deckRestriction",
      restriction: {
        type: "anyCopiesOfThisCard",
      },
    },
    evidence: [
      "deckRestriction:ignored",
      "deckRestriction:anyCopiesOfThisCard",
      "target:thisCard",
      "zone:deck",
    ],
  };
};
