import type { ParsedMetadataLine, ParseInput } from "../types.js";

const pattern =
  /^Under the rules of this game, you do not lose when your deck has 0 cards\. You lose at the end of the turn in which your deck becomes 0 cards\.$/u;

export const parseDeckOutLossTimingRuleLine = (
  input: ParseInput,
): ParsedMetadataLine | undefined => {
  if (!pattern.test(input.text.trim())) {
    return undefined;
  }

  return {
    kind: "metadata",
    metadata: {
      type: "ruleModifier",
      modifier: {
        type: "deckOutLossTiming",
        timing: "endOfTurn",
      },
    },
    evidence: [
      "ruleModifier:deckOutLossTiming",
      "zone:deck",
      "condition:threshold:nonNegativeInteger",
      "duration:endOfTurn",
    ],
  };
};
