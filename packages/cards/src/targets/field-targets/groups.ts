import type { Cardinality, Target } from "@optcg/types";

import type { ParseInput } from "../../types.js";
import {
  parseOpponentCharactersTarget,
  parseOpponentLeaderOrCharacterCardsTarget,
} from "./opponent.js";
import { parseThisCharacterTarget } from "../this-character.js";
import {
  parseCompoundYourCharactersTarget,
  parseYourCharactersTarget,
  parseYourLeaderOrCharacterCardsTarget,
  parseYourLeaderTarget,
  parseYourNamedCardsTarget,
} from "./self.js";
import type { FieldTargetParseResult } from "./types.js";

export type FieldTargetParser = (
  input: ParseInput,
) => FieldTargetParseResult | undefined;

export function parseTargetFromSet(
  input: ParseInput,
  parsers: readonly FieldTargetParser[],
): FieldTargetParseResult | undefined {
  for (const parser of parsers) {
    const parsed = parser(input);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

export const yourFieldEffectTargetParsers = (
  cardinality: Cardinality,
): readonly FieldTargetParser[] =>
  [
    (input) => parseCompoundYourCharactersTarget(input, cardinality),
    parseYourCharactersTarget,
    parseYourNamedCardsTarget,
  ] as const;

export const selectedPowerGainTargetParsers =
  (): readonly FieldTargetParser[] =>
    [
      parseYourLeaderOrCharacterCardsTarget,
      parseYourCharactersTarget,
      parseYourNamedCardsTarget,
      (input) => parseYourLeaderTarget({ text: stripLeadingOf(input.text) }),
    ] as const;

export const directPowerGainTargetParsers = (): readonly FieldTargetParser[] =>
  [
    parseYourLeaderTarget,
    parseThisLeaderTarget,
    (input) => parseThisCharacterTarget({ ...input, allowImplicit: false }),
  ] as const;

export const opponentNegativePowerTargetParsers =
  (): readonly FieldTargetParser[] =>
    [
      parseOpponentLeaderOrCharacterCardsTarget,
      parseOpponentCharactersPowerTarget,
    ] as const;

function parseOpponentCharactersPowerTarget(
  input: ParseInput,
): FieldTargetParseResult | undefined {
  const parsed = parseOpponentCharactersTarget(input);
  if (parsed === undefined) {
    return undefined;
  }

  return {
    target: {
      type: "choose",
      request: {
        timing: "onResolution",
        chooser: "self",
        player: "opponent",
        zone: "characterArea",
        min: 0,
        max: 1,
        allowFewerIfUnavailable: true,
        visibility: "public",
        filter: parsed.filter ?? { categories: ["character"] },
      },
    },
    rest: parsed.rest,
    evidence: parsed.evidence,
  };
}

function parseThisLeaderTarget(input: ParseInput):
  | {
      readonly target: Target;
      readonly rest: string;
      readonly evidence: readonly ["target:thisCard"];
    }
  | undefined {
  const rest = /^This Leader\s+(?<rest>.+)$/iu.exec(input.text)?.groups?.[
    "rest"
  ];
  if (rest === undefined) {
    return undefined;
  }
  return {
    target: { type: "self" },
    rest,
    evidence: ["target:thisCard"],
  };
}

function stripLeadingOf(text: string): string {
  return text.replace(/^of\s+/iu, "");
}
