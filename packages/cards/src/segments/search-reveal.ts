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
import { sourceSpan } from "../source-slices.js";
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
  const searchEvidence = [
    "instruction:search",
    ...look.evidence,
    ...reveal.evidence,
    ...remaining.evidence,
  ] as const;
  const presentationSpans =
    input.source === undefined
      ? []
      : [sourceSpan("span:body", "body", input.source, searchEvidence)];

  if (remaining.rest.length === 0) {
    return {
      effect: searchEffect,
      evidence: searchEvidence,
      rest: "",
      ...(presentationSpans.length === 0 ? {} : { presentationSpans }),
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
    evidence: ["expression:sequence", ...searchEvidence, ...trailing.evidence],
    rest: "",
    ...(presentationSpans.length === 0
      ? trailing.presentationSpans === undefined
        ? {}
        : { presentationSpans: trailing.presentationSpans }
      : {
          presentationSpans: [
            ...presentationSpans,
            ...(trailing.presentationSpans ?? []),
          ],
        }),
  };
}
