import type { ExpressionParseResult, ParseInput } from "../types.js";
import {
  parseRevealUpToTypeCardToHand,
  parseRestToBottomAnyOrder,
  parseTopDeckLook,
} from "../search/index.js";

export function searchRevealExpressionParser(
  input: ParseInput,
): ExpressionParseResult | undefined {
  const look = parseTopDeckLook(input);
  if (look === undefined) {
    return undefined;
  }

  const reveal = parseRevealUpToTypeCardToHand({ text: look.rest });
  if (reveal === undefined) {
    return undefined;
  }

  const remaining = parseRestToBottomAnyOrder({ text: reveal.rest });
  if (remaining === undefined || remaining.rest.length > 0) {
    return undefined;
  }

  return {
    effect: {
      type: "search",
      request: {
        zone: "deck",
        player: "self",
        lookCount: look.count,
        filter: reveal.filter,
        min: reveal.min,
        max: reveal.max,
        destination: "hand",
        revealTo: "bothPlayers",
        remainingCards: {
          destination: "deck",
          position: "bottom",
          order: "ownerChoice",
        },
        shuffleAfter: false,
      },
    },
    evidence: [
      "instruction:search",
      ...look.evidence,
      ...reveal.evidence,
      ...remaining.evidence,
    ],
    rest: "",
  };
}
