import type { ReplacementInsteadParseResult } from "../shared.js";
import { parseDrawInstead } from "./draw.js";
import { parseLifeVisibilityInstead } from "./life-visibility.js";
import { parseMoveToOwnerDeckBottomInstead } from "./move-to-owner-deck-bottom.js";
import { parseReplacementTargetLifeInstead } from "./replacement-target-life.js";
import {
  parseKoSelfInstead,
  parseModifyPowerInstead,
  parseRestSelfInstead,
  parseReturnSelfToOwnerHandInstead,
  parseTrashSelfInstead,
} from "./self.js";
import { parseRestCardsInstead } from "./rest-cards.js";
import { parseReturnDonInstead } from "./return-don.js";
import { parseTopLifeToHandInstead } from "./top-life-to-hand.js";
import { parseTopLifeToTrashInstead } from "./top-life-to-trash.js";
import { parseTrashToDeckBottomInstead } from "./trash-to-deck-bottom.js";
import { parseTrashFromHandInstead } from "./trash-from-hand.js";

export type ReplacementInsteadParser = (
  text: string,
) => ReplacementInsteadParseResult | undefined;

export const replacementInsteadBodyParsers: readonly ReplacementInsteadParser[] =
  [
    parseTopLifeToHandInstead,
    parseTopLifeToTrashInstead,
    parseLifeVisibilityInstead,
    parseReplacementTargetLifeInstead,
    parseReturnDonInstead,
    parseMoveToOwnerDeckBottomInstead,
    parseTrashToDeckBottomInstead,
    parseTrashFromHandInstead,
    parseDrawInstead,
    parseKoSelfInstead,
    parseTrashSelfInstead,
    parseReturnSelfToOwnerHandInstead,
    parseModifyPowerInstead,
    parseRestSelfInstead,
    parseRestCardsInstead,
  ] as const;

export function parseReplacementInsteadFromSet(
  text: string,
  parsers: readonly ReplacementInsteadParser[],
): ReplacementInsteadParseResult | undefined {
  for (const parser of parsers) {
    const parsed = parser(text);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

export function parseInsteadEffect(
  text: string,
): ReplacementInsteadParseResult | undefined {
  return (
    parseSequencedInsteadEffect(text) ??
    parseReplacementInsteadFromSet(text, replacementInsteadBodyParsers)
  );
}

function parseSequencedInsteadEffect(
  text: string,
): ReplacementInsteadParseResult | undefined {
  const match = /^you may (?<body>.+) instead\.?$/iu.exec(text.trim());
  const bodyText = match?.groups?.["body"];
  if (bodyText === undefined || !/\s+and\s+/iu.test(bodyText)) {
    return undefined;
  }

  const parsed = bodyText
    .split(/\s+and\s+/iu)
    .map((part) =>
      parseReplacementInsteadFromSet(
        `you may ${part} instead.`,
        replacementInsteadBodyParsers,
      ),
    );
  if (parsed.length < 2 || parsed.some((part) => part === undefined)) {
    return undefined;
  }

  const parts = parsed.filter(
    (part): part is ReplacementInsteadParseResult => part !== undefined,
  );
  return {
    effect: {
      type: "sequence",
      effects: parts.map((part, index) => ({
        connector: index === 0 ? "always" : "then",
        effect: part.effect,
      })),
    },
    evidence: [
      "composition:sequence",
      ...parts.flatMap((part) => part.evidence),
    ],
  };
}
