import type { ExpressionParseResult, ParseInput } from "../types.js";
import {
  parseRestToTrash,
  parseRestToBottomAnyOrder,
  parseSearchSelectionToHand,
  parseTopDeckLook,
} from "../search/index.js";
import { parseExpression } from "../expression-parser.js";
import { parseThenConnector } from "../connectors/index.js";
import { parseTrashFromHandInstruction } from "../instructions/index.js";
import { syntheticInstructionSegmentParser } from "./synthetic.js";

export function searchRevealExpressionParser(
  input: ParseInput,
): ExpressionParseResult | undefined {
  const look = parseTopDeckLook(input);
  if (look === undefined) {
    return undefined;
  }

  const reveal = parseSearchSelectionToHand({ text: look.rest });
  if (reveal === undefined) {
    return undefined;
  }

  const remaining =
    parseRestToBottomAnyOrder({ text: reveal.rest }) ??
    parseRestToTrash({ text: reveal.rest });
  if (remaining === undefined) {
    return undefined;
  }

  const searchEffect = {
    type: "search" as const,
    request: {
      zone: "deck" as const,
      player: "self" as const,
      lookCount: look.count,
      filter: reveal.filter,
      min: reveal.min,
      max: reveal.max,
      destination: "hand" as const,
      revealTo: reveal.revealTo,
      remainingCards: remaining.remainingCards,
      shuffleAfter: false,
    },
  };

  if (remaining.rest.length === 0) {
    return {
      effect: searchEffect,
      evidence: [
        "instruction:search",
        ...look.evidence,
        ...reveal.evidence,
        ...remaining.evidence,
      ],
      rest: "",
    };
  }

  const trailing = parseExpression(remaining.rest, {
    connectors: [parseThenConnector],
    segments: [
      syntheticInstructionSegmentParser([parseTrashFromHandInstruction]),
    ],
  });
  if (trailing === undefined || trailing.rest.length > 0) {
    return undefined;
  }

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          connector: "always",
          effect: searchEffect,
        },
        {
          connector: "then",
          effect: trailing.effect,
        },
      ],
    },
    evidence: [
      "expression:sequence",
      "instruction:search",
      ...look.evidence,
      ...reveal.evidence,
      ...remaining.evidence,
      ...trailing.evidence,
    ],
    rest: "",
  };
}
