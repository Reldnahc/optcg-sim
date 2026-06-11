import type { ReplacementInsteadParseResult } from "../shared.js";
import { parseDrawInstead } from "./draw.js";
import { parseMoveToOwnerDeckBottomInstead } from "./move-to-owner-deck-bottom.js";
import {
  parseKoSelfInstead,
  parseModifyPowerInstead,
  parseRestSelfInstead,
  parseTrashSelfInstead,
} from "./self.js";
import { parseRestCardsInstead } from "./rest-cards.js";
import { parseReturnDonInstead } from "./return-don.js";
import { parseTopLifeToHandInstead } from "./top-life-to-hand.js";
import { parseTrashFromHandInstead } from "./trash-from-hand.js";

export function parseInsteadEffect(
  text: string,
): ReplacementInsteadParseResult | undefined {
  return parseSequencedInsteadEffect(text) ?? parseAtomicInsteadEffect(text);
}

function parseAtomicInsteadEffect(
  text: string,
): ReplacementInsteadParseResult | undefined {
  return (
    parseTopLifeToHandInstead(text) ??
    parseReturnDonInstead(text) ??
    parseMoveToOwnerDeckBottomInstead(text) ??
    parseTrashFromHandInstead(text) ??
    parseDrawInstead(text) ??
    parseKoSelfInstead(text) ??
    parseTrashSelfInstead(text) ??
    parseModifyPowerInstead(text) ??
    parseRestSelfInstead(text) ??
    parseRestCardsInstead(text)
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
    .map((part) => parseAtomicInsteadEffect(`you may ${part} instead.`));
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
